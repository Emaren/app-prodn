import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  FlaskConical,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Kingdom Traders",
  description:
    "The public, read-only entry to AoE2WAR's future paper-trading bot workshop.",
  alternates: { canonical: "/kingdom-traders" },
};

const workbenches = [
  {
    id: "bots",
    title: "Trading Bots",
    eyebrow: "Fleet",
    description:
      "A home for paper bot sessions, strategy assignments, and per-bot state when the authenticated PAPER feed is admitted.",
    icon: Bot,
  },
  {
    id: "strategies",
    title: "Strategies",
    eyebrow: "Research",
    description:
      "Twin Blades, Pincer, and other strategies will be evaluated against fees, slippage, and drawdown before any live controls exist.",
    icon: FlaskConical,
  },
  {
    id: "ledger",
    title: "Portfolio & Ledger",
    eyebrow: "Evidence",
    description:
      "Position and execution receipts belong in a verifiable ledger. This gateway never invents PnL, balances, or executions.",
    icon: BarChart3,
  },
] as const;

export default function KingdomTradersPage() {
  return (
    <main className="space-y-7 py-3 text-white sm:space-y-9 sm:py-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-sky-100/15 bg-[radial-gradient(ellipse_at_top_right,rgba(14,165,233,0.18),transparent_55%),linear-gradient(145deg,#0b1424,#030711_75%)] px-6 py-10 shadow-[0_30px_95px_rgba(0,0,0,0.35)] sm:px-10 sm:py-14">
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/25 bg-sky-100/[0.07] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-100">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          PAPER workshop · Read-only gateway
        </div>
        <p className="mt-7 text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
          AoE2WAR · Kingdom Traders
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-black tracking-tight sm:text-6xl">
          Strategy before risk.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300">
          Explore the planned bot fleet, research desks, and evidence ledger in
          one place. The protected PAPER engine remains separate: no bot
          telemetry or trading commands are connected to this public page.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="#workbenches"
            className="inline-flex items-center gap-2 rounded-full border border-sky-200/40 bg-sky-200/15 px-5 py-3 text-sm font-bold text-sky-50 transition hover:bg-sky-200/25"
          >
            Explore the workshop
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/kingdom"
            className="inline-flex items-center rounded-full border border-white/15 px-5 py-3 text-sm font-bold text-slate-200 transition hover:border-white/30 hover:text-white"
          >
            Return to the Kingdom
          </Link>
        </div>
      </section>

      <section
        aria-label="Trading safety and connectivity"
        className="grid gap-3 sm:grid-cols-3"
      >
        {[
          ["Execution connectivity", "Not connected"],
          ["Public bot telemetry", "Not connected"],
          ["Live order entry", "Disabled"],
        ].map(([label, status]) => (
          <div
            key={label}
            className="rounded-[1.25rem] border border-white/10 bg-slate-950/70 px-5 py-4"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-lg font-bold text-amber-100">{status}</p>
          </div>
        ))}
      </section>

      <section id="workbenches" className="scroll-mt-24 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-sky-200/70">
            The workbenches
          </p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">
            Bots, strategy, evidence.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {workbenches.map((bench) => {
            const Icon = bench.icon;
            return (
              <article
                key={bench.id}
                id={bench.id}
                className="rounded-[1.65rem] border border-white/10 bg-[linear-gradient(160deg,rgba(15,23,42,0.92),rgba(3,7,18,0.98))] p-6"
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-sky-200/20 bg-sky-200/[0.07] text-sky-100">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-200/60">
                  {bench.eyebrow}
                </p>
                <h3 className="mt-2 text-2xl font-black">{bench.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">
                  {bench.description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-5 rounded-[1.65rem] border border-amber-200/15 bg-amber-200/[0.035] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-amber-100">
            <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            Protected by design
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
            No exchange keys, real orders, private PAPER API calls, wallet
            transfers, settlement actions, or simulated account values are
            available through this gateway. Authenticated PAPER integration
            requires a separate security and release admission.
          </p>
        </div>
        <Link
          href="/kingdom-progress"
          className="shrink-0 text-sm font-bold text-amber-100 underline-offset-4 hover:underline"
        >
          Kingdom Progress
        </Link>
      </section>
    </main>
  );
}
