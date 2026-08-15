"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ExternalLink,
  Flame,
  Minus,
  Star,
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
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`px-3 py-3.5 text-[10px] font-black uppercase tracking-[0.19em] text-amber-100/80 ${
        align === "right"
          ? "text-right"
          : "text-left"
      }`}
    >
      {children}
    </th>
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

export function LivingLeaderboardTable({
  entries,
  sortKey,
  sortDirection,
  onSort,
  bookmarks,
  onToggleBookmark,
  pulseActive,
  dense,
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
  pulseActive: boolean;
  dense: boolean;
}) {
  const [expandedKeys, setExpandedKeys] =
    useState<Set<string>>(
      () => new Set(),
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
      ? "py-2.5"
      : "py-4";

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[1.4rem] border border-amber-200/12 bg-[#040914] shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] md:block">
        <table className="w-full min-w-[72rem] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-[#07101f]/98 shadow-[0_1px_0_rgba(251,191,36,0.22)] backdrop-blur-xl">
            <tr>
              <SortHeader
                label="Rank"
                column="rank"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                className="w-28"
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
                className="w-28"
              />

              <SortHeader
                label="24h"
                column="rank_change_24h"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                align="right"
                className="w-28"
              />

              <SortHeader
                label="Win %"
                column="win_rate"
                sortKey={sortKey}
                sortDirection={
                  sortDirection
                }
                onSort={onSort}
                className="w-40"
              />

              <StaticHeader align="right">
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
                className="w-24"
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
                className="w-24"
              />

              <StaticHeader align="right">
                Last
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

                const id =
                  rowId(entry.key);

                return (
                  <Fragment
                    key={entry.key}
                  >
                    <tr
                      onClick={(event) =>
                        toggleFromRow(
                          entry,
                          event,
                        )
                      }
                      className={`group cursor-pointer border-b border-white/[0.045] text-sm transition-[background-color,box-shadow] duration-150 ${
                        index % 2 === 0
                          ? "bg-slate-900/44"
                          : "bg-black/18"
                      } ${
                        hot
                          ? "shadow-[inset_3px_0_0_rgba(251,191,36,0.55)] hover:bg-amber-300/[0.055]"
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
                              toggleRow(
                                entry,
                              );
                            }}
                            aria-expanded={
                              expanded
                            }
                            aria-controls={id}
                            className={`inline-flex min-w-[4.4rem] items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 font-black tabular-nums transition ${rankMetal(
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
                          </button>
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
                            className="min-w-0 truncate text-[0.95rem] font-bold text-cyan-100 decoration-cyan-300/20 underline-offset-4 transition hover:text-white hover:underline"
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

                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-600">
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
                        className={`px-3 text-right ${vertical}`}
                      >
                        <div className="text-base font-black tabular-nums text-white">
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
                        className={`px-3 text-right ${vertical}`}
                      >
                        <RankMovement
                          entry={entry}
                        />
                      </td>

                      <td
                        className={`px-3 ${vertical}`}
                      >
                        <WinRateMeter
                          entry={entry}
                        />
                      </td>

                      <td
                        className={`px-3 text-right ${vertical}`}
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
                        className={`px-3 text-right tabular-nums text-slate-300 ${vertical}`}
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
                        className={`px-3 text-right text-base font-black tabular-nums ${vertical} ${streakTone(
                          entry.streakLabel,
                        )}`}
                      >
                        {entry.streakLabel ||
                          "—"}
                      </td>

                      <td
                        className={`px-4 text-right ${vertical}`}
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

                    {expanded ? (
                      <tr
                        id={id}
                        className="border-b border-cyan-200/[0.08] bg-[#020813]"
                      >
                        <td
                          colSpan={9}
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

          const id =
            rowId(
              `mobile-${entry.key}`,
            );

          return (
            <article
              key={entry.key}
              onClick={(event) =>
                toggleFromRow(
                  entry,
                  event,
                )
              }
              className={`relative overflow-hidden rounded-[1.25rem] border p-4 transition ${
                hot
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
    </>
  );
}
