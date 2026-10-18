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

// Request starts, not arrival order, determine snapshot recency.
// A delayed old prefetch must not replace a newer authoritative response.
let laneSnapshotSequence = 0;
const laneSnapshotRevisions = new Map<string, number>();
// Unversioned SSR seeds can warm a tab, but must never replace a verified
// network response already accepted for that lane/scope.
const laneNetworkAccepted = new Set<string>();

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
  requestSequence?: number,
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

  // Fresh network snapshots beat older rich ones. External/SSR seeds retain
  // the historical richer-window preference because they lack a request ID.
  const latestApplied = laneSnapshotRevisions.get(cacheKey) ?? 0;
  if (
    (requestSequence === undefined && laneNetworkAccepted.has(cacheKey)) ||
    (requestSequence !== undefined && requestSequence < latestApplied)
  ) {
    return;
  }
  if (
    requestSequence !== undefined ||
    !current ||
    summary.entries.length >= current.entries.length
  ) {
    laneCache.set(cacheKey, summary);
    if (requestSequence !== undefined) laneNetworkAccepted.add(cacheKey);
    laneSnapshotRevisions.set(
      cacheKey,
      requestSequence ?? ++laneSnapshotSequence,
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

  // An explicit forced refresh must start a new request even if an old
  // same-window request is in flight. Its later start gets cache authority.
  if (pending && !force) {
    return pending;
  }

  const requestSequence = ++laneSnapshotSequence;
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
      ) !== normalizedScope ||
      !Number.isSafeInteger(payload.trackedPlayers) ||
      (payload.trackedPlayers ?? -1) < 0 ||
      payload.entries.length > requestedLimit ||
      payload.entries.length > (payload.trackedPlayers ?? -1)
    ) {
      throw new Error(
        `Leaderboard ${lane.toUpperCase()} lane unavailable`,
      );
    }

    const summary =
      payload as LobbyLeaderboardSummary;

    seedLeaderboardLaneCache(
      summary,
      requestSequence,
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
