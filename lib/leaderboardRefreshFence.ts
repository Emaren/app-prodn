/**
 * Server leaderboard cache publication fence.
 * Prevents an old computation from repopulating the cache after invalidation
 * or replacing a newer accepted generation when promises resolve out of order.
 * Pure and testable without database, network, or a Next.js runtime.
 */
export function mayPublishLeaderboardRefresh(input: {
  requestEpoch: number;
  currentEpoch: number;
  requestSequence: number;
  acceptedSequence: number | null;
}): boolean {
  return Number.isSafeInteger(input.requestEpoch) &&
    Number.isSafeInteger(input.currentEpoch) &&
    Number.isSafeInteger(input.requestSequence) &&
    input.requestSequence >= 1 &&
    input.requestEpoch === input.currentEpoch &&
    (input.acceptedSequence === null ||
      (Number.isSafeInteger(input.acceptedSequence) &&
       input.acceptedSequence >= 1 &&
       input.requestSequence >= input.acceptedSequence));
}
