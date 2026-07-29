"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import { LeaderboardLaneToggle } from "@/components/lobby/LeaderboardLaneToggle";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import { LobbyViewToggle } from "@/components/lobby/LobbyAppearanceControls";
import type { LobbyLeaderboardSummary } from "@/lib/lobby";
import type { LeaderboardLane } from "@/lib/leaderboardLane";
import { trackLeaderboardEvent } from "@/lib/leaderboardTelemetry";

type LeaderboardPanelProps = {
  leaderboard: LobbyLeaderboardSummary;
  onlineCount: number;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  onViewModeChange: (viewMode: LobbyViewMode) => void;
  leaderboardLane: LeaderboardLane;
  leaderboardLaneLoading: boolean;
  onLeaderboardLaneChange: (lane: LeaderboardLane) => void;
  laneToggleVariant?: "card" | "compact";
  surface?: "standard" | "extreme";
};

const LEADERBOARD_PAGE_SIZE = 64;

type LeaderboardPageResponse = {
  ok?: boolean;
  entries?: LobbyLeaderboardSummary["entries"];
  nextOffset?: number;
  hasMore?: boolean;
};

function countRankedLeaderboardEntries(entries: LobbyLeaderboardSummary["entries"]) {
  return entries.filter((entry) => entry.totalMatches > 0).length;
}

function mergeLeaderboardEntries(
  primary: LobbyLeaderboardSummary["entries"],
  secondary: LobbyLeaderboardSummary["entries"]
) {
  const byKey = new Map<string, LobbyLeaderboardSummary["entries"][number]>();

  for (const entry of [...primary, ...secondary]) {
    byKey.set(entry.key, entry);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    return left.name.localeCompare(right.name);
  });
}

function buildRecordLabel(entry: LobbyLeaderboardSummary["entries"][number]) {
  const base = `${entry.wins}-${entry.losses}`;
  return entry.unknowns > 0 ? `${base} · ${entry.unknowns} unk` : base;
}

function isLeaderboardNavigationControl(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(
        target.closest(
          "a,button,input,textarea,select,label,[role='button'],[data-ignore-leaderboard-navigation='true']"
        )
      )
    : false;
}

