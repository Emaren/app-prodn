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

export class StreamChunkBodyLimitError extends Error {
  constructor() {
    super("Stream chunk size is invalid.");
    this.name = "StreamChunkBodyLimitError";
  }
}

/**
 * Abort reading at the first byte past the hard limit. Unlike
 * Request.arrayBuffer(), this never materializes an arbitrarily large
 * transfer in the Next.js process. The caller maps the bounded failure
 * to the established terminal, video-only 413 contract.
 */
export async function readBoundedStreamChunkBody(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
): Promise<Uint8Array> {
  if (!body || !Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new StreamChunkBodyLimitError();
  }
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || bytes + value.byteLength > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new StreamChunkBodyLimitError();
      }
      bytes += value.byteLength;
      if (bytes > 0) parts.push(value);
    }
    if (bytes === 0) throw new StreamChunkBodyLimitError();
    const result = new Uint8Array(bytes);
    let offset = 0;
    for (const part of parts) {
      result.set(part, offset);
      offset += part.byteLength;
    }
    return result;
  } finally {
    reader.releaseLock();
  }
}
