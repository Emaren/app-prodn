"use client";

import { useEffect, useState } from "react";

type WoloStatusSnapshot = {
  healthy: boolean;
  chainId: string;
  moniker: string;
  nodeVersion: string;
  latestBlockHeight: string;
  latestBlockTime: string | null;
  peers: number;
  catchingUp: boolean;
  validatorAddress: string | null;
  latestBlockHash: string | null;
  latestAppHash: string | null;
  source: string;
  terminalLines: string[];
};

function formatTime(value: string | null) {
  if (!value) return "Waiting on node";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Waiting on node";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function WoloChainTerminalTile() {
  const [snapshot, setSnapshot] = useState<WoloStatusSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      try {
        const response = await fetch("/api/wolo/status", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as
          | WoloStatusSnapshot
          | { detail?: string };

        if (!response.ok) {
          throw new Error(typeof payload === "object" && payload && "detail" in payload && typeof payload.detail === "string" ? payload.detail : "Chain status failed.");
        }

        if (!cancelled) {
          setSnapshot(payload as WoloStatusSnapshot);
          setError(null);
        }
      } catch (statusError) {
        if (!cancelled) {
          setError(statusError instanceof Error ? statusError.message : "Chain status failed.");
        }
      }
    }

    void loadStatus();
    const interval = window.setInterval(() => {
      void loadStatus();
    }, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-[#050b15] p-5 sm:rounded-[2rem] sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.35em] text-emerald-200/70">WoloChain Runtime</div>
          <div className="flex flex-wrap items-center gap-2">
            <RuntimeChip label={`height ${snapshot?.latestBlockHeight || "0"}`} />
            <RuntimeChip label={`peers ${snapshot?.peers ?? 0}`} />
            <RuntimeChip label={snapshot?.catchingUp ? "catching up" : "in sync"} />
          </div>
        </div>
        <div
          className={`rounded-full px-3 py-1 text-xs ${
            snapshot?.healthy
              ? "border border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
              : "border border-amber-300/25 bg-amber-400/10 text-amber-100"
          }`}
        >
          {snapshot?.healthy ? "Node live" : "Standby"}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <TerminalStat label="Chain ID" value={snapshot?.chainId || "wolo"} />
          <TerminalStat label="Latest Height" value={snapshot?.latestBlockHeight || "0"} />
          <TerminalStat label="Peers" value={String(snapshot?.peers ?? 0)} />
          <TerminalStat label="Block Time" value={formatTime(snapshot?.latestBlockTime || null)} compact />
        </div>

        <div className="overflow-hidden rounded-[1.5rem] bg-[#020712] shadow-[inset_0_0_0_1px_rgba(52,211,153,0.15)]">
          <div className="flex items-center justify-between border-b border-emerald-500/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.28em] text-emerald-200/70">
              {snapshot?.source || "rpc.aoe2hdbets.com"}
            </div>
            <div className="text-xs text-emerald-100/70">{snapshot?.moniker || "WoloChain"}</div>
          </div>
          <div className="space-y-2 px-4 py-4 font-mono text-[12px] leading-6 text-emerald-300">
            {snapshot?.terminalLines?.length
              ? snapshot.terminalLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)
              : [
                  "[boot] dialing chain rail",
                  "[boot] waiting for node snapshot",
                  error ? `[boot] ${error}` : "[boot] status request in flight",
                ].map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
          </div>
        </div>
      </div>
    </section>
  );
}

function RuntimeChip({ label }: { label: string }) {
  return (
    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
      {label}
    </div>
  );
}

function TerminalStat({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[1.4rem] border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className={compact ? "mt-3 text-lg font-semibold text-white" : "mt-3 text-3xl font-semibold text-white"}>
        {value}
      </div>
    </div>
  );
}
