import type { PrismaClient } from "@/lib/generated/prisma";
import {
  deriveMainnetStakingPositionsFromTransfers,
  resolvePublicCurrentStakedWolo,
  type DerivedMainnetStakingPosition,
  type MainnetStakingTransferInput,
} from "@/lib/mainnetStakingDerivation";
import { getWoloMainnetDisplayStartAt } from "@/lib/woloChain";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";
import { cappedRewardPrincipalWolo } from "@/lib/stakingRewardCap";
import { collectCursorPages } from "@/lib/collectCursorPages";

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function displayUserName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid;
}

function computeCanonicalStakingWeight(
  position: {
    accumulatedWeight: bigint;
    currentStakedWolo: number;
    lastWeightUpdateAt: Date;
  },
  asOf: Date,
  options: {
    weightStartAt?: Date;
    rewardWeightCapWolo?: number;
  } = {},
) {
  const startAt = new Date(
    Math.max(
      position.lastWeightUpdateAt.getTime(),
      options.weightStartAt?.getTime() ??
        position.lastWeightUpdateAt.getTime(),
    ),
  );
  const seconds = Math.max(
    0,
    Math.floor((asOf.getTime() - startAt.getTime()) / 1000),
  );
  const baseWeight =
    options.weightStartAt &&
    options.weightStartAt.getTime() > position.lastWeightUpdateAt.getTime()
      ? BigInt(0)
      : position.accumulatedWeight;
  const rewardPrincipal =
    options.rewardWeightCapWolo === undefined
      ? Math.max(0, Math.trunc(position.currentStakedWolo))
      : cappedRewardPrincipalWolo(
          position.currentStakedWolo,
          options.rewardWeightCapWolo,
        );

  return (
    baseWeight + BigInt(rewardPrincipal) * BigInt(seconds)
  ).toString();
}

export type LoadMainnetStakingPositionsOptions = {
  asOf?: Date;
  weightStartAt?: Date;
  rewardWeightCapWolo?: number;
  requireCompleteLedger?: boolean;
  reconcileCanonicalCurrent?: boolean;
  canonicalOnly?: boolean;
  take?: number;
};

