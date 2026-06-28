"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbySnapshot } from "@/lib/lobby";
import type { LobbyWoloEarnersEntry, LobbyWoloEarnersMode } from "@/lib/lobby";
import { avatarThumbUrlForUser } from "@/lib/avatarAssets";

const WOLO_LOGO_SRC = "/api/media-assets/logo/footer-wolo?fallback=%2Flegacy%2Fwolo-logo-transparent.webp";

type TopWoloEarnersTileProps = {
  wolo: LobbySnapshot["wolo"];
  board: LobbySnapshot["woloEarners"] | null;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  className?: string;
  surface?: "standard" | "extreme";
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
        unoptimized
        className="h-[22px] w-[22px] object-contain"
      />
    </div>
  );
}

function getEntryTake(entry: LobbyWoloEarnersEntry, mode: LobbyWoloEarnersMode) {
  return mode === "weekly" ? entry.weeklyTakeWolo : entry.allTimeTakeWolo;
}

function compareEntriesForMode(mode: LobbyWoloEarnersMode) {
  return (a: LobbyWoloEarnersEntry, b: LobbyWoloEarnersEntry) => {
    const aTake = getEntryTake(a, mode);
    const bTake = getEntryTake(b, mode);
    if (bTake !== aTake) {
      return bTake - aTake;
    }

    const aOtherTake = mode === "weekly" ? a.allTimeTakeWolo : a.weeklyTakeWolo;
    const bOtherTake = mode === "weekly" ? b.allTimeTakeWolo : b.weeklyTakeWolo;
    if (bOtherTake !== aOtherTake) {
      return bOtherTake - aOtherTake;
    }

    const wageredDiff = b.wageredWolo - a.wageredWolo;
    if (wageredDiff !== 0) return wageredDiff;

    const settledDiff = b.settledWolo - a.settledWolo;
    if (settledDiff !== 0) return settledDiff;

    const claimableDiff = b.claimableWolo - a.claimableWolo;
    if (claimableDiff !== 0) return claimableDiff;

    const wagerCountDiff = b.wagerCount - a.wagerCount;
    if (wagerCountDiff !== 0) return wagerCountDiff;

    const claimCountDiff = b.claimCount - a.claimCount;
    if (claimCountDiff !== 0) return claimCountDiff;

    const aLastActiveAt = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : 0;
    const bLastActiveAt = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : 0;
    if (bLastActiveAt !== aLastActiveAt) {
      return bLastActiveAt - aLastActiveAt;
    }

    return a.name.localeCompare(b.name);
  };
}

