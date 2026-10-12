import { WOLO_MAINNET_NETWORK_ACCOUNTS } from "./woloMainnetNetworkAccounts.ts";

/**
 * Named historical addresses are directory entries, not live WOLO holders.
 * Do not count them as issued addresses, supply owners or attacker accounts.
 */
const HISTORICAL_LABELS = new Set(["[BDB]Pigman", "Ra 𓁛𓇳"]);

export const WOLO_HISTORIC_PLAYER_ACCOUNTS = WOLO_MAINNET_NETWORK_ACCOUNTS
  .filter((account) => HISTORICAL_LABELS.has(account.label))
  .map((account) => ({ address: account.address, label: account.label }));

export function missingHistoricalWoloAddresses(
  current: readonly { address: string }[],
) {
  const currentAddresses = new Set(current.map((holder) => holder.address.toLowerCase()));
  return WOLO_HISTORIC_PLAYER_ACCOUNTS.filter(
    (account) => !currentAddresses.has(account.address.toLowerCase()),
  );
}

export function woloAddressDirectorySummary(
  current: readonly { address: string }[],
) {
  const historical = missingHistoricalWoloAddresses(current);
  return {
    currentHolderCount: current.length,
    additionalHistoricalCount: historical.length,
    listedAddressCount: current.length + historical.length,
  };
}
