"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StakingActivityItem } from "@/lib/staking";

type ActivityFeedEvent = CustomEvent<{ item?: StakingActivityItem }>;

const PAGE_SIZE = 16;

type ActivityPageResponse = {
  rows?: StakingActivityItem[];
  hasMore?: boolean;
  nextBefore?: string | null;
};

function activityKey(item: StakingActivityItem) {
  return item.key || `${item.label}:${item.detail}:${item.meta}`;
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

  return merged;
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
  const [rows, setRows] = useState(initialRows);
  const [freshKey, setFreshKey] = useState<string | null>(activityKey(initialRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" }));
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(Boolean(loadMoreEndpoint));
  const [nextBefore, setNextBefore] = useState<string | null>(() => oldestDirectRowTimestamp(initialRows));
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setRows((current) => mergeActivityRows(initialRows, current));
    setFreshKey(activityKey(initialRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" }));
  }, [initialRows]);

  useEffect(() => {
    setHasMore(Boolean(loadMoreEndpoint));
    setNextBefore(oldestDirectRowTimestamp(initialRows));
  }, [initialRows, loadMoreEndpoint]);

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
    if (!loadMoreEndpoint || loadingMore || !hasMore) return;
    setLoadingMore(true);

    try {
      const url = new URL(loadMoreEndpoint, window.location.origin);
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (nextBefore) {
        url.searchParams.set("before", nextBefore);
      }

      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Activity request failed: ${response.status}`);
      }

      const payload = (await response.json()) as ActivityPageResponse;
      const nextRows = Array.isArray(payload.rows) ? payload.rows : [];
      setRows((current) => mergeActivityRows(current, nextRows));
      setHasMore(Boolean(payload.hasMore));
      setNextBefore(payload.nextBefore || oldestDirectRowTimestamp(nextRows) || nextBefore);
    } catch (error) {
      console.warn("Failed to load older staking activity:", error);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadMoreEndpoint, loadingMore, nextBefore]);

  useEffect(() => {
    if (!loadMoreEndpoint || !hasMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "240px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore, loadMoreEndpoint]);

  return (
    <div className="space-y-2.5">
      {note ? (
        <div className="rounded-[1rem] border border-cyan-300/14 bg-cyan-400/[0.055] px-3.5 py-3 text-xs leading-5 text-cyan-50/80">
          {note}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.04] p-3.5 text-sm text-slate-300">
          No mainnet activity rows are visible yet.
        </div>
      ) : null}

      {rows.map((item) => {
        const key = activityKey(item);
        return (
          <ActivityRow
            key={key}
            item={item}
            isFresh={key === freshKey}
          />
        );
      })}

      {loadMoreEndpoint ? (
        <div ref={sentinelRef} className="flex justify-center pt-2">
          {hasMore ? (
            <button
              type="button"
              onClick={() => void loadMore()}
              disabled={loadingMore}
              className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200 transition hover:border-white/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load older mainnet transfers"}
            </button>
          ) : rows.length > 0 ? (
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Beginning of indexed mainnet transfers
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function oldestDirectRowTimestamp(rows: StakingActivityItem[]) {
  return rows
    .filter((row) => row.eventType === "DIRECT" && row.occurredAt)
    .map((row) => new Date(row.occurredAt || ""))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((left, right) => left.getTime() - right.getTime())[0]
    ?.toISOString() ?? null;
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
  const toneClass =
    item.tone === "amber"
      ? "bg-amber-300 text-slate-950"
      : item.tone === "emerald"
        ? "bg-emerald-300 text-slate-950"
        : item.tone === "sky"
          ? "bg-sky-300 text-slate-950"
          : "bg-slate-300 text-slate-950";

  const typeLabel = item.eventType || item.meta;
  const amountLabel = item.amountLabel;
  const timestampLabel = item.timestampLabel || item.meta;

  return (
    <div
      className={`flex flex-col gap-3 rounded-[1.1rem] border bg-white/[0.04] p-3.5 sm:flex-row sm:items-center ${isFresh ? "staking-activity-new border-amber-300/30" : "border-white/10"} ${className}`}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${toneClass}`} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-white">{item.label}</div>
          <div className="mt-0.5 truncate text-sm leading-6 text-slate-300">{item.detail}</div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 pl-5 sm:justify-end sm:pl-0">
        <FeedChip>{typeLabel}</FeedChip>
        {amountLabel ? <FeedChip>{amountLabel}</FeedChip> : null}
        <FeedChip>{timestampLabel}</FeedChip>
      </div>
    </div>
  );
}

function FeedChip({ children }: { children: string }) {
  return (
    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
      {children}
    </span>
  );
}
