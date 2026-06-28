"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WoloMarketPulseTile from "@/components/wolo/WoloMarketPulseTile";

function WoloHeroWordmark() {
  const textProps = {
    x: 18,
    y: 119,
    fontFamily: "'Arial Black', Impact, Haettenschweiler, system-ui, sans-serif",
    fontSize: 120,
    fontWeight: 900,
    letterSpacing: -0.5,
    textLength: 648,
    lengthAdjust: "spacingAndGlyphs" as const,
  };

  return (
    <span
      aria-label="WOLO"
      className="block w-[clamp(20rem,32vw,36rem)] max-w-full"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 760 168"
        role="img"
        className="block h-auto w-full overflow-visible"
      >
        <defs>
          <linearGradient id="woloFinalLogoGoldFace" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fff9ce" />
            <stop offset="9%" stopColor="#ffe982" />
            <stop offset="22%" stopColor="#f4cd3d" />
            <stop offset="38%" stopColor="#dca716" />
            <stop offset="56%" stopColor="#b97708" />
            <stop offset="73%" stopColor="#744006" />
            <stop offset="89%" stopColor="#2d1103" />
            <stop offset="100%" stopColor="#070200" />
          </linearGradient>

          <linearGradient id="woloFinalLogoGoldEdge" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#fff0a0" />
            <stop offset="32%" stopColor="#d89b11" />
            <stop offset="70%" stopColor="#5b2a04" />
            <stop offset="100%" stopColor="#0c0300" />
          </linearGradient>

          <linearGradient id="woloFinalTopSteelGloss" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.62" />
            <stop offset="8%" stopColor="#eeeeE3" stopOpacity="0.36" />
            <stop offset="17%" stopColor="#cbc9bd" stopOpacity="0.13" />
            <stop offset="29%" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="woloFinalBottomBlackBite" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#000000" stopOpacity="0" />
            <stop offset="54%" stopColor="#000000" stopOpacity="0" />
            <stop offset="76%" stopColor="#000000" stopOpacity="0.22" />
            <stop offset="91%" stopColor="#000000" stopOpacity="0.50" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
          </linearGradient>

          <linearGradient id="woloFinalLogoWarmLift" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#704006" stopOpacity="0.07" />
            <stop offset="20%" stopColor="#ffe06b" stopOpacity="0.13" />
            <stop offset="48%" stopColor="#fff1a7" stopOpacity="0.06" />
            <stop offset="76%" stopColor="#cf9512" stopOpacity="0.11" />
            <stop offset="100%" stopColor="#4a2203" stopOpacity="0.08" />
          </linearGradient>

          <filter
            id="woloFinalWordmarkShadow"
            x="-18%"
            y="-50%"
            width="150%"
            height="230%"
            colorInterpolationFilters="sRGB"
          >
            <feDropShadow dx="0" dy="2" stdDeviation="1.1" floodColor="#000000" floodOpacity="0.94" />
            <feDropShadow dx="0" dy="7" stdDeviation="3.6" floodColor="#000000" floodOpacity="0.55" />
            <feDropShadow dx="0" dy="14" stdDeviation="7.5" floodColor="#000000" floodOpacity="0.34" />
            <feDropShadow dx="0" dy="0" stdDeviation="3.2" floodColor="#dca313" floodOpacity="0.13" />
          </filter>
        </defs>

        <g filter="url(#woloFinalWordmarkShadow)">
          <text
            {...textProps}
            fill="#100500"
            stroke="#050100"
            strokeWidth="9.5"
            strokeLinejoin="round"
            paintOrder="stroke fill"
          >
            WOLO
          </text>

          <text
            {...textProps}
            fill="url(#woloFinalLogoGoldFace)"
            stroke="url(#woloFinalLogoGoldEdge)"
            strokeWidth="2.35"
            strokeLinejoin="round"
            paintOrder="stroke fill"
          >
            WOLO
          </text>

          <text
            {...textProps}
            fill="url(#woloFinalLogoWarmLift)"
            opacity="0.58"
          >
            WOLO
          </text>

          <text
            {...textProps}
            fill="url(#woloFinalTopSteelGloss)"
            opacity="0.84"
          >
            WOLO
          </text>

          <text
            {...textProps}
            fill="url(#woloFinalBottomBlackBite)"
            opacity="0.88"
          >
            WOLO
          </text>

          <text
            {...textProps}
            fill="none"
            stroke="rgba(255,239,156,0.20)"
            strokeWidth="0.72"
            strokeLinejoin="round"
          >
            WOLO
          </text>

          <text
            {...textProps}
            fill="none"
            stroke="rgba(0,0,0,0.56)"
            strokeWidth="0.7"
            strokeLinejoin="round"
            transform="translate(0 2)"
          >
            WOLO
          </text>
        </g>
      </svg>
    </span>
  );
}



