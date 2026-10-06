import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Circle,
  Crown,
  History,
  Radio,
  Shield,
  Swords,
} from "lucide-react";

import ChaosiumBeltRail from "@/components/chaosium/ChaosiumBeltRail";
import ChaosiumDisplayRail, {
  type ChaosiumDisplayMode,
} from "@/components/chaosium/ChaosiumDisplayRail";
import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";
import {
  loadChaosium,
  type ChaosiumBelt,
  type ChaosiumHolder,
} from "@/lib/champions/chaosium";
import { getPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chaosium",
  description:
    "AoE2WAR championship belt lineage: current holders, previous reigns, transfer dates, and every belt's road from origin through custody.",
};

type ChaosiumSearchParams = Promise<{
  view?: string | string[];
}>;

type HistoricalBounds = {
  newest: number;
  oldest: number;
};

type PositionedLineageEntry = ChaosiumBelt["lineage"][number] & {
  top: number;
};

const ROAD_VIEWPORT_HEIGHT = 560;
const ROAD_CURRENT_TOP = 8;
const ROAD_HISTORY_START = 126;
const ROAD_HISTORY_SPAN = 350;
const ROAD_MIN_EVENT_GAP = 104;
const ROAD_EVENT_FOOTPRINT = 94;

function dateLabel(value: string | null) {
  if (!value) return "Date pending";
  return new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function normalizeView(value: string | string[] | undefined): ChaosiumDisplayMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "b" || raw === "b1" || raw === "balanced") return "b1";
  if (raw === "a" || raw === "a1" || raw === "advanced") return "a1";
  if (raw === "e1") return "e1";
  return "e2";
}

function holderNameClass(name: string | null) {
  const length = name?.length ?? 0;
  if (length > 28) {
    return "text-[1.2rem] leading-[1.02] tracking-[-0.04em] sm:text-[1.35rem]";
  }
  if (length > 18) {
    return "text-[1.4rem] leading-[1.02] tracking-[-0.045em] sm:text-[1.55rem]";
  }
  if (length > 10) {
    return "text-[1.65rem] leading-none tracking-[-0.045em] sm:text-[1.8rem]";
  }
  return "text-4xl leading-none tracking-[-0.035em]";
}

function lineageNameClass(name: string) {
  if (name.length > 24) return "text-[11px] leading-[1.05]";
  if (name.length > 15) return "text-xs leading-[1.05]";
  return "text-sm leading-tight";
}

function lineageEventLabel(value: string) {
  if (value === "CURRENT_HOLDER") return "Current holder";
  if (value === "Origin") return "Origin";
  return value;
}

function metricValue(value: number | string | null | undefined) {
  return value == null || value === "" ? "—" : String(value);
}

function teamPortraitGridClass(count: number) {
  if (count >= 4) return "grid-cols-2 grid-rows-2";
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2";
}

function teamIdentityGridClass(count: number) {
  if (count === 3) return "grid-cols-3";
  return "grid-cols-2";
}

function TeamHolderBackdrop({
  holders,
  priority,
}: {
  holders: ChaosiumHolder[];
  priority: boolean;
}) {
  if (holders.length <= 1) {
    const holder = holders[0] ?? null;
    return holder?.avatarUrl ? (
      <Image
        src={holder.avatarUrl}
        alt=""
        fill
        priority={priority}
        unoptimized
        sizes="352px"
        className="object-cover object-top opacity-96"
      />
    ) : (
      <div className="absolute inset-0 flex items-center justify-center">
        <Crown className="h-24 w-24 text-slate-700" />
      </div>
    );
  }

  return (
    <div
      data-chaosium-team-holder-portraits
      className={`absolute inset-0 grid ${teamPortraitGridClass(holders.length)}`}
    >
      {holders.map((holder, holderIndex) => (
        <div
          key={`${holder.uid ?? holder.name}:${holderIndex}`}
          className="relative min-h-0 min-w-0 overflow-hidden border border-white/[0.035]"
        >
          {holder.avatarUrl ? (
            <Image
              src={holder.avatarUrl}
              alt=""
              fill
              priority={priority && holderIndex < 2}
              unoptimized
              sizes={holders.length >= 3 ? "176px" : "220px"}
              className="object-cover object-top opacity-92"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/45">
              <Crown className="h-12 w-12 text-slate-700" />
            </div>
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,7,18,0.04),rgba(3,7,18,0.18)_55%,rgba(3,7,18,0.72))]" />
        </div>
      ))}
    </div>
  );
}

