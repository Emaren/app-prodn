// lib/woloChain.ts

import { Bech32Address } from "@keplr-wallet/cosmos";

export const woloChainConfig = {
  chainId: "wolo",
  chainName: "WoloChain",
  rpc: "https://rpc.aoe2hdbets.com",
  rest: "https://api.aoe2hdbets.com",
  bip44: { coinType: 118 },
  bech32Config: Bech32Address.defaultBech32Config("wolo"),

  /** — REQUIRED — */
  stakeCurrency: {
    coinDenom: "Wolo",
    coinMinimalDenom: "uwolo",
    coinDecimals: 6,
  },

  /** what shows up in balances, etc. */
  currencies: [
    {
      coinDenom: "Wolo",
      coinMinimalDenom: "uwolo",
      coinDecimals: 6,
    },
  ],

  /** what you pay fees in (typically same as stake) */
  feeCurrencies: [
    {
      coinDenom: "Wolo",
      coinMinimalDenom: "uwolo",
      coinDecimals: 6,
      gasPriceStep: {
        low: 0.01,
        average: 0.025,
        high: 0.04,
      },
    },
  ],

  features: ["stargate", "ibc-transfer"],
};
