"use client";

import { motion } from "framer-motion";
import { useMemo, useRef, useState } from "react";

export type ObservatoryAxis = "count" | "wolo";

export type ObservatorySeries = {
  key: string;
  label: string;
  color: string;
  axis: ObservatoryAxis;
  defaultVisible?: boolean;
};

export type ObservatoryPoint = {
  date: string;
  values: Record<string, number | null>;
};

type RangeKey = "7D" | "30D" | "ALL";

const VIEW_WIDTH = 1400;
const VIEW_HEIGHT = 690;

const MARGIN = {
  top: 32,
  right: 78,
  bottom: 62,
  left: 78,
};

const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;

const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;

function compactNumber(value: number) {
  const absolute = Math.abs(value);

  if (absolute >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(
      absolute >= 10_000_000_000 ? 0 : 1,
    )}B`;
  }

  if (absolute >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(absolute >= 10_000_000 ? 0 : 1)}M`;
  }

  if (absolute >= 1_000) {
    return `${(value / 1_000).toFixed(absolute >= 10_000 ? 0 : 1)}K`;
  }

  return Math.round(value).toLocaleString();
}

function formatValue(value: number, axis: ObservatoryAxis) {
  if (axis === "wolo") {
    return `${compactNumber(value)} WOLO`;
  }

  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      });
}

function dateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

function fullDateLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

type Coord = {
  x: number;
  y: number;
};

function smoothPath(points: Coord[]) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] || points[index];

    const p1 = points[index];

    const p2 = points[index + 1];

    const p3 = points[index + 2] || p2;

    const cp1x = p1.x + (p2.x - p0.x) / 6;

    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;

    const cp2y = p2.y - (p3.y - p1.y) / 6;

    path += ` C ${cp1x} ${cp1y},` + ` ${cp2x} ${cp2y},` + ` ${p2.x} ${p2.y}`;
  }

  return path;
}

function rangePoints(points: ObservatoryPoint[], range: RangeKey) {
  if (range === "ALL") {
    return points;
  }

  const count = range === "7D" ? 7 : 30;

  return points.slice(-count);
}

function tickIndexes(length: number) {
  if (length <= 1) {
    return [0];
  }

  return Array.from(
    new Set([
      0,
      Math.round((length - 1) * 0.25),
      Math.round((length - 1) * 0.5),
      Math.round((length - 1) * 0.75),
      length - 1,
    ]),
  );
}

