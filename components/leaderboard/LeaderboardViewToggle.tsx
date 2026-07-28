"use client";

import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

const LABELS: Record<TileViewMode, string> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

export function LeaderboardViewToggle({
  value,
  onChange,
}: {
  value: TileViewMode;
  onChange: (view: TileViewMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-full border border-amber-200/18 bg-[#030711]/88 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl"
      role="group"
      aria-label="Leaderboard view"
    >
      {TILE_VIEW_MODES.map((view) => {
        const active = value === view;

        return (
          <button
            key={view}
            type="button"
            onClick={() => onChange(view)}
            aria-pressed={active}
            aria-label={`${LABELS[view]} leaderboard view`}
            title={`${LABELS[view]} view`}
            className={`grid h-7 min-w-7 cursor-pointer place-items-center rounded-full px-2 text-[10px] font-black uppercase tracking-[0.18em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 ${
              active
                ? "bg-[linear-gradient(145deg,#f6dfa3,#c99b3c)] text-[#09101c] shadow-[0_7px_22px_rgba(201,155,60,0.24),inset_0_1px_0_rgba(255,255,255,0.5)]"
                : "text-slate-500 hover:bg-white/[0.055] hover:text-amber-50"
            }`}
          >
            {view[0]}
          </button>
        );
      })}
    </div>
  );
}
