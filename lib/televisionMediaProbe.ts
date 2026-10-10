import { promises as fs } from "node:fs";
import path from "node:path";
import { streamChunkDir } from "./streamStorage";

export type TelevisionMediaDiskStatus =
  | "candidate_bytes_present" | "missing_directory" | "missing_init"
  | "incomplete_sequences" | "invalid_init" | "unavailable";
export type TelevisionMediaDiskProbe = {
  streamId: number;
  status: TelevisionMediaDiskStatus;
  observedChunkCount: number | null;
  observedLatestSequence: number | null;
  expectedChunkCount: number;
  initBytes: number | null;
  lastChunkBytes: number | null;
  hasContinuousSequence: boolean | null;
  /** File names / raw bytes / local paths never leave the server. */
  playbackCertified: false;
};

const WEBM_EBML = [0x1a, 0x45, 0xdf, 0xa3] as const;
const MAX_ENTRIES_PER_CAMERA = 20_000;

export function evaluateTelevisionMediaPresence(args: {
  streamId: number;
  expectedCount: number;
  sequences: number[];
  initBytes: number | null;
  lastChunkBytes: number | null;
  initMagicValid: boolean | null;
}): TelevisionMediaDiskProbe {
  const { streamId, expectedCount, sequences, initBytes, lastChunkBytes, initMagicValid } = args;
  const ordered = [...new Set(sequences)].sort((a,b) => a-b);
  const last = ordered.at(-1) ?? null;
  const continuous = ordered.length > 0 && ordered[0] === 0 &&
    ordered.every((sequence, i) => sequence === i);
  const status: TelevisionMediaDiskStatus =
    !ordered.length ? "missing_directory" :
    ordered[0] !== 0 ? "missing_init" :
    initMagicValid === false ? "invalid_init" :
    !continuous || ordered.length < expectedCount ||
      (lastChunkBytes ?? 0) <= 0 || (initBytes ?? 0) <= 4 ||
      initMagicValid !== true || last === 0
        ? "incomplete_sequences"
        : "candidate_bytes_present";
  return {
    streamId, status, observedChunkCount: ordered.length,
    observedLatestSequence: last, expectedChunkCount: expectedCount,
    initBytes, lastChunkBytes, hasContinuousSequence: continuous,
    playbackCertified: false,
  };
}

/**
 * Admin-only read-only media inspection. One directory listing plus at most
 * two file stats and one 4-byte read: avoids reading whole WebM recordings,
 * avoids per-chunk stat() storms, and never touches retention or replay data.
 */
export async function inspectTelevisionMediaDisk(
  streamId: number, expectedCount: number,
): Promise<TelevisionMediaDiskProbe> {
  if (!Number.isSafeInteger(streamId) || streamId <= 0 ||
      !Number.isSafeInteger(expectedCount) || expectedCount < 0) {
    return unavailable(streamId, expectedCount);
  }
  let names: string[];
  const dir = streamChunkDir(streamId);
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    if (entries.length > MAX_ENTRIES_PER_CAMERA) return unavailable(streamId, expectedCount);
    names = entries.filter(e => e.isFile() && /^(0|[1-9]\d*)\.webm$/.test(e.name))
      .map(e=>e.name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return evaluateTelevisionMediaPresence({
        streamId,expectedCount,sequences:[],initBytes:null,
        lastChunkBytes:null,initMagicValid:null,
      });
    }
    return unavailable(streamId, expectedCount);
  }
  const sequences = names.map(name=>Number(name.slice(0,-5)))
    .filter(seq=>Number.isSafeInteger(seq) && seq>=0);
  const ordered = [...new Set(sequences)].sort((a,b)=>a-b);
  const latest = ordered.at(-1);
  const init = path.join(dir,"0.webm");
  const tail = latest === undefined ? null : path.join(dir,latest + ".webm");
  try {
    const [initialStat,tailStat] = await Promise.all([
      ordered.includes(0) ? fs.stat(init) : Promise.resolve(null),
      tail ? fs.stat(tail) : Promise.resolve(null),
    ]);
    let magicValid: boolean | null = null;
    if (initialStat && initialStat.size >= WEBM_EBML.length) {
      const handle=await fs.open(init,"r");
      try {
        const prefix=Buffer.alloc(WEBM_EBML.length);
        const result=await handle.read(prefix,0,prefix.length,0);
        magicValid=result.bytesRead===WEBM_EBML.length &&
          WEBM_EBML.every((byte,i)=>prefix[i]===byte);
      } finally {await handle.close()}
    } else if (initialStat) {
      magicValid=false;
    }
    return evaluateTelevisionMediaPresence({
      streamId,expectedCount,sequences,
      initBytes:initialStat?.size??null,lastChunkBytes:tailStat?.size??null,
      initMagicValid:magicValid,
    });
  } catch {
    // Concurrent cleanup, mount failure or permissions are unverified, never
    // interpreted as evidence that footage remains safely retained.
    return unavailable(streamId, expectedCount);
  }
}

function unavailable(streamId:number, expectedChunkCount:number): TelevisionMediaDiskProbe {
  return {
    streamId,status:"unavailable",observedChunkCount:null,
    observedLatestSequence:null,expectedChunkCount,
    initBytes:null,lastChunkBytes:null,hasContinuousSequence:null,
    playbackCertified:false,
  };
}
