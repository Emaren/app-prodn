"use client";

import { SlidersHorizontal } from "lucide-react";

import { useTileViewPreference } from "@/components/tile-view/useTileViewPreference";
import {
  TILE_VIEW_MODES,
  type TileViewKey,
  type TileViewMode,
} from "@/lib/tileViewPreferences";

const VIEW_LABELS: Record<TileViewMode, string> = {
  basic: "Basic",
  advanced: "Advanced",
  extreme: "Extreme",
};

export default function PageWidthSettingsBar({
  tileKey,
  label,
}: {
  tileKey: TileViewKey;
  label: string;
}) {
  const { viewMode, setViewMode } = useTileViewPreference(tileKey);

  return (
    <section
      className="mt-2 flex min-h-11 flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#050910]/72 px-3 py-2 shadow-[0_12px_38px_rgba(0,0,0,0.22)] backdrop-blur-xl"
      aria-label={`${label} page settings`}
    >
      <div className="flex min-w-0 items-center gap-2 text-[9px] font-black uppercase tracking-[0.22em] text-slate-500">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-amber-200/55" aria-hidden="true" />
        <span>Page view</span>
        <span className="text-slate-700">·</span>
        <span className="truncate text-slate-400">{VIEW_LABELS[viewMode]}</span>
      </div>

      <div
        className="inline-flex shrink-0 items-center rounded-full border border-white/10 bg-black/28 p-0.5"
        role="group"
        aria-label={`${label} width view`}
      >
        {TILE_VIEW_MODES.map((mode) => {
          const active = viewMode === mode;

          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-pressed={active}
              aria-label={`${VIEW_LABELS[mode]} ${label} view`}
              title={`${VIEW_LABELS[mode]} view`}
              className={`flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[10px] font-black uppercase tracking-[0.12em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200/45 ${
                active
                  ? "bg-amber-200 text-slate-950 shadow-[0_5px_16px_rgba(251,191,36,0.18)]"
                  : "text-slate-500 hover:bg-white/[0.06] hover:text-slate-200"
              }`}
            >
              {mode[0]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
