import "server-only";

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

import { getPrisma } from "@/lib/prisma";
import { normalizeReplayPlayers } from "@/lib/teamResolution";

export const NATIVE_REPLAY_CONFIRMATION = "RUN NATIVE REPLAY";
export const NATIVE_REPLAY_MAX_BYTES = 64 * 1024 * 1024;
export const NATIVE_REPLAY_DEFAULT_PERFORMANCE_SECONDS = 240;
export const NATIVE_REPLAY_MAX_PERFORMANCE_SECONDS = 240;
export const NATIVE_REPLAY_DEFAULT_WALL_SECONDS = 300;
export const NATIVE_REPLAY_MAX_WALL_SECONDS = 300;

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

  const gameStatsId = boundedPositiveInteger(
    source.gameStatsId,
    "gameStatsId",
    Number.MAX_SAFE_INTEGER
  );
  const replaySha256 =
    typeof source.replaySha256 === "string"
      ? source.replaySha256.trim().toLowerCase()
      : "";
  if (!SHA256_RE.test(replaySha256)) {
    throw new Error("replaySha256 must be a complete lowercase SHA-256 digest.");
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
    rosterSlots.length < 2 ||
    rosterSlots.length > 8 ||
    rosterSlots.some(
      (slot) => !Number.isSafeInteger(slot) || slot < 1 || slot > 8
    )
  ) {
    throw new Error("rosterSlots must contain 2-8 unique AoE2 player slots from 1 through 8.");
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
  const game = await getPrisma().gameStats.findUnique({
    where: { id: gameStatsId },
    select: {
      id: true,
      replayHash: true,
      is_final: true,
      players: true,
      replay_file: true,
      original_filename: true,
    },
  });
  if (!game || !game.is_final) {
    throw new Error("Native replay worker requires an existing final GameStats row.");
  }

  const replaySha256 = String(game.replayHash || "").trim().toLowerCase();
  if (!SHA256_RE.test(replaySha256)) {
    throw new Error("The selected battle has no canonical replay SHA-256.");
  }

  const sourceName = game.original_filename || game.replay_file || "";
  if (extname(sourceName).toLowerCase() !== ".aoe2record") {
    throw new Error(
      "Native HD playthrough accepts recorded .aoe2record battles only; saved checkpoints and legacy containers remain in their separate evidence lanes."
    );
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

async function locateArchiveReplay(
  replaySha256: string,
  preferredFilename: string | null
) {
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

  const candidates = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.isSymbolicLink() &&
        entry.name.startsWith(`${replaySha256}.`) &&
        SAFE_REPLAY_EXTENSIONS.has(extname(entry.name).toLowerCase())
    )
    .map((entry) => join(directory, entry.name));

  if (!candidates.length) {
    throw new Error("The canonical replay bytes are not present in the archive.");
  }

  const preferredExtension = preferredFilename
    ? extname(preferredFilename).toLowerCase()
    : "";
  if (preferredExtension) {
    const preferred = candidates.filter(
      (candidate) => extname(candidate).toLowerCase() === preferredExtension
    );
    if (preferred.length === 1) return preferred[0];
  }
  if (candidates.length === 1) return candidates[0];
  throw new Error("Multiple canonical archive objects match this replay hash.");
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
  const game = await getPrisma().gameStats.findUnique({
    where: { id: parameters.gameStatsId },
    select: {
      id: true,
      replayHash: true,
      replay_file: true,
      original_filename: true,
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

  const source = await locateArchiveReplay(
    parameters.replaySha256,
    game.original_filename || game.replay_file || null
  );
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
