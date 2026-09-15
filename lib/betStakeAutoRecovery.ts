import type { PrismaClient } from "@/lib/generated/prisma";

import {
  BET_STAKE_INTENT_DISCOVERY_WINDOW_MS,
  markBetStakeIntentFailure,
  markBetStakeIntentRecorded,
  refreshRecoverableBetStakeIntents,
} from "@/lib/betStakeIntents";
import {
  BET_STAKE_TICKET_RECOVERABLE_STATUSES,
  commitBetStakeTicket,
  refreshRecoverableBetStakeTickets,
} from "@/lib/betStakeTickets";
import {
  BetWagerError,
  placePooledBetWager,
  type WagerViewer,
} from "@/lib/betWagering";

const AUTO_COMMIT_STATUSES = [
  "broadcast_submitted",
  "verified_unrecorded",
  "orphaned",
] as const;
const DEFAULT_TAKE = 20;
const MAX_TAKE = 50;

type AutoCommitStatus = (typeof AUTO_COMMIT_STATUSES)[number];

type RecoveryIssue = {
  kind: "intent" | "ticket" | "intent_discovery" | "ticket_discovery";
  id: number | null;
  userId: number | null;
  detail: string;
};

export type BetStakeAutoRecoveryResult = {
  checkedAt: string;
  take: number;
  intentCandidates: number;
  intentCommitted: number[];
  intentAlreadyRecorded: number[];
  ticketCandidates: number;
  ticketCommitted: number[];
  reviewRequired: RecoveryIssue[];
  transientErrors: RecoveryIssue[];
};

type IntentCommitResult = { kind: "created" | "duplicate_existing" };

type RecoveryDependencies = {
  now: () => Date;
  refreshIntents: typeof refreshRecoverableBetStakeIntents;
  refreshTickets: typeof refreshRecoverableBetStakeTickets;
  commitIntent: (
    prisma: PrismaClient,
    input: {
      viewer: WagerViewer;
      marketId: number;
      side: "left" | "right";
      amountWolo: number;
      walletAddress: string | null;
      stakeTxHash: string;
      stakeIntentId: number;
    }
  ) => Promise<IntentCommitResult>;
  commitTicket: typeof commitBetStakeTicket;
};

const DEFAULT_DEPENDENCIES: RecoveryDependencies = {
  now: () => new Date(),
  refreshIntents: refreshRecoverableBetStakeIntents,
  refreshTickets: refreshRecoverableBetStakeTickets,
  commitIntent: placePooledBetWager,
  commitTicket: commitBetStakeTicket,
};

function clampTake(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_TAKE;
  return Math.max(1, Math.min(Math.trunc(value as number), MAX_TAKE));
}

function issueDetail(error: unknown) {
  return error instanceof Error ? error.message : "Unknown bet stake recovery error.";
}

function isReviewError(error: unknown) {
  return error instanceof BetWagerError && error.status === 409;
}

export function isAutomaticBetStakeRecoveryStatus(
  value: string | null | undefined
): value is AutoCommitStatus {
  return AUTO_COMMIT_STATUSES.includes(value as AutoCommitStatus);
}

export type BetStakeAutoRecoveryPlan = {
  checkedAt: string;
  take: number;
  intentCandidates: Array<{
    id: number;
    userId: number;
    marketId: number;
    status: string;
  }>;
  ticketCandidates: Array<{
    id: number;
    userId: number;
    status: string;
  }>;
};

export async function inspectSignedButUnrecordedBetStakes(
  prisma: PrismaClient,
  options?: { take?: number; now?: Date }
): Promise<BetStakeAutoRecoveryPlan> {
  const now = options?.now ?? new Date();
  const take = clampTake(options?.take);
  const discoveryCutoff = new Date(
    now.getTime() - BET_STAKE_INTENT_DISCOVERY_WINDOW_MS
  );
  const [intents, tickets] = await Promise.all([
    prisma.betStakeIntent.findMany({
      where: {
        createdAt: { gte: discoveryCutoff },
        status: { in: [...AUTO_COMMIT_STATUSES] },
        stakeTxHash: { not: null },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        marketId: true,
        status: true,
      },
    }),
    prisma.betStakeTicket.findMany({
      where: {
        createdAt: { gte: discoveryCutoff },
        status: { in: [...AUTO_COMMIT_STATUSES] },
        stakeTxHash: { not: null },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        status: true,
      },
    }),
  ]);

  return {
    checkedAt: now.toISOString(),
    take,
    intentCandidates: intents,
    ticketCandidates: tickets,
  };
}

