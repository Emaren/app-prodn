import type { ProvisionalTrafficPoint } from "@/lib/provisionalTraffic";
import PremiumTimeSeriesChart, { type ObservatorySeries } from "@/components/observatory/PremiumTimeSeriesChart";

export default function ProvisionalActivity({
  points,
}: {
  points: ProvisionalTrafficPoint[];
}) {
  const last = points.at(-1) ?? null;
  const bars = points.slice(-14);
  const maxIps = Math.max(1, ...bars.map((point) => point.observedQualifyingIps));
  const observedTrend = points.map((point) => ({
    date: point.date,
    values: {
      observedGetEvents: point.observedGetEvents,
      observedQualifyingIps: point.observedQualifyingIps,
    },
  }));
  const observedSeries: ObservatorySeries[] = [
    {
      key: "observedGetEvents",
      label: "Filtered GET requests · not sessions",
      color: "#f5c65b",
      axis: "count",
      defaultVisible: true,
    },
    {
      key: "observedQualifyingIps",
      label: "Qualifying IPs · not people",
      color: "#5aa9ff",
      axis: "secondaryCount",
      defaultVisible: true,
    },
  ];

  return (
    <section
      aria-label="Provisional, unverified daily web activity"
      className="mt-5 overflow-hidden rounded-3xl border border-amber-300/20 bg-[#0b1018]/90 px-4 py-5 sm:px-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-amber-300">
            Recent activity / Observed only — not human-certified
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-50">
            What the servers have observed recently
          </h2>
          <p className="mt-2 max-w-[900px] text-xs leading-5 text-slate-400">
            This chart shows the latest directly observed activity. The certified
            historical Traffic chart is kept separately below.
            Qualifying IPs are not unique people; filtered GET events are not page sessions.
            These days can still change as logs arrive. They are NOT part of the
            Total Traffic, Potential Humans or Confirmed Humans series.
          </p>
        </div>
        <span className="rounded-full border border-amber-300/30 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-amber-200">
          Provisional · unverified
        </span>
      </div>

      {last ? (
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Latest observed UTC day
            </p>
            <p className="mt-2 text-lg font-semibold tabular-nums text-white">
              {last.date}
              {last.utcDayComplete ? null : <span className="ml-2 text-xs text-amber-300">Partial</span>}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Qualifying IPs · not people
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-sky-300">
              {last.observedQualifyingIps.toLocaleString("en-CA")}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-400">
              Filtered page GETs · not sessions
            </p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-amber-200">
              {last.observedGetEvents.toLocaleString("en-CA")}
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-400">
          No provisional dates after the latest certified archive day are available.
        </p>
      )}

      {observedTrend.length >= 2 ? (
        <div className="mt-5">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.17em] text-amber-200">
            Observational trend only · latest UTC day may be partial · two independent axes
          </p>
          <PremiumTimeSeriesChart
            title="Recent observations"
            points={observedTrend}
            series={observedSeries}
            variant="statistics"
          />
        </div>
      ) : null}

      {bars.length ? (
        <div className="mt-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.17em] text-sky-200">
            Qualifying IPs by UTC day · observational, not humans
          </p>
          <div
            role="img"
            aria-label={bars.map((p) =>
              `${p.date}: ${p.observedQualifyingIps} qualifying IPs${p.utcDayComplete ? "" : " (partial day)"}`
            ).join("; ")}
            className="flex h-40 items-end gap-1 rounded-xl border border-white/10 bg-[#07121d] px-3 pt-4 pb-2"
          >
            {bars.map((point) => (
              <div
                key={point.date}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
                title={`${point.date}: ${point.observedQualifyingIps.toLocaleString()} qualifying IPs, ${point.observedGetEvents.toLocaleString()} filtered GETs`}
              >
                <div
                  className={`w-full min-h-[2px] rounded-t-sm ${point.utcDayComplete ? "bg-sky-400/75" : "bg-amber-300/80"}`}
                  style={{ height: `${Math.max(2, Math.round(point.observedQualifyingIps / maxIps * 100))}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between font-mono text-[10px] text-slate-500">
            <span>{bars[0].date}</span>
            <span>{bars[bars.length - 1].date}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