type PulsePayload = {
  ok: boolean;
  updatedAt?: string;
  poolId?: string;
  priceUsd?: number;
  liquidityUsd?: number;
};

type MovedPayload = {
  ok?: boolean;
  totalWolo?: number;
  transferCount?: number;
};

const FIXED_SUPPLY = 100_000_000;

function formatUsd(value: number | undefined, maxDigits = 2) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  const actual = value ?? 0;

  if (actual < 1) {
    return `$${actual.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })}`;
  }

  return `$${actual.toLocaleString(undefined, {
    maximumFractionDigits: maxDigits,
  })}`;
}

function formatWhole(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return Math.round(value ?? 0).toLocaleString();
}

function formatWolo(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) return "—";
  return `${(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} WOLO`;
}

function TopPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "gold" | "blue";
}) {
  const toneClass =
    tone === "gold"
      ? "border-amber-300/45 bg-amber-300/8 text-amber-100"
      : tone === "blue"
        ? "border-cyan-300/28 bg-cyan-300/8 text-cyan-100"
        : "border-white/18 bg-white/[0.03] text-white/88";

  return (
    <div
      className={[
        "inline-flex items-center rounded-full border px-4 py-2 text-[0.67rem] font-semibold uppercase tracking-[0.34em]",
        "backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
        toneClass,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function MetricCard({
  eyebrow,
  value,
  sublabel,
}: {
  eyebrow: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-[1.2rem] border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="text-[0.56rem] uppercase tracking-[0.34em] text-slate-500">
        {eyebrow}
      </div>
      <div className="mt-2 text-[1.05rem] font-semibold leading-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
    </div>
  );
}

function ActionLink({
  href,
  children,
  variant = "dark",
}: {
  href: string;
  children: ReactNode;
  variant?: "gold" | "dark" | "blue";
}) {
  const isGold = variant === "gold";

  const baseClass = isGold
    ? "inline-flex h-14 items-center justify-center gap-3 overflow-hidden rounded-full border pl-[0.48rem] pr-6 text-sm font-semibold transition"
    : "inline-flex h-10 items-center justify-center rounded-full border px-5 text-sm font-semibold transition";

  const toneClass =
    variant === "gold"
      ? "border-amber-200/30 bg-[linear-gradient(180deg,#e9d274_0%,#d2ad46_58%,#bd8929_100%)] text-slate-950 shadow-[inset_0_1px_0_rgba(255,247,196,0.48),0_10px_24px_rgba(0,0,0,0.24)] hover:brightness-[1.03]"
      : variant === "blue"
        ? "border-white/24 bg-white/[0.04] text-white hover:bg-white/[0.07]"
        : "border-white/24 bg-white/[0.04] text-white hover:bg-white/[0.07]";

  return (
    <Link href={href} className={[baseClass, toneClass].join(" ")}>
      {children}
    </Link>
  );
}

function ValueRailCard({
  eyebrow,
  value,
  sublabel,
}: {
  eyebrow: string;
  value: string;
  sublabel: string;
}) {
  return (
    <div className="rounded-[1.05rem] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,23,42,0.44),rgba(2,8,23,0.58))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]">
      <div className="text-[0.56rem] uppercase tracking-[0.34em] text-slate-500">
        {eyebrow}
      </div>
      <div className="mt-2 text-[1.05rem] font-semibold leading-tight text-white">
        {value}
      </div>
      <div className="mt-1 text-xs text-slate-400">{sublabel}</div>
    </div>
  );
}

function RailChip({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "gold" | "blue";
}) {
  const toneClass =
    tone === "gold"
      ? "border-amber-300/24 bg-white/[0.045] text-amber-50"
      : tone === "blue"
        ? "border-cyan-300/24 bg-white/[0.045] text-cyan-50"
        : "border-white/12 bg-white/[0.04] text-white";

  return (
    <div
      title={label}
      className={[
        "rounded-full border px-4 py-2 text-sm font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        toneClass,
      ].join(" ")}
    >
      {value}
    </div>
  );
}

function SectionPanel({
  eyebrow,
  title,
  rightBadge,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  rightBadge?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={[
        "rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.56),rgba(2,8,23,0.72))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className,
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[0.56rem] uppercase tracking-[0.34em] text-slate-500">
            {eyebrow}
          </div>
          <h3 className="mt-2 text-[1.02rem] font-semibold text-white">
            {title}
          </h3>
        </div>
        {rightBadge ? (
          <div className="rounded-full border border-white/12 bg-white/[0.04] px-3 py-1 text-[0.58rem] font-semibold uppercase tracking-[0.28em] text-slate-300">
            {rightBadge}
          </div>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export default function WoloHeroTile() {
  const [pulse, setPulse] = useState<PulsePayload>({ ok: false });
  const [moved, setMoved] = useState<MovedPayload>({ ok: false });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [pulseRes, movedRes] = await Promise.all([
          fetch("/api/wolo/osmosis-pulse", { cache: "no-store" }),
          fetch("/api/wolo/moved24h", { cache: "no-store" }),
        ]);

        const pulseJson = pulseRes.ok
          ? ((await pulseRes.json()) as PulsePayload)
          : ({ ok: false } as PulsePayload);

        const movedJson = movedRes.ok
          ? ((await movedRes.json()) as MovedPayload)
          : ({ ok: false } as MovedPayload);

        if (!cancelled) {
          setPulse(pulseJson);
          setMoved(movedJson);
        }
      } catch {
        if (!cancelled) {
          setPulse({ ok: false });
          setMoved({ ok: false });
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

  const fdv = useMemo(() => {
    if (!Number.isFinite(pulse.priceUsd ?? NaN)) return undefined;
    return (pulse.priceUsd ?? 0) * FIXED_SUPPLY;
  }, [pulse.priceUsd]);

  return (
    <section className="relative overflow-hidden rounded-[2.35rem] border border-cyan-400/10 bg-slate-950/95 p-5 shadow-[0_30px_120px_rgba(2,8,23,0.46)] sm:p-6 xl:p-7">
      <div className="absolute inset-0 bg-[#030918]" />
      <div className="absolute inset-x-0 top-0 h-px bg-white/10" />
      <div className="absolute inset-y-0 right-0 w-px bg-cyan-200/10" />

      <div className="relative z-10 flex flex-wrap gap-3">
        <TopPill tone="gold">WoloChain</TopPill>
        <TopPill>1 validator live</TopPill>
      </div>

      <div className="relative z-10 mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.02fr)_minmax(430px,0.98fr)] xl:items-start">
        <div className="space-y-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <Image
              src="/legacy/wolo-logo-transparent.png"
              alt="WOLO"
              width={176}
              height={176}
              className="h-32 w-32 shrink-0 object-contain drop-shadow-[0_20px_45px_rgba(234,179,8,0.26)] sm:h-36 sm:w-36 xl:h-40 xl:w-40"
              priority
            />
            <div className="min-w-0">
              <div className="text-[0.68rem] uppercase tracking-[0.42em] text-amber-100/80">
                Fixed supply. Live balances.
              </div>
              <div className="mt-2">
                <div
                  className="text-[3.15rem] font-black uppercase leading-none tracking-[-0.05em] sm:text-[4rem]"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, #f7e291 0%, #efc95c 42%, #d4a63b 76%, #3b2207 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    filter: "drop-shadow(0 10px 26px rgba(0,0,0,0.28))",
                  }}
                >
                  <WoloHeroWordmark />
                </div>
                <div className="mt-1 text-[0.72rem] uppercase tracking-[0.46em] text-white/82">
                  WoloChain settlement rail
                </div>
              </div>
            </div>
          </div>

          <p className="max-w-[46rem] text-[1.02rem] leading-9 text-white/92 sm:text-[1.05rem]">
            <span className="font-semibold">WOLO</span> is the fixed-supply
            settlement rail for AoE2HD betting. One token, one hard 100M cap.
            Clean transfers, balances, and payout logic. Built for players
            deserving of a chain that is as sharp as the game.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              eyebrow="Supply"
              value="100,000,000 WOLO"
              sublabel="Fixed network hard cap"
            />
            <MetricCard
              eyebrow="Betting fee"
              value="2%"
              sublabel="Per settled book"
            />
            <MetricCard
              eyebrow="Fee split"
              value="1% / 1%"
              sublabel="Stakers / Treasury"
            />
            <MetricCard
              eyebrow="Validator set"
              value="1 live"
              sublabel="More operators wanted"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(13.5rem,1fr)_auto_auto] sm:items-center">
            <ActionLink href="https://aoe2war.com/wallet" variant="gold">
              <span className="-ml-1 grid h-[2.95rem] w-[2.95rem] shrink-0 place-items-center overflow-visible rounded-full">
                <Image
                  src="/legacy/wolo-logo-transparent.png"
                  alt="WOLO Wallet"
                  width={62}
                  height={62}
                  className="h-[3.08rem] w-[3.08rem] object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.26)]"
                />
              </span>
              <span className="pr-1.5 text-[1.02rem] font-semibold tracking-[-0.01em]">
                WOLO Wallet
              </span>
            </ActionLink>

            <ActionLink href="/bets" variant="dark">
              Open Bets
            </ActionLink>

            <ActionLink href="/contact-emaren" variant="dark">
              Become a Validator
            </ActionLink>
          </div>
        </div>

        <div className="xl:-mt-[3.375rem] xl:self-start">
          <WoloMarketPulseTile pulse={pulse} moved={moved} />
        </div>
      </div>

      <div className="relative z-10 mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.02fr)_minmax(430px,0.98fr)] xl:items-stretch">
        <SectionPanel
          eyebrow="Live value rail"
          title="Real price. Real FDV. Real book economics."
          rightBadge="Osmosis-fed"
          className="h-full"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ValueRailCard
              eyebrow="Spot"
              value={formatUsd(pulse.priceUsd, 6)}
              sublabel="Osmosis live price"
            />
            <ValueRailCard
              eyebrow="FDV"
              value={formatUsd(fdv, 0)}
              sublabel="100,000,000 × spot price"
            />
            <ValueRailCard
              eyebrow="Liquidity"
              value={formatUsd(pulse.liquidityUsd, 2)}
              sublabel="WOLO / USDC depth"
            />
            <ValueRailCard
              eyebrow="24h moved"
              value={formatWolo(moved.totalWolo)}
              sublabel={`${formatWhole(moved.transferCount)} transfers`}
            />
          </div>
        </SectionPanel>

        <SectionPanel
          eyebrow="Live chain facts"
          title="Chain brief"
          rightBadge="Fast read"
          className="h-full"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <ValueRailCard eyebrow="Chain ID" value="wolo-1" sublabel="Network identifier" />
            <ValueRailCard eyebrow="Ticker" value="WOLO" sublabel="Settlement token" />
            <ValueRailCard eyebrow="Base denom" value="uwolo" sublabel="Micro-denom" />
            <ValueRailCard eyebrow="Decimals" value="6" sublabel="Precision" />
            <div className="rounded-[1.1rem] border border-white/10 bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:col-span-2">
              <div className="text-[0.56rem] uppercase tracking-[0.34em] text-slate-500">
                Supply model
              </div>
              <div className="mt-2 text-[1.05rem] font-semibold leading-tight text-white">
                Fixed · 100,000,000 max
              </div>
              <div className="mt-1 text-xs text-slate-400">No inflation drift</div>
            </div>
          </div>
        </SectionPanel>
      </div>

      <div className="relative z-10 mt-5 space-y-4">
        <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,25,0.9),rgba(3,8,20,0.92))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="text-[0.56rem] uppercase tracking-[0.34em] text-slate-500">
                Fee rail
              </div>
              <h3 className="mt-2 text-[1.02rem] font-semibold text-white">
                Betting fees
              </h3>
              <p className="mt-3 text-[1.01rem] leading-8 text-slate-300">
                2% per settled book. 1% to stakers, 1% to Community Treasury.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <RailChip value="2% total" label="Per settled book" tone="gold" />
              <RailChip value="1% stakers" label="Validator-side reward" />
              <RailChip value="1% treasury" label="Community Treasury" tone="blue" />
            </div>
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,25,0.9),rgba(3,8,20,0.92))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-3xl">
              <div className="text-[0.56rem] uppercase tracking-[0.34em] text-slate-500">
                Chain rail
              </div>
              <h3 className="mt-2 text-[1.02rem] font-semibold text-white">
                Tx fees
              </h3>
              <p className="mt-3 text-[1.01rem] leading-8 text-slate-300">
                Chain fees follow validator economics. One live validator today,
                more wanted tomorrow. Real operators improve uptime, trust, and
                network resilience.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 xl:justify-end">
              <RailChip value="1 validator live" label="Current active lane" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
