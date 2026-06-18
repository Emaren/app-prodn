"use client";

import { useEffect, useState } from "react";

type KeplrLike = {
  enable?: (chainId: string) => Promise<void>;
  getKey?: (chainId: string) => Promise<{ bech32Address?: string }>;
};

type OfflineSignerLike = {
  getAccounts?: () => Promise<Array<{ address?: string }>>;
};

type WoloWindow = Window & {
  keplr?: KeplrLike;
  getOfflineSigner?: (chainId: string) => OfflineSignerLike;
};

const CHAIN_ID = process.env.NEXT_PUBLIC_WOLO_CHAIN_ID || "wolo-1";
const REST_BASE = process.env.NEXT_PUBLIC_WOLO_REST_URL || "https://rest-mainnet.aoe2war.com";
const LAST_CONNECTED_KEY = "aoe2war:connected-wallet";


function formatBalance(value: number) {
  return `${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} WOLO`;
}

async function fetchWoloBalance(address: string) {
  const response = await fetch(
    `${REST_BASE.replace(/\/+$/, "")}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`,
    { cache: "no-store" },
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    balances?: Array<{ denom?: string; amount?: string }>;
  };

  const rawAmount = payload.balances?.find((coin) => coin.denom === "uwolo")?.amount || "0";
  const amount = Number(rawAmount);

  return Number.isFinite(amount) ? amount / 1_000_000 : null;
}

export function WalletOwnerBalance({ address }: { address?: string | null }) {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadConnectedBalance(walletAddress: string) {
    const value = await fetchWoloBalance(walletAddress);
    setBalance(value);
  }

  async function connectWallet() {
    if (typeof window === "undefined") return;

    setLoading(true);

    try {
      const w = window as WoloWindow;

      await w.keplr?.enable?.(CHAIN_ID);

      const key = await w.keplr?.getKey?.(CHAIN_ID);
      let walletAddress = key?.bech32Address || null;

      if (!walletAddress) {
        const accounts = await w.getOfflineSigner?.(CHAIN_ID)?.getAccounts?.();
        walletAddress = accounts?.[0]?.address || null;
      }

      if (walletAddress) {
        setConnectedAddress(walletAddress);
        window.localStorage.setItem(LAST_CONNECTED_KEY, walletAddress);
        await loadConnectedBalance(walletAddress);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!address || typeof window === "undefined") return;

    const cached = window.localStorage.getItem(LAST_CONNECTED_KEY);

    if (cached) {
      setConnectedAddress(cached);
      void loadConnectedBalance(cached);
    }
  }, [address]);

  if (connectedAddress && balance != null) {
    return <div className="mt-1 text-sm font-semibold text-white">{formatBalance(balance)}</div>;
  }

  return (
    <button
      type="button"
      onClick={connectWallet}
      className="mt-1 text-left text-sm font-semibold text-slate-200 transition hover:cursor-pointer hover:text-amber-100"
      title={connectedAddress ? "Refresh your wallet balance" : "Connect wallet to show your balance"}
    >
      {loading ? "Connecting..." : "Connect wallet"}
    </button>
  );
}

export default function CopyableWalletAddress({
  address,
  label,
}: {
  address?: string | null;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    if (!address) return;

    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyAddress}
      disabled={!address}
      title={address ? (copied ? "Copied" : "Copy wallet address") : "Wallet pending"}
      className="mt-1 block break-all text-left text-sm font-semibold text-slate-200 transition select-none hover:cursor-pointer hover:text-amber-100 disabled:cursor-default disabled:text-slate-500"
    >
      {label}
    </button>
  );
}
