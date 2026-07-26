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

/*
 * A chain block timestamp may trail the browser broadcast by
 * a few seconds. This is clock and block-production tolerance,
 * not a general late-betting window.
 */
export const POST_BROADCAST_RECOVERY_CHAIN_GRACE_MS =
  30 * 1000;

function readTimestamp(
  value: Date | string | null
) {
  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value === "string") {
    return Date.parse(value);
  }

  return Number.NaN;
}

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
  txTimestamp: string | null;
  marketCloseAt: Date | null;
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

  const createdAt =
    readTimestamp(
      input.intentCreatedAt
    );

  const broadcastAt =
    readTimestamp(
      input.broadcastSubmittedAt
    );

  const txAt =
    readTimestamp(
      input.txTimestamp
    );

  const closeAt =
    readTimestamp(
      input.marketCloseAt
    );

  const propositionMatches =
    Boolean(
      input.intentPropositionHash &&
      input.marketPropositionHash &&
      input.intentPropositionHash ===
        input.marketPropositionHash
    );

  const intentPredatesClose =
    createdAt <= closeAt;

  const txBelongsToIntentWindow =
    txAt >=
      createdAt -
        POST_BROADCAST_RECOVERY_CHAIN_GRACE_MS;

  const txPredatesClose =
    txAt <=
      closeAt +
        POST_BROADCAST_RECOVERY_CHAIN_GRACE_MS;

  const broadcastFollowsChainProof =
    broadcastAt >=
      txAt -
        POST_BROADCAST_RECOVERY_CHAIN_GRACE_MS;

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
    Number.isFinite(createdAt) &&
    Number.isFinite(broadcastAt) &&
    Number.isFinite(txAt) &&
    Number.isFinite(closeAt) &&
    intentPredatesClose &&
    txBelongsToIntentWindow &&
    txPredatesClose &&
    broadcastFollowsChainProof &&
    input.winnerSide === null &&
    input.settledAt === null &&
    input.voidedAt === null &&
    input.refundStatus === null &&
    input.settlementExecutedAt === null
  );
}
