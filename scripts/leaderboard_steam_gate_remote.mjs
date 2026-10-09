// Protected read-only bounded scan of Steam RM/DM rating-provenance gates.
// This is DIAGNOSTIC ONLY: no raw rating may be promoted into current authority.
// Use indexed game_stats.id pagination to respect production 20-second SQL limits.
import { getPrisma } from "@/lib/prisma";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { latestHistoricalSteamLaneRating } from "@/lib/leaderboardRating";
import { isLeaderboardExcludedSystemUid } from "@/lib/internalSystemAccounts";

const prisma = getPrisma();
const stages = [
  "no_numeric_rating_in_stored_game_stats",
  "nonqualifying_parse_source_only",
  "invalid_clock_uploader_or_hash",
  "missing_live_monitor_provenance",
  "signature_or_legacy_cohort_unqualified",
  "client_server_hash_proof_unqualified",
  "checkpoint_role_or_finality_unqualified",
  "rating_field_source_or_duplicate_identity",
  "passes_all_watcher_game_stats_gates",
];
const BATCH_LIMIT = 512;
const MAX_BATCHES = 1000;
const FROZEN_CUTOFF_MS = Date.parse("2026-10-09T00:00:00.000Z");
const POSITIVE_MAX = 5000;
const positive = (x) =>
  typeof x === "number" && Number.isFinite(x) && x > 0;
const numeric = (x) =>
  typeof x === "number" && Number.isInteger(x) && x > 0 && x <= POSITIVE_MAX;
const stamp = (x) => {
  const ms = x instanceof Date ? x.getTime() :
    typeof x === "string" ? Date.parse(x) : NaN;
  return Number.isFinite(ms) ? ms : null;
};
const total = (values) =>
  Object.values(values).reduce((sum, value) => sum + value, 0);
const validSteam = (s) => typeof s === "string" && /^\d{17}$/.test(s);

function evidenceStage(game, p, lane, occurrences, nowMs) {
  const value = p?.[lane === "rm" ? "steam_rm_rating" : "steam_dm_rating"];
  if (!numeric(value)) return null;
  if (
    !["watcher_live", "watcher_final"].includes(game.parseSource) ||
    ["manual_backfill", "manual_override", "engine_room_structural_projection"]
      .includes(game.parseReason ?? "")
  ) return 1;
  const playedAt = stamp(game.playedOn);
  const ingestedAt = stamp(game.createdAt);
  const replayHash = typeof game.replayHash === "string" ?
    game.replayHash.toLowerCase() : "";
  if (
    playedAt === null || playedAt > nowMs + 5 * 60_000 ||
    !game.userUid?.trim() || game.userUid === "system" ||
    !/^[a-f0-9]{64}$/.test(replayHash)
  ) return 2;
  const upload = game.events?.watcher_upload;
  if (upload?.ingestion_provenance !== "live_monitor") return 3;
  if (
    upload.provenance_signature_verified !== true &&
    !(ingestedAt !== null && ingestedAt < FROZEN_CUTOFF_MS &&
      playedAt < FROZEN_CUTOFF_MS &&
      upload.provenance_signature_verified === false)
  ) return 4;
  if (
    upload.client_sha256_verified !== true ||
    typeof upload.server_sha256 !== "string" ||
    typeof upload.client_sha256 !== "string" ||
    upload.server_sha256.toLowerCase() !== replayHash ||
    upload.client_sha256.toLowerCase() !== replayHash
  ) return 5;
  const roleOk =
    upload.checkpoint_final_rejected === false &&
    (
      (game.parseSource === "watcher_live" &&
        game.isFinal === false && upload.file_role === "live_checkpoint") ||
      (game.parseSource === "watcher_final" &&
        game.isFinal === true &&
        ["final_recording", "legacy_recording"].includes(upload.file_role))
    );
  if (!roleOk) return 6;
  const source = p.steam_rating_sources?.[lane === "rm" ?
    "steam_rm_rating" : "steam_dm_rating"];
  if (
    occurrences !== 1 ||
    !(source === null || source === undefined ||
      (lane === "rm" ? ["hd_header", "unmarked"] :
        ["hd_header", "unmarked", "summary_rate_snapshot"]).includes(source))
  ) return 7;
  return 8;
}

