"use client";

import type {
  LobbyLeaderboardSummary,
} from "@/lib/lobby";
import type {
  LeaderboardLane,
} from "@/lib/leaderboardLane";
import {
  normalizeLeaderboardScope,
  type LeaderboardScope,
} from "@/lib/leaderboardScope";

const laneCache =
  new Map<
    string,
    LobbyLeaderboardSummary
  >();

const laneRequests =
  new Map<
    string,
    Promise<LobbyLeaderboardSummary>
  >();

function leaderboardCacheKey(
  lane: LeaderboardLane,
  scope: LeaderboardScope,
) {
  return `${lane}:${scope}`;
}

export function seedLeaderboardLaneCache(
  summary:
    | LobbyLeaderboardSummary
    | null
    | undefined,
) {
  if (!summary) {
    return;
  }

  const scope =
    normalizeLeaderboardScope(
      summary.scope,
    );
  const cacheKey =
    leaderboardCacheKey(
      summary.lane,
      scope,
    );
  const current =
    laneCache.get(cacheKey);

  // Prefer the richer snapshot when both represent the same lane and scope.
  if (
    !current ||
    summary.entries.length >=
      current.entries.length
  ) {
    laneCache.set(
      cacheKey,
      summary,
    );
  }
}

export function readLeaderboardLaneCache(
  lane: LeaderboardLane,
  scope: LeaderboardScope = "all",
) {
  return (
    laneCache.get(
      leaderboardCacheKey(
        lane,
        normalizeLeaderboardScope(
          scope,
        ),
      ),
    ) ?? null
  );
}

export async function loadLeaderboardLaneCached(
  lane: LeaderboardLane,
  {
    limit = 64,
    force = false,
    scope = "all",
  }: {
    limit?: number;
    force?: boolean;
    scope?: LeaderboardScope;
  } = {},
) {
  const normalizedScope =
    normalizeLeaderboardScope(
      scope,
    );
  const cacheKey =
    leaderboardCacheKey(
      lane,
      normalizedScope,
    );

  if (!force) {
    const cached =
      readLeaderboardLaneCache(
        lane,
        normalizedScope,
      );

    if (cached) {
      return cached;
    }
  }

  const pending =
    laneRequests.get(cacheKey);

  if (pending) {
    return pending;
  }

  const request = (async () => {
    const params =
      new URLSearchParams({
        lane,
        scope: normalizedScope,
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
      payload.lane !== lane ||
      normalizeLeaderboardScope(
        payload.scope,
      ) !== normalizedScope
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
    cacheKey,
    request,
  );

  try {
    return await request;
  } finally {
    if (
      laneRequests.get(cacheKey) ===
      request
    ) {
      laneRequests.delete(
        cacheKey,
      );
    }
  }
}

export async function prefetchLeaderboardLane(
  lane: LeaderboardLane,
  limit = 64,
  scope: LeaderboardScope = "all",
) {
  try {
    return await loadLeaderboardLaneCached(
      lane,
      {
        limit,
        scope,
      },
    );
  } catch {
    // Prefetch is opportunistic.
    // A later explicit lane switch may retry.
    return null;
  }
}
