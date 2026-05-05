"use client";

import {
  Activity,
  ArrowDownToLine,
  FileCheck2,
  Link2,
  MonitorDown,
  PackageOpen,
  ShieldAlert,
  UploadCloud,
  Users,
} from "lucide-react";

import TimeDisplayText from "@/components/time/TimeDisplayText";
import type {
  WatcherDownloadRecentRow,
  WatcherDownloadSummaryRow,
  WatcherDownloadsPayload,
  WatcherMetricWindow,
  WatcherPackagePullClassification,
} from "@/components/admin/command-tower/types";

type WatcherDownloadRailProps = {
  analytics: WatcherDownloadsPayload;
};

const CLASSIFICATION_LABELS: Record<WatcherPackagePullClassification, string> = {
  converted_to_match: "Converted to match",
  converted_to_app_open: "Converted to app open",
  signed_in_package_pull: "Signed-in pull",
  guest_direct_pull: "Guest direct pull",
  likely_scraper_probe: "Likely scraper/probe",
  suspicious_platform_mismatch: "Platform mismatch",
  unknown_one_off_external_pull: "Unknown one-off pull",
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

function classificationTone(classification: WatcherDownloadRecentRow["classification"]) {
  if (classification === "converted_to_match" || classification === "converted_to_app_open") {
    return "border-emerald-300/25 bg-emerald-400/10 text-emerald-100";
  }
  if (classification === "signed_in_package_pull") {
    return "border-sky-300/25 bg-sky-400/10 text-sky-100";
  }
  if (classification === "likely_scraper_probe" || classification === "suspicious_platform_mismatch") {
    return "border-rose-300/25 bg-rose-400/10 text-rose-100";
  }
  if (classification === "guest_direct_pull") {
    return "border-amber-300/25 bg-amber-400/10 text-amber-100";
  }
  return "border-white/10 bg-white/5 text-slate-200";
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

function windowLabel(metric: WatcherMetricWindow) {
  return `7d ${metric.last7Days} · all ${metric.allTime}`;
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
  icon: typeof PackageOpen;
}) {
  return (
    <div className="rounded-lg border border-white/8 bg-slate-900/70 p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-sm text-slate-400">{sublabel}</div>
    </div>
  );
}

export function WatcherDownloadRail({ analytics }: WatcherDownloadRailProps) {
  const { packagePulls, confirmedWatcherUsers, watcherAppOpens, linkedWatcherOpens, summary, recent } =
    analytics;
  const touchedLanes = summary.rows.reduce((sum, row) => sum + Number(row.totalCount > 0), 0);

  return (
    <section className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
            <ArrowDownToLine className="h-4 w-4" />
            Watcher Package Pulls
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">Watcher conversion funnel</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            Noisy external package hits. Not confirmed installs. Confirmed users come from watcher
            client events or watcher-submitted matches.
          </p>
        </div>

        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {touchedLanes} package lanes touched
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <StatTile
          label="Package Pulls"
          value={String(packagePulls.last24Hours)}
          sublabel={`${windowLabel(packagePulls)} · guest ${packagePulls.guest}`}
          icon={PackageOpen}
        />
        <StatTile
          label="Confirmed Watcher Users"
          value={String(confirmedWatcherUsers.totalKnown)}
          sublabel={`client ${confirmedWatcherUsers.fromClientEvents} · games ${confirmedWatcherUsers.fromWatcherSubmittedGames}`}
          icon={Users}
        />
        <StatTile
          label="Watcher App Opens"
          value={String(watcherAppOpens.last24Hours)}
          sublabel={windowLabel(watcherAppOpens)}
          icon={Activity}
        />
        <StatTile
          label="Linked Watcher Opens"
          value={String(linkedWatcherOpens.last24Hours)}
          sublabel={`${windowLabel(linkedWatcherOpens)} · user attached`}
          icon={Link2}
        />
        <StatTile
          label="Manual Upload Users"
          value={String(analytics.manualUploadUsers)}
          sublabel={`${analytics.parsedMatches.fileUpload.allTime} file-upload parsed matches`}
          icon={UploadCloud}
        />
        <StatTile
          label="Parsed Watcher Matches"
          value={String(analytics.parsedMatches.watcher.last24Hours)}
          sublabel={windowLabel(analytics.parsedMatches.watcher)}
          icon={FileCheck2}
        />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-white/8 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
            <ShieldAlert className="h-4 w-4" />
            Pull Quality
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between gap-3">
              <span>Signed-in pulls</span>
              <span className="font-semibold text-white">{packagePulls.signedIn}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Guest pulls</span>
              <span className="font-semibold text-white">{packagePulls.guest}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Likely scraper/probe</span>
              <span className="font-semibold text-white">{packagePulls.likelyProbe}</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
            <UploadCloud className="h-4 w-4" />
            Upload Telemetry
          </div>
          <div className="mt-3 grid gap-2 text-sm text-slate-300">
            <div className="flex justify-between gap-3">
              <span>Attempted 24h</span>
              <span className="font-semibold text-white">{analytics.uploadEvents.attempted.last24Hours}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Succeeded 24h</span>
              <span className="font-semibold text-white">{analytics.uploadEvents.succeeded.last24Hours}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span>Failed 24h</span>
              <span className="font-semibold text-white">{analytics.uploadEvents.failed.last24Hours}</span>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/5 p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
            <FileCheck2 className="h-4 w-4" />
            Parsed Sources
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
            {analytics.parsedMatches.bySource.length > 0 ? (
              analytics.parsedMatches.bySource.slice(0, 8).map((row) => (
                <span key={row.parseSource} className="rounded-full border border-white/10 bg-slate-950/60 px-2.5 py-1">
                  {row.parseSource} {row.count}
                </span>
              ))
            ) : (
              <span>No parsed matches yet.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-5">
        {summary.rows.map((row) => (
          <div key={row.key} className="rounded-lg border border-white/8 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] ${platformTone(row.platform)}`}>
                {row.platform}
              </span>
              <span className="text-[11px] uppercase text-slate-500">{row.format}</span>
            </div>
            <div className="mt-4 text-sm font-semibold text-white">{row.title}</div>
            <div className="mt-1 text-xs text-slate-400">{row.shortLabel}</div>
            <div className="mt-4 text-3xl font-semibold text-white">{row.totalCount}</div>
            <div className="mt-3 grid gap-2 text-xs text-slate-300">
              <div className="flex items-center justify-between gap-3">
                <span>Signed-in</span>
                <span className="font-semibold text-white">{row.signedInCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-400">
                <span>Guest</span>
                <span>{row.guestCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-slate-400">
                <span>Likely probe</span>
                <span>{row.likelyProbeCount}</span>
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
        <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
          <MonitorDown className="h-4 w-4" />
          Recent Package Pulls
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {recent.length > 0 ? (
            recent.map((event) => (
              <article key={event.id} className="rounded-lg border border-white/8 bg-slate-900/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{event.title}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {event.version} · {event.filename}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${platformTone(event.platform)}`}>
                    {event.platform}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] ${classificationTone(
                      event.classification
                    )}`}
                  >
                    {CLASSIFICATION_LABELS[event.classification]}
                  </span>
                  <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                    {event.userDisplayName || event.userUid || "Guest"}
                  </span>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-400">{event.classificationDetail}</p>

                <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                  <TimeDisplayText
                    value={event.createdAt}
                    className="text-slate-300"
                    bubbleClassName="max-w-[16rem] text-center"
                    emptyValue="Unknown"
                  />
                  <span>{compactHost(event.referer)}</span>
                  <span>{compactUserAgent(event.userAgent)}</span>
                  {event.ipAddress ? <span>{event.ipAddress}</span> : null}
                </div>
              </article>
            ))
          ) : (
            <div className="rounded-lg border border-white/8 bg-slate-900/70 px-4 py-5 text-sm text-slate-400">
              No watcher package pulls recorded yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
