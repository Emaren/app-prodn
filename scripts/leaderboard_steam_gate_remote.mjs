// Protected read-only bounded scan of Steam RM/DM rating-provenance gates.
// This is DIAGNOSTIC ONLY: no raw rating may be promoted into current authority.
// Use indexed game_stats.id pagination to respect production 20-second SQL limits.
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, extname } from "node:path";
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

// Bucket only metadata *already present* on the same raw numeric observation.
// Never infer a missing HMAC, change provenance, or trust bare parse_source.
function blockedDetail(game, stage) {
  if (stage === 3) {
    const upload = game.events?.watcher_upload;
    if (!upload || typeof upload !== "object" || Array.isArray(upload))
      return "watcher_upload_object_absent";
    const value = upload.ingestion_provenance;
    if (value === null || value === undefined || value === "")
      return "ingestion_provenance_field_absent";
    if (value === "historical_import") return "explicit_historical_import";
    return "other_non_live_monitor_value";
  }
  if (stage === 2) {
    const playedAt = stamp(game.playedOn);
    if (playedAt === null) return "game_played_on_absent_or_invalid";
    if (playedAt > Date.now() + 5 * 60_000)
      return "future_game_played_on";
    if (!game.userUid?.trim()) return "uploader_uid_absent";
    if (game.userUid === "system") return "system_uploader";
    return "invalid_replay_hash";
  }
  if (stage === 1) {
    return ["manual_backfill", "manual_override", "engine_room_structural_projection"]
      .includes(game.parseReason ?? "") ? "mutated_or_backfilled_reason" :
      "not_watcher_parse_source";
  }
  return null;
}

