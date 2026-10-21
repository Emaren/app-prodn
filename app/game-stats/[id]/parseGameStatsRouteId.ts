/**
 * Validate the public replay URL before querying GameStats.id (Prisma Int).
 * Accept legacy zero-padded decimal links, but never non-decimal notation,
 * negative numbers, imprecise integers or a value outside signed int32.
 */
export function parseGameStatsRouteId(raw: string): number | null {
  if (!/^\d{1,64}$/.test(raw)) return null;

  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 && id <= 2_147_483_647
    ? id
    : null;
}
