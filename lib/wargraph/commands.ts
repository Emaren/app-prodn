import { isWarGraphPairingReadyWatcherEvidence } from "./watcherHealthContract";
import { Prisma, type PrismaClient } from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  appendWarGraphEvent,
  ensureWarGraphFoundation,
  lockWarGraphTransaction,
} from "./foundation";
import { isWarGraphPrimeWindow } from "./time";

type CommandContext = {
  uid: string;
  idempotencyKey: string;
  now?: Date;
  prisma?: PrismaClient;
};

export type WarGraphCommandResult = {
  changed: boolean;
  message: string;
  publicId: string;
};

export class WarGraphCommandError extends Error {
  readonly code: string;
  readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 503;

  constructor(
    code: string,
    message: string,
    status: WarGraphCommandError["status"] = 409,
  ) {
    super(message);
    this.name = "WarGraphCommandError";
    this.code = code;
    this.status = status;
  }
}

function requireClock(now: Date) {
  if (!Number.isFinite(now.getTime())) {
    throw new WarGraphCommandError(
      "INVALID_CLOCK",
      "The WarGraph clock is unavailable.",
      503,
    );
  }
}

async function actorState(
  tx: Prisma.TransactionClient,
  graphId: number,
  uid: string,
) {
  const user = await tx.user.findUnique({
    where: { uid },
    select: { id: true, uid: true },
  });
  if (!user) {
    throw new WarGraphCommandError(
      "AUTHENTICATED_USER_MISSING",
      "Your signed-in warrior identity could not be found.",
      401,
    );
  }
  const membership = await tx.warGraphMembership.findUnique({
    where: { graphId_userId: { graphId, userId: user.id } },
    include: {
      occupancy: { include: { node: { include: { layer: true } } } },
    },
  });
  if (!membership || membership.status !== "active" || !membership.occupancy) {
    throw new WarGraphCommandError(
      "WARGRAPH_MEMBERSHIP_REQUIRED",
      "Link an eligible Steam identity to join the WarGraph automatically.",
      403,
    );
  }
  return { user, membership, occupancy: membership.occupancy };
}

async function assertNoConflictingContract(
  tx: Prisma.TransactionClient,
  graphId: number,
  membershipId: number,
  options: { allowDefenseAdvanceId?: number } = {},
) {
  const [engagement, openAdvance, pendingDefense] = await Promise.all([
    tx.warGraphEngagement.findFirst({
      where: { graphId, membershipId, status: "active", releasedAt: null },
      select: { id: true },
    }),
    tx.warGraphAdvanceRequest.findFirst({
      where: {
        graphId,
        challengerMembershipId: membershipId,
        status: "open",
      },
      select: { id: true },
    }),
    tx.warGraphDefenseObligation.findFirst({
      where: {
        graphId,
        defenderMembershipId: membershipId,
        status: "pending",
        ...(options.allowDefenseAdvanceId
          ? { advanceRequestId: { not: options.allowDefenseAdvanceId } }
          : {}),
      },
      select: { id: true },
    }),
  ]);
  if (engagement || openAdvance || pendingDefense) {
    throw new WarGraphCommandError(
      "CONFLICTING_WARGRAPH_CONTRACT",
      "Finish your current WarGraph call before binding another.",
    );
  }
}

async function assertActionCapacity(
  tx: Prisma.TransactionClient,
  nightId: number,
  membershipId: number,
  actionLimit: number,
) {
  const used = await tx.warGraphAction.count({
    where: { nightId, membershipId },
  });
  if (used >= actionLimit) {
    throw new WarGraphCommandError(
      "NIGHT_ACTION_CAP_REACHED",
      `Night complete ${used}/${actionLimit}. Your table remains on the board.`,
    );
  }
}

function txOptions() {
  return {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5_000,
    timeout: 15_000,
  } as const;
}