export function LeaderboardPanel({
  leaderboard,
  onlineCount,
  themeKey,
  viewMode,
  onViewModeChange,
  leaderboardLane,
  leaderboardLaneLoading,
  onLeaderboardLaneChange,
  laneToggleVariant = "card",
  surface = "standard",
}: LeaderboardPanelProps) {
  const router = useRouter();
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";
  const [entries, setEntries] = useState(leaderboard.entries);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(
    () => leaderboard.trackedPlayers > countRankedLeaderboardEntries(leaderboard.entries)
  );
  const entriesRef = useRef(entries);
  const leaderboardPanelRef = useRef<HTMLDivElement | null>(null);
  const leaderboardScrollRef = useRef<HTMLDivElement | null>(null);
  const leaderboardSentinelRef = useRef<HTMLButtonElement | null>(null);
  const loadingRef = useRef(false);
  const activeLaneRef = useRef(leaderboard.lane);
  const nextOffsetRef = useRef(countRankedLeaderboardEntries(leaderboard.entries));
  const hasMoreRef = useRef(
    leaderboard.trackedPlayers > countRankedLeaderboardEntries(leaderboard.entries)
  );

  useEffect(() => {
    const rankedEntryCount = countRankedLeaderboardEntries(leaderboard.entries);
    const laneChanged = activeLaneRef.current !== leaderboard.lane;

    if (laneChanged) {
      activeLaneRef.current = leaderboard.lane;
      setEntries(leaderboard.entries);
      entriesRef.current = leaderboard.entries;
      nextOffsetRef.current = rankedEntryCount;
    } else {
      const merged = mergeLeaderboardEntries(leaderboard.entries, entriesRef.current);
      entriesRef.current = merged;
      setEntries(merged);
      nextOffsetRef.current = Math.max(
        nextOffsetRef.current,
        rankedEntryCount,
        countRankedLeaderboardEntries(merged)
      );
    }

    const nextHasMore = leaderboard.trackedPlayers > nextOffsetRef.current;
    hasMoreRef.current = nextHasMore;
    setHasMore(nextHasMore);
  }, [leaderboard.entries, leaderboard.lane, leaderboard.trackedPlayers]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const visibleRankedEntryCount = countRankedLeaderboardEntries(entries);
  const canLoadMore = hasMore || visibleRankedEntryCount < leaderboard.trackedPlayers;

  const loadMoreLeaderboardEntries = useCallback(async () => {
    const visibleOffset = countRankedLeaderboardEntries(entriesRef.current);
    if (loadingRef.current) return;
    if (!hasMoreRef.current && visibleOffset >= leaderboard.trackedPlayers) return;

    loadingRef.current = true;
    setIsLoadingMore(true);

    try {
      const offset = Math.max(nextOffsetRef.current, visibleOffset);
      const response = await fetch(
        `/api/lobby/leaderboard?lane=${leaderboard.lane}&offset=${offset}&limit=${LEADERBOARD_PAGE_SIZE}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        hasMoreRef.current = false;
        setHasMore(false);
        return;
      }

      const payload = (await response.json()) as LeaderboardPageResponse;
      const nextEntries = Array.isArray(payload.entries) ? payload.entries : [];

      const mergedEntries = mergeLeaderboardEntries(entriesRef.current, nextEntries);
      entriesRef.current = mergedEntries;
      setEntries(mergedEntries);

      const mergedRankedCount = countRankedLeaderboardEntries(mergedEntries);
      const fetchedRankedCount = countRankedLeaderboardEntries(nextEntries);
      const fallbackNextOffset = Math.max(offset + fetchedRankedCount, mergedRankedCount);
      nextOffsetRef.current =
        typeof payload.nextOffset === "number"
          ? Math.max(payload.nextOffset, mergedRankedCount)
          : fallbackNextOffset;
      const nextHasMore =
        nextOffsetRef.current < leaderboard.trackedPlayers &&
        (typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : fetchedRankedCount > 0);
      hasMoreRef.current = nextHasMore;
      setHasMore(nextHasMore);
    } catch (error) {
      console.warn("Failed to load more lobby leaderboard entries:", error);
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [leaderboard.lane, leaderboard.trackedPlayers]);

  const handleLeaderboardScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;
      const distanceFromBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;

      if (distanceFromBottom < 2400) {
        void loadMoreLeaderboardEntries();
      }
    },
    [loadMoreLeaderboardEntries]
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canLoadMore) return;

    const node = leaderboardSentinelRef.current;
    const root = leaderboardScrollRef.current;
    if (!node || !root) return;

    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) {
          void loadMoreLeaderboardEntries();
        }
      },
      {
        root,
        rootMargin: "2400px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [canLoadMore, loadMoreLeaderboardEntries]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!canLoadMore) return;

    let ticking = false;

    const checkPageScroll = () => {
      ticking = false;
      const node = leaderboardPanelRef.current;
      if (!node || loadingRef.current || !hasMoreRef.current) return;

      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const nearPanelBottom = rect.bottom - viewportHeight < 1600;

      if (nearPanelBottom) {
        void loadMoreLeaderboardEntries();
      }
    };

    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(checkPageScroll);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll);

    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [canLoadMore, loadMoreLeaderboardEntries]);


  const leaderboardScrollClassName = isExtreme
    ? "mt-6 h-[clamp(34rem,calc(100svh-13rem),82rem)] min-h-[34rem] space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-2 scroll-smooth [scrollbar-gutter:stable] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] [touch-action:pan-y] [contain:layout_paint]"
    : "mt-6 h-[clamp(30rem,calc(100svh-15rem),62rem)] min-h-[30rem] space-y-3 overflow-y-auto overflow-x-hidden overscroll-y-contain pr-2 scroll-smooth [scrollbar-gutter:stable] [scrollbar-width:thin] [-webkit-overflow-scrolling:touch] [touch-action:pan-y] [contain:layout_paint] sm:h-[clamp(30rem,calc(100svh-15rem),68rem)] lg:h-[clamp(32rem,calc(100svh-14rem),76rem)]"

  const leaderboardPanelShellClassName = isExtreme
    ? `relative flex min-h-0 cursor-pointer flex-col rounded-[1.85rem] border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 sm:p-6 ${tone.panelShell}`
    : `relative flex min-h-0 cursor-pointer flex-col rounded-[1.85rem] border p-5 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.38)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 sm:p-6 ${tone.panelShell}`

  const navigateToLeaderboard = () => {
    trackLeaderboardEvent({
      type: "leaderboard_open_home_tile",
      metadata: { destination: "modern" },
    });
    router.push("/leaderboard");
  };

  const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isLeaderboardNavigationControl(event.target)) return;
    if (window.getSelection()?.toString()) return;
    navigateToLeaderboard();
  };

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (isLeaderboardNavigationControl(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateToLeaderboard();
    }
  };



  return (
    <div
      ref={leaderboardPanelRef}
      data-lobby-leaderboard-panel="true"
      role="link"
      tabIndex={0}
      aria-label="Open the full HD Leaderboard"
      onClick={handlePanelClick}
      onKeyDown={handlePanelKeyDown}
      className={leaderboardPanelShellClassName}
    >
      <div className="flex flex-col gap-5">
        <div className="min-w-0">
          <div className="sm:pr-32">
            <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>Leaderboard</div>

            <div className="mt-4 sm:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className={`text-5xl font-semibold tracking-tight tabular-nums ${tone.count}`}>
                  {leaderboard.trackedPlayers}
                </div>

                <LeaderboardLaneToggle
                  lane={leaderboardLane}
                  loading={leaderboardLaneLoading}
                  onChange={onLeaderboardLaneChange}
                  variant={laneToggleVariant}
                />
              </div>
            </div>

            <div className="mt-4 hidden sm:flex sm:flex-wrap sm:items-end sm:gap-8 lg:gap-10">
              <div className={`text-5xl font-semibold tracking-tight tabular-nums ${tone.count}`}>
                {leaderboard.trackedPlayers}
              </div>
            </div>
          </div>

          <div className="mt-3 sm:hidden">
            <div className="flex items-center justify-between gap-2">
              <div
                className={`min-w-0 flex-1 whitespace-nowrap text-[10px] uppercase tracking-[0.22em] ${tone.countLabel}`}
              >
                Identity Rows
              </div>

              <LobbyViewToggle
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                tone={tone}
                size="xs"
                className="shrink-0"
              />
            </div>
          </div>

          <div className="mt-3 hidden sm:flex sm:flex-row sm:items-center sm:gap-3">
            <div className={`min-w-0 text-[11px] uppercase tracking-[0.34em] ${tone.countLabel}`}>
              Identity Rows
            </div>

            <div className="flex flex-nowrap items-center gap-2 sm:ml-auto">
              <LeaderboardLaneToggle
                lane={leaderboardLane}
                loading={leaderboardLaneLoading}
                onChange={onLeaderboardLaneChange}
              />

              <LobbyViewToggle
                viewMode={viewMode}
                onViewModeChange={onViewModeChange}
                tone={tone}
                size="xs"
                className="shrink-0"
              />
            </div>
          </div>
        </div>

        <div className="absolute right-5 top-5 sm:right-6 sm:top-6">
          <div className={`rounded-full border px-3 py-1 text-xs font-medium ${tone.activeBadge}`}>
            {onlineCount} Online
          </div>
        </div>
      </div>

      <div
        ref={leaderboardScrollRef}
        data-ignore-leaderboard-navigation="true"
        className={leaderboardScrollClassName}
        aria-busy={isLoadingMore}
        onScroll={handleLeaderboardScroll}
      >
        {entries.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm leading-6 text-slate-300">
            Need more final games.
          </div>
        ) : (
          entries.map((entry) => (
            <Link
              key={entry.key}
              href={entry.href}
              className={`block rounded-2xl border px-4 py-4 transition ${tone.card} ${tone.cardHover}`}
            >
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                <div className="flex min-w-0 items-start gap-4">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold ${tone.rankBadge}`}
                  >
                    #{entry.rank}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="break-words text-base font-semibold leading-tight text-white sm:truncate sm:text-lg">
                      {entry.name}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {entry.verified ? (
                        <SteamLinkedBadge compact label="Steam" />
                      ) : (
                        <MiniTag toneClassName={tone.neutralPill}>
                          {entry.claimed ? "Claimed" : "Claimable"}
                        </MiniTag>
                      )}

                      {entry.pendingWoloClaimCount > 0 ? (
                        <MiniTag toneClassName="border-amber-300/30 bg-amber-400/10 text-amber-100">
                          Unclaimed $WOLO
                        </MiniTag>
                      ) : null}
                      {entry.isOnline ? <MiniTag toneClassName={tone.activeBadge}>Online</MiniTag> : null}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/8 pt-3 sm:min-w-[5.5rem] sm:border-t-0 sm:pt-0 sm:text-right">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
                    {entry.primaryRatingSourceLabel}
                  </div>

                  <div className={`mt-1 text-lg font-semibold ${tone.rating}`}>
                    {entry.primaryRatingLabel}
                  </div>

                  {entry.secondaryRatingLabel ? (
                    <div className="mt-1 text-xs text-slate-400">{entry.secondaryRatingLabel}</div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <MetricPill toneClassName={tone.neutralPill}>{buildRecordLabel(entry)}</MetricPill>

                    {entry.streakLabel ? (
                      <MetricPill
                        toneClassName={
                          entry.streakLabel.startsWith("W")
                            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
                            : "border-rose-300/20 bg-rose-500/10 text-rose-100"
                        }
                      >
                        {entry.streakLabel}
                      </MetricPill>
                    ) : null}
                  </div>

                  <div className="mt-3 text-xs text-slate-400">
                    Last game{" "}
                    {entry.lastPlayedAt ? (
                      <TimeDisplayText value={entry.lastPlayedAt} />
                    ) : (
                      "pending"
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))
        )}
        {canLoadMore ? (
          <button
            ref={leaderboardSentinelRef}
            type="button"
            onClick={() => {
            void loadMoreLeaderboardEntries();
          }}
            disabled={isLoadingMore}
            className="mt-5 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-xs font-semibold uppercase tracking-[0.24em] text-slate-300 transition hover:border-amber-200/30 hover:bg-amber-300/10 hover:text-amber-100 disabled:cursor-wait disabled:opacity-70"
          >
          {isLoadingMore ? "Loading more warriors..." : "Load more warriors"}
          </button>
        ) : null}

      </div>

      <div className={`mt-5 flex flex-wrap items-center justify-end gap-3 border-t pt-4 ${tone.divider}`}>
        <Link
          href="/players"
          className={`rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${tone.primaryButton}`}
        >
          Players
        </Link>

        <Link
          href="/rivalries"
          className={`rounded-full border px-4 py-2 text-sm transition ${tone.secondaryButton}`}
        >
          Rivalries
        </Link>
      </div>
    </div>
  );
}

function MiniTag({
  children,
  toneClassName,
}: {
  children: React.ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}

function MetricPill({
  children,
  toneClassName,
}: {
  children: React.ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
}
