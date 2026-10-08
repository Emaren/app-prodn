import type { LeaderboardLane } from "@/lib/leaderboardLane";

export type HistoricalSteamRatingEvidence = {
  ratingObservedAt?: string | null;
  steamRmRating: number | null;
  steamDmRating: number | null;
};

export type LeaderboardRatingSource =
  | "current_steam"
  | "last_known_steam"
  | "site_elo"
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
  const siteElo =
    positiveFiniteRating(
      input.siteElo,
    );
  const steamSecondary =
    input.hasTrackedHistory &&
    siteElo !== null
      ? `Site ${Math.round(siteElo)}`
      : null;

  if (currentRating !== null) {
    return {
      value: Math.round(currentRating),
      source: "current_steam",
      sourceLabel:
        input.lane === "dm"
          ? "DM Rating"
          : "RM Rating",
      secondaryLabel:
        steamSecondary,
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
      secondaryLabel:
        steamSecondary,
    };
  }

  if (
    input.hasTrackedHistory &&
    siteElo !== null
  ) {
    return {
      value: Math.round(siteElo),
      source: "site_elo",
      sourceLabel: "Site Elo",
      secondaryLabel: null,
    };
  }

  return {
    value: null,
    source: "profile",
    sourceLabel: "Profile",
    secondaryLabel: null,
  };
}

/**
 * Site Elo is a distinct AoE2WAR measure, not a Steam ladder rating. Compare
 * numbers only within the same authority family. Current and dated historical
 * Steam ratings share the Steam scale but retain their different source labels.
 */
export function compareLeaderboardRatingAuthority(
  left: LeaderboardRatingPresentation,
  right: LeaderboardRatingPresentation,
  direction: "asc" | "desc" = "desc",
): number {
  const tier = (source: LeaderboardRatingSource) =>
    source === "current_steam" || source === "last_known_steam" ? 0
      : source === "site_elo" ? 1
        : 2;
  const tierDelta = tier(left.source) - tier(right.source);
  if (tierDelta !== 0) return tierDelta;
  return direction === "asc"
    ? (left.value ?? Number.POSITIVE_INFINITY) - (right.value ?? Number.POSITIVE_INFINITY)
    : (right.value ?? Number.NEGATIVE_INFINITY) - (left.value ?? Number.NEGATIVE_INFINITY);
}
