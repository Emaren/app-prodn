import {
  WARGRAPH_MAX_RESOLVED_CONTESTS,
} from "./constants.ts";

import {
  getWarGraphNightKey,
  isBoundPairingCommencementEligible,
  isWarGraphPrimeWindow,
} from "./time.ts";

import type {
  WarGraphEligibilityDecision,
  WarGraphEligibilityReason,
  WarGraphLayer,
  WarGraphParticipantAtStart,
  WarGraphQualificationInput,
} from "./types.ts";

type IneligibleReason = Exclude<
  WarGraphEligibilityReason,
  "WARGRAPH_ELIGIBLE"
>;

function ineligible(
  reason: IneligibleReason,
): WarGraphEligibilityDecision {
  return {
    eligible: false,
    reason,
  };
}

export function isWarGraphLayer(
  value: unknown,
): value is WarGraphLayer {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3
  );
}

export function areAdjacentWarGraphLayers(
  left: unknown,
  right: unknown,
): boolean {
  return (
    isWarGraphLayer(left) &&
    isWarGraphLayer(right) &&
    Math.abs(left - right) === 1
  );
}

export function getInwardWarGraphLayer(
  layer: unknown,
): WarGraphLayer | null {
  if (!isWarGraphLayer(layer) || layer === 0) {
    return null;
  }

  return (layer - 1) as WarGraphLayer;
}

export function isLegalWarGraphAggressorPath(
  aggressorLayer: unknown,
  defenderLayer: unknown,
): boolean {
  return (
    isWarGraphLayer(aggressorLayer) &&
    isWarGraphLayer(defenderLayer) &&
    aggressorLayer === defenderLayer + 1
  );
}

function isParticipantShapeValid(
  participant: WarGraphParticipantAtStart,
): boolean {
  return (
    typeof participant?.playerId === "string" &&
    participant.playerId.trim().length > 0 &&
    isWarGraphLayer(participant.layer) &&
    Number.isSafeInteger(participant.actionsUsed) &&
    participant.actionsUsed >= 0 &&
    typeof participant.hasConflictingEngagement ===
      "boolean"
  );
}

function hasValidWatcherProofShape(
  input: WarGraphQualificationInput,
): boolean {
  const proof = input.watcherProof;

  return (
    typeof proof?.leftWatcherLive === "boolean" &&
    typeof proof?.rightWatcherLive === "boolean" &&
    typeof proof?.sameGame === "boolean"
  );
}

function hasKnownProvenance(
  value: unknown,
): boolean {
  return (
    value === "LIVE" ||
    value === "BATCH" ||
    value === "MANUAL" ||
    value === "HISTORICAL"
  );
}

function hasKnownPath(value: unknown): boolean {
  return (
    value === "ORGANIC" ||
    value === "BOUND_PAIRING"
  );
}

export function qualifyWarGraphGame(
  input: WarGraphQualificationInput,
): WarGraphEligibilityDecision {
  if (
    !input ||
    input.graphStateAtStartValid !== true ||
    !isParticipantShapeValid(input.left) ||
    !isParticipantShapeValid(input.right) ||
    input.left.playerId === input.right.playerId ||
    !hasValidWatcherProofShape(input) ||
    !hasKnownProvenance(input.provenance) ||
    !hasKnownPath(input.path) ||
    getWarGraphNightKey(input.commencedAt) === null
  ) {
    return ineligible(
      "INELIGIBLE_GRAPH_STATE_AT_START",
    );
  }

  if (input.provenance !== "LIVE") {
    return ineligible("INELIGIBLE_NOT_LIVE");
  }

  const timingEligible =
    input.path === "ORGANIC"
      ? isWarGraphPrimeWindow(input.commencedAt)
      : Boolean(
          input.pairingTiming &&
          isBoundPairingCommencementEligible(
            input.commencedAt,
            input.pairingTiming,
          ),
        );

  if (!timingEligible) {
    return ineligible(
      "INELIGIBLE_OUTSIDE_PRIME_WINDOW",
    );
  }

  if (
    !input.watcherProof.leftWatcherLive ||
    !input.watcherProof.rightWatcherLive ||
    !input.watcherProof.sameGame
  ) {
    return ineligible(
      "INELIGIBLE_SINGLE_WATCHER",
    );
  }

  if (
    input.left.hasConflictingEngagement ||
    input.right.hasConflictingEngagement
  ) {
    return ineligible(
      "INELIGIBLE_CONFLICTING_ENGAGEMENT",
    );
  }

  if (
    input.left.actionsUsed >=
      WARGRAPH_MAX_RESOLVED_CONTESTS ||
    input.right.actionsUsed >=
      WARGRAPH_MAX_RESOLVED_CONTESTS
  ) {
    return ineligible("INELIGIBLE_ACTION_CAP");
  }

  if (input.left.layer === input.right.layer) {
    return ineligible("INELIGIBLE_SAME_RING");
  }

  if (
    !areAdjacentWarGraphLayers(
      input.left.layer,
      input.right.layer,
    )
  ) {
    return ineligible("INELIGIBLE_RING_GAP");
  }

  const aggressor =
    input.left.layer > input.right.layer
      ? input.left
      : input.right;

  const defender =
    aggressor === input.left
      ? input.right
      : input.left;

  const nightKeySource =
    input.path === "BOUND_PAIRING"
      ? input.pairingTiming?.advanceCreatedAt
      : input.commencedAt;

  const nightKey = nightKeySource
    ? getWarGraphNightKey(nightKeySource)
    : null;

  if (!nightKey) {
    return ineligible(
      "INELIGIBLE_GRAPH_STATE_AT_START",
    );
  }

  return {
    eligible: true,
    reason: "WARGRAPH_ELIGIBLE",
    aggressor,
    defender,
    nightKey,
  };
}
