import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
  STAKER_SHARE_BPS,
} from "@/lib/bettingFees";
import { buildStakingTreasuryPayoutRequestId } from "@/lib/stakingTreasuryPayouts";
import {
  executeWoloSettlementRun,
  hasWoloPayoutExecutionConfigured,
  validateWoloAddress,
  validateWoloSettlementRun,
  type SettlementRunResult,
} from "@/lib/woloBetSettlement";
import {
  loadWoloMainnetActivityRows,
  type WoloMainnetActivityRow,
} from "@/lib/woloTransactionRecovery";
import {
  loadIndexedWoloTransferActivityRows,
  type WoloIndexedTransferActivityRow,
} from "@/lib/woloMainnetTransfers";

export {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
  STAKER_SHARE_BPS,
} from "@/lib/bettingFees";

export type StakingPeriodKey = "24h" | "7d" | "30d" | "all";
export type StakingBoardKey = "stakers" | "earners" | "rewards";
export type StakingActionType = "STAKE" | "UNSTAKE" | "CLAIM" | "ADJUSTMENT";

export type StakingActivityItem = {
  key?: string;
  label: string;
  detail: string;
  meta: string;
  eventType?: string;
  amountLabel?: string;
  txFeeLabel?: string;
  timestampLabel?: string;
  tone: "amber" | "emerald" | "sky" | "slate";
};

export type StakingSummary = {
  period: StakingPeriodKey;
  generatedAt: string;
  dataLive: boolean;
  betsPlaced: number;
  betVolumeWolo: number;
  payoutWolo: number;
  settledVolumeWolo: number;
  stakerFeePoolWolo: number;
  treasuryShareWolo: number;
  activeBettors: number;
  activePlayers: number;
  activeStakers: number;
  totalStakedWolo: number;
  totalStakingWeight: string;
  directTransferCount: number;
  activity: StakingActivityItem[];
};

export type StakingRewardPayoutRun = {
  distributionId: number;
  distributionDate: string;
  payoutExecutionConfigured: boolean;
  settlementRunId: string | null;
  requestedPayouts: number;
  executedPayouts: number;
  skippedPayouts: number;
  status: "confirmed" | "partial" | "skipped" | "not_configured" | "failed";
  detail: string;
  validation: SettlementRunResult | null;
  execution: SettlementRunResult | null;
};

export type StakingLeaderboardRow = {
  player: string;
  badge: string;
  stakedWolo: number;
  rewardsWolo: number;
  stakingWeight: string;
  status: string;
  tone: "gold" | "emerald" | "sky" | "slate";
};

export type StakingLeaderboard = {
  board: StakingBoardKey;
  rows: StakingLeaderboardRow[];
  topStakers: StakingLeaderboardRow[];
  topEarners: StakingLeaderboardRow[];
  topWeight: StakingLeaderboardRow[];
  recentRewards: StakingLeaderboardRow[];
};

export class StakingActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "StakingActionError";
    this.status = status;
  }
}

type PositionForWeight = {
  id?: number;
  currentStakedWolo: number;
  accumulatedWeight: bigint;
  lastWeightUpdateAt: Date;
};

type DisplayUser = {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
};

export const STAKING_PERIODS: Array<{
  key: StakingPeriodKey;
  label: string;
  days: number | null;
}> = [
  { key: "24h", label: "24H", days: 1 },
  { key: "7d", label: "7D", days: 7 },
  { key: "30d", label: "30D", days: 30 },
  { key: "all", label: "All-Time", days: null },
];

export function getStakingPeriodStart(period: StakingPeriodKey, now = new Date()) {
  const config = STAKING_PERIODS.find((item) => item.key === period);
  if (!config?.days) return null;
  return new Date(now.getTime() - config.days * 24 * 60 * 60 * 1000);
}

export function normalizeStakingPeriod(value: string | null | undefined): StakingPeriodKey {
  return value === "7d" || value === "30d" || value === "all" ? value : "24h";
}

export function normalizeStakingBoard(value: string | null | undefined): StakingBoardKey {
  return value === "earners" || value === "rewards" ? value : "stakers";
}

export function computeCurrentStakingWeight(position: PositionForWeight, now = new Date()) {
  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - position.lastWeightUpdateAt.getTime()) / 1000)
  );
  return position.accumulatedWeight + BigInt(position.currentStakedWolo) * BigInt(seconds);
}

export function formatStakingWeight(value: bigint | string | number) {
  const raw = typeof value === "bigint" ? value : BigInt(value || 0);
  if (raw === BigInt(0)) return "--";
  return raw.toString();
}

export function calculateModeledFeePools(settledVolumeWolo: number) {
  const bettingFeePoolWolo = (settledVolumeWolo * BETTING_FEE_RATE_BPS) / BPS_DENOMINATOR;
  const stakerPoolWolo = (bettingFeePoolWolo * STAKER_SHARE_BPS) / BPS_DENOMINATOR;
  return {
    bettingFeePoolWolo,
    stakerPoolWolo,
    treasuryPoolWolo: bettingFeePoolWolo - stakerPoolWolo,
  };
}

