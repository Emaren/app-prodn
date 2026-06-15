"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StakingActivityItem } from "@/lib/staking";

type ActivityFeedEvent = CustomEvent<{ item?: StakingActivityItem }>;

const PAGE_SIZE = 16;
const LIVE_POLL_INTERVAL_MS = 12_000;

type ActivityMode = "ledger" | "grouped";
const STAKING_ACTIVITY_PREFS_KEY = "aoe2war:staking-activity-prefs";

type ActivityFilterMode = "all" | "staking" | "bets" | "transfers";

type ActivityPageResponse = {
  rows?: StakingActivityItem[];
  hasMore?: boolean;
  nextBefore?: string | null;
};

function normalizedEventType(item: StakingActivityItem) {
  return String(item.eventType || "").toUpperCase();
}

function isStakingActivity(item: StakingActivityItem) {
  const type = normalizedEventType(item);
  const text = `${item.label || ""} ${item.detail || ""}`.toLowerCase();
  return (
    type === "REWARD" ||
    type === "STAKE" ||
    type === "UNSTAKE" ||
    type === "CYCLE" ||
    type === "COMPOUND" ||
    (type === "TX" && (text.includes("compound") || text.includes("staking event"))) ||
    text.includes("staking reward") ||
    text.includes("staking fee share") ||
    text.includes("staking wallet") ||
    text.includes("staking deposit") ||
    text.includes("staking treasury") ||
    text.includes("staking payout") ||
    text.includes("stake deposit") ||
    text.includes("staking unstake") ||
    text.includes("compound event") ||
    text.includes("reward compounded") ||
    text.includes("compounded") ||
    text.includes("compound")
  );
}

function isBetActivity(item: StakingActivityItem) {
  if (isStakingActivity(item)) return false;

  const type = normalizedEventType(item);
  const text = `${item.label || ""} ${item.detail || ""}`.toLowerCase();
  return (
    type === "GROUPED BET" ||
    type === "SETTLEMENT" ||
    type === "PAYOUT" ||
    type === "ESCROW" ||
    text.includes("bet_") ||
    text.includes("bet payout") ||
    text.includes("bet stake") ||
    text.includes("founders_") ||
    text.includes(" vs ")
  );
}

function isTransferActivity(item: StakingActivityItem) {
  const type = normalizedEventType(item);
  return type === "DIRECT" || type === "GIFT";
}

function filterActivityRows(rows: StakingActivityItem[], filter: ActivityFilterMode) {
  if (filter === "staking") return rows.filter(isStakingActivity);
  if (filter === "bets") return rows.filter(isBetActivity);
  if (filter === "transfers") return rows.filter(isTransferActivity);
  return rows;
}

function activityKey(item: StakingActivityItem) {
  return item.key || `${item.label}:${item.detail}:${item.meta}`;
}

