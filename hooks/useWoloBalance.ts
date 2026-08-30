// hooks/useWoloBalance.ts

import { useQuery } from "@tanstack/react-query";

import {
  WOLO_BASE_DENOM,
  WOLO_CHAIN_ID,
  WOLO_COIN_DECIMALS,
} from "@/lib/woloChain";
import { parseWoloBalanceApiPayload } from "@/lib/woloBalanceRead";

export function useWoloBalance(address?: string) {
  const normalizedAddress = address?.trim() || "";

  return useQuery<string>({
    queryKey: ["woloBalance", normalizedAddress],
    queryFn: async ({ signal }) => {
      if (!normalizedAddress) {
        throw new Error("Connect a WoloChain wallet before reading its balance.");
      }

      const response = await fetch(
        `/api/wolo/balance/${encodeURIComponent(normalizedAddress)}`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal,
        },
      );
      const payload = (await response.json().catch(() => null)) as unknown;

      if (!response.ok) {
        const detail =
          typeof payload === "object" &&
          payload !== null &&
          typeof (payload as { detail?: unknown }).detail === "string"
            ? (payload as { detail: string }).detail
            : "Failed to fetch WOLO balance.";
        throw new Error(detail);
      }

      return parseWoloBalanceApiPayload(payload, {
        address: normalizedAddress,
        denom: WOLO_BASE_DENOM,
        decimals: WOLO_COIN_DECIMALS,
        chainId: WOLO_CHAIN_ID,
      }).amount;
    },
    enabled: Boolean(normalizedAddress),
    staleTime: 30_000,
    retry: 1,
  });
}
