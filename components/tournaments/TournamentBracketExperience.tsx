"use client";

import {
  Activity,
  Crown,
  Eye,
  RadioTower,
  RefreshCw,
  Shield,
  Swords,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import SpeedReadyMarker from "@/components/speed/SpeedReadyMarker";

type RosterPlayer = {
  seed: number;
  rank: number;
  key: string;
  name: string;
  href: string;
  uid: string | null;
  rating: string;
  ratingSource: string;
  wins: number;
  losses: number;
  totalMatches: number;
  watcherOnline: boolean;
  watcherAgeSeconds: number | null;
  watcherEventType: string | null;
};

type RosterPayload = {
  ok: boolean;
  generatedAt: string;
  capacity: number;
  playerCount: number;
  openSlots: number;
  players: RosterPlayer[];
};

type PlayerSeat = {
  kind: "player";
  player: RosterPlayer;
};

type AdvanceSeat = {
  kind: "advance";
  label: string;
};

type OpenSeat = {
  kind: "open";
  label: string;
};

type Seat = PlayerSeat | AdvanceSeat | OpenSeat;

type MatchModel = {
  code: string;
  top: Seat;
  bottom: Seat;
  live?: boolean;
};

type WingModel = {
  playIn: MatchModel[];
  roundOf16: MatchModel[];
  quarters: MatchModel[];
  semifinal: MatchModel[];
};

type Side = "left" | "right";

const EMPTY_ROSTER: RosterPayload = {
  ok: true,
  generatedAt: new Date(0).toISOString(),
  capacity: 22,
  playerCount: 0,
  openSlots: 22,
  players: [],
};

function playerSeat(player: RosterPlayer | null | undefined): Seat {
  return player
    ? {
        kind: "player",
        player,
      }
    : {
        kind: "open",
        label: "OPEN BERTH",
      };
}

function advanceSeat(label: string): Seat {
  return {
    kind: "advance",
    label,
  };
}

function match(code: string, top: Seat, bottom: Seat): MatchModel {
  return {
    code,
    top,
    bottom,
  };
}

function buildWing(players: Array<RosterPlayer | null>, side: Side): WingModel {
  const top = players.slice(0, 5);
  const lower = players.slice(5, 11);

  const prefix = side === "left" ? "L" : "R";

  const p1 = match(
    `${prefix}P1`,
    playerSeat(lower[0]),
    playerSeat(lower[5])
  );
  const p2 = match(
    `${prefix}P2`,
    playerSeat(lower[1]),
    playerSeat(lower[4])
  );
  const p3 = match(
    `${prefix}P3`,
    playerSeat(lower[2]),
    playerSeat(lower[3])
  );

  // Visual order follows the seeded injection points in the Round of 16:
  // P3 -> match 1, P2 -> match 3, P1 -> match 4.
  const playIn = [p3, p2, p1];

  const roundOf16 = [
    match(
      `${prefix}16-1`,
      playerSeat(top[0]),
      advanceSeat(`WIN ${prefix}P3`)
    ),
    match(
      `${prefix}16-2`,
      playerSeat(top[3]),
      playerSeat(top[4])
    ),
    match(
      `${prefix}16-3`,
      playerSeat(top[1]),
      advanceSeat(`WIN ${prefix}P2`)
    ),
    match(
      `${prefix}16-4`,
      playerSeat(top[2]),
      advanceSeat(`WIN ${prefix}P1`)
    ),
  ];

  const quarters = [
    match(
      `${prefix}Q1`,
      advanceSeat(`WIN ${prefix}16-1`),
      advanceSeat(`WIN ${prefix}16-2`)
    ),
    match(
      `${prefix}Q2`,
      advanceSeat(`WIN ${prefix}16-3`),
      advanceSeat(`WIN ${prefix}16-4`)
    ),
  ];

  const semifinal = [
    match(
      `${prefix}S`,
      advanceSeat(`WIN ${prefix}Q1`),
      advanceSeat(`WIN ${prefix}Q2`)
    ),
  ];

  return {
    playIn,
    roundOf16,
    quarters,
    semifinal,
  };
}

function WatcherBeacon({
  online,
  age,
}: {
  online: boolean;
  age: number | null;
}) {
  return (
    <span
      className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center"
      title={
        online
          ? `Watcher signal live${age === null ? "" : ` · ${age}s`}`
          : "Watcher signal cold"
      }
      aria-label={online ? "Watcher online" : "Watcher offline"}
    >
      {online ? (
        <>
          <span className="absolute h-5 w-5 animate-ping rounded-full border border-emerald-300/30 opacity-60" />
          <span className="absolute h-3.5 w-3.5 rounded-full bg-emerald-400/10 shadow-[0_0_18px_rgba(52,211,153,0.55)]" />
          <RadioTower className="relative h-3 w-3 text-emerald-300 drop-shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
        </>
      ) : (
        <>
          <span className="absolute h-3.5 w-3.5 rounded-full border border-slate-700 bg-slate-950/80" />
          <RadioTower className="relative h-3 w-3 text-slate-600" />
        </>
      )}
    </span>
  );
}

function SeedGlyph({ seed }: { seed: number }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-cyan-200/10 bg-cyan-300/[0.035] font-mono text-[10px] font-semibold text-cyan-100/55">
      {String(seed).padStart(2, "0")}
    </span>
  );
}

