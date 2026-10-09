// Read-only, limited sample: independently hash archived replay bytes, then
// ask the INSTALLED API parser to re-extract HD header Steam RM/DM fields.
// No DB writes, replay modification, provenance promotion, or rating changes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { getPrisma } from "@/lib/prisma";
import { loadPublicPlayerDirectory } from "@/lib/publicPlayerDirectory";
import { latestHistoricalSteamLaneRating } from "@/lib/leaderboardRating";
import { isLeaderboardExcludedSystemUid } from "@/lib/internalSystemAccounts";

const prisma = getPrisma();
const BATCH = 512;
const MAX_BATCHES = 1000;
// Wave 0 retains the already certified six-file canary. Later waves
// inspect 24 additional deterministic identity positions per run.
const rawWave = process.env.AOE2WAR_TRUTH_GAME_ID ?? "0";
const wave = Number(rawWave);
if (!Number.isSafeInteger(wave) || wave < 0 || wave > 78)
  throw Error("archive parser sample wave outside protected range");
const SAMPLE_LIMIT = wave === 0 ? 6 : 24;
const SAMPLE_OFFSET = wave === 0 ? 0 : 6 + (wave - 1) * 24;
const DEADLINE_MS = wave === 0 ? 95000 : 125000;
const MAX_FILE_SIZE = 12 * 1024 * 1024;
const PARSER_TIMEOUT_MS = 12500;
const MAX_PER_STEAM_ID = 3;
const acceptedSuffixes = new Set([
  ".aoe2record", ".aoe2mpgame", ".mgz", ".mgx", ".mgl",
]);
const validId = id => typeof id === "string" && /^\d{17}$/.test(id);
const numeric = n => typeof n === "number" && Number.isInteger(n) &&
  n > 0 && n <= 5000;
const hasRating = n => typeof n === "number" && Number.isFinite(n) && n > 0;
const sha = s => createHash("sha256").update(s).digest("hex");
const apiDir = resolve(process.env.AOE2WAR_API_PROD_APP ??
  "/var/www/AoE2HDBets/api-prodn");
const archiveRoot = resolve(process.env.REPLAY_ARCHIVE_DIR ??
  "/mnt/HC_Volume_105319120/aoe2-replay-archive");
