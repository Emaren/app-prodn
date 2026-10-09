// Read-only Steam rating coverage census streamed through the protected truth observer.
// This script is NOT a rating source and never writes player/replay/settlement data.
import { getPrisma } from "@/lib/prisma";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { latestHistoricalSteamLaneRating } from "@/lib/leaderboardRating";
import { isLeaderboardExcludedSystemUid } from "@/lib/internalSystemAccounts";

const prisma = getPrisma();
const valid = (value) =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const emptyRaw = Object.freeze({
  rawRm: false, rawDm: false,
  watcherRm: false, watcherDm: false,
  otherRm: false, otherDm: false,
});

function reason(verified, raw, watcherRaw, otherRaw, hasExactSteamId) {
  if (verified) return "qualifying_steam_evidence";
  if (!hasExactSteamId) return "no_exact_steam_identity";
  if (watcherRaw) return "watcher_numeric_present_but_not_qualified";
  if (otherRaw) return "non_watcher_numeric_present_not_rating_authority";
  if (raw) return "raw_numeric_present_not_qualified";
  return "no_numeric_rating_observed_in_stored_replays";
}

try {
  // The protected observer also sets the read-only Prisma/PG connection options.
  const mode = await prisma.$queryRawUnsafe(
    "SELECT current_setting('transaction_read_only') AS transaction_mode, " +
    "current_setting('default_transaction_read_only') AS default_mode",
  );
  if (mode[0]?.transaction_mode !== "on" || mode[0]?.default_mode !== "on") {
    throw Error("STOP: production database must be read-only");
  }

  // Raw presence is DIAGNOSTIC ONLY. These fields can come from historical
  // manual/batch uploads, unqualified snapshots, or an incorrect parser era.
  // Finding them NEVER authorizes displaying a rating or replacing Watcher.
  const raw = await prisma.$queryRawUnsafe(String.raw`
    WITH participants AS (
      SELECT
        g.parse_source, g.parse_reason,
        participant.value AS player
      FROM game_stats g
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(g.players::jsonb) = 'array'
          THEN g.players::jsonb ELSE '[]'::jsonb END
      ) AS participant(value)
      WHERE participant.value->>'steam_id' ~ '^[0-9]{17}$'
    ), observed AS (
      SELECT player->>'steam_id' AS steam_id,
        parse_source, parse_reason,
        CASE
          WHEN jsonb_typeof(player->'steam_rm_rating') = 'number'
            AND player->>'steam_rm_rating' ~ '^[0-9]{1,5}$'
          THEN (player->>'steam_rm_rating')::integer BETWEEN 1 AND 5000
          ELSE false END AS rm,
        CASE
          WHEN jsonb_typeof(player->'steam_dm_rating') = 'number'
            AND player->>'steam_dm_rating' ~ '^[0-9]{1,5}$'
          THEN (player->>'steam_dm_rating')::integer BETWEEN 1 AND 5000
          ELSE false END AS dm
      FROM participants
    )
    SELECT steam_id AS "steamId",
      bool_or(rm) AS "rawRm",
      bool_or(dm) AS "rawDm",
      bool_or(rm AND parse_source IN ('watcher_live', 'watcher_final')
        AND COALESCE(parse_reason, '') NOT IN (
          'manual_backfill', 'manual_override', 'engine_room_structural_projection'
        )) AS "watcherRm",
      bool_or(dm AND parse_source IN ('watcher_live', 'watcher_final')
        AND COALESCE(parse_reason, '') NOT IN (
          'manual_backfill', 'manual_override', 'engine_room_structural_projection'
        )) AS "watcherDm",
      bool_or(rm AND (
        parse_source IS NULL OR parse_source NOT IN ('watcher_live','watcher_final')
        OR COALESCE(parse_reason, '') IN (
          'manual_backfill', 'manual_override', 'engine_room_structural_projection'
        )
      )) AS "otherRm",
      bool_or(dm AND (
        parse_source IS NULL OR parse_source NOT IN ('watcher_live','watcher_final')
        OR COALESCE(parse_reason, '') IN (
          'manual_backfill', 'manual_override', 'engine_room_structural_projection'
        )
      )) AS "otherDm"
    FROM observed GROUP BY steam_id
  `);

  const rawById = new Map(raw.map((r) => [r.steamId, r]));
  const directory = await loadPublicPlayerDirectory(
    prisma, null,
    { includePresence: false, includeCurrentWatcherState: true },
  );
  const eligible = directory.allEntries.filter((entry) =>
    !isLeaderboardExcludedSystemUid(entry.uid) &&
    (entry.totalMatches > 0 || entry.claimed),
  );
  const counts = {
    directoryRows: directory.allEntries.length,
    publicIdentityRows: eligible.length,
    exactSteamIdentityRows: 0,
    provisionalNameOrSiteRows: 0,
    bothRated: 0, rmOnly: 0, dmOnly: 0, neitherRated: 0,
    rmEligible: 0, dmEligible: 0,
    claimedUnratedRows: 0,
    missingRmWithWatcherNumeric: 0,
    missingDmWithWatcherNumeric: 0,
    missingRmWithOtherNumeric: 0,
    missingDmWithOtherNumeric: 0,
    missingRmWithoutStoredNumeric: 0,
    missingDmWithoutStoredNumeric: 0,
  };
  const missingCases = [];
  for (const entry of eligible) {
    const steamId = /^\d{17}$/.test(entry.steamId ?? "") ? entry.steamId : null;
    const evidenceRm = latestHistoricalSteamLaneRating(entry.replayEvidence, "rm");
    const evidenceDm = latestHistoricalSteamLaneRating(entry.replayEvidence, "dm");
    const observedRm = valid(entry.steamRmRating) ? entry.steamRmRating : null;
    const observedDm = valid(entry.steamDmRating) ? entry.steamDmRating : null;
    const qualifiedRm = observedRm !== null || valid(evidenceRm);
    const qualifiedDm = observedDm !== null || valid(evidenceDm);
    const sourceRm = observedRm !== null ? "watcher_observation" :
      valid(evidenceRm) ? "accepted_hd_header" : "missing";
    const sourceDm = observedDm !== null ? "watcher_observation" :
      valid(evidenceDm) ? "accepted_hd_header" : "missing";
    const rawSignal = steamId ? rawById.get(steamId) ?? emptyRaw : emptyRaw;
    if (steamId) counts.exactSteamIdentityRows++;
    else counts.provisionalNameOrSiteRows++;
    if (qualifiedRm) counts.rmEligible++;
    if (qualifiedDm) counts.dmEligible++;
    if (qualifiedRm && qualifiedDm) counts.bothRated++;
    else if (qualifiedRm) counts.rmOnly++;
    else if (qualifiedDm) counts.dmOnly++;
    else counts.neitherRated++;
    if (!qualifiedRm && !qualifiedDm && entry.claimed) counts.claimedUnratedRows++;
    if (!qualifiedRm) {
      if (rawSignal.watcherRm) counts.missingRmWithWatcherNumeric++;
      if (rawSignal.otherRm) counts.missingRmWithOtherNumeric++;
      if (!rawSignal.rawRm) counts.missingRmWithoutStoredNumeric++;
    }
    if (!qualifiedDm) {
      if (rawSignal.watcherDm) counts.missingDmWithWatcherNumeric++;
      if (rawSignal.otherDm) counts.missingDmWithOtherNumeric++;
      if (!rawSignal.rawDm) counts.missingDmWithoutStoredNumeric++;
    }
    if (!qualifiedRm || !qualifiedDm) {
      missingCases.push({
        identityKey: entry.key,
        steamId, name: entry.name,
        claimed: entry.claimed,
        replayMatches: entry.totalMatches,
        rm: {
          qualified: qualifiedRm, source: sourceRm,
          reason: reason(qualifiedRm, rawSignal.rawRm,
            rawSignal.watcherRm, rawSignal.otherRm, Boolean(steamId)),
        },
        dm: {
          qualified: qualifiedDm, source: sourceDm,
          reason: reason(qualifiedDm, rawSignal.rawDm,
            rawSignal.watcherDm, rawSignal.otherDm, Boolean(steamId)),
        },
      });
    }
  }
  if (counts.bothRated + counts.rmOnly + counts.dmOnly + counts.neitherRated
      !== counts.publicIdentityRows) {
    throw Error("Census conservation invariant failed");
  }
  if (counts.rmEligible !== counts.bothRated + counts.rmOnly ||
      counts.dmEligible !== counts.bothRated + counts.dmOnly) {
    throw Error("Rating-lane count invariant failed");
  }
  process.stdout.write(JSON.stringify({
    kind: "aoe2war-steam-rating-coverage-census",
    schemaVersion: 1,
    observedAt: new Date().toISOString(),
    productionSource: process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE ?? null,
    databaseReadOnly: mode,
    sourceGrain: "accepted public player directory identities",
    eligibilityPolicy: "independent qualifying Steam RM/DM, no Site Elo",
    warning: "Missing observed rating does NOT establish the player is unrated on Steam. Raw numeric fields are diagnostic, never ranking authority. Counts are a read-only point-in-time observation.",
    mutations: { production: 0, parserRows: 0, identityRows: 0, currentRatingRows: 0, wolo: 0 },
    counts,
    rawSteamIdsObserved: raw.length,
    missingCases,
  }));
} finally {
  await prisma.$disconnect();
}
