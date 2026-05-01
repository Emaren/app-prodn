"use client";

import { useEffect, useMemo, useState } from "react";

import { useKeplr } from "@/hooks/use-keplr";
import { useUserAuth } from "@/context/UserAuthContext";

type StakingMe = {
  user: {
    walletAddress: string | null;
  };
  position: {
    currentStakedWolo: number;
    stakingWeight: string;
  };
};

function shortAddress(value: string | null | undefined) {
  if (!value) return "Wallet not linked";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatWholeWolo(value: number | null | undefined) {
  const safeValue = value ?? 0;
  return `${new Intl.NumberFormat("en-US").format(safeValue)} WOLO`;
}

export default function StakingHeroStakeTiles({
  totalStakedLabel,
  totalWeightLabel,
}: {
  totalStakedLabel: string;
  totalWeightLabel: string;
}) {
  const { isAuthenticated } = useUserAuth();
  const { address, status } = useKeplr();
  const [stakingState, setStakingState] = useState<StakingMe | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadStake() {
      if (!isAuthenticated) {
        setStakingState(null);
        return;
      }

      setLoading(true);
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
        if (!cancelled) setLoading(false);
      }
    }

    void loadStake();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const currentStaked = stakingState?.position.currentStakedWolo ?? 0;
  const walletLabel = useMemo(() => {
    if (status === "connected" && address) return shortAddress(address);
    return shortAddress(stakingState?.user.walletAddress);
  }, [address, stakingState?.user.walletAddress, status]);
  const stakeStatus = !isAuthenticated
    ? "Sign in"
    : currentStaked > 0
      ? "Active"
      : "Not staked yet";

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StakeHeroTile
        label="My Stake"
        value={loading ? "Syncing" : formatWholeWolo(currentStaked)}
        helper={walletLabel}
        badge={stakeStatus}
        tone={currentStaked > 0 ? "emerald" : "slate"}
      />
      <StakeHeroTile
        label="Total Staked"
        value={totalStakedLabel}
        helper={totalWeightLabel}
        badge="Staking Weight"
        tone="amber"
      />
      <StakeHeroTile
        label="Fee Split"
        value="50 / 50"
        helper="Stakers and treasury"
        badge="0.75% fee"
        tone="emerald"
      />
    </div>
  );
}

function StakeHeroTile({
  label,
  value,
  helper,
  badge,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  badge: string;
  tone: "amber" | "emerald" | "slate";
}) {
  const badgeClass =
    tone === "amber"
      ? "border-amber-300/25 bg-amber-300/10 text-amber-100"
      : tone === "emerald"
        ? "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
        : "border-white/10 bg-white/[0.055] text-slate-300";

  return (
    <div className="min-h-[8.6rem] rounded-[1.2rem] border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
        <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${badgeClass}`}>
          {badge}
        </div>
      </div>
      <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 truncate text-sm text-slate-400">{helper}</div>
    </div>
  );
}
