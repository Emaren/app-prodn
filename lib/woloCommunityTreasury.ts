export const WOLO_COMMUNITY_TREASURY_ADDRESS_ENV_NAMES = [
  "WOLO_COMMUNITY_TREASURY_ADDRESS",
  "WOLO_COMMUNITY_TREASURY",
  "WOLO_TREASURY_ADDRESS",
  "WOLO_TREASURY",
  "WOLO_MATCH_GUARANTEE_TREASURY_ADDRESS",
  "WOLO_MATCH_GUARANTEE_TREASURY",
  "WOLO_TREASURY_WALLET_ADDRESS",
  "WOLO_TREASURY_WALLET",
  "WOLO_COMMUNITY_TREASURY_WALLET_ADDRESS",
  "WOLO_COMMUNITY_TREASURY_WALLET",
  "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_COMMUNITY_TREASURY",
  "NEXT_PUBLIC_WOLO_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_TREASURY",
  "NEXT_PUBLIC_WOLO_MATCH_GUARANTEE_TREASURY_ADDRESS",
  "NEXT_PUBLIC_WOLO_MATCH_GUARANTEE_TREASURY",
  "NEXT_PUBLIC_WOLO_TREASURY_WALLET_ADDRESS",
  "NEXT_PUBLIC_WOLO_TREASURY_WALLET",
] as const;

export type WoloAddressConfig = {
  address: string | null;
  sourceLabel: string | null;
};

export function resolveAddressFromEnv(names: readonly string[]): WoloAddressConfig {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return {
        address: value,
        sourceLabel: name,
      };
    }
  }

  return {
    address: null,
    sourceLabel: null,
  };
}

export function resolveCommunityTreasuryAddressConfig() {
  return resolveAddressFromEnv(WOLO_COMMUNITY_TREASURY_ADDRESS_ENV_NAMES);
}
