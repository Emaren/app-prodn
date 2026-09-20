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

export type MatchedWagerExposure = {
  id: number;
  side: ResolvedWagerSide;
  amountWolo: number;
  matchedWolo: number;
  unmatchedWolo: number;
};

export type MatchedWagerExposurePlan = {
  leftPoolWolo: number;
  rightPoolWolo: number;
  matchedPerSideWolo: number;
  matchedVolumeWolo: number;
  unmatchedVolumeWolo: number;
  wagers: MatchedWagerExposure[];
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
  matchedPerSideWolo: number;
  matchedVolumeWolo: number;
  unmatchedVolumeWolo: number;
  bettingFeePoolWolo: number;
  exposures: MatchedWagerExposure[];
  outcomes: ResolvedWagerOutcome[];
};

function assertWholeWolo(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative whole-WOLO amount.`);
  }
}

function allocateProRataByWagerId(
  wagers: Array<{ id: number; amountWolo: number }>,
  totalToAllocate: number
) {
  const allocationByWagerId = new Map<number, number>();
  const totalStake = wagers.reduce((sum, wager) => sum + wager.amountWolo, 0);

  if (totalToAllocate <= 0 || totalStake <= 0) {
    for (const wager of wagers) allocationByWagerId.set(wager.id, 0);
    return allocationByWagerId;
  }

  const boundedTotal = Math.min(totalStake, Math.max(0, totalToAllocate));
  const allocations = wagers.map((wager) => {
    const exact = (boundedTotal * wager.amountWolo) / totalStake;
    const base = Math.floor(exact);
    return {
      id: wager.id,
      amountWolo: wager.amountWolo,
      allocatedWolo: base,
      remainder: exact - base,
    };
  });

  let remaining =
    boundedTotal - allocations.reduce((sum, row) => sum + row.allocatedWolo, 0);

  allocations
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      if (right.amountWolo !== left.amountWolo) return right.amountWolo - left.amountWolo;
      return left.id - right.id;
    })
    .forEach((allocation) => {
      if (remaining <= 0) return;
      allocation.allocatedWolo += 1;
      remaining -= 1;
    });

  for (const allocation of allocations) {
    allocationByWagerId.set(allocation.id, allocation.allocatedWolo);
  }

  return allocationByWagerId;
}

export function matchedMarketVolumeWolo(
  leftPoolWolo: number,
  rightPoolWolo: number
) {
  assertWholeWolo(leftPoolWolo, "Left wager pool");
  assertWholeWolo(rightPoolWolo, "Right wager pool");
  return Math.min(leftPoolWolo, rightPoolWolo) * 2;
}

/**
 * #JimsRule matching authority.
 *
 * Only real funded wagers on opposite sides match each other. Seed/display
 * liquidity is deliberately excluded: future house/AI action must enter as a
 * real funded wager if it is to match user principal.
 *
 * Each side receives exactly min(leftPool, rightPool) of matched exposure.
 * Within a side that matched amount is allocated proportionally and rounded
 * deterministically by remainder, stake size, then wager id.
 */
export function planMatchedWagerExposure(
  wagers: ResolvedWagerInput[]
): MatchedWagerExposurePlan {
  const normalized = wagers.map((wager) => {
    if (wager.side !== "left" && wager.side !== "right") {
      throw new Error(`Unsupported wager side for wager #${wager.id}: ${wager.side}`);
    }
    assertWholeWolo(wager.amountWolo, `Wager #${wager.id}`);
    return {
      id: wager.id,
      side: wager.side,
      amountWolo: wager.amountWolo,
    } satisfies {
      id: number;
      side: ResolvedWagerSide;
      amountWolo: number;
    };
  });

  const leftWagers = normalized.filter((wager) => wager.side === "left");
  const rightWagers = normalized.filter((wager) => wager.side === "right");
  const leftPoolWolo = leftWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
  const rightPoolWolo = rightWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
  const matchedVolumeWolo = matchedMarketVolumeWolo(leftPoolWolo, rightPoolWolo);
  const matchedPerSideWolo = matchedVolumeWolo / 2;
  const leftMatched = allocateProRataByWagerId(leftWagers, matchedPerSideWolo);
  const rightMatched = allocateProRataByWagerId(rightWagers, matchedPerSideWolo);

  const planned = normalized.map((wager) => {
    const matchedWolo =
      (wager.side === "left" ? leftMatched : rightMatched).get(wager.id) ?? 0;
    return {
      ...wager,
      matchedWolo,
      unmatchedWolo: wager.amountWolo - matchedWolo,
    };
  });

  const settledUserPool = leftPoolWolo + rightPoolWolo;
  return {
    leftPoolWolo,
    rightPoolWolo,
    matchedPerSideWolo,
    matchedVolumeWolo,
    unmatchedVolumeWolo: settledUserPool - matchedVolumeWolo,
    wagers: planned,
  };
}

