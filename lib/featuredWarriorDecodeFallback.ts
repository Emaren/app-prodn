/** A bounded, source-only image admission check; never swap a painted card
 * until the actual chosen image has fully decoded in the browser.
 */
export async function firstDecodableFeaturedImage(
  candidates: readonly string[],
  decode: (source: string) => Promise<void>,
): Promise<string> {
  const attempted = new Set<string>();
  for (const source of candidates) {
    if (!source || attempted.has(source)) continue;
    // The budget is per distinct attempted URL: duplicates must not consume
    // slots before the final safe silhouette can be attempted.
    if (attempted.size >= 3) break;
    attempted.add(source);
    try {
      await decode(source);
      return source;
    } catch {
      // Failed images are evicted by the existing decode cache. Continue to
      // one bounded fallback; never treat an image error as a successful load.
    }
  }
  throw new Error("No featured portrait decoded; retain the painted card");
}