function PlayerSeatRow({
  player,
  side,
  ratings,
  watcherFocus,
}: {
  player: RosterPlayer;
  side: Side;
  ratings: boolean;
  watcherFocus: boolean;
}) {
  const dim = watcherFocus && !player.watcherOnline;

  return (
    <Link
      href={player.href}
      className={`group/warrior relative flex min-h-[48px] items-center gap-2.5 overflow-hidden rounded-[12px] border px-2.5 py-2 transition duration-300 ${
        player.watcherOnline
          ? "border-emerald-300/22 bg-[linear-gradient(90deg,rgba(16,185,129,0.09),rgba(6,19,26,0.78))] shadow-[inset_0_0_22px_rgba(16,185,129,0.035),0_0_18px_rgba(16,185,129,0.035)]"
          : "border-white/[0.065] bg-[linear-gradient(90deg,rgba(255,255,255,0.035),rgba(3,10,17,0.86))]"
      } ${dim ? "opacity-30 saturate-50" : "opacity-100"} hover:border-cyan-200/24 hover:bg-cyan-300/[0.055]`}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-cyan-300/35 to-transparent opacity-0 transition group-hover/warrior:opacity-100" />

      {side === "left" ? <SeedGlyph seed={player.seed} /> : null}

      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[12px] font-bold tracking-[0.015em] text-slate-100 ${
            side === "right" ? "text-right" : ""
          }`}
        >
          {player.name}
        </div>
        {ratings ? (
          <div
            className={`mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.13em] text-slate-600 ${
              side === "right" ? "justify-end" : ""
            }`}
          >
            <span>#{player.rank}</span>
            <span className="text-cyan-200/45">{player.rating}</span>
          </div>
        ) : null}
      </div>

      <WatcherBeacon
        online={player.watcherOnline}
        age={player.watcherAgeSeconds}
      />

      {side === "right" ? <SeedGlyph seed={player.seed} /> : null}
    </Link>
  );
}

function PlaceholderSeat({
  seat,
  side,
}: {
  seat: AdvanceSeat | OpenSeat;
  side: Side;
}) {
  const open = seat.kind === "open";

  return (
    <div
      className={`flex min-h-[48px] items-center gap-2 rounded-[12px] border px-3 py-2 ${
        open
          ? "border-dashed border-fuchsia-300/18 bg-fuchsia-400/[0.035] text-fuchsia-200/48"
          : "border-cyan-200/[0.055] bg-cyan-300/[0.018] text-cyan-100/32"
      }`}
    >
      {side === "left" ? (
        open ? (
          <Users className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Zap className="h-3.5 w-3.5 shrink-0" />
        )
      ) : null}

      <span
        className={`min-w-0 flex-1 truncate font-mono text-[9px] font-semibold uppercase tracking-[0.16em] ${
          side === "right" ? "text-right" : ""
        }`}
      >
        {seat.label}
      </span>

      {side === "right" ? (
        open ? (
          <Users className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <Zap className="h-3.5 w-3.5 shrink-0" />
        )
      ) : null}
    </div>
  );
}

function SeatRow({
  seat,
  side,
  ratings,
  watcherFocus,
}: {
  seat: Seat;
  side: Side;
  ratings: boolean;
  watcherFocus: boolean;
}) {
  return seat.kind === "player" ? (
    <PlayerSeatRow
      player={seat.player}
      side={side}
      ratings={ratings}
      watcherFocus={watcherFocus}
    />
  ) : (
    <PlaceholderSeat seat={seat} side={side} />
  );
}

function MatchCard({
  item,
  side,
  ratings,
  watcherFocus,
  intensity = "normal",
}: {
  item: MatchModel;
  side: Side;
  ratings: boolean;
  watcherFocus: boolean;
  intensity?: "normal" | "hot" | "elite";
}) {
  const glow =
    intensity === "elite"
      ? "border-amber-200/20 shadow-[0_0_32px_rgba(245,158,11,0.07)]"
      : intensity === "hot"
        ? "border-cyan-200/14 shadow-[0_0_26px_rgba(34,211,238,0.045)]"
        : "border-white/[0.075]";

  return (
    <div
      className={`group/match relative w-full rounded-[18px] border bg-[linear-gradient(155deg,rgba(8,20,30,0.96),rgba(2,8,14,0.98))] p-2.5 transition duration-300 hover:border-cyan-200/24 hover:shadow-[0_0_36px_rgba(34,211,238,0.065)] ${glow}`}
    >
      <div
        className={`absolute top-1/2 h-px w-5 bg-gradient-to-r from-cyan-300/45 to-transparent ${
          side === "left"
            ? "-right-5"
            : "-left-5 rotate-180"
        }`}
      />
      <div
        className={`absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-cyan-200/18 bg-[#031019] shadow-[0_0_12px_rgba(34,211,238,0.22)] ${
          side === "left" ? "-right-[23px]" : "-left-[23px]"
        }`}
      />

      <div className="mb-2 flex items-center justify-between px-1">
        <span className="font-mono text-[8px] font-semibold uppercase tracking-[0.22em] text-cyan-100/28">
          {item.code}
        </span>
        <Swords className="h-3 w-3 text-cyan-200/20 transition group-hover/match:text-cyan-200/50" />
      </div>

      <div className="space-y-1.5">
        <SeatRow
          seat={item.top}
          side={side}
          ratings={ratings}
          watcherFocus={watcherFocus}
        />
        <div className="mx-3 h-px bg-gradient-to-r from-transparent via-white/[0.055] to-transparent" />
        <SeatRow
          seat={item.bottom}
          side={side}
          ratings={ratings}
          watcherFocus={watcherFocus}
        />
      </div>
    </div>
  );
}

function RoundColumn({
  label,
  sublabel,
  matches,
  side,
  ratings,
  watcherFocus,
  intensity,
}: {
  label: string;
  sublabel: string;
  matches: MatchModel[];
  side: Side;
  ratings: boolean;
  watcherFocus: boolean;
  intensity: "normal" | "hot" | "elite";
}) {
  return (
    <section className="relative flex h-[930px] w-[228px] shrink-0 flex-col">
      <div className="mb-4 text-center">
        <div className="font-mono text-[9px] font-bold uppercase tracking-[0.26em] text-cyan-100/48">
          {label}
        </div>
        <div className="mt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-slate-700">
          {sublabel}
        </div>
      </div>

      <div className="relative flex flex-1 flex-col justify-around gap-4">
        <div className="pointer-events-none absolute left-1/2 top-4 h-[calc(100%-2rem)] w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-cyan-300/[0.045] to-transparent" />
        {matches.map((item) => (
          <MatchCard
            key={item.code}
            item={item}
            side={side}
            ratings={ratings}
            watcherFocus={watcherFocus}
            intensity={intensity}
          />
        ))}
      </div>
    </section>
  );
}

function BracketConnector({
  leftCount,
  rightCount,
}: {
  leftCount: number;
  rightCount: number;
}) {
  const height = 860;
  const ys = (count: number) =>
    Array.from(
      { length: count },
      (_, index) => ((index + 0.5) * height) / count
    );

  const leftY = ys(leftCount);
  const rightY = ys(rightCount);
  const paths: string[] = [];

  const connect = (
    fromLeft: boolean,
    sourceY: number,
    targetY: number,
    key: number
  ) => {
    const startX = fromLeft ? 0 : 20;
    const elbowX = fromLeft ? 8 : 12;
    const endX = fromLeft ? 20 : 0;

    paths.push(
      `M ${startX} ${sourceY.toFixed(2)} H ${elbowX} V ${targetY.toFixed(
        2
      )} H ${endX} /*${key}*/`
    );
  };

  if (leftCount === rightCount * 2) {
    for (let index = 0; index < rightCount; index += 1) {
      const target = rightY[index];
      connect(true, leftY[index * 2], target, index * 2);
      connect(true, leftY[index * 2 + 1], target, index * 2 + 1);
    }
  } else if (rightCount === leftCount * 2) {
    for (let index = 0; index < leftCount; index += 1) {
      const target = leftY[index];
      connect(false, rightY[index * 2], target, index * 2);
      connect(false, rightY[index * 2 + 1], target, index * 2 + 1);
    }
  } else if (leftCount === 3 && rightCount === 4) {
    [0, 2, 3].forEach((targetIndex, index) => {
      connect(true, leftY[index], rightY[targetIndex], index);
    });
  } else if (leftCount === 4 && rightCount === 3) {
    [0, 2, 3].forEach((sourceIndex, index) => {
      connect(false, leftY[sourceIndex], rightY[index], index);
    });
  }

  return (
    <div className="relative h-[930px] w-5 shrink-0" aria-hidden="true">
      <svg
        className="absolute inset-x-0 bottom-4 top-[54px] h-[860px] w-5 overflow-visible"
        viewBox="0 0 20 860"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={`bracket-wire-${leftCount}-${rightCount}`} x1="0" x2="1">
            <stop offset="0%" stopColor="rgba(103,232,249,.14)" />
            <stop offset="50%" stopColor="rgba(103,232,249,.52)" />
            <stop offset="100%" stopColor="rgba(103,232,249,.14)" />
          </linearGradient>
          <filter id={`bracket-glow-${leftCount}-${rightCount}`}>
            <feGaussianBlur stdDeviation="0.7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {paths.map((path, index) => (
          <path
            key={index}
            d={path.replace(/ \/\*.*?\*\//g, "")}
            fill="none"
            stroke={`url(#bracket-wire-${leftCount}-${rightCount})`}
            strokeWidth="0.85"
            vectorEffect="non-scaling-stroke"
            filter={`url(#bracket-glow-${leftCount}-${rightCount})`}
          />
        ))}
      </svg>
    </div>
  );
}

