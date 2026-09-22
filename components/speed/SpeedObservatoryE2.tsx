"use client";

import {
  Activity,
  Boxes,
  CircleGauge,
  Crosshair,
  Database,
  Gauge,
  Network,
  Orbit,
  RadioTower,
  ScanLine,
  Send,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Waves,
  Zap,
} from "lucide-react";
import { useMemo } from "react";

import { SPEED_OS_SNAPSHOT } from "@/lib/speed/observatorySnapshot";
import type { SpeedSample } from "@/lib/speed/types";

import styles from "./SpeedObservatoryE2.module.css";

export type SpeedE2Props = {
  samples: SpeedSample[];
  latest: SpeedSample | null;
  sessionP50: number | null;
  sessionP75: number | null;
  checkMs: number | null;
  checkBuild: string;
  checking: boolean;
  reporting: boolean;
  reportMessage: string;
  runLiveCheck: () => Promise<void>;
  sendReport: () => Promise<void>;
};

type Accent = "cyan" | "blue" | "violet" | "green" | "amber" | "rose";

const ACCENTS: Record<Accent, { border: string; bg: string; text: string; glow: string }> = {
  cyan: { border: "border-cyan-300/25", bg: "bg-cyan-300/[0.055]", text: "text-cyan-200", glow: "shadow-cyan-400/10" },
  blue: { border: "border-blue-400/25", bg: "bg-blue-400/[0.055]", text: "text-blue-300", glow: "shadow-blue-500/10" },
  violet: { border: "border-violet-400/25", bg: "bg-violet-400/[0.055]", text: "text-violet-300", glow: "shadow-violet-500/10" },
  green: { border: "border-emerald-300/25", bg: "bg-emerald-300/[0.055]", text: "text-emerald-300", glow: "shadow-emerald-500/10" },
  amber: { border: "border-amber-300/25", bg: "bg-amber-300/[0.055]", text: "text-amber-300", glow: "shadow-amber-500/10" },
  rose: { border: "border-rose-400/25", bg: "bg-rose-400/[0.055]", text: "text-rose-300", glow: "shadow-rose-500/10" },
};

function ms(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${value.toFixed(digits)}ms`;
}

function compactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return Math.round(value).toLocaleString();
}

function navLabel(kind: SpeedSample["navigation_kind"]) {
  if (kind === "initial") return "INITIAL";
  if (kind === "internal") return "IN-SITE";
  if (kind === "reload") return "RELOAD";
  if (kind === "back_forward") return "RESTORE";
  return String(kind || "NAV").toUpperCase();
}

function PanelTitle({ icon: Icon, title, right, accent = "cyan" }: { icon?: typeof Activity; title: string; right?: React.ReactNode; accent?: Accent }) {
  const tone = ACCENTS[accent];
  return (
    <div className="flex min-h-8 items-center justify-between gap-4 border-b border-white/[0.055] pb-3">
      <div className="flex items-center gap-2.5">
        {Icon ? <Icon className={`h-4 w-4 ${tone.text}`} strokeWidth={1.7} /> : null}
        <h2 className={`font-mono text-[11px] font-semibold uppercase tracking-[0.22em] ${tone.text}`}>{title}</h2>
      </div>
      {right ? <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">{right}</div> : null}
    </div>
  );
}

function MetricTile({ label, value, sub, accent = "cyan", icon: Icon = Gauge }: { label: string; value: string; sub?: React.ReactNode; accent?: Accent; icon?: typeof Activity }) {
  const tone = ACCENTS[accent];
  return (
    <div className={`${styles.panel} min-h-[132px] rounded-[22px] p-4 sm:p-5`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${tone.text}`} strokeWidth={1.65} />
        <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-slate-500">{label}</span>
      </div>
      <div className={`mt-4 font-mono text-[clamp(1.75rem,2.3vw,2.7rem)] font-semibold leading-none ${tone.text} ${styles.metricGlow}`}>{value}</div>
      {sub ? <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">{sub}</div> : null}
    </div>
  );
}

