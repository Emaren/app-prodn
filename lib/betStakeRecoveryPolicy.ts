import {
  WINNER_MARKET_TYPE,
} from "@/lib/desyncSideMarket";

export const POST_BROADCAST_RECOVERY_MARKET_STATUSES = [
  "live",
  "closing",
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
 * A transaction initiated near the cutoff may reach chain inclusion
 * shortly afterward. This bounded tolerance does not prove the literal
 * wallet broadcast instant and is not a general live-betting window.
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
  marketType: string;
  marketLinkedSessionKey: string | null;
  marketScheduledMatchId: number | null;
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

  const marketIdentityContextPresent =
    typeof input.marketType ===
      "string" &&
    Object.prototype.hasOwnProperty.call(
      input,
      "marketLinkedSessionKey"
    ) &&
    Object.prototype.hasOwnProperty.call(
      input,
      "marketScheduledMatchId"
    );

  const normalizedMarketType =
    typeof input.marketType ===
      "string"
      ? input.marketType
          .trim()
          .toLowerCase()
      : "";

  const linkedSessionKey =
    typeof input.marketLinkedSessionKey ===
      "string"
      ? input.marketLinkedSessionKey.trim()
      : "";

  const hasScheduledMatch =
    typeof input.marketScheduledMatchId ===
      "number" &&
    Number.isSafeInteger(
      input.marketScheduledMatchId
    ) &&
    input.marketScheduledMatchId > 0;

  const recoverableWinnerMarket =
    normalizedMarketType ===
      WINNER_MARKET_TYPE;

  /*
   * Watcher-discovered unscheduled games had already begun before their
   * market existed. They therefore cannot manufacture a recoverable
   * "pre-game" commitment.
   */
  const watcherStartedWithoutPregame =
    Boolean(linkedSessionKey) &&
    !hasScheduledMatch;

  /*
   * Exact fresh-bet admission closes at closeAt.
   *
   * broadcastSubmittedAt is when AoE2WAR learns the transaction hash; the
   * current browser flow receives that hash only after sendTokens() returns,
   * and chain-discovery recovery may learn it later still. It therefore
   * cannot prove the wallet's literal broadcast instant.
   *
   * Recovery instead requires an intent created before closeAt plus verified
   * chain inclusion inside the bounded post-cutoff tolerance below.
   */
  const intentPredatesClose =
    createdAt < closeAt;

  const broadcastFollowsIntent =
    broadcastAt >= createdAt;

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
    marketIdentityContextPresent &&
    recoverableWinnerMarket &&
    !watcherStartedWithoutPregame &&
    intentPredatesClose &&
    broadcastFollowsIntent &&
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
