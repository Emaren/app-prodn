"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CircleGauge,
  Database,
  Plus,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  FormEvent,
  useMemo,
  useState,
} from "react";

import type {
  OracleMarketView,
  OracleSnapshot,
} from "@/lib/oracle";
import type {
  TileViewMode,
} from "@/lib/tileViewPreferences";

type MutationMethod = "POST" | "PATCH";
type PremiumViewMode = Exclude<TileViewMode, "basic">;
type SortMode = "trending" | "closing" | "new";

type Props = {
  snapshot: OracleSnapshot;
  busy: boolean;
  viewMode: PremiumViewMode;
  onMutate: (
    method: MutationMethod,
    body: Record<string, unknown>,
    success: string,
  ) => Promise<boolean>;
  onSignIn: () => void;
};

const CATEGORY_TABS = [
  { key: "live", label: "Live" },
  { key: "growth", label: "Growth" },
  { key: "games", label: "Games" },
  { key: "streaming", label: "Streaming" },
  { key: "economy", label: "Economy" },
  { key: "forge", label: "Forge" },
  { key: "community", label: "Community" },
  { key: "resolved", label: "Resolved" },
] as const;

const ACTIVE_STATUSES = new Set([
  "approved",
  "trading",
  "paused",
  "locked",
  "resolving",
  "challenge",
]);

function fmt(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(parsed)
    : String(value);
}

function compact(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(parsed)
    : String(value);
}

