"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  Coins,
  Database,
  FileCheck2,
  LockKeyhole,
  Plus,
  Scale,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Swords,
  UsersRound,
  WandSparkles,
  XCircle,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import OracleMarketDetail from "@/components/oracle/OracleMarketDetail";
import { useUserAuth } from "@/context/UserAuthContext";
import type {
  OracleMarketView,
  OracleProposalView,
  OracleSide,
  OracleSnapshot,
} from "@/lib/oracle";

type OracleClientProps = {
  initialSnapshot: OracleSnapshot;
  focusSlug?: string;
};

type MutationMethod = "POST" | "PATCH";
type SortMode = "trending" | "closing" | "new" | "conviction";

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

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "closing", label: "Closing soon" },
  { value: "new", label: "Newest" },
  { value: "conviction", label: "Most forecast" },
];

const ACTIVE_STATUSES = new Set(["approved", "trading", "paused", "locked", "resolving", "challenge"]);

function fmt(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(parsed)
    : String(value);
}

function compact(value: string | number) {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(parsed)
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
    timeZoneName: "short",
  }).format(date);
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function datetimeLocal(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
}

function proposalDefaults(generatedAt: string) {
  const anchor = new Date(generatedAt);
  const base = Number.isNaN(anchor.getTime()) ? new Date("2026-08-08T18:00:00.000Z") : anchor;
  const close = new Date(base.getTime() + 30 * 24 * 60 * 60_000);
  const resolve = new Date(close.getTime() + 10 * 60_000);
  return {
    question: "",
    category: "growth",
    outcomeType: "binary",
    closesAt: datetimeLocal(close),
    resolvesAt: datetimeLocal(resolve),
    sourceMetricKey: "",
    sourceLabel: "",
    resolutionRule: "",
    voidRule: "",
    maxPoolWolo: "100000",
  };
}

export default function OracleClient({ initialSnapshot, focusSlug }: OracleClientProps) {
  const { uid, loading: authLoading, loginWithSteam } = useUserAuth();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || (snapshot.viewer?.uid ?? null) === uid) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/oracle", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as OracleSnapshot;
        if (!cancelled) setSnapshot(payload);
      } catch {
        // The server snapshot remains useful when a background refresh fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, snapshot.viewer?.uid, uid]);

  async function mutate(method: MutationMethod, body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/oracle", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as OracleSnapshot | { detail?: string };
      if (!response.ok) {
        throw new Error("detail" in payload && typeof payload.detail === "string" ? payload.detail : "The Oracle action failed.");
      }
      setSnapshot(payload as OracleSnapshot);
      setMessage(success);
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "The Oracle action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function placePosition(input: { slug: string; side: OracleSide; amountMarks: number }) {
    return mutate(
      "POST",
      { action: "position", ...input },
      input.amountMarks === 0
        ? "Oracle Marks returned to your unallocated balance."
        : `${input.amountMarks} Oracle Marks now forecast ${input.side.toUpperCase()}.`,
    );
  }

  async function setMarketStatus(slug: string, status: string) {
    return mutate(
      "PATCH",
      { action: "market_status", slug, status },
      `Market lifecycle advanced to ${statusLabel(status)}.`,
    );
  }

  const focusedMarket = focusSlug
    ? snapshot.markets.find((market) => market.slug === focusSlug) ?? null
    : null;

  return (
    <main className="space-y-6 py-2 text-white sm:space-y-8 sm:py-4">
      <div aria-live="polite" className="fixed bottom-24 left-1/2 z-50 w-[min(92vw,40rem)] -translate-x-1/2 lg:bottom-6">
        {error ? (
          <div className="rounded-2xl border border-rose-200/25 bg-rose-950/95 px-4 py-3 text-sm font-semibold text-rose-50 shadow-2xl backdrop-blur-xl">{error}</div>
        ) : message ? (
          <div className="rounded-2xl border border-emerald-200/25 bg-emerald-950/95 px-4 py-3 text-sm font-semibold text-emerald-50 shadow-2xl backdrop-blur-xl">{message}</div>
        ) : null}
      </div>

      {focusedMarket ? (
        <OracleMarketDetail
          market={focusedMarket}
          markBalance={snapshot.markBalance}
          viewer={snapshot.viewer}
          busy={busy}
          standalone
          onPlacePosition={placePosition}
          onSetStatus={setMarketStatus}
          onSignIn={() => loginWithSteam(`/oracle/${encodeURIComponent(focusedMarket.slug)}`)}
        />
      ) : (
        <OracleMarketFloor
          snapshot={snapshot}
          busy={busy}
          onMutate={mutate}
          onPlacePosition={placePosition}
          onSignIn={() => loginWithSteam("/oracle")}
        />
      )}
    </main>
  );
}

