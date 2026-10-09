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
let cache: { until: number; value: VerifiedWatcherSteamRating[] } | null = null;
let active: Promise<VerifiedWatcherSteamRating[]> | null = null;
const rating = (x: unknown): number | null =>
  typeof x === "number" && Number.isInteger(x) && x > 0 && x <= 5000 ? x : null;
const iso = (x: Date | null) =>
  x instanceof Date && Number.isFinite(x.getTime()) ? x.toISOString() : null;

async function readFresh(prisma: PrismaClient): Promise<VerifiedWatcherSteamRating[]> {
  const rows = await prisma.$queryRaw<DbRow[]>(Prisma.sql`
    WITH verified_games AS MATERIALIZED (
      SELECT g.id, g.played_on, g.timestamp, g.players::jsonb AS players
      FROM game_stats g
      WHERE g.parse_source IN ('watcher_live','watcher_final')
        AND g.played_on IS NOT NULL
        AND g.played_on <= NOW() + INTERVAL '5 minutes'
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
    observations AS (
      SELECT game.id, game.played_on, game.timestamp, p->>'steam_id' AS steam_id,
        COUNT(*) OVER (PARTITION BY game.id, p->>'steam_id') AS identity_count,
        CASE WHEN jsonb_typeof(p->'steam_rm_rating') = 'number'
            AND p->>'steam_rm_rating' ~ '^[0-9]{1,5}$'
            AND (p->>'steam_rm_rating')::integer BETWEEN 1 AND 5000
            AND COALESCE(p #>> '{steam_rating_sources,steam_rm_rating}', 'unmarked')
              IN ('hd_header','unmarked')
          THEN (p->>'steam_rm_rating')::integer END AS rm,
        CASE WHEN jsonb_typeof(p->'steam_dm_rating') = 'number'
            AND p->>'steam_dm_rating' ~ '^[0-9]{1,5}$'
            AND (p->>'steam_dm_rating')::integer BETWEEN 1 AND 5000
            AND COALESCE(p #>> '{steam_rating_sources,steam_dm_rating}', 'unmarked')
              IN ('hd_header','unmarked','summary_rate_snapshot')
          THEN (p->>'steam_dm_rating')::integer END AS dm
      FROM verified_games game
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(game.players) = 'array'
          THEN game.players ELSE '[]'::jsonb END
      ) participant(p)
      WHERE jsonb_typeof(p) = 'object' AND p->>'steam_id' ~ '^[0-9]{17}$'
    ),
    rm AS (
      SELECT DISTINCT ON (steam_id) steam_id, rm AS value, played_on
      FROM observations WHERE rm IS NOT NULL AND identity_count = 1
      ORDER BY steam_id, played_on DESC, timestamp DESC NULLS LAST, id DESC
    ),
    dm AS (
      SELECT DISTINCT ON (steam_id) steam_id, dm AS value, played_on
      FROM observations WHERE dm IS NOT NULL AND identity_count = 1
      ORDER BY steam_id, played_on DESC, timestamp DESC NULLS LAST, id DESC
    ),
    ids AS (SELECT steam_id FROM rm UNION SELECT steam_id FROM dm)
    SELECT ids.steam_id AS "steamId",
      rm.value AS "steamRmRating",
      rm.played_on AT TIME ZONE 'UTC' AS "steamRmObservedAt",
      dm.value AS "steamDmRating",
      dm.played_on AT TIME ZONE 'UTC' AS "steamDmObservedAt"
    FROM ids
    LEFT JOIN rm USING (steam_id)
    LEFT JOIN dm USING (steam_id)
    ORDER BY ids.steam_id
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

function refresh(prisma: PrismaClient) {
  if (active) return active;
  const run = readFresh(prisma)
    .then((value) => {
      cache = { until: Date.now() + TTL_MS, value };
      return value;
    })
    .finally(() => { if (active === run) active = null; });
  active = run;
  return run;
}

export async function loadVerifiedWatcherSteamRatings(prisma: PrismaClient) {
  if (cache) {
    if (cache.until <= Date.now() && !active) {
      void refresh(prisma).catch((err) =>
        console.warn("Watcher Steam rating refresh failed:", err));
    }
    return cache.value;
  }
  return refresh(prisma).catch((error) => {
    // An unavailable optional rating rail must never break the whole
    // public leaderboard; the immutable receipt and replay history remain.
    console.warn("Verified Watcher Steam rating cold load failed:", error);
    return [];
  });
}

export function invalidateVerifiedWatcherSteamRatingsCache() {
  cache = null;
  active = null;
}
