"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Crown,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  avatarCardUrlForUser,
  featuredAvatarCardUrlForUser,
} from "@/lib/avatarAssets";
import type {
  ChampionsLane,
  ChampionsV2EloDivision,
  ChampionsV2ModeChampion,
  ChampionsV2NationalBelt,
  ChampionsV2State,
  ChampionsV2TeamTitle,
} from "@/lib/champions/championsV2";
import type {
  ChampionTitleState,
} from "@/lib/champions/titleState";
import type { TitleContender } from "@/lib/champions/titles";
import {
  readStoredLeaderboardLane,
  writeStoredLeaderboardLane,
} from "@/lib/leaderboardLane";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";

const MALE_SILHOUETTE = "/champions/players/silhouette.webp";
const FEMALE_SILHOUETTE = "/champions/players/female_silhouette.webp";

function laneName(lane: ChampionsLane) {
  return lane === "rm" ? "Random Map" : "Death Match";
}

function ModeSwitch({
  lane,
  onChange,
  compact = false,
}: {
  lane: ChampionsLane;
  onChange: (lane: ChampionsLane) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-white/10 bg-black/25 p-1 shadow-[0_12px_35px_rgba(0,0,0,0.25)] backdrop-blur ${
        compact ? "gap-0.5" : "gap-1"
      }`}
      aria-label="RM or DM championship view"
    >
      {(["rm", "dm"] as ChampionsLane[]).map((option) => {
        const active = option === lane;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`group relative rounded-full font-black uppercase tracking-[0.24em] transition-all duration-200 ${
              compact ? "min-w-10 px-2.5 py-1.5 text-[9px]" : "min-w-14 px-4 py-2 text-[10px]"
            } ${
              active
                ? "bg-amber-200 text-slate-950 shadow-[0_0_22px_rgba(251,191,36,0.18)]"
                : "text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
            }`}
          >
            <span
              className={`absolute inset-0 rounded-full border transition ${
                active
                  ? "border-amber-100/45"
                  : "border-transparent group-hover:border-white/8"
              }`}
            />
            <span className="relative">{option.toUpperCase()}</span>
          </button>
        );
      })}
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  body,
  action,
}: {
  kicker: string;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        <div className="text-[9px] font-black uppercase tracking-[0.34em] text-amber-100/55">
          {kicker}
        </div>
        <h2 className="mt-2 font-serif text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
      </div>
      {action}
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
  if (!contenders.length) {
    return (
      <div className="rounded-xl border border-dashed border-white/8 bg-black/14 px-3 py-4 text-center text-xs text-slate-600">
        No verified contender data yet.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {contenders.slice(0, max).map((row) => {
        const content = (
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-slate-100">
                {row.name}
              </div>
              <div className="mt-0.5 truncate text-[9px] text-slate-600">
                {row.meta || row.badge || "Contender"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              {row.rating !== null && row.rating !== undefined ? (
                <div className="text-[11px] font-black tabular-nums text-slate-300">
                  {row.rating}
                </div>
              ) : null}
              {row.badge ? (
                <div className="text-[8px] font-bold uppercase tracking-[0.13em] text-amber-100/55">
                  {row.badge}
                </div>
              ) : null}
            </div>
          </div>
        );

        return (
          <div
            key={`${row.rank}:${row.name}:${row.href ?? ""}`}
            className="flex items-center gap-2 rounded-xl border border-white/[0.065] bg-white/[0.018] px-2.5 py-2"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/30 text-[9px] font-black text-slate-500">
              {row.rank}
            </div>
            {row.href ? (
              <Link href={row.href} className="flex min-w-0 flex-1 hover:text-amber-100">
                {content}
              </Link>
            ) : (
              content
            )}
          </div>
        );
      })}
    </div>
  );
}

function holderAvatar(title: ChampionTitleState) {
  const holder = title.holders[0];
  if (!holder) {
    return title.type === "womens" ? FEMALE_SILHOUETTE : MALE_SILHOUETTE;
  }

  return featuredAvatarCardUrlForUser(
    holder.uid,
    holder.name,
    null,
  );
}

function ChampionshipCard({
  title,
  emphasis = false,
}: {
  title: ChampionTitleState;
  emphasis?: boolean;
}) {
  const holder = title.holders[0] ?? null;
  const vacant = title.status !== "held" || !holder;
  const beltUrl = managedMediaPublicUrl("belt", title.id, title.assetUrl);

  return (
    <article
      className={`relative overflow-hidden rounded-[2rem] border bg-[linear-gradient(180deg,rgba(13,22,38,0.96),rgba(3,8,18,0.99))] shadow-[0_28px_90px_rgba(0,0,0,0.32)] ${
        emphasis ? "border-amber-200/22" : "border-white/10"
      }`}
    >
      <div className="relative h-[26rem] overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(251,191,36,0.11),transparent_44%)]" />
        <Image
          src={holderAvatar(title)}
          alt=""
          fill
          unoptimized
          sizes="(min-width:1280px) 33vw, 92vw"
          className={`object-contain object-bottom ${
            vacant ? "opacity-58 grayscale-[0.22]" : "opacity-95"
          }`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_33%,rgba(3,8,18,0.16)_58%,#030812_100%)]" />

        <div className="absolute left-4 right-4 top-4 z-10 flex items-start justify-between gap-3">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.3em] text-amber-100/55">
              {title.eyebrow}
            </div>
            <h3 className="mt-1 max-w-[16rem] font-serif text-3xl font-semibold leading-[0.98] tracking-[-0.035em]">
              {title.displayName}
            </h3>
          </div>
          <span
            className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
              vacant
                ? "border-slate-400/14 bg-slate-500/8 text-slate-500"
                : "border-emerald-200/20 bg-emerald-300/8 text-emerald-100"
            }`}
          >
            {vacant ? "Vacant" : "Held"}
          </span>
        </div>

        <div className="absolute bottom-0 left-1/2 z-10 h-32 w-[82%] -translate-x-1/2">
          <Image
            src={beltUrl}
            alt={title.displayName}
            fill
            unoptimized
            sizes="420px"
            className="object-contain drop-shadow-[0_16px_22px_rgba(0,0,0,0.72)]"
          />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-white/8 bg-black/22 px-3 py-3">
          <div className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-600">
            Holder
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {holder?.name || "Vacant"}
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {holder?.meta || "Awaiting a verified title fight"}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
              Contenders
            </div>
            <div className="text-[9px] text-slate-600">
              {title.contenders.length}/10
            </div>
          </div>
          <ContenderRows contenders={title.contenders} />
        </div>

        <Link
          href={title.routeHref}
          className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-amber-200/22 bg-amber-300/10 px-4 text-xs font-black text-amber-100 transition hover:bg-amber-300/18"
        >
          Open championship
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  );
}