export async function reconcileSignedButUnrecordedBetStakes(
  prisma: PrismaClient,
  options?: {
    take?: number;
    dependencies?: Partial<RecoveryDependencies>;
  }
): Promise<BetStakeAutoRecoveryResult> {
  const deps: RecoveryDependencies = {
    ...DEFAULT_DEPENDENCIES,
    ...(options?.dependencies ?? {}),
  };
  const now = deps.now();
  const take = clampTake(options?.take);
  const discoveryCutoff = new Date(
    now.getTime() - BET_STAKE_INTENT_DISCOVERY_WINDOW_MS
  );
  const result: BetStakeAutoRecoveryResult = {
    checkedAt: now.toISOString(),
    take,
    intentCandidates: 0,
    intentCommitted: [],
    intentAlreadyRecorded: [],
    ticketCandidates: 0,
    ticketCommitted: [],
    reviewRequired: [],
    transientErrors: [],
  };

  try {
    await deps.refreshIntents(prisma);
  } catch (error) {
    result.transientErrors.push({
      kind: "intent_discovery",
      id: null,
      userId: null,
      detail: issueDetail(error),
    });
  }

  const ticketSeeds = await prisma.betStakeTicket.findMany({
    where: {
      createdAt: { gte: discoveryCutoff },
      status: { in: [...BET_STAKE_TICKET_RECOVERABLE_STATUSES] },
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take,
    select: { userId: true },
  });
  const ticketUserIds = Array.from(
    new Set(ticketSeeds.map((row) => row.userId))
  );
  for (const userId of ticketUserIds) {
    try {
      await deps.refreshTickets(prisma, userId);
    } catch (error) {
      result.transientErrors.push({
        kind: "ticket_discovery",
        id: null,
        userId,
        detail: issueDetail(error),
      });
    }
  }

  const [intents, tickets] = await Promise.all([
    prisma.betStakeIntent.findMany({
      where: {
        createdAt: { gte: discoveryCutoff },
        status: { in: [...AUTO_COMMIT_STATUSES] },
        stakeTxHash: { not: null },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        marketId: true,
        side: true,
        amountWolo: true,
        walletAddress: true,
        stakeTxHash: true,
        wager: { select: { id: true } },
      },
    }),
    prisma.betStakeTicket.findMany({
      where: {
        createdAt: { gte: discoveryCutoff },
        status: { in: [...AUTO_COMMIT_STATUSES] },
        stakeTxHash: { not: null },
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true,
        userId: true,
        walletAddress: true,
        stakeTxHash: true,
      },
    }),
  ]);
  result.intentCandidates = intents.length;
  result.ticketCandidates = tickets.length;

  const viewerCache = new Map<number, WagerViewer | null>();
  const loadViewer = async (userId: number) => {
    if (viewerCache.has(userId)) return viewerCache.get(userId) ?? null;
    const viewer = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
      },
    });
    viewerCache.set(userId, viewer);
    return viewer;
  };

  for (const intent of intents) {
    if (intent.wager) {
      await markBetStakeIntentRecorded(prisma, { intentId: intent.id });
      result.intentAlreadyRecorded.push(intent.id);
      continue;
    }
    const viewer = await loadViewer(intent.userId);
    if (!viewer || !intent.stakeTxHash || (intent.side !== "left" && intent.side !== "right")) {
      const detail = !viewer
        ? "Stake intent owner no longer exists."
        : !intent.stakeTxHash
          ? "Stake intent lost its bound transaction hash before reconciliation."
          : "Stake intent side is not canonical.";
      await markBetStakeIntentFailure(prisma, {
        intentId: intent.id,
        status: "suspect",
        errorDetail: detail,
      });
      result.reviewRequired.push({
        kind: "intent",
        id: intent.id,
        userId: intent.userId,
        detail,
      });
      continue;
    }
    try {
      const committed = await deps.commitIntent(prisma, {
        viewer,
        marketId: intent.marketId,
        side: intent.side,
        amountWolo: intent.amountWolo,
        walletAddress: intent.walletAddress,
        stakeTxHash: intent.stakeTxHash,
        stakeIntentId: intent.id,
      });
      if (committed.kind === "created") {
        result.intentCommitted.push(intent.id);
        continue;
      }
      const exactWager = await prisma.betWager.findUnique({
        where: { stakeIntentId: intent.id },
        select: { id: true },
      });
      if (exactWager) {
        await markBetStakeIntentRecorded(prisma, { intentId: intent.id });
        result.intentAlreadyRecorded.push(intent.id);
      } else {
        const detail =
          "A duplicate stake was found without an exact wager relation to this intent; operator review is required.";
        await markBetStakeIntentFailure(prisma, {
          intentId: intent.id,
          status: "suspect",
          errorDetail: detail,
        });
        result.reviewRequired.push({
          kind: "intent",
          id: intent.id,
          userId: intent.userId,
          detail,
        });
      }
    } catch (error) {
      const issue: RecoveryIssue = {
        kind: "intent",
        id: intent.id,
        userId: intent.userId,
        detail: issueDetail(error),
      };
      if (isReviewError(error)) {
        await markBetStakeIntentFailure(prisma, {
          intentId: intent.id,
          status: "suspect",
          errorDetail: issue.detail,
        });
        result.reviewRequired.push(issue);
      } else {
        result.transientErrors.push(issue);
      }
    }
  }

  for (const ticket of tickets) {
    const viewer = await loadViewer(ticket.userId);
    if (!viewer || !ticket.stakeTxHash) {
      const detail = !viewer
        ? "Stake ticket owner no longer exists."
        : "Stake ticket lost its bound transaction hash before reconciliation.";
      await prisma.betStakeTicket.updateMany({
        where: { id: ticket.id, status: { in: [...AUTO_COMMIT_STATUSES] } },
        data: { status: "suspect", errorDetail: detail.slice(0, 255) },
      });
      result.reviewRequired.push({
        kind: "ticket",
        id: ticket.id,
        userId: ticket.userId,
        detail,
      });
      continue;
    }
    try {
      await deps.commitTicket(prisma, {
        ticketId: ticket.id,
        viewer,
        stakeTxHash: ticket.stakeTxHash,
        walletAddress: ticket.walletAddress,
      });
      result.ticketCommitted.push(ticket.id);
    } catch (error) {
      const issue: RecoveryIssue = {
        kind: "ticket",
        id: ticket.id,
        userId: ticket.userId,
        detail: issueDetail(error),
      };
      if (isReviewError(error)) {
        await prisma.betStakeTicket.updateMany({
          where: { id: ticket.id, status: { in: [...AUTO_COMMIT_STATUSES] } },
          data: { status: "suspect", errorDetail: issue.detail.slice(0, 255) },
        });
        result.reviewRequired.push(issue);
      } else {
        result.transientErrors.push(issue);
      }
    }
  }

  return result;
}
