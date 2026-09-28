"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Trophy,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import ChampionsDisplayRail from "@/components/champions/ChampionsDisplayRail";
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
  ChampionsV2TeamContender,
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

const MALE_SILHOUETTE = "/champions/players/silhouette.webp";
const FEMALE_SILHOUETTE = "/champions/players/female_silhouette.webp";

function managedMediaPublicUrl(
  kind: "belt" | "artifact",
  target: string,
  fallback: string,
) {
  return `/api/media-assets/${encodeURIComponent(kind)}/${encodeURIComponent(target)}?fallback=${encodeURIComponent(fallback)}`;
}

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
                ? "bg-[linear-gradient(180deg,rgba(71,85,105,0.78),rgba(15,23,42,0.98))] text-stone-200 shadow-[0_0_24px_rgba(2,6,23,0.48)]"
                : "text-slate-500 hover:bg-slate-700/35 hover:text-slate-200"
            }`}
          >
            <span
              className={`absolute inset-0 rounded-full border transition ${
                active
                  ? "border-stone-300/24"
                  : "border-transparent group-hover:border-slate-400/14"
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
  action,
  onKickerClick,
}: {
  kicker: string;
  action?: ReactNode;
  onKickerClick?: () => void;
}) {
  const kickerClass =
    "text-[9px] font-black uppercase tracking-[0.34em] text-amber-100/55";

  return (
    <div className="flex min-h-8 items-center justify-between gap-4">
      {onKickerClick ? (
        <button
          type="button"
          onClick={onKickerClick}
          className={`${kickerClass} cursor-default text-left`}
          aria-label={`Toggle ${kicker} championship layout`}
        >
          {kicker}
        </button>
      ) : (
        <div className={kickerClass}>{kicker}</div>
      )}
      {action}
    </div>
  );
}