/**
 * Pure payout plan used after proposition truth has passed its financial gate.
 *
 * #JimsRule separates proposition truth from money-at-risk truth:
 * - only opposite funded user stake is economically matched;
 * - unmatched principal is always returned exactly and pays no betting fee;
 * - the 2% fee applies only to matched two-sided volume;
 * - a losing pick can therefore still receive an unmatched-principal refund;
 * - virtual seed liquidity never consumes user principal.
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
  assertWholeWolo(input.seedLeftWolo, "Left seed");
  assertWholeWolo(input.seedRightWolo, "Right seed");
  assertWholeWolo(input.feeRateBps, "Fee rate");
  if (!Number.isInteger(input.feeDenominator) || input.feeDenominator <= 0) {
    throw new Error("Fee denominator must be a positive integer.");
  }

  const exposure = planMatchedWagerExposure(input.wagers);
  const byId = new Map(exposure.wagers.map((wager) => [wager.id, wager] as const));
  const settledUserPool = exposure.leftPoolWolo + exposure.rightPoolWolo;
  const winningUserPool = input.winningSide
    ? exposure.wagers
        .filter((wager) => wager.side === input.winningSide)
        .reduce((sum, wager) => sum + wager.amountWolo, 0)
    : 0;
  const losingSidePool = input.winningSide ? exposure.matchedPerSideWolo : 0;
  const unbackedDesyncWinningSide =
    Boolean(input.winningSide) &&
    input.marketType === input.desyncMarketType &&
    winningUserPool === 0 &&
    input.wagers.length > 0;

  const bettingFeePoolWolo =
    input.winningSide && exposure.matchedVolumeWolo > 0
      ? Math.round(
          (exposure.matchedVolumeWolo * input.feeRateBps) /
            input.feeDenominator
        )
      : 0;

  const winningMatchedWagers = input.winningSide
    ? exposure.wagers
        .filter((wager) => wager.side === input.winningSide && wager.matchedWolo > 0)
        .map((wager) => ({ id: wager.id, amountWolo: wager.matchedWolo }))
    : [];
  const feeByWinningWagerId = allocateProRataByWagerId(
    winningMatchedWagers,
    bettingFeePoolWolo
  );

  const outcomes = input.wagers.map((wager): ResolvedWagerOutcome => {
    const matched = byId.get(wager.id);
    if (!matched) {
      throw new Error(`Missing matched exposure for wager #${wager.id}.`);
    }

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
        payoutWolo: matched.unmatchedWolo,
        bettingFeeWolo: 0,
      };
    }

    const bettingFeeWolo = feeByWinningWagerId.get(wager.id) ?? 0;
    const matchedGrossReturnWolo = matched.matchedWolo * 2;
    const payoutWolo = Math.max(
      0,
      matched.unmatchedWolo + matchedGrossReturnWolo - bettingFeeWolo
    );

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
    matchedPerSideWolo: exposure.matchedPerSideWolo,
    matchedVolumeWolo: exposure.matchedVolumeWolo,
    unmatchedVolumeWolo: exposure.unmatchedVolumeWolo,
    bettingFeePoolWolo,
    exposures: exposure.wagers,
    outcomes,
  };
}