function probability(bps: number) {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function datetimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function proposalDefaults(generatedAt: string) {
  const anchor = new Date(generatedAt);
  const base = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
  const closesAt = new Date(base.getTime() + 30 * 24 * 60 * 60_000);
  const resolvesAt = new Date(closesAt.getTime() + 60 * 60_000);
  return {
    question: "",
    category: "growth",
    closesAt: datetimeLocal(closesAt),
    resolvesAt: datetimeLocal(resolvesAt),
    sourceLabel: "",
    resolutionRule: "",
    voidRule: "",
  };
}

function sortMarkets(
  markets: OracleMarketView[],
  sort: SortMode,
) {
  return [...markets].sort((left, right) => {
    if (sort === "closing") {
      return new Date(left.closesAt).getTime() - new Date(right.closesAt).getTime();
    }
    if (sort === "new") {
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }
    if (right.uniqueForecasters !== left.uniqueForecasters) {
      return right.uniqueForecasters - left.uniqueForecasters;
    }
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export default function OraclePremiumFloor({
  snapshot,
  busy,
  viewMode,
  onMutate,
  onSignIn,
}: Props) {
  const [category, setCategory] = useState("live");
  const [sort, setSort] = useState<SortMode>("trending");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposal, setProposal] = useState(() => proposalDefaults(snapshot.generatedAt));

  const markets = useMemo(() => {
    const filtered = snapshot.markets.filter((market) => {
      if (category === "live") return ACTIVE_STATUSES.has(market.status);
      if (category === "resolved") {
        return market.status === "settled" || market.status === "voided";
      }
      return market.category === category;
    });
    return sortMarkets(filtered, sort);
  }, [category, snapshot.markets, sort]);

  const featured =
    markets[0] ??
    sortMarkets(
      snapshot.markets.filter((market) => ACTIVE_STATUSES.has(market.status)),
      "trending",
    )[0] ??
    snapshot.markets[0] ??
    null;

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot.viewer) {
      onSignIn();
      return;
    }

    const voidRule =
      proposal.voidRule.trim() ||
      "VOID if the named source is unavailable, materially ambiguous, or cannot prove the YES condition by the published resolution time.";

    const succeeded = await onMutate(
      "POST",
      {
        action: "proposal",
        question: proposal.question,
        category: proposal.category,
        outcomeType: "binary",
        closesAt: new Date(proposal.closesAt).toISOString(),
        resolvesAt: new Date(proposal.resolvesAt).toISOString(),
        sourceMetricKey: "user_submitted_source_v1",
        sourceLabel: proposal.sourceLabel,
        resolutionRule: proposal.resolutionRule,
        voidRule,
        maxPoolWolo: "100000",
      },
      "Market submitted to the Oracle floor.",
    );

    if (succeeded) {
      setProposal(proposalDefaults(new Date().toISOString()));
      setProposalOpen(false);
    }
  }

  return (
    <>
      <PremiumHero
        snapshot={snapshot}
        viewMode={viewMode}
        onPropose={() => setProposalOpen(true)}
      />

      <section
        id="markets"
        className="scroll-mt-24 space-y-5"
        data-oracle-premium-floor={viewMode}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.34em] text-cyan-100/48">
              Live probability
            </div>
            <h2 className="mt-2 font-serif text-3xl font-semibold text-white sm:text-4xl">
              Read the Kingdom in motion.
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              One clean probability field, a real history line, a published close,
              and an exact resolution rule.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortMode)}
              className="min-h-11 rounded-full border border-white/10 bg-[#060a12] px-4 text-xs font-bold text-white outline-none transition focus:border-cyan-200/30"
              aria-label="Sort Oracle markets"
            >
              <option value="trending">Trending</option>
              <option value="closing">Closing soon</option>
              <option value="new">Newest</option>
            </select>
            <button
              type="button"
              onClick={() => setProposalOpen(true)}
              className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-amber-100/20 bg-amber-300/[0.08] px-4 text-xs font-black text-amber-50 transition hover:border-amber-100/35 hover:bg-amber-300/[0.12]"
            >
              <Plus className="h-4 w-4" />
              Create market
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORY_TABS.map((tab) => {
            const active = tab.key === category;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setCategory(tab.key)}
                className={`min-h-9 cursor-pointer rounded-full border px-4 text-[10px] font-black uppercase tracking-[0.17em] transition ${
                  active
                    ? "border-cyan-100/35 bg-cyan-200 text-slate-950"
                    : "border-white/8 bg-white/[0.025] text-slate-500 hover:border-white/16 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {featured ? (
          <FeaturedMarket
            market={featured}
            extreme={viewMode === "extreme"}
          />
        ) : null}

        {markets.length > 0 ? (
          <div
            className={
              viewMode === "extreme"
                ? "grid gap-4 xl:grid-cols-3"
                : "grid gap-4 lg:grid-cols-2"
            }
          >
            {markets
              .filter((market) => market.publicId !== featured?.publicId)
              .map((market) => (
                <PremiumMarketCard
                  key={market.publicId}
                  market={market}
                />
              ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-white/10 bg-black/15 px-6 py-12 text-center text-sm text-slate-500">
            No markets match this lane yet.
          </div>
        )}
      </section>

      <ProposalDesk
        open={proposalOpen}
        proposal={proposal}
        busy={busy}
        viewerLabel={snapshot.viewer?.displayName ?? null}
        pending={snapshot.proposals}
        onChange={setProposal}
        onClose={() => setProposalOpen(false)}
        onSubmit={submitProposal}
        onSignIn={onSignIn}
      />
    </>
  );
}

function PremiumHero({
  snapshot,
  viewMode,
  onPropose,
}: {
  snapshot: OracleSnapshot;
  viewMode: PremiumViewMode;
  onPropose: () => void;
}) {
  const extreme = viewMode === "extreme";
  return (
    <section
      className={`relative isolate overflow-hidden rounded-[2.35rem] border border-amber-100/16 bg-[#03050a] shadow-[0_42px_125px_rgba(0,0,0,0.5)] ${
        extreme ? "min-h-[34rem]" : "min-h-[31rem]"
      }`}
    >
      <Image
        src="/oracle/oracle-hero-bg.webp"
        alt="The Oracle chamber and its celestial brass prediction instrument"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center brightness-[1.12] saturate-[1.08]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,4,10,0.86)_0%,rgba(2,4,10,0.62)_34%,rgba(2,4,10,0.16)_66%,rgba(2,4,10,0.05)_100%),linear-gradient(180deg,rgba(2,4,10,0.04),rgba(2,4,10,0.12)_58%,rgba(2,4,10,0.86)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_69%_45%,rgba(96,165,250,0.10),transparent_20%),radial-gradient(circle_at_82%_22%,rgba(251,191,36,0.08),transparent_24%)]" />
      <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-gradient-to-r from-transparent via-amber-100/48 to-transparent" />

      <div className="absolute left-6 top-6 z-20 flex flex-wrap gap-2 sm:left-9 sm:top-8">
        <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/20 bg-black/38 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-amber-50 backdrop-blur-md">
          <Sparkles className="h-3.5 w-3.5" />
          The Oracle
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100/16 bg-black/38 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-100 backdrop-blur-md">
          <ShieldCheck className="h-3.5 w-3.5" />
          Exact rules
        </span>
      </div>

      <div className="absolute bottom-8 left-6 z-20 max-w-[44rem] sm:bottom-10 sm:left-9 lg:left-12">
        <p className="text-[10px] font-black uppercase tracking-[0.46em] text-slate-300/72">
          AoE2WAR presents
        </p>
        <h1 className="mt-3 font-serif text-5xl font-semibold leading-none tracking-[-0.055em] text-white drop-shadow-[0_8px_35px_rgba(0,0,0,0.82)] sm:text-7xl">
          The Oracle
        </h1>
        <p className="mt-4 max-w-[34rem] font-serif text-xl leading-8 text-slate-100 sm:text-2xl">
          The future is not merely awaited. It is priced.
        </p>
        <p className="mt-3 max-w-[36rem] text-sm leading-6 text-slate-300">
          Pick a side. Watch the probability move. Resolve against one published source.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="#markets"
            className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-amber-100 px-6 text-sm font-black text-slate-950 shadow-[0_14px_38px_rgba(251,191,36,0.18)] transition hover:bg-white"
          >
            Open markets
            <ArrowRight className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onPropose}
            className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border border-white/18 bg-black/34 px-6 text-sm font-bold text-white backdrop-blur-md transition hover:border-amber-100/30 hover:bg-white/[0.07]"
          >
            <Plus className="h-4 w-4" />
            Create market
          </button>
        </div>
      </div>

      <div className="absolute bottom-8 right-6 z-20 hidden w-[25rem] grid-cols-2 gap-2 lg:grid xl:right-9">
        <HeroStat label="Live markets" value={fmt(snapshot.pulse.activeMarkets)} />
        <HeroStat label="Forecasters" value={fmt(snapshot.pulse.forecasters)} />
        <HeroStat label="Citizens" value={fmt(snapshot.pulse.registeredCitizens)} />
        <HeroStat label="Final battles" value={fmt(snapshot.pulse.verifiedBattles)} />
      </div>
    </section>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.05rem] border border-white/14 bg-black/48 px-4 py-3 backdrop-blur-lg">
      <div className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-lg font-black text-white">{value}</div>
    </div>
  );
}

function FeaturedMarket({
  market,
  extreme,
}: {
  market: OracleMarketView;
  extreme: boolean;
}) {
  const yes = probability(market.yesProbabilityBps);
  const no = probability(10_000 - market.yesProbabilityBps);

  return (
    <article
      className={`overflow-hidden rounded-[2rem] border border-white/10 bg-[#040811] shadow-[0_28px_90px_rgba(0,0,0,0.42)] ${
        extreme ? "grid xl:grid-cols-[minmax(0,2.4fr)_minmax(20rem,0.8fr)]" : "grid xl:grid-cols-[minmax(0,1.8fr)_minmax(19rem,0.8fr)]"
      }`}
    >
      <div className="min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-cyan-200/16 bg-cyan-300/[0.06] px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100">
            Featured
          </span>
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
            {market.category}
          </span>
          <span className="text-[9px] uppercase tracking-[0.14em] text-slate-600">
            closes {dateLabel(market.closesAt)}
          </span>
        </div>

        <h3 className="mt-4 max-w-4xl font-serif text-2xl font-semibold leading-tight text-white sm:text-3xl">
          {market.question}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          {market.summary}
        </p>

        <div className="mt-6">
          <ProbabilityChart
            market={market}
            height={extreme ? 310 : 270}
          />
        </div>
      </div>

      <div className="border-t border-white/8 bg-[linear-gradient(160deg,rgba(13,30,45,0.82),rgba(8,10,18,0.96)_52%,rgba(32,16,24,0.66))] p-5 sm:p-6 xl:border-l xl:border-t-0">
        <div className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
          Current probability
        </div>
        <div className="mt-2 text-5xl font-black tracking-[-0.05em] text-emerald-200">
          {yes}
        </div>
        <div className="mt-1 text-sm text-slate-500">YES</div>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link
            href={`/oracle/${market.slug}`}
            className="cursor-pointer rounded-xl border border-emerald-200/20 bg-emerald-300/[0.08] px-4 py-3 transition hover:border-emerald-100/36 hover:bg-emerald-300/[0.13]"
          >
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-100/62">
              YES
            </div>
            <div className="mt-1 text-xl font-black text-emerald-100">{yes}</div>
          </Link>
          <Link
            href={`/oracle/${market.slug}`}
            className="cursor-pointer rounded-xl border border-rose-200/18 bg-rose-300/[0.07] px-4 py-3 transition hover:border-rose-100/32 hover:bg-rose-300/[0.12]"
          >
            <div className="text-[9px] font-black uppercase tracking-[0.16em] text-rose-100/62">
              NO
            </div>
            <div className="mt-1 text-xl font-black text-rose-100">{no}</div>
          </Link>
        </div>

        <div className="mt-6 space-y-3 border-t border-white/8 pt-5">
          <Fact label="Forecasters" value={fmt(market.uniqueForecasters)} />
          <Fact
            label={market.liveMetric.label}
            value={market.liveMetric.value === null ? "—" : compact(market.liveMetric.value)}
          />
          <Fact label="Resolution source" value={market.sourceLabel} />
        </div>

        <Link
          href={`/oracle/${market.slug}`}
          className="mt-6 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 text-xs font-black text-white transition hover:border-cyan-100/24 hover:bg-white/[0.08]"
        >
          Open market
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

function PremiumMarketCard({ market }: { market: OracleMarketView }) {
  return (
    <Link
      href={`/oracle/${market.slug}`}
      className="group block cursor-pointer overflow-hidden rounded-[1.65rem] border border-white/9 bg-[linear-gradient(145deg,rgba(7,11,21,0.96),rgba(8,12,22,0.86))] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.28)] transition hover:-translate-y-0.5 hover:border-cyan-100/20"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/55">
          {market.category}
        </span>
        <span className="text-[9px] uppercase tracking-[0.12em] text-slate-600">
          {dateLabel(market.closesAt)}
        </span>
      </div>
      <h3 className="mt-3 min-h-[3.5rem] text-lg font-semibold leading-7 text-white">
        {market.question}
      </h3>
      <div className="mt-4">
        <ProbabilityChart market={market} height={150} compact />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <CardStat label="YES" value={probability(market.yesProbabilityBps)} tone="yes" />
        <CardStat label="NO" value={probability(10_000 - market.yesProbabilityBps)} tone="no" />
        <CardStat label="Citizens" value={fmt(market.uniqueForecasters)} />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/7 pt-4">
        <span className="truncate text-xs text-slate-500">{market.sourceLabel}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-600 transition group-hover:translate-x-1 group-hover:text-cyan-100" />
      </div>
    </Link>
  );
}

function ProbabilityChart({
  market,
  height,
  compact: small = false,
}: {
  market: OracleMarketView;
  height: number;
  compact?: boolean;
}) {
  const width = 900;
  const padX = small ? 20 : 40;
  const padY = small ? 16 : 28;
  const source =
    market.probabilityHistory.length > 0
      ? market.probabilityHistory
      : [
          {
            at: market.createdAt,
            yesProbabilityBps: market.yesProbabilityBps,
            yesWeight: 0,
            noWeight: 0,
          },
        ];
  const points =
    source.length === 1
      ? [source[0], { ...source[0], at: market.updatedAt }]
      : source;
  const times = points.map((entry) => new Date(entry.at).getTime());
  const minimum = Math.min(...times);
  const maximum = Math.max(...times);
  const span = Math.max(1, maximum - minimum);
  const x = (time: number) =>
    padX + ((time - minimum) / span) * (width - padX * 2);
  const y = (bps: number) =>
    padY + (1 - bps / 10_000) * (height - padY * 2);
  const yesPoints = points
    .map((entry, index) => `${x(times[index]).toFixed(1)},${y(entry.yesProbabilityBps).toFixed(1)}`)
    .join(" ");
  const noPoints = points
    .map((entry, index) => `${x(times[index]).toFixed(1)},${y(10_000 - entry.yesProbabilityBps).toFixed(1)}`)
    .join(" ");

  return (
    <div className="relative overflow-hidden rounded-[1.35rem] border border-white/7 bg-[linear-gradient(180deg,rgba(5,12,22,0.96),rgba(2,6,12,0.98))]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_70%,rgba(34,211,238,0.06),transparent_30%),radial-gradient(circle_at_78%_30%,rgba(244,63,94,0.055),transparent_28%)]" />
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={small ? "relative h-[150px] w-full" : "relative h-[270px] w-full sm:h-[310px]"}
        role="img"
        aria-label={`Probability history for ${market.question}`}
      >
        <defs>
          <filter id={`oracle-yes-glow-${market.publicId}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={small ? "4" : "6"} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`oracle-no-glow-${market.publicId}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={small ? "3" : "5"} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[25, 50, 75].map((value) => {
          const lineY = y(value * 100);
          return (
            <line
              key={value}
              x1={padX}
              x2={width - padX}
              y1={lineY}
              y2={lineY}
              stroke="rgba(255,255,255,0.055)"
              strokeWidth="1"
            />
          );
        })}

        <polyline
          points={yesPoints}
          fill="none"
          stroke="rgb(52 211 153)"
          strokeWidth={small ? 3 : 4}
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#oracle-yes-glow-${market.publicId})`}
        />
        <polyline
          points={noPoints}
          fill="none"
          stroke="rgb(251 113 133)"
          strokeWidth={small ? 2.3 : 3}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.78"
          filter={`url(#oracle-no-glow-${market.publicId})`}
        />
      </svg>

      {!small ? (
        <div className="relative -mt-2 flex items-center justify-between px-4 pb-3 text-[9px] uppercase tracking-[0.16em] text-slate-600">
          <span>{dateLabel(points[0].at)}</span>
          <span className="flex items-center gap-3">
            <span className="text-emerald-200/70">YES</span>
            <span className="text-rose-200/65">NO</span>
          </span>
          <span>Now</span>
        </div>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="max-w-[13rem] text-right font-semibold text-slate-300">{value}</span>
    </div>
  );
}

function CardStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "yes" | "no";
}) {
  return (
    <div className="rounded-xl border border-white/7 bg-black/24 px-3 py-2">
      <div
        className={`text-[8px] font-black uppercase tracking-[0.15em] ${
          tone === "yes"
            ? "text-emerald-200/58"
            : tone === "no"
              ? "text-rose-200/58"
              : "text-slate-600"
        }`}
      >
        {label}
      </div>
      <div className="mt-1 text-sm font-black text-white">{value}</div>
    </div>
  );
}

