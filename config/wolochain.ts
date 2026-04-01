import {
  WOLO_ADDRESS_PREFIX,
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_CHAIN_NAME,
  WOLO_COIN_DECIMALS,
  WOLO_COIN_TYPE,
  WOLO_DISPLAY_DENOM,
  WOLO_REST_URL,
  WOLO_RPC_URL,
  woloChainConfig,
} from "@/lib/woloChain";

export * from "@/lib/woloChain";
export { woloChainConfig } from "@/lib/woloChain";

/**
 * Compatibility shim for older imports like:
 *   import { useWoloChainConfig } from "../config/wolochain";
 *   import { wolochain } from "../config/wolochain";
 *
 * Canonical truth lives in lib/woloChain.ts.
 */
export function useWoloChainConfig() {
  return {
    chainId: WOLO_CHAIN_ID,
    chainName: WOLO_CHAIN_NAME,
    rpc: WOLO_RPC_URL,
    rest: WOLO_REST_URL,
    coinDenom: WOLO_DISPLAY_DENOM,
    coinMinimalDenom: WOLO_BASE_DENOM,
    coinDecimals: WOLO_COIN_DECIMALS,
    addressPrefix: WOLO_ADDRESS_PREFIX,
  };
}

/**
 * Legacy object shape preserved for older callers.
 */
export const wolochain = {
  name: WOLO_CHAIN_NAME.toLowerCase(),
  chainId: WOLO_CHAIN_ID,
  rpcUrl: WOLO_RPC_URL,
  restUrl: WOLO_REST_URL,
  rpc: WOLO_RPC_URL,
  rest: WOLO_REST_URL,
  stakeCurrency: {
    coinDenom: WOLO_DISPLAY_DENOM,
    coinMinimalDenom: WOLO_BASE_DENOM,
    coinDecimals: WOLO_COIN_DECIMALS,
  },
  feeCurrencies: [
    {
      coinDenom: WOLO_DISPLAY_DENOM,
      coinMinimalDenom: WOLO_BASE_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
    },
  ],
  bip44: { coinType: WOLO_COIN_TYPE },
  bech32Config: woloChainConfig.bech32Config,
  currencies: [
    {
      coinDenom: WOLO_DISPLAY_DENOM,
      coinMinimalDenom: WOLO_BASE_DENOM,
      coinDecimals: WOLO_COIN_DECIMALS,
    },
  ],
  coinType: WOLO_COIN_TYPE,
  gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
} as const;