function OracleMarketFloor({
  snapshot,
  busy,
  onMutate,
  onPlacePosition,
  onSignIn,
}: {
  snapshot: OracleSnapshot;
  busy: boolean;
  onMutate: (method: MutationMethod, body: Record<string, unknown>, success: string) => Promise<boolean>;
  onPlacePosition: (input: { slug: string; side: OracleSide; amountMarks: number }) => Promise<boolean>;
  onSignIn: () => void;
}) {
  const [category, setCategory] = useState("live");
  const [sort, setSort] = useState<SortMode>("trending");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposal, setProposal] = useState(() => proposalDefaults(snapshot.generatedAt));
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const markets = useMemo(() => {
    const filtered = snapshot.markets.filter((market) => {
      if (category === "live") return ACTIVE_STATUSES.has(market.status);
      if (category === "resolved") return market.status === "settled" || market.status === "voided";
      return market.category === category;
    });
    return [...filtered].sort((left, right) => {
      if (sort === "closing") return new Date(left.closesAt).getTime() - new Date(right.closesAt).getTime();
      if (sort === "new") return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (sort === "conviction") return right.placedMarks - left.placedMarks;
      return (right.uniqueForecasters * 100 + right.placedMarks) - (left.uniqueForecasters * 100 + left.placedMarks);
    });
  }, [category, snapshot.markets, sort]);

  async function submitProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot.viewer) {
      onSignIn();
      return;
    }
    const succeeded = await onMutate(
      "POST",
      {
        action: "proposal",
        ...proposal,
        closesAt: new Date(proposal.closesAt).toISOString(),
        resolvesAt: new Date(proposal.resolvesAt).toISOString(),
      },
      "Your exact-rule market is now on the citizen proposal slate.",
    );
    if (succeeded) {
      setProposal(proposalDefaults(new Date().toISOString()));
      setProposalOpen(false);
    }
  }

  async function reviewProposal(item: OracleProposalView, decision: "approved" | "rejected") {
    const succeeded = await onMutate(
      "PATCH",
      {
        action: "review_proposal",
        publicId: item.publicId,
        decision,
        reviewNote: reviewNotes[item.publicId] ?? "",
      },
      decision === "approved"
        ? "Proposal approved and opened as an Oracle Mark market."
        : "Proposal rejected with a Chronicle review event.",
    );
    if (succeeded) {
      setReviewNotes((current) => ({ ...current, [item.publicId]: "" }));
    }
  }

  return (
    <>
      <section className="relative isolate min-h-[39rem] overflow-hidden rounded-[2.25rem] border border-violet-100/16 bg-[#03040a] shadow-[0_42px_130px_rgba(0,0,0,0.58)] sm:min-h-[43rem]">
        <Image
          src="/oracle/oracle-hero-bg.webp"
          alt="The torchlit Oracle chamber overlooking the future of the AoE2WAR kingdom"
          fill
          priority
          sizes="(max-width: 1536px) 100vw, 1536px"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,3,10,0.96)_0%,rgba(2,3,10,0.86)_34%,rgba(2,3,10,0.44)_62%,rgba(2,3,10,0.15)_100%),linear-gradient(180deg,rgba(2,3,10,0.2),rgba(2,3,10,0.12)_48%,rgba(2,3,10,0.96)_100%)]" />
        <div className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-violet-100/65 to-transparent" />
        <div className="pointer-events-none absolute -left-24 top-20 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex min-h-[39rem] max-w-[48rem] flex-col justify-between p-6 sm:min-h-[43rem] sm:p-10 lg:p-12">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100/22 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-violet-100 backdrop-blur-md">
              <CircleGauge className="h-3.5 w-3.5" aria-hidden="true" />
              Oracle Pools · Season I
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-100/16 bg-black/45 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100 backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Exact rules in public
            </span>
          </div>

          <div className="pb-8">
            <p className="text-[10px] font-black uppercase tracking-[0.5em] text-violet-100/70">AoE2WAR presents</p>
            <h1 className="mt-4 font-serif text-5xl font-semibold leading-none tracking-[-0.055em] text-white drop-shadow-[0_8px_35px_rgba(0,0,0,0.88)] sm:text-7xl lg:text-8xl">
              The Oracle
            </h1>
            <p className="mt-5 max-w-[39rem] font-serif text-xl leading-8 text-slate-100 sm:text-2xl sm:leading-9">
              The future is not merely awaited. <span className="text-violet-200">It is priced.</span>
            </p>
            <p className="mt-4 max-w-[37rem] text-sm leading-6 text-slate-300 sm:text-base">
              Forecast growth, games, the WOLO economy, Kingdom Forge races, and civic milestones in beautiful low-liquidity YES / NO pools.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <a href="#markets" className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full bg-violet-200 px-6 py-3 text-sm font-black text-slate-950 shadow-[0_16px_40px_rgba(196,181,253,0.24)] transition hover:bg-white">
                Read the live markets
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
              <button type="button" onClick={() => setProposalOpen(true)} className="inline-flex min-h-[3.25rem] items-center justify-center gap-2 rounded-full border border-white/18 bg-black/35 px-6 py-3 text-sm font-bold text-white backdrop-blur-md transition hover:border-violet-100/35 hover:bg-white/[0.08]">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Propose a market
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-5 right-5 hidden w-[24rem] grid-cols-2 gap-2 lg:grid">
          <HeroMini label="Active markets" value={fmt(snapshot.pulse.activeMarkets)} />
          <HeroMini label="Oracle Marks placed" value={compact(snapshot.pulse.placedMarks)} />
          <HeroMini label="Citizens" value={fmt(snapshot.pulse.registeredCitizens)} />
          <HeroMini label="Forecasters" value={fmt(snapshot.pulse.forecasters)} />
        </div>
      </section>

      <section aria-label="Kingdom pulse" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <PulseTile icon={UsersRound} label="Registered citizens" value={fmt(snapshot.pulse.registeredCitizens)} note="Live app count" />
        <PulseTile icon={Swords} label="Final battles" value={fmt(snapshot.pulse.verifiedBattles)} note="Replay corpus" />
        <PulseTile icon={Coins} label="Active stake" value={`${compact(snapshot.pulse.stakedWolo)} WOLO`} note="App-indexed context" />
        <PulseTile icon={CircleGauge} label="Active markets" value={fmt(snapshot.pulse.activeMarkets)} note="Exact-rule pools" />
        <PulseTile icon={Sparkles} label={snapshot.viewer ? "Your Oracle Marks" : "Citizen allowance"} value={snapshot.viewer ? `${fmt(snapshot.markBalance.available)} free` : "1,000 Marks"} note={snapshot.viewer ? `${fmt(snapshot.markBalance.allocated)} allocated` : "Sign in once"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[2rem] border border-violet-100/13 bg-[radial-gradient(circle_at_0%_0%,rgba(124,58,237,0.16),transparent_32%),linear-gradient(145deg,#0a0d1b,#070913)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl border border-violet-100/16 bg-violet-300/10 p-3 text-violet-100"><WandSparkles className="h-5 w-5" aria-hidden="true" /></div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-200/65">How this first season works</p>
              <h2 className="mt-1 text-2xl font-semibold text-white">A full voice without a whale advantage.</h2>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Step number="01" title="Receive 1,000" body="Every signed account gets one non-transferable Oracle Mark balance." />
            <Step number="02" title="Choose conviction" body="Allocate across open YES / NO markets and update before close." />
            <Step number="03" title="Watch probability" body="Seed Marks and citizen positions continuously shape the visible odds." />
          </div>
        </div>

        <Link href="/bets" className="group rounded-[2rem] border border-amber-100/13 bg-[radial-gradient(circle_at_100%_0%,rgba(245,158,11,0.16),transparent_32%),linear-gradient(145deg,#17100a,#080a12)] p-5 transition hover:border-amber-100/25 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="rounded-2xl border border-amber-100/15 bg-amber-300/10 p-3 text-amber-100"><Swords className="h-5 w-5" aria-hidden="true" /></div>
            <ArrowRight className="h-5 w-5 text-amber-100/45 transition group-hover:translate-x-1 group-hover:text-amber-100" aria-hidden="true" />
          </div>
          <p className="mt-5 text-[10px] font-black uppercase tracking-[0.3em] text-amber-200/65">Two halls, two truths</p>
          <h2 className="mt-1 text-2xl font-semibold text-white">/bets follows battles.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">The Betting Hall handles warriors, teams, replay proof, and WOLO settlement. The Oracle forecasts what happens next in the Kingdom.</p>
        </Link>
      </section>

      <section id="markets" className="scroll-mt-24 space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.36em] text-violet-200/65">Market floor</p>
            <h2 className="mt-2 font-serif text-3xl font-semibold text-white sm:text-4xl">Price the next chapter.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Crowd probability comes from balanced seed liquidity plus every active citizen position.</p>
          </div>
          <label className="relative block min-w-[13rem]">
            <span className="sr-only">Sort markets</span>
            <select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} className="min-h-11 w-full appearance-none rounded-full border border-white/10 bg-[#080b16] px-4 pr-10 text-sm font-bold text-white outline-none transition focus:border-violet-200/35">
              {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
          </label>
        </div>

        <div className="-mx-3 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Oracle categories">
          <div className="flex min-w-max gap-2">
            {CATEGORY_TABS.map((tab) => (
              <button key={tab.key} type="button" role="tab" aria-selected={category === tab.key} onClick={() => setCategory(tab.key)} className={`min-h-10 rounded-full border px-4 text-xs font-black uppercase tracking-[0.16em] transition ${category === tab.key ? "border-violet-200/40 bg-violet-200 text-slate-950" : "border-white/10 bg-white/[0.035] text-slate-400 hover:border-violet-200/20 hover:text-white"}`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {markets.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {markets.map((market) => (
              <OracleMarketCard key={market.publicId} market={market} snapshot={snapshot} busy={busy} onPlace={onPlacePosition} onSignIn={onSignIn} />
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-white/12 bg-white/[0.025] p-8 text-center">
            <CircleGauge className="mx-auto h-8 w-8 text-violet-200/50" aria-hidden="true" />
            <h3 className="mt-3 text-xl font-semibold text-white">No markets in this lane yet.</h3>
            <p className="mt-2 text-sm text-slate-500">Propose the first exact question for this part of the Kingdom.</p>
          </div>
        )}
      </section>

      <section id="propose" className="scroll-mt-24 overflow-hidden rounded-[2.1rem] border border-amber-100/14 bg-[radial-gradient(circle_at_0%_0%,rgba(245,158,11,0.13),transparent_30%),radial-gradient(circle_at_100%_100%,rgba(124,58,237,0.16),transparent_34%),linear-gradient(145deg,#100d14,#070913)]">
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[0.8fr_1.2fr] lg:p-8">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-100/16 bg-amber-300/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100">
              <ScrollText className="h-3.5 w-3.5" aria-hidden="true" />
              Citizen market desk
            </span>
            <h2 className="mt-5 font-serif text-3xl font-semibold leading-tight text-white sm:text-4xl">Ask a question the Kingdom can actually settle.</h2>
            <p className="mt-4 text-sm leading-6 text-slate-300">A strong market freezes a close, source, YES rule, and void rule before anyone forecasts. Accepted markets open with balanced seed Marks.</p>
            <div className="mt-5 space-y-3">
              <DeskRule icon={FileCheck2} copy="YES / NO questions only in Season I" />
              <DeskRule icon={Database} copy="One named metric and authoritative source" />
              <DeskRule icon={Scale} copy="Exact resolution and failure conditions" />
              <DeskRule icon={LockKeyhole} copy="100 WOLO charter bond recorded; no chain funding in this release" />
            </div>
            <button type="button" onClick={() => setProposalOpen((open) => !open)} className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-amber-200 px-5 text-sm font-black text-slate-950 transition hover:bg-white sm:w-auto">
              {proposalOpen ? <XCircle className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              {proposalOpen ? "Close proposal desk" : "Propose a market"}
            </button>
          </div>

          <div className="min-w-0">
            {proposalOpen ? (
              <ProposalForm proposal={proposal} setProposal={setProposal} busy={busy} signedIn={Boolean(snapshot.viewer)} onSubmit={submitProposal} onSignIn={onSignIn} />
            ) : (
              <ProposalSlate proposals={snapshot.proposals} viewerIsAdmin={Boolean(snapshot.viewer?.isAdmin)} busy={busy} reviewNotes={reviewNotes} setReviewNotes={setReviewNotes} onReview={reviewProposal} />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function OracleMarketCard({ market, snapshot, busy, onPlace, onSignIn }: { market: OracleMarketView; snapshot: OracleSnapshot; busy: boolean; onPlace: (input: { slug: string; side: OracleSide; amountMarks: number }) => Promise<boolean>; onSignIn: () => void }) {
  const [side, setSide] = useState<OracleSide | null>(null);
  const [amount, setAmount] = useState(market.viewerPosition?.amountMarks ?? 100);
  const max = Math.min(1_000, snapshot.markBalance.available + (market.viewerPosition?.amountMarks ?? 0));
  const open = market.status === "trading" && new Date(market.closesAt).getTime() > Date.now();

  async function place() {
    if (!snapshot.viewer) {
      onSignIn();
      return;
    }
    if (!side) return;
    const normalized = Math.max(1, Math.min(max, Math.round(amount)));
    if (await onPlace({ slug: market.slug, side, amountMarks: normalized })) setSide(null);
  }

  return (
    <article className="group relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_100%_0%,rgba(124,58,237,0.1),transparent_30%),linear-gradient(145deg,#0a0d1a,#070914)] p-5 transition hover:-translate-y-0.5 hover:border-violet-200/20 hover:shadow-[0_26px_80px_rgba(3,7,18,0.42)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-[0.2em]">
          <span className="rounded-full border border-violet-200/15 bg-violet-300/8 px-2.5 py-1 text-violet-100">{market.category}</span>
          <span className="rounded-full border border-white/10 bg-white/[0.035] px-2.5 py-1 text-slate-400">{statusLabel(market.status)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500"><CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> {dateLabel(market.closesAt)}</div>
      </div>

      <Link href={`/oracle/${encodeURIComponent(market.slug)}`} className="mt-5 block focus:outline-none focus:ring-2 focus:ring-violet-200/50">
        <h3 className="text-xl font-semibold leading-7 text-white transition group-hover:text-violet-100 sm:text-2xl">{market.question}</h3>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-400">{market.summary}</p>
      </Link>

      <div className="mt-5 rounded-[1.25rem] border border-white/8 bg-black/20 p-3.5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/65">YES probability</div>
            <div className="mt-1 text-3xl font-black text-emerald-200">{probability(market.yesProbabilityBps)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-rose-200/65">NO</div>
            <div className="mt-1 text-xl font-black text-rose-200">{probability(10_000 - market.yesProbabilityBps)}</div>
          </div>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-rose-400/55"><div className="h-full bg-emerald-400" style={{ width: `${market.yesProbabilityBps / 100}%` }} /></div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <CardFact label={market.liveMetric.label} value={market.liveMetric.value === null ? "—" : compact(market.liveMetric.value)} />
        <CardFact label="Citizen Marks" value={compact(market.placedMarks)} />
        <CardFact label="Forecasters" value={fmt(market.uniqueForecasters)} />
      </div>

      {side ? (
        <div className={`mt-4 rounded-[1.25rem] border p-3.5 ${side === "yes" ? "border-emerald-200/18 bg-emerald-300/[0.055]" : "border-rose-200/18 bg-rose-300/[0.055]"}`}>
          <div className="flex items-center justify-between gap-3">
            <span className={`text-xs font-black uppercase tracking-[0.2em] ${side === "yes" ? "text-emerald-200" : "text-rose-200"}`}>{side} forecast</span>
            <button type="button" onClick={() => setSide(null)} className="text-xs text-slate-500 hover:text-white">Cancel</button>
          </div>
          <div className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor={`quick-${market.slug}`}>Oracle Marks</label>
            <input id={`quick-${market.slug}`} type="number" min={1} max={Math.max(1, max)} value={amount} onChange={(event) => setAmount(Number(event.target.value))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#050711] px-3 text-sm font-bold text-white outline-none focus:border-violet-200/35" />
            <button type="button" onClick={() => void place()} disabled={busy || !open || (Boolean(snapshot.viewer) && max < 1)} className={`min-h-11 rounded-xl px-4 text-sm font-black text-slate-950 transition disabled:opacity-45 ${side === "yes" ? "bg-emerald-300 hover:bg-emerald-200" : "bg-rose-300 hover:bg-rose-200"}`}>{snapshot.viewer ? "Commit" : "Sign in"}</button>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{snapshot.viewer ? `${fmt(max)} Marks available for this market` : "Receive 1,000 non-transferable Marks after sign-in"}</p>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" disabled={!open} onClick={() => setSide("yes")} className="min-h-12 rounded-xl border border-emerald-200/18 bg-emerald-300/10 text-sm font-black text-emerald-100 transition hover:bg-emerald-300/18 disabled:opacity-40">Forecast YES</button>
          <button type="button" disabled={!open} onClick={() => setSide("no")} className="min-h-12 rounded-xl border border-rose-200/18 bg-rose-300/10 text-sm font-black text-rose-100 transition hover:bg-rose-300/18 disabled:opacity-40">Forecast NO</button>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/8 pt-4">
        <div className="text-xs text-slate-500">Source: <span className="text-slate-300">{market.sourceLabel}</span></div>
        <Link href={`/oracle/${encodeURIComponent(market.slug)}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-200 transition hover:text-white">Rules & detail <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
      </div>
    </article>
  );
}

function ProposalForm({ proposal, setProposal, busy, signedIn, onSubmit, onSignIn }: { proposal: ReturnType<typeof proposalDefaults>; setProposal: React.Dispatch<React.SetStateAction<ReturnType<typeof proposalDefaults>>>; busy: boolean; signedIn: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onSignIn: () => void }) {
  function field<K extends keyof typeof proposal>(key: K, value: (typeof proposal)[K]) {
    setProposal((current) => ({ ...current, [key]: value }));
  }
  return (
    <form onSubmit={onSubmit} className="rounded-[1.6rem] border border-white/10 bg-black/25 p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Market question" wide><input required minLength={12} maxLength={240} value={proposal.question} onChange={(event) => field("question", event.target.value)} placeholder="Will the Kingdom reach…?" className={inputClass} /></Field>
        <Field label="Category"><select value={proposal.category} onChange={(event) => field("category", event.target.value)} className={inputClass}>{["growth", "games", "streaming", "economy", "forge", "community"].map((category) => <option key={category}>{category}</option>)}</select></Field>
        <Field label="Outcome"><input value="YES / NO · binary" disabled className={`${inputClass} opacity-70`} /></Field>
        <Field label="Forecasting closes"><input required type="datetime-local" value={proposal.closesAt} onChange={(event) => field("closesAt", event.target.value)} className={inputClass} /></Field>
        <Field label="Resolution time"><input required type="datetime-local" value={proposal.resolvesAt} onChange={(event) => field("resolvesAt", event.target.value)} className={inputClass} /></Field>
        <Field label="Metric key"><input required minLength={3} maxLength={80} value={proposal.sourceMetricKey} onChange={(event) => field("sourceMetricKey", event.target.value)} placeholder="verified_identity_count_v1" className={inputClass} /></Field>
        <Field label="Authoritative source"><input required minLength={3} maxLength={160} value={proposal.sourceLabel} onChange={(event) => field("sourceLabel", event.target.value)} placeholder="Kingdom Metrics Ledger" className={inputClass} /></Field>
        <Field label="Future WOLO market ceiling" wide><input required type="number" min={1000} max={100000000} step={1000} value={proposal.maxPoolWolo} onChange={(event) => field("maxPoolWolo", event.target.value)} className={inputClass} /></Field>
        <Field label="Exact YES rule" wide><textarea required minLength={20} maxLength={4000} value={proposal.resolutionRule} onChange={(event) => field("resolutionRule", event.target.value)} placeholder="YES resolves if… Include the threshold, snapshot, and UTC window." className={`${inputClass} min-h-28 resize-y py-3`} /></Field>
        <Field label="Exact void rule" wide><textarea required minLength={20} maxLength={4000} value={proposal.voidRule} onChange={(event) => field("voidRule", event.target.value)} placeholder="VOID if the authoritative source cannot…" className={`${inputClass} min-h-24 resize-y py-3`} /></Field>
      </div>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">Submitting records a 100 WOLO charter bond as <strong className="text-slate-300">not funded</strong>. No wallet or chain movement occurs.</p>
        {signedIn ? (
          <button type="submit" disabled={busy} className="min-h-12 shrink-0 rounded-full bg-amber-200 px-6 text-sm font-black text-slate-950 transition hover:bg-white disabled:opacity-45">Submit exact market</button>
        ) : (
          <button type="button" onClick={onSignIn} className="min-h-12 shrink-0 rounded-full bg-amber-200 px-6 text-sm font-black text-slate-950 transition hover:bg-white">Sign in to propose</button>
        )}
      </div>
    </form>
  );
}

function ProposalSlate({ proposals, viewerIsAdmin, busy, reviewNotes, setReviewNotes, onReview }: { proposals: OracleProposalView[]; viewerIsAdmin: boolean; busy: boolean; reviewNotes: Record<string, string>; setReviewNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>; onReview: (proposal: OracleProposalView, decision: "approved" | "rejected") => Promise<void> }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">Citizen slate</p><h3 className="mt-1 text-xl font-semibold text-white">Markets awaiting or carrying review.</h3></div><span className="rounded-full border border-white/10 bg-white/[0.035] px-3 py-1 text-xs font-bold text-slate-300">{proposals.length}</span></div>
      <div className="max-h-[34rem] space-y-3 overflow-y-auto pr-1">
        {proposals.length ? proposals.map((item) => (
          <article key={item.publicId} className="rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]"><span className="rounded-full border border-violet-200/14 bg-violet-300/8 px-2.5 py-1 text-violet-100">{item.category}</span><span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-slate-400">{statusLabel(item.status)}</span><span className="ml-auto text-slate-600">by {item.creatorLabel}</span></div>
            <h4 className="mt-3 text-base font-semibold leading-6 text-white">{item.question}</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2"><CardFact label="Source" value={item.sourceLabel} /><CardFact label="Closes" value={dateLabel(item.closesAt)} /></div>
            {item.reviewNote ? <p className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-xs leading-5 text-slate-400"><strong className="text-slate-200">Review:</strong> {item.reviewNote}</p> : null}
            {viewerIsAdmin && ["proposed", "rule_review"].includes(item.status) ? (
              <div className="mt-3 border-t border-white/8 pt-3"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/60" htmlFor={`review-${item.publicId}`}>Keeper review note</label><textarea id={`review-${item.publicId}`} value={reviewNotes[item.publicId] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [item.publicId]: event.target.value }))} placeholder="Required when rejecting; published to the Chronicle." className={`${inputClass} mt-2 min-h-20 resize-y py-3`} /><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" disabled={busy} onClick={() => void onReview(item, "approved")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-300 text-xs font-black text-slate-950 disabled:opacity-45"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Approve & open</button><button type="button" disabled={busy} onClick={() => void onReview(item, "rejected")} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-rose-200/20 bg-rose-300/10 text-xs font-black text-rose-100 disabled:opacity-45"><XCircle className="h-3.5 w-3.5" aria-hidden="true" />Reject</button></div></div>
            ) : null}
          </article>
        )) : <div className="rounded-[1.35rem] border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No citizen markets have entered review yet.</div>}
      </div>
    </div>
  );
}

const inputClass = "min-h-11 w-full rounded-xl border border-white/10 bg-[#060812] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-violet-200/35 focus:ring-2 focus:ring-violet-300/10 disabled:cursor-not-allowed";

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.19em] text-slate-500">{label}</span>{children}</label>; }
function HeroMini({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/12 bg-black/48 p-3 backdrop-blur-md"><div className="text-[9px] font-black uppercase tracking-[0.19em] text-slate-500">{label}</div><div className="mt-1 text-lg font-black text-white">{value}</div></div>; }
function PulseTile({ icon: Icon, label, value, note }: { icon: typeof UsersRound; label: string; value: string; note: string }) { return <div className="rounded-[1.35rem] border border-white/10 bg-[#090c17] p-4"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.19em] text-slate-500"><Icon className="h-3.5 w-3.5 text-violet-200/60" aria-hidden="true" />{label}</div><div className="mt-2 text-xl font-black text-white">{value}</div><div className="mt-1 text-xs text-slate-600">{note}</div></div>; }
function Step({ number, title, body }: { number: string; title: string; body: string }) { return <div className="rounded-[1.3rem] border border-white/8 bg-black/20 p-4"><div className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-200/55">{number}</div><div className="mt-2 text-sm font-bold text-white">{title}</div><p className="mt-1.5 text-xs leading-5 text-slate-500">{body}</p></div>; }
function CardFact({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.025] p-2.5"><div className="truncate text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">{label}</div><div className="mt-1 truncate text-xs font-bold text-slate-300" title={value}>{value}</div></div>; }
function DeskRule({ icon: Icon, copy }: { icon: typeof FileCheck2; copy: string }) { return <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-black/15 p-3 text-sm text-slate-300"><Icon className="h-4 w-4 shrink-0 text-amber-200/65" aria-hidden="true" />{copy}</div>; }