export async function openWarGraphAdvance(
  context: CommandContext,
): Promise<WarGraphCommandResult> {
  const now = context.now ?? new Date();
  requireClock(now);
  if (!isWarGraphPrimeWindow(now)) {
    throw new WarGraphCommandError(
      "PRIME_WINDOW_REQUIRED",
      "New advances open only from 5–11 PM Edmonton.",
      422,
    );
  }
  const prisma = context.prisma ?? getPrisma();
  const foundation = await ensureWarGraphFoundation({
    prisma,
    now,
    force: true,
  });

  return prisma.$transaction(async (tx) => {
    await lockWarGraphTransaction(tx, foundation.graphId);
    const existing = await tx.warGraphAdvanceRequest.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
    });
    if (existing) {
      const actor = await actorState(tx, foundation.graphId, context.uid);
      if (existing.challengerMembershipId !== actor.membership.id) {
        throw new WarGraphCommandError(
          "IDEMPOTENCY_CONFLICT",
          "That action key already belongs to another command.",
        );
      }
      return {
        changed: false,
        message: "Your advance is already open.",
        publicId: existing.publicId,
      };
    }

    const { user, membership, occupancy } = await actorState(
      tx,
      foundation.graphId,
      context.uid,
    );
    const sourceLayer = occupancy.node.layer;
    if (sourceLayer.ordinal <= 0 || sourceLayer.ordinal > 3) {
      throw new WarGraphCommandError(
        "NO_INWARD_LAYER",
        "The Crown defends; it does not advance.",
        422,
      );
    }
    await assertNoConflictingContract(tx, foundation.graphId, membership.id);

    const ruleset = await tx.warGraphRuleset.findUniqueOrThrow({
      where: { id: foundation.rulesetId },
    });
    await assertActionCapacity(
      tx,
      foundation.nightId,
      membership.id,
      ruleset.maxResolvedActions,
    );
    const targetLayer = await tx.warGraphLayer.findUnique({
      where: {
        graphId_ordinal: {
          graphId: foundation.graphId,
          ordinal: sourceLayer.ordinal - 1,
        },
      },
    });
    if (!targetLayer) {
      throw new WarGraphCommandError(
        "TARGET_LAYER_MISSING",
        "The inward ring is not available.",
        503,
      );
    }
    const defenderCount = await tx.warGraphOccupancy.count({
      where: {
        graphId: foundation.graphId,
        node: { layerId: targetLayer.id },
      },
    });
    if (defenderCount === 0) {
      throw new WarGraphCommandError(
        "TARGET_RING_VACANT",
        "That ring is vacant and must be resolved by constitutional Gravity.",
        422,
      );
    }

    const responseDeadlineAt = new Date(
      now.getTime() + ruleset.responseWindowSeconds * 1_000,
    );
    const advance = await tx.warGraphAdvanceRequest.create({
      data: {
        graphId: foundation.graphId,
        nightId: foundation.nightId,
        rulesetId: ruleset.id,
        challengerMembershipId: membership.id,
        sourceNodeId: occupancy.nodeId,
        targetLayerId: targetLayer.id,
        sourceLayerOrdinal: sourceLayer.ordinal,
        targetLayerOrdinal: targetLayer.ordinal,
        idempotencyKey: context.idempotencyKey,
        status: "open",
        requestedAt: now,
        responseDeadlineAt,
      },
    });
    await tx.warGraphJob.upsert({
      where: { dedupeKey: `resolve-advance:${advance.publicId}` },
      update: {},
      create: {
        graphId: foundation.graphId,
        jobType: "resolve_advance",
        dedupeKey: `resolve-advance:${advance.publicId}`,
        payload: {
          schema: "aoe2war-wargraph-resolve-advance-job/v1",
          advanceId: advance.publicId,
        },
        status: "queued",
        availableAt: responseDeadlineAt,
      },
    });
    await appendWarGraphEvent(tx, {
      graphId: foundation.graphId,
      nightId: foundation.nightId,
      membershipId: membership.id,
      advanceRequestId: advance.id,
      actorUserId: user.id,
      aggregateType: "advance",
      aggregateId: advance.publicId,
      eventType: "WARGRAPH_ADVANCE_OPENED",
      idempotencyKey: `event:advance:${context.idempotencyKey}`,
      priorVersion: null,
      newVersion: advance.version,
      payload: {
        challengerMembershipId: membership.publicId,
        sourceNodeId: occupancy.node.publicId,
        sourceLayerOrdinal: sourceLayer.ordinal,
        targetLayerOrdinal: targetLayer.ordinal,
        responseDeadlineAt: responseDeadlineAt.toISOString(),
      },
      occurredAt: now,
    });
    await Promise.all([
      tx.warGraph.update({
        where: { id: foundation.graphId },
        data: { projectionVersion: { increment: 1 } },
      }),
      tx.warGraphNight.update({
        where: { id: foundation.nightId },
        data: { status: "prime", version: { increment: 1 } },
      }),
    ]);
    return {
      changed: true,
      message: `Advance opened toward ${targetLayer.displayName}. The ring has fifteen minutes to answer.`,
      publicId: advance.publicId,
    };
  }, txOptions());
}

