/** Owner Auto Bet contract: 10,000 WOLO per ticket; 50,000 per UTC day.
 * Legacy manual wager admission keeps its separate existing limits.
 * These are ceilings, never permission to enlarge an existing signed budget.
 * No custody/activation flag or historical financial record is changed here.
 */
export const BET_MAX_STAKE_WOLO = 10_000;
export const AUTO_BET_MAX_DAILY_WOLO = 50_000;
export const BET_MAX_STAKE_UWOLO = BigInt(BET_MAX_STAKE_WOLO) * BigInt(1_000_000);

function wholeWolo(value: unknown, maximum: number): number | null {
  if (typeof value !== "number" &&
      (typeof value !== "string" || !/^[1-9][0-9]{0,5}$/.test(value))) return null;
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= maximum ? amount : null;
}
export const normalizeNewBetAmount = (value: unknown) => wholeWolo(value, BET_MAX_STAKE_WOLO);

/** Read/reconcile an already transferred historical stake, never new admission.
 * Caller must still bind its original durable intent and authenticated transfer.
 */
export const normalizeHistoricalBetRecoveryAmount = (value: unknown) => wholeWolo(value, 50_000);

/** Proposal arithmetic only. The ledger must invoke this under its existing
 * exclusive transaction after summing immutable UTC-day reservation journals.
 * Returned/refunded and UNKNOWN attempts still consume their original budget.
 */
export function autoBetDailyBudgetAvailable(usedUwolo: bigint, reserveUwolo: bigint, ownerDailyCapWolo: number): boolean {
  return typeof usedUwolo === "bigint" && typeof reserveUwolo === "bigint" && usedUwolo >= BigInt(0) &&
    reserveUwolo > BigInt(0) && reserveUwolo <= BET_MAX_STAKE_UWOLO &&
    reserveUwolo % BigInt(1_000_000) === BigInt(0) &&
    Number.isSafeInteger(ownerDailyCapWolo) && ownerDailyCapWolo >= 1 && ownerDailyCapWolo <= AUTO_BET_MAX_DAILY_WOLO &&
    usedUwolo + reserveUwolo <= BigInt(ownerDailyCapWolo) * BigInt(1_000_000);
}
