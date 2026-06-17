import { promises as fs } from "node:fs";
import path from "node:path";

// Long browser/native stream chunks must live outside the git repo.
// Production should use AOE2_VIDEO_CAPTURE_DIR=/mnt/HC_Volume_105319120/aoe2-video-captures.
// AOE2_STREAM_STORAGE_DIR remains supported for older deploys.
const STREAM_STORAGE_ROOT =
  process.env.AOE2_STREAM_STORAGE_DIR ||
  (process.env.AOE2_VIDEO_CAPTURE_DIR
    ? path.join(process.env.AOE2_VIDEO_CAPTURE_DIR, "live")
    : path.join(process.cwd(), "storage", "live-streams"));

function safeStreamId(streamId: number | string) {
  const value = String(streamId).replace(/[^0-9]/g, "");
  if (!value) {
    throw new Error("Invalid stream id.");
  }
  return value;
}

function safeSequence(sequence: number | string) {
  const value = Number(sequence);
  if (!Number.isInteger(value) || value < 0 || value > 2_000_000) {
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
  const dir = await ensureStreamChunkDir(streamId);
  const filePath = path.join(dir, `${safeSequence(sequence)}.webm`);
  try {
    await fs.writeFile(filePath, data);
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
  }
  return filePath;
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

export async function removeStreamChunks(streamId: number | string) {
  await fs.rm(streamChunkDir(streamId), { recursive: true, force: true });
}
