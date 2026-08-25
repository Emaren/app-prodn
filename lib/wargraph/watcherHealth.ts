import { createHmac } from "node:crypto";

import { Prisma, type PrismaClient } from "../generated/prisma";

import { lockWarGraphTransaction, WARGRAPH_SLUG } from "./foundation";
import { classifyWarGraphWatcherHealth } from "./watcherHealthContract";

function identitySecret(): string {
  const secret =
    process.env.WARGRAPH_WATCHER_IDENTITY_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WARGRAPH_WATCHER_IDENTITY_SECRET_REQUIRED");
  }
  return "aoe2war-wargraph-local-watcher-identity-only";
}

function watcherIdentityHash(input: {
  apiKeyId: number;
  userId: number;
  watcherId: string | null;
  sessionId: string | null;
}): string {
  return createHmac("sha256", identitySecret())
    .update("aoe2war-wargraph-watcher-identity/v1\n")
    .update(String(input.apiKeyId))
    .update("\n")
    .update(String(input.userId))
    .update("\n")
    .update(input.watcherId ?? "")
    .update("\n")
    .update(input.sessionId ?? "")
    .digest("hex");
}

/** Project authenticated Watcher telemetry into WarGraph readiness evidence. */
export async function recordWarGraphWatcherHealth(input: {
  prisma: PrismaClient;
  userId: number;
  apiKeyId: number;
  eventType: string;
  watcherId: string | null;
  sessionId: string | null;
  metadata: unknown;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    throw new Error("WARGRAPH_WATCHER_CLOCK_INVALID");
  }
  const graph = await input.prisma.warGraph.findUnique({
    where: { slug: WARGRAPH_SLUG },
    select: { id: true, status: true },
  });
  if (!graph || graph.status !== "active") return false;
  const membership = await input.prisma.warGraphMembership.findUnique({
    where: { graphId_userId: { graphId: graph.id, userId: input.userId } },
    select: { id: true, status: true },
  });
  if (!membership || membership.status !== "active") return false;

  const health = classifyWarGraphWatcherHealth({
    eventType: input.eventType,
    metadata: input.metadata,
  });
  const identityHash = watcherIdentityHash(input);
  return input.prisma.$transaction(
    async (tx) => {
      await lockWarGraphTransaction(tx, graph.id);
      const stillActive = await tx.warGraphMembership.findFirst({
        where: {
          id: membership.id,
          graphId: graph.id,
          userId: input.userId,
          status: "active",
        },
        select: { id: true },
      });
      if (!stillActive) return false;
      await tx.warGraphPresence.upsert({
        where: { membershipId: membership.id },
        update: {
          watcherSeenAt: now,
          watcherHealthy: health.monitorAttached,
          watcherIdentityHash: identityHash,
          version: { increment: 1 },
        },
        create: {
          graphId: graph.id,
          membershipId: membership.id,
          watcherSeenAt: now,
          watcherHealthy: health.monitorAttached,
          watcherIdentityHash: identityHash,
        },
      });
      await tx.warGraph.update({
        where: { id: graph.id },
        data: { projectionVersion: { increment: 1 } },
      });
      return true;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 10_000,
    },
  );
}

export const warGraphWatcherHealthInternals = { watcherIdentityHash };