export default function PremiumTimeSeriesChart({
  title,
  points,
  series,
  variant,
}: {
  title: string;
  points: ObservatoryPoint[];
  series: ObservatorySeries[];
  variant: "traffic" | "statistics";
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);

  const [range, setRange] = useState<RangeKey>("ALL");

  const [visible, setVisible] = useState<Set<string>>(
    () =>
      new Set(
        series
          .filter((item) => item.defaultVisible !== false)
          .map((item) => item.key),
      ),
  );

  const [focusedSeries, setFocusedSeries] = useState<string | null>(null);

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const displayedPoints = useMemo(
    () => rangePoints(points, range),
    [points, range],
  );

  const displayedSeries = useMemo(
    () => series.filter((item) => visible.has(item.key)),
    [series, visible],
  );

  const leftMax = useMemo(
    () =>
      Math.max(
        1,
        ...displayedSeries
          .filter((item) => item.axis === "count")
          .flatMap((item) =>
            displayedPoints
              .map((point) => point.values[item.key])
              .filter(
                (value): value is number =>
                  typeof value === "number" && Number.isFinite(value),
              ),
          ),
      ),
    [displayedPoints, displayedSeries],
  );

  const rightMax = useMemo(
    () =>
      Math.max(
        1,
        ...displayedSeries
          .filter((item) => item.axis === "wolo")
          .flatMap((item) =>
            displayedPoints
              .map((point) => point.values[item.key])
              .filter(
                (value): value is number =>
                  typeof value === "number" && Number.isFinite(value),
              ),
          ),
      ),
    [displayedPoints, displayedSeries],
  );

  function xForIndex(index: number) {
    if (displayedPoints.length <= 1) {
      return MARGIN.left + PLOT_WIDTH / 2;
    }

    return MARGIN.left + (index / (displayedPoints.length - 1)) * PLOT_WIDTH;
  }

  function yForValue(value: number, axis: ObservatoryAxis) {
    const max = axis === "wolo" ? rightMax : leftMax;

    return MARGIN.top + PLOT_HEIGHT - (value / max) * PLOT_HEIGHT;
  }

  function segmentsForSeries(item: ObservatorySeries) {
    const segments: Coord[][] = [];

    let current: Coord[] = [];

    displayedPoints.forEach((point, index) => {
      const value = point.values[item.key];

      if (typeof value !== "number" || !Number.isFinite(value)) {
        if (current.length) {
          segments.push(current);
          current = [];
        }

        return;
      }

      current.push({
        x: xForIndex(index),
        y: yForValue(value, item.axis),
      });
    });

    if (current.length) {
      segments.push(current);
    }

    return segments;
  }

  function toggleSeries(key: string) {
    setVisible((previous) => {
      const next = new Set(previous);

      if (next.has(key)) {
        if (next.size > 1) {
          next.delete(key);
        }
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    if (!displayedPoints.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    const relative = Math.min(
      1,
      Math.max(0, (event.clientX - rect.left) / rect.width),
    );

    const index = Math.round(relative * (displayedPoints.length - 1));

    setHoverIndex(index);
  }

  const hoveredPoint =
    hoverIndex === null ? null : displayedPoints[hoverIndex] || null;

  const hoverX = hoverIndex === null ? null : xForIndex(hoverIndex);

  const xTicks = tickIndexes(displayedPoints.length);

  const shellClass =
    variant === "traffic"
      ? "border-emerald-100/10 bg-[radial-gradient(circle_at_14%_0%,rgba(52,211,153,0.10),transparent_33%),radial-gradient(circle_at_86%_10%,rgba(59,130,246,0.10),transparent_30%),linear-gradient(150deg,rgba(3,10,18,0.97),rgba(2,6,14,0.99))]"
      : "border-violet-100/10 bg-[radial-gradient(circle_at_12%_0%,rgba(245,158,11,0.10),transparent_31%),radial-gradient(circle_at_90%_8%,rgba(139,92,246,0.13),transparent_33%),linear-gradient(150deg,rgba(8,7,18,0.98),rgba(2,6,14,0.99))]";

  return (
    <section
      className={`relative overflow-hidden rounded-[2.5rem] border ${shellClass} shadow-[0_40px_140px_rgba(0,0,0,0.48)]`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />

      <div className="relative flex flex-col gap-5 px-5 pb-3 pt-6 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="font-serif text-3xl tracking-[-0.03em] text-white sm:text-5xl">
          {title}
        </h1>

        <div className="flex gap-1 rounded-full border border-white/[0.08] bg-black/25 p-1 backdrop-blur-xl">
          {(["7D", "30D", "ALL"] as RangeKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRange(item)}
              className={`cursor-pointer rounded-full px-4 py-2 text-[10px] font-bold tracking-[0.18em] transition ${
                range === item
                  ? "bg-white/[0.12] text-white shadow-[0_0_24px_rgba(255,255,255,0.08)]"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="relative min-w-0 px-4 sm:px-7">
        <div className="-mx-4 min-w-0 overflow-x-auto overscroll-x-contain border-y border-white/[0.055] px-4 touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-7 sm:px-7 lg:mx-0 lg:overflow-visible lg:px-0">
          <div className="flex w-max min-w-full flex-nowrap gap-2 py-4 lg:w-full lg:min-w-0 lg:flex-wrap">
            {series.map((item) => {
              const active = visible.has(item.key);

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleSeries(item.key)}
                  onMouseEnter={() => setFocusedSeries(item.key)}
                  onMouseLeave={() => setFocusedSeries(null)}
                  className={`group flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                    active
                      ? "border-white/[0.10] bg-white/[0.055] text-slate-200"
                      : "border-white/[0.04] bg-transparent text-slate-600"
                  }`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full transition"
                    style={{
                      backgroundColor: item.color,
                      boxShadow: active ? `0 0 14px ${item.color}` : "none",
                      opacity: active ? 1 : 0.25,
                    }}
                  />

                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={chartRef}
          className="relative min-h-[38rem] w-full lg:min-h-[46rem]"
        >
          <svg
            viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <defs>
              <linearGradient
                id={`observatory-floor-${variant}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="white" stopOpacity="0.028" />

                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>

            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={PLOT_WIDTH}
              height={PLOT_HEIGHT}
              fill={`url(#observatory-floor-${variant})`}
              rx="18"
            />

            {Array.from({
              length: 6,
            }).map((_, index) => {
              const ratio = index / 5;

              const y = MARGIN.top + ratio * PLOT_HEIGHT;

              const leftValue = leftMax * (1 - ratio);

              const rightValue = rightMax * (1 - ratio);

              return (
                <g key={index}>
                  <line
                    x1={MARGIN.left}
                    x2={MARGIN.left + PLOT_WIDTH}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.055)"
                    strokeWidth="1"
                  />

                  <text
                    x={MARGIN.left - 14}
                    y={y + 4}
                    textAnchor="end"
                    fill="rgba(148,163,184,0.42)"
                    fontSize="12"
                  >
                    {compactNumber(leftValue)}
                  </text>

                  <text
                    x={MARGIN.left + PLOT_WIDTH + 14}
                    y={y + 4}
                    textAnchor="start"
                    fill="rgba(148,163,184,0.42)"
                    fontSize="12"
                  >
                    {compactNumber(rightValue)}
                  </text>
                </g>
              );
            })}

            {xTicks.map((index) => {
              const point = displayedPoints[index];

              if (!point) {
                return null;
              }

              const x = xForIndex(index);

              return (
                <g key={point.date}>
                  <line
                    x1={x}
                    x2={x}
                    y1={MARGIN.top}
                    y2={MARGIN.top + PLOT_HEIGHT}
                    stroke="rgba(255,255,255,0.025)"
                  />

                  <text
                    x={x}
                    y={VIEW_HEIGHT - 22}
                    textAnchor="middle"
                    fill="rgba(148,163,184,0.52)"
                    fontSize="13"
                  >
                    {dateLabel(point.date)}
                  </text>
                </g>
              );
            })}

            {displayedSeries.map((item) => {
              const opacity =
                focusedSeries && focusedSeries !== item.key ? 0.13 : 1;

              return segmentsForSeries(item).map((segment, segmentIndex) => {
                const d = smoothPath(segment);

                return (
                  <g
                    key={`${item.key}-${segmentIndex}`}
                    style={{
                      opacity,
                      transition: "opacity 180ms ease",
                    }}
                  >
                    <path
                      d={d}
                      fill="none"
                      stroke={item.color}
                      strokeWidth="12"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.06"
                    />

                    <motion.path
                      d={d}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={focusedSeries === item.key ? 4.2 : 2.7}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      initial={{
                        pathLength: 0,
                        opacity: 0,
                      }}
                      animate={{
                        pathLength: 1,
                        opacity: 1,
                      }}
                      transition={{
                        duration: 1.15,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                      style={{
                        filter: `drop-shadow(0 0 7px ${item.color})`,
                      }}
                    />
                  </g>
                );
              });
            })}

            {hoverX !== null ? (
              <line
                x1={hoverX}
                x2={hoverX}
                y1={MARGIN.top}
                y2={MARGIN.top + PLOT_HEIGHT}
                stroke="rgba(255,255,255,0.24)"
                strokeWidth="1"
                strokeDasharray="4 6"
              />
            ) : null}
          </svg>

          {hoveredPoint && hoverX !== null ? (
            <div
              className="pointer-events-none absolute z-20 min-w-52 -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/90 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
              style={{
                left: `${Math.min(
                  88,
                  Math.max(12, (hoverX / VIEW_WIDTH) * 100),
                )}%`,
                top: "8%",
              }}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                {fullDateLabel(hoveredPoint.date)}
              </div>

              <div className="mt-3 space-y-2">
                {displayedSeries.map((item) => {
                  const value = hoveredPoint.values[item.key];

                  if (typeof value !== "number") {
                    return null;
                  }

                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between gap-5 text-xs"
                    >
                      <span className="flex items-center gap-2 text-slate-400">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{
                            backgroundColor: item.color,
                            boxShadow: `0 0 10px ${item.color}`,
                          }}
                        />

                        {item.label}
                      </span>

                      <span className="font-semibold text-white">
                        {formatValue(value, item.axis)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
