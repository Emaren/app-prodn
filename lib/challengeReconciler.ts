import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  executeScheduledMatchSettlement,
  loadScheduledMatchSettlementPlans,
} from "@/lib/scheduledMatchSettlements";

const CHALLENGE_RECONCILE_LOCK_NAMESPACE = 752026;
const DUE_STATUSES = [
  "pending",
  "proposed",
  "accepted",
  "terms_accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
] as const;

type ExpiryTarget = "expired" | "funding_expired" | "play_expired";
type ReconciliationRow = {
  id: number;
  status: string;
  funded: boolean;
  settlement: "not_needed" | "pending" | "executed" | "failed";
  detail: string | null;
};

function expiryTarget(
  row: {
    status: string;
    scheduleMode: string;
    acceptedAt: Date | null;
    acceptanceExpiresAt: Date | null;
    fundingExpiresAt: Date | null;
    playExpiresAt: Date | null;
    challengerFundedAt: Date | null;
    challengedFundedAt: Date | null;
  },
  now: Date
): ExpiryTarget | null {
  const bothFunded = Boolean(row.challengerFundedAt && row.challengedFundedAt);
  const accepted = Boolean(row.acceptedAt) || ["accepted", "terms_accepted"].includes(row.status);

  if (
    !accepted &&
    row.acceptanceExpiresAt &&
    row.acceptanceExpiresAt.getTime() <= now.getTime()
  ) {
    return "expired";
  }
  if (
    accepted &&
    !bothFunded &&
    row.fundingExpiresAt &&
    row.fundingExpiresAt.getTime() <= now.getTime()
  ) {
    return "funding_expired";
  }
  if (
    bothFunded &&
    row.scheduleMode === "open" &&
    row.playExpiresAt &&
    row.playExpiresAt.getTime() <= now.getTime()
  ) {
    return "play_expired";
  }
  return null;
}

function expiryDetail(target: ExpiryTarget) {
  if (target === "expired") {
    return "Challenge expired before the opponent accepted.";
  }
  if (target === "funding_expired") {
    return "Challenge closed because the accepted opponent did not finish funding within one hour.";
  }
  return "Challenge closed after the 30-day play-anytime window without verified match proof.";
}

