import { Suspense } from "react";
import TrafficSensors from "@/components/traffic/TrafficSensors";
import { loadTrafficBrowserInsights } from "@/lib/publicTrafficInsights";
import PremiumTimeSeriesChart, {
  type ObservatorySeries,
} from "@/components/observatory/PremiumTimeSeriesChart";
import {
  loadPublicTraffic,
  type PublicTrafficPoint,
} from "@/lib/publicTraffic";

const SERIES: ObservatorySeries[] = [
  {
    key: "totalTraffic",
    label: "Total Traffic",
    color: "#f5c65b",
    axis: "count",
    defaultVisible: true,
  },
  {
    key: "suspectedHuman",
    label: "Potential Humans",
    color: "#5aa9ff",
    axis: "secondaryCount",
    defaultVisible: true,
  },
  {
    key: "confirmedHuman",
    label: "Confirmed Humans",
    color: "#42f1b5",
    axis: "secondaryCount",
    defaultVisible: true,
  },
];

export const dynamic = "force-dynamic";

// The historical chart is NOT held behind the much slower, independent
// browser-beacon cohort query. The visitor intelligence section streams after
// the canonical chart, and fails closed to unavailable if its source fails.
async function ObservedTrafficSensors({
  points, lastPublishedDay, lagDays,
}: {
  points: PublicTrafficPoint[];
  lastPublishedDay: string | null;
  lagDays: number | null;
}) {
  let insights = null;
  try {
    insights = await loadTrafficBrowserInsights();
  } catch (error) {
    console.warn("Observed browser insights unavailable:", error);
  }
  return (
    <TrafficSensors
      points={points}
      lastPublishedDay={lastPublishedDay}
      lagDays={lagDays}
      insights={insights}
    />
  );
}

export default async function TrafficPage() {
  let points: PublicTrafficPoint[] = [];
  let archiveCalculatedAt: string | null = null;
  let failed = false;
  try {
    const report = await loadPublicTraffic();
    points = report.points;
    archiveCalculatedAt = report.archiveCalculatedAt;
  } catch (error) {
    failed = true;
    console.error("Traffic page preload failed:", error);
  }

  const lastPublishedDay = points.at(-1)?.date ?? null;
  const todayUtc = new Date().toISOString().slice(0, 10);
  const ageDays = lastPublishedDay
    ? Math.round((Date.parse(`${todayUtc}T00:00:00Z`) -
        Date.parse(`${lastPublishedDay}T00:00:00Z`)) / 86_400_000)
    : null;
  const overdue = ageDays !== null && ageDays > 2;

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#02070d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.12),transparent_27%),radial-gradient(circle_at_82%_0%,rgba(59,130,246,0.12),transparent_28%),radial-gradient(circle_at_50%_100%,rgba(245,158,11,0.07),transparent_38%)]" />

      <div className="relative mx-auto max-w-[1900px] px-3 py-5 sm:px-5 lg:px-8">
        <section aria-label="Canonical Traffic series" className="mt-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-[11px] tracking-wide text-slate-400">
          <span>LAST PUBLISHED UTC DAY: {lastPublishedDay ?? "UNAVAILABLE"}</span>
          <span aria-label="Original archive calculation timestamp">
            ARCHIVE SNAPSHOT CALCULATED: {archiveCalculatedAt
              ? <time dateTime={archiveCalculatedAt}>{archiveCalculatedAt.slice(0, 19).replace("T", " ")} UTC</time>
              : "UNAVAILABLE"}
          </span>
          <span className={overdue ? "font-semibold text-amber-300" : "text-slate-500"}>
            {overdue ? "TRAFFIC ARCHIVE DELAYED — RECENT DAYS UNVERIFIED" : "COMPLETED DAILY BUCKETS ONLY"}
          </span>
        </div>
          <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.035] px-4 py-3 text-xs leading-relaxed text-slate-300">
            <span className="font-mono font-semibold uppercase tracking-[0.16em] text-amber-200">
              Traffic · completed UTC days only · {lastPublishedDay ?? "Not available"}
            </span>
            <p className="mt-1">
              This is the original Total Traffic, Potential Humans and Confirmed Humans graph.
              Each new UTC day appears only after its canonical session counts are
              finalized and independently certified. Incomplete and unverified days
              remain absent, never displayed as zero. The archive calculation
              timestamp identifies the source snapshot, not certification of
              any additional days.
            </p>
          </div>
        {points.length ? (
          <PremiumTimeSeriesChart
            title="Traffic"
            points={points}
            series={SERIES}
            variant="traffic"
            speedReadyRoute="/traffic"
          />
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center rounded-[2.5rem] border border-white/[0.06] bg-white/[0.025] px-6 text-sm text-slate-400">No published completed-day Traffic report is available.</div>
        )}

        </section>

        <Suspense fallback={
          <section aria-live="polite" className="mt-6 rounded-2xl border border-sky-300/15 bg-sky-300/[0.035] p-6 font-mono text-sm text-sky-200">
            Loading observed browser intelligence — historical chart remains available.
          </section>
        }>
          <ObservedTrafficSensors
            points={points}
            lastPublishedDay={lastPublishedDay}
            lagDays={ageDays}
          />
        </Suspense>

        {failed ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-600">
            Unavailable
          </div>
        ) : null}
      </div>
    </main>
  );
}