function ModeChampionCard({
  champion,
}: {
  champion: ChampionsV2ModeChampion;
}) {
  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(10,20,36,0.96),rgba(3,7,18,0.99))] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
      <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative min-h-[26rem] overflow-hidden">
          <Image
            src={MALE_SILHOUETTE}
            alt=""
            fill
            unoptimized
            sizes="(min-width:1024px) 45vw, 92vw"
            className="object-contain object-bottom opacity-60"
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(96,165,250,0.13),transparent_43%),linear-gradient(180deg,transparent_45%,#050914_100%)]" />
          <div className="absolute left-5 right-5 top-5">
            <div className="text-[9px] font-black uppercase tracking-[0.28em] text-sky-100/55">
              {laneName(champion.lane)} throne
            </div>
            <h3 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.04em] text-white">
              {champion.shortName}
            </h3>
            <div className="mt-2 inline-flex rounded-full border border-slate-400/14 bg-slate-600/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              Vacant
            </div>
          </div>
          <div className="absolute bottom-2 left-1/2 h-36 w-[85%] -translate-x-1/2">
            <Image
              src={champion.beltUrl}
              alt={champion.name}
              fill
              unoptimized
              sizes="460px"
              className="object-contain drop-shadow-[0_15px_24px_rgba(0,0,0,0.72)]"
            />
          </div>
        </div>

        <div className="border-t border-white/8 p-4 lg:border-l lg:border-t-0">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-[9px] font-black uppercase tracking-[0.23em] text-slate-500">
              Top ten by {champion.lane.toUpperCase()} ELO
            </div>
            <Trophy className="h-4 w-4 text-amber-100/45" />
          </div>
          <ContenderRows contenders={champion.contenders} />
        </div>
      </div>
    </article>
  );
}

