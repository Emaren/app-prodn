export type LiveBetMarketLike = {
  marketType?: unknown;
  status?: unknown;
};

const LIVE_BETTABLE_STATUSES =
  new Set([
    "open",
    "live",
  ]);

function normalizedMarketValue(
  value: unknown,
) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

/**
 * The primary CTA is exclusively for a currently bettable
 * competitive-winner market.
 *
 * Desync side markets, closing markets and settled markets
 * must never replace the main live-battle action.
 */
export function isBettableLiveWinnerMarket(
  market:
    | LiveBetMarketLike
    | null
    | undefined,
) {
  if (!market) {
    return false;
  }

  return (
    normalizedMarketValue(
      market.marketType,
    ) === "winner" &&
    LIVE_BETTABLE_STATUSES.has(
      normalizedMarketValue(
        market.status,
      ),
    )
  );
}

/**
 * Input order remains authoritative for choosing between
 * duplicate winner markets. Database callers provide newest-first
 * ordering.
 */
export function selectPrimaryLiveWinnerMarket<
  T extends LiveBetMarketLike,
>(
  markets: readonly T[],
): T | null {
  return (
    markets.find(
      isBettableLiveWinnerMarket,
    ) ??
    null
  );
}
