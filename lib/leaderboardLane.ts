export const LEADERBOARD_LANES = ["rm", "dm"] as const;
export const LEADERBOARD_LANE_STORAGE_KEY = "aoe2hdbets:leaderboard-lane";
export const LEADERBOARD_LANE_COOKIE_KEY = "aoe2hdbets_leaderboard_lane";

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

  const normalizedLane = normalizeLeaderboardLane(lane);

  try {
    window.localStorage.setItem(
      LEADERBOARD_LANE_STORAGE_KEY,
      normalizedLane,
    );
  } catch {
    // Private browsing can block storage. The in-memory preference still works.
  }

  try {
    document.cookie =
      `${LEADERBOARD_LANE_COOKIE_KEY}=${encodeURIComponent(normalizedLane)}; Path=/; Max-Age=31536000; SameSite=Lax`;
  } catch {
    // Cookie persistence is an optimization. Client state still works without it.
  }
}
