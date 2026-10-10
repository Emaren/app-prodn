import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Long browser/native stream chunks must live outside the git repo.
// Production should use AOE2_VIDEO_CAPTURE_DIR=/mnt/HC_Volume_105319120/aoe2-video-captures.
// AOE2_STREAM_STORAGE_DIR remains supported for older deploys.
const STREAM_STORAGE_ROOT =
  process.env.AOE2_STREAM_STORAGE_DIR ||
  (process.env.AOE2_VIDEO_CAPTURE_DIR
    ? path.join(process.env.AOE2_VIDEO_CAPTURE_DIR, "live")
    : path.join(process.cwd(), "storage", "live-streams"));

// 3 GiB protects a two-hour Sharp 720p / 24 fps capture at the current
// 2.6 Mbps encoder target with the planner's 12% overhead allowance.
// Admission still checks the real media filesystem's 6 GiB floor per chunk;
// a higher stream cap never reserves or guarantees volume capacity.
const DEFAULT_MAX_STREAM_BYTES = 3 * 1024 * 1024 * 1024;
const DEFAULT_MAX_STREAM_CHUNKS = 12_000;

function boundedPositiveInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export const MAX_STREAM_BYTES = boundedPositiveInteger(
  process.env.AOE2_STREAM_MAX_BYTES,
  DEFAULT_MAX_STREAM_BYTES,
  8 * 1024 * 1024,
  4 * 1024 * 1024 * 1024,
);

export const MAX_STREAM_CHUNKS = boundedPositiveInteger(
  process.env.AOE2_STREAM_MAX_CHUNKS,
  DEFAULT_MAX_STREAM_CHUNKS,
  16,
  20_000,
);

export const STREAM_MIN_FREE_BYTES = boundedPositiveInteger(
  process.env.AOE2_STREAM_MIN_FREE_BYTES,
  6 * 1024 * 1024 * 1024,
  1024 * 1024 * 1024,
  40 * 1024 * 1024 * 1024,
);

export function streamCapacityAdmission(
  availableBytes: number,
  incomingBytes: number,
  reserveBytes = STREAM_MIN_FREE_BYTES,
) {
  if (!Number.isSafeInteger(availableBytes) || availableBytes < 0 ||
      !Number.isSafeInteger(incomingBytes) || incomingBytes < 0 ||
      !Number.isSafeInteger(reserveBytes) || reserveBytes < 0) {
    return { allowed: false, reason: "capacity_unverified" as const };
  }
  return availableBytes - incomingBytes >= reserveBytes
    ? { allowed: true, reason: "sufficient_headroom" as const }
    : { allowed: false, reason: "volume_reserved_floor" as const };
}

/**
 * Observe the filesystem hosting actual video chunks, not the unrelated
 * process root filesystem when the videos are on a mounted media volume.
 * Failure to read free space is a video-only fail-closed condition.
 */
export async function getStreamVolumeHeadroom() {
  const [stats, captureDir, hostRoot] = await Promise.all([
    fs.statfs(STREAM_STORAGE_ROOT),
    fs.stat(STREAM_STORAGE_ROOT),
    fs.stat(path.parse(STREAM_STORAGE_ROOT).root || "/"),
  ]);
  // A directory on the server root is not an independent video volume.
  // This is an observation, not proof of total retention or free-space reservations.
  const mountedSeparately = captureDir.dev !== hostRoot.dev;
  const freeBytes = Number(stats.bavail) * Number(stats.bsize);
  if (!Number.isSafeInteger(freeBytes) || freeBytes < 0) {
    throw new StreamStorageLimitError("Video volume free space could not be verified.");
  }
  return {
    freeBytes,
    mountedSeparately,
    reserveBytes: STREAM_MIN_FREE_BYTES,
    writableVideoBytes: Math.max(0, freeBytes - STREAM_MIN_FREE_BYTES),
  };
}


