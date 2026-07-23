export const LEADERBOARD_VIEWS = [
  "modern",
  "og",
] as const;

export type LeaderboardView =
  (typeof LEADERBOARD_VIEWS)[number];

export const DEFAULT_LEADERBOARD_VIEW:
  LeaderboardView = "modern";

export const LEADERBOARD_VIEW_STORAGE_KEY =
  "aoe2hdbets:leaderboard-view";

export const LEADERBOARD_VIEW_COOKIE_KEY =
  "aoe2hdbets_leaderboard_view";

export function isLeaderboardView(
  value: unknown,
): value is LeaderboardView {
  return (
    typeof value === "string" &&
    LEADERBOARD_VIEWS.includes(
      value as LeaderboardView,
    )
  );
}

export function normalizeLeaderboardView(
  value: unknown,
): LeaderboardView {
  return isLeaderboardView(value)
    ? value
    : DEFAULT_LEADERBOARD_VIEW;
}

export function readStoredLeaderboardView():
  LeaderboardView {
  if (typeof window === "undefined") {
    return DEFAULT_LEADERBOARD_VIEW;
  }

  try {
    return normalizeLeaderboardView(
      window.localStorage.getItem(
        LEADERBOARD_VIEW_STORAGE_KEY,
      ),
    );
  } catch {
    return DEFAULT_LEADERBOARD_VIEW;
  }
}

export function writeStoredLeaderboardView(
  view: LeaderboardView,
) {
  if (typeof window === "undefined") {
    return;
  }

  const normalized =
    normalizeLeaderboardView(view);

  try {
    window.localStorage.setItem(
      LEADERBOARD_VIEW_STORAGE_KEY,
      normalized,
    );
  } catch {
    // Private browsing can block storage.
  }

  try {
    document.cookie = [
      `${LEADERBOARD_VIEW_COOKIE_KEY}=${normalized}`,
      "Path=/",
      "Max-Age=31536000",
      "SameSite=Lax",
    ].join("; ");
  } catch {
    // Navigation still works even if cookies are blocked.
  }
}
