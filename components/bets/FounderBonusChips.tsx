"use client";

import type { BetFounderChip } from "@/lib/bets";

function founderLabel(bonus: BetFounderChip) {
  return bonus.bonusType === "winner" ? "Founders Win" : "Founders Bonus";
}

export default function FounderBonusChips({
  bonuses,
  compact = false,
}: {
  bonuses: BetFounderChip[];
  compact?: boolean;
}) {
  if (!bonuses.length) {
    return null;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}>
      {bonuses.map((bonus) => (
        <span
          key={bonus.id}
          className="inline-flex items-center rounded-full border border-amber-300/18 bg-amber-400/10 px-3 py-1 text-xs text-amber-100"
          title={bonus.note || undefined}
        >
          {founderLabel(bonus)} · {bonus.totalAmountWolo.toLocaleString()} WOLO
        </span>
      ))}
    </div>
  );
}
