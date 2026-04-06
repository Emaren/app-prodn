"use client";

import { useQuery } from "@tanstack/react-query";

type ChainIdResponse = {
  chainId: string;
};

export function useChainId() {
  return useQuery({
    queryKey: ["chain-id"],
    queryFn: async (): Promise<string> => {
      const res = await fetch("/api/chain-id", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load chain ID");
      const payload = (await res.json()) as ChainIdResponse;
      const chainId = payload?.chainId?.trim();

      if (!chainId) {
        throw new Error("Chain ID response did not include a valid chainId");
      }

      return chainId;
    },
  });
}