"use client";

import { useEffect, useState } from "react";

type PublicMarket = {
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

type PublicMarketPreview = {
  schema: "aoe2war.app.published-live-markets-finance-restricted.v1";
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
  markets: PublicMarket[];
};

const ALLOWED_STATUSES = new Set(["open", "live", "closing", "awaiting_final_proof"]);

function isPublicMarketPreview(input: unknown): input is PublicMarketPreview {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  const v = input as Record<string, unknown>;
  if (v.schema !== "aoe2war.app.published-live-markets-finance-restricted.v1" ||
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
      (v.markets.length === 0 ? v.emptyReason !== "NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS" : v.emptyReason !== null)) {
    return false;
  }

  const ids = new Set<number>();
  return v.markets.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    if (!Number.isSafeInteger(row.id) || Number(row.id) <= 0 || ids.has(Number(row.id)) ||
        !ALLOWED_STATUSES.has(String(row.status)) ||
        row.bettingPermitted !== false || typeof row.featured !== "boolean" ||
        typeof row.title !== "string" || row.title.length > 255 ||
        typeof row.eventLabel !== "string" || row.eventLabel.length > 180 ||
        typeof row.marketType !== "string" || row.marketType.length > 100 ||
        typeof row.leftLabel !== "string" || row.leftLabel.length > 255 ||
        typeof row.rightLabel !== "string" || row.rightLabel.length > 255 ||
        !(row.closeAt === null || (typeof row.closeAt === "string" && Number.isFinite(Date.parse(row.closeAt))))) {
      return false;
    }
    ids.add(Number(row.id));
    return true;
  });
}

export default function PublishedLiveMarketPreview() {
  const [result, setResult] = useState<PublicMarketPreview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "hold">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/bets/public-live", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("approved public view unavailable");
      const body: unknown = await response.json();
      if (!isPublicMarketPreview(body)) throw new Error("unreviewed public market response");
      if (controller.signal.aborted) return;
      setResult(body);
      setState("ready");
    }).catch(() => {
      if (!controller.signal.aborted) setState("hold");
    });
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="Published current market preview" className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">Public market outlook</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Published upcoming battles</h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
        An independently restricted public market summary. Wager placement, personal slips,
        true pool liquidity, custody and payout verification are unavailable.
      </p>
      {state === "loading" ? (
        <p role="status" className="mt-6 text-slate-300">Checking approved published markets…</p>
      ) : state === "hold" || !result ? (
        <p role="status" className="mt-6 text-amber-200">
          Published current-market data is unavailable. No market or balance has been inferred.
        </p>
      ) : result.markets.length === 0 ? (
        <p role="status" className="mt-6 text-slate-300">
          No integrity-eligible active markets are currently published. Historical entries remain below.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {result.markets.map((market) => (
            <article key={market.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3 text-xs uppercase tracking-[0.12em] text-slate-400">
                <span>{market.eventLabel || "Published battle"}</span>
                <span>{market.status.replaceAll("_", " ")}</span>
              </div>
              <h3 className="mt-3 text-lg font-semibold text-white">{market.title}</h3>
              <p className="mt-2 text-sm text-slate-300">{market.leftLabel} vs. {market.rightLabel}</p>
              <p className="mt-3 text-xs text-amber-100">Preview only · No wagers accepted</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
