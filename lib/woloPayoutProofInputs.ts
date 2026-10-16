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
  // Decode the number's *observable decimal representation* using bigint
  // instead of multiplying floats, which can silently round payout evidence.
  // Exponential spellings such as 1e-6 and 1e+4 are permitted.
  const parsed = /^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(amountWolo));
  if (!parsed) return null;
  const fractionalDigits = parsed[2]?.length ?? 0;
  const exponent = parsed[3] == null ? 0 : Number(parsed[3]);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 20) return null;
  const unscaled = BigInt(parsed[1] + (parsed[2] ?? ""));
  const microExponent = exponent + 6 - fractionalDigits;
  const units = microExponent >= 0
    ? unscaled * (BigInt(10) ** BigInt(microExponent))
    : unscaled % (BigInt(10) ** BigInt(-microExponent)) === BigInt(0)
      ? unscaled / (BigInt(10) ** BigInt(-microExponent))
      : BigInt(0);
  return units > BigInt(0) && units <= BigInt(Number.MAX_SAFE_INTEGER)
    ? units.toString() : null;
}

export function canonicalPayoutTxHash(value: string | null | undefined): string | null {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^[A-F0-9]{64}$/.test(normalized) ? normalized : null;
}
