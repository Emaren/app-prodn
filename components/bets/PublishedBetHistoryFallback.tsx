"use client";

import { useEffect, useState } from "react";

type HistoricalMarket = {
  id: number;
  title: string;
  eventLabel: string;
  recordedStatus: "settled" | "voided" | "under_review";
  leftLabel: string;
  rightLabel: string;
  settledAt: string | null;
};

type PublicLiveMarket = {
  id: number;
  title: string;
  eventLabel: string;
  status: "open" | "live" | "closing" | "awaiting_final_proof";
  featured: boolean;
  marketType: string;
  leftLabel: string;
  rightLabel: string;
  closeAt: string | null;
  bettingPermitted: false;
};

type PublicLivePreview = {
  schema: "aoe2war.app.bets-published-live-preview.v1";
  status: "PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD";
  source: "aoe2war_public_v9.published_markets";
  publicIntegrityRequired: true;
  financialExecutionAuthorized: false;
  acceptingWagers: false;
  approvingPayouts: false;
  onchainPaymentFinalityVerified: false;
  personalWagersIncluded: false;
  actualLiquidityProven: false;
  completeMarketCensus: false;
  emptyReason: "NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS" | null;
  markets: PublicLiveMarket[];
};

const ALLOWED_ACTIVE_STATUSES = new Set(["open", "live", "closing", "awaiting_final_proof"]);

function isPublicLivePreview(input: unknown): input is PublicLivePreview {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const v = input as Record<string, unknown>;
  if (v.schema !== "aoe2war.app.bets-published-live-preview.v1" ||
      v.status !== "PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD" ||
      v.source !== "aoe2war_public_v9.published_markets" ||
      v.publicIntegrityRequired !== true ||
      v.financialExecutionAuthorized !== false ||
      v.acceptingWagers !== false ||
      v.approvingPayouts !== false ||
      v.onchainPaymentFinalityVerified !== false ||
      v.personalWagersIncluded !== false ||
      v.actualLiquidityProven !== false ||
      v.completeMarketCensus !== false ||
      !Array.isArray(v.markets) || v.markets.length > 48 ||
      (v.markets.length === 0
        ? v.emptyReason !== "NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS"
        : v.emptyReason !== null)) return false;
  const seen = new Set<number>();
  return v.markets.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const r = item as Record<string, unknown>;
    if (!Number.isSafeInteger(r.id) || Number(r.id) <= 0 || seen.has(Number(r.id)) ||
        !ALLOWED_ACTIVE_STATUSES.has(String(r.status)) ||
        r.bettingPermitted !== false || typeof r.featured !== "boolean" ||
        typeof r.title !== "string" || r.title.length > 255 ||
        typeof r.eventLabel !== "string" || r.eventLabel.length > 180 ||
        typeof r.marketType !== "string" || r.marketType.length > 100 ||
        typeof r.leftLabel !== "string" || r.leftLabel.length > 255 ||
        typeof r.rightLabel !== "string" || r.rightLabel.length > 255 ||
        !(r.closeAt === null || (typeof r.closeAt === "string" &&
           Number.isFinite(Date.parse(r.closeAt))))) return false;
    seen.add(Number(r.id));
    return true;
  });
}

type PublicHistory = {
  schema: "aoe2war.app.bets-published-history.v1";
  status: "PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD";
  financialExecutionAuthorized: false;
  acceptingWagers: false;
  approvingPayouts: false;
  onchainPaymentFinalityVerified: false;
  personalWagersIncluded: false;
  markets: HistoricalMarket[];
  publicLivePreview: PublicLivePreview;
};

