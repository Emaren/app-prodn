/**
 * Candidate-only WOLO War Satchel vault collision guard.
 * This is not a custody certification, signer verification or payment gate.
 * A future dedicated Satchel vault must be independently provisioned and
 * reviewed: it must NOT collide with any known existing WOLO role.
 */
import { WOLO_MAINNET_WALLET_ALIASES } from "./woloMainnetWallets.ts";

const KNOWN_ADDRESSES = new Set(
  WOLO_MAINNET_WALLET_ALIASES.map(row => row.address.trim().toLowerCase())
);

export function warSatchelVaultDistinctFromKnownWallets(
  candidate: string,
  environmentCustodyAddresses: readonly (string | null | undefined)[],
): boolean {
  const address = candidate.trim().toLowerCase();
  if (!/^wolo1[023456789acdefghjklmnpqrstuvwxyz]{38,90}$/.test(address)) return false;
  if (KNOWN_ADDRESSES.has(address)) return false;
  return !environmentCustodyAddresses.some(
    value => Boolean(value?.trim()) && value!.trim().toLowerCase() === address
  );
}
