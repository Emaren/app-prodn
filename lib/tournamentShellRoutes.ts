/**
 * Only the modern tournaments bracket battlefield owns a fixed viewport.
 * Historical /tournaments/[slug] pages are ordinary scrollable documents.
 * This is a shell behavior boundary, not a styling/theme classifier.
 */
export function isTournamentImmersiveRoute(pathname: string | null | undefined): boolean {
  return pathname === "/tournaments" || pathname === "/tournaments/";
}
