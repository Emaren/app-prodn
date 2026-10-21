import Link from "next/link";
import {
  Activity,
  ArrowUpRight,
  Clock3,
  Database,
  FileCheck2,
  Globe2,
  RadioTower,
  ShieldCheck,
  Signal,
  Waypoints,
} from "lucide-react";

import type { PublicTrafficPoint } from "@/lib/publicTraffic";

type Props = {
  points: PublicTrafficPoint[];
  lastPublishedDay: string | null;
  lagDays: number | null;
};

const originalSeal = {
  from: "2026-06-11",
  through: "2026-10-19",
  days: 131,
  sourceRows: 21_618_093,
  digest: "84150e4921197efd925fa2d9abccee37154d45a68b6f72e25df57dfc4e2d07b4",
  auditedAt: "2026-10-21",
} as const;

const visitorExhibits = [
  {
    title: "TOP FIVE COUNTRIES",
    subtitle: "Human-qualified unique IP estimates",
    label: "Geographic ranking",
    Icon: Globe2,
    color: "text-sky-300",
    border: "border-sky-300/20",
    background: "from-sky-400/[0.11]",
    why: "Country coverage and global IP classification must be independently certified before publishing a ranking.",
  },
  {
    title: "TOP FIVE PAGES",
    subtitle: "Canonical human page sessions",
    label: "Page ranking",
    Icon: Waypoints,
    color: "text-amber-300",
    border: "border-amber-300/20",
    background: "from-amber-400/[0.11]",
    why: "Real page-session attribution must exclude assets, bots, authenticated/private routes and repeated requests.",
  },
  {
    title: "OBSERVED TIME ON SITE",
    subtitle: "Visible, measured engagement",
    label: "Engaged time",
    Icon: Clock3,
    color: "text-emerald-300",
    border: "border-emerald-300/20",
    background: "from-emerald-400/[0.11]",
    why: "Browser visibility and dwell events exist, but no verified public session-duration aggregate is published.",
  },
] as const;

function compact(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-CA");
}

function miniTrend(points: PublicTrafficPoint[], metric: keyof PublicTrafficPoint["values"]): string | null {
  if (points.length < 2) return null;
  const values = points.slice(-30).map((point) => point.values[metric]);
  const peak = Math.max(1, ...values);
  return values.map((value, index) =>
    String((index / Math.max(values.length - 1, 1)) * 160) + "," + String(38 - (value / peak) * 32)
  ).join(" ");
}

