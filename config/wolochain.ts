// config/wolochain.ts
export function useWoloChainConfig() {
  return {
    rpc: "http://localhost:26657", // your local wolochaind RPC endpoint
    coinMinimalDenom: "uwolo",     // or your actual chain's minimal denom
  };
}

export const wolochain = {
  name: "wolochain",
  chainId: "wolochain",
  rpcUrl: "http://localhost:26657",
  restUrl: "http://localhost:1317",
  stakeCurrency: {
    coinDenom: "Wolo",
    coinMinimalDenom: "uwolo",
    coinDecimals: 6,
  },
  feeCurrencies: [
    {
      coinDenom: "Wolo",
      coinMinimalDenom: "uwolo",
      coinDecimals: 6,
    },
  ],
  bip44: { coinType: 118 },
  bech32Config: {
    bech32PrefixAccAddr: "cosmos",
    bech32PrefixAccPub: "cosmospub",
    bech32PrefixValAddr: "cosmosvaloper",
    bech32PrefixValPub: "cosmosvaloperpub",
    bech32PrefixConsAddr: "cosmosvalcons",
    bech32PrefixConsPub: "cosmosvalconspub",
  },
  currencies: [
    { coinDenom: "Wolo", coinMinimalDenom: "uwolo", coinDecimals: 6 },
  ],
  coinType: 118,
  gasPriceStep: { low: 0.01, average: 0.025, high: 0.03 },
};