function SignalPill({ label, value, accent = "cyan" }: { label: string; value: string; accent?: Accent }) {
  const tone = ACCENTS[accent];
  return (
    <div className={`rounded-xl border ${tone.border} ${tone.bg} px-3 py-2`}>
      <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-xs font-semibold ${tone.text}`}>{value}</div>
    </div>
  );
}

function BeforeAfterBars() {
  const c = SPEED_OS_SNAPSHOT.cachedCohort;
  const rows = [
    { label: "TTFB p50", before: c.beforeTtfbP50Ms, after: c.afterTtfbP50Ms, reduction: c.ttfbReductionPct },
    { label: "TOTAL p50", before: c.beforeTotalP50Ms, after: c.afterTotalP50Ms, reduction: c.totalReductionPct },
  ];
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-5`}>
      <PanelTitle icon={Zap} title="Edge Velocity / Before → After" right={`${c.speedup.toFixed(1)}×`} accent="green" />
      <div className="mt-6 grid gap-7 sm:grid-cols-2">
        {rows.map((row) => {
          const max = Math.max(row.before, row.after);
          return (
            <div key={row.label}>
              <div className="mb-4 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em]">
                <span className="text-slate-500">{row.label}</span>
                <span className="text-emerald-300">−{row.reduction.toFixed(1)}%</span>
              </div>
              <div className="flex h-44 items-end justify-center gap-8 border-b border-cyan-300/10 bg-[linear-gradient(to_top,rgba(34,211,238,0.035),transparent)] px-5">
                {[
                  { tag: "PRE", value: row.before, color: "from-violet-500/40 to-violet-300/80 text-violet-300" },
                  { tag: "EDGE", value: row.after, color: "from-cyan-500/40 to-cyan-200 text-cyan-200" },
                ].map((bar) => (
                  <div key={bar.tag} className="flex h-full w-24 flex-col items-center justify-end">
                    <span className={`mb-2 font-mono text-xs font-semibold ${bar.color.split(" ").at(-1)}`}>{ms(bar.value)}</span>
                    <div className={`w-full rounded-t-md bg-gradient-to-t ${bar.color.split(" ").slice(0,2).join(" ")} shadow-[0_0_24px_rgba(34,211,238,0.12)]`} style={{ height: `${Math.max(14, (bar.value / max) * 112)}px` }} />
                    <span className="mt-2 font-mono text-[9px] tracking-[0.2em] text-slate-600">{bar.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CohortRing() {
  const r = SPEED_OS_SNAPSHOT.routes;
  const edgePct = (r.edgeCached / r.audited) * 100;
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-3`}>
      <PanelTitle icon={Orbit} title="Route Cohorts" right={`${r.audited} audited`} accent="violet" />
      <div className="mt-5 grid grid-cols-[140px_1fr] items-center gap-5">
        <div
          className="relative mx-auto h-[138px] w-[138px] rounded-full shadow-[0_0_38px_rgba(34,211,238,0.12)]"
          style={{ background: `conic-gradient(rgb(34 211 238) 0 ${edgePct}%, rgb(37 99 235 / .44) ${edgePct}% 100%)` }}
        >
          <div className="absolute inset-[13px] flex flex-col items-center justify-center rounded-full border border-cyan-200/10 bg-[#030811]">
            <span className="font-mono text-4xl font-semibold text-cyan-200">{r.audited}</span>
            <span className="mt-1 font-mono text-[8px] uppercase tracking-[0.22em] text-slate-600">ROUTES</span>
          </div>
        </div>
        <div className="space-y-3">
          <CohortRow color="bg-cyan-300" count={r.edgeCached} label="EDGE" />
          <CohortRow color="bg-blue-500" count={r.dynamic} label="DYNAMIC" />
          <CohortRow color="bg-amber-300" count={r.blockedSharedCache} label="BLOCKED" />
          <CohortRow color="bg-violet-400" count={r.review} label="REVIEW" />
        </div>
      </div>
    </div>
  );
}

function CohortRow({ color, count, label }: { color: string; count: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-white/[0.045] pb-2 font-mono text-[10px]">
      <span className={`h-1.5 w-5 rounded-full ${color} shadow-[0_0_10px_currentColor]`} />
      <span className="text-slate-500">{label}</span>
      <span className="ml-auto text-slate-200">{count}</span>
    </div>
  );
}

function CacheIntegrity() {
  const e = SPEED_OS_SNAPSHOT.edge;
  const signals: Array<[string, string, Accent]> = [
    ["ROUTES HIT", `${e.hitRoutes}/${e.eligibleRoutes}`, "green" as Accent],
    ["COOKIE BYPASS", String(e.cookieBypasses), "cyan" as Accent],
    ["COOKIE LEAKS", String(e.cookieLeaks), "green" as Accent],
    ["RSC LEAKS", String(e.rscLeaks), "green" as Accent],
    ["API", e.apiMode, "violet" as Accent],
    ["EDGE TTL", `${e.ttlSeconds}s`, "amber" as Accent],
    ["VERIFY", e.verification, "green" as Accent],
    ["ROLLBACK", e.rollbackRequired ? "ARMED" : "CLEAR", e.rollbackRequired ? "rose" as Accent : "green" as Accent],
  ];
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-4`}>
      <PanelTitle icon={ShieldCheck} title="Cache Integrity" right="sealed" accent="green" />
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
        {signals.map(([label, value, accent]) => <SignalPill key={label} label={label} value={value} accent={accent} />)}
      </div>
    </div>
  );
}

function LatencyLadder() {
  const s = SPEED_OS_SNAPSHOT;
  const stages = [
    { label: "ORIGIN", value: s.delivery.originMs, accent: "emerald", width: 4 },
    { label: "EDGE HIT", value: s.cachedCohort.afterTtfbP50Ms, accent: "cyan", width: 22 },
    { label: "WARM ESTATE", value: s.fullEstate.warmTtfbP50Ms, accent: "blue", width: 64 },
    { label: "PUBLIC SEAM", value: s.delivery.publicKeepAliveMs, accent: "violet", width: 58 },
    { label: "RAW ESTATE", value: s.fullEstate.ttfbP50Ms, accent: "amber", width: 88 },
  ];
  const color: Record<string, string> = {
    emerald: "bg-emerald-300 text-emerald-300",
    cyan: "bg-cyan-300 text-cyan-300",
    blue: "bg-blue-400 text-blue-300",
    violet: "bg-violet-400 text-violet-300",
    amber: "bg-amber-300 text-amber-300",
  };
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-5`}>
      <PanelTitle icon={Network} title="Latency Ladder" right={`${s.delivery.seamMultiple.toFixed(1)}× seam`} accent="cyan" />
      <div className="mt-6 space-y-4">
        {stages.map((stage) => (
          <div key={stage.label} className="grid grid-cols-[88px_1fr_76px] items-center gap-3">
            <span className="font-mono text-[9px] tracking-[0.17em] text-slate-600">{stage.label}</span>
            <div className="h-1.5 rounded-full bg-white/[0.04]">
              <div className={`h-full rounded-full ${color[stage.accent]} shadow-[0_0_12px_currentColor]`} style={{ width: `${stage.width}%` }} />
            </div>
            <span className={`text-right font-mono text-xs ${color[stage.accent].split(" ")[1]}`}>{ms(stage.value, 2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2">
        <SignalPill label="WARM GAP" value={ms(s.delivery.warmGapMs)} accent="violet" />
        <SignalPill label="CONNECTION SETUP" value={ms(s.delivery.publicConnectionSetupMs)} accent="amber" />
        <SignalPill label="EDGE p95" value={ms(s.cachedCohort.afterTtfbP95Ms)} accent="cyan" />
      </div>
    </div>
  );
}

function Distribution() {
  const rows = SPEED_OS_SNAPSHOT.routeDistribution;
  const max = Math.max(...rows.map((row) => row.count));
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-3`}>
      <PanelTitle icon={Waves} title="Warm TTFB Spectrum" right={`${SPEED_OS_SNAPSHOT.routes.audited} routes`} accent="blue" />
      <div className="mt-6 flex h-48 items-end gap-3 border-b border-blue-300/10 px-1">
        {rows.map((row, index) => (
          <div key={row.label} className="flex h-full flex-1 flex-col items-center justify-end">
            <span className={`mb-2 font-mono text-xs ${index === 0 ? "text-cyan-200" : "text-blue-300"}`}>{row.count}</span>
            <div className={`w-full max-w-10 rounded-t-sm bg-gradient-to-t ${index === 0 ? "from-cyan-600/30 to-cyan-200" : index >= 4 ? "from-fuchsia-700/30 to-fuchsia-400" : "from-blue-700/30 to-blue-300"} shadow-[0_0_18px_rgba(59,130,246,0.12)]`} style={{ height: `${Math.max(3, (row.count / max) * 132)}px` }} />
            <span className="mt-2 whitespace-nowrap font-mono text-[8px] text-slate-600">{row.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RouteStack({ fast = false }: { fast?: boolean }) {
  const rows = fast ? SPEED_OS_SNAPSHOT.fastEdgeRoutes : SPEED_OS_SNAPSHOT.hotRoutes;
  const display = rows.slice(0, fast ? 8 : 8);
  const max = Math.max(...display.map((row) => fast ? row.ttfbMs : row.totalMs));
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-4`}>
      <PanelTitle icon={fast ? Zap : Crosshair} title={fast ? "Fastest Edge Hits" : "Hot Route Stack"} right={fast ? "warm TTFB" : "warm total"} accent={fast ? "green" : "rose"} />
      <div className="mt-4 space-y-2.5">
        {display.map((row, index) => {
          const value = fast ? row.ttfbMs : row.totalMs;
          const pct = Math.max(8, (value / max) * 100);
          return (
            <div key={row.route} className="grid grid-cols-[22px_minmax(0,1fr)_62px] items-center gap-2.5">
              <span className="font-mono text-[9px] text-slate-700">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`truncate font-mono text-[10px] ${fast ? "text-emerald-200/80" : "text-slate-300"}`}>{row.route}</span>
                </div>
                <div className="mt-1 h-[3px] rounded-full bg-white/[0.035]">
                  <div className={`h-full rounded-full ${fast ? "bg-emerald-300 shadow-[0_0_9px_rgba(52,211,153,.6)]" : "bg-gradient-to-r from-violet-500 to-rose-400 shadow-[0_0_9px_rgba(244,63,94,.35)]"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
              <span className={`text-right font-mono text-[10px] ${fast ? "text-emerald-300" : "text-rose-300"}`}>{ms(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SessionTrace({ samples }: { samples: SpeedSample[] }) {
  const trace = useMemo(() => {
    const rows = [...samples].filter((sample) => sample.valid_for_aggregation && !sample.visibility_tainted).reverse().slice(-18);
    const values = rows.flatMap((sample) => [sample.ready_ms, sample.ttfb_ms, sample.lcp_ms]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const max = Math.max(100, ...values);
    const make = (key: "ready_ms" | "ttfb_ms" | "lcp_ms") => rows.map((row, index) => {
      const value = row[key];
      if (typeof value !== "number" || !Number.isFinite(value)) return null;
      const x = 16 + (index / Math.max(1, rows.length - 1)) * 968;
      const y = 230 - Math.min(value / max, 1) * 200;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(" ");
    return { rows, max, ready: make("ready_ms"), ttfb: make("ttfb_ms"), lcp: make("lcp_ms") };
  }, [samples]);

  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-8`}>
      <PanelTitle icon={Activity} title="Browser Signal Field" right={`${trace.rows.length} samples`} accent="amber" />
      <div className="mt-4 flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.16em]">
        <span className="text-amber-300">● READY</span>
        <span className="text-blue-300">● TTFB</span>
        <span className="text-cyan-300">● LCP</span>
        <span className="ml-auto text-slate-600">scale {ms(trace.max)}</span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-cyan-300/[0.06] bg-black/25">
        <svg viewBox="0 0 1000 250" className="h-[230px] w-full" preserveAspectRatio="none" aria-label="Browser Ready, TTFB and LCP trace">
          <defs>
            <filter id="e2-glow"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          {[30,80,130,180,230].map((y) => <line key={y} x1="0" x2="1000" y1={y} y2={y} stroke="rgba(148,163,184,.06)" strokeWidth="1" />)}
          {trace.ready ? <polyline points={trace.ready} fill="none" stroke="rgb(251 191 36)" strokeWidth="2.3" vectorEffect="non-scaling-stroke" filter="url(#e2-glow)" /> : null}
          {trace.ttfb ? <polyline points={trace.ttfb} fill="none" stroke="rgb(96 165 250)" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
          {trace.lcp ? <polyline points={trace.lcp} fill="none" stroke="rgb(34 211 238)" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
      </div>
    </div>
  );
}

function BrowserPulse({ props }: { props: SpeedE2Props }) {
  const { latest, sessionP50, sessionP75, checkMs, checkBuild, samples } = props;
  const valid = samples.filter((sample) => sample.valid_for_aggregation && !sample.visibility_tainted);
  const last = latest;
  const tiles = [
    { label: "LATEST READY", value: ms(last?.ready_ms), accent: "amber" as Accent },
    { label: "SESSION p50", value: ms(sessionP50), accent: "cyan" as Accent },
    { label: "SESSION p75", value: ms(sessionP75), accent: "violet" as Accent },
    { label: "LIVE RTT", value: ms(checkMs), accent: "green" as Accent },
    { label: "LCP", value: ms(last?.lcp_ms), accent: "blue" as Accent },
    { label: "INP", value: ms(last?.inp_ms), accent: "green" as Accent },
    { label: "CLS", value: last?.cls == null ? "—" : last.cls.toFixed(3), accent: "amber" as Accent },
    { label: "TRANSFER", value: last?.transfer_bytes == null ? "—" : `${compactNumber(last.transfer_bytes)}B`, accent: "cyan" as Accent },
    { label: "RESOURCES", value: compactNumber(last?.resource_count), accent: "blue" as Accent },
    { label: "API CALLS", value: compactNumber(last?.api_request_count), accent: "violet" as Accent },
    { label: "LONG TASKS", value: compactNumber(last?.long_task_count), accent: "rose" as Accent },
    { label: "VALID", value: `${valid.length}/${samples.length}`, accent: "green" as Accent },
  ];
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-4`}>
      <PanelTitle icon={RadioTower} title="This Browser" right={checkBuild ? checkBuild.slice(-10) : "live"} accent="cyan" />
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
        {tiles.map((tile) => <SignalPill key={tile.label} label={tile.label} value={tile.value} accent={tile.accent} />)}
      </div>
    </div>
  );
}

function FlightRecorder({ samples }: { samples: SpeedSample[] }) {
  const rows = samples.slice(0, 14);
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-8`}>
      <PanelTitle icon={ScanLine} title="Flight Recorder" right={`${samples.length} in tab`} accent="blue" />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] font-mono text-[10px]">
          <thead className="border-b border-blue-300/10 text-left uppercase tracking-[0.17em] text-slate-600">
            <tr>
              <th className="py-3 pr-4 font-medium">Route</th>
              <th className="py-3 pr-4 font-medium">Nav</th>
              <th className="py-3 pr-4 font-medium">Ready</th>
              <th className="py-3 pr-4 font-medium">TTFB</th>
              <th className="py-3 pr-4 font-medium">LCP</th>
              <th className="py-3 pr-4 font-medium">Source</th>
              <th className="py-3 text-right font-medium">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.045]">
            {rows.length ? rows.map((sample) => (
              <tr key={sample.sample_id} className="text-slate-400 transition hover:bg-cyan-300/[0.025]">
                <td className="max-w-[260px] truncate py-2.5 pr-4 text-slate-200">{sample.route}</td>
                <td className="py-2.5 pr-4">{navLabel(sample.navigation_kind)}</td>
                <td className="py-2.5 pr-4 text-amber-300">{ms(sample.ready_ms)}</td>
                <td className="py-2.5 pr-4 text-blue-300">{ms(sample.ttfb_ms)}</td>
                <td className="py-2.5 pr-4 text-cyan-300">{ms(sample.lcp_ms)}</td>
                <td className="py-2.5 pr-4 uppercase text-slate-600">{sample.ready_source}</td>
                <td className={`py-2.5 text-right ${sample.valid_for_aggregation && !sample.visibility_tainted ? "text-emerald-300" : "text-rose-300"}`}>
                  {sample.valid_for_aggregation && !sample.visibility_tainted ? "VALID" : "EXCLUDED"}
                </td>
              </tr>
            )) : (
              <tr><td colSpan={7} className="py-10 text-center uppercase tracking-[0.2em] text-slate-700">NO SIGNAL</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SystemMatrix() {
  const s = SPEED_OS_SNAPSHOT;
  const rows = [
    ["CLOUDFLARE EDGE", "ACTIVE", "green"],
    ["CACHE RULESET", "LIVE", "green"],
    ["EDGE AUTHORITY", "ACTIVE", "cyan"],
    ["API MODE", s.edge.apiMode, "violet"],
    ["SHARED-CACHE BLOCKS", `${s.routes.blockedSharedCache}`, "amber"],
    ["REVIEW QUEUE", `${s.routes.review}`, "violet"],
    ["READY COVERAGE", `${s.fullEstate.explicitReadyRoutes}/${s.routes.audited}`, "blue"],
    ["ROLLBACK", s.edge.rollbackRequired ? "REQUIRED" : "CLEAR", s.edge.rollbackRequired ? "rose" : "green"],
  ] as const;
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-4`}>
      <PanelTitle icon={Database} title="System Matrix" right="SpeedOS" accent="green" />
      <div className="mt-4 space-y-2">
        {rows.map(([label, value, accent]) => {
          const tone = ACCENTS[accent as Accent];
          return (
            <div key={label} className="flex items-center gap-3 border-b border-white/[0.045] py-2 font-mono text-[10px]">
              <span className={`${styles.pulseDot} h-1.5 w-1.5 rounded-full ${accent === "green" ? "bg-emerald-300" : accent === "cyan" ? "bg-cyan-300" : accent === "amber" ? "bg-amber-300" : accent === "rose" ? "bg-rose-300" : accent === "blue" ? "bg-blue-300" : "bg-violet-300"}`} />
              <span className="text-slate-500">{label}</span>
              <span className={`ml-auto ${tone.text}`}>{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RouteCounts() {
  const r = SPEED_OS_SNAPSHOT.routes;
  const rows = [
    ["AUDITED", r.audited, "cyan"],
    ["EDGE-CACHED", r.edgeCached, "green"],
    ["DYNAMIC", r.dynamic, "blue"],
    ["BLOCKED", r.blockedSharedCache, "amber"],
    ["REVIEW", r.review, "violet"],
    ["EXPLICIT READY", SPEED_OS_SNAPSHOT.fullEstate.explicitReadyRoutes, "cyan"],
  ] as const;
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-4`}>
      <PanelTitle icon={Boxes} title="Route Census" right="sealed snapshot" accent="violet" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        {rows.map(([label, value, accent]) => <SignalPill key={label} label={label} value={String(value)} accent={accent as Accent} />)}
      </div>
    </div>
  );
}

function ReportConsole({ props }: { props: SpeedE2Props }) {
  const { latest, checking, reporting, reportMessage, runLiveCheck, sendReport } = props;
  return (
    <div className={`${styles.panel} rounded-[24px] p-4 sm:p-5 lg:col-span-4`}>
      <PanelTitle icon={Send} title="Operator Signal" right={latest?.route || "—"} accent="amber" />
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void runLiveCheck()}
          disabled={checking}
          className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.055] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-200 transition hover:bg-cyan-300/[0.1] disabled:opacity-40"
        >
          {checking ? "PINGING" : "LIVE CHECK"}
        </button>
        <button
          type="button"
          onClick={() => void sendReport()}
          disabled={!latest || reporting}
          className="rounded-xl border border-amber-300/20 bg-amber-300/[0.055] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-amber-200 transition hover:bg-amber-300/[0.1] disabled:opacity-40"
        >
          {reporting ? "SENDING" : "SEND REPORT"}
        </button>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <SignalPill label="ROUTE" value={latest?.route || "—"} accent="cyan" />
        <SignalPill label="READY" value={ms(latest?.ready_ms)} accent="amber" />
      </div>
      {reportMessage ? <div className="mt-3 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-amber-300/70">{reportMessage}</div> : null}
    </div>
  );
}

function Hero() {
  const s = SPEED_OS_SNAPSHOT;
  return (
    <section className={`${styles.panel} relative rounded-[30px] p-5 sm:p-7 lg:p-8`}>
      <div className={styles.scan} />
      <div className={styles.heroHorizon} aria-hidden="true" />
      <div className="pointer-events-none absolute -left-20 top-[-120px] h-72 w-72 rounded-full bg-cyan-400/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute right-[-90px] top-[-100px] h-80 w-80 rounded-full bg-fuchsia-500/[0.06] blur-3xl" />
      <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.32em] text-cyan-300/65">
            <span className={`${styles.pulseDot} h-1.5 w-1.5 rounded-full bg-emerald-300`} />
            AOE2WAR / SPEEDOS / E2
          </div>
          <h1 className="mt-3 bg-gradient-to-r from-cyan-100 via-blue-100 to-violet-200 bg-clip-text font-mono text-[clamp(2.2rem,5vw,5.2rem)] font-semibold leading-[.92] tracking-[-0.065em] text-transparent">
            SPEED OBSERVATORY
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.2em] text-slate-600">
            <span>ROUTES {s.routes.audited}</span>
            <span>EDGE {s.routes.edgeCached}</span>
            <span>BUILD {s.buildVersion.slice(-10)}</span>
            <span>SEALED SNAPSHOT {s.capturedAt.slice(0,16)}Z</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-[520px] xl:justify-end">
          <SignalPill label="BENCHMARK" value="SEALED" accent="violet" />
          <SignalPill label="EDGE VERIFY" value="PASS" accent="green" />
          <SignalPill label="HIT RATE" value="27/27" accent="cyan" />
          <SignalPill label="COOKIE LEAK" value="0" accent="green" />
          <SignalPill label="RSC LEAK" value="0" accent="green" />
        </div>
      </div>
    </section>
  );
}

export default function SpeedObservatoryE2(props: SpeedE2Props) {
  const s = SPEED_OS_SNAPSHOT;
  return (
    <main
      className={`${styles.shell} min-h-screen px-3 py-4 text-slate-100 sm:px-5 sm:py-5 lg:px-6`}
      data-speed-view="e2"
      data-speed-version="e2"
    >
      <div className="mx-auto w-full max-w-[1840px]">
        <Hero />

        <section className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <MetricTile label="CACHED TTFB p50" value={ms(s.cachedCohort.afterTtfbP50Ms)} sub={<><span className="line-through opacity-50">{ms(s.cachedCohort.beforeTtfbP50Ms)}</span> <span className="ml-2 text-emerald-300">−{s.cachedCohort.ttfbReductionPct}%</span></>} accent="cyan" icon={Zap} />
          <MetricTile label="CACHED TOTAL p50" value={ms(s.cachedCohort.afterTotalP50Ms)} sub={<><span className="line-through opacity-50">{ms(s.cachedCohort.beforeTotalP50Ms)}</span> <span className="ml-2 text-emerald-300">−{s.cachedCohort.totalReductionPct}%</span></>} accent="green" icon={TimerReset} />
          <MetricTile label="EDGE SPEEDUP" value={`${s.cachedCohort.speedup.toFixed(1)}×`} sub="PERSISTENT COHORT" accent="violet" icon={Sparkles} />
          <MetricTile label="EDGE HIT RATE" value={`${s.edge.hitRoutes}/${s.edge.eligibleRoutes}`} sub="100% VERIFIED" accent="green" icon={Crosshair} />
          <MetricTile label="DELIVERY SEAM" value={`${s.delivery.seamMultiple.toFixed(1)}×`} sub={`${ms(s.delivery.publicKeepAliveMs)} / ${ms(s.delivery.originMs, 2)}`} accent="amber" icon={Network} />
          <MetricTile label="FULL ESTATE p50" value={ms(s.fullEstate.ttfbP50Ms)} sub={`${s.routes.audited} ROUTES · RAW`} accent="blue" icon={CircleGauge} />
        </section>

        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          <BeforeAfterBars />
          <CohortRing />
          <CacheIntegrity />
          <Distribution />
          <LatencyLadder />
          <RouteStack />
          <RouteStack fast />
          <SessionTrace samples={props.samples} />
          <BrowserPulse props={props} />
          <FlightRecorder samples={props.samples} />
          <SystemMatrix />
          <RouteCounts />
          <ReportConsole props={props} />
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-cyan-300/[0.07] px-1 pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-slate-700">
          <span>SEALED SNAPSHOT · {s.releaseSha.slice(0,12)} / {s.buildVersion}</span>
          <span className="text-cyan-300/40">MEASURE · OPTIMIZE · CONQUER</span>
        </div>
      </div>
    </main>
  );
}
