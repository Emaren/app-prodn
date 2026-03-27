// hooks/useWoloBalance.ts

import { useQuery } from "@tanstack/react-query";

export function useWoloBalance(address?: string) {
  return useQuery<string>({
    queryKey: ["woloBalance", address],
    queryFn: async () => {
      if (!address) return "0";
      const res = await fetch(`/api/wolo/balance/${encodeURIComponent(address)}`);
      if (!res.ok) throw new Error("Failed to fetch Wolo balance");
      const json = await res.json();
      return typeof json.amount === "string" ? json.amount : "0";
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  });
}
