import type { Metadata } from "next";
import { Flame } from "lucide-react";

import { kingdomStats } from "@/lib/aoe2warLeague";

import KingdomHero from "./KingdomHero";
import KingdomChroniclesClient from "./KingdomChroniclesClient";

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

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] px-4 py-4 shadow-[0_18px_48px_rgba(0,0,0,0.18)] backdrop-blur-md">
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-black leading-tight text-white">{value}</div>
    </div>
  );
}

export default function KingdomPage() {
  const featuredStats = kingdomStats.slice(0, 3);

  return (
    <main className="space-y-6 overflow-x-hidden py-3 text-white sm:space-y-8 sm:py-5">
      <KingdomHero featuredStats={featuredStats} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {kingdomStats.map((stat) => (
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

      <KingdomChroniclesClient />
    </main>
  );
}