export class StreamChunkConflictError extends Error {
  constructor() {
    super("A different stream chunk already exists at this sequence.");
    this.name = "StreamChunkConflictError";
  }
}

export type StreamCapacityDenialReason =
  | "stream_max_chunks"
  | "stream_max_bytes"
  | "volume_reserved_floor"
  | "capacity_unverified";

export class StreamStorageLimitError extends Error {
  readonly reason: StreamCapacityDenialReason;
  constructor(message: string, reason: StreamCapacityDenialReason = "capacity_unverified") {
    super(message);
    this.name = "StreamStorageLimitError";
    this.reason = reason;
  }
}

export type StreamStorageUsage = {
  chunkCount: number;
  totalBytes: number;
  latestSequence: number;
};

const streamWriteTails = new Map<string, Promise<void>>();

// The authoritative on-disk census is expensive for long matches. Cache only
// the latest VALIDATED per-stream usage, fenced by directory identity/mtime,
// and force a full reconciliation at least every five minutes. No sidecar
// files, database migration, or unbounded cache growth are introduced.
const WRITE_USAGE_RECONCILE_MS = 5 * 60 * 1000;
const MAX_WRITE_USAGE_CACHE_STREAMS = 128;
type CachedStreamWriteUsage = {
  usage: StreamStorageUsage;
  fingerprint: string;
  reconciledAt: number;
};
const streamWriteUsageCache = new Map<string, CachedStreamWriteUsage>();

async function streamDirectoryFingerprint(dir: string) {
  const stat = await fs.stat(dir, { bigint: true });
  return [stat.dev,stat.ino,stat.mtimeNs,stat.ctimeNs].join(":");
}
function rememberStreamWriteUsage(key:string, entry:CachedStreamWriteUsage) {
  streamWriteUsageCache.delete(key);
  streamWriteUsageCache.set(key,entry);
  while (streamWriteUsageCache.size > MAX_WRITE_USAGE_CACHE_STREAMS) {
    const oldest=streamWriteUsageCache.keys().next().value;
    if (oldest === undefined) break;
    streamWriteUsageCache.delete(oldest);
  }
}
async function usageBeforeStreamWrite(streamId:number|string, dir:string):Promise<StreamStorageUsage> {
  const key=safeStreamId(streamId);
  const fingerprint=await streamDirectoryFingerprint(dir);
  const cached=streamWriteUsageCache.get(key);
  const now=Date.now();
  if (cached && cached.fingerprint === fingerprint &&
      now - cached.reconciledAt < WRITE_USAGE_RECONCILE_MS) {
    return {...cached.usage};
  }
  // Another process, an admin action, an app restart, or our periodic
  // reconciliation must reconstruct the REAL filesystem accounting.
  let exact=await getStreamStorageUsage(streamId);
  const after=await streamDirectoryFingerprint(dir);
  if (fingerprint !== after) {
    exact=await getStreamStorageUsage(streamId);
    const resampled=await streamDirectoryFingerprint(dir);
    if (after !== resampled) {
      streamWriteUsageCache.delete(key);
      return exact; // Unstable directory: never cache inconsistent evidence.
    }
    rememberStreamWriteUsage(key,{usage:exact,fingerprint:resampled,reconciledAt:now});
  } else {
    rememberStreamWriteUsage(key,{usage:exact,fingerprint:after,reconciledAt:now});
  }
  return {...exact};
}
async function rememberSuccessfulStreamWrite(
  streamId:number|string, dir:string, usage:StreamStorageUsage,
) {
  const key=safeStreamId(streamId);
  try {
    const fingerprint=await streamDirectoryFingerprint(dir);
    const reconciledAt=streamWriteUsageCache.get(key)?.reconciledAt??Date.now();
    rememberStreamWriteUsage(key,{usage,fingerprint,reconciledAt});
  } catch {
    streamWriteUsageCache.delete(key);
  }
}