export function calculateLedgerFeePools(settledVolumeWolo: number) {
  const bettingFeePoolWolo = Math.round(
    (settledVolumeWolo * BETTING_FEE_RATE_BPS) / BPS_DENOMINATOR
  );
  const stakerPoolWolo = Math.floor((bettingFeePoolWolo * STAKER_SHARE_BPS) / BPS_DENOMINATOR);
  return {
    bettingFeePoolWolo,
    stakerPoolWolo,
    treasuryPoolWolo: bettingFeePoolWolo - stakerPoolWolo,
  };
}

function displayPlayerName(input: DisplayUser) {
  return input.inGameName?.trim() || input.steamPersonaName?.trim() || input.uid;
}

function formatMoment(value: Date) {
  return value.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatActivityWolo(value: number) {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 10_000 ? 1 : Number.isInteger(value) ? 0 : 2,
    notation: value >= 10_000 ? "compact" : "standard",
  }).format(value)} WOLO`;
}

function formatTxFee(value: number | null | undefined) {
  if (!value || value <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

function shortHash(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  if (clean.length <= 16) return clean;
  return `${clean.slice(0, 8)}...${clean.slice(-6)}`;
}

function shortAddress(value: string | null | undefined) {
  const clean = value?.trim();
  if (!clean) return null;
  if (clean.length <= 18) return clean;
  return `${clean.slice(0, 10)}...${clean.slice(-6)}`;
}

function eventTypeForMainnetActivity(row: WoloMainnetActivityRow) {
  if (row.actionType === "faucet_claim") return "CLAIM";
  if (row.actionType === "stake") return "STAKE";
  if (row.actionType === "unstake") return "UNSTAKE";
  if (row.actionType === "bet_challenge_escrow") return "ESCROW";
  if (row.actionType === "payout_settlement") return "PAYOUT";
  return "TX";
}

function toneForMainnetActivity(row: WoloMainnetActivityRow): StakingActivityItem["tone"] {
  if (row.actionType === "payout_settlement" || row.actionType === "faucet_claim") return "emerald";
  if (row.actionType === "bet_challenge_escrow") return "sky";
  if (row.actionType === "stake" || row.actionType === "unstake") return "amber";
  return "slate";
}

function labelForMainnetActivity(row: WoloMainnetActivityRow) {
  const actor = row.userLabel || shortAddress(row.walletAddress) || "wallet";
  const amount = row.amountWolo != null ? formatActivityWolo(row.amountWolo) : "WOLO";
  return `${amount} ${row.actionLabel.toLowerCase()}: ${actor}`;
}

function labelForIndexedTransfer(row: WoloIndexedTransferActivityRow) {
  return `${row.amountLabel} direct transfer`;
}

function detailForIndexedTransfer(row: WoloIndexedTransferActivityRow) {
  const sender = row.senderLabel || shortAddress(row.senderAddress) || "wallet";
  const recipient = row.recipientLabel || shortAddress(row.recipientAddress) || "wallet";
  const txLabel = shortHash(row.txHash);
  const parts = [`${sender} -> ${recipient}`, txLabel ? `tx ${txLabel}` : null];
  if (row.memo) parts.push(`memo ${row.memo.slice(0, 80)}`);
  return parts.filter(Boolean).join(" · ");
}

function dedupeActivityRows(
  rows: Array<StakingActivityItem & { sortAt: Date }>,
  limit: number
) {
  const seen = new Set<string>();
  const deduped: Array<StakingActivityItem & { sortAt: Date }> = [];

  for (const item of rows.sort((left, right) => right.sortAt.getTime() - left.sortAt.getTime())) {
    const key = item.key || `${item.label}:${item.detail}:${item.meta}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function metadataNumber(
  metadata: Prisma.JsonValue | null | undefined,
  key: string
) {
  const value = jsonObject(metadata)[key];
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function badgeForRank(index: number, fallback: string) {
  if (index === 0) return "Crown lane";
  if (index === 1) return "Early seat";
  if (index === 2) return "Verified grind";
  return fallback;
}

function toneForRank(index: number): StakingLeaderboardRow["tone"] {
  if (index === 0) return "gold";
  if (index === 1) return "emerald";
  if (index === 2) return "sky";
  return "slate";
}

function serializeEvent(event: {
  id: number;
  type: string;
  amountWolo: number;
  status: string;
  createdAt: Date;
  txHash: string | null;
}) {
  return {
    id: event.id,
    type: event.type,
    amountWolo: event.amountWolo,
    status: event.status,
    txHash: event.txHash,
    createdAt: event.createdAt.toISOString(),
  };
}

export async function loadStakingSummary(
  prisma: PrismaClient,
  period: StakingPeriodKey
): Promise<StakingSummary> {
  const now = new Date();
  const periodStart = getStakingPeriodStart(period, now);
  const wagerWhere = periodStart ? { createdAt: { gte: periodStart } } : {};
  const settledWhere = periodStart
    ? { settledAt: { gte: periodStart } }
    : { settledAt: { not: null } };
  const activeUserWhere = periodStart ? { lastSeen: { gte: periodStart } } : {};

  const [
    wagerAggregate,
    settledAggregate,
    payoutAggregate,
    activeBettorRows,
    activePlayers,
    stakingAggregate,
    stakingPositions,
    recentWagers,
    recentEvents,
    recentRewardAllocations,
    mainnetActivityRows,
    indexedTransferRows,
  ] = await Promise.all([
    prisma.betWager.aggregate({
      where: wagerWhere,
      _count: { _all: true },
      _sum: { amountWolo: true },
    }),
    prisma.betWager.aggregate({
      where: settledWhere,
      _sum: { amountWolo: true },
    }),
    prisma.betWager.aggregate({
      where: settledWhere,
      _sum: { payoutWolo: true },
    }),
    prisma.betWager.findMany({
      where: wagerWhere,
      distinct: ["userId"],
      select: { userId: true },
    }),
    prisma.user.count({ where: activeUserWhere }),
    prisma.stakingPosition.aggregate({
      where: { status: "active", currentStakedWolo: { gt: 0 } },
      _count: { _all: true },
      _sum: { currentStakedWolo: true },
    }),
    prisma.stakingPosition.findMany({
      where: { status: "active", currentStakedWolo: { gt: 0 } },
      select: {
        currentStakedWolo: true,
        accumulatedWeight: true,
        lastWeightUpdateAt: true,
      },
    }),
    prisma.betWager.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 8,
      select: {
        id: true,
        amountWolo: true,
        payoutWolo: true,
        status: true,
        side: true,
        createdAt: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
        market: {
          select: {
            leftLabel: true,
            rightLabel: true,
          },
        },
      },
    }),
    prisma.stakingEvent.findMany({
      where: { status: { not: "PENDING_CHAIN" } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        type: true,
        amountWolo: true,
        status: true,
        createdAt: true,
        txHash: true,
        metadata: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.stakingRewardAllocation.findMany({
      where: {
        rewardWolo: { gt: 0 },
        status: { not: "CLAIMED" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        rewardWolo: true,
        status: true,
        createdAt: true,
        creditedAt: true,
        distribution: {
          select: {
            distributionDate: true,
          },
        },
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    loadWoloMainnetActivityRows(prisma, 25).catch(() => []),
    loadIndexedWoloTransferActivityRows(prisma, 25).catch(() => []),
  ]);

  const settledVolumeWolo = settledAggregate._sum.amountWolo ?? 0;
  const feePools = calculateModeledFeePools(settledVolumeWolo);
  const totalStakingWeight = stakingPositions.reduce(
    (sum, position) => sum + computeCurrentStakingWeight(position, now),
    BigInt(0)
  );
  const activity: Array<StakingActivityItem & { sortAt: Date }> = [];

  for (const event of recentEvents) {
    const player = displayPlayerName(event.user);
    const amountLabel = formatActivityWolo(event.amountWolo);
    const metadata = jsonObject(event.metadata);
    const isRewardPayout = Boolean(metadata.stakingRewardDistributionId);
    const eventType = isRewardPayout ? "REWARD" : event.type.toUpperCase();
    const timestampLabel = formatMoment(event.createdAt);
    const txFeeLabel = formatTxFee(metadataNumber(event.metadata, "txFeeWolo"));
    const verb =
      isRewardPayout
        ? "reward payout"
        : event.type === "UNSTAKE"
        ? "unstake"
        : event.type === "CLAIM"
          ? "claim"
          : "stake";
    activity.push({
      key: event.txHash ? `tx-${event.txHash}` : `staking-event-${event.id}`,
      label: `${amountLabel} ${verb}: ${player}`,
      detail:
        event.txHash
          ? `${isRewardPayout ? "Daily staking share paid" : event.type === "UNSTAKE" ? "Returned to wallet" : "Keplr signed"} · ${event.txHash.slice(0, 8)}...${event.txHash.slice(-6)}`
          : `Ledger status: ${event.status.toLowerCase()}.`,
      meta: timestampLabel,
      eventType,
      amountLabel,
      txFeeLabel: txFeeLabel ?? undefined,
      timestampLabel,
      tone: event.type === "CLAIM" ? "emerald" : "amber",
      sortAt: event.createdAt,
    });
  }

  for (const allocation of recentRewardAllocations) {
    const player = displayPlayerName(allocation.user);
    const amountLabel = formatActivityWolo(allocation.rewardWolo);
    const timestamp = allocation.creditedAt ?? allocation.createdAt;
    const timestampLabel = formatMoment(timestamp);
    const distributionDate = allocation.distribution.distributionDate.toISOString().slice(0, 10);
    activity.push({
      key: `staking-reward-allocation-${allocation.id}`,
      label: `${amountLabel} reward queued: ${player}`,
      detail: `Daily staking share for ${distributionDate} is waiting on payout execution.`,
      meta: timestampLabel,
      eventType: "REWARD",
      amountLabel,
      timestampLabel,
      tone: "amber",
      sortAt: timestamp,
    });
  }

  for (const row of mainnetActivityRows) {
    const timestamp = new Date(row.updatedAt || row.createdAt);
    const safeTimestamp = Number.isNaN(timestamp.getTime()) ? now : timestamp;
    const timestampLabel = formatMoment(safeTimestamp);
    const txLabel = shortHash(row.txHash);
    const amountLabel = row.amountWolo != null ? formatActivityWolo(row.amountWolo) : undefined;
    const addressLabel = shortAddress(row.walletAddress);
    const contextParts = [
      row.contextLabel,
      txLabel ? `tx ${txLabel}` : null,
      addressLabel ? `wallet ${addressLabel}` : null,
    ].filter(Boolean);

    activity.push({
      key: row.key,
      label: labelForMainnetActivity(row),
      detail: contextParts.join(" · "),
      meta: timestampLabel,
      eventType: eventTypeForMainnetActivity(row),
      amountLabel,
      timestampLabel,
      tone: toneForMainnetActivity(row),
      sortAt: safeTimestamp,
    });
  }

  for (const row of indexedTransferRows) {
    const timestamp = new Date(row.timestamp);
    const safeTimestamp = Number.isNaN(timestamp.getTime()) ? now : timestamp;
    const timestampLabel = formatMoment(safeTimestamp);

    activity.push({
      key: row.key,
      label: labelForIndexedTransfer(row),
      detail: detailForIndexedTransfer(row),
      meta: timestampLabel,
      eventType: "DIRECT",
      amountLabel: row.amountLabel,
      timestampLabel,
      tone: "emerald",
      sortAt: safeTimestamp,
    });
  }

  for (const wager of recentWagers) {
    const player = displayPlayerName(wager.user);
    const pickedLabel = wager.side === "right" ? wager.market.rightLabel : wager.market.leftLabel;
    const matchLabel = `${wager.market.leftLabel} vs ${wager.market.rightLabel}`;
    const isWin = wager.status === "won" && (wager.payoutWolo ?? 0) > 0;
    const amountLabel = formatActivityWolo(isWin ? wager.payoutWolo ?? 0 : wager.amountWolo);
    const eventType = isWin ? "PAYOUT" : "WAGER";
    const timestampLabel = formatMoment(wager.createdAt);
    activity.push({
      key: `wager-${wager.id}`,
      label: isWin
        ? `${amountLabel} payout: ${matchLabel}`
        : `${amountLabel} wager: ${matchLabel}`,
      detail: isWin ? `${player} won on ${pickedLabel}` : `${player} picked ${pickedLabel}`,
      meta: timestampLabel,
      eventType,
      amountLabel,
      timestampLabel,
      tone: isWin ? "emerald" : "sky",
      sortAt: wager.createdAt,
    });
  }

  if (activity.length === 0) {
    activity.push({
      key: "activity-standby",
      label: "Recent activity is warming up",
      detail: "Settled matches, treasury movement, and staking rewards will land here.",
      meta: "Standby",
      eventType: "STANDBY",
      timestampLabel: "Standby",
      tone: "slate",
      sortAt: now,
    });
  }

  return {
    period,
    generatedAt: now.toISOString(),
    dataLive: true,
    betsPlaced: wagerAggregate._count._all,
    betVolumeWolo: wagerAggregate._sum.amountWolo ?? 0,
    payoutWolo: payoutAggregate._sum.payoutWolo ?? 0,
    settledVolumeWolo,
    stakerFeePoolWolo: feePools.stakerPoolWolo,
    treasuryShareWolo: feePools.treasuryPoolWolo,
    activeBettors: activeBettorRows.length,
    activePlayers,
    activeStakers: stakingAggregate._count._all,
    totalStakedWolo: stakingAggregate._sum.currentStakedWolo ?? 0,
    totalStakingWeight: totalStakingWeight.toString(),
    directTransferCount: indexedTransferRows.length,
    activity: dedupeActivityRows(activity, 16)
      .map((item) => ({
        key: item.key,
        label: item.label,
        detail: item.detail,
        meta: item.meta,
        eventType: item.eventType,
        amountLabel: item.amountLabel,
        txFeeLabel: item.txFeeLabel,
        timestampLabel: item.timestampLabel,
        tone: item.tone,
      })),
  };
}

async function loadBoardRows(
  prisma: PrismaClient,
  mode: "staked" | "earned" | "weight"
): Promise<StakingLeaderboardRow[]> {
  const now = new Date();
  const orderBy =
    mode === "earned"
      ? [{ lifetimeRewardsWolo: "desc" as const }, { currentStakedWolo: "desc" as const }]
      : [{ currentStakedWolo: "desc" as const }, { lifetimeRewardsWolo: "desc" as const }];
  const positions = await prisma.stakingPosition.findMany({
    where: {
      status: "active",
      OR: [{ currentStakedWolo: { gt: 0 } }, { lifetimeRewardsWolo: { gt: 0 } }],
    },
    orderBy,
    take: 24,
    include: {
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
    },
  });

  const rows = positions.map((position, index) => ({
    player: displayPlayerName(position.user),
    badge: badgeForRank(index, mode === "earned" ? "Fee share" : "Staking seat"),
    stakedWolo: position.currentStakedWolo,
    rewardsWolo: position.lifetimeRewardsWolo,
    stakingWeight: computeCurrentStakingWeight(position, now).toString(),
    status: position.status === "active" ? "Live" : position.status,
    tone: toneForRank(index),
  }));

  if (mode !== "weight") return rows.slice(0, 8);

  return rows
    .sort((a, b) => {
      const left = BigInt(a.stakingWeight || 0);
      const right = BigInt(b.stakingWeight || 0);
      if (left === right) return b.stakedWolo - a.stakedWolo;
      return left > right ? -1 : 1;
    })
    .slice(0, 8);
}

async function loadRecentRewardRows(prisma: PrismaClient): Promise<StakingLeaderboardRow[]> {
  const allocations = await prisma.stakingRewardAllocation.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 8,
    include: {
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      position: {
        select: {
          currentStakedWolo: true,
        },
      },
    },
  });

  return allocations.map((allocation, index) => ({
    player: displayPlayerName(allocation.user),
    badge: allocation.status === "CREDITED" ? "Credited" : "Daily share",
    stakedWolo: allocation.position?.currentStakedWolo ?? 0,
    rewardsWolo: allocation.rewardWolo,
    stakingWeight: allocation.userWeight.toString(),
    status: allocation.status,
    tone: toneForRank(index),
  }));
}

export async function loadStakingLeaderboard(
  prisma: PrismaClient,
  board: StakingBoardKey
): Promise<StakingLeaderboard> {
  const [topStakers, topEarners, topWeight, recentRewards] = await Promise.all([
    loadBoardRows(prisma, "staked"),
    loadBoardRows(prisma, "earned"),
    loadBoardRows(prisma, "weight"),
    loadRecentRewardRows(prisma),
  ]);

  const rows =
    board === "earners" ? topEarners : board === "rewards" ? recentRewards : topStakers;

  return {
    board,
    rows,
    topStakers,
    topEarners,
    topWeight,
    recentRewards,
  };
}

export async function loadStakingMe(prisma: PrismaClient, userId: number) {
  const now = new Date();
  const [user, position, events, txFeeEvents, lastReward] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
      },
    }),
    prisma.stakingPosition.findUnique({
      where: { userId },
    }),
    prisma.stakingEvent.findMany({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        type: true,
        amountWolo: true,
        status: true,
        createdAt: true,
        txHash: true,
        metadata: true,
      },
    }),
    prisma.stakingEvent.findMany({
      where: { userId, status: "CONFIRMED" },
      select: { metadata: true },
    }),
    prisma.stakingRewardAllocation.findFirst({
      where: {
        userId,
        OR: [{ creditedAt: { not: null } }, { claimedAt: { not: null } }],
      },
      orderBy: [{ creditedAt: "desc" }, { claimedAt: "desc" }, { createdAt: "desc" }],
      select: {
        creditedAt: true,
        claimedAt: true,
        rewardWolo: true,
        status: true,
      },
    }),
  ]);

  if (!user) {
    throw new StakingActionError("Viewer not found.", 404);
  }

  const stakingWeight = position ? computeCurrentStakingWeight(position, now) : BigInt(0);
  const lifetimeTxFeesWolo = txFeeEvents.reduce(
    (sum, event) => sum + metadataNumber(event.metadata, "txFeeWolo"),
    0
  );

  return {
    user: {
      id: user.id,
      uid: user.uid,
      playerName: displayPlayerName(user),
      walletAddress: user.walletAddress,
    },
    position: {
      currentStakedWolo: position?.currentStakedWolo ?? 0,
      stakingWeight: stakingWeight.toString(),
      pendingRewardsWolo: position?.pendingRewardsWolo ?? 0,
      lifetimeRewardsWolo: position?.lifetimeRewardsWolo ?? 0,
      claimedRewardsWolo: position?.claimedRewardsWolo ?? 0,
      lifetimeTxFeesWolo,
      status: position?.status ?? "ledger_ready",
      lastWeightUpdateAt: position?.lastWeightUpdateAt.toISOString() ?? null,
      lastRewardPaymentAt:
        lastReward?.claimedAt?.toISOString() ?? lastReward?.creditedAt?.toISOString() ?? null,
      lastRewardAmountWolo: lastReward?.rewardWolo ?? 0,
    },
    recentEvents: events.map(serializeEvent),
    execution: {
      status: "PENDING_CHAIN",
      detail: "Staking ledger ready. Chain execution pending.",
    },
  };
}

