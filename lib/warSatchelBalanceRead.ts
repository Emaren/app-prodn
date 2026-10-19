/** A private, already-authorized ledger read; never an authorization to wager.
 * Reject uncertified and malformed HTTP responses rather than inventing WOLO.
 */
import { normalizeMinimalDenomAmount } from "./woloBalanceRead.ts";

export type CertifiedWarSatchelRead = Readonly<{
  availableUwolo: string;
  reservedUwolo: string;
  withdrawalPendingUwolo: string;
  committedHistoricalUwolo: string;
  version: string;
}>;

const MAX_I64 = 9223372036854775807n;

function ledgerInteger(value: unknown): string | null {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,18})$/.test(value)) return null;
  try {
    const amount = normalizeMinimalDenomAmount(value);
    return BigInt(amount) <= MAX_I64 ? amount : null;
  } catch {
    return null;
  }
}

/**
 * The backend authenticates the current user and enforces the immutable
 * financial source HOLD before reading any of these owner-bound balances.
 * This client parser only displays an eligible result; it never infers
 * solvency from balances or turns on funding, withdrawing or placing bets.
 */
export function parseCertifiedWarSatchelRead(input: unknown): CertifiedWarSatchelRead | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.available !== true || value.chainId !== "wolo-1" ||
      value.denom !== "uwolo" || typeof value.wageringEnabled !== "boolean") return null;
  const availableUwolo = ledgerInteger(value.availableUwolo);
  const reservedUwolo = ledgerInteger(value.reservedUwolo);
  const withdrawalPendingUwolo = ledgerInteger(value.withdrawalPendingUwolo);
  const committedHistoricalUwolo = ledgerInteger(value.committedHistoricalUwolo);
  const version = ledgerInteger(value.version);
  if (availableUwolo === null || reservedUwolo === null ||
      withdrawalPendingUwolo === null || committedHistoricalUwolo === null ||
      version === null) return null;
  return Object.freeze({
    availableUwolo, reservedUwolo, withdrawalPendingUwolo,
    committedHistoricalUwolo, version,
  });
}
