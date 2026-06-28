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

export type LoadMainnetStakingPositionsOptions = {
  asOf?: Date;
  weightStartAt?: Date;
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
  const take = Math.max(1, Math.min(options.take ?? 5_000, 10_000));
  const [addressBook, rows, events] = await Promise.all([
    buildWoloAddressBook(prisma),
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
      orderBy: [{ timestamp: "asc" }, { height: "asc" }, { id: "asc" }],
      take,
    }),
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
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
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

  return deriveMainnetStakingPositionsFromTransfers([...indexedTransfers, ...eventTransfers], {
    stakingWalletAddress,
    mainnetStartAt,
    asOf,
    weightStartAt,
    operationalReserveSourceAddresses:
      WOLO_STAKING_RESERVE_OPERATOR_ADDRESSES,
  });
}

export async function loadMainnetStakingPositionForUser(
  prisma: PrismaClient,
  userId: number,
  options: LoadMainnetStakingPositionsOptions = {}
) {
  const positions = await loadMainnetStakingPositions(prisma, options);
  return positions.find((position) => position.userId === userId) ?? null;
}
