export const POST_BROADCAST_RECOVERY_MARKET_STATUSES = [
  "awaiting_final_proof",
  "under_review",
] as const;

export const POST_BROADCAST_RECOVERY_INTENT_STATUSES = [
  "broadcast_submitted",
  "verified_unrecorded",
  "suspect",
  "orphaned",
] as const;

export const POST_BROADCAST_RECOVERY_RESERVATION_MS =
  5 * 60 * 1000;

export const POST_BROADCAST_RECOVERY_BROADCAST_GRACE_MS =
  90 * 1000;

export function isPostBroadcastStakeRecovery(input: {
  intentStatus: string;
  requestedTxHash: string;
  intentTxHash: string | null;
  requestedWalletAddress: string;
  intentWalletAddress: string | null;
  intentPropositionHash: string | null;
  marketPropositionHash: string | null;
  intentCreatedAt: Date;
  broadcastSubmittedAt: Date | null;
  marketBettingLockedAt: Date | null;
  marketStatus: string;
  winnerSide: string | null;
  settledAt: Date | null;
  voidedAt: Date | null;
  refundStatus: string | null;
  settlementExecutedAt: Date | null;
}) {
  const requestedTxHash =
    input.requestedTxHash
      .trim()
      .toUpperCase();

  const intentTxHash =
    (input.intentTxHash || "")
      .trim()
      .toUpperCase();

  const requestedWallet =
    input.requestedWalletAddress.trim();

  const intentWallet =
    (input.intentWalletAddress || "").trim();

  const lockedAt =
    input.marketBettingLockedAt?.getTime() ??
    Number.NaN;

  const createdAt =
    input.intentCreatedAt.getTime();

  const broadcastAt =
    input.broadcastSubmittedAt?.getTime() ??
    Number.NaN;

  const reservationAge =
    lockedAt - createdAt;

  const broadcastDelay =
    broadcastAt - lockedAt;

  const propositionMatches =
    Boolean(
      input.intentPropositionHash &&
      input.marketPropositionHash &&
      input.intentPropositionHash ===
        input.marketPropositionHash
    );

  return (
    POST_BROADCAST_RECOVERY_INTENT_STATUSES.includes(
      input.intentStatus as
        (typeof POST_BROADCAST_RECOVERY_INTENT_STATUSES)[number]
    ) &&
    POST_BROADCAST_RECOVERY_MARKET_STATUSES.includes(
      input.marketStatus as
        (typeof POST_BROADCAST_RECOVERY_MARKET_STATUSES)[number]
    ) &&
    Boolean(requestedTxHash) &&
    requestedTxHash === intentTxHash &&
    Boolean(requestedWallet) &&
    requestedWallet === intentWallet &&
    propositionMatches &&
    Number.isFinite(lockedAt) &&
    Number.isFinite(createdAt) &&
    Number.isFinite(broadcastAt) &&
    reservationAge >= 0 &&
    reservationAge <=
      POST_BROADCAST_RECOVERY_RESERVATION_MS &&
    broadcastDelay <=
      POST_BROADCAST_RECOVERY_BROADCAST_GRACE_MS &&
    input.winnerSide === null &&
    input.settledAt === null &&
    input.voidedAt === null &&
    input.refundStatus === null &&
    input.settlementExecutedAt === null
  );
}
