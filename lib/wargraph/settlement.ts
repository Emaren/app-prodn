import {
  WARGRAPH_MAX_RESOLVED_CONTESTS,
} from "./constants.ts";
import {
  WARGRAPH_SETTLEMENT_JOB_SCHEMA,
} from "./correlation.ts";
import {
  planVerifiedBattleMovement,
} from "./movement.ts";
import {
  calculateWarGraphRewards,
} from "./rewards.ts";
import type {
  WarGraphBattleOutcome,
  WarGraphLayer,
  WarGraphRewardConfig,
  WarGraphRewardComponent,
} from "./types.ts";

const HEX_64 = /^[a-f0-9]{64}$/u;

/**
 * A short ingress holdback lets concurrently delivered final receipts and jobs
 * converge before the monotonic commencement frontier advances. This is not a
 * substitute for the frozen-state and late-arrival fences below.
 */
export const WARGRAPH_SETTLEMENT_HOLDBACK_MS = 60_000 as const;

export type WarGraphSettlementJobPayload = {
  schema: typeof WARGRAPH_SETTLEMENT_JOB_SCHEMA;
  contestId: number;
  liveGameFingerprint: string;
  authoritativeOrderKey: string;
  commencedAt: string;
};

export type WarGraphSettlementPreflight = {
  payload: unknown;
  now: Date;
  evidenceReadyAt: Date;
  contest: {
    id: number;
    liveGameFingerprint: string | null;
    authoritativeOrderKey: string | null;
    commencedAt: Date | null;
    status: string;
  };
  finalClaimCount: number;
  finalClaimFactsExact: boolean;
  immutableFactsExact: boolean;
  latestDesyncOccurred: boolean;
  earlierNonterminalCount: number;
  laterSettledCount: number;
  frozenStateExact: boolean;
  boundPairingSnapshotExact: boolean;
  aggressorActionsUsed: number;
  defenderActionsUsed: number;
};

export type WarGraphSettlementPreflightDecision =
  | {
      kind: "ready";
      payload: WarGraphSettlementJobPayload;
    }
  | {
      kind: "terminal";
      status: "settled" | "voided" | "rejected";
    }
  | {
      kind: "retry";
      code:
        | "WARGRAPH_SETTLEMENT_WATERMARK_PENDING"
        | "WARGRAPH_EARLIER_CONTEST_PENDING"
        | "WARGRAPH_FINAL_EVIDENCE_PENDING";
      detail: string;
      availableAt: Date;
    }
  | {
      kind: "system_void";
      code:
        | "WARGRAPH_AUTHORITATIVE_DESYNC"
        | "WARGRAPH_LATE_AUTHORITATIVE_ORDER"
        | "WARGRAPH_FROZEN_STATE_DRIFT"
        | "WARGRAPH_BOUND_PAIRING_DRIFT"
        | "WARGRAPH_ACTION_CAP_DRIFT";
      detail: string;
    }
  | {
      kind: "dead";
      code:
        | "WARGRAPH_SETTLEMENT_PAYLOAD_INVALID"
        | "WARGRAPH_SETTLEMENT_IDENTITY_MISMATCH"
        | "WARGRAPH_FINAL_EVIDENCE_CONFLICT"
        | "WARGRAPH_IMMUTABLE_FACTS_CONFLICT";
      detail: string;
    };

export type WarGraphVerifiedParticipant = {
  membershipId: number;
  playerId: string;
  userId: number;
  nodeId: number;
  layer: WarGraphLayer;
  occupancyVersion: number;
  membershipVersion: number;
  actionsUsed: number;
};

export type WarGraphVerifiedActionPlan = {
  membershipId: number;
  slot: 1 | 2;
  actionType: "VERIFIED_BATTLE";
};

