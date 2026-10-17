/**
 * P0 financial custody release interlock for the unfinished Satchel bridge.
 *
 * Proven defect (2026-10-17, WoloChain PR #28): decoded Cosmos REST JSON
 * can be fabricated without a cryptographic commitment to tx bytes, trusted
 * chain-reader evidence, or WoloChain's separately signed per-leg allocation.
 *
 * Setting every environment variable to "true" MUST NOT turn that unchecked
 * evidence into custody authority. Fail closed at every user-facing funding
 * and withdrawal entry, financial ledger transition and auto-bet execution.
 *
 * Remove this interlock ONLY alongside a reviewed, negative-tested,
 * authenticated chain + signed v2 allocation + independent withdrawal
 * approval/execution/recovery bridge. Its removal requires a separate
 * reviewed source change and production release authority.
 */
export const SATCHEL_FINANCIAL_BRIDGE_READY: false = false;

export function satchelFinancialBridgeReady(): boolean {
  return SATCHEL_FINANCIAL_BRIDGE_READY;
}

export function requireSatchelFinancialBridge(): void {
  if (!SATCHEL_FINANCIAL_BRIDGE_READY) {
    throw new Error("SATCHEL_FINANCIAL_BRIDGE_UNVERIFIED_HOLD");
  }
}
