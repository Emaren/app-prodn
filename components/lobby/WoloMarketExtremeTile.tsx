"use client";

import { useEffect, useMemo, useState } from "react";

type DepthPoint = {
  index?: number;
  pressure?: number;
  priceUsd?: number;
};

type OsmosisPulse = {
  ok?: boolean;
  updatedAt?: string;
  poolId?: string;
  poolUrl?: string;
  source?: string;
  pairLabel?: string;
  priceUsd?: number;
  reserveWolo?: number;
  reserveUsdc?: number;
  liquidityUsd?: number;
  depthCurve?: DepthPoint[];
};

type MovedPulse = {
  movedWolo?: number;
  amountWolo?: number;
  totalWolo?: number;
  totalMovedWolo?: number;
  transferCount?: number;
  transfers?: unknown;
  count?: number;
};

type WoloMarketExtremeTileProps = {
  className?: string;
};

const FALLBACK_PRICE = 0.0001103;
const POOL_URL = "https://app.osmosis.zone/pool/3461";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function finiteNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function formatUsd(value: unknown, opts?: Intl.NumberFormatOptions) {
  const next = finiteNumber(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: next < 1 ? 7 : 2,
    minimumFractionDigits: next < 1 ? 7 : 2,
    ...opts,
  }).format(next);
}

function formatNumber(value: unknown, opts?: Intl.NumberFormatOptions) {
  const next = finiteNumber(value);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...opts,
  }).format(next);
}

function formatCompact(value: unknown) {
  const next = finiteNumber(value);
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(next);
}

function readMovedAmount(payload: MovedPulse | null) {
  if (!payload) return 0;
  return finiteNumber(
    payload.movedWolo ??
      payload.amountWolo ??
      payload.totalWolo ??
      payload.totalMovedWolo,
  );
}

function readTransferCount(payload: MovedPulse | null) {
  if (!payload) return 0;
  return finiteNumber(payload.transferCount ?? payload.count);
}

