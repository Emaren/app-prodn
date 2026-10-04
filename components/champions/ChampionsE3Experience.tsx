"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Gem,
  Globe2,
  Medal,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";

import ChampionsDisplayRail from "@/components/champions/ChampionsDisplayRail";
import { avatarCardUrlForUser } from "@/lib/avatarAssets";
import type {
  ChampionsLane,
  ChampionsV2EloDivision,
  ChampionsV2ModeChampion,
  ChampionsV2NationalBelt,
  ChampionsV2State,
  ChampionsV2TeamTitle,
} from "@/lib/champions/championsV2";
import type { ChampionTitleState } from "@/lib/champions/titleState";
import type { TitleContender } from "@/lib/champions/titles";

const MALE_SILHOUETTE = "/champions/players/silhouette.card.webp";
const FEMALE_SILHOUETTE = "/champions/players/female_silhouette.webp";

function managedMediaPublicUrl(
  kind: "belt" | "artifact",
  target: string,
  fallback: string,
) {
  return `/api/media-assets/${encodeURIComponent(kind)}/${encodeURIComponent(target)}?fallback=${encodeURIComponent(fallback)}`;
}

function holderAvatar(holder: { name: string; uid?: string | null } | null, female = false) {
  if (holder?.uid) return avatarCardUrlForUser(holder.uid, holder.name);
  return female ? FEMALE_SILHOUETTE : MALE_SILHOUETTE;
}

function statusPill(held: boolean) {
  return held ? "Held" : "Vacant";
}

function HolderBox({
  holder,
}: {
  holder: { name: string; href?: string | null } | null;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
        Holder
      </div>
      {holder?.href ? (
        <Link
          href={holder.href}
          className="mt-1 block text-lg font-semibold text-white transition hover:text-amber-100"
        >
          {holder.name}
        </Link>
      ) : (
        <div className="mt-1 text-lg font-semibold text-white">
          {holder?.name || "Vacant"}
        </div>
      )}
    </div>
  );
}

function ContenderRows({
  contenders,
  max = 10,
}: {
  contenders: TitleContender[];
  max?: number;
}) {
  const rows = contenders.slice(0, max);
  return (
    <div className="space-y-1.5">
      {rows.map((row, index) => (
        <div
          key={`${row.rank}-${row.name}-${index}`}
          className="grid grid-cols-[1.7rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-white/8 bg-black/18 px-2.5 py-2"
        >
          <span className="font-mono text-[10px] text-amber-100/75">
            {row.rank ?? index + 1}
          </span>
          <div className="min-w-0">
            {row.href ? (
              <Link
                href={row.href}
                className="block truncate text-xs font-semibold text-white transition hover:text-amber-100"
              >
                {row.name}
              </Link>
            ) : (
              <div className="truncate text-xs font-semibold text-white">{row.name}</div>
            )}
            <div className="truncate text-[10px] text-slate-500">
              {row.meta || row.ratingLabel || row.badge || "Verified contender"}
            </div>
          </div>
          <span className="text-[10px] font-semibold text-slate-400">
            {row.rating ?? ""}
          </span>
        </div>
      ))}
      {Array.from({ length: Math.max(0, Math.min(max, 10) - rows.length) }, (_, index) => (
        <div
          key={`open-${index}`}
          className="grid grid-cols-[1.7rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-dashed border-white/8 bg-black/10 px-2.5 py-2"
        >
          <span className="font-mono text-[10px] text-slate-600">{rows.length + index + 1}</span>
          <span className="truncate text-[10px] text-slate-600">Open contender</span>
        </div>
      ))}
    </div>
  );
}