function isPublicHistory(value: unknown): value is PublicHistory {
  if (typeof value !== "object" || !value) return false;
  const v = value as Record<string, unknown>;
  if (v.schema !== "aoe2war.app.bets-published-history.v1" ||
      v.status !== "PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD" ||
      v.financialExecutionAuthorized !== false ||
      v.acceptingWagers !== false ||
      v.approvingPayouts !== false ||
      v.onchainPaymentFinalityVerified !== false ||
      v.personalWagersIncluded !== false ||
      !Array.isArray(v.markets) || v.markets.length > 48 ||
      !isPublicLivePreview(v.publicLivePreview)) return false;
  const seen = new Set<number>();
  return v.markets.every((row) => {
    if (typeof row !== "object" || !row) return false;
    const r = row as Record<string, unknown>;
    if (!Number.isSafeInteger(r.id) || (r.id as number) <= 0 ||
        seen.has(r.id as number) ||
        typeof r.title !== "string" || r.title.length > 255 ||
        typeof r.eventLabel !== "string" || r.eventLabel.length > 180 ||
        typeof r.leftLabel !== "string" || r.leftLabel.length > 255 ||
        typeof r.rightLabel !== "string" || r.rightLabel.length > 255 ||
        !["settled", "voided", "under_review"].includes(String(r.recordedStatus)) ||
        !(r.settledAt === null || typeof r.settledAt === "string")) return false;
    seen.add(r.id as number);
    return true;
  });
}

export default function PublishedBetHistoryFallback() {
  const [history, setHistory] = useState<PublicHistory | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hold">("loading");

  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/bets/public-history", {
      method: "GET",
      cache: "no-store",
      credentials: "same-origin",
      signal: abort.signal,
    }).then(async (res) => {
      if (!res.ok) throw new Error("published market view unavailable");
      const data: unknown = await res.json();
      if (!isPublicHistory(data)) throw new Error("invalid protected history view");
      if (abort.signal.aborted) return;
      setHistory(data);
      setState("ready");
    }).catch(() => {
      if (!abort.signal.aborted) setState("hold");
    });
    return () => abort.abort();
  }, []);

  return (
    <section aria-label="Public historical war books" className="rounded-3xl border border-amber-200/20 bg-slate-950/80 p-5 sm:p-8">
      {state === "ready" && history ? (
        <div aria-label="Published active market preview" className="mb-8 border-b border-white/10 pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">
            Public market outlook
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Published upcoming battles
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
            Only integrity-eligible published market labels are shown. True pool liquidity,
            personal slips, staking, custody and payout verification are unavailable.
          </p>
          {history.publicLivePreview.markets.length === 0 ? (
            <p role="status" className="mt-6 text-slate-300">
              No integrity-eligible active markets are currently published.
              Historical war books remain available below.
            </p>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {history.publicLivePreview.markets.map((market) => (
                <article key={market.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3 text-xs uppercase tracking-[0.12em] text-slate-400">
                    <span>{market.eventLabel || "Published battle"}</span>
                    <span>{market.status.replaceAll("_", " ")}</span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-white">{market.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">
                    {market.leftLabel} vs. {market.rightLabel}
                  </p>
                  <p className="mt-3 text-xs text-amber-100">Preview only · No wagers accepted</p>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : null}
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">
        Public war archives
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
        Recorded market history
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
        Historical market labels only. These entries are not independently verified
        on-chain payments. Live wagers, personal slips, custody and payouts are
        unavailable while the financial release remains on hold.
      </p>
      {state === "loading" ? (
        <p role="status" className="mt-6 text-slate-300">Loading published archive…</p>
      ) : state === "hold" || !history ? (
        <p role="status" className="mt-6 text-amber-200">
          The verified public archive is temporarily unavailable. No historical
          records or payment balances have been inferred.
        </p>
      ) : history.markets.length === 0 ? (
        <p role="status" className="mt-6 text-slate-300">
          No eligible published historical market entries are available.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {history.markets.map((market) => (
            <article key={market.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-xs uppercase tracking-[0.15em] text-slate-400">
                  {market.eventLabel || "War book"}
                </span>
                <span className="rounded-full border border-white/10 px-2 py-1 text-xs text-amber-100">
                  Recorded: {market.recordedStatus.replaceAll("_", " ")}
                </span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{market.title}</h3>
              <p className="mt-2 text-sm text-slate-300">
                {market.leftLabel} vs. {market.rightLabel}
              </p>
              <p className="mt-3 text-xs text-slate-400">
                No wagers accepted · No payout finality attested
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