export async function loadMainnetStakingPositions(
  prisma: PrismaClient,
  options: LoadMainnetStakingPositionsOptions = {},
): Promise<DerivedMainnetStakingPosition[]> {
  const asOf = options.asOf ?? new Date();
  const requireCompleteLedger = options.requireCompleteLedger === true;
  const reconcileCanonicalCurrent =
    options.reconcileCanonicalCurrent === true;
  const canonicalOnly = options.canonicalOnly === true;
  const publicCurrentMode =
    !requireCompleteLedger && !reconcileCanonicalCurrent && !canonicalOnly;

  if (reconcileCanonicalCurrent && !requireCompleteLedger) {
    throw new Error(
      "Canonical staking reconciliation requires the complete event ledger.",
    );
  }
  if (
    reconcileCanonicalCurrent &&
    Math.abs(Date.now() - asOf.getTime()) > 60_000
  ) {
    throw new Error(
      "Canonical staking positions can only reconcile a current ledger snapshot.",
    );
  }
  if (
    publicCurrentMode &&
    options.asOf &&
    Math.abs(Date.now() - asOf.getTime()) > 60_000
  ) {
    throw new Error(
      "Historical staking snapshots require the complete confirmed-event ledger.",
    );
  }

  const needsEventLedger = requireCompleteLedger || reconcileCanonicalCurrent;
  const stakingWalletAddress = normalizeAddress(
    getWoloStakingRuntime().stakingWalletAddress,
  );
  if (needsEventLedger && !stakingWalletAddress) {
    throw new Error(
      "The staking wallet is not configured; tx-backed staking truth is unavailable.",
    );
  }

  const mainnetStartAt = getWoloMainnetDisplayStartAt();
  const weightStartAt = options.weightStartAt ?? mainnetStartAt;
  const pageSize = Math.max(1, Math.min(options.take ?? 5_000, 10_000));

  const [events, canonicalPositions] = await Promise.all([
    needsEventLedger
      ? collectCursorPages(pageSize, (cursorId) =>
          prisma.stakingEvent.findMany({
            where: {
              status: "CONFIRMED",
              type: { in: ["STAKE", "UNSTAKE", "COMPOUND"] },
              amountWolo: { gt: 0 },
              txHash: { not: null },
              OR: [
                {
                  confirmedAt: {
                    gte: mainnetStartAt,
                    lte: asOf,
                  },
                },
                {
                  confirmedAt: null,
                  createdAt: {
                    gte: mainnetStartAt,
                    lte: asOf,
                  },
                },
              ],
            },
            orderBy: { id: "asc" },
            take: pageSize,
            ...(cursorId === null
              ? {}
              : { cursor: { id: cursorId }, skip: 1 }),
            select: {
              id: true,
              type: true,
              amountWolo: true,
              txHash: true,
              walletAddress: true,
              createdAt: true,
              confirmedAt: true,
              userId: true,
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                  walletAddress: true,
                },
              },
            },
          }),
        )
      : Promise.resolve([]),
    requireCompleteLedger && !reconcileCanonicalCurrent
      ? Promise.resolve([])
      : prisma.stakingPosition.findMany({
          where: {
            status: "active",
            OR: [
              { currentStakedWolo: { gt: 0 } },
              { compoundedRewardsWolo: { gt: 0 } },
            ],
          },
          select: {
            userId: true,
            walletAddress: true,
            currentStakedWolo: true,
            compoundedRewardsWolo: true,
            accumulatedWeight: true,
            lastWeightUpdateAt: true,
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

  // Confirmed STAKE/UNSTAKE events are admitted after their wolo-1 transaction
  // is verified; COMPOUND events come from finalized reward allocations. This
  // logical event ledger spans both current and retired custody wallets. Raw
  // indexed sends remain transfer-audit input and cannot change staking
  // liability, reward weight, max-unstake, or public current stake.
  const eventTransfers: MainnetStakingTransferInput[] = events.map((event) => {
    const walletAddress = normalizeAddress(
      event.walletAddress || event.user.walletAddress,
    );
    const isStake = event.type === "STAKE" || event.type === "COMPOUND";
    const player = displayUserName(event.user);

    return {
      txHash: event.txHash || `staking-event-${event.id}`,
      timestamp: event.confirmedAt || event.createdAt,
      senderAddress: isStake ? walletAddress : stakingWalletAddress,
      recipientAddress: isStake ? stakingWalletAddress : walletAddress,
      amountWolo: event.amountWolo,
      senderUserId: isStake ? event.userId : null,
      senderLabel: isStake ? player : null,
      recipientUserId: isStake ? null : event.userId,
      recipientLabel: isStake ? null : player,
    };
  });

  const derivedPositions = deriveMainnetStakingPositionsFromTransfers(
    eventTransfers,
    {
      stakingWalletAddress,
      mainnetStartAt,
      asOf,
      weightStartAt,
      rewardWeightCapWolo: options.rewardWeightCapWolo,
    },
  );
  const positionsByUserId = new Map(
    derivedPositions.map((position) => [position.userId, position]),
  );

  for (const canonical of canonicalPositions) {
    const canonicalSeatStake = resolvePublicCurrentStakedWolo(canonical);
    const existing = positionsByUserId.get(canonical.userId);
    const existingStake = Math.max(0, existing?.currentStakedWolo || 0);

    if (reconcileCanonicalCurrent) {
      if (existingStake !== canonicalSeatStake) {
        throw new Error(
          `Staking event-ledger reconciliation failed for user ${canonical.userId}: derived=${existingStake}, canonical=${canonicalSeatStake}.`,
        );
      }
      continue;
    }
    if (canonicalSeatStake <= 0) continue;

    const player = displayUserName(canonical.user);
    const walletAddress = normalizeAddress(
      canonical.walletAddress || existing?.walletAddress,
    );
    positionsByUserId.set(canonical.userId, {
      ...(existing || {
        userId: canonical.userId,
        player,
        walletAddress,
        currentStakedWolo: 0,
        totalStakedWolo: 0,
        totalUnstakedWolo: 0,
        stakingWeight: "0",
        firstStakedAt: canonical.lastWeightUpdateAt,
        lastTxAt: canonical.lastWeightUpdateAt,
        txHashes: [],
      }),
      player,
      walletAddress: walletAddress || existing?.walletAddress || null,
      currentStakedWolo: canonicalSeatStake,
      totalStakedWolo: Math.max(
        existing?.totalStakedWolo || 0,
        canonicalSeatStake,
      ),
      stakingWeight: computeCanonicalStakingWeight(
        {
          accumulatedWeight: canonical.accumulatedWeight,
          currentStakedWolo: canonicalSeatStake,
          lastWeightUpdateAt: canonical.lastWeightUpdateAt,
        },
        asOf,
        {
          weightStartAt: options.weightStartAt,
          rewardWeightCapWolo: options.rewardWeightCapWolo,
        },
      ),
    });
  }

  if (reconcileCanonicalCurrent) {
    const canonicalUserIds = new Set(
      canonicalPositions.map((position) => position.userId),
    );
    const unmatchedDerived = derivedPositions.find(
      (position) =>
        position.currentStakedWolo > 0 &&
        !canonicalUserIds.has(position.userId),
    );
    if (unmatchedDerived) {
      throw new Error(
        `Staking event-ledger reconciliation failed for user ${unmatchedDerived.userId}: derived=${unmatchedDerived.currentStakedWolo}, canonical=0.`,
      );
    }
  }

  if (publicCurrentMode || canonicalOnly) {
    const canonicalUserIds = new Set(
      canonicalPositions.map((position) => position.userId),
    );
    for (const userId of positionsByUserId.keys()) {
      if (!canonicalUserIds.has(userId)) positionsByUserId.delete(userId);
    }
  }

  return Array.from(positionsByUserId.values()).filter(
    (position) =>
      position.currentStakedWolo > 0 || position.totalStakedWolo > 0,
  );
}

export async function loadMainnetStakingPositionForUser(
  prisma: PrismaClient,
  userId: number,
  options: LoadMainnetStakingPositionsOptions = {},
) {
  const positions = await loadMainnetStakingPositions(prisma, options);
  return positions.find((position) => position.userId === userId) ?? null;
}
