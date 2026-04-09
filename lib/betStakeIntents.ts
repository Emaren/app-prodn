import type { PrismaClient } from "@/lib/generated/prisma";

import { toUwoLoAmount } from "@/lib/woloChain";
import { isWoloBetEscrowEnabled, listRecentEscrowDeposits } from "@/lib/woloBetSettlement";

export const BET_STAKE_INTENT_ORPHAN_AFTER_MS = 15 * 60 * 1000;
export const BET_STAKE_INTENT_DISCOVERY_WINDOW_MS = 60 * 60 * 1000;
export const BET_STAKE_INTENT_COUNTABLE_STATUSES = ["recorded"] as const;
export const BET_STAKE_INTENT_RECOVERABLE_STATUSES = [
  "awaiting_signature",
  "broadcast_submitted",
  "verified_unrecorded",
  "failed",
  "suspect",
  "orphaned",
] as const;
export const BET_STAKE_INTENT_VISIBLE_UNRESOLVED_STATUSES = [
  "broadcast_submitted",
  "verified_unrecorded",
  "failed",
  "suspect",
  "orphaned",
] as const;

export type BetStakeIntentStatus =
  | "awaiting_signature"
  | "broadcast_submitted"
  | "verified_unrecorded"
  | "recorded"
  | "failed"
  | "suspect"
  | "orphaned";

type BetStakeIntentDb = Pick<PrismaClient, "betStakeIntent">;

