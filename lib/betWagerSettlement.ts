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
  // Plain integer checks permit >2^53 values whose WOLO units are not exact.
  // The betting interface is numeric: refuse those inputs before any money math.
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a safe non-negative whole-WOLO amount.`);
  }
}

const MAX_SAFE_WOLO = BigInt(Number.MAX_SAFE_INTEGER);

function safeWoloFromBigInt(value: bigint, label: string): number {
  if (value < 0n || value > MAX_SAFE_WOLO) {
    throw new Error(`${label} exceeds safe whole-WOLO accounting range.`);
  }
  return Number(value);
}

/**
 * Allocate whole WOLO with exact integer quotients/remainders.
 *
 * Multiplying two otherwise-safe numbers as JS floats can already lose units
 * before Math.floor/Math.round, changing fees and owner attribution. BigInt
 * keeps the numerator exact; each returned amount must still be safe Number.
 */
function allocateProRataByWagerId(
  wagers: Array<{ id: number; amountWolo: number }>,
  totalToAllocate: number
) {
  assertWholeWolo(totalToAllocate, "Pro-rata allocation");
  const allocationByWagerId = new Map<number, number>();
  const totalStake = wagers.reduce((sum, wager) => {
    assertWholeWolo(wager.amountWolo, `Wager #${wager.id}`);
    return sum + BigInt(wager.amountWolo);
  }, 0n);
  safeWoloFromBigInt(totalStake, "Aggregate pro-rata stake");

  if (totalToAllocate === 0 || totalStake === 0n) {
    for (const wager of wagers) allocationByWagerId.set(wager.id, 0);
    return allocationByWagerId;
  }

  const requested = BigInt(totalToAllocate);
  const boundedTotal = requested < totalStake ? requested : totalStake;
  const allocations = wagers.map((wager) => {
    const product = boundedTotal * BigInt(wager.amountWolo);
    return {
      id: wager.id,
      amountWolo: wager.amountWolo,
      allocatedWolo: product / totalStake,
      remainder: product % totalStake,
    };
  });

  let remaining =
    boundedTotal - allocations.reduce((sum, row) => sum + row.allocatedWolo, 0n);

  allocations.sort((left, right) => {
    if (right.remainder !== left.remainder) {
      return right.remainder > left.remainder ? 1 : -1;
    }
    if (right.amountWolo !== left.amountWolo) return right.amountWolo - left.amountWolo;
    return left.id - right.id;
  });

  // Hamilton remainder allocation: leftover units are < number of wagers.
  for (const allocation of allocations) {
    if (remaining <= 0n) break;
    allocation.allocatedWolo += 1n;
    remaining -= 1n;
  }

  if (remaining !== 0n) {
    throw new Error("Pro-rata allocation did not conserve whole WOLO.");
  }
  for (const allocation of allocations) {
    allocationByWagerId.set(
      allocation.id,
      safeWoloFromBigInt(allocation.allocatedWolo, "Pro-rata owner allocation")
    );
  }

  return allocationByWagerId;
}

export function matchedMarketVolumeWolo(
  leftPoolWolo: number,
  rightPoolWolo: number
) {
  assertWholeWolo(leftPoolWolo, "Left wager pool");
  assertWholeWolo(rightPoolWolo, "Right wager pool");
  return safeWoloFromBigInt(
    BigInt(Math.min(leftPoolWolo, rightPoolWolo)) * 2n,
    "Matched market volume"
  );
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
  const seenIds = new Set<number>();
  const normalized = wagers.map((wager) => {
    if (!Number.isSafeInteger(wager.id) || wager.id <= 0 || seenIds.has(wager.id)) {
      throw new Error("Wager IDs must be unique positive safe integers.");
    }
    seenIds.add(wager.id);
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
  const leftPoolWolo = safeWoloFromBigInt(
    leftWagers.reduce((sum, wager) => sum + BigInt(wager.amountWolo), 0n),
    "Left wager pool"
  );
  const rightPoolWolo = safeWoloFromBigInt(
    rightWagers.reduce((sum, wager) => sum + BigInt(wager.amountWolo), 0n),
    "Right wager pool"
  );
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

  const settledUserPool = safeWoloFromBigInt(
    BigInt(leftPoolWolo) + BigInt(rightPoolWolo), "Settled user pool"
  );
  return {
    leftPoolWolo,
    rightPoolWolo,
    matchedPerSideWolo,
    matchedVolumeWolo,
    unmatchedVolumeWolo: settledUserPool - matchedVolumeWolo,
    wagers: planned,
  };
}

export function feeBearingMatchedWagerVolumeWolo(
  wagers: Array<ResolvedWagerInput & { marketId: number; status: string }>,
) {
  const byMarket = new Map<number, Array<ResolvedWagerInput & { marketId: number; status: string }>>();
  for (const wager of wagers) {
    const rows = byMarket.get(wager.marketId) ?? [];
    rows.push(wager);
    byMarket.set(wager.marketId, rows);
  }

  let matchedVolumeWolo = 0;
  for (const marketWagers of byMarket.values()) {
    // A terminal void can have two-sided matched exposure but charges no fee.
    // A fee-bearing settlement must contain an actual winning wager outcome.
    if (!marketWagers.some((wager) => wager.status === "won")) continue;
    matchedVolumeWolo += planMatchedWagerExposure(marketWagers).matchedVolumeWolo;
  }
  return matchedVolumeWolo;
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
    ? safeWoloFromBigInt(
        exposure.wagers
          .filter((wager) => wager.side === input.winningSide)
          .reduce((sum, wager) => sum + BigInt(wager.amountWolo), 0n),
        "Winning user pool"
      )
    : 0;
  const losingSidePool = input.winningSide ? exposure.matchedPerSideWolo : 0;
  const unbackedDesyncWinningSide =
    Boolean(input.winningSide) &&
    input.marketType === input.desyncMarketType &&
    winningUserPool === 0 &&
    input.wagers.length > 0;

  const bettingFeePoolWolo =
    input.winningSide && exposure.matchedVolumeWolo > 0
      ? safeWoloFromBigInt(
          (BigInt(exposure.matchedVolumeWolo) * BigInt(input.feeRateBps) +
            BigInt(Math.floor(input.feeDenominator / 2))) /
            BigInt(input.feeDenominator),
          "Matched betting fee"
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
    const grossReturn = BigInt(matched.unmatchedWolo) +
      BigInt(matched.matchedWolo) * 2n - BigInt(bettingFeeWolo);
    const payoutWolo = safeWoloFromBigInt(
      grossReturn > 0n ? grossReturn : 0n,
      "Resolved wager payout"
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
