"use client";

import { FormEvent, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Wallet } from "lucide-react";

import { useUserAuth } from "@/context/UserAuthContext";
import { useKeplr } from "@/hooks/use-keplr";
import { useWoloBalance } from "@/hooks/useWoloBalance";
import type { StakingActivityItem } from "@/lib/staking";

function formatTokenAmount(raw?: string) {
  const amount = Number(raw ?? "0");
  if (!Number.isFinite(amount)) return "0.00";
  return (amount / 1_000_000).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatWholeWolo(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} WOLO`;
}

function formatActivityTime(date = new Date()) {
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortAddress(value: string) {
  if (!value) return "";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export default function StakingQuickStake() {
  const router = useRouter();
  const { isAuthenticated, loading, playerName, loginWithSteam } = useUserAuth();
  const { address, status, connect } = useKeplr();
  const { data: rawBalance, isLoading: balanceLoading } = useWoloBalance(address);
  const [amount, setAmount] = useState("1000");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const balanceLabel = useMemo(
    () => (balanceLoading ? "Syncing" : `${formatTokenAmount(rawBalance)} WOLO`),
    [balanceLoading, rawBalance]
  );

  const amountNumber = Number.parseInt(amount, 10);
  const canSubmit =
    isAuthenticated &&
    status === "connected" &&
    Number.isInteger(amountNumber) &&
    amountNumber > 0 &&
    !isPending;

  async function handleConnect() {
    setError(null);
    setMessage(null);
    try {
      await connect();
    } catch (connectError) {
      setError(connectError instanceof Error ? connectError.message : "Could not connect wallet.");
    }
  }

  function pushActivity(item: StakingActivityItem) {
    window.dispatchEvent(new CustomEvent("staking:activity", { detail: { item } }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!isAuthenticated) {
      loginWithSteam("/staking");
      return;
    }

    let walletAddress = address;
    if (status !== "connected" || !walletAddress) {
      try {
        walletAddress = await connect();
      } catch (connectError) {
        setError(connectError instanceof Error ? connectError.message : "Could not connect wallet.");
        return;
      }
    }

    if (!Number.isInteger(amountNumber) || amountNumber <= 0) {
      setError("Enter a whole WOLO amount.");
      return;
    }

    startTransition(async () => {
      try {
        const response = await fetch("/api/staking/stake", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amountWolo: amountNumber, walletAddress }),
        });
        const payload = (await response.json().catch(() => ({}))) as {
          id?: number;
          detail?: string;
          amountWolo?: number;
        };

        if (!response.ok) {
          throw new Error(payload.detail || "Could not prepare stake request.");
        }

        const postedAmount = payload.amountWolo ?? amountNumber;
        const amountLabel = formatWholeWolo(postedAmount);
        const timestampLabel = formatActivityTime();
        const actor = playerName || shortAddress(walletAddress);

        pushActivity({
          key: payload.id ? `staking-event-${payload.id}` : `staking-event-${Date.now()}`,
          label: `${amountLabel} stake request: ${actor}`,
          detail: "Chain execution pending.",
          meta: timestampLabel,
          eventType: "STAKE",
          amountLabel,
          timestampLabel,
          tone: "amber",
        });

        setMessage("Stake request posted.");
        router.refresh();
      } catch (stakeError) {
        setError(stakeError instanceof Error ? stakeError.message : "Could not prepare stake request.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[1.2rem] border border-amber-300/18 bg-black/20 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="min-w-0 flex-1">
          <label className="text-[11px] uppercase tracking-[0.22em] text-amber-100/70">
            Quick Stake
          </label>
          <div className="mt-2 flex overflow-hidden rounded-full border border-white/10 bg-white/[0.055]">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              aria-label="WOLO stake amount"
              className="min-w-0 flex-1 bg-transparent px-4 py-3 text-base font-semibold text-white outline-none placeholder:text-slate-600"
              placeholder="1000"
            />
            <span className="flex items-center border-l border-white/10 px-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              WOLO
            </span>
          </div>
        </div>

        {!isAuthenticated && !loading ? (
          <button
            type="button"
            onClick={() => loginWithSteam("/staking")}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 md:min-w-32"
          >
            Sign in
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : status === "connected" ? (
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50 md:min-w-36"
          >
            {isPending ? "Posting" : "Stake"}
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              void handleConnect();
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-amber-300 px-5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200 md:min-w-40"
          >
            <Wallet className="h-4 w-4" />
            Connect
          </button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
          Balance {status === "connected" ? balanceLabel : "--"}
        </span>
        <span className="rounded-full border border-emerald-300/15 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">
          Chain pending
        </span>
        {message ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-100">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {message}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2.5 text-sm text-red-100">
          {error}
        </div>
      ) : null}
    </form>
  );
}
