"use client";

import { ArrowDownToLine, Boxes, Clock3, Download, MonitorDown } from "lucide-react";

type WatcherDownloadSummaryRow = {
  key: string;
  platform: "windows" | "macos" | "linux";
  title: string;
  shortLabel: string;
  format: string;
  totalCount: number;
  last24Hours: number;
  last7Days: number;
};

type WatcherDownloadRecentRow = {
  id: number;
  createdAt: string;
  platform: "windows" | "macos" | "linux";
  artifact: string;
  title: string;
  format: string;
  version: string;
  filename: string;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  userUid: string | null;
  userDisplayName: string | null;
};

type WatcherDownloadRailProps = {
  summary: {
    totalCount: number;
    last24Hours: number;
    last7Days: number;
    rows: WatcherDownloadSummaryRow[];
  };
  recent: WatcherDownloadRecentRow[];
};

function platformTone(platform: WatcherDownloadSummaryRow["platform"]) {
  if (platform === "windows") {
    return "border-sky-300/20 bg-sky-400/10 text-sky-100";
  }
  if (platform === "macos") {
    return "border-amber-300/20 bg-amber-400/10 text-amber-100";
  }
  return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function compactHost(input: string | null) {
  if (!input) {
    return "Direct";
  }

  try {
    return new URL(input).host;
  } catch {
    return input.replace(/^https?:\/\//i, "").slice(0, 60) || "Direct";
  }
}

function compactUserAgent(input: string | null) {
  if (!input) {
    return "Unknown client";
  }

  if (input.includes("Windows")) return "Windows client";
  if (input.includes("Macintosh") || input.includes("Mac OS X")) return "macOS client";
  if (input.includes("Linux")) return "Linux client";
  return input.slice(0, 60);
}

function StatTile({
  label,
  value,
  sublabel,
  icon: Icon,
}: {
  label: string;
  value: string;
  sublabel: string;
  icon: typeof Download;
}) {
  return (
    <div className="rounded-[1.3rem] border border-white/8 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{sublabel}</div>
    </div>
  );
}

export function WatcherDownloadRail({ summary, recent }: WatcherDownloadRailProps) {
  return (
    <section className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-slate-500">
            <ArrowDownToLine className="h-4 w-4" />
            Watcher Downloads
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            Real package pulls, split by platform and package type
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Server-side redirects log the package, version, filename, request fingerprint, and
            signed-in user when present before the static file is served.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {summary.rows.reduce((sum, row) => sum + Number(row.totalCount > 0), 0)} package lanes touched
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <StatTile
          label="Total"
          value={String(summary.totalCount)}
          sublabel="All recorded watcher downloads"
          icon={Download}
        />
        <StatTile
          label="Last 24h"
          value={String(summary.last24Hours)}
          sublabel="Fresh pull volume"
          icon={Clock3}
        />
        <StatTile
          label="Last 7d"
          value={String(summary.last7Days)}
          sublabel="Weekly packaging pulse"
          icon={Boxes}
        />
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-5">
        {summary.rows.map((row) => (
          <div key={row.key} className="rounded-[1.25rem] border border-white/8 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${platformTone(row.platform)}`}>
                {row.platform}
              </span>
              <span className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                {row.format}
              </span>
            </div>
            <div className="mt-4 text-sm font-semibold text-white">{row.title}</div>
            <div className="mt-1 text-xs text-slate-400">{row.shortLabel}</div>
            <div className="mt-4 text-3xl font-semibold text-white">{row.totalCount}</div>
            <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>24h {row.last24Hours}</span>
              <span>7d {row.last7Days}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500">
          <MonitorDown className="h-4 w-4" />
          Recent Pulls
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recent.length > 0 ? (
            recent.map((event) => (
              <article
                key={event.id}
                className="rounded-[1.25rem] border border-white/8 bg-slate-900/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{event.title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {event.version} · {event.filename}
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${platformTone(
                      event.platform
                    )}`}
                  >
                    {event.platform}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <span>{formatShortDate(event.createdAt)}</span>
                  <span>{event.userDisplayName || event.userUid || "Guest"}</span>
                  <span>{compactHost(event.referer)}</span>
                  <span>{compactUserAgent(event.userAgent)}</span>
                  {event.ipAddress ? <span>{event.ipAddress}</span> : null}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-[1.25rem] border border-white/8 bg-slate-900/70 px-4 py-5 text-sm text-slate-400">
              No watcher downloads recorded yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
