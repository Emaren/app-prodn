import {
  Prisma,
  type PrismaClient,
} from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  decideWarGraphPairingDeadline,
  parseWarGraphDeadlineJobPayload,
  WARGRAPH_RESOLVE_ADVANCE_JOB_TYPE,
  WARGRAPH_RESOLVE_PAIRING_JOB_TYPE,
  type WarGraphPairingDeadlineKind,
} from "./deadline.ts";
import type {
  LeasedWarGraphDeadlineJob,
  WarGraphDeadlineJobTransition,
  WarGraphDeadlinePersistedResult,
  WarGraphDeadlineWorkerAdapter,
} from "./deadlineWorker.ts";
import {
  appendWarGraphEvent,
  lockWarGraphTransaction,
} from "./foundation.ts";
import { ensureVacantWarGraphFrontierNode } from "./frontier.ts";
import { planDefenseDefaultMovement } from "./movement.ts";
import {
  applyWarGraphResolutionExactlyOnce,
  type WarGraphResolutionAction,
  type WarGraphResolutionMovement,
} from "./prismaSettlementWorker.ts";
import type { WarGraphLayer } from "./types.ts";

type TransactionClient = Prisma.TransactionClient;

const DEADLINE_JOB_TYPES = [
  WARGRAPH_RESOLVE_ADVANCE_JOB_TYPE,
  WARGRAPH_RESOLVE_PAIRING_JOB_TYPE,
] as const;

const ADJUDICATION_GRACE_MS = 5_000;

type DeadlineContestKind =
  | "DEFENSE_DEFAULT"
  | WarGraphPairingDeadlineKind;

type DeadlineContestProvenance =
  | "ADMINISTRATIVE"
  | "SYSTEM";

type DeadlineContestSeed = {
  graphId: number;
  nightId: number;
  rulesetId: number;
  kind: DeadlineContestKind;
  provenance: DeadlineContestProvenance;
  createdAt: Date;
  pairingId: number | null;
  advanceRequestId: number | null;
  aggressorMembershipId: number;
  defenderMembershipId: number;
  aggressorStartNodeId: number;
  defenderStartNodeId: number;
  aggressorStartLayerOrdinal: number;
  defenderStartLayerOrdinal: number;
  aggressorStartVersion: number;
  defenderStartVersion: number;
  idempotencyKey: string;
};

function temporary(
  code: string,
  detail: string,
  availableAt?: Date,
): WarGraphDeadlinePersistedResult {
  return {
    kind: "retry",
    code,
    detail,
    availableAt,
  };
}

function permanent(
  code: string,
  detail: string,
): WarGraphDeadlinePersistedResult {
  return {
    kind: "dead",
    code,
    detail,
  };
}

function graceAt(deadline: Date): Date {
  return new Date(
    deadline.getTime() + ADJUDICATION_GRACE_MS,
  );
}

function actionSlot(
  actionsUsed: number,
): 1 | 2 | null {
  if (actionsUsed === 0) return 1;
  if (actionsUsed === 1) return 2;
  return null;
}

function deadlineContestProvenance(
  kind: DeadlineContestKind,
): DeadlineContestProvenance {
  switch (kind) {
    case "SYSTEM_VOID":
    case "TECHNICAL_VOID":
      return "SYSTEM";

    default:
      return "ADMINISTRATIVE";
  }
}

async function createDeadlineContest(
  tx: TransactionClient,
  seed: DeadlineContestSeed,
) {
  const existing = await tx.warGraphContest.findUnique({
    where: {
      idempotencyKey: seed.idempotencyKey,
    },
  });

  if (existing) {
    if (
      existing.graphId !== seed.graphId ||
      existing.nightId !== seed.nightId ||
      existing.rulesetId !== seed.rulesetId ||
      existing.kind !== seed.kind ||
      existing.provenance !== seed.provenance ||
      existing.pairingId !== seed.pairingId ||
      existing.advanceRequestId !== seed.advanceRequestId ||
      existing.aggressorMembershipId !==
        seed.aggressorMembershipId ||
      existing.defenderMembershipId !==
        seed.defenderMembershipId ||
      existing.aggressorStartNodeId !==
        seed.aggressorStartNodeId ||
      existing.defenderStartNodeId !==
        seed.defenderStartNodeId ||
      existing.aggressorStartLayerOrdinal !==
        seed.aggressorStartLayerOrdinal ||
      existing.defenderStartLayerOrdinal !==
        seed.defenderStartLayerOrdinal ||
      existing.aggressorStartVersion !==
        seed.aggressorStartVersion ||
      existing.defenderStartVersion !==
        seed.defenderStartVersion
    ) {
      throw new Error(
        "WARGRAPH_DEADLINE_CONTEST_IDENTITY_COLLISION",
      );
    }
    return existing;
  }

  return tx.warGraphContest.create({
    data: {
      graphId: seed.graphId,
      nightId: seed.nightId,
      rulesetId: seed.rulesetId,
      pairingId: seed.pairingId,
      advanceRequestId: seed.advanceRequestId,
      aggressorMembershipId:
        seed.aggressorMembershipId,
      defenderMembershipId:
        seed.defenderMembershipId,
      aggressorStartNodeId:
        seed.aggressorStartNodeId,
      defenderStartNodeId:
        seed.defenderStartNodeId,
      aggressorStartLayerOrdinal:
        seed.aggressorStartLayerOrdinal,
      defenderStartLayerOrdinal:
        seed.defenderStartLayerOrdinal,
      aggressorStartVersion:
        seed.aggressorStartVersion,
      defenderStartVersion:
        seed.defenderStartVersion,
      kind: seed.kind,
      provenance: seed.provenance,
      createdAt: seed.createdAt,
      idempotencyKey: seed.idempotencyKey,
      status: "pending",
    },
  });
}

