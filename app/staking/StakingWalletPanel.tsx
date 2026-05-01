"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Wallet } from "lucide-react";

import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { useUserAuth } from "@/context/UserAuthContext";

function formatTokenAmount(raw?: string) {
  const amount = Number(raw ?? "0");
  if (!Number.isFinite(amount)) return "0.00";
  return (amount / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortAddress(value: string) {
  if (!value) return "";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export default function StakingWalletPanel() {
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading: balanceLoading } = useWoloBalance(address);
  const { isAuthenticated, loading, playerName, loginWithSteam } = useUserAuth();
  const [walletError, setWalletError] = useState<string | null>(null);

  const balanceLabel = useMemo(
    () => (balanceLoading ? "Syncing" : `${formatTokenAmount(rawBalance)} WOLO`),
    [balanceLoading, rawBalance]
  );

  const walletStatus =
    status === "connected"
      ? shortAddress(address)
      : status === "not_installed"
        ? "Keplr missing"
        : status === "connecting" || status === "checking"
          ? "Checking wallet"
          : "Wallet offline";

  async function handleConnect() {
    try {
      setWalletError(null);
      await connect();
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : "Could not connect wallet.");
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,29,0.96),rgba(4,7,14,0.98))] shadow-[0_26px_90px_rgba(2,6,23,0.35)]">
      <div>
        <div className="border-b border-white/10 bg-white/[0.035] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-amber-200/75">
                My Staking
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">
                Personal war chest
              </h2>
            </div>
            <div className="rounded-full border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
              <Wallet className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-5 rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">Account</div>
            <div className="mt-2 text-lg font-semibold text-white">
              {loading ? "Checking session" : isAuthenticated ? playerName || "Signed in" : "Steam needed"}
            </div>
            <div className="mt-1 text-sm text-slate-400">{walletStatus}</div>
          </div>

          {!isAuthenticated ? (
            <button
              type="button"
              onClick={() => loginWithSteam("/staking")}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Sign In
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : status === "connected" ? null : (
            <button
              type="button"
              onClick={() => {
                void handleConnect();
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Connect Wallet
              <ArrowRight className="h-4 w-4" />
            </button>
          )}

          {walletError ? (
            <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {walletError}
            </div>
          ) : null}
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <StakingMetric label="Wallet Balance" value={status === "connected" ? balanceLabel : "--"} />
            <StakingMetric label="Currently Staked" value="Ledger pending" helper="No stake recorded yet" />
            <StakingMetric label="Staking Weight" value="Preparing" helper="More WOLO + time" />
            <StakingMetric label="Pending Rewards" value="Estimate unlocks" helper="After first stake" />
            <StakingMetric label="Lifetime Rewards" value="Preparing" helper="Awaiting ledger" />
            <StakingMetric label="Last Reward Payment" value="No payments yet" />
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            <DisabledAction label="Stake" helper="Ledger pending" />
            <DisabledAction label="Unstake" helper="Ledger pending" />
            <DisabledAction label="Claim" helper="Rewards pending" />
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-emerald-300/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Stake, unstake, and claims are preparing for the staking ledger cutover. This panel is read-only for now.
          </div>
        </div>
      </div>
    </section>
  );
}

function StakingMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="min-h-[7.1rem] rounded-[1.15rem] border border-white/10 bg-white/[0.045] p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 text-xl font-semibold text-white">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-400">{helper}</div> : null}
    </div>
  );
}

function DisabledAction({ label, helper }: { label: string; helper: string }) {
  return (
    <button
      type="button"
      disabled
      className="inline-flex min-h-14 cursor-not-allowed flex-col items-center justify-center rounded-[1rem] border border-white/10 bg-white/[0.045] px-4 py-2.5 text-sm font-semibold text-slate-500"
    >
      <span>{label}</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-600">
        {helper}
      </span>
    </button>
  );
}
