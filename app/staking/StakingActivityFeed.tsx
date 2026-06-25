"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StakingActivityItem } from "@/lib/staking";

type ActivityFeedEvent = CustomEvent<{ item?: StakingActivityItem }>;

const PAGE_SIZE = 16;
const LIVE_POLL_INTERVAL_MS = 12_000;

type ActivityMode = "ledger" | "grouped";
const STAKING_ACTIVITY_PREFS_KEY = "aoe2war:staking-activity-prefs:ledger-all-v1";

type ActivityFilterMode = "all" | "belts" | "staking" | "compounded" | "bounties" | "bets" | "transfers";
type BeltPayoutFilterMode = "all" | "tributes" | "bounties";

type ActivityPageResponse = {
  rows?: StakingActivityItem[];
  hasMore?: boolean;
  nextBefore?: string | null;
};

function normalizedEventType(item: StakingActivityItem) {
  return String(item.eventType || "").toUpperCase();
}

function isBountyActivity(item: StakingActivityItem) {
  const text = sanitizeActivityCopy(`${item.label || ""} ${item.detail || ""}`).toLowerCase();

  return text.includes("bounty #") || text.includes("🏰 bounty");
}


function isBeltActivity(item: StakingActivityItem) {
  return isBeltTributePayoutActivity(item) || isBeltBountyPayoutActivity(item);
}

function isCompoundedActivity(item: StakingActivityItem) {
  const type = normalizedEventType(item);
  const text = sanitizeActivityCopy(`${item.label || ""} ${item.detail || ""}`).toLowerCase();

  return (
    type === "COMPOUND" ||
    text.includes("auto-compounded") ||
    text.includes("reward compounded") ||
    text.includes("compounded reward") ||
    text.includes("rolled into staking principal") ||
    text.includes("staking reward held") ||
    text.includes("held reward") ||
    text.includes("micro reward accrued") ||
    text.includes("micro_accrued") ||
    text.includes("payout threshold") ||
    text.includes("staking reward payout") ||
    text.includes("reward payout") ||
    text.includes("claimed reward") ||
    text.includes("canonical claimed") ||
    text.includes("paid out") ||
    text.includes("compound-")
  );
}

function isStakingActivity(item: StakingActivityItem) {
  const type = normalizedEventType(item);
  const text = sanitizeActivityCopy(`${item.label || ""} ${item.detail || ""}`).toLowerCase();

  if (isCompoundedActivity(item)) return true;

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
  const text = sanitizeActivityCopy(`${item.label || ""} ${item.detail || ""}`).toLowerCase();
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



function isBeltTributePayoutActivity(item: StakingActivityItem) {
  const haystack = `${item.label || ""} ${item.detail || ""} ${item.meta || ""} ${item.eventType || ""}`.toLowerCase();

  const looksLikeBeltTribute =
    haystack.includes("canadian championship tribute") ||
    haystack.includes("championship tribute") ||
    haystack.includes("champion tribute") ||
    haystack.includes("championship title payout") ||
    haystack.includes("title payout") ||
    haystack.includes("daily title payout") ||
    haystack.includes("holds the belt");

  const looksLikeGenericBetOrTransfer =
    haystack.includes("bet_payout") ||
    haystack.includes("founders bonus") ||
    haystack.includes("settlement queue") ||
    haystack.includes("pending claim") ||
    haystack.includes("bet rows") ||
    haystack.includes("bet settled") ||
    haystack.includes("wolochain bet rows");

  return looksLikeBeltTribute && !looksLikeGenericBetOrTransfer;
}

function isBeltBountyPayoutActivity(item: StakingActivityItem) {
  const haystack = `${item.label || ""} ${item.detail || ""} ${item.meta || ""} ${item.eventType || ""}`.toLowerCase();

  const looksLikeBeltBounty =
    haystack.includes("belt bounty") ||
    haystack.includes("championship bounty") ||
    haystack.includes("champion bounty") ||
    haystack.includes("title bounty") ||
    haystack.includes("national belt bounty");

  const looksLikeGenericBetOrTransfer =
    haystack.includes("bet_payout") ||
    haystack.includes("founders bonus") ||
    haystack.includes("settlement queue") ||
    haystack.includes("pending claim") ||
    haystack.includes("bet rows") ||
    haystack.includes("bet settled") ||
    haystack.includes("wolochain bet rows");

  return looksLikeBeltBounty && !looksLikeGenericBetOrTransfer;
}

function filterBeltActivityRows(rows: StakingActivityItem[], filter: BeltPayoutFilterMode) {
  const beltRows = rows.filter(isBeltActivity);

  if (filter === "tributes") {
    return beltRows.filter(isBeltTributePayoutActivity);
  }

  if (filter === "bounties") {
    return beltRows.filter(isBeltBountyPayoutActivity);
  }

  return beltRows;
}

function parseBountyWoloAmount(value?: string | null) {
  if (!value) return 0;

  const match = value.replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) || 0 : 0;
}

