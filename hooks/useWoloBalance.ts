// hooks/useWoloBalance.ts

import { useQuery } from "@tanstack/react-query";

const REST = "https://api.aoe2hdbets.com/cosmos/bank/v1beta1";

export function useWoloBalance(address?: string) {
  return useQuery<string>({
    queryKey: ["woloBalance", address],
    queryFn: async () => {
      if (!address) return "0";
      const res = await fetch(`${REST}/balances/${address}`);
      if (!res.ok) throw new Error("Failed to fetch Wolo balance");
      const json = await res.json();
      const coin = (json.balances as Array<{ denom: string; amount: string }>).find(
        (c) => c.denom === "uwolo"
      );
      return coin?.amount ?? "0";
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  });
}
