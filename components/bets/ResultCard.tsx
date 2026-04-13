"use client";

import Link from "next/link";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import {
  BetSettledResult,
  CoinMark,
  cardClass,
  formatExactWolo,
  formatSettledTime,
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

  const cardPadding = compact ? "px-4 py-4" : "px-4 py-4";
  const cardMinHeight = compact ? "min-h-[168px]" : "min-h-[198px]";

  const content = (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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

        <div className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-300/16 bg-emerald-500/10 px-3 py-1 text-[11px] text-emerald-100">
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
          {result.winner} took it
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

  if (result.href) {
    return (
      <Link
        href={result.href}
        className={`${cardClass()} block ${cardMinHeight} ${cardPadding} transition hover:border-white/14 hover:bg-white/[0.05]`}
      >
        {content}
      </Link>
    );
  }

  return <article className={`${cardClass()} ${cardMinHeight} ${cardPadding}`}>{content}</article>;
}