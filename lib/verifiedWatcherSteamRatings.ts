import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { normalizeLeaderboardSteamId } from "@/lib/leaderboardIdentity";

/** Steam RM/DM display-only observations for exact Steam IDs.
 * Fully verified signed Watcher rows qualify. An immutable pre-fix cohort
 * (ingested AND played before 2026-10-09 UTC) also qualifies from the normal
 * authenticated Watcher upload route, with exact client/server replay hashes
 * and live-monitor/role checks. HMAC for that older cohort cannot be recovered
 * retroactively: those observations MUST NOT be labeled signed or treated as
 * receipt, identity, result, betting, or financial authority.
 * New uploads with supplied-invalid signatures NEVER qualify. File/manual
 * and batch-upload sources NEVER qualify regardless of game clock.
 */
export type VerifiedWatcherSteamRating = {
  steamId: string;
  steamRmRating: number | null;
  steamRmObservedAt: string | null;
  steamDmRating: number | null;
  steamDmObservedAt: string | null;
};
type DbRow = {
  steamId: string;
  steamRmRating: number | null;
  steamRmObservedAt: Date | null;
  steamDmRating: number | null;
  steamDmObservedAt: Date | null;
};
/**
 * Both source families are Watcher-qualified before reaching this resolver.
 * Use game-observation time (never manual upload time), separately per lane.
 * An invalid/missing timestamp never displaces a dated observation.
 */
export function selectLatestSteamObservation(
  receiptRating: number | null,
  receiptObservedAt: string | null,
  signedRating: number | null,
  signedObservedAt: string | null,
): { rating: number | null; observedAt: string | null } {
  const candidates = [
    { rating: receiptRating, observedAt: receiptObservedAt, rank: 1 },
    { rating: signedRating, observedAt: signedObservedAt, rank: 0 },
  ].filter((item) => rating(item.rating) !== null &&
    item.observedAt !== null &&
    Number.isFinite(new Date(item.observedAt).getTime()));
  candidates.sort((a,b) =>
    new Date(b.observedAt!).getTime() -
    new Date(a.observedAt!).getTime() || b.rank - a.rank);
  const result = candidates[0];
  return result ? { rating: result.rating, observedAt: result.observedAt } :
    { rating: null, observedAt: null };
}

const TTL_MS = 120_000;
const FAILURE_RETRY_MS = 30_000;
let cache: { until: number; value: VerifiedWatcherSteamRating[] } | null = null;
let active: Promise<VerifiedWatcherSteamRating[]> | null = null;
let retryNotBefore = 0;
let cacheGeneration = 0;
const rating = (x: unknown): number | null =>
  typeof x === "number" && Number.isInteger(x) && x > 0 && x <= 5000 ? x : null;
const iso = (x: Date | null) =>
  x instanceof Date && Number.isFinite(x.getTime()) ? x.toISOString() : null;

