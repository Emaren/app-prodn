export type ResolvedWagerSide = "left" | "right";

export type ResolvedMarketSettlementIntent =
  | { kind: "payout"; winningSide: ResolvedWagerSide }
  | { kind: "refund"; winningSide: null }
  | { kind: "blocked"; winningSide: null };

/**
 * Market terminal state, not a leftover winner column, decides whether money
 * is paid or returned. A void is always an exact-stake refund and does not
 * require final replay proof; a settled payout must carry a concrete side.
 */
export function classifyResolvedMarketSettlement(input: {
  status: string;
  winnerSide: string | null;
}): ResolvedMarketSettlementIntent {
  if (input.status === "voided") {
    return { kind: "refund", winningSide: null };
  }
  if (
    input.status === "settled" &&
    (input.winnerSide === "left" || input.winnerSide === "right")
  ) {
    return { kind: "payout", winningSide: input.winnerSide };
  }
  return { kind: "blocked", winningSide: null };
}

export type ResolvedWagerInput = {
  id: number;
  side: ResolvedWagerSide | string;
  amountWolo: number;
};

export type ResolvedWagerOutcome = {
  id: number;
  status: "won" | "lost" | "void";
  payoutWolo: number;
  bettingFeeWolo: number;
};

export type ResolvedWagerSettlementPlan = {
  unbackedDesyncWinningSide: boolean;
  winningUserPool: number;
  losingSidePool: number;
  settledUserPool: number;
  bettingFeePoolWolo: number;
  outcomes: ResolvedWagerOutcome[];
};

function allocateFeeByWagerId(
  wagers: Array<{ id: number; amountWolo: number }>,
  totalFeeWolo: number
) {
  const feeByWagerId = new Map<number, number>();
  const totalWinningStake = wagers.reduce(
    (sum, wager) => sum + wager.amountWolo,
    0
  );

  if (totalFeeWolo <= 0 || totalWinningStake <= 0) {
    return feeByWagerId;
  }

  const allocations = wagers.map((wager) => {
    const exact = (totalFeeWolo * wager.amountWolo) / totalWinningStake;
    const base = Math.floor(exact);
    return {
      id: wager.id,
      amountWolo: wager.amountWolo,
      feeWolo: base,
      remainder: exact - base,
    };
  });

  let remaining = Math.max(
    0,
    totalFeeWolo - allocations.reduce((sum, row) => sum + row.feeWolo, 0)
  );

  allocations
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      if (right.amountWolo !== left.amountWolo) return right.amountWolo - left.amountWolo;
      return left.id - right.id;
    })
    .forEach((allocation) => {
      if (remaining <= 0) return;
      allocation.feeWolo += 1;
      remaining -= 1;
    });

  for (const allocation of allocations) {
    feeByWagerId.set(allocation.id, allocation.feeWolo);
  }

  return feeByWagerId;
}

/**
 * Pure payout plan used after proposition truth has passed its financial gate.
 * A resolved YES/NO market behaves like a real two-sided proposition: backed
 * winners win and opposing backers lose. A factual side with no backer does
 * not turn the opposing side into a refund: those wagers are resolved losses.
 * Exact-stake refunds are reserved for a proposition with no provable winner.
 */
export function planResolvedWagerSettlements(input: {
  winningSide: ResolvedWagerSide | null;
  marketType: string;
  desyncMarketType: string;
  seedLeftWolo: number;
  seedRightWolo: number;
  wagers: ResolvedWagerInput[];
  feeRateBps: number;
  feeDenominator: number;
}): ResolvedWagerSettlementPlan {
  const winningUserPool = input.winningSide
    ? input.wagers
        .filter((wager) => wager.side === input.winningSide)
        .reduce((sum, wager) => sum + wager.amountWolo, 0)
    : 0;
  const unbackedDesyncWinningSide =
    Boolean(input.winningSide) &&
    input.marketType === input.desyncMarketType &&
    winningUserPool === 0 &&
    input.wagers.length > 0;
  const losingSidePool =
    input.winningSide === "left"
      ? input.seedRightWolo +
        input.wagers
          .filter((wager) => wager.side === "right")
          .reduce((sum, wager) => sum + wager.amountWolo, 0)
      : input.winningSide === "right"
        ? input.seedLeftWolo +
          input.wagers
            .filter((wager) => wager.side === "left")
            .reduce((sum, wager) => sum + wager.amountWolo, 0)
        : 0;
  const settledUserPool = input.wagers.reduce(
    (sum, wager) => sum + wager.amountWolo,
    0
  );
  const bettingFeePoolWolo =
    input.winningSide &&
    settledUserPool > 0 &&
    !unbackedDesyncWinningSide
      ? Math.round(
          (settledUserPool * input.feeRateBps) /
            Math.max(1, input.feeDenominator)
        )
      : 0;
  const feeByWinningWagerId = allocateFeeByWagerId(
    input.winningSide
      ? input.wagers.filter((wager) => wager.side === input.winningSide)
      : [],
    bettingFeePoolWolo
  );

  const outcomes = input.wagers.map((wager): ResolvedWagerOutcome => {
    if (!input.winningSide) {
      return {
        id: wager.id,
        status: "void",
        payoutWolo: wager.amountWolo,
        bettingFeeWolo: 0,
      };
    }

    if (wager.side !== input.winningSide) {
      return {
        id: wager.id,
        status: "lost",
        payoutWolo: 0,
        bettingFeeWolo: 0,
      };
    }

    const bettingFeeWolo = feeByWinningWagerId.get(wager.id) ?? 0;
    const payoutWolo =
      winningUserPool > 0
        ? Math.max(
            0,
            Math.round(
              wager.amountWolo +
                losingSidePool * (wager.amountWolo / winningUserPool)
            ) - bettingFeeWolo
          )
        : wager.amountWolo;

    return {
      id: wager.id,
      status: "won",
      payoutWolo,
      bettingFeeWolo,
    };
  });

  return {
    unbackedDesyncWinningSide,
    winningUserPool,
    losingSidePool,
    settledUserPool,
    bettingFeePoolWolo,
    outcomes,
  };
}
