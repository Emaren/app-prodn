/**
 * Fail-closed, byte-bounded body reader for default-off War Satchel proof
 * surfaces. Unlike Request.text()/Response.text(), this never buffers an
 * entire untrusted chunked body before enforcing the byte ceiling.
 *
 * No wallet, chain, database, custody, or payout capability is exposed.
 */
export async function readWarSatchelBoundedUtf8(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<string | null> {
  // Every caller supplies its own explicit byte limit. Most public requests
  // remain at 128–3072 bytes. The offline authenticated Comet proof bridge
  // legitimately needs up to 15 MiB; keep the universal hard cap at 16 MiB.
  if (!body || !Number.isSafeInteger(maxBytes) || maxBytes <= 0 || maxBytes > 16 * 1024 * 1024) {
    return null;
  }
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = body.getReader();
  } catch {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let reads = 0;
  let incomplete = true;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        incomplete = false;
        break;
      }
      // Bound both total bytes and an attacker-controlled stream of tiny chunks.
      reads += 1;
      if (!(value instanceof Uint8Array) || reads > 2048 || value.byteLength > maxBytes - bytes) {
        return null;
      }
      bytes += value.byteLength;
      chunks.push(value);
    }
    if (bytes === 0) return null;
    const merged = new Uint8Array(bytes);
    let at = 0;
    for (const part of chunks) {
      merged.set(part, at);
      at += part.byteLength;
    }
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(merged);
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    if (incomplete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
