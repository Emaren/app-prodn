"use client";

import Link from "next/link";

export function WoloFeatureTile() {
  return (
    <Link
      href="/wolo"
      className="block rounded-[1.55rem] border border-amber-300/15 bg-[linear-gradient(135deg,rgba(251,191,36,0.08),rgba(15,23,42,0.72)_28%,rgba(17,24,39,0.92)_100%)] px-5 py-5 transition hover:border-amber-300/30 hover:bg-[linear-gradient(135deg,rgba(251,191,36,0.12),rgba(15,23,42,0.78)_28%,rgba(17,24,39,0.96)_100%)]"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/80">$WOLO</div>
            <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-emerald-100">
              chain id wolo
            </div>
          </div>

          <div className="text-4xl font-semibold leading-none tracking-tight text-white tabular-nums sm:text-5xl">
            1,000,000
          </div>

          <p className="max-w-2xl text-sm leading-6 text-slate-300 sm:text-[15px]">
            WOLO is the token layer for tournaments, replay-backed trust, and the next step toward
            verified match identity on AoE2HDBets.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
            Max Supply
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              Tournament rail
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              Replay-linked
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300">
              Wallet-ready
            </span>
          </div>

          <div className="rounded-full bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950">
            Open WOLO
          </div>
        </div>
      </div>
    </Link>
  );
}
