import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Crown, Flame, Map, Shield, Sparkles, Trophy } from "lucide-react";

import { nationalBeacons, type NationalBeacon } from "@/lib/aoe2warLeague";

export const metadata: Metadata = {
  title: "National Champions",
  description: "AoE2WAR national champions and beacon-fire bounty map.",
};

function flameScore(beacon: NationalBeacon) {
  if (beacon.tier === "world") return 1.5;
  if (beacon.tier === "lit") return 1 + Math.min(0.35, beacon.tenureDays / 80);
  return 0.55;
}

function playerHref(champion: string | null) {
  if (!champion) return null;
  return `/players/by-name/${encodeURIComponent(champion)}`;
}

function BeaconMarker({ beacon }: { beacon: NationalBeacon }) {
  const lit = Boolean(beacon.champion);
  const scale = flameScore(beacon);
  const href = playerHref(beacon.champion);
  const markerStyle = {
    left: `${beacon.x}%`,
    top: `${beacon.y}%`,
    "--beacon-scale": String(scale),
  } as CSSProperties;
  const content = (
    <div
      className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 ${lit ? "" : "opacity-78"}`}
      style={markerStyle}
    >
      <div className="relative flex flex-col items-center">
        <div className={`beacon-fire ${lit ? "beacon-fire-lit" : "beacon-fire-cold"}`} />
        <div
          className={`relative h-9 w-7 border-x border-t ${
            lit ? "border-amber-200/35 bg-amber-950/45" : "border-white/12 bg-black/42"
          }`}
        >
          <div className="absolute left-1/2 top-2 h-2 w-2 -translate-x-1/2 rounded-full bg-black/55" />
          <div className="absolute inset-x-[-5px] bottom-[-6px] h-2 rounded-full bg-black/50" />
        </div>
        <div
          className={`mt-2 min-w-[8rem] rounded-xl border px-3 py-2 text-center shadow-[0_16px_36px_rgba(0,0,0,0.38)] ${
            lit
              ? "border-amber-200/36 bg-black/70 text-amber-50"
              : "border-white/12 bg-black/62 text-slate-300"
          }`}
        >
          <div className="text-[10px] uppercase tracking-[0.16em] text-slate-400">{beacon.country}</div>
          <div className="mt-1 text-sm font-semibold">
            {beacon.champion || "Vacant"}
          </div>
          <div className="mt-1 text-[11px] text-amber-100">{beacon.bountyWolo} WOLO bounty</div>
        </div>
      </div>
    </div>
  );

  if (!href) return content;
  return (
    <Link href={href} aria-label={`${beacon.country} champion ${beacon.champion}`}>
      {content}
    </Link>
  );
}

function Continent({ className }: { className: string }) {
  return <div className={`absolute rounded-[45%] border border-amber-100/8 bg-stone-500/13 blur-[0.2px] ${className}`} />;
}

function WorldMap() {
  return (
    <div className="relative min-h-[34rem] overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_51%_42%,rgba(251,191,36,0.16),transparent_22%),radial-gradient(circle_at_25%_58%,rgba(239,68,68,0.12),transparent_18%),linear-gradient(145deg,#06101a,#0d151b_48%,#050607)] shadow-[0_38px_130px_rgba(0,0,0,0.46)]">
      <div className="absolute inset-0 opacity-70 [background-image:linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] [background-size:64px_64px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0_45%,rgba(0,0,0,0.55)_88%)]" />
      <Continent className="left-[10%] top-[28%] h-[18rem] w-[20rem] rotate-[-18deg]" />
      <Continent className="left-[27%] top-[54%] h-[16rem] w-[11rem] rotate-[14deg]" />
      <Continent className="left-[43%] top-[25%] h-[18rem] w-[24rem] rotate-[4deg]" />
      <Continent className="left-[56%] top-[28%] h-[20rem] w-[30rem] rotate-[-8deg]" />
      <Continent className="left-[49%] top-[61%] h-[15rem] w-[11rem] rotate-[2deg]" />
      <Continent className="left-[75%] top-[68%] h-[10rem] w-[14rem] rotate-[14deg]" />
      <div className="absolute left-[45%] top-[33%] h-36 w-36 rounded-full bg-amber-300/14 blur-3xl" />
      {nationalBeacons.map((beacon) => (
        <BeaconMarker key={beacon.id} beacon={beacon} />
      ))}
    </div>
  );
}

function BeaconListCard({ beacon, rank }: { beacon: NationalBeacon; rank?: number }) {
  const lit = Boolean(beacon.champion);
  const href = playerHref(beacon.champion);
  const body = (
    <article
      className={`rounded-[1.45rem] border p-4 ${
        lit
          ? "border-amber-200/26 bg-[linear-gradient(135deg,rgba(120,71,16,0.28),rgba(0,0,0,0.28))]"
          : "border-white/10 bg-white/[0.035]"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border ${
              lit ? "border-amber-200/35 bg-amber-300/10 text-amber-100" : "border-white/10 bg-black/22 text-slate-500"
            }`}
          >
            {rank ? <span className="text-lg font-semibold">{rank}</span> : <Flame className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-[0.24em] text-slate-500">{beacon.country}</div>
            <div className="mt-1 truncate text-xl font-semibold text-white">{beacon.champion || "Vacant"}</div>
            <div className="mt-1 text-sm text-slate-400">
              {lit ? `${beacon.tenureDays} day reign` : "10 WOLO to take"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold text-amber-100">{beacon.bountyWolo}</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">WOLO</div>
        </div>
      </div>
    </article>
  );

  return href ? <Link href={href}>{body}</Link> : body;
}

export default function NationalChampionsPage() {
  const litBeacons = nationalBeacons.filter((beacon) => beacon.champion);
  const vacantBeacons = nationalBeacons.filter((beacon) => !beacon.champion);
  const totalBounty = nationalBeacons.reduce((sum, beacon) => sum + beacon.bountyWolo, 0);

  return (
    <main className="space-y-7 overflow-x-hidden py-4 text-white sm:py-6">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)] lg:items-center">
        <div className="space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-amber-100">
            <Map className="h-4 w-4" />
            AoE2HD Bets
          </div>
          <div>
            <div className="font-serif text-2xl uppercase tracking-[0.45em] text-amber-100/78">
              National
            </div>
            <h1 className="font-serif text-6xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-8xl">
              Champions
            </h1>
            <p className="mt-5 max-w-xl text-sm uppercase tracking-[0.22em] text-slate-300 sm:text-base">
              The beacons are lit. Every nation awaits its champion.
            </p>
          </div>
          <div className="rounded-[1.35rem] border border-amber-200/16 bg-amber-300/10 p-4">
            <div className="flex items-start gap-3">
              <Shield className="mt-1 h-5 w-5 text-amber-100" />
              <div>
                <div className="text-sm font-semibold text-white">Claim your nation</div>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  Win a game. Light the beacon. Earn 10 WOLO to take the first vacant title.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <WorldMap />
        </div>
      </section>

      <section className="lg:hidden">
        <div className="rounded-[1.7rem] border border-white/10 bg-black/24 p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
            <Flame className="h-4 w-4" />
            Beacon list
          </div>
          <div className="mt-4 grid gap-3">
            {nationalBeacons.map((beacon) => (
              <BeaconListCard
                key={beacon.id}
                beacon={beacon}
                rank={beacon.champion ? litBeacons.findIndex((entry) => entry.id === beacon.id) + 1 : undefined}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.22))] p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                <Crown className="h-4 w-4" />
                Active Beacons
              </div>
              <h2 className="mt-2 text-2xl font-semibold text-white">The current national champions</h2>
            </div>
            <span className="rounded-full border border-amber-200/18 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              {litBeacons.length} / {nationalBeacons.length} lit
            </span>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {litBeacons.map((beacon, index) => (
              <BeaconListCard key={beacon.id} beacon={beacon} rank={index + 1} />
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {vacantBeacons.slice(0, 8).map((beacon) => (
              <BeaconListCard key={beacon.id} beacon={beacon} />
            ))}
          </div>
        </div>

        <aside className="grid gap-5">
          <section className="rounded-[1.8rem] border border-amber-200/16 bg-[radial-gradient(circle_at_20%_10%,rgba(251,191,36,0.22),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.26))] p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-amber-100/72">
              <Trophy className="h-4 w-4" />
              Claim Your Nation
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-300">
              Any vacant nation can be yours. Win a game to light the beacon and earn 10 WOLO.
            </p>
            <Link
              href="/bets"
              className="mt-5 inline-flex w-full items-center justify-center rounded-full border border-amber-200/28 bg-amber-300/10 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-300/16"
            >
              View Open Bets
            </Link>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
              <Sparkles className="h-4 w-4" />
              Beacon Economy
            </div>
            <div className="mt-5 grid gap-3">
              <Stat label="Beacons Lit" value={`${litBeacons.length} / ${nationalBeacons.length}`} />
              <Stat label="Total Bounty Pool" value={`${totalBounty} WOLO`} />
              <Stat label="Largest Flame" value="United Kingdom" />
              <Stat label="Vacant Nations" value={String(vacantBeacons.length)} />
            </div>
          </section>
        </aside>
      </section>

      <section className="rounded-[1.8rem] border border-white/10 bg-black/24 p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Claim any vacant nation", "Step into an empty beacon slot."],
            ["Win a game", "Prove your skill on the battlefield."],
            ["Light the beacon", "Become your nation's champion."],
            ["Earn 10 WOLO", "Claim the bounty and build your reign."],
          ].map(([title, body], index) => (
            <div key={title} className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-200/18 bg-amber-300/10 text-amber-100">
                {index + 1}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">{title}</div>
                <div className="mt-1 text-sm leading-6 text-slate-400">{body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.1rem] border border-white/8 bg-white/[0.035] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-2 text-lg font-semibold text-amber-100">{value}</div>
    </div>
  );
}
