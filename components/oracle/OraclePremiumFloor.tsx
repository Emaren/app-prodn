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
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

type MutationMethod = "POST" | "PATCH";
type PremiumViewMode = Exclude<TileViewMode, "basic">;
type SortMode = "trending" | "closing" | "new";

type Props = {
  snapshot: OracleSnapshot;
  busy: boolean;
  viewMode: PremiumViewMode;
  setViewMode: (mode: TileViewMode) => void;
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
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
    timeZoneName: "short",
  }).format(date);
}

function datetimeLocal(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Edmonton",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
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
  setViewMode,
  onMutate,
  onSignIn,
}: Props) {
  const [category, setCategory] = useState("live");
  const [sort, setSort] = useState<SortMode>("trending");
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
    }
  }

  const focusProposalDesk = () => {
    document
      .getElementById("oracle-create-market")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <PremiumHero
        snapshot={snapshot}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onPropose={focusProposalDesk}
      />

      <section
        id="markets"
        className="scroll-mt-24 space-y-5"
        data-oracle-premium-floor={viewMode}
      >
        <div className="flex flex-wrap items-center justify-end gap-2">
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
            onClick={focusProposalDesk}
            className="oracle-arcane-button inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 text-xs font-black"
          >
            <Plus className="h-4 w-4" />
            Create market
          </button>
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
                    ? "border-cyan-200/34 bg-cyan-300/[0.10] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_20px_rgba(34,211,238,0.08)]"
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
        proposal={proposal}
        busy={busy}
        viewerLabel={snapshot.viewer?.displayName ?? null}
        pending={snapshot.proposals}
        onChange={setProposal}
        onSubmit={submitProposal}
        onSignIn={onSignIn}
      />
    </>
  );
}

function PremiumHero({
  snapshot,
  viewMode,
  setViewMode,
  onPropose,
}: {
  snapshot: OracleSnapshot;
  viewMode: PremiumViewMode;
  setViewMode: (mode: TileViewMode) => void;
  onPropose: () => void;
}) {
  if (viewMode === "advanced") {
    return (
      <section
        className="relative overflow-hidden rounded-[2.35rem] border border-cyan-100/13 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.14),transparent_28%),linear-gradient(145deg,#061521,#060912_57%,#120a05)] p-6 shadow-[0_32px_110px_rgba(0,0,0,0.38)] sm:p-9 lg:p-10"
        data-oracle-advanced-hero="workshop-advanced-exact"
      >
        <div
          className="relative min-h-[16rem] aspect-[16/7] overflow-hidden -mx-6 -mt-6 mb-8 border-b border-cyan-100/16 bg-[#020711] shadow-[0_30px_90px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(255,255,255,0.035)] sm:min-h-[20rem] sm:-mx-9 sm:-mt-9 sm:mb-[2.35rem] lg:min-h-[24rem] lg:-mx-10 lg:-mt-10 lg:mb-10"
          data-oracle-advanced-banner="workshop-advanced-exact"
        >
          <Image
            src="/oracle/oracle-hero-bg.webp"
            alt="The Oracle chamber and its celestial brass prediction instrument"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1200px"
            className="object-cover object-[68%_center] brightness-[1.2] saturate-[1.08] contrast-[1.03]"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(2,6,23,0.14)_48%,rgba(2,6,23,0.72)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.10),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(56,189,248,0.12),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-[8%] bottom-0 h-px bg-gradient-to-r from-transparent via-amber-100/32 to-transparent" />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-100/16 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-50">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.6)]" />
              The Oracle is open
            </div>

            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.38em] text-cyan-100/55">
              The Oracle · Advanced
            </div>
            <h1 className="mt-3 font-serif text-5xl leading-[0.94] text-white sm:text-7xl">
              The Oracle
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              The future is not merely awaited. It is priced. Pick a side, watch the probability move, and resolve against one published source.
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="#markets"
                className="oracle-wolo-button group inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-6 text-sm font-black"
              >
                Open markets
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <button
                type="button"
                onClick={onPropose}
                className="oracle-arcane-button inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-6 text-sm font-black"
              >
                <Plus className="h-4 w-4" />
                Create market
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat label="Live markets" value={fmt(snapshot.pulse.activeMarkets)} />
          <HeroStat label="Forecasters" value={fmt(snapshot.pulse.forecasters)} />
          <HeroStat label="Citizens" value={fmt(snapshot.pulse.registeredCitizens)} />
          <HeroStat label="Final battles" value={fmt(snapshot.pulse.verifiedBattles)} />
        </div>
      </section>
    );
  }

  const resolvedMarkets = snapshot.markets.filter(
    (market) => market.status === "settled" || market.status === "voided",
  ).length;

  return (
    <div
      className="mx-auto w-full max-w-[90rem]"
      data-oracle-extreme-frame="workshop-advanced-width"
    >
      <section
        className="oracle-workshop-a-shell relative overflow-hidden rounded-[2.35rem] border border-cyan-100/13 bg-[radial-gradient(circle_at_12%_0%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_88%_12%,rgba(251,191,36,0.14),transparent_28%),linear-gradient(145deg,#061521,#060912_57%,#120a05)] p-6 shadow-[0_32px_110px_rgba(0,0,0,0.38)] sm:p-9 lg:p-10"
        data-oracle-extreme-hero="workshop-advanced-exact"
      >
        <div
          className="oracle-workshop-a-banner"
          data-oracle-extreme-banner="workshop-advanced-exact"
          role="img"
          aria-label="The Oracle chamber and its celestial brass prediction instrument"
        >
          <Image
            src="/oracle/oracle-hero-bg.webp"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 1200px"
            className="object-cover object-center"
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.04),rgba(2,6,23,0.14)_48%,rgba(2,6,23,0.72)_100%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(251,191,36,0.10),transparent_30%),radial-gradient(circle_at_82%_16%,rgba(56,189,248,0.12),transparent_30%)]" />
          <div className="pointer-events-none absolute inset-x-[8%] bottom-0 h-px bg-gradient-to-r from-transparent via-amber-100/32 to-transparent" />
        </div>

        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-amber-100/16 bg-amber-300/[0.07] px-4 py-2 text-[10px] font-bold uppercase tracking-[0.28em] text-amber-50">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.6)]" />
              The Oracle is open
            </div>

            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.38em] text-cyan-100/55">
              The Oracle · Extreme
            </div>
            <h1 className="mt-3 font-serif text-5xl leading-[0.94] text-white sm:text-7xl">
              The Oracle
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              The future is not merely awaited. It is priced. Pick a side, watch the probability move, and resolve against one published source.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <a
                href="#markets"
                className="oracle-wolo-button group inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 text-xs font-black"
              >
                Open markets
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </a>
              <button
                type="button"
                onClick={onPropose}
                className="oracle-arcane-button inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-5 text-xs font-black"
              >
                <Plus className="h-4 w-4" />
                Create market
              </button>
              <span className="inline-flex min-h-11 items-center rounded-full border border-cyan-100/12 bg-cyan-300/[0.05] px-4 text-xs text-cyan-50/80">
                Exact rules · public resolution
              </span>
            </div>
          </div>

          <OracleWorkshopViewToggle
            viewMode={viewMode}
            setViewMode={setViewMode}
          />
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <OracleWorkshopMetric label="Live markets" value={fmt(snapshot.pulse.activeMarkets)} accent />
          <OracleWorkshopMetric label="Forecasters" value={fmt(snapshot.pulse.forecasters)} />
          <OracleWorkshopMetric label="Citizens" value={fmt(snapshot.pulse.registeredCitizens)} />
          <OracleWorkshopMetric label="Final battles" value={fmt(snapshot.pulse.verifiedBattles)} />
          <OracleWorkshopMetric label="Active stake" value={compact(snapshot.pulse.stakedWolo)} alert />
          <OracleWorkshopMetric label="Resolved" value={fmt(resolvedMarkets)} accent />
        </div>
      </section>
    </div>
  );
}

function OracleWorkshopViewToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: PremiumViewMode;
  setViewMode: (mode: TileViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center rounded-full border border-amber-200/20 bg-[#050910]/90 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42)] backdrop-blur-xl"
      role="group"
      aria-label="Oracle view"
    >
      {TILE_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => setViewMode(mode)}
          aria-pressed={viewMode === mode}
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

function OracleWorkshopMetric({
  label,
  value,
  alert = false,
  accent = false,
}: {
  label: string;
  value: string;
  alert?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`oracle-workshop-a-metric rounded-[1.35rem] border p-4 ${
        alert
          ? "border-amber-200/16 bg-amber-300/[0.055]"
          : "border-white/9 bg-black/20"
      }`}
    >
      <div
        className={`text-2xl font-semibold ${
          alert
            ? "text-amber-100"
            : accent
              ? "text-cyan-100"
              : "text-white"
        }`}
      >
        {value}
      </div>
      <div className="mt-2 text-[9px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
    </div>
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
  proposal,
  busy,
  viewerLabel,
  pending,
  onChange,
  onSubmit,
  onSignIn,
}: {
  proposal: ReturnType<typeof proposalDefaults>;
  busy: boolean;
  viewerLabel: string | null;
  pending: OracleSnapshot["proposals"];
  onChange: (proposal: ReturnType<typeof proposalDefaults>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onSignIn: () => void;
}) {
  const field = (
    key: keyof ReturnType<typeof proposalDefaults>,
    value: string,
  ) => onChange({ ...proposal, [key]: value });

  return (
    <section
      id="oracle-create-market"
      className="scroll-mt-24 overflow-hidden rounded-[2.15rem] border border-cyan-100/14 bg-[radial-gradient(circle_at_8%_0%,rgba(251,191,36,0.10),transparent_28%),radial-gradient(circle_at_92%_10%,rgba(59,130,246,0.12),transparent_32%),linear-gradient(145deg,#080b12,#050811_58%,#10091a)] shadow-[0_32px_100px_rgba(0,0,0,0.38)]"
      data-oracle-create-market="always-visible"
    >
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[0.72fr_1.28fr] lg:p-8">
        <div className="flex flex-col">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-100/18 bg-amber-300/[0.06] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-amber-100">
            <CircleGauge className="h-3.5 w-3.5" />
            Citizen market desk
          </div>

          <h2 className="mt-5 max-w-md font-serif text-3xl font-semibold leading-tight text-white sm:text-4xl">
            Create a prediction market.
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-slate-400">
            Ask one measurable YES / NO question. Lock the close time, name the evidence, and publish the rule before anyone takes a side.
          </p>

          <div className="mt-6 grid gap-3">
            <DeskFact icon={CalendarClock} label="1 · Set the close" copy="Trading stops at the published time. The finish line cannot move later." />
            <DeskFact icon={Database} label="2 · Name the evidence" copy="Choose the ledger, page, result, or other source that can prove the answer." />
            <DeskFact icon={ShieldCheck} label="3 · Write the YES rule" copy="A stranger should be able to resolve the market from the same evidence." />
          </div>

          <div className="mt-6 rounded-[1.25rem] border border-white/8 bg-black/20 p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
              Who can create
            </div>
            <div className="mt-2 text-sm font-semibold text-white">
              {viewerLabel ? viewerLabel : "Any signed-in citizen"}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">
              Market proposals enter the same public review and rule trail regardless of who submits them.
            </p>
          </div>

          {pending.length > 0 ? (
            <div className="mt-5 rounded-[1.25rem] border border-cyan-100/10 bg-cyan-300/[0.035] p-4">
              <div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-100/55">
                {pending.length} pending citizen {pending.length === 1 ? "market" : "markets"}
              </div>
              <div className="mt-2 line-clamp-2 text-sm text-slate-300">
                {pending[0]?.question}
              </div>
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(event) => void onSubmit(event)}
          className="rounded-[1.65rem] border border-white/10 bg-[linear-gradient(180deg,rgba(3,7,15,0.88),rgba(2,5,12,0.96))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] sm:p-5"
        >
          <div className="flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100/55">
                New market
              </div>
              <div className="mt-1 text-sm font-semibold text-white">
                Publish the contract the Kingdom will resolve.
              </div>
            </div>
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
              YES / NO
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                Question
              </span>
              <input
                required
                minLength={12}
                maxLength={240}
                value={proposal.question}
                onChange={(event) => field("question", event.target.value)}
                placeholder="Will AoE2WAR reach 3,000 registered citizens before October 1?"
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030711] px-4 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-cyan-200/35 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.06)]"
              />
            </label>

            <label>
              <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                Category
              </span>
              <select
                value={proposal.category}
                onChange={(event) => field("category", event.target.value)}
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030711] px-4 text-sm text-white outline-none transition focus:border-cyan-200/35"
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
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030711] px-4 text-sm text-white outline-none placeholder:text-slate-700 transition focus:border-cyan-200/35"
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
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030711] px-4 text-sm text-white outline-none transition focus:border-cyan-200/35"
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
                className="mt-2 min-h-12 w-full rounded-xl border border-white/10 bg-[#030711] px-4 text-sm text-white outline-none transition focus:border-cyan-200/35"
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
                placeholder="YES if the named source reports the threshold was reached before the published deadline."
                className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-[#030711] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 transition focus:border-cyan-200/35 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.06)]"
              />
            </label>

            <label className="sm:col-span-2">
              <span className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">
                VOID rule · optional
              </span>
              <textarea
                maxLength={4000}
                value={proposal.voidRule}
                onChange={(event) => field("voidRule", event.target.value)}
                placeholder="Leave blank to use the standard unavailable-or-ambiguous-source rule."
                className="mt-2 min-h-20 w-full resize-y rounded-xl border border-white/10 bg-[#030711] px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-slate-700 transition focus:border-cyan-200/35"
              />
            </label>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/8 pt-4">
            <span className="max-w-md text-[10px] leading-5 text-slate-600">
              The question, source, close time, YES rule, and VOID rule become the public market contract.
            </span>

            <button
              type="submit"
              disabled={busy}
              className="oracle-wolo-button inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full px-6 text-xs font-black disabled:cursor-wait disabled:opacity-50"
            >
              {busy
                ? "Submitting…"
                : viewerLabel
                  ? "Submit market"
                  : "Sign in to submit"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          {!viewerLabel ? (
            <button
              type="button"
              onClick={onSignIn}
              className="mt-3 text-xs font-semibold text-cyan-100/70 underline decoration-cyan-200/25 underline-offset-4 transition hover:text-cyan-50"
            >
              Sign in before filling this out
            </button>
          ) : null}
        </form>
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
