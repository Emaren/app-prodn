/**
 * Public leaderboard pagination is a source-backed bounded query.
 * No partial parse: "10junk", exponents, signs and oversized values are invalid.
 * Preserve the historical fallback and maximum cap for ordinary decimal input.
 * Reusable by independent tests, without importing the server route or Prisma.
 */
export function parseLeaderboardPaginationInteger(
  raw: string | null,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (
    raw === null ||
    !/^[0-9]{1,9}$/.test(raw) ||
    !Number.isSafeInteger(fallback) ||
    !Number.isSafeInteger(minimum) ||
    !Number.isSafeInteger(maximum) ||
    minimum > maximum
  ) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}
