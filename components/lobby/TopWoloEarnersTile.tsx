"use client";

import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbySnapshot } from "@/lib/lobby";

type TopWoloEarnersTileProps = {
  wolo: LobbySnapshot["wolo"];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  className?: string;
};

const PODIUM_LANES = [
  {
    rank: "1st",
    title: "Awaiting victor",
  },
  {
    rank: "2nd",
    title: "Awaiting victor",
  },
  {
    rank: "3rd",
    title: "Awaiting victor",
  },
] as const;

function formatCompactWolo(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

export function TopWoloEarnersTile({
  wolo,
  themeKey,
  viewMode,
  className,
}: TopWoloEarnersTileProps) {
  if (!wolo?.enabled) {
    return null;
  }

  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const reserve = formatCompactWolo(wolo.accounts.ecosystembounties?.wolo ?? null);
  const statusLabel = "Arming";

  return (
    <section className={`flex h-full flex-col rounded-[1.7rem] border p-5 ${tone.panelShell} ${className ?? ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            Top $WOLO Earners
          </div>
          <h3 className="mt-2 text-[1.65rem] font-semibold text-white">WAR CHEST</h3>
          <p className="mt-1 text-sm text-slate-300">To the victors go the spoils.</p>
        </div>

        <div className="text-right">
          <div className={`inline-flex rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
            {statusLabel}
          </div>
          <div className="mt-2 text-lg font-semibold text-white">
            {reserve ? `${reserve} WOLO` : "Awaiting reserve"}
          </div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
            {reserve ? "Reserve armed" : "Board filling soon"}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2.5">
        {PODIUM_LANES.map((lane) => (
          <div
            key={lane.rank}
            className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[1.2rem] border px-4 py-3 ${tone.card}`}
          >
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.rankBadge}`}>
              {lane.rank}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{lane.title}</div>
              <div className="mt-2 h-2 rounded-full bg-white/8">
                <div className="h-full w-1/3 rounded-full bg-white/14" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-auto rounded-[1.25rem] border px-4 py-3 ${tone.insetPanel}`}>
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">War Chest</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-300">To the victors go the spoils.</div>
          <div className="text-sm font-semibold text-white">
            {reserve ? `${reserve} WOLO ready` : "Awaiting first payouts"}
          </div>
        </div>
      </div>
    </section>
  );
}