function TeamTitleCard({
  title,
  lane,
}: {
  title: ChampionsV2TeamTitle;
  lane: ChampionsLane;
}) {
  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,35,0.95),rgba(3,7,17,0.99))]">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.26em] text-amber-100/50">
            Team crown · {lane.toUpperCase()}
          </div>
          <h3 className="mt-2 font-serif text-3xl font-semibold">{title.name}</h3>
          <div className="mt-2 text-xs text-slate-500">
            {title.holderSlots} warriors · all seats vacant
          </div>
        </div>
        <span className="rounded-full border border-slate-400/14 bg-slate-600/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          Vacant
        </span>
      </div>

      <div
        className="grid gap-2 px-3 pb-5"
        style={{
          gridTemplateColumns: `repeat(${title.holderSlots}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: title.holderSlots }, (_, index) => (
          <div
            key={index}
            className="relative min-h-[18rem] overflow-hidden rounded-[1.25rem] border border-white/[0.065] bg-[radial-gradient(circle_at_50%_18%,rgba(96,165,250,0.09),transparent_46%),rgba(0,0,0,0.18)]"
          >
            <Image
              src={MALE_SILHOUETTE}
              alt=""
              fill
              unoptimized
              sizes="240px"
              className="object-contain object-bottom opacity-46"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(3,7,17,0.12)_60%,#030711_100%)]" />
            <div className="absolute bottom-2 left-1/2 h-24 w-[95%] -translate-x-1/2">
              <Image
                src={title.beltUrl}
                alt={`${title.name} belt ${index + 1}`}
                fill
                unoptimized
                sizes="220px"
                className="object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.76)]"
              />
            </div>
            <div className="absolute bottom-2 right-2 z-10 rounded-full border border-white/8 bg-black/45 px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-slate-500">
              Seat {index + 1}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function NationalBeltCard({
  belt,
}: {
  belt: ChampionsV2NationalBelt;
}) {
  const holderAvatarUrl = belt.holder
    ? avatarCardUrlForUser(belt.holder.uid, belt.holder.name)
    : MALE_SILHOUETTE;

  return (
    <article className="relative w-[19rem] shrink-0 snap-start overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,34,0.97),rgba(3,7,17,0.99))] shadow-[0_22px_70px_rgba(0,0,0,0.28)] sm:w-[21rem]">
      <div className="relative h-[24rem] overflow-hidden">
        <Image
          src={holderAvatarUrl}
          alt=""
          fill
          unoptimized
          sizes="340px"
          className={`object-contain object-bottom ${belt.active ? "opacity-92" : "opacity-50"}`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_36%,rgba(3,7,17,0.16)_60%,#030711_100%)]" />

        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-4xl">{belt.flag}</div>
            <div className="mt-2 text-[9px] font-black uppercase tracking-[0.24em] text-amber-100/55">
              National crown
            </div>
            <h3 className="mt-1 font-serif text-2xl font-semibold text-white">
              {belt.country}
            </h3>
          </div>
          <span
            className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.15em] ${
              belt.active
                ? "border-emerald-200/18 bg-emerald-300/8 text-emerald-100"
                : "border-slate-400/12 bg-slate-600/8 text-slate-500"
            }`}
          >
            {belt.active ? "Held" : "Vacant"}
          </span>
        </div>

        <div className="absolute bottom-0 left-1/2 h-28 w-[90%] -translate-x-1/2">
          <Image
            src={belt.beltUrl}
            alt={`${belt.country} championship belt`}
            fill
            unoptimized
            sizes="320px"
            className="object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.76)]"
          />
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl border border-white/8 bg-black/22 px-3 py-3">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
            Holder
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {belt.holder?.name || "Vacant"}
          </div>
        </div>

        {belt.contenders.length ? (
          <div>
            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
              National contenders
            </div>
            <ContenderRows contenders={belt.contenders} max={3} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/8 px-3 py-4 text-center text-[11px] text-slate-600">
            No known national contender yet.
          </div>
        )}

        {belt.routeHref ? (
          <Link
            href={belt.routeHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition hover:border-amber-200/20 hover:text-amber-100"
          >
            Open belt
            <ArrowRight className="h-3.5 w-3.5" />
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
    <article className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,34,0.94),rgba(3,7,17,0.99))]">
      <div className="relative h-56 overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_26%,rgba(251,191,36,0.10),transparent_44%)]" />
        <Image
          src={division.beltUrl}
          alt={division.displayName}
          fill
          unoptimized
          sizes="320px"
          className="object-contain p-5 drop-shadow-[0_14px_20px_rgba(0,0,0,0.72)]"
        />
        <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
          {lane.toUpperCase()}
        </div>
      </div>
      <div className="p-4">
        <div className="text-[8px] font-black uppercase tracking-[0.22em] text-amber-100/50">
          {division.eyebrow}
        </div>
        <h3 className="mt-1 font-serif text-2xl font-semibold text-white">
          {division.shortName}
        </h3>
        <div className="mt-4">
          <ContenderRows contenders={division.contenders} />
        </div>
      </div>
    </article>
  );
}

