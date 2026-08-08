import type { PrismaClient } from "@/lib/generated/prisma";
import {
  deriveMainnetStakingPositionsFromTransfers,
  type DerivedMainnetStakingPosition,
  type MainnetStakingTransferInput,
} from "@/lib/mainnetStakingDerivation";
import {
  WOLO_INDEXED_TRANSFER_SOURCE,
  WOLO_MAINNET_BASE_DENOM,
  WOLO_MAINNET_CHAIN_ID,
  buildWoloAddressBook,
} from "@/lib/woloMainnetTransfers";
import {
  WOLO_STAKING_RESERVE_OPERATOR_ADDRESSES,
} from "@/lib/woloMainnetNetworkAccounts";
import { getWoloMainnetDisplayStartAt } from "@/lib/woloChain";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";
import { cappedRewardPrincipalWolo } from "@/lib/stakingRewardCap";
import { collectCursorPages } from "@/lib/collectCursorPages";

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function amountToNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function displayUserName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName?.trim() || user.steamPersonaName?.trim() || user.uid;
}


function computeCanonicalStakingWeight(position: {
  accumulatedWeight: bigint;
  currentStakedWolo: number;
  lastWeightUpdateAt: Date;
}, asOf: Date, options: {
  weightStartAt?: Date;
  rewardWeightCapWolo?: number;
} = {}) {
  const startAt = new Date(
    Math.max(
      position.lastWeightUpdateAt.getTime(),
      options.weightStartAt?.getTime() ?? position.lastWeightUpdateAt.getTime(),
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
  take?: number;
};

export async function loadMainnetStakingPositions(
  prisma: PrismaClient,
  options: LoadMainnetStakingPositionsOptions = {}
): Promise<DerivedMainnetStakingPosition[]> {
  const stakingWalletAddress = normalizeAddress(getWoloStakingRuntime().stakingWalletAddress);
  if (!stakingWalletAddress) return [];

  const asOf = options.asOf ?? new Date();
  const mainnetStartAt = getWoloMainnetDisplayStartAt();
  const weightStartAt = options.weightStartAt ?? mainnetStartAt;
  const pageSize = Math.max(1, Math.min(options.take ?? 5_000, 10_000));
  const [addressBook, rows, events, canonicalPositions] = await Promise.all([
    buildWoloAddressBook(prisma),
    collectCursorPages(pageSize, (cursorId) =>
      prisma.woloIndexedTransfer.findMany({
        where: {
          chainId: WOLO_MAINNET_CHAIN_ID,
          denom: WOLO_MAINNET_BASE_DENOM,
          source: WOLO_INDEXED_TRANSFER_SOURCE,
          timestamp: {
            gte: mainnetStartAt,
            lte: asOf,
          },
          OR: [
            { senderAddress: stakingWalletAddress },
            { recipientAddress: stakingWalletAddress },
          ],
        },
        orderBy: { id: "asc" },
        take: pageSize,
        ...(cursorId === null ? {} : { cursor: { id: cursorId }, skip: 1 }),
      }),
    ),
    collectCursorPages(pageSize, (cursorId) =>
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
        ...(cursorId === null ? {} : { cursor: { id: cursorId }, skip: 1 }),
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
    ),
    prisma.stakingPosition.findMany({
      where: {
        status: "active",
        currentStakedWolo: { gt: 0 },
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

  const indexedTransfers: MainnetStakingTransferInput[] = rows.map((row) => {
    const senderAddress = normalizeAddress(row.senderAddress);
    const recipientAddress = normalizeAddress(row.recipientAddress);
    const sender = addressBook.get(senderAddress);
    const recipient = addressBook.get(recipientAddress);

    return {
      txHash: row.txHash,
      timestamp: row.timestamp,
      senderAddress,
      recipientAddress,
      amountWolo: amountToNumber(row.amountWoloDisplay),
      senderUserId: sender?.userId ?? null,
      senderLabel: sender?.label ?? null,
      recipientUserId: recipient?.userId ?? null,
      recipientLabel: recipient?.label ?? null,
      memo: row.memo,
      eventType: row.eventType,
    };
  });
  const eventTransfers: MainnetStakingTransferInput[] = events.map((event) => {
    const walletAddress = normalizeAddress(event.walletAddress || event.user.walletAddress);
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

  const derivedPositions = deriveMainnetStakingPositionsFromTransfers([...indexedTransfers, ...eventTransfers], {
    stakingWalletAddress,
    mainnetStartAt,
    asOf,
    weightStartAt,
    rewardWeightCapWolo: options.rewardWeightCapWolo,
    operationalReserveSourceAddresses:
      WOLO_STAKING_RESERVE_OPERATOR_ADDRESSES,
  });

  const positionsByUserId = new Map(
    derivedPositions.map((position) => [position.userId, position])
  );

  for (const canonical of canonicalPositions) {
    const canonicalBaseStake = Math.max(0, canonical.currentStakedWolo || 0);
    const canonicalCompoundedStake = Math.max(0, canonical.compoundedRewardsWolo || 0);
    const canonicalSeatStake = canonicalBaseStake + canonicalCompoundedStake;

    const existing = positionsByUserId.get(canonical.userId);
    const existingStake = Math.max(0, existing?.currentStakedWolo || 0);
    if (options.requireCompleteLedger) {
      if (!existing || existingStake !== canonicalSeatStake) {
        throw new Error(
          `Staking ledger reconciliation failed for user ${canonical.userId}: derived=${existingStake}, canonical=${canonicalSeatStake}.`,
        );
      }
      continue;
    }
    const publicSeatStake = Math.max(existingStake, canonicalSeatStake);
    if (publicSeatStake <= 0) continue;

    const player = displayUserName(canonical.user);
    const walletAddress = normalizeAddress(
      canonical.walletAddress || existing?.walletAddress
    );
    const canonicalWeightInput = {
      accumulatedWeight: canonical.accumulatedWeight,
      currentStakedWolo: publicSeatStake,
      lastWeightUpdateAt: canonical.lastWeightUpdateAt,
    };

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
      player: existing?.player || player,
      walletAddress: walletAddress || existing?.walletAddress || null,
      currentStakedWolo: publicSeatStake,
      totalStakedWolo: Math.max(existing?.totalStakedWolo || 0, publicSeatStake),
      stakingWeight:
        existing?.stakingWeight ||
        computeCanonicalStakingWeight(canonicalWeightInput, asOf, {
          weightStartAt: options.weightStartAt,
          rewardWeightCapWolo: options.rewardWeightCapWolo,
        }),
    });
  }

  return Array.from(positionsByUserId.values()).filter(
    (position) => position.currentStakedWolo > 0 || position.totalStakedWolo > 0
  );
}

export async function loadMainnetStakingPositionForUser(
  prisma: PrismaClient,
  userId: number,
  options: LoadMainnetStakingPositionsOptions = {}
) {
  const positions = await loadMainnetStakingPositions(prisma, options);
  return positions.find((position) => position.userId === userId) ?? null;
}
