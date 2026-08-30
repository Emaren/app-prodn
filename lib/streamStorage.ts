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

const DEFAULT_MAX_STREAM_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_STREAM_CHUNKS = 4_000;

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
  2 * 1024 * 1024 * 1024,
);

export const MAX_STREAM_CHUNKS = boundedPositiveInteger(
  process.env.AOE2_STREAM_MAX_CHUNKS,
  DEFAULT_MAX_STREAM_CHUNKS,
  16,
  20_000,
);

export class StreamChunkConflictError extends Error {
  constructor() {
    super("A different stream chunk already exists at this sequence.");
    this.name = "StreamChunkConflictError";
  }
}

export class StreamStorageLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StreamStorageLimitError";
  }
}

export type StreamStorageUsage = {
  chunkCount: number;
  totalBytes: number;
  latestSequence: number;
};

const streamWriteTails = new Map<string, Promise<void>>();

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
        usage: await getStreamStorageUsage(streamId),
      };
    }

    const usage = await getStreamStorageUsage(streamId);
    if (usage.chunkCount >= MAX_STREAM_CHUNKS) {
      throw new StreamStorageLimitError(
        `Stream reached the ${MAX_STREAM_CHUNKS}-chunk safety limit.`,
      );
    }
    if (usage.totalBytes + data.byteLength > MAX_STREAM_BYTES) {
      throw new StreamStorageLimitError(
        `Stream reached the ${MAX_STREAM_BYTES}-byte storage safety limit.`,
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
          usage: await getStreamStorageUsage(streamId),
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

    return {
      filePath,
      created: true,
      usage: {
        chunkCount: usage.chunkCount + 1,
        totalBytes: usage.totalBytes + data.byteLength,
        latestSequence: Math.max(usage.latestSequence, safeSeq),
      } satisfies StreamStorageUsage,
    };
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

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = /^(\d+)\.webm$/.exec(entry.name);
    if (!match) continue;
    const sequence = Number(match[1]);
    const stat = await fs.stat(path.join(dir, entry.name));
    totalBytes += stat.size;
    chunkCount += 1;
    latestSequence = Math.max(latestSequence, sequence);
  }

  return { chunkCount, totalBytes, latestSequence };
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
  await fs.rm(streamChunkDir(streamId), { recursive: true, force: true });
}