export async function createPendingStakingEvent(
  prisma: PrismaClient,
  input: {
    userId: number;
    walletAddress?: string | null;
    type: StakingActionType;
    amountWolo: number;
    metadata?: Prisma.InputJsonValue;
  }
) {
  if (!Number.isInteger(input.amountWolo) || input.amountWolo < 0) {
    throw new StakingActionError("Enter a valid whole-WOLO amount.", 400);
  }
  if ((input.type === "STAKE" || input.type === "UNSTAKE") && input.amountWolo <= 0) {
    throw new StakingActionError("Amount must be greater than 0 WOLO.", 400);
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const position = await tx.stakingPosition.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        walletAddress: input.walletAddress ?? null,
        lastWeightUpdateAt: now,
      },
      update: input.walletAddress ? { walletAddress: input.walletAddress } : {},
    });

    if (input.type === "UNSTAKE" && input.amountWolo > position.currentStakedWolo) {
      throw new StakingActionError("No confirmed stake is available for that unstake.", 409);
    }

    if (input.type === "CLAIM" && position.pendingRewardsWolo <= 0) {
      throw new StakingActionError("No staking rewards are ready to claim.", 409);
    }

    const weightBefore = computeCurrentStakingWeight(position, now);
    const amountWolo = input.type === "CLAIM" ? position.pendingRewardsWolo : input.amountWolo;

    return tx.stakingEvent.create({
      data: {
        userId: input.userId,
        positionId: position.id,
        walletAddress: input.walletAddress ?? position.walletAddress,
        type: input.type,
        amountWolo,
        status: "PENDING_CHAIN",
        weightBefore,
        weightAfter: weightBefore,
        balanceBefore: position.currentStakedWolo,
        balanceAfter: position.currentStakedWolo,
        metadata: {
          executionPending: true,
          detail: "Chain execution opens after WoloChain staking wallet cutover.",
          ...(typeof input.metadata === "object" && input.metadata ? input.metadata : {}),
        },
      },
    });
  });
}