function ProposalDesk({
  open,
  proposal,
  busy,
  viewerLabel,
  pending,
  onChange,
  onClose,
  onSubmit,
  onSignIn,
}: {
  open: boolean;
  proposal: ReturnType<typeof proposalDefaults>;
  busy: boolean;
  viewerLabel: string | null;
  pending: OracleSnapshot["proposals"];
  onChange: (proposal: ReturnType<typeof proposalDefaults>) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSignIn: () => void;
}) {
  const field = (
    key: keyof ReturnType<typeof proposalDefaults>,
    value: string,
  ) => onChange({ ...proposal, [key]: value });

  return (
    <section className="overflow-hidden rounded-[2rem] border border-amber-100/14 bg-[linear-gradient(145deg,rgba(33,22,14,0.88),rgba(7,10,18,0.96)_45%,rgba(22,12,34,0.82))] shadow-[0_28px_90px_rgba(0,0,0,0.34)]">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[0.78fr_1.22fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-100/16 bg-amber-300/[0.06] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-100">
            <CircleGauge className="h-3.5 w-3.5" />
            Citizen market desk
          </div>
          <h2 className="mt-4 max-w-md font-serif text-3xl font-semibold leading-tight text-white">
            Ask one question the Kingdom can actually settle.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
            Question. Close. Source. Exact YES rule. That is the market.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <DeskFact icon={CalendarClock} label="Close first" copy="No moving the finish line after trading begins." />
            <DeskFact icon={Database} label="Name the source" copy="The resolution source is part of the market contract." />
            <DeskFact icon={ShieldCheck} label="Write the YES rule" copy="A stranger should be able to resolve it from the same evidence." />
          </div>

          <button
            type="button"
            onClick={() => (viewerLabel ? (open ? onClose() : null) : onSignIn())}
            className="mt-6 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-amber-100 px-5 text-xs font-black text-slate-950 transition hover:bg-white"
          >
            {viewerLabel ? (open ? "Close desk" : "Create market") : "Sign in to create"}
            {!open ? <ArrowRight className="h-4 w-4" /> : <X className="h-4 w-4" />}
          </button>
        </div>

        {open ? (
          <form onSubmit={(event) => void onSubmit(event)} className="rounded-[1.5rem] border border-white/9 bg-black/24 p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  Market question
                </span>
                <input
                  required
                  minLength={12}
                  maxLength={240}
                  value={proposal.question}
                  onChange={(event) => field("question", event.target.value)}
                  placeholder="Will AoE2WAR reach 3,000 registered citizens before October 1?"
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#050810] px-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-200/28"
                />
              </label>

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  Category
                </span>
                <select
                  value={proposal.category}
                  onChange={(event) => field("category", event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#050810] px-4 text-sm text-white outline-none focus:border-cyan-200/28"
                >
                  {CATEGORY_TABS.filter((tab) => !["live", "resolved"].includes(tab.key)).map((tab) => (
                    <option key={tab.key} value={tab.key}>{tab.label}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  Resolution source
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={proposal.sourceLabel}
                  onChange={(event) => field("sourceLabel", event.target.value)}
                  placeholder="Kingdom Metrics Ledger"
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#050810] px-4 text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-200/28"
                />
              </label>

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  Trading closes
                </span>
                <input
                  required
                  type="datetime-local"
                  value={proposal.closesAt}
                  onChange={(event) => field("closesAt", event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#050810] px-4 text-sm text-white outline-none focus:border-cyan-200/28"
                />
              </label>

              <label>
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  Resolve by
                </span>
                <input
                  required
                  type="datetime-local"
                  value={proposal.resolvesAt}
                  onChange={(event) => field("resolvesAt", event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#050810] px-4 text-sm text-white outline-none focus:border-cyan-200/28"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  YES resolves when
                </span>
                <textarea
                  required
                  minLength={20}
                  maxLength={4000}
                  value={proposal.resolutionRule}
                  onChange={(event) => field("resolutionRule", event.target.value)}
                  placeholder="YES if the named source reports..."
                  className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-[#050810] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-cyan-200/28"
                />
              </label>

              <label className="sm:col-span-2">
                <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                  VOID only if needed
                </span>
                <textarea
                  maxLength={4000}
                  value={proposal.voidRule}
                  onChange={(event) => field("voidRule", event.target.value)}
                  placeholder="Leave blank to use the standard unavailable-or-ambiguous-source rule."
                  className="mt-2 min-h-20 w-full resize-y rounded-xl border border-white/10 bg-[#050810] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 focus:border-cyan-200/28"
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
              <span className="text-[10px] text-slate-600">
                Signed-in citizens can create. Resolution rules stay public.
              </span>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-amber-100 px-5 text-xs font-black text-slate-950 transition hover:bg-white disabled:cursor-wait disabled:opacity-50"
              >
                {busy ? "Submitting…" : "Submit market"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-[1.5rem] border border-white/8 bg-black/18 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-600">
                  Upcoming citizen markets
                </div>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  The slate stays small and readable.
                </h3>
              </div>
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-xs font-bold text-slate-400">
                {pending.length}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {pending.slice(0, 5).map((item) => (
                <div
                  key={item.publicId}
                  className="rounded-xl border border-white/7 bg-white/[0.025] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-sm font-semibold leading-5 text-slate-200">
                      {item.question}
                    </span>
                    <span className="shrink-0 text-[8px] font-black uppercase tracking-[0.15em] text-amber-100/55">
                      {item.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] text-slate-600">
                    {item.sourceLabel}
                  </div>
                </div>
              ))}
              {pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/8 px-4 py-8 text-center text-sm text-slate-600">
                  No citizen markets are waiting.
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function DeskFact({
  icon: Icon,
  label,
  copy,
}: {
  icon: typeof CalendarClock;
  label: string;
  copy: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-black/20 p-4">
      <Icon className="h-4 w-4 text-amber-100/70" />
      <div className="mt-3 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <p className="mt-1 text-xs leading-5 text-slate-400">{copy}</p>
    </div>
  );
}
