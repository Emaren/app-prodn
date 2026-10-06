import "server-only";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { getPrisma } from "@/lib/prisma";
import { normalizeReplayPlayers } from "@/lib/teamResolution";
import { cleanPublicGameRows, publicReplayIdentity, publicReplayWinnerTruth } from "@/lib/publicReplayTruth";
import { applyReplayAdjudicationToGameStats, EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION } from "@/lib/replayAdjudications";
import { resolveReplayResultForPlayer } from "@/lib/replayPlayerResult";
import { HD_REPLAY_PARSER_CONTRACT } from "@/lib/replayEngineRoom";
import { nativeRosterFromSource, nativeSnapshotDigest, sealNativeReplayManifest, validateNativeReplayManifest, type NativeReplayManifest } from "@/lib/nativeReplayManifest";

export const NATIVE_REPLAY_CONFIRMATION = "RUN NATIVE REPLAY";
export const NATIVE_REPLAY_MAX_BYTES = 64 * 1024 * 1024;
export const NATIVE_REPLAY_DEFAULT_PERFORMANCE_SECONDS = 240;
export const NATIVE_REPLAY_MAX_PERFORMANCE_SECONDS = 240;
export const NATIVE_REPLAY_DEFAULT_WALL_SECONDS = 300;
export const NATIVE_REPLAY_MAX_WALL_SECONDS = 300;
export const NATIVE_REPLAY_CANARY_SHA256_BY_GAME_ID = new Map<number, string>([
  [
    32388,
    "02a7bca0ae47d7177e970769b474de353ad76afd896c551ad3862e3f5112954b",
  ],
]);
export const NATIVE_REPLAY_CANARY_GAME_IDS = new Set(
  NATIVE_REPLAY_CANARY_SHA256_BY_GAME_ID.keys()
);
export const NATIVE_REPLAY_CANARY_ROSTER_BY_GAME_ID = new Map<number, number[]>([
  [32388, [1, 2, 3, 4]],
]);

const ARCHIVE_ROOT = "/mnt/HC_Volume_105319120/aoe2-replay-archive";
const SHA256_RE = /^[0-9a-f]{64}$/;
const SAFE_REPLAY_EXTENSIONS = new Set([".aoe2record"]);

export type NativeReplayRunParameters = {
  gameStatsId: number;
  replaySha256: string;
  rosterSlots: number[];
  candidateOnly: true;
  nativePerformanceSeconds: number;
  timeoutSeconds: number;
  manifest?: NativeReplayManifest;
};

