import Image from "next/image";
import type { ReactNode } from "react";

export type PulsePoint = {
  index: number;
  pressure: number;
  priceUsd: number;
};

export type PulsePayload = {
  ok: boolean;
  updatedAt?: string;
  poolId?: string;
  poolUrl?: string;
  source?: string;
  pairLabel?: string;
  priceUsd?: number;
  reserveWolo?: number;
  reserveUsdc?: number;
  liquidityUsd?: number;
  depthCurve?: PulsePoint[];
  detail?: string;
};

export type MovedPayload = {
  ok?: boolean;
  windowHours?: number;
  totalWolo?: number;
  transferCount?: number;
};

type Props = {
  pulse: PulsePayload | null;
  moved: MovedPayload | null;
};

function formatUsd(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const actual = value ?? 0;

  if (actual < 0.01) {
    return `$${actual.toLocaleString(undefined, {
      minimumFractionDigits: 5,
      maximumFractionDigits: 6,
    })}`;
  }

  return `$${actual.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}`;
}

function formatNumber(value: number | null | undefined, digits = 2) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return (value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

function buildGraph(points?: PulsePoint[]) {
  const fallback: PulsePoint[] = [
    { index: 0, pressure: 0, priceUsd: 0.00016 },
    { index: 1, pressure: 18, priceUsd: 0.000142 },
    { index: 2, pressure: 35, priceUsd: 0.000128 },
    { index: 3, pressure: 52, priceUsd: 0.000116 },
    { index: 4, pressure: 70, priceUsd: 0.000106 },
    { index: 5, pressure: 88, priceUsd: 0.000097 },
    { index: 6, pressure: 100, priceUsd: 0.000091 },
  ];

  const source = points && points.length > 1 ? points : fallback;

  const width = 620;
  const height = 250;
  const left = 18;
  const right = 18;
  const top = 18;
  const bottom = 26;

  const prices = source.map((point) => point.priceUsd || 0);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;

  const coords = source.map((point, index) => {
    const x =
      left + (index / Math.max(source.length - 1, 1)) * (width - left - right);
    const normalized = ((point.priceUsd || 0) - min) / span;
    const y = height - bottom - normalized * (height - top - bottom);

    return { x, y };
  });

  const linePath = coords
    .map((coord, index) => `${index === 0 ? "M" : "L"} ${coord.x} ${coord.y}`)
    .join(" ");

  const areaPath = [
    `M ${coords[0].x} ${height - bottom}`,
    ...coords.map((coord) => `L ${coord.x} ${coord.y}`),
    `L ${coords[coords.length - 1].x} ${height - bottom}`,
    "Z",
  ].join(" ");

  const focus = coords[Math.floor(coords.length / 2)] ?? coords[0];

  return { width, height, left, right, top, bottom, coords, linePath, areaPath, focus };
}

function TileStat({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: ReactNode;
  sublabel: ReactNode;
}) {
  return (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.03] px-3 py-3">
      <div className="text-[9px] uppercase tracking-[0.32em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 break-words text-[1.65rem] font-semibold leading-none text-white">
        {value}
      </div>
      <div className="mt-2 text-[11px] leading-4 text-slate-500">{sublabel}</div>
    </div>
  );
}

export default function WoloMarketPulseTile({ pulse, moved }: Props) {
  const graph = buildGraph(pulse?.depthCurve);
  const updatedLabel = pulse?.updatedAt
    ? new Date(pulse.updatedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })
    : "Live";

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(3,8,22,0.98),rgba(2,7,20,0.93))] p-4 shadow-[0_28px_70px_rgba(2,6,23,0.35)] flex min-h-[24.85rem] flex-col pt-4 pb-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.32em] text-slate-500">
            Market pulse
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#e6bc43]/35 bg-[#0b1325] shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]">
              <div className="flex h-10 w-10 items-center justify-center"><Image src="/legacy/wolo-logo-transparent.png" alt="WOLO" width={40} height={40} className="h-9 w-9 object-contain drop-shadow-[0_6px_16px_rgba(245,158,11,0.24)]" /></div>
            </div>
            <div>
              <div className="text-[1.05rem] font-semibold leading-none text-white">
                WOLO/USDC
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                Osmosis depth and live market shape
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium text-slate-300">
          Pool #{pulse?.poolId ?? "3461"}
        </div>
      </div>

      <div className="mt-2 rounded-[1.25rem] border border-white/10 bg-[#050b1b]/80 p-3">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.3em] text-slate-500">
          <span>Depth curve</span>
          <span>{updatedLabel}</span>
        </div>

        <div className="relative mt-3 overflow-hidden rounded-[1rem] border border-white/6 bg-[linear-gradient(180deg,rgba(5,11,27,0.96),rgba(4,9,22,0.92))]">
          <svg
            viewBox={`0 0 ${graph.width} ${graph.height}`}
            className="block h-[196px] w-full"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="wolo-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f3c84b" />
                <stop offset="55%" stopColor="#86efac" />
                <stop offset="100%" stopColor="#22d3ee" />
              </linearGradient>

              <linearGradient id="wolo-area-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(242,200,75,0.28)" />
                <stop offset="55%" stopColor="rgba(34,211,238,0.14)" />
                <stop offset="100%" stopColor="rgba(34,211,238,0.01)" />
              </linearGradient>
            </defs>

            {Array.from({ length: 5 }).map((_, index) => {
              const y =
                graph.top +
                ((graph.height - graph.top - graph.bottom) / 4) * index;

              return (
                <line
                  key={`h-${index}`}
                  x1={graph.left}
                  x2={graph.width - graph.right}
                  y1={y}
                  y2={y}
                  stroke="rgba(148,163,184,0.08)"
                  strokeWidth="1"
                />
              );
            })}

            {Array.from({ length: 6 }).map((_, index) => {
              const x =
                graph.left +
                ((graph.width - graph.left - graph.right) / 5) * index;

              return (
                <line
                  key={`v-${index}`}
                  x1={x}
                  x2={x}
                  y1={graph.top}
                  y2={graph.height - graph.bottom}
                  stroke="rgba(148,163,184,0.06)"
                  strokeWidth="1"
                />
              );
            })}

            <path d={graph.areaPath} fill="url(#wolo-area-gradient)" />
            <path
              d={graph.linePath}
              fill="none"
              stroke="url(#wolo-line-gradient)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            <circle
              cx={graph.focus.x}
              cy={graph.focus.y}
              r="6.5"
              fill="#f3c84b"
              stroke="rgba(15,23,42,0.95)"
              strokeWidth="2.5"
            />
          </svg>

          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex items-center justify-between px-3 text-[8px] uppercase tracking-[0.28em] text-slate-500">
            <span>Sell pressure</span>
            <span>Buy pressure</span>
          </div>
        </div>

        <div className="mt-auto grid gap-2 sm:grid-cols-2">
          <TileStat
            label="Spot"
            value={formatUsd(pulse?.priceUsd, 6)}
            sublabel="1 WOLO"
          />
          <TileStat
            label="Liquidity"
            value={formatUsd(pulse?.liquidityUsd, 2)}
            sublabel="Osmosis depth"
          />
          <TileStat
            label="24h moved"
            value={`${formatNumber(moved?.totalWolo, 2)} WOLO`}
            sublabel={`${formatNumber(moved?.transferCount, 0)} transfers`}
          />
          <TileStat
            label="Pool"
            value={`#${pulse?.poolId ?? "3461"}`}
            sublabel="Osmosis pool"
          />
        </div>
      </div>
    </section>
  );
}
