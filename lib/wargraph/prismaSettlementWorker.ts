import { ensureVacantWarGraphFrontierNode } from "./frontier.ts";
import { createHash } from "node:crypto";

import {
  Prisma,
  type PrismaClient,
} from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  WARGRAPH_SETTLEMENT_JOB_TYPE,
} from "./correlation.ts";
import { WARGRAPH_ATTESTATION_SCHEMA } from "./attestations.ts";
import {
  appendWarGraphEvent,
  lockWarGraphTransaction,
  WARGRAPH_SLUG,
} from "./foundation.ts";
import { stableWarGraphJson } from "./foundationContract.ts";
import {
  buildWarGraphVerifiedResolutionPlan,
  parseWarGraphSettlementJobPayload,
  preflightWarGraphSettlement,
} from "./settlement.ts";
import type {
  LeasedWarGraphSettlementJob,
  WarGraphSettlementJobTransition,
  WarGraphSettlementPersistedResult,
  WarGraphSettlementWorkerAdapter,
} from "./settlementWorker.ts";
import type {
  WarGraphBattleOutcome,
  WarGraphLayer,
  WarGraphRewardConfig,
} from "./types.ts";
import { WARGRAPH_GRAVITY_JOB_SCHEMA } from "./maintenanceJobsContract.ts";

type TransactionClient = Prisma.TransactionClient;

const HEX_64 = /^[a-f0-9]{64}$/u;
const TERMINAL_CONTEST_STATUSES = new Set([
  "settled",
  "voided",
  "rejected",
]);

type LeasedRow = {
  id: bigint;
  graphId: number;
  payload: unknown;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: Date;
  version: number;
  createdAt: Date;
};

export type WarGraphResolutionAction = {
  membershipId: number;
  slot: 1 | 2;
  actionType:
    | "VERIFIED_BATTLE"
    | "DEFENSE_DEFAULT"
    | "DEFENDER_NO_START_DEFAULT"
    | "CHALLENGER_ABANDONMENT";
  idempotencyKey: string;
};

export type WarGraphResolutionMovement = {
  membershipId: number;
  fromNodeId: number;
  toNodeId: number;
  fromLayerOrdinal: WarGraphLayer;
  toLayerOrdinal: WarGraphLayer;
  expectedOccupancyVersion: number;
  expectedMembershipVersion: number;
  movementType: "BATTLE_ADVANCE" | "SEAT_CLAIM" | "CATASTROPHIC_FALL";
  reasonCode: string;
  sourceKey: string;
  idempotencyKey: string;
};

export type WarGraphResolutionReward = {
  membershipId: number;
  userId: number;
  rewardKind:
    | "FRONTIER_TO_RING_II"
    | "RING_II_TO_RING_I"
    | "FIRST_BLOOD"
    | "CROWN_BATTLE_WINNER";
  amountWolo: bigint;
  settlementKey: string;
  payoutRequestId: string;
  recipientWalletSnapshot: string | null;
  policyHash: string;
};

export type WarGraphResolutionTerminal = {
  status: "settled" | "voided" | "rejected";
  qualificationStatus: "eligible" | "ineligible" | "system_void";
  qualificationReason:
    | "WARGRAPH_ELIGIBLE"
    | "INELIGIBLE_GRAPH_STATE_AT_START"
    | null;
  resultStatus: "verified" | "no_battle" | "void";
  outcomeCode: "AGGRESSOR_WIN" | "DEFENDER_WIN" | null;
  winnerMembershipId: number | null;
  loserMembershipId: number | null;
  settlementKey: string | null;
  eventType: string;
  eventIdempotencyKey: string;
  eventPayload: Prisma.InputJsonObject;
  pairingStatus: "settled" | "voided" | null;
  advanceStatus: "settled" | "system_void" | null;
  defenseObligationStatus?: "released" | "defaulted" | "system_void";
  resolutionCode: string;
};

export type WarGraphResolutionTransactionInput = {
  graphId: number;
  nightId: number;
  rulesetId: number;
  contestId: number;
  expectedContestVersion: number;
  expectedContestStatuses: readonly string[];
  pairingId: number | null;
  advanceRequestId: number | null;
  occurredAt: Date;
  actions?: readonly WarGraphResolutionAction[];
  movements?: readonly WarGraphResolutionMovement[];
  rewards?: readonly WarGraphResolutionReward[];
  terminal: WarGraphResolutionTerminal;
  enqueueGravity?: boolean;
};

export type WarGraphResolutionTransactionResult = {
  applied: boolean;
  contestId: number;
  status: "settled" | "voided" | "rejected";
  eventId: bigint;
  movementCount: number;
  rewardCount: number;
  gravityJobCreated: boolean;
};

function exactJson(left: unknown, right: unknown): boolean {
  return stableWarGraphJson(left) === stableWarGraphJson(right);
}

function permanent(
  code: string,
  detail: string,
): WarGraphSettlementPersistedResult {
  return { kind: "dead", code, detail };
}

function temporary(
  code: string,
  detail: string,
  availableAt?: Date,
): WarGraphSettlementPersistedResult {
  return { kind: "retry", code, detail, availableAt };
}

function sha256(value: unknown): string {
  return createHash("sha256")
    .update(stableWarGraphJson(value))
    .digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function asHexArray(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((row) => typeof row !== "string" || !HEX_64.test(row))
  ) {
    return null;
  }
  return [...new Set(value)].sort();
}

function safeInteger(value: bigint): number | null {
  if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(value);
}

