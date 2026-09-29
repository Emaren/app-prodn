const NON_EARNING_CLAIM_KINDS = new Set([
  "bet_payout",
  "bet_refund",
  "bet_corrective_refund",
  "bet_unmatched_refund",
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

type WarChestWagerAmount = {
  status: string | null | undefined;
  amountWolo: number | null | undefined;
  payoutWolo: number | null | undefined;
};

function normalizedWinningWager(input: WarChestWagerAmount) {
  if (
    String(input.status ?? "")
      .trim()
      .toLowerCase() !== "won"
  ) {
    return null;
  }

  return {
    stake: Math.max(
      0,
      Number(input.amountWolo ?? 0) || 0,
    ),
    payout: Math.max(
      0,
      Number(input.payoutWolo ?? 0) || 0,
    ),
  };
}

/**
 * War Chest Take is gross winning payout cashflow.
 *
 * A real win counts everything that comes home to the winner: returned
 * principal plus profit. Voids, losses and refunds never manufacture Take.
 */
export function warChestWagerTakeWolo(
  input: WarChestWagerAmount,
) {
  return normalizedWinningWager(input)?.payout ?? 0;
}

/**
 * War Chest Earned is economic gain.
 *
 * The bettor's own principal returning inside a winning payout is not earnings.
 */
export function warChestWagerEarnedWolo(
  input: WarChestWagerAmount,
) {
  const winning = normalizedWinningWager(input);
  if (!winning) {
    return 0;
  }

  return Math.max(
    winning.payout - winning.stake,
    0,
  );
}
