import { createHash, createHmac, randomBytes } from "node:crypto";

import { Prisma, type PrismaClient } from "../generated/prisma";
import { getPrisma } from "../prisma";

import {
  appendWarGraphEvent,
  ensureWarGraphFoundation,
  lockWarGraphTransaction,
} from "./foundation";

export const WARGRAPH_SPECTATOR_COOKIE = "aoe2war_wargraph_spectator";
export const WARGRAPH_SPECTATOR_TTL_SECONDS = 65;

const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_VISIBLE_ADVANCES = 50;

type PresenceInput = {
  uid: string | null;
  sessionToken: string | null;
  clientAddress: string;
  userAgent: string | null;
  visibleAdvanceIds: readonly string[];
  focusEngagementId: string | null;
  now?: Date;
  prisma?: PrismaClient;
};

export type WarGraphPresenceResult = {
  sessionToken: string;
  sessionCreated: boolean;
  spectatorCount: number;
  projectionVersion: number;
  acknowledgedAdvanceIds: readonly string[];
};

function presenceSecret(): string {
  const configured =
    process.env.WARGRAPH_PRESENCE_HASH_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.NEXTAUTH_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("WARGRAPH_PRESENCE_HASH_SECRET_REQUIRED");
  }
  return "aoe2war-wargraph-local-presence-only";
}

function privateHash(kind: string, value: string): string {
  return createHmac("sha256", presenceSecret())
    .update(kind)
    .update("\n")
    .update(value)
    .digest("hex");
}

function sessionIdentity(token: string | null) {
  if (token && SESSION_TOKEN.test(token)) {
    return { token, created: false };
  }
  return {
    token: randomBytes(32).toString("base64url"),
    created: true,
  };
}

export function validateVisibleWarGraphAdvanceIds(
  input: unknown,
): string[] | null {
  if (!Array.isArray(input) || input.length > MAX_VISIBLE_ADVANCES) return null;
  const values: string[] = [];
  for (const value of input) {
    if (typeof value !== "string" || !UUID.test(value)) return null;
    if (!values.includes(value)) values.push(value.toLowerCase());
  }
  return values;
}

export function validateWarGraphFocusId(input: unknown): string | null | false {
  if (input === null || input === undefined || input === "") return null;
  return typeof input === "string" && UUID.test(input)
    ? input.toLowerCase()
    : false;
}

