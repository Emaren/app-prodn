import {
  classifyStakingWalletInboundTransfer,
} from "./stakingTransferClassification.ts";

export type MainnetStakingTransferInput = {
  txHash: string;
  timestamp: Date | string;
  senderAddress: string;
  recipientAddress: string;
  amountWolo: number;
  senderUserId?: number | null;
  senderLabel?: string | null;
  recipientUserId?: number | null;
  recipientLabel?: string | null;
  memo?: string | null;
  eventType?: string | null;
};

export type DerivedMainnetStakingPosition = {
  userId: number;
  player: string;
  walletAddress: string | null;
  currentStakedWolo: number;
  totalStakedWolo: number;
  totalUnstakedWolo: number;
  stakingWeight: string;
  firstStakedAt: Date | null;
  lastTxAt: Date | null;
  txHashes: string[];
};

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function parseTimestamp(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addWeight(
  currentWeight: bigint,
  currentStakeWolo: number,
  from: Date | null,
  to: Date,
  weightStartAt?: Date
) {
  if (!from) return currentWeight;

  const startMs = Math.max(from.getTime(), weightStartAt?.getTime() ?? from.getTime());
  const seconds = Math.max(0, Math.floor((to.getTime() - startMs) / 1000));

  return currentWeight + BigInt(Math.max(0, Math.trunc(currentStakeWolo))) * BigInt(seconds);
}

function transferResolutionScore(transfer: MainnetStakingTransferInput) {
  let score = 0;
  if (transfer.senderUserId) score += 4;
  if (transfer.recipientUserId) score += 4;
  if (transfer.senderLabel?.trim()) score += 1;
  if (transfer.recipientLabel?.trim()) score += 1;
  if (transfer.memo?.trim()) score += 2;
  if (transfer.eventType?.trim()) score += 1;
  return score;
}

function mergeTransferResolution(
  left: MainnetStakingTransferInput,
  right: MainnetStakingTransferInput
) {
  const preferred =
    transferResolutionScore(right) > transferResolutionScore(left) ? right : left;
  const fallback = preferred === right ? left : right;
  return {
    ...preferred,
    memo: preferred.memo?.trim() || fallback.memo?.trim() || null,
    eventType:
      preferred.eventType?.trim() || fallback.eventType?.trim() || null,
  } satisfies MainnetStakingTransferInput;
}

export function deriveMainnetStakingPositionsFromTransfers(
  transfers: MainnetStakingTransferInput[],
  options: {
    stakingWalletAddress: string;
    mainnetStartAt: Date | string;
    asOf?: Date | string;
    weightStartAt?: Date | string;
    operationalReserveSourceAddresses?: readonly string[];
  }
): DerivedMainnetStakingPosition[] {
  const stakingWalletAddress = normalizeAddress(options.stakingWalletAddress);
  const mainnetStartAt = parseTimestamp(options.mainnetStartAt) || new Date(0);
  const asOf = parseTimestamp(options.asOf ?? new Date()) || new Date();
  const parsedWeightStartAt = parseTimestamp(options.weightStartAt ?? mainnetStartAt) || mainnetStartAt;
  const weightStartAt =
    parsedWeightStartAt.getTime() < mainnetStartAt.getTime() ? mainnetStartAt : parsedWeightStartAt;
  if (!stakingWalletAddress) return [];

  type MutablePosition = DerivedMainnetStakingPosition & {
    _weight: bigint;
    _lastWeightAt: Date | null;
  };

  const positions = new Map<number, MutablePosition>();
  const visibleTransfers = [...transfers]
    .map((transfer) => ({ transfer, timestamp: parseTimestamp(transfer.timestamp) }))
    .filter(
      (item): item is { transfer: MainnetStakingTransferInput; timestamp: Date } => {
        if (!item.timestamp) return false;
        return (
          item.timestamp.getTime() >= mainnetStartAt.getTime() &&
          item.timestamp.getTime() <= asOf.getTime()
        );
      }
    );
  const transfersByTxHash = new Map<string, { transfer: MainnetStakingTransferInput; timestamp: Date }>();
  const unhashedTransfers: Array<{ transfer: MainnetStakingTransferInput; timestamp: Date }> = [];

  for (const item of visibleTransfers) {
    const txKey = item.transfer.txHash.trim().toUpperCase();
    if (!txKey) {
      unhashedTransfers.push(item);
      continue;
    }
    const existing = transfersByTxHash.get(txKey);
    if (!existing) {
      transfersByTxHash.set(txKey, item);
    } else {
      transfersByTxHash.set(txKey, {
        transfer: mergeTransferResolution(existing.transfer, item.transfer),
        timestamp:
          item.timestamp.getTime() < existing.timestamp.getTime()
            ? item.timestamp
            : existing.timestamp,
      });
    }
  }

  const sortedTransfers = [...transfersByTxHash.values(), ...unhashedTransfers].sort(
    (left, right) => left.timestamp.getTime() - right.timestamp.getTime()
  );

  for (const { transfer, timestamp } of sortedTransfers) {
    const senderAddress = normalizeAddress(transfer.senderAddress);
    const recipientAddress = normalizeAddress(transfer.recipientAddress);
    const amountWolo = Number.isFinite(transfer.amountWolo) ? transfer.amountWolo : 0;
    if (amountWolo <= 0) continue;

    const classification = classifyStakingWalletInboundTransfer({
      memo: transfer.memo,
      senderAddress,
      recipientAddress,
      stakingWalletAddress,
      operationalSourceAddresses:
        options.operationalReserveSourceAddresses,
    });
    const isStake =
      recipientAddress === stakingWalletAddress &&
      Boolean(transfer.senderUserId) &&
      classification !== "operational_reserve";
    const isUnstake = senderAddress === stakingWalletAddress && transfer.recipientUserId;
    if (!isStake && !isUnstake) continue;

    const userId = Number(isStake ? transfer.senderUserId : transfer.recipientUserId);
    if (!Number.isInteger(userId) || userId <= 0) continue;

    const walletAddress = isStake ? senderAddress : recipientAddress;
    const player =
      (isStake ? transfer.senderLabel : transfer.recipientLabel)?.trim() || `user ${userId}`;

    const existing =
      positions.get(userId) ||
      ({
        userId,
        player,
        walletAddress,
        currentStakedWolo: 0,
        totalStakedWolo: 0,
        totalUnstakedWolo: 0,
        stakingWeight: "0",
        firstStakedAt: null,
        lastTxAt: null,
        txHashes: [],
        _weight: BigInt(0),
        _lastWeightAt: null,
      } satisfies MutablePosition);

    existing._weight = addWeight(
        existing._weight,
        existing.currentStakedWolo,
        existing._lastWeightAt,
        timestamp,
        weightStartAt
      );
    existing._lastWeightAt = timestamp;
    existing.lastTxAt = timestamp;
    existing.player = player;
    existing.walletAddress = walletAddress || existing.walletAddress;
    existing.txHashes.push(transfer.txHash);

    if (isStake) {
      existing.currentStakedWolo += amountWolo;
      existing.totalStakedWolo += amountWolo;
      existing.firstStakedAt ||= timestamp;
    } else {
      const unstaked = Math.min(existing.currentStakedWolo, amountWolo);
      existing.currentStakedWolo = Math.max(0, existing.currentStakedWolo - amountWolo);
      existing.totalUnstakedWolo += unstaked;
    }

    positions.set(userId, existing);
  }

  return Array.from(positions.values())
    .map((position) => {
      const finalWeight = addWeight(
          position._weight,
          position.currentStakedWolo,
          position._lastWeightAt,
          asOf,
          weightStartAt
        );
      return {
        userId: position.userId,
        player: position.player,
        walletAddress: position.walletAddress,
        currentStakedWolo: position.currentStakedWolo,
        totalStakedWolo: position.totalStakedWolo,
        totalUnstakedWolo: position.totalUnstakedWolo,
        stakingWeight: finalWeight.toString(),
        firstStakedAt: position.firstStakedAt,
        lastTxAt: position.lastTxAt,
        txHashes: Array.from(new Set(position.txHashes)),
      };
    })
    .filter((position) => position.currentStakedWolo > 0 || position.totalStakedWolo > 0);
}