export async function takeWarGraphFight(
  context: CommandContext & { advanceId: string },
): Promise<WarGraphCommandResult> {
  const now = context.now ?? new Date();
  requireClock(now);
  const prisma = context.prisma ?? getPrisma();
  const foundation = await ensureWarGraphFoundation({
    prisma,
    now,
    force: true,
  });

  return prisma.$transaction(async (tx) => {
    await lockWarGraphTransaction(tx, foundation.graphId);
    const existing = await tx.warGraphPairing.findUnique({
      where: { idempotencyKey: context.idempotencyKey },
    });
    if (existing) {
      const actor = await actorState(tx, foundation.graphId, context.uid);
      if (existing.defenderMembershipId !== actor.membership.id) {
        throw new WarGraphCommandError(
          "IDEMPOTENCY_CONFLICT",
          "That action key already belongs to another command.",
        );
      }
      return {
        changed: false,
        message: "That battle contract is already bound.",
        publicId: existing.publicId,
      };
    }

    const { user, membership, occupancy } = await actorState(
      tx,
      foundation.graphId,
      context.uid,
    );
    const advance = await tx.warGraphAdvanceRequest.findUnique({
      where: { publicId: context.advanceId },
      include: {
        challenger: { include: { occupancy: { include: { node: true } } } },
        sourceNode: true,
        targetLayer: true,
        defenseObligation: true,
      },
    });
    if (!advance || advance.graphId !== foundation.graphId) {
      throw new WarGraphCommandError(
        "ADVANCE_NOT_FOUND",
        "That advance is no longer on the living board.",
        404,
      );
    }
    if (advance.status !== "open" || advance.responseDeadlineAt <= now) {
      throw new WarGraphCommandError(
        "ADVANCE_CLOSED",
        "That ring call has already closed.",
      );
    }
    if (
      occupancy.node.layerId !== advance.targetLayerId ||
      membership.id === advance.challengerMembershipId
    ) {
      throw new WarGraphCommandError(
        "DEFENDER_NOT_ELIGIBLE",
        "Only an available warrior in the challenged ring can take this fight.",
        403,
      );
    }
    if (
      !advance.challenger.occupancy ||
      advance.challenger.occupancy.graphId !== foundation.graphId ||
      advance.challenger.occupancy.nodeId !== advance.sourceNodeId ||
      advance.challenger.occupancy.updatedAt > advance.requestedAt ||
      advance.sourceNode.graphId !== foundation.graphId ||
      advance.targetLayer.graphId !== foundation.graphId ||
      advance.challenger.occupancy.node.layerId !== advance.sourceNode.layerId
    ) {
      throw new WarGraphCommandError(
        "CHALLENGER_POSITION_UNAVAILABLE",
        "The challenger position changed before the contract could bind.",
      );
    }
    await assertNoConflictingContract(tx, foundation.graphId, membership.id, {
      allowDefenseAdvanceId: advance.id,
    });
    const challengerEngagement = await tx.warGraphEngagement.findFirst({
      where: {
        graphId: foundation.graphId,
        membershipId: advance.challengerMembershipId,
        status: "active",
        releasedAt: null,
      },
    });
    if (challengerEngagement) {
      throw new WarGraphCommandError(
        "CHALLENGER_ALREADY_ENGAGED",
        "The challenger is already bound to another fight.",
      );
    }
    const ruleset = await tx.warGraphRuleset.findUniqueOrThrow({
      where: { id: advance.rulesetId },
    });
    await Promise.all([
      assertActionCapacity(
        tx,
        advance.nightId,
        membership.id,
        ruleset.maxResolvedActions,
      ),
      assertActionCapacity(
        tx,
        advance.nightId,
        advance.challengerMembershipId,
        ruleset.maxResolvedActions,
      ),
    ]);

    const launchDeadlineAt = new Date(
      now.getTime() + ruleset.launchWindowSeconds * 1_000,
    );
    const pairing = await tx.warGraphPairing.create({
      data: {
        graphId: foundation.graphId,
        nightId: advance.nightId,
        rulesetId: ruleset.id,
        advanceRequestId: advance.id,
        aggressorMembershipId: advance.challengerMembershipId,
        defenderMembershipId: membership.id,
        aggressorStartNodeId: advance.challenger.occupancy.nodeId,
        defenderStartNodeId: occupancy.nodeId,
        aggressorStartLayerOrdinal: advance.sourceLayerOrdinal,
        defenderStartLayerOrdinal: advance.targetLayerOrdinal,
        aggressorStartVersion: advance.challenger.occupancy.version,
        defenderStartVersion: occupancy.version,
        source: "advance",
        idempotencyKey: context.idempotencyKey,
        status: "accepted",
        acceptedAt: now,
        launchDeadlineAt,
      },
    });
    await tx.warGraphJob.upsert({
      where: { dedupeKey: `resolve-pairing:${pairing.publicId}` },
      update: {},
      create: {
        graphId: foundation.graphId,
        jobType: "resolve_pairing",
        dedupeKey: `resolve-pairing:${pairing.publicId}`,
        payload: {
          schema: "aoe2war-wargraph-resolve-pairing-job/v1",
          pairingId: pairing.publicId,
        },
        status: "queued",
        availableAt: launchDeadlineAt,
      },
    });
    await tx.warGraphEngagement.createMany({
      data: [
        {
          graphId: foundation.graphId,
          pairingId: pairing.id,
          membershipId: advance.challengerMembershipId,
          role: "aggressor",
          status: "active",
          acquiredAt: now,
        },
        {
          graphId: foundation.graphId,
          pairingId: pairing.id,
          membershipId: membership.id,
          role: "defender",
          status: "active",
          acquiredAt: now,
        },
      ],
    });
    await tx.warGraphAdvanceRequest.update({
      where: { id: advance.id },
      data: {
        status: "accepted",
        acceptedAt: now,
        resolutionCode: "FIRST_ELIGIBLE_DEFENDER_ACCEPTED",
        version: { increment: 1 },
      },
    });
    if (advance.defenseObligation?.status === "pending") {
      await tx.warGraphDefenseObligation.update({
        where: { id: advance.defenseObligation.id },
        data: {
          status: "released",
          resolutionCode: "RING_DEFENDER_ACCEPTED",
          resolvedAt: now,
          version: { increment: 1 },
        },
      });
    }
    await appendWarGraphEvent(tx, {
      graphId: foundation.graphId,
      nightId: advance.nightId,
      membershipId: membership.id,
      advanceRequestId: advance.id,
      pairingId: pairing.id,
      actorUserId: user.id,
      aggregateType: "pairing",
      aggregateId: pairing.publicId,
      eventType: "WARGRAPH_FIGHT_TAKEN",
      idempotencyKey: `event:fight:${context.idempotencyKey}`,
      priorVersion: null,
      newVersion: pairing.version,
      payload: {
        advanceId: advance.publicId,
        aggressorMembershipId: advance.challenger.publicId,
        defenderMembershipId: membership.publicId,
        launchDeadlineAt: launchDeadlineAt.toISOString(),
      },
      occurredAt: now,
    });
    await Promise.all([
      tx.warGraph.update({
        where: { id: foundation.graphId },
        data: { projectionVersion: { increment: 1 } },
      }),
      tx.warGraphNight.update({
        where: { id: advance.nightId },
        data: { version: { increment: 1 } },
      }),
    ]);
    return {
      changed: true,
      message: "Fight bound. Both warriors now have thirty minutes to ready and launch.",
      publicId: pairing.publicId,
    };
  }, txOptions());
}

