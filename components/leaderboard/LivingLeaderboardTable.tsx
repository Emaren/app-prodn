"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  EyeOff,
  Flame,
  Minus,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  createPortal,
} from "react-dom";
import {
  Fragment,
  useState,
  type MouseEvent,
} from "react";

import type { LobbyLeaderboardEntry } from "@/lib/lobby";
import { calculateResolvedWinRate } from "@/lib/leaderboardPage";
import type {
  LeaderboardSortDirection,
  LeaderboardSortKey,
} from "@/lib/leaderboardSort";
import type {
  LivingLeaderboardColumnKey,
  LivingLeaderboardColumnMode,
} from "@/lib/livingLeaderboardPreferences";

function winRate(entry: LobbyLeaderboardEntry) {
  return calculateResolvedWinRate(
    entry.wins,
    entry.losses,
  );
}

function streakTone(
  streak: string | null,
) {
  if (streak?.startsWith("W")) {
    return "text-emerald-300";
  }

  if (streak?.startsWith("L")) {
    return "text-orange-300";
  }

  return "text-slate-500";
}

function winStreakCount(
  streak: string | null,
) {
  const match = String(streak ?? "")
    .trim()
    .toUpperCase()
    .match(/^W(\d+)$/);

  return match
    ? Number.parseInt(match[1], 10)
    : 0;
}

function isHot(
  entry: LobbyLeaderboardEntry,
) {
  return (
    entry.rankDelta24hState === "new" ||
    entry.rankDelta24hState === "up" ||
    winStreakCount(entry.streakLabel) >= 2
  );
}

function compactDate(
  value: string | null,
) {
  return value
    ? value.slice(0, 10)
    : "—";
}

function identityLabel(
  entry: LobbyLeaderboardEntry,
) {
  if (entry.identityKind === "steam") {
    return "Steam";
  }

  if (entry.identityKind === "name") {
    return "Name evidence";
  }

  return "AoE2WAR";
}

