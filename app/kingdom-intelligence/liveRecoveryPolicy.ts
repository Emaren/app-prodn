/** Pure, page-local policy for the shared read-only Recovery progress sample. */
export const LIVE_RECOVERY_POLL_INTERVAL_MS = 5_000;
export const LIVE_RECOVERY_REQUEST_TIMEOUT_MS = 4_000;
// This endpoint samples operator Recovery at response time. Accept a sample no
// older than three foreground polling cycles; allow up to one cycle of server/
// browser clock skew. Receipt time never replaces the source's sampledAt.
export const LIVE_RECOVERY_MAX_SAMPLE_AGE_MS = 3 * LIVE_RECOVERY_POLL_INTERVAL_MS;
export const LIVE_RECOVERY_FUTURE_SKEW_MS = LIVE_RECOVERY_POLL_INTERVAL_MS;

export function shouldPollLiveRecovery(
  subscriberCount: number,
  visibilityState: string,
) {
  return subscriberCount > 0 && visibilityState === "visible";
}

export function isUsableLiveRecoveryPayload(
  value: unknown,
  nowMs = Date.now(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.available !== "boolean") return false;
  // Unavailable/preview-denied responses do not claim a live observation.
  if (!record.available) return true;

  // A truth-bearing live sample must identify when the server observed it.
  if (typeof record.sampledAt !== "string" || !Number.isFinite(nowMs)) {
    return false;
  }
  const sampledMs = Date.parse(record.sampledAt);
  if (
    !Number.isFinite(sampledMs) ||
    nowMs - sampledMs > LIVE_RECOVERY_MAX_SAMPLE_AGE_MS ||
    sampledMs - nowMs > LIVE_RECOVERY_FUTURE_SKEW_MS
  ) {
    return false;
  }

  // Count fields are discrete and must not exceed JS's exact integer range.
  for (const field of ["completedClasses", "totalClasses", "sealedChunks"]) {
    const count = record[field];
    if (count !== undefined && count !== null &&
        (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0)) {
      return false;
    }
  }
  const completed = record.completedClasses;
  const total = record.totalClasses;
  if ((completed == null) !== (total == null)) return false;
  if (typeof completed === "number" && typeof total === "number" && completed > total) {
    return false;
  }

  const numericFields = [
    "completedClasses",
    "totalClasses",
    "sealedChunks",
    "observedBytes",
    "expectedBytes",
    "classPercent",
    "overallPercent",
    "elapsedSeconds",
    "etaSeconds",
    "throughputBytesPerSecond",
  ];

  for (const field of numericFields) {
    const entry = record[field];
    if (entry !== null && entry !== undefined) {
      if (typeof entry !== "number" || !Number.isFinite(entry) || entry < 0) {
        return false;
      }
    }
  }

  for (const field of ["classPercent", "overallPercent"]) {
    const entry = record[field];
    if (typeof entry === "number" && entry > 100) return false;
  }

  return true;
}

/** The API explicitly refuses non-preview callers; repeating those reads adds no value. */
export function isOperatorPreviewOnlyPayload(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).available === false &&
    (value as Record<string, unknown>).reason === "operator_preview_only"
  );
}
