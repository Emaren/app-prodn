"use client";

import { useEffect, useMemo, useState } from "react";

const FAUCET_AMOUNT_WOLO = 2;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;

type WoloFaucetCardProps = {
  address?: string;
  status: string;
  chainId: string;
  onClaimed?: (payload: { balanceAfterUwoLo?: string | null }) => void;
  variant: "prod" | "premium";
};

function buildStorageKey(chainId: string, address?: string) {
  return `wolo-faucet:last-claim:v2:${chainId}:${address ?? "disconnected"}`;
}

function formatCooldown(msRemaining: number) {
  const totalMinutes = Math.max(0, Math.ceil(msRemaining / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

export default function WoloFaucetCard({
  address,
  status,
  chainId,
  onClaimed,
  variant,
}: WoloFaucetCardProps) {
  const isConnected = status === "connected" && Boolean(address);
  const isTestnet = chainId.toLowerCase().includes("testnet");
  const storageKey = useMemo(() => buildStorageKey(chainId, address), [chainId, address]);

  const [lastClaimedAt, setLastClaimedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [justClaimed, setJustClaimed] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const isCompact = variant === "prod";

  useEffect(() => {
    setJustClaimed(false);
    setClaimError(null);

    if (typeof window === "undefined") return;
    if (!isConnected) {
      setLastClaimedAt(null);
      return;
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setLastClaimedAt(null);
      return;
    }

    const parsed = Number(raw);
    setLastClaimedAt(Number.isFinite(parsed) ? parsed : null);
  }, [isConnected, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const msRemaining = lastClaimedAt ? Math.max(0, lastClaimedAt + COOLDOWN_MS - now) : 0;
  const cooldownLabel = `Next claim in ${formatCooldown(msRemaining)}`;
  const isCoolingDown = isConnected && msRemaining > 0;
  const isEligible = isConnected && isTestnet && !isCoolingDown && !isClaiming;

  async function handleClaimClick() {
    try {
      setClaimError(null);

      if (!address || !isConnected) return;
      if (!isTestnet) {
        setClaimError("Starter Faucet is testnet only.");
        return;
      }

      setIsClaiming(true);
      const response = await fetch("/api/wolo/faucet/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ address }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        detail?: string;
        claimedAtMs?: number;
        cooldownEndsAtMs?: number;
        balanceAfter?: { amount?: string | null };
      };

      if (!response.ok) {
        if (response.status === 429 && payload.cooldownEndsAtMs) {
          const cooldownClaimedAt = payload.cooldownEndsAtMs - COOLDOWN_MS;
          setLastClaimedAt(cooldownClaimedAt);
          setNow(Date.now());
          if (typeof window !== "undefined") {
            window.localStorage.setItem(storageKey, String(cooldownClaimedAt));
          }
        }

        throw new Error(payload.detail || "Could not claim faucet.");
      }

      const claimedAt = payload.claimedAtMs ?? Date.now();
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(claimedAt));
      }
      setLastClaimedAt(claimedAt);
      setNow(claimedAt);
      setJustClaimed(true);
      onClaimed?.({ balanceAfterUwoLo: payload.balanceAfter?.amount ?? null });
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : "Could not claim faucet.");
    } finally {
      setIsClaiming(false);
    }
  }

  const primaryLabel = !isConnected
    ? `Claim ${FAUCET_AMOUNT_WOLO} WOLO`
    : !isTestnet
      ? "Testnet only"
      : isClaiming
        ? "Sending..."
        : isCoolingDown
          ? justClaimed
            ? "Claimed"
            : "Cooling down"
          : `Claim ${FAUCET_AMOUNT_WOLO} WOLO`;

  const canClickPrimary = isEligible;
  const actionChipClassName = `shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.24em] transition ${
    canClickPrimary
      ? "border-cyan-300/70 bg-cyan-400/10 text-cyan-100 hover:border-cyan-200 hover:bg-cyan-400/15 hover:text-white"
      : "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
  }`;

  return (
    <div className="px-1">
      <div className="flex items-center justify-between gap-3">
        <div
          className={`min-w-0 truncate text-cyan-100/55 ${
            isCompact
              ? "text-[10px] uppercase tracking-[0.28em]"
              : "text-[11px] uppercase tracking-[0.3em]"
          }`}
          title={isCoolingDown ? cooldownLabel : "Starter Faucet"}
        >
          Starter Faucet
        </div>

        <button
          type="button"
          onClick={() => {
            if (!canClickPrimary) return;
            void handleClaimClick();
          }}
          disabled={!canClickPrimary}
          className={actionChipClassName}
          title={isCoolingDown ? cooldownLabel : primaryLabel}
        >
          {primaryLabel}
        </button>
      </div>

      {claimError ? (
        <div className="mt-2 text-[11px] text-red-200/85">{claimError}</div>
      ) : null}
    </div>
  );
}
