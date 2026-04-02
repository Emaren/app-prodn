"use client";

import Link from "next/link";

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
};

const PODIUM_LANES = [
  {
    rank: "1st",
    title: "Weekly Crown",
    copy: "Highest net WOLO from verified wager wins, tournaments, and replay-backed payouts.",
  },
  {
    rank: "2nd",
    title: "War Chest",
    copy: "Second place still gets a visible cut and stays on the board for the whole week.",
  },
  {
    rank: "3rd",
    title: "Signal Slot",
    copy: "Third place still lands the payout rail and earns a public board position.",
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
}: TopWoloEarnersTileProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const reserve = formatCompactWolo(wolo?.accounts.ecosystembounties?.wolo ?? null);
  const statusLabel = wolo?.enabled ? "Prize rail seeded" : "Ledger arming";

  return (
    <Link
      href="/wolo"
      className={`block rounded-[1.7rem] border p-5 transition hover:-translate-y-0.5 ${tone.panelShell}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            Top $WOLO Earners
          </div>
          <h3 className="mt-3 text-2xl font-semibold text-white">Weekly prize board</h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
            Weekly crown for the top three players who earn the most $WOLO from verified wager
            wins, tournaments, and replay-backed payouts. Simple transfers do not count.
          </p>
        </div>

        <div className={`shrink-0 rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
          {statusLabel}
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        {PODIUM_LANES.map((lane) => (
          <div
            key={lane.rank}
            className={`grid gap-3 rounded-[1.25rem] border px-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)] ${tone.card}`}
          >
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${tone.rankBadge}`}>
              {lane.rank}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{lane.title}</div>
              <div className="mt-1 text-sm leading-6 text-slate-300">{lane.copy}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={`mt-5 rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
              Weekly prize rail
            </div>
            <div className="mt-2 text-lg font-semibold text-white">
              {reserve ? `${reserve} WOLO reserve` : "Top 3 paid weekly"}
            </div>
            <div className="mt-1 text-sm leading-6 text-slate-300">
              {reserve
                ? "Seeded from the ecosystem bounty rail while the full weekly earner ledger comes online."
                : "The payout reserve attaches here as soon as the wager and tournament earnings rail is live."}
            </div>
          </div>

          <div className={`rounded-full px-4 py-2 text-sm font-semibold ${tone.primaryButton}`}>
            Open WOLO
          </div>
        </div>
      </div>
    </Link>
  );
}