function boundedPositiveInteger(
  value: unknown,
  field: string,
  maximum: number,
  fallback?: number
) {
  if (value === undefined || value === null || value === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`${field} is required.`);
  }
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value.trim())
        ? Number(value)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${field} must be an integer between 1 and ${maximum}.`);
  }
  return parsed;
}

export function parseNativeReplayRunParameters(
  value: unknown
): NativeReplayRunParameters {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  if (Object.keys(source).some(key => !["gameStatsId", "replaySha256", "rosterSlots", "candidateOnly", "nativePerformanceSeconds", "timeoutSeconds", "manifest"].includes(key))) {
    throw Error("Unexpected native replay parameters; arbitrary paths, hashes and commands are not accepted.");
  }

  const gameStatsId = boundedPositiveInteger(
    source.gameStatsId,
    "gameStatsId",
    Number.MAX_SAFE_INTEGER
  );
  const manifest = source.manifest === undefined ? undefined : validateNativeReplayManifest(source.manifest);
  if (!manifest && !NATIVE_REPLAY_CANARY_GAME_IDS.has(gameStatsId)) {
    throw new Error(
      "Native HD execution is still locked to trusted control GameStats #32388."
    );
  }

  const replaySha256 =
    typeof source.replaySha256 === "string"
      ? source.replaySha256.trim().toLowerCase()
      : "";
  if (!SHA256_RE.test(replaySha256)) {
    throw new Error("replaySha256 must be a complete lowercase SHA-256 digest.");
  }
  const canarySha256 = NATIVE_REPLAY_CANARY_SHA256_BY_GAME_ID.get(gameStatsId);
  if (manifest ? manifest.gameStatsId !== gameStatsId || manifest.replaySha256 !== replaySha256 : !canarySha256 || replaySha256 !== canarySha256) {
    throw new Error(
      "Native HD canary replay SHA-256 does not match the trusted GameStats #32388 control."
    );
  }
  if (source.candidateOnly !== true) {
    throw new Error("Native replay execution is candidate-only.");
  }
  if (!Array.isArray(source.rosterSlots)) {
    throw new Error("rosterSlots must be an array.");
  }
  const rosterSlots = [
    ...new Set(
      source.rosterSlots.map((item) =>
        typeof item === "number"
          ? item
          : typeof item === "string" && /^\d+$/.test(item.trim())
            ? Number(item)
            : Number.NaN
      )
    ),
  ].sort((left, right) => left - right);
  if (
    rosterSlots.length !== source.rosterSlots.length ||
    rosterSlots.length < 2 ||
    rosterSlots.length > 8 ||
    rosterSlots.some(
      (slot) => !Number.isSafeInteger(slot) || slot < 1 || slot > 8
    )
  ) {
    throw new Error("rosterSlots must contain 2-8 unique AoE2 player slots from 1 through 8.");
  }

  const trustedRoster = manifest?.roster.map(p => p.slot) ?? NATIVE_REPLAY_CANARY_ROSTER_BY_GAME_ID.get(gameStatsId);
  if (
    !trustedRoster ||
    rosterSlots.length !== trustedRoster.length ||
    rosterSlots.some((slot, index) => slot !== trustedRoster[index])
  ) {
    throw new Error(
      "Native HD canary roster does not match trusted GameStats #32388 slots 1,2,3,4."
    );
  }

  const nativePerformanceSeconds = boundedPositiveInteger(
    source.nativePerformanceSeconds,
    "nativePerformanceSeconds",
    NATIVE_REPLAY_MAX_PERFORMANCE_SECONDS,
    NATIVE_REPLAY_DEFAULT_PERFORMANCE_SECONDS
  );
  const timeoutSeconds = boundedPositiveInteger(
    source.timeoutSeconds,
    "timeoutSeconds",
    NATIVE_REPLAY_MAX_WALL_SECONDS,
    Math.max(
      NATIVE_REPLAY_DEFAULT_WALL_SECONDS,
      nativePerformanceSeconds + 45
    )
  );
  if (timeoutSeconds < nativePerformanceSeconds + 15) {
    throw new Error(
      "timeoutSeconds must leave at least 15 seconds beyond nativePerformanceSeconds."
    );
  }

  return {
    gameStatsId,
    replaySha256,
    rosterSlots,
    candidateOnly: true,
    nativePerformanceSeconds,
    timeoutSeconds,
    ...(manifest ? { manifest } : {}),
  };
}

export async function buildNativeReplayRunParameters(
  gameStatsIdInput: unknown
): Promise<NativeReplayRunParameters> {
  const gameStatsId = boundedPositiveInteger(
    gameStatsIdInput,
    "gameStatsId",
    Number.MAX_SAFE_INTEGER
  );
  if (!NATIVE_REPLAY_CANARY_GAME_IDS.has(gameStatsId)) {
    const manifest = await buildNativeControlManifest(gameStatsId);
    return parseNativeReplayRunParameters({ gameStatsId, replaySha256: manifest.replaySha256, rosterSlots: manifest.roster.map(p => p.slot), candidateOnly: true, manifest });
  }
  const game = await getPrisma().gameStats.findUnique({
    where: { id: gameStatsId },
    select: {
      id: true,
      replayHash: true,
      is_final: true,
      players: true,
    },
  });
  if (!game || !game.is_final) {
    throw new Error("Native replay worker requires an existing final GameStats row.");
  }

  const replaySha256 = String(game.replayHash || "").trim().toLowerCase();
  if (!SHA256_RE.test(replaySha256)) {
    throw new Error("The selected battle has no canonical replay SHA-256.");
  }

  const normalized = normalizeReplayPlayers(game.players);
  const slots = normalized
    .map((player) => player.playerNumber)
    .filter((slot): slot is number => Number.isInteger(slot))
    .filter((slot) => slot >= 1 && slot <= 8);
  const rosterSlots = [...new Set(slots)].sort((left, right) => left - right);
  if (
    rosterSlots.length < 2 ||
    rosterSlots.length !== normalized.length
  ) {
    throw new Error(
      "The selected battle does not have one unique canonical player slot for every roster member."
    );
  }

  return parseNativeReplayRunParameters({
    gameStatsId,
    replaySha256,
    rosterSlots,
    candidateOnly: true,
    nativePerformanceSeconds: NATIVE_REPLAY_DEFAULT_PERFORMANCE_SECONDS,
    timeoutSeconds: NATIVE_REPLAY_DEFAULT_WALL_SECONDS,
  });
}

async function locateArchiveReplay(replaySha256: string) {
  const directory = join(
    ARCHIVE_ROOT,
    replaySha256.slice(0, 2),
    replaySha256.slice(2, 4)
  );
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    throw new Error("The canonical replay archive directory is missing.");
  }

  const canonicalName = `${replaySha256}.aoe2record`;
  const candidate = entries.find(
    (entry) =>
      entry.isFile() &&
      !entry.isSymbolicLink() &&
      entry.name === canonicalName &&
      SAFE_REPLAY_EXTENSIONS.has(extname(entry.name).toLowerCase())
  );

  if (!candidate) {
    throw new Error(
      "The exact SHA-named .aoe2record is not present in the canonical replay archive."
    );
  }
  return join(directory, candidate.name);
}

/** Known controls only. Unknown admission requires a separately reviewed green ladder. */
export async function buildNativeControlManifest(gameStatsId: number): Promise<NativeReplayManifest> {
  return getPrisma().$transaction(async tx => {
    const all = await tx.gameStats.findMany({ where: { is_final: true }, orderBy: { id: "asc" }, include: { replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION } });
    const source = all.find(g => g.id === gameStatsId);
    if (!source || !SHA256_RE.test(source.replayHash)) throw Error("Canonical final replay required.");
    const logicalBattleId = publicReplayIdentity(source);
    const finalGroup = all.filter(g => publicReplayIdentity(g) === logicalBattleId || g.replayHash === source.replayHash);
    const nonfinal = await tx.gameStats.findMany({ where: { is_final: false, replayHash: { in: [...new Set(finalGroup.map(g => g.replayHash))] } }, orderBy: { id: "asc" }, include: { replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION } });
    const group = [...finalGroup, ...nonfinal];
    const effective = cleanPublicGameRows(finalGroup.map(applyReplayAdjudicationToGameStats), { includeReview: true, includeLive: false });
    if (effective.length !== 1 || !publicReplayWinnerTruth(effective[0]).winner || effective[0].disconnect_detected) throw Error("Unknown, conflicting or disconnected results cannot be native controls.");
    const game = effective[0];
    if (game.replayHash !== source.replayHash || publicReplayIdentity(game) !== logicalBattleId) throw Error("Selected control ID is not bound to the canonical exact artifact.");
    const normalized = normalizeReplayPlayers(game.players);
    const roster = nativeRosterFromSource(game.players);
    if (roster.length !== normalized.length) throw Error("Raw native roster cannot merge participant identities.");
    const results = normalized.map(p => ({ slot: p.playerNumber, result: resolveReplayResultForPlayer(game, v => v.stablePlayerKey === p.stablePlayerKey) }));
    if (results.some(p => p.result === "unknown") || !results.some(p => p.result === "loss")) throw Error("Independent complete participant result required.");
    const ids = group.map(g => g.id).sort((a, b) => a - b);
    const keys = [...new Set(group.flatMap(g => {
      const k = (typeof g.key_events === "string" ? JSON.parse(g.key_events) : g.key_events) as Record<string, unknown> | null;
      const u = k?.watcher_upload as Record<string, unknown> | undefined;
      return [publicReplayIdentity(g), g.original_filename, g.replay_file, u?.watcher_session_id, k?.platform_match_id].filter((v): v is string => typeof v === "string" && Boolean(v.trim())).map(v => v.trim());
    }))];
    const markets = await tx.betMarket.findMany({ where: { OR: [{ linkedGameStatsId: { in: ids } }, { lateFinalGameStatsId: { in: ids } }, { linkedSessionKey: { in: keys } }, { battle: { identityKey: { in: keys } } }] }, select: { id: true, settlementStatus: true, settledAt: true, settlementRunId: true, _count: { select: { wagers: true } } } });
    const claims = await tx.pendingWoloClaim.count({ where: { sourceGameStatsId: { in: ids } } });
    const scheduled = await tx.scheduledMatch.findMany({ where: { OR: [{ linkedSessionKey: { in: keys } }, { replayClaims: { some: { gameStatsId: { in: ids } } } }] }, select: { id: true, _count: { select: { settlements: true } } } });
    const trophies = await tx.trophyChallenge.count({ where: { OR: [{ replayId: { in: ids } }, { scheduledMatchId: { in: scheduled.map(m => m.id) } }, { watcherSessionId: { in: keys } }] } });
    const desyncs = await tx.replayDesyncIncident.count({ where: { gameStatsId: { in: ids } } });
    if (desyncs) throw Error("Desync/review evidence cannot be a trusted native control.");
    const financialExposure = { markets: markets.length, wagers: markets.reduce((n, m) => n + m._count.wagers, 0), claims: claims + scheduled.length + trophies, settlements: markets.filter(m => m.settledAt || m.settlementRunId || (m.settlementStatus && m.settlementStatus !== "not_started")).length + scheduled.reduce((n, c) => n + c._count.settlements, 0) };
    if (Object.values(financialExposure).some(n => n !== 0)) throw Error("Financially linked replay requires commissioner review and cannot execute in this control lane.");
    const run = await tx.replayParseRun.findFirst({ where: { inputHash: source.replayHash, artifact: { sha256: source.replayHash }, candidateOnly: true, affectsPublicAggregates: false, ...HD_REPLAY_PARSER_CONTRACT, status: { in: ["completed", "recovered"] } }, orderBy: { id: "desc" } });
    if (!run) throw Error("Current parser contract has not completed this exact archive.");
    const path = await locateArchiveReplay(source.replayHash);
    if (await fs.realpath(path) !== path) throw Error("Native archive symlink rejected.");
    const metadata = await fs.lstat(path);
    if (!metadata.isFile() || metadata.size < 1 || metadata.size > NATIVE_REPLAY_MAX_BYTES) throw Error("Native archive size/type rejected.");
    const bytes = await fs.readFile(path);
    if (createHash("sha256").update(bytes).digest("hex") !== source.replayHash) throw Error("Native archive hash mismatch.");
    const snapshot = JSON.parse(JSON.stringify({ group, game, run }, (_, v) => typeof v === "bigint" ? String(v) : v));
    const accepted = source.replayResultAdjudications.find(a => a.affectsStats && !a.affectsBets);
    return sealNativeReplayManifest({
      schema: "aoe2war-native-replay-manifest/v2", gameStatsId, replaySha256: source.replayHash, logicalBattleId,
      sourceGameStatsIds: ids, sourceSnapshotSha256: nativeSnapshotDigest(snapshot),
      archive: { objectKey: `${source.replayHash}.aoe2record`, sha256: source.replayHash, byteSize: bytes.length }, roster,
      parser: { ...HD_REPLAY_PARSER_CONTRACT, status: run.status },
      result: { known: true, winningSlots: results.filter(p => p.result === "win").map(p => p.slot as number).sort((a, b) => a - b), provenance: accepted ? `acceptedadjudication:${accepted.id}` : `public_result:${String(game.parse_source ?? "historical").replace(/[^A-Za-z0-9_.:+-]/g, "_")}` },
      financialExposure, candidateOnly: true, authority: { stats: false, bets: false, settlement: false, wolo: false }, executionKind: "control",
    });
  }, { isolationLevel: "RepeatableRead", timeout: 30000 });
}

export async function loadNativeReplayArtifact(
  value: unknown
): Promise<{
  bytes: Buffer;
  fileName: string;
  sha256: string;
  byteSize: number;
}> {
  const parameters = parseNativeReplayRunParameters(value);
  if (parameters.manifest) {
    const current = await buildNativeControlManifest(parameters.gameStatsId);
    if (current.manifestSha256 !== parameters.manifest.manifestSha256) throw Error("Native source snapshot, roster, result or financial exposure moved after queueing.");
  }
  const game = await getPrisma().gameStats.findUnique({
    where: { id: parameters.gameStatsId },
    select: {
      id: true,
      replayHash: true,
      is_final: true,
    },
  });
  if (!game || !game.is_final) {
    throw new Error("Native replay source is no longer an existing final battle.");
  }
  const currentHash = String(game.replayHash || "").trim().toLowerCase();
  if (currentHash !== parameters.replaySha256) {
    throw new Error("Replay identity moved after the native-run request was queued.");
  }

  const source = await locateArchiveReplay(parameters.replaySha256);
  const archiveRoot = (await fs.realpath(resolve(ARCHIVE_ROOT))) + "/";
  const realSource = await fs.realpath(source);
  if (!realSource.startsWith(archiveRoot)) {
    throw new Error("Replay archive object escaped the canonical archive root.");
  }
  const metadata = await fs.lstat(realSource);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("Replay archive object must be one regular file.");
  }
  if (metadata.size < 1 || metadata.size > NATIVE_REPLAY_MAX_BYTES) {
    throw new Error("Replay archive object is outside the native-worker byte bound.");
  }

  const bytes = await fs.readFile(realSource);
  const observed = createHash("sha256").update(bytes).digest("hex");
  if (observed !== parameters.replaySha256) {
    throw new Error("Replay archive object failed its content-addressed SHA-256 check.");
  }

  return {
    bytes,
    fileName: `${parameters.replaySha256}${extname(realSource).toLowerCase()}`,
    sha256: observed,
    byteSize: bytes.length,
  };
}

export function nativeReplayArchiveRoot() {
  return ARCHIVE_ROOT;
}

export function nativeReplayArtifactRelativePath(filePath: string) {
  return relative(ARCHIVE_ROOT, filePath);
}
