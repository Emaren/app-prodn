"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import {
  getRecentSpeedSamples,
  SPEED_SAMPLE_UPDATED_EVENT,
} from "@/lib/speed/clientStore";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";
import type { SpeedSample } from "@/lib/speed/types";

const VIEW_LABELS: Record<TileViewMode, string> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

const CHART_WIDTH = 1120;
const CHART_HEIGHT = 360;
const CHART_PAD_X = 22;
const CHART_PAD_Y = 26;

function formatDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 10) return "<0.01s";
  if (value < 10_000) return `${(value / 1000).toFixed(2)}s`;
  return `${(value / 1000).toFixed(1)}s`;
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (upper - index) + sorted[upper] * (index - lower);
}

function navigationLabel(kind: SpeedSample["navigation_kind"]) {
  if (kind === "initial") return "Initial load";
  if (kind === "internal") return "In-site";
  if (kind === "reload") return "Reload";
  if (kind === "back_forward") return "Restore";
  return kind || "Navigation";
}

function chartPolyline(
  values: Array<number | null | undefined>,
  maxValue: number,
) {
  if (values.length < 2 || maxValue <= 0) return "";
  const usableWidth = CHART_WIDTH - CHART_PAD_X * 2;
  const usableHeight = CHART_HEIGHT - CHART_PAD_Y * 2;
  return values
    .map((value, index) => {
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const x = CHART_PAD_X + (index / Math.max(values.length - 1, 1)) * usableWidth;
      const y = CHART_HEIGHT - CHART_PAD_Y - Math.min(value / maxValue, 1) * usableHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter((point): point is string => Boolean(point))
    .join(" ");
}

function ViewToggle({
  viewMode,
  setViewMode,
  className = "",
}: {
  viewMode: TileViewMode;
  setViewMode: (mode: TileViewMode) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-amber-200/20 bg-[#050910]/88 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42),0_0_30px_rgba(251,191,36,0.06)] backdrop-blur-xl ${className}`}
      role="group"
      aria-label="Speed Observatory view"
    >
      {TILE_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setViewMode(mode)}
          aria-pressed={viewMode === mode}
          aria-label={`${VIEW_LABELS[mode]} Speed Observatory view`}
          title={`${VIEW_LABELS[mode]} view`}
          className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
            viewMode === mode
              ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
              : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
          }`}
        >
          {mode[0]}
        </button>
      ))}
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  premium = false,
}: {
  label: string;
  value: string;
  helper: string;
  premium?: boolean;
}) {
  return (
    <div
      className={
        premium
          ? "rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_55px_rgba(0,0,0,0.2)]"
          : "rounded-3xl border border-white/10 bg-white/[0.035] p-5"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/38">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-2 text-xs leading-5 text-white/45">{helper}</p>
    </div>
  );
}

function ReportAction({
  latest,
  reporting,
  reportMessage,
  sendReport,
}: {
  latest: SpeedSample | null;
  reporting: boolean;
  reportMessage: string;
  sendReport: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void sendReport()}
        disabled={!latest || reporting}
        className="cursor-pointer rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {reporting ? "Sending…" : "Send Speed Report"}
      </button>
      {reportMessage ? <p className="text-xs text-amber-100/75">{reportMessage}</p> : null}
    </div>
  );
}

function MeasurementsTable({
  samples,
  dense = false,
}: {
  samples: SpeedSample[];
  dense?: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-[10px] uppercase tracking-[0.18em] text-white/32">
          <tr>
            <th className="pb-3 pr-4">Route</th>
            <th className="pb-3 pr-4">Experience</th>
            <th className="pb-3 pr-4">Ready</th>
            <th className="pb-3 pr-4">Source</th>
            <th className="pb-3 pr-4">TTFB</th>
            <th className="pb-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/7">
          {samples.length ? (
            samples.map((sample) => (
              <tr key={sample.sample_id} className="text-white/66 transition hover:bg-white/[0.025]">
                <td className={`${dense ? "py-2.5" : "py-3"} pr-4 font-medium text-white`}>{sample.route}</td>
                <td className={`${dense ? "py-2.5" : "py-3"} pr-4`}>{navigationLabel(sample.navigation_kind)}</td>
                <td className={`${dense ? "py-2.5" : "py-3"} pr-4 font-medium text-white/85`}>{formatDuration(sample.ready_ms)}</td>
                <td className={`${dense ? "py-2.5" : "py-3"} pr-4`}>{sample.ready_source}</td>
                <td className={`${dense ? "py-2.5" : "py-3"} pr-4`}>{formatDuration(sample.ttfb_ms)}</td>
                <td className={dense ? "py-2.5" : "py-3"}>
                  {sample.valid_for_aggregation ? "Valid" : sample.invalid_reason || "Excluded"}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6} className="py-10 text-center text-white/40">
                No Speed samples in this browser tab yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function ObservatoryHeader({
  viewMode,
  setViewMode,
  checking,
  runLiveCheck,
  extreme = false,
}: {
  viewMode: TileViewMode;
  setViewMode: (mode: TileViewMode) => void;
  checking: boolean;
  runLiveCheck: () => Promise<void>;
  extreme?: boolean;
}) {
  if (extreme) {
    return (
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-amber-200/58">AoE2WAR Performance</p>
          <h1 className="mt-3 font-serif text-5xl tracking-[-0.035em] text-white sm:text-6xl">Speed</h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300/80">
            Live readiness, network timing, and browser truth from this session — measured after the interface is actually usable.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
          <Link
            href="/"
            className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/65 transition hover:border-white/20 hover:text-white"
          >
            Back to AoE2WAR
          </Link>
          <button
            type="button"
            onClick={() => void runLiveCheck()}
            disabled={checking}
            className="cursor-pointer rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-300/[0.13] disabled:opacity-50"
          >
            {checking ? "Checking…" : "Run live check"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-amber-200/70">AoE2WAR Speed</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">Your Speed Observatory</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
          Real measurements from this browser session. Authoritative Ready is recorded only after a marked primary interface reports itself usable.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
        <Link
          href="/"
          className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-sm text-white/75 transition hover:border-white/20 hover:text-white"
        >
          Back to AoE2WAR
        </Link>
        <button
          type="button"
          onClick={() => void runLiveCheck()}
          disabled={checking}
          className="cursor-pointer rounded-full border border-sky-300/25 bg-sky-300/10 px-4 py-2 text-sm font-medium text-sky-100 transition hover:bg-sky-300/15 disabled:opacity-50"
        >
          {checking ? "Checking…" : "Run live check"}
        </button>
      </div>
    </div>
  );
}

function BasicView({
  viewMode,
  setViewMode,
  metrics,
  samples,
  latest,
  checking,
  reporting,
  reportMessage,
  runLiveCheck,
  sendReport,
}: ViewProps) {
  return (
    <main className="min-h-screen bg-[#06070a] px-4 py-8 text-slate-100 sm:px-6" data-speed-view="basic">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-[30px] border border-amber-300/15 bg-[linear-gradient(180deg,rgba(245,158,11,0.08),rgba(255,255,255,0.025))] p-6 shadow-[0_25px_80px_rgba(0,0,0,0.42)] sm:p-8">
          <ObservatoryHeader viewMode={viewMode} setViewMode={setViewMode} checking={checking} runLiveCheck={runLiveCheck} />
        </header>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
        </section>

        <section className="mt-6 rounded-[30px] border border-white/10 bg-white/[0.03] p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">This tab’s recent measurements</h2>
              <p className="mt-1 text-sm text-white/45">Up to 20 sanitized route samples are kept locally in this tab and relayed to the isolated Traffic performance store.</p>
            </div>
            <ReportAction latest={latest} reporting={reporting} reportMessage={reportMessage} sendReport={sendReport} />
          </div>
          <div className="mt-5"><MeasurementsTable samples={samples} /></div>
        </section>
      </div>
    </main>
  );
}

function AdvancedView({
  viewMode,
  setViewMode,
  metrics,
  samples,
  latest,
  checking,
  reporting,
  reportMessage,
  runLiveCheck,
  sendReport,
}: ViewProps) {
  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_18%_0%,rgba(180,128,45,0.12),transparent_32%),radial-gradient(circle_at_82%_8%,rgba(37,99,235,0.12),transparent_34%),#05070b] px-4 py-8 text-slate-100 sm:px-6 lg:px-8"
      data-speed-view="advanced"
    >
      <div className="mx-auto max-w-[1380px]">
        <header className="relative overflow-hidden rounded-[34px] border border-amber-200/16 bg-[linear-gradient(135deg,rgba(42,31,17,0.88),rgba(8,12,21,0.96)_46%,rgba(10,20,35,0.92))] p-7 shadow-[0_30px_90px_rgba(0,0,0,0.5)] sm:p-9">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_10%,rgba(56,189,248,0.08),transparent_28%)]" />
          <div className="relative"><ObservatoryHeader viewMode={viewMode} setViewMode={setViewMode} checking={checking} runLiveCheck={runLiveCheck} /></div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => <MetricCard key={metric.label} {...metric} premium />)}
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[0.78fr_2.22fr]">
          <aside className="rounded-[30px] border border-amber-200/12 bg-[linear-gradient(180deg,rgba(245,158,11,0.055),rgba(255,255,255,0.02))] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.32)]">
            <p className="text-[10px] uppercase tracking-[0.26em] text-amber-200/55">Live truth</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">Report what you actually felt.</h2>
            <p className="mt-3 text-sm leading-7 text-white/48">
              A Speed Report binds the exact navigation sample, signed-in identity, build, route, and diagnostics for operator review in Traffic.
            </p>
            <div className="mt-6 border-t border-white/8 pt-5">
              <p className="text-xs text-white/35">Latest measured route</p>
              <p className="mt-2 text-lg font-semibold text-white">{latest?.route || "No sample yet"}</p>
              <p className="mt-1 text-sm text-white/45">{latest ? `${navigationLabel(latest.navigation_kind)} · ${formatDuration(latest.ready_ms)}` : "Navigate AoE2WAR to begin measuring."}</p>
            </div>
            <div className="mt-6">
              <ReportAction latest={latest} reporting={reporting} reportMessage={reportMessage} sendReport={sendReport} />
            </div>
          </aside>

          <div className="rounded-[30px] border border-white/10 bg-[#080b11]/94 p-5 shadow-[0_22px_75px_rgba(0,0,0,0.34)] sm:p-6">
            <div className="mb-5">
              <p className="text-[10px] uppercase tracking-[0.25em] text-white/32">Session ledger</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Recent measurements</h2>
            </div>
            <MeasurementsTable samples={samples} dense />
          </div>
        </section>
      </div>
    </main>
  );
}

function ExtremeView({
  viewMode,
  setViewMode,
  metrics,
  samples,
  latest,
  checking,
  reporting,
  reportMessage,
  runLiveCheck,
  sendReport,
  chart,
}: ViewProps & { chart: ChartModel }) {
  return (
    <main
      className="min-h-screen bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.08),transparent_28%),radial-gradient(circle_at_100%_0%,rgba(14,165,233,0.08),transparent_30%),#02050a] px-3 py-6 text-slate-100 sm:px-5 lg:px-7"
      data-speed-view="extreme"
    >
      <div className="w-full max-w-none">
        <section className="relative overflow-hidden rounded-[38px] border border-white/10 bg-[linear-gradient(135deg,rgba(31,22,14,0.72),rgba(4,8,15,0.97)_38%,rgba(5,11,21,0.97)_72%,rgba(16,22,43,0.9))] p-6 shadow-[0_35px_110px_rgba(0,0,0,0.58)] sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_16%,rgba(245,158,11,0.085),transparent_24%),radial-gradient(circle_at_82%_0%,rgba(34,211,238,0.07),transparent_26%)]" />
          <div className="relative">
            <ObservatoryHeader viewMode={viewMode} setViewMode={setViewMode} checking={checking} runLiveCheck={runLiveCheck} extreme />

            <div className="mt-8 flex flex-wrap gap-2">
              {metrics.map((metric, index) => (
                <div
                  key={metric.label}
                  className={`rounded-full border px-4 py-2.5 ${
                    index === 0
                      ? "border-amber-200/16 bg-amber-300/[0.075]"
                      : index === 3
                        ? "border-cyan-200/14 bg-cyan-300/[0.055]"
                        : "border-white/8 bg-white/[0.035]"
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-[0.18em] text-white/35">{metric.label}</span>
                  <span className="ml-3 text-sm font-semibold text-white">{metric.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-[32px] border border-white/8 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:p-6 lg:p-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.26em] text-white/30">Session performance field</p>
                  <h2 className="mt-2 font-serif text-3xl text-white">Measured across this browser journey</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-amber-300/15 bg-amber-300/[0.07] px-3 py-1.5 text-amber-100/80">Ready</span>
                  <span className="rounded-full border border-sky-300/15 bg-sky-300/[0.07] px-3 py-1.5 text-sky-100/80">TTFB</span>
                  <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.07] px-3 py-1.5 text-cyan-100/80">LCP</span>
                </div>
              </div>

              <div className="relative mt-5 overflow-hidden rounded-[26px] border border-white/7 bg-[linear-gradient(180deg,rgba(8,13,24,0.88),rgba(2,5,10,0.96))] px-3 py-4 sm:px-5">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_55%,rgba(245,158,11,0.055),transparent_26%),radial-gradient(circle_at_78%_38%,rgba(14,165,233,0.055),transparent_24%)]" />
                <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="relative h-[310px] w-full sm:h-[360px]" role="img" aria-label="Recent Ready, TTFB, and LCP measurements">
                  <defs>
                    <filter id="speed-glow-amber" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="6" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <filter id="speed-glow-sky" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
                    <linearGradient id="speed-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="rgb(245 158 11)" stopOpacity="0.12"/><stop offset="100%" stopColor="rgb(245 158 11)" stopOpacity="0"/></linearGradient>
                  </defs>
                  {[0, 1, 2, 3, 4].map((line) => {
                    const y = CHART_PAD_Y + (line / 4) * (CHART_HEIGHT - CHART_PAD_Y * 2);
                    return <line key={line} x1={CHART_PAD_X} y1={y} x2={CHART_WIDTH - CHART_PAD_X} y2={y} stroke="rgba(255,255,255,0.055)" strokeWidth="1" />;
                  })}
                  {chart.readyPoints ? <polyline points={chart.readyPoints} fill="none" stroke="rgb(251 191 36)" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" filter="url(#speed-glow-amber)" /> : null}
                  {chart.ttfbPoints ? <polyline points={chart.ttfbPoints} fill="none" stroke="rgb(96 165 250)" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" filter="url(#speed-glow-sky)" /> : null}
                  {chart.lcpPoints ? <polyline points={chart.lcpPoints} fill="none" stroke="rgb(34 211 238)" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" filter="url(#speed-glow-sky)" /> : null}
                </svg>
                <div className="relative -mt-3 flex justify-between text-[10px] uppercase tracking-[0.18em] text-white/24">
                  <span>Earlier</span>
                  <span>Latest · scale {formatDuration(chart.maxValue)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[1fr_2.35fr]">
          <aside className="rounded-[32px] border border-amber-200/12 bg-[linear-gradient(150deg,rgba(39,28,15,0.78),rgba(6,10,18,0.94))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.38)] sm:p-7">
            <p className="text-[10px] uppercase tracking-[0.27em] text-amber-200/55">Proof rail</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">This is your actual session.</h2>
            <p className="mt-3 text-sm leading-7 text-white/45">
              No synthetic benchmark. No site-wide marketing average. Each row is the browser journey that produced the number you saw.
            </p>
            <div className="mt-6 space-y-4 border-t border-white/8 pt-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/28">Latest route</p>
                <p className="mt-1 text-lg font-semibold text-white">{latest?.route || "No sample yet"}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/7 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/28">Ready</p>
                  <p className="mt-2 text-lg font-semibold text-white">{formatDuration(latest?.ready_ms)}</p>
                </div>
                <div className="rounded-2xl border border-white/7 bg-black/20 p-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-white/28">TTFB</p>
                  <p className="mt-2 text-lg font-semibold text-white">{formatDuration(latest?.ttfb_ms)}</p>
                </div>
              </div>
            </div>
            <div className="mt-6"><ReportAction latest={latest} reporting={reporting} reportMessage={reportMessage} sendReport={sendReport} /></div>
          </aside>

          <div className="rounded-[32px] border border-white/9 bg-[#050910]/94 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.38)] sm:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.25em] text-white/28">Flight recorder</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Recent measurements</h2>
              </div>
              <span className="text-xs text-white/28">{samples.length} in this tab</span>
            </div>
            <MeasurementsTable samples={samples} dense />
          </div>
        </section>
      </div>
    </main>
  );
}

type Metric = { label: string; value: string; helper: string };
type ChartModel = { readyPoints: string; ttfbPoints: string; lcpPoints: string; maxValue: number };
type ViewProps = {
  viewMode: TileViewMode;
  setViewMode: (mode: TileViewMode) => void;
  metrics: Metric[];
  samples: SpeedSample[];
  latest: SpeedSample | null;
  checking: boolean;
  reporting: boolean;
  reportMessage: string;
  runLiveCheck: () => Promise<void>;
  sendReport: () => Promise<void>;
};

export default function SpeedObservatory() {
  const { viewMode, setViewMode } = useTileViewPreference("speed");
  const [samples, setSamples] = useState<SpeedSample[]>([]);
  const [checkMs, setCheckMs] = useState<number | null>(null);
  const [checkBuild, setCheckBuild] = useState("");
  const [checking, setChecking] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  const refreshSamples = useCallback(() => {
    setSamples(getRecentSpeedSamples());
  }, []);

  const runLiveCheck = useCallback(async () => {
    setChecking(true);
    const started = performance.now();
    try {
      const response = await fetch(`/api/speed/check?nonce=${Date.now()}`, { cache: "no-store" });
      const payload = (await response.json()) as { build_version?: string };
      if (!response.ok) throw new Error("Speed check failed");
      setCheckMs(performance.now() - started);
      setCheckBuild(payload.build_version || "");
    } catch {
      setCheckMs(null);
      setCheckBuild("");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    refreshSamples();
    void runLiveCheck();

    const handleSample = () => refreshSamples();
    window.addEventListener(SPEED_SAMPLE_UPDATED_EVENT, handleSample);
    return () => window.removeEventListener(SPEED_SAMPLE_UPDATED_EVENT, handleSample);
  }, [refreshSamples, runLiveCheck]);

  const explicit = useMemo(
    () =>
      samples.filter(
        (sample) =>
          sample.ready_source === "explicit" &&
          sample.valid_for_aggregation &&
          !sample.visibility_tainted &&
          typeof sample.ready_ms === "number",
      ),
    [samples],
  );

  const freshExplicit = useMemo(
    () => explicit.filter((sample) => sample.navigation_kind !== "back_forward"),
    [explicit],
  );
  const validSamples = useMemo(
    () =>
      samples.filter(
        (sample) =>
          sample.valid_for_aggregation &&
          !sample.visibility_tainted,
      ),
    [samples],
  );
  const chartSamples = useMemo(
    () =>
      validSamples.filter(
        (sample) =>
          (sample.ready_source === "explicit" ||
            sample.ready_source === "initial_hydration") &&
          typeof sample.ready_ms === "number" &&
          Number.isFinite(sample.ready_ms) &&
          sample.ready_ms >= 0 &&
          sample.ready_ms < 600_000,
      ),
    [validSamples],
  );
  const readyValues = freshExplicit
    .map((sample) => sample.ready_ms)
    .filter((value): value is number => typeof value === "number");
  const latest = explicit[0] || validSamples[0] || null;
  const p50 = percentile(readyValues, 0.5);
  const p75 = percentile(readyValues, 0.75);

  const metrics = useMemo<Metric[]>(
    () => [
      {
        label: "Latest Ready",
        value: latest?.ready_source === "explicit" ? formatDuration(latest.ready_ms) : "No proof yet",
        helper: latest?.route || "Navigate an authoritative route",
      },
      {
        label: "Session median",
        value: formatDuration(p50),
        helper: `${readyValues.length} fresh authoritative sample${readyValues.length === 1 ? "" : "s"}`,
      },
      {
        label: "Session p75",
        value: formatDuration(p75),
        helper: "Fresh initial/internal/reload samples only",
      },
      {
        label: "Live round trip",
        value: checkMs == null ? "—" : formatDuration(checkMs),
        helper: checkBuild ? `Build ${checkBuild}` : "Browser → AoE2WAR → browser",
      },
    ],
    [checkBuild, checkMs, latest, p50, p75, readyValues.length],
  );

  const chart = useMemo<ChartModel>(() => {
    const chronological = [...chartSamples].reverse().slice(-20);
    const ready = chronological.map((sample) => sample.ready_ms);
    const ttfb = chronological.map((sample) => sample.ttfb_ms);
    const lcp = chronological.map((sample) => sample.lcp_ms);
    const numeric = [...ready, ...ttfb, ...lcp].filter(
      (value): value is number => typeof value === "number" && Number.isFinite(value),
    );
    const maxValue = Math.max(1000, ...numeric);
    return {
      readyPoints: chartPolyline(ready, maxValue),
      ttfbPoints: chartPolyline(ttfb, maxValue),
      lcpPoints: chartPolyline(lcp, maxValue),
      maxValue,
    };
  }, [chartSamples]);

  const sendReport = useCallback(async () => {
    if (!latest) return;
    setReporting(true);
    setReportMessage("");
    try {
      const response = await fetch("/api/speed/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          sample_id: latest.sample_id,
          route: latest.route,
          recent_sample_ids: samples.slice(0, 20).map((sample) => sample.sample_id),
          diagnostic_snapshot: {
            ready_ms: latest.ready_ms,
            ttfb_ms: latest.ttfb_ms,
            lcp_ms: latest.lcp_ms,
            inp_ms: latest.inp_ms,
            cls: latest.cls,
            slowest_api_path: latest.slowest_api_path,
            slowest_api_ms: latest.slowest_api_ms,
            top_resources: latest.details?.top_resources || [],
            top_api_requests: latest.details?.top_api_requests || [],
          },
        }),
      });
      const payload = (await response.json().catch(() => null)) as { report_id?: string; detail?: string } | null;
      if (!response.ok) throw new Error(payload?.detail || "Could not send Speed Report");
      setReportMessage(payload?.report_id ? `Speed Report sent · ${payload.report_id}` : "Speed Report sent");
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : "Could not send Speed Report");
    } finally {
      setReporting(false);
    }
  }, [latest, samples]);

  const shared: ViewProps = {
    viewMode,
    setViewMode,
    metrics,
    samples,
    latest,
    checking,
    reporting,
    reportMessage,
    runLiveCheck,
    sendReport,
  };

  if (viewMode === "advanced") return <AdvancedView {...shared} />;
  if (viewMode === "extreme") return <ExtremeView {...shared} chart={chart} />;
  return <BasicView {...shared} />;
}
