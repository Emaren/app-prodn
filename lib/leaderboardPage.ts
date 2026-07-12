export function normalizeLeaderboardSearch(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function matchesLeaderboardSearch(
  values: Iterable<string>,
  query: string | null | undefined
) {
  const normalizedQuery = normalizeLeaderboardSearch(query);
  if (!normalizedQuery) return true;
  return Array.from(values).some((value) =>
    normalizeLeaderboardSearch(value).includes(normalizedQuery)
  );
}

export function calculateResolvedWinRate(wins: number, losses: number) {
  const resolved = Math.max(0, wins) + Math.max(0, losses);
  return resolved > 0 ? (Math.max(0, wins) / resolved) * 100 : null;
}