function computePublicBountySummary(
  rows: Array<{ label?: string; detail?: string; amountLabel?: string | null; eventType?: string | null }>,
) {
  let paidTotal = 0;
  let paidCount = 0;
  let unclaimedCount = 0;

  for (const row of rows) {
    const text = `${row.label || ""} ${row.detail || ""} ${row.amountLabel || ""}`.toLowerCase();
    const isUnclaimed = text.includes("unclaimed");
    const isPaid = text.includes("bounty paid") && !isUnclaimed;

    if (isUnclaimed) {
      unclaimedCount += 1;
      continue;
    }

    if (isPaid) {
      paidCount += 1;
      paidTotal += parseBountyWoloAmount(row.amountLabel || row.label);
    }
  }

  return {
    paidTotal,
    paidCount,
    unclaimedCount,
    totalCount: paidCount + unclaimedCount,
  };
}

function formatBountySummaryWolo(value: number) {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} WOLO`;
}

function filterActivityRows(rows: StakingActivityItem[], filter: ActivityFilterMode) {
  if (filter === "belts") return rows.filter(isBeltActivity);
  if (filter === "staking") return rows.filter(isStakingActivity);
  if (filter === "compounded") return rows.filter(isCompoundedActivity);
  if (filter === "bounties") return rows.filter(isBountyActivity);
  if (filter === "bets") return rows.filter(isBetActivity);
  if (filter === "transfers") return rows.filter(isTransferActivity);
  return rows;
}

function activityKey(item: StakingActivityItem) {
  return item.key || `${sanitizeActivityCopy(item.label)}:${sanitizeActivityCopy(item.detail)}:${item.meta}`;
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

function activityDayKey(item: StakingActivityItem | null | undefined) {
  if (!item?.occurredAt) return "unknown";
  const parsed = new Date(item.occurredAt);
  if (Number.isNaN(parsed.getTime())) return item.occurredAt.slice(0, 10) || "unknown";
  return parsed.toISOString().slice(0, 10);
}

function formatActivityDayLabel(value?: string | null) {
  if (!value) return "Recent activity";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function ActivityDateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-600/24 to-slate-700/10" />
      <div className="rounded-full border border-slate-600/35 bg-slate-900/72 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
        {label}
      </div>
      <div className="hidden h-px flex-1 bg-gradient-to-l from-transparent via-slate-600/24 to-slate-700/10 sm:block" />
    </div>
  );
}

function extractLedgerBetTitle(group: StakingActivityItem[]) {
  for (const item of group) {
    const text = `${item.label || ""} ${item.detail || ""}`;
    const match = text.match(/([^·:|]+?\s+vs\s+[^·:|]+)/i);

    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }
  }

  return "WoloChain bet rail";
}

function collapseLedgerBetRows(rows: StakingActivityItem[], enabled: boolean) {
  if (!enabled) return rows;

  const settled: StakingActivityItem[] = [];
  let group: StakingActivityItem[] = [];

  const flushGroup = () => {
    if (group.length === 0) return;

    if (group.length === 1) {
      settled.push(group[0]);
      group = [];
      return;
    }

    const first = group[0];
    const title = extractLedgerBetTitle(group);

    settled.push({
      key: `ledger-bet-group-${activityKey(first)}-${group.length}`,
      label: `${title} · bet settled`,
      detail: `${group.length.toLocaleString()} WoloChain bet rows · click to inspect settlement, escrow, payout, and founder-transfer receipts`,
      meta: first.meta,
      eventType: "GROUPED BET",
      timestampLabel: first.timestampLabel || first.meta,
      occurredAt: first.occurredAt,
      tone: "sky",
      children: group,
    });

    group = [];
  };

  for (const row of rows) {
    if (isBetActivity(row)) {
      group.push(row);
      continue;
    }

    flushGroup();
    settled.push(row);
  }

  flushGroup();

  return settled;
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
  const [beltPayoutFilterMode, setBeltPayoutFilterMode] = useState<BeltPayoutFilterMode>("all");
  const [activityPrefsLoaded, setActivityPrefsLoaded] = useState(false);
  const lastTrackedStakingViewRef = useRef<string | null>(null);


  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STAKING_ACTIVITY_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          mode?: ActivityMode;
          filterMode?: ActivityFilterMode;
          beltPayoutFilterMode?: BeltPayoutFilterMode;
        };

        const nextFilter =
          parsed.filterMode === "all" ||
          parsed.filterMode === "belts" ||
          parsed.filterMode === "staking" ||
          parsed.filterMode === "compounded" ||
          parsed.filterMode === "bounties" ||
          parsed.filterMode === "bets" ||
          parsed.filterMode === "transfers"
            ? parsed.filterMode
            : undefined;

        const nextMode =
          parsed.mode === "ledger" || parsed.mode === "grouped"
            ? parsed.mode
            : undefined;

        if (nextFilter === "bounties") {
          setMode("ledger");
          setFilterMode("bounties");
        } else {
          if (nextMode) setMode(nextMode);
          if (nextFilter) setFilterMode(nextFilter);
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
        JSON.stringify({ mode, filterMode, beltPayoutFilterMode })
      );
    } catch {
      // Ignore private-mode/localStorage failures.
    }
  }, [activityPrefsLoaded, mode, filterMode, beltPayoutFilterMode]);
  useEffect(() => {
    if (!activityPrefsLoaded) return;

    const viewKey = `${mode}:${filterMode}`;
    if (lastTrackedStakingViewRef.current === viewKey) return;
    lastTrackedStakingViewRef.current = viewKey;

    const modeLabel = mode === "ledger" ? "Ledger" : "Grouped Bets";
    const filterLabel =
      filterMode === "all"
        ? "All"
        : filterMode === "compounded"
          ? "Compounded"
          : filterMode.charAt(0).toUpperCase() + filterMode.slice(1);

    const payload = {
      type: "staking_view_selected",
      path: "/staking",
      label: `${modeLabel} / ${filterLabel}`,
      metadata: {
        mode,
        filterMode,
        betsCollapsed: mode === "ledger" && filterMode === "all",
      },
    };

    void fetch("/api/user/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  }, [activityPrefsLoaded, filterMode, mode]);

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

  useEffect(() => {
    if (filterMode === "bounties" && mode !== "ledger") {
      setMode("ledger");
    }
  }, [filterMode, mode]);

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

  const baseVisibleRows = loadMoreEndpoint ? rows : filterActivityRows(rows, filterMode);
  const visibleRows =
    filterMode === "belts"
      ? filterBeltActivityRows(baseVisibleRows, beltPayoutFilterMode)
      : baseVisibleRows;
  const displayRows = useMemo(
    () => collapseLedgerBetRows(visibleRows, mode === "ledger" && filterMode === "all"),
    [filterMode, mode, visibleRows]
  );
  const bountySummary = filterMode === "bounties" ? computePublicBountySummary(displayRows) : null;

  return (
    <div className="space-y-2.5 overflow-hidden">
      {note ? (
        <div className="rounded-[1rem] border border-slate-800/55 bg-slate-900/40 px-3.5 py-3 text-xs leading-5 text-slate-400">
          {note}
        </div>
      ) : null}

      {filterMode === "bounties" && bountySummary ? (
        <div className="mb-4 rounded-[1.25rem] border border-emerald-300/20 bg-[radial-gradient(circle_at_left,rgba(16,185,129,0.13),transparent_34%),linear-gradient(90deg,rgba(5,24,18,0.72),rgba(3,7,18,0.78))] p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/75">Total bounties paid out</div>
              <div className="mt-1 text-lg font-semibold text-white">{formatBountySummaryWolo(bountySummary.paidTotal)}</div>
              <div className="mt-1 text-xs text-slate-400">Numbered public bounty rail</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ded7c3]/70">Paid bounties</div>
              <div className="mt-1 text-lg font-semibold text-emerald-100">{bountySummary.paidCount}</div>
              <div className="mt-1 text-xs text-slate-400">on-chain receipts</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ded7c3]/70">Unclaimed</div>
              <div className="mt-1 text-lg font-semibold text-amber-100">{bountySummary.unclaimedCount}</div>
              <div className="mt-1 text-xs text-slate-400">reserved gifts</div>
            </div>
          </div>
        </div>
      ) : null}

      {displayRows.length === 0 ? (
        <div className="rounded-[1.1rem] border border-transparent ring-1 ring-amber-100/8 bg-white/[0.04] p-3.5 text-sm text-slate-300">
          No mainnet activity rows are visible yet.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[1.2rem] border border-transparent bg-transparent p-2 shadow-none">
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
                    : "border-transparent bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-white"
                }`}
              >
                {nextMode === "ledger" ? "Ledger" : "Grouped Bets"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[10px] uppercase tracking-[0.18em] text-[#ded7c3]/70">
            <span>{rows.length.toLocaleString()} rows loaded</span>
            <span>
              {hasMore
                ? mode === "ledger"
                  ? "Scroll for older ledger rows"
                  : "Scroll for older grouped bets"
                : displayRows.length > 0
                  ? "At mainnet start"
                  : "No rows"}
            </span>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "belts", "staking", "compounded", "bounties", "bets", "transfers"] as ActivityFilterMode[]).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => {
                setFilterMode(filter);
                if (filter === "belts") setBeltPayoutFilterMode("all");
              }}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                filterMode === filter
                  ? "border-emerald-300/70 bg-emerald-300/10 text-emerald-100"
                  : "border-transparent bg-white/[0.03] text-slate-400 hover:border-white/20 hover:text-slate-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
        {filterMode === "belts" ? (
          <div className="mb-3 -mt-1 flex flex-wrap items-center gap-2 px-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8f846e]">
              Belt payouts
            </span>
            {([
              { key: "all", label: "All" },
              { key: "tributes", label: "Tribute payouts" },
              { key: "bounties", label: "Bounty payouts" },
            ] as Array<{ key: BeltPayoutFilterMode; label: string }>).map(({ key: beltFilter, label }) => (
              <button
                key={beltFilter}
                type="button"
                onClick={() => setBeltPayoutFilterMode(beltFilter)}
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
                  beltPayoutFilterMode === beltFilter
                    ? "border-amber-300/55 bg-amber-300/12 text-amber-100"
                    : "border-transparent bg-white/[0.025] text-[#9f9787] hover:border-amber-200/18 hover:text-[#d8c28c]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div
          ref={scrollRootRef}
          style={{ borderColor: "transparent", boxShadow: "none", outline: "none" }}
          onScroll={handleLedgerScroll}
          aria-busy={loadingMore ? "true" : "false"}
          className="max-h-[34rem] space-y-2.5 overflow-x-hidden overflow-y-auto overscroll-contain pr-1 [scrollbar-gutter:stable]"
        >
          {displayRows.map((item, index) => {
            const key = activityKey(item);
            const currentDay = activityDayKey(item);
            const previousDay = activityDayKey(displayRows[index - 1]);
            const showDivider = index === 0 || currentDay !== previousDay;

            return (
              <div key={key} className="space-y-2.5">
                {showDivider ? <ActivityDateDivider label={formatActivityDayLabel(item.occurredAt)} /> : null}
                <ActivityRow item={item} isFresh={key === freshKey} />
              </div>
            );
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
              ) : displayRows.length > 0 ? (
                <div className="text-xs uppercase tracking-[0.18em] text-[#ded7c3]/70">
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


function sanitizeActivityCopy(value?: string | null) {
  if (!value) return "";

  return String(value)
    .replace(/bet settled/gi, "bet settled")
    .replace(/settled/gi, "settled")
    .replace(/settled/gi, "settled");
}

const BELT_ACTIVITY_ASSETS = [
  {
    terms: ["canada champion tribute", "canadian champion", "canada champion", "canada"],
    src: "/api/media-assets/belt/national-canada?fallback=/champions/belts/canada.png",
    alt: "Canadian Championship belt",
    badge: "Canadian Championship",
  },
  {
    terms: ["usa champion tribute", "usa champion", "united states champion"],
    src: "/champions/belts/usa.png",
    alt: "USA Champion belt",
    badge: "USA Champion",
  },
  {
    terms: ["mexico champion tribute", "mexico champion"],
    src: "/champions/belts/mexico.png",
    alt: "Mexico Champion belt",
    badge: "Mexico Champion",
  },
  {
    terms: ["uk champion tribute", "uk champion", "british champion"],
    src: "/champions/belts/uk.png",
    alt: "UK Champion belt",
    badge: "UK Champion",
  },
  {
    terms: ["world champion tribute", "world champion", "aoe2war world"],
    src: "/champions/belts/aoe2war-world.png",
    alt: "AoE2WAR World Champion belt",
    badge: "World Champion",
  },
  {
    terms: ["elite champion", "elo elite"],
    src: "/champions/belts/elo-elite.png",
    alt: "Elite Champion belt",
    badge: "Elite Champion",
  },
  {
    terms: ["veteran champion", "elo veteran"],
    src: "/champions/belts/elo-veteran.png",
    alt: "Veteran Champion belt",
    badge: "Veteran Champion",
  },
  {
    terms: ["legend champion", "elo legend"],
    src: "/champions/belts/elo-legend.png",
    alt: "Legend Champion belt",
    badge: "Legend Champion",
  },
  {
    terms: ["rising champion", "elo rising"],
    src: "/champions/belts/elo-rising.png",
    alt: "Rising Champion belt",
    badge: "Rising Champion",
  },
  {
    terms: ["challenger champion", "elo challenger"],
    src: "/champions/belts/elo-challenger.png",
    alt: "Challenger Champion belt",
    badge: "Challenger Champion",
  },
];

function beltAssetForActivity(item: StakingActivityItem) {
  const text = sanitizeActivityCopy(
    `${item.label || ""} ${item.detail || ""} ${item.meta || ""} ${item.amountLabel || ""} ${item.eventType || ""}`
  ).toLowerCase();

  const looksLikeBeltTribute =
    text.includes("champion tribute") ||
    text.includes("daily title payout") ||
    text.includes("holds the belt") ||
    text.includes("belt payout") ||
    text.includes("belt tribute");

  if (!looksLikeBeltTribute) return null;

  for (const asset of BELT_ACTIVITY_ASSETS) {
    if (asset.terms.some((term) => text.includes(term))) {
      return asset;
    }
  }

  return {
    src: "/champions/belts/aoe2war-world.png",
    alt: "Champion belt",
    badge: "Champion Belt",
  };
}

function activityVisual(item: StakingActivityItem) {
  const eventType = normalizedEventType(item);
  const text = sanitizeActivityCopy(`${item.label || ""} ${item.detail || ""}`).toLowerCase();

  const isBeltTributeActivity = Boolean(beltAssetForActivity(item));

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

  if (isBeltTributeActivity) {
    return {
      card: "border-[#b88a34]/42 bg-[radial-gradient(140%_95%_at_0%_50%,rgba(242,189,79,0.30)_0%,rgba(242,189,79,0.17)_18%,rgba(242,189,79,0.00)_42%),radial-gradient(140%_95%_at_100%_50%,rgba(227,164,48,0.28)_0%,rgba(227,164,48,0.14)_18%,rgba(227,164,48,0.00)_42%),radial-gradient(70%_120%_at_50%_0%,rgba(255,236,194,0.10)_0%,rgba(255,236,194,0.04)_24%,rgba(255,236,194,0.00)_48%),linear-gradient(90deg,rgba(73,49,15,0.90)_0%,rgba(29,22,19,0.88)_24%,rgba(5,10,24,0.985)_50%,rgba(29,22,19,0.88)_76%,rgba(73,49,15,0.90)_100%)] shadow-[inset_0_0_0_1px_rgba(231,187,82,0.10),inset_0_1px_0_rgba(255,248,226,0.035),0_14px_34px_rgba(0,0,0,0.24),0_0_24px_rgba(242,189,79,0.05)]",
      orb: "border-[#b88a34]/30 bg-[radial-gradient(circle_at_30%_30%,rgba(147,96,18,0.46),rgba(39,25,8,0.95))] text-[#f0dba7] shadow-[0_0_14px_rgba(245,158,11,0.10)]",
      dot: "bg-[#f0c95f] shadow-[0_0_14px_rgba(240,201,95,0.24)]",
      label: "text-[#f1e3ba]",
      detail: "text-[#d5c395]",
      icon: "♛",
    };
  }

  if (eventType === "GROUPED BET" || eventType === "GROUPEDBET" || text.includes("grouped bet")) {
    return {
      card: "border-[#256d91]/60 bg-[linear-gradient(90deg,rgba(7,30,48,0.38),rgba(3,8,23,0.90))] shadow-[inset_0_0_0_1px_rgba(37,109,145,0.16),0_8px_22px_rgba(0,0,0,0.14)]",
      orb: "border-[#2f7ea7]/36 bg-[radial-gradient(circle_at_30%_30%,rgba(37,109,145,0.28),rgba(11,19,33,0.96))] text-[#b9d8e7] shadow-[0_0_12px_rgba(37,109,145,0.13)]",
      dot: "bg-[#65c4ee] shadow-[0_0_10px_rgba(37,109,145,0.26)]",
      label: "text-[#d9e9ef]",
      detail: "text-[#aebec6]",
      icon: "⚔",
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
      label: "text-[#ded7c3]",
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
      card: "border-slate-800/55 bg-[linear-gradient(90deg,rgba(14,116,144,0.18),rgba(15,23,42,0.3))] shadow-[inset_3px_0_0_rgba(148,163,184,0.5),0_0_22px_rgba(148,163,184,0.08)]",
      orb: "border-slate-800/55 bg-black/14 text-slate-100 shadow-[0_0_18px_rgba(148,163,184,0.18)]",
      dot: "bg-slate-300/80 shadow-[0_0_14px_rgba(148,163,184,0.7)]",
      label: "text-[#e6dccb]",
      detail: "text-[#c5bcad]",
      icon: "⚔",
    };
  }

  if (eventType === "DIRECT") {
    return {
      card: "border-slate-400/25 bg-[linear-gradient(90deg,rgba(30,41,59,0.2),rgba(15,23,42,0.28))] shadow-[inset_3px_0_0_rgba(148,163,184,0.36)]",
      orb: "border-slate-300/35 bg-slate-400/10 text-slate-100",
      dot: "bg-slate-300 shadow-[0_0_12px_rgba(203,213,225,0.45)]",
      label: "text-[#ded7c3]",
      detail: "text-slate-200/72",
      icon: "•",
    };
  }

  return {
    card: "border-slate-400/16 bg-slate-950/18",
    orb: "border-slate-300/30 bg-slate-400/10 text-slate-100",
    dot: "bg-slate-300/80",
    label: "text-[#ded7c3]",
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
  void isFresh;
  const visual = activityVisual(item);
  const rowEventType = normalizedEventType(item);
  const groupedBetRowStyle =
    rowEventType === "GROUPED BET" ||
    rowEventType === "GROUPEDBET" ||
    `${item.label || ""} ${item.detail || ""}`.toLowerCase().includes("grouped bet")
      ? {
          borderColor: "rgba(37,109,145,0.62)",
          boxShadow: "inset 0 0 0 1px rgba(37,109,145,0.18), 0 8px 22px rgba(0,0,0,0.14)",
        }
      : undefined;
  const beltAsset = beltAssetForActivity(item);

  const displayLabel = sanitizeActivityCopy(item.label);
  const displayDetail = sanitizeActivityCopy(item.detail);
  const displayTypeLabel = sanitizeActivityCopy(item.eventType || item.meta);
  const amountLabel = item.amountLabel;
  const displayAmountLabel = sanitizeActivityCopy(item.amountLabel);
  const displayTimestampLabel = sanitizeActivityCopy(item.timestampLabel || item.meta);

  if (beltAsset) {
    const beltHeadline = amountLabel
      ? `${displayAmountLabel} Canadian Championship title payout`
      : displayLabel.replace(/direct transfer/gi, "Canadian Championship title payout");

    const beltDetail = displayDetail
      .replace(/Founder Rewards\s*->\s*/gi, "Founder Rewards → ")
      .replace(/AoE2WAR\s+(?:Canada Champion|Canadian Champion|Champion of Canada|Canadian Championship)\s+Tribute/gi, "AoE2WAR Canadian Championship Tribute")
      .replace(/(AoE2WAR Canadian Championship Tribute)\s*[—-]\s*.*$/i, "$1")
      .replace(/Daily title payout for\s*$/i, "Daily title payout");

    const beltFlag = beltAsset.badge.toLowerCase().includes("canadian") ? "🇨🇦" : "🏆";

    const beltCardClassName = [
      "relative max-w-full overflow-hidden rounded-[1.08rem] border border-transparent",
      "bg-[radial-gradient(115%_135%_at_5%_48%,rgba(255,220,135,0.22)_0%,rgba(189,121,30,0.15)_24%,transparent_53%),radial-gradient(115%_135%_at_96%_52%,rgba(245,178,72,0.24)_0%,rgba(156,92,24,0.15)_25%,transparent_54%),radial-gradient(70%_125%_at_50%_-8%,rgba(255,244,214,0.095)_0%,rgba(255,244,214,0.035)_24%,transparent_48%),linear-gradient(96deg,rgba(48,32,16,0.94)_0%,rgba(17,17,24,0.955)_29%,rgba(5,10,24,0.99)_50%,rgba(17,17,24,0.955)_71%,rgba(48,32,16,0.94)_100%)]",
      "px-4 py-[1.12rem]",
      "shadow-[inset_0_0_0_1px_rgba(222,176,76,0.13),inset_0_1px_0_rgba(255,246,218,0.045),0_14px_34px_rgba(0,0,0,0.25),0_0_30px_rgba(242,189,79,0.065)]",
      "before:pointer-events-none before:absolute before:inset-0 before:bg-[linear-gradient(112deg,transparent_0%,rgba(255,247,220,0.045)_40%,rgba(255,247,220,0.020)_53%,transparent_68%)]",
      "after:pointer-events-none after:absolute after:inset-x-5 after:top-0 after:h-px after:bg-[linear-gradient(90deg,transparent,rgba(255,231,173,0.20),transparent)]",
      "transition hover:shadow-[inset_0_0_0_1px_rgba(236,194,95,0.18),inset_0_1px_0_rgba(255,246,218,0.055),0_14px_34px_rgba(0,0,0,0.25),0_0_34px_rgba(242,189,79,0.085)]",
      className,
    ].filter(Boolean).join(" ");

    return (
      <div
        className={beltCardClassName}
      >
        <button
          type="button"
          onClick={() => {
            if (hasChildren) setExpanded((value) => !value);
          }}
          className={`relative min-h-[8.1rem] w-full text-left focus:outline-none focus-visible:outline-none ${
            hasChildren ? "cursor-pointer" : "cursor-default"
          }`}
        >
          <div className="absolute right-0 top-0 z-40 flex max-w-[52%] flex-wrap items-center justify-end gap-2">
            <FeedChip>{displayTypeLabel}</FeedChip>
            {amountLabel ? <FeedChip>{displayAmountLabel}</FeedChip> : null}
            <FeedChip>{displayTimestampLabel}</FeedChip>
            {hasChildren ? <FeedChip>{expanded ? "Hide rows" : `${children.length} rows`}</FeedChip> : null}
            {item.txUrl ? (
              <a
                href={item.txUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className="max-w-full break-all rounded-full border border-transparent bg-black/12 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#a99974] transition hover:bg-black/18 hover:text-[#ccb98a]"
              >
                Tx
              </a>
            ) : null}
          </div>

          <div className="pointer-events-none absolute bottom-[-0.1rem] right-[-1.35rem] top-[1.6rem] z-30 flex w-[35%] items-center justify-center">
            <Image
              src={beltAsset.src}
              alt={beltAsset.alt}
              width={900}
              height={420}
              unoptimized
              className="h-auto max-h-[6.85rem] w-auto max-w-full object-contain opacity-[0.96] drop-shadow-[0_20px_38px_rgba(0,0,0,0.70)]"
            />
          </div>

          <div className="relative z-20 flex min-h-[8.1rem] max-w-[66%] flex-col justify-start pr-5 pt-2.5">
            <div className="flex min-w-0 items-start gap-3">
              <div className="relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-transparent bg-black/14 shadow-[inset_0_0_0_1px_rgba(111,87,37,0.24),inset_0_1px_0_rgba(255,255,255,0.050),0_0_18px_rgba(251,191,36,0.08)]">
                <Image
                  src="/legacy/wolo-logo-transparent.png"
                  alt="WOLO"
                  width={34}
                  height={34}
                  className="h-7 w-7 object-contain drop-shadow-[0_6px_18px_rgba(245,158,11,0.34)]"
                />
                <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-transparent bg-[radial-gradient(circle_at_35%_30%,rgba(255,255,255,0.82),rgba(255,255,255,0.16)_36%,rgba(15,23,42,0.58))] text-[13px] shadow-[0_6px_14px_rgba(0,0,0,0.34)] ring-1 ring-white/10">
                  {beltFlag}
                </span>
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-[0.48rem] h-3.5 w-3.5 shrink-0 rounded-full bg-[#f2c94c] shadow-[0_0_18px_rgba(242,201,76,0.66)]" />
                  <div className="min-w-0">
                    <div className="break-words font-serif text-[1.32rem] font-semibold leading-tight tracking-[-0.012em] text-[#f2e4b8] md:text-[1.44rem]">
                      {beltHeadline}
                    </div>
                    <div className="mt-2 min-w-0 break-words text-[13px] font-medium leading-6 text-[#d1bf92]">
                      {beltDetail.startsWith("Founder Rewards") ? (
                        <>
                          <span className="text-[#f0ca54]">Founder Rewards</span>
                          {beltDetail.slice("Founder Rewards".length)}
                        </>
                      ) : (
                        beltDetail
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </button>

        {hasChildren && expanded ? (
          <div className="mt-3 space-y-2 overflow-hidden border-t border-amber-200/8 pt-3">
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

  return (
    <div
      style={groupedBetRowStyle}
      className={`max-w-full overflow-hidden rounded-[1.1rem] border p-3.5 transition hover:bg-white/[0.035] ${
        visual.card
      }  ${className}`}
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
                {displayLabel}
              </div>
            </div>
            <div className={`mt-1 min-w-0 break-words text-sm leading-6 ${visual.detail}`}>
              {displayDetail}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 shrink-0 flex-wrap gap-2 pl-5 sm:max-w-[45%] sm:justify-end sm:pl-0">
          <FeedChip>{displayTypeLabel}</FeedChip>
          {hasChildren ? <FeedChip>{expanded ? "Hide rows" : `${children.length} rows`}</FeedChip> : null}
          {amountLabel ? <FeedChip>{displayAmountLabel}</FeedChip> : null}
          <FeedChip>{displayTimestampLabel}</FeedChip>
          {item.txUrl ? (
            <a
              href={item.txUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="max-w-full break-all rounded-full border border-transparent bg-black/16 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#bdae84] ring-1 ring-[#7c6734]/10 transition hover:bg-black/22 hover:text-[#d8c79b] hover:ring-[#b99848]/16"
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
    <span className="max-w-full break-all rounded-full border border-transparent bg-black/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aaa18b] shadow-[inset_0_0_0_1px_rgba(125,108,68,0.10)]">
      {children}
    </span>
  );
}
