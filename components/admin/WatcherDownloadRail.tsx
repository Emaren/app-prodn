"use client";

import {
  ArrowDownToLine,
  Clock3,
  Download,
  MonitorDown,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import TimeDisplayText from "@/components/time/TimeDisplayText";

type WatcherDownloadSummaryRow = {
  key: string;
  platform: "windows" | "macos" | "linux";
  title: string;
  shortLabel: string;
  format: string;
  totalCount: number;
  likelyExternalCount: number;
  likelyInternalTestCount: number;
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
  trafficClass: "external" | "internal_test";
  userUid: string | null;
  userDisplayName: string | null;
};

type WatcherDownloadRailProps = {
  summary: {
    totalCount: number;
    likelyExternalCount: number;
    likelyInternalTestCount: number;
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

function trafficTone(trafficClass: WatcherDownloadRecentRow["trafficClass"]) {
  if (trafficClass === "internal_test") {
    return "border-fuchsia-300/20 bg-fuchsia-400/10 text-fuchsia-100";
  }

  return "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
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
            Tracked package pulls with the noisy edges shaved off
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Direct tracked redirects still log the package, version, filename, request fingerprint,
            and signed-in user when present. Prefetch-style route warming is ignored, and the rail
            now calls out known internal or test traffic separately.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {summary.rows.reduce((sum, row) => sum + Number(row.totalCount > 0), 0)} package lanes touched
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Recorded"
          value={String(summary.totalCount)}
          sublabel={`Raw rows after prefetch filtering · 7d ${summary.last7Days}`}
          icon={Download}
        />
        <StatTile
          label="Likely External"
          value={String(summary.likelyExternalCount)}
          sublabel="Best current read on real user pulls"
          icon={Sparkles}
        />
        <StatTile
          label="Internal/Test"
          value={String(summary.likelyInternalTestCount)}
          sublabel="Known local, scripted, or operator traffic"
          icon={ShieldCheck}
        />
        <StatTile
          label="Last 24h"
          value={String(summary.last24Hours)}
          sublabel="Fresh pull volume after route filtering"
          icon={Clock3}
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
            <div className="mt-3 grid gap-2 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>Likely external</span>
                <span className="font-semibold text-white">{row.likelyExternalCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-400">
                <span>Internal/test</span>
                <span>{row.likelyInternalTestCount}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
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

                <div className="mt-3">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${trafficTone(
                      event.trafficClass
                    )}`}
                  >
                    {event.trafficClass === "internal_test" ? "internal/test" : "likely external"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <TimeDisplayText
                    value={event.createdAt}
                    className="text-slate-300"
                    bubbleClassName="max-w-[16rem] text-center"
                    emptyValue="Unknown"
                  />
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
