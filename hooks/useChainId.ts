// hooks/useChainId.ts
"use client";

import { useQuery } from "@tanstack/react-query";

export function useChainId() {
  return useQuery({
    queryKey: ["chain-id"],
    queryFn: async () => {
      const res = await fetch("/api/chain-id");
      if (!res.ok) throw new Error("Failed to load chain ID");
      return res.json();
    },
  });
}
