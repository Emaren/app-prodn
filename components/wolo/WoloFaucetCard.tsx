"use client";

import { useEffect, useMemo, useState } from "react";

const FAUCET_AMOUNT_WOLO = 2;
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const PING_PUB_BASE_URL = "https://ping.pub";

type WoloFaucetCardProps = {
  address?: string;
  status: string;
  chainId: string;
  onClaimed?: (payload: { balanceAfterUwoLo?: string | null }) => void;
  variant: "prod" | "premium";
};

type FaucetClaimResponse = {
  detail?: string;
  txhash?: string;
  claimedAtMs?: number;
  cooldownEndsAtMs?: number;
  claimedAmountWolo?: number;
  claimedAmountUwoLo?: string;
  balanceAfter?: { amount?: string | null };
};

type StoredClaimState = {
  claimedAtMs: number;
  cooldownEndsAtMs: number;
  txhash: string | null;
};

function buildStorageKey(chainId: string, address?: string) {
  return `wolo-faucet:last-claim:v3:${chainId}:${address ?? "disconnected"}`;
}

function formatCooldown(msRemaining: number) {
  const totalMinutes = Math.max(0, Math.ceil(msRemaining / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}

function formatTxhash(txhash?: string | null) {
  if (!txhash) return "Pending";
  return `${txhash.slice(0, 10)}…${txhash.slice(-8)}`;
}

function buildPingPubTxUrl(chainId: string, txhash?: string | null) {
  if (!txhash) return null;
  const normalized = chainId.trim() || "wolo-testnet";
  return `${PING_PUB_BASE_URL}/${normalized}/tx/${txhash}`;
}

function parseStoredClaimState(raw: string | null): StoredClaimState | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredClaimState>;
    if (
      typeof parsed.claimedAtMs === "number" &&
      typeof parsed.cooldownEndsAtMs === "number"
    ) {
      return {
        claimedAtMs: parsed.claimedAtMs,
        cooldownEndsAtMs: parsed.cooldownEndsAtMs,
        txhash: typeof parsed.txhash === "string" ? parsed.txhash : null,
      };
    }
  } catch {
    const legacyClaimedAt = Number(raw);
    if (Number.isFinite(legacyClaimedAt)) {
      return {
        claimedAtMs: legacyClaimedAt,
        cooldownEndsAtMs: legacyClaimedAt + COOLDOWN_MS,
        txhash: null,
      };
    }
  }

  return null;
}

