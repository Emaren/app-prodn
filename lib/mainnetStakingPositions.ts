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
import { getWoloMainnetDisplayStartAt } from "@/lib/woloChain";
import { getWoloStakingRuntime } from "@/lib/woloStakingRuntime";

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function amountToNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export type LoadMainnetStakingPositionsOptions = {
  asOf?: Date;
  take?: number;
};

export async function loadMainnetStakingPositions(
  prisma: PrismaClient,
  options: LoadMainnetStakingPositionsOptions = {}
): Promise<DerivedMainnetStakingPosition[]> {
  const stakingWalletAddress = normalizeAddress(getWoloStakingRuntime().stakingWalletAddress);
  if (!stakingWalletAddress) return [];

  const asOf = options.asOf ?? new Date();
  const [addressBook, rows] = await Promise.all([
    buildWoloAddressBook(prisma),
    prisma.woloIndexedTransfer.findMany({
      where: {
        chainId: WOLO_MAINNET_CHAIN_ID,
        denom: WOLO_MAINNET_BASE_DENOM,
        source: WOLO_INDEXED_TRANSFER_SOURCE,
        timestamp: {
          gte: getWoloMainnetDisplayStartAt(),
          lte: asOf,
        },
        OR: [
          { senderAddress: stakingWalletAddress },
          { recipientAddress: stakingWalletAddress },
        ],
      },
      orderBy: [{ timestamp: "asc" }, { height: "asc" }, { id: "asc" }],
      take: Math.max(1, Math.min(options.take ?? 5_000, 10_000)),
    }),
  ]);

  const transfers: MainnetStakingTransferInput[] = rows.map((row) => {
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
    };
  });

  return deriveMainnetStakingPositionsFromTransfers(transfers, {
    stakingWalletAddress,
    mainnetStartAt: getWoloMainnetDisplayStartAt(),
    asOf,
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
