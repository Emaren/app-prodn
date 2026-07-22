import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  TERMINAL_TITLE_CHALLENGE_STATUSES,
  TITLE_FORFEIT_REVIEW_SETTLEMENT_STATUS,
  TITLE_FORFEIT_REVIEW_STATUS,
  unacceptedTitleExpiryNeedsCommissionerReview,
} from "@/lib/challengeTitlePolicy";
import { postChallengeCommissionerNotice, postChallengeInboxNotice } from "@/lib/contactInbox";
import { executeScheduledMatchSettlement } from "@/lib/scheduledMatchSettlements";

const ADVISORY_LOCK_NAMESPACE = 752007;
const SETTLEMENT_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
const SETTLEMENT_RETRY_MAX_ATTEMPTS = 8;
const SETTLEMENT_RETRY_TAKE = 20;
const TERMINAL_STATUSES = new Set([
  "completed",
  "forfeited",
  "declined",
  "cancelled",
  "canceled",
  "expired",
  "funding_expired",
  "no_show_left",
  "no_show_right",
  "double_no_show",
  "refunded",
]);

function normalizeStatus(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function playerName(user: { uid: string; inGameName: string | null; steamPersonaName: string | null }) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function hasFunding(row: {
  challengerFundedAt: Date | null;
  challengedFundedAt: Date | null;
}) {
  return Boolean(row.challengerFundedAt || row.challengedFundedAt);
}

function bothFunded(row: {
  challengerFundedAt: Date | null;
  challengedFundedAt: Date | null;
}) {
  return Boolean(row.challengerFundedAt && row.challengedFundedAt);
}

type ExpiryKind = "expired" | "funding_expired";

function dueExpiryKind(
  row: {
    status: string;
    acceptBy: Date | null;
    acceptedAt: Date | null;
    fundBy: Date | null;
    playBy: Date | null;
    challengerFundedAt: Date | null;
    challengedFundedAt: Date | null;
  },
  now: Date
): ExpiryKind | null {
  const status = normalizeStatus(row.status);
  if (TERMINAL_STATUSES.has(status)) return null;

  if (!row.acceptedAt && row.acceptBy && row.acceptBy.getTime() <= now.getTime()) {
    return "expired";
  }

  if (
    row.acceptedAt &&
    !bothFunded(row) &&
    row.fundBy &&
    row.fundBy.getTime() <= now.getTime()
  ) {
    return "funding_expired";
  }

  if (
    bothFunded(row) &&
    row.playBy &&
    row.playBy.getTime() <= now.getTime() &&
    !["live_confirmed", "completed"].includes(status)
  ) {
    return "expired";
  }

  return null;
}

export type ChallengeReconciliationResult = {
  checkedAt: string;
  examined: number;
  expired: number[];
  fundingExpired: number[];
  settlementExecuted: number[];
  settlementFailed: Array<{ challengeId: number; detail: string }>;
};

const RECONCILE_SELECT = {
  id: true,
  status: true,
  acceptBy: true,
  acceptedAt: true,
  fundBy: true,
  playBy: true,
  challengerFundedAt: true,
  challengedFundedAt: true,
  challengerUserId: true,
  challengedUserId: true,
  challenger: {
    select: { uid: true, inGameName: true, steamPersonaName: true },
  },
  challenged: {
    select: { uid: true, inGameName: true, steamPersonaName: true },
  },
} as const;

async function expireChallengeIfDue(
  prisma: PrismaClient,
  challengeId: number,
  now: Date
): Promise<{ kind: ExpiryKind; funded: boolean } | null> {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_NAMESPACE}, ${challengeId})`;
    const row = await tx.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: RECONCILE_SELECT,
    });
    if (!row) return null;

    const kind = dueExpiryKind(row, now);
    if (!kind) {
      await tx.scheduledMatch.update({
        where: { id: challengeId },
        data: { reconciledAt: now },
      });
      return null;
    }

    const funded = hasFunding(row);
    const linkedTitleChallenges = await tx.trophyChallenge.findMany({
      where: {
        scheduledMatchId: challengeId,
        status: { notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES] },
      },
      select: {
        id: true,
        trophyId: true,
        challengerUserId: true,
        defenderUserId: true,
        guardianUserId: true,
      },
    });
    const titleForfeitNeedsReview = unacceptedTitleExpiryNeedsCommissionerReview({
      expiryKind: kind,
      acceptedAt: row.acceptedAt,
      linkedTitleCount: linkedTitleChallenges.length,
    });
    const detail =
      kind === "funding_expired"
        ? "Challenge funding window expired. Any locked WOLO is queued for deterministic refund."
        : titleForfeitNeedsReview
          ? "Title challenge expired without acceptance. The title forfeit is pending commissioner review; any locked WOLO is handled independently on the refund rail."
        : row.acceptedAt
          ? "Challenge play window expired. Any locked WOLO is queued for deterministic refund."
          : "Challenge expired without acceptance. Any creator funding is queued for deterministic refund.";

    await tx.scheduledMatch.update({
      where: { id: challengeId },
      data: {
        status: kind,
        expiredAt: now,
        resultAt: now,
        settlementReadyAt: funded ? now : null,
        reconciledAt: now,
      },
    });

    if (linkedTitleChallenges.length > 0) {
      await tx.trophyChallenge.updateMany({
        where: {
          id: { in: linkedTitleChallenges.map((challenge) => challenge.id) },
          status: { notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES] },
        },
        data: titleForfeitNeedsReview
          ? {
              status: TITLE_FORFEIT_REVIEW_STATUS,
              settlementStatus: TITLE_FORFEIT_REVIEW_SETTLEMENT_STATUS,
              errorState:
                "The seven-day title response deadline passed without acceptance. Commissioner disposition is required; custody has not changed.",
            }
          : {
              status: "cancelled",
              settlementStatus: "cancelled",
            },
      });

      if (titleForfeitNeedsReview) {
        for (const titleChallenge of linkedTitleChallenges) {
          await tx.trophyEvent.create({
            data: {
              trophyId: titleChallenge.trophyId,
              eventType: "TITLE_FORFEIT_REVIEW_REQUIRED",
              actorRole: "system",
              initiatedBy: "system",
              fromHolderUserId:
                titleChallenge.defenderUserId ?? titleChallenge.guardianUserId,
              toHolderUserId: titleChallenge.challengerUserId,
              challengeId: titleChallenge.id,
              status: "attention_required",
              rawResponse: {
                scheduledMatchId: challengeId,
                acceptBy: row.acceptBy?.toISOString() ?? null,
                commissionerReviewRequired: true,
                custodyChanged: false,
              },
            },
          });
        }
      }
    }

    await tx.scheduledMatchActivity.create({
      data: {
        scheduledMatchId: challengeId,
        eventType: kind,
        detail,
        metadata: {
          automatic: true,
          funded,
          titleForfeitPendingCommissioner: titleForfeitNeedsReview,
          acceptBy: row.acceptBy?.toISOString() ?? null,
          fundBy: row.fundBy?.toISOString() ?? null,
          playBy: row.playBy?.toISOString() ?? null,
        } as Prisma.InputJsonValue,
        createdAt: now,
      },
    });

    const body = [
      kind === "funding_expired" ? "Challenge funding expired" : "Challenge expired",
      `${playerName(row.challenger)} vs ${playerName(row.challenged)}`,
      titleForfeitNeedsReview
        ? "Title: forfeit pending commissioner review; custody has not changed"
        : null,
      funded ? "Refund: queued on the deterministic Bet Escrow settlement rail" : "No WOLO remains locked for settlement",
    ].filter((line): line is string => Boolean(line)).join("\n");

    await postChallengeInboxNotice(tx, {
      senderUserId: row.challengedUserId,
      targetUserId: row.challengerUserId,
      challengeId,
      body,
      now,
    });
    await postChallengeInboxNotice(tx, {
      senderUserId: row.challengerUserId,
      targetUserId: row.challengedUserId,
      challengeId,
      body,
      now,
    });

    return { kind, funded };
  });
  if (result) {
    await postChallengeCommissionerNotice(prisma, challengeId).catch((error) => {
      console.error(`Failed to notify commissioner for challenge #${challengeId}:`, error);
    });
  }
  return result;
}

