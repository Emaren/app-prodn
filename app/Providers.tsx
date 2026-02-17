// app/Providers.tsx
"use client";

import { ReactNode, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChainId } from "@/hooks/useChainId";
import { woloChainConfig as baseConfig } from "@/lib/woloChain";

const queryClient = new QueryClient();
type KeplrSuggestConfig = typeof baseConfig & { chainId: string };

type KeplrLike = {
  experimentalSuggestChain: (config: KeplrSuggestConfig) => Promise<void>;
};

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <KeplrSuggest>{children}</KeplrSuggest>
    </QueryClientProvider>
  );
}

function KeplrSuggest({ children }: { children: ReactNode }) {
  const { data: chainId, isSuccess } = useChainId();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const keplrWindow = window as Window & { keplr?: KeplrLike };
    const keplr = keplrWindow.keplr;
    if (!keplr || !isSuccess || !chainId) return;

    keplr
      .experimentalSuggestChain({ ...baseConfig, chainId })
      .catch((err: unknown) => console.error("Keplr suggestChain failed:", err));
  }, [chainId, isSuccess]);

  return <>{children}</>;
}