async function bumpProjection(
  tx: TransactionClient,
  graphId: number,
  nightId: number,
): Promise<void> {
  await Promise.all([
    tx.warGraph.update({
      where: { id: graphId },
      data: {
        projectionVersion: { increment: 1 },
      },
    }),
    tx.warGraphNight.update({
      where: { id: nightId },
      data: {
        version: { increment: 1 },
      },
    }),
  ]);
}

async function expireUnansweredAdvance(
  tx: TransactionClient,
  advance: {
    id: number;
    publicId: string;
    graphId: number;
    nightId: number;
    challengerMembershipId: number;
    version: number;
  },
  now: Date,
): Promise<WarGraphDeadlinePersistedResult> {
  const resolutionCode =
    "NO_ACCOUNTABLE_DEFENDER";

  const changed =
    await tx.warGraphAdvanceRequest.updateMany({
      where: {
        id: advance.id,
        graphId: advance.graphId,
        status: "open",
        version: advance.version,
      },
      data: {
        status: "expired",
        resolvedAt: now,
        resolutionCode,
        version: { increment: 1 },
      },
    });

  if (changed.count !== 1) {
    throw new Error(
      "WARGRAPH_ADVANCE_DEADLINE_CAS_LOST",
    );
  }

  await appendWarGraphEvent(tx, {
    graphId: advance.graphId,
    nightId: advance.nightId,
    membershipId:
      advance.challengerMembershipId,
    advanceRequestId: advance.id,
    aggregateType: "advance",
    aggregateId: advance.publicId,
    eventType: "WARGRAPH_ADVANCE_EXPIRED",
    idempotencyKey:
      `wargraph:event:advance-expired:${advance.publicId}`,
    priorVersion: advance.version,
    newVersion: advance.version + 1,
    payload: {
      reasonCode: resolutionCode,
      punishmentApplied: false,
      actionCharges: 0,
      movementApplied: false,
      rewardsApplied: false,
    },
    occurredAt: now,
  });

  await bumpProjection(
    tx,
    advance.graphId,
    advance.nightId,
  );

  return {
    kind: "resolved",
    aggregateId: advance.publicId,
    contestId: null,
    resolutionCode,
  };
}

async function systemVoidAdvance(
  tx: TransactionClient,
  advance: {
    id: number;
    publicId: string;
    graphId: number;
    nightId: number;
    challengerMembershipId: number;
    status: string;
    version: number;
  },
  obligation: {
    id: number;
    status: string;
    version: number;
  } | null,
  now: Date,
  code: string,
  detail: string,
): Promise<WarGraphDeadlinePersistedResult> {
  if (
    obligation &&
    obligation.status === "pending"
  ) {
    const obligationChanged =
      await tx.warGraphDefenseObligation.updateMany({
        where: {
          id: obligation.id,
          status: "pending",
          version: obligation.version,
        },
        data: {
          status: "system_void",
          resolutionCode: code.slice(0, 64),
          resolvedAt: now,
          version: { increment: 1 },
        },
      });
    if (obligationChanged.count !== 1) {
      throw new Error(
        "WARGRAPH_DEFENSE_OBLIGATION_CAS_LOST",
      );
    }
  }

  const changed =
    await tx.warGraphAdvanceRequest.updateMany({
      where: {
        id: advance.id,
        graphId: advance.graphId,
        status: advance.status,
        version: advance.version,
      },
      data: {
        status: "system_void",
        resolvedAt: now,
        resolutionCode: code.slice(0, 64),
        version: { increment: 1 },
      },
    });

  if (changed.count !== 1) {
    throw new Error(
      "WARGRAPH_ADVANCE_SYSTEM_VOID_CAS_LOST",
    );
  }

  await appendWarGraphEvent(tx, {
    graphId: advance.graphId,
    nightId: advance.nightId,
    membershipId:
      advance.challengerMembershipId,
    advanceRequestId: advance.id,
    aggregateType: "advance",
    aggregateId: advance.publicId,
    eventType: "WARGRAPH_ADVANCE_SYSTEM_VOIDED",
    idempotencyKey:
      `wargraph:event:advance-system-void:${advance.publicId}`,
    priorVersion: advance.version,
    newVersion: advance.version + 1,
    payload: {
      reasonCode: code.slice(0, 64),
      detail: detail.slice(0, 500),
      punishmentApplied: false,
      actionCharges: 0,
      movementApplied: false,
      rewardsApplied: false,
    },
    occurredAt: now,
  });

  await bumpProjection(
    tx,
    advance.graphId,
    advance.nightId,
  );

  return {
    kind: "resolved",
    aggregateId: advance.publicId,
    contestId: null,
    resolutionCode: code.slice(0, 64),
  };
}

