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
}: {
  bonuses: BetFounderChip[];
  compact?: boolean;
  variant?: "full" | "micro";
}) {
  if (!bonuses.length) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
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
                ? "px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]"
                : "px-3 py-1 text-xs"
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