try {
  const proof = await prisma.$queryRawUnsafe(
    "SELECT current_setting('transaction_read_only') AS transaction_mode, " +
    "current_setting('default_transaction_read_only') AS default_mode",
  );
  if (
    !Array.isArray(proof) || proof.length !== 1 ||
    proof[0].transaction_mode !== "on" || proof[0].default_mode !== "on"
  ) throw Error("STOP: read-only evidence absent");

  // One index-ordered chunk at a time; never a corpus-wide JSON window,
  // sort, or unbounded materialized CTE. This avoids the previous 57014 timeout.
  const selectChunk =
    'SELECT id, parse_source AS "parseSource", ' +
    'parse_reason AS "parseReason", is_final AS "isFinal", ' +
    'played_on AS "playedOn", created_at AS "createdAt", ' +
    'user_uid AS "userUid", replay_hash AS "replayHash", ' +
    'key_events::jsonb AS "events", players::jsonb AS players ' +
    'FROM game_stats WHERE id > $1 ORDER BY id ASC LIMIT $2';
  const observations = new Map();
  let cursor = 0;
  let batches = 0;
  let scannedRows = 0;
  const nowMs = Date.now();

  while (batches < MAX_BATCHES) {
    const games = await prisma.$queryRawUnsafe(
      selectChunk, cursor, BATCH_LIMIT,
    );
    if (!Array.isArray(games)) throw Error("invalid database batch result");
    if (games.length === 0) break;
    batches++;
    scannedRows += games.length;
    for (const game of games) {
      if (!Number.isSafeInteger(game.id) || game.id <= cursor)
        throw Error("non-monotonic game_stats.id cursor");
      const players = Array.isArray(game.players) ? game.players : [];
      const occurrences = new Map();
      for (const p of players) {
        if (p && typeof p === "object" && validSteam(p.steam_id))
          occurrences.set(p.steam_id, (occurrences.get(p.steam_id) ?? 0) + 1);
      }
      for (const p of players) {
        if (!p || typeof p !== "object" || !validSteam(p.steam_id))
          continue;
        const state = observations.get(p.steam_id) ?? { rmStage: 0, dmStage: 0 };
        const rmStage = evidenceStage(
          game, p, "rm", occurrences.get(p.steam_id), nowMs,
        );
        const dmStage = evidenceStage(
          game, p, "dm", occurrences.get(p.steam_id), nowMs,
        );
        if (rmStage !== null) state.rmStage = Math.max(state.rmStage, rmStage);
        if (dmStage !== null) state.dmStage = Math.max(state.dmStage, dmStage);
        observations.set(p.steam_id, state);
      }
      cursor = game.id;
    }
    if (games.length < BATCH_LIMIT) break;
  }
  if (batches >= MAX_BATCHES)
    throw Error("safety limit: scanned too many game_stats chunks");

  const directory = await loadPublicPlayerDirectory(
    prisma, null, { includePresence: false, includeCurrentWatcherState: true },
  );
  const eligible = directory.allEntries.filter(
    (e) => !isLeaderboardExcludedSystemUid(e.uid) &&
      (e.totalMatches > 0 || e.claimed),
  );
  const histogram = {
    rm: Object.fromEntries(stages.map((key) => [key, 0])),
    dm: Object.fromEntries(stages.map((key) => [key, 0])),
  };
  const counts = {
    publicIdentityRows: eligible.length,
    rmRated: 0, dmRated: 0, rmMissing: 0, dmMissing: 0,
    neitherRated: 0, noExactSteamIdentity: 0,
    exactSteamIdsInMissingSet: 0,
    scanBatches: batches, scannedGameRows: scannedRows,
  };
  for (const e of eligible) {
    const rm = positive(e.steamRmRating) ||
      positive(latestHistoricalSteamLaneRating(e.replayEvidence, "rm"));
    const dm = positive(e.steamDmRating) ||
      positive(latestHistoricalSteamLaneRating(e.replayEvidence, "dm"));
    if (rm) counts.rmRated++; else counts.rmMissing++;
    if (dm) counts.dmRated++; else counts.dmMissing++;
    if (!rm && !dm) counts.neitherRated++;
    if (!validSteam(e.steamId)) {
      counts.noExactSteamIdentity++;
      if (rm || dm) throw Error("rated identity without exact Steam ID");
      continue;
    }
    if (!rm || !dm) counts.exactSteamIdsInMissingSet++;
    const state = observations.get(e.steamId);
    if (!rm) histogram.rm[stages[state?.rmStage ?? 0]]++;
    if (!dm) histogram.dm[stages[state?.dmStage ?? 0]]++;
  }
  if (
    counts.rmRated + counts.rmMissing !== counts.publicIdentityRows ||
    counts.dmRated + counts.dmMissing !== counts.publicIdentityRows ||
    total(histogram.rm) + counts.noExactSteamIdentity !== counts.rmMissing ||
    total(histogram.dm) + counts.noExactSteamIdentity !== counts.dmMissing
  ) throw Error("rating gate cohort conservation failed");

  process.stdout.write(JSON.stringify({
    kind: "aoe2war-steam-rating-gate-funnel",
    schemaVersion: 2,
    observedAt: new Date().toISOString(),
    productionSource: process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE ?? null,
    databaseReadOnly: proof,
    explanation: "Highest gate passed by any ONE numeric observation per Steam ID, source-display diagnostic only. Historical/current authority is unchanged.",
    counts, histogram,
    mutations: {
      production: 0, parserRows: 0, identityRows: 0,
      currentRatingRows: 0, wolo: 0,
    },
  }));
} finally {
  await prisma.$disconnect();
}
