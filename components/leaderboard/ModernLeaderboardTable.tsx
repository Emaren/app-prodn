"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  History,
  Minus,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
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

function winRate(entry: LobbyLeaderboardEntry) {
  return calculateResolvedWinRate(entry.wins, entry.losses);
}

function streakTone(streak: string | null) {
  if (streak?.startsWith("W")) return "text-emerald-300";
  if (streak?.startsWith("L")) return "text-orange-300";
  return "text-slate-400";
}

function compactDate(
  value: string | null,
) {
  return value
    ? value.slice(0, 10)
    : "Unknown";
}

function RankChange({
  entry,
  compact = false,
}: {
  entry: LobbyLeaderboardEntry;
  compact?: boolean;
}) {
  const baseClass =
    compact
      ? "text-xs"
      : "text-sm";

  if (
    entry.rankDelta24hState === "new"
  ) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold text-amber-200 ${baseClass}`}
        title="New to the ranked board in the last 24 hours"
      >
        <Sparkles
          className="h-3.5 w-3.5"
          aria-hidden="true"
        />
        New
      </span>
    );
  }

  if (
    entry.rankDelta24hState === "up" &&
    typeof entry.rankDelta24h ===
      "number"
  ) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold tabular-nums text-emerald-300 ${baseClass}`}
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
    typeof entry.rankDelta24h ===
      "number"
  ) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-semibold tabular-nums text-orange-300 ${baseClass}`}
        title={`Down ${Math.abs(entry.rankDelta24h)} rank${Math.abs(entry.rankDelta24h) === 1 ? "" : "s"} in 24 hours`}
      >
        <ArrowDown
          className="h-3.5 w-3.5"
          aria-hidden="true"
        />
        {Math.abs(
          entry.rankDelta24h
        )}
      </span>
    );
  }

  if (
    entry.rankDelta24hState ===
    "unchanged"
  ) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-slate-400 ${baseClass}`}
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
      className={`text-slate-600 ${baseClass}`}
      title="No comparable rank 24 hours ago"
    >
      —
    </span>
  );
}

