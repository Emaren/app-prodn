"use client";

import { useCallback, useEffect, useState } from "react";

import { woloChainConfig } from "@/lib/woloChain";

type AccountData = {
  address: string;
};

type OfflineSigner = {
  getAccounts(): Promise<AccountData[]>;
};

declare global {
  interface Window {
    keplr?: {
      enable(chainId: string): Promise<void>;
      experimentalSuggestChain?: (config: typeof woloChainConfig) => Promise<void>;
      getKey?: (chainId: string) => Promise<{ bech32Address: string }>;
    };
    getOfflineSigner?: (chainId: string) => OfflineSigner;
  }
}

type Status = "not_installed" | "disconnected" | "connecting" | "connected";

export function useKeplr() {
  const [status, setStatus] = useState<Status>("disconnected");
  const [address, setAddress] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setStatus(window.keplr ? "disconnected" : "not_installed");
  }, []);

  const connect = useCallback(async () => {
    if (typeof window === "undefined" || !window.keplr) {
      setStatus("not_installed");
      throw new Error("Keplr extension not found.");
    }

    setStatus("connecting");

    try {
      if (window.keplr.experimentalSuggestChain) {
        try {
          await window.keplr.experimentalSuggestChain(woloChainConfig);
        } catch (error) {
          console.warn("WoloChain suggest failed or already exists:", error);
        }
      }

      await window.keplr.enable(woloChainConfig.chainId);

      let nextAddress = "";

      if (window.keplr.getKey) {
        const key = await window.keplr.getKey(woloChainConfig.chainId);
        nextAddress = key?.bech32Address || "";
      }

      if (!nextAddress && window.getOfflineSigner) {
        const signer = window.getOfflineSigner(woloChainConfig.chainId);
        const accounts = await signer.getAccounts();
        nextAddress = accounts[0]?.address || "";
      }

      if (!nextAddress) {
        throw new Error("Connected wallet returned no Wolo address.");
      }

      setAddress(nextAddress);
      setStatus("connected");
      return nextAddress;
    } catch (error) {
      setAddress("");
      setStatus(window.keplr ? "disconnected" : "not_installed");
      throw error;
    }
  }, []);

  const disconnect = useCallback(() => {
    setAddress("");
    setStatus(typeof window !== "undefined" && window.keplr ? "disconnected" : "not_installed");
  }, []);

  return { status, address, connect, disconnect };
}