"use client";

import {
  Activity,
  Columns3,
  Crosshair,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Rows3,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";

import {
  LivingLeaderboardTable,
} from "@/components/leaderboard/LivingLeaderboardTable";
import {
  LeaderboardScopeToggle,
} from "@/components/leaderboard/LeaderboardScopeToggle";
import {
  LeaderboardViewToggle,
} from "@/components/leaderboard/LeaderboardViewToggle";
import {
  LeaderboardWatcherCard,
} from "@/components/leaderboard/LeaderboardWatcherCard";
import {
  LeaderboardLaneToggle,
} from "@/components/lobby/LeaderboardLaneToggle";
import type {
  LobbyLeaderboardEntry,
} from "@/lib/lobby";
import type {
  LeaderboardLane,
} from "@/lib/leaderboardLane";
import type {
  LeaderboardScope,
} from "@/lib/leaderboardScope";
import type {
  LeaderboardSortDirection,
  LeaderboardSortKey,
} from "@/lib/leaderboardSort";
import {
  DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS,
  LIVING_LEADERBOARD_COLUMNS,
  LIVING_LEADERBOARD_WINDOW_ROWS,
  type LivingLeaderboardColumnKey,
  type LivingLeaderboardPreferences,
} from "@/lib/livingLeaderboardPreferences";
import type {
  TileViewMode,
} from "@/lib/tileViewPreferences";

export type LivingLeaderboardSpotlightTarget = {
  key: string;
  rank: number;
  name: string;
  mode: "top" | "center";
};

const LIVING_COLUMN_LABELS:
  Record<
    LivingLeaderboardColumnKey,
    string
  > = {
    rating: "Rating",
    movement24h: "24h",
    last10: "Last 10",
    last30: "30d",
    winRate: "Win %",
    record: "W–L",
    games: "Games",
    streak: "Streak",
    lastPlayed: "Last played",
  };

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
  disabled = false,
  label,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition-[border-color,background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/45 disabled:cursor-not-allowed disabled:opacity-25 ${
        active
          ? "border-amber-200/28 bg-amber-300/[0.10] text-amber-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(251,191,36,0.08)]"
          : "border-transparent bg-transparent text-slate-500 hover:border-white/[0.08] hover:bg-white/[0.045] hover:text-slate-100"
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
    return "border-amber-200/42 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.25),transparent_62%),linear-gradient(145deg,rgba(92,61,14,0.38),rgba(4,9,17,0.88))] shadow-[inset_0_1px_0_rgba(255,243,190,0.10),0_10px_34px_rgba(245,158,11,0.09),0_0_28px_rgba(251,191,36,0.07)]";
  }

  if (rank === 2) {
    return "border-slate-200/24 bg-[radial-gradient(circle_at_50%_0%,rgba(226,232,240,0.13),transparent_60%),linear-gradient(145deg,rgba(51,65,85,0.28),rgba(4,9,17,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
  }

  return "border-orange-300/24 bg-[radial-gradient(circle_at_50%_0%,rgba(194,120,71,0.15),transparent_60%),linear-gradient(145deg,rgba(82,40,18,0.30),rgba(4,9,17,0.86))] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
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
  podiumEntries,
  sortKey,
  sortDirection,
  onSort,
  loading,
  loadingMore,
  error,
  hasMore,
  onRetry,
  onLoadMore,
  preferences,
  onPreferencesChange,
  spotlightTarget,
  spotlightLoading,
  spotlightAvailable,
  personalRankViewActive,
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
  podiumEntries: LobbyLeaderboardEntry[];
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
  preferences: LivingLeaderboardPreferences;
  onPreferencesChange: (
    patch: Partial<LivingLeaderboardPreferences>,
  ) => void;
  spotlightTarget:
    | LivingLeaderboardSpotlightTarget
    | null;
  spotlightLoading: boolean;
  spotlightAvailable: boolean;
  personalRankViewActive: boolean;
}) {
  const viewportRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const [
    rankWindowOpen,
    setRankWindowOpen,
  ] =
    useState(false);

  const [
    hiddenOpen,
    setHiddenOpen,
  ] =
    useState(false);

  const [
    columnsOpen,
    setColumnsOpen,
  ] =
    useState(false);

  const [
    rankStartDraft,
    setRankStartDraft,
  ] =
    useState(
      String(
        preferences.rankWindowStart ??
          1,
      ),
    );

  useEffect(() => {
    setRankStartDraft(
      String(
        preferences.rankWindowStart ??
          1,
      ),
    );
  }, [
    preferences.rankWindowStart,
  ]);

  const bookmarks =
    useMemo(
      () =>
        new Set(
          preferences.bookmarkedPlayerKeys,
        ),
      [
        preferences.bookmarkedPlayerKeys,
      ],
    );

  const hiddenKeys =
    useMemo(
      () =>
        new Set(
          preferences.hiddenPlayers.map(
            (entry) =>
              entry.key,
          ),
        ),
      [
        preferences.hiddenPlayers,
      ],
    );

  const unhiddenEntries =
    useMemo(
      () =>
        entries.filter(
          (entry) =>
            !hiddenKeys.has(
              entry.key,
            ) ||
            entry.key ===
              spotlightTarget?.key,
        ),
      [
        entries,
        hiddenKeys,
        spotlightTarget?.key,
      ],
    );

  const visibleEntries =
    useMemo(
      () =>
        preferences.bookmarkedOnly
          ? unhiddenEntries.filter(
              (entry) =>
                bookmarks.has(
                  entry.key,
                ),
            )
          : unhiddenEntries,
      [
        bookmarks,
        preferences.bookmarkedOnly,
        unhiddenEntries,
      ],
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

  const toggleBookmark = (
    entry: LobbyLeaderboardEntry,
  ) => {
    const next =
      new Set(
        preferences.bookmarkedPlayerKeys,
      );

    if (next.has(entry.key)) {
      next.delete(entry.key);
    } else {
      next.add(entry.key);
    }

    onPreferencesChange({
      bookmarkedPlayerKeys:
        Array.from(next),
    });
  };

  const hideEntry = (
    entry: LobbyLeaderboardEntry,
  ) => {
    if (
      hiddenKeys.has(entry.key)
    ) {
      return;
    }

    onPreferencesChange({
      hiddenPlayers: [
        ...preferences.hiddenPlayers,
        {
          key: entry.key,
          name:
            entry.currentName,
        },
      ],
    });
  };

  const unhideEntry = (
    key: string,
  ) => {
    onPreferencesChange({
      hiddenPlayers:
        preferences.hiddenPlayers.filter(
          (entry) =>
            entry.key !== key,
        ),
    });
  };

  const toggleColumn = (
    column:
      LivingLeaderboardColumnKey,
  ) => {
    const next =
      new Set(
        preferences.columnMode ===
        "custom"
          ? preferences.visibleColumns
          : DEFAULT_LIVING_LEADERBOARD_VISIBLE_COLUMNS,
      );

    if (next.has(column)) {
      next.delete(column);
    } else {
      next.add(column);
    }

    onPreferencesChange({
      columnMode: "custom",
      visibleColumns:
        LIVING_LEADERBOARD_COLUMNS.filter(
          (candidate) =>
            next.has(candidate),
        ),
    });
  };

  const cycleSpotlight = () => {
    const next =
      preferences.spotlightMode ===
      "off"
        ? "top"
        : preferences.spotlightMode ===
            "top"
          ? "center"
          : "off";

    onPreferencesChange({
      spotlightMode: next,
    });

    setRankWindowOpen(false);
    setHiddenOpen(false);
    setColumnsOpen(false);
  };

  const applyRankWindow = () => {
    const parsed =
      Number.parseInt(
        rankStartDraft,
        10,
      );

    const start =
      Number.isFinite(parsed)
        ? Math.max(
            1,
            Math.min(
              Math.max(
                1,
                trackedPlayers,
              ),
              parsed,
            ),
          )
        : 1;

    onPreferencesChange({
      spotlightMode: "off",
      rankWindowStart:
        start,
    });

    setRankWindowOpen(false);
  };

  const clearRankWindow = () => {
    onPreferencesChange({
      rankWindowStart:
        null,
    });

    setRankWindowOpen(false);
  };

  useEffect(() => {
    if (
      !spotlightTarget ||
      !viewportRef.current
    ) {
      return;
    }

    const viewport =
      viewportRef.current;

    const candidates =
      Array.from(
        viewport.querySelectorAll<HTMLElement>(
          '[data-living-spotlight="true"]',
        ),
      );

    const target =
      candidates.find(
        (candidate) =>
          candidate.offsetParent !==
          null,
      );

    if (!target) {
      return;
    }

    const viewportRect =
      viewport.getBoundingClientRect();

    const targetRect =
      target.getBoundingClientRect();

    const stickyHeader =
      viewport.querySelector<HTMLElement>(
        "thead",
      );

    const stickyHeight =
      stickyHeader
        ?.getBoundingClientRect()
        .height ?? 0;

    const targetTop =
      viewport.scrollTop +
      targetRect.top -
      viewportRect.top;

    const desiredTop =
      spotlightTarget.mode ===
      "center"
        ? targetTop -
          (
            viewport.clientHeight -
            targetRect.height
          ) /
            2
        : targetTop -
          stickyHeight -
          8;

    viewport.scrollTo({
      top: Math.max(
        0,
        desiredTop,
      ),
      behavior:
        spotlightTarget.mode ===
        "center"
          ? "smooth"
          : "auto",
    });
  }, [
    entries,
    spotlightTarget,
  ]);

  const handleViewportScroll = (
    event: UIEvent<HTMLDivElement>,
  ) => {
    if (
      personalRankViewActive ||
      loading ||
      loadingMore ||
      !hasMore
    ) {
      return;
    }

    const node =
      event.currentTarget;

    if (
      node.scrollTop +
        node.clientHeight >=
      node.scrollHeight -
        900
    ) {
      onLoadMore();
    }
  };

  const rankWindowEnd =
    preferences.rankWindowStart
      ? Math.min(
          trackedPlayers,
          preferences.rankWindowStart +
            preferences.rankWindowRows -
            1,
        )
      : null;

  const countLabel =
    spotlightTarget
      ? `#${spotlightTarget.rank}`
      : preferences.rankWindowStart &&
          rankWindowEnd
        ? `${preferences.rankWindowStart}–${rankWindowEnd}`
        : preferences.bookmarkedOnly
          ? String(
              visibleEntries.length,
            )
          : trackedPlayers.toLocaleString();

  const countSublabel =
    spotlightTarget
      ? "spotlight"
      : preferences.rankWindowStart
        ? "window"
        : preferences.bookmarkedOnly
          ? "saved"
          : query
            ? "matching"
            : scope === "claimed"
              ? "kingdom"
              : "warriors";

  return (
    <section className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-[2rem] border border-amber-200/22 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.11),transparent_30%),radial-gradient(circle_at_88%_0%,rgba(251,191,36,0.08),transparent_28%),linear-gradient(145deg,#0b1728,#050b15_56%,#02060d)] shadow-[0_40px_130px_rgba(0,0,0,0.48),0_0_0_1px_rgba(201,155,60,0.045)]">
      <div className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/50 to-transparent" />

      <div className="absolute right-5 top-4 z-20 sm:right-8 sm:top-5 lg:right-10 lg:top-5">
        <LeaderboardViewToggle
          value={viewMode}
          onChange={
            onViewModeChange
          }
        />
      </div>

      <header className="relative shrink-0 grid gap-5 border-b border-amber-200/15 px-5 py-5 sm:px-8 sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,40rem)] lg:items-center lg:px-10 lg:py-6">
        <div className="min-w-0 pr-0 lg:pr-6">
          <div className="text-[10px] font-black uppercase tracking-[0.38em] text-amber-200/65">
            AoE2WAR · Living Ranked Command
          </div>

          <h1 className="mt-2.5 font-serif text-4xl font-semibold tracking-[-0.045em] text-amber-50 sm:text-5xl lg:text-[3.45rem]">
            HD Leaderboard
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-2">
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
                title="Loaded rank pulse"
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

        <div className="min-w-0 pt-8 lg:pt-7">
          {podiumEntries.length > 0 ? (
            <div className="grid grid-cols-3 gap-2.5">
              {podiumEntries.map(
                (entry) => (
                  <PodiumCard
                    key={entry.key}
                    entry={entry}
                  />
                ),
              )}
            </div>
          ) : null}

          <div className="mt-2">
            <LeaderboardWatcherCard />
          </div>
        </div>
      </header>

      <div className="relative shrink-0 grid gap-3 border-b border-white/[0.07] bg-black/20 px-5 py-3 sm:px-8 lg:grid-cols-[auto_auto_minmax(24rem,1fr)_auto_auto] lg:items-center lg:px-10">
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

        <label className="relative block min-w-0 lg:mx-auto lg:w-full lg:max-w-3xl">
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
            style={{
              backgroundColor:
                "#020711",
              color:
                "#f8fafc",
              WebkitTextFillColor:
                "#f8fafc",
              colorScheme:
                "dark",
              caretColor:
                "#fde68a",
            }}
            className="h-11 w-full appearance-none rounded-xl border border-cyan-200/12 bg-[#020711] pl-11 pr-11 text-sm font-semibold text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.025),0_8px_28px_rgba(0,0,0,0.18)] outline-none transition-[border-color,box-shadow] placeholder:text-slate-600 hover:border-cyan-200/24 focus:border-amber-200/48 focus:ring-2 focus:ring-amber-200/10 [&::-webkit-search-cancel-button]:appearance-none"
          />

          {searchInput ? (
            <button
              type="button"
              onClick={() =>
                onSearchInputChange(
                  "",
                )
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

        <div className="relative flex items-center gap-1 rounded-xl border border-white/[0.07] bg-[#020711]/75 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <CommandButton
            active={
              preferences.spotlightMode !==
              "off"
            }
            disabled={
              !spotlightAvailable ||
              spotlightLoading
            }
            label={
              !spotlightAvailable
                ? "Sign in to spotlight yourself"
                : preferences.spotlightMode ===
                    "off"
                  ? "Spotlight me · top"
                  : preferences.spotlightMode ===
                      "top"
                    ? "Spotlight me · center"
                    : "Exit spotlight"
            }
            onClick={
              cycleSpotlight
            }
          >
            <Crosshair
              className={`h-4 w-4 ${
                spotlightLoading
                  ? "animate-pulse"
                  : ""
              }`}
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              preferences.rankWindowStart !==
              null
            }
            label="Rank window"
            onClick={() => {
              setRankWindowOpen(
                (current) =>
                  !current,
              );
              setHiddenOpen(false);
              setColumnsOpen(false);
            }}
          >
            <SlidersHorizontal
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              sortKey ===
              "rank_change_24h"
            }
            label="24 hour rank movement"
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
            active={
              preferences.pulseActive
            }
            label="Highlight rank pulse"
            onClick={() =>
              onPreferencesChange({
                pulseActive:
                  !preferences.pulseActive,
              })
            }
          >
            <Flame
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              preferences.bookmarkedOnly
            }
            label="Show bookmarked warriors"
            onClick={() =>
              onPreferencesChange({
                bookmarkedOnly:
                  !preferences.bookmarkedOnly,
              })
            }
          >
            <Star
              className={`h-4 w-4 ${
                preferences.bookmarkedOnly
                  ? "fill-current"
                  : ""
              }`}
              aria-hidden="true"
            />
          </CommandButton>

          {preferences.hiddenPlayers.length >
          0 ? (
            <CommandButton
              active={hiddenOpen}
              label={`${preferences.hiddenPlayers.length} hidden warrior${preferences.hiddenPlayers.length === 1 ? "" : "s"}`}
              onClick={() => {
                setHiddenOpen(
                  (current) =>
                    !current,
                );
                setRankWindowOpen(false);
                setColumnsOpen(false);
              }}
            >
              <span className="relative">
                <EyeOff
                  className="h-4 w-4"
                  aria-hidden="true"
                />
                <span className="absolute -right-2 -top-2 min-w-4 rounded-full bg-slate-200 px-1 text-center text-[8px] font-black leading-4 text-slate-950">
                  {
                    preferences
                      .hiddenPlayers
                      .length
                  }
                </span>
              </span>
            </CommandButton>
          ) : null}

          <CommandButton
            active={
              columnsOpen ||
              preferences.columnMode ===
                "custom"
            }
            label="Columns"
            onClick={() => {
              setColumnsOpen(
                (current) =>
                  !current,
              );
              setRankWindowOpen(false);
              setHiddenOpen(false);
            }}
          >
            <Columns3
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          <CommandButton
            active={
              preferences.dense
            }
            label="Compact row density"
            onClick={() =>
              onPreferencesChange({
                dense:
                  !preferences.dense,
              })
            }
          >
            <Rows3
              className="h-4 w-4"
              aria-hidden="true"
            />
          </CommandButton>

          {columnsOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-72 rounded-2xl border border-white/12 bg-[#040913]/98 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-2 pb-2">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Columns
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onPreferencesChange({
                      columnMode:
                        "auto",
                    })
                  }
                  className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition ${
                    preferences.columnMode ===
                    "auto"
                      ? "border-amber-200/28 bg-amber-300/[0.09] text-amber-100"
                      : "border-white/[0.07] text-slate-500 hover:text-white"
                  }`}
                >
                  Auto
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1">
                {LIVING_LEADERBOARD_COLUMNS.map(
                  (column) => {
                    const selected =
                      preferences.visibleColumns.includes(
                        column,
                      );

                    const active =
                      preferences.columnMode ===
                        "custom" &&
                      selected;

                    return (
                      <button
                        key={column}
                        type="button"
                        onClick={() =>
                          toggleColumn(
                            column,
                          )
                        }
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-[0.12em] transition ${
                          active
                            ? "border-cyan-200/20 bg-cyan-300/[0.065] text-cyan-50"
                            : "border-transparent text-slate-500 hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-white"
                        }`}
                      >
                        <span>
                          {
                            LIVING_COLUMN_LABELS[
                              column
                            ]
                          }
                        </span>

                        {preferences.columnMode ===
                        "custom" ? (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              selected
                                ? "bg-cyan-200"
                                : "bg-slate-800"
                            }`}
                          />
                        ) : null}
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}

          {rankWindowOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-72 rounded-2xl border border-amber-200/16 bg-[#040913]/98 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label>
                  <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    From
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(
                      1,
                      trackedPlayers,
                    )}
                    value={
                      rankStartDraft
                    }
                    onChange={(
                      event,
                    ) =>
                      setRankStartDraft(
                        event.target
                          .value,
                      )
                    }
                    className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/35 px-3 font-black tabular-nums text-white outline-none focus:border-amber-200/40"
                  />
                </label>

                <div>
                  <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Rows
                  </span>

                  <div className="mt-2 flex gap-1">
                    {LIVING_LEADERBOARD_WINDOW_ROWS.map(
                      (rows) => (
                        <button
                          key={rows}
                          type="button"
                          onClick={() =>
                            onPreferencesChange(
                              {
                                rankWindowRows:
                                  rows,
                              },
                            )
                          }
                          className={`h-10 rounded-lg border px-2.5 text-[10px] font-black tabular-nums transition ${
                            preferences.rankWindowRows ===
                            rows
                              ? "border-amber-200/30 bg-amber-300/[0.10] text-amber-100"
                              : "border-white/[0.07] bg-white/[0.02] text-slate-500 hover:text-white"
                          }`}
                        >
                          {rows}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={
                    applyRankWindow
                  }
                  className="flex-1 rounded-lg border border-amber-200/28 bg-amber-300/[0.09] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-300/[0.14]"
                >
                  Apply
                </button>

                {preferences.rankWindowStart !==
                null ? (
                  <button
                    type="button"
                    onClick={
                      clearRankWindow
                    }
                    className="rounded-lg border border-white/[0.08] px-3 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 transition hover:text-white"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {hiddenOpen ? (
            <div className="absolute right-0 top-[calc(100%+0.55rem)] z-40 w-80 rounded-2xl border border-white/12 bg-[#040913]/98 p-3 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 px-2 pb-2">
                <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Hidden ·{" "}
                  {
                    preferences
                      .hiddenPlayers
                      .length
                  }
                </div>

                <button
                  type="button"
                  onClick={() =>
                    onPreferencesChange({
                      hiddenPlayers:
                        [],
                    })
                  }
                  className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-500 hover:text-white"
                >
                  All
                </button>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto">
                {preferences.hiddenPlayers.map(
                  (entry) => (
                    <button
                      key={
                        entry.key
                      }
                      type="button"
                      onClick={() =>
                        unhideEntry(
                          entry.key,
                        )
                      }
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/[0.07] hover:bg-white/[0.035]"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-300">
                        {
                          entry.name
                        }
                      </span>

                      <Eye
                        className="h-4 w-4 shrink-0 text-slate-600"
                        aria-hidden="true"
                      />
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-w-[7rem] text-left lg:text-right">
          <div className="text-2xl font-black tabular-nums text-white">
            {countLabel}
          </div>

          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-600">
            {countSublabel}
          </div>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-hidden border-t border-amber-200/10 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.04),transparent_24%)] p-2 sm:p-3 lg:p-4"
        aria-busy={
          loading ||
          loadingMore
        }
      >
        <div
          ref={viewportRef}
          data-living-leaderboard-viewport
          onScroll={
            handleViewportScroll
          }
          className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
        >
          {loading &&
          entries.length === 0 ? (
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
            preferences.bookmarkedOnly ? (
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
              entries={
                visibleEntries
              }
              sortKey={sortKey}
              sortDirection={
                sortDirection
              }
              onSort={onSort}
              bookmarks={
                bookmarks
              }
              onToggleBookmark={
                toggleBookmark
              }
              onHideEntry={
                hideEntry
              }
              spotlightKey={
                spotlightTarget?.key ??
                null
              }
              pulseActive={
                preferences.pulseActive
              }
              dense={
                preferences.dense
              }
              columnMode={
                preferences.columnMode
              }
              visibleColumns={
                preferences.visibleColumns
              }
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

          {hasMore &&
          !loading &&
          !personalRankViewActive ? (
            <button
              type="button"
              disabled={
                loadingMore
              }
              onClick={
                onLoadMore
              }
              className="mt-3 w-full rounded-xl border border-amber-200/12 bg-amber-300/[0.035] px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100/75 transition hover:border-amber-200/28 hover:bg-amber-300/[0.07] disabled:cursor-wait disabled:opacity-60"
            >
              {loadingMore
                ? "Calling warriors…"
                : "More"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