function stageContext(game, stage) {
  if (stage !== 3) return null;
  const upload = game.events?.watcher_upload;
  const hash = typeof game.replayHash === "string" ?
    game.replayHash.toLowerCase() : "";
  return {
    signatureVerifiedTrue: upload?.provenance_signature_verified === true,
    signatureVerifiedFalse: upload?.provenance_signature_verified === false,
    checksumVerifiedTrue: upload?.client_sha256_verified === true,
    hashesMatchReplay: typeof upload?.client_sha256 === "string" &&
      typeof upload?.server_sha256 === "string" &&
      upload.client_sha256.toLowerCase() === hash &&
      upload.server_sha256.toLowerCase() === hash,
    fileRolePresent: typeof upload?.file_role === "string",
    beforeFrozenCutoff: (stamp(game.createdAt) ?? Infinity) <
      FROZEN_CUTOFF_MS && (stamp(game.playedOn) ?? Infinity) <
      FROZEN_CUTOFF_MS,
  };
}

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
    'key_events::jsonb AS "events", players::jsonb AS players, ' +
    'replay_file AS "replayFile", original_filename AS "originalFilename" ' +
    'FROM game_stats WHERE id > $1 ORDER BY id ASC LIMIT $2';
  const observations = new Map();
  const stage3HashesBySteamId = new Map();
  const stage3HistoricalById = new Map();
  const stage3ArchiveCandidatesById = new Map();
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


        if (rmStage === 3 || dmStage === 3) {
          // Historical-HD-header candidacy is a DIFFERENT, lower
          // authority rail. These flags never authenticate a Watcher upload.
          const historical = stage3HistoricalById.get(p.steam_id) ?? {
            rm: { header: new Set(), unmarked: new Set(), other: new Set(),
              withReplayFile: new Set() },
            dm: { header: new Set(), unmarked: new Set(), other: new Set(),
              withReplayFile: new Set() },
          };
          for (const [lane, stage] of [["rm", rmStage], ["dm", dmStage]]) {
            if (stage !== 3) continue;
            const sourceKey = lane === "rm" ? "steam_rm_rating" : "steam_dm_rating";
            const value = p.steam_rating_sources?.[sourceKey];
            const dest = value === "hd_header" ? "header" :
              (value === undefined || value === null) ? "unmarked" : "other";
            historical[lane][dest].add(game.id);
            if (typeof game.replayFile === "string" &&
                game.replayFile.trim().length > 0)
              historical[lane].withReplayFile.add(game.id);
          }
          stage3HistoricalById.set(p.steam_id, historical);
          const replayHash = typeof game.replayHash === "string" ?
            game.replayHash.toLowerCase() : "";
          if (/^[a-f0-9]{64}$/.test(replayHash)) {
            const sourceName = game.originalFilename ?? game.replayFile ?? "";
            const ext = extname(String(sourceName)).toLowerCase();
            const validSuffixes = new Set([
              ".aoe2record", ".aoe2mpgame", ".mgz", ".mgx", ".mgl",
            ]);
            const suffix = validSuffixes.has(ext) ? ext : ".aoe2record";
            const candidates = stage3ArchiveCandidatesById.get(p.steam_id) ??
              new Map();
            const key = replayHash + suffix;
            const existing = candidates.get(key);
            const created = stamp(game.playedOn) ?? -Infinity;
            if (!existing || created > existing.playedOn) candidates.set(key, {
              hash: replayHash, suffix, playedOn: created,
              final: game.isFinal === true,
            });
            stage3ArchiveCandidatesById.set(p.steam_id, candidates);
          }

          const hash = game.replayHash?.toLowerCase();
          if (/^[a-f0-9]{64}$/.test(hash ?? "")) {
            const hashes = stage3HashesBySteamId.get(p.steam_id) ?? new Set();
            hashes.add(hash);
            stage3HashesBySteamId.set(p.steam_id, hashes);
          }
        }

        // The highest gate must come from a single observed game, not from
        // mixing signature/hash/role attributes across unrelated files.
        // For ties, select the newest playable game clock for diagnostics.
        for (const [lane, stage] of [["rm", rmStage], ["dm", dmStage]]) {
          if (stage === null) continue;
          const field = lane + "Stage";
          const timeField = lane + "StageClock";
          const currentTime = stamp(game.playedOn) ?? -Infinity;
          if (stage > state[field] || (stage === state[field] &&
              currentTime > (state[timeField] ?? -Infinity))) {
            state[field] = stage;
            state[timeField] = currentTime;
            state[lane + "Detail"] = blockedDetail(game, stage);
            state[lane + "Context"] = stageContext(game, stage);
          }
        }
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
  const details = {
    rm: { provenance: {}, clock: {}, source: {}, stage3Context: {
      signatureVerifiedTrue: 0, signatureVerifiedFalse: 0,
      checksumVerifiedTrue: 0, hashesMatchReplay: 0,
      fileRolePresent: 0, beforeFrozenCutoff: 0,
    } },
    dm: { provenance: {}, clock: {}, source: {}, stage3Context: {
      signatureVerifiedTrue: 0, signatureVerifiedFalse: 0,
      checksumVerifiedTrue: 0, hashesMatchReplay: 0,
      fileRolePresent: 0, beforeFrozenCutoff: 0,
    } },
  };
  const counts = {
    publicIdentityRows: eligible.length,
    rmRated: 0, dmRated: 0, rmMissing: 0, dmMissing: 0,
    neitherRated: 0, noExactSteamIdentity: 0,
    exactSteamIdsInMissingSet: 0,
    scanBatches: batches, scannedGameRows: scannedRows,
  };
  const stage3Missing = new Set();
  const historicalHeaderCandidates = {
    rm: { parserHdHeaderPresent: 0, onlyUnmarkedSource: 0,
      onlyNonHeaderSource: 0, replayFileReferencePresent: 0,
      acceptedPublicReplayOnSameGame: 0,
      hdHeaderAndAcceptedReplayOnSameGame: 0 },
    dm: { parserHdHeaderPresent: 0, onlyUnmarkedSource: 0,
      onlyNonHeaderSource: 0, replayFileReferencePresent: 0,
      acceptedPublicReplayOnSameGame: 0,
      hdHeaderAndAcceptedReplayOnSameGame: 0 },
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
    if ((!rm && state?.rmStage === 3) || (!dm && state?.dmStage === 3))
      stage3Missing.add(e.steamId);
    const acceptedGameIds = new Set(e.replayEvidence.map(item => item.gameStatsId));
    for (const [lane, rated] of [["rm", rm], ["dm", dm]]) {
      if (!rated && state?.[lane + "Stage"] === 3) {
        const observation = stage3HistoricalById.get(e.steamId)?.[lane];
        if (!observation) throw Error("missing stage-3 raw source evidence");
        const bucket = historicalHeaderCandidates[lane];
        if (observation.header.size > 0) bucket.parserHdHeaderPresent++;
        else if (observation.unmarked.size > 0) bucket.onlyUnmarkedSource++;
        else bucket.onlyNonHeaderSource++;
        if (observation.withReplayFile.size > 0)
          bucket.replayFileReferencePresent++;
        const any = [
          ...observation.header, ...observation.unmarked, ...observation.other,
        ];
        if (any.some(id => acceptedGameIds.has(id)))
          bucket.acceptedPublicReplayOnSameGame++;
        if ([...observation.header].some(id => acceptedGameIds.has(id)))
          bucket.hdHeaderAndAcceptedReplayOnSameGame++;
      }
      if (rated) continue;
      const stage = state?.[lane + "Stage"] ?? 0;
      histogram[lane][stages[stage]]++;
      if (stage >= 1 && stage <= 3) {
        const kind = stage === 3 ? "provenance" :
          stage === 2 ? "clock" : "source";
        const name = state?.[lane + "Detail"] ?? "missing_detail";
        details[lane][kind][name] = (details[lane][kind][name] ?? 0) + 1;
        if (stage === 3) {
          const context = state?.[lane + "Context"];
          if (!context) throw Error("missing same-observation context");
          for (const flag of Object.keys(details[lane].stage3Context))
            if (context[flag]) details[lane].stage3Context[flag]++;
        }
      }
    }
  }
  if (
    counts.rmRated + counts.rmMissing !== counts.publicIdentityRows ||
    counts.dmRated + counts.dmMissing !== counts.publicIdentityRows ||
    total(histogram.rm) + counts.noExactSteamIdentity !== counts.rmMissing ||
    total(histogram.dm) + counts.noExactSteamIdentity !== counts.dmMissing
  ) throw Error("rating gate cohort conservation failed");

  for (const lane of ["rm", "dm"]) {
    if (total(details[lane].provenance) !==
          histogram[lane].missing_live_monitor_provenance ||
        total(details[lane].clock) !==
          histogram[lane].invalid_clock_uploader_or_hash ||
        total(details[lane].source) !==
          histogram[lane].nonqualifying_parse_source_only)
      throw Error("blocked provenance detail conservation failed");
  }
  // Read-only correlation: indexed hash is used only as a candidate JOIN key.
  // The receipt's own embedded participant must independently match exact
  // SteamID64 before counting identity-bound evidence. No rating is promoted.
  const wantedByHash = new Map();
  for (const steamId of stage3Missing) {
    for (const replayHash of stage3HashesBySteamId.get(steamId) ?? []) {
      const candidates = wantedByHash.get(replayHash) ?? new Set();
      candidates.add(steamId);
      wantedByHash.set(replayHash, candidates);
    }
  }
  const flags = new Map([...stage3Missing].map(id => [id, {
    matchingAttempt: false,
    watcherAttempt: false,
    currentObservationPresent: false,
    observationBindsIdentity: false,
    observationHasLaneNumeric: false,
    observationLiveAndSigned: false,
    observationHasVerifiedSha: false,
    observationArchiveVerified: false,
  }]));
  let attemptCursor = 0;
  let attemptBatches = 0;
  let scannedAttemptRows = 0;
  const acceptedStatuses = new Set([
    "stored", "duplicate_final", "duplicate_final_refreshed",
    "duplicate_live", "live_placeholder_refreshed",
    "duplicate_reviewed_match", "reviewed_match_refreshed",
    "reviewed_match_artifact_advanced",
  ]);
  const receiptSql =
    'SELECT id, replay_hash AS "replayHash", ' +
    'upload_mode AS "uploadMode", parse_source AS "parseSource", ' +
    'status, evidence::jsonb AS evidence ' +
    'FROM replay_parse_attempts WHERE id > $1 ORDER BY id ASC LIMIT $2';
  while (attemptBatches < MAX_BATCHES) {
    const rows = await prisma.$queryRawUnsafe(
      receiptSql, attemptCursor, BATCH_LIMIT,
    );
    if (!Array.isArray(rows)) throw Error("invalid parse-attempt batch");
    if (!rows.length) break;
    attemptBatches++;
    scannedAttemptRows += rows.length;
    for (const attempt of rows) {
      if (!Number.isSafeInteger(attempt.id) || attempt.id <= attemptCursor)
        throw Error("non-monotonic parse-attempt ID cursor");
      attemptCursor = attempt.id;
      const hash = typeof attempt.replayHash === "string" ?
        attempt.replayHash.toLowerCase() : "";
      const targets = wantedByHash.get(hash);
      if (!targets) continue;
      const isWatcher = attempt.uploadMode === "watcher" &&
        ["watcher_live", "watcher_final"].includes(attempt.parseSource) &&
        acceptedStatuses.has(attempt.status);
      const obs = attempt.evidence?.current_account_observation;
      const obsPlayers = Array.isArray(obs?.players) ? obs.players : [];
      const attached = obs?.replay_sha256?.toLowerCase?.() === hash;
      for (const id of targets) {
        const state = flags.get(id);
        state.matchingAttempt = true;
        if (isWatcher) state.watcherAttempt = true;
        if (obs && typeof obs === "object") {
          state.currentObservationPresent = true;
          if (attached && obsPlayers.some(p => p?.steam_id === id)) {
            state.observationBindsIdentity = true;
            if (obsPlayers.some(p => p?.steam_id === id &&
                (numeric(p.steam_rm_rating) || numeric(p.steam_dm_rating))))
              state.observationHasLaneNumeric = true;
            if (isWatcher &&
                obs.provenance?.ingestion_provenance === "live_monitor" &&
                obs.provenance?.provenance_signature_verified === true)
              state.observationLiveAndSigned = true;
            if (isWatcher &&
                obs.provenance?.client_sha256_verified === true &&
                obs.provenance?.client_sha256?.toLowerCase?.() === hash &&
                obs.provenance?.server_sha256?.toLowerCase?.() === hash)
              state.observationHasVerifiedSha = true;
            if (isWatcher && obs.archive_verified === true)
              state.observationArchiveVerified = true;
          }
        }
      }
    }
    if (rows.length < BATCH_LIMIT) break;
  }
  if (attemptBatches >= MAX_BATCHES)
    throw Error("safety limit: scan of parse-attempt receipts incomplete");
  const receiptCorrelation = {
    targetSteamIdentities: stage3Missing.size,
    candidateReplayHashes: wantedByHash.size,
    scannedAttemptRows, attemptBatches,
    ...Object.fromEntries(
      Object.keys(flags.values().next().value ?? {}).map(flag => [
        flag,
        [...flags.values()].filter(value => value[flag] === true).length,
      ]),
    ),
  };
  const rmTargets = histogram.rm.missing_live_monitor_provenance;
  const dmTargets = histogram.dm.missing_live_monitor_provenance;
  if (receiptCorrelation.targetSteamIdentities < Math.max(rmTargets, dmTargets) ||
      receiptCorrelation.targetSteamIdentities > rmTargets + dmTargets)
    throw Error("receipt join cohort conservation failed");
  for (const key of [
    "matchingAttempt", "watcherAttempt", "currentObservationPresent",
    "observationBindsIdentity", "observationHasLaneNumeric",
    "observationLiveAndSigned", "observationHasVerifiedSha",
    "observationArchiveVerified",
  ]) {
    if (!Number.isInteger(receiptCorrelation[key]) ||
        receiptCorrelation[key] < 0 ||
        receiptCorrelation[key] > stage3Missing.size)
      throw Error("receipt correlation out of bounds");
  }
  for (const lane of ["rm", "dm"]) {
    const values = historicalHeaderCandidates[lane];
    if (values.parserHdHeaderPresent + values.onlyUnmarkedSource +
        values.onlyNonHeaderSource !==
        histogram[lane].missing_live_monitor_provenance ||
        values.hdHeaderAndAcceptedReplayOnSameGame >
          values.acceptedPublicReplayOnSameGame ||
        values.acceptedPublicReplayOnSameGame >
          histogram[lane].missing_live_monitor_provenance ||
        values.replayFileReferencePresent >
          histogram[lane].missing_live_monitor_provenance)
      throw Error("historical header candidate conservation failed");
  }
  // Read-only filesystem check of the API's content-addressed archive
  // layout. Ignore database replay_file basenames for path construction.
  // They are original upload names, *not* trusted archive paths.
  const archiveRoot = resolve(
    process.env.REPLAY_ARCHIVE_DIR ||
    "/mnt/HC_Volume_105319120/aoe2-replay-archive",
  );
  const archiveProbe = {
    source: "api-prodn content-addressed archive layout",
    selectedExactSteamIds: stage3Missing.size,
    maxCandidatesPerIdentity: 6,
    maxShaSampleFiles: 12,
    maxShaSampleSizeBytes: 32 * 1024 * 1024,
    archiveRootAccessible: false,
    candidateIds: 0,
    candidatePathsProbed: 0,
    idsWithExistingArchiveFile: 0,
    idsWithoutExistingArchiveAmongSample: 0,
    idsWithHashVerifiedSample: 0,
    idsWithHashMismatchSample: 0,
    sampleHashFileCount: 0,
    sampleHashByteCount: 0,
    fileReadErrors: 0,
  };
  try {
    archiveProbe.archiveRootAccessible = (await stat(archiveRoot)).isDirectory();
  } catch {
    // A different storage mount may be used by the API. An inaccessible
    // mount must not be interpreted as evidence that the archive was deleted.
  }
  const observedHashes = new Set();
  for (const steamId of stage3Missing) {
    const candidates = [...(stage3ArchiveCandidatesById.get(steamId)?.values() ?? [])]
      .sort((a, b) =>
        Number(b.final) - Number(a.final) ||
        b.playedOn - a.playedOn ||
        a.hash.localeCompare(b.hash),
      )
      .slice(0, archiveProbe.maxCandidatesPerIdentity);
    if (candidates.length) archiveProbe.candidateIds++;
    let existsForId = false;
    let hashVerifiedForId = false;
    let hashMismatchForId = false;
    for (const candidate of candidates) {
      archiveProbe.candidatePathsProbed++;
      const filePath = join(archiveRoot,
        candidate.hash.slice(0, 2), candidate.hash.slice(2, 4),
        candidate.hash + candidate.suffix);
      let info;
      try { info = await stat(filePath); } catch { continue; }
      if (!info.isFile()) continue;
      existsForId = true;
      if (
        !observedHashes.has(filePath) &&
        archiveProbe.sampleHashFileCount < archiveProbe.maxShaSampleFiles &&
        info.size > 0 && info.size <= archiveProbe.maxShaSampleSizeBytes
      ) {
        observedHashes.add(filePath);
        archiveProbe.sampleHashFileCount++;
        archiveProbe.sampleHashByteCount += info.size;
        try {
          const hash = createHash("sha256");
          for await (const chunk of createReadStream(filePath)) hash.update(chunk);
          if (hash.digest("hex") === candidate.hash) hashVerifiedForId = true;
          else hashMismatchForId = true;
        } catch {
          archiveProbe.fileReadErrors++;
        }
      }
      break;
    }
    if (existsForId) archiveProbe.idsWithExistingArchiveFile++;
    else archiveProbe.idsWithoutExistingArchiveAmongSample++;
    if (hashVerifiedForId) archiveProbe.idsWithHashVerifiedSample++;
    if (hashMismatchForId) archiveProbe.idsWithHashMismatchSample++;
  }
  if (archiveProbe.candidateIds !== stage3Missing.size ||
      archiveProbe.idsWithExistingArchiveFile +
        archiveProbe.idsWithoutExistingArchiveAmongSample !== stage3Missing.size ||
      archiveProbe.sampleHashFileCount > archiveProbe.maxShaSampleFiles ||
      archiveProbe.idsWithHashVerifiedSample +
        archiveProbe.idsWithHashMismatchSample > archiveProbe.sampleHashFileCount)
    throw Error("archive diagnostic conservation failed");
  process.stdout.write(JSON.stringify({
    kind: "aoe2war-steam-rating-gate-funnel",
    schemaVersion: 6,
    observedAt: new Date().toISOString(),
    productionSource: process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE ?? null,
    databaseReadOnly: proof,
    explanation: "Highest gate passed by any ONE numeric observation per Steam ID, source-display diagnostic only. Historical/current authority is unchanged.",
    counts, histogram, blockedDetails: details, receiptCorrelation,
    historicalHeaderCandidates, archiveProbe,
    mutations: {
      production: 0, parserRows: 0, identityRows: 0,
      currentRatingRows: 0, wolo: 0,
    },
  }));
} finally {
  await prisma.$disconnect();
}