async function lockGameThenGraph(
  tx: TransactionClient,
  gameStatsId: number,
  graphId: number,
): Promise<void> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(${gameStatsId})
  `;
  await lockWarGraphTransaction(tx, graphId);
}

function requireBoundedIdentity(value: string, code: string): void {
  if (!value || value.length > 160) throw new Error(code);
}

function unique<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

async function exactTerminalReplay(
  tx: TransactionClient,
  contest: {
    id: number;
    status: string;
    settlementKey: string | null;
    graphId: number;
    nightId: number;
    rulesetId: number;
    pairingId: number | null;
    advanceRequestId: number | null;
    publicId: string;
  },
  input: WarGraphResolutionTransactionInput,
): Promise<WarGraphResolutionTransactionResult> {
  const actions = input.actions ?? [];
  const movements = input.movements ?? [];
  const rewards = input.rewards ?? [];
  if (
    contest.status !== input.terminal.status ||
    contest.settlementKey !== input.terminal.settlementKey ||
    contest.graphId !== input.graphId ||
    contest.nightId !== input.nightId ||
    contest.rulesetId !== input.rulesetId ||
    contest.pairingId !== input.pairingId ||
    contest.advanceRequestId !== input.advanceRequestId
  ) {
    throw new Error("WARGRAPH_TERMINAL_RESOLUTION_CONFLICT");
  }
  const [storedActions, storedMovements, storedRewards, event] =
    await Promise.all([
      tx.warGraphAction.findMany({
        where: { contestId: contest.id },
        select: { idempotencyKey: true },
      }),
      tx.warGraphMovement.findMany({
        where: { contestId: contest.id },
        select: { idempotencyKey: true },
      }),
      tx.warGraphReward.findMany({
        where: { contestId: contest.id },
        select: { settlementKey: true },
      }),
      tx.warGraphEvent.findUnique({
        where: { idempotencyKey: input.terminal.eventIdempotencyKey },
      }),
    ]);
  const sameKeys = (stored: readonly string[], expected: readonly string[]) =>
    stored.length === expected.length &&
    [...stored].sort().every((row, index) => row === [...expected].sort()[index]);
  if (
    !event ||
    event.graphId !== input.graphId ||
    event.nightId !== input.nightId ||
    event.contestId !== contest.id ||
    event.aggregateType !== "contest" ||
    event.aggregateId !== contest.publicId ||
    event.eventType !== input.terminal.eventType ||
    !exactJson(event.payload, input.terminal.eventPayload) ||
    !sameKeys(
      storedActions.map((row) => row.idempotencyKey),
      actions.map((row) => row.idempotencyKey),
    ) ||
    !sameKeys(
      storedMovements.map((row) => row.idempotencyKey),
      movements.map((row) => row.idempotencyKey),
    ) ||
    !sameKeys(
      storedRewards.map((row) => row.settlementKey),
      rewards.map((row) => row.settlementKey),
    )
  ) {
    throw new Error("WARGRAPH_TERMINAL_LEDGER_CONFLICT");
  }
  return {
    applied: false,
    contestId: contest.id,
    status: input.terminal.status,
    eventId: event.id,
    movementCount: movements.length,
    rewardCount: rewards.length,
    gravityJobCreated: false,
  };
}

/**
 * Transaction-scoped exactly-once terminal primitive. Callers must already be
 * inside a Serializable transaction. A battle caller must acquire the game
 * advisory lock first; this helper then takes the WarGraph lock. It never
 * executes a payout and contains no deadline/default policy.
 */
export async function applyWarGraphResolutionExactlyOnce(
  tx: TransactionClient,
  input: WarGraphResolutionTransactionInput,
): Promise<WarGraphResolutionTransactionResult> {
  if (
    !Number.isSafeInteger(input.graphId) || input.graphId < 1 ||
    !Number.isSafeInteger(input.nightId) || input.nightId < 1 ||
    !Number.isSafeInteger(input.rulesetId) || input.rulesetId < 1 ||
    !Number.isSafeInteger(input.contestId) || input.contestId < 1 ||
    !Number.isSafeInteger(input.expectedContestVersion) ||
    input.expectedContestVersion < 0 ||
    !Number.isFinite(input.occurredAt.getTime()) ||
    input.expectedContestStatuses.length === 0
  ) {
    throw new Error("WARGRAPH_RESOLUTION_INPUT_INVALID");
  }
  requireBoundedIdentity(
    input.terminal.eventIdempotencyKey,
    "WARGRAPH_EVENT_KEY_INVALID",
  );
  if (input.terminal.settlementKey) {
    requireBoundedIdentity(
      input.terminal.settlementKey,
      "WARGRAPH_SETTLEMENT_KEY_INVALID",
    );
  }
  await lockWarGraphTransaction(tx, input.graphId);

  const actions = input.actions ?? [];
  const movements = input.movements ?? [];
  const rewards = input.rewards ?? [];
  if (
    !unique(actions.map((row) => row.membershipId)) ||
    !unique(actions.map((row) => row.idempotencyKey)) ||
    !unique(movements.map((row) => row.membershipId)) ||
    !unique(movements.map((row) => row.fromNodeId)) ||
    !unique(movements.map((row) => row.toNodeId)) ||
    !unique(movements.map((row) => row.sourceKey)) ||
    !unique(movements.map((row) => row.idempotencyKey)) ||
    !unique(rewards.map((row) => row.rewardKind)) ||
    !unique(rewards.map((row) => row.settlementKey)) ||
    !unique(rewards.map((row) => row.payoutRequestId))
  ) {
    throw new Error("WARGRAPH_RESOLUTION_IDENTITIES_NOT_UNIQUE");
  }

  const contest = await tx.warGraphContest.findUnique({
    where: { id: input.contestId },
    select: {
      id: true,
      publicId: true,
      graphId: true,
      nightId: true,
      rulesetId: true,
      pairingId: true,
      advanceRequestId: true,
      aggressorMembershipId: true,
      defenderMembershipId: true,
      status: true,
      settlementKey: true,
      version: true,
    },
  });
  if (!contest) throw new Error("WARGRAPH_CONTEST_NOT_FOUND");
  if (TERMINAL_CONTEST_STATUSES.has(contest.status)) {
    return exactTerminalReplay(tx, contest, input);
  }
  if (
    contest.graphId !== input.graphId ||
    contest.nightId !== input.nightId ||
    contest.rulesetId !== input.rulesetId ||
    contest.pairingId !== input.pairingId ||
    contest.advanceRequestId !== input.advanceRequestId ||
    contest.version !== input.expectedContestVersion ||
    !input.expectedContestStatuses.includes(contest.status)
  ) {
    throw new Error("WARGRAPH_CONTEST_RESOLUTION_CAS_LOST");
  }
  const participants = new Set([
    contest.aggressorMembershipId,
    contest.defenderMembershipId,
  ]);
  if (
    [...actions, ...movements, ...rewards].some(
      (row) => !participants.has(row.membershipId),
    )
  ) {
    throw new Error("WARGRAPH_RESOLUTION_PARTICIPANT_SCOPE_MISMATCH");
  }
  const terminalParticipantIds = [
    input.terminal.winnerMembershipId,
    input.terminal.loserMembershipId,
  ].filter((value): value is number => value !== null);
  if (
    terminalParticipantIds.some((id) => !participants.has(id)) ||
    terminalParticipantIds.length === 1 ||
    (terminalParticipantIds.length === 2 &&
      terminalParticipantIds[0] === terminalParticipantIds[1])
  ) {
    throw new Error("WARGRAPH_RESOLUTION_RESULT_SCOPE_MISMATCH");
  }

  const nodeIds = [
    ...new Set(
      movements.flatMap((movement) => [
        movement.fromNodeId,
        movement.toNodeId,
      ]),
    ),
  ];
  const [night, ruleset, memberRows, nodeRows, pairing, advance, settlementCollision] =
    await Promise.all([
      tx.warGraphNight.findUnique({
        where: { id: input.nightId },
        select: { graphId: true, rulesetId: true },
      }),
      tx.warGraphRuleset.findUnique({
        where: { id: input.rulesetId },
        select: { graphId: true },
      }),
      tx.warGraphMembership.findMany({
        where: { id: { in: [...participants] } },
        select: { id: true, graphId: true, userId: true },
      }),
      nodeIds.length
        ? tx.warGraphNode.findMany({
            where: { id: { in: nodeIds } },
            select: {
              id: true,
              graphId: true,
              layer: { select: { ordinal: true } },
            },
          })
        : Promise.resolve([]),
      input.pairingId
        ? tx.warGraphPairing.findUnique({
            where: { id: input.pairingId },
            select: {
              graphId: true,
              nightId: true,
              rulesetId: true,
              advanceRequestId: true,
              aggressorMembershipId: true,
              defenderMembershipId: true,
              status: true,
              resolvedAt: true,
            },
          })
        : Promise.resolve(null),
      input.advanceRequestId
        ? tx.warGraphAdvanceRequest.findUnique({
            where: { id: input.advanceRequestId },
            select: {
              graphId: true,
              nightId: true,
              rulesetId: true,
              challengerMembershipId: true,
              status: true,
              resolvedAt: true,
            },
          })
        : Promise.resolve(null),
      input.terminal.settlementKey
        ? tx.warGraphContest.findFirst({
            where: {
              settlementKey: input.terminal.settlementKey,
              id: { not: input.contestId },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
  const memberById = new Map(memberRows.map((row) => [row.id, row]));
  const nodeById = new Map(nodeRows.map((row) => [row.id, row]));
  if (
    !night ||
    night.graphId !== input.graphId ||
    night.rulesetId !== input.rulesetId ||
    !ruleset ||
    ruleset.graphId !== input.graphId ||
    memberRows.length !== 2 ||
    memberRows.some((row) => row.graphId !== input.graphId) ||
    settlementCollision ||
    (input.pairingId !== null &&
      (!pairing ||
        pairing.graphId !== input.graphId ||
        pairing.nightId !== input.nightId ||
        pairing.rulesetId !== input.rulesetId ||
        pairing.advanceRequestId !== input.advanceRequestId ||
        pairing.aggressorMembershipId !== contest.aggressorMembershipId ||
        pairing.defenderMembershipId !== contest.defenderMembershipId)) ||
    (input.advanceRequestId !== null &&
      (!advance ||
        advance.graphId !== input.graphId ||
        advance.nightId !== input.nightId ||
        advance.rulesetId !== input.rulesetId ||
        advance.challengerMembershipId !== contest.aggressorMembershipId)) ||
    movements.some((movement) => {
      const from = nodeById.get(movement.fromNodeId);
      const to = nodeById.get(movement.toNodeId);
      return (
        !from ||
        !to ||
        from.graphId !== input.graphId ||
        to.graphId !== input.graphId ||
        from.layer.ordinal !== movement.fromLayerOrdinal ||
        to.layer.ordinal !== movement.toLayerOrdinal
      );
    }) ||
    rewards.some(
      (reward) =>
        memberById.get(reward.membershipId)?.userId !== reward.userId,
    )
  ) {
    throw new Error("WARGRAPH_RESOLUTION_SCOPE_MISMATCH");
  }

  const [eventCollision, actionCollisions, movementCollisions, rewardCollisions] =
    await Promise.all([
      tx.warGraphEvent.findUnique({
        where: { idempotencyKey: input.terminal.eventIdempotencyKey },
        select: { id: true },
      }),
      actions.length
        ? tx.warGraphAction.findMany({
            where: {
              OR: [
                { idempotencyKey: { in: actions.map((row) => row.idempotencyKey) } },
                {
                  contestId: input.contestId,
                  membershipId: { in: actions.map((row) => row.membershipId) },
                },
                ...actions.map((row) => ({
                  nightId: input.nightId,
                  membershipId: row.membershipId,
                  slot: row.slot,
                })),
              ],
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      movements.length
        ? tx.warGraphMovement.findMany({
            where: {
              OR: [
                { sourceKey: { in: movements.map((row) => row.sourceKey) } },
                { idempotencyKey: { in: movements.map((row) => row.idempotencyKey) } },
                {
                  contestId: input.contestId,
                  membershipId: { in: movements.map((row) => row.membershipId) },
                },
              ],
            },
            select: { id: true },
          })
        : Promise.resolve([]),
      rewards.length
        ? tx.warGraphReward.findMany({
            where: {
              OR: [
                { settlementKey: { in: rewards.map((row) => row.settlementKey) } },
                { payoutRequestId: { in: rewards.map((row) => row.payoutRequestId) } },
                {
                  contestId: input.contestId,
                  rewardKind: { in: rewards.map((row) => row.rewardKind) },
                },
                ...(rewards.some((row) => row.rewardKind === "FIRST_BLOOD")
                  ? [{
                      nightId: input.nightId,
                      rewardKind: "FIRST_BLOOD",
                    }]
                  : []),
              ],
            },
            select: { id: true },
          })
        : Promise.resolve([]),
    ]);
  if (
    eventCollision ||
    actionCollisions.length ||
    movementCollisions.length ||
    rewardCollisions.length
  ) {
    throw new Error("WARGRAPH_RESOLUTION_IDENTITY_COLLISION");
  }

  await tx.$executeRaw`
    SET CONSTRAINTS "uq_war_graph_occupancies_node_graph" DEFERRED
  `;
  for (const movement of movements) {
    requireBoundedIdentity(movement.sourceKey, "WARGRAPH_MOVEMENT_KEY_INVALID");
    requireBoundedIdentity(
      movement.idempotencyKey,
      "WARGRAPH_MOVEMENT_KEY_INVALID",
    );
    const occupancy = await tx.warGraphOccupancy.updateMany({
      where: {
        graphId: input.graphId,
        membershipId: movement.membershipId,
        nodeId: movement.fromNodeId,
        version: movement.expectedOccupancyVersion,
      },
      data: {
        nodeId: movement.toNodeId,
        occupiedAt: input.occurredAt,
        version: { increment: 1 },
      },
    });
    const membership = await tx.warGraphMembership.updateMany({
      where: {
        id: movement.membershipId,
        graphId: input.graphId,
        status: "active",
        version: movement.expectedMembershipVersion,
      },
      data: {
        version: { increment: 1 },
        lastParticipationAt: input.occurredAt,
        dormantNights: 0,
        fossilizationStage: 0,
      },
    });
    if (occupancy.count !== 1 || membership.count !== 1) {
      throw new Error("WARGRAPH_FROZEN_STATE_CAS_LOST");
    }
  }
  const movedMembers = new Set(movements.map((row) => row.membershipId));
  if (actions.length) {
    await tx.warGraphMembership.updateMany({
      where: {
        id: {
          in: actions
            .map((row) => row.membershipId)
            .filter((id) => !movedMembers.has(id)),
        },
        graphId: input.graphId,
        status: "active",
      },
      data: {
        lastParticipationAt: input.occurredAt,
        dormantNights: 0,
        fossilizationStage: 0,
      },
    });
  }

  for (const action of actions) {
    requireBoundedIdentity(action.idempotencyKey, "WARGRAPH_ACTION_KEY_INVALID");
    await tx.warGraphAction.create({
      data: {
        graphId: input.graphId,
        nightId: input.nightId,
        contestId: input.contestId,
        membershipId: action.membershipId,
        slot: action.slot,
        actionType: action.actionType,
        idempotencyKey: action.idempotencyKey,
        appliedAt: input.occurredAt,
      },
    });
  }
  for (const movement of movements) {
    await tx.warGraphMovement.create({
      data: {
        graphId: input.graphId,
        nightId: input.nightId,
        contestId: input.contestId,
        membershipId: movement.membershipId,
        fromNodeId: movement.fromNodeId,
        toNodeId: movement.toNodeId,
        fromLayerOrdinal: movement.fromLayerOrdinal,
        toLayerOrdinal: movement.toLayerOrdinal,
        movementType: movement.movementType,
        reasonCode: movement.reasonCode,
        sourceKey: movement.sourceKey,
        idempotencyKey: movement.idempotencyKey,
        membershipVersionBefore: movement.expectedMembershipVersion,
        membershipVersionAfter: movement.expectedMembershipVersion + 1,
        movedAt: input.occurredAt,
      },
    });
  }

  const newVersion = contest.version + 1;
  const event = await appendWarGraphEvent(tx, {
    graphId: input.graphId,
    nightId: input.nightId,
    pairingId: input.pairingId,
    advanceRequestId: input.advanceRequestId,
    contestId: input.contestId,
    aggregateType: "contest",
    aggregateId: contest.publicId,
    eventType: input.terminal.eventType,
    idempotencyKey: input.terminal.eventIdempotencyKey,
    priorVersion: contest.version,
    newVersion,
    payload: input.terminal.eventPayload,
    occurredAt: input.occurredAt,
  });
  for (const reward of rewards) {
    requireBoundedIdentity(reward.settlementKey, "WARGRAPH_REWARD_KEY_INVALID");
    requireBoundedIdentity(reward.payoutRequestId, "WARGRAPH_REWARD_KEY_INVALID");
    if (reward.amountWolo <= BigInt(0) || !HEX_64.test(reward.policyHash)) {
      throw new Error("WARGRAPH_REWARD_INPUT_INVALID");
    }
    await tx.warGraphReward.create({
      data: {
        graphId: input.graphId,
        nightId: input.nightId,
        rulesetId: input.rulesetId,
        contestId: input.contestId,
        eventId: event.id,
        membershipId: reward.membershipId,
        userId: reward.userId,
        rewardKind: reward.rewardKind,
        amountWolo: reward.amountWolo,
        settlementKey: reward.settlementKey,
        payoutRequestId: reward.payoutRequestId,
        recipientWalletSnapshot: reward.recipientWalletSnapshot,
        policyHash: reward.policyHash,
        entitledAt: input.occurredAt,
      },
    });
  }

  const terminalUpdate = await tx.warGraphContest.updateMany({
    where: {
      id: contest.id,
      graphId: input.graphId,
      status: contest.status,
      version: contest.version,
    },
    data: {
      qualificationStatus: input.terminal.qualificationStatus,
      qualificationReason: input.terminal.qualificationReason,
      resultStatus: input.terminal.resultStatus,
      outcomeCode: input.terminal.outcomeCode,
      winnerMembershipId: input.terminal.winnerMembershipId,
      loserMembershipId: input.terminal.loserMembershipId,
      settlementKey: input.terminal.settlementKey,
      status: input.terminal.status,
      settledAt: input.occurredAt,
      version: { increment: 1 },
    },
  });
  if (terminalUpdate.count !== 1) {
    throw new Error("WARGRAPH_CONTEST_RESOLUTION_CAS_LOST");
  }

  if (input.pairingId) {
    const targetPairingStatus = input.terminal.pairingStatus ?? "voided";
    if (pairing?.status !== targetPairingStatus || !pairing.resolvedAt) {
      const pairingUpdate = await tx.warGraphPairing.updateMany({
        where: {
          id: input.pairingId,
          graphId: input.graphId,
          nightId: input.nightId,
          status: { in: ["accepted", "engaged", "live"] },
        },
        data: {
          status: targetPairingStatus,
          resolvedAt: input.occurredAt,
          version: { increment: 1 },
        },
      });
      if (pairingUpdate.count !== 1) {
        throw new Error("WARGRAPH_PAIRING_RESOLUTION_CAS_LOST");
      }
    }
    await tx.warGraphEngagement.updateMany({
      where: {
        graphId: input.graphId,
        pairingId: input.pairingId,
        status: "active",
      },
      data: {
        status: "released",
        releasedAt: input.occurredAt,
        version: { increment: 1 },
      },
    });
  }
  if (input.advanceRequestId) {
    const targetAdvanceStatus = input.terminal.advanceStatus ?? "system_void";
    if (advance?.status !== targetAdvanceStatus || !advance.resolvedAt) {
      const advanceUpdate = await tx.warGraphAdvanceRequest.updateMany({
        where: {
          id: input.advanceRequestId,
          graphId: input.graphId,
          nightId: input.nightId,
          status: { in: ["open", "accepted", "bound"] },
        },
        data: {
          status: targetAdvanceStatus,
          resolvedAt: input.occurredAt,
          resolutionCode: input.terminal.resolutionCode,
          version: { increment: 1 },
        },
      });
      if (advanceUpdate.count !== 1) {
        throw new Error("WARGRAPH_ADVANCE_RESOLUTION_CAS_LOST");
      }
    }
    await tx.warGraphDefenseObligation.updateMany({
      where: {
        graphId: input.graphId,
        advanceRequestId: input.advanceRequestId,
        status: "pending",
      },
      data: {
        status: input.terminal.defenseObligationStatus ??
          (input.terminal.advanceStatus === "settled"
            ? "released"
            : "system_void"),
        resolutionCode: input.terminal.resolutionCode,
        resolvedAt: input.occurredAt,
        version: { increment: 1 },
      },
    });
  }

  let gravityJobCreated = false;
  if (input.enqueueGravity) {
    const dedupeKey = `wargraph:gravity:${input.nightId}:${input.contestId}`;
    const payload = {
      schema: WARGRAPH_GRAVITY_JOB_SCHEMA,
      nightId: input.nightId,
      triggerContestId: input.contestId,
    } as const;
    const existing = await tx.warGraphJob.findUnique({
      where: { dedupeKey },
    });
    if (
      existing &&
      (existing.graphId !== input.graphId ||
        existing.jobType !== "apply_gravity" ||
        !exactJson(existing.payload, payload))
    ) {
      throw new Error("WARGRAPH_GRAVITY_JOB_IDENTITY_COLLISION");
    }
    if (!existing) {
      await tx.warGraphJob.create({
        data: {
          graphId: input.graphId,
          jobType: "apply_gravity",
          dedupeKey,
          payload,
          availableAt: input.occurredAt,
        },
      });
      gravityJobCreated = true;
    }
  }
  await Promise.all([
    tx.warGraph.update({
      where: { id: input.graphId },
      data: { projectionVersion: { increment: 1 } },
    }),
    tx.warGraphNight.update({
      where: { id: input.nightId },
      data: { version: { increment: 1 } },
    }),
  ]);
  return {
    applied: true,
    contestId: contest.id,
    status: input.terminal.status,
    eventId: event.id,
    movementCount: movements.length,
    rewardCount: rewards.length,
    gravityJobCreated,
  };
}

const settlementContestArgs =
  Prisma.validator<Prisma.WarGraphContestDefaultArgs>()({
    include: {
      graph: {
        select: { id: true, slug: true, status: true },
      },
      night: {
        select: { id: true, graphId: true, rulesetId: true },
      },
      ruleset: {
        select: {
          id: true,
          graphId: true,
          rulesetHash: true,
          maxResolvedActions: true,
          frontierAdvanceWolo: true,
          ringTwoAdvanceWolo: true,
          firstCrownBloodWolo: true,
          crownVictoryWolo: true,
          nightlyPayoutCeilingWolo: true,
        },
      },
      gameStats: {
        select: { id: true, replayHash: true, is_final: true },
      },
      aggressorStartNode: {
        include: { layer: { select: { ordinal: true } } },
      },
      defenderStartNode: {
        include: { layer: { select: { ordinal: true } } },
      },
      aggressor: {
        include: {
          user: { select: { walletAddress: true } },
          occupancy: {
            include: { node: { include: { layer: true } } },
          },
        },
      },
      defender: {
        include: {
          user: { select: { walletAddress: true } },
          occupancy: {
            include: { node: { include: { layer: true } } },
          },
        },
      },
      pairing: true,
      attestations: {
        where: { evidencePhase: "final" },
        include: { attestation: true, membership: true },
        orderBy: [{ participantRole: "asc" }, { id: "asc" }],
      },
    },
  });

type SettlementContest = Prisma.WarGraphContestGetPayload<
  typeof settlementContestArgs
>;

function claimsAreExact(contest: SettlementContest): boolean {
  const claims = contest.attestations;
  if (
    claims.length !== 2 ||
    claims.some((claim) => claim.evidencePhase !== "final") ||
    new Set(claims.map((claim) => claim.membershipId)).size !== 2 ||
    new Set(claims.map((claim) => claim.uploaderUserId)).size !== 2 ||
    new Set(claims.map((claim) => claim.participantRole)).size !== 2
  ) {
    return false;
  }
  const byRole = new Map(
    claims.map((claim) => [claim.participantRole, claim]),
  );
  const aggressor = byRole.get("aggressor");
  const defender = byRole.get("defender");
  if (
    !aggressor ||
    !defender ||
    aggressor.membershipId !== contest.aggressorMembershipId ||
    defender.membershipId !== contest.defenderMembershipId ||
    aggressor.uploaderUserId !== contest.aggressor.userId ||
    defender.uploaderUserId !== contest.defender.userId
  ) {
    return false;
  }
  const evidence = claims.map((claim) => claim.attestation);
  const rosterSets = evidence.map((row) => asHexArray(row.rosterPlayerKeyHashes));
  const winnerSets = evidence.map((row) => asHexArray(row.winningPlayerKeyHashes));
  const uploaderHashes = evidence.map((row) => row.uploaderPlayerKeyHash);
  const expectedWinner =
    contest.winnerMembershipId === contest.aggressorMembershipId
      ? aggressor.attestation.uploaderPlayerKeyHash
      : contest.winnerMembershipId === contest.defenderMembershipId
        ? defender.attestation.uploaderPlayerKeyHash
        : null;
  if (
    rosterSets.some((row) => !row || row.length !== 2) ||
    winnerSets.some((row) => !row || row.length !== 1) ||
    uploaderHashes.some((row) => !row || !HEX_64.test(row)) ||
    new Set(uploaderHashes).size !== 2 ||
    !exactJson(rosterSets[0], rosterSets[1]) ||
    !exactJson(winnerSets[0], winnerSets[1]) ||
    !expectedWinner ||
    winnerSets[0]?.[0] !== expectedWinner ||
    !rosterSets[0]?.includes(uploaderHashes[0] as string) ||
    !rosterSets[0]?.includes(uploaderHashes[1] as string) ||
    new Set(evidence.map((row) => row.watcherIdentityHash)).size !== 2 ||
    new Set(evidence.map((row) => row.watcherSessionHash)).size !== 2
  ) {
    return false;
  }
  for (const claim of claims) {
    const row = claim.attestation;
    const expectedValidationHash = sha256({
      schema: "aoe2war-wargraph-contest-evidence-link/v1",
      contestKey: contest.idempotencyKey,
      attestationId: row.id.toString(),
      receiptHash: row.receiptHash,
      membershipId: claim.membershipId,
      uploaderUserId: claim.uploaderUserId,
      participantRole: claim.participantRole,
      evidencePhase: "final",
    });
    if (
      claim.membership.graphId !== contest.graphId ||
      claim.membership.userId !== claim.uploaderUserId ||
      sha256Text(
        claim.membership.playerKey.trim().toLocaleLowerCase("en-US"),
      ) !== row.uploaderPlayerKeyHash ||
      row.sourceSchema !== WARGRAPH_ATTESTATION_SCHEMA ||
      row.uploaderUserId !== claim.uploaderUserId ||
      row.gameStatsId !== contest.gameStatsId ||
      row.liveGameFingerprint !== contest.liveGameFingerprint ||
      row.platformMatchId !== contest.platformMatchId ||
      row.rosterHash !== contest.rosterHash ||
      row.resultHash !== contest.resultHash ||
      row.commencedAt?.getTime() !== contest.commencedAt?.getTime() ||
      row.ingestionProvenance !== "live_monitor" ||
      !row.liveProvenance ||
      !row.provenanceSignatureVerified ||
      !row.participantBound ||
      !row.isFinal ||
      !row.archiveVerified ||
      !row.resultTrusted ||
      claim.validationHash !== expectedValidationHash ||
      claim.idempotencyKey !== `wargraph-claim:final:${row.receiptHash}`
    ) {
      return false;
    }
  }
  return true;
}

function immutableContestFactsAreExact(
  contest: SettlementContest,
  adjudication: {
    decisionStatus: string;
    sourceReplayHash: string;
    sourceRosterHash: string;
    sourcePropositionHash: string;
    winningPlayerKeys: unknown;
  } | null,
): boolean {
  const evidenceReplayHashes = new Set(
    contest.attestations.map((claim) => claim.attestation.replayHash),
  );
  const evidenceWinnerHashes = asHexArray(
    contest.attestations[0]?.attestation.winningPlayerKeyHashes,
  );
  const adjudicatedWinnerHashes = Array.isArray(adjudication?.winningPlayerKeys)
    ? adjudication.winningPlayerKeys
        .filter(
          (value): value is string =>
            typeof value === "string" && value.trim().length > 0,
        )
        .map((value) =>
          sha256Text(value.trim().toLocaleLowerCase("en-US")),
        )
        .sort()
    : null;
  return Boolean(
    contest.graph.slug === WARGRAPH_SLUG &&
      contest.graph.status === "active" &&
      contest.graphId === contest.night.graphId &&
      contest.night.rulesetId === contest.rulesetId &&
      contest.ruleset.graphId === contest.graphId &&
      contest.gameStats &&
      contest.gameStats.id === contest.gameStatsId &&
      contest.gameStats.is_final &&
      evidenceReplayHashes.size === 1 &&
      evidenceReplayHashes.has(contest.gameStats.replayHash) &&
      contest.kind === "VERIFIED_BATTLE" &&
      contest.provenance === "LIVE_DOUBLE_WATCHER" &&
      contest.qualificationStatus === "eligible" &&
      contest.qualificationReason === "WARGRAPH_ELIGIBLE" &&
      contest.resultStatus === "verified" &&
      (contest.outcomeCode === "AGGRESSOR_WIN" ||
        contest.outcomeCode === "DEFENDER_WIN") &&
      contest.liveGameFingerprint !== null &&
      HEX_64.test(contest.liveGameFingerprint) &&
      contest.authoritativeOrderKey ===
        `${contest.commencedAt?.toISOString()}:${contest.liveGameFingerprint}` &&
      contest.rosterHash !== null && HEX_64.test(contest.rosterHash) &&
      contest.propositionHash !== null && HEX_64.test(contest.propositionHash) &&
      contest.resultHash !== null && HEX_64.test(contest.resultHash) &&
      contest.winnerMembershipId !== null &&
      contest.loserMembershipId !== null &&
      contest.winnerMembershipId !== contest.loserMembershipId &&
      new Set([
        contest.winnerMembershipId,
        contest.loserMembershipId,
      ]).size === 2 &&
      [
        contest.aggressorMembershipId,
        contest.defenderMembershipId,
      ].includes(contest.winnerMembershipId) &&
      [
        contest.aggressorMembershipId,
        contest.defenderMembershipId,
      ].includes(contest.loserMembershipId) &&
      adjudication?.decisionStatus === "accepted" &&
      adjudication.sourceReplayHash === contest.gameStats.replayHash &&
      adjudication.sourceRosterHash === contest.rosterHash &&
      adjudication.sourcePropositionHash === contest.propositionHash &&
      evidenceWinnerHashes !== null &&
      adjudicatedWinnerHashes !== null &&
      exactJson(evidenceWinnerHashes, adjudicatedWinnerHashes) &&
      contest.aggressorStartNode.graphId === contest.graphId &&
      contest.defenderStartNode.graphId === contest.graphId &&
      contest.aggressorStartNode.layer.ordinal ===
        contest.aggressorStartLayerOrdinal &&
      contest.defenderStartNode.layer.ordinal ===
        contest.defenderStartLayerOrdinal,
  );
}

function boundPairingIsExact(contest: SettlementContest): boolean {
  const pairing = contest.pairing;
  if (!pairing) return contest.pairingId === null;
  return Boolean(
    pairing.id === contest.pairingId &&
      pairing.graphId === contest.graphId &&
      pairing.nightId === contest.nightId &&
      pairing.rulesetId === contest.rulesetId &&
      pairing.advanceRequestId === contest.advanceRequestId &&
      pairing.aggressorMembershipId === contest.aggressorMembershipId &&
      pairing.defenderMembershipId === contest.defenderMembershipId &&
      pairing.aggressorStartNodeId === contest.aggressorStartNodeId &&
      pairing.defenderStartNodeId === contest.defenderStartNodeId &&
      pairing.aggressorStartLayerOrdinal ===
        contest.aggressorStartLayerOrdinal &&
      pairing.defenderStartLayerOrdinal ===
        contest.defenderStartLayerOrdinal &&
      pairing.aggressorStartVersion === contest.aggressorStartVersion &&
      pairing.defenderStartVersion === contest.defenderStartVersion &&
      pairing.commencedAt?.getTime() === contest.commencedAt?.getTime() &&
      pairing.status === "live",
  );
}

function frozenStateIsExact(contest: SettlementContest): boolean {
  const aggressor = contest.aggressor;
  const defender = contest.defender;
  return Boolean(
    aggressor.graphId === contest.graphId &&
      defender.graphId === contest.graphId &&
      aggressor.status === "active" &&
      defender.status === "active" &&
      aggressor.occupancy?.graphId === contest.graphId &&
      defender.occupancy?.graphId === contest.graphId &&
      aggressor.occupancy.nodeId === contest.aggressorStartNodeId &&
      defender.occupancy.nodeId === contest.defenderStartNodeId &&
      aggressor.occupancy.version === contest.aggressorStartVersion &&
      defender.occupancy.version === contest.defenderStartVersion &&
      aggressor.occupancy.node.layer.ordinal ===
        contest.aggressorStartLayerOrdinal &&
      defender.occupancy.node.layer.ordinal ===
        contest.defenderStartLayerOrdinal,
  );
}

async function authoritativeStartStateIsExact(
  tx: TransactionClient,
  contest: SettlementContest,
): Promise<boolean> {
  if (!contest.commencedAt || !contest.authoritativeOrderKey) return false;
  const reconstruct = async (membershipId: number) => {
    const rows = await tx.$queryRaw<Array<{
      nodeId: number;
      layerOrdinal: number;
      occupancyVersion: number;
    }>>(Prisma.sql`
      WITH authoritative AS (
        SELECT
          movement."id",
          movement."to_node_id" AS "nodeId",
          movement."to_layer_ordinal" AS "layerOrdinal",
          (COUNT(*) OVER ())::integer - 1 AS "occupancyVersion",
          COALESCE(contest."commenced_at", movement."moved_at") AS "effectiveAt",
          COALESCE(contest."authoritative_order_key", '') AS "orderKey"
        FROM "war_graph_movements" movement
        LEFT JOIN "war_graph_contests" contest
          ON contest."id" = movement."contest_id"
         AND contest."graph_id" = movement."graph_id"
        WHERE movement."graph_id" = ${contest.graphId}
          AND movement."membership_id" = ${membershipId}
          AND (
            (
              movement."contest_id" IS NULL
              AND movement."moved_at" <= ${contest.commencedAt}
            )
            OR (
              contest."status" = 'settled'
              AND contest."commenced_at" IS NOT NULL
              AND contest."authoritative_order_key" IS NOT NULL
              AND (
                contest."commenced_at" < ${contest.commencedAt}
                OR (
                  contest."commenced_at" = ${contest.commencedAt}
                  AND contest."authoritative_order_key" < ${contest.authoritativeOrderKey}
                )
                OR (
                  contest."commenced_at" = ${contest.commencedAt}
                  AND contest."authoritative_order_key" = ${contest.authoritativeOrderKey}
                  AND contest."id" < ${contest.id}
                )
              )
            )
          )
      )
      SELECT
        "nodeId",
        "layerOrdinal",
        "occupancyVersion"
      FROM authoritative
      ORDER BY "effectiveAt" DESC, "orderKey" DESC, "id" DESC
      LIMIT 1
    `);
    return rows[0] ?? null;
  };
  const [aggressor, defender] = await Promise.all([
    reconstruct(contest.aggressorMembershipId),
    reconstruct(contest.defenderMembershipId),
  ]);
  return Boolean(
    aggressor &&
      defender &&
      aggressor.nodeId === contest.aggressorStartNodeId &&
      defender.nodeId === contest.defenderStartNodeId &&
      aggressor.layerOrdinal === contest.aggressorStartLayerOrdinal &&
      defender.layerOrdinal === contest.defenderStartLayerOrdinal &&
      aggressor.occupancyVersion === contest.aggressorStartVersion &&
      defender.occupancyVersion === contest.defenderStartVersion,
  );
}

async function frontierDestination(
  tx: TransactionClient,
  contest: SettlementContest,
  outcome: WarGraphBattleOutcome,
): Promise<number | null> {
  if (
    outcome === "AGGRESSOR_WIN" &&
    contest.aggressorStartLayerOrdinal === 3
  ) {
    return contest.aggressorStartNodeId;
  }
  if (
    outcome === "DEFENDER_WIN" &&
    contest.aggressorStartLayerOrdinal === 3
  ) {
    return null;
  }
  return ensureVacantWarGraphFrontierNode(
    tx,
    contest.graphId,
  );
}

function evidenceReadyAt(contest: SettlementContest): Date {
  return new Date(Math.max(
    contest.createdAt.getTime(),
    ...contest.attestations.flatMap((claim) => [
      claim.linkedAt.getTime(),
      claim.attestation.receivedAt.getTime(),
    ]),
  ));
}

async function voidContestWithoutPunishment(
  tx: TransactionClient,
  contest: SettlementContest,
  now: Date,
  code: string,
  detail: string,
): Promise<WarGraphSettlementPersistedResult> {
  const eventPayload: Prisma.InputJsonObject = {
    schema: "aoe2war-wargraph-contest-system-void/v1",
    code,
    detail: detail.slice(0, 500),
    liveGameFingerprint: contest.liveGameFingerprint,
    authoritativeOrderKey: contest.authoritativeOrderKey,
    punishmentApplied: false,
  };
  await applyWarGraphResolutionExactlyOnce(tx, {
    graphId: contest.graphId,
    nightId: contest.nightId,
    rulesetId: contest.rulesetId,
    contestId: contest.id,
    expectedContestVersion: contest.version,
    expectedContestStatuses: ["qualified"],
    pairingId: contest.pairingId,
    advanceRequestId: contest.advanceRequestId,
    occurredAt: now,
    terminal: {
      status: "voided",
      qualificationStatus: "system_void",
      qualificationReason: null,
      resultStatus: "void",
      outcomeCode: null,
      winnerMembershipId: null,
      loserMembershipId: null,
      settlementKey: null,
      eventType: "WARGRAPH_CONTEST_SYSTEM_VOIDED",
      eventIdempotencyKey: `wargraph:event:void:${contest.publicId}`,
      eventPayload,
      pairingStatus: contest.pairingId ? "voided" : null,
      advanceStatus: contest.advanceRequestId ? "system_void" : null,
      resolutionCode: code.slice(0, 64),
    },
  });
  return { kind: "system_void", contestId: contest.id, code };
}

async function chronologicalCounts(
  tx: TransactionClient,
  contest: SettlementContest,
): Promise<{
  earlierNonterminalCount: number;
  laterSettledCount: number;
  earlierCrownBattleCount: number;
}> {
  if (!contest.commencedAt || !contest.authoritativeOrderKey) {
    return {
      earlierNonterminalCount: Number.MAX_SAFE_INTEGER,
      laterSettledCount: Number.MAX_SAFE_INTEGER,
      earlierCrownBattleCount: Number.MAX_SAFE_INTEGER,
    };
  }
  const [contestRows, ingressRows, laterRows, crownRows] = await Promise.all([
    tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "war_graph_contests" other
      WHERE other."graph_id" = ${contest.graphId}
        AND other."id" <> ${contest.id}
        AND other."status" IN ('pending', 'evidence_pending', 'qualified')
        AND other."commenced_at" IS NOT NULL
        AND (
          (
            other."authoritative_order_key" IS NULL
            AND other."commenced_at" <= ${contest.commencedAt}
          )
          OR other."commenced_at" < ${contest.commencedAt}
          OR (
            other."commenced_at" = ${contest.commencedAt}
            AND other."authoritative_order_key" < ${contest.authoritativeOrderKey}
          )
          OR (
            other."commenced_at" = ${contest.commencedAt}
            AND other."authoritative_order_key" = ${contest.authoritativeOrderKey}
            AND other."id" < ${contest.id}
          )
        )
    `),
    tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "war_graph_jobs" job
      WHERE job."graph_id" = ${contest.graphId}
        AND job."job_type" = 'correlate_attestation'
        AND job."status" IN ('queued', 'running')
        AND job."payload" ->> 'liveGameFingerprint' <> ${contest.liveGameFingerprint}
        AND (
          job."payload" ->> 'commencedAt' < ${contest.commencedAt.toISOString()}
          OR (
            job."payload" ->> 'commencedAt' = ${contest.commencedAt.toISOString()}
            AND job."payload" ->> 'liveGameFingerprint' < ${contest.liveGameFingerprint}
          )
        )
    `),
    tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "war_graph_contests" other
      WHERE other."graph_id" = ${contest.graphId}
        AND other."id" <> ${contest.id}
        AND other."status" = 'settled'
        AND other."commenced_at" IS NOT NULL
        AND (
          other."authoritative_order_key" IS NULL
          OR other."commenced_at" > ${contest.commencedAt}
          OR (
            other."commenced_at" = ${contest.commencedAt}
            AND other."authoritative_order_key" > ${contest.authoritativeOrderKey}
          )
          OR (
            other."commenced_at" = ${contest.commencedAt}
            AND other."authoritative_order_key" = ${contest.authoritativeOrderKey}
            AND other."id" > ${contest.id}
          )
        )
    `),
    tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::integer AS "count"
      FROM "war_graph_contests" other
      WHERE other."graph_id" = ${contest.graphId}
        AND other."night_id" = ${contest.nightId}
        AND other."id" <> ${contest.id}
        AND other."kind" = 'VERIFIED_BATTLE'
        AND other."status" = 'settled'
        AND other."defender_start_layer_ordinal" = 0
        AND other."commenced_at" IS NOT NULL
        AND (
          other."authoritative_order_key" IS NULL
          OR other."commenced_at" < ${contest.commencedAt}
          OR (
            other."commenced_at" = ${contest.commencedAt}
            AND other."authoritative_order_key" < ${contest.authoritativeOrderKey}
          )
          OR (
            other."commenced_at" = ${contest.commencedAt}
            AND other."authoritative_order_key" = ${contest.authoritativeOrderKey}
            AND other."id" < ${contest.id}
          )
        )
    `),
  ]);
  return {
    earlierNonterminalCount:
      (contestRows[0]?.count ?? 0) + (ingressRows[0]?.count ?? 0),
    laterSettledCount: laterRows[0]?.count ?? 0,
    earlierCrownBattleCount: crownRows[0]?.count ?? 0,
  };
}

async function settleLeasedJob(
  prisma: PrismaClient,
  job: LeasedWarGraphSettlementJob,
  now: Date,
): Promise<WarGraphSettlementPersistedResult> {
  const payload = parseWarGraphSettlementJobPayload(job.payload);
  if (!payload) {
    return permanent(
      "WARGRAPH_SETTLEMENT_PAYLOAD_INVALID",
      "The leased settlement payload failed strict validation.",
    );
  }
  return prisma.$transaction(
    async (tx) => {
      const lockedJobs = await tx.$queryRaw<Array<{
        id: bigint;
        graphId: number;
        jobType: string;
        payload: unknown;
        status: string;
        leaseOwner: string | null;
        leaseExpiresAt: Date | null;
        version: number;
      }>>(Prisma.sql`
        SELECT
          "id" AS "id",
          "graph_id" AS "graphId",
          "job_type" AS "jobType",
          "payload" AS "payload",
          "status" AS "status",
          "lease_owner" AS "leaseOwner",
          "lease_expires_at" AS "leaseExpiresAt",
          "version" AS "version"
        FROM "war_graph_jobs"
        WHERE "id" = ${job.id}
        FOR UPDATE
      `);
      const liveJob = lockedJobs[0];
      if (
        !liveJob ||
        liveJob.jobType !== WARGRAPH_SETTLEMENT_JOB_TYPE ||
        liveJob.status !== "running" ||
        liveJob.leaseOwner !== job.leaseOwner ||
        liveJob.version !== job.version ||
        liveJob.graphId !== job.graphId ||
        !liveJob.leaseExpiresAt ||
        liveJob.leaseExpiresAt <= now ||
        !exactJson(liveJob.payload, job.payload)
      ) {
        return temporary(
          "WARGRAPH_LEASE_CAS_LOST",
          "The leased settlement job changed before processing began.",
        );
      }
      const identity = await tx.warGraphContest.findUnique({
        where: { id: payload.contestId },
        select: {
          id: true,
          graphId: true,
          gameStatsId: true,
          liveGameFingerprint: true,
          authoritativeOrderKey: true,
          commencedAt: true,
          status: true,
        },
      });
      if (!identity) {
        return permanent(
          "WARGRAPH_CONTEST_NOT_FOUND",
          "The settlement job references no contest.",
        );
      }
      if (identity.graphId !== job.graphId) {
        return permanent(
          "WARGRAPH_SETTLEMENT_SCOPE_MISMATCH",
          "The settlement job and contest are in different graphs.",
        );
      }
      if (
        identity.liveGameFingerprint !== payload.liveGameFingerprint ||
        identity.authoritativeOrderKey !== payload.authoritativeOrderKey ||
        identity.commencedAt?.toISOString() !== payload.commencedAt
      ) {
        return permanent(
          "WARGRAPH_SETTLEMENT_IDENTITY_MISMATCH",
          "The leased job does not exactly identify the immutable contest.",
        );
      }
      if (TERMINAL_CONTEST_STATUSES.has(identity.status)) {
        return {
          kind: "terminal",
          contestId: identity.id,
          status: identity.status as "settled" | "voided" | "rejected",
        };
      }
      if (!identity.gameStatsId) {
        return permanent(
          "WARGRAPH_GAME_IDENTITY_MISSING",
          "A verified settlement must retain a non-null game identity.",
        );
      }

      await lockGameThenGraph(tx, identity.gameStatsId, job.graphId);
      const [contest, latestDesync, latestAdjudication] = await Promise.all([
        tx.warGraphContest.findUnique({
          where: { id: payload.contestId },
          ...settlementContestArgs,
        }),
        tx.replayDesyncIncident.findFirst({
          where: { gameStatsId: identity.gameStatsId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { desyncOccurred: true },
        }),
        tx.replayResultAdjudication.findFirst({
          where: { gameStatsId: identity.gameStatsId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            decisionStatus: true,
            sourceReplayHash: true,
            sourceRosterHash: true,
            sourcePropositionHash: true,
            winningPlayerKeys: true,
          },
        }),
      ]);
      if (!contest) {
        return permanent(
          "WARGRAPH_CONTEST_NOT_FOUND",
          "The contest disappeared while its settlement lock was acquired.",
        );
      }
      if (
        contest.graphId !== job.graphId ||
        contest.gameStatsId !== identity.gameStatsId ||
        contest.liveGameFingerprint !== payload.liveGameFingerprint ||
        contest.authoritativeOrderKey !== payload.authoritativeOrderKey ||
        contest.commencedAt?.toISOString() !== payload.commencedAt
      ) {
        return permanent(
          "WARGRAPH_SETTLEMENT_IDENTITY_MISMATCH",
          "Immutable contest identity changed while settlement locks were acquired.",
        );
      }
      if (TERMINAL_CONTEST_STATUSES.has(contest.status)) {
        return {
          kind: "terminal",
          contestId: contest.id,
          status: contest.status as "settled" | "voided" | "rejected",
        };
      }

      const [
        aggressorActionsUsed,
        defenderActionsUsed,
        chronology,
        authoritativeStartExact,
      ] =
        await Promise.all([
          tx.warGraphAction.count({
            where: {
              graphId: contest.graphId,
              nightId: contest.nightId,
              membershipId: contest.aggressorMembershipId,
            },
          }),
          tx.warGraphAction.count({
            where: {
              graphId: contest.graphId,
              nightId: contest.nightId,
              membershipId: contest.defenderMembershipId,
            },
          }),
          chronologicalCounts(tx, contest),
          authoritativeStartStateIsExact(tx, contest),
        ]);
      const finalClaimsExact = claimsAreExact(contest);
      const immutableFactsExact = immutableContestFactsAreExact(
        contest,
        latestAdjudication,
      );
      const decision = preflightWarGraphSettlement({
        payload: job.payload,
        now,
        evidenceReadyAt: evidenceReadyAt(contest),
        contest: {
          id: contest.id,
          liveGameFingerprint: contest.liveGameFingerprint,
          authoritativeOrderKey: contest.authoritativeOrderKey,
          commencedAt: contest.commencedAt,
          status: contest.status,
        },
        finalClaimCount: contest.attestations.length,
        finalClaimFactsExact: finalClaimsExact,
        immutableFactsExact,
        latestDesyncOccurred: latestDesync?.desyncOccurred === true,
        earlierNonterminalCount: chronology.earlierNonterminalCount,
        laterSettledCount: chronology.laterSettledCount,
        frozenStateExact:
          frozenStateIsExact(contest) && authoritativeStartExact,
        boundPairingSnapshotExact: boundPairingIsExact(contest),
        aggressorActionsUsed,
        defenderActionsUsed,
      });
      if (decision.kind === "terminal") {
        return {
          kind: "terminal",
          contestId: contest.id,
          status: decision.status,
        };
      }
      if (decision.kind === "retry" || decision.kind === "dead") {
        return decision;
      }
      if (decision.kind === "system_void") {
        return voidContestWithoutPunishment(
          tx,
          contest,
          now,
          decision.code,
          decision.detail,
        );
      }

      const rewardConfigValues = [
        contest.ruleset.frontierAdvanceWolo,
        contest.ruleset.ringTwoAdvanceWolo,
        contest.ruleset.firstCrownBloodWolo,
        contest.ruleset.crownVictoryWolo,
      ].map(safeInteger);
      if (
        contest.ruleset.maxResolvedActions !== 2 ||
        rewardConfigValues.some((value) => value === null)
      ) {
        return voidContestWithoutPunishment(
          tx,
          contest,
          now,
          "WARGRAPH_RULESET_UNSAFE",
          "The frozen ruleset cannot be represented by the bounded V1 resolver.",
        );
      }
      const outcome = contest.outcomeCode as WarGraphBattleOutcome;
      const frontierNodeId = await frontierDestination(tx, contest, outcome);
      const rewardConfig: WarGraphRewardConfig = {
        frontierToRingII: rewardConfigValues[0] as number,
        ringIIToRingI: rewardConfigValues[1] as number,
        firstBlood: rewardConfigValues[2] as number,
        crownBattleWinner: rewardConfigValues[3] as number,
      };
      const plan = buildWarGraphVerifiedResolutionPlan({
        aggressor: {
          membershipId: contest.aggressor.id,
          playerId: contest.aggressor.publicId,
          userId: contest.aggressor.userId,
          nodeId: contest.aggressorStartNodeId,
          layer: contest.aggressorStartLayerOrdinal as WarGraphLayer,
          occupancyVersion: contest.aggressorStartVersion,
          membershipVersion: contest.aggressor.version,
          actionsUsed: aggressorActionsUsed,
        },
        defender: {
          membershipId: contest.defender.id,
          playerId: contest.defender.publicId,
          userId: contest.defender.userId,
          nodeId: contest.defenderStartNodeId,
          layer: contest.defenderStartLayerOrdinal as WarGraphLayer,
          occupancyVersion: contest.defenderStartVersion,
          membershipVersion: contest.defender.version,
          actionsUsed: defenderActionsUsed,
        },
        outcome,
        frontierNodeId,
        isFirstBlood:
          contest.defenderStartLayerOrdinal === 0 &&
          chronology.earlierCrownBattleCount === 0,
        rewardConfig,
      });
      if (!plan) {
        return voidContestWithoutPunishment(
          tx,
          contest,
          now,
          "WARGRAPH_RESOLUTION_PLAN_INVALID",
          "The constitutional movement/reward plan rejected the frozen facts.",
        );
      }

      const existingNightReward = await tx.warGraphReward.aggregate({
        where: { graphId: contest.graphId, nightId: contest.nightId },
        _sum: { amountWolo: true },
      });
      const prospectiveReward =
        (existingNightReward._sum.amountWolo ?? BigInt(0)) +
        BigInt(plan.totalRewardWolo);
      if (prospectiveReward > contest.ruleset.nightlyPayoutCeilingWolo) {
        return voidContestWithoutPunishment(
          tx,
          contest,
          now,
          "WARGRAPH_NIGHTLY_REWARD_CEILING",
          "Immutable reward entitlements would exceed the frozen nightly ceiling.",
        );
      }

      const walletByMembership = new Map([
        [contest.aggressor.id, contest.aggressor.user.walletAddress],
        [contest.defender.id, contest.defender.user.walletAddress],
      ]);
      const actions: WarGraphResolutionAction[] = plan.actions.map((action) => ({
        ...action,
        idempotencyKey:
          `wargraph:action:${contest.publicId}:${action.membershipId}`,
      }));
      const movements: WarGraphResolutionMovement[] = plan.movements.map(
        (movement) => {
          const movementKey =
            `wargraph:movement:${contest.publicId}:${movement.membershipId}`;
          return {
            membershipId: movement.membershipId,
            fromNodeId: movement.fromNodeId,
            toNodeId: movement.toNodeId,
            fromLayerOrdinal: movement.fromLayer,
            toLayerOrdinal: movement.toLayer,
            expectedOccupancyVersion: movement.expectedOccupancyVersion,
            expectedMembershipVersion: movement.expectedMembershipVersion,
            movementType: movement.movementType,
            reasonCode: movement.reasonCode,
            sourceKey: movementKey,
            idempotencyKey: movementKey,
          };
        },
      );
      const rewards: WarGraphResolutionReward[] = plan.rewards.map((reward) => {
        const settlementKey =
          `wargraph:reward:${contest.publicId}:${reward.rewardKind}`;
        return {
          ...reward,
          amountWolo: BigInt(reward.amountWolo),
          settlementKey,
          payoutRequestId: settlementKey,
          recipientWalletSnapshot:
            walletByMembership.get(reward.membershipId) ?? null,
          policyHash: contest.ruleset.rulesetHash,
        };
      });
      const fixedVacancyCreated = movements.some(
        (movement) =>
          movement.fromLayerOrdinal > 0 &&
          movement.fromLayerOrdinal < 3 &&
          !movements.some(
            (other) => other.toNodeId === movement.fromNodeId,
          ),
      );

      // Re-read the append-only human truth immediately before effects. The
      // game lock fences a cooperating desync writer throughout this decision.
      const finalDesync = await tx.replayDesyncIncident.findFirst({
        where: { gameStatsId: identity.gameStatsId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { desyncOccurred: true },
      });
      if (finalDesync?.desyncOccurred === true) {
        return voidContestWithoutPunishment(
          tx,
          contest,
          now,
          "WARGRAPH_AUTHORITATIVE_DESYNC",
          "Human-confirmed desync truth vetoed the final commit.",
        );
      }

      const eventPayload: Prisma.InputJsonObject = {
        schema: "aoe2war-wargraph-contest-settled/v1",
        liveGameFingerprint: payload.liveGameFingerprint,
        authoritativeOrderKey: payload.authoritativeOrderKey,
        commencedAt: payload.commencedAt,
        gameStatsId: identity.gameStatsId,
        outcomeCode: outcome,
        winnerMembershipId: contest.winnerMembershipId,
        loserMembershipId: contest.loserMembershipId,
        finalClaimValidationHashes: contest.attestations
          .map((claim) => claim.validationHash)
          .sort(),
        actions: actions.map((action) => ({
          membershipId: action.membershipId,
          slot: action.slot,
          actionType: action.actionType,
        })),
        movements: movements.map((movement) => ({
          membershipId: movement.membershipId,
          fromNodeId: movement.fromNodeId,
          toNodeId: movement.toNodeId,
          movementType: movement.movementType,
          reasonCode: movement.reasonCode,
        })),
        rewards: rewards.map((reward) => ({
          membershipId: reward.membershipId,
          rewardKind: reward.rewardKind,
          amountWolo: reward.amountWolo.toString(),
          payoutRequestId: reward.payoutRequestId,
        })),
        chainExecutionRequested: false,
      };
      const settlementKey =
        `wargraph:settlement:${payload.liveGameFingerprint}`;
      const applied = await applyWarGraphResolutionExactlyOnce(tx, {
        graphId: contest.graphId,
        nightId: contest.nightId,
        rulesetId: contest.rulesetId,
        contestId: contest.id,
        expectedContestVersion: contest.version,
        expectedContestStatuses: ["qualified"],
        pairingId: contest.pairingId,
        advanceRequestId: contest.advanceRequestId,
        occurredAt: now,
        actions,
        movements,
        rewards,
        terminal: {
          status: "settled",
          qualificationStatus: "eligible",
          qualificationReason: "WARGRAPH_ELIGIBLE",
          resultStatus: "verified",
          outcomeCode: outcome,
          winnerMembershipId: contest.winnerMembershipId,
          loserMembershipId: contest.loserMembershipId,
          settlementKey,
          eventType: "WARGRAPH_CONTEST_SETTLED",
          eventIdempotencyKey:
            `wargraph:event:settled:${contest.publicId}`,
          eventPayload,
          pairingStatus: contest.pairingId ? "settled" : null,
          advanceStatus: contest.advanceRequestId ? "settled" : null,
          resolutionCode: "VERIFIED_BATTLE",
        },
        enqueueGravity: fixedVacancyCreated,
      });
      return {
        kind: "settled",
        contestId: contest.id,
        movementCount: applied.movementCount,
        rewardCount: applied.rewardCount,
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 40_000,
    },
  );
}

async function leaseSettlementJobs(
  prisma: PrismaClient,
  input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    limit: number;
  },
): Promise<readonly LeasedWarGraphSettlementJob[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "war_graph_jobs"
      SET
        "status" = 'dead',
        "lease_owner" = NULL,
        "lease_expires_at" = NULL,
        "last_error_code" = 'WARGRAPH_MAX_ATTEMPTS_EXHAUSTED',
        "last_error" = 'Expired settlement lease exhausted the durable retry budget.',
        "completed_at" = ${input.now},
        "version" = "version" + 1,
        "updated_at" = ${input.now}
      WHERE "job_type" = ${WARGRAPH_SETTLEMENT_JOB_TYPE}
        AND "status" = 'running'
        AND "lease_expires_at" <= ${input.now}
        AND "attempt_count" >= "max_attempts"
    `);
    return tx.$queryRaw<LeasedRow[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "war_graph_jobs"
        WHERE "job_type" = ${WARGRAPH_SETTLEMENT_JOB_TYPE}
          AND "attempt_count" < "max_attempts"
          AND (
            (
              "status" = 'queued'
              AND "available_at" <= ${input.now}
            )
            OR (
              "status" = 'running'
              AND "lease_expires_at" <= ${input.now}
            )
          )
        ORDER BY
          "payload" ->> 'commencedAt' ASC NULLS LAST,
          "payload" ->> 'authoritativeOrderKey' ASC NULLS LAST,
          "created_at" ASC,
          "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "war_graph_jobs" job
      SET
        "status" = 'running',
        "lease_owner" = ${input.workerId},
        "lease_expires_at" = ${input.leaseExpiresAt},
        "attempt_count" = job."attempt_count" + 1,
        "last_error_code" = NULL,
        "last_error" = NULL,
        "completed_at" = NULL,
        "version" = job."version" + 1,
        "updated_at" = ${input.now}
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING
        job."id" AS "id",
        job."graph_id" AS "graphId",
        job."payload" AS "payload",
        job."attempt_count" AS "attemptCount",
        job."max_attempts" AS "maxAttempts",
        job."lease_owner" AS "leaseOwner",
        job."lease_expires_at" AS "leaseExpiresAt",
        job."version" AS "version",
        job."created_at" AS "createdAt"
    `);
  });
}

async function transitionSettlementJob(
  prisma: PrismaClient,
  transition: WarGraphSettlementJobTransition,
): Promise<boolean> {
  const where = {
    id: transition.jobId,
    jobType: WARGRAPH_SETTLEMENT_JOB_TYPE,
    status: "running",
    leaseOwner: transition.leaseOwner,
    version: transition.leasedVersion,
  } as const;
  const data: Prisma.WarGraphJobUpdateManyMutationInput =
    transition.kind === "succeeded"
      ? {
          status: "succeeded",
          leaseOwner: null,
          leaseExpiresAt: null,
          lastErrorCode: null,
          lastError: null,
          completedAt: transition.now,
          version: { increment: 1 },
        }
      : transition.kind === "retry"
        ? {
            status: "queued",
            availableAt: transition.availableAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: transition.code.slice(0, 80),
            lastError: transition.detail.slice(0, 2_000),
            completedAt: null,
            version: { increment: 1 },
          }
        : {
            status: "dead",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode: transition.code.slice(0, 80),
            lastError: transition.detail.slice(0, 2_000),
            completedAt: transition.now,
            version: { increment: 1 },
          };
  const changed = await prisma.warGraphJob.updateMany({ where, data });
  return changed.count === 1;
}

export function createPrismaWarGraphSettlementWorkerAdapter(
  prisma: PrismaClient = getPrisma(),
): WarGraphSettlementWorkerAdapter {
  return {
    lease: (input) => leaseSettlementJobs(prisma, input),
    settle: (job, now) => settleLeasedJob(prisma, job, now),
    transition: (transition) => transitionSettlementJob(prisma, transition),
  };
}
