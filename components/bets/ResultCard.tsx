"use client";

import Link from "next/link";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import {
  BetSettledResult,
  CoinMark,
  cardClass,
  formatExactWolo,
  formatSettledTime,
  isBetMarketHistoryHref,
} from "@/components/bets/page-shared";

export default function ResultCard({
  result,
  compact = false,
  founderChipVariant = "full",
  basicLook = false,
}: {
  result: BetSettledResult;
  compact?: boolean;
  founderChipVariant?: "full" | "micro";
  basicLook?: boolean;
}) {
  const resultPotWolo = result.totalPotWolo || result.payoutWolo;
  const firstPayoutTxHash = result.payoutTxHashes?.[0] ?? null;

  const cardPadding = compact ? "px-4 py-4" : "px-4 py-4";
  const cardMinHeight = compact ? "min-h-[168px]" : "min-h-[198px]";
  const marketHistoryHref = isBetMarketHistoryHref(result.href) ? result.href : null;
  const replayStatsHref = result.href && !marketHistoryHref ? result.href : null;
  const payoutStatus =
    result.resolutionStatus === "under_review"
      ? {
          label: "Result under review",
          detail: "No payout proof yet.",
          className: "border-amber-300/15 bg-amber-400/[0.06] text-amber-100",
        }
      : result.payoutState === "executed"
        ? {
            label:
              result.resolutionStatus === "voided"
                ? "Refund confirmed"
                : firstPayoutTxHash
                  ? "Payout confirmed"
                  : "Bet settled",
            detail: firstPayoutTxHash
              ? `Chain tx ${shortProofHash(firstPayoutTxHash)}`
              : "No bettor payout was due; optional rewards are tracked separately.",
            className:
              "border-emerald-300/15 bg-emerald-400/[0.06] text-emerald-100",
          }
        : result.payoutState === "failed"
          ? {
              label: "Outcome resolved · payout failed",
              detail: result.settlementFailureCode
                ? `Retry required · ${result.settlementFailureCode}`
                : "Retry required; no payout proof recorded.",
              className: "border-rose-300/18 bg-rose-400/[0.07] text-rose-100",
            }
          : result.payoutState === "partial"
            ? {
                label: "Outcome resolved · payout partial",
                detail: "Operator follow-up required before this is proof.",
                className:
                  "border-orange-300/18 bg-orange-400/[0.07] text-orange-100",
              }
            : result.payoutState === "corrected"
              ? {
                  label: "Financial correction recorded",
                  detail: "Ledger correction shown separately from payout proof.",
                  className: "border-sky-300/15 bg-sky-400/[0.06] text-sky-100",
                }
              : {
                  label: "Outcome resolved · payout pending",
                  detail:
                    result.settlementStatus === "executed"
                      ? "Execution recorded; waiting for payout transaction proof."
                      : "Waiting for a confirmed send or exact refund.",
                  className: "border-sky-300/15 bg-sky-400/[0.06] text-sky-100",
                };

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {result.battleNumber ? (
            <div className="mb-2 inline-flex rounded-full border border-cyan-200/[0.12] bg-cyan-300/[0.07] px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.2em] text-cyan-100">
              Battle #{result.battleNumber.toLocaleString()}
            </div>
          ) : null}
          {basicLook ? (
            <div className="truncate whitespace-nowrap text-[10px] uppercase tracking-[0.32em] text-slate-500 sm:text-[11px]">
              {result.mapName}
            </div>
          ) : (
            <div className="inline-flex max-w-full items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.22em] text-slate-300">
              <span className="truncate whitespace-nowrap">{result.mapName}</span>
            </div>
          )}
        </div>

        <div
          className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-[11px] ${
            result.resolutionStatus === "settled"
              ? "border-emerald-300/16 bg-emerald-500/10 text-emerald-100"
              : result.resolutionStatus === "voided"
                ? "border-sky-300/20 bg-sky-500/10 text-sky-100"
                : "border-amber-300/20 bg-amber-500/10 text-amber-100"
          }`}
        >
          <CoinMark small />
          <span>{formatExactWolo(resultPotWolo)} WOLO</span>
        </div>
      </div>

      <div className={compact ? "mt-3 min-w-0" : "mt-3 min-w-0"}>
        <div
          className={
            compact
              ? "break-words text-[1.05rem] font-semibold leading-[1.15] text-white"
              : "break-words text-lg font-semibold leading-tight text-white"
          }
        >
          {result.title}
        </div>
        <div className={compact ? "mt-1 text-sm leading-5 text-slate-400" : "mt-1 text-sm leading-6 text-slate-400"}>
          {result.resolutionStatus === "settled" ? `${result.winner} took it` : result.winner}
        </div>
        {result.integritySummary ? (
          <div className="mt-2 rounded-xl border border-sky-300/12 bg-sky-400/[0.05] px-3 py-2 text-xs leading-5 text-sky-100/80">
            {result.integritySummary}
            {result.amountStillOwedWolo > 0
              ? ` ${formatExactWolo(result.amountStillOwedWolo)} WOLO correction pending.`
              : result.correctionStatus === "recorded"
                ? " Financial correction recorded in the ledger."
                : ""}
          </div>
        ) : null}
        <div
          className={`mt-2 rounded-xl border px-3 py-2 text-xs leading-5 ${payoutStatus.className}`}
        >
          <div className="font-semibold">{payoutStatus.label}</div>
          <div className="mt-0.5 opacity-75">{payoutStatus.detail}</div>
        </div>
      </div>

      <div className={compact ? "mt-4" : "mt-auto pt-4"}>
        <div className="truncate whitespace-nowrap text-xs uppercase tracking-[0.24em] text-slate-500">
          {formatSettledTime(result.settledAt)}
        </div>
        <FounderBonusChips
          bonuses={result.founderBonuses}
          compact
          variant={founderChipVariant}
          className="mt-2 max-w-full"
        />
      </div>
    </div>
  );

  return (
    <article
      className={`${cardClass()} group overflow-hidden ${cardMinHeight} transition hover:border-white/14 hover:bg-white/[0.05]`}
    >
      {marketHistoryHref ? (
        <Link href={marketHistoryHref} className={`block ${cardPadding}`}>
          {content}
        </Link>
      ) : (
        <div className={cardPadding}>{content}</div>
      )}

      {replayStatsHref ? (
        <div className="border-t border-white/[0.06] px-4 py-3">
          <Link
            href={replayStatsHref}
            className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200 transition hover:text-sky-100"
          >
            Replay Stats
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function shortProofHash(value: string) {
  const clean = value.trim();
  if (clean.length <= 18) return clean;
  return `${clean.slice(0, 10)}…${clean.slice(-6)}`;
}
