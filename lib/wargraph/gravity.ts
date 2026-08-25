import { createHash } from "node:crypto";

import type { Prisma, PrismaClient } from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  appendWarGraphEvent,
  lockWarGraphTransaction,
} from "./foundation";
import {
  rankWarGraphGravityCandidates,
  warGraphGravityContractInternals,
} from "./gravityContract";
export type { WarGraphGravityCandidate } from "./gravityContract";

type TransactionClient = Prisma.TransactionClient;

export type WarGraphGravityResult = {
  movedMembershipIds: readonly number[];
  projectionChanged: boolean;
};

function gravityIdentity(input: {
  graphId: number;
  nightId: number;
  triggerKey: string;
  membershipPublicId: string;
  fromNodePublicId: string;
  toNodePublicId: string;
}) {
  const digest = createHash("sha256")
    .update("aoe2war-wargraph-gravity/v1\n")
    .update(JSON.stringify(input))
    .digest("hex");
  return `gravity:${digest}`;
}

async function verifiedGameCounts(
  tx: TransactionClient,
  graphId: number,
  membershipIds: readonly number[],
): Promise<Map<number, number>> {
  if (membershipIds.length === 0) return new Map();
  const contests = await tx.warGraphContest.findMany({
    where: {
      graphId,
      kind: "VERIFIED_BATTLE",
      status: "settled",
      OR: [
        { aggressorMembershipId: { in: [...membershipIds] } },
        { defenderMembershipId: { in: [...membershipIds] } },
      ],
    },
    select: {
      aggressorMembershipId: true,
      defenderMembershipId: true,
    },
  });
  const counts = new Map<number, number>();
  for (const contest of contests) {
    for (const membershipId of [
      contest.aggressorMembershipId,
      contest.defenderMembershipId,
    ]) {
      if (!membershipIds.includes(membershipId)) continue;
      counts.set(membershipId, (counts.get(membershipId) ?? 0) + 1);
    }
  }
  return counts;
}

async function selectGravityCandidate(
  tx: TransactionClient,
  input: {
    graphId: number;
    nightId: number;
    sourceLayerOrdinal: number;
    targetNodePublicId: string;
    movedMembershipIds: ReadonlySet<number>;
  },
) {
  const occupancies = await tx.warGraphOccupancy.findMany({
    where: {
      graphId: input.graphId,
      node: { layer: { ordinal: input.sourceLayerOrdinal } },
      membership: {
        status: "active",
        engagements: { none: { status: "active", releasedAt: null } },
        defenseObligations: { none: { status: "pending" } },
        advances: { none: { status: { in: ["open", "accepted", "bound"] } } },
      },
    },
    include: {
      node: { include: { layer: true } },
      membership: true,
    },
  });
  const eligible = occupancies.filter(
    (occupancy) => !input.movedMembershipIds.has(occupancy.membershipId),
  );
  const counts = await verifiedGameCounts(
    tx,
    input.graphId,
    eligible.map((occupancy) => occupancy.membershipId),
  );
  const ranked = rankWarGraphGravityCandidates(
    eligible.map((occupancy) => ({
      membershipId: occupancy.membershipId,
      membershipPublicId: occupancy.membership.publicId,
      lastParticipationAt: occupancy.membership.lastParticipationAt,
      verifiedGamesPlayed: counts.get(occupancy.membershipId) ?? 0,
      occupiedAt: occupancy.occupiedAt,
      lastGravityAt: occupancy.membership.lastGravityAt,
    })),
    {
      nightId: input.nightId,
      targetNodePublicId: input.targetNodePublicId,
    },
  );
  const selected = ranked[0];
  return selected
    ? eligible.find((occupancy) => occupancy.membershipId === selected.membershipId) ??
        null
    : null;
}