export async function reconcileChallengeExpiries(
  prisma: PrismaClient,
  options?: {
    now?: Date;
    limit?: number;
    autoExecuteRefunds?: boolean;
  }
) {
  const now = options?.now ?? new Date();
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100));
  const candidates = await prisma.scheduledMatch.findMany({
    where: {
      status: { in: [...DUE_STATUSES] },
      OR: [
        {
          acceptedAt: null,
          acceptanceExpiresAt: { lte: now },
        },
        {
          acceptedAt: { not: null },
          fundingExpiresAt: { lte: now },
          OR: [
            { challengerFundedAt: null },
            { challengedFundedAt: null },
          ],
        },
        {
          scheduleMode: "open",
          playExpiresAt: { lte: now },
          challengerFundedAt: { not: null },
          challengedFundedAt: { not: null },
        },
      ],
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: limit,
    select: { id: true },
  });

  const transitions: ReconciliationRow[] = [];

  for (const candidate of candidates) {
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_RECONCILE_LOCK_NAMESPACE}, ${candidate.id})`;
      const row = await tx.scheduledMatch.findUnique({
        where: { id: candidate.id },
        select: {
          id: true,
          status: true,
          scheduleMode: true,
          acceptedAt: true,
          acceptanceExpiresAt: true,
          fundingExpiresAt: true,
          playExpiresAt: true,
          challengerFundedAt: true,
          challengedFundedAt: true,
          lifecycleVersion: true,
        },
      });
      if (!row || !DUE_STATUSES.includes(row.status as (typeof DUE_STATUSES)[number])) {
        return null;
      }
      const target = expiryTarget(row, now);
      if (!target) return null;
      const funded = Boolean(row.challengerFundedAt || row.challengedFundedAt);
      const expiredAt =
        target === "expired"
          ? row.acceptanceExpiresAt
          : target === "funding_expired"
            ? row.fundingExpiresAt
            : row.playExpiresAt;
      if (!expiredAt) return null;
      const timestampField =
        target === "expired"
          ? { expiredAt }
          : target === "funding_expired"
            ? { fundingExpiredAt: expiredAt }
            : { playExpiredAt: expiredAt };

      const updated = await tx.scheduledMatch.updateMany({
        where: {
          id: row.id,
          status: row.status,
          lifecycleVersion: row.lifecycleVersion,
        },
        data: {
          status: target,
          ...timestampField,
          settlementReadyAt: funded ? now : undefined,
          lifecycleVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) return null;

      await tx.scheduledMatchActivity.upsert({
        where: {
          scheduledMatchId_eventKey: {
            scheduledMatchId: row.id,
            eventKey: `lifecycle:${target}`,
          },
        },
        create: {
          scheduledMatchId: row.id,
          eventType: target,
          eventKey: `lifecycle:${target}`,
          detail: expiryDetail(target),
          metadata: {
            reconciledAt: now.toISOString(),
            deadlineAt: expiredAt.toISOString(),
            previousStatus: row.status,
            refundRequired: funded,
          },
          createdAt: expiredAt,
        },
        update: {},
      });
      await tx.trophyChallenge.updateMany({
        where: {
          scheduledMatchId: row.id,
          status: { notIn: ["settled", "cancelled", "canceled"] },
        },
        data: {
          status: "cancelled",
          settlementStatus: `${target}_closed`,
          errorState: null,
        },
      });
      return { id: row.id, status: target, funded };
    });

    if (!claimed) continue;
    const result: ReconciliationRow = {
      ...claimed,
      settlement: claimed.funded ? ("pending" as const) : ("not_needed" as const),
      detail: null as string | null,
    };

    if (claimed.funded && options?.autoExecuteRefunds) {
      try {
        const execution = await executeScheduledMatchSettlement(prisma, claimed.id, null);
        result.settlement = execution.execution.ok ? "executed" : "failed";
        result.detail = execution.execution.detail ?? null;
      } catch (error) {
        result.settlement = "failed";
        result.detail = error instanceof Error ? error.message : "Automatic refund execution failed.";
      }
    }
    transitions.push(result);
  }

  // Only v2 terminal records carry one of these markers. That boundary keeps
  // the worker away from legacy canceled Challenges (which must be audited and
  // repaired deliberately) while making new refund failures safely retryable.
  const v2RefundWhere = {
    status: {
      in: ["canceled", "cancelled", "declined", "expired", "funding_expired", "play_expired"],
    },
    OR: [
      { challengerFundedAt: { not: null } },
      { challengedFundedAt: { not: null } },
    ],
    activities: {
      some: {
        OR: [
          { eventType: "refund_requested" },
          { eventKey: { startsWith: "lifecycle:" } },
        ],
      },
      none: { eventType: "scheduled_settlement_completed" },
    },
  } satisfies Prisma.ScheduledMatchWhereInput;
  const freshRefundRows = options?.autoExecuteRefunds
    ? await prisma.scheduledMatch.findMany({
        where: { ...v2RefundWhere, settlements: { none: {} } },
        orderBy: [{ settlementReadyAt: "asc" }, { id: "asc" }],
        take: limit,
        select: { id: true, status: true },
      })
    : [];
  const retryBefore = new Date(now.getTime() - 10 * 60 * 1000);
  const failedRefundLimit = limit - freshRefundRows.length;
  const failedRefundGroups =
    options?.autoExecuteRefunds && failedRefundLimit > 0
      ? await prisma.scheduledMatchSettlement.groupBy({
          by: ["scheduledMatchId"],
          where: {
            status: { in: ["failed", "planned", "executing", "retrying"] },
            scheduledMatch: { is: v2RefundWhere },
          },
          _max: { updatedAt: true },
          orderBy: [{ _max: { updatedAt: "asc" } }, { scheduledMatchId: "asc" }],
          take: failedRefundLimit,
        })
      : [];
  const retryableFailedIds = failedRefundGroups
    .filter((row) => row._max.updatedAt && row._max.updatedAt <= retryBefore)
    .map((row) => row.scheduledMatchId);
  const failedRefundMatches = retryableFailedIds.length
    ? await prisma.scheduledMatch.findMany({
        where: { id: { in: retryableFailedIds } },
        select: { id: true, status: true },
      })
    : [];
  const failedRefundById = new Map(failedRefundMatches.map((row) => [row.id, row]));
  const failedRefundRows = retryableFailedIds
    .map((id) => failedRefundById.get(id))
    .filter((row): row is { id: number; status: string } => Boolean(row));
  const retryRows = [...freshRefundRows, ...failedRefundRows];

  const transitionedCount = transitions.length;
  const transitionedById = new Map(transitions.map((row) => [row.id, row]));
  const plans = retryRows.length
    ? await loadScheduledMatchSettlementPlans(prisma, {
        ids: retryRows.map((row) => row.id),
        take: limit,
      })
    : null;
  let refundAttempted = 0;

  for (const plan of plans?.rows ?? []) {
    if (plan.state !== "ready" && plan.state !== "failed") continue;
    refundAttempted += 1;
    const existing = transitionedById.get(plan.id);
    const result =
      existing ??
      ({
        id: plan.id,
        status: plan.status,
        funded: true,
        settlement: "pending" as const,
        detail: null,
      } satisfies ReconciliationRow);

    try {
      const execution = await executeScheduledMatchSettlement(prisma, plan.id, null);
      result.settlement = execution.execution.ok ? "executed" : "failed";
      result.detail = execution.execution.detail ?? null;
    } catch (error) {
      result.settlement = "failed";
      result.detail = error instanceof Error ? error.message : "Automatic refund execution failed.";
    }

    if (!existing) {
      transitions.push(result);
      transitionedById.set(plan.id, result);
    }
  }

  return {
    ok: true,
    checkedAt: now.toISOString(),
    scanned: candidates.length,
    transitioned: transitionedCount,
    autoExecuteRefunds: Boolean(options?.autoExecuteRefunds),
    refundCandidates: retryRows.length,
    refundAttempted,
    refundExecuted: transitions.filter((row) => row.settlement === "executed").length,
    refundFailed: transitions.filter((row) => row.settlement === "failed").length,
    rows: transitions,
  };
}

export const challengeReconcilerTestUtils = {
  expiryTarget,
};