function activityTimestamp(item: StakingActivityItem) {
  const parsed = item.occurredAt ? Date.parse(item.occurredAt) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeActivityRows(
  incoming: StakingActivityItem[],
  existing: StakingActivityItem[] = []
) {
  const seen = new Set<string>();
  const merged: StakingActivityItem[] = [];

  for (const item of [...incoming, ...existing]) {
    const key = activityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged.sort((left, right) => activityTimestamp(right) - activityTimestamp(left));
}

export default function StakingActivityFeed({
  items,
  note,
  loadMoreEndpoint,
}: {
  items: StakingActivityItem[];
  note?: string;
  loadMoreEndpoint?: string;
}) {
  const initialRows = useMemo(() => items.slice(0, PAGE_SIZE), [items]);
  const [mode, setMode] = useState<ActivityMode>("ledger");
  const [filterMode, setFilterMode] = useState<ActivityFilterMode>("all");
  const [activityPrefsLoaded, setActivityPrefsLoaded] = useState(false);


  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STAKING_ACTIVITY_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          mode?: ActivityMode;
          filterMode?: ActivityFilterMode;
        };

        if (parsed.mode === "ledger" || parsed.mode === "grouped") {
          setMode(parsed.mode);
        }

        if (
          parsed.filterMode === "all" ||
          parsed.filterMode === "staking" ||
          parsed.filterMode === "bets" ||
          parsed.filterMode === "transfers"
        ) {
          setFilterMode(parsed.filterMode);
        }
      }
    } catch {
      // Ignore stale or invalid saved preferences.
    } finally {
      setActivityPrefsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!activityPrefsLoaded) return;

    try {
      window.localStorage.setItem(
        STAKING_ACTIVITY_PREFS_KEY,
        JSON.stringify({ mode, filterMode })
      );
    } catch {
      // Ignore private-mode/localStorage failures.
    }
  }, [activityPrefsLoaded, mode, filterMode]);
  const [rows, setRows] = useState(initialRows);
  const [freshKey, setFreshKey] = useState<string | null>(
    activityKey(initialRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" })
  );
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(Boolean(loadMoreEndpoint));
  const [nextBefore, setNextBefore] = useState<string | null>(() =>
    oldestActivityRowTimestamp(initialRows)
  );
  const rowsRef = useRef<StakingActivityItem[]>(initialRows);
  const scrollRootRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const scrollFrameRef = useRef<number | null>(null);
  const lastLoadMoreAtRef = useRef(0);

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setRows((current) => mergeActivityRows(initialRows, current));
    setFreshKey(
      activityKey(initialRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" })
    );
  }, [initialRows]);

  useEffect(() => {
    setHasMore(Boolean(loadMoreEndpoint));
    setNextBefore(oldestActivityRowTimestamp(initialRows));
  }, [initialRows, loadMoreEndpoint]);

  useEffect(() => {
    if (!loadMoreEndpoint) return;

    let cancelled = false;

    async function refreshModeRows() {
      try {
        const url = new URL(loadMoreEndpoint as string, window.location.origin);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("mode", mode);
        url.searchParams.set("filter", filterMode);

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Activity mode refresh failed: ${response.status}`);
        }

        const payload = (await response.json()) as ActivityPageResponse;
        if (cancelled) return;

        const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
        setRows(nextRows);
        rowsRef.current = nextRows;
        setFreshKey(
          activityKey(nextRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" })
        );
        setHasMore(Boolean(payload.hasMore || payload.nextBefore || nextRows.length >= PAGE_SIZE));
        setNextBefore(payload.nextBefore || oldestActivityRowTimestamp(nextRows));
      } catch (error) {
        console.warn("Failed to refresh staking activity mode:", error);
      }
    }

    void refreshModeRows();

    return () => {
      cancelled = true;
    };
  }, [filterMode, loadMoreEndpoint, mode]);

  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  useEffect(() => {
    if (!loadMoreEndpoint) return;

    let cancelled = false;
    let inFlight = false;
    let timer: number | null = null;

    const schedule = () => {
      if (cancelled) return;
      timer = window.setTimeout(() => void poll(), LIVE_POLL_INTERVAL_MS);
    };

    const poll = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || inFlight) {
        schedule();
        return;
      }

      inFlight = true;
      try {
        const url = new URL(loadMoreEndpoint, window.location.origin);
        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("mode", mode);
        url.searchParams.set("filter", filterMode);

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Activity refresh failed: ${response.status}`);
        }

        const payload = (await response.json()) as ActivityPageResponse;
        const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
        if (nextRows.length > 0) {
          const knownKeys = new Set(rowsRef.current.map(activityKey));
          const freshRows = nextRows.filter((row) => !knownKeys.has(activityKey(row)));

          setRows((current) => mergeActivityRows(nextRows, current));
          setHasMore((current) => current || Boolean(payload.hasMore || payload.nextBefore || nextRows.length >= PAGE_SIZE));

          if (freshRows.length > 0) {
            const newestFresh = mergeActivityRows(freshRows)[0];
            setFreshKey(activityKey(newestFresh));

            const nextOldest = oldestActivityRowTimestamp(
              mergeActivityRows(nextRows, rowsRef.current)
            );
            if (nextOldest) {
              setNextBefore((current) => current || nextOldest);
            }
          }
        }
      } catch (error) {
        console.warn("Failed to refresh staking activity:", error);
      } finally {
        inFlight = false;
        schedule();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        if (timer) window.clearTimeout(timer);
        void poll();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    schedule();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [filterMode, loadMoreEndpoint, mode]);

  useEffect(() => {
    function handleActivity(event: Event) {
      const item = (event as ActivityFeedEvent).detail?.item;
      if (!item) return;
      setRows((current) => mergeActivityRows([item], current));
      setFreshKey(activityKey(item));
    }

    window.addEventListener("staking:activity", handleActivity);
    return () => window.removeEventListener("staking:activity", handleActivity);
  }, []);

  const loadMore = useCallback(async () => {
    if (!loadMoreEndpoint || !hasMore || loadingMoreRef.current) return;

    const now = Date.now();
    if (now - lastLoadMoreAtRef.current < 450) return;

    loadingMoreRef.current = true;
    lastLoadMoreAtRef.current = now;
    setLoadingMore(true);

    try {
      const collectedRows: StakingActivityItem[] = [];
      let cursor: string | null = nextBefore;
      let finalHasMore = false;
      let finalNextBefore: string | null = nextBefore;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const url = new URL(loadMoreEndpoint, window.location.origin);

        if (cursor) {
          url.searchParams.set("before", cursor);
        }

        url.searchParams.set("limit", String(PAGE_SIZE));
        url.searchParams.set("mode", mode);
        url.searchParams.set("filter", filterMode);

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Activity request failed: ${response.status}`);
        }

        const payload = (await response.json()) as ActivityPageResponse;
        const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
        const fallbackBefore = payload.nextBefore || oldestActivityRowTimestamp(nextRows) || cursor;

        if (nextRows.length > 0) {
          collectedRows.push(...nextRows);
        }

        finalHasMore = Boolean(payload.hasMore || payload.nextBefore || nextRows.length >= PAGE_SIZE);
        finalNextBefore = fallbackBefore;

        const madeCursorProgress = Boolean(fallbackBefore && fallbackBefore !== cursor);
        if (nextRows.length > 0 || !finalHasMore || !madeCursorProgress) {
          break;
        }

        cursor = fallbackBefore;
      }

      if (collectedRows.length > 0) {
        setRows((current) => mergeActivityRows(current, collectedRows));
      }

      setHasMore(Boolean(finalHasMore && finalNextBefore));
      setNextBefore(finalNextBefore || nextBefore);
    } catch (error) {
      console.error("Failed to load staking activity:", error);
    } finally {
      setLoadingMore(false);
      window.setTimeout(() => {
        loadingMoreRef.current = false;
      }, 160);
    }
  }, [filterMode, hasMore, loadMoreEndpoint, mode, nextBefore]);

  const handleLedgerScroll = useCallback(() => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;

      const root = scrollRootRef.current;
      if (!root || loadingMoreRef.current || !hasMore) return;

      const remaining = root.scrollHeight - root.scrollTop - root.clientHeight;
      if (remaining < 140) {
        void loadMore();
      }
    });
  }, [hasMore, loadMore]);

  useEffect(() => {
    if (!loadMoreEndpoint || !hasMore) return;
    const sentinel = sentinelRef.current;
    const root = scrollRootRef.current;
    if (!sentinel || !root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { root, rootMargin: "160px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadMoreEndpoint]);

  const visibleRows = loadMoreEndpoint ? rows : filterActivityRows(rows, filterMode);

  return (
    <div className="space-y-2.5 overflow-hidden">
      {note ? (
        <div className="rounded-[1rem] border border-cyan-300/14 bg-cyan-400/[0.055] px-3.5 py-3 text-xs leading-5 text-cyan-50/80">
          {note}
        </div>
      ) : null}

      {visibleRows.length === 0 ? (
        <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-3.5 text-sm text-slate-300">
          No mainnet activity rows are visible yet.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-black/15 p-2">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <div className="flex flex-wrap gap-2">
            {(["ledger", "grouped"] as ActivityMode[]).map((nextMode) => (
              <button
                key={nextMode}
                type="button"
                onClick={() => setMode(nextMode)}
                className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                  mode === nextMode
                    ? "border-amber-300/45 bg-amber-300/18 text-amber-100"
                    : "border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                {nextMode === "ledger" ? "Ledger" : "Grouped Bets"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            <span>{rows.length.toLocaleString()} rows loaded</span>
            <span>
              {hasMore
                ? mode === "ledger"
                  ? "Scroll for older ledger rows"
                  : "Scroll for older grouped bets"
                : visibleRows.length > 0
                  ? "At mainnet start"
                  : "No rows"}
            </span>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "staking", "bets", "transfers"] as ActivityFilterMode[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setFilterMode(filter)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                filterMode === filter
                  ? "border-emerald-300/70 bg-emerald-300/10 text-emerald-100"
                  : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        <div
          ref={scrollRootRef}
          onScroll={handleLedgerScroll}
          aria-busy={loadingMore ? "true" : "false"}
          className="max-h-[34rem] space-y-2.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
        >
          {visibleRows.map((item) => {
            const key = activityKey(item);
            return <ActivityRow key={key} item={item} isFresh={key === freshKey} />;
          })}

          {loadMoreEndpoint ? (
            <div ref={sentinelRef} className="flex min-h-12 justify-center pt-2">
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full border border-slate-700/75 bg-white/[0.035] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:border-slate-500/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loadingMore
                    ? "Loading..."
                    : mode === "ledger"
                      ? "Load older ledger rows"
                      : "Load older grouped bets"}
                </button>
              ) : visibleRows.length > 0 ? (
                <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                  Beginning of staking ledger
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function oldestActivityRowTimestamp(rows: StakingActivityItem[]) {
  return (
    rows
      .filter((row) => row.occurredAt && row.timestampLabel !== "Current stake")
      .map((row) => new Date(row.occurredAt || ""))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((left, right) => left.getTime() - right.getTime())[0]
      ?.toISOString() ?? null
  );
}

function activityVisual(item: StakingActivityItem) {
  const eventType = normalizedEventType(item);
  const text = `${item.label || ""} ${item.detail || ""}`.toLowerCase();

  const isTreasuryActivity =
    text.includes("community treasury") ||
    text.includes("staking treasury") ||
    text.includes("treasury payout") ||
    text.includes("aoe2 staking treasury");

  const isWinnerPayoutActivity =
    !isTreasuryActivity &&
    (eventType === "PAYOUT" ||
      text.includes("bet_payout") ||
      text.includes("bet payout") ||
      text.includes("winner_bounty") ||
      text.includes("winner bounty") ||
      text.includes("founders_win") ||
      text.includes("founders win") ||
      text.includes("founders_bonus") ||
      text.includes("founders bonus") ||
      text.includes("admin_retry_settlement"));

  const isRewardActivity =
    eventType === "REWARD" ||
    eventType === "COMPOUND" ||
    (eventType === "TX" && (text.includes("compound") || text.includes("staking event"))) ||
    text.includes("compound event") ||
    text.includes("reward compounded") ||
    text.includes("compounded") ||
    text.includes("staking reward") ||
    text.includes("reward payout") ||
    text.includes("staking fee share") ||
    text.includes("micro reward") ||
    text.includes("pending 1 wolo payout threshold");

  const isCycleActivity =
    eventType === "CYCLE" ||
    text.includes("staking cycle checked") ||
    text.includes("no reward distribution");

  const isBetRouteActivity =
    eventType === "SETTLEMENT" ||
    eventType === "ESCROW" ||
    text.includes("settlement queue") ||
    text.includes("bet escrow") ||
    text.includes("bet stake") ||
    text.includes("awaiting verified wallet");

  if (eventType === "GROUPED BET") {
    return {
      card: "border-slate-700/70 bg-slate-950/24 shadow-[inset_3px_0_0_rgba(100,116,139,0.30)]",
      orb: "border-slate-600/50 bg-slate-950/55 text-slate-300",
      dot: "bg-slate-500 shadow-[0_0_9px_rgba(100,116,139,0.30)]",
      label: "text-slate-50",
      detail: "text-slate-300/68",
      icon: "•",
    };
  }

  if (isTreasuryActivity) {
    return {
      card: "border-emerald-900/80 bg-[radial-gradient(circle_at_4%_50%,rgba(6,78,59,0.24),transparent_34%),linear-gradient(90deg,rgba(2,44,34,0.30),rgba(3,7,18,0.84))] shadow-[inset_3px_0_0_rgba(251,191,36,0.64),0_0_18px_rgba(6,78,59,0.12)]",
      orb: "border-emerald-200/35 bg-emerald-950/55 text-emerald-100 shadow-[0_0_16px_rgba(6,78,59,0.35)]",
      dot: "bg-amber-300 shadow-[0_0_13px_rgba(252,211,77,0.62)]",
      label: "text-white",
      detail: "text-emerald-100/72",
      icon: "🏛",
    };
  }

  if (isWinnerPayoutActivity) {
    return {
      card: "border-slate-700/80 bg-slate-950/28 shadow-[inset_3px_0_0_rgba(100,116,139,0.38)]",
      orb: "border-slate-600/55 bg-slate-950/55 text-slate-300",
      dot: "bg-slate-500 shadow-[0_0_9px_rgba(100,116,139,0.34)]",
      label: "text-slate-50",
      detail: "text-slate-300/70",
      icon: "🏆",
    };
  }

  if (isRewardActivity) {
    return {
      card: "border-amber-300/45 bg-[radial-gradient(circle_at_0%_50%,rgba(245,158,11,0.24),transparent_34%),linear-gradient(90deg,rgba(120,72,12,0.42),rgba(15,23,42,0.36))] shadow-[inset_3px_0_0_rgba(245,158,11,0.86),0_0_30px_rgba(245,158,11,0.12)]",
      orb: "border-amber-300/45 bg-amber-400/16 text-amber-100 shadow-[0_0_22px_rgba(245,158,11,0.24)]",
      dot: "bg-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.78)]",
      label: "text-amber-50",
      detail: "text-amber-100/78",
      icon: "♛",
    };
  }

  if (isCycleActivity) {
    return {
      card: "border-amber-900/40 bg-[linear-gradient(90deg,rgba(68,45,13,0.18),rgba(15,23,42,0.22))] shadow-[inset_3px_0_0_rgba(120,72,12,0.42)] opacity-85",
      orb: "border-amber-900/45 bg-amber-950/30 text-amber-200/70",
      dot: "bg-orange-400 shadow-[0_0_12px_rgba(251,146,60,0.45)]",
      label: "text-amber-100/90",
      detail: "text-amber-100/62",
      icon: "◷",
    };
  }

  if (isBetRouteActivity) {
    return {
      card: "border-sky-300/25 bg-[linear-gradient(90deg,rgba(14,116,144,0.18),rgba(15,23,42,0.3))] shadow-[inset_3px_0_0_rgba(56,189,248,0.5),0_0_22px_rgba(56,189,248,0.08)]",
      orb: "border-sky-300/35 bg-sky-400/12 text-sky-100 shadow-[0_0_18px_rgba(56,189,248,0.18)]",
      dot: "bg-sky-300 shadow-[0_0_14px_rgba(125,211,252,0.7)]",
      label: "text-sky-50",
      detail: "text-sky-100/72",
      icon: "⚔",
    };
  }

  if (eventType === "DIRECT") {
    return {
      card: "border-slate-400/25 bg-[linear-gradient(90deg,rgba(30,41,59,0.2),rgba(15,23,42,0.28))] shadow-[inset_3px_0_0_rgba(148,163,184,0.36)]",
      orb: "border-slate-300/35 bg-slate-400/10 text-slate-100",
      dot: "bg-slate-300 shadow-[0_0_12px_rgba(203,213,225,0.45)]",
      label: "text-slate-50",
      detail: "text-slate-200/72",
      icon: "•",
    };
  }

  return {
    card: "border-slate-400/16 bg-slate-950/18",
    orb: "border-slate-300/30 bg-slate-400/10 text-slate-100",
    dot: "bg-slate-300/80",
    label: "text-slate-50",
    detail: "text-slate-300/70",
    icon: "•",
  };
}


function ActivityRow({
  item,
  isFresh = false,
  className = "",
}: {
  item: StakingActivityItem;
  isFresh?: boolean;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const children = Array.isArray(item.children) ? item.children : [];
  const hasChildren = children.length > 0;
  const visual = activityVisual(item);

  const typeLabel = item.eventType || item.meta;
  const amountLabel = item.amountLabel;
  const timestampLabel = item.timestampLabel || item.meta;

  return (
    <div
      className={`max-w-full overflow-hidden rounded-[1.1rem] border p-3.5 transition hover:bg-white/[0.045] ${
        visual.card
      } ${isFresh ? "staking-activity-new" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => {
          if (hasChildren) setExpanded((value) => !value);
        }}
        className={`flex w-full min-w-0 flex-col gap-3 text-left focus:outline-none focus-visible:outline-none sm:flex-row sm:items-center ${
          hasChildren ? "cursor-pointer" : "cursor-default"
        }`}
      >
        <div className="flex min-w-0 flex-1 gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-lg font-black ${visual.orb}`}>
            <span className="translate-y-[-1px]">{visual.icon}</span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start gap-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${visual.dot}`} />
              <div className={`min-w-0 break-words font-semibold ${visual.label}`}>
                {item.label}
              </div>
            </div>
            <div className={`mt-1 min-w-0 break-words text-sm leading-6 ${visual.detail}`}>
              {item.detail}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-wrap gap-2 pl-5 sm:max-w-[45%] sm:justify-end sm:pl-0">
          <FeedChip>{typeLabel}</FeedChip>
          {hasChildren ? <FeedChip>{expanded ? "Hide rows" : `${children.length} rows`}</FeedChip> : null}
          {amountLabel ? <FeedChip>{amountLabel}</FeedChip> : null}
          <FeedChip>{timestampLabel}</FeedChip>
          {item.txUrl ? (
            <a
              href={item.txUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="max-w-full break-all rounded-full border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100 transition hover:border-cyan-200/40 hover:bg-cyan-300/16"
            >
              Tx
            </a>
          ) : null}
        </div>
      </button>

      {hasChildren && expanded ? (
        <div className="mt-3 space-y-2 overflow-hidden border-t border-slate-800/80 pt-3">
          {children.map((child, index) => (
            <ActivityRow
              key={activityKey(child) || `${item.key || item.label}-child-${index}`}
              item={{ ...child, children: undefined }}
              className="bg-black/22"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FeedChip({ children }: { children: string }) {
  return (
    <span className="max-w-full break-all rounded-full border border-slate-700/75 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
      {children}
    </span>
  );
}
