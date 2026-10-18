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
  // Match the public API contract, including non-finite caller values.
  const requestedLimit =
    Number.isSafeInteger(limit)
      ? Math.max(1, Math.min(600, limit))
      : 64;
  // Deduplication must include the requested row window. A concurrent
  // small prefetch must never satisfy a larger requested first page.
  const requestKey = `${cacheKey}:limit:${requestedLimit}`;

  if (!force) {
    const cached =
      readLeaderboardLaneCache(
        lane,
        normalizedScope,
      );

    if (
      cached &&
      (cached.entries.length >= requestedLimit ||
        cached.entries.length >= cached.trackedPlayers)
    ) {
      return cached;
    }
  }

  const pending =
    laneRequests.get(requestKey);

  if (pending) {
    return pending;
  }

  const request = (async () => {
    const params =
      new URLSearchParams({
        lane,
        scope: normalizedScope,
        offset: "0",
        limit: String(requestedLimit),
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
    requestKey,
    request,
  );

  try {
    return await request;
  } finally {
    if (
      laneRequests.get(requestKey) ===
      request
    ) {
      laneRequests.delete(
        requestKey,
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