function DesignationCard({
  title,
}: {
  title: ChampionTitleState;
}) {
  const holder = title.holders[0] ?? null;
  return (
    <Link
      href={title.routeHref}
      className="group rounded-[1.4rem] border border-white/9 bg-white/[0.022] p-4 transition hover:border-violet-200/18 hover:bg-violet-300/[0.04]"
    >
      <div className="flex items-center gap-3">
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
          <div className="mt-1 truncate font-semibold text-white group-hover:text-violet-100">
            {title.displayName}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {holder?.name || "Vacant"}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function ChampionsV2Experience({
  state,
}: {
  state: ChampionsV2State;
}) {
  const [lane, setLane] = useState<ChampionsLane>("rm");
  const nationalRailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLane(readStoredLeaderboardLane());
  }, []);

  function chooseLane(next: ChampionsLane) {
    setLane(next);
    writeStoredLeaderboardLane(next);
  }

  function scrollNation(direction: -1 | 1) {
    nationalRailRef.current?.scrollBy({
      left: direction * 680,
      behavior: "smooth",
    });
  }

  return (
    <main className="mx-auto w-full max-w-[108rem] space-y-10 overflow-x-hidden px-3 py-5 text-white sm:px-5 sm:py-7">
      <section className="relative overflow-hidden rounded-[2.5rem] border border-amber-100/14 bg-[radial-gradient(circle_at_75%_15%,rgba(251,191,36,0.13),transparent_28%),radial-gradient(circle_at_12%_40%,rgba(59,130,246,0.11),transparent_26%),linear-gradient(145deg,#07101d,#070b14_56%,#140d08)] p-6 shadow-[0_44px_145px_rgba(0,0,0,0.48)] sm:p-8 lg:p-10">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-4xl">
            <div className="flex items-center gap-2 text-amber-100/65">
              <Crown className="h-4 w-4" />
              <span className="text-[9px] font-black uppercase tracking-[0.38em]">
                AoE2WAR title economy · rebuilt
              </span>
            </div>
            <h1 className="mt-4 font-serif text-5xl font-semibold leading-[0.92] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
              CHAMPIONSHIP
              <br />
              BELTS
            </h1>
            <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
              Real custody, real contenders, two games under one roof. RM and DM
              have their own ladders; national crowns carry their own flags; the
              Chaos line rewards the warriors actually feeding the Kingdom.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              ["Active", state.summary.active],
              ["Vacant", state.summary.vacant],
              ["Tribute", `${state.summary.tributePoolWolo} WOLO/day`],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="min-w-[7.2rem] rounded-[1rem] border border-white/10 bg-black/25 px-3 py-3 backdrop-blur"
              >
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-600">
                  {label}
                </div>
                <div className="mt-1 text-lg font-semibold text-white">{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="The open thrones"
          title="The three crowns everybody sees first"
          body="Chaos is activity-driven. World alternates the strongest DM and RM challengers. The Women's throne opens with Moose as the first invited contender."
        />
        <div className="grid gap-5 xl:grid-cols-3">
          <ChampionshipCard title={state.chaos} />
          <ChampionshipCard title={state.world} emphasis />
          <ChampionshipCard title={state.womens} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="The two games"
          title="RM Champion · DM Champion"
          body="No mixed ladder math. Each crown reads its own official Watcher-backed rating lane and publishes the ten highest challengers."
        />
        <div className="grid gap-5 xl:grid-cols-2">
          <ModeChampionCard champion={state.rmChampion} />
          <ModeChampionCard champion={state.dmChampion} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="War parties"
          title={`${lane.toUpperCase()} team championships`}
          body="One switch changes every team crown together. The choice persists, so DM players can live in the DM side of the Kingdom without reselecting it."
          action={<ModeSwitch lane={lane} onChange={chooseLane} />}
        />
        <div className="grid gap-5 xl:grid-cols-3">
          {state.teams[lane].map((title) => (
            <TeamTitleCard key={title.size} title={title} lane={lane} />
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="National standards"
          title="Every flag gets a road to the belt"
          body="Canada, USA, and Mexico are lit. The remaining national crowns stay vacant until a verified challenger carries the flag into title custody."
          action={
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Previous national belts"
                onClick={() => scrollNation(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-slate-400 transition hover:border-amber-200/20 hover:text-amber-100"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Next national belts"
                onClick={() => scrollNation(1)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.025] text-slate-400 transition hover:border-amber-200/20 hover:text-amber-100"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          }
        />

        <div
          ref={nationalRailRef}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 [scrollbar-color:rgba(148,163,184,0.24)_transparent] [scrollbar-width:thin]"
        >
          {state.nationals.map((belt) => (
            <NationalBeltCard key={belt.slug} belt={belt} />
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="ELO crowns"
          title={`${lane.toUpperCase()} rating divisions`}
          body={`Five belts, five rating bands, and ten real ${lane.toUpperCase()} contenders in every band where the leaderboard has enough rated warriors.`}
          action={<ModeSwitch lane={lane} onChange={chooseLane} />}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {state.elo[lane].map((division) => (
            <EloCard key={division.id} division={division} lane={lane} />
          ))}
        </div>
      </section>

      {state.designationTitles.length ? (
        <section className="space-y-5">
          <SectionHeading
            kicker="Artifacts"
            title="Special designations"
            body="The old artifacts remain part of the title economy, but they no longer compete visually with the championship ladders above."
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {state.designationTitles.map((title) => (
              <DesignationCard key={title.id} title={title} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 rounded-[2rem] border border-white/9 bg-white/[0.018] p-5 md:grid-cols-3">
        <div className="flex gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-amber-100/55" />
          <div>
            <div className="text-sm font-semibold text-white">Four active crowns</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Chaos, Canada, USA, and Mexico are the current active title economy.
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <UsersRound className="mt-0.5 h-5 w-5 shrink-0 text-sky-100/55" />
          <div>
            <div className="text-sm font-semibold text-white">Contenders come from evidence</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              RM and DM rating lanes stay separate; Chaos follows linked Watcher activity.
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-violet-100/55" />
          <div>
            <div className="text-sm font-semibold text-white">Vacancy is visible</div>
            <div className="mt-1 text-xs leading-5 text-slate-500">
              Unknown warriors stay unknown until somebody actually wins the belt.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