export function TopWoloEarnersTile({
  wolo,
  board,
  themeKey,
  viewMode,
  className,
  surface = "standard",
}: TopWoloEarnersTileProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const isExtreme = surface === "extreme";
  const reserve = formatCompactWolo(wolo?.accounts.ecosystembounties?.wolo ?? null);
  const [mode, setMode] = useState<LobbyWoloEarnersMode>(board?.mode ?? "weekly");
  const entries = useMemo(
    () =>
      (board?.entries ?? [])
        .slice()
        .sort(compareEntriesForMode(mode))
        .map((entry, index) => ({ ...entry, rank: index + 1 })),
    [board?.entries, mode]
  );
  const statusLabel = mode === "weekly" ? "Weekly" : "All Time";
  const nextModeLabel = mode === "weekly" ? "All Time" : "Weekly";
  const headlineMeta =
    entries.length > 0 ? `${entries.length} earners` : reserve ? `${reserve} reserve` : "4 earners";
  const placeholderCount = Math.max(0, VISIBLE_ROWS - entries.length);
  const viewportHeightClassName = isExtreme
    ? "h-[min(72dvh,42rem)] min-h-[30rem] max-h-[42rem] lg:h-[76rem] lg:min-h-[76rem] lg:max-h-[76rem]"
    : "h-full min-h-0 max-h-full";

  return (
    <section
      className={`relative flex flex-col overflow-hidden rounded-[1.7rem] border p-4 pt-5 transition sm:p-5 sm:pt-7 ${isExtreme ? "isolate " : ""}${viewportHeightClassName} ${
        isExtreme
          ? "border-amber-200/10 bg-slate-950/74 shadow-[0_26px_88px_rgba(0,0,0,0.28)]"
          : tone.panelShell
      } ${className ?? ""}`}
      style={
        isExtreme
          ? {
              backgroundImage:
                "linear-gradient(180deg, rgba(2,6,23,0.96) 0%, rgba(2,6,23,0.99) 54%, rgba(2,6,23,1) 100%)",
              backgroundSize: "100% 100%",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }
          : undefined
      }
    >
      {isExtreme ? (
        <div
          data-war-chest-top-bg
          className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[7.6rem] opacity-55"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(2,6,23,0.12) 0%, rgba(2,6,23,0.42) 38%, rgba(2,6,23,0.86) 68%, rgba(2,6,23,1) 100%), url('/lobby/war-chest-bg.webp')",
            backgroundSize: "100% 100%, 100% 12.5rem",
            backgroundPosition: "top center, top center",
            backgroundRepeat: "no-repeat",
            WebkitMaskImage:
              "linear-gradient(180deg, black 0%, black 36%, rgba(0,0,0,0.28) 66%, transparent 100%)",
            maskImage:
              "linear-gradient(180deg, black 0%, black 36%, rgba(0,0,0,0.28) 66%, transparent 100%)",
          }}
        />
      ) : null}
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
            Top $WOLO Earners
          </div>
          <Link
            href="/war-chest"
            className="mt-4 flex items-center gap-2.5 rounded-2xl transition hover:text-amber-100"
            aria-label="Open War Chest"
          >
            <WoloMarkBadge />
            <h3 className="text-xl font-semibold text-white sm:text-[1.65rem]">WAR CHEST</h3>
          </Link>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <button
            type="button"
            onClick={() => setMode((current) => (current === "weekly" ? "all_time" : "weekly"))}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${tone.neutralPill} hover:border-amber-200/45 hover:bg-amber-300 hover:text-slate-950`}
            aria-label={`Show War Chest ${nextModeLabel}`}
            title={`Show ${nextModeLabel}`}
          >
            {statusLabel}
          </button>
          <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{headlineMeta}</div>
        </div>
      </div>

      <div className="relative z-10 mt-5 flex min-h-0 flex-1 flex-col overflow-hidden">
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
                  mode === "weekly" ? entry.weeklyTakeWolo : entry.allTimeTakeWolo;
                const primaryLabel = mode === "weekly" ? "Weekly take" : "All-time take";
                const avatarSrc = avatarThumbUrlForUser(entry.uid, entry.name);
                const rowClassName = isExtreme
                  ? "relative block overflow-hidden rounded-[1.25rem] border border-amber-200/8 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(255,255,255,0.018))] px-3 py-3 transition hover:border-amber-200/22 hover:bg-amber-300/7 sm:px-4 sm:py-4"
                  : `block rounded-[1.25rem] border px-4 py-4 transition ${tone.card} ${tone.cardHover}`;

                return (
                  <Link
                    key={entry.key}
                    href={entry.href}
                    className={rowClassName}
                  >
                    {isExtreme ? (
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-28 overflow-hidden opacity-78 sm:w-48 sm:opacity-90">
                        <Image
                          src={avatarSrc}
                          alt=""
                          fill
                          unoptimized
                          sizes="176px"
                          className="object-cover object-top [mask-image:linear-gradient(90deg,transparent_0%,black_28%,black_78%,transparent_100%)]"
                        />
                      </div>
                    ) : null}
                    <div className="relative z-10 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
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

                      <div className="col-start-2 sm:col-start-auto sm:min-w-[5.5rem] sm:pt-0.5 sm:text-right">
                        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
                          {primaryLabel}
                        </div>
                        <div className={`mt-1 text-[1.45rem] font-semibold leading-none ${tone.rating}`}>
                          {formatWolo(primaryMetric)}
                        </div>
                      </div>

                      <div className="col-start-2 min-w-0 sm:col-span-2 sm:col-start-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
                          <span className="break-words sm:whitespace-nowrap">
                            <span className="font-medium text-slate-200">Settled</span> {formatWolo(entry.settledWolo)} WOLO
                          </span>
                          <span className="hidden h-1 w-1 rounded-full bg-white/15 sm:inline-block" />
                          <span className="break-words sm:whitespace-nowrap">
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
