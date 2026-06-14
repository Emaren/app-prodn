import type { Metadata } from "next";
import Link from "next/link";
import {
  Coins,
  Crown,
  ExternalLink,
  Flame,
  Lock,
  ScrollText,
  Shield,
  Swords,
  TowerControl,
  Users,
} from "lucide-react";

import { kingdomChronicles, kingdomStats, type KingdomChronicle } from "@/lib/aoe2warLeague";

export const metadata: Metadata = {
  title: "The Kingdom",
  description: "The founding chronicle and on-chain story of AoE2WAR.",
};

const ages = [
  {
    label: "Age I",
    title: "Dark Age",
    body: "The wilderness. The first fire.",
    state: "Mar 23 - Jun 5, 2026",
    active: false,
  },
  {
    label: "Age II",
    title: "Feudal Age",
    body: "The kingdom finds its feet.",
    state: "Jun 6 - ?",
    active: true,
  },
  {
    label: "Age III",
    title: "Castle Age",
    body: "The kingdom stands strong.",
    state: "Locked",
    active: false,
  },
  {
    label: "Age IV",
    title: "Imperial Age",
    body: "The empire rises.",
    state: "Locked",
    active: false,
  },
];

function formatWolo(value: number) {
  return value.toLocaleString();
}

function actorHref(actor: string | undefined) {
  if (!actor || actor.includes("/") || actor.includes(",")) return null;
  return `/players/by-name/${encodeURIComponent(actor)}`;
}

function txHref(txHash: string | null | undefined) {
  if (!txHash) return null;
  return `/api/wolo/tx/${encodeURIComponent(txHash)}`;
}

function chronicleHref(item: KingdomChronicle) {
  return txHref(item.txHash) || item.href || actorHref(item.actor);
}

function ChronicleIcon({ kind }: { kind: KingdomChronicle["kind"] }) {
  const className = "h-5 w-5";
  if (kind === "bounty") return <Swords className={className} />;
  if (kind === "transaction") return <Coins className={className} />;
  if (kind === "locked") return <Lock className={className} />;
  return <ScrollText className={className} />;
}