async function readFresh(prisma: PrismaClient): Promise<VerifiedWatcherSteamRating[]> {
  const rows = await prisma.$queryRaw<DbRow[]>(Prisma.sql`
    WITH verified_games AS (
      SELECT g.id, g.played_on, g.timestamp, g.players::jsonb AS players
      FROM game_stats g
      WHERE g.parse_source IN ('watcher_live','watcher_final')
        -- Historical backfills can retain a watcher_final parse_source;
        -- their manual result/metadata repair is never rating authority.
        AND COALESCE(g.parse_reason, '') NOT IN (
          'manual_backfill', 'manual_override',
          'engine_room_structural_projection'
        )
        AND g.played_on IS NOT NULL
        AND g.played_on <= NOW() + INTERVAL '5 minutes'
        -- An authentic archived game date is not a current rating.
        AND g.played_on >= g.created_at - INTERVAL '48 hours'
        -- Original client replay source must agree with alleged game clock.
        -- Filename is source-local; 48h accounts for timezone ambiguity.
        AND (
          SUBSTRING(g.original_filename FROM
            '@([0-9]{4}[.][0-9]{2}[.][0-9]{2})') IS NULL
          OR SUBSTRING(g.original_filename FROM
            '@([0-9]{4}[.][0-9]{2}[.][0-9]{2})') IN (
            TO_CHAR(g.played_on - INTERVAL '2 days', 'YYYY.MM.DD'),
            TO_CHAR(g.played_on - INTERVAL '1 day', 'YYYY.MM.DD'),
            TO_CHAR(g.played_on, 'YYYY.MM.DD'),
            TO_CHAR(g.played_on + INTERVAL '1 day', 'YYYY.MM.DD'),
            TO_CHAR(g.played_on + INTERVAL '2 days', 'YYYY.MM.DD')
          )
        )
        AND CASE WHEN
          (g.key_events::jsonb #>> '{watcher_upload,file_mtime_ms}') ~ '^[0-9]{13}$'
          THEN g.played_on <= (
            TO_TIMESTAMP((
              g.key_events::jsonb #>> '{watcher_upload,file_mtime_ms}'
            )::numeric / 1000) AT TIME ZONE 'UTC'
          ) + INTERVAL '48 hours'
          ELSE true
        END
        AND g.user_uid IS NOT NULL AND BTRIM(g.user_uid) <> ''
        AND g.user_uid <> 'system'
        AND LOWER(g.replay_hash) ~ '^[a-f0-9]{64}$'
        AND g.key_events::jsonb #>> '{watcher_upload,ingestion_provenance}' = 'live_monitor'
        AND (
          g.key_events::jsonb #>
            '{watcher_upload,provenance_signature_verified}' = 'true'::jsonb
          OR (
            -- Frozen, display-only compatibility window for Watcher rows
            -- ingested before the corrected signed-UID API/proxy contract.
            -- The old verifier rejected all known live-monitor signatures
            -- because it used the account UID, not the Watcher's signed UID.
            -- No future reupload can enter this window by backdating replay.
            g.created_at < TIMESTAMP '2026-10-09 00:00:00'
            AND g.played_on < TIMESTAMP '2026-10-09 00:00:00'
            AND g.key_events::jsonb #>
              '{watcher_upload,provenance_signature_verified}' = 'false'::jsonb
          )
        )
        AND g.key_events::jsonb #> '{watcher_upload,client_sha256_verified}' = 'true'::jsonb
        AND LOWER(g.key_events::jsonb #>> '{watcher_upload,server_sha256}') = LOWER(g.replay_hash)
        AND LOWER(g.key_events::jsonb #>> '{watcher_upload,client_sha256}') = LOWER(g.replay_hash)
        AND g.key_events::jsonb #> '{watcher_upload,checkpoint_final_rejected}' = 'false'::jsonb
        AND (
          (g.parse_source = 'watcher_live' AND NOT g.is_final
           AND g.key_events::jsonb #>> '{watcher_upload,file_role}' = 'live_checkpoint')
          OR
          (g.parse_source = 'watcher_final' AND g.is_final
           AND g.key_events::jsonb #>> '{watcher_upload,file_role}'
             IN ('final_recording','legacy_recording'))
        )
    ),
    -- The original global identity_count window sorted *all* expanded
    -- historical participants. Prove uniqueness inside each one-game JSON
    -- array instead; no historical replay, player, or provenance is dropped.
    observations AS (
      SELECT game.id, game.played_on, game.timestamp,
        unique_player.steam_id,
        CASE WHEN jsonb_typeof(unique_player.p->'steam_rm_rating') = 'number'
            AND unique_player.p->>'steam_rm_rating' ~ '^[0-9]{1,5}$'
            AND (unique_player.p->>'steam_rm_rating')::integer BETWEEN 1 AND 5000
            AND COALESCE(unique_player.p #>>
              '{steam_rating_sources,steam_rm_rating}', 'unmarked')
              IN ('hd_header','unmarked')
          THEN (unique_player.p->>'steam_rm_rating')::integer END AS rm,
        CASE WHEN jsonb_typeof(unique_player.p->'steam_dm_rating') = 'number'
            AND unique_player.p->>'steam_dm_rating' ~ '^[0-9]{1,5}$'
            AND (unique_player.p->>'steam_dm_rating')::integer BETWEEN 1 AND 5000
            AND COALESCE(unique_player.p #>>
              '{steam_rating_sources,steam_dm_rating}', 'unmarked')
              IN ('hd_header','unmarked','summary_rate_snapshot')
          THEN (unique_player.p->>'steam_dm_rating')::integer END AS dm
      FROM verified_games game
      CROSS JOIN LATERAL (
        SELECT participant.p->>'steam_id' AS steam_id,
          jsonb_agg(participant.p)->0 AS p
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(game.players) = 'array'
            THEN game.players ELSE '[]'::jsonb END
        ) AS participant(p)
        WHERE jsonb_typeof(participant.p) = 'object'
          AND participant.p->>'steam_id' ~ '^[0-9]{17}$'
        GROUP BY participant.p->>'steam_id'
        HAVING COUNT(*) = 1
      ) unique_player
    ),
    -- A single rating-lane ordering replaces two global DISTINCT ON sorts.
    -- Existing per-lane played_on/timestamp/id tie authority is unchanged.
    lane_observations AS (
      SELECT o.id, o.played_on, o.timestamp, o.steam_id,
        lane.kind, lane.value
      FROM observations o
      CROSS JOIN LATERAL (VALUES ('rm',o.rm),('dm',o.dm))
        AS lane(kind,value)
      WHERE lane.value IS NOT NULL
    ),
    latest_per_lane AS (
      SELECT DISTINCT ON (steam_id,kind)
        steam_id, kind, value, played_on
      FROM lane_observations
      ORDER BY steam_id, kind, played_on DESC, timestamp DESC NULLS LAST, id DESC
    )
    SELECT latest.steam_id AS "steamId",
      MAX(latest.value) FILTER (WHERE latest.kind = 'rm') AS "steamRmRating",
      (MAX(latest.played_on) FILTER (WHERE latest.kind = 'rm'))
        AT TIME ZONE 'UTC' AS "steamRmObservedAt",
      MAX(latest.value) FILTER (WHERE latest.kind = 'dm') AS "steamDmRating",
      (MAX(latest.played_on) FILTER (WHERE latest.kind = 'dm'))
        AT TIME ZONE 'UTC' AS "steamDmObservedAt"
    FROM latest_per_lane latest
    GROUP BY latest.steam_id
    ORDER BY latest.steam_id
  `);
  return rows.flatMap((row) => {
    const steamId = normalizeLeaderboardSteamId(row.steamId);
    const steamRmRating = rating(row.steamRmRating);
    const steamDmRating = rating(row.steamDmRating);
    return steamId && (steamRmRating !== null || steamDmRating !== null)
      ? [{
          steamId, steamRmRating, steamDmRating,
          steamRmObservedAt: steamRmRating === null ? null : iso(row.steamRmObservedAt),
          steamDmObservedAt: steamDmRating === null ? null : iso(row.steamDmObservedAt),
        }]
      : [];
  });
}

