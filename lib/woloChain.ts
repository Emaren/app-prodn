import { Bech32Address } from "@keplr-wallet/cosmos";

export const WOLO_CHAIN_ID =
  process.env.NEXT_PUBLIC_WOLO_CHAIN_ID?.trim() || "wolo-testnet";

export const WOLO_CHAIN_NAME = "WoloChain Testnet";
export const WOLO_ADDRESS_PREFIX = "wolo";
export const WOLO_BASE_DENOM = "uwolo";
export const WOLO_DISPLAY_DENOM = "WOLO";
export const WOLO_COIN_DECIMALS = 6;
export const WOLO_COIN_TYPE = 118;

export const WOLO_MAX_SUPPLY_DISPLAY = "100,000,000";

export const WOLO_RPC_URL =
  process.env.NEXT_PUBLIC_WOLO_RPC_URL?.trim() || "https://rpc.aoe2hdbets.com";

export const WOLO_REST_URL =
  process.env.NEXT_PUBLIC_WOLO_REST_URL?.trim() || "https://rest.aoe2hdbets.com";

export const WOLO_KEPLR_DOWNLOAD_URL = "https://www.keplr.app/get";
export const WOLO_MONETARY_POLICY_LABEL = "Fixed Supply";
export const WOLO_SCARCITY_COPY = "Fixed supply. Clean settlement. No inflation games.";

export function formatWoloAmount(raw?: string | number | null) {
  const numeric = typeof raw === "number" ? raw : Number.parseFloat(String(raw ?? "0"));

  if (!Number.isFinite(numeric)) {
    return "0.00";
  }

  return (numeric / 10 ** WOLO_COIN_DECIMALS).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function shortenAddress(address?: string, lead = 12, tail = 8) {
  if (!address) return "Not connected";
  if (address.length <= lead + tail + 1) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}

export const woloChainConfig = {
  chainId: WOLO_CHAIN_ID,
  chainName: WOLO_CHAIN_NAME,
  rpc: WOLO_RPC_URL,
  rest: WOLO_REST_URL,
  bip44: { coinType: WOLO_COIN_TYPE },
  bech32Config: Bech32Address.defaultBech32Config(WOLO_ADDRESS_PREFIX),
  stakeCurrency: {
    coinDenom: WOLO_DISPLAY_DENOM,
    coinMinimalDenom: WOLO_BASE_DENOM,
    coinDecimals: WOLO_COIN_DECIMALS,
  },
  currencies: [
    {
      coinDenom: WOLO_DISPLAY_DENOM,
      coinMinimalDenom: WOLO_BASE_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: WOLO_DISPLAY_DENOM,
      coinMinimalDenom: WOLO_BASE_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
      gasPriceStep: {
        low: 0.01,
        average: 0.025,
        high: 0.04,
      },
    },
  ],
  features: ["stargate", "ibc-transfer"],
} as const;