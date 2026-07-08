import type { Metadata } from "next";
import Link from "next/link";
import {
  Castle,
  Coins,
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

import KingdomHero from "./KingdomHero";

export const metadata: Metadata = {
  title: "The Kingdom",
  description: "The founding chronicle and on-chain story of AoE2WAR.",
  alternates: {
    canonical: "/kingdom",
  },
};

const ages = [
  {
    label: "Age I",
    title: "Dark Age",
    body: "One fire. No tribe yet.",
    state: "Mar 23 - Mar 26, 2026",
    active: false,
  },
  {
    label: "Age II",
    title: "Feudal Age",
    body: "The warband gathers.",
    state: "Mar 27 - now",
    active: true,
  },
  {
    label: "Age III",
    title: "Castle Age",
    body: "Clan walls. Royal law.",
    state: "Locked future",
    active: false,
  },
  {
    label: "Age IV",
    title: "Imperial Age",
    body: "Kingdom without end.",
    state: "Locked future",
    active: false,
  },
] as const;

const royalSteps = [
  ["Claim", "Enter the realm and take your place."],
  ["Prove", "Win games, light beacons, upload replays."],
  ["Record", "Chronicles turn effort into memory."],
  ["Reward", "Bounties and WOLO become the kingdom ledger."],
] as const;

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
      className={`group relative overflow-hidden rounded-[1.55rem] border px-4 py-4 transition duration-300 sm:px-5 sm:py-5 ${
        locked
          ? "border-white/8 bg-black/20 opacity-70"
          : item.kind === "bounty"
            ? "border-amber-200/28 bg-[radial-gradient(circle_at_92%_18%,rgba(251,191,36,0.16),transparent_28%),linear-gradient(135deg,rgba(92,50,15,0.48),rgba(6,10,18,0.94))] shadow-[0_0_42px_rgba(245,158,11,0.12)] hover:border-amber-100/44"
            : "border-white/10 bg-white/[0.045] hover:-translate-y-0.5 hover:border-amber-100/22 hover:bg-white/[0.065]"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/30 to-transparent opacity-0 transition group-hover:opacity-100" />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(13rem,0.7fr)_auto] lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${
                locked
                  ? "border-white/10 bg-white/[0.035] text-slate-500"
                  : "border-amber-100/20 bg-amber-300/10 text-amber-100/86"
              }`}
            >
              {item.label}
            </span>
            <span className="text-xs text-slate-500">{item.dateLabel}</span>
          </div>
          <h2 className="mt-2 font-serif text-[1.45rem] font-medium leading-[1.06] tracking-[-0.035em] text-transparent bg-gradient-to-br from-stone-50 via-amber-50 to-amber-300 bg-clip-text sm:text-[1.75rem]">
            {item.title}
          </h2>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-7 text-slate-300/90">{item.body}</p>
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            {item.actor ? (
              <span className="rounded-full border border-sky-200/16 bg-sky-300/10 px-3 py-1 text-xs text-sky-100">
                {item.actor}
              </span>
            ) : null}
            {item.amountWolo ? (
              <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs font-bold text-amber-100">
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
            <div className="mt-2 max-w-full truncate font-mono text-xs text-emerald-100/90">
              {item.txHash}
            </div>
          ) : !locked && item.kind === "transaction" ? (
            <div className="mt-2 text-xs text-slate-500">Proof pending in the indexed rail</div>
          ) : null}
        </div>

        <div className="flex items-center gap-3 lg:justify-end">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${
              locked
                ? "border-white/10 bg-white/[0.04] text-slate-500"
                : "border-amber-100/24 bg-amber-300/10 text-amber-100 shadow-[0_0_24px_rgba(245,158,11,0.10)]"
            }`}
          >
            <ChronicleIcon kind={item.kind} />
          </div>
          {href ? <ExternalLink className="h-4 w-4 text-slate-500 transition group-hover:text-amber-100" /> : null}
        </div>
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
    <div className="absolute -left-[2.55rem] top-6 hidden xl:block">
      <div
        className={`grid h-9 w-9 place-items-center rounded-full border ${
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
  const ledgerStats = kingdomStats.slice(3);

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

      <section
        id="chronicles"
        className="grid gap-6 scroll-mt-28 lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_17rem]"
      >
        <aside className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {ages.map((age) => (
            <article
              key={age.label}
              className={`relative overflow-hidden rounded-[1.55rem] border px-5 py-5 ${
                age.active
                  ? "border-amber-100/38 bg-[radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.16),transparent_32%),linear-gradient(180deg,rgba(23,70,44,0.42),rgba(8,12,18,0.94))] shadow-[0_0_42px_rgba(245,158,11,0.12)]"
                  : "border-white/10 bg-black/24"
              }`}
            >
              <div className="text-[11px] font-black uppercase tracking-[0.26em] text-slate-500">
                {age.label}
              </div>
              <div className="mt-2 font-serif text-2xl text-amber-50">{age.title}</div>
              <p className="mt-4 text-sm leading-6 text-slate-300">{age.body}</p>
              <div className="mt-4 text-xs text-slate-500">{age.state}</div>
            </article>
          ))}
        </aside>

        <div className="relative xl:border-l xl:border-amber-100/12 xl:pl-10">
          <div className="mb-5 flex flex-col gap-3 rounded-[1.6rem] border border-amber-100/14 bg-[linear-gradient(145deg,rgba(120,71,16,0.16),rgba(3,7,18,0.78))] p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.34em] text-amber-100/70">
                <ScrollText className="h-4 w-4" />
                The Royal Chronicle
              </div>
              <h2 className="mt-3 whitespace-nowrap font-serif text-[clamp(1.35rem,2.45vw,2.85rem)] font-medium leading-none tracking-[-0.045em] text-transparent bg-gradient-to-br from-stone-50 via-amber-100 to-amber-300 bg-clip-text drop-shadow-[0_12px_30px_rgba(251,191,36,0.12)]">
                Feudal stories. On-chain memory.
              </h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-400">
              Bounties, citizens, proof, and future locks — the early kingdom written as it happens.
            </p>
          </div>

          <div className="space-y-3">
            {kingdomChronicles.map((item, index) => (
              <ChronicleCard key={item.id} item={item} index={index} />
            ))}
          </div>

          <div className="mt-6 text-center text-xs font-black uppercase tracking-[0.34em] text-slate-500">
            More chronicles will be written.
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[1.55rem] border border-amber-100/16 bg-[linear-gradient(180deg,rgba(120,71,16,0.16),rgba(0,0,0,0.24))] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-amber-100/72">
              <TowerControl className="h-4 w-4" />
              About
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              This is the on-chain history of AoE2WAR. Every Chronicle is a major event in the
              kingdom. Every Bounty is a reward for those who build it.
            </p>
          </div>

          <div className="rounded-[1.55rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-slate-500">
              <Shield className="h-4 w-4" />
              Legend
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-amber-100" />
                Chronicle
              </div>
              <div className="flex items-center gap-2">
                <Swords className="h-4 w-4 text-amber-100" />
                Bounty
              </div>
              <div className="flex items-center gap-2">
                <Coins className="h-4 w-4 text-amber-100" />
                Transaction
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-500" />
                Locked future
              </div>
            </div>
          </div>

          <div className="rounded-[1.55rem] border border-white/10 bg-white/[0.035] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-slate-500">
              <Users className="h-4 w-4" />
              Citizens
            </div>
            <div className="mt-4 grid gap-2 text-sm text-slate-300">
              <Link href="/players/by-name/Julio%20Alvarez" className="hover:text-amber-100">
                Julio Alvarez
              </Link>
              <Link href="/players/by-name/Sniper" className="hover:text-amber-100">
                Sniper
              </Link>
              <Link href="/players/by-name/%5BBDB%5DPigman" className="hover:text-amber-100">
                [BDB]Pigman
              </Link>
              <Link href="/players/by-name/Jim" className="hover:text-amber-100">
                Jim
              </Link>
              <span>Dil_Pascana</span>
              <span>- Ra 𓁛𓇳</span>
            </div>
          </div>

          <div className="rounded-[1.55rem] border border-emerald-100/12 bg-[radial-gradient(circle_at_85%_10%,rgba(16,185,129,0.14),transparent_34%),rgba(255,255,255,0.035)] p-5">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.26em] text-emerald-100/70">
              <Castle className="h-4 w-4" />
              Ledger
            </div>
            <div className="mt-4 grid gap-3">
              {ledgerStats.map((stat) => (
                <div key={stat.label} className="border-t border-white/10 pt-3 first:border-t-0 first:pt-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    {stat.label}
                  </div>
                  <div className="mt-1 text-lg font-black text-white">{stat.value}</div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
