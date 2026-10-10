/**
 * Operator planning estimates only. This cannot certify actual recorder
 * bitrate, frame cadence, full-game duration or concurrency performance.
 */
export const TV_PLANNING_BITRATE_BITS_PER_SECOND = 1_400_000;
export const TV_PLANNING_SAFETY_FACTOR = 1.15;
export const TV_PLANNING_MATCH_MINUTES = 120;

export function videoCapacityForecast(input: {
  perStreamLimitBytes:number;
  writableVolumeBytes:number|null;
  cameraCount?:number;
  targetMinutes?:number;
}) {
  const cameras = Math.max(1,Math.min(16, Math.trunc(input.cameraCount ?? 2)));
  const minutes = Math.max(15,Math.min(240, Math.trunc(input.targetMinutes ?? TV_PLANNING_MATCH_MINUTES)));
  const estimatedPerCameraBytes = Math.ceil(
    TV_PLANNING_BITRATE_BITS_PER_SECOND / 8 *
    minutes * 60 * TV_PLANNING_SAFETY_FACTOR
  );
  const estimatedTotalBytes = estimatedPerCameraBytes * cameras;
  const allowedCap = Number.isSafeInteger(input.perStreamLimitBytes) &&
    input.perStreamLimitBytes > 0 ? input.perStreamLimitBytes : 0;
  const maxPerCameraMinutes = allowedCap > 0
    ? Math.floor(allowedCap * 8 /
      (TV_PLANNING_BITRATE_BITS_PER_SECOND * TV_PLANNING_SAFETY_FACTOR * 60))
    : 0;
  const volumeKnown = input.writableVolumeBytes !== null &&
    Number.isSafeInteger(input.writableVolumeBytes) &&
    input.writableVolumeBytes >= 0;
  const enoughVolume = volumeKnown &&
    (input.writableVolumeBytes as number) >= estimatedTotalBytes;
  const enoughPerStream = allowedCap >= estimatedPerCameraBytes;
  return {
    cameras, minutes, planningBitrateMbps:TV_PLANNING_BITRATE_BITS_PER_SECOND/1_000_000,
    estimatedPerCameraBytes,estimatedTotalBytes,maxPerCameraMinutes,
    volumeKnown, enoughVolume, enoughPerStream,
    readyToPlan:enoughVolume && enoughPerStream,
    // "readyToPlan" never means a live media session has been canaried.
    warning:!volumeKnown ? "Storage headroom cannot be verified."
      : !enoughPerStream ? "Per-camera video cap will likely interrupt a long match."
      : !enoughVolume ? "Available video-volume budget cannot support this estimated cohort."
      : "Capacity estimate meets the target; live performance is still unverified.",
  };
}