function RankMovement({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  if (
    entry.rankDelta24hState === "new"
  ) {
    return (
      <span
        className="inline-flex items-center gap-1.5 font-semibold text-amber-200"
        title="New to the ranked board in the last 24 hours"
      >
        <Flame
          className="h-3.5 w-3.5"
          aria-hidden="true"
        />
        New
      </span>
    );
  }

  if (
    entry.rankDelta24hState === "up" &&
    typeof entry.rankDelta24h === "number"
  ) {
    return (
      <span
        className="inline-flex items-center gap-1 font-semibold tabular-nums text-emerald-300"
        title={`Up ${entry.rankDelta24h} rank${entry.rankDelta24h === 1 ? "" : "s"} in 24 hours`}
      >
        <ArrowUp
          className="h-3.5 w-3.5"
          aria-hidden="true"
        />
        {entry.rankDelta24h}
      </span>
    );
  }

  if (
    entry.rankDelta24hState === "down" &&
    typeof entry.rankDelta24h === "number"
  ) {
    return (
      <span
        className="inline-flex items-center gap-1 font-semibold tabular-nums text-orange-300"
        title={`Down ${Math.abs(entry.rankDelta24h)} rank${Math.abs(entry.rankDelta24h) === 1 ? "" : "s"} in 24 hours`}
      >
        <ArrowDown
          className="h-3.5 w-3.5"
          aria-hidden="true"
        />
        {Math.abs(entry.rankDelta24h)}
      </span>
    );
  }

  if (
    entry.rankDelta24hState ===
    "unchanged"
  ) {
    return (
      <span
        className="inline-flex items-center gap-1 tabular-nums text-slate-500"
        title="Rank unchanged over 24 hours"
      >
        <Minus
          className="h-3.5 w-3.5"
          aria-hidden="true"
        />
        0
      </span>
    );
  }

  return (
    <span
      className="text-slate-700"
      title="No comparable rank 24 hours ago"
    >
      —
    </span>
  );
}

function WinRateMeter({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  const rate = winRate(entry);

  if (rate === null) {
    return (
      <span className="text-slate-600">
        —
      </span>
    );
  }

  return (
    <div className="min-w-[7.5rem]">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold tabular-nums">
        <span className="text-amber-50">
          {rate.toFixed(1)}%
        </span>
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
          resolved
        </span>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-700 via-orange-500 to-amber-300"
          style={{
            width: `${Math.max(
              2,
              Math.min(100, rate),
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

function SortHeader({
  label,
  column,
  sortKey,
  sortDirection,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  column: LeaderboardSortKey;
  sortKey: LeaderboardSortKey | null;
  sortDirection:
    | LeaderboardSortDirection
    | null;
  onSort: (
    column: LeaderboardSortKey,
  ) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active =
    sortKey === column &&
    sortDirection !== null;

  return (
    <th
      className={`${className} p-0`}
      aria-sort={
        active
          ? sortDirection === "desc"
            ? "descending"
            : "ascending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        title={`Sort by ${label}`}
        className={`group flex w-full cursor-pointer items-center gap-1.5 px-3 py-3.5 text-[10px] font-black uppercase tracking-[0.19em] text-amber-100/80 transition hover:bg-amber-200/[0.045] hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/40 ${
          align === "right"
            ? "justify-end text-right"
            : "justify-start text-left"
        }`}
      >
        <span>{label}</span>

        {active ? (
          sortDirection === "desc" ? (
            <ArrowDown
              className="h-3 w-3 text-amber-200"
              aria-hidden="true"
            />
          ) : (
            <ArrowUp
              className="h-3 w-3 text-amber-200"
              aria-hidden="true"
            />
          )
        ) : (
          <ChevronsUpDown
            className="h-3 w-3 text-slate-700 transition group-hover:text-amber-100/55"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
}

function StaticHeader({
  children,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`${className} px-3 py-3.5 text-[10px] font-black uppercase tracking-[0.19em] text-amber-100/80 ${
        align === "right"
          ? "text-right"
          : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function columnVisibilityClass(
  column:
    LivingLeaderboardColumnKey,
  mode:
    LivingLeaderboardColumnMode,
  visibleColumns:
    readonly LivingLeaderboardColumnKey[],
) {
  if (mode === "custom") {
    return visibleColumns.includes(
      column,
    )
      ? "table-cell"
      : "hidden";
  }

  switch (column) {
    case "rating":
      return "table-cell";

    case "last10":
      return "hidden min-[900px]:table-cell";

    case "last30":
      return "hidden min-[1030px]:table-cell";

    case "movement24h":
      return "hidden min-[1120px]:table-cell";

    case "streak":
      return "hidden min-[1200px]:table-cell";

    case "games":
      return "hidden min-[1280px]:table-cell";

    case "winRate":
      return "hidden min-[1370px]:table-cell";

    case "record":
      return "hidden min-[1480px]:table-cell";

    case "lastPlayed":
      return "hidden";
  }
}

function RecentForm({
  results,
}: {
  results:
    LobbyLeaderboardEntry["last10Results"];
}) {
  if (results.length === 0) {
    return (
      <span className="text-slate-700">
        —
      </span>
    );
  }

  return (
    <div
      className="flex items-center justify-end gap-[3px]"
      title="Last 10 games · oldest to newest"
      aria-label={`Last 10 games: ${results.join(
        " ",
      )}`}
    >
      {results.map(
        (result, index) => (
          <span
            key={`${index}-${result}`}
            className={`grid h-4 w-4 place-items-center rounded-[0.28rem] border text-[9px] font-black leading-none ${
              result === "W"
                ? "border-emerald-300/20 bg-emerald-300/12 text-emerald-200"
                : result === "L"
                  ? "border-orange-300/20 bg-orange-300/12 text-orange-200"
                  : "border-slate-700/35 bg-slate-700/20 text-slate-500"
            }`}
            title={
              result === "W"
                ? "Win"
                : result === "L"
                  ? "Loss"
                  : "Unresolved"
            }
          >
            {result === "U"
              ? "·"
              : result}
          </span>
        ),
      )}
    </div>
  );
}

function ThirtyDayRecord({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  if (entry.last30Games === 0) {
    return (
      <span className="text-slate-700">
        —
      </span>
    );
  }

  return (
    <div
      className="text-right"
      title="Rolling last 30 days"
    >
      <div className="whitespace-nowrap font-black tabular-nums">
        <span className="text-emerald-300">
          {entry.last30Wins}
        </span>

        <span className="px-1 text-slate-700">
          –
        </span>

        <span className="text-orange-300">
          {entry.last30Losses}
        </span>
      </div>

      <div className="mt-1 whitespace-nowrap text-[9px] tabular-nums text-slate-600">
        {entry.last30Games}g
        {entry.last30Unknowns > 0
          ? ` · ${entry.last30Unknowns}?`
          : ""}
      </div>
    </div>
  );
}

function rankMetal(
  rank: number,
) {
  if (rank === 1) {
    return "border-amber-200/40 bg-[linear-gradient(145deg,rgba(251,191,36,0.24),rgba(120,53,15,0.12))] text-amber-100 shadow-[0_0_28px_rgba(251,191,36,0.10)]";
  }

  if (rank === 2) {
    return "border-slate-200/25 bg-[linear-gradient(145deg,rgba(226,232,240,0.13),rgba(71,85,105,0.08))] text-slate-100";
  }

  if (rank === 3) {
    return "border-orange-300/25 bg-[linear-gradient(145deg,rgba(194,120,71,0.15),rgba(92,45,20,0.08))] text-orange-100";
  }

  return "border-white/[0.06] bg-white/[0.025] text-slate-400";
}

function isInteractiveTarget(
  target: EventTarget | null,
) {
  return target instanceof HTMLElement
    ? Boolean(
        target.closest(
          "a,button,input,textarea,select,label,[role='button']",
        ),
      )
    : false;
}

function rowId(
  key: string,
) {
  let hash = 0;

  for (const character of key) {
    hash =
      Math.imul(hash, 31) +
      (character.codePointAt(0) ?? 0);
  }

  return `living-warrior-${(
    hash >>> 0
  ).toString(36)}`;
}

function WarriorExpansion({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  const rate = winRate(entry);

  return (
    <div className="relative overflow-hidden rounded-[1.15rem] border border-cyan-200/10 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.08),transparent_26%),linear-gradient(145deg,rgba(7,18,32,0.98),rgba(2,7,15,0.98))] p-4 sm:p-5">
      <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/35 to-transparent" />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
            Rank
          </div>
          <div className="mt-1 text-xl font-black tabular-nums text-white">
            #{entry.rank}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
            Rating
          </div>
          <div className="mt-1 text-xl font-black tabular-nums text-amber-100">
            {entry.primaryRatingLabel}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
            Record
          </div>
          <div className="mt-1 text-xl font-black tabular-nums">
            <span className="text-emerald-300">
              {entry.wins}
            </span>
            <span className="text-slate-600">
              {" "}–{" "}
            </span>
            <span className="text-orange-300">
              {entry.losses}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
            Win rate
          </div>
          <div className="mt-1 text-xl font-black tabular-nums text-white">
            {rate === null
              ? "—"
              : `${rate.toFixed(1)}%`}
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3">
          <div className="text-[9px] uppercase tracking-[0.2em] text-slate-600">
            Last battle
          </div>
          <div className="mt-1 text-sm font-semibold tabular-nums text-slate-200">
            {compactDate(
              entry.lastPlayedAt,
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-slate-400">
          {identityLabel(entry)}
        </span>

        {entry.isOnline ? (
          <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-emerald-300">
            Online
          </span>
        ) : null}

        {entry.verified ? (
          <span className="rounded-full border border-cyan-200/15 bg-cyan-300/[0.05] px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-cyan-100">
            Steam linked
          </span>
        ) : entry.claimed ? (
          <span className="rounded-full border border-amber-200/15 bg-amber-300/[0.05] px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-amber-100">
            Claimed
          </span>
        ) : null}

        {entry.unknowns > 0 ? (
          <span
            className="rounded-full border border-orange-200/12 bg-orange-300/[0.04] px-3 py-1 text-[9px] uppercase tracking-[0.16em] text-orange-200/75"
            title="Replay records whose result is not currently resolved"
          >
            {entry.unknowns} unresolved
          </span>
        ) : null}

        <Link
          href={entry.href}
          className="ml-auto inline-flex items-center gap-2 rounded-full border border-amber-200/16 bg-amber-300/[0.05] px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:border-amber-200/35 hover:bg-amber-300/[0.09]"
        >
          Warrior
          <ExternalLink
            className="h-3.5 w-3.5"
            aria-hidden="true"
          />
        </Link>
      </div>

      {entry.nameHistory.length > 0 ? (
        <div className="mt-4 grid gap-2 lg:grid-cols-2 2xl:grid-cols-4">
          {entry.nameHistory.map(
            (history) => (
              <div
                key={
                  history.normalizedName
                }
                className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3"
              >
                <div className="truncate font-semibold text-slate-200">
                  {history.name}
                </div>

                <div className="mt-2 flex flex-wrap gap-x-2 text-[10px] tabular-nums text-slate-500">
                  <span>
                    {history.games}G
                  </span>
                  <span className="text-emerald-300">
                    {history.wins}W
                  </span>
                  <span className="text-orange-300">
                    {history.losses}L
                  </span>
                </div>
              </div>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function DockedWarriorExpansion({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  const alternateNames =
    entry.nameHistory
      .map(
        (history) =>
          history.name,
      )
      .filter(
        (name) =>
          name !==
          entry.currentName,
      )
      .slice(0, 4);

  return (
    <div className="grid min-h-12 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-x-5 border-l-2 border-cyan-300/35 bg-[linear-gradient(90deg,rgba(34,211,238,0.045),rgba(4,10,20,0.94)_22%,rgba(2,7,15,0.98))] px-5 py-2.5 text-[10px] shadow-[inset_0_1px_0_rgba(103,232,249,0.06)]">
      <div className="whitespace-nowrap">
        <span className="font-black uppercase tracking-[0.17em] text-slate-600">
          {identityLabel(entry)}
        </span>
      </div>

      <div className="whitespace-nowrap text-slate-500">
        30d{" "}
        <strong className="font-black text-emerald-300">
          {entry.last30Wins}
        </strong>
        <span className="px-1 text-slate-700">
          –
        </span>
        <strong className="font-black text-orange-300">
          {entry.last30Losses}
        </strong>
      </div>

      <div className="whitespace-nowrap text-slate-500">
        Last{" "}
        <strong className="font-semibold tabular-nums text-slate-300">
          {compactDate(
            entry.lastPlayedAt,
          )}
        </strong>
      </div>

      <div className="min-w-0 truncate text-slate-500">
        {entry.unknowns > 0 ? (
          <>
            <span className="text-orange-200/65">
              {entry.unknowns} unresolved
            </span>

            {alternateNames.length > 0
              ? " · "
              : ""}
          </>
        ) : null}

        {alternateNames.length > 0 ? (
          <>
            Also{" "}
            <strong className="font-semibold text-slate-300">
              {alternateNames.join(
                " · ",
              )}
            </strong>
          </>
        ) : null}

        {entry.isOnline ? (
          <span className="ml-3 font-black uppercase tracking-[0.14em] text-emerald-300">
            Online
          </span>
        ) : null}
      </div>

      <Link
        href={entry.href}
        onClick={(event) =>
          event.stopPropagation()
        }
        className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/16 bg-amber-300/[0.035] px-3 py-1.5 font-black uppercase tracking-[0.14em] text-amber-100/85 transition hover:border-amber-200/35 hover:bg-amber-300/[0.07] hover:text-white"
      >
        Warrior
        <ExternalLink
          className="h-3 w-3"
          aria-hidden="true"
        />
      </Link>
    </div>
  );
}

function DesktopWarriorInspector({
  entry,
  onClose,
}: {
  entry: LobbyLeaderboardEntry;
  onClose: () => void;
}) {
  const rate =
    winRate(entry);

  const alternateNames =
    entry.nameHistory
      .map(
        (history) =>
          history.name,
      )
      .filter(
        (name) =>
          name !==
          entry.currentName,
      )
      .slice(0, 4);

  return (
    <div
      className="pointer-events-none fixed bottom-20 left-1/2 z-[105] hidden w-[min(calc(100vw-3rem),76rem)] -translate-x-1/2 px-2 md:block"
      role="presentation"
    >
      <div
        id="living-warrior-inspector"
        role="dialog"
        aria-label={`${entry.currentName} warrior inspector`}
        className="pointer-events-auto relative overflow-hidden rounded-[1.15rem] border border-cyan-200/18 bg-[radial-gradient(circle_at_8%_0%,rgba(34,211,238,0.10),transparent_24%),linear-gradient(145deg,rgba(6,17,30,0.985),rgba(2,7,15,0.985))] shadow-[0_24px_80px_rgba(0,0,0,0.68),inset_0_1px_0_rgba(255,255,255,0.045)] backdrop-blur-xl"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/55 to-transparent"
        />

        <div className="flex min-h-[4.9rem] items-center gap-5 px-5 py-3">
          <div
            className={`inline-flex min-w-[4.9rem] shrink-0 items-center justify-center rounded-xl border px-3 py-2.5 text-base font-black tabular-nums ${rankMetal(
              entry.rank,
            )}`}
          >
            #{entry.rank}
          </div>

          <div className="min-w-0 w-[15rem] shrink-0">
            <div className="truncate text-[1.05rem] font-black tracking-[-0.01em] text-cyan-50">
              {entry.currentName}
            </div>

            <div className="mt-1 truncate text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
              {identityLabel(entry)}
              {" · "}
              {
                entry.primaryRatingSourceLabel
              }
              {entry.isOnline
                ? " · ONLINE"
                : ""}
            </div>
          </div>

          <div className="h-9 w-px shrink-0 bg-white/[0.07]" />

          <div className="grid shrink-0 grid-cols-5 gap-x-6">
            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                Rating
              </div>
              <div className="mt-1 font-black tabular-nums text-white">
                {
                  entry.primaryRatingLabel
                }
              </div>
            </div>

            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                30d
              </div>
              <div className="mt-1 whitespace-nowrap font-black tabular-nums">
                <span className="text-emerald-300">
                  {entry.last30Wins}
                </span>
                <span className="px-1 text-slate-700">
                  –
                </span>
                <span className="text-orange-300">
                  {entry.last30Losses}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                Record
              </div>
              <div className="mt-1 whitespace-nowrap font-black tabular-nums">
                <span className="text-emerald-300">
                  {entry.wins}
                </span>
                <span className="px-1 text-slate-700">
                  –
                </span>
                <span className="text-orange-300">
                  {entry.losses}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                Win %
              </div>
              <div className="mt-1 font-black tabular-nums text-white">
                {rate === null
                  ? "—"
                  : `${rate.toFixed(
                      1,
                    )}%`}
              </div>
            </div>

            <div>
              <div className="text-[8px] font-black uppercase tracking-[0.16em] text-slate-600">
                Streak
              </div>
              <div
                className={`mt-1 font-black ${streakTone(
                  entry.streakLabel,
                )}`}
              >
                {entry.streakLabel ||
                  "—"}
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[9px] text-slate-500">
              Last{" "}
              <strong className="font-semibold tabular-nums text-slate-300">
                {compactDate(
                  entry.lastPlayedAt,
                )}
              </strong>

              {entry.unknowns > 0 ? (
                <>
                  {" · "}
                  <span className="text-orange-200/65">
                    {
                      entry.unknowns
                    }{" "}
                    unresolved
                  </span>
                </>
              ) : null}
            </div>

            {alternateNames.length >
            0 ? (
              <div className="mt-1 truncate text-[9px] text-slate-600">
                Also{" "}
                <strong className="font-semibold text-slate-300">
                  {alternateNames.join(
                    " · ",
                  )}
                </strong>
              </div>
            ) : null}
          </div>

          <Link
            href={entry.href}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-200/18 bg-amber-300/[0.045] px-4 py-2 text-[9px] font-black uppercase tracking-[0.15em] text-amber-100 transition hover:border-amber-200/40 hover:bg-amber-300/[0.09] hover:text-white"
          >
            Warrior
            <ExternalLink
              className="h-3 w-3"
              aria-hidden="true"
            />
          </Link>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close warrior inspector"
            title="Close"
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/[0.07] bg-white/[0.025] text-slate-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
          >
            <X
              className="h-4 w-4"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function DockedWarriorInspector({
  entry,
  onClose,
}: {
  entry: LobbyLeaderboardEntry;
  onClose: () => void;
}) {
  return (
    <div
      id="living-warrior-dock"
      className="relative z-20 hidden border-t border-cyan-200/16 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.07),transparent_30%),linear-gradient(90deg,rgba(5,16,29,0.99),rgba(2,7,15,0.99))] px-3 py-2.5 md:block lg:pr-40 shadow-[0_-18px_50px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(103,232,249,0.055)]"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <DockedWarriorExpansion
            entry={entry}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close warrior inspector"
          title="Close"
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border border-white/[0.08] bg-white/[0.025] text-slate-500 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-white"
        >
          <X
            className="h-4 w-4"
            aria-hidden="true"
          />
        </button>
      </div>
    </div>
  );
}

export function LivingLeaderboardTable({
  entries,
  sortKey,
  sortDirection,
  onSort,
  bookmarks,
  onToggleBookmark,
  onHideEntry,
  spotlightKey,
  pulseActive,
  dense,
  columnMode,
  visibleColumns,
  drilldownMode,
}: {
  entries: LobbyLeaderboardEntry[];
  sortKey: LeaderboardSortKey | null;
  sortDirection:
    | LeaderboardSortDirection
    | null;
  onSort: (
    column: LeaderboardSortKey,
  ) => void;
  bookmarks: ReadonlySet<string>;
  onToggleBookmark: (
    entry: LobbyLeaderboardEntry,
  ) => void;
  onHideEntry: (
    entry: LobbyLeaderboardEntry,
  ) => void;
  spotlightKey: string | null;
  pulseActive: boolean;
  dense: boolean;
  columnMode:
    LivingLeaderboardColumnMode;
  visibleColumns:
    readonly LivingLeaderboardColumnKey[];
  drilldownMode:
    | 1
    | 2
    | 3;
}) {
  const [expandedKeys, setExpandedKeys] =
    useState<Set<string>>(
      () => new Set(),
    );

  const toggleRow = (
    entry: LobbyLeaderboardEntry,
  ) => {
    setExpandedKeys((current) => {
      if (
        current.has(
          entry.key,
        )
      ) {
        return new Set();
      }

      return new Set([
        entry.key,
      ]);
    });
  };

  const toggleFromRow = (
    entry: LobbyLeaderboardEntry,
    event: MouseEvent<HTMLElement>,
  ) => {
    if (
      !isInteractiveTarget(event.target)
    ) {
      toggleRow(entry);
    }
  };

  const vertical =
    dense
      ? "py-3"
      : "py-[1.05rem]";

  const columnClass = (
    column:
      LivingLeaderboardColumnKey,
  ) =>
    columnVisibilityClass(
      column,
      columnMode,
      visibleColumns,
    );

  const customWide =
    columnMode === "custom" &&
    visibleColumns.length > 6;

  const expandedEntry =
    entries.find(
      (entry) =>
        expandedKeys.has(
          entry.key,
        ),
    ) ?? null;

  const dockTarget =
    drilldownMode === 2 &&
    typeof document !==
      "undefined"
      ? document.getElementById(
          "living-leaderboard-inspector-dock",
        )
      : null;

  return (
    <>
      <div className="hidden overflow-visible rounded-[1.4rem] border border-amber-200/12 bg-[#040914] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] md:block">
        <table
          className={`w-full table-fixed border-collapse text-left ${
            customWide
              ? "min-w-[88rem]"
              : ""
          }`}
        >
          <thead
            data-leaderboard-column-header
            className="sticky top-0 z-10 bg-[#07101f]/98 shadow-[0_1px_0_rgba(251,191,36,0.22)] backdrop-blur-xl"
          >
            <tr>
              <SortHeader
                label="Rank"
                column="rank"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                className="w-44"
              />

              <SortHeader
                label="Warrior"
                column="warrior"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
              />

              <SortHeader
                label="Rating"
                column="rating"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                align="right"
                className={`${columnClass(
                  "rating",
                )} w-28`}
              />

              <StaticHeader
                align="right"
                className={`${columnClass(
                  "last10",
                )} w-48`}
              >
                Last 10
              </StaticHeader>

              <StaticHeader
                align="right"
                className={`${columnClass(
                  "last30",
                )} w-28`}
              >
                30d W–L
              </StaticHeader>

              <SortHeader
                label="24h"
                column="rank_change_24h"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                align="right"
                className={`${columnClass(
                  "movement24h",
                )} w-24`}
              />

              <SortHeader
                label="Win %"
                column="win_rate"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                className={`${columnClass(
                  "winRate",
                )} w-40`}
              />

              <StaticHeader
                align="right"
                className={`${columnClass(
                  "record",
                )} w-20`}
              >
                W–L
              </StaticHeader>

              <SortHeader
                label="Games"
                column="games"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                align="right"
                className={`${columnClass(
                  "games",
                )} w-24`}
              />

              <SortHeader
                label="Streak"
                column="streak"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                align="right"
                className={`${columnClass(
                  "streak",
                )} w-24`}
              />

              <StaticHeader
                align="right"
                className={`${columnClass(
                  "lastPlayed",
                )} w-28`}
              >
                Last played
              </StaticHeader>
            </tr>
          </thead>

          <tbody>
            {entries.map(
              (entry, index) => {
                const expanded =
                  expandedKeys.has(
                    entry.key,
                  );

                const bookmarked =
                  bookmarks.has(entry.key);

                const hot =
                  pulseActive &&
                  isHot(entry);

                const spotlit =
                  spotlightKey ===
                  entry.key;

                return (
                  <Fragment
                    key={entry.key}
                  >
                    <tr
                      data-living-spotlight={
                        spotlit
                          ? "true"
                          : undefined
                      }
                      onClick={(event) =>
                        toggleFromRow(
                          entry,
                          event,
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.currentTarget !==
                          event.target
                        ) {
                          return;
                        }

                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          toggleRow(entry);
                        }
                      }}
                      tabIndex={0}
                      aria-expanded={expanded}
                      aria-controls={
                        expanded
                          ? drilldownMode ===
                            1
                            ? rowId(
                                entry.key,
                              )
                            : drilldownMode ===
                                2
                              ? "living-warrior-dock"
                              : "living-warrior-inspector"
                          : undefined
                      }
                      title={`Inspect ${entry.currentName}`}
                      className={`group cursor-pointer border-b border-white/[0.05] text-[0.95rem] outline-none transition-[background-color,box-shadow] duration-150 focus-visible:shadow-[inset_0_0_0_1px_rgba(103,232,249,0.28)] ${
                        index % 2 === 0
                          ? "bg-slate-900/44"
                          : "bg-black/18"
                      } ${
                        spotlit
                          ? "bg-cyan-300/[0.075] shadow-[inset_4px_0_0_rgba(103,232,249,0.85),inset_0_0_0_1px_rgba(103,232,249,0.09)]"
                          : hot
                            ? "shadow-[inset_4px_0_0_rgba(251,191,36,0.58)] hover:bg-amber-300/[0.06]"
                            : "hover:bg-cyan-300/[0.045]"
                      }`}
                    >
                      <td
                        className={`px-3 ${vertical}`}
                      >
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(
                              event,
                            ) => {
                              event.stopPropagation();
                              onToggleBookmark(
                                entry,
                              );
                            }}
                            aria-label={`${bookmarked ? "Remove" : "Add"} ${entry.currentName} ${bookmarked ? "from" : "to"} bookmarks`}
                            title={
                              bookmarked
                                ? "Remove bookmark"
                                : "Bookmark warrior"
                            }
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border transition ${
                              bookmarked
                                ? "border-amber-200/30 bg-amber-300/[0.10] text-amber-200"
                                : "border-white/[0.06] bg-white/[0.02] text-slate-700 opacity-45 group-hover:opacity-100 hover:border-amber-200/22 hover:text-amber-200"
                            }`}
                          >
                            <Star
                              className={`h-3.5 w-3.5 ${
                                bookmarked
                                  ? "fill-current"
                                  : ""
                              }`}
                              aria-hidden="true"
                            />
                          </button>

                          <button
                            type="button"
                            onClick={(
                              event,
                            ) => {
                              event.stopPropagation();
                              onHideEntry(
                                entry,
                              );
                            }}
                            aria-label={`Hide ${entry.currentName}`}
                            title="Hide warrior"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/[0.05] bg-white/[0.015] text-slate-700 opacity-35 transition group-hover:opacity-100 hover:border-slate-300/20 hover:bg-white/[0.04] hover:text-slate-300"
                          >
                            <EyeOff
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </button>

                          <div
                            aria-hidden="true"
                            className={`inline-flex min-w-[4.8rem] items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-[0.95rem] font-black tabular-nums transition ${rankMetal(
                              entry.rank,
                            )}`}
                          >
                            {expanded ? (
                              <ChevronDown
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronRight
                                className="h-3.5 w-3.5 opacity-55"
                                aria-hidden="true"
                              />
                            )}

                            #{entry.rank}
                          </div>
                        </div>
                      </td>

                      <td
                        className={`min-w-0 px-4 ${vertical}`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Link
                            href={
                              entry.href
                            }
                            className="min-w-0 truncate text-[1.05rem] font-black tracking-[-0.01em] text-cyan-100 decoration-cyan-300/20 underline-offset-4 transition hover:text-white hover:underline"
                          >
                            {
                              entry.currentName
                            }
                          </Link>

                          {hot ? (
                            <Flame
                              className="h-3.5 w-3.5 shrink-0 text-amber-300"
                              aria-label="Active rank pulse"
                            />
                          ) : null}
                        </div>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                          <span>
                            {identityLabel(
                              entry,
                            )}
                          </span>

                          <span>
                            {
                              entry.primaryRatingSourceLabel
                            }
                          </span>

                          {entry.nameHistory
                            .length > 1 ? (
                            <span className="text-amber-200/65">
                              {
                                entry
                                  .nameHistory
                                  .length
                              }{" "}
                              names
                            </span>
                          ) : null}

                          {entry.isOnline ? (
                            <span className="text-emerald-300">
                              online
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td
                        className={`${columnClass(
                          "rating",
                        )} px-3 text-right ${vertical}`}
                      >
                        <div className="text-lg font-black tabular-nums text-white">
                          {
                            entry.primaryRatingLabel
                          }
                        </div>

                        {entry.secondaryRatingLabel ? (
                          <div className="mt-1 text-[9px] tabular-nums text-slate-600">
                            {
                              entry.secondaryRatingLabel
                            }
                          </div>
                        ) : null}
                      </td>

                      <td
                        className={`${columnClass(
                          "last10",
                        )} px-3 text-right ${vertical}`}
                      >
                        <RecentForm
                          results={
                            entry.last10Results
                          }
                        />
                      </td>

                      <td
                        className={`${columnClass(
                          "last30",
                        )} px-3 text-right ${vertical}`}
                      >
                        <ThirtyDayRecord
                          entry={entry}
                        />
                      </td>

                      <td
                        className={`${columnClass(
                          "movement24h",
                        )} px-3 text-right ${vertical}`}
                      >
                        <RankMovement
                          entry={entry}
                        />
                      </td>

                      <td
                        className={`${columnClass(
                          "winRate",
                        )} px-3 ${vertical}`}
                      >
                        <WinRateMeter
                          entry={entry}
                        />
                      </td>

                      <td
                        className={`${columnClass(
                          "record",
                        )} px-3 text-right ${vertical}`}
                      >
                        <div className="whitespace-nowrap font-semibold tabular-nums">
                          <span className="text-emerald-300">
                            {entry.wins}
                          </span>
                          <span className="px-1.5 text-slate-700">
                            –
                          </span>
                          <span className="text-orange-300">
                            {entry.losses}
                          </span>
                        </div>
                      </td>

                      <td
                        className={`${columnClass(
                          "games",
                        )} px-3 text-right tabular-nums text-slate-300 ${vertical}`}
                      >
                        <div>
                          {
                            entry.totalMatches
                          }
                        </div>

                        {entry.unknowns >
                        0 ? (
                          <div
                            className="mt-1 text-[9px] text-slate-600"
                            title={`${entry.unknowns} unresolved replay result${entry.unknowns === 1 ? "" : "s"}`}
                          >
                            {
                              entry.unknowns
                            }{" "}
                            unresolved
                          </div>
                        ) : null}
                      </td>

                      <td
                        className={`${columnClass(
                          "streak",
                        )} px-3 text-right text-base font-black tabular-nums ${vertical} ${streakTone(
                          entry.streakLabel,
                        )}`}
                      >
                        {entry.streakLabel ||
                          "—"}
                      </td>

                      <td
                        className={`${columnClass(
                          "lastPlayed",
                        )} px-4 text-right ${vertical}`}
                      >
                        <div className="whitespace-nowrap text-[10px] tabular-nums text-slate-500">
                          {compactDate(
                            entry.lastPlayedAt,
                          )}
                        </div>

                        <Link
                          href={entry.href}
                          title="Open warrior"
                          aria-label={`Open ${entry.currentName}`}
                          className="mt-1 inline-flex translate-x-1 items-center gap-1 text-[9px] uppercase tracking-[0.12em] text-cyan-200/0 transition group-hover:translate-x-0 group-hover:text-cyan-200/70"
                        >
                          Open
                          <ExternalLink
                            className="h-3 w-3"
                            aria-hidden="true"
                          />
                        </Link>
                      </td>
                    </tr>

                                        {expanded &&
                    drilldownMode === 1 ? (
                      <tr
                        id={rowId(
                          entry.key,
                        )}
                        className="border-b border-cyan-200/[0.08] bg-[#020813]"
                      >
                        <td
                          colSpan={11}
                          className="px-3 py-3"
                        >
                          <WarriorExpansion
                            entry={entry}
                          />
                        </td>
                      </tr>
                    ) : null}


                  </Fragment>
                );
              },
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {entries.map((entry) => {
          const expanded =
            expandedKeys.has(
              entry.key,
            );

          const bookmarked =
            bookmarks.has(entry.key);

          const hot =
            pulseActive &&
            isHot(entry);

          const spotlit =
            spotlightKey ===
            entry.key;

          const id =
            rowId(
              `mobile-${entry.key}`,
            );

          return (
            <article
              key={entry.key}
              data-living-spotlight={
                spotlit
                  ? "true"
                  : undefined
              }
              onClick={(event) =>
                toggleFromRow(
                  entry,
                  event,
                )
              }
              className={`relative overflow-hidden rounded-[1.25rem] border p-4 transition ${
                spotlit
                  ? "border-cyan-200/30 bg-[radial-gradient(circle_at_0%_0%,rgba(34,211,238,0.12),transparent_38%),linear-gradient(145deg,rgba(17,28,45,0.98),rgba(4,9,18,0.98))] shadow-[inset_4px_0_0_rgba(103,232,249,0.78)]"
                  : hot
                    ? "border-amber-200/20 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,0.10),transparent_34%),linear-gradient(145deg,rgba(17,28,45,0.98),rgba(4,9,18,0.98))]"
                    : "border-white/[0.08] bg-[linear-gradient(145deg,rgba(17,28,45,0.98),rgba(4,9,18,0.98))]"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-expanded={
                    expanded
                  }
                  aria-controls={id}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleRow(entry);
                  }}
                  className={`inline-flex h-11 min-w-14 items-center justify-center gap-1 rounded-xl border px-2 font-black tabular-nums ${rankMetal(
                    entry.rank,
                  )}`}
                >
                  #{entry.rank}
                </button>

                <div className="min-w-0 flex-1">
                  <Link
                    href={entry.href}
                    className="block truncate text-base font-bold text-cyan-100"
                  >
                    {entry.currentName}
                  </Link>

                  <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-slate-600">
                    {identityLabel(
                      entry,
                    )}{" "}
                    ·{" "}
                    {
                      entry.primaryRatingSourceLabel
                    }
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onHideEntry(
                      entry,
                    );
                  }}
                  aria-label={`Hide ${entry.currentName}`}
                  title="Hide warrior"
                  className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.08] text-slate-600"
                >
                  <EyeOff
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleBookmark(
                      entry,
                    );
                  }}
                  aria-label={`${bookmarked ? "Remove" : "Add"} bookmark`}
                  className={`grid h-10 w-10 place-items-center rounded-full border ${
                    bookmarked
                      ? "border-amber-200/30 bg-amber-300/[0.10] text-amber-200"
                      : "border-white/[0.08] text-slate-600"
                  }`}
                >
                  <Star
                    className={`h-4 w-4 ${
                      bookmarked
                        ? "fill-current"
                        : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              <div className="mt-4 grid grid-cols-4 gap-2 border-t border-white/[0.07] pt-3 text-center">
                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                    Rating
                  </div>
                  <div className="mt-1 font-black tabular-nums text-white">
                    {
                      entry.primaryRatingLabel
                    }
                  </div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                    24h
                  </div>
                  <div className="mt-1">
                    <RankMovement
                      entry={entry}
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                    Record
                  </div>
                  <div className="mt-1 whitespace-nowrap font-black tabular-nums">
                    <span className="text-emerald-300">
                      {entry.wins}
                    </span>
                    <span className="text-slate-700">
                      –
                    </span>
                    <span className="text-orange-300">
                      {entry.losses}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
                    Streak
                  </div>
                  <div
                    className={`mt-1 font-black ${streakTone(
                      entry.streakLabel,
                    )}`}
                  >
                    {entry.streakLabel ||
                      "—"}
                  </div>
                </div>
              </div>

              {expanded ? (
                <div
                  id={id}
                  className="mt-4 border-t border-cyan-200/10 pt-4"
                >
                  <WarriorExpansion
                    entry={entry}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {expandedEntry &&
      drilldownMode === 2 &&
      dockTarget
        ? createPortal(
            <DockedWarriorInspector
              entry={
                expandedEntry
              }
              onClose={() =>
                setExpandedKeys(
                  new Set(),
                )
              }
            />,
            dockTarget,
          )
        : null}

      {expandedEntry &&
      drilldownMode === 3 ? (
        <DesktopWarriorInspector
          entry={expandedEntry}
          onClose={() =>
            setExpandedKeys(
              new Set(),
            )
          }
        />
      ) : null}
    </>
  );
}
