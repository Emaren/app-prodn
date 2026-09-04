const NON_EARNING_CLAIM_KINDS = new Set([
  "bet_payout",
  "bet_refund",
  "bet_corrective_refund",
]);

export function warChestClaimCountsAsTake(
  claimKind: string | null | undefined,
) {
  const normalized = String(claimKind ?? "")
    .trim()
    .toLowerCase();

  return (
    Boolean(normalized) &&
    !NON_EARNING_CLAIM_KINDS.has(normalized)
  );
}

/**
 * War Chest Take is economic gain.
 *
 * The bettor's own principal returning inside a payout
 * is not earnings.
 */
export function warChestWagerTakeWolo(input: {
  status: string | null | undefined;
  amountWolo: number | null | undefined;
  payoutWolo: number | null | undefined;
}) {
  if (
    String(input.status ?? "")
      .trim()
      .toLowerCase() !== "won"
  ) {
    return 0;
  }

  const stake = Math.max(
    0,
    Number(input.amountWolo ?? 0) || 0,
  );

  const payout = Math.max(
    0,
    Number(input.payoutWolo ?? 0) || 0,
  );

  return Math.max(
    payout - stake,
    0,
  );
}
