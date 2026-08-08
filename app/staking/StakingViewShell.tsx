"use client";

import type { ReactNode } from "react";

import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";
import { StakingStateProvider } from "./StakingStateProvider";

const VIEW_LABELS: Record<TileViewMode, string> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

export default function StakingViewShell({ children }: { children: ReactNode }) {
  const { viewMode } = useTileViewPreference("staking");

  return (
    <StakingStateProvider>
      <div
        className="staking-view-shell w-full"
        data-staking-view={viewMode}
      >
        {children}
      </div>
    </StakingStateProvider>
  );
}

export function StakingViewToggle() {
  const { viewMode, setViewMode } = useTileViewPreference("staking");

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full border border-amber-200/20 bg-[#050910]/88 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.42),0_0_30px_rgba(251,191,36,0.06)] backdrop-blur-xl"
      role="group"
      aria-label="Staking page width"
    >
      {TILE_VIEW_MODES.map((mode) => {
        const active = viewMode === mode;

        return (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            aria-pressed={active}
            aria-label={`${VIEW_LABELS[mode]} staking page width`}
            title={`${VIEW_LABELS[mode]} view`}
            className={`flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/55 ${
              active
                ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
                : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
            }`}
          >
            {mode[0]}
          </button>
        );
      })}
    </div>
  );
}
