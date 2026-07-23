export const LEADERBOARD_SORT_KEYS = [
  "rank",
  "rating",
  "warrior",
  "win_rate",
  "wins",
  "losses",
  "games",
  "streak",
] as const;

export const LEADERBOARD_SORT_DIRECTIONS = [
  "desc",
  "asc",
] as const;

export type LeaderboardSortKey =
  (typeof LEADERBOARD_SORT_KEYS)[number];

export type LeaderboardSortDirection =
  (typeof LEADERBOARD_SORT_DIRECTIONS)[number];

export type LeaderboardSortState = {
  key: LeaderboardSortKey | null;
  direction: LeaderboardSortDirection | null;
};

export function normalizeLeaderboardSortKey(
  value: string | null | undefined,
): LeaderboardSortKey | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return LEADERBOARD_SORT_KEYS.includes(
    normalized as LeaderboardSortKey,
  )
    ? (normalized as LeaderboardSortKey)
    : null;
}

export function normalizeLeaderboardSortDirection(
  value: string | null | undefined,
): LeaderboardSortDirection | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return LEADERBOARD_SORT_DIRECTIONS.includes(
    normalized as LeaderboardSortDirection,
  )
    ? (normalized as LeaderboardSortDirection)
    : null;
}

export function nextLeaderboardSort(
  current: LeaderboardSortState,
  clickedKey: LeaderboardSortKey,
): LeaderboardSortState {
  if (
    current.key !== clickedKey ||
    current.direction === null
  ) {
    return {
      key: clickedKey,
      direction: "desc",
    };
  }

  if (current.direction === "desc") {
    return {
      key: clickedKey,
      direction: "asc",
    };
  }

  return {
    key: null,
    direction: null,
  };
}

export function streakSortScore(
  streakLabel: string | null | undefined,
) {
  const match = String(streakLabel ?? "")
    .trim()
    .toUpperCase()
    .match(/^([WL])(\d+)$/);

  if (!match) {
    return 0;
  }

  const count = Number.parseInt(match[2], 10);

  if (!Number.isFinite(count)) {
    return 0;
  }

  return match[1] === "W" ? count : -count;
}
