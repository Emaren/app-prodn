"use client";

import { useEffect, useMemo, useState } from "react";

import type { StakingActivityItem } from "@/lib/staking";

type ActivityFeedEvent = CustomEvent<{ item?: StakingActivityItem }>;

const MAX_ROWS = 6;

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

  return merged.slice(0, MAX_ROWS);
}

export default function StakingActivityFeed({
  items,
}: {
  items: StakingActivityItem[];
}) {
  const initialRows = useMemo(() => items.slice(0, MAX_ROWS), [items]);
  const [rows, setRows] = useState(initialRows);
  const [freshKey, setFreshKey] = useState<string | null>(activityKey(initialRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" }));

  useEffect(() => {
    setRows((current) => mergeActivityRows(initialRows, current));
    setFreshKey(activityKey(initialRows[0] ?? { label: "", detail: "", meta: "", tone: "slate" }));
  }, [initialRows]);

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

  return (
    <div className="space-y-2.5">
      {rows.map((item, index) => {
        const key = activityKey(item);
        return (
          <ActivityRow
            key={key}
            item={item}
            isFresh={key === freshKey}
            className={index === MAX_ROWS - 1 ? "hidden sm:flex" : undefined}
          />
        );
      })}
    </div>
  );
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
