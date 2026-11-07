/** Fresh money admission only. Recovery of an already submitted transfer is separate. */
export const SATCHEL_WATCHER_EXECUTION_MAX_AGE_MS = 4 * 60 * 1000;

export type SatchelWatcherSpendMarket = {
  status: string;
  marketType: string;
  scheduledMatchId: number | null;
  linkedSessionKey: string | null;
  createdAt: Date;
  closeAt: Date | null;
  phaseOpensAt: Date | null;
  phaseClosesAt: Date | null;
  winnerSide: string | null;
  settledAt: Date | null;
  voidedAt: Date | null;
  refundStatus: string | null;
  settlementExecutedAt: Date | null;
  linkedGameStatsId: number | null;
  lateFinalGameStatsId: number | null;
};

export function satchelWatcherSpendWindowIssue(input: {
  market: SatchelWatcherSpendMarket;
  executionCreatedAt: Date;
  signedAt: Date;
  now: Date;
}): string | null {
  const {market, executionCreatedAt, signedAt, now} = input;
  const n = now.getTime(), signed = signedAt.getTime(), created = executionCreatedAt.getTime();
  if (![n, signed, created, market.createdAt.getTime()].every(Number.isFinite) ||
      signed > created || created > n || market.createdAt.getTime() < signed ||
      market.createdAt.getTime() > created || n - created > SATCHEL_WATCHER_EXECUTION_MAX_AGE_MS) {
    return "watcher_game_not_new_after_owner_authorization";
  }
  if (market.status !== "live" || market.scheduledMatchId !== null ||
      !market.linkedSessionKey?.trim() || !["winner", "desync"].includes(market.marketType) ||
      market.winnerSide !== null || market.settledAt !== null || market.voidedAt !== null ||
      market.refundStatus !== null || market.settlementExecutedAt !== null ||
      market.linkedGameStatsId !== null || market.lateFinalGameStatsId !== null) {
    return "watcher_outcome_or_terminal_market_known";
  }
  for (const cutoff of [market.closeAt, market.phaseClosesAt]) {
    if (cutoff !== null && (!Number.isFinite(cutoff.getTime()) || cutoff.getTime() <= n)) {
      return "watcher_market_cutoff_reached";
    }
  }
  if (market.phaseOpensAt !== null &&
      (!Number.isFinite(market.phaseOpensAt.getTime()) || market.phaseOpensAt.getTime() > n)) {
    return "watcher_market_not_open_yet";
  }
  return null;
}

/** gamesRemaining is decremented at proven commit; unresolved sends occupy slots meanwhile. */
export function satchelFiniteGameSlotAvailable(input: {
  untilOut: boolean; gamesRemaining: number | null; unresolvedReservations: number;
}): boolean {
  if (!Number.isSafeInteger(input.unresolvedReservations) || input.unresolvedReservations < 0) return false;
  if (input.untilOut) return input.gamesRemaining === null;
  return Number.isSafeInteger(input.gamesRemaining) && (input.gamesRemaining ?? 0) > 0 &&
    input.unresolvedReservations < input.gamesRemaining!;
}