function Trend({
  points,
  metric,
  label,
  color,
}: {
  points: PublicTrafficPoint[];
  metric: keyof PublicTrafficPoint["values"];
  label: string;
  color: string;
}) {
  const path = miniTrend(points, metric);
  if (!path) {
    return <div className="h-11 text-[10px] text-slate-500">Not enough certified days for a trend.</div>;
  }
  return (
    <svg viewBox="0 0 160 44" role="img" aria-label={label + ", last " + String(Math.min(points.length, 30)) + " published UTC days"} className="h-11 w-full overflow-visible" preserveAspectRatio="none">
      <line x1="0" y1="39" x2="160" y2="39" stroke="rgba(148,163,184,0.15)" strokeWidth="1" />
      <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={path} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Strictly a public, read-only TRAFFIC subsystem of the separate Kingdom Sensors.
 * The original /traffic chart and /kingdom-sensors are deliberately untouched.
 * A missing aggregate is NOT zero; no country, path, dwell or login data is guessed.
 */
export default function TrafficSensors({ points, lastPublishedDay, lagDays }: Props) {
  const available = points.length > 0;
  const totals = available
    ? points.reduce(
        (acc, point) => ({
          totalTraffic: acc.totalTraffic + point.values.totalTraffic,
          suspectedHuman: acc.suspectedHuman + point.values.suspectedHuman,
          confirmedHuman: acc.confirmedHuman + point.values.confirmedHuman,
        }),
        { totalTraffic: 0, suspectedHuman: 0, confirmedHuman: 0 },
      )
    : null;
  const validOriginalSeal = points.length >= originalSeal.days &&
    points[0]?.date === originalSeal.from &&
    points[originalSeal.days - 1]?.date === originalSeal.through;
  const metrics = [
    { label: "TOTAL TRAFFIC", key: "totalTraffic", count: totals?.totalTraffic ?? null, color: "#f5c65b", text: "text-amber-200", description: "Canonical page sessions" },
    { label: "POTENTIAL HUMANS", key: "suspectedHuman", count: totals?.suspectedHuman ?? null, color: "#5aa9ff", text: "text-blue-300", description: "Potential-human page sessions" },
    { label: "CONFIRMED HUMANS", key: "confirmedHuman", count: totals?.confirmedHuman ?? null, color: "#42f1b5", text: "text-emerald-300", description: "Confirmed-human page sessions" },
  ] as const;

  const stages = [
    { label: "ACCESS", explanation: "Web requests", Icon: RadioTower },
    { label: "INGEST", explanation: "Independent intake", Icon: Signal },
    { label: "EVIDENCE", explanation: "Durable source", Icon: Database },
    { label: "CLASSIFY", explanation: "Global IP behaviour", Icon: ShieldCheck },
    { label: "SESSIONS", explanation: "Canonical replay", Icon: Activity },
    { label: "SEAL", explanation: "Completed UTC days", Icon: FileCheck2 },
  ] as const;

  return (
    <div className="mt-6 space-y-7 pb-16 sm:mt-8">
      <section aria-labelledby="traffic-intelligence-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] font-bold tracking-[0.32em] text-sky-300/80">TRAFFIC OBSERVATORY / VISITOR INTELLIGENCE</div>
            <h2 id="traffic-intelligence-heading" className="mt-2 text-2xl font-black tracking-tight text-slate-100 sm:text-3xl">The people behind the signal.</h2>
          </div>
          <div className="rounded-full border border-sky-300/20 bg-sky-300/[0.055] px-3 py-1.5 font-mono text-[10px] tracking-widest text-sky-200">
            VERIFIED AGGREGATES ONLY
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {visitorExhibits.map(({ title, subtitle, label, Icon, color, border, background, why }) => (
            <article key={title} className={"relative min-h-[245px] overflow-hidden rounded-[1.65rem] border bg-gradient-to-br to-[#060c15] p-5 shadow-[0_18px_60px_rgba(0,0,0,0.25)] sm:p-6 " + border + " " + background}>
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full border border-white/[0.045] shadow-[0_0_70px_rgba(255,255,255,0.025)]" aria-hidden="true" />
              <div className="relative flex items-center gap-3">
                <div className={"grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.045] " + color}>
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="font-mono text-[11px] font-bold tracking-[0.2em] text-white">{title}</h3>
                  <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
                </div>
              </div>
              <div className="relative mt-7 flex items-end justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
                  <div className="mt-2 font-mono text-5xl font-semibold leading-none text-slate-300" aria-label="Not yet verified">—</div>
                </div>
                <span className="rounded-md border border-amber-300/20 bg-amber-300/[0.055] px-2 py-1 font-mono text-[9px] tracking-wider text-amber-200">
                  NOT CERTIFIED
                </span>
              </div>
              <p className="relative mt-4 max-w-[48ch] text-[11px] leading-relaxed text-slate-400">{why}</p>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="traffic-sensors-heading" className="overflow-hidden rounded-[1.9rem] border border-sky-300/15 bg-[linear-gradient(140deg,rgba(16,35,51,0.90),rgba(2,8,15,0.98)_54%,rgba(27,23,12,0.78))] shadow-[0_18px_80px_rgba(0,0,0,0.35)]">
        <details open className="group">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] px-5 py-5 marker:content-none sm:px-7 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-emerald-300/20 bg-emerald-300/[0.06]">
                <Activity className="h-5 w-5 text-emerald-300" aria-hidden="true" />
              </div>
              <div>
                <div className="font-mono text-[10px] tracking-[0.24em] text-emerald-300/70">KINGDOM SENSORS / TRAFFIC SUBSYSTEM</div>
                <h2 id="traffic-sensors-heading" className="mt-1 text-xl font-black tracking-tight text-white sm:text-2xl">Traffic Sensors</h2>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-emerald-300/20 bg-emerald-300/[0.05] px-3 py-1.5 font-mono text-[10px] tracking-wider text-emerald-200">
                HISTORICAL ARCHIVE / READ ONLY
              </span>
              <span className="font-mono text-xs text-slate-400 group-open:hidden">EXPAND +</span>
              <span className="font-mono text-xs text-slate-400 hidden group-open:inline">COLLAPSE −</span>
            </div>
          </summary>

          <div className="space-y-6 p-4 sm:p-6 lg:p-7">
            <div className="grid gap-3 md:grid-cols-3">
              {metrics.map(({ label, key, count, color, text, description }) => (
                <div key={key} className="min-w-0 rounded-[1.2rem] border border-white/[0.07] bg-black/25 px-4 pb-3 pt-4 sm:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] tracking-[0.15em] text-slate-400">{label}</span>
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color, boxShadow: "0 0 14px " + color }} aria-hidden="true" />
                  </div>
                  <div className={"mt-3 font-mono text-[clamp(1.8rem,3.6vw,3rem)] font-semibold leading-none tabular-nums " + text}>{compact(count)}</div>
                  <div className="mt-2 text-[11px] text-slate-500">{description}</div>
                  <div className="mt-4">
                    <Trend points={points} metric={key} label={label} color={color} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="font-mono text-[10px] tracking-[0.18em] text-slate-400">COMPLETED UTC DAYS</div>
                <div className="mt-2 font-mono text-3xl font-semibold text-white tabular-nums">{available ? compact(points.length) : "—"}</div>
                <div className="mt-1 text-[11px] text-slate-500">{available ? points[0]?.date + " → " + points.at(-1)?.date : "Publication not available"}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="font-mono text-[10px] tracking-[0.18em] text-slate-400">MOST RECENT PUBLISHED DAY</div>
                <div className="mt-2 font-mono text-2xl font-semibold text-white tabular-nums">{lastPublishedDay ?? "—"}</div>
                <div className={"mt-1 text-[11px] " + (lagDays !== null && lagDays > 2 ? "text-amber-300" : "text-slate-500")}>
                  {lagDays === null ? "Freshness cannot be checked" : lagDays > 2 ? "Archive delayed · " + lagDays + " UTC days behind today" : "Completed-day archive · " + lagDays + " UTC day lag"}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="font-mono text-[10px] tracking-[0.18em] text-slate-400">ORIGINAL HISTORY SEAL</div>
                <div className="mt-2 font-mono text-3xl font-semibold text-emerald-300">{validOriginalSeal ? "131 DAYS" : "—"}</div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {validOriginalSeal ? "Jun 11 – Oct 19 · original publication window" : "Original seal dates not present in current response"}
                </div>
              </div>
            </div>

            <div className="rounded-[1.35rem] border border-white/[0.075] bg-black/20 px-4 py-5 sm:px-6">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-mono text-[11px] font-bold tracking-[0.21em] text-sky-200">TRAFFIC EVIDENCE PATH</h3>
                <span className="font-mono text-[9px] tracking-wider text-slate-500">ARCHITECTURE · NOT LIVE DEVICE STATUS</span>
              </div>
              <ol className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {stages.map(({ label, explanation, Icon }, index) => (
                  <li key={label} className="relative min-w-0 rounded-xl border border-sky-300/10 bg-sky-300/[0.035] p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] text-sky-300/70">0{index + 1}</span>
                      <Icon className="h-4 w-4 text-sky-200/80" aria-hidden="true" />
                    </div>
                    <div className="mt-3 font-mono text-[10px] font-bold tracking-[0.12em] text-slate-100">{label}</div>
                    <div className="mt-1 text-[10px] text-slate-500">{explanation}</div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-white/[0.07] pt-4 text-[11px] text-slate-400">
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                <span>Original source audit: <strong className="font-mono font-medium text-slate-200">{originalSeal.sourceRows.toLocaleString("en-CA")}</strong> request rows, not visitors</span>
                <span>Original seal: <code className="text-slate-300">{originalSeal.digest.slice(0, 12)}</code>…</span>
                <span>Snapshot: {originalSeal.auditedAt}</span>
              </div>
              <Link href="/kingdom-sensors" className="inline-flex items-center gap-1 text-sky-300 underline-offset-4 hover:underline">
                Kingdom-wide Sensors <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
