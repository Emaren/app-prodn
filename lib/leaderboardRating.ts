import type { LeaderboardLane } from "@/lib/leaderboardLane";

export type HistoricalSteamRatingEvidence = {
  ratingObservedAt?: string | null;
  steamRmRating: number | null;
  steamDmRating: number | null;
};

export type LeaderboardRatingSource =
  | "current_steam"
  | "last_known_steam"
  | "profile";

export type LeaderboardRatingPresentation = {
  value: number | null;
  source: LeaderboardRatingSource;
  sourceLabel: string;
  secondaryLabel: string | null;
};

function positiveFiniteRating(
  value: number | null | undefined,
) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0
  )
    ? value
    : null;
}

export function latestHistoricalSteamLaneRating(
  evidence: readonly HistoricalSteamRatingEvidence[],
  lane: LeaderboardLane,
) {
  let bestRating: number | null = null;
  let bestObservedAtMs = Number.NEGATIVE_INFINITY;

  for (const item of evidence) {
    const rating = positiveFiniteRating(
      lane === "dm"
        ? item.steamDmRating
        : item.steamRmRating,
    );

    if (
      rating === null ||
      !item.ratingObservedAt
    ) {
      continue;
    }

    const observedAtMs =
      new Date(
        item.ratingObservedAt,
      ).getTime();

    if (
      !Number.isFinite(observedAtMs) ||
      observedAtMs <= bestObservedAtMs
    ) {
      continue;
    }

    bestObservedAtMs = observedAtMs;
    bestRating = rating;
  }

  return bestRating;
}

export function resolveLeaderboardRatingPresentation(
  input: {
    lane: LeaderboardLane;
    currentRmRating: number | null;
    currentDmRating: number | null;
    lastKnownRmRating: number | null;
    lastKnownDmRating: number | null;
    siteElo: number | null;
    hasTrackedHistory: boolean;
  },
): LeaderboardRatingPresentation {
  const currentRating =
    positiveFiniteRating(
      input.lane === "dm"
        ? input.currentDmRating
        : input.currentRmRating,
    );
  const lastKnownRating =
    positiveFiniteRating(
      input.lane === "dm"
        ? input.lastKnownDmRating
        : input.lastKnownRmRating,
    );
 
  if (currentRating !== null) {
    return {
      value: Math.round(currentRating),
      source: "current_steam",
      sourceLabel:
        input.lane === "dm"
          ? "DM Rating"
          : "RM Rating",
      secondaryLabel: null,
    };
  }

  if (lastKnownRating !== null) {
    return {
      value: Math.round(lastKnownRating),
      source: "last_known_steam",
      sourceLabel:
        input.lane === "dm"
          ? "Last DM"
          : "Last RM",
      secondaryLabel: null,
    };
  }

   return {
    value: null,
    source: "profile",
    sourceLabel: "Steam Elo unavailable",
    secondaryLabel: null,
  };
}

/**
 * Version 1 compares only actual Steam RM/DM ratings; Site Elo is a future
 * product and must never silently become a Steam leaderboard number.
 */
export function compareLeaderboardRatingAuthority(
  left: LeaderboardRatingPresentation,
  right: LeaderboardRatingPresentation,
  direction: "asc" | "desc" = "desc",
): number {
  const tier = (source: LeaderboardRatingSource) =>
    source === "current_steam" || source === "last_known_steam" ? 0 : 1;
  const tierDelta = tier(left.source) - tier(right.source);
  if (tierDelta !== 0) return tierDelta;
  // Two unrated profiles must compare equal, not produce NaN from infinities.
  if (left.value === null && right.value === null) return 0;
  if (left.value === null) return 1;
  if (right.value === null) return -1;
  return direction === "asc"
    ? left.value - right.value
    : right.value - left.value;
}
