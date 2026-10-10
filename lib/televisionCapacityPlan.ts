import { MAX_STREAM_BYTES, MAX_STREAM_CHUNKS, STREAM_MIN_FREE_BYTES } from "./streamStorage.ts";

const CHUNK_SECONDS = 1;
const VIDEO_OVERHEAD_FACTOR = 1.12;

/**
 * Pure operator planning math. Mode settings mirror the unreleased Watcher
 * v1.6.4 source at the reviewed checkpoint; they are NOT live telemetry.
 */
export const WATCHER_VIDEO_MODES = [
  { key: "stable", label: "Stable 720p · 15 fps", videoBitsPerSecond: 1_400_000 },
  { key: "screen", label: "Full Screen 720p · 18 fps", videoBitsPerSecond: 1_800_000 },
  { key: "sharp", label: "Sharp 720p · 24 fps", videoBitsPerSecond: 2_600_000 },
] as const;

export function estimateTelevisionRecordingBudget(
  byteLimit = MAX_STREAM_BYTES,
  chunkLimit = MAX_STREAM_CHUNKS,
) {
  if (!Number.isFinite(byteLimit) || byteLimit <= 0 ||
      !Number.isFinite(chunkLimit) || chunkLimit <= 0) {
    return { profiles: [], reserveBytes: STREAM_MIN_FREE_BYTES, configured: false };
  }
  return {
    configured: true,
    reserveBytes: STREAM_MIN_FREE_BYTES,
    perStreamByteLimit: byteLimit,
    perStreamChunkLimit: chunkLimit,
    chunkSeconds: CHUNK_SECONDS,
    overheadFactor: VIDEO_OVERHEAD_FACTOR,
    profiles: WATCHER_VIDEO_MODES.map(mode => {
      const byteLimitedSeconds = byteLimit * 8 /
        (mode.videoBitsPerSecond * VIDEO_OVERHEAD_FACTOR);
      const chunkLimitedSeconds = chunkLimit * CHUNK_SECONDS;
      const safeSeconds = Math.floor(Math.min(byteLimitedSeconds, chunkLimitedSeconds));
      return {
        ...mode,
        estimatedMinutes: Math.floor(safeSeconds / 60),
        limitingFactor: byteLimitedSeconds < chunkLimitedSeconds ? "bytes" : "chunks",
        estimatedBytesForTwoHours: Math.ceil(
          mode.videoBitsPerSecond * 7200 / 8 * VIDEO_OVERHEAD_FACTOR,
        ),
        twoHourCandidate: safeSeconds >= 7200,
      };
    }),
  };
}
