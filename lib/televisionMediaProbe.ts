import { promises as fs } from "node:fs";
import { streamChunkPath } from "./streamStorage";

export type TelevisionMediaProbeStatus =
  | "samples_present"
  | "missing_samples"
  | "invalid_webm_header"
  | "probe_error"
  | "invalid_metadata";

export type TelevisionMediaProbe = {
  streamId: number;
  status: TelevisionMediaProbeStatus;
  initPresent: boolean;
  tailPresent: boolean;
  note: string;
};

async function hasNonemptyFile(filePath: string) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * BOUNDED read-only sample: two stat calls + at most four bytes of initial
 * WebM data. Does not enumerate chunks, read arbitrary replay bytes, validate
 * continuity, decode media, or certify a playable recording.
 */
export async function probeTelevisionMediaSamples(
  streamId: number,
  latestSequence: number,
): Promise<TelevisionMediaProbe> {
  if (!Number.isSafeInteger(streamId) || streamId <= 0 ||
      !Number.isSafeInteger(latestSequence) || latestSequence < 0 ||
      latestSequence > 2_000_000) {
    return {
      streamId, status:"invalid_metadata", initPresent:false,
      tailPresent:false, note:"Invalid segment metadata; no footage verified.",
    };
  }
  try {
    const initialPath = streamChunkPath(streamId, 0);
    const latestPath = streamChunkPath(streamId, latestSequence);
    const initPresent = await hasNonemptyFile(initialPath);
    const tailPresent = latestSequence === 0
      ? initPresent : await hasNonemptyFile(latestPath);
    if (!initPresent || !tailPresent) {
      return {
        streamId, status:"missing_samples", initPresent, tailPresent,
        note:"One or both sampled chunks are missing from disk; video may have expired.",
      };
    }
    const handle = await fs.open(initialPath, "r");
    let isWebm = false;
    try {
      const prefix = Buffer.allocUnsafe(4);
      const read = await handle.read(prefix, 0, 4, 0);
      isWebm = read.bytesRead === 4 &&
        prefix[0] === 0x1a && prefix[1] === 0x45 &&
        prefix[2] === 0xdf && prefix[3] === 0xa3;
    } finally {
      await handle.close();
    }
    return isWebm ? {
      streamId, status:"samples_present", initPresent:true, tailPresent:true,
      note:"Start and latest segments exist; first bytes match WebM EBML. Full continuity/playback unverified.",
    } : {
      streamId, status:"invalid_webm_header", initPresent:true, tailPresent:true,
      note:"Initial segment lacks WebM EBML header; video playback is not certified.",
    };
  } catch {
    return {
      streamId, status:"probe_error", initPresent:false, tailPresent:false,
      note:"Media location could not be safely inspected; presence unknown.",
    };
  }
}