function writeStoredClaimState(storageKey: string, claim: StoredClaimState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(claim));
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

  const [claimState, setClaimState] = useState<StoredClaimState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [claimError, setClaimError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [justClaimed, setJustClaimed] = useState(false);
  const isCompact = variant === "prod";

  useEffect(() => {
    setClaimError(null);
    setJustClaimed(false);

    if (typeof window === "undefined") return;
    if (!isConnected) {
      setClaimState(null);
      return;
    }

    const stored = parseStoredClaimState(window.localStorage.getItem(storageKey));
    setClaimState(stored);
  }, [isConnected, storageKey]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => window.clearInterval(timer);
  }, []);

  const cooldownEndsAtMs = claimState?.cooldownEndsAtMs ?? 0;
  const msRemaining = cooldownEndsAtMs ? Math.max(0, cooldownEndsAtMs - now) : 0;
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

      const payload = (await response.json().catch(() => ({}))) as FaucetClaimResponse;

      if (!response.ok) {
        if (response.status === 429 && payload.cooldownEndsAtMs) {
          const recoveredClaim: StoredClaimState = {
            claimedAtMs:
              payload.claimedAtMs ??
              Math.max(payload.cooldownEndsAtMs - COOLDOWN_MS, Date.now() - COOLDOWN_MS),
            cooldownEndsAtMs: payload.cooldownEndsAtMs,
            txhash: payload.txhash ?? null,
          };
          setClaimState(recoveredClaim);
          writeStoredClaimState(storageKey, recoveredClaim);
          setNow(Date.now());
        }

        throw new Error(payload.detail || "Could not claim faucet.");
      }

      const nextClaim: StoredClaimState = {
        claimedAtMs: payload.claimedAtMs ?? Date.now(),
        cooldownEndsAtMs:
          payload.cooldownEndsAtMs ?? (payload.claimedAtMs ?? Date.now()) + COOLDOWN_MS,
        txhash: payload.txhash ?? null,
      };

      setClaimState(nextClaim);
      writeStoredClaimState(storageKey, nextClaim);
      setNow(nextClaim.claimedAtMs);
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

  const statusTone = claimError
    ? "border-red-400/25 bg-red-500/10 text-red-100"
    : isClaiming
      ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
      : isCoolingDown
        ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
        : isEligible
          ? "border-amber-300/25 bg-amber-400/10 text-amber-100"
          : "border-white/10 bg-white/5 text-slate-300";

  const statusLabel = !isConnected
    ? "Connect Keplr to claim."
    : !isTestnet
      ? "Faucet is only live on Wolo testnet."
      : isClaiming
        ? "Broadcasting faucet transfer."
        : isCoolingDown
          ? `Next claim in ${formatCooldown(msRemaining)}`
          : `Ready. ${FAUCET_AMOUNT_WOLO} WOLO every 24h.`;

  const actionClassName = `shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.24em] transition ${
    isEligible
      ? "border-cyan-300/70 bg-cyan-400/10 text-cyan-100 hover:border-cyan-200 hover:bg-cyan-400/15 hover:text-white"
      : "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
  }`;

  const txhash = claimState?.txhash ?? null;
  const txUrl = buildPingPubTxUrl(chainId, txhash);

  if (isCompact) {
    return (
      <div className="rounded-[1.15rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,14,24,0.96),rgba(6,10,18,0.96))] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
              Starter Faucet
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              if (!isEligible) return;
              void handleClaimClick();
            }}
            disabled={!isEligible}
            className={actionClassName}
            title={statusLabel}
          >
            {isClaiming
              ? "Sending..."
              : isCoolingDown
                ? formatCooldown(msRemaining)
                : `Claim ${FAUCET_AMOUNT_WOLO} WOLO`}
          </button>
        </div>

        {claimError ? (
          <div className="mt-2 text-[11px] text-red-200/85">{claimError}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,28,0.96),rgba(7,11,19,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-100/55">
            Starter Faucet
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            Claim {FAUCET_AMOUNT_WOLO} WOLO on testnet
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            Real chain. Real wallet. One claim every 24 hours while WoloChain is in testnet mode.
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!isEligible) return;
            void handleClaimClick();
          }}
          disabled={!isEligible}
          className={`shrink-0 rounded-full border px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] transition ${
            isEligible
              ? "border-cyan-300/70 bg-cyan-400/10 text-cyan-100 hover:border-cyan-200 hover:bg-cyan-400/15 hover:text-white"
              : "cursor-not-allowed border-white/10 bg-white/5 text-slate-400"
          }`}
        >
          {primaryLabel}
        </button>
      </div>

      <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${statusTone}`}>
        {statusLabel}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Amount
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {FAUCET_AMOUNT_WOLO} WOLO
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Cooldown
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {isCoolingDown ? formatCooldown(msRemaining) : "Ready"}
          </div>
        </div>
        <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3">
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
            Last Tx
          </div>
          <div className="mt-2 text-sm font-medium text-white">
            {txhash ? formatTxhash(txhash) : "None yet"}
          </div>
        </div>
      </div>

      {txhash ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-slate-300">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
            tx {formatTxhash(txhash)}
          </span>
          {txUrl ? (
            <a
              href={txUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1.5 text-cyan-100 transition hover:bg-cyan-400/15"
            >
              Open on Ping.pub
            </a>
          ) : null}
        </div>
      ) : null}

      {claimError ? (
        <div className="mt-3 text-sm text-red-200/85">{claimError}</div>
      ) : null}
    </div>
  );
}