function WinRate({ entry, compact = false }: { entry: LobbyLeaderboardEntry; compact?: boolean }) {
  const rate = winRate(entry);
  if (rate === null) return <span className="text-slate-500">—</span>;

  return (
    <div className={compact ? "min-w-[7rem]" : "min-w-[8.5rem]"}>
      <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-semibold tabular-nums">
        <span className="text-amber-50">{rate.toFixed(1)}%</span>
        {compact ? null : <span className="text-slate-500">resolved</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-700/75">
        <div
          className="h-full rounded-full bg-gradient-to-r from-red-700 via-orange-600 to-amber-400"
          style={{ width: `${Math.max(2, Math.min(100, rate))}%` }}
        />
      </div>
    </div>
  );
}

function SortableHeader({
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
  sortDirection: LeaderboardSortDirection | null;
  onSort: (column: LeaderboardSortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active =
    sortKey === column &&
    sortDirection !== null;

  const nextAction =
    !active
      ? "descending"
      : sortDirection === "desc"
        ? "ascending"
        : "default order";

  return (
    <th
      className={`${className} p-0 font-semibold`}
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
        title={`Sort ${label} ${nextAction}`}
        aria-label={`Sort ${label} ${nextAction}`}
        className={`group flex w-full cursor-pointer items-center gap-1.5 px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-200/[0.055] hover:text-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-200/45 ${
          align === "right"
            ? "justify-end text-right"
            : "justify-start text-left"
        }`}
      >
        <span>{label}</span>

        {active ? (
          sortDirection === "desc" ? (
            <ArrowDown
              className="h-3.5 w-3.5 text-amber-200"
              aria-hidden="true"
            />
          ) : (
            <ArrowUp
              className="h-3.5 w-3.5 text-amber-200"
              aria-hidden="true"
            />
          )
        ) : (
          <ChevronsUpDown
            className="h-3.5 w-3.5 text-slate-600 transition group-hover:text-amber-100/65"
            aria-hidden="true"
          />
        )}
      </button>
    </th>
  );
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a,button,input,textarea,select,label,[role='button']"))
    : false;
}

function identityHistoryId(
  prefix: string,
  key: string,
) {
  let hash = 0;

  for (const character of key) {
    hash =
      Math.imul(hash, 31) +
      (character.codePointAt(0) ?? 0);
  }

  const safeKey = key
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    )
    .slice(0, 48);

  return `${prefix}-${safeKey}-${(hash >>> 0).toString(36)}`;
}

export function ModernLeaderboardTable({
  entries,
  sortKey,
  sortDirection,
  onSort,
}: {
  entries: LobbyLeaderboardEntry[];
  sortKey: LeaderboardSortKey | null;
  sortDirection: LeaderboardSortDirection | null;
  onSort: (column: LeaderboardSortKey) => void;
}) {
  const [expandedKeys, setExpandedKeys] =
    useState<Set<string>>(
      () => new Set()
    );

  const toggleRow = (
    entry: LobbyLeaderboardEntry,
  ) => {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (next.has(entry.key)) {
        next.delete(entry.key);
      } else {
        next.add(entry.key);
      }

      return next;
    });
  };

  const toggleRowFromClick = (
    entry: LobbyLeaderboardEntry,
    event:
      | MouseEvent<HTMLTableRowElement>
      | MouseEvent<HTMLElement>,
  ) => {
    if (!isInteractiveTarget(event.target)) {
      toggleRow(entry);
    }
  };

  return (
    <>
      <div className="hidden overflow-clip rounded-[1.35rem] border border-amber-200/12 bg-[#070d18] md:block">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#0b1424]/98 text-[11px] uppercase tracking-[0.18em] text-amber-100 shadow-[0_1px_0_rgba(251,191,36,0.28)] backdrop-blur">
            <tr>
              <SortableHeader
                label="Rank"
                column="rank"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                className="w-20"
              />
              <SortableHeader
                label="Rating"
                column="rating"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
                className="w-28"
              />
              <SortableHeader
                label="Current Name"
                column="warrior"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
              />
              <SortableHeader
                label="24hr Rank Change"
                column="rank_change_24h"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
                className="w-36"
              />
              <SortableHeader
                label="Win Rate"
                column="win_rate"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                className="w-44"
              />
              <SortableHeader
                label="Wins"
                column="wins"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
                className="w-24"
              />
              <SortableHeader
                label="Losses"
                column="losses"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
                className="w-24"
              />
              <SortableHeader
                label="Games"
                column="games"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
                className="w-28"
              />
              <SortableHeader
                label="Streak"
                column="streak"
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={onSort}
                align="right"
                className="w-24"
              />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const expanded =
                expandedKeys.has(
                  entry.key
                );
              const historyId =
                identityHistoryId(
                  "identity-history",
                  entry.key
                );

              return (
                <Fragment key={entry.key}>
                  <tr
                    onClick={(event) =>
                      toggleRowFromClick(
                        entry,
                        event
                      )
                    }
                    className={`cursor-pointer border-b border-white/[0.055] text-sm text-slate-200 transition hover:bg-cyan-300/[0.055] ${
                      index % 2 === 0
                        ? "bg-slate-800/35"
                        : "bg-black/20"
                    }`}
                  >
                    <td className="px-5 py-4 text-base font-semibold tabular-nums text-slate-300">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={historyId}
                        aria-label={`${expanded ? "Hide" : "Show"} ${entry.currentName} display-name history`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleRow(entry);
                        }}
                        className="inline-flex items-center gap-2 rounded-md outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-200/55"
                      >
                        {expanded ? (
                          <ChevronDown
                            className="h-4 w-4 text-cyan-200"
                            aria-hidden="true"
                          />
                        ) : (
                          <ChevronRight
                            className="h-4 w-4 text-slate-500"
                            aria-hidden="true"
                          />
                        )}
                        #{entry.rank}
                      </button>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="text-base font-bold tabular-nums text-white">
                        {entry.primaryRatingLabel}
                      </div>
                      {entry.secondaryRatingLabel ? (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {entry.secondaryRatingLabel}
                        </div>
                      ) : null}
                    </td>
                    <td className="min-w-0 px-5 py-4">
                      <Link
                        href={entry.href}
                        className="font-semibold text-cyan-200 underline decoration-cyan-300/25 underline-offset-4 transition hover:text-white"
                      >
                        {entry.currentName}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-x-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        <span>
                          {entry.identityKind ===
                          "steam"
                            ? "Steam account"
                            : entry.identityKind ===
                                "name"
                              ? "Name-only evidence"
                              : "Site profile"}
                        </span>
                        <span>
                          {
                            entry.primaryRatingSourceLabel
                          }
                        </span>
                        {entry.nameHistory.length >
                        1 ? (
                          <span className="text-amber-200/80">
                            {
                              entry.nameHistory
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
                        {entry.verified ? (
                          <span>
                            Steam linked
                          </span>
                        ) : entry.claimed ? (
                          <span>claimed</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <RankChange
                        entry={entry}
                      />
                    </td>
                    <td className="px-5 py-4">
                      <WinRate entry={entry} />
                    </td>
                    <td className="px-4 py-4 text-right text-base font-semibold tabular-nums text-emerald-300">
                      {entry.wins}
                    </td>
                    <td className="px-4 py-4 text-right text-base tabular-nums text-orange-300">
                      {entry.losses}
                    </td>
                    <td className="px-4 py-4 text-right tabular-nums">
                      <div>
                        {entry.totalMatches}
                      </div>
                      {entry.unknowns > 0 ? (
                        <div className="mt-1 text-[10px] text-slate-500">
                          {entry.unknowns}{" "}
                          unresolved
                        </div>
                      ) : null}
                    </td>
                    <td
                      className={`px-5 py-4 text-right text-base font-semibold tabular-nums ${streakTone(entry.streakLabel)}`}
                    >
                      {entry.streakLabel ||
                        "—"}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr
                      id={historyId}
                      className="border-b border-cyan-200/10 bg-[linear-gradient(135deg,rgba(8,47,73,0.22),rgba(2,6,23,0.9))]"
                    >
                      <td
                        colSpan={9}
                        className="px-5 py-5"
                      >
                        <IdentityHistory
                          entry={entry}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid gap-3 md:hidden">
        {entries.map((entry) => {
          const expanded =
            expandedKeys.has(entry.key);
          const historyId =
            identityHistoryId(
              "mobile-identity-history",
              entry.key
            );

          return (
            <article
              key={entry.key}
              onClick={(event) =>
                toggleRowFromClick(
                  entry,
                  event
                )
              }
              className="cursor-pointer rounded-[1.25rem] border border-amber-200/12 bg-[linear-gradient(145deg,rgba(20,31,50,0.92),rgba(5,11,20,0.98))] p-4 transition hover:border-cyan-200/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-200/20 bg-amber-300/[0.06] font-bold tabular-nums text-amber-100">
                  #{entry.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={entry.href}
                    className="break-words text-base font-semibold text-cyan-100 underline decoration-cyan-300/20 underline-offset-4"
                  >
                    {entry.currentName}
                  </Link>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    {entry.identityKind ===
                    "steam"
                      ? "Steam account"
                      : entry.identityKind ===
                          "name"
                        ? "Name-only evidence"
                        : "Site profile"}
                    {entry.nameHistory
                      .length > 1
                      ? ` · ${entry.nameHistory.length} names`
                      : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-white">
                    {
                      entry.primaryRatingLabel
                    }
                  </div>
                  <RankChange
                    entry={entry}
                    compact
                  />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4 border-t border-white/[0.07] pt-3">
                <WinRate
                  entry={entry}
                  compact
                />
                <div className="text-right text-xs tabular-nums text-slate-300">
                  <div>
                    <span className="text-emerald-300">
                      {entry.wins}W
                    </span>{" "}
                    ·{" "}
                    <span className="text-orange-300">
                      {entry.losses}L
                    </span>{" "}
                    · {entry.totalMatches}{" "}
                    games
                  </div>
                  <div
                    className={`mt-1 font-semibold ${streakTone(entry.streakLabel)}`}
                  >
                    {entry.streakLabel ||
                      "No streak"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={historyId}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleRow(entry);
                }}
                className="mt-3 flex w-full items-center justify-between border-t border-white/[0.07] pt-3 text-left text-xs text-slate-400 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-200/50"
              >
                <span className="inline-flex items-center gap-2">
                  <History
                    className="h-4 w-4 text-cyan-200"
                    aria-hidden="true"
                  />
                  {expanded
                    ? "Hide name history"
                    : "Reveal name history"}
                </span>
                {expanded ? (
                  <ChevronDown
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRight
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                )}
              </button>
              {expanded ? (
                <div
                  id={historyId}
                  className="mt-4 border-t border-cyan-200/10 pt-4"
                >
                  <IdentityHistory
                    entry={entry}
                    compact
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </>
  );
}

function IdentityHistory({
  entry,
  compact = false,
}: {
  entry: LobbyLeaderboardEntry;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-100/65">
            <History
              className="h-4 w-4"
              aria-hidden="true"
            />
            Display-name history
          </div>
          <div className="mt-2 text-sm leading-6 text-slate-300">
            <span className="font-semibold text-white">
              {entry.currentName}
            </span>{" "}
            is the latest replay-observed
            display name. The main record is
            cumulative; each name below keeps
            its own replay-backed statistics.
          </div>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-right">
          <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">
            Identity key
          </div>
          <div className="mt-1 font-mono text-xs text-slate-300">
            {entry.steamId
              ? `SteamID64 ${entry.steamId}`
              : entry.identityKind ===
                  "name"
                ? "Name-only provisional"
                : "Site account"}
          </div>
        </div>
      </div>

      {entry.nameHistory.length > 0 ? (
        <div
          className={`mt-4 grid gap-2 ${
            compact
              ? "grid-cols-1"
              : "lg:grid-cols-2 xl:grid-cols-3"
          }`}
        >
          {entry.nameHistory.map(
            (history) => (
              <div
                key={history.normalizedName}
                className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 break-words font-semibold text-white">
                    {history.name}
                  </div>
                  {history.normalizedName ===
                  entry.nameHistory[0]
                    ?.normalizedName ? (
                    <span className="shrink-0 rounded-full border border-cyan-200/15 bg-cyan-300/[0.07] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-cyan-100">
                      Latest
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums text-slate-400">
                  <span className="text-slate-200">
                    {history.games} games
                  </span>
                  <span className="text-emerald-300">
                    {history.wins}W
                  </span>
                  <span className="text-orange-300">
                    {history.losses}L
                  </span>
                  <span>
                    {history.unknowns} unresolved
                  </span>
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.13em] text-slate-600">
                  {compactDate(
                    history.firstSeenAt
                  )}{" "}
                  →{" "}
                  {compactDate(
                    history.lastSeenAt
                  )}
                </div>
              </div>
            )
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-sm text-slate-400">
          No replay-observed display-name
          history is available for this
          site-only row.
        </div>
      )}
    </div>
  );
}
