/**
 * Canonical positive signed-64-bit quantities for immutable Satchel evidence.
 *
 * PostgreSQL BIGINT and our current proof-ledger schema are signed 64-bit.
 * Verify the decimal encoding and length BEFORE BigInt parsing or database
 * access. An untrusted chain field must never become a giant bignum or an
 * implicit data-store overflow.
 *
 * This does not authenticate chain trust, grant credit, or authorize funds.
 */
export const SATCHEL_MAX_SIGNED_INT64 = BigInt("9223372036854775807");

export function isPositiveSatchelInt64(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,18}$/.test(value)) return false;
  return BigInt(value) <= SATCHEL_MAX_SIGNED_INT64;
}

export function hasMinimumSatchelConfirmations(
  confirmations: unknown,
  minimum: number,
): boolean {
  return isPositiveSatchelInt64(confirmations) &&
    Number.isSafeInteger(minimum) && minimum > 0 &&
    BigInt(confirmations) >= BigInt(minimum);
}
