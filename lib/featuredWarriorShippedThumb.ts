/**
 * A trusted static thumbnail can stand in for a managed-avatar upload only
 * when its filename carries the SAME immutable upload basename. Never guess
 * a user portrait, accept a traversal, or substitute a generic silhouette.
 *
 * This source-only matcher does not prove the media bytes exist; the caller
 * must open and validate an actual published WebP in the read-only public tree.
 */
export function shippedManagedPortraitThumbName(
  kind: string,
  originalFilename: string,
  size: string | null,
): string | null {
  if (kind !== "avatar" || (size !== "card" && size !== "thumb")) return null;
  if (originalFilename.length > 160) return null;
  const match = /^([a-z0-9](?:[a-z0-9-]{0,120}[a-z0-9])?)-(\d{13})-([a-f0-9]{8})\.(?:png|jpe?g|webp|gif)$/.exec(originalFilename);
  if (!match) return null;
  return match[1] + "-" + match[2] + "-" + match[3] + "-thumb.webp";
}
