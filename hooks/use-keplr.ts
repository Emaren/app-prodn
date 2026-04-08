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
type WalletSnapshot = {
  status: Status;
  address: string;
};

const STORAGE_KEY = "aoe2hdbets.keplr.wallet.v1";
const listeners = new Set<(snapshot: WalletSnapshot) => void>();

let snapshot: WalletSnapshot = {
  status: "disconnected",
  address: "",
};
let storeInitialized = false;
let restorePromise: Promise<string | null> | null = null;
let linkedWalletAddress = "";

async function persistWalletLink(address: string) {
  const normalized = address.trim();
  if (typeof window === "undefined" || !normalized || linkedWalletAddress === normalized) {
    return;
  }

  try {
    const response = await fetch("/api/user/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress: normalized }),
    });

    if (response.ok) {
      linkedWalletAddress = normalized;
      return;
    }

    if (response.status !== 401) {
      console.warn(`Failed to persist linked WOLO wallet: ${response.status}`);
    }
  } catch (error) {
    console.warn("Failed to persist linked WOLO wallet:", error);
  }
}

function getAvailabilitySnapshot() {
  if (typeof window === "undefined") {
    return snapshot;
  }

  return {
    status: window.keplr ? "disconnected" : "not_installed",
    address: "",
  } satisfies WalletSnapshot;
}

function readStoredAddress() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(STORAGE_KEY)?.trim() || "";
}

function persistSnapshot(next: WalletSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  if (next.status === "connected" && next.address) {
    window.localStorage.setItem(STORAGE_KEY, next.address);
    return;
  }

  window.localStorage.removeItem(STORAGE_KEY);
}

function publishSnapshot(next: WalletSnapshot) {
  snapshot = next;
  persistSnapshot(next);
  listeners.forEach((listener) => listener(snapshot));
}

async function resolveKeplrAddress(options?: { suggestChain?: boolean }) {
  if (typeof window === "undefined" || !window.keplr) {
    throw new Error("Keplr extension not found.");
  }

  if (options?.suggestChain && window.keplr.experimentalSuggestChain) {
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

  return nextAddress;
}

async function restoreStoredConnection() {
  const storedAddress = readStoredAddress();
  if (!storedAddress) {
    publishSnapshot(getAvailabilitySnapshot());
    return null;
  }

  if (typeof window === "undefined" || !window.keplr) {
    publishSnapshot({ status: "not_installed", address: "" });
    return null;
  }

  publishSnapshot({ status: "connecting", address: storedAddress });

  try {
    const nextAddress = await resolveKeplrAddress();
    publishSnapshot({ status: "connected", address: nextAddress });
    void persistWalletLink(nextAddress);
    return nextAddress;
  } catch (error) {
    console.warn("Stored Keplr session could not be restored:", error);
    publishSnapshot(getAvailabilitySnapshot());
    return null;
  }
}

function initializeKeplrStore() {
  if (storeInitialized || typeof window === "undefined") {
    return;
  }

  storeInitialized = true;

  const storedAddress = readStoredAddress();
  if (window.keplr) {
    snapshot = storedAddress
      ? { status: "connected", address: storedAddress }
      : { status: "disconnected", address: "" };
  } else {
    snapshot = { status: "not_installed", address: "" };
  }

  window.addEventListener("keplr_keystorechange", () => {
    restorePromise = restoreStoredConnection();
  });
}

export function useKeplr() {
  const [status, setStatus] = useState<Status>(snapshot.status);
  const [address, setAddress] = useState(snapshot.address);

  useEffect(() => {
    initializeKeplrStore();

    const handleSnapshot = (next: WalletSnapshot) => {
      setStatus(next.status);
      setAddress(next.address);
    };

    listeners.add(handleSnapshot);
    handleSnapshot(snapshot);

    if (!restorePromise && readStoredAddress()) {
      restorePromise = restoreStoredConnection();
    } else if (!readStoredAddress()) {
      publishSnapshot(getAvailabilitySnapshot());
    }

    return () => {
      listeners.delete(handleSnapshot);
    };
  }, []);

  const connect = useCallback(async () => {
    initializeKeplrStore();

    if (typeof window === "undefined" || !window.keplr) {
      publishSnapshot({ status: "not_installed", address: "" });
      throw new Error("Keplr extension not found.");
    }

    publishSnapshot({ status: "connecting", address: snapshot.address });

    try {
      const nextAddress = await resolveKeplrAddress({ suggestChain: true });
      publishSnapshot({ status: "connected", address: nextAddress });
      void persistWalletLink(nextAddress);
      restorePromise = Promise.resolve(nextAddress);
      return nextAddress;
    } catch (error) {
      publishSnapshot(getAvailabilitySnapshot());
      restorePromise = null;
      throw error;
    }
  }, []);

  const disconnect = useCallback(() => {
    restorePromise = null;
    publishSnapshot(getAvailabilitySnapshot());
  }, []);

  return { status, address, connect, disconnect };
}
