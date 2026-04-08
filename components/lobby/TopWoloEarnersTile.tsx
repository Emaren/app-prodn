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
  board: LobbySnapshot["woloEarners"] | null;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  className?: string;
};

const PLACEHOLDER_LANES = [
  { rank: "1st", title: "Awaiting first earner" },
  { rank: "2nd", title: "Awaiting first earner" },
  { rank: "3rd", title: "Awaiting first earner" },
] as const;

function formatCompactWolo(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatWolo(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatLastActive(value: string | null) {
  if (!value) {
    return "Waiting for the next swing";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatOrdinal(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value}st`;
  if (mod10 === 2 && mod100 !== 12) return `${value}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${value}rd`;
  return `${value}th`;
}

function MiniTag({
  children,
  toneClassName,
}: {
  children: React.ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] ${toneClassName}`}>
      {children}
    </span>
  );
}

export function TopWoloEarnersTile({
  wolo,
  board,
  themeKey,
  viewMode,
  className,
}: TopWoloEarnersTileProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const reserve = formatCompactWolo(wolo?.accounts.ecosystembounties?.wolo ?? null);
  const entries = board?.entries ?? [];
  const statusLabel = entries.length > 0 ? (board?.backfilled ? "Weekly + regulars" : "Weekly") : "Standby";
  const headlineValue =
    entries.length > 0 ? `${entries.length} tracked` : reserve ? `${reserve} WOLO` : "3 slots";

  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-[1.7rem] border p-5 ${tone.panelShell} ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            Top $WOLO Earners
          </div>
          <h3 className="mt-2 text-[1.65rem] font-semibold text-white">WAR CHEST</h3>
          <p className="mt-1 text-sm text-slate-300">
            Weekly earners lead the board. Active bettors keep it alive.
          </p>
        </div>

        <div className="text-right">
          <div
            className={`inline-flex rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}
          >
            {statusLabel}
          </div>
          <div className="mt-2 text-lg font-semibold text-white">{headlineValue}</div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
            {entries.length > 0 ? `Top ${board?.visibleSlots ?? 3} always on deck` : reserve ? "Reserve armed" : "Board filling soon"}
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-0 flex-1">
        {entries.length === 0 ? (
          <div className="grid gap-2.5">
            {PLACEHOLDER_LANES.map((lane) => (
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
        ) : (
          <div className="grid max-h-[20rem] gap-2.5 overflow-y-auto pr-1">
            {entries.map((entry) => {
              const primaryMetric = entry.earnedWolo > 0 ? entry.earnedWolo : entry.wageredWolo;
              const primaryLabel =
                entry.earnedWolo > 0
                  ? entry.sourceWindow === "weekly"
                    ? "Earned this week"
                    : "Earned total"
                  : entry.sourceWindow === "weekly"
                    ? "Wagered this week"
                    : "Wagered total";

              return (
                <Link
                  key={entry.key}
                  href={entry.href}
                  className={`block rounded-[1.2rem] border px-4 py-3 transition ${tone.card} ${tone.cardHover}`}
                >
                  <div className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold ${tone.rankBadge}`}
                    >
                      {formatOrdinal(entry.rank)}
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-white">{entry.name}</div>

                      <div className="mt-2 flex flex-wrap gap-2">
                        <MiniTag toneClassName={entry.verified ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : tone.neutralPill}>
                          {entry.verified ? "Steam linked" : entry.claimed ? "Claimed" : "Claimable"}
                        </MiniTag>

                        {entry.unclaimedWolo > 0 ? (
                          <MiniTag toneClassName="border-amber-300/30 bg-amber-400/10 text-amber-100">
                            Unclaimed
                          </MiniTag>
                        ) : null}

                        <MiniTag toneClassName={entry.sourceWindow === "weekly" ? tone.activeBadge : tone.neutralPill}>
                          {entry.sourceWindow === "weekly" ? "This week" : "Regular"}
                        </MiniTag>
                      </div>

                      <div className="mt-3 text-sm text-slate-300">
                        {entry.sourceWindow === "weekly"
                          ? `Earned ${formatWolo(entry.earnedWolo)} WOLO · Wagered ${formatWolo(entry.wageredWolo)} WOLO this week`
                          : `Earned ${formatWolo(entry.earnedWolo)} WOLO · Wagered ${formatWolo(entry.wageredWolo)} WOLO total`}
                      </div>

                      <div className="mt-1 text-xs text-slate-400">
                        {entry.wagerCount} bets · {entry.claimCount} payouts · Last action {formatLastActive(entry.lastActiveAt)}
                      </div>
                    </div>

                    <div className="border-t border-white/8 pt-3 sm:min-w-[7rem] sm:border-t-0 sm:pt-0 sm:text-right">
                      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
                        {primaryLabel}
                      </div>
                      <div className={`mt-1 text-lg font-semibold ${tone.rating}`}>
                        {formatWolo(primaryMetric)}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">WOLO</div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className={`mt-4 rounded-[1.25rem] border px-4 py-3 ${tone.insetPanel}`}>
        <div className="text-[11px] uppercase tracking-[0.24em] text-slate-400">Recognition Rail</div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-300">
            Earners rank first. If the week is quiet, the board backfills with proven WOLO regulars.
          </div>
          <div className="text-sm font-semibold text-white">
            {reserve
              ? `${reserve} WOLO reserve`
              : entries.length > 0
                ? `${entries.length} names tracked`
                : "Awaiting first payouts"}
          </div>
        </div>
      </div>
    </section>
  );
}
