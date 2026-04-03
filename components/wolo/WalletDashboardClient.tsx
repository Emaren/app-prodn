"use client";

import { useMemo } from "react";

import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";

const WALLET_ACTIONS = [
  { label: "Stake Tokens", className: "bg-emerald-700 hover:bg-emerald-600" },
  { label: "Claim Rewards", className: "bg-amber-700 hover:bg-amber-600" },
  { label: "View Transaction History", className: "bg-purple-700 hover:bg-purple-600" },
  { label: "Manage Keys", className: "bg-pink-700 hover:bg-pink-600" },
  { label: "Refresh Balance", className: "bg-indigo-700 hover:bg-indigo-600" },
];

function formatWalletBalance(rawBalance?: string) {
  const amount = Number(rawBalance ?? "0");
  if (!Number.isFinite(amount)) {
    return "0.00";
  }

  return (amount / 1_000_000).toFixed(2);
}

export default function WalletDashboardClient() {
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading } = useWoloBalance(address);
  const formattedBalance = useMemo(() => formatWalletBalance(rawBalance), [rawBalance]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Wallet Status</p>
          <div className="space-y-2 text-sm text-slate-300">
            <p>
              <strong className="text-white">Status:</strong> {status}
            </p>
            <p className="break-all">
              <strong className="text-white">Address:</strong> {address || "Not connected"}
            </p>
          </div>
        </div>

        {!address ? (
          <button
            type="button"
            onClick={() => {
              void connect();
            }}
            className="mt-5 rounded-full bg-blue-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
          >
            Connect Keplr
          </button>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
        <p className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">Balance</p>
        <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
          {isLoading ? "Loading..." : `${formattedBalance} WOLO`}
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {WALLET_ACTIONS.map((action) => (
          <button
            key={action.label}
            type="button"
            className={`w-full rounded-3xl px-5 py-5 text-left text-sm font-semibold text-white shadow-lg transition ${action.className}`}
          >
            {action.label}
          </button>
        ))}
      </section>
    </div>
  );
}
