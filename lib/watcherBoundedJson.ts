// Bound the actual bytes of diagnostics before JSON parsing.
// Content-Length can be absent with chunked HTTP requests.
export type WatcherJsonRead =
  | { kind: "ok"; payload: unknown }
  | { kind: "invalid" }
  | { kind: "too_large" };

export async function readBoundedWatcherJson(
  request: Request,
  maxBytes = 65536,
): Promise<WatcherJsonRead> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new RangeError("Invalid telemetry body limit");
  }
  if (!request.body) return { kind: "invalid" };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const chunk = item.value;
      if (!(chunk instanceof Uint8Array)) return { kind: "invalid" };
      if (chunk.byteLength > maxBytes - size) {
        void reader.cancel().catch(() => {});
        return { kind: "too_large" };
      }
      chunks.push(chunk);
      size += chunk.byteLength;
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    try {
      return { kind: "ok", payload: JSON.parse(new TextDecoder("utf-8").decode(data)) };
    } catch {
      return { kind: "invalid" };
    }
  } catch {
    return { kind: "invalid" };
  } finally {
    reader.releaseLock();
  }
}
