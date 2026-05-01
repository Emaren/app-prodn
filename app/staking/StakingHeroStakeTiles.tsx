"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

import { useKeplr } from "@/hooks/use-keplr";
import { useUserAuth } from "@/context/UserAuthContext";

type StakingMe = {
  user: {
    walletAddress: string | null;
  };
  position: {
    currentStakedWolo: number;
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
}: {
  totalStakedLabel: string;
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
  const walletAddress = useMemo(() => {
    if (status === "connected" && address) return address;
    return stakingState?.user.walletAddress ?? null;
  }, [address, stakingState?.user.walletAddress, status]);

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <StakeHeroTile
        label="My Stake"
        value={loading ? "Syncing" : formatWholeWolo(currentStaked)}
        helper={<AddressLine address={walletAddress} />}
      />
      <StakeHeroTile
        label="Total Staked"
        value={totalStakedLabel}
        helper="Across all stakers"
      />
      <StakeHeroTile
        label="Fee Split"
        value="50 / 50"
        helper="Stakers / Treasury"
      />
    </div>
  );
}

function StakeHeroTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: ReactNode;
}) {
  return (
    <div className="min-h-[7.4rem] rounded-[1.2rem] border border-white/10 bg-white/[0.045] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-2 text-sm leading-5 text-slate-400">{helper}</div>
    </div>
  );
}

function AddressLine({ address }: { address: string | null }) {
  const [copied, setCopied] = useState(false);

  if (!address) {
    return <span>Wallet not linked</span>;
  }

  async function handleCopy() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      title={address}
      aria-label="Copy WOLO address"
      className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-left text-xs font-semibold text-slate-300 transition hover:border-white/20 hover:bg-white/[0.07] hover:text-white"
    >
      <span className="truncate">{shortAddress(address)}</span>
      {copied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-200" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}
