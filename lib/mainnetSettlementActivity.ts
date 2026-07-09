export type PendingSettlementClaimInput = {
  id: number;
  sourceMarketId: number | null;
  marketTitle: string | null;
  eventLabel: string | null;
  winnerName: string | null;
  displayPlayerName: string;
  amountWolo: number;
  claimKind: string;
  status: string;
  errorState: string | null;
  payoutTxHash: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  payoutAttemptedAt: Date | string | null;
};

export type PendingSettlementActivityGroup = {
  key: string;
  marketId: number | null;
  marketTitle: string;
  eventLabel: string | null;
  winnerName: string | null;
  amountWolo: number;
  claimCount: number;
  awaitingWalletCount: number;
  failureCount: number;
  paidTxCount: number;
  targetNames: string[];
  awaitingWalletTargetNames: string[];
  latestAt: Date;
};

function dateFrom(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isAwaitingWalletLinkedAccountError(value: string | null | undefined) {
  return /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
    value || ""
  );
}

function fallbackMarketTitle(claim: PendingSettlementClaimInput) {
  const name = claim.displayPlayerName?.trim();
  return name ? `Pending claim for ${name}` : `Claim #${claim.id}`;
}

export function derivePendingSettlementActivityGroups(
  claims: PendingSettlementClaimInput[],
  options: { limit?: number } = {}
): PendingSettlementActivityGroup[] {
  const groups = new Map<string, PendingSettlementActivityGroup>();
  const limit = Math.max(1, Math.min(options.limit ?? 12, 40));

  for (const claim of claims) {
    if (claim.status !== "pending" || claim.amountWolo <= 0) continue;
    if (claim.payoutTxHash?.trim()) continue;

    const latestAt =
      dateFrom(claim.payoutAttemptedAt) ||
      dateFrom(claim.updatedAt) ||
      dateFrom(claim.createdAt) ||
      new Date(0);
    const key =
      typeof claim.sourceMarketId === "number" && claim.sourceMarketId > 0
        ? `settlement-queue-market-${claim.sourceMarketId}`
        : `settlement-queue-claim-${claim.id}`;
    const existing =
      groups.get(key) ||
      ({
        key,
        marketId: claim.sourceMarketId,
        marketTitle: claim.marketTitle?.trim() || fallbackMarketTitle(claim),
        eventLabel: claim.eventLabel,
        winnerName: claim.winnerName,
        amountWolo: 0,
        claimCount: 0,
        awaitingWalletCount: 0,
        failureCount: 0,
        paidTxCount: 0,
        targetNames: [],
        awaitingWalletTargetNames: [],
        latestAt,
      } satisfies PendingSettlementActivityGroup);

    existing.amountWolo += claim.amountWolo;
    existing.claimCount += 1;
    if (claim.payoutTxHash?.trim()) existing.paidTxCount += 1;
    const targetName = claim.displayPlayerName?.trim();
    if (isAwaitingWalletLinkedAccountError(claim.errorState)) {
      existing.awaitingWalletCount += 1;
      if (targetName && !existing.awaitingWalletTargetNames.includes(targetName)) {
        existing.awaitingWalletTargetNames.push(targetName);
      }
    } else if (claim.errorState?.trim()) {
      existing.failureCount += 1;
    }
    if (latestAt.getTime() > existing.latestAt.getTime()) {
      existing.latestAt = latestAt;
    }
    if (targetName && !existing.targetNames.includes(targetName)) {
      existing.targetNames.push(targetName);
    }

    groups.set(key, existing);
  }

  return Array.from(groups.values())
    .sort((left, right) => right.latestAt.getTime() - left.latestAt.getTime())
    .slice(0, limit);
}
