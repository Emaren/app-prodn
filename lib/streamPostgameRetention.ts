/**
 * Television WOLO postgame media floor.
 *
 * At least 15 minutes after the stream ends are available for spectators
 * to inspect the final footage. This is a minimum, not the archive TTL.
 * Retained-demo records can extend it. Ordinary pruning and admin deletion
 * must not bypass it.
 */
export const MIN_POSTGAME_MEDIA_MS = 15 * 60 * 1000;

export function effectiveStreamRetentionMs(configuredMs: number, fallbackMs: number) {
  if (!Number.isFinite(configuredMs) || configuredMs <= 0) {
    return Math.max(MIN_POSTGAME_MEDIA_MS, fallbackMs);
  }
  return Math.max(MIN_POSTGAME_MEDIA_MS, configuredMs);
}

export function postgameMediaProtected(
  endedAt: Date | null | undefined,
  now = new Date(),
) {
  // Missing or future completion time cannot prove the grace period passed.
  if (!(endedAt instanceof Date)) return true;
  const ended = endedAt.getTime();
  const present = now.getTime();
  if (!Number.isFinite(ended) || !Number.isFinite(present)) return true;
  return present - ended < MIN_POSTGAME_MEDIA_MS;
}
