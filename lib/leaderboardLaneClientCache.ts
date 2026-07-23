"use client";

import type {
  LobbyLeaderboardSummary,
} from "@/lib/lobby";
import type {
  LeaderboardLane,
} from "@/lib/leaderboardLane";

const laneCache =
  new Map<
    LeaderboardLane,
    LobbyLeaderboardSummary
  >();

const laneRequests =
  new Map<
    LeaderboardLane,
    Promise<LobbyLeaderboardSummary>
  >();

export function seedLeaderboardLaneCache(
  summary:
    | LobbyLeaderboardSummary
    | null
    | undefined,
) {
  if (!summary) {
    return;
  }

  const current =
    laneCache.get(summary.lane);

  // Prefer the richer snapshot when both represent
  // the same lane.
  if (
    !current ||
    summary.entries.length >=
      current.entries.length
  ) {
    laneCache.set(
      summary.lane,
      summary,
    );
  }
}

export function readLeaderboardLaneCache(
  lane: LeaderboardLane,
) {
  return laneCache.get(lane) ?? null;
}

export async function loadLeaderboardLaneCached(
  lane: LeaderboardLane,
  {
    limit = 64,
    force = false,
  }: {
    limit?: number;
    force?: boolean;
  } = {},
) {
  if (!force) {
    const cached =
      readLeaderboardLaneCache(lane);

    if (cached) {
      return cached;
    }
  }

  const pending =
    laneRequests.get(lane);

  if (pending) {
    return pending;
  }

  const request = (async () => {
    const params =
      new URLSearchParams({
        lane,
        offset: "0",
        limit: String(limit),
      });

    const response =
      await fetch(
        `/api/lobby/leaderboard?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

    const payload =
      (await response
        .json()
        .catch(() => ({}))) as
        Partial<LobbyLeaderboardSummary>;

    if (
      !response.ok ||
      !Array.isArray(
        payload.entries,
      ) ||
      payload.lane !== lane
    ) {
      throw new Error(
        `Leaderboard ${lane.toUpperCase()} lane unavailable`,
      );
    }

    const summary =
      payload as LobbyLeaderboardSummary;

    seedLeaderboardLaneCache(
      summary,
    );

    return summary;
  })();

  laneRequests.set(
    lane,
    request,
  );

  try {
    return await request;
  } finally {
    if (
      laneRequests.get(lane) ===
      request
    ) {
      laneRequests.delete(lane);
    }
  }
}

export async function prefetchLeaderboardLane(
  lane: LeaderboardLane,
  limit = 64,
) {
  try {
    return await loadLeaderboardLaneCached(
      lane,
      {
        limit,
      },
    );
  } catch {
    // Prefetch is opportunistic.
    // A later explicit lane switch may retry.
    return null;
  }
}
