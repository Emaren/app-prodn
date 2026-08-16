"use client";

import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

const LABELS:
  Record<TileViewMode, string> = {
    basic: "Basic",
    advanced: "Advanced",
    extreme: "Extreme",
  };

export function LeaderboardViewToggle({
  value,
  onChange,
  compact = false,
}: {
  value: TileViewMode;
  onChange: (
    view: TileViewMode,
  ) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-full border border-amber-200/18 bg-[#030711]/88 shadow-[0_12px_34px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.055)] backdrop-blur-xl ${
        compact
          ? "gap-px p-0.5"
          : "gap-0.5 p-1"
      }`}
      role="group"
      aria-label="Leaderboard view"
    >
      {TILE_VIEW_MODES.map(
        (view) => {
          const active =
            value === view;

          return (
            <button
              key={view}
              type="button"
              onClick={() =>
                onChange(view)
              }
              aria-pressed={
                active
              }
              aria-label={`${LABELS[view]} leaderboard view`}
              title={`${LABELS[view]} view`}
              className={`grid cursor-pointer place-items-center rounded-full font-black uppercase transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 ${
                compact
                  ? "h-5 min-w-5 px-1 text-[8px] tracking-[0.10em]"
                  : "h-7 min-w-7 px-2 text-[10px] tracking-[0.18em]"
              } ${
                active
                  ? "bg-[linear-gradient(145deg,#f6dfa3,#c99b3c)] text-[#09101c] shadow-[0_7px_22px_rgba(201,155,60,0.24),inset_0_1px_0_rgba(255,255,255,0.5)]"
                  : "text-slate-500 hover:bg-white/[0.055] hover:text-amber-50"
              }`}
            >
              {view[0]}
            </button>
          );
        },
      )}
    </div>
  );
}
