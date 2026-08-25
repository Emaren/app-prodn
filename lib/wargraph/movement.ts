import {
  WARGRAPH_LAYERS,
  WARGRAPH_MAX_RESOLVED_CONTESTS,
} from "./constants.ts";

import {
  isLegalWarGraphAggressorPath,
  isWarGraphLayer,
} from "./eligibility.ts";

import type {
  WarGraphActionCharges,
  WarGraphBattleOutcome,
  WarGraphLayer,
  WarGraphMovementDecision,
  WarGraphMovementParticipant,
  WarGraphRoleMovement,
} from "./types.ts";

function isParticipantValid(
  participant: WarGraphMovementParticipant,
): boolean {
  return (
    typeof participant?.playerId === "string" &&
    participant.playerId.trim().length > 0 &&
    isWarGraphLayer(participant.layer) &&
    Number.isSafeInteger(participant.actionsUsed) &&
    participant.actionsUsed >= 0
  );
}

function invalidMovement(): WarGraphMovementDecision {
  return {
    ok: false,
    reason: "INELIGIBLE_GRAPH_STATE_AT_START",
  };
}

function actionCapMovement(): WarGraphMovementDecision {
  return {
    ok: false,
    reason: "INELIGIBLE_ACTION_CAP",
  };
}

function roleMovement(
  participant: WarGraphMovementParticipant,
  toLayer: 0 | 1 | 2 | 3,
  actionCharge: 0 | 1,
  catastrophicFall: boolean,
): WarGraphRoleMovement {
  return {
    playerId: participant.playerId,
    fromLayer: participant.layer,
    toLayer,
    actionCharge,
    catastrophicFall,
  };
}

function validateContestants(
  aggressor: WarGraphMovementParticipant,
  defender: WarGraphMovementParticipant,
): WarGraphMovementDecision | null {
  if (
    !isParticipantValid(aggressor) ||
    !isParticipantValid(defender) ||
    aggressor.playerId === defender.playerId ||
    !isLegalWarGraphAggressorPath(
      aggressor.layer,
      defender.layer,
    )
  ) {
    return invalidMovement();
  }

  if (
    aggressor.actionsUsed >=
      WARGRAPH_MAX_RESOLVED_CONTESTS ||
    defender.actionsUsed >=
      WARGRAPH_MAX_RESOLVED_CONTESTS
  ) {
    return actionCapMovement();
  }

  return null;
}

export function getWarGraphActionCharges(
  kind: unknown,
): WarGraphActionCharges | null {
  switch (kind) {
    case "VERIFIED_BATTLE":
    case "DEFENSE_DEFAULT":
    case "DEFENDER_NO_START_DEFAULT":
      return {
        aggressor: 1,
        defender: 1,
      };

    case "CHALLENGER_ABANDONMENT":
      return {
        aggressor: 1,
        defender: 0,
      };

    case "TECHNICAL_VOID":
    case "SYSTEM_VOID":
    case "MUTUAL_NO_START":
    case "GRAVITY_MOVE":
      return {
        aggressor: 0,
        defender: 0,
      };

    default:
      return null;
  }
}

export function planVerifiedBattleMovement(input: {
  aggressor: WarGraphMovementParticipant;
  defender: WarGraphMovementParticipant;
  outcome: WarGraphBattleOutcome;
}): WarGraphMovementDecision {
  const validation = validateContestants(
    input?.aggressor,
    input?.defender,
  );

  if (validation) {
    return validation;
  }

  if (
    input.outcome !== "AGGRESSOR_WIN" &&
    input.outcome !== "DEFENDER_WIN"
  ) {
    return invalidMovement();
  }

  if (input.outcome === "AGGRESSOR_WIN") {
    return {
      ok: true,
      kind: "VERIFIED_BATTLE",
      aggressor: roleMovement(
        input.aggressor,
        input.defender.layer,
        1,
        false,
      ),
      defender: roleMovement(
        input.defender,
        WARGRAPH_LAYERS.FRONTIER,
        1,
        true,
      ),
    };
  }

  const aggressorFalls =
    input.aggressor.layer !==
      WARGRAPH_LAYERS.FRONTIER;

  return {
    ok: true,
    kind: "VERIFIED_BATTLE",
    aggressor: roleMovement(
      input.aggressor,
      aggressorFalls
        ? WARGRAPH_LAYERS.FRONTIER
        : input.aggressor.layer,
      1,
      aggressorFalls,
    ),
    defender: roleMovement(
      input.defender,
      input.defender.layer,
      1,
      false,
    ),
  };
}

export function planDefenseDefaultMovement(input: {
  aggressor: WarGraphMovementParticipant;
  defender: WarGraphMovementParticipant;
}): WarGraphMovementDecision {
  const validation = validateContestants(
    input?.aggressor,
    input?.defender,
  );

  if (validation) {
    return validation;
  }

  return {
    ok: true,
    kind: "DEFENSE_DEFAULT",
    aggressor: roleMovement(
      input.aggressor,
      input.defender.layer,
      1,
      false,
    ),
    defender: roleMovement(
      input.defender,
      WARGRAPH_LAYERS.FRONTIER,
      1,
      true,
    ),
  };
}

export function planGravityMovement(input: {
  playerId: string;
  fromLayer: WarGraphLayer;
  toLayer: WarGraphLayer;
}): WarGraphMovementDecision {
  if (
    typeof input?.playerId !== "string" ||
    input.playerId.trim().length === 0 ||
    !isLegalWarGraphAggressorPath(
      input.fromLayer,
      input.toLayer,
    ) ||
    input.toLayer === WARGRAPH_LAYERS.CROWN
  ) {
    return invalidMovement();
  }

  return {
    ok: true,
    kind: "GRAVITY_MOVE",
    aggressor: {
      playerId: input.playerId,
      fromLayer: input.fromLayer,
      toLayer: input.toLayer,
      actionCharge: 0,
      catastrophicFall: false,
    },
  };
}
