import type { Metadata } from "next";
import Link from "next/link";
import { Anvil, ArrowRight, Eye, Flame, Scale } from "lucide-react";

import { loadKingdomSummary } from "@/lib/kingdomSummary";

import KingdomHero from "./KingdomHero";
import KingdomChroniclesClient from "./KingdomChroniclesClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The Kingdom",
  description: "The founding chronicle and on-chain story of AoE2WAR.",
  alternates: {
    canonical: "/kingdom",
  },
};

const royalSteps = [
  ["Claim", "Enter the realm and take your place."],
  ["Prove", "Win games, light beacons, upload replays."],
  ["Record", "Chronicles turn effort into memory."],
  ["Reward", "Bounties and WOLO become the kingdom ledger."],
] as const;

const civicHalls = [
  {
    href: "/round-chamber",
    title: "Round Chamber",
    eyebrow: "How the Kingdom governs",
    body: "Bring proposals into the circle, cast a civic ballot, debate the law, and follow every mandate through the Chronicle.",
    icon: Scale,
    tone: "from-amber-300/14 via-amber-200/[0.04] to-transparent",
  },
  {
    href: "/kingdom-forge",
    title: "Kingdom Forge",
    eyebrow: "What the Kingdom builds",
    body: "Direct excess staking power into named projects, milestones, patrons, architects, and 10,000 finite Feature Deeds.",
    icon: Anvil,
    tone: "from-orange-400/14 via-orange-300/[0.04] to-transparent",
  },
  {
    href: "/oracle",
    title: "The Oracle",
    eyebrow: "What the Kingdom believes",
    body: "Price the future through exact-rule markets on growth, games, economy, Forge milestones, and civic momentum.",
    icon: Eye,
    tone: "from-violet-400/14 via-cyan-300/[0.04] to-transparent",
  },
] as const;

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black leading-tight text-white">{value}</div>
    </div>
  );
}

export default async function KingdomPage() {
  const summary = await loadKingdomSummary();
  const featuredStats = summary.stats.slice(0, 3);

  return (
    <main className="space-y-6 overflow-x-hidden py-3 text-white sm:space-y-8 sm:py-5">
      <KingdomHero featuredStats={featuredStats} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {summary.stats.map((stat) => (
          <StatTile key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        {royalSteps.map(([label, body], index) => (
          <article
            key={label}
            className="group relative overflow-hidden rounded-[1.55rem] border border-white/10 bg-[linear-gradient(145deg,rgba(15,23,42,0.82),rgba(3,7,18,0.92))] p-5 transition hover:-translate-y-0.5 hover:border-amber-100/22"
          >
            <div className="absolute right-4 top-4 font-serif text-5xl text-white/[0.035]">
              0{index + 1}
            </div>
            <div className="grid h-12 w-12 place-items-center rounded-[1rem] border border-amber-100/16 bg-amber-200/[0.07] text-amber-100">
              <Flame className="h-5 w-5" />
            </div>
            <div className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/65">
              {label}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-300">{body}</p>
          </article>
        ))}
      </section>

      <section className="space-y-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-100/55">
            The civic crown
          </div>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">
            Govern it. Forge it. Price its future.
          </h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {civicHalls.map((hall) => {
            const Icon = hall.icon;
            return (
              <Link
                key={hall.href}
                href={hall.href}
                className={`group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br ${hall.tone} p-6 transition hover:-translate-y-0.5 hover:border-amber-100/25`}
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl border border-amber-100/16 bg-black/25 text-amber-100">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-5 text-[10px] font-black uppercase tracking-[0.25em] text-amber-100/55">
                  {hall.eyebrow}
                </div>
                <h3 className="mt-2 text-2xl font-black text-white">{hall.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{hall.body}</p>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-amber-100">
                  Enter <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <KingdomChroniclesClient citizens={summary.citizens} ledgerStats={summary.ledgerStats} />
    </main>
  );
}
