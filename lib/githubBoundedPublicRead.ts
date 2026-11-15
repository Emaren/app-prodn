/**
 * Bounded, allowlisted, browser-origin public GitHub reads for the
 * authenticated PRODUCT command room. Does not use server/network privileges.
 * No scheduler, GitHub write scope, arbitrary URL, or financial authority.
 *
 * Positive public evidence is cached per browser tab for five minutes and
 * errors only for ten seconds. Callers retain the actual observedAt timestamp,
 * never pretend that retrieving a cached value constitutes a fresh request.
 *
 * This is resource backpressure, NOT proof of live agent or deployment status.
 */
export type GithubReadReceipt = { data: unknown; observedAt: string };

export const GITHUB_POSITIVE_CACHE_MS = 5 * 60_000;
export const GITHUB_ERROR_CACHE_MS = 10_000;

const ROOT = "https://api.github.com/repos/Emaren/app-prodn/";
const ALLOWED_PATHS = new Set([
  "branches/" + encodeURIComponent("session-c/next-renaissance-website-20261114"),
  "branches/" + encodeURIComponent("session-c/we3-website-observatory-20261115"),
  "pulls/1362", "pulls/1363", "pulls/1364",
]);

type CacheEntry = {
  fetcher: typeof fetch;
  expiresAt: number;
  result: Promise<GithubReadReceipt | null>;
};

const evidenceCache = new Map<string, CacheEntry>();

async function decodeJsonWithCeiling(response: Response, maximumBytes: number): Promise<unknown> {
  const header = response.headers.get("content-length");
  if (header !== null && (!/^\d+$/.test(header) || Number(header) > maximumBytes))
    throw new Error("declared GitHub response too large");
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")
    && !contentType.startsWith("application/vnd.github+json"))
    throw new Error("unexpected GitHub response type");
  if (!response.body) throw new Error("empty GitHub response");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("streamed GitHub response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const payload = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload)) as unknown;
}

export async function readBoundedGithubPublic(
  path: string,
  maximumBytes: 40_000 | 250_000,
): Promise<GithubReadReceipt | null> {
  if (!ALLOWED_PATHS.has(path)) return null;

  const fetcher = globalThis.fetch;
  const key = path + "|" + maximumBytes;
  const current = evidenceCache.get(key);
  if (current && current.fetcher === fetcher
    && Date.now() < current.expiresAt)
    return current.result;

  const result = (async (): Promise<GithubReadReceipt | null> => {
    try {
      const response = await fetcher(ROOT + path, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(3000),
        headers: {
          // GitHub has Access-Control-Allow-Origin: * for its public API.
          // No tokens, cookies, or forbidden browser User-Agent header.
          Accept: "application/vnd.github+json",
        },
      });
      if (!response.ok) return null;
      const data = await decodeJsonWithCeiling(response, maximumBytes);
      return { data, observedAt: new Date().toISOString() };
    } catch {
      return null;
    }
  })();

  const entry: CacheEntry = {
    fetcher, expiresAt: Date.now() + GITHUB_POSITIVE_CACHE_MS, result,
  };
  // Exactly five fixed endpoints; never accumulate user-provided URLs.
  evidenceCache.set(key, entry);
  void result.then(value => {
    if (value === null && evidenceCache.get(key) === entry)
      entry.expiresAt = Date.now() + GITHUB_ERROR_CACHE_MS;
  });
  return result;
}
