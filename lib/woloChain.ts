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

export const WOLO_BET_ESCROW_ADDRESS =
  process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS?.trim() ||
  process.env.WOLO_BET_ESCROW_ADDRESS?.trim() ||
  "";

export type WoloBetEscrowMode = "disabled" | "optional" | "required";

export const WOLO_DEFAULT_GAS_PRICE =
  process.env.NEXT_PUBLIC_WOLO_GAS_PRICE?.trim() ||
  process.env.WOLO_GAS_PRICE?.trim() ||
  `0.025${WOLO_BASE_DENOM}`;

const explicitBetEscrowMode =
  process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_MODE?.trim().toLowerCase() ||
  process.env.WOLO_BET_ESCROW_MODE?.trim().toLowerCase() ||
  "";

function normalizeBetEscrowMode(value: string): WoloBetEscrowMode | null {
  if (value === "required" || value === "optional" || value === "disabled") {
    return value;
  }
  return null;
}

export const WOLO_BET_ESCROW_MODE: WoloBetEscrowMode =
  normalizeBetEscrowMode(explicitBetEscrowMode) ||
  (process.env.WOLO_BET_REQUIRE_ONCHAIN === "1" || WOLO_BET_ESCROW_ADDRESS
    ? "required"
    : "disabled");

export const WOLO_BET_ESCROW_READY = Boolean(WOLO_BET_ESCROW_ADDRESS);
export const WOLO_BET_ESCROW_REQUIRED = WOLO_BET_ESCROW_MODE === "required";
export const WOLO_BET_ESCROW_OPTIONAL = WOLO_BET_ESCROW_MODE === "optional";
export const WOLO_BET_ESCROW_CONFIG_ERROR =
  WOLO_BET_ESCROW_REQUIRED && !WOLO_BET_ESCROW_READY
    ? "WOLO bet escrow is required in this environment, but WOLO_BET_ESCROW_ADDRESS is not configured."
    : null;

const explicitBetTestMode =
  process.env.NEXT_PUBLIC_WOLO_BET_TEST_MODE?.trim() ||
  process.env.WOLO_BET_TEST_MODE?.trim() ||
  "";

export const WOLO_BET_TEST_MODE =
  explicitBetTestMode === "1"
    ? true
    : explicitBetTestMode === "0"
      ? false
      : /testnet/i.test(WOLO_CHAIN_ID);

export function getWoloBetEscrowRuntime() {
  return {
    mode: WOLO_BET_ESCROW_MODE,
    escrowAddress: WOLO_BET_ESCROW_ADDRESS || null,
    ready: WOLO_BET_ESCROW_READY,
    onchainAllowed: WOLO_BET_ESCROW_MODE !== "disabled" && WOLO_BET_ESCROW_READY,
    onchainRequired: WOLO_BET_ESCROW_REQUIRED,
    configError: WOLO_BET_ESCROW_CONFIG_ERROR,
  } as const;
}

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

export function toUwoLoAmount(amountWolo: number) {
  return String(Math.max(0, Math.round(amountWolo * 10 ** WOLO_COIN_DECIMALS)));
}

export function buildWoloRestTxLookupUrl(txHash?: string | null) {
  const normalized = (txHash || "").trim().toUpperCase();
  if (!normalized) return null;
  return `${WOLO_REST_URL.replace(/\/+$/, "")}/cosmos/tx/v1beta1/txs/${normalized}`;
}

function buildBech32Config(prefix: string) {
  return {
    bech32PrefixAccAddr: prefix,
    bech32PrefixAccPub: `${prefix}pub`,
    bech32PrefixValAddr: `${prefix}valoper`,
    bech32PrefixValPub: `${prefix}valoperpub`,
    bech32PrefixConsAddr: `${prefix}valcons`,
    bech32PrefixConsPub: `${prefix}valconspub`,
  } as const;
}

export const woloChainConfig = {
  chainId: WOLO_CHAIN_ID,
  chainName: WOLO_CHAIN_NAME,
  rpc: WOLO_RPC_URL,
  rest: WOLO_REST_URL,
  bip44: { coinType: WOLO_COIN_TYPE },
  bech32Config: buildBech32Config(WOLO_ADDRESS_PREFIX),
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
