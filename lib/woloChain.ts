export const WOLO_CHAIN_ID =
  process.env.NEXT_PUBLIC_WOLO_CHAIN_ID?.trim() || "wolo-1";

export const WOLO_CHAIN_NAME = "WoloChain";
export const WOLO_ADDRESS_PREFIX = "wolo";
export const WOLO_BASE_DENOM = "uwolo";
export const WOLO_DISPLAY_DENOM = "WOLO";
export const WOLO_LOGO_URL = "https://aoe2war.com/legacy/wolo-logo-transparent.png";
export const WOLO_COIN_DECIMALS = 6;
export const WOLO_COIN_TYPE = 118;
export const WOLO_MAINNET_CHAIN_ID = "wolo-1";
export const WOLO_MAINNET_DISPLAY_START_ISO =
  process.env.NEXT_PUBLIC_WOLO_MAINNET_DISPLAY_START_AT?.trim() ||
  process.env.WOLO_MAINNET_DISPLAY_START_AT?.trim() ||
  "2026-05-25T00:00:00.000Z";

export const WOLO_MAX_SUPPLY_DISPLAY = "100,000,000";

export const WOLO_RPC_URL =
  process.env.NEXT_PUBLIC_WOLO_RPC_URL?.trim() ||
  process.env.WOLO_RPC_URL?.trim() ||
  (WOLO_CHAIN_ID === WOLO_MAINNET_CHAIN_ID
    ? "https://rpc-mainnet.aoe2war.com"
    : "https://aoe2war.com/rpc");

export const WOLO_REST_URL =
  process.env.NEXT_PUBLIC_WOLO_REST_URL?.trim() ||
  process.env.WOLO_REST_URL?.trim() ||
  (WOLO_CHAIN_ID === WOLO_MAINNET_CHAIN_ID
    ? "https://rest-mainnet.aoe2war.com"
    : "https://aoe2war.com/rest");

export const WOLO_BET_ESCROW_ADDRESS =
  process.env.NEXT_PUBLIC_WOLO_BET_ESCROW_ADDRESS?.trim() ||
  process.env.WOLO_BET_ESCROW_ADDRESS?.trim() ||
  "";

export const WOLO_CHALLENGE_ESCROW_ADDRESS =
  process.env.NEXT_PUBLIC_WOLO_CHALLENGE_ESCROW_ADDRESS?.trim() ||
  process.env.WOLO_CHALLENGE_ESCROW_ADDRESS?.trim() ||
  WOLO_BET_ESCROW_ADDRESS;

export type WoloBetEscrowMode = "disabled" | "optional" | "required";

export const WOLO_DEFAULT_GAS_PRICE =
  process.env.NEXT_PUBLIC_WOLO_GAS_PRICE?.trim() ||
  process.env.WOLO_GAS_PRICE?.trim() ||
  `0.025${WOLO_BASE_DENOM}`;

export const WOLO_TYPICAL_TX_GAS = 52_960;

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
  WOLO_CHAIN_ID === WOLO_MAINNET_CHAIN_ID
    ? "required"
    : (normalizeBetEscrowMode(explicitBetEscrowMode) ||
        (process.env.WOLO_BET_REQUIRE_ONCHAIN === "1" || WOLO_BET_ESCROW_ADDRESS
          ? "required"
          : "disabled"));

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

export function getWoloMainnetDisplayStartAt() {
  const parsed = new Date(WOLO_MAINNET_DISPLAY_START_ISO);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }
  return new Date("2026-05-25T00:00:00.000Z");
}

export function isWoloMainnet() {
  return WOLO_CHAIN_ID === WOLO_MAINNET_CHAIN_ID && !WOLO_BET_TEST_MODE;
}

export function isAtOrAfterWoloMainnetStart(value: Date | string | null | undefined) {
  if (!isWoloMainnet()) return true;
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime()) && date.getTime() >= getWoloMainnetDisplayStartAt().getTime();
}

export function isMainnetVisibleWoloTx(input: {
  txHash?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}) {
  if (!isWoloMainnet()) return true;
  return Boolean(input.txHash?.trim()) && isAtOrAfterWoloMainnetStart(input.updatedAt || input.createdAt);
}

export function isMainnetVisibleBetWager(input: {
  executionMode?: string | null;
  stakeTxHash?: string | null;
  createdAt?: Date | string | null;
  stakeLockedAt?: Date | string | null;
}) {
  if (!isWoloMainnet()) return true;
  return (
    input.executionMode === "onchain_escrow" &&
    Boolean(input.stakeTxHash?.trim()) &&
    isAtOrAfterWoloMainnetStart(input.stakeLockedAt || input.createdAt)
  );
}

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

export function parseWoloGasPriceMinimalDenom(value = WOLO_DEFAULT_GAS_PRICE) {
  const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([a-zA-Z0-9/]+)$/);
  if (!match || match[2] !== WOLO_BASE_DENOM) return 0;
  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function estimateWoloNetworkFeeWolo(gasWanted?: number | string | bigint | null) {
  const gas =
    typeof gasWanted === "number"
      ? gasWanted
      : typeof gasWanted === "bigint"
        ? Number(gasWanted)
      : typeof gasWanted === "string"
        ? Number.parseInt(gasWanted, 10)
        : WOLO_TYPICAL_TX_GAS;
  const gasPriceMinimalDenom = parseWoloGasPriceMinimalDenom();
  if (!Number.isFinite(gas) || gas <= 0 || gasPriceMinimalDenom <= 0) return 0;
  return (gas * gasPriceMinimalDenom) / 10 ** WOLO_COIN_DECIMALS;
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
  chainSymbolImageUrl: WOLO_LOGO_URL,
  rpc: WOLO_RPC_URL,
  rest: WOLO_REST_URL,
  bip44: { coinType: WOLO_COIN_TYPE },
  bech32Config: buildBech32Config(WOLO_ADDRESS_PREFIX),
  stakeCurrency: {
    coinDenom: WOLO_DISPLAY_DENOM,
    coinMinimalDenom: WOLO_BASE_DENOM,
    coinDecimals: WOLO_COIN_DECIMALS,
    coinImageUrl: WOLO_LOGO_URL,
  },
  currencies: [
    {
      coinDenom: WOLO_DISPLAY_DENOM,
      coinMinimalDenom: WOLO_BASE_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
      coinImageUrl: WOLO_LOGO_URL,
    },
  ],
  feeCurrencies: [
    {
      coinDenom: WOLO_DISPLAY_DENOM,
      coinMinimalDenom: WOLO_BASE_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
      coinImageUrl: WOLO_LOGO_URL,
      gasPriceStep: {
        low: 0.01,
        average: 0.025,
        high: 0.04,
      },
    },
  ],
  features: ["ibc-transfer"],
} as const;