function normalizeString(value: string | null | undefined, maxLength: number) {
  const normalized = (value || "").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function normalizeBetStakeIntentStatus(
  value: string | null | undefined
): BetStakeIntentStatus {
  switch (value) {
    case "broadcast_submitted":
    case "verified_unrecorded":
    case "recorded":
    case "failed":
    case "suspect":
    case "orphaned":
      return value;
    default:
      return "awaiting_signature";
  }
}

export function isBetStakeIntentCountableStatus(value: string | null | undefined) {
  return value === "recorded";
}

export async function createBetStakeIntent(
  prisma: BetStakeIntentDb,
  input: {
    marketId: number;
    userId: number;
    side: string;
    amountWolo: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
    browserInfo?: string | null;
    routePath?: string | null;
  }
) {
  return prisma.betStakeIntent.create({
    data: {
      marketId: input.marketId,
      userId: input.userId,
      side: input.side,
      amountWolo: input.amountWolo,
      walletAddress: normalizeString(input.walletAddress, 100),
      walletProvider: normalizeString(input.walletProvider, 32),
      walletType: normalizeString(input.walletType, 32),
      browserInfo: normalizeString(input.browserInfo, 255),
      routePath: normalizeString(input.routePath, 160),
      status: "awaiting_signature",
    },
  });
}

export async function updateBetStakeIntentBroadcast(
  prisma: BetStakeIntentDb,
  input: {
    intentId: number;
    walletAddress?: string | null;
    walletProvider?: string | null;
    walletType?: string | null;
    browserInfo?: string | null;
    routePath?: string | null;
    stakeTxHash: string;
  }
) {
  return prisma.betStakeIntent.update({
    where: { id: input.intentId },
    data: {
      walletAddress: normalizeString(input.walletAddress, 100),
      walletProvider: normalizeString(input.walletProvider, 32),
      walletType: normalizeString(input.walletType, 32),
      browserInfo: normalizeString(input.browserInfo, 255),
      routePath: normalizeString(input.routePath, 160),
      stakeTxHash: normalizeString(input.stakeTxHash, 128),
      status: "broadcast_submitted",
      errorDetail: null,
      orphanedAt: null,
    },
  });
}

export async function markBetStakeIntentVerified(
  prisma: BetStakeIntentDb,
  input: {
    intentId: number;
  }
) {
  return prisma.betStakeIntent.update({
    where: { id: input.intentId },
    data: {
      status: "verified_unrecorded",
      verifiedAt: new Date(),
      errorDetail: null,
      orphanedAt: null,
    },
  });
}

export async function markBetStakeIntentRecorded(
  prisma: BetStakeIntentDb,
  input: {
    intentId: number;
  }
) {
  return prisma.betStakeIntent.update({
    where: { id: input.intentId },
    data: {
      status: "recorded",
      recordedAt: new Date(),
      verifiedAt: new Date(),
      errorDetail: null,
      orphanedAt: null,
    },
  });
}

export async function markBetStakeIntentFailure(
  prisma: BetStakeIntentDb,
  input: {
    intentId: number;
    status?: BetStakeIntentStatus;
    errorDetail?: string | null;
  }
) {
  const status =
    input.status && input.status !== "recorded" ? input.status : "failed";
  return prisma.betStakeIntent.update({
    where: { id: input.intentId },
    data: {
      status,
      errorDetail: normalizeString(input.errorDetail, 255),
      orphanedAt: status === "orphaned" ? new Date() : null,
    },
  });
}

export async function markOrphanedBetStakeIntents(
  prisma: BetStakeIntentDb,
  userId?: number | null
) {
  const cutoff = new Date(Date.now() - BET_STAKE_INTENT_ORPHAN_AFTER_MS);
  await prisma.betStakeIntent.updateMany({
    where: {
      status: { in: ["broadcast_submitted", "verified_unrecorded"] },
      updatedAt: { lt: cutoff },
      ...(typeof userId === "number" ? { userId } : {}),
    },
    data: {
      status: "orphaned",
      orphanedAt: new Date(),
    },
  });
}

function matchesIntentMemo(memo: string | null | undefined, marketId: number) {
  const normalized = (memo || "").trim().toLowerCase();
  if (!normalized) return false;
  return normalized.includes(`market ${marketId}`);
}

function isDepositAfterIntent(
  depositTimestamp: string | null | undefined,
  createdAt: Date
) {
  if (!depositTimestamp) return true;
  const parsed = Date.parse(depositTimestamp);
  if (Number.isNaN(parsed)) return true;
  return parsed >= createdAt.getTime() - 2 * 60 * 1000;
}

async function discoverEscrowDepositForStakeIntent(
  prisma: BetStakeIntentDb,
  intent: {
    id: number;
    marketId: number;
    amountWolo: number;
    walletAddress: string | null;
    walletProvider: string | null;
    walletType: string | null;
    browserInfo: string | null;
    routePath: string | null;
    status: string;
    stakeTxHash: string | null;
    errorDetail: string | null;
    createdAt: Date;
  },
  recentDeposits: Awaited<ReturnType<typeof listRecentEscrowDeposits>>
) {
  if (!isWoloBetEscrowEnabled()) {
    return;
  }

  const walletAddress = (intent.walletAddress || "").trim();
  if (!walletAddress || intent.stakeTxHash) {
    return;
  }

  if (!recentDeposits) {
    return;
  }

  const exactMatches = recentDeposits.filter((deposit) => {
    if (!deposit.txSuccess || !deposit.txHash) return false;
    if ((deposit.sender || "").trim() !== walletAddress) return false;
    if ((deposit.amountUWolo || "").trim() !== toUwoLoAmount(intent.amountWolo)) return false;
    if (!matchesIntentMemo(deposit.memo, intent.marketId)) return false;
    return isDepositAfterIntent(deposit.timestamp, intent.createdAt);
  });

  if (exactMatches.length === 1) {
    const match = exactMatches[0];
    await updateBetStakeIntentBroadcast(prisma, {
      intentId: intent.id,
      walletAddress,
      walletProvider: intent.walletProvider,
      walletType: intent.walletType,
      browserInfo: intent.browserInfo,
      routePath: intent.routePath,
      stakeTxHash: match.txHash,
    });
    return;
  }

  if (exactMatches.length > 1 && intent.status !== "suspect") {
    await markBetStakeIntentFailure(prisma, {
      intentId: intent.id,
      status: "suspect",
      errorDetail:
        "Multiple recent escrow deposits matched this stake intent. Pools and settlement exclude it until an operator resolves the ambiguity.",
    });
  }
}

export async function refreshRecoverableBetStakeIntents(
  prisma: PrismaClient,
  userId?: number | null
) {
  const discoveryCutoff = new Date(Date.now() - BET_STAKE_INTENT_DISCOVERY_WINDOW_MS);
  const intents = await prisma.betStakeIntent.findMany({
    where: {
      createdAt: { gte: discoveryCutoff },
      status: {
        in: [...BET_STAKE_INTENT_RECOVERABLE_STATUSES],
      },
      ...(typeof userId === "number" ? { userId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: typeof userId === "number" ? 12 : 40,
    select: {
      id: true,
      marketId: true,
      amountWolo: true,
      walletAddress: true,
      walletProvider: true,
      walletType: true,
      browserInfo: true,
      routePath: true,
      status: true,
      stakeTxHash: true,
      errorDetail: true,
      createdAt: true,
    },
  });

  const depositCache = new Map<string, Awaited<ReturnType<typeof listRecentEscrowDeposits>>>();

  for (const intent of intents) {
    const walletAddress = (intent.walletAddress || "").trim();
    if (!walletAddress) {
      continue;
    }

    if (!depositCache.has(walletAddress)) {
      depositCache.set(
        walletAddress,
        await listRecentEscrowDeposits({
          sender: walletAddress,
          limit: 20,
        })
      );
    }

    await discoverEscrowDepositForStakeIntent(
      prisma,
      intent,
      depositCache.get(walletAddress) ?? null
    );
  }

  await markOrphanedBetStakeIntents(prisma, userId);
}

export async function loadViewerBetStakeIntents(
  prisma: PrismaClient,
  userId: number
) {
  await refreshRecoverableBetStakeIntents(prisma, userId);

  return prisma.betStakeIntent.findMany({
    where: {
      userId,
      status: {
        in: [...BET_STAKE_INTENT_VISIBLE_UNRESOLVED_STATUSES],
      },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 8,
    include: {
      market: {
        select: {
          id: true,
          title: true,
          eventLabel: true,
          leftLabel: true,
          rightLabel: true,
        },
      },
    },
  });
}