function LegacyCrownCard({
  title,
  position,
}: {
  title: ChampionTitleState;
  position: "left" | "center" | "right";
}) {
  const holder = title.holders[0] ?? null;
  const isCenter = position === "center";
  const backdrop = holderAvatar(holder, title.type === "womens");
  const beltUrl = managedMediaPublicUrl(
    title.type === "designation" ? "artifact" : "belt",
    title.id,
    title.assetUrl,
  );
  const orderClass =
    position === "left"
      ? "xl:order-1 xl:translate-y-8"
      : position === "center"
        ? "xl:order-2"
        : "xl:order-3 xl:translate-y-8";

  return (
    <article
      className={`relative min-w-0 overflow-hidden rounded-[1.7rem] border border-amber-200/18 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.13),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(0,0,0,0.30))] p-4 shadow-2xl ${orderClass} ${isCenter ? "xl:-mt-3 xl:p-5" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[9px] font-black uppercase tracking-[0.25em] text-amber-100/58">
          {title.eyebrow}
        </div>
        <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-300">
          {statusPill(title.status === "held")}
        </span>
      </div>
      <Link href={title.routeHref} className="mt-2 block">
        <h2 className={`${isCenter ? "text-3xl" : "text-2xl"} font-serif font-semibold text-amber-50`}>
          {title.displayName}
        </h2>
      </Link>
      <div className={`relative mx-auto mt-2 ${isCenter ? "h-[28rem]" : "h-[23rem]"} max-w-[28rem]`}>
        <Image
          src={backdrop}
          alt=""
          fill
          unoptimized
          sizes="360px"
          className="object-contain object-bottom opacity-72 [mask-image:linear-gradient(180deg,black_0%,black_78%,transparent_100%)]"
        />
        <div className="absolute inset-x-0 bottom-[-7%] z-10 h-[46%]">
          <Image
            src={beltUrl}
            alt={title.displayName}
            fill
            unoptimized
            sizes="360px"
            className="object-contain drop-shadow-[0_18px_34px_rgba(0,0,0,0.58)]"
          />
        </div>
      </div>
      <div className="relative z-20 space-y-3">
        <HolderBox holder={holder} />
        <ContenderRows contenders={title.contenders} max={isCenter ? 10 : 6} />
        <Link
          href={title.routeHref}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-amber-200/18 bg-amber-300/10 px-4 py-2.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/15"
        >
          Open championship
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function ModeCrownCard({
  champion,
}: {
  champion: ChampionsV2ModeChampion;
}) {
  const holder = champion.holders?.[0] ?? null;
  return (
    <article className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[radial-gradient(circle_at_50%_0%,rgba(96,165,250,0.10),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.28))] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-500">
            {champion.lane.toUpperCase()} throne
          </div>
          <h3 className="mt-1 font-serif text-2xl font-semibold text-white">{champion.name}</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">
          {holder ? "Held" : "Vacant"}
        </span>
      </div>
      <div className="relative mx-auto mt-2 h-[24rem] max-w-[25rem]">
        <Image
          src={holderAvatar(holder)}
          alt=""
          fill
          unoptimized
          sizes="340px"
          className={`object-contain object-bottom ${holder ? "opacity-80" : "opacity-48"}`}
        />
        <div className="absolute inset-x-0 bottom-0 h-36">
          <Image
            src={champion.beltUrl}
            alt={champion.name}
            fill
            unoptimized
            sizes="340px"
            className="object-contain drop-shadow-[0_16px_28px_rgba(0,0,0,0.65)]"
          />
        </div>
      </div>
      <div className="space-y-3">
        <HolderBox holder={holder ?? null} />
        <ContenderRows contenders={champion.contenders} max={10} />
      </div>
    </article>
  );
}

function TeamQueue({
  title,
}: {
  title: ChampionsV2TeamTitle;
}) {
  const slots = title.contenders.slice(0, 5);
  return (
    <div className="space-y-1.5">
      {slots.map((row) => (
        <div
          key={row.rank}
          className="grid grid-cols-[1.7rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/8 bg-black/18 px-2.5 py-2"
        >
          <span className="font-mono text-[10px] text-amber-100/75">{row.rank}</span>
          <div className="truncate text-xs font-semibold text-white">
            {row.members.map((member) => member.name).join(" · ")}
          </div>
        </div>
      ))}
      {Array.from({ length: Math.max(0, 5 - slots.length) }, (_, index) => (
        <div
          key={`team-open-${index}`}
          className="grid grid-cols-[1.7rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-dashed border-white/8 bg-black/10 px-2.5 py-2"
        >
          <span className="font-mono text-[10px] text-slate-600">{slots.length + index + 1}</span>
          <span className="text-[10px] text-slate-600">Open team contender</span>
        </div>
      ))}
    </div>
  );
}

function TeamCrownCard({
  title,
  lane,
}: {
  title: ChampionsV2TeamTitle;
  lane: ChampionsLane;
}) {
  const holders = title.holders ?? [];
  return (
    <article className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(0,0,0,0.26))] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">
            {lane.toUpperCase()} · {title.size}v{title.size}
          </div>
          <h3 className="mt-1 font-serif text-xl font-semibold text-white">{title.name}</h3>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">
          {holders.length ? "Held" : "Vacant"}
        </span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <div className="relative h-44 overflow-hidden rounded-2xl border border-white/8 bg-black/18">
            <Image
              src={title.beltUrl}
              alt={title.name}
              fill
              unoptimized
              sizes="300px"
              className="object-contain p-2 drop-shadow-[0_16px_28px_rgba(0,0,0,0.62)]"
            />
          </div>
          <div className="mt-2 rounded-xl border border-white/8 bg-black/20 px-3 py-2.5">
            <div className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">Holders</div>
            <div className="mt-1 text-xs font-semibold text-white">
              {holders.length ? holders.map((holder) => holder.name).join(" · ") : "Vacant"}
            </div>
          </div>
        </div>
        <div>
          <div className="mb-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
            Commissioner queue
          </div>
          <TeamQueue title={title} />
        </div>
      </div>
    </article>
  );
}

function NationalCard({ belt }: { belt: ChampionsV2NationalBelt }) {
  return (
    <article className="flex min-h-[26rem] flex-col overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,27,0.96),rgba(2,5,12,0.99))]">
      <div className="relative h-56 border-b border-white/8">
        <div className="absolute left-4 top-4 z-20 text-3xl">{belt.flag}</div>
        <span className="absolute right-4 top-4 z-20 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-slate-400">
          {belt.active ? "Held" : "Vacant"}
        </span>
        <Image
          src={holderAvatar(belt.holder)}
          alt=""
          fill
          unoptimized
          sizes="280px"
          className={`object-contain object-bottom ${belt.holder ? "opacity-72" : "opacity-36"}`}
        />
        <div className="absolute inset-x-0 bottom-0 h-24">
          <Image
            src={belt.beltUrl}
            alt={`${belt.country} championship belt`}
            fill
            unoptimized
            sizes="280px"
            className="object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.72)]"
          />
        </div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-[8px] font-black uppercase tracking-[0.22em] text-amber-100/50">
          {belt.scope === "regional" ? "Regional crown" : "National crown"}
        </div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-white">{belt.country}</h3>
        <div className="mt-3">
          <HolderBox holder={belt.holder} />
        </div>
        <div className="mt-3">
          <ContenderRows contenders={belt.contenders} max={3} />
        </div>
        {belt.routeHref ? (
          <Link
            href={belt.routeHref}
            className="mt-auto pt-4 text-center text-[10px] font-black uppercase tracking-[0.16em] text-amber-100/80 transition hover:text-amber-50"
          >
            Open belt →
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function EloCard({
  division,
  lane,
}: {
  division: ChampionsV2EloDivision;
  lane: ChampionsLane;
}) {
  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-[linear-gradient(180deg,rgba(8,15,27,0.96),rgba(2,5,12,0.99))]">
      <div className="relative h-56 border-b border-white/8">
        <div className="absolute left-4 top-4 z-20 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-slate-400">
          {lane.toUpperCase()}
        </div>
        <Image
          src={holderAvatar(division.holder)}
          alt=""
          fill
          unoptimized
          sizes="260px"
          className={`object-contain object-bottom ${division.holder ? "opacity-78" : "opacity-40"}`}
        />
        <div className="absolute inset-x-0 bottom-0 h-24">
          <Image
            src={division.beltUrl}
            alt={division.displayName}
            fill
            unoptimized
            sizes="260px"
            className="object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.72)]"
          />
        </div>
      </div>
      <div className="p-4">
        <div className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">{division.eyebrow}</div>
        <h3 className="mt-1 font-serif text-xl font-semibold text-white">{division.shortName}</h3>
        <div className="mt-3">
          <HolderBox holder={division.holder} />
        </div>
        <div className="mt-3">
          <ContenderRows contenders={division.contenders} max={10} />
        </div>
      </div>
    </article>
  );
}

function DesignationCard({ title }: { title: ChampionTitleState }) {
  const holder = title.holders[0] ?? null;
  return (
    <Link
      href={title.routeHref}
      className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-violet-200/20 hover:bg-violet-300/[0.05]"
    >
      <div className="relative h-14 w-14 shrink-0">
        <Image
          src={managedMediaPublicUrl("artifact", title.id, title.assetUrl)}
          alt=""
          fill
          unoptimized
          sizes="56px"
          className="object-contain"
        />
      </div>
      <div className="min-w-0">
        <div className="text-[8px] font-black uppercase tracking-[0.2em] text-violet-100/45">
          Special designation
        </div>
        <div className="mt-1 truncate font-semibold text-white group-hover:text-violet-100">{title.displayName}</div>
        <div className="mt-1 text-xs text-slate-500">{holder?.name || "Vacant"}</div>
      </div>
    </Link>
  );
}

function SectionHeader({
  icon: Icon,
  eyebrow,
  title,
}: {
  icon: typeof Shield;
  eyebrow: string;
  title: string;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em] text-slate-500">
          <Icon className="h-4 w-4" />
          {eyebrow}
        </div>
        <h2 className="mt-2 font-serif text-2xl font-semibold text-white">{title}</h2>
      </div>
    </div>
  );
}

export default function ChampionsE3Experience({ state }: { state: ChampionsV2State }) {
  return (
    <main className="champions-page-shell space-y-8 overflow-visible py-4 text-white sm:py-6">
      <section className="champions-e-breakout relative overflow-hidden rounded-[2rem] border border-amber-200/14 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.20),transparent_30%),radial-gradient(circle_at_12%_30%,rgba(59,130,246,0.10),transparent_25%),linear-gradient(145deg,#120d08,#07111c_54%,#02040a)] px-5 py-8 shadow-[0_34px_120px_rgba(0,0,0,0.42)] sm:px-8">
        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.34em] text-amber-100/74">
              <Crown className="h-4 w-4" />
              AoE2WAR title economy · E3
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold uppercase tracking-[0.08em] text-amber-50 sm:text-6xl">
              Championship Belts
            </h1>
            <p className="mt-3 max-w-3xl text-sm uppercase tracking-[0.20em] text-slate-300">
              The preserved E1 war-table layout, carrying the complete E2 championship ledger.
            </p>
          </div>
          <div className="grid min-w-[min(100%,22rem)] gap-2 rounded-2xl border border-white/10 bg-black/22 p-4 sm:grid-cols-3 lg:min-w-[28rem]">
            {[
              ["Active", state.summary.active],
              ["Vacant", state.summary.vacant],
              ["Tribute", `${state.summary.tributePoolWolo} WOLO/day`],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-white/8 bg-white/[0.035] px-3 py-3">
                <div className="text-[9px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
                <div className="mt-1 text-lg font-semibold text-amber-50">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="champions-e-breakout grid gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.18fr)_minmax(0,0.92fr)] xl:items-start">
        <LegacyCrownCard title={state.world} position="center" />
        <LegacyCrownCard title={state.chaos} position="left" />
        <LegacyCrownCard title={state.womens} position="right" />
      </section>

      <section className="space-y-4 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <SectionHeader icon={Trophy} eyebrow="RM / DM Championships" title="Both solo championship lanes, together." />
        <div className="grid gap-5 xl:grid-cols-2">
          <ModeCrownCard champion={state.rmChampion} />
          <ModeCrownCard champion={state.dmChampion} />
        </div>
      </section>

      <section className="space-y-5 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <SectionHeader icon={Users} eyebrow="War Team Championships" title="RM and DM 2v2, 3v3, and 4v4 crowns." />
        {[2, 3, 4].map((size) => {
          const rm = state.teams.rm.find((title) => title.size === size);
          const dm = state.teams.dm.find((title) => title.size === size);
          if (!rm || !dm) return null;
          return (
            <div key={size} className="grid gap-4 xl:grid-cols-2">
              <TeamCrownCard title={rm} lane="rm" />
              <TeamCrownCard title={dm} lane="dm" />
            </div>
          );
        })}
      </section>

      <section className="space-y-4 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <SectionHeader icon={Globe2} eyebrow="National & Regional Champions" title="Every current E2 national standard, in the E1 grid." />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {state.nationals.map((belt) => (
            <NationalCard key={belt.slug} belt={belt} />
          ))}
        </div>
      </section>

      <section className="space-y-5 rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.22))] p-5 sm:p-6">
        <SectionHeader icon={Medal} eyebrow="ELO Champions" title="Complete RM and DM division lineups." />
        {(["rm", "dm"] as ChampionsLane[]).map((lane) => (
          <div key={lane} className="space-y-3">
            <div className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-500">{lane.toUpperCase()} ELO</div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {state.elo[lane].map((division) => (
                <EloCard key={division.id} division={division} lane={lane} />
              ))}
            </div>
          </div>
        ))}
      </section>

      {state.designationTitles.length ? (
        <section className="space-y-4 rounded-[1.8rem] border border-amber-200/12 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.035),rgba(0,0,0,0.24))] p-5 sm:p-6">
          <SectionHeader icon={Gem} eyebrow="Special Designation Artifacts" title="The complete artifact cabinet." />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {state.designationTitles.map((title) => (
              <DesignationCard key={title.id} title={title} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-[1.8rem] border border-white/10 bg-black/24 p-5 sm:grid-cols-3 sm:p-6">
        {[
          [Shield, "Custody stays live", "E3 reads the same authoritative title custody as E2."],
          [Swords, "All team lanes present", "RM and DM 2v2, 3v3, and 4v4 are never collapsed away."],
          [Trophy, "Provenance preserved", "E1 and E2 remain available unchanged beside this new E3 projection."],
        ].map(([Icon, title, body]) => {
          const CardIcon = Icon as typeof Shield;
          return (
            <div key={String(title)} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <CardIcon className="h-5 w-5 text-amber-100/70" />
              <div className="mt-3 text-sm font-semibold text-white">{String(title)}</div>
              <div className="mt-1 text-sm leading-6 text-slate-400">{String(body)}</div>
            </div>
          );
        })}
      </section>

      <ChampionsDisplayRail active="e3" />
    </main>
  );
}
