// app/Providers.tsx
"use client";

import { useEffect, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useChainId } from "@/hooks/useChainId";
import { woloChainConfig as baseConfig } from "@/lib/woloChain";

const queryClient = new QueryClient();

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
    const keplr = (window as any).keplr;
    if (!keplr || !isSuccess || !chainId) return;

    keplr.experimentalSuggestChain({ ...baseConfig, chainId }).catch((err: any) =>
      console.error("Keplr suggestChain failed:", err)
    );
  }, [chainId, isSuccess]);

  return <>{children}</>;
}
