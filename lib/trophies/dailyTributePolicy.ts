export type DailyTributePayoutCandidate = {
  id: number;
  recipientUserId: number | null;
  recipientWoloAddress: string | null;
  status: string;
  txHash: string | null;
};

export type DailyTributeRecipient = {
  userId: number | null;
  woloAddress: string;
};

export type DailyTributeReconciliation =
  | {
      action: "blocked_by_chain_truth";
      stalePayoutIds: [];
      blockingPayoutId: number;
    }
  | {
      action: "keep_current";
      stalePayoutIds: [];
      currentPayoutId: number;
    }
  | {
      action: "queue_current";
      stalePayoutIds: number[];
    };

function normalizeAddress(value: string | null | undefined) {
  return (value || "").trim().toLowerCase();
}

function sameRecipient(
  payout: DailyTributePayoutCandidate,
  recipient: DailyTributeRecipient
) {
  if (payout.recipientUserId !== null && recipient.userId !== null) {
    return payout.recipientUserId === recipient.userId;
  }

  const payoutAddress = normalizeAddress(payout.recipientWoloAddress);
  const recipientAddress = normalizeAddress(recipient.woloAddress);
  return Boolean(payoutAddress && recipientAddress && payoutAddress === recipientAddress);
}

function hasImmutableChainTruth(payout: DailyTributePayoutCandidate) {
  return payout.status === "paid" || Boolean(payout.txHash?.trim());
}

/**
 * Decide whether today's daily trophy tribute should be queued for the current holder.
 *
 * A paid or tx-backed payout is immutable chain truth and blocks a second payment for
 * the same trophy/day. An existing row for the current holder is also retained,
 * including an operator-cancelled row, so manual cancellation is not silently undone.
 * Unpaid/no-tx rows for a former holder may be superseded before a replacement row is
 * queued for the current holder.
 */
export function reconcileDailyTrophyTribute(
  existing: DailyTributePayoutCandidate[],
  recipient: DailyTributeRecipient
): DailyTributeReconciliation {
  const chainBacked = existing.find(hasImmutableChainTruth);
  if (chainBacked) {
    return {
      action: "blocked_by_chain_truth",
      stalePayoutIds: [],
      blockingPayoutId: chainBacked.id,
    };
  }

  const current = existing.find((payout) => sameRecipient(payout, recipient));
  if (current) {
    return {
      action: "keep_current",
      stalePayoutIds: [],
      currentPayoutId: current.id,
    };
  }

  return {
    action: "queue_current",
    stalePayoutIds: existing.map((payout) => payout.id),
  };
}
