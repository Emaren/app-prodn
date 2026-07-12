"use client";

export type LeaderboardDestination = "modern" | "og";

type LeaderboardEvent =
  | {
      type: "leaderboard_open_home_tile" | "leaderboard_open_kingdom_menu";
      metadata: { destination: LeaderboardDestination };
    }
  | {
      type: "leaderboard_switch_view";
      metadata: { from: LeaderboardDestination; to: LeaderboardDestination };
    };

export function trackLeaderboardEvent(event: LeaderboardEvent) {
  if (typeof window === "undefined") return;

  void fetch("/api/user/experience", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: event.type,
      path: window.location.pathname,
      label: event.type,
      metadata: event.metadata,
      dedupeWithinSeconds: 2,
    }),
    keepalive: true,
  }).catch(() => {
    // Product telemetry must never interrupt navigation.
  });
}
