/**
 * Public War Chest display eligibility is not equivalent to a market's
 * mutable database status. Original Bet Board also requires a verified
 * proposition, a confident public roster and the right parent Desync phase.
 *
 * The SQL-owned publicIntegrityEligible bit encodes private integrity proof
 * without publishing its source hashes. The legacy confidence classifier
 * is supplied by the caller. Only ACTIVE slips may enter live market pots.
 * This module is pure, making its stop-ship rules independently testable.
 */
export function eligiblePublishedOpenMarket(
  market: { status: string; publicIntegrityEligible: boolean },
  confidentLabels: boolean,
) {
  return (
    ["open", "closing", "live"].includes(market.status) &&
    market.publicIntegrityEligible === true &&
    confidentLabels === true
  );
}

export function activePublishedMarketWagers<T extends { status: string }>(
  wagers: readonly T[],
): T[] {
  return wagers.filter((wager) => wager.status === "active");
}
