"use client";

import {
  Activity,
  Crown,
  Flame,
  Rows3,
  Search,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { LivingLeaderboardTable } from "@/components/leaderboard/LivingLeaderboardTable";
import { LeaderboardScopeToggle } from "@/components/leaderboard/LeaderboardScopeToggle";
import { LeaderboardViewToggle } from "@/components/leaderboard/LeaderboardViewToggle";
import { LeaderboardWatcherCard } from "@/components/leaderboard/LeaderboardWatcherCard";
import { LeaderboardLaneToggle } from "@/components/lobby/LeaderboardLaneToggle";
import type { LobbyLeaderboardEntry } from "@/lib/lobby";
import type { LeaderboardLane } from "@/lib/leaderboardLane";
import type { LeaderboardScope } from "@/lib/leaderboardScope";
import type {
  LeaderboardSortDirection,
  LeaderboardSortKey,
} from "@/lib/leaderboardSort";
import type { TileViewMode } from "@/lib/tileViewPreferences";

const BOOKMARK_STORAGE_KEY =
  "aoe2war:living-leaderboard:bookmarks:v1";

function pulseWarrior(
  entry: LobbyLeaderboardEntry,
) {
  const streak = String(
    entry.streakLabel ?? "",
  )
    .trim()
    .toUpperCase();

  const streakMatch =
    streak.match(/^W(\d+)$/);

  const winStreak =
    streakMatch
      ? Number.parseInt(
          streakMatch[1],
          10,
        )
      : 0;

  return (
    entry.rankDelta24hState ===
      "new" ||
    entry.rankDelta24hState ===
      "up" ||
    winStreak >= 2
  );
}

function CommandButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/45 ${
        active
          ? "border-amber-200/28 bg-amber-300/[0.10] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(251,191,36,0.08)]"
          : "border-white/[0.08] bg-black/24 text-slate-500 hover:border-white/15 hover:bg-white/[0.04] hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function podiumMetal(
  rank: number,
) {
  if (rank === 1) {
    return "border-amber-200/28 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.16),transparent_58%),linear-gradient(145deg,rgba(79,54,14,0.30),rgba(4,9,17,0.80))]";
  }

  if (rank === 2) {
    return "border-slate-200/16 bg-[radial-gradient(circle_at_50%_0%,rgba(226,232,240,0.09),transparent_58%),linear-gradient(145deg,rgba(51,65,85,0.22),rgba(4,9,17,0.80))]";
  }

  return "border-orange-300/16 bg-[radial-gradient(circle_at_50%_0%,rgba(194,120,71,0.10),transparent_58%),linear-gradient(145deg,rgba(72,37,18,0.24),rgba(4,9,17,0.80))]";
}

function PodiumCard({
  entry,
}: {
  entry: LobbyLeaderboardEntry;
}) {
  return (
    <Link
      href={entry.href}
      title={`Open #${entry.rank} ${entry.currentName}`}
      className={`group min-w-0 rounded-[1rem] border px-3 py-3 transition hover:-translate-y-0.5 hover:border-amber-200/30 ${podiumMetal(
        entry.rank,
      )}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
          #{entry.rank}
        </span>

        {entry.rank === 1 ? (
          <Crown
            className="h-3.5 w-3.5 text-amber-300"
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div className="mt-2 truncate text-sm font-black text-slate-100 transition group-hover:text-white">
        {entry.currentName}
      </div>

      <div className="mt-1 text-xs font-bold tabular-nums text-amber-100/80">
        {entry.primaryRatingLabel}
      </div>
    </Link>
  );
}

export function LivingLeaderboard({
  viewMode,
  onViewModeChange,
  lane,
  onLaneChange,
  scope,
  onScopeChange,
  searchInput,
  onSearchInputChange,
  query,
  trackedPlayers,
  entries,
  sortKey,
  sortDirection,
  onSort,
  loading,
  loadingMore,
  error,
  hasMore,
  onRetry,
  onLoadMore,
}: {
  viewMode: TileViewMode;
  onViewModeChange: (
    mode: TileViewMode,
  ) => void;
  lane: LeaderboardLane;
  onLaneChange: (
    lane: LeaderboardLane,
  ) => void;
  scope: LeaderboardScope;
  onScopeChange: (
    scope: LeaderboardScope,
  ) => void;
  searchInput: string;
  onSearchInputChange: (
    value: string,
  ) => void;
  query: string;
  trackedPlayers: number;
  entries: LobbyLeaderboardEntry[];
  sortKey: LeaderboardSortKey | null;
  sortDirection:
    | LeaderboardSortDirection
    | null;
  onSort: (
    key: LeaderboardSortKey,
  ) => void;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  const [bookmarks, setBookmarks] =
    useState<Set<string>>(
      () => new Set(),
    );

  const [
    bookmarkedOnly,
    setBookmarkedOnly,
  ] = useState(false);

  const [
    pulseActive,
    setPulseActive,
  ] = useState(true);

  const [dense, setDense] =
    useState(false);

  useEffect(() => {
    try {
      const raw =
        window.localStorage.getItem(
          BOOKMARK_STORAGE_KEY,
        );

      const parsed =
        raw
          ? JSON.parse(raw)
          : [];

      if (
        Array.isArray(parsed) &&
        parsed.every(
          (value) =>
            typeof value ===
            "string",
        )
      ) {
        setBookmarks(
          new Set(parsed),
        );
      }
    } catch {
      // Local preference failure should never block the board.
    }
  }, []);

  const toggleBookmark = (
    entry: LobbyLeaderboardEntry,
  ) => {
    setBookmarks((current) => {
      const next =
        new Set(current);

      if (next.has(entry.key)) {
        next.delete(entry.key);
      } else {
        next.add(entry.key);
      }

      try {
        window.localStorage.setItem(
          BOOKMARK_STORAGE_KEY,
          JSON.stringify([
            ...next,
          ]),
        );
      } catch {
        // Keep the in-memory interaction even when persistence is unavailable.
      }

      return next;
    });
  };

  const visibleEntries =
    useMemo(
      () =>
        bookmarkedOnly
          ? entries.filter(
              (entry) =>
                bookmarks.has(
                  entry.key,
                ),
            )
          : entries,
      [
        bookmarkedOnly,
        bookmarks,
        entries,
      ],
    );

  const podium = useMemo(
    () =>
      [...entries]
        .sort(
          (left, right) =>
            left.rank -
            right.rank,
        )
        .slice(0, 3),
    [entries],
  );

  const loadedMovers =
    entries.filter(
      (entry) =>
        pulseWarrior(entry),
    ).length;

  const loadedOnline =
    entries.filter(
      (entry) =>
        entry.isOnline,
    ).length;

  const visibleCount =
    bookmarkedOnly
      ? visibleEntries.length
      : trackedPlayers;

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-amber-200/22 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.11),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.08),transparent_28%),linear-gradient(145deg,#0b1728,#050b15_56%,#02060d)] shadow-[0_40px_130px_rgba(0,0,0,0.48),0_0_0_1px_rgba(201,155,60,0.045)]">
      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/50 to-transparent" />

      <div className="absolute right-5 top-5 z-20 sm:right-8 sm:top-8 lg:right-10">
        <LeaderboardViewToggle
          value={viewMode}
          onChange={
            onViewModeChange
          }
        />
      </div>

      <header className="relative grid gap-7 border-b border-amber-200/15 px-5 pb-7 pt-7 sm:px-8 sm:pb-8 sm:pt-9 lg:grid-cols-[minmax(0,1fr)_minmax(28rem,38rem)] lg:px-10 lg:pb-9 lg:pt-10">
        <div className="min-w-0 pr-0 lg:pr-8">
          <div className="text-[10px] font-black uppercase tracking-[0.38em] text-amber-200/65">
            AoE2WAR · Living Ranked Command
          </div>

          <h1 className="mt-3 font-serif text-4xl font-semibold tracking-[-0.045em] text-amber-50 sm:text-5xl lg:text-[3.7rem]">
            HD Leaderboard
          </h1>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-200/12 bg-cyan-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/80">
              {lane.toUpperCase()}
            </span>

            <span className="rounded-full border border-amber-200/12 bg-amber-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-amber-100/80">
              {scope === "claimed"
                ? "Kingdom"
                : "Warriors"}
            </span>

            <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              {entries.length} loaded
            </span>

            {loadedMovers > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-orange-300/12 bg-orange-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-200/80"
                title="Loaded warriors with upward 24h movement, a new-board state, or a winning streak"
              >
                <Flame
                  className="h-3 w-3"
                  aria-hidden="true"
                />
                {loadedMovers}
              </span>
            ) : null}

            {loadedOnline > 0 ? (
              <span className="rounded-full border border-emerald-300/12 bg-emerald-300/[0.045] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-emerald-300/80">
                {loadedOnline} online
              </span>
            ) : null}
          </div>
        </div>

        <div className="min-w-0 pt-10 lg:pt-8">
          {podium.length > 0 ? (
            <div className="grid grid-cols-3 gap-2">
              {podium.map(
                (entry) => (
                  <PodiumCard
                    key={entry.key}
                    entry={entry}
                  />
                ),
              )}
            </div>
          ) : null}

          <div className="mt-3">
            <LeaderboardWatcherCard />
          </div>
        </div>
      </header>

      <div className="grid gap-3 border-b border-white/[0.07] bg-black/18 px-5 py-4 sm:px-8 lg:grid-cols-[auto_auto_minmax(19rem,1fr)_auto_auto] lg:items-center lg:px-10">
        <LeaderboardLaneToggle
          lane={lane}
          onChange={onLaneChange}
          loading={loading}
          variant="compact"
        />

        <LeaderboardScopeToggle
          value={scope}
          onChange={onScopeChange}
        />

        <label className="relative block min-w-0 lg:mx-auto lg:w-full lg:max-w-2xl">
          <span className="sr-only">
            Search warriors
          </span>

          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-amber-200/65"
            aria-hidden="true"
          />

          <input
            type="search"
            value={searchInput}
            onChange={(event) =>
              onSearchInputChange(
                event.target.value,
              )
            }
            placeholder="Search warrior"
            className="h-12 w-full rounded-xl border border-white/[0.09] bg-[#020711]/88 pl-11 pr-11 text-sm font-medium text-white outline-none transition placeholder:text-slate-600 hover:border-cyan-200/20 focus:border-amber-200/45 focus:ring-2 focus:ring-amber-200/10"
          />

          {searchInput ? (
            <button
              type="button"
              onClick={() =>
                onSearchInputChange("")
              }
              aria-label="Clear warrior search"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.05] hover:text-white"
            >
              <X
                className="h-4 w-4"
                aria-hidden="true"
              />
            </button>
          ) : null}
        </label>

        <div className="flex items-center gap-2">
          <CommandButton
            active={
              sortKey ===
              "rank_change_24h"
            }
            label="Sort by 24 hour movement"
            onClick={() =>
              onSort(
                "rank_change_24h",
              )
            }
          >
            <Activity
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={pulseActive}
            label="Highlight rank pulse"
            onClick={() =>
              setPulseActive(
                (current) =>
                  !current,
              )
            }
          >
            <Flame
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={bookmarkedOnly}
            label="Show bookmarked warriors"
            onClick={() =>
              setBookmarkedOnly(
                (current) =>
                  !current,
              )
            }
          >
            <Star
              className={`h-4 w-4 ${
                bookmarkedOnly
                  ? "fill-current"
                  : ""
              }`}
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={dense}
            label="Compact row density"
            onClick={() =>
              setDense(
                (current) =>
                  !current,
              )
            }
          >
            <Rows3
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>
        </div>

        <div className="min-w-[7rem] text-left lg:text-right">
          <div className="text-2xl font-black tabular-nums text-white">
            {visibleCount.toLocaleString()}
          </div>

          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
            {bookmarkedOnly
              ? "saved"
              : query
                ? "matching"
                : scope ===
                    "claimed"
                  ? "kingdom"
                  : "warriors"}
          </div>
        </div>
      </div>

      <div
        className="border-t border-amber-200/10 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.04),transparent_24%)] p-2 sm:p-3 lg:p-4"
        aria-busy={
          loading || loadingMore
        }
      >
        {loading ? (
          <div
            className="space-y-2"
            aria-label="Loading leaderboard"
          >
            {Array.from(
              { length: 8 },
              (_, index) => (
                <div
                  key={index}
                  className="h-16 animate-pulse rounded-xl border border-white/[0.05] bg-white/[0.025]"
                />
              ),
            )}
          </div>
        ) : visibleEntries.length ===
            0 &&
          bookmarkedOnly ? (
          <div className="grid min-h-52 place-items-center rounded-[1.35rem] border border-amber-200/10 bg-black/20">
            <Star
              className="h-7 w-7 text-amber-200/45"
              aria-label="No bookmarked warriors"
            />
          </div>
        ) : visibleEntries.length ===
            0 &&
          query ? (
          <div className="grid min-h-52 place-items-center rounded-[1.35rem] border border-white/[0.07] bg-black/20 text-slate-500">
            No warrior matches “{query}”.
          </div>
        ) : visibleEntries.length ===
          0 ? (
          <div className="grid min-h-52 place-items-center rounded-[1.35rem] border border-white/[0.07] bg-black/20 text-slate-500">
            No ranked warriors.
          </div>
        ) : (
          <LivingLeaderboardTable
            entries={visibleEntries}
            sortKey={sortKey}
            sortDirection={
              sortDirection
            }
            onSort={onSort}
            bookmarks={bookmarks}
            onToggleBookmark={
              toggleBookmark
            }
            pulseActive={
              pulseActive
            }
            dense={dense}
          />
        )}

        {error ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-300/18 bg-orange-400/[0.05] px-4 py-3 text-sm text-orange-100">
            <span>{error}</span>

            <button
              type="button"
              onClick={onRetry}
              className="font-black uppercase tracking-[0.12em] underline underline-offset-4"
            >
              Retry
            </button>
          </div>
        ) : null}

        {hasMore && !loading ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={onLoadMore}
            className="mt-3 w-full rounded-xl border border-amber-200/12 bg-amber-300/[0.035] px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/75 transition hover:border-amber-200/28 hover:bg-amber-300/[0.07] disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore
              ? "Calling warriors…"
              : "More"}
          </button>
        ) : null}
      </div>
    </section>
  );
}
