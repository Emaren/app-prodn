/** A bounded, source-only image admission check; never swap a painted card
 * until the actual chosen image has fully decoded in the browser.
 */
export async function firstDecodableFeaturedImage(
  candidates: readonly string[],
  decode: (source: string) => Promise<void>,
  admit?: (source: string) => Promise<boolean>,
): Promise<string> {
  const attempted = new Set<string>();
  for (const source of candidates) {
    if (!source || attempted.has(source)) continue;
    // The budget is per distinct attempted URL: duplicates must not consume
    // slots before the final safe silhouette can be attempted.
    if (attempted.size >= 3) break;
    attempted.add(source);
    try {
      // Optional public-media HEAD gate: reject a known oversized or missing
      // primary before it can consume the image decoder's byte budget.
      if (admit && !(await admit(source))) continue;
      await decode(source);
      return source;
    } catch {
      // Failed images are evicted by the existing decode cache. Continue to
      // one bounded fallback; never treat an image error as a successful load.
    }
  }
  throw new Error("No featured portrait decoded; retain the painted card");
}

/** 2 MiB is the compact-card delivery ceiling, not the upload limit.
 * Malformed/missing Content-Length is unknown: preserve ordinary decode.
 */
export const FEATURED_COMPACT_MEDIA_MAX_BYTES = 2 * 1024 * 1024;

export function exceedsFeaturedCompactMediaBytes(contentLength: string | null): boolean {
  if (contentLength === null || !/^\d+$/.test(contentLength)) return false;
  return BigInt(contentLength) > BigInt(FEATURED_COMPACT_MEDIA_MAX_BYTES);
}

/** HEAD only public, same-origin managed avatars; no cookies and no body.
 * A failed/unsupported probe leaves the existing decode/fallback semantics.
 * Redirects are forbidden at the callsite; a rejected 307 is unknown
 * and falls through to the existing Image.decode path, never followed by HEAD.
 * A directly observed 404/503 without redirect can skip that candidate.
 */
export async function admitFeaturedMediaByHead(
  source: string,
  head: (url: string) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
  }>,
): Promise<boolean> {
  if (!source.startsWith("/api/media-assets/avatar/") || source.startsWith("//")) {
    return true;
  }
  try {
    const response = await head(source);
    // No-follow fetch rejects redirects; treat any synthetic 3xx response
    // as unsupported rather than inventing proof of a final media response.
    if ((response.status >= 300 && response.status < 400) ||
        response.status === 405 || response.status === 501) return true;
    if (!response.ok) return false;
    return !exceedsFeaturedCompactMediaBytes(response.headers.get("content-length"));
  } catch {
    // Browser HEAD incompatibility must never suppress an otherwise valid
    // source; the original bounded image.decode fallback still decides.
    return true;
  }
}