async function resolveAdvance(
  tx: TransactionClient,
  graphId: number,
  advanceId: string,
  now: Date,
): Promise<WarGraphDeadlinePersistedResult> {
  const advance =
    await tx.warGraphAdvanceRequest.findUnique({
      where: { publicId: advanceId },
      include: {
        pairing: {
          select: {
            id: true,
            publicId: true,
            status: true,
          },
        },
        defenseObligation: {
          include: {
            defender: {
              include: {
                occupancy: {
                  include: {
                    node: {
                      include: {
                        layer: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        challenger: {
          include: {
            occupancy: {
              include: {
                node: {
                  include: {
                    layer: true,
                  },
                },
              },
            },
          },
        },
      },
    });

  if (!advance) {
    return permanent(
      "WARGRAPH_ADVANCE_NOT_FOUND",
      "Deadline job references a missing advance.",
    );
  }

  if (advance.graphId !== graphId) {
    return permanent(
      "WARGRAPH_ADVANCE_GRAPH_MISMATCH",
      "Deadline job crossed a graph boundary.",
    );
  }

  if (
    ["expired", "settled", "canceled", "system_void"]
      .includes(advance.status)
  ) {
    return {
      kind: "terminal",
      aggregateId: advance.publicId,
    };
  }

  if (
    ["accepted", "bound"].includes(advance.status)
  ) {
    if (advance.pairing) {
      return {
        kind: "terminal",
        aggregateId: advance.publicId,
      };
    }

    return systemVoidAdvance(
      tx,
      advance,
      advance.defenseObligation,
      now,
      "WARGRAPH_ADVANCE_PAIRING_MISSING",
      "Accepted or bound advance has no pairing.",
    );
  }

  if (advance.status !== "open") {
    return systemVoidAdvance(
      tx,
      advance,
      advance.defenseObligation,
      now,
      "WARGRAPH_ADVANCE_STATUS_UNEXPECTED",
      `Unexpected advance status ${advance.status}.`,
    );
  }

  const adjudicationAt =
    graceAt(advance.responseDeadlineAt);

  if (now < adjudicationAt) {
    return temporary(
      "WARGRAPH_ADVANCE_DEADLINE_PENDING",
      "Advance response window or adjudication grace remains open.",
      adjudicationAt,
    );
  }

  const obligation =
    advance.defenseObligation;

  if (!obligation) {
    return expireUnansweredAdvance(
      tx,
      advance,
      now,
    );
  }

  if (obligation.status !== "pending") {
    return systemVoidAdvance(
      tx,
      advance,
      obligation,
      now,
      "WARGRAPH_DEFENSE_OBLIGATION_STATE_UNCERTAIN",
      `Unexpected defense-obligation status ${obligation.status}.`,
    );
  }

  const obligationGrace =
    graceAt(obligation.deadlineAt);

  if (now < obligationGrace) {
    return temporary(
      "WARGRAPH_DEFENSE_DEADLINE_PENDING",
      "Confirmed defender liability remains inside its bounded response window.",
      obligationGrace,
    );
  }

  const challenger = advance.challenger;
  const defender = obligation.defender;
  const aggressorOccupancy =
    challenger.occupancy;
  const defenderOccupancy =
    defender.occupancy;

  if (
    challenger.status !== "active" ||
    defender.status !== "active" ||
    !aggressorOccupancy ||
    !defenderOccupancy ||
    aggressorOccupancy.nodeId !==
      advance.sourceNodeId ||
    aggressorOccupancy.node.layer.ordinal !==
      advance.sourceLayerOrdinal ||
    defenderOccupancy.node.layer.ordinal !==
      advance.targetLayerOrdinal
  ) {
    return systemVoidAdvance(
      tx,
      advance,
      obligation,
      now,
      "WARGRAPH_ADVANCE_FROZEN_STATE_UNCERTAIN",
      "Occupancy no longer proves the state that created defender liability.",
    );
  }

  const [
    challengerMovementDrift,
    defenderMovementDrift,
    activeEngagements,
    aggressorActionsUsed,
    defenderActionsUsed,
  ] = await Promise.all([
    tx.warGraphMovement.count({
      where: {
        graphId,
        membershipId:
          challenger.id,
        movedAt: {
          gt: advance.requestedAt,
        },
      },
    }),
    tx.warGraphMovement.count({
      where: {
        graphId,
        membershipId:
          defender.id,
        movedAt: {
          gt: obligation.viewedAt,
        },
      },
    }),
    tx.warGraphEngagement.count({
      where: {
        graphId,
        membershipId: {
          in: [
            challenger.id,
            defender.id,
          ],
        },
        status: "active",
      },
    }),
    tx.warGraphAction.count({
      where: {
        graphId,
        nightId: advance.nightId,
        membershipId: challenger.id,
      },
    }),
    tx.warGraphAction.count({
      where: {
        graphId,
        nightId: advance.nightId,
        membershipId: defender.id,
      },
    }),
  ]);

  const aggressorSlot =
    actionSlot(aggressorActionsUsed);
  const defenderSlot =
    actionSlot(defenderActionsUsed);

  if (
    challengerMovementDrift !== 0 ||
    defenderMovementDrift !== 0 ||
    activeEngagements !== 0 ||
    aggressorSlot === null ||
    defenderSlot === null
  ) {
    return systemVoidAdvance(
      tx,
      advance,
      obligation,
      now,
      "WARGRAPH_ADVANCE_STATE_DRIFT",
      "Movement, engagement, or action-cap drift makes punitive default unsafe.",
    );
  }

  const movementPlan =
    planDefenseDefaultMovement({
      aggressor: {
        playerId: challenger.publicId,
        layer:
          advance.sourceLayerOrdinal as WarGraphLayer,
        actionsUsed: aggressorActionsUsed,
      },
      defender: {
        playerId: defender.publicId,
        layer:
          advance.targetLayerOrdinal as WarGraphLayer,
        actionsUsed: defenderActionsUsed,
      },
    });

  if (
    !movementPlan.ok ||
    movementPlan.kind !== "DEFENSE_DEFAULT" ||
    !movementPlan.defender
  ) {
    return systemVoidAdvance(
      tx,
      advance,
      obligation,
      now,
      "WARGRAPH_DEFENSE_DEFAULT_PLAN_INVALID",
      "Constitutional movement law rejected the administrative default.",
    );
  }

  const frontierNodeId =
    await ensureVacantWarGraphFrontierNode(
      tx,
      graphId,
    );

  const contest =
    await createDeadlineContest(tx, {
      graphId,
      nightId: advance.nightId,
      rulesetId: advance.rulesetId,
      kind: "DEFENSE_DEFAULT",
      provenance: "ADMINISTRATIVE",
      createdAt: now,
      pairingId: null,
      advanceRequestId: advance.id,
      aggressorMembershipId:
        challenger.id,
      defenderMembershipId:
        defender.id,
      aggressorStartNodeId:
        aggressorOccupancy.nodeId,
      defenderStartNodeId:
        defenderOccupancy.nodeId,
      aggressorStartLayerOrdinal:
        advance.sourceLayerOrdinal,
      defenderStartLayerOrdinal:
        advance.targetLayerOrdinal,
      aggressorStartVersion:
        aggressorOccupancy.version,
      defenderStartVersion:
        defenderOccupancy.version,
      idempotencyKey:
        `wargraph:deadline:advance:${advance.publicId}`,
    });

  if (
    contest.status === "settled" ||
    contest.status === "voided" ||
    contest.status === "rejected"
  ) {
    return {
      kind: "terminal",
      aggregateId: advance.publicId,
    };
  }

  const actions:
    WarGraphResolutionAction[] = [
      {
        membershipId: challenger.id,
        slot: aggressorSlot,
        actionType: "DEFENSE_DEFAULT",
        idempotencyKey:
          `wargraph:action:advance-default:${advance.publicId}:aggressor`,
      },
      {
        membershipId: defender.id,
        slot: defenderSlot,
        actionType: "DEFENSE_DEFAULT",
        idempotencyKey:
          `wargraph:action:advance-default:${advance.publicId}:defender`,
      },
    ];

  const movements:
    WarGraphResolutionMovement[] = [
      {
        membershipId: challenger.id,
        fromNodeId:
          aggressorOccupancy.nodeId,
        toNodeId:
          defenderOccupancy.nodeId,
        fromLayerOrdinal:
          advance.sourceLayerOrdinal as WarGraphLayer,
        toLayerOrdinal:
          advance.targetLayerOrdinal as WarGraphLayer,
        expectedOccupancyVersion:
          aggressorOccupancy.version,
        expectedMembershipVersion:
          challenger.version,
        movementType: "SEAT_CLAIM",
        reasonCode: "DEFENSE_DEFAULT",
        sourceKey:
          `wargraph:movement:advance-default:${advance.publicId}:aggressor`,
        idempotencyKey:
          `wargraph:movement-ledger:advance-default:${advance.publicId}:aggressor`,
      },
      {
        membershipId: defender.id,
        fromNodeId:
          defenderOccupancy.nodeId,
        toNodeId: frontierNodeId,
        fromLayerOrdinal:
          advance.targetLayerOrdinal as WarGraphLayer,
        toLayerOrdinal: 3,
        expectedOccupancyVersion:
          defenderOccupancy.version,
        expectedMembershipVersion:
          defender.version,
        movementType:
          "CATASTROPHIC_FALL",
        reasonCode: "DEFENSE_DEFAULT",
        sourceKey:
          `wargraph:movement:advance-default:${advance.publicId}:defender`,
        idempotencyKey:
          `wargraph:movement-ledger:advance-default:${advance.publicId}:defender`,
      },
    ];

  const eventPayload: Prisma.InputJsonObject = {
    schema:
      "aoe2war-wargraph-administrative-resolution/v1",
    resolutionKind: "DEFENSE_DEFAULT",
    punishmentApplied: true,
    battleResultRecorded: false,
    rewardsApplied: false,
    aggressorAction: 1,
    defenderAction: 1,
    seatClaim: true,
    defenseEvidenceHash:
      obligation.viewEvidenceHash,
  };

  await applyWarGraphResolutionExactlyOnce(
    tx,
    {
      graphId,
      nightId: advance.nightId,
      rulesetId: advance.rulesetId,
      contestId: contest.id,
      expectedContestVersion:
        contest.version,
      expectedContestStatuses: [
        "pending",
      ],
      pairingId: null,
      advanceRequestId: advance.id,
      occurredAt: now,
      actions,
      movements,
      rewards: [],
      terminal: {
        status: "settled",
        qualificationStatus: "ineligible",
        qualificationReason: null,
        resultStatus: "no_battle",
        outcomeCode: null,
        winnerMembershipId: null,
        loserMembershipId: null,
        settlementKey:
          `wargraph:settlement:advance-default:${advance.publicId}`,
        eventType:
          "WARGRAPH_DEFENSE_DEFAULT_RESOLVED",
        eventIdempotencyKey:
          `wargraph:event:advance-default:${advance.publicId}`,
        eventPayload,
        pairingStatus: null,
        advanceStatus: "settled",
        defenseObligationStatus:
          "defaulted",
        resolutionCode:
          "DEFENSE_DEFAULT",
      },
      enqueueGravity: true,
    },
  );

  return {
    kind: "resolved",
    aggregateId: advance.publicId,
    contestId: contest.id,
    resolutionCode: "DEFENSE_DEFAULT",
  };
}

async function resolvePairing(
  tx: TransactionClient,
  graphId: number,
  pairingId: string,
  now: Date,
): Promise<WarGraphDeadlinePersistedResult> {
  const pairing =
    await tx.warGraphPairing.findUnique({
      where: { publicId: pairingId },
      include: {
        contest: true,
        advanceRequest: {
          include: {
            defenseObligation: true,
          },
        },
        aggressor: {
          include: {
            occupancy: {
              include: {
                node: {
                  include: {
                    layer: true,
                  },
                },
              },
            },
          },
        },
        defender: {
          include: {
            occupancy: {
              include: {
                node: {
                  include: {
                    layer: true,
                  },
                },
              },
            },
          },
        },
      },
    });

  if (!pairing) {
    return permanent(
      "WARGRAPH_PAIRING_NOT_FOUND",
      "Deadline job references a missing pairing.",
    );
  }

  if (pairing.graphId !== graphId) {
    return permanent(
      "WARGRAPH_PAIRING_GRAPH_MISMATCH",
      "Deadline job crossed a graph boundary.",
    );
  }

  if (
    pairing.status === "settled" ||
    pairing.status === "voided"
  ) {
    return {
      kind: "terminal",
      aggregateId: pairing.publicId,
    };
  }

  if (pairing.contest) {
    return {
      kind: "exact_game",
      aggregateId: pairing.publicId,
      contestId: pairing.contest.id,
    };
  }

  const adjudicationAt =
    graceAt(pairing.launchDeadlineAt);

  if (now < adjudicationAt) {
    return temporary(
      "WARGRAPH_PAIRING_DEADLINE_PENDING",
      "Pairing launch window or adjudication grace remains open.",
      adjudicationAt,
    );
  }

  const aggressor =
    pairing.aggressor;
  const defender =
    pairing.defender;
  const aggressorOccupancy =
    aggressor.occupancy;
  const defenderOccupancy =
    defender.occupancy;

  const frozenStateExact = Boolean(
    aggressor.status === "active" &&
      defender.status === "active" &&
      aggressorOccupancy &&
      defenderOccupancy &&
      aggressorOccupancy.nodeId ===
        pairing.aggressorStartNodeId &&
      defenderOccupancy.nodeId ===
        pairing.defenderStartNodeId &&
      aggressorOccupancy.node.layer.ordinal ===
        pairing.aggressorStartLayerOrdinal &&
      defenderOccupancy.node.layer.ordinal ===
        pairing.defenderStartLayerOrdinal &&
      aggressorOccupancy.version ===
        pairing.aggressorStartVersion &&
      defenderOccupancy.version ===
        pairing.defenderStartVersion,
  );

  const decision =
    decideWarGraphPairingDeadline({
      now,
      launchDeadlineAt:
        pairing.launchDeadlineAt,
      pairingStatus: pairing.status,
      aggressorReady:
        Boolean(pairing.aggressorReadyAt),
      defenderReady:
        Boolean(pairing.defenderReadyAt),
      exactGameDetected: false,
      systemUncertain:
        !frozenStateExact ||
        Boolean(pairing.commencedAt),
    });

  if (decision.kind === "retry") {
    return temporary(
      decision.code,
      "Pairing deadline remains pending.",
      decision.availableAt,
    );
  }

  if (decision.kind === "terminal") {
    return {
      kind: "terminal",
      aggregateId: pairing.publicId,
    };
  }

  if (decision.kind === "exact_game") {
    return permanent(
      "WARGRAPH_EXACT_GAME_CONTEST_MISSING",
      "Exact-game state exists without a persisted contest.",
    );
  }

  let resolutionKind:
    WarGraphPairingDeadlineKind =
      decision.resolutionKind;

  let aggressorSlot: 1 | 2 | null = null;
  let defenderSlot: 1 | 2 | null = null;
  let aggressorActionsUsed = 0;
  let defenderActionsUsed = 0;

  if (
    resolutionKind !== "SYSTEM_VOID" &&
    (decision.aggressorAction ||
      decision.defenderAction)
  ) {
    [
      aggressorActionsUsed,
      defenderActionsUsed,
    ] = await Promise.all([
      tx.warGraphAction.count({
        where: {
          graphId,
          nightId: pairing.nightId,
          membershipId: aggressor.id,
        },
      }),
      tx.warGraphAction.count({
        where: {
          graphId,
          nightId: pairing.nightId,
          membershipId: defender.id,
        },
      }),
    ]);

    aggressorSlot = decision.aggressorAction
      ? actionSlot(aggressorActionsUsed)
      : null;
    defenderSlot = decision.defenderAction
      ? actionSlot(defenderActionsUsed)
      : null;

    if (
      (decision.aggressorAction &&
        aggressorSlot === null) ||
      (decision.defenderAction &&
        defenderSlot === null)
    ) {
      resolutionKind = "SYSTEM_VOID";
    }
  }

  const contest =
    await createDeadlineContest(tx, {
      graphId,
      nightId: pairing.nightId,
      rulesetId: pairing.rulesetId,
      kind: resolutionKind,
      provenance:
        deadlineContestProvenance(
          resolutionKind,
        ),
      createdAt: now,
      pairingId: pairing.id,
      advanceRequestId:
        pairing.advanceRequestId,
      aggressorMembershipId:
        aggressor.id,
      defenderMembershipId:
        defender.id,
      aggressorStartNodeId:
        pairing.aggressorStartNodeId,
      defenderStartNodeId:
        pairing.defenderStartNodeId,
      aggressorStartLayerOrdinal:
        pairing.aggressorStartLayerOrdinal,
      defenderStartLayerOrdinal:
        pairing.defenderStartLayerOrdinal,
      aggressorStartVersion:
        pairing.aggressorStartVersion,
      defenderStartVersion:
        pairing.defenderStartVersion,
      idempotencyKey:
        `wargraph:deadline:pairing:${pairing.publicId}`,
    });

  if (
    contest.status === "settled" ||
    contest.status === "voided" ||
    contest.status === "rejected"
  ) {
    return {
      kind: "terminal",
      aggregateId: pairing.publicId,
    };
  }

  const actions:
    WarGraphResolutionAction[] = [];
  const movements:
    WarGraphResolutionMovement[] = [];

  if (
    resolutionKind ===
      "DEFENDER_NO_START_DEFAULT" &&
    aggressorSlot !== null &&
    defenderSlot !== null &&
    aggressorOccupancy &&
    defenderOccupancy
  ) {
    const movementPlan =
      planDefenseDefaultMovement({
        aggressor: {
          playerId: aggressor.publicId,
          layer:
            pairing.aggressorStartLayerOrdinal as WarGraphLayer,
          actionsUsed: aggressorActionsUsed,
        },
        defender: {
          playerId: defender.publicId,
          layer:
            pairing.defenderStartLayerOrdinal as WarGraphLayer,
          actionsUsed: defenderActionsUsed,
        },
      });

    if (
      !movementPlan.ok ||
      movementPlan.kind !==
        "DEFENSE_DEFAULT" ||
      !movementPlan.defender
    ) {
      resolutionKind = "SYSTEM_VOID";
    } else {
      const frontierNodeId =
        await ensureVacantWarGraphFrontierNode(
          tx,
          graphId,
        );

      actions.push(
        {
          membershipId: aggressor.id,
          slot: aggressorSlot,
          actionType:
            "DEFENDER_NO_START_DEFAULT",
          idempotencyKey:
            `wargraph:action:no-start:${pairing.publicId}:aggressor`,
        },
        {
          membershipId: defender.id,
          slot: defenderSlot,
          actionType:
            "DEFENDER_NO_START_DEFAULT",
          idempotencyKey:
            `wargraph:action:no-start:${pairing.publicId}:defender`,
        },
      );

      movements.push(
        {
          membershipId: aggressor.id,
          fromNodeId:
            aggressorOccupancy.nodeId,
          toNodeId:
            defenderOccupancy.nodeId,
          fromLayerOrdinal:
            pairing.aggressorStartLayerOrdinal as WarGraphLayer,
          toLayerOrdinal:
            pairing.defenderStartLayerOrdinal as WarGraphLayer,
          expectedOccupancyVersion:
            pairing.aggressorStartVersion,
          expectedMembershipVersion:
            aggressor.version,
          movementType: "SEAT_CLAIM",
          reasonCode:
            "DEFENDER_NO_START_DEFAULT",
          sourceKey:
            `wargraph:movement:no-start:${pairing.publicId}:aggressor`,
          idempotencyKey:
            `wargraph:movement-ledger:no-start:${pairing.publicId}:aggressor`,
        },
        {
          membershipId: defender.id,
          fromNodeId:
            defenderOccupancy.nodeId,
          toNodeId: frontierNodeId,
          fromLayerOrdinal:
            pairing.defenderStartLayerOrdinal as WarGraphLayer,
          toLayerOrdinal: 3,
          expectedOccupancyVersion:
            pairing.defenderStartVersion,
          expectedMembershipVersion:
            defender.version,
          movementType:
            "CATASTROPHIC_FALL",
          reasonCode:
            "DEFENDER_NO_START_DEFAULT",
          sourceKey:
            `wargraph:movement:no-start:${pairing.publicId}:defender`,
          idempotencyKey:
            `wargraph:movement-ledger:no-start:${pairing.publicId}:defender`,
        },
      );
    }
  } else if (
    resolutionKind ===
      "CHALLENGER_ABANDONMENT" &&
    aggressorSlot !== null
  ) {
    actions.push({
      membershipId: aggressor.id,
      slot: aggressorSlot,
      actionType:
        "CHALLENGER_ABANDONMENT",
      idempotencyKey:
        `wargraph:action:abandonment:${pairing.publicId}:aggressor`,
    });
  }

  if (resolutionKind === "SYSTEM_VOID") {
    actions.length = 0;
    movements.length = 0;
  }

  const systemVoid =
    resolutionKind === "SYSTEM_VOID";

  const technicalVoid =
    resolutionKind === "TECHNICAL_VOID";

  const mutualVoid =
    resolutionKind === "MUTUAL_NO_START";

  const terminalStatus =
    systemVoid ||
    technicalVoid ||
    mutualVoid
      ? "voided"
      : "settled";

  const eventPayload: Prisma.InputJsonObject = {
    schema:
      "aoe2war-wargraph-administrative-resolution/v1",
    resolutionKind,
    punishmentApplied:
      resolutionKind ===
        "DEFENDER_NO_START_DEFAULT" ||
      resolutionKind ===
        "CHALLENGER_ABANDONMENT",
    battleResultRecorded: false,
    rewardsApplied: false,
    aggressorReady:
      Boolean(pairing.aggressorReadyAt),
    defenderReady:
      Boolean(pairing.defenderReadyAt),
    actionCharges: actions.length,
    movementCount: movements.length,
  };

  await applyWarGraphResolutionExactlyOnce(
    tx,
    {
      graphId,
      nightId: pairing.nightId,
      rulesetId: pairing.rulesetId,
      contestId: contest.id,
      expectedContestVersion:
        contest.version,
      expectedContestStatuses: [
        "pending",
      ],
      pairingId: pairing.id,
      advanceRequestId:
        pairing.advanceRequestId,
      occurredAt: now,
      actions,
      movements,
      rewards: [],
      terminal: {
        status: terminalStatus,
        qualificationStatus:
          systemVoid
            ? "system_void"
            : "ineligible",
        qualificationReason: null,
        resultStatus:
          systemVoid || technicalVoid
            ? "void"
            : "no_battle",
        outcomeCode: null,
        winnerMembershipId: null,
        loserMembershipId: null,
        settlementKey:
          terminalStatus === "settled"
            ? `wargraph:settlement:pairing-deadline:${pairing.publicId}`
            : null,
        eventType:
          systemVoid
            ? "WARGRAPH_CONTEST_SYSTEM_VOIDED"
            : "WARGRAPH_PAIRING_ADMINISTRATIVELY_RESOLVED",
        eventIdempotencyKey:
          `wargraph:event:pairing-deadline:${pairing.publicId}`,
        eventPayload,
        pairingStatus:
          terminalStatus === "settled"
            ? "settled"
            : "voided",
        advanceStatus:
          pairing.advanceRequestId
            ? systemVoid
              ? "system_void"
              : "settled"
            : null,
        defenseObligationStatus:
          pairing.advanceRequestId
            ? systemVoid
              ? "system_void"
              : resolutionKind ===
                    "DEFENDER_NO_START_DEFAULT"
                ? "defaulted"
                : "released"
            : undefined,
        resolutionCode:
          resolutionKind,
      },
      enqueueGravity:
        movements.length > 0,
    },
  );

  return {
    kind: "resolved",
    aggregateId: pairing.publicId,
    contestId: contest.id,
    resolutionCode: resolutionKind,
  };
}

async function resolveLeasedJob(
  prisma: PrismaClient,
  job: LeasedWarGraphDeadlineJob,
  now: Date,
): Promise<WarGraphDeadlinePersistedResult> {
  const payload =
    parseWarGraphDeadlineJobPayload(
      job.jobType,
      job.payload,
    );

  if (!payload) {
    return permanent(
      "WARGRAPH_DEADLINE_PAYLOAD_INVALID",
      "Durable deadline job failed its strict schema/type binding.",
    );
  }

  return prisma.$transaction(
    async (tx) => {
      await lockWarGraphTransaction(
        tx,
        job.graphId,
      );

      const liveJob =
        await tx.warGraphJob.findUnique({
          where: { id: job.id },
          select: {
            status: true,
            jobType: true,
            leaseOwner: true,
            leaseExpiresAt: true,
            version: true,
          },
        });

      if (
        !liveJob ||
        liveJob.status !== "running" ||
        liveJob.jobType !== job.jobType ||
        liveJob.leaseOwner !==
          job.leaseOwner ||
        liveJob.version !== job.version ||
        !liveJob.leaseExpiresAt ||
        liveJob.leaseExpiresAt <= now
      ) {
        return temporary(
          "WARGRAPH_DEADLINE_LEASE_STALE",
          "Deadline lease no longer owns the aggregate.",
        );
      }

      if (
        payload.schema ===
          "aoe2war-wargraph-resolve-advance-job/v1"
      ) {
        return resolveAdvance(
          tx,
          job.graphId,
          payload.advanceId,
          now,
        );
      }

      return resolvePairing(
        tx,
        job.graphId,
        payload.pairingId,
        now,
      );
    },
    {
      isolationLevel:
        Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 30_000,
    },
  );
}

async function leaseJobs(
  prisma: PrismaClient,
  input: {
    workerId: string;
    now: Date;
    leaseExpiresAt: Date;
    limit: number;
  },
): Promise<
  readonly LeasedWarGraphDeadlineJob[]
> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "war_graph_jobs"
      SET
        "status" = 'dead',
        "lease_owner" = NULL,
        "lease_expires_at" = NULL,
        "last_error_code" =
          'WARGRAPH_MAX_ATTEMPTS_EXHAUSTED',
        "last_error" =
          'Expired deadline lease exhausted the durable retry budget.',
        "completed_at" = ${input.now},
        "version" = "version" + 1,
        "updated_at" = ${input.now}
      WHERE "job_type" IN (
        ${Prisma.join(DEADLINE_JOB_TYPES)}
      )
        AND "status" = 'running'
        AND "lease_expires_at" <= ${input.now}
        AND "attempt_count" >= "max_attempts"
    `);

    return tx.$queryRaw<
      LeasedWarGraphDeadlineJob[]
    >(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "war_graph_jobs"
        WHERE "job_type" IN (
          ${Prisma.join(DEADLINE_JOB_TYPES)}
        )
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
          "available_at" ASC,
          "created_at" ASC,
          "id" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE "war_graph_jobs" job
      SET
        "status" = 'running',
        "lease_owner" = ${input.workerId},
        "lease_expires_at" =
          ${input.leaseExpiresAt},
        "attempt_count" =
          job."attempt_count" + 1,
        "last_error_code" = NULL,
        "last_error" = NULL,
        "completed_at" = NULL,
        "version" =
          job."version" + 1,
        "updated_at" = ${input.now}
      FROM candidates
      WHERE job."id" = candidates."id"
      RETURNING
        job."id" AS "id",
        job."graph_id" AS "graphId",
        job."job_type" AS "jobType",
        job."payload" AS "payload",
        job."available_at" AS "availableAt",
        job."attempt_count" AS "attemptCount",
        job."max_attempts" AS "maxAttempts",
        job."lease_owner" AS "leaseOwner",
        job."lease_expires_at" AS "leaseExpiresAt",
        job."version" AS "version",
        job."created_at" AS "createdAt"
    `);
  });
}

async function transitionJob(
  prisma: PrismaClient,
  transition: WarGraphDeadlineJobTransition,
): Promise<boolean> {
  const where: Prisma.WarGraphJobWhereInput = {
    id: transition.jobId,
    jobType: {
      in: [...DEADLINE_JOB_TYPES],
    },
    status: "running",
    leaseOwner: transition.leaseOwner,
    version: transition.leasedVersion,
  };

  const data:
    Prisma.WarGraphJobUpdateManyMutationInput =
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
            availableAt:
              transition.availableAt,
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode:
              transition.code.slice(0, 80),
            lastError:
              transition.detail.slice(0, 2_000),
            completedAt: null,
            version: { increment: 1 },
          }
        : {
            status: "dead",
            leaseOwner: null,
            leaseExpiresAt: null,
            lastErrorCode:
              transition.code.slice(0, 80),
            lastError:
              transition.detail.slice(0, 2_000),
            completedAt: transition.now,
            version: { increment: 1 },
          };

  const changed =
    await prisma.warGraphJob.updateMany({
      where,
      data,
    });

  return changed.count === 1;
}

export function createPrismaWarGraphDeadlineWorkerAdapter(
  prisma: PrismaClient = getPrisma(),
): WarGraphDeadlineWorkerAdapter {
  return {
    lease: (input) =>
      leaseJobs(prisma, input),
    resolve: (job, now) =>
      resolveLeasedJob(
        prisma,
        job,
        now,
      ),
    transition: (transition) =>
      transitionJob(
        prisma,
        transition,
      ),
  };
}

export const warGraphDeadlineWorkerInternals = {
  ADJUDICATION_GRACE_MS,
  actionSlot,
};
