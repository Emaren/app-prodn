/** Pure, page-local policy for the shared read-only Recovery progress sample. */
export const LIVE_RECOVERY_POLL_INTERVAL_MS = 5_000;
export const LIVE_RECOVERY_REQUEST_TIMEOUT_MS = 4_000;

export function shouldPollLiveRecovery(
  subscriberCount: number,
  visibilityState: string,
) {
  return subscriberCount > 0 && visibilityState === "visible";
}

export function isUsableLiveRecoveryPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.available !== "boolean") return false;
  if (!record.available) return true;

  // A truth-bearing live sample must identify when the server observed it.
  if (
    typeof record.sampledAt !== "string" ||
    !Number.isFinite(Date.parse(record.sampledAt))
  ) {
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
