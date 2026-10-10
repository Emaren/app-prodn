import { promises as fs } from "node:fs";
import path from "node:path";
import { streamChunkDir } from "./streamStorage";

const MAX_INSPECTED_CHUNKS = 5_000;
const MAX_STREAM_PROBES = 16;
const CACHE_MS = 60_000;

export type VideoMediaInventory = {
  streamId: number;
  state: "sequence_complete" | "missing_media" | "empty_media" |
    "gapped_media" | "unreadable_media" | "scan_limited" | "not_inspected";
  actualChunks: number | null;
  actualBytes: number | null;
  firstSequence: number | null;
  lastSequence: number | null;
  missingSequenceCount: number | null;
  expectedChunks: number;
  expectedLastSequence: number;
  /** Filesystem sequence audit, NOT certified browser decode or full-length gameplay. */
  playbackProven: false;
};

type ExpectedStream = { id: number; chunkCount: number; latestChunkSeq: number };
type CacheValue = { checkedAt: number; expectedChunks: number;
  expectedLastSequence: number; result: VideoMediaInventory };
const cache = new Map<number, CacheValue>();

function limited(id: number, expected: ExpectedStream, state: VideoMediaInventory["state"]): VideoMediaInventory {
  return {
    streamId: id, state, actualChunks: null, actualBytes: null,
    firstSequence: null, lastSequence: null, missingSequenceCount: null,
    expectedChunks: expected.chunkCount, expectedLastSequence: expected.latestChunkSeq,
    playbackProven: false,
  };
}

function validExpected(input: ExpectedStream): boolean {
  return Number.isSafeInteger(input.id) && input.id > 0 &&
    Number.isSafeInteger(input.chunkCount) && input.chunkCount >= 0 &&
    Number.isSafeInteger(input.latestChunkSeq) && input.latestChunkSeq >= -1;
}

/**
 * Bounded, read-only physical media audit. No WebM bytes are loaded; only file
 * names and filesystem metadata are examined. Never treat sequence continuity
 * as a decoded picture, a complete game, or permission to retain/delete data.
 */
export async function inspectOneVideoStream(expected: ExpectedStream): Promise<VideoMediaInventory> {
  if (!validExpected(expected)) {
    return limited(expected.id, expected, "unreadable_media");
  }
  const dir = streamChunkDir(expected.id);
  let entries: Awaited<ReturnType<typeof fs.readdir>>;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true }) as unknown as typeof entries;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...limited(expected.id, expected, "missing_media"), actualChunks: 0, actualBytes: 0 };
    }
    return limited(expected.id, expected, "unreadable_media");
  }
  const files = entries.filter(entry => entry.isFile() && /^(0|[1-9]\d*)\.webm$/.test(entry.name))
    .map(entry => ({ name: entry.name, sequence: Number(entry.name.slice(0, -5)) }))
    .filter(file => Number.isSafeInteger(file.sequence) && file.sequence <= 2_000_000)
    .sort((a, b) => a.sequence - b.sequence);
  if (files.length === 0) {
    return { ...limited(expected.id, expected, "empty_media"), actualChunks: 0, actualBytes: 0 };
  }
  if (files.length > MAX_INSPECTED_CHUNKS) {
    return limited(expected.id, expected, "scan_limited");
  }
  let bytes = 0;
  try {
    for (let i = 0; i < files.length; i += 64) {
      const group = files.slice(i, i + 64);
      const stats = await Promise.all(group.map(file => fs.stat(path.join(dir, file.name))));
      for (const stat of stats) {
        if (!stat.isFile() || stat.size <= 0 || !Number.isSafeInteger(stat.size)) {
          return limited(expected.id, expected, "unreadable_media");
        }
        bytes += stat.size;
        if (!Number.isSafeInteger(bytes)) return limited(expected.id, expected, "unreadable_media");
      }
    }
  } catch {
    return limited(expected.id, expected, "unreadable_media");
  }
  let gaps = files[0].sequence;
  for (let i = 1; i < files.length; i++) {
    gaps += files[i].sequence - files[i - 1].sequence - 1;
  }
  const last = files[files.length - 1].sequence;
  const complete = gaps === 0 && expected.chunkCount === files.length &&
    expected.latestChunkSeq === last;
  return {
    streamId: expected.id,
    state: complete ? "sequence_complete" : "gapped_media",
    actualChunks: files.length, actualBytes: bytes,
    firstSequence: files[0].sequence, lastSequence: last,
    missingSequenceCount: gaps,
    expectedChunks: expected.chunkCount,
    expectedLastSequence: expected.latestChunkSeq,
    playbackProven: false,
  };
}

/** Max sixteen streams across two cohorts, at most two concurrent stat scans. */
export async function inspectTelevisionMediaInventory(
  streams: ExpectedStream[],
): Promise<{inspected: VideoMediaInventory[]; scanned: number; omitted: number; completeSequences: number; allPlaybackProven: false}> {
  const unique = [...new Map(streams.filter(validExpected).map(s => [s.id, s])).values()];
  const bounded = unique.slice(0, MAX_STREAM_PROBES);
  const inspected: VideoMediaInventory[] = [];
  const now = Date.now();
  for (let i = 0; i < bounded.length; i += 2) {
    const group = bounded.slice(i, i + 2);
    const results = await Promise.all(group.map(async expected => {
      const hit = cache.get(expected.id);
      if (hit && now - hit.checkedAt < CACHE_MS &&
        hit.expectedChunks === expected.chunkCount &&
        hit.expectedLastSequence === expected.latestChunkSeq) return hit.result;
      const result = await inspectOneVideoStream(expected);
      cache.set(expected.id, {
        checkedAt: now, expectedChunks: expected.chunkCount,
        expectedLastSequence: expected.latestChunkSeq, result,
      });
      return result;
    }));
    inspected.push(...results);
  }
  if (cache.size > 128) {
    for (const [id, value] of cache) if (now - value.checkedAt >= CACHE_MS) cache.delete(id);
    if (cache.size > 128) cache.clear();
  }
  return {
    inspected,
    scanned: inspected.length,
    omitted: unique.length - inspected.length,
    completeSequences: inspected.filter(row => row.state === "sequence_complete").length,
    allPlaybackProven: false,
  };
}