function Wing({
  model,
  side,
  ratings,
  watcherFocus,
}: {
  model: WingModel;
  side: Side;
  ratings: boolean;
  watcherFocus: boolean;
}) {
  const rounds = [
    {
      key: "playin",
      label: "PLAY-IN",
      sublabel: "LOWER SEEDS",
      matches: model.playIn,
      intensity: "normal" as const,
    },
    {
      key: "r16",
      label: "ROUND OF 16",
      sublabel: "8 PER WING",
      matches: model.roundOf16,
      intensity: "normal" as const,
    },
    {
      key: "quarters",
      label: "QUARTERS",
      sublabel: "4 PER WING",
      matches: model.quarters,
      intensity: "hot" as const,
    },
    {
      key: "semi",
      label: "SEMIFINAL",
      sublabel: "WING GATE",
      matches: model.semifinal,
      intensity: "elite" as const,
    },
  ];

  const ordered = side === "left" ? rounds : [...rounds].reverse();

  return (
    <div className="flex shrink-0 items-stretch">
      {ordered.map((round, index) => {
        const next = ordered[index + 1];

        return (
          <div key={round.key} className="flex shrink-0 items-stretch">
            <RoundColumn
              label={round.label}
              sublabel={round.sublabel}
              matches={round.matches}
              side={side}
              ratings={ratings}
              watcherFocus={watcherFocus}
              intensity={round.intensity}
            />
            {next ? (
              <BracketConnector
                leftCount={round.matches.length}
                rightCount={next.matches.length}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function FinalCore({
  leftOnline,
  rightOnline,
}: {
  leftOnline: number;
  rightOnline: number;
}) {
  return (
    <section className="relative flex h-[930px] w-[250px] shrink-0 flex-col items-center justify-center px-3">
      <div className="pointer-events-none absolute inset-y-24 left-1/2 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-amber-200/24 to-transparent shadow-[0_0_20px_rgba(245,158,11,0.18)]" />

      <div className="relative w-full">
        <div className="absolute -inset-14 rounded-full bg-amber-300/[0.035] blur-3xl" />
        <div className="absolute -inset-8 rounded-full border border-amber-200/[0.055]" />
        <div className="absolute -inset-4 rounded-[34px] border border-cyan-200/[0.04]" />

        <div className="relative overflow-hidden rounded-[32px] border border-amber-200/22 bg-[radial-gradient(circle_at_50%_0%,rgba(245,158,11,0.16),transparent_44%),linear-gradient(180deg,rgba(11,20,29,0.98),rgba(4,9,15,0.99))] p-5 shadow-[0_0_70px_rgba(245,158,11,0.08),inset_0_0_45px_rgba(245,158,11,0.025)]">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_20%,rgba(255,255,255,0.025)_45%,transparent_64%)]" />

          <div className="relative flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[22px] border border-amber-200/22 bg-amber-300/[0.08] shadow-[0_0_32px_rgba(245,158,11,0.14)]">
              <Crown className="h-7 w-7 text-amber-200 drop-shadow-[0_0_14px_rgba(245,158,11,0.6)]" />
            </div>
          </div>

          <div className="relative mt-5 text-center">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.36em] text-amber-100/38">
              CENTER
            </div>
            <div className="mt-2 text-2xl font-black tracking-[0.16em] text-white">
              FINAL
            </div>
          </div>

          <div className="relative mt-5 space-y-2">
            <div className="rounded-[14px] border border-cyan-200/9 bg-cyan-300/[0.025] px-3 py-3 text-center font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-cyan-100/35">
              LEFT WING CHAMPION
            </div>
            <div className="flex items-center gap-2 px-4">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-200/25" />
              <Trophy className="h-4 w-4 text-amber-200/60" />
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-200/25" />
            </div>
            <div className="rounded-[14px] border border-cyan-200/9 bg-cyan-300/[0.025] px-3 py-3 text-center font-mono text-[9px] font-semibold uppercase tracking-[0.17em] text-cyan-100/35">
              RIGHT WING CHAMPION
            </div>
          </div>

          <div className="relative mt-5 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-emerald-300/8 bg-emerald-400/[0.03] p-2 text-center">
              <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-200/35">
                L SIGNAL
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-200/70">
                {leftOnline}
              </div>
            </div>
            <div className="rounded-xl border border-emerald-300/8 bg-emerald-400/[0.03] p-2 text-center">
              <div className="font-mono text-[8px] uppercase tracking-[0.18em] text-emerald-200/35">
                R SIGNAL
              </div>
              <div className="mt-1 font-mono text-sm font-bold text-emerald-200/70">
                {rightOnline}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ControlButton({
  active = false,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
        active
          ? "border-cyan-200/25 bg-cyan-300/[0.10] text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.08)]"
          : "border-white/[0.075] bg-white/[0.035] text-slate-500 hover:border-cyan-200/18 hover:text-cyan-100"
      }`}
    >
      {children}
    </button>
  );
}

function TournamentHeader({
  roster,
  watcherFocus,
  ratings,
  loading,
  onToggleWatcherFocus,
  onToggleRatings,
  onRefresh,
}: {
  roster: RosterPayload;
  watcherFocus: boolean;
  ratings: boolean;
  loading: boolean;
  onToggleWatcherFocus: () => void;
  onToggleRatings: () => void;
  onRefresh: () => void;
}) {
  const watcherOnline = roster.players.filter(
    (player) => player.watcherOnline
  ).length;

  return (
    <header className="relative overflow-hidden rounded-[34px] border border-cyan-200/[0.10] bg-[linear-gradient(135deg,rgba(4,18,29,0.96),rgba(2,8,16,0.985)_42%,rgba(7,10,25,0.98))] px-5 py-5 shadow-[0_28px_90px_rgba(0,0,0,0.48)] sm:px-7">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.12),transparent_27%),radial-gradient(circle_at_82%_0%,rgba(99,102,241,0.11),transparent_31%),radial-gradient(circle_at_50%_120%,rgba(245,158,11,0.08),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-cyan-200/28 to-transparent" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] border border-cyan-200/18 bg-cyan-300/[0.06] shadow-[0_0_28px_rgba(34,211,238,0.08)]">
            <div className="absolute inset-2 rounded-xl border border-cyan-200/[0.07]" />
            <Trophy className="relative h-6 w-6 text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]" />
          </div>

          <div className="min-w-0">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.38em] text-cyan-100/38">
              AOE2WAR // BATTLE LATTICE
            </div>
            <h1 className="mt-1 truncate text-3xl font-black tracking-[0.11em] text-white sm:text-4xl">
              TOURNAMENTS
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <div className="flex items-center gap-2 rounded-xl border border-white/[0.065] bg-black/20 px-3 py-2">
            <Shield className="h-3.5 w-3.5 text-cyan-200/60" />
            <span className="font-mono text-[10px] font-bold text-slate-300">
              {roster.playerCount}/{roster.capacity}
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-emerald-300/[0.08] bg-emerald-400/[0.025] px-3 py-2">
            <Activity className="h-3.5 w-3.5 text-emerald-300/70" />
            <span className="font-mono text-[10px] font-bold text-emerald-200/70">
              {watcherOnline}
            </span>
          </div>

          <div className="mx-1 hidden h-7 w-px bg-white/[0.065] sm:block" />

          <ControlButton
            active={watcherFocus}
            label="Focus Watcher signals"
            onClick={onToggleWatcherFocus}
          >
            <RadioTower className="h-4 w-4" />
          </ControlButton>
          <ControlButton
            active={ratings}
            label="Toggle ratings"
            onClick={onToggleRatings}
          >
            <Eye className="h-4 w-4" />
          </ControlButton>
          <ControlButton
            label="Refresh bracket signals"
            onClick={onRefresh}
          >
            <RefreshCw
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
          </ControlButton>
        </div>
      </div>
    </header>
  );
}

export default function TournamentBracketExperience() {
  const [roster, setRoster] = useState<RosterPayload>(EMPTY_ROSTER);
  const [loading, setLoading] = useState(true);
  const [watcherFocus, setWatcherFocus] = useState(false);
  const [ratings, setRatings] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const response = await fetch("/api/tournaments/roster", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Tournament roster unavailable");
      }

      const payload = (await response.json()) as RosterPayload;

      if (!payload.ok || !Array.isArray(payload.players)) {
        throw new Error("Tournament roster invalid");
      }

      setRoster(payload);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, 15_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [load]);

  const seededPlayers = useMemo(() => {
    const players = [...roster.players].sort(
      (left, right) => left.seed - right.seed
    );

    const bySeed = new Map(players.map((player) => [player.seed, player]));

    const left: Array<RosterPlayer | null> = [];
    const right: Array<RosterPlayer | null> = [];

    for (let seed = 1; seed <= 22; seed += 1) {
      const player = bySeed.get(seed) ?? null;

      if (seed % 2 === 1) {
        left.push(player);
      } else {
        right.push(player);
      }
    }

    return {
      left,
      right,
    };
  }, [roster.players]);

  const leftWing = useMemo(
    () => buildWing(seededPlayers.left, "left"),
    [seededPlayers.left]
  );

  const rightWing = useMemo(
    () => buildWing(seededPlayers.right, "right"),
    [seededPlayers.right]
  );

  const leftOnline = seededPlayers.left.filter(
    (player) => player?.watcherOnline
  ).length;

  const rightOnline = seededPlayers.right.filter(
    (player) => player?.watcherOnline
  ).length;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#01050b] text-white">
      <SpeedReadyMarker route="/tournaments" ready={!loading && !failed} />

      <style>{`
        @keyframes aoe2warTournamentScan {
          0% { transform: translateY(-12%); opacity: 0; }
          12% { opacity: .65; }
          88% { opacity: .35; }
          100% { transform: translateY(1120px); opacity: 0; }
        }
        @keyframes aoe2warTournamentDrift {
          0%, 100% { transform: translate3d(0,0,0); }
          50% { transform: translate3d(18px,-8px,0); }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.12),transparent_25%),radial-gradient(circle_at_90%_0%,rgba(99,102,241,0.12),transparent_25%),radial-gradient(circle_at_50%_48%,rgba(245,158,11,0.035),transparent_28%),linear-gradient(180deg,#020914_0%,#01050b_58%,#02030a_100%)]" />
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(103,232,249,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "linear-gradient(to bottom, black, rgba(0,0,0,.78) 62%, transparent)",
          }}
        />
        <div className="absolute left-[8%] top-[22%] h-[32rem] w-[32rem] rounded-full bg-cyan-500/[0.035] blur-[110px]" style={{ animation: "aoe2warTournamentDrift 12s ease-in-out infinite" }} />
        <div className="absolute right-[8%] top-[22%] h-[32rem] w-[32rem] rounded-full bg-indigo-500/[0.035] blur-[110px]" style={{ animation: "aoe2warTournamentDrift 14s ease-in-out infinite reverse" }} />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent shadow-[0_0_24px_rgba(34,211,238,0.28)]" style={{ animation: "aoe2warTournamentScan 7.5s linear infinite" }} />
      </div>

      <div className="relative mx-auto max-w-[2100px] px-3 py-5 sm:px-5 lg:px-7">
        <TournamentHeader
          roster={roster}
          watcherFocus={watcherFocus}
          ratings={ratings}
          loading={loading}
          onToggleWatcherFocus={() => setWatcherFocus((value) => !value)}
          onToggleRatings={() => setRatings((value) => !value)}
          onRefresh={() => void load()}
        />

        <section className="relative mt-4 overflow-hidden rounded-[34px] border border-cyan-200/[0.075] bg-[linear-gradient(180deg,rgba(3,12,20,0.92),rgba(1,5,11,0.985))] shadow-[0_30px_100px_rgba(0,0,0,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_46%,rgba(245,158,11,0.055),transparent_18%),radial-gradient(circle_at_12%_40%,rgba(34,211,238,0.045),transparent_24%),radial-gradient(circle_at_88%_40%,rgba(99,102,241,0.055),transparent_24%)]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {failed ? (
            <div className="absolute right-5 top-5 z-20 flex h-9 w-9 items-center justify-center rounded-xl border border-red-300/14 bg-red-500/[0.06]" title="Roster signal unavailable">
              <Activity className="h-4 w-4 text-red-300/65" />
            </div>
          ) : null}

          <div className="relative overflow-x-auto overscroll-x-contain [scrollbar-color:rgba(34,211,238,0.16)_transparent] [scrollbar-width:thin]">
            <div className="flex min-w-[2070px] items-stretch justify-center gap-5 px-5 pb-7 pt-6">
              <Wing
                model={leftWing}
                side="left"
                ratings={ratings}
                watcherFocus={watcherFocus}
              />

              <FinalCore
                leftOnline={leftOnline}
                rightOnline={rightOnline}
              />

              <Wing
                model={rightWing}
                side="right"
                ratings={ratings}
                watcherFocus={watcherFocus}
              />
            </div>
          </div>
        </section>

        <div className="mt-3 flex items-center justify-center gap-3 text-cyan-100/20">
          <div className="h-px w-20 bg-gradient-to-r from-transparent to-current" />
          <Swords className="h-3.5 w-3.5" />
          <div className="font-mono text-[8px] font-semibold uppercase tracking-[0.32em]">
            AOE2WAR BRACKET CORE
          </div>
          <Swords className="h-3.5 w-3.5" />
          <div className="h-px w-20 bg-gradient-to-l from-transparent to-current" />
        </div>
      </div>
    </main>
  );
}
