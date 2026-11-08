/**
 * Managed image cache policy deliberately distinguishes a verified upload
 * from a static fallback. A temporary public-read-model failure must never
 * seal a generic silhouette in a browser or CDN for seven more days.
 *
 * This module is pure; it cannot read/write DB, change image content, or
 * claim that managed media or a user's payment has been authorized.
 */
export type MediaFallbackReason = "unassigned" | "lookup-error";

export const VERIFIED_MANAGED_MEDIA_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";

export function fallbackMediaCacheControl(reason: MediaFallbackReason): string {
  // Unknown inputs must fail closed rather than publishing long-lived bytes.
  return reason === "unassigned"
    ? "public, max-age=60, must-revalidate"
    : "private, no-store";
}
