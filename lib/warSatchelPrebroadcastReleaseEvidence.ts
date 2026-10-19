import { satchelReserveDebitIssue } from "./warSatchelReserveDebitEvidence.ts";

/**
 * Deterministic, side-effect-free check of the on-disk no-send record.
 * This is NOT proof supplied by a bank, reviewer, signer or blockchain.
 * The caller must load every record inside its exclusive serializable vault
 * transaction and still require separately attested no-broadcast evidence.
 */
export type PrebroadcastReleaseEvidence = Readonly<{
  reservation: Readonly<{
    id: string; executionId: number; ticketRequestId: string;
    amountUwolo: bigint; txHash: string | null; ticketId: number | null;
  }>;
  ownerUserId: number;
  reserveJournal: null | Readonly<{
    sourceKey: string; ownerUserId: number; executionId: number | null;
    eventKind: string; amountUwolo: bigint;
    deltaAvailableUwolo: bigint; deltaReservedUwolo: bigint;
    deltaCommittedUwolo: bigint; deltaWithdrawalPendingUwolo: bigint;
    receiptId: bigint | null; claimReturnId: bigint | null;
  }>;
  execution: null | Readonly<{
    reservationId: string | null; ticketId: number | null;
    status: string; attemptCount: number;
  }>;
  authority: null | Readonly<{
    reservationId: string; ownerUserId: number;
    broadcast: null | object;
  }>;
  ticket: null | Readonly<{
    status: string; stakeTxHash: string | null;
    broadcastSubmittedAt: Date | null;
  }>;
}>;

export function prebroadcastReleaseEvidenceIssue(e: PrebroadcastReleaseEvidence): string | null {
  const x = e.execution, r = e.reservation;
  if (!x || x.reservationId !== r.id || x.status !== "funded_reserved" ||
      x.attemptCount !== 1 || x.ticketId !== null ||
      r.txHash !== null || r.ticketId !== null) {
    return "no_broadcast_execution_evidence_inconsistent";
  }
  // Returning principal is only legitimate when the ORIGINAL immutable
  // wager_reserve journal proves this owner first lost exactly that amount.
  // A syntactically reserved row is not, by itself, a financial debit.
  if (satchelReserveDebitIssue({
    id: r.id, ownerUserId: e.ownerUserId,
    executionId: r.executionId, amountUwolo: r.amountUwolo,
  }, e.reserveJournal)) {
    return "no_broadcast_original_debit_missing_or_inconsistent";
  }
  const a = e.authority;
  if (a && (a.reservationId !== r.id || a.ownerUserId !== e.ownerUserId ||
      a.broadcast !== null)) {
    return "no_broadcast_wager_authority_inconsistent";
  }
  const t = e.ticket;
  if (t && (t.status !== "awaiting_signature" ||
      t.stakeTxHash !== null || t.broadcastSubmittedAt !== null)) {
    return "no_broadcast_canonical_ticket_inconsistent";
  }
  return null;
}
