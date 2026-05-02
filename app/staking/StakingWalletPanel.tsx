"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Wallet } from "lucide-react";

import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import { useUserAuth } from "@/context/UserAuthContext";
import { formatPublicStakingWeight } from "@/lib/stakingDisplay";

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

type StakingMe = {
  user: {
    playerName: string;
    walletAddress: string | null;
  };
  position: {
    currentStakedWolo: number;
    stakingWeight: string;
    pendingRewardsWolo: number;
    lifetimeRewardsWolo: number;
    lifetimeTxFeesWolo: number;
    lastRewardPaymentAt: string | null;
    lastRewardAmountWolo: number;
  };
  execution: {
    detail: string;
  };
};

function formatWholeWolo(value: number | null | undefined) {
  if (value == null) return "--";
  return `${new Intl.NumberFormat("en-US").format(value)} WOLO`;
}

function formatTinyWolo(value: number | null | undefined) {
  if (!value || value <= 0) return "0";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  }).format(value);
}

function formatRewardDate(value: string | null | undefined) {
  if (!value) return "No payments yet";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function StakingWalletPanel() {
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading: balanceLoading } = useWoloBalance(address);
  const { isAuthenticated, loading, playerName, loginWithSteam } = useUserAuth();
  const [walletError, setWalletError] = useState<string | null>(null);
  const [stakingState, setStakingState] = useState<StakingMe | null>(null);
  const [stakingLoading, setStakingLoading] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    async function loadStakingState() {
      if (!isAuthenticated) {
        setStakingState(null);
        return;
      }

      setStakingLoading(true);
      try {
        const response = await fetch("/api/staking/me", { cache: "no-store" });
        if (!response.ok) {
          if (!cancelled) setStakingState(null);
          return;
        }
        const payload = (await response.json()) as StakingMe;
        if (!cancelled) setStakingState(payload);
      } catch {
        if (!cancelled) setStakingState(null);
      } finally {
        if (!cancelled) setStakingLoading(false);
      }
    }

    void loadStakingState();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

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
            <StakingMetric
              label="Currently Staked"
              value={stakingLoading ? "Syncing" : formatWholeWolo(stakingState?.position.currentStakedWolo)}
              helper={stakingState?.position.currentStakedWolo ? "Confirmed ledger stake" : "No stake recorded"}
            />
            <StakingMetric
              label="Staking Weight"
              value={stakingLoading ? "Syncing" : formatPublicStakingWeight(stakingState?.position.stakingWeight)}
              helper="More WOLO + time"
            />
            <StakingMetric
              label="Pending Rewards"
              value={stakingLoading ? "Syncing" : formatWholeWolo(stakingState?.position.pendingRewardsWolo)}
              helper="Claims open next"
            />
            <StakingMetric
              label="Lifetime Rewards"
              value={stakingLoading ? "Syncing" : formatWholeWolo(stakingState?.position.lifetimeRewardsWolo)}
              helper="Credited fee share"
            />
            <StakingMetric
              label="Total TX Fees"
              value={
                stakingLoading
                  ? "Syncing"
                  : `${formatTinyWolo(stakingState?.position.lifetimeTxFeesWolo)} WOLO`
              }
              helper="Signed staking txs"
            />
            <StakingMetric
              label="Last Reward Payment"
              value={stakingLoading ? "Syncing" : formatRewardDate(stakingState?.position.lastRewardPaymentAt)}
              helper={
                stakingState?.position.lastRewardAmountWolo
                  ? formatWholeWolo(stakingState.position.lastRewardAmountWolo)
                  : undefined
              }
            />
          </div>

          <div className="mt-4 rounded-[1.2rem] border border-emerald-300/15 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Stake and unstake from the WOLO Economy tile.
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
