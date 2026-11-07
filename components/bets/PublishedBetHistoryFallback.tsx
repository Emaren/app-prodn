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

type PublicHistory = {
  schema: "aoe2war.app.bets-published-history.v1";
  status: "PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD";
  financialExecutionAuthorized: false;
  acceptingWagers: false;
  approvingPayouts: false;
  onchainPaymentFinalityVerified: false;
  personalWagersIncluded: false;
  markets: HistoricalMarket[];
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
      !Array.isArray(v.markets) || v.markets.length > 48) return false;
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
