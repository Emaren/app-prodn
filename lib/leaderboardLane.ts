export const LEADERBOARD_LANES = ["rm", "dm"] as const;
export const LEADERBOARD_LANE_STORAGE_KEY = "aoe2hdbets:leaderboard-lane";

export type LeaderboardLane = (typeof LEADERBOARD_LANES)[number];

export const DEFAULT_LEADERBOARD_LANE: LeaderboardLane = "rm";

export function isLeaderboardLane(value: unknown): value is LeaderboardLane {
  return typeof value === "string" && LEADERBOARD_LANES.includes(value as LeaderboardLane);
}

export function normalizeLeaderboardLane(value: unknown): LeaderboardLane {
  return isLeaderboardLane(value) ? value : DEFAULT_LEADERBOARD_LANE;
}

export function readStoredLeaderboardLane(): LeaderboardLane {
  if (typeof window === "undefined") {
    return DEFAULT_LEADERBOARD_LANE;
  }

  try {
    return normalizeLeaderboardLane(window.localStorage.getItem(LEADERBOARD_LANE_STORAGE_KEY));
  } catch {
    return DEFAULT_LEADERBOARD_LANE;
  }
}

export function writeStoredLeaderboardLane(lane: LeaderboardLane) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LEADERBOARD_LANE_STORAGE_KEY, normalizeLeaderboardLane(lane));
  } catch {
    // Private browsing can block storage. The in-memory preference still works.
  }
}
