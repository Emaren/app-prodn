"use client";

import { useEffect, useMemo, useState } from "react";

import WoloMarketExtremeTileCurrent from "@/components/lobby/WoloMarketExtremeTileCurrent";

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
const WOLO_LOGO_SRC = "/api/media-assets/logo/footer-wolo?fallback=%2Flegacy%2Fwolo-logo-transparent.webp";

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
      const y = 75 - ((value - min) / spread) * 52;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildBars(values: number[]) {
  if (values.length < 2) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min || 1;

  return values.map((value, index) => {
    const height = 10 + ((value - min) / spread) * 33;
    const x = 4 + (index / Math.max(values.length - 1, 1)) * 91;
    return { x, height };
  });
}

export default function WoloMarketExtremeTile({ className }: WoloMarketExtremeTileProps) {
  const [view, setView] = useState<"forge" | "console">("forge");

  const toggleView = () => {
    setView((current) => (current === "forge" ? "console" : "forge"));
  };

  if (view === "console") {
    return (
      <div onClick={toggleView} className="cursor-pointer">
        <WoloMarketExtremeTileCurrent className={className} />
      </div>
    );
  }

  return <WoloMarketExtremeForgeTile className={className} onToggleView={toggleView} />;
}

function WoloMarketExtremeForgeTile({
  className,
  onToggleView,
}: WoloMarketExtremeTileProps & {
  onToggleView: () => void;
}) {
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

        if (pulseResponse.status === "fulfilled" && pulseResponse.value.ok && !cancelled) {
          setPulse(await pulseResponse.value.json());
        }

        if (movedResponse.status === "fulfilled" && movedResponse.value.ok && !cancelled) {
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

    if (curve.length >= 8) {
      return curve.map((value, index) => {
        const wave = Math.sin(index / 1.8) * price * 0.035;
        return value + wave;
      });
    }

    return [
      price * 0.92,
      price * 0.94,
      price * 0.93,
      price * 0.98,
      price * 0.96,
      price * 1.04,
      price * 1.0,
      price * 1.08,
      price * 1.04,
      price * 1.11,
      price * 1.06,
      price * 1.09,
    ];
  }, [pulse?.depthCurve, price]);

  const chartPoints = buildChartPoints(chartValues);
  const bars = buildBars(chartValues);
  const quoteLabel =
    swapMode === "woloToUsdc"
      ? formatUsd(quote)
      : `${formatNumber(quote, { maximumFractionDigits: 2 })} WOLO`;

  return (
    <section
      onClick={onToggleView}
      className={cx(
        "relative isolate cursor-pointer overflow-hidden rounded-[2rem] border border-yellow-100/24 bg-[#03060d] p-[1px]",
        "shadow-[0_30px_110px_rgba(0,0,0,0.56),0_0_0_1px_rgba(255,255,255,0.025)]",
        "before:absolute before:inset-0 before:-z-10 before:bg-[radial-gradient(circle_at_15%_8%,rgba(252,211,77,0.28),transparent_30%),radial-gradient(circle_at_78%_0%,rgba(56,189,248,0.14),transparent_33%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99)_58%,rgba(15,23,42,0.92))]",
        "after:absolute after:inset-x-12 after:top-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-yellow-100/78 after:to-transparent",
        className,
      )}
      aria-label="Extreme WOLO market console"
      title=""
    >
      <div className="relative overflow-hidden rounded-[1.94rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.082),rgba(255,255,255,0.024)_42%,rgba(0,0,0,0.42))] p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:46px_46px]" />
        <div className="pointer-events-none absolute -left-20 top-0 h-full w-[45%] bg-[radial-gradient(circle_at_40%_40%,rgba(245,158,11,0.22),transparent_40%),linear-gradient(90deg,rgba(0,0,0,0.30),transparent)]" />
        <div className="pointer-events-none absolute -right-24 top-0 h-full w-[48%] bg-[radial-gradient(circle_at_54%_35%,rgba(56,189,248,0.12),transparent_42%)]" />

        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[0.58rem] font-black uppercase tracking-[0.56em] text-yellow-100/72">
                WOLO Market
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MicroBadge>Extreme View</MicroBadge>
                <MicroBadge tone="green">Live pair</MicroBadge>
                <MicroBadge>Pool #{poolId}</MicroBadge>
              </div>
            </div>

            <a
              href={pulse?.poolUrl || POOL_URL}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => event.stopPropagation()}
              className="rounded-full border border-yellow-200/20 bg-black/28 px-3.5 py-2 text-[0.58rem] font-black uppercase tracking-[0.24em] text-yellow-100/76 transition hover:border-yellow-100/45 hover:text-yellow-50"
            >
              Osmosis rail ↗
            </a>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.82fr_1.25fr]">
            <div className="relative overflow-hidden rounded-[1.45rem] border border-yellow-100/13 bg-black/28 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_55px_rgba(0,0,0,0.24)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_28%_16%,rgba(250,204,21,0.18),transparent_34%),radial-gradient(circle_at_82%_82%,rgba(37,99,235,0.16),transparent_40%)]" />

              <div className="relative flex items-center justify-center gap-5">
                <WoloLogoMark />
                <span className="font-serif text-3xl font-black text-yellow-100/78">/</span>
                <UsdcMark />
              </div>

              <div className="relative mt-5 text-center">
                <p className="text-[0.62rem] font-black uppercase tracking-[0.36em] text-slate-400">
                  {pairLabel}
                </p>
                <p className="mt-2 font-serif text-5xl font-black tracking-tight text-white drop-shadow-[0_0_28px_rgba(255,255,255,0.08)]">
                  {formatUsd(price)}
                </p>
                <p className="mt-2 text-[0.58rem] font-black uppercase tracking-[0.32em] text-emerald-200/80">
                  ● live spot price
                </p>
              </div>

              <div className="relative mt-5 grid grid-cols-2 gap-2">
                <MiniStat label="WOLO depth" value={formatCompact(pulse?.reserveWolo || 0)} />
                <MiniStat
                  label="USDC depth"
                  value={formatUsd(pulse?.reserveUsdc || 0, {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 2,
                  })}
                />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[1.45rem] border border-white/10 bg-[#050814]/84 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.075),0_18px_55px_rgba(0,0,0,0.22)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[0.54rem] font-black uppercase tracking-[0.34em] text-slate-500">
                    Chain pulse / market pressure
                  </p>
                  <p className="mt-1 text-3xl font-black text-white">{formatUsd(price)}</p>
                </div>
                <div className="rounded-full border border-emerald-200/15 bg-emerald-300/8 px-3 py-1 text-[0.56rem] font-black uppercase tracking-[0.24em] text-emerald-100/78">
                  synced
                </div>
              </div>

              <div className="relative mt-3 h-[9.75rem] overflow-hidden rounded-[1.12rem] border border-yellow-100/[0.085] bg-black/24">
                <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:52px_38px]" />
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 92" preserveAspectRatio="none" aria-hidden="true">
                  {bars.map((bar, index) => (
                    <rect
                      key={`${bar.x}-${index}`}
                      x={bar.x}
                      y={84 - bar.height}
                      width="2.1"
                      height={bar.height}
                      rx="0.55"
                      fill="rgba(234,179,8,0.18)"
                    />
                  ))}
                  <polygon points={`0,92 ${chartPoints} 100,92`} fill="rgba(234,179,8,0.12)" />
                  <polyline
                    points={chartPoints}
                    fill="none"
                    stroke="rgba(250,204,21,0.96)"
                    strokeWidth="1.55"
                    vectorEffect="non-scaling-stroke"
                  />
                  <circle cx="100" cy="37" r="2.45" fill="rgba(250,204,21,0.95)" />
                </svg>
                <div className="absolute bottom-3 left-4 right-4 flex justify-between text-[0.54rem] font-black uppercase tracking-[0.22em] text-slate-500">
                  <span>Launch pulse</span>
                  <span>Now</span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-5">
            <MarketStat label="24h moved" value={movedWolo > 0 ? `${formatNumber(movedWolo, { maximumFractionDigits: 0 })} WOLO` : "Live rail"} />
            <MarketStat label="Transfers" value={transferCount > 0 ? formatNumber(transferCount, { maximumFractionDigits: 0 }) : "Chain pulse"} />
            <MarketStat
              label="Liquidity"
              value={formatUsd(pulse?.liquidityUsd || 0, {
                maximumFractionDigits: 2,
                minimumFractionDigits: 2,
              })}
            />
            <MarketStat label="Pair" value="WOLO / USDC" />
            <MarketStat label="Trust" value="Verified rail" />
          </div>

          <div
            onClick={(event) => event.stopPropagation()}
            className="relative overflow-hidden rounded-[1.45rem] border border-yellow-200/14 bg-black/30 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
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
                className="mx-auto grid h-11 w-11 place-items-center self-center rounded-full border border-white/12 bg-white/[0.045] text-base font-black text-slate-300 transition hover:border-yellow-100/35 hover:text-yellow-100"
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

            <div className="mt-4 flex flex-col items-center justify-between gap-3 lg:flex-row">
              <button
                type="button"
                className="rounded-full border border-white/10 bg-white/[0.035] px-5 py-2.5 text-xs font-black text-slate-300 transition hover:border-white/22 hover:text-white"
              >
                Slippage
              </button>

              <a
                href={pulse?.poolUrl || POOL_URL}
                target="_blank"
                rel="noreferrer"
                className="group/swap relative isolate inline-flex min-h-11 w-full max-w-[15.5rem] items-center justify-center gap-2 overflow-hidden rounded-full border border-[#b88a2a]/75 bg-[linear-gradient(180deg,#fff0a4_0%,#e9bd4f_19%,#b98222_52%,#edc150_78%,#6f430f_100%)] px-8 text-sm font-black text-[#130d04] shadow-[inset_0_1px_0_rgba(255,255,255,0.70),inset_0_-2px_0_rgba(74,43,5,0.56),0_12px_28px_rgba(0,0,0,0.36),0_0_20px_rgba(232,188,79,0.13)] ring-1 ring-[#fff0a3]/20 transition duration-300 before:pointer-events-none before:absolute before:inset-0 before:z-0 before:bg-[repeating-linear-gradient(92deg,rgba(255,255,255,0.14)_0px,rgba(255,255,255,0.14)_1px,transparent_1px,transparent_7px),linear-gradient(90deg,rgba(255,255,255,0.20)_0%,transparent_26%,rgba(71,43,9,0.16)_52%,transparent_78%,rgba(255,255,255,0.16)_100%)] before:mix-blend-soft-light after:pointer-events-none after:absolute after:inset-x-5 after:top-0 after:z-0 after:h-px after:bg-gradient-to-r after:from-transparent after:via-white/82 after:to-transparent hover:-translate-y-0.5 hover:border-[#ffe28a]/88 hover:text-black hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.76),inset_0_-2px_0_rgba(74,43,5,0.50),0_15px_34px_rgba(0,0,0,0.43),0_0_28px_rgba(232,188,79,0.22)] active:translate-y-0 active:scale-[0.99]"
              >
                <span className="relative z-10">Swap</span>
                <span className="relative z-10 text-base">→</span>
              </a>

              <div className="min-w-[11rem] rounded-2xl border border-white/10 bg-black/24 px-4 py-2.5 text-center">
                <p className="text-[0.52rem] font-black uppercase tracking-[0.22em] text-slate-500">Rate</p>
                <p className="mt-1 text-xs font-black text-slate-200">1 WOLO ≈ {formatUsd(price)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MicroBadge({
  children,
  tone = "gold",
}: {
  children: React.ReactNode;
  tone?: "gold" | "green";
}) {
  return (
    <span
      className={cx(
        "rounded-full border px-3 py-1 text-[0.55rem] font-black uppercase tracking-[0.24em]",
        tone === "green"
          ? "border-emerald-200/15 bg-emerald-300/8 text-emerald-100/75"
          : "border-yellow-200/18 bg-yellow-300/8 text-yellow-100/78",
      )}
    >
      {children}
    </span>
  );
}

function WoloLogoMark() {
  return (
    <div className="text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full border border-yellow-200/34 bg-[radial-gradient(circle_at_35%_20%,#fff1a6,#d6a52c_40%,#4d330d_100%)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.30),0_0_28px_rgba(250,204,21,0.16)]">
        <img
          src={WOLO_LOGO_SRC}
          alt="WOLO"
          className="h-full w-full object-contain drop-shadow-[0_2px_10px_rgba(0,0,0,0.42)]"
        />
      </div>
      <p className="mt-2 text-[0.56rem] font-black uppercase tracking-[0.22em] text-slate-400">WOLO</p>
    </div>
  );
}

function UsdcMark() {
  return (
    <div className="text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full border border-sky-200/32 bg-[radial-gradient(circle_at_35%_20%,#9bdcff,#1d73d7_44%,#12315f_100%)] text-3xl font-black text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.26),0_0_28px_rgba(56,189,248,0.14)]">
        $
      </div>
      <p className="mt-2 text-[0.56rem] font-black uppercase tracking-[0.22em] text-slate-400">USDC</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-black/24 px-3 py-3">
      <p className="text-[0.52rem] font-black uppercase tracking-[0.25em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-100">{value}</p>
    </div>
  );
}

function MarketStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.055)]">
      <p className="text-[0.52rem] font-black uppercase tracking-[0.25em] text-slate-500">{label}</p>
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
    <label className="block rounded-2xl border border-white/10 bg-[#050816]/82 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.065)]">
      <span className="text-[0.54rem] font-black uppercase tracking-[0.28em] text-slate-500">{label}</span>
      <span className="mt-2 flex items-center gap-3">
        <input
          value={value}
          readOnly={readOnly}
          onChange={(event) => onChange?.(event.target.value)}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent text-xl font-black text-white outline-none placeholder:text-slate-600"
          placeholder="0"
        />
        <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-[0.6rem] font-black uppercase tracking-[0.18em] text-slate-200">
          {token}
        </span>
      </span>
    </label>
  );
}

export { WoloMarketExtremeTile };
