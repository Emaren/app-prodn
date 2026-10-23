/**
 * Validate the ORIGINAL wager_reserve debit under the existing vault-wide
 * serializable transaction. Pure accounting evidence, NOT independent bank,
 * chain, signer or consensus authority; its callers remain source-HOLD gated.
 */
export type SatchelReserveDebitReservation = Readonly<{
  id: string; ownerUserId: number; executionId: number; amountUwolo: bigint;
}>;
export type SatchelReserveDebitJournal = Readonly<{
  sourceKey: string; ownerUserId: number; executionId: number | null;
  eventKind: string; amountUwolo: bigint;
  deltaAvailableUwolo: bigint; deltaReservedUwolo: bigint;
  deltaCommittedUwolo: bigint; deltaWithdrawalPendingUwolo: bigint;
  receiptId: bigint | null; claimReturnId: bigint | null;
}>;

/** A journal created for a different user or amount can never authorize money. */
export function satchelReserveDebitIssue(
  r: SatchelReserveDebitReservation,
  j: SatchelReserveDebitJournal | null,
): string | null {
  const zero = BigInt(0);
  if (!j || r.amountUwolo <= zero ||
      j.sourceKey !== r.id || j.ownerUserId !== r.ownerUserId ||
      j.executionId !== r.executionId || j.eventKind !== "wager_reserve" ||
      j.amountUwolo !== r.amountUwolo ||
      j.deltaAvailableUwolo !== -r.amountUwolo ||
      j.deltaReservedUwolo !== r.amountUwolo ||
      j.deltaCommittedUwolo !== zero ||
      j.deltaWithdrawalPendingUwolo !== zero ||
      j.receiptId !== null || j.claimReturnId !== null) {
    return "original_reserve_debit_missing_or_inconsistent";
  }
  return null;
}
