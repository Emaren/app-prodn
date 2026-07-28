export const LEADERBOARD_SCOPES = [
  "all",
  "claimed",
] as const;

export type LeaderboardScope =
  (typeof LEADERBOARD_SCOPES)[number];

export const DEFAULT_LEADERBOARD_SCOPE:
  LeaderboardScope = "all";

export function isLeaderboardScope(
  value: unknown,
): value is LeaderboardScope {
  return (
    typeof value === "string" &&
    LEADERBOARD_SCOPES.includes(
      value as LeaderboardScope,
    )
  );
}

export function normalizeLeaderboardScope(
  value: unknown,
): LeaderboardScope {
  return isLeaderboardScope(value)
    ? value
    : DEFAULT_LEADERBOARD_SCOPE;
}
