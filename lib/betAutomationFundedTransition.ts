/**
 * HD Mecha C5 single-execution transition coordinator.
 *
 * Deliberately not wired to a route, cron, Watcher, CLI, wallet or signer.
 * A separately reviewed adapter MUST implement the actual atomic DB ledger
 * reservation, re-evaluate trusted owner/market/consent/chain evidence, and
 * use a durable one-shot transfer ID before this coordinator may be activated.
 *
 * The STOP-ON-UNKNOWN path is essential: a failed HTTP response does NOT
 * prove that a WOLO payment was not broadcast. Never blindly retry, refund
 * or release an unknown in-flight transfer.
 */
export type FundedAutoReservedClaim = Readonly<{
  kind: "atomically_reserved";
  executionId: number;
  reservationId: string;
  ownerUid: string;
  gameIdentityKey: string;
  ticketRequestId: string;
  reserveUwolo: string;
}>;

export type FundedAutoClaimResult =
  | FundedAutoReservedClaim
  | Readonly<{ kind: "ineligible" | "already_handled" }>;

export type FundedAutoTicketOutcome =
  | Readonly<{ kind: "accepted"; ticketId: number; fundingTxHash: string }>
  | Readonly<{ kind: "rejected_before_broadcast"; reason: string }>
  | Readonly<{ kind: "unknown_after_broadcast"; reason: string }>;

export type FundedAutoTicketPorts = {
  /** Check the complete original admission under DB locks; reserve exactly once. */
  claimAndReserve(executionId: number): Promise<FundedAutoClaimResult>;
  /** Exactly one payment submission tied to stored ticketRequestId. */
  submitReservedTicket(claim: FundedAutoReservedClaim): Promise<FundedAutoTicketOutcome>;
  /** Move reserved→committed and decrement finite plan only after accepted proof. */
  commitAccepted(
    claim: FundedAutoReservedClaim,
    accepted: Extract<FundedAutoTicketOutcome, { kind: "accepted" }>,
  ): Promise<void>;
  /** Safe only for independently proven pre-broadcast refusal. Return 100%. */
  releaseUnbroadcast(
    claim: FundedAutoReservedClaim,
    reason: string,
  ): Promise<void>;
  /** Persist durable non-retry hold. No release, fee or second submission. */
  holdUnknown(
    claim: FundedAutoReservedClaim,
    reason: string,
  ): Promise<void>;
};

export type FundedAutoWorkerCounts = Readonly<{
  examined: number;
  claimed: number;
  accepted: number;
  rejectedBeforeBroadcast: number;
  unknownHeld: number;
  skipped: number;
}>;

function validClaim(claim: FundedAutoReservedClaim, executionId: number) {
  return claim.executionId === executionId &&
    Number.isSafeInteger(claim.executionId) && claim.executionId > 0 &&
    /^[a-zA-Z0-9_.:/-]{1,128}$/.test(claim.reservationId) &&
    /^[a-zA-Z0-9_.:/-]{1,128}$/.test(claim.ticketRequestId) &&
    claim.ownerUid.trim().length > 0 &&
    claim.gameIdentityKey.trim().length > 0 &&
    /^[1-9][0-9]{0,18}$/.test(claim.reserveUwolo);
}

/**
 * Only consumes an already-known list of exact execution IDs from the
 * future owner-scoped durable queue. No global unbounded scan or timer.
 *
 * Adapter operations must be idempotent and transactionally fenced by DB.
 * An exception after reservation is treated as UNKNOWN, even when a network
 * library claims it happened before a send. Crash recovery is separate.
 */
export async function runFundedMechaTransitionBatch(
  executionIds: readonly number[],
  ports: FundedAutoTicketPorts,
): Promise<FundedAutoWorkerCounts> {
  if (executionIds.length > 25 ||
      new Set(executionIds).size !== executionIds.length ||
      executionIds.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("MECHA_FUNDED_QUEUE_IDS_INVALID");
  }

  let claimed = 0;
  let accepted = 0;
  let rejectedBeforeBroadcast = 0;
  let unknownHeld = 0;
  let skipped = 0;

  for (const executionId of executionIds) {
    // If this fails, no claim was returned; do not speculate about finance.
    const result = await ports.claimAndReserve(executionId);
    if (result.kind !== "atomically_reserved") {
      skipped += 1;
      continue;
    }

    claimed += 1;
    const claim = result;
    if (!validClaim(claim, executionId)) {
      // Even malformed adapter claims could have a reserved DB balance.
      await ports.holdUnknown(claim, "invalid_atomic_reservation_identity");
      unknownHeld += 1;
      continue;
    }

    try {
      const outcome = await ports.submitReservedTicket(claim);
      if (outcome.kind === "accepted") {
        if (!Number.isSafeInteger(outcome.ticketId) || outcome.ticketId <= 0 ||
            !/^[0-9A-Fa-f]{64}$/.test(outcome.fundingTxHash)) {
          await ports.holdUnknown(claim, "invalid_accepted_ticket_proof");
          unknownHeld += 1;
          continue;
        }
        try {
          await ports.commitAccepted(claim, outcome);
          accepted += 1;
        } catch {
          // Tx may be committed despite transport error. Do not broadcast again.
          await ports.holdUnknown(claim, "commit_receipt_unknown");
          unknownHeld += 1;
        }
      } else if (outcome.kind === "rejected_before_broadcast") {
        await ports.releaseUnbroadcast(claim, outcome.reason);
        rejectedBeforeBroadcast += 1;
      } else if (outcome.kind === "unknown_after_broadcast") {
        await ports.holdUnknown(claim, outcome.reason);
        unknownHeld += 1;
      } else {
        // Runtime defensive branch for a malformed/old implementation.
        await ports.holdUnknown(claim, "unrecognized_ticket_response");
        unknownHeld += 1;
      }
    } catch {
      await ports.holdUnknown(claim, "transport_or_execution_unknown");
      unknownHeld += 1;
    }
  }

  return Object.freeze({
    examined: executionIds.length,
    claimed,
    accepted,
    rejectedBeforeBroadcast,
    unknownHeld,
    skipped,
  });
}
