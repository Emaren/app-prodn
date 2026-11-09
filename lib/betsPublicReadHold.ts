/**
 * Finite, nonfinancial response when the production web role cannot read
 * the financial bet-board tables. A denial never activates a fallback writer,
 * new wager, payout, or legacy 8092/8093 transport.
 */
export const BETS_PUBLIC_READ_HOLD_SCHEMA =
  "aoe2war.app.bets-restricted-public-read-hold.v1" as const;
export const BETS_PUBLIC_READ_HOLD_STATUS =
  "HOLD_RESTRICTED_PUBLIC_BOARD_READ" as const;

const BLOCKED_BOARD_READ_TABLES = new Set([
  "bet_markets",
  "bet_wagers",
  "pending_wolo_claims",
  "bet_counter_actions",
  "bet_stake_intents",
  "bet_stake_tickets",
  "bet_auto_executions",
  "wolo_indexed_transfers",
]);

export function isRestrictedBetsReadDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code !== "P2039" && code !== "P2010") return false;
  // A Prisma engine error may cross a VM/Next bundle boundary and lose
  // instanceof Error. Read its own string message without trusting a
  // generic String(object) conversion or unverified nested cause.
  const record = error as { message?: unknown; meta?: unknown };
  const message = typeof record.message === "string" ? record.message : "";
  if (!/\b42501\b/.test(message)) return false;
  const table = /permission denied for table ([a-z_][a-z0-9_]*)/i.exec(message)?.[1];
  return typeof table === "string" &&
    BLOCKED_BOARD_READ_TABLES.has(table.toLowerCase());
}

export function publicBetsReadHoldPayload() {
  return {
    schema: BETS_PUBLIC_READ_HOLD_SCHEMA,
    status: BETS_PUBLIC_READ_HOLD_STATUS,
    publicHistoryUrl: "/api/bets/public-history",
    detail: "Live bet-board read requires separately reviewed restricted financial projections.",
    financialExecutionAuthorized: false,
    acceptingWagers: false,
    approvingPayouts: false,
    onchainPaymentFinalityVerified: false,
    personalWagersIncluded: false,
  } as const;
}

export function isPublicBetsReadHoldPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const row = payload as Record<string, unknown>;
  return row.schema === BETS_PUBLIC_READ_HOLD_SCHEMA &&
    row.status === BETS_PUBLIC_READ_HOLD_STATUS &&
    row.publicHistoryUrl === "/api/bets/public-history" &&
    row.financialExecutionAuthorized === false &&
    row.acceptingWagers === false &&
    row.approvingPayouts === false &&
    row.onchainPaymentFinalityVerified === false &&
    row.personalWagersIncluded === false;
}
