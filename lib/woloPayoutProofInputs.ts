/**
 * Canonical, non-mutating WOLO payout-evidence input normalization.
 * Financial reconciliation must not round extra-decimal requests, accept
 * NaN/Infinity, or turn unsafe JS units into apparent on-chain proof.
 * This does NOT authorize a payout, prove signer ownership or verify finality.
 */
export const WOLO_PAYOUT_MICRO_UNITS = 1_000_000;

export function canonicalPayoutUWolo(amountWolo: number): string | null {
  if (typeof amountWolo !== "number" || !Number.isFinite(amountWolo) ||
      amountWolo <= 0) return null;
  const raw = amountWolo * WOLO_PAYOUT_MICRO_UNITS;
  const rounded = Math.round(raw);
  // Allow ordinary IEEE-754 representation jitter for genuine six-decimal
  // amounts, but never silently round economic value at >6 decimals.
  if (!Number.isSafeInteger(rounded) || rounded <= 0 ||
      Math.abs(raw - rounded) > 0.000001) return null;
  return String(rounded);
}

export function canonicalPayoutTxHash(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-F0-9]{64}$/.test(normalized) ? normalized : null;
}
