/**
 * Small, side-effect-free wire contract shared by native Watcher and browser
 * video upload routes. Absence of Content-Length is legal for chunked HTTP.
 * Sequence identity must be explicit, unambiguous, canonical base-10.
 */
export function parseStreamChunkSequence(
  queryValue: string | null,
  headerValue: string | null,
): number | null {
  if (queryValue === null && headerValue === null) return null;
  if (queryValue !== null && headerValue !== null && queryValue !== headerValue) return null;
  const raw = queryValue ?? headerValue;
  if (raw === null || !/^(0|[1-9]\d*)$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 2_000_000
    ? parsed
    : null;
}

/**
 * Null means transfer without declared length: the body is still bounded
 * after reading. Explicit zero/malformed/oversized declared length fails.
 */
export function isAdmissibleStreamChunkContentLength(
  headerValue: string | null,
  maximumBytes: number,
) {
  if (headerValue === null) return true;
  if (!/^[1-9]\d*$/.test(headerValue)) return false;
  const parsed = Number(headerValue);
  return Number.isSafeInteger(parsed) && parsed > 0 &&
    Number.isSafeInteger(maximumBytes) && maximumBytes > 0 &&
    parsed <= maximumBytes;
}