export async function createConfirmedStakingEvent(
  prisma: PrismaClient,
  input: {
    userId: number;
    walletAddress?: string | null;
    type: Extract<StakingActionType, "STAKE" | "UNSTAKE">;
    amountWolo: number;
    txHash: string;
    txFeeWolo?: number | null;
    proofUrl?: string | null;
    metadata?: Prisma.InputJsonValue;
  }
) {
  if (!Number.isInteger(input.amountWolo) || input.amountWolo <= 0) {
    throw new StakingActionError("Amount must be greater than 0 WOLO.", 400);
  }

  const normalizedTxHash = input.txHash.trim().toUpperCase();
  if (!normalizedTxHash) {
    throw new StakingActionError("A confirmed chain tx hash is required.", 400);
  }

  const existing = await prisma.stakingEvent.findFirst({
    where: { txHash: normalizedTxHash },
  });
  if (existing) {
    return existing;
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const position = await tx.stakingPosition.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        walletAddress: input.walletAddress ?? null,
        lastWeightUpdateAt: now,
      },
      update: input.walletAddress ? { walletAddress: input.walletAddress } : {},
    });

    const weightBefore = computeCurrentStakingWeight(position, now);
    const balanceBefore = position.currentStakedWolo;
    const balanceAfter =
      input.type === "STAKE"
        ? balanceBefore + input.amountWolo
        : balanceBefore - input.amountWolo;

    if (balanceAfter < 0) {
      throw new StakingActionError("No confirmed stake is available for that unstake.", 409);
    }

    const event = await tx.stakingEvent.create({
      data: {
        userId: input.userId,
        positionId: position.id,
        walletAddress: input.walletAddress ?? position.walletAddress,
        type: input.type,
        amountWolo: input.amountWolo,
        txHash: normalizedTxHash,
        status: "CONFIRMED",
        weightBefore,
        weightAfter: weightBefore,
        balanceBefore,
        balanceAfter,
        confirmedAt: now,
        metadata: {
          txFeeWolo: input.txFeeWolo ?? 0,
          proofUrl: input.proofUrl ?? null,
          ...(typeof input.metadata === "object" && input.metadata ? input.metadata : {}),
        },
      },
    });

    await tx.stakingPosition.update({
      where: { id: position.id },
      data: {
        walletAddress: input.walletAddress ?? position.walletAddress,
        currentStakedWolo: balanceAfter,
        accumulatedWeight: weightBefore,
        lastWeightUpdateAt: now,
        status: balanceAfter > 0 ? "active" : "inactive",
      },
    });

    return event;
  });
}

function startOfUtcDay(input: Date) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

function stakingDistributionDateKey(input: Date) {
  return startOfUtcDay(input).toISOString().slice(0, 10);
}

function buildStakingRewardSettlementRunId(distributionId: number, distributionDate: Date) {
  return `aoe2-staking-${stakingDistributionDateKey(distributionDate)}-${distributionId}`;
}

function creditedRewardStatuses() {
  return ["CREDITED", "PENDING"] as const;
}

export async function calculateDailyStakingRewardDistribution(
  prisma: PrismaClient,
  distributionDate = startOfUtcDay(new Date(Date.now() - 24 * 60 * 60 * 1000))
) {
  const periodStart = startOfUtcDay(distributionDate);
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
  if (periodEnd.getTime() > Date.now()) {
    throw new StakingActionError("Cannot finalize an open staking reward window.", 409);
  }

  const existing = await prisma.stakingRewardDistribution.findUnique({
    where: { distributionDate: periodStart },
    include: { allocations: { select: { id: true } } },
  });

  if (existing && existing.status !== "DRAFT") {
    return { distributionId: existing.id, created: false, status: existing.status };
  }

  if (existing?.allocations.length) {
    throw new StakingActionError("Distribution already has allocations; refusing to double-credit.", 409);
  }

  const [settledAggregate, positions] = await Promise.all([
    prisma.betWager.aggregate({
      where: {
        settledAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      _sum: { amountWolo: true },
      _count: { _all: true },
    }),
    prisma.stakingPosition.findMany({
      where: { status: "active", currentStakedWolo: { gt: 0 } },
      select: {
        id: true,
        userId: true,
        walletAddress: true,
        currentStakedWolo: true,
        accumulatedWeight: true,
        lastWeightUpdateAt: true,
      },
    }),
  ]);

  const settledVolumeWolo = settledAggregate._sum.amountWolo ?? 0;
  const feePools = calculateLedgerFeePools(settledVolumeWolo);
  const weightedPositions = positions.map((position) => ({
    ...position,
    userWeight: computeCurrentStakingWeight(position, periodEnd),
  }));
  const totalWeight = weightedPositions.reduce(
    (sum, position) => sum + position.userWeight,
    BigInt(0)
  );

  return prisma.$transaction(async (tx) => {
    const distribution = existing
      ? await tx.stakingRewardDistribution.update({
          where: { id: existing.id },
          data: {
            periodStart,
            periodEnd,
            bettingFeePoolWolo: feePools.bettingFeePoolWolo,
            stakerPoolWolo: feePools.stakerPoolWolo,
            treasuryPoolWolo: feePools.treasuryPoolWolo,
            treasuryPayoutRequestId: buildStakingTreasuryPayoutRequestId(periodStart),
            totalWeight,
            status: "FINALIZED",
            finalizedAt: new Date(),
            metadata: {
              settledBets: settledAggregate._count._all,
              settledVolumeWolo,
              unit: "whole_wolo",
            },
          },
        })
      : await tx.stakingRewardDistribution.create({
          data: {
            distributionDate: periodStart,
            periodStart,
            periodEnd,
            bettingFeePoolWolo: feePools.bettingFeePoolWolo,
            stakerPoolWolo: feePools.stakerPoolWolo,
            treasuryPoolWolo: feePools.treasuryPoolWolo,
            treasuryPayoutRequestId: buildStakingTreasuryPayoutRequestId(periodStart),
            totalWeight,
            status: "FINALIZED",
            finalizedAt: new Date(),
            metadata: {
              settledBets: settledAggregate._count._all,
              settledVolumeWolo,
              unit: "whole_wolo",
            },
          },
        });

    if (totalWeight > BigInt(0) && feePools.stakerPoolWolo > 0) {
      for (const position of weightedPositions) {
        const rewardWolo = Number(
          (BigInt(feePools.stakerPoolWolo) * position.userWeight) / totalWeight
        );
        if (rewardWolo <= 0) continue;

        await tx.stakingRewardAllocation.create({
          data: {
            distributionId: distribution.id,
            userId: position.userId,
            positionId: position.id,
            walletAddress: position.walletAddress,
            userWeight: position.userWeight,
            totalWeight,
            rewardWolo,
            status: "CREDITED",
            creditedAt: new Date(),
          },
        });

        await tx.stakingPosition.update({
          where: { id: position.id },
          data: {
            pendingRewardsWolo: { increment: rewardWolo },
            lifetimeRewardsWolo: { increment: rewardWolo },
            accumulatedWeight: position.userWeight,
            lastWeightUpdateAt: periodEnd,
          },
        });
      }
    }

    await tx.stakingDailyStat.upsert({
      where: { date: periodStart },
      create: {
        date: periodStart,
        totalStakedWolo: positions.reduce((sum, position) => sum + position.currentStakedWolo, 0),
        activeStakers: positions.length,
        totalWeight,
        stakerRewardsWolo: feePools.stakerPoolWolo,
        treasuryRevenueWolo: feePools.treasuryPoolWolo,
        betVolumeWolo: settledVolumeWolo,
        betsPlaced: settledAggregate._count._all,
      },
      update: {
        totalStakedWolo: positions.reduce((sum, position) => sum + position.currentStakedWolo, 0),
        activeStakers: positions.length,
        totalWeight,
        stakerRewardsWolo: feePools.stakerPoolWolo,
        treasuryRevenueWolo: feePools.treasuryPoolWolo,
        betVolumeWolo: settledVolumeWolo,
        betsPlaced: settledAggregate._count._all,
      },
    });

    return { distributionId: distribution.id, created: true, status: distribution.status };
  });
}

export async function executeDailyStakingRewardPayouts(
  prisma: PrismaClient,
  distributionId: number
): Promise<StakingRewardPayoutRun> {
  const distribution = await prisma.stakingRewardDistribution.findUnique({
    where: { id: distributionId },
    include: {
      allocations: {
        where: {
          rewardWolo: { gt: 0 },
          status: { in: [...creditedRewardStatuses()] },
        },
        orderBy: [{ id: "asc" }],
        include: {
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
    },
  });

  if (!distribution) {
    throw new StakingActionError("Staking reward distribution not found.", 404);
  }

  const distributionDate = stakingDistributionDateKey(distribution.distributionDate);
  const payoutExecutionConfigured = hasWoloPayoutExecutionConfigured();
  const validPlans = distribution.allocations
    .map((allocation) => {
      const walletAddress = allocation.walletAddress?.trim() || "";
      const addressError = walletAddress ? validateWoloAddress(walletAddress) : "Wallet address is required.";
      return {
        allocation,
        walletAddress,
        addressError,
        requestId: `staking-reward-${distributionDate}-${allocation.userId}`,
      };
    })
    .filter((plan) => !plan.addressError);
  const skippedPayouts = distribution.allocations.length - validPlans.length;

  if (validPlans.length === 0) {
    return {
      distributionId: distribution.id,
      distributionDate,
      payoutExecutionConfigured,
      settlementRunId: null,
      requestedPayouts: 0,
      executedPayouts: 0,
      skippedPayouts,
      status: "skipped",
      detail:
        skippedPayouts > 0
          ? "No reward payouts had a valid WOLO wallet address."
          : "No credited staking rewards are waiting for payout.",
      validation: null,
      execution: null,
    };
  }

  if (!payoutExecutionConfigured) {
    return {
      distributionId: distribution.id,
      distributionDate,
      payoutExecutionConfigured,
      settlementRunId: null,
      requestedPayouts: validPlans.length,
      executedPayouts: 0,
      skippedPayouts,
      status: "not_configured",
      detail: "WOLO payout execution is not configured; rewards remain queued in the app ledger.",
      validation: null,
      execution: null,
    };
  }

  const settlementRunId = buildStakingRewardSettlementRunId(
    distribution.id,
    distribution.distributionDate
  );
  const payouts = validPlans.map((plan) => ({
    requestId: plan.requestId,
    toAddress: plan.walletAddress,
    amountWolo: plan.allocation.rewardWolo,
    memo: `AoE2 staking reward ${distributionDate}`,
  }));

  const validation = await validateWoloSettlementRun({
    settlementRunId,
    sourceApp: "aoe2hdbets",
    sourceEventId: `staking-reward-${distribution.id}`,
    note: `Staking reward distribution ${distributionDate}`,
    memo: `AoE2 staking rewards ${distributionDate}`,
    payouts,
  });
  const execution = await executeWoloSettlementRun({
    settlementRunId,
    sourceApp: "aoe2hdbets",
    sourceEventId: `staking-reward-${distribution.id}`,
    note: `Staking reward distribution ${distributionDate}`,
    memo: `AoE2 staking rewards ${distributionDate}`,
    payouts,
  });
  const payoutByRequestId = new Map(
    execution.payouts.map((payout) => [payout.requestId, payout] as const)
  );
  const paidAt = new Date();
  let executedPayouts = 0;

  await prisma.$transaction(async (tx) => {
    for (const plan of validPlans) {
      const payout = payoutByRequestId.get(plan.requestId);
      if (!payout?.ok || !payout.txHash) continue;

      const allocation = await tx.stakingRewardAllocation.findUnique({
        where: { id: plan.allocation.id },
      });
      if (!allocation || !creditedRewardStatuses().includes(allocation.status as "CREDITED" | "PENDING")) {
        continue;
      }

      const position = allocation.positionId
        ? await tx.stakingPosition.findUnique({ where: { id: allocation.positionId } })
        : await tx.stakingPosition.findUnique({ where: { userId: allocation.userId } });
      const weightBefore = position
        ? computeCurrentStakingWeight(position, paidAt)
        : allocation.userWeight;
      const balanceWolo = position?.currentStakedWolo ?? 0;

      await tx.stakingRewardAllocation.update({
        where: { id: allocation.id },
        data: {
          status: "CLAIMED",
          claimedAt: paidAt,
        },
      });

      if (position) {
        await tx.stakingPosition.update({
          where: { id: position.id },
          data: {
            pendingRewardsWolo: {
              decrement: Math.min(position.pendingRewardsWolo, allocation.rewardWolo),
            },
            claimedRewardsWolo: { increment: allocation.rewardWolo },
            accumulatedWeight: weightBefore,
            lastWeightUpdateAt: paidAt,
          },
        });
      }

      await tx.stakingEvent.create({
        data: {
          userId: allocation.userId,
          positionId: allocation.positionId,
          walletAddress: plan.walletAddress,
          type: "CLAIM",
          amountWolo: allocation.rewardWolo,
          txHash: payout.txHash,
          status: "CONFIRMED",
          weightBefore,
          weightAfter: weightBefore,
          balanceBefore: balanceWolo,
          balanceAfter: balanceWolo,
          confirmedAt: paidAt,
          metadata: {
            stakingRewardDistributionId: distribution.id,
            stakingRewardAllocationId: allocation.id,
            payoutRequestId: plan.requestId,
            payoutProofUrl: payout.proofUrl ?? null,
            settlementRunId,
            settlementStatus: execution.status,
            settlementDetail: payout.detail ?? execution.detail ?? null,
          },
        },
      });

      executedPayouts += 1;
    }
  });

  const status =
    executedPayouts === validPlans.length
      ? "confirmed"
      : executedPayouts > 0
        ? "partial"
        : "failed";

  return {
    distributionId: distribution.id,
    distributionDate,
    payoutExecutionConfigured,
    settlementRunId,
    requestedPayouts: validPlans.length,
    executedPayouts,
    skippedPayouts,
    status,
    detail:
      execution.detail ||
      (status === "confirmed"
        ? "All staking rewards were paid on WoloChain."
        : "One or more staking reward payouts did not execute."),
    validation,
    execution,
  };
}
