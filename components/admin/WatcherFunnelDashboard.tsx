import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  CircleAlert,
  Database,
  Download,
  FileCheck2,
  HeartPulse,
  KeyRound,
  ListChecks,
  RadioTower,
  UploadCloud,
} from "lucide-react";

import type {
  WatcherFunnelDashboardData,
  WatcherFunnelStage,
  WatcherFunnelWindowCounts,
  WatcherFunnelWindowKey,
} from "@/lib/watcherFunnel";

type WatcherFunnelDashboardProps = {
  data: WatcherFunnelDashboardData;
};

const WINDOW_ORDER: WatcherFunnelWindowKey[] = [
  "allTime",
  "last30Days",
  "last7Days",
  "last24Hours",
];

const STAGE_ICONS: Record<string, typeof Download> = {
  downloads: Download,
  app_open: Activity,
  auth_success: KeyRound,
  heartbeat: HeartPulse,
  replay_detected: RadioTower,
  upload_started: UploadCloud,
  upload_finished: FileCheck2,
  parsed_games: Database,
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function compactValue(value: string | number | null, fallback = "not sent") {
  if (value === null || value === "") {
    return fallback;
  }

  const normalized = String(value);
  if (normalized.length <= 28) {
    return normalized;
  }

  return `${normalized.slice(0, 12)}...${normalized.slice(-8)}`;
}

function windowValue(counts: WatcherFunnelWindowCounts, key: WatcherFunnelWindowKey) {
  return formatNumber(counts[key] ?? 0);
}

function FunnelStageRow({
  stage,
  index,
}: {
  stage: WatcherFunnelStage;
  index: number;
}) {
  const Icon = STAGE_ICONS[stage.key] ?? ListChecks;

  return (
    <div className="grid gap-4 border-t border-white/8 px-4 py-4 first:border-t-0 lg:grid-cols-[minmax(18rem,1.6fr)_repeat(4,minmax(6rem,0.65fr))]">
      <div className="flex min-w-0 gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase text-slate-500">Step {index + 1}</span>
            <span
              className={
                stage.status === "partial"
                  ? "rounded-full border border-amber-300/20 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100"
                  : "rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-100"
              }
            >
              {stage.status === "partial" ? "partial" : "tracked"}
            </span>
          </div>
          <div className="mt-1 text-base font-semibold text-white">{stage.label}</div>
          <p className="mt-1 text-sm leading-5 text-slate-400">{stage.description}</p>
          <div className="mt-2 break-words rounded-md border border-white/8 bg-slate-950/60 px-2.5 py-1.5 text-xs text-slate-400">
            {stage.source}
          </div>
          {stage.note ? <p className="mt-2 text-xs leading-5 text-amber-100/80">{stage.note}</p> : null}
        </div>
      </div>

      {WINDOW_ORDER.map((key) => (
        <div key={key} className="rounded-lg border border-white/8 bg-white/5 px-3 py-3 lg:text-right">
          <div className="text-[11px] uppercase text-slate-500">
            {key === "allTime"
              ? "All"
              : key === "last30Days"
                ? "30d"
                : key === "last7Days"
                  ? "7d"
                  : "24h"}
          </div>
          <div className="mt-1 text-2xl font-semibold text-white">{windowValue(stage.counts, key)}</div>
        </div>
      ))}
    </div>
  );
}

export default function WatcherFunnelDashboard({ data }: WatcherFunnelDashboardProps) {
  const topLine = data.stages.slice(0, 4);
  const uploadFailureMetric = data.supplementalMetrics.find((metric) => metric.key === "upload_failed");

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.13),_transparent_30%),radial-gradient(circle_at_top_right,_rgba(251,191,36,0.12),_transparent_28%),linear-gradient(135deg,_#020617,_#0f172a_52%,_#111827)] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <Link
              href="/admin/user-list"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-cyan-200/40 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Command tower
            </Link>
            <div className="mt-5 text-xs uppercase tracking-[0.35em] text-cyan-100/70">
              Watcher Operator Funnel
            </div>
            <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">
              Downloads vs real watcher usage
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              A truth-first read on package pulls, app opens, pairing success, active sessions,
              replay detection, upload attempts, completed uploads, and parsed watcher games.
            </p>
          </div>
          <div className="rounded-lg border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-300">
            Generated {formatDate(data.generatedAt)}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {topLine.map((stage) => {
            const Icon = STAGE_ICONS[stage.key] ?? ListChecks;
            return (
              <div key={stage.key} className="rounded-lg border border-white/10 bg-slate-950/55 p-4">
                <div className="flex items-center gap-2 text-[11px] uppercase text-slate-500">
                  <Icon className="h-4 w-4" />
                  {stage.label}
                </div>
                <div className="mt-3 text-3xl font-semibold text-white">
                  {formatNumber(stage.counts.last24Hours)}
                </div>
                <div className="mt-1 text-sm text-slate-400">
                  24h · {formatNumber(stage.counts.last7Days)} in 7d ·{" "}
                  {formatNumber(stage.counts.allTime)} all
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-950/70">
        <div className="grid gap-4 px-4 py-4 text-xs uppercase text-slate-500 lg:grid-cols-[minmax(18rem,1.6fr)_repeat(4,minmax(6rem,0.65fr))]">
          <div>Funnel stage</div>
          <div className="lg:text-right">All time</div>
          <div className="lg:text-right">Last 30 days</div>
          <div className="lg:text-right">Last 7 days</div>
          <div className="lg:text-right">Last 24 hours</div>
        </div>
        {data.stages.map((stage, index) => (
          <FunnelStageRow key={stage.key} stage={stage} index={index} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
            <CircleAlert className="h-4 w-4" />
            Not Tracked Yet
          </div>
          <div className="mt-4 space-y-3">
            {data.unavailableMetrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-white/8 bg-white/5 p-3">
                <div className="text-sm font-semibold text-white">{metric.label}</div>
                <p className="mt-1 text-sm leading-5 text-slate-400">{metric.reason}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
          <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
            <ListChecks className="h-4 w-4" />
            Operator Notes
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {data.operatorNotes.map((note) => (
              <div key={note} className="rounded-lg border border-white/8 bg-white/5 p-3 text-sm leading-5 text-slate-300">
                {note}
              </div>
            ))}
            {uploadFailureMetric ? (
              <div className="rounded-lg border border-rose-300/20 bg-rose-400/10 p-3">
                <div className="text-sm font-semibold text-rose-100">{uploadFailureMetric.label}</div>
                <div className="mt-2 text-sm text-rose-100/80">
                  {formatNumber(uploadFailureMetric.counts.last24Hours)} in 24h ·{" "}
                  {formatNumber(uploadFailureMetric.counts.last7Days)} in 7d ·{" "}
                  {formatNumber(uploadFailureMetric.counts.allTime)} all
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase text-slate-500">
              <RadioTower className="h-4 w-4" />
              Recent Watcher Sessions
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Last 30 days, newest first</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              First/last seen are within the recent scan window. Parsed game counts are shown only
              when telemetry included replay_hash values that can be matched to watcher game rows.
            </p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            {data.sessionRows.length} shown · {data.recentEventScanLimit} event scan cap
          </div>
        </div>

        {data.unknownRecentEvents > 0 ? (
          <div className="mt-4 rounded-lg border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100/90">
            {formatNumber(data.unknownRecentEvents)} recent event(s) had no watcher_id, session_id,
            user_id, or user_uid and are excluded from unique session rows.
          </div>
        ) : null}

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[1080px] w-full border-separate border-spacing-0 text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-slate-500">
                <th className="border-b border-white/10 px-3 py-3 font-medium">Watcher / Session</th>
                <th className="border-b border-white/10 px-3 py-3 font-medium">User</th>
                <th className="border-b border-white/10 px-3 py-3 font-medium">Version / Platform</th>
                <th className="border-b border-white/10 px-3 py-3 font-medium">First / Last</th>
                <th className="border-b border-white/10 px-3 py-3 font-medium">Events</th>
                <th className="border-b border-white/10 px-3 py-3 font-medium">Replay Flow</th>
                <th className="border-b border-white/10 px-3 py-3 font-medium">Parsed</th>
              </tr>
            </thead>
            <tbody>
              {data.sessionRows.length > 0 ? (
                data.sessionRows.map((row) => (
                  <tr key={row.key} className="align-top text-slate-300">
                    <td className="border-b border-white/8 px-3 py-4">
                      <div className="font-mono text-xs text-white">{compactValue(row.watcherId)}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">
                        {compactValue(row.sessionId)}
                      </div>
                    </td>
                    <td className="border-b border-white/8 px-3 py-4">
                      <div>{compactValue(row.userId, "no user_id")}</div>
                      <div className="mt-1 font-mono text-xs text-slate-500">
                        {compactValue(row.userUid, "no user_uid")}
                      </div>
                    </td>
                    <td className="border-b border-white/8 px-3 py-4">
                      <div>{compactValue(row.appVersion)}</div>
                      <div className="mt-1 text-xs text-slate-500">{compactValue(row.platform)}</div>
                    </td>
                    <td className="border-b border-white/8 px-3 py-4">
                      <div>{formatDate(row.firstSeen)}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatDate(row.lastSeen)}</div>
                    </td>
                    <td className="border-b border-white/8 px-3 py-4">
                      <div className="font-semibold text-white">{formatNumber(row.totalEvents)}</div>
                      <div className="mt-1 text-xs text-slate-500">last {row.lastEventType}</div>
                      <div className="mt-2 flex max-w-[18rem] flex-wrap gap-1.5">
                        {Object.entries(row.eventCounts)
                          .sort((left, right) => right[1] - left[1])
                          .slice(0, 6)
                          .map(([eventType, count]) => (
                            <span
                              key={eventType}
                              className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
                            >
                              {eventType} {count}
                            </span>
                          ))}
                      </div>
                    </td>
                    <td className="border-b border-white/8 px-3 py-4">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                          detect {row.replayDetections}
                        </span>
                        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">
                          start {row.uploadsStarted}
                        </span>
                        <span className="rounded-md border border-emerald-300/20 bg-emerald-400/10 px-2 py-1 text-emerald-100">
                          finish {row.uploadsFinished}
                        </span>
                        <span className="rounded-md border border-rose-300/20 bg-rose-400/10 px-2 py-1 text-rose-100">
                          fail {row.uploadsFailed}
                        </span>
                      </div>
                    </td>
                    <td className="border-b border-white/8 px-3 py-4">
                      {row.parsedGameCount === null ? (
                        <span className="text-xs text-slate-500">not joinable</span>
                      ) : (
                        <span className="font-semibold text-white">
                          {formatNumber(row.parsedGameCount)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    No watcher telemetry sessions in the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