export type WarGraphVerifiedMovementPlan = {
  membershipId: number;
  fromNodeId: number;
  toNodeId: number;
  fromLayer: WarGraphLayer;
  toLayer: WarGraphLayer;
  expectedOccupancyVersion: number;
  expectedMembershipVersion: number;
  movementType: "BATTLE_ADVANCE" | "CATASTROPHIC_FALL";
  reasonCode:
    | "VERIFIED_INWARD_VICTORY"
    | "VERIFIED_BATTLE_DEFEAT_TO_FRONTIER";
};

export type WarGraphVerifiedRewardPlan = {
  membershipId: number;
  userId: number;
  rewardKind: WarGraphRewardComponent;
  amountWolo: number;
};

export type WarGraphVerifiedResolutionPlan = {
  actions: readonly [
    WarGraphVerifiedActionPlan,
    WarGraphVerifiedActionPlan,
  ];
  movements: readonly WarGraphVerifiedMovementPlan[];
  rewards: readonly WarGraphVerifiedRewardPlan[];
  totalRewardWolo: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function safePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function exactIsoTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString() === value
  );
}

export function parseWarGraphSettlementJobPayload(
  value: unknown,
): WarGraphSettlementJobPayload | null {
  const source = record(value);
  if (
    !source ||
    source.schema !== WARGRAPH_SETTLEMENT_JOB_SCHEMA ||
    !safePositiveInteger(source.contestId) ||
    typeof source.liveGameFingerprint !== "string" ||
    !HEX_64.test(source.liveGameFingerprint) ||
    !exactIsoTimestamp(source.commencedAt) ||
    typeof source.authoritativeOrderKey !== "string" ||
    source.authoritativeOrderKey !==
      `${source.commencedAt}:${source.liveGameFingerprint}` ||
    source.authoritativeOrderKey.length > 160
  ) {
    return null;
  }
  return {
    schema: WARGRAPH_SETTLEMENT_JOB_SCHEMA,
    contestId: source.contestId,
    liveGameFingerprint: source.liveGameFingerprint,
    authoritativeOrderKey: source.authoritativeOrderKey,
    commencedAt: source.commencedAt,
  };
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function retryAt(evidenceReadyAt: Date): Date {
  return new Date(
    evidenceReadyAt.getTime() + WARGRAPH_SETTLEMENT_HOLDBACK_MS,
  );
}

/**
 * Pure fail-closed settlement gate. The Prisma adapter supplies facts reloaded
 * under the game lock followed by the graph lock. A late contest can never
 * move the board behind the already-settled monotonic commencement frontier.
 */
export function preflightWarGraphSettlement(
  input: WarGraphSettlementPreflight,
): WarGraphSettlementPreflightDecision {
  const payload = parseWarGraphSettlementJobPayload(input?.payload);
  if (
    !payload ||
    !Number.isFinite(input?.now?.getTime()) ||
    !Number.isFinite(input?.evidenceReadyAt?.getTime()) ||
    !safePositiveInteger(input?.contest?.id) ||
    !validCount(input.finalClaimCount) ||
    !validCount(input.earlierNonterminalCount) ||
    !validCount(input.laterSettledCount) ||
    !validCount(input.aggressorActionsUsed) ||
    !validCount(input.defenderActionsUsed)
  ) {
    return {
      kind: "dead",
      code: "WARGRAPH_SETTLEMENT_PAYLOAD_INVALID",
      detail: "Settlement input is malformed or outside bounded numeric contracts.",
    };
  }

  if (
    input.contest.id !== payload.contestId ||
    input.contest.liveGameFingerprint !== payload.liveGameFingerprint ||
    input.contest.authoritativeOrderKey !== payload.authoritativeOrderKey ||
    input.contest.commencedAt?.toISOString() !== payload.commencedAt
  ) {
    return {
      kind: "dead",
      code: "WARGRAPH_SETTLEMENT_IDENTITY_MISMATCH",
      detail: "The leased job does not exactly identify the immutable contest.",
    };
  }

  if (
    input.contest.status === "settled" ||
    input.contest.status === "voided" ||
    input.contest.status === "rejected"
  ) {
    return {
      kind: "terminal",
      status: input.contest.status,
    };
  }

  if (input.contest.status !== "qualified") {
    return {
      kind: "dead",
      code: "WARGRAPH_IMMUTABLE_FACTS_CONFLICT",
      detail: "Only a fully qualified contest may enter verified settlement.",
    };
  }

  if (input.finalClaimCount < 2) {
    return {
      kind: "retry",
      code: "WARGRAPH_FINAL_EVIDENCE_PENDING",
      detail: "Two participant-bound final evidence claims are required.",
      availableAt: retryAt(input.evidenceReadyAt),
    };
  }
  if (input.finalClaimCount !== 2 || !input.finalClaimFactsExact) {
    return {
      kind: "dead",
      code: "WARGRAPH_FINAL_EVIDENCE_CONFLICT",
      detail: "Final evidence claims are duplicated, cross-scoped, or inconsistent.",
    };
  }
  if (!input.immutableFactsExact) {
    return {
      kind: "dead",
      code: "WARGRAPH_IMMUTABLE_FACTS_CONFLICT",
      detail: "Canonical replay, roster, winner, or graph scope changed after correlation.",
    };
  }
  if (input.latestDesyncOccurred) {
    return {
      kind: "system_void",
      code: "WARGRAPH_AUTHORITATIVE_DESYNC",
      detail: "Human-confirmed desync truth vetoes movement and rewards.",
    };
  }

  const watermarkAt = retryAt(input.evidenceReadyAt);
  if (input.now < watermarkAt) {
    return {
      kind: "retry",
      code: "WARGRAPH_SETTLEMENT_WATERMARK_PENDING",
      detail: "The bounded evidence ingress watermark has not closed.",
      availableAt: watermarkAt,
    };
  }
  if (input.earlierNonterminalCount > 0) {
    return {
      kind: "retry",
      code: "WARGRAPH_EARLIER_CONTEST_PENDING",
      detail: "An earlier authoritative commencement must resolve first.",
      availableAt: new Date(input.now.getTime() + 5_000),
    };
  }
  if (input.laterSettledCount > 0) {
    return {
      kind: "system_void",
      code: "WARGRAPH_LATE_AUTHORITATIVE_ORDER",
      detail: "Late parser arrival is behind the monotonic settlement frontier.",
    };
  }
  if (!input.boundPairingSnapshotExact) {
    return {
      kind: "system_void",
      code: "WARGRAPH_BOUND_PAIRING_DRIFT",
      detail: "The bound contract no longer matches its frozen start snapshot.",
    };
  }
  if (!input.frozenStateExact) {
    return {
      kind: "system_void",
      code: "WARGRAPH_FROZEN_STATE_DRIFT",
      detail: "Current occupancy no longer equals the frozen contest start state.",
    };
  }
  if (
    input.aggressorActionsUsed >= WARGRAPH_MAX_RESOLVED_CONTESTS ||
    input.defenderActionsUsed >= WARGRAPH_MAX_RESOLVED_CONTESTS
  ) {
    return {
      kind: "system_void",
      code: "WARGRAPH_ACTION_CAP_DRIFT",
      detail: "The immutable action ledger has already consumed a participant's cap.",
    };
  }
  return { kind: "ready", payload };
}

function actionSlot(actionsUsed: number): 1 | 2 | null {
  if (actionsUsed === 0) return 1;
  if (actionsUsed === 1) return 2;
  return null;
}

function validParticipant(
  value: WarGraphVerifiedParticipant,
): boolean {
  return Boolean(
    safePositiveInteger(value?.membershipId) &&
      typeof value.playerId === "string" &&
      value.playerId.trim().length > 0 &&
      safePositiveInteger(value.userId) &&
      safePositiveInteger(value.nodeId) &&
      Number.isSafeInteger(value.occupancyVersion) &&
      value.occupancyVersion >= 0 &&
      Number.isSafeInteger(value.membershipVersion) &&
      value.membershipVersion >= 0 &&
      validCount(value.actionsUsed),
  );
}

/**
 * Converts the constitutional pure movement/reward decisions into exact
 * database identities. Stationary participants receive actions but no fake
 * from==to movement row.
 */
export function buildWarGraphVerifiedResolutionPlan(input: {
  aggressor: WarGraphVerifiedParticipant;
  defender: WarGraphVerifiedParticipant;
  outcome: WarGraphBattleOutcome;
  frontierNodeId: number | null;
  isFirstBlood: boolean;
  rewardConfig: WarGraphRewardConfig;
}): WarGraphVerifiedResolutionPlan | null {
  if (
    !validParticipant(input?.aggressor) ||
    !validParticipant(input?.defender) ||
    input.aggressor.membershipId === input.defender.membershipId
  ) {
    return null;
  }
  const aggressorSlot = actionSlot(input.aggressor.actionsUsed);
  const defenderSlot = actionSlot(input.defender.actionsUsed);
  if (!aggressorSlot || !defenderSlot) return null;

  const movement = planVerifiedBattleMovement({
    aggressor: {
      playerId: input.aggressor.playerId,
      layer: input.aggressor.layer,
      actionsUsed: input.aggressor.actionsUsed,
    },
    defender: {
      playerId: input.defender.playerId,
      layer: input.defender.layer,
      actionsUsed: input.defender.actionsUsed,
    },
    outcome: input.outcome,
  });
  if (!movement.ok || !movement.defender) return null;

  const byPlayerId = new Map([
    [input.aggressor.playerId, input.aggressor],
    [input.defender.playerId, input.defender],
  ]);
  const movements: WarGraphVerifiedMovementPlan[] = [];
  for (const role of [movement.aggressor, movement.defender]) {
    if (role.fromLayer === role.toLayer) continue;
    const participant = byPlayerId.get(role.playerId);
    if (!participant) return null;
    const toNodeId = role.catastrophicFall
      ? input.frontierNodeId
      : role.playerId === input.aggressor.playerId
        ? input.defender.nodeId
        : null;
    if (!safePositiveInteger(toNodeId) || toNodeId === participant.nodeId) {
      return null;
    }
    movements.push({
      membershipId: participant.membershipId,
      fromNodeId: participant.nodeId,
      toNodeId,
      fromLayer: role.fromLayer,
      toLayer: role.toLayer,
      expectedOccupancyVersion: participant.occupancyVersion,
      expectedMembershipVersion: participant.membershipVersion,
      movementType: role.catastrophicFall
        ? "CATASTROPHIC_FALL"
        : "BATTLE_ADVANCE",
      reasonCode: role.catastrophicFall
        ? "VERIFIED_BATTLE_DEFEAT_TO_FRONTIER"
        : "VERIFIED_INWARD_VICTORY",
    });
  }

  const rewardDecision = calculateWarGraphRewards(
    {
      kind: "VERIFIED_BATTLE",
      aggressorLayer: input.aggressor.layer,
      defenderLayer: input.defender.layer,
      outcome: input.outcome,
      isFirstBlood: input.isFirstBlood,
    },
    input.rewardConfig,
  );
  if (!rewardDecision.ok) return null;
  const rewards = rewardDecision.awards.map((award) => {
    const participant =
      award.recipient === "AGGRESSOR"
        ? input.aggressor
        : input.defender;
    return {
      membershipId: participant.membershipId,
      userId: participant.userId,
      rewardKind: award.component,
      amountWolo: award.amountWolo,
    };
  });

  return {
    actions: [
      {
        membershipId: input.aggressor.membershipId,
        slot: aggressorSlot,
        actionType: "VERIFIED_BATTLE",
      },
      {
        membershipId: input.defender.membershipId,
        slot: defenderSlot,
        actionType: "VERIFIED_BATTLE",
      },
    ],
    movements,
    rewards,
    totalRewardWolo: rewardDecision.totalWolo,
  };
}
