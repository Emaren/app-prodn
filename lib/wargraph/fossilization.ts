import type { Prisma } from "../generated/prisma";

import { appendWarGraphEvent } from "./foundation";
import {
  participatedDuringWarGraphDay,
  warGraphFossilizationStage,
} from "./fossilizationContract";

type TransactionClient = Prisma.TransactionClient;

/**
 * Settle one full WarGraph day exactly once. This runs at the following Prime
 * boundary, not at Last Call, so daytime participation can still awaken a node.
 */
export async function advanceWarGraphFossilizationInTransaction(
  tx: TransactionClient,
  input: {
    graphId: number;
    nightId: number;
    nextPrimeOpensAt: Date;
    now: Date;
  },
) {
  if (
    !Number.isFinite(input.now.getTime()) ||
    !Number.isFinite(input.nextPrimeOpensAt.getTime()) ||
    input.now < input.nextPrimeOpensAt
  ) {
    throw new Error("WARGRAPH_FOSSILIZATION_WINDOW_INVALID");
  }
  const night = await tx.warGraphNight.findFirst({
    where: { id: input.nightId, graphId: input.graphId },
  });
  if (!night) throw new Error("WARGRAPH_FOSSILIZATION_NIGHT_INVALID");
  if (night.status === "settled") return { changed: false, membershipCount: 0 };
  if (night.status !== "static") {
    throw new Error("WARGRAPH_FOSSILIZATION_CONTRACTS_OPEN");
  }

  const memberships = await tx.warGraphMembership.findMany({
    where: {
      graphId: input.graphId,
      status: "active",
      eligibleAt: { lt: input.nextPrimeOpensAt },
    },
    include: { presence: true },
    orderBy: { id: "asc" },
  });
  let changed = 0;
  for (const membership of memberships) {
    const idempotencyKey =
      `fossil:${input.nightId}:${membership.publicId}`;
    const existing = await tx.warGraphEvent.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) continue;

    const participated = participatedDuringWarGraphDay(
      membership,
      night.primeOpensAt,
      input.nextPrimeOpensAt,
    );
    const dormantNights = participated ? 0 : membership.dormantNights + 1;
    const fossilizationStage = warGraphFossilizationStage(dormantNights);
    const updated = await tx.warGraphMembership.update({
      where: { id: membership.id },
      data: {
        dormantNights,
        fossilizationStage,
        version: { increment: 1 },
      },
      select: { version: true },
    });
    await appendWarGraphEvent(tx, {
      graphId: input.graphId,
      nightId: input.nightId,
      membershipId: membership.id,
      aggregateType: "membership",
      aggregateId: membership.publicId,
      eventType:
        participated && membership.fossilizationStage > 0
          ? "WARGRAPH_WARRIOR_AWAKENED"
          : participated
            ? "WARGRAPH_PARTICIPATION_CONFIRMED"
            : "WARGRAPH_FOSSILIZATION_ADVANCED",
      idempotencyKey,
      priorVersion: membership.version,
      newVersion: updated.version,
      payload: {
        participated,
        dormantNightsBefore: membership.dormantNights,
        dormantNightsAfter: dormantNights,
        fossilizationStageBefore: membership.fossilizationStage,
        fossilizationStageAfter: fossilizationStage,
        windowOpenedAt: night.primeOpensAt.toISOString(),
        windowClosedAt: input.nextPrimeOpensAt.toISOString(),
      },
      occurredAt: input.now,
    });
    changed += 1;
  }

  await tx.warGraphNight.update({
    where: { id: night.id },
    data: {
      status: "settled",
      staticAt: night.staticAt ?? night.lastCallAt,
      settledAt: input.now,
      version: { increment: 1 },
    },
  });
  if (changed > 0) {
    await tx.warGraph.update({
      where: { id: input.graphId },
      data: { projectionVersion: { increment: 1 } },
    });
  }
  return { changed: true, membershipCount: changed };
}

export { warGraphFossilizationStage } from "./fossilizationContract";
export { warGraphFossilizationInternals } from "./fossilizationContract";
