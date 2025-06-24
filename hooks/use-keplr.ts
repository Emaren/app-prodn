// hooks/useKeplr.ts
import { useState, useEffect, useCallback } from "react";
import { woloChainConfig } from "@/lib/woloChain";

declare global {
  interface Window {
    keplr?: {
      enable(chainId: string): Promise<void>;
      experimentalSuggestChain(config: any): Promise<void>;
    };
    getOfflineSigner?(chainId: string): any;
  }
}

type Status = "not_installed" | "disconnected" | "connected";

export function useKeplr() {
  const [status, setStatus] = useState<Status>("disconnected");
  const [address, setAddress] = useState<string>("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (!window.keplr) {
        setStatus("not_installed");
      } else {
        setStatus("disconnected");
      }
    }
  }, []);

  const connect = useCallback(async () => {
    if (!window.keplr) {
      throw new Error("Keplr extension not found");
    }
    // suggest the chain if needed
    try {
      await window.keplr.experimentalSuggestChain(woloChainConfig);
    } catch (err) {
      console.warn("Could not suggest chain (maybe already added):", err);
    }
    // enable & get accounts
    await window.keplr.enable(woloChainConfig.chainId);
    const signer = window.getOfflineSigner!(woloChainConfig.chainId);
    const accounts = await signer.getAccounts();
    setAddress(accounts[0].address);
    setStatus("connected");
  }, []);

  const disconnect = useCallback(() => {
    setAddress("");
    setStatus("disconnected");
  }, []);

  return { status, address, connect, disconnect };
}