async function withStreamWriteLock<T>(streamId: number | string, operation: () => Promise<T>) {
  const key = safeStreamId(streamId);
  const prior = streamWriteTails.get(key) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = prior.then(() => current);
  streamWriteTails.set(key, tail);

  await prior;
  try {
    return await operation();
  } finally {
    release();
    if (streamWriteTails.get(key) === tail) streamWriteTails.delete(key);
  }
}

function safeStreamId(streamId: number | string) {
  const value = String(streamId);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("Invalid stream id.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("Invalid stream id.");
  }
  return value;
}

function safeSequence(sequence: number | string) {
  const raw = String(sequence);
  if (!/^(0|[1-9]\d*)$/.test(raw)) {
    throw new Error("Invalid stream chunk sequence.");
  }
  const value = Number(sequence);
  if (!Number.isSafeInteger(value) || value < 0 || value > 2_000_000) {
    throw new Error("Invalid stream chunk sequence.");
  }
  return value;
}

export function streamChunkDir(streamId: number | string) {
  return path.join(STREAM_STORAGE_ROOT, safeStreamId(streamId));
}

export function streamChunkPath(streamId: number | string, sequence: number | string) {
  return path.join(streamChunkDir(streamId), `${safeSequence(sequence)}.webm`);
}

export async function ensureStreamChunkDir(streamId: number | string) {
  // Be deliberately explicit: create the root first, then the stream dir.
  // This prevents per-stream mkdir from depending on an already-existing parent.
  await fs.mkdir(STREAM_STORAGE_ROOT, { recursive: true });
  const dir = streamChunkDir(streamId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeStreamChunk(
  streamId: number | string,
  sequence: number | string,
  data: Buffer
) {
  return withStreamWriteLock(streamId, async () => {
    const dir = await ensureStreamChunkDir(streamId);
    const safeSeq = safeSequence(sequence);
    const filePath = path.join(dir, `${safeSeq}.webm`);
    const existing = await fs.readFile(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });

    if (existing) {
      if (!existing.equals(data)) throw new StreamChunkConflictError();
      return {
        filePath,
        created: false,
        usage: await usageBeforeStreamWrite(streamId, dir),
      };
    }

    const usage = await usageBeforeStreamWrite(streamId, dir);
    if (usage.chunkCount >= MAX_STREAM_CHUNKS) {
      throw new StreamStorageLimitError(
        `Stream reached the ${MAX_STREAM_CHUNKS}-chunk safety limit.`,
        "stream_max_chunks",
      );
    }
    if (usage.totalBytes + data.byteLength > MAX_STREAM_BYTES) {
      throw new StreamStorageLimitError(
        `Stream reached the ${MAX_STREAM_BYTES}-byte storage safety limit.`,
        "stream_max_bytes",
      );
    }

    let freeBytes: number;
    try {
      freeBytes = (await getStreamVolumeHeadroom()).freeBytes;
    } catch (error) {
      if (error instanceof StreamStorageLimitError) throw error;
      throw new StreamStorageLimitError("Video storage capacity could not be verified.");
    }
    const capacity = streamCapacityAdmission(freeBytes, data.byteLength);
    if (!capacity.allowed) {
      throw new StreamStorageLimitError(
        "Video paused to preserve the mounted filesystem free-space reserve.",
        "volume_reserved_floor",
      );
    }

    const temporaryPath = path.join(dir, `.${safeSeq}.${randomUUID()}.upload`);
    try {
      const handle = await fs.open(temporaryPath, "wx", 0o600);
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }

      try {
        await fs.link(temporaryPath, filePath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST") throw error;
        const raced = await fs.readFile(filePath);
        if (!raced.equals(data)) throw new StreamChunkConflictError();
        return {
          filePath,
          created: false,
          usage: await usageBeforeStreamWrite(streamId, dir),
        };
      }
    } catch (error) {
      console.error("[streams] failed to write chunk", {
        streamId: String(streamId),
        sequence: String(sequence),
        root: STREAM_STORAGE_ROOT,
        dir,
        filePath,
        error,
      });
      throw error;
    } finally {
      await fs.unlink(temporaryPath).catch(() => undefined);
    }

    const updatedUsage = {
      chunkCount: usage.chunkCount + 1,
      totalBytes: usage.totalBytes + data.byteLength,
      latestSequence: Math.max(usage.latestSequence, safeSeq),
    } satisfies StreamStorageUsage;
    // This runs after the temporary upload link has been unlinked. The
    // directory fingerprint reflects the final authoritative chunk set.
    await rememberSuccessfulStreamWrite(streamId, dir, updatedUsage);
    return {filePath,created:true,usage:updatedUsage};
  });
}

export async function readStreamChunk(streamId: number | string, sequence: number | string) {
  return fs.readFile(streamChunkPath(streamId, sequence));
}

export async function listStreamChunkSequences(streamId: number | string, limit = 80) {
  const dir = streamChunkDir(streamId);
  const entries = await fs.readdir(dir).catch(() => []);
  return entries
    .map((entry) => {
      const match = /^(\d+)\.webm$/.exec(entry);
      return match ? Number(match[1]) : null;
    })
    .filter((sequence): sequence is number => sequence !== null && Number.isInteger(sequence) && sequence >= 0)
    .sort((left, right) => left - right)
    .slice(-Math.max(1, limit));
}

export async function getStreamStorageUsage(
  streamId: number | string,
): Promise<StreamStorageUsage> {
  const dir = streamChunkDir(streamId);
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  let totalBytes = 0;
  let chunkCount = 0;
  let latestSequence = -1;
  const filenames = entries.filter(entry => entry.isFile())
    .map(entry => {
      const match = /^(\d+)\.webm$/.exec(entry.name);
      if (!match) return null;
      const sequence = Number(match[1]);
      return Number.isSafeInteger(sequence) && sequence >= 0
        ? {name:entry.name,sequence} : null;
    })
    .filter((entry): entry is {name:string;sequence:number} => entry !== null);

  // Exact reconciliation remains necessary after restart/foreign writes.
  // Batch independent stat calls instead of 12,000 serial I/O roundtrips.
  for (let i=0;i<filenames.length;i+=64) {
    const group=filenames.slice(i,i+64);
    const stats=await Promise.all(group.map(entry=>fs.stat(path.join(dir,entry.name))));
    for (let j=0;j<group.length;j++) {
      if (!stats[j].isFile() || !Number.isSafeInteger(stats[j].size) || stats[j].size < 0) {
        throw new Error("Stream storage accounting encountered invalid media bytes.");
      }
      totalBytes+=stats[j].size;
      if (!Number.isSafeInteger(totalBytes)) throw new Error("Stream storage accounting overflow.");
      chunkCount+=1;
      latestSequence=Math.max(latestSequence,group[j].sequence);
    }
  }
  return {chunkCount,totalBytes,latestSequence};
}

export async function readStreamChunksBounded(
  streamId: number | string,
  sequences: number[],
  maxBytes: number,
) {
  const safeMaxBytes = boundedPositiveInteger(
    String(maxBytes),
    32 * 1024 * 1024,
    1,
    128 * 1024 * 1024,
  );
  const paths = sequences.map((sequence) => streamChunkPath(streamId, sequence));
  const stats = await Promise.all(paths.map((filePath) => fs.stat(filePath)));
  const totalBytes = stats.reduce((total, stat) => total + stat.size, 0);
  if (totalBytes > safeMaxBytes) {
    throw new StreamStorageLimitError(
      `Requested stream window exceeds the ${safeMaxBytes}-byte response limit.`,
    );
  }
  const chunks = await Promise.all(paths.map((filePath) => fs.readFile(filePath)));
  return { chunks, totalBytes };
}

export async function removeStreamChunks(streamId: number | string) {
  const key=safeStreamId(streamId);
  streamWriteUsageCache.delete(key);
  await fs.rm(streamChunkDir(streamId), { recursive: true, force: true });
}