function ContenderRows({
  contenders,
  max = 10,
  padTo = 0,
  placeholderLabel = "Unclaimed",
}: {
  contenders: TitleContender[];
  max?: number;
  padTo?: number;
  placeholderLabel?: string;
}) {
  const visible = contenders.slice(0, max);
  const placeholderCount = Math.max(0, Math.min(max, padTo) - visible.length);

  if (!visible.length && placeholderCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/8 bg-black/14 px-3 py-4 text-center text-xs text-slate-600">
        No verified contender data yet.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {visible.map((row) => {
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

      {Array.from({ length: placeholderCount }, (_, index) => {
        const rank = visible.length + index + 1;
        return (
          <div
            key={`open:${rank}`}
            className="flex items-center gap-2 rounded-xl border border-dashed border-white/[0.055] bg-black/[0.08] px-2.5 py-2 text-slate-700"
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-black/20 text-[9px] font-black">
              {rank}
            </div>
            <div className="text-xs font-semibold">{placeholderLabel}</div>
          </div>
        );
      })}
    </div>
  );
}

function TeamContenderRows({
  contenders,
}: {
  contenders: ChampionsV2TeamContender[];
}) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: 5 }, (_, index) => {
        const contender = contenders[index] ?? null;
        return (
          <div
            key={contender ? `team:${contender.rank}` : `open-team:${index + 1}`}
            className={`flex min-h-10 items-center gap-2 rounded-xl border px-2.5 py-2 ${
              contender
                ? "border-white/[0.065] bg-white/[0.018]"
                : "border-dashed border-white/[0.055] bg-black/[0.08] text-slate-700"
            }`}
          >
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-black/25 text-[9px] font-black text-slate-500">
              {index + 1}
            </div>
            {contender ? (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                {contender.members.map((member, memberIndex) => (
                  <span key={`${contender.rank}:${member.name}`} className="inline-flex items-center gap-1.5">
                    {memberIndex > 0 ? (
                      <span className="text-slate-700">+</span>
                    ) : null}
                    {member.href ? (
                      <Link
                        href={member.href}
                        className="text-xs font-semibold text-slate-200 transition hover:text-sky-100"
                      >
                        {member.name}
                      </Link>
                    ) : (
                      <span className="text-xs font-semibold text-slate-200">{member.name}</span>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-xs font-semibold">Open team contender</div>
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

function championshipTitleLines(title: ChampionTitleState) {
  if (title.type === "chaos") return ["Chaos", "Champion"];
  if (title.type === "world") return ["AoE2WAR", "World", "Champion"];
  if (title.type === "womens") return ["Women's", "Champion"];
  return [title.displayName];
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
      className={`relative flex h-full flex-col overflow-hidden rounded-[2rem] border bg-[linear-gradient(180deg,rgba(13,22,38,0.96),rgba(3,8,18,0.99))] shadow-[0_28px_90px_rgba(0,0,0,0.32)] ${
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
              {championshipTitleLines(title).map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
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

      <div className="flex flex-1 flex-col gap-4 p-4">
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
              {Math.min(title.contenders.length, 10)}/10
            </div>
          </div>
          <ContenderRows
            contenders={title.contenders}
            padTo={title.type === "womens" ? 10 : 0}
            placeholderLabel="Unclaimed"
          />
        </div>

        <Link
          href={title.routeHref}
          className="mt-auto inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-amber-200/22 bg-amber-300/10 px-4 text-xs font-black text-amber-100 transition hover:bg-amber-300/18"
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
  stacked = false,
}: {
  champion: ChampionsV2ModeChampion;
  stacked?: boolean;
}) {
  const throne = (
    <div className={`relative overflow-hidden ${stacked ? "h-[26rem]" : "min-h-[26rem]"}`}>
      <Image
        src={MALE_SILHOUETTE}
        alt=""
        fill
        unoptimized
        sizes={stacked ? "(min-width:1280px) 50vw, 92vw" : "(min-width:1024px) 45vw, 92vw"}
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
  );

  const contenders = (
    <div className={stacked ? "border-t border-white/8 p-4" : "border-t border-white/8 p-4 lg:border-l lg:border-t-0"}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[9px] font-black uppercase tracking-[0.23em] text-slate-500">
          Top ten by {champion.lane.toUpperCase()} ELO
        </div>
        <Trophy className="h-4 w-4 text-amber-100/45" />
      </div>
      <ContenderRows contenders={champion.contenders} />
    </div>
  );

  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(10,20,36,0.96),rgba(3,7,18,0.99))] shadow-[0_28px_90px_rgba(0,0,0,0.28)]">
      {stacked ? (
        <>
          {throne}
          {contenders}
        </>
      ) : (
        <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
          {throne}
          {contenders}
        </div>
      )}
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
  const stageHeight =
    title.size === 2
      ? "min-h-[29rem]"
      : title.size === 3
        ? "min-h-[26rem]"
        : "min-h-[23rem]";
  const beltHeight =
    title.size === 2
      ? "h-32"
      : title.size === 3
        ? "h-28"
        : "h-24";
  const avatarScale =
    title.size === 2
      ? "scale-[1.10]"
      : title.size === 3
        ? "scale-[1.05]"
        : "scale-100";

  return (
    <article className="overflow-hidden rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,35,0.95),rgba(3,7,17,0.99))]">
      <div className="flex items-start justify-between gap-4 p-5">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.26em] text-slate-500">
            {lane.toUpperCase()} · {title.size}v{title.size}
          </div>
          <h3 className="mt-1 font-serif text-3xl font-semibold">{title.name}</h3>
        </div>
        <span className="rounded-full border border-slate-400/14 bg-slate-600/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
          Vacant
        </span>
      </div>

      <div
        className="grid gap-2 px-3"
        style={{
          gridTemplateColumns: `repeat(${title.holderSlots}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: title.holderSlots }, (_, index) => (
          <div
            key={index}
            className={`relative ${stageHeight} overflow-hidden rounded-[1.25rem] border border-white/[0.065] bg-[radial-gradient(circle_at_50%_18%,rgba(96,165,250,0.09),transparent_46%),rgba(0,0,0,0.18)]`}
          >
            <Image
              src={MALE_SILHOUETTE}
              alt=""
              fill
              unoptimized
              sizes="420px"
              className={`object-contain object-bottom opacity-52 ${avatarScale}`}
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(3,7,17,0.10)_60%,#030711_100%)]" />
            <div className={`absolute bottom-3 left-1/2 ${beltHeight} w-[96%] -translate-x-1/2`}>
              <Image
                src={title.beltUrl}
                alt={`${title.name} belt ${index + 1}`}
                fill
                unoptimized
                sizes="360px"
                className="object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.78)]"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
            Team contenders
          </div>
          <div className="text-[8px] font-bold uppercase tracking-[0.16em] text-slate-700">
            Commissioner queue
          </div>
        </div>
        <TeamContenderRows contenders={title.contenders} />
      </div>
    </article>
  );
}
function NationalBeltCard({
  belt,
}: {
  belt: ChampionsV2NationalBelt;
}) {
  const hasRealHolder = Boolean(belt.holder);
  const holderAvatarUrl = belt.holder
    ? avatarCardUrlForUser(belt.holder.uid, belt.holder.name)
    : MALE_SILHOUETTE;
  const showcaseBackground =
    belt.slug === "saudi-arabia" || belt.slug === "taiwan";

  return (
    <article className="relative flex w-[19rem] shrink-0 snap-start flex-col overflow-hidden rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,34,0.97),rgba(3,7,17,0.99))] shadow-[0_22px_70px_rgba(0,0,0,0.28)] sm:w-[21rem]">
      <div className="relative h-[24rem] overflow-hidden">
        {showcaseBackground ? (
          <>
            <Image
              src={belt.beltUrl}
              alt=""
              fill
              unoptimized
              sizes="340px"
              className="scale-105 object-cover object-center opacity-20 blur-2xl"
            />
            <div className="absolute inset-0 z-[2] bg-[radial-gradient(circle_at_50%_40%,rgba(15,23,42,0.08),rgba(2,6,23,0.64)_72%)]" />
            <div className="absolute left-1/2 top-[7.2rem] z-10 h-[9.5rem] w-[91%] -translate-x-1/2">
              <Image
                src={belt.beltUrl}
                alt={`${belt.country} championship belt showcase`}
                fill
                unoptimized
                sizes="320px"
                className="object-contain object-center drop-shadow-[0_18px_28px_rgba(0,0,0,0.62)]"
              />
            </div>
          </>
        ) : (
          <Image
            src={holderAvatarUrl}
            alt=""
            fill
            unoptimized
            sizes="340px"
            className={`z-10 object-contain object-bottom ${belt.active ? "opacity-92" : "opacity-50"}`}
          />
        )}

        <div
          className={
            showcaseBackground
              ? "absolute inset-0 z-[12] bg-[linear-gradient(180deg,rgba(2,6,23,0.06),transparent_48%,#030711_100%)]"
              : "absolute inset-0 z-[12] bg-[linear-gradient(180deg,transparent_36%,rgba(3,7,17,0.10)_60%,#030711_100%)]"
          }
        />

        <div className="absolute left-4 top-4 z-30 text-4xl">{belt.flag}</div>
        <div
          className={`absolute left-4 top-[4.4rem] text-[9px] font-black uppercase tracking-[0.24em] text-amber-100/55 ${
            hasRealHolder && !showcaseBackground ? "z-[5]" : "z-30"
          }`}
        >
          {belt.scope === "regional" ? "Regional crown" : "National crown"}
        </div>
        <h3 className="absolute left-4 top-[5.65rem] z-30 font-serif text-2xl font-semibold text-white">
          {belt.country}
        </h3>

        <span
          className={`absolute right-4 top-4 z-30 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.15em] ${
            belt.active
              ? "border-emerald-200/18 bg-emerald-300/8 text-emerald-100"
              : "border-slate-400/12 bg-slate-600/8 text-slate-500"
          }`}
        >
          {belt.active ? "Held" : "Vacant"}
        </span>

        {!showcaseBackground ? (
          <div className="absolute bottom-0 left-1/2 z-20 h-28 w-[90%] -translate-x-1/2">
            <Image
              src={belt.beltUrl}
              alt={`${belt.country} championship belt`}
              fill
              unoptimized
              sizes="320px"
              className="object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.76)]"
            />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-4">
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
              {belt.scope === "regional" ? "Regional contenders" : "National contenders"}
            </div>
            <ContenderRows contenders={belt.contenders} max={3} />
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/8 px-3 py-4 text-center text-[11px] text-slate-600">
            No known {belt.scope === "regional" ? "regional" : "national"} contender yet.
          </div>
        )}

        {belt.routeHref ? (
          <Link
            href={belt.routeHref}
            className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.025] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-300 transition hover:border-amber-200/20 hover:text-slate-100"
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
  const holderAvatarUrl = division.holder
    ? avatarCardUrlForUser(division.holder.uid, division.holder.name)
    : MALE_SILHOUETTE;

  return (
    <article className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(12,20,34,0.94),rgba(3,7,17,0.99))]">
      <div className="relative h-72 overflow-hidden border-b border-white/8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_24%,rgba(96,165,250,0.10),transparent_44%)]" />
        <Image
          src={holderAvatarUrl}
          alt=""
          fill
          unoptimized
          sizes="320px"
          className={`object-contain object-bottom ${division.holder ? "opacity-92" : "opacity-48"}`}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_40%,rgba(3,7,17,0.10)_62%,#030711_100%)]" />
        <div className="absolute bottom-1 left-1/2 h-28 w-[94%] -translate-x-1/2">
          <Image
            src={division.beltUrl}
            alt={division.displayName}
            fill
            unoptimized
            sizes="300px"
            className="object-contain drop-shadow-[0_14px_20px_rgba(0,0,0,0.74)]"
          />
        </div>
        <div className="absolute left-4 top-4 rounded-full border border-white/10 bg-black/35 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-slate-400 backdrop-blur">
          {lane.toUpperCase()}
        </div>
      </div>
      <div className="p-4">
        <div className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-500">
          {division.eyebrow}
        </div>
        <h3 className="mt-1 font-serif text-2xl font-semibold text-white">
          {division.shortName}
        </h3>
        <div className="mt-3 rounded-xl border border-white/[0.065] bg-black/20 px-3 py-2.5">
          <div className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
            Holder
          </div>
          <div className="mt-1 truncate text-xs font-semibold text-slate-200">
            {division.holder?.name || "Vacant"}
          </div>
        </div>
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
  const [stackModeChampions, setStackModeChampions] = useState(true);
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
        <div className="relative z-10 flex justify-end">
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
        <SectionHeading kicker="The open thrones" />
        <div className="grid items-stretch gap-5 xl:grid-cols-3">
          <ChampionshipCard title={state.chaos} />
          <ChampionshipCard title={state.world} emphasis />
          <ChampionshipCard title={state.womens} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="RM / DM"
          onKickerClick={() => setStackModeChampions((current) => !current)}
        />
        <div className="grid gap-5 xl:grid-cols-2">
          <ModeChampionCard champion={state.rmChampion} stacked={stackModeChampions} />
          <ModeChampionCard champion={state.dmChampion} stacked={stackModeChampions} />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="War parties"
          action={<ModeSwitch lane={lane} onChange={chooseLane} />}
        />
        <div className="space-y-6">
          {state.teams[lane].map((title) => (
            <TeamTitleCard key={title.size} title={title} lane={lane} />
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading kicker="National & regional standards" />

        <div className="relative">
          <div
            ref={nationalRailRef}
            className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-4 [scrollbar-color:rgba(148,163,184,0.24)_transparent] [scrollbar-width:thin]"
          >
            {state.nationals.map((belt) => (
              <NationalBeltCard key={belt.slug} belt={belt} />
            ))}
          </div>

          <button
            type="button"
            aria-label="Previous national belts"
            onClick={() => scrollNation(-1)}
            className="absolute inset-y-3 left-0 z-40 w-12 rounded-r-[2rem] bg-[linear-gradient(90deg,rgba(125,211,252,0.18),rgba(59,130,246,0.06),transparent)] opacity-0 shadow-[inset_-10px_0_24px_rgba(59,130,246,0.10)] transition duration-200 hover:opacity-100 sm:w-16"
          />
          <button
            type="button"
            aria-label="Next national belts"
            onClick={() => scrollNation(1)}
            className="absolute inset-y-3 right-0 z-40 w-12 rounded-l-[2rem] bg-[linear-gradient(270deg,rgba(125,211,252,0.18),rgba(59,130,246,0.06),transparent)] opacity-0 shadow-[inset_10px_0_24px_rgba(59,130,246,0.10)] transition duration-200 hover:opacity-100 sm:w-16"
          />
        </div>
      </section>

      <section className="space-y-5">
        <SectionHeading
          kicker="ELO crowns"
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
          <SectionHeading kicker="Artifacts" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {state.designationTitles.map((title) => (
              <DesignationCard key={title.id} title={title} />
            ))}
          </div>
        </section>
      ) : null}
      <ChampionsDisplayRail active="e2" />
    </main>
  );
}