function buildChartPoints(values: number[]) {
  if (values.length < 2) return "";

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 74 - ((value - min) / spread) * 48;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function WoloMarketExtremeTile({ className }: WoloMarketExtremeTileProps) {
  const [pulse, setPulse] = useState<OsmosisPulse | null>(null);
  const [movedPulse, setMovedPulse] = useState<MovedPulse | null>(null);
  const [swapMode, setSwapMode] = useState<"woloToUsdc" | "usdcToWolo">("woloToUsdc");
  const [amount, setAmount] = useState("1000");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [pulseResponse, movedResponse] = await Promise.allSettled([
          fetch("/api/wolo/osmosis-pulse", { cache: "no-store" }),
          fetch("/api/wolo/moved24h", { cache: "no-store" }),
        ]);

        if (
          pulseResponse.status === "fulfilled" &&
          pulseResponse.value.ok &&
          !cancelled
        ) {
          setPulse(await pulseResponse.value.json());
        }

        if (
          movedResponse.status === "fulfilled" &&
          movedResponse.value.ok &&
          !cancelled
        ) {
          setMovedPulse(await movedResponse.value.json());
        }
      } catch {
        if (!cancelled) {
          setPulse((current) => current);
          setMovedPulse((current) => current);
        }
      }
    }

    load();
    const timer = window.setInterval(load, 45000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const price = finiteNumber(pulse?.priceUsd, FALLBACK_PRICE);
  const poolId = pulse?.poolId || "3461";
  const pairLabel = pulse?.pairLabel || "WOLO / USDC";
  const movedWolo = readMovedAmount(movedPulse);
  const transferCount = readTransferCount(movedPulse);
  const numericAmount = finiteNumber(amount, 0);

  const quote = useMemo(() => {
    if (swapMode === "woloToUsdc") return numericAmount * price;
    if (price <= 0) return 0;
    return numericAmount / price;
  }, [numericAmount, price, swapMode]);

  const chartValues = useMemo(() => {
    const curve = (pulse?.depthCurve || [])
      .map((point) => finiteNumber(point.priceUsd, NaN))
      .filter((value) => Number.isFinite(value));

    if (curve.length >= 3) return curve;

    return [
      price * 0.92,
      price * 0.96,
      price * 0.94,
      price * 1.01,
      price * 0.99,
      price * 1.06,
      price * 1.03,
      price * 1.08,
      price * 1.02,
      price * 1.05,
      price * 1.0,
      price * 1.04,
    ];
  }, [pulse?.depthCurve, price]);

  const chartPoints = buildChartPoints(chartValues);
  const quoteLabel =
    swapMode === "woloToUsdc"
      ? `${formatUsd(quote)}`
      : `${formatNumber(quote, { maximumFractionDigits: 2 })} WOLO`;

  return (
    <section
      className={cx(
        "relative isolate overflow-hidden rounded-[2rem] border border-yellow-200/22 bg-[#050914] p-[1px] shadow-[0_26px_95px_rgba(0,0,0,0.48)]",
        "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_18%_0%,rgba(255,196,64,0.22),transparent_31%),radial-gradient(circle_at_74%_12%,rgba(56,189,248,0.12),transparent_35%),linear-gradient(135deg,rgba(15,23,42,0.94),rgba(2,6,23,0.98))]",
        "after:absolute after:inset-x-14 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-yellow-100/70 after:to-transparent",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[1.95rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.025)_38%,rgba(0,0,0,0.34))] p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:48px_48px]" />
        <div className="pointer-events-none absolute -left-20 bottom-0 top-0 w-[42%] bg-[radial-gradient(circle_at_44%_45%,rgba(245,158,11,0.18),transparent_42%),linear-gradient(90deg,rgba(0,0,0,0.20),transparent)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(0,0,0,0.28),transparent_38%,rgba(0,0,0,0.12))]" />

        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[0.62rem] font-black uppercase tracking-[0.52em] text-yellow-100/70">
                WOLO Market
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-yellow-200/20 bg-yellow-300/9 px-3 py-1 text-[0.58rem] font-black uppercase tracking-[0.28em] text-yellow-100/80">
                  Extreme View
                </span>
                <span className="rounded-full border border-emerald-200/15 bg-emerald-300/8 px-3 py-1 text-[0.58rem] font-black uppercase tracking-[0.24em] text-emerald-100/75">
                  Live pair
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-[0.58rem] font-black uppercase tracking-[0.22em] text-slate-300/72">
                  Pool #{poolId}
                </span>
              </div>
            </div>

            <a
              href={pulse?.poolUrl || POOL_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-yellow-200/20 bg-black/24 px-3.5 py-2 text-[0.62rem] font-black uppercase tracking-[0.24em] text-yellow-100/74 transition hover:border-yellow-100/45 hover:text-yellow-50"
            >
              Osmosis rail ↗
            </a>
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.9fr_1.35fr]">
            <div className="relative overflow-hidden rounded-[1.55rem] border border-white/10 bg-black/24 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.075)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_34%_20%,rgba(250,204,21,0.17),transparent_36%),radial-gradient(circle_at_82%_82%,rgba(37,99,235,0.16),transparent_36%)]" />
              <div className="relative flex items-center justify-center gap-5">
                <TokenMark label="W" sublabel="WOLO" tone="gold" />
                <span className="font-serif text-3xl font-black text-yellow-100/80">/</span>
                <TokenMark label="$" sublabel="USDC" tone="blue" />
              </div>

              <div className="relative mt-6 text-center">
                <p className="text-[0.7rem] font-black uppercase tracking-[0.38em] text-slate-400">
                  {pairLabel}
                </p>
                <p className="mt-3 font-serif text-4xl font-black tracking-tight text-white">
                  {formatUsd(price)}
                </p>
                <p className="mt-2 text-[0.62rem] font-black uppercase tracking-[0.3em] text-emerald-200/80">
                  ● live spot price
                </p>
              </div>

              <div className="relative mt-6 grid grid-cols-2 gap-2">
                <MiniStat label="WOLO depth" value={formatCompact(pulse?.reserveWolo || 0)} />
                <MiniStat label="USDC depth" value={formatUsd(pulse?.reserveUsdc || 0, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.55rem] border border-white/10 bg-[#050814]/78 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.075)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.58rem] font-black uppercase tracking-[0.32em] text-slate-500">
                    Pool pressure / live pulse
                  </p>
                  <p className="mt-1 text-2xl font-black text-white">{formatUsd(price)}</p>
                </div>
                <div className="rounded-full border border-emerald-200/15 bg-emerald-300/8 px-3 py-1 text-[0.58rem] font-black uppercase tracking-[0.24em] text-emerald-100/78">
                  synced
                </div>
              </div>

              <div className="relative mt-4 h-[9.5rem] overflow-hidden rounded-[1.15rem] border border-white/[0.075] bg-black/22">
                <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:52px_38px]" />
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden="true">
                  <polygon
                    points={`0,92 ${chartPoints} 100,92`}
                    fill="rgba(234,179,8,0.13)"
                  />
                  <polyline
                    points={chartPoints}
                    fill="none"
                    stroke="rgba(250,204,21,0.94)"
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx="100" cy="36" r="2.6" fill="rgba(250,204,21,0.92)" />
                </svg>
                <div className="absolute bottom-3 left-4 right-4 flex justify-between text-[0.56rem] font-black uppercase tracking-[0.2em] text-slate-500">
                  <span>Sell pressure</span>
                  <span>Now</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            <MarketStat label="24h moved" value={movedWolo > 0 ? `${formatNumber(movedWolo, { maximumFractionDigits: 0 })} WOLO` : "Live rail"} />
            <MarketStat label="Transfers" value={transferCount > 0 ? formatNumber(transferCount, { maximumFractionDigits: 0 }) : "Chain pulse"} />
            <MarketStat label="Liquidity" value={formatUsd(pulse?.liquidityUsd || 0, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} />
            <MarketStat label="Pair" value="WOLO / USDC" />
            <MarketStat label="Trust" value="Verified rail" />
          </div>

          <div className="relative overflow-hidden rounded-[1.55rem] border border-yellow-200/16 bg-black/26 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr]">
              <SwapInput
                label={swapMode === "woloToUsdc" ? "From" : "To estimate"}
                value={amount}
                onChange={setAmount}
                token={swapMode === "woloToUsdc" ? "WOLO" : "USDC"}
                readOnly={false}
              />

              <button
                type="button"
                onClick={() => setSwapMode((current) => (current === "woloToUsdc" ? "usdcToWolo" : "woloToUsdc"))}
                className="mx-auto grid h-12 w-12 place-items-center self-center rounded-full border border-white/12 bg-white/[0.045] text-lg font-black text-slate-300 transition hover:border-yellow-100/35 hover:text-yellow-100"
                aria-label="Flip swap direction"
              >
                ⇄
              </button>

              <SwapInput
                label={swapMode === "woloToUsdc" ? "To estimate" : "From"}
                value={quoteLabel}
                token={swapMode === "woloToUsdc" ? "USDC" : "WOLO"}
                readOnly
              />
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[8rem_1fr_11rem]">
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/[0.035] px-4 py-3 text-sm font-black text-slate-300 transition hover:border-white/22 hover:text-white"
              >
                Slippage
              </button>

              <a
                href={pulse?.poolUrl || POOL_URL}
                target="_blank"
                rel="noreferrer"
                className="group/swap relative isolate inline-flex min-h-12 items-center justify-center gap-3 overflow-hidden rounded-full border border-[#b88a2a]/70 bg-[linear-gradient(180deg,#fff1a6_0%,#e8bc4f_18%,#b98222_52%,#f0c85a_78%,#7b4b12_100%)] px-6 text-base font-black text-[#130d04] shadow-[inset_0_1px_0_rgba(255,255,255,0.72),inset_0_-2px_0_rgba(74,43,5,0.56),0_12px_30px_rgba(0,0,0,0.34),0_0_22px_rgba(232,188,79,0.14)] ring-1 ring-[#fff0a3]/20 transition duration-300 before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-[repeating-linear-gradient(92deg,rgba(255,255,255,0.16)_0px,rgba(255,255,255,0.16)_1px,transparent_1px,transparent_7px),linear-gradient(90deg,rgba(255,255,255,0.22)_0%,transparent_24%,rgba(71,43,9,0.18)_52%,transparent_78%,rgba(255,255,255,0.18)_100%)] before:mix-blend-soft-light after:pointer-events-none after:absolute after:inset-x-6 after:top-0 after:z-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/85 after:to-transparent hover:-translate-y-0.5 hover:border-[#ffe28a]/85 hover:text-black hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.78),inset_0_-2px_0_rgba(74,43,5,0.50),0_16px_38px_rgba(0,0,0,0.42),0_0_32px_rgba(232,188,79,0.24)] active:translate-y-0 active:scale-[0.99]"
              >
                <span className="relative z-10">Swap</span>
                <span className="relative z-10 text-lg">→</span>
              </a>

              <div className="rounded-2xl border border-white/10 bg-black/24 px-4 py-3 text-center">
                <p className="text-[0.56rem] font-black uppercase tracking-[0.22em] text-slate-500">Rate</p>
                <p className="mt-1 text-sm font-black text-slate-200">1 WOLO ≈ {formatUsd(price)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TokenMark({
  label,
  sublabel,
  tone,
}: {
  label: string;
  sublabel: string;
  tone: "gold" | "blue";
}) {
  return (
    <div className="text-center">
      <div
        className={cx(
          "grid h-20 w-20 place-items-center rounded-full border text-3xl font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_0_28px_rgba(0,0,0,0.32)]",
          tone === "gold"
            ? "border-yellow-200/32 bg-[radial-gradient(circle_at_35%_20%,#fff1a6,#d6a52c_40%,#5b3b0d_100%)] text-[#141006]"
            : "border-sky-200/32 bg-[radial-gradient(circle_at_35%_20%,#9bdcff,#1d73d7_44%,#12315f_100%)] text-white",
        )}
      >
        {label}
      </div>
      <p className="mt-2 text-[0.58rem] font-black uppercase tracking-[0.22em] text-slate-400">{sublabel}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/22 px-3 py-3">
      <p className="text-[0.54rem] font-black uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
      <p className="text-[0.54rem] font-black uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

function SwapInput({
  label,
  value,
  token,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  token: "WOLO" | "USDC";
  readOnly: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block rounded-2xl border border-white/10 bg-[#050816]/78 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.065)]">
      <span className="text-[0.56rem] font-black uppercase tracking-[0.28em] text-slate-500">{label}</span>
      <span className="mt-2 flex items-center gap-3">
        <input
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent text-xl font-black text-white outline-none placeholder:text-slate-600"
          placeholder="0"
        />
        <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[0.62rem] font-black uppercase tracking-[0.18em] text-slate-200">
          {token}
        </span>
      </span>
    </label>
  );
}