function ChronicleCard({ item, index }: { item: KingdomChronicle; index: number }) {
  const href = chronicleHref(item);
  const locked = item.kind === "locked";
  const content = (
    <div
      className={`grid gap-4 rounded-[1.35rem] border px-4 py-4 transition sm:grid-cols-[minmax(0,1.1fr)_minmax(10rem,0.65fr)_auto] sm:items-center ${
        locked
          ? "border-white/8 bg-black/20 opacity-65"
          : item.kind === "bounty"
            ? "border-amber-300/35 bg-[linear-gradient(135deg,rgba(120,71,16,0.44),rgba(6,10,18,0.9))] shadow-[0_0_36px_rgba(245,158,11,0.14)]"
            : "border-white/10 bg-white/[0.045] hover:border-amber-200/20 hover:bg-white/[0.065]"
      }`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-amber-200/18 bg-amber-300/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-amber-100/80">
            {item.label}
          </span>
          <span className="text-xs text-slate-500">{item.dateLabel}</span>
        </div>
        <h2 className="mt-2 text-xl font-semibold text-white">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          {item.actor ? (
            <span className="rounded-full border border-sky-300/14 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
              {item.actor}
            </span>
          ) : null}
          {item.amountWolo ? (
            <span className="rounded-full border border-amber-300/18 bg-amber-400/10 px-3 py-1 text-xs text-amber-100">
              {formatWolo(item.amountWolo)} WOLO
            </span>
          ) : null}
          {item.status ? (
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs text-slate-300">
              {item.status}
            </span>
          ) : null}
        </div>
        {item.txHash ? (
          <div className="mt-2 max-w-full truncate font-mono text-xs text-emerald-100">
            {item.txHash}
          </div>
        ) : !locked && item.kind === "transaction" ? (
          <div className="mt-2 text-xs text-slate-500">Proof pending in the indexed rail</div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 sm:justify-end">
        <div
          className={`flex h-11 w-11 items-center justify-center rounded-full border ${
            locked
              ? "border-white/10 bg-white/[0.04] text-slate-500"
              : "border-amber-200/25 bg-amber-300/10 text-amber-100"
          }`}
        >
          <ChronicleIcon kind={item.kind} />
        </div>
        {href ? <ExternalLink className="h-4 w-4 text-slate-500" /> : null}
      </div>
    </div>
  );

  if (!href) {
    return (
      <div className="relative">
        <TimelinePin index={index} locked={locked} />
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className="relative block">
      <TimelinePin index={index} locked={locked} />
      {content}
    </Link>
  );
}

function TimelinePin({ index, locked }: { index: number; locked: boolean }) {
  return (
    <div className="absolute -left-[2.45rem] top-6 hidden lg:block">
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full border ${
          locked
            ? "border-white/12 bg-black text-slate-500"
            : "border-amber-200/40 bg-[#17110a] text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.18)]"
        }`}
      >
        {locked ? <Lock className="h-4 w-4" /> : <span className="text-xs">{index + 1}</span>}
      </div>
    </div>
  );
}

function BeaconScene() {
  return (
    <div className="relative min-h-[18rem] overflow-hidden rounded-[1.9rem] border border-amber-200/16 bg-[radial-gradient(circle_at_58%_18%,rgba(251,191,36,0.34),transparent_16%),radial-gradient(circle_at_74%_36%,rgba(148,163,184,0.16),transparent_18%),linear-gradient(145deg,#1b1510,#0c1119_48%,#050608)] shadow-[0_36px_120px_rgba(0,0,0,0.5)]">
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(10deg,rgba(44,36,25,0.98),rgba(18,23,30,0.95)_45%,transparent)]" />
      <div className="absolute bottom-0 right-0 h-44 w-80 bg-[linear-gradient(140deg,transparent_0_22%,rgba(24,31,39,0.98)_23%_56%,transparent_57%)]" />
      <div className="absolute bottom-12 right-14 h-28 w-40 border-x border-t border-amber-100/12 bg-black/24 shadow-[inset_0_18px_30px_rgba(255,255,255,0.04)]" />
      <div className="absolute bottom-32 right-16 h-16 w-9 bg-black/42" />
      <div className="absolute bottom-32 right-28 h-20 w-10 bg-black/42" />
      <div className="absolute bottom-32 right-42 h-14 w-8 bg-black/42" />
      <div className="absolute bottom-16 left-12 h-20 w-20 rounded-full bg-amber-300/10 blur-2xl" />
      <div className="absolute bottom-20 left-20 h-20 w-3 bg-[#2a1b10]" />
      <div className="absolute bottom-40 left-[4.65rem] h-16 w-16 rounded-full bg-orange-500/24 blur-xl" />
      <div className="kingdom-flame absolute bottom-36 left-[5.35rem]" />
      <div className="absolute bottom-16 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-200/18 to-transparent" />
      <div className="absolute left-6 top-6 rounded-full border border-amber-200/18 bg-black/28 px-3 py-1 text-xs uppercase tracking-[0.2em] text-amber-100/80">
        Founder Operating
      </div>
    </div>
  );
}

export default function KingdomPage() {
  return (
    <main className="space-y-6 overflow-x-hidden py-4 text-white sm:space-y-8 sm:py-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-end">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100">
            <Crown className="h-4 w-4" />
            AoE2WAR
          </div>
          <div>
            <h1 className="font-serif text-5xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-7xl">
              The Kingdom
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Every kingdom begins with a single fire. This is our story.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/wolochain"
              className="inline-flex items-center gap-2 rounded-full border border-amber-200/28 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/16"
            >
              View On Chain
              <ExternalLink className="h-4 w-4" />
            </Link>
            <Link
              href="/champions"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-200 transition hover:border-white/22 hover:text-white"
            >
              Championship Belts
            </Link>
          </div>
        </div>

        <BeaconScene />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {kingdomStats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-[1.25rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))] px-4 py-4"
          >
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{stat.label}</div>
            <div className="mt-2 text-lg font-semibold text-white">{stat.value}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)_15rem]">
        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {ages.map((age) => (
            <div
              key={age.label}
              className={`rounded-[1.45rem] border px-5 py-5 ${
                age.active
                  ? "border-amber-200/42 bg-[linear-gradient(180deg,rgba(23,70,44,0.48),rgba(8,12,18,0.92))] shadow-[0_0_36px_rgba(245,158,11,0.12)]"
                  : "border-white/10 bg-black/24"
              }`}
            >
              <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{age.label}</div>
              <div className="mt-2 font-serif text-2xl text-amber-50">{age.title}</div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{age.body}</p>
              <div className="mt-4 text-xs text-slate-500">{age.state}</div>
            </div>
          ))}
        </aside>

        <div className="relative lg:border-l lg:border-amber-200/12 lg:pl-9">
          <div className="space-y-3">
            {kingdomChronicles.map((item, index) => (
              <ChronicleCard key={item.id} item={item} index={index} />
            ))}
          </div>
          <div className="mt-5 text-center text-xs uppercase tracking-[0.34em] text-slate-500">
            More chronicles will be written.
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[1.45rem] border border-amber-200/16 bg-[linear-gradient(180deg,rgba(120,71,16,0.14),rgba(0,0,0,0.24))] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-amber-100/72">
              <TowerControl className="h-4 w-4" />
              About
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              This is the on-chain history of AoE2WAR. Every Chronicle is a major event in the
              kingdom. Every Bounty is a reward for those who build it.
            </p>
          </div>

          <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-slate-500">
              <Shield className="h-4 w-4" />
              Legend
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-2"><ScrollText className="h-4 w-4 text-amber-100" /> Chronicle</div>
              <div className="flex items-center gap-2"><Swords className="h-4 w-4 text-amber-100" /> Bounty</div>
              <div className="flex items-center gap-2"><Coins className="h-4 w-4 text-amber-100" /> Transaction</div>
              <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-slate-500" /> Locked future</div>
            </div>
          </div>

          <div className="rounded-[1.45rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-slate-500">
              <Users className="h-4 w-4" />
              Citizens
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-300">
              <Link href="/players/by-name/Sniper" className="hover:text-amber-100">Sniper</Link>
              <Link href="/players/by-name/Julio%20Alvarez" className="hover:text-amber-100">Julio Alvarez</Link>
              <Link href="/players/by-name/Jim" className="hover:text-amber-100">Jim</Link>
              <span>Ra</span>
              <span>Dil_Pascana</span>
              <span>Pigman</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="rounded-[1.7rem] border border-white/10 bg-black/24 px-5 py-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            ["How It Works", "Claim any vacant nation."],
            ["Win A Game", "Prove your skill on the battlefield."],
            ["Light The Beacon", "Become your nation's champion."],
            ["Earn 10 WOLO", "Claim the bounty and build your reign."],
            ["Proof", "Transactions become the story."],
          ].map(([label, body]) => (
            <div key={label} className="flex items-start gap-3">
              <Flame className="mt-1 h-4 w-4 shrink-0 text-amber-100" />
              <div>
                <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{label}</div>
                <div className="mt-1 text-sm text-slate-300">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