export async function applyWarGraphGravityInTransaction(
  tx: TransactionClient,
  input: {
    graphId: number;
    nightId: number;
    triggerKey: string;
    now: Date;
  },
): Promise<WarGraphGravityResult> {
  if (
    !Number.isSafeInteger(input.graphId) ||
    input.graphId <= 0 ||
    !Number.isSafeInteger(input.nightId) ||
    input.nightId <= 0 ||
    !input.triggerKey ||
    input.triggerKey.length > 160 ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw new Error("WARGRAPH_GRAVITY_INPUT_INVALID");
  }

  const night = await tx.warGraphNight.findFirst({
    where: { id: input.nightId, graphId: input.graphId },
    select: { id: true },
  });
  if (!night) throw new Error("WARGRAPH_GRAVITY_NIGHT_SCOPE_INVALID");

  const movedMembershipIds = new Set<number>();
  // Crown is intentionally absent: Gravity may repair Ring I and Ring II only.
  for (const targetLayerOrdinal of [1, 2] as const) {
    const vacantNodes = await tx.warGraphNode.findMany({
      where: {
        graphId: input.graphId,
        layer: { ordinal: targetLayerOrdinal },
        occupancy: null,
      },
      orderBy: [{ ordinal: "asc" }, { id: "asc" }],
      include: { layer: true },
    });

    for (const targetNode of vacantNodes) {
      const candidate = await selectGravityCandidate(tx, {
        graphId: input.graphId,
        nightId: input.nightId,
        sourceLayerOrdinal: targetLayerOrdinal + 1,
        targetNodePublicId: targetNode.publicId,
        movedMembershipIds,
      });
      if (!candidate) continue;
      if (
        candidate.node.layer.ordinal !== targetLayerOrdinal + 1 ||
        targetNode.layer.ordinal !== targetLayerOrdinal
      ) {
        throw new Error("WARGRAPH_GRAVITY_GEOMETRY_DRIFT");
      }

      const sourceKey = gravityIdentity({
        graphId: input.graphId,
        nightId: input.nightId,
        triggerKey: input.triggerKey,
        membershipPublicId: candidate.membership.publicId,
        fromNodePublicId: candidate.node.publicId,
        toNodePublicId: targetNode.publicId,
      });
      const existing = await tx.warGraphMovement.findUnique({
        where: { sourceKey },
        select: { membershipId: true },
      });
      if (existing) {
        if (existing.membershipId !== candidate.membershipId) {
          throw new Error("WARGRAPH_GRAVITY_IDEMPOTENCY_COLLISION");
        }
        movedMembershipIds.add(candidate.membershipId);
        continue;
      }

      const membershipVersionBefore = candidate.membership.version;
      await tx.warGraphOccupancy.update({
        where: { id: candidate.id },
        data: {
          nodeId: targetNode.id,
          occupiedAt: input.now,
          version: { increment: 1 },
        },
      });
      const membership = await tx.warGraphMembership.update({
        where: { id: candidate.membershipId },
        data: {
          lastGravityAt: input.now,
          version: { increment: 1 },
        },
        select: { version: true },
      });
      await tx.warGraphMovement.create({
        data: {
          graphId: input.graphId,
          nightId: input.nightId,
          membershipId: candidate.membershipId,
          fromNodeId: candidate.nodeId,
          toNodeId: targetNode.id,
          fromLayerOrdinal: candidate.node.layer.ordinal,
          toLayerOrdinal: targetNode.layer.ordinal,
          movementType: "GRAVITY_MOVE",
          reasonCode: "PARTICIPATION_GRAVITY_FILL",
          sourceKey,
          idempotencyKey: sourceKey,
          membershipVersionBefore,
          membershipVersionAfter: membership.version,
          movedAt: input.now,
        },
      });
      await appendWarGraphEvent(tx, {
        graphId: input.graphId,
        nightId: input.nightId,
        membershipId: candidate.membershipId,
        aggregateType: "membership",
        aggregateId: candidate.membership.publicId,
        eventType: "WARGRAPH_GRAVITY_APPLIED",
        idempotencyKey: `event:${sourceKey}`,
        priorVersion: membershipVersionBefore,
        newVersion: membership.version,
        payload: {
          fromNodeId: candidate.node.publicId,
          toNodeId: targetNode.publicId,
          fromLayerOrdinal: candidate.node.layer.ordinal,
          toLayerOrdinal: targetNode.layer.ordinal,
          triggerKey: input.triggerKey,
          rewardWolo: 0,
          actionCharge: 0,
        },
        occurredAt: input.now,
      });
      movedMembershipIds.add(candidate.membershipId);
    }
  }

  if (movedMembershipIds.size > 0) {
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
  }
  return {
    movedMembershipIds: [...movedMembershipIds],
    projectionChanged: movedMembershipIds.size > 0,
  };
}

export async function applyWarGraphGravity(input: {
  graphId: number;
  nightId: number;
  triggerKey: string;
  now?: Date;
  prisma?: PrismaClient;
}): Promise<WarGraphGravityResult> {
  const prisma = input.prisma ?? getPrisma();
  const now = input.now ?? new Date();
  return prisma.$transaction(
    async (tx) => {
      await lockWarGraphTransaction(tx, input.graphId);
      return applyWarGraphGravityInTransaction(tx, { ...input, now });
    },
    {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 20_000,
    },
  );
}

export { rankWarGraphGravityCandidates } from "./gravityContract";
export const warGraphGravityInternals = warGraphGravityContractInternals;
