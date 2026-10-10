import { promises as fs, type Dirent } from "node:fs";
import path from "node:path";
import { streamChunkDir } from "./streamStorage.ts";

const MAX_INSPECTED_CHUNKS = 5_000;
const MAX_LISTED_CHUNKS = 20_000;
const MAX_STREAM_PROBES = 16;
const CACHE_MS = 60_000;
const WEBM_EBML_HEADER = [0x1a, 0x45, 0xdf, 0xa3] as const;

export type VideoMediaInventory = {
  streamId: number;
  state: "sequence_complete" | "missing_media" | "empty_media" |
    "gapped_media" | "invalid_webm_header" | "sequence_sampled" |
    "unreadable_media" | "scan_limited" | "not_inspected";
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

/** Pure sequence/registry correspondence, safe to test with 12,000 virtual chunks. */
export function evaluateVideoSequenceEvidence(
  sortedSequences: number[], expectedChunks: number, expectedLastSequence: number,
) {
  if (!sortedSequences.length) {
    return {gaps:0,last:-1,complete:false};
  }
  let gaps = sortedSequences[0];
  for (let i = 1; i < sortedSequences.length; i++) {
    gaps += sortedSequences[i] - sortedSequences[i - 1] - 1;
  }
  const last = sortedSequences[sortedSequences.length - 1];
  return {
    gaps,last,
    complete: gaps === 0 && sortedSequences.length > 1 &&
      expectedChunks === sortedSequences.length && expectedLastSequence === last,
  };
}

/**
 * Bounded, read-only physical media audit. Only the 4-byte WebM initialization
 * prefix is sampled; other media payloads remain unread. Never treat sequence continuity
 * as a decoded picture, a complete game, or permission to retain/delete data.
 */
export async function inspectOneVideoStream(expected: ExpectedStream): Promise<VideoMediaInventory> {
  if (!validExpected(expected)) {
    return limited(expected.id, expected, "unreadable_media");
  }
  const dir = streamChunkDir(expected.id);
  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
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
  if (files.length > MAX_LISTED_CHUNKS) {
    return limited(expected.id, expected, "scan_limited");
  }
  const sampled = files.length > MAX_INSPECTED_CHUNKS;
  let bytes = 0;
  try {
    if (sampled) {
      // A two-hour 1-second WebM recording has ~7,200 files. Check all
      // names/sequence gaps but stat only the endpoints, not 7,200 files
      // on every operator poll. Byte totals deliberately remain unknown.
      const endpoints = await Promise.all([
        fs.stat(path.join(dir, files[0].name)),
        fs.stat(path.join(dir, files[files.length - 1].name)),
      ]);
      if (endpoints.some(stat => !stat.isFile() || stat.size <= 0)) {
        return limited(expected.id, expected, "unreadable_media");
      }
    } else {
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
    }
  } catch {
    return limited(expected.id, expected, "unreadable_media");
  }
  const sequenceEvidence = evaluateVideoSequenceEvidence(
    files.map(file => file.sequence),expected.chunkCount,expected.latestChunkSeq
  );
  const {gaps,last,complete} = sequenceEvidence;
  let initMagicOk = false;
  if (complete) {
    try {
      const handle = await fs.open(path.join(dir, "0.webm"), "r");
      try {
        const prefix = Buffer.alloc(WEBM_EBML_HEADER.length);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        initMagicOk = bytesRead === WEBM_EBML_HEADER.length &&
          WEBM_EBML_HEADER.every((value, i) => prefix[i] === value);
      } finally {
        await handle.close();
      }
    } catch {
      return limited(expected.id, expected, "unreadable_media");
    }
  }
  return {
    streamId: expected.id,
    state: !complete ? "gapped_media" :
      !initMagicOk ? "invalid_webm_header" :
      sampled ? "sequence_sampled" : "sequence_complete",
    actualChunks: files.length, actualBytes: sampled ? null : bytes,
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
