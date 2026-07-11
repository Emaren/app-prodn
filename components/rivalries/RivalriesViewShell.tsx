"use client";

import type {
  ReactNode,
} from "react";

import {
  useTileViewPreference,
} from "@/components/tile-view/useTileViewPreference";
import {
  TILE_VIEW_MODES,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

const VIEW_LABELS: Record<
  TileViewMode,
  string
> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

export default function RivalriesViewShell({
  basicView,
  advancedView,
  extremeView,
}: {
  basicView: ReactNode;
  advancedView: ReactNode;
  extremeView: ReactNode;
}) {
  const {
    viewMode,
    setViewMode,
  } = useTileViewPreference(
    "rivalries"
  );

  const activeView =
    viewMode === "basic"
      ? basicView
      : viewMode === "advanced"
        ? advancedView
        : extremeView;

  return (
    <div
      className="w-full py-2 sm:py-3"
      data-rivalries-view={viewMode}
    >
      <div className="mb-5 flex justify-end">
        <div
          className="inline-flex items-center rounded-full border border-amber-200/28 bg-[#050910]/90 p-1 shadow-[0_12px_34px_rgba(0,0,0,0.46),0_0_24px_rgba(251,191,36,0.08)] backdrop-blur-xl"
          role="group"
          aria-label="Rivalries view"
        >
          {TILE_VIEW_MODES.map(
            (mode) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  setViewMode(mode)
                }
                aria-pressed={
                  viewMode === mode
                }
                aria-label={`${
                  VIEW_LABELS[mode]
                } Rivalries view`}
                title={`${
                  VIEW_LABELS[mode]
                } view`}
                className={`flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-bold uppercase tracking-[0.16em] transition ${
                  viewMode === mode
                    ? "bg-amber-300 text-slate-950 shadow-[0_6px_20px_rgba(251,191,36,0.22)]"
                    : "text-slate-400 hover:bg-white/[0.07] hover:text-amber-50"
                }`}
              >
                {mode[0]}
              </button>
            )
          )}
        </div>
      </div>

      {activeView}
    </div>
  );
}
