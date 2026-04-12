"use client";

import type { BetFounderChip } from "@/lib/bets";

function founderLabel(bonus: BetFounderChip) {
  return bonus.bonusType === "winner" ? "Founders Win" : "Founders Bonus";
}

function founderShortLabel(bonus: BetFounderChip) {
  return bonus.bonusType === "winner" ? "FW" : "FB";
}

export default function FounderBonusChips({
  bonuses,
  compact = false,
  variant = "full",
  className = "",
}: {
  bonuses: BetFounderChip[];
  compact?: boolean;
  variant?: "full" | "micro";
  className?: string;
}) {
  if (!bonuses.length) {
    return null;
  }

  return (
    <div className={`flex max-w-full flex-wrap gap-1.5 ${compact ? "" : "mt-3"} ${className}`.trim()}>
      {bonuses.map((bonus) => {
        const micro = variant === "micro";
        const tone =
          bonus.bonusType === "winner"
            ? "border-amber-300/18 bg-amber-400/10 text-amber-100"
            : "border-emerald-300/18 bg-emerald-400/10 text-emerald-100";

        return (
          <span
            key={bonus.id}
            className={`inline-flex items-center rounded-full border ${tone} ${
              micro
                ? "px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]"
                : "px-2.5 py-0.5 text-[11px]"
            }`}
            title={`${founderLabel(bonus)} · ${bonus.totalAmountWolo.toLocaleString()} WOLO${
              bonus.note ? ` · ${bonus.note}` : ""
            }`}
          >
            {micro
              ? `${founderShortLabel(bonus)} ${bonus.totalAmountWolo.toLocaleString()}`
              : `${founderLabel(bonus)} · ${bonus.totalAmountWolo.toLocaleString()} WOLO`}
          </span>
        );
      })}
    </div>
  );
}
