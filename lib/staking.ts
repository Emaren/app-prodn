import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

export const BETTING_FEE_RATE_BPS = 75; // 0.75%
export const STAKER_SHARE_BPS = 5_000; // 50%
export const BPS_DENOMINATOR = 10_000;

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
  activity: StakingActivityItem[];
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
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 6,
      select: {
        id: true,
        type: true,
        amountWolo: true,
        status: true,
        createdAt: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
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
    const eventType = event.type.toUpperCase();
    const timestampLabel = formatMoment(event.createdAt);
    activity.push({
      key: `staking-event-${event.id}`,
      label: `${amountLabel} ${event.type.toLowerCase()} request: ${player}`,
      detail:
        event.status === "PENDING_CHAIN"
          ? "Chain execution pending."
          : `Ledger status: ${event.status.toLowerCase()}.`,
      meta: timestampLabel,
      eventType,
      amountLabel,
      timestampLabel,
      tone: event.type === "CLAIM" ? "emerald" : "amber",
      sortAt: event.createdAt,
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
    activity: activity
      .sort((left, right) => right.sortAt.getTime() - left.sortAt.getTime())
      .slice(0, 7)
      .map((item) => ({
        key: item.key,
        label: item.label,
        detail: item.detail,
        meta: item.meta,
        eventType: item.eventType,
        amountLabel: item.amountLabel,
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
  const [user, position, events, lastReward] = await Promise.all([
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
      },
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

function startOfUtcDay(input: Date) {
  return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
}

export async function calculateDailyStakingRewardDistribution(
  prisma: PrismaClient,
  distributionDate = startOfUtcDay(new Date(Date.now() - 24 * 60 * 60 * 1000))
) {
  const periodStart = startOfUtcDay(distributionDate);
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
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