function TeamHolderIdentityGroup({
  holders,
}: {
  holders: ChaosiumHolder[];
}) {
  return (
    <div
      data-chaosium-team-holder-group
      className="relative mt-2 overflow-hidden rounded-[1rem] border border-white/10 bg-black/36 p-1.5 backdrop-blur-md"
    >
      <div className="pointer-events-none absolute left-4 right-4 top-1/2 h-px bg-[linear-gradient(90deg,transparent,rgba(251,191,36,0.28),transparent)]" />
      <div
        className={`relative z-10 grid gap-1.5 ${teamIdentityGridClass(holders.length)}`}
      >
        {holders.map((holder, index) => {
          const body = (
            <>
              <span className="truncate font-serif text-[11px] font-semibold text-white">
                {holder.name}
              </span>
              <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300/70" />
            </>
          );

          return holder.href ? (
            <Link
              key={holder.uid ?? `${holder.name}:${index}`}
              href={holder.href}
              className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/8 bg-slate-950/72 px-2 py-1.5 transition hover:border-amber-200/22 hover:bg-slate-900/80"
            >
              {body}
            </Link>
          ) : (
            <div
              key={holder.uid ?? `${holder.name}:${index}`}
              className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/8 bg-slate-950/72 px-2 py-1.5"
            >
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LineageTeamHolderGroup({
  holders,
}: {
  holders: ChaosiumHolder[];
}) {
  return (
    <div
      data-chaosium-lineage-team-holder-group
      className="grid grid-cols-2 gap-1.5"
    >
      {holders.map((holder, index) => {
        const body = (
          <>
            <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/30">
              {holder.avatarUrl ? (
                <Image
                  src={holder.avatarUrl}
                  alt=""
                  fill
                  unoptimized
                  sizes="28px"
                  className="object-cover object-top"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Crown className="h-3.5 w-3.5 text-slate-600" />
                </div>
              )}
            </div>
            <span className="min-w-0 truncate text-[10px] font-semibold text-white">
              {holder.name}
            </span>
          </>
        );

        return holder.href ? (
          <Link
            key={holder.uid ?? `${holder.name}:${index}`}
            href={holder.href}
            className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/7 bg-black/22 px-1.5 py-1 transition hover:border-amber-200/18"
          >
            {body}
          </Link>
        ) : (
          <div
            key={holder.uid ?? `${holder.name}:${index}`}
            className="flex min-w-0 items-center gap-1.5 rounded-lg border border-white/7 bg-black/22 px-1.5 py-1"
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}

function historicalBounds(belts: ChaosiumBelt[]): HistoricalBounds {
  const times = belts.flatMap((belt) =>
    belt.lineage
      .filter((entry) => !entry.current && entry.at)
      .map((entry) => Date.parse(entry.at as string))
      .filter(Number.isFinite),
  );

  if (!times.length) {
    const now = Date.now();
    return { newest: now, oldest: now - 1 };
  }

  return {
    newest: Math.max(...times),
    oldest: Math.min(...times),
  };
}

function historicalTargetTop(
  value: string | null,
  bounds: HistoricalBounds,
) {
  if (!value) return ROAD_HISTORY_START + ROAD_HISTORY_SPAN * 0.72;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return ROAD_HISTORY_START + ROAD_HISTORY_SPAN * 0.72;
  }

  const range = Math.max(1, bounds.newest - bounds.oldest);
  const ageRatio = Math.min(
    1,
    Math.max(0, (bounds.newest - time) / range),
  );

  // Slightly compress long spans while retaining the real chronological order.
  // Close dates stay close; old dates drift lower without making ancient belts
  // produce absurdly tall cards.
  const compressed = Math.pow(ageRatio, 0.82);
  return ROAD_HISTORY_START + compressed * ROAD_HISTORY_SPAN;
}

function positionLineage(
  belt: ChaosiumBelt,
  bounds: HistoricalBounds,
) {
  const current = belt.lineage.filter((entry) => entry.current);
  const historical = belt.lineage
    .filter((entry) => !entry.current)
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.at ?? "");
      const rightTime = Date.parse(right.at ?? "");
      const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
      const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
      return safeRight - safeLeft;
    });

  const positioned: PositionedLineageEntry[] = current.map((entry) => ({
    ...entry,
    top: ROAD_CURRENT_TOP,
  }));

  let previousTop = ROAD_HISTORY_START - ROAD_MIN_EVENT_GAP;
  for (const entry of historical) {
    const chronologicalTop = historicalTargetTop(entry.at, bounds);
    const top = Math.max(
      chronologicalTop,
      previousTop + ROAD_MIN_EVENT_GAP,
    );
    positioned.push({ ...entry, top });
    previousTop = top;
  }

  const trackHeight = Math.max(
    ROAD_VIEWPORT_HEIGHT - 18,
    ...positioned.map((entry) => entry.top + ROAD_EVENT_FOOTPRINT),
  );

  return { entries: positioned, trackHeight };
}

function CorrectedMetrics({ belt }: { belt: ChaosiumBelt }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      <div className="min-w-0 rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">
          Battles
        </div>
        <div className="mt-1 truncate font-semibold">
          {metricValue(belt.totalMatches)}
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">
          Record
        </div>
        <div className="mt-1 truncate font-semibold">
          {metricValue(belt.currentRecord)}
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">
          DM
        </div>
        <div className="mt-1 truncate font-semibold">
          {metricValue(belt.dmRating)}
        </div>
      </div>
      <div className="min-w-0 rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.16em] text-slate-500">
          RM
        </div>
        <div className="mt-1 truncate font-semibold">
          {metricValue(belt.rmRating)}
        </div>
      </div>
    </div>
  );
}

function PreservedE1Metrics({ belt }: { belt: ChaosiumBelt }) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      <div className="rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">
          Battles
        </div>
        <div className="mt-1 font-semibold">
          {metricValue(belt.totalMatches)}
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">
          Record
        </div>
        <div className="mt-1 font-semibold">
          {metricValue(belt.currentRecord)}
        </div>
      </div>
      <div className="rounded-xl border border-white/8 bg-black/36 px-3 py-2 backdrop-blur-sm">
        <div className="text-[8px] uppercase tracking-[0.18em] text-slate-500">
          Rating
        </div>
        <div className="mt-1 whitespace-nowrap font-semibold">
          {belt.rating != null
            ? `${belt.rating} ${belt.ratingLabel ?? ""}`
            : "—"}
        </div>
      </div>
    </div>
  );
}

export default async function ChaosiumPage({
  searchParams,
}: {
  searchParams?: ChaosiumSearchParams;
}) {
  const resolvedSearch = searchParams ? await searchParams : {};
  const view = normalizeView(resolvedSearch.view);
  const belts = await loadChaosium(getPrisma());
  const bounds = historicalBounds(belts);

  const cardWidthClass =
    view === "a1"
      ? "w-[22rem] min-w-[22rem]"
      : view === "e2"
        ? "w-[20rem] min-w-[20rem]"
        : "w-[21rem] min-w-[21rem]";
  const heroHeightClass =
    view === "a1"
      ? "min-h-[34rem]"
      : view === "e2"
        ? "min-h-[29rem]"
        : "min-h-[30rem]";
  const preserveE1Metrics = view === "e1";

  return (
    <main
      data-chaosium-view={view}
      className="mx-auto w-full max-w-[118rem] space-y-8 overflow-x-hidden px-3 py-4 text-white sm:px-5 sm:py-6"
    >
      <SpeedReadyMarker route="/chaosium" />

      <section className="relative overflow-hidden rounded-[2.6rem] border border-violet-200/14 bg-[radial-gradient(circle_at_50%_-10%,rgba(139,92,246,0.22),transparent_36%),radial-gradient(circle_at_12%_25%,rgba(251,191,36,0.12),transparent_22%),linear-gradient(145deg,#080d19,#080612_55%,#130711)] px-6 py-10 shadow-[0_48px_160px_rgba(0,0,0,0.52)] sm:px-8 lg:px-10">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 text-violet-100/70">
            <History className="h-4 w-4" />
            <span className="text-[10px] font-black uppercase tracking-[0.38em]">
              The lineage chamber
            </span>
          </div>
          <h1 className="mt-4 font-serif text-6xl font-semibold tracking-[-0.055em] sm:text-7xl">
            CHAOSIUM
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300">
            Every crown. Every holder. Every road. The most recently active belts
            lead the chamber; older histories follow, with vacant standards
            waiting at the far edge.
          </p>
        </div>

        <div className="mt-7 flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          <span className="rounded-full border border-emerald-200/16 bg-emerald-300/7 px-3 py-1.5">
            Live holder beacon
          </span>
          <span className="rounded-full border border-white/9 bg-white/[0.025] px-3 py-1.5">
            Semi-proportional chronology
          </span>
          <span className="rounded-full border border-white/9 bg-white/[0.025] px-3 py-1.5">
            Trophy events are authority
          </span>
          <span className="rounded-full border border-white/9 bg-white/[0.025] px-3 py-1.5">
            {belts.length} belt standards
          </span>
        </div>
      </section>

      <ChaosiumBeltRail>
        {belts.map((belt, index) => {
          const road = positionLineage(belt, bounds);

          return (
            <article
              key={belt.id}
              data-chaosium-belt-card
              data-chaosium-belt-id={belt.id}
              className={`flex ${cardWidthClass} snap-start flex-none flex-col overflow-hidden rounded-[2.1rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(3,7,18,0.99))] shadow-[0_28px_100px_rgba(0,0,0,0.34)]`}
            >
              <div
                className={`relative ${heroHeightClass} overflow-hidden border-b border-white/8`}
              >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_22%,rgba(251,191,36,0.12),transparent_40%)]" />

                <TeamHolderBackdrop
                  holders={belt.currentHolders}
                  priority={index < 4}
                />

                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_32%,rgba(3,7,18,0.22)_55%,#030712_100%)]" />

                <div className="absolute left-4 top-4 z-20">
                  <Link
                    href={belt.routeHref}
                    className="relative block h-20 w-32 overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-2 transition hover:border-amber-200/30"
                    aria-label={`Open ${belt.displayName}`}
                  >
                    <Image
                      src={belt.assetUrl}
                      alt=""
                      fill
                      unoptimized
                      sizes="128px"
                      className="object-contain p-2 drop-shadow-[0_8px_14px_rgba(0,0,0,0.65)]"
                    />
                  </Link>
                </div>

                {belt.currentHolder ? (
                  <div className="absolute right-5 top-5 z-20 flex items-center gap-2 rounded-full border border-emerald-200/25 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-200" />
                    </span>
                    Current
                  </div>
                ) : (
                  <div className="absolute right-5 top-5 z-20 rounded-full border border-slate-400/18 bg-slate-700/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                    Vacant
                  </div>
                )}

                <div className="absolute bottom-5 left-5 right-5 z-20 min-w-0">
                  <div className="truncate text-[10px] font-black uppercase tracking-[0.24em] text-amber-100/65">
                    {belt.displayName}
                  </div>
                  {belt.currentHolders.length > 1 ? (
                    <TeamHolderIdentityGroup holders={belt.currentHolders} />
                  ) : belt.currentHolderHref ? (
                    <Link
                      href={belt.currentHolderHref}
                      className={`mt-1 block max-w-full whitespace-nowrap font-serif font-semibold text-white transition hover:text-amber-100 ${holderNameClass(belt.currentHolder)}`}
                    >
                      {belt.currentHolder}
                    </Link>
                  ) : (
                    <div
                      className={`mt-1 max-w-full whitespace-nowrap font-serif font-semibold text-white ${holderNameClass(belt.currentHolder || "Vacant")}`}
                    >
                      {belt.currentHolder || "Vacant"}
                    </div>
                  )}

                  {preserveE1Metrics ? (
                    <PreservedE1Metrics belt={belt} />
                  ) : (
                    <CorrectedMetrics belt={belt} />
                  )}
                </div>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">
                      Belt road
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-300">
                      Newest reign to origin
                    </div>
                  </div>
                  <Radio className="h-4 w-4 text-violet-200/45" />
                </div>

                <div
                  data-chaosium-belt-road
                  className="aoe2-nav-scroll relative mt-5 h-[35rem] overflow-y-auto overscroll-y-contain pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {road.entries.length ? (
                    <div
                      className="relative min-h-full"
                      style={{ height: road.trackHeight } as CSSProperties}
                    >
                      <div className="absolute bottom-5 left-[1.18rem] top-4 w-px bg-[linear-gradient(180deg,rgba(110,231,183,0.45),rgba(148,163,184,0.16),rgba(148,163,184,0.06))]" />

                      {road.entries.map((entry) => (
                        <div
                          key={entry.key}
                          className={`absolute left-0 right-0 grid grid-cols-[2.4rem_minmax(0,1fr)] gap-3 ${
                            entry.current
                              ? ""
                              : entry.kind === "origin"
                                ? "opacity-45"
                                : "opacity-58"
                          }`}
                          style={{ top: entry.top } as CSSProperties}
                        >
                          <div className="relative z-10 flex h-9 w-9 items-center justify-center">
                            {entry.current ? (
                              <span className="relative flex h-4 w-4">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50" />
                                <span className="relative inline-flex h-4 w-4 rounded-full border-2 border-emerald-100 bg-emerald-400" />
                              </span>
                            ) : entry.kind === "origin" ? (
                              <Circle className="h-3.5 w-3.5 fill-slate-700 text-slate-500" />
                            ) : (
                              <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-500 bg-slate-800" />
                            )}
                          </div>

                          <div
                            className={`min-w-0 rounded-[1rem] border px-3 py-3 ${
                              entry.current
                                ? "border-emerald-200/16 bg-emerald-300/[0.045]"
                                : "border-white/7 bg-white/[0.018]"
                            }`}
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              {entry.avatarUrl && entry.kind === "holder" ? (
                                <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/30">
                                  <Image
                                    src={entry.avatarUrl}
                                    alt=""
                                    fill
                                    unoptimized
                                    sizes="48px"
                                    className="object-cover object-top"
                                  />
                                </div>
                              ) : (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/8 bg-black/20">
                                  {entry.kind === "origin" ? (
                                    <Shield className="h-5 w-5 text-slate-600" />
                                  ) : (
                                    <Swords className="h-5 w-5 text-slate-500" />
                                  )}
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                {entry.kind === "holder" &&
                                entry.holders.length > 1 ? (
                                  <LineageTeamHolderGroup holders={entry.holders} />
                                ) : entry.href ? (
                                  <Link
                                    href={entry.href}
                                    className={`block whitespace-normal break-words font-semibold text-white hover:text-amber-100 ${lineageNameClass(entry.name)}`}
                                  >
                                    {entry.name}
                                  </Link>
                                ) : (
                                  <div
                                    className={`whitespace-normal break-words font-semibold text-slate-300 ${lineageNameClass(entry.name)}`}
                                  >
                                    {entry.name}
                                  </div>
                                )}
                                <div className="mt-1 break-words text-[8px] font-bold uppercase leading-4 tracking-[0.08em] text-slate-500">
                                  {lineageEventLabel(entry.eventType)}
                                </div>
                                <div className="mt-1 text-xs text-slate-600">
                                  {dateLabel(entry.at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-end">
                      <div className="w-full rounded-xl border border-dashed border-white/8 px-4 py-5 text-sm text-slate-500">
                        Vacant standard. Its custody road begins with the first
                        authoritative title event.
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  href={belt.routeHref}
                  className="mt-5 inline-flex min-h-10 items-center gap-2 border-t border-white/[0.055] pt-4 text-sm font-semibold text-amber-100/80 transition hover:text-amber-50"
                >
                  Open championship
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          );
        })}
      </ChaosiumBeltRail>

      <ChaosiumDisplayRail active={view} />
    </main>
  );
}
