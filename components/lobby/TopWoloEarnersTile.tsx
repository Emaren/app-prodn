"use client";

import Image from "next/image";
import Link from "next/link";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbySnapshot } from "@/lib/lobby";

const WOLO_LOGO_SRC = "/legacy/wolo-logo-transparent.png";

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
  { rank: "4th", title: "Awaiting first earner" },
] as const;
const VISIBLE_ROWS = 4;

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
  children: ReactNode;
  toneClassName: string;
}) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] leading-none ${toneClassName}`}>
      {children}
    </span>
  );
}

function WoloMarkBadge() {
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <Image
        src={WOLO_LOGO_SRC}
        alt=""
        width={22}
        height={22}
        className="h-[22px] w-[22px] object-contain"
      />
    </div>
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
  const statusLabel = entries.length > 0 ? "Weekly" : "Standby";
  const headlineMeta =
    entries.length > 0 ? `${entries.length} earners` : reserve ? `${reserve} reserve` : "4 earners";
  const placeholderCount = Math.max(0, VISIBLE_ROWS - entries.length);
  const destinationHref = "/war-chest";

  function shouldIgnoreTileClick(target: EventTarget | null, currentTarget: EventTarget | null) {
    if (!(target instanceof Element)) {
      return false;
    }

    const interactiveAncestor = target.closest("a,button,input,textarea,select,[role='button']");
    return Boolean(interactiveAncestor && interactiveAncestor !== currentTarget);
  }

  function navigateToTileDestination() {
    if (typeof window === "undefined") {
      return;
    }

    window.location.assign(destinationHref);
  }

  function handleTileClick(event: MouseEvent<HTMLElement>) {
    if (shouldIgnoreTileClick(event.target, event.currentTarget)) {
      return;
    }

    navigateToTileDestination();
  }

  function handleTileKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    if (shouldIgnoreTileClick(event.target, event.currentTarget)) {
      return;
    }

    event.preventDefault();
    navigateToTileDestination();
  }

  return (
    <section
      className={`flex h-full min-h-0 max-h-full cursor-pointer flex-col overflow-hidden rounded-[1.7rem] border p-5 pt-7 transition ${tone.panelShell} ${tone.cardHover} ${className ?? ""}`}
      role="link"
      tabIndex={0}
      aria-label="Open War Chest analytics"
      onClick={handleTileClick}
      onKeyDown={handleTileKeyDown}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            Top $WOLO Earners
          </div>
          <div className="mt-4 flex items-center gap-2.5">
            <WoloMarkBadge />
            <h3 className="text-[1.65rem] font-semibold text-white">WAR CHEST</h3>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <div className={`inline-flex rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
            {statusLabel}
          </div>
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{headlineMeta}</div>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
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
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div className="grid gap-2.5">
              {entries.map((entry) => {

                const primaryMetric =
                  entry.weeklyTakeWolo > 0
                    ? entry.weeklyTakeWolo
                    : entry.claimableWolo > 0
                      ? entry.claimableWolo
                      : entry.settledWolo;

                const primaryLabel = "Weekly take";

                return (
                  <Link
                    key={entry.key}
                    href={entry.href}
                    className={`block rounded-[1.25rem] border px-4 py-4 transition ${tone.card} ${tone.cardHover}`}
                  >
                    <div className="grid gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-semibold ${tone.rankBadge}`}
                      >
                        {formatOrdinal(entry.rank)}
                      </div>

                      <div className="min-w-0">
                        <div className="truncate text-[15px] font-semibold text-white">{entry.name}</div>

                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <MiniTag toneClassName={entry.verified ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100" : tone.neutralPill}>
                            {entry.verified ? "Steam linked" : entry.claimed ? "Profile claimed" : "Replay profile"}
                          </MiniTag>

                          {entry.claimableWolo > 0 ? (
                            <MiniTag toneClassName="border-amber-300/30 bg-amber-400/10 text-amber-100">
                              Claimable now
                            </MiniTag>
                          ) : null}
                        </div>
                      </div>

                      <div className="sm:min-w-[5.5rem] sm:pt-0.5 sm:text-right">
                        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
                          {primaryLabel}
                        </div>
                        <div className={`mt-1 text-[1.45rem] font-semibold leading-none ${tone.rating}`}>
                          {formatWolo(primaryMetric)}
                        </div>
                      </div>

                      <div className="sm:col-span-2 sm:col-start-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                          <span className="whitespace-nowrap">
                            <span className="font-medium text-slate-200">Settled</span> {formatWolo(entry.settledWolo)} WOLO
                          </span>
                          <span className="hidden h-1 w-1 rounded-full bg-white/15 sm:inline-block" />
                          <span className="whitespace-nowrap">
                            <span className="font-medium text-slate-200">Wagered</span> {formatWolo(entry.wageredWolo)} WOLO
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {PLACEHOLDER_LANES.slice(entries.length, entries.length + placeholderCount).map((lane) => (
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
          </div>
        )}
      </div>
    </section>
  );
}
