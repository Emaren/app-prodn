import type { LobbyLeaderboardEntry } from "@/lib/lobby";

export const LEADERBOARD_SORT_KEYS = [
  "rank",
  "rank_change_24h",
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

function resolvedWinRate(
  entry: LobbyLeaderboardEntry,
) {
  const resolved =
    entry.wins + entry.losses;

  return resolved > 0
    ? entry.wins / resolved
    : null;
}

function compareLocalNullableNumber(
  left: number | null,
  right: number | null,
  direction: LeaderboardSortDirection,
) {
  if (
    left === null &&
    right === null
  ) {
    return 0;
  }

  // Missing values stay at the bottom in either direction.
  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc"
    ? left - right
    : right - left;
}

export function sortLeaderboardEntries(
  entries: LobbyLeaderboardEntry[],
  state: LeaderboardSortState,
) {
  if (
    !state.key ||
    !state.direction
  ) {
    return [...entries].sort(
      (left, right) =>
        left.rank - right.rank,
    );
  }

  const direction =
    state.direction;

  return [...entries].sort(
    (left, right) => {
      let comparison = 0;

      switch (state.key) {
        case "rank":
          comparison =
            compareLocalNullableNumber(
              left.rank,
              right.rank,
              direction,
            );
          break;

        case "rank_change_24h":
          comparison =
            compareLocalNullableNumber(
              left.rankDelta24h,
              right.rankDelta24h,
              direction,
            );
          break;

        case "rating":
          comparison =
            compareLocalNullableNumber(
              left.primaryRating,
              right.primaryRating,
              direction,
            );
          break;

        case "warrior":
          comparison =
            left.name.localeCompare(
              right.name,
              undefined,
              {
                numeric: true,
                sensitivity: "base",
              },
            );

          if (
            direction === "desc"
          ) {
            comparison *= -1;
          }

          break;

        case "win_rate":
          comparison =
            compareLocalNullableNumber(
              resolvedWinRate(left),
              resolvedWinRate(right),
              direction,
            );
          break;

        case "wins":
          comparison =
            compareLocalNullableNumber(
              left.wins,
              right.wins,
              direction,
            );
          break;

        case "losses":
          comparison =
            compareLocalNullableNumber(
              left.losses,
              right.losses,
              direction,
            );
          break;

        case "games":
          comparison =
            compareLocalNullableNumber(
              left.totalMatches,
              right.totalMatches,
              direction,
            );
          break;

        case "streak":
          comparison =
            compareLocalNullableNumber(
              streakSortScore(
                left.streakLabel,
              ),
              streakSortScore(
                right.streakLabel,
              ),
              direction,
            );
          break;
      }

      if (comparison !== 0) {
        return comparison;
      }

      return (
        left.rank -
        right.rank
      );
    },
  );
}
