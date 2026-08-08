"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleGauge,
  Clock3,
  Database,
  ExternalLink,
  History,
  LockKeyhole,
  Minus,
  Scale,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  OracleMarketView,
  OracleResolutionInput,
  OracleResultOutcome,
  OracleSide,
  OracleSnapshot,
  OracleViewer,
} from "@/lib/oracle";

type OracleMarketDetailProps = {
  market: OracleMarketView;
  markBalance: OracleSnapshot["markBalance"];
  viewer: OracleViewer | null;
  busy?: boolean;
  standalone?: boolean;
  onPlacePosition: (input: {
    slug: string;
    side: OracleSide;
    amountMarks: number;
  }) => Promise<boolean>;
  onSetStatus?: (
    slug: string,
    status: string,
    resolution?: OracleResolutionInput,
  ) => Promise<boolean>;
  onSignIn?: () => void;
};

function number(value: number | string) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(numeric)
    : String(value);
}

function probability(value: number) {
  return `${(value / 100).toFixed(value % 100 === 0 ? 0 : 1)}%`;
}

function dateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function statusLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function eventLabel(value: string) {
  return statusLabel(value.replace(/^market_/, "").replace(/^position_/, "forecast "));
}

export default function OracleMarketDetail({
  market,
  markBalance,
  viewer,
  busy = false,
  standalone = false,
  onPlacePosition,
  onSetStatus,
  onSignIn,
}: OracleMarketDetailProps) {
  const [side, setSide] = useState<OracleSide>(market.viewerPosition?.side ?? "yes");
  const [amount, setAmount] = useState(market.viewerPosition?.amountMarks ?? 100);
  const [adminStatus, setAdminStatus] = useState("");
  const [resultOutcome, setResultOutcome] = useState<OracleResultOutcome>("YES");
  const [resultEvidence, setResultEvidence] = useState("");
  const [observedResolutionValue, setObservedResolutionValue] = useState("");

  useEffect(() => {
    setSide(market.viewerPosition?.side ?? "yes");
    setAmount(market.viewerPosition?.amountMarks ?? 100);
  }, [market.slug, market.viewerPosition?.amountMarks, market.viewerPosition?.side]);

  const maxForMarket = Math.min(
    1_000,
    markBalance.available + (market.viewerPosition?.amountMarks ?? 0),
  );
  const normalizedAmount = Math.max(1, Math.min(maxForMarket || 1, Math.round(amount || 0)));
  const preview = useMemo(() => {
    const previous = market.viewerPosition;
    let yes = market.yesMarks;
    let no = market.noMarks;
    if (previous?.side === "yes") yes -= previous.amountMarks;
    if (previous?.side === "no") no -= previous.amountMarks;
    if (side === "yes") yes += normalizedAmount;
    else no += normalizedAmount;
    return {
      yes,
      no,
      yesProbabilityBps: yes + no > 0 ? Math.round((yes / (yes + no)) * 10_000) : 5_000,
    };
  }, [market.noMarks, market.viewerPosition, market.yesMarks, normalizedAmount, side]);

  const canForecast = market.status === "trading" && new Date(market.closesAt).getTime() > Date.now();
  const terminalTransition = adminStatus === "settled" || adminStatus === "voided";
  const observedValueReady =
    observedResolutionValue.trim() === "" || /^-?\d+$/.test(observedResolutionValue.trim());
  const terminalFormReady =
    !terminalTransition ||
    (resultEvidence.trim().length >= 20 &&
      observedValueReady &&
      (adminStatus === "voided"
        ? resultOutcome === "VOID"
        : resultOutcome === "YES" || resultOutcome === "NO"));
  const availableCopy = viewer
    ? `${number(markBalance.available)} unallocated Marks`
    : "Sign in to receive 1,000 Marks";

  async function submit() {
    if (!viewer) {
      onSignIn?.();
      return;
    }
    await onPlacePosition({ slug: market.slug, side, amountMarks: normalizedAmount });
  }

  return (
    <div className={standalone ? "space-y-5" : "space-y-4"}>
      {standalone ? (
        <Link
          href="/oracle"
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-slate-300 transition hover:border-violet-200/30 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All Oracle markets
        </Link>
      ) : null}

      <section className="relative overflow-hidden rounded-[2rem] border border-violet-200/15 bg-[radial-gradient(circle_at_10%_0%,rgba(124,58,237,0.22),transparent_34%),radial-gradient(circle_at_94%_18%,rgba(14,165,233,0.13),transparent_28%),linear-gradient(145deg,#080b18,#0d1020_52%,#050713)] shadow-[0_32px_100px_rgba(3,7,18,0.52)]">
        <div className="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-violet-200/70 to-transparent" />
        <div className="p-5 sm:p-7 lg:p-8">
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.24em]">
            <span className="rounded-full border border-violet-200/20 bg-violet-300/10 px-3 py-1.5 text-violet-100">
              {market.category}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-slate-300">
              {statusLabel(market.status)}
            </span>
            <span className="rounded-full border border-emerald-200/15 bg-emerald-300/8 px-3 py-1.5 text-emerald-100">
              YES / NO pool
            </span>
          </div>

          <h1 className={`${standalone ? "text-3xl sm:text-5xl" : "text-2xl sm:text-3xl"} mt-5 max-w-5xl font-serif font-semibold leading-[1.08] tracking-[-0.03em] text-white`}>
            {market.question}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
            {market.summary}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile
              icon={CircleGauge}
              label={market.resultOutcome ? "Published result" : "Crowd probability"}
              value={market.resultOutcome ?? `${probability(market.yesProbabilityBps)} YES`}
              detail={market.resultOutcome ? "Durable terminal record" : `${probability(10_000 - market.yesProbabilityBps)} NO`}
            />
            <MetricTile
              icon={Sparkles}
              label="Citizen conviction"
              value={`${number(market.placedMarks)} Marks`}
              detail={`${number(market.uniqueForecasters)} forecasters`}
            />
            <MetricTile
              icon={Database}
              label={market.liveMetric.label}
              value={market.liveMetric.value === null ? "Awaiting feed" : number(market.liveMetric.value)}
              detail={market.targetValue ? `Target ${number(market.targetValue)}` : "Exact rule below"}
            />
            <MetricTile
              icon={Clock3}
              label="Forecasting closes"
              value={dateLabel(market.closesAt)}
              detail={`Resolves ${dateLabel(market.resolvesAt)}`}
            />
          </div>
        </div>
      </section>

      {market.resultOutcome && market.resultEvidence ? (
        <section className={`rounded-[2rem] border p-5 sm:p-6 ${market.resultOutcome === "YES" ? "border-emerald-200/24 bg-emerald-300/[0.07]" : market.resultOutcome === "NO" ? "border-rose-200/24 bg-rose-300/[0.07]" : "border-amber-200/24 bg-amber-300/[0.07]"}`} aria-labelledby={`oracle-result-${market.slug}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-white/55">Published Oracle result</p>
              <h2 id={`oracle-result-${market.slug}`} className="mt-2 font-serif text-3xl font-semibold text-white">
                {market.resultOutcome === "VOID" ? "Market voided" : `${market.resultOutcome} resolved`}
              </h2>
              <p className="mt-3 max-w-4xl whitespace-pre-wrap text-sm leading-6 text-slate-200">{market.resultEvidence}</p>
            </div>
            <span className="shrink-0 rounded-2xl border border-white/15 bg-black/20 px-5 py-3 text-2xl font-black text-white">{market.resultOutcome}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SmallFact label="Resolver UID" value={market.resolvedByUid ?? "Unavailable"} />
            <SmallFact label="Resolved at" value={market.resolvedAt ? dateLabel(market.resolvedAt) : "Unavailable"} />
            <SmallFact label="Observed value" value={market.observedResolutionValue === null ? "Not recorded" : number(market.observedResolutionValue)} />
          </div>
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] xl:items-start">
        <section className="rounded-[2rem] border border-white/10 bg-[#080b16]/95 p-5 shadow-[0_24px_75px_rgba(0,0,0,0.28)] sm:p-6 xl:sticky xl:top-24">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-violet-200/70">
                Set your forecast
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white">Choose a side.</h2>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Your balance</div>
              <div className="mt-1 text-sm font-bold text-white">{availableCopy}</div>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3" role="group" aria-label="Forecast side">
            {(["yes", "no"] as const).map((option) => {
              const selected = side === option;
              const isYes = option === "yes";
              const pct = isYes ? market.yesProbabilityBps : 10_000 - market.yesProbabilityBps;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSide(option)}
                  className={`min-h-[5.5rem] rounded-[1.35rem] border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-200/60 ${
                    selected
                      ? isYes
                        ? "border-emerald-200/45 bg-emerald-300/15 shadow-[0_14px_42px_rgba(16,185,129,0.12)]"
                        : "border-rose-200/45 bg-rose-300/15 shadow-[0_14px_42px_rgba(244,63,94,0.12)]"
                      : "border-white/10 bg-white/[0.035] hover:border-white/20"
                  }`}
                >
                  <span className={`text-xs font-black uppercase tracking-[0.24em] ${isYes ? "text-emerald-200" : "text-rose-200"}`}>
                    {option}
                  </span>
                  <span className="mt-2 block text-2xl font-black text-white">{probability(pct)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-5 rounded-[1.35rem] border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`oracle-marks-${market.slug}`} className="text-sm font-semibold text-slate-200">
                Oracle Marks
              </label>
              <span className="text-xs text-slate-500">Maximum {number(maxForMarket)}</span>
            </div>
            <input
              id={`oracle-marks-${market.slug}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={Math.max(1, maxForMarket)}
              step={1}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="mt-3 min-h-12 w-full rounded-2xl border border-white/10 bg-[#050712] px-4 py-3 text-2xl font-black text-white outline-none transition focus:border-violet-200/45 focus:ring-2 focus:ring-violet-300/15"
            />
            <input
              type="range"
              aria-label="Oracle Marks amount"
              min={1}
              max={Math.max(1, maxForMarket)}
              value={normalizedAmount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="mt-4 w-full accent-violet-400"
            />
            <div className="mt-3 grid grid-cols-4 gap-2">
              {[50, 100, 250, maxForMarket].map((preset, index) => (
                <button
                  key={`${preset}-${index}`}
                  type="button"
                  disabled={preset < 1}
                  onClick={() => setAmount(Math.min(maxForMarket, preset))}
                  className="min-h-9 rounded-xl border border-white/10 bg-white/[0.04] px-2 text-xs font-bold text-slate-300 transition hover:border-violet-200/25 hover:text-white disabled:opacity-40"
                >
                  {index === 3 ? "Max" : preset}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-[1.25rem] border border-violet-200/12 bg-violet-300/[0.055] p-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-slate-400">Pool after your update</span>
              <span className="font-bold text-white">{probability(preview.yesProbabilityBps)} YES</span>
            </div>
            <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-rose-400/40">
              <div
                className="h-full bg-emerald-400 transition-[width] duration-300"
                style={{ width: `${preview.yesProbabilityBps / 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              Oracle Marks are a non-transferable app forecasting balance. This action does not move WOLO and does not create a WoloChain transaction.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy || (Boolean(viewer) && (!canForecast || maxForMarket < 1))}
            className={`mt-4 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-black text-slate-950 transition focus:outline-none focus:ring-2 focus:ring-white/70 disabled:cursor-not-allowed disabled:opacity-45 ${
              side === "yes"
                ? "bg-emerald-300 hover:bg-emerald-200"
                : "bg-rose-300 hover:bg-rose-200"
            }`}
          >
            {!viewer ? "Sign in to forecast" : !canForecast ? "Forecasting closed" : `${market.viewerPosition ? "Update" : "Place"} ${side.toUpperCase()} forecast`}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>

          {market.viewerPosition ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <div className="text-sm text-slate-300">
                Your position: <strong className="text-white">{market.viewerPosition.side.toUpperCase()} · {number(market.viewerPosition.amountMarks)} Marks</strong>
              </div>
              <button
                type="button"
                disabled={busy || !canForecast}
                onClick={() => void onPlacePosition({ slug: market.slug, side: market.viewerPosition?.side ?? side, amountMarks: 0 })}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 px-3 text-xs font-bold text-slate-400 transition hover:border-rose-200/25 hover:text-rose-100 disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            </div>
          ) : null}
        </section>

        <div className="space-y-5">
          <section className="rounded-[2rem] border border-amber-100/14 bg-[linear-gradient(145deg,rgba(61,39,16,0.34),rgba(8,11,22,0.98)_34%)] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl border border-amber-100/15 bg-amber-300/10 p-2.5 text-amber-200">
                <Scale className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/70">The exact covenant</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Read this before choosing.</h2>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <RuleRow icon={Check} label="YES resolves when" copy={market.resolutionRule} tone="emerald" />
              <RuleRow icon={Database} label="Authoritative source" copy={`${market.sourceLabel} · ${market.sourceMetricKey}`} tone="sky" />
              <RuleRow icon={Clock3} label="Close and resolution" copy={`Forecasting closes ${dateLabel(market.closesAt)}. Resolution is scheduled for ${dateLabel(market.resolvesAt)}.`} tone="violet" />
              <RuleRow icon={ShieldAlert} label="Void covenant" copy={market.voidRule} tone="rose" />
            </div>

            <div className="mt-5 rounded-[1.25rem] border border-sky-200/12 bg-sky-300/[0.055] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-sky-200/65">Live context</div>
                  <div className="mt-1 text-lg font-bold text-white">
                    {market.liveMetric.value ?? "Awaiting feed"} <span className="text-sm font-normal text-slate-400">· {market.liveMetric.label}</span>
                  </div>
                </div>
                <Database className="h-5 w-5 text-sky-200/55" aria-hidden="true" />
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{market.liveMetric.note}</p>
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#080b16]/92 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Pool anatomy</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Where conviction sits.</h2>
              </div>
              <LockKeyhole className="h-5 w-5 text-violet-200/55" aria-hidden="true" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <PoolTile label="YES pool" value={market.yesMarks} seed={market.seedYesMarks} tone="emerald" />
              <PoolTile label="NO pool" value={market.noMarks} seed={market.seedNoMarks} tone="rose" />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SmallFact label="Created by" value={market.createdByLabel} />
              <SmallFact label="Future WOLO ceiling" value={market.maxPoolWolo ? `${number(market.maxPoolWolo)} WOLO` : "Not set"} />
            </div>
          </section>

          <section className="rounded-[2rem] border border-white/10 bg-[#080b16]/92 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-slate-500">Oracle Chronicle</p>
                <h2 className="mt-1 text-2xl font-semibold text-white">Nothing changes silently.</h2>
              </div>
              <History className="h-5 w-5 text-violet-200/55" aria-hidden="true" />
            </div>
            <div className="mt-5 space-y-3">
              {market.events.length ? market.events.map((event) => (
                <div key={event.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-3.5">
                  <div className="mt-1 h-2 w-2 rounded-full bg-violet-300 shadow-[0_0_14px_rgba(196,181,253,0.7)]" />
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-[0.16em] text-violet-100">{eventLabel(event.eventType)}</span>
                      <time className="text-[11px] text-slate-500" dateTime={event.createdAt}>{dateLabel(event.createdAt)}</time>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-slate-300">{event.detail}</p>
                  </div>
                </div>
              )) : (
                <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">The first Chronicle entry is awaiting publication.</p>
              )}
            </div>
          </section>

          {viewer?.isAdmin && onSetStatus ? (
            <section className="rounded-[2rem] border border-amber-200/18 bg-amber-300/[0.055] p-5 sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/70">Oracle keeper controls</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Advance the published lifecycle.</h2>
              <p className="mt-2 text-sm leading-5 text-slate-400">Terminal outcomes cannot be reopened. Every change appends a Chronicle event.</p>
              {market.availableAdminStatuses.length ? (
                <div className="mt-4 space-y-4">
                  <label className="block" htmlFor={`oracle-status-${market.slug}`}>
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/65">Next market status</span>
                    <select
                      id={`oracle-status-${market.slug}`}
                      value={adminStatus}
                      onChange={(event) => {
                        const status = event.target.value;
                        setAdminStatus(status);
                        if (status === "voided") setResultOutcome("VOID");
                        if (status === "settled" && resultOutcome === "VOID") setResultOutcome("YES");
                      }}
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-[#070a14] px-3 text-sm text-white outline-none focus:border-amber-200/35"
                    >
                      <option value="">Choose next status</option>
                      {market.availableAdminStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  </label>

                  {terminalTransition ? (
                    <fieldset className="space-y-4 rounded-[1.35rem] border border-amber-200/16 bg-black/20 p-4">
                      <legend className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100">Durable terminal result</legend>
                      {adminStatus === "settled" ? (
                        <div>
                          <div className="text-xs font-semibold text-slate-300">Outcome</div>
                          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Settled outcome">
                            {(["YES", "NO"] as const).map((outcome) => (
                              <button
                                key={outcome}
                                type="button"
                                aria-pressed={resultOutcome === outcome}
                                onClick={() => setResultOutcome(outcome)}
                                className={`min-h-11 rounded-xl border text-sm font-black transition focus:outline-none focus:ring-2 focus:ring-amber-100/50 ${resultOutcome === outcome ? outcome === "YES" ? "border-emerald-200/35 bg-emerald-300/18 text-emerald-100" : "border-rose-200/35 bg-rose-300/18 text-rose-100" : "border-white/10 bg-white/[0.035] text-slate-400"}`}
                              >
                                {outcome}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-amber-200/18 bg-amber-300/10 px-4 py-3 text-sm font-black text-amber-100">Outcome: VOID</div>
                      )}

                      <label className="block" htmlFor={`oracle-result-evidence-${market.slug}`}>
                        <span className="text-xs font-semibold text-slate-300">Published evidence</span>
                        <textarea
                          id={`oracle-result-evidence-${market.slug}`}
                          required
                          minLength={20}
                          maxLength={4000}
                          value={resultEvidence}
                          onChange={(event) => setResultEvidence(event.target.value)}
                          placeholder="Name the source snapshot, observed metric, calculation, and why the exact rule produces this result."
                          className="mt-2 min-h-28 w-full resize-y rounded-xl border border-white/10 bg-[#070a14] px-3 py-3 text-sm leading-5 text-white outline-none placeholder:text-slate-600 focus:border-amber-200/35"
                        />
                        <span className={`mt-1 block text-[11px] ${resultEvidence.trim().length >= 20 ? "text-emerald-300" : "text-slate-500"}`}>{resultEvidence.trim().length} / 20 minimum characters</span>
                      </label>

                      <label className="block" htmlFor={`oracle-observed-value-${market.slug}`}>
                        <span className="text-xs font-semibold text-slate-300">Observed resolution value <span className="font-normal text-slate-500">(optional whole number)</span></span>
                        <input
                          id={`oracle-observed-value-${market.slug}`}
                          type="text"
                          inputMode="numeric"
                          pattern="-?[0-9]+"
                          value={observedResolutionValue}
                          onChange={(event) => setObservedResolutionValue(event.target.value)}
                          placeholder="e.g. 3007"
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#070a14] px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-200/35"
                        />
                        {!observedValueReady ? <span className="mt-1 block text-[11px] text-rose-300">Use a whole number with no commas or decimals.</span> : null}
                      </label>
                    </fieldset>
                  ) : null}

                  <button
                    type="button"
                    disabled={!adminStatus || busy || !terminalFormReady}
                    onClick={async () => {
                      const resolution = terminalTransition
                        ? {
                            resultOutcome,
                            resultEvidence: resultEvidence.trim(),
                            observedResolutionValue: observedResolutionValue.trim() || null,
                          }
                        : undefined;
                      if (await onSetStatus(market.slug, adminStatus, resolution)) {
                        setAdminStatus("");
                        setResultOutcome("YES");
                        setResultEvidence("");
                        setObservedResolutionValue("");
                      }
                    }}
                    className="min-h-11 w-full rounded-xl bg-amber-300 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {terminalTransition ? "Publish terminal result" : "Publish transition"}
                  </button>
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3 text-sm text-slate-400">{statusLabel(market.status)} is terminal.</p>
              )}
            </section>
          ) : null}
        </div>
      </div>

      {standalone ? (
        <section className="flex flex-col gap-4 rounded-[2rem] border border-violet-200/12 bg-violet-300/[0.045] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="text-sm font-semibold text-white">Looking for a warrior or team market?</p>
            <p className="mt-1 text-sm text-slate-400">The Betting Hall handles replay-backed battles. The Oracle forecasts future Kingdom milestones.</p>
          </div>
          <Link href="/bets" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-5 text-sm font-bold text-white transition hover:border-violet-200/30">
            Enter the Betting Hall
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function MetricTile({ icon: Icon, label, value, detail }: { icon: typeof CircleGauge; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[1.25rem] border border-white/10 bg-black/20 p-4 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        <Icon className="h-3.5 w-3.5 text-violet-200/65" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-2 break-words text-lg font-black text-white">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </div>
  );
}

function RuleRow({ icon: Icon, label, copy, tone }: { icon: typeof Check; label: string; copy: string; tone: "emerald" | "sky" | "violet" | "rose" }) {
  const tones = {
    emerald: "border-emerald-200/12 bg-emerald-300/[0.045] text-emerald-200",
    sky: "border-sky-200/12 bg-sky-300/[0.045] text-sky-200",
    violet: "border-violet-200/12 bg-violet-300/[0.045] text-violet-200",
    rose: "border-rose-200/12 bg-rose-300/[0.045] text-rose-200",
  };
  return (
    <div className={`rounded-[1.25rem] border p-4 ${tones[tone]}`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-200">{copy}</p>
    </div>
  );
}

function PoolTile({ label, value, seed, tone }: { label: string; value: number; seed: number; tone: "emerald" | "rose" }) {
  return (
    <div className={`rounded-[1.25rem] border p-4 ${tone === "emerald" ? "border-emerald-200/14 bg-emerald-300/[0.055]" : "border-rose-200/14 bg-rose-300/[0.055]"}`}>
      <div className={`text-[10px] font-black uppercase tracking-[0.22em] ${tone === "emerald" ? "text-emerald-200" : "text-rose-200"}`}>{label}</div>
      <div className="mt-2 text-2xl font-black text-white">{number(value)}</div>
      <div className="mt-1 text-xs text-slate-500">Includes {number(seed)} seed Marks</div>
    </div>
  );
}

function SmallFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-200">{value}</div>
    </div>
  );
}