function refresh(prisma: PrismaClient): Promise<VerifiedWatcherSteamRating[]> {
  if (active) return active;
  const generation = cacheGeneration;
  const run = readFresh(prisma)
    .then((value) => {
      if (generation === cacheGeneration) {
        cache = { until: Date.now() + TTL_MS, value };
        retryNotBefore = 0;
      }
      return value;
    }, (error: unknown) => {
      if (generation === cacheGeneration) {
        retryNotBefore = Date.now() + FAILURE_RETRY_MS;
        // Log once per failed SQL attempt, never once per waiting request.
        console.warn("Verified Watcher Steam rating query unavailable:", error);
      }
      throw error;
    })
    .finally(() => { if (active === run) active = null; });
  active = run;
  return run;
}

/** null means unavailable; [] means a successful, genuinely empty SQL result.
 * A last-known-good response is never replaced with an invented fresh empty.
 * The optional public leaderboard continues without failing its other rails.
 */
export async function loadVerifiedWatcherSteamRatings(
  prisma: PrismaClient,
): Promise<VerifiedWatcherSteamRating[] | null> {
  if (cache) {
    if (cache.until <= Date.now() && !active && Date.now() >= retryNotBefore) {
      void refresh(prisma).catch(() => undefined);
    }
    return cache.value;
  }
  // Avoid retry storms after a failed cold read. Do not pretend an SQL error
  // was a zero-row observation or submit a second historical query.
  if (!active && Date.now() < retryNotBefore) return null;
  try {
    return await refresh(prisma);
  } catch {
    return null;
  }
}

export function invalidateVerifiedWatcherSteamRatingsCache() {
  cacheGeneration++;
  cache = null;
  active = null;
  retryNotBefore = 0;
}