export async function recordWarGraphPresence(
  input: PresenceInput,
): Promise<WarGraphPresenceResult> {
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("WARGRAPH_CLOCK_INVALID");
  const visibleAdvanceIds = validateVisibleWarGraphAdvanceIds(
    input.visibleAdvanceIds,
  );
  const focusEngagementId = validateWarGraphFocusId(input.focusEngagementId);
  if (visibleAdvanceIds === null || focusEngagementId === false) {
    throw new Error("WARGRAPH_PRESENCE_CONTRACT_INVALID");
  }
  const prisma = input.prisma ?? getPrisma();
  const foundation = await ensureWarGraphFoundation({
    prisma,
    now,
    force: true,
  });
  const session = sessionIdentity(input.sessionToken);
  const sessionKeyHash = privateHash("session", session.token);
  const ipHash =
    input.clientAddress && input.clientAddress !== "unknown"
      ? privateHash("ip", input.clientAddress)
      : null;
  const userAgentHash = input.userAgent
    ? privateHash("user-agent", input.userAgent.slice(0, 512))
    : null;
  const expiresAt = new Date(now.getTime() + WARGRAPH_SPECTATOR_TTL_SECONDS * 1_000);

  const result = await prisma.$transaction(
    async (tx) => {
      await lockWarGraphTransaction(tx, foundation.graphId);
      const user = input.uid
        ? await tx.user.findUnique({
            where: { uid: input.uid },
            select: { id: true },
          })
        : null;
      const membership = user
        ? await tx.warGraphMembership.findUnique({
            where: {
              graphId_userId: {
                graphId: foundation.graphId,
                userId: user.id,
              },
            },
            include: {
              occupancy: { include: { node: true } },
            },
          })
        : null;
      const focusPairing = focusEngagementId
        ? await tx.warGraphPairing.findFirst({
            where: {
              publicId: focusEngagementId,
              graphId: foundation.graphId,
            },
            select: { contest: { select: { id: true } } },
          })
        : null;

      await tx.warGraphSpectatorSession.upsert({
        where: { sessionKeyHash },
        update: {
          userId: user?.id ?? null,
          focusContestId: focusPairing?.contest?.id ?? null,
          ipHash,
          userAgentHash,
          lastSeenAt: now,
          expiresAt,
          closedAt: null,
          version: { increment: 1 },
        },
        create: {
          graphId: foundation.graphId,
          userId: user?.id ?? null,
          focusContestId: focusPairing?.contest?.id ?? null,
          sessionKeyHash,
          ipHash,
          userAgentHash,
          openedAt: now,
          lastSeenAt: now,
          expiresAt,
        },
      });

      if (membership) {
        await tx.warGraphPresence.upsert({
          where: { membershipId: membership.id },
          update: {
            realmSeenAt: now,
            graphSeenAt: now,
            version: { increment: 1 },
          },
          create: {
            graphId: foundation.graphId,
            membershipId: membership.id,
            realmSeenAt: now,
            graphSeenAt: now,
          },
        });
      }

      const acknowledgedAdvanceIds: string[] = [];
      let obligationCreated = false;
      if (
        membership?.status === "active" &&
        membership.occupancy &&
        visibleAdvanceIds.length > 0
      ) {
        const [existingDuty, activeEngagement, outgoingAdvance, actionCount, ruleset] =
          await Promise.all([
            tx.warGraphDefenseObligation.findFirst({
              where: {
                graphId: foundation.graphId,
                defenderMembershipId: membership.id,
                status: "pending",
              },
              select: { id: true },
            }),
            tx.warGraphEngagement.findFirst({
              where: {
                graphId: foundation.graphId,
                membershipId: membership.id,
                status: "active",
                releasedAt: null,
              },
              select: { id: true },
            }),
            tx.warGraphAdvanceRequest.findFirst({
              where: {
                graphId: foundation.graphId,
                challengerMembershipId: membership.id,
                status: { in: ["open", "accepted", "bound"] },
              },
              select: { id: true },
            }),
            tx.warGraphAction.count({
              where: {
                graphId: foundation.graphId,
                nightId: foundation.nightId,
                membershipId: membership.id,
              },
            }),
            tx.warGraphRuleset.findUniqueOrThrow({
              where: { id: foundation.rulesetId },
              select: { maxResolvedActions: true },
            }),
          ]);
        const visibleAdvances = await tx.warGraphAdvanceRequest.findMany({
          where: {
            graphId: foundation.graphId,
            publicId: { in: visibleAdvanceIds },
            targetLayerId: membership.occupancy.node.layerId,
            challengerMembershipId: { not: membership.id },
            status: "open",
            responseDeadlineAt: { gt: now },
          },
          orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            publicId: true,
            requestedAt: true,
            responseDeadlineAt: true,
          },
        });
        acknowledgedAdvanceIds.push(...visibleAdvances.map((item) => item.publicId));

        const lead =
          !existingDuty &&
          !activeEngagement &&
          !outgoingAdvance &&
          actionCount < ruleset.maxResolvedActions
            ? visibleAdvances[0]
            : null;
        if (lead) {
          const viewEvidenceHash = createHash("sha256")
            .update(
              [
                "aoe2war-wargraph-challenge-view/v1",
                sessionKeyHash,
                membership.publicId,
                lead.publicId,
                lead.requestedAt.toISOString(),
                lead.responseDeadlineAt.toISOString(),
              ].join("\n"),
            )
            .digest("hex");
          const idempotencyKey = `view:${lead.publicId}:${membership.publicId}`;
          const obligation = await tx.warGraphDefenseObligation.upsert({
            where: { advanceRequestId: lead.id },
            update: {},
            create: {
              graphId: foundation.graphId,
              advanceRequestId: lead.id,
              defenderMembershipId: membership.id,
              idempotencyKey,
              viewEvidenceHash,
              viewedAt: now,
              deadlineAt: lead.responseDeadlineAt,
              status: "pending",
            },
          });
          if (obligation.defenderMembershipId === membership.id) {
            obligationCreated = true;
            await appendWarGraphEvent(tx, {
              graphId: foundation.graphId,
              nightId: foundation.nightId,
              membershipId: membership.id,
              advanceRequestId: lead.id,
              actorUserId: user?.id ?? null,
              aggregateType: "advance",
              aggregateId: lead.publicId,
              eventType: "WARGRAPH_LEAD_DEFENDER_VIEW_CONFIRMED",
              idempotencyKey: `event:${idempotencyKey}`,
              payload: {
                defenderMembershipId: membership.publicId,
                viewEvidenceHash,
                responseDeadlineAt: lead.responseDeadlineAt.toISOString(),
              },
              occurredAt: now,
            });
          }
        }
      }

      const graph = obligationCreated
        ? await tx.warGraph.update({
            where: { id: foundation.graphId },
            data: { projectionVersion: { increment: 1 } },
            select: { projectionVersion: true },
          })
        : await tx.warGraph.findUniqueOrThrow({
            where: { id: foundation.graphId },
            select: { projectionVersion: true },
          });
      return { acknowledgedAdvanceIds, projectionVersion: graph.projectionVersion };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5_000,
      timeout: 12_000,
    },
  );

  const spectatorCount = await prisma.warGraphSpectatorSession.count({
    where: {
      graphId: foundation.graphId,
      closedAt: null,
      expiresAt: { gt: now },
    },
  });
  return {
    sessionToken: session.token,
    sessionCreated: session.created,
    spectatorCount,
    projectionVersion: result.projectionVersion,
    acknowledgedAdvanceIds: result.acknowledgedAdvanceIds,
  };
}

export const warGraphPresenceInternals = {
  privateHash,
  sessionIdentity,
};