export async function markWarGraphReady(
  context: CommandContext & { engagementId: string },
): Promise<WarGraphCommandResult> {
  const now = context.now ?? new Date();
  requireClock(now);
  const prisma = context.prisma ?? getPrisma();
  const foundation = await ensureWarGraphFoundation({
    prisma,
    now,
    force: true,
  });

  return prisma.$transaction(async (tx) => {
    await lockWarGraphTransaction(tx, foundation.graphId);
    const existingEvent = await tx.warGraphEvent.findUnique({
      where: { idempotencyKey: `event:ready:${context.idempotencyKey}` },
    });
    if (existingEvent) {
      return {
        changed: false,
        message: "Your ready signal is already recorded.",
        publicId: context.engagementId,
      };
    }
    const { user, membership } = await actorState(
      tx,
      foundation.graphId,
      context.uid,
    );
    const pairing = await tx.warGraphPairing.findUnique({
      where: { publicId: context.engagementId },
    });
    if (!pairing || pairing.graphId !== foundation.graphId) {
      throw new WarGraphCommandError(
        "PAIRING_NOT_FOUND",
        "That battle contract is no longer active.",
        404,
      );
    }
    if (!ACTIVE_PAIRING_STATUSES_FOR_READY.has(pairing.status)) {
      throw new WarGraphCommandError(
        "PAIRING_NOT_READYABLE",
        "That battle contract can no longer accept ready signals.",
      );
    }
    if (pairing.launchDeadlineAt <= now || pairing.commencedAt) {
      throw new WarGraphCommandError(
        "LAUNCH_WINDOW_CLOSED",
        "The launch window has closed; the fail-safe resolver now owns this contract.",
      );
    }
    const isAggressor = pairing.aggressorMembershipId === membership.id;
    const isDefender = pairing.defenderMembershipId === membership.id;
    if (!isAggressor && !isDefender) {
      throw new WarGraphCommandError(
        "PAIRING_PARTICIPANT_REQUIRED",
        "Only a bound warrior can mark this battle ready.",
        403,
      );
    }
    const alreadyReady = isAggressor
      ? Boolean(pairing.aggressorReadyAt)
      : Boolean(pairing.defenderReadyAt);
    if (alreadyReady) {
      return {
        changed: false,
        message: "Your ready signal is already recorded.",
        publicId: pairing.publicId,
      };
    }

    const watcherPresence = await tx.warGraphPresence.findFirst({
      where: {
        graphId: foundation.graphId,
        membershipId: membership.id,
      },
      select: {
        watcherSeenAt: true,
        watcherHealthy: true,
        watcherIdentityHash: true,
      },
    });
    if (
      !isWarGraphPairingReadyWatcherEvidence({
        watcherSeenAt: watcherPresence?.watcherSeenAt,
        watcherHealthy:
          watcherPresence?.watcherHealthy === true,
        watcherIdentityHash:
          watcherPresence?.watcherIdentityHash,
        now,
      })
    ) {
      throw new WarGraphCommandError(
        "WATCHER_READY_REQUIRED",
        "READY requires a current healthy HD Watcher monitor.",
        409,
      );
    }

    const nextAggressorReadyAt = isAggressor
      ? pairing.aggressorReadyAt ?? now
      : pairing.aggressorReadyAt;
    const nextDefenderReadyAt = isDefender
      ? pairing.defenderReadyAt ?? now
      : pairing.defenderReadyAt;
    const bothReady = Boolean(nextAggressorReadyAt && nextDefenderReadyAt);
    const updated = await tx.warGraphPairing.update({
      where: { id: pairing.id },
      data: {
        aggressorReadyAt: nextAggressorReadyAt,
        defenderReadyAt: nextDefenderReadyAt,
        status: bothReady ? "engaged" : "accepted",
        version: { increment: 1 },
      },
    });
    await appendWarGraphEvent(tx, {
      graphId: foundation.graphId,
      nightId: pairing.nightId,
      membershipId: membership.id,
      pairingId: pairing.id,
      actorUserId: user.id,
      aggregateType: "pairing",
      aggregateId: pairing.publicId,
      eventType: "WARGRAPH_WARRIOR_READY",
      idempotencyKey: `event:ready:${context.idempotencyKey}`,
      priorVersion: pairing.version,
      newVersion: updated.version,
      payload: {
        role: isAggressor ? "aggressor" : "defender",
        bothReady,
        launchDeadlineAt: pairing.launchDeadlineAt.toISOString(),
      },
      occurredAt: now,
    });
    await Promise.all([
      tx.warGraph.update({
        where: { id: foundation.graphId },
        data: { projectionVersion: { increment: 1 } },
      }),
      tx.warGraphNight.update({
        where: { id: pairing.nightId },
        data: { version: { increment: 1 } },
      }),
    ]);
    return {
      changed: true,
      message: bothReady
        ? "Both warriors are ready. Launch the exact Watcher-monitored game now."
        : "Ready recorded. Your opponent can now confirm.",
      publicId: pairing.publicId,
    };
  }, txOptions());
}

const ACTIVE_PAIRING_STATUSES_FOR_READY = new Set(["accepted", "engaged"]);
