"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, Bot, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";

type Telemetry = {
  mode: string;
  fundingEnabled: boolean;
  totals: { presets: number; enabledPresets: number; executions: number };
  executionStatuses: Array<{ status: string; count: number }>;
  presets: Array<{
    id: number; uid: string; player: string; enabled: boolean; version: number;
    winnerStakeWolo: number; desyncSide: string; desyncStakeWolo: number;
    gamesRemaining: number | null; untilOut: boolean; pausedReason: string | null; updatedAt: string;
  }>;
  executions: Array<{
    id: number; uid: string; player: string; status: string; reason: string | null;
    market: string; winnerMarketId: number; winnerStakeWolo: number; desyncStakeWolo: number;
    attemptCount: number; acceptedAt: string | null; createdAt: string;
  }>;
};

export default function AutoBetOpsPage() {
  const [snapshot, setSnapshot] = useState<Telemetry | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/auto-bets", { cache: "no-store" });
      const data = (await response.json()) as Telemetry & { detail?: string };
      if (!response.ok || !data?.totals) throw new Error(data?.detail || "Admin access required");
      setSnapshot(data);
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "Telemetry unavailable");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const presets = useMemo(() => snapshot?.presets.filter((row) =>
    (row.uid + " " + row.player).toLowerCase().includes(query.toLowerCase())) ?? [], [snapshot, query]);
  const executions = useMemo(() => snapshot?.executions.filter((row) =>
    (row.uid + " " + row.player + " " + row.market + " " + row.status)
      .toLowerCase().includes(query.toLowerCase())) ?? [], [snapshot, query]);

  return (
    <main className="mx-auto max-w-[94rem] space-y-6 px-4 py-8 text-white sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/admin" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-amber-200">
            <ArrowLeft className="h-4 w-4" /> BACK TO COMMAND
          </Link>
          <div className="mt-3 flex items-center gap-3 text-amber-200">
            <Bot className="h-8 w-8" />
            <span className="text-[10px] font-black uppercase tracking-[.28em]">MECHA COMMAND / OPERATIONS</span>
          </div>
          <h1 className="mt-2 font-serif text-4xl font-bold tracking-tight">The Mecha War Room</h1>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-xs font-black uppercase tracking-[.12em] text-amber-100 hover:bg-amber-200/20 disabled:opacity-50">
          <RefreshCw className={"h-4 w-4 " + (busy ? "animate-spin" : "")} /> Refresh evidence
        </button>
      </div>
      <div className="rounded-2xl border border-amber-200/20 bg-amber-200/[.06] px-5 py-4 text-xs text-amber-100">
        <ShieldAlert className="mr-2 inline h-4 w-4" />
        READ-ONLY COMMAND · NO USER FUNDS, SIGNERS, OR BET ACTIONS ARE EXPOSED.
        {!snapshot?.fundingEnabled && <span className="ml-2 font-black">PREVIEW CUSTODY IS OFFLINE.</span>}
      </div>
      {error && <div role="alert" className="rounded-xl border border-rose-300/30 bg-rose-400/10 p-4 text-rose-200">{error}</div>}
      {snapshot && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["PRESETS", snapshot.totals.presets],
              ["ARMED PREVIEWS", snapshot.totals.enabledPresets],
              ["SHADOW EXECUTIONS", snapshot.totals.executions],
              ["FUNDED EXECUTOR", snapshot.fundingEnabled ? "ONLINE" : "OFFLINE"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/80 p-5">
                <div className="text-[10px] font-black tracking-[.2em] text-slate-400">{label}</div>
                <div className="mt-3 text-3xl font-black text-amber-200 tabular-nums">{value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-300" />
            {snapshot.executionStatuses.map((row) => (
              <span key={row.status} className="rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] text-slate-300">
                {row.status.replaceAll("_", " ")} · {row.count}
              </span>
            ))}
          </div>
          <label className="block max-w-lg text-[11px] font-bold uppercase tracking-[.13em] text-slate-400">
            Operator filter
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Player, UID, market, status"
              className="mt-2 block w-full rounded-xl border border-white/15 bg-slate-950 px-4 py-3 text-sm normal-case tracking-normal text-white outline-none focus:border-amber-300" />
          </label>
          <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-black uppercase tracking-[.08em]"><ShieldCheck className="mr-2 inline h-5 w-5 text-amber-200" />Player loadouts</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[770px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-slate-400">
                  <tr><th className="py-3">Player</th><th>Preset</th><th>Winner</th><th>D-Sync</th><th>Games</th><th>Version</th><th>Updated</th></tr>
                </thead>
                <tbody>
                  {presets.map((row) => (
                    <tr key={row.id} className="border-b border-white/[.06] text-slate-300">
                      <td className="py-3"><span className="font-bold text-white">{row.player}</span><span className="block text-xs text-slate-500">{row.uid}</span></td>
                      <td>{row.enabled ? <span className="text-emerald-300">SHADOW ARMED</span> : "PAUSED"}</td>
                      <td>{row.winnerStakeWolo} WOLO</td><td>{row.desyncSide === "none" ? "OFF" : row.desyncSide.toUpperCase() + " · " + row.desyncStakeWolo}</td>
                      <td>{row.untilOut ? "Until Out" : row.gamesRemaining}</td><td>v{row.version}</td>
                      <td>{new Date(row.updatedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {presets.length === 0 && <p className="py-5 text-sm text-slate-500">No matching loadouts.</p>}
            </div>
          </section>
          <section className="rounded-2xl border border-white/10 bg-slate-950/75 p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-black uppercase tracking-[.08em]">Durable decision tape</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[790px] text-left text-sm">
                <thead className="border-b border-white/10 text-[10px] uppercase tracking-[.14em] text-slate-400">
                  <tr><th className="py-3">Decision</th><th>Player</th><th>Canonical market</th><th>Status</th><th>Proposed stake</th><th>Attempts</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {executions.map((row) => (
                    <tr key={row.id} className="border-b border-white/[.06] text-slate-300">
                      <td className="py-3 font-mono text-amber-200">#{row.id}</td><td>{row.player}</td>
                      <td>{row.market}<span className="ml-1 text-xs text-slate-500">#{row.winnerMarketId}</span></td>
                      <td className="text-emerald-300">{row.status.replaceAll("_", " ")}</td>
                      <td>{row.winnerStakeWolo + row.desyncStakeWolo} WOLO</td><td>{row.attemptCount}</td>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {executions.length === 0 && <p className="py-5 text-sm text-slate-500">No matching evidence.</p>}
            </div>
          </section>
          <p className="text-xs text-slate-500">Latest 100 presets / 75 decisions. Evidence is bounded; totals cover all known rows. No mutation controls.</p>
        </>
      )}
    </main>
  );
}