export async function reconcileChallengeLifecycle(
  prisma: PrismaClient,
  options?: {
    now?: Date;
    take?: number;
    executeRefunds?: boolean;
    actorUserId?: number | null;
  }
): Promise<ChallengeReconciliationResult> {
  const now = options?.now ?? new Date();
  const take = Math.max(1, Math.min(options?.take ?? 100, 500));

  const candidates = await prisma.scheduledMatch.findMany({
    where: {
      creationRequestId: { not: null },
      status: { notIn: Array.from(TERMINAL_STATUSES) },
      OR: [
        { acceptBy: { lte: now } },
        { fundBy: { lte: now } },
        { playBy: { lte: now } },
      ],
    },
    orderBy: [{ reconciledAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
    take,
    select: { id: true },
  });

  const result: ChallengeReconciliationResult = {
    checkedAt: now.toISOString(),
    examined: candidates.length,
    expired: [],
    fundingExpired: [],
    settlementExecuted: [],
    settlementFailed: [],
  };
  const fundedTerminalIds: number[] = [];

  for (const candidate of candidates) {
    const expired = await expireChallengeIfDue(prisma, candidate.id, now);
    if (!expired) continue;
    if (expired.kind === "funding_expired") result.fundingExpired.push(candidate.id);
    else result.expired.push(candidate.id);
    if (expired.funded) fundedTerminalIds.push(candidate.id);
  }

  if (options?.executeRefunds) {
    // Newly-expired V2 challenges are safe to attempt immediately. Failed V2
    // expiry settlements may be retried later, ordered by the oldest real
    // attempt time. We deliberately do not sweep arbitrary legacy cancelled
    // rows here; those remain operator-reviewed to avoid accidental double-pay.
    const retryCutoff = new Date(now.getTime() - SETTLEMENT_RETRY_COOLDOWN_MS);
    const retryRows = await prisma.scheduledMatchSettlement.findMany({
      where: {
        status: "failed",
        attemptCount: { lt: SETTLEMENT_RETRY_MAX_ATTEMPTS },
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: retryCutoff } }],
        scheduledMatch: {
          creationRequestId: { not: null },
          status: { in: ["expired", "funding_expired"] },
        },
      },
      orderBy: [{ lastAttemptAt: "asc" }, { updatedAt: "asc" }, { id: "asc" }],
      distinct: ["scheduledMatchId"],
      take: SETTLEMENT_RETRY_TAKE,
      select: { scheduledMatchId: true },
    });

    const settlementIds = Array.from(
      new Set([...fundedTerminalIds, ...retryRows.map((row) => row.scheduledMatchId)])
    );

    for (const challengeId of settlementIds) {
      try {
        const execution = await executeScheduledMatchSettlement(
          prisma,
          challengeId,
          options.actorUserId ?? null
        );
        if (execution.ok || execution.plan.state === "executed") {
          result.settlementExecuted.push(challengeId);
        } else {
          result.settlementFailed.push({
            challengeId,
            detail: execution.execution.detail || "Settlement execution did not complete.",
          });
        }
      } catch (error) {
        result.settlementFailed.push({
          challengeId,
          detail: error instanceof Error ? error.message : "Settlement execution failed.",
        });
      }
    }
  }

  return result;
}