const pythonCandidates = ["venv/bin/python", ".venv/bin/python"];
const PYTHON = [
  "import contextlib,io,json,sys",
  "from pathlib import Path",
  "path=Path(sys.argv[1])",
  "final=sys.argv[2]=='1'",
  "with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):",
  "    from utils.replay_parser import _parse_sync_bytes_with_diagnostics",
  "    data=path.read_bytes()",
  "    parsed,diag,mode=_parse_sync_bytes_with_diagnostics(str(path),data,apply_hd_early_exit_rules=final)",
  "players=parsed.get('players') if isinstance(parsed,dict) else None",
  "if not isinstance(players,list): players=[]",
  "output=[]",
  "for p in players:",
  "    if not isinstance(p,dict): continue",
  "    sid=p.get('steam_id')",
  "    if not isinstance(sid,str): continue",
  "    src=p.get('steam_rating_sources')",
  "    src=src if isinstance(src,dict) else {}",
  "    output.append({'steamId':sid,'rm':p.get('steam_rm_rating'),",
  "       'dm':p.get('steam_dm_rating'),'rmSource':src.get('steam_rm_rating'),",
  "       'dmSource':src.get('steam_dm_rating')})",
  "print(json.dumps({'parsed':isinstance(parsed,dict),'players':output,",
  " 'mode':mode,'errorStage':diag.get('stage') if isinstance(diag,dict) else None,",
  " 'errorCategory':diag.get('category') if isinstance(diag,dict) else None},separators=(',',':')))",
].join("\n");
async function hashFile(file) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(file)) h.update(chunk);
  return h.digest("hex");
}
function apiGit(args) {
  const r = spawnSync("git", ["-c", "safe.directory="+apiDir, ...args], {
    cwd: apiDir, encoding: "utf8", timeout: 6000, maxBuffer: 262144,
    env: {PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: "/tmp"},
  });
  if (r.error || r.status !== 0) return null;
  return r.stdout.trim();
}
function parseInIsolatedSubprocess(interpreter, filePath, isFinal) {
  const response = spawnSync(interpreter, [
    "-B", "-c", PYTHON, filePath, isFinal ? "1" : "0",
  ], {
    cwd: apiDir, encoding: "utf8", timeout: PARSER_TIMEOUT_MS,
    maxBuffer: 262144, windowsHide: true,
    env: {
      PATH: process.env.PATH ?? "/usr/bin:/bin",
      PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1",
      HOME: "/tmp", LANG: "C.UTF-8",
    },
  });
  if (response.error?.code === "ETIMEDOUT") return { status: "timeout" };
  if (response.error || response.status !== 0)
    return { status: "parser_error" };
  try {
    const payload = JSON.parse(response.stdout.trim());
    if (typeof payload.parsed !== "boolean" || !Array.isArray(payload.players))
      return { status: "invalid_parser_output" };
    return { status: payload.parsed ? "parsed" : "no_projection",
      players: payload.players,
      mode: payload.mode, errorStage: payload.errorStage,
      errorCategory: payload.errorCategory };
  } catch {
    return { status: "invalid_parser_output" };
  }
}
try {
  const proof = await prisma.$queryRawUnsafe(
    "SELECT current_setting('transaction_read_only') AS transaction_mode, " +
    "current_setting('default_transaction_read_only') AS default_mode",
  );
  if (!Array.isArray(proof) || proof.length !== 1 ||
      proof[0].transaction_mode !== "on" || proof[0].default_mode !== "on")
    throw Error("STOP: database read-only safety proof absent");
  const directory = await loadPublicPlayerDirectory(
    prisma, null, { includePresence: false, includeCurrentWatcherState: true },
  );
  const target = new Set(directory.allEntries.filter(
    e => !isLeaderboardExcludedSystemUid(e.uid) &&
      (e.totalMatches > 0 || e.claimed) && validId(e.steamId) &&
      !(
        hasRating(e.steamRmRating) ||
        hasRating(latestHistoricalSteamLaneRating(e.replayEvidence, "rm"))
      ) && !(
        hasRating(e.steamDmRating) ||
        hasRating(latestHistoricalSteamLaneRating(e.replayEvidence, "dm"))
      ),
  ).map(e => e.steamId));
  const candidates = new Map();
  let cursor = 0;
  let batches = 0;
  let scannedRows = 0;
  const query =
    'SELECT id, parse_source AS "source", is_final AS "isFinal", ' +
    'replay_hash AS "hash", original_filename AS "name", ' +
    'players::jsonb AS players, key_events::jsonb AS "events" ' +
    'FROM game_stats WHERE id > $1 ORDER BY id ASC LIMIT $2';
  while (batches < MAX_BATCHES) {
    const rows = await prisma.$queryRawUnsafe(query, cursor, BATCH);
    if (!Array.isArray(rows)) throw Error("invalid game scan batch");
    if (rows.length === 0) break;
    batches++;
    scannedRows += rows.length;
    for (const row of rows) {
      if (!Number.isSafeInteger(row.id) || row.id <= cursor)
        throw Error("game row cursor changed");
      cursor = row.id;
      const hash = typeof row.hash === "string" ? row.hash.toLowerCase() : "";
      if (!/^[a-f0-9]{64}$/.test(hash) ||
          !["watcher_live", "watcher_final"].includes(row.source) ||
          row.events?.watcher_upload?.ingestion_provenance === "live_monitor")
        continue;
      const suffix = extname(String(row.name ?? "")).toLowerCase();
      const normalizedSuffix = acceptedSuffixes.has(suffix) ?
        suffix : ".aoe2record";
      for (const p of Array.isArray(row.players) ? row.players : []) {
        if (!p || !target.has(p.steam_id) ||
            !numeric(p.steam_rm_rating) || !numeric(p.steam_dm_rating) ||
            p.steam_rating_sources?.steam_rm_rating != null ||
            p.steam_rating_sources?.steam_dm_rating != null)
          continue;
        const list = candidates.get(p.steam_id) ?? [];
        if (!list.some(x => x.hash === hash)) {
          list.push({
            hash, suffix: normalizedSuffix, isFinal: row.isFinal === true,
            observedRm: p.steam_rm_rating, observedDm: p.steam_dm_rating,
          });
          if (list.length > MAX_PER_STEAM_ID) list.shift();
        }
        candidates.set(p.steam_id, list);
      }
    }
    if (rows.length < BATCH) break;
  }
  if (batches >= MAX_BATCHES) throw Error("incomplete bounded game scan");
  let interpreter = null;
  for (const suffix of pythonCandidates) {
    const candidate = join(apiDir, suffix);
    try { if ((await stat(candidate)).isFile()) { interpreter = candidate; break; } }
    catch { /* alternative interpreter candidate */ }
  }
  let archiveAccessible = false;
  try { archiveAccessible = (await stat(archiveRoot)).isDirectory(); }
  catch { /* mount may be inaccessible; never infer missing bytes */ }
  const apiRevision = apiGit(["rev-parse","HEAD"]);
  const apiDirtyBefore = apiGit(["status","--porcelain","--untracked-files=all"]);
  if (!apiRevision || !/^[a-f0-9]{40}$/.test(apiRevision) ||
      apiDirtyBefore === null || apiDirtyBefore !== "")
    throw Error("STOP: installed API parser Git provenance unavailable or dirty");
  const summary = {
    apiParserSource: apiRevision,
    publicUnratedExactSteamIds: target.size,
    unmarkedWatchersWithBothNumbers: candidates.size,
    scannedGameRows: scannedRows, scanBatches: batches,
    apiPythonAvailable: Boolean(interpreter), archiveAccessible,
    selectedSampleLimit: SAMPLE_LIMIT,
    sampleWave: wave, sampleOffsetIdentities: SAMPLE_OFFSET,
    deadlineReached: false,
    sampleFilesLocated: 0, sampleHashesVerified: 0,
    identitiesWithoutLocatedFile: 0, identitiesWithOversizeOnly: 0,
    identitiesWithVerifiedFile: 0,
    missingArchiveCandidatePaths: 0,
    alreadySampledHashCandidateSkips: 0,
    sampleHashMismatch: 0, sampleTooLarge: 0,
    parserParsed: 0, parserNoProjection: 0,
    parserTimeout: 0, parserError: 0, invalidParserOutput: 0,
    noProjectionByMode: {}, noProjectionByErrorStage: {},
    noProjectionByErrorCategory: {},
    sameSteamIdentityPresent: 0, uniquelyBoundSteamIdentity: 0,
    headerRmPresent: 0, headerDmPresent: 0,
    headerBothPresent: 0, headerRmMatchesStored: 0,
    headerDmMatchesStored: 0, headerRmDiffersStored: 0,
    headerDmDiffersStored: 0,
  };
  // Deterministic pseudorandom distribution; no observer-selected names
  // or public Steam identifiers in stdout or the local operator receipt.
  const order = [...candidates.keys()].sort(
    (a,b) => sha("aoe2war-replay-canary-v1:"+a).localeCompare(
      sha("aoe2war-replay-canary-v1:"+b)),
  );
  // The live eligible universe can change between waves. These
  // fingerprints allow the private operator receipts to identify drift
  // and overlap. Neither raw Steam IDs nor parsed rating values leave
  // the audited subprocess JSON response.
  const sampleEvidence = [];
  const cohortFingerprint = sha(
    "aoe2war-archived-header-cohort-v1:" + order.join(","),
  );
  const sampledHashes = new Set();
  const deadline = Date.now() + DEADLINE_MS;
  const sampleWindow = order.slice(SAMPLE_OFFSET, SAMPLE_OFFSET + SAMPLE_LIMIT);
  summary.sampleIdentityWindow = sampleWindow.length;
  for (const id of sampleWindow) {
    let locatedForIdentity = false;
    let verifiedForIdentity = false;
    let oversizeForIdentity = false;
    if (Date.now() > deadline) {
      summary.deadlineReached = true;
      break;
    }
    if (summary.sampleHashesVerified >= SAMPLE_LIMIT ||
        !archiveAccessible || !interpreter) break;
    for (const c of [...(candidates.get(id) ?? [])].sort(
      (a, b) => Number(b.isFinal) - Number(a.isFinal)
    )) {
      if (Date.now() > deadline) {
        summary.deadlineReached = true;
        break;
      }
      if (summary.sampleHashesVerified >= SAMPLE_LIMIT) break;
      if (sampledHashes.has(c.hash)) {
        summary.alreadySampledHashCandidateSkips++;
        continue;
      }
      const filePath = join(archiveRoot, c.hash.slice(0,2),
        c.hash.slice(2,4), c.hash+c.suffix);
      let size;
      try {
        const meta = await stat(filePath);
        if (!meta.isFile()) continue;
        size = meta.size;
      } catch {
        summary.missingArchiveCandidatePaths++;
        continue;
      }
      summary.sampleFilesLocated++;
      locatedForIdentity = true;
      if (size <= 0 || size > MAX_FILE_SIZE) {
        summary.sampleTooLarge++;
        oversizeForIdentity = true;
        continue;
      }
      let digest;
      try { digest = await hashFile(filePath); }
      catch { summary.parserError++; continue; }
      if (digest !== c.hash) { summary.sampleHashMismatch++; continue; }
      sampledHashes.add(c.hash);
      verifiedForIdentity = true;
      summary.sampleHashesVerified++;
      const fingerprint = sha("aoe2war-archived-identity-v1:" + id);
      const evidence = { identityFingerprint: fingerprint,
        replaySha256: c.hash, result: "not_parsed" };
      sampleEvidence.push(evidence);
      const p = parseInIsolatedSubprocess(interpreter, filePath, c.isFinal);
      evidence.result = p.status;
      if (p.status !== "parsed") {
        const key = ({
          no_projection:"parserNoProjection",timeout:"parserTimeout",
          parser_error:"parserError",
          invalid_parser_output:"invalidParserOutput",
        })[p.status];
        if (!key) throw Error("unexpected parser status");
        summary[key]++;
        if (p.status === "no_projection") {
          const safe = x => typeof x === "string" &&
            /^[a-z][a-z0-9_]{0,63}$/.test(x) ? x : "unknown";
          for (const [field, value] of [
            ["noProjectionByMode", p.mode],
            ["noProjectionByErrorStage", p.errorStage],
            ["noProjectionByErrorCategory", p.errorCategory],
          ]) {
            const label = safe(value);
            summary[field][label] = (summary[field][label] ?? 0) + 1;
          }
        }
        break;
      }
      summary.parserParsed++;
      const matches = p.players.filter(x => x?.steamId === id);
      if (matches.length > 0) summary.sameSteamIdentityPresent++;
      if (matches.length !== 1) break;
      summary.uniquelyBoundSteamIdentity++;
      evidence.result = "unique_identity";
      const player = matches[0];
      const rm = player.rmSource === "hd_header" && numeric(player.rm);
      const dm = player.dmSource === "hd_header" && numeric(player.dm);
      if (rm) summary.headerRmPresent++;
      if (dm) summary.headerDmPresent++;
      if (rm && dm) summary.headerBothPresent++;
      if (rm && dm &&
          player.rm === c.observedRm && player.dm === c.observedDm)
        evidence.result = "both_hd_headers_match";
      if (rm) {
        if (player.rm === c.observedRm) summary.headerRmMatchesStored++;
        else summary.headerRmDiffersStored++;
      }
      if (dm) {
        if (player.dm === c.observedDm) summary.headerDmMatchesStored++;
        else summary.headerDmDiffersStored++;
      }
      break;
    }
    if (!locatedForIdentity) summary.identitiesWithoutLocatedFile++;
    if (verifiedForIdentity) summary.identitiesWithVerifiedFile++;
    if (oversizeForIdentity && !verifiedForIdentity)
      summary.identitiesWithOversizeOnly++;
  }
  if (apiGit(["rev-parse","HEAD"]) !== apiRevision ||
      apiGit(["status","--porcelain","--untracked-files=all"]) !== "")
    throw Error("STOP: API parser worktree or revision changed during audit");
  const countBuckets = object => Object.values(object).reduce(
    (sum, value) => sum + value, 0,
  );
  if (
      countBuckets(summary.noProjectionByMode) !== summary.parserNoProjection ||
      countBuckets(summary.noProjectionByErrorStage) !== summary.parserNoProjection ||
      countBuckets(summary.noProjectionByErrorCategory) !== summary.parserNoProjection ||
      summary.sampleIdentityWindow > SAMPLE_LIMIT ||
      summary.sampleHashesVerified > summary.sampleIdentityWindow ||
      summary.sampleHashesVerified > SAMPLE_LIMIT ||
      sampleEvidence.length !== summary.sampleHashesVerified ||
      new Set(sampleEvidence.map(e=>e.identityFingerprint)).size !==
        sampleEvidence.length ||
      new Set(sampleEvidence.map(e=>e.replaySha256)).size !==
        sampleEvidence.length ||
      summary.identitiesWithVerifiedFile !== summary.sampleHashesVerified ||
      summary.identitiesWithoutLocatedFile +
        summary.identitiesWithVerifiedFile > summary.sampleIdentityWindow ||
      summary.identitiesWithOversizeOnly >
        summary.sampleIdentityWindow ||

      summary.sampleWave !== wave ||
      summary.sampleOffsetIdentities !== SAMPLE_OFFSET ||
      summary.parserParsed + summary.parserNoProjection +
        summary.parserTimeout + summary.parserError +
        summary.invalidParserOutput < summary.sampleHashesVerified ||
      summary.headerBothPresent > Math.min(
        summary.headerRmPresent, summary.headerDmPresent) ||
      summary.uniquelyBoundSteamIdentity > summary.parserParsed)
    throw Error("parser canary conservation failed");
  process.stdout.write(JSON.stringify({
    kind:"aoe2war-archived-hd-rating-parser-canary",
    schemaVersion:1, observedAt:new Date().toISOString(),
    productionSource:process.env.AOE2WAR_TRUTH_PRODUCTION_SOURCE??null,
    databaseReadOnly:proof,
    summary, cohortFingerprint, sampleEvidence,
    limitations:"Bounded revision-pinned, SHA-verified separate-wave header sample. Selection limited to candidates with both raw lanes; no population extrapolation or rating promotion.",
    mutations:{production:0,parserRows:0,identityRows:0,
      currentRatingRows:0,wolo:0},
  }));
} finally {
  await prisma.$disconnect();
}
