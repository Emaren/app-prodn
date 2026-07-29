"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, UIEvent } from "react";
import SteamLoginButton from "@/components/SteamLoginButton";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import { LeaderboardPanel } from "@/components/lobby/LeaderboardPanel";
import { LeaderboardLaneToggle } from "@/components/lobby/LeaderboardLaneToggle";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import { StatCard } from "@/components/lobby/StatCard";
import type { Aoe2HdPulseItem, Aoe2HdPulseSnapshot } from "@/lib/aoe2HdPulse";
import type { LobbyLeaderboardEntry, LobbyMatchRow, LobbySnapshot } from "@/lib/lobby";
import { avatarThumbUrlForUser, avatarUrlForUser } from "@/lib/avatarAssets";
import type { LeaderboardLane } from "@/lib/leaderboardLane";
import { trackLeaderboardEvent } from "@/lib/leaderboardTelemetry";
import { TILE_VIEW_MODES, type TileViewMode } from "@/lib/tileViewPreferences";
import {
  normalizePublicReplayText,
  publicReplayMapLabel,
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";

type WoloMoved24hSnapshot = {
  totalWolo: number;
  transferCount: number;
};

const EXTREME_LEADERBOARD_PAGE_SIZE = 64;

type ExtremeLeaderboardPageResponse = {
  entries?: LobbySnapshot["leaderboard"]["entries"];
  nextOffset?: number;
  hasMore?: boolean;
};

function mergeExtremeLeaderboardEntries(
  primary: LobbySnapshot["leaderboard"]["entries"],
  secondary: LobbySnapshot["leaderboard"]["entries"]
) {
  const byKey = new Map<
    string,
    LobbySnapshot["leaderboard"]["entries"][number]
  >();

  for (const entry of [...primary, ...secondary]) {
    byKey.set(entry.key, entry);
  }

  return Array.from(byKey.values()).sort((left, right) => {
    if (left.rank !== right.rank) {
      return left.rank - right.rank;
    }

    return left.name.localeCompare(right.name);
  });
}

function formatCompactStatNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 1000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

type LobbyHeroProps = {
  liveConnected: boolean;
  authError: boolean;
  authDetail: string | null;
  lobbyError: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  leaderboard: LobbySnapshot["leaderboard"];
  leaderboardLane: LeaderboardLane;
  leaderboardLaneLoading: boolean;
  onLeaderboardLaneChange: (lane: LeaderboardLane) => void;
  recentMatches: LobbyMatchRow[];
  wolo: LobbySnapshot["wolo"];
  aoe2hdPulse: Aoe2HdPulseSnapshot | null;
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  onViewModeChange: (viewMode: LobbyViewMode) => void;
  tileViewMode: TileViewMode;
  onTileViewModeChange: (viewMode: TileViewMode) => void;
  onToggleTileViewMode: () => void;
};

function formatCompactWolo(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function isInteractiveToggleTarget(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(target.closest("a,button,input,textarea,select,label,[data-ignore-tile-toggle='true']"))
    : false;
}

function isLeaderboardNavigationControl(target: EventTarget | null) {
  return target instanceof HTMLElement
    ? Boolean(
        target.closest(
          "a,button,input,textarea,select,label,[role='button'],[data-ignore-leaderboard-navigation='true']"
        )
      )
    : false;
}

function getRecentMatchSummary(match: LobbyMatchRow | null | undefined) {
  if (!match) {
    return null;
  }

  const mapName = normalizePublicReplayText(publicReplayMapLabel(match.map));
  const winner = resolveReliableReplayWinner({
    winner: match.winner,
    parseReason: match.parse_reason,
  });

  if (winner && mapName) {
    return `${winner} on ${mapName}`.slice(0, 48);
  }

  if (winner) {
    return winner.slice(0, 48);
  }

  if (mapName) {
    return mapName.slice(0, 48);
  }

  return "Replay needs review";
}

function buildPulseItems({
  pulse,
  leaderboard,
  recentMatches,
}: {
  pulse: Aoe2HdPulseSnapshot | null;
  leaderboard: LobbySnapshot["leaderboard"];
  recentMatches: LobbyMatchRow[];
}) {
  const externalItems = pulse?.items ?? [];
  if (externalItems.length >= 3) {
    return externalItems.slice(0, 3);
  }

  const latestMatch = getRecentMatchSummary(recentMatches[0]);
  const fallbackItems: Aoe2HdPulseItem[] = [
    {
      label: "Online now",
      value: String(leaderboard.activePlayers),
      detail: "AoE2HDBets live sessions",
    },
    {
      label: "Resolved today",
      value: String(leaderboard.matchesToday),
      detail:
        leaderboard.needsReviewToday > 0
          ? `${leaderboard.needsReviewToday} final replay${leaderboard.needsReviewToday === 1 ? "" : "s"} awaiting parser review`
          : "Unique final replays with reliable results",
    },
    latestMatch
      ? {
          label: "Latest replay",
          value: latestMatch,
          detail: "Most recent HD parse",
        }
      : {
          label: "Identity rows",
          value: String(leaderboard.trackedPlayers),
          detail: `${leaderboard.rankedPlayers} ranked on the board`,
        },
  ];

  return [...externalItems, ...fallbackItems].slice(0, 3);
}

function formatSteamHdChip(pulse: Aoe2HdPulseSnapshot | null) {
  if (pulse?.steamHd) {
    const { openLobbies, openSeats } = pulse.steamHd;
    return typeof openSeats === "number"
      ? `${openLobbies} HD lobbies · ${openSeats} seats`
      : `Steam HD: ${openLobbies} open lobbies`;
  }

  return pulse?.sourceStatus === "error" ? "Steam HD: source quiet" : "Steam HD: feed pending";
}

function primaryRating(entry: LobbyLeaderboardEntry) {
  return entry.primaryRating ?? null;
}

function TileModeToggle({
  tileViewMode,
  tone,
  onTileViewModeChange,
}: {
  tileViewMode: TileViewMode;
  tone: ReturnType<typeof getLobbyPresentationTone>;
  onTileViewModeChange: (viewMode: TileViewMode) => void;
}) {
  return (
    <div className={`flex rounded-full border p-1 text-xs ${tone.viewToggle}`}>
      {TILE_VIEW_MODES.map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onTileViewModeChange(mode)}
          className={`rounded-full px-3 py-1 capitalize transition ${
            tileViewMode === mode ? tone.viewToggleActive : "text-slate-400 hover:text-white"
          }`}
        >
          {mode}
        </button>
      ))}
    </div>
  );
}

export function LobbyHero({
  liveConnected,
  authError,
  authDetail,
  lobbyError,
  isAuthenticated,
  loading,
  leaderboard,
  leaderboardLane,
  leaderboardLaneLoading,
  onLeaderboardLaneChange,
  recentMatches,
  wolo,
  aoe2hdPulse,
  themeKey,
  viewMode,
  onViewModeChange,
  tileViewMode,
  onTileViewModeChange,
  onToggleTileViewMode,
}: LobbyHeroProps) {
  const router = useRouter();
  const accentTextClassName =
    viewMode === "field" ? "text-emerald-200/70" : "text-amber-200/70";

  const primaryActionClassName =
    viewMode === "field"
      ? "inline-flex min-h-14 items-center justify-center rounded-full bg-emerald-300 px-6 text-center text-[13px] font-semibold leading-tight text-slate-950 transition hover:bg-emerald-200"
      : "inline-flex min-h-14 items-center justify-center rounded-full bg-amber-300 px-6 text-center text-[13px] font-semibold leading-tight text-slate-950 transition hover:bg-amber-200";

  const woloShellClassName =
    viewMode === "field"
      ? "border border-emerald-300/20 bg-emerald-950/20"
      : "border border-amber-200/15 bg-slate-950/25";

  const woloPillClassName =
    viewMode === "field"
      ? "border border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
      : "border border-amber-300/20 bg-amber-300/10 text-amber-100";

  const faucetPool = wolo?.accounts.faucetgrowth?.wolo ?? null;
  const treasury = wolo?.accounts.communitytreasury?.wolo ?? null;
  const liquidity = wolo?.accounts.dexliquidity?.wolo ?? null;

  const handleTileClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isInteractiveToggleTarget(event.target)) {
      return;
    }

    onToggleTileViewMode();
  };
  const openLeaderboard = () => {
    trackLeaderboardEvent({
      type: "leaderboard_open_home_tile",
      metadata: { destination: "modern" },
    });
    router.push("/leaderboard");
  };
  const handleExtremeLeaderboardClick = (event: MouseEvent<HTMLElement>) => {
    if (isLeaderboardNavigationControl(event.target)) return;
    event.stopPropagation();
    if (window.getSelection()?.toString()) return;
    openLeaderboard();
  };
  const handleExtremeLeaderboardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (isLeaderboardNavigationControl(event.target)) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      openLeaderboard();
    }
  };
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const [woloMoved24h, setWoloMoved24h] = useState<WoloMoved24hSnapshot>({
    totalWolo: 0,
    transferCount: 0,
  });
  const showExtremeStats = tileViewMode === "extreme";

  const [extremeLeaderboardEntries, setExtremeLeaderboardEntries] =
    useState(leaderboard.entries);
  const [extremeLeaderboardLoading, setExtremeLeaderboardLoading] =
    useState(false);
  const [extremeLeaderboardHasMore, setExtremeLeaderboardHasMore] =
    useState(leaderboard.entries.length < leaderboard.trackedPlayers);

  const extremeLeaderboardEntriesRef =
    useRef(leaderboard.entries);
  const extremeLeaderboardNextOffsetRef =
    useRef(leaderboard.entries.length);
  const extremeLeaderboardLoadingRef =
    useRef(false);
  const extremeLeaderboardHasMoreRef =
    useRef(leaderboard.entries.length < leaderboard.trackedPlayers);
  const extremeLeaderboardLaneRef =
    useRef(leaderboard.lane);
  const extremeLeaderboardScrollRef =
    useRef<HTMLDivElement | null>(null);
  const extremeLeaderboardSentinelRef =
    useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const laneChanged =
      extremeLeaderboardLaneRef.current !== leaderboard.lane;

    if (laneChanged) {
      extremeLeaderboardLaneRef.current = leaderboard.lane;
      extremeLeaderboardEntriesRef.current = leaderboard.entries;
      extremeLeaderboardNextOffsetRef.current =
        leaderboard.entries.length;

      setExtremeLeaderboardEntries(leaderboard.entries);

      const nextHasMore =
        leaderboard.entries.length < leaderboard.trackedPlayers;

      extremeLeaderboardHasMoreRef.current = nextHasMore;
      setExtremeLeaderboardHasMore(nextHasMore);
      return;
    }

    const merged = mergeExtremeLeaderboardEntries(
      leaderboard.entries,
      extremeLeaderboardEntriesRef.current
    );

    extremeLeaderboardEntriesRef.current = merged;
    setExtremeLeaderboardEntries(merged);

    extremeLeaderboardNextOffsetRef.current = Math.max(
      extremeLeaderboardNextOffsetRef.current,
      leaderboard.entries.length
    );

    const nextHasMore =
      extremeLeaderboardNextOffsetRef.current <
      leaderboard.trackedPlayers;

    extremeLeaderboardHasMoreRef.current = nextHasMore;
    setExtremeLeaderboardHasMore(nextHasMore);
  }, [
    leaderboard.entries,
    leaderboard.lane,
    leaderboard.trackedPlayers,
  ]);

  const loadMoreExtremeLeaderboard = useCallback(async () => {
    if (extremeLeaderboardLoadingRef.current) return;
    if (!extremeLeaderboardHasMoreRef.current) return;

    const offset =
      extremeLeaderboardNextOffsetRef.current;

    extremeLeaderboardLoadingRef.current = true;
    setExtremeLeaderboardLoading(true);

    try {
      const response = await fetch(
        `/api/lobby/leaderboard?lane=${encodeURIComponent(
          leaderboard.lane
        )}&offset=${offset}&limit=${EXTREME_LEADERBOARD_PAGE_SIZE}`,
        { cache: "no-store" }
      );

      if (!response.ok) {
        return;
      }

      const payload =
        (await response.json()) as ExtremeLeaderboardPageResponse;

      const nextEntries = Array.isArray(payload.entries)
        ? payload.entries
        : [];

      if (nextEntries.length === 0) {
        extremeLeaderboardHasMoreRef.current = false;
        setExtremeLeaderboardHasMore(false);
        return;
      }

      const merged = mergeExtremeLeaderboardEntries(
        extremeLeaderboardEntriesRef.current,
        nextEntries
      );

      extremeLeaderboardEntriesRef.current = merged;
      setExtremeLeaderboardEntries(merged);

      const nextOffset =
        typeof payload.nextOffset === "number"
          ? payload.nextOffset
          : offset + nextEntries.length;

      extremeLeaderboardNextOffsetRef.current = nextOffset;

      const nextHasMore =
        typeof payload.hasMore === "boolean"
          ? payload.hasMore
          : nextOffset < leaderboard.trackedPlayers;

      extremeLeaderboardHasMoreRef.current = nextHasMore;
      setExtremeLeaderboardHasMore(nextHasMore);
    } catch (error) {
      console.warn(
        "Failed to load more Extreme leaderboard entries:",
        error
      );
    } finally {
      extremeLeaderboardLoadingRef.current = false;
      setExtremeLeaderboardLoading(false);
    }
  }, [
    leaderboard.lane,
    leaderboard.trackedPlayers,
  ]);

  const handleExtremeLeaderboardScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const target = event.currentTarget;

      const distanceFromBottom =
        target.scrollHeight -
        target.scrollTop -
        target.clientHeight;

      if (distanceFromBottom < 2400) {
        void loadMoreExtremeLeaderboard();
      }
    },
    [loadMoreExtremeLeaderboard]
  );

  useEffect(() => {
    if (tileViewMode !== "extreme") return;
    if (!extremeLeaderboardHasMore) return;

    const root = extremeLeaderboardScrollRef.current;
    const sentinel = extremeLeaderboardSentinelRef.current;

    if (!root || !sentinel) return;

    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          void loadMoreExtremeLeaderboard();
        }
      },
      {
        root,
        rootMargin: "2400px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [
    tileViewMode,
    extremeLeaderboardHasMore,
    loadMoreExtremeLeaderboard,
  ]);

  useEffect(() => {
    let cancelled = false;

    async function loadWoloMoved24h() {
      try {
        const response = await fetch("/api/wolo/moved24h", { cache: "no-store" });
        if (!response.ok) return;

        const payload = (await response.json()) as Partial<WoloMoved24hSnapshot>;
        if (cancelled) return;

        setWoloMoved24h({
          totalWolo:
            typeof payload.totalWolo === "number" && Number.isFinite(payload.totalWolo)
              ? payload.totalWolo
              : 0,
          transferCount:
            typeof payload.transferCount === "number" && Number.isFinite(payload.transferCount)
              ? payload.transferCount
              : 0,
        });
      } catch (error) {
        console.warn("Failed to load 24h WOLO movement:", error);
      }
    }

    void loadWoloMoved24h();

    return () => {
      cancelled = true;
    };
  }, []);


  if (tileViewMode === "extreme") {
    const leaderboardRows = extremeLeaderboardEntries;
    const featuredEntry = leaderboardRows[0] ?? null;
    const featuredName = featuredEntry?.name || "Sniper";
    const featuredRating = featuredEntry ? primaryRating(featuredEntry) : null;

    return (
      <div
        className="space-y-5 cursor-pointer"
        data-lobby-hero-stack="true"
        onClick={handleTileClick}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-sm uppercase tracking-[0.42em] text-amber-100/78">
              Community Lobby
            </div>
            <div className="rounded-full border border-amber-200/16 bg-amber-300/10 px-3 py-1 text-xs text-amber-100">
              Extreme
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs ${
                liveConnected
                  ? "border border-emerald-300/26 bg-emerald-400/10 text-emerald-100"
                  : "border border-white/8 bg-white/[0.035] text-slate-400"
              }`}
            >
              {liveConnected ? "Live updates connected" : "Polling fallback"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-ignore-tile-toggle="true">
            <div className="rounded-full border border-cyan-200/14 bg-cyan-300/8 px-3 py-1 text-xs text-cyan-50/85">
              {formatSteamHdChip(aoe2hdPulse)}
            </div>
            <TileModeToggle
              tileViewMode={tileViewMode}
              tone={tone}
              onTileViewModeChange={onTileViewModeChange}
            />
          </div>
        </div>

        {authError && (
          <div className="max-w-2xl rounded-2xl border border-red-400/24 bg-red-500/8 px-4 py-3 text-sm text-red-100">
            Steam sign-in failed{authDetail ? `: ${authDetail}` : "."}
          </div>
        )}

        {lobbyError && (
          <div className="max-w-2xl rounded-2xl border border-amber-300/18 bg-amber-300/8 px-4 py-3 text-sm text-amber-100">
            {lobbyError}
          </div>
        )}

        <section
          role="link"
          tabIndex={0}
          aria-label="Open the full HD Leaderboard"
          data-ignore-tile-toggle="true"
          onClick={handleExtremeLeaderboardClick}
          onKeyDown={handleExtremeLeaderboardKeyDown}
          className="relative cursor-pointer overflow-hidden rounded-[1.85rem] border border-amber-200/12 bg-[radial-gradient(circle_at_20%_0%,rgba(251,191,36,0.16),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(59,130,246,0.12),transparent_28%),linear-gradient(135deg,rgba(5,11,21,0.96),rgba(1,5,14,0.98))] p-4 shadow-[0_30px_100px_rgba(0,0,0,0.34)] outline-none transition hover:-translate-y-0.5 hover:border-amber-200/24 focus-visible:ring-2 focus-visible:ring-amber-200/55 sm:p-5"
        >
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-amber-200/34 to-transparent" />
          <div className="grid gap-5 xl:grid-cols-[minmax(19rem,0.66fr)_minmax(0,1fr)] xl:items-stretch 2xl:grid-cols-[minmax(22rem,0.72fr)_minmax(0,1fr)]">
            <div className="relative min-h-[21rem] overflow-hidden rounded-[1.55rem] border border-amber-200/10 bg-[radial-gradient(circle_at_48%_12%,rgba(251,191,36,0.08),transparent_28%),linear-gradient(135deg,rgba(0,0,0,0.38),rgba(2,6,23,0.42))] sm:min-h-[25rem] xl:min-h-[42rem]">
              <Image
                src={avatarUrlForUser(featuredEntry?.uid, featuredName)}
                alt=""
                fill
                priority
                quality={95}
                sizes="(min-width: 1536px) 360px, (min-width: 1280px) 300px, 90vw"
                className="object-contain object-top opacity-100 [mask-image:linear-gradient(180deg,black_0%,black_82%,transparent_100%)] xl:object-cover"
              />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_18%,rgba(2,6,23,0.22)_56%,rgba(2,6,23,0.96)_100%)]" />
              <div className="absolute inset-x-4 bottom-4 rounded-2xl border border-amber-200/12 bg-black/42 p-4 backdrop-blur xl:inset-x-5">
                <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/70">
                  Featured Contender
                </div>
                <div className="mt-1 text-2xl font-semibold text-white">{featuredName}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                  {featuredRating ? `${featuredRating} rating` : "Board leader"}
                </div>
                {featuredEntry?.href ? (
                  <Link
                    href={featuredEntry.href}
                    className="mt-4 inline-flex rounded-full border border-amber-200/20 px-4 py-2 text-sm font-semibold text-amber-50 transition hover:bg-amber-300/10"
                  >
                    Open Profile
                  </Link>
                ) : null}
              </div>
            </div>

            <div className="min-w-0 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.25rem] border border-amber-200/10 bg-white/[0.035] px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/55">Board</div>
                  <div className="mt-2 text-3xl font-semibold text-white">{leaderboard.trackedPlayers}</div>
                  <div className="mt-1 text-xs text-slate-400">competitive identity rows</div>
                </div>
                <div className="min-w-0 rounded-[1.25rem] border border-amber-200/10 bg-white/[0.035] px-4 py-4">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-amber-100/55">Vanguard</div>
                  <div className="mt-2 truncate text-xl font-semibold text-white">{featuredName}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    {featuredRating ? `#1 · ${featuredRating} rating` : "Awaiting a rated contender"}
                  </div>
                </div>
                <LeaderboardLaneToggle
                  lane={leaderboardLane}
                  loading={leaderboardLaneLoading}
                  onChange={onLeaderboardLaneChange}
                  variant="card"
                  className="sm:col-span-2"
                />
              </div>

              <div className="rounded-[1.55rem] border border-amber-200/10 bg-black/22 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.35em] text-amber-100/60">
                      Leaderboard
                    </div>
                    <div className="mt-2 text-5xl font-semibold leading-none text-white">
                      {leaderboard.trackedPlayers}
                    </div>
                    <div className="mt-2 text-xs uppercase tracking-[0.28em] text-slate-400">
                      Identity rows on board
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-300/18 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                    {leaderboard.activePlayers} online
                  </span>
                </div>

                <div
                  ref={extremeLeaderboardScrollRef}
                  data-ignore-leaderboard-navigation="true"
                  onScroll={handleExtremeLeaderboardScroll}
                  className="mt-5 max-h-[46rem] space-y-2.5 overflow-y-auto overscroll-y-contain pr-1 [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
                >
                  {leaderboardRows.length === 0 ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
                      The board is warming up.
                    </div>
                  ) : (
                    leaderboardRows.map((entry) => {
                      const rating = primaryRating(entry);
                      return (
                        <Link
                          key={entry.key}
                          href={entry.href}
                          className="group grid min-h-20 grid-cols-[2.5rem_3.4rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-amber-200/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] px-3 py-2.5 transition hover:border-amber-200/26 hover:bg-amber-300/8"
                        >
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-amber-200/16 bg-amber-300/10 text-sm font-semibold text-amber-50">
                            #{entry.rank}
                          </div>
                          <div className="relative h-14 w-14 overflow-hidden rounded-full border border-amber-200/24 bg-black/30">
                            <Image
                              src={avatarThumbUrlForUser(entry.uid, entry.name)}
                              alt=""
                              fill
                              unoptimized
                              sizes="56px"
                              className="object-cover object-top"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-lg font-semibold text-white group-hover:text-amber-50">
                              {entry.name}
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                              <span>{entry.primaryRatingSourceLabel}</span>
                              <span>{entry.wins}-{entry.losses}</span>
                              {entry.claimed ? <span className="text-emerald-100">claimed</span> : null}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">
                              Rating
                            </div>
                            <div className="mt-1 text-lg font-semibold text-amber-50">
                              {rating ?? "—"}
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}

                  <div
                    ref={extremeLeaderboardSentinelRef}
                    aria-hidden="true"
                    className="h-px w-full"
                  />

                  {extremeLeaderboardLoading ? (
                    <div className="py-3 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Reinforcements arriving…
                    </div>
                  ) : null}
                </div>
              </div>

              {wolo?.enabled ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <StatCard
                    label="Faucet Pool"
                    value={formatCompactWolo(faucetPool)}
                    subtext="Daily claim fuel."
                    tone="emerald"
                    themeKey={themeKey}
                    viewMode={viewMode}
                  />
                  <StatCard
                    label="Treasury"
                    value={formatCompactWolo(treasury)}
                    subtext="Community war chest."
                    themeKey={themeKey}
                    viewMode={viewMode}
                  />
                  <StatCard
                    label="DEX Liquidity Reserve"
                    value={formatCompactWolo(liquidity)}
                    subtext="Market depth."
                    themeKey={themeKey}
                    viewMode={viewMode}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {showExtremeStats ? (
          <div data-ignore-tile-toggle="true" className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.55rem] border border-emerald-200/40 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(15,23,42,0.5))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_18px_55px_rgba(0,0,0,0.18)]">
              <div className="text-[11px] uppercase tracking-[0.34em] text-emerald-100/72">
                Active Players
              </div>
              <div className="mt-4 text-4xl font-semibold tracking-tight text-white tabular-nums">
                {leaderboard.activePlayers}
              </div>
              <div className="mt-4 text-sm font-medium text-slate-300">Online now.</div>
            </div>

            <div className="rounded-[1.55rem] border border-white/14 bg-slate-950/44 px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.045),0_18px_55px_rgba(0,0,0,0.18)]">
              <div className="text-[11px] uppercase tracking-[0.34em] text-slate-300/70">
                Resolved Today
              </div>
              <div className="mt-4 text-4xl font-semibold tracking-tight text-white tabular-nums">
                {leaderboard.matchesToday}
              </div>
              <div className="mt-4 text-sm font-medium text-slate-300">
                {leaderboard.needsReviewToday > 0
                  ? `${leaderboard.needsReviewToday} awaiting parser review.`
                  : "Reliable final games."}
              </div>
            </div>

            <div className="rounded-[1.55rem] border border-amber-200/35 bg-[linear-gradient(135deg,rgba(251,191,36,0.13),rgba(15,23,42,0.48))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.055),0_18px_55px_rgba(0,0,0,0.18)]">
              <div className="text-[11px] uppercase tracking-[0.28em] text-amber-100/75">
                WOLO Moved · 24h
              </div>
              <div className="mt-4 text-4xl font-semibold tracking-tight text-white tabular-nums">
                {formatCompactStatNumber(woloMoved24h.totalWolo)}
              </div>
              <div className="mt-4 text-sm font-medium text-slate-300">
                {formatCompactStatNumber(woloMoved24h.transferCount)} transfers.
              </div>
            </div>
          </div>
        ) : null}


        <div
          className={
            isAuthenticated
              ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              : "grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]"
          }
          data-ignore-tile-toggle="true"
        >
          {isAuthenticated ? (
            <Link href="/profile" className={primaryActionClassName}>
              Open Profile
            </Link>
          ) : (
            <SteamLoginButton
              className={`${primaryActionClassName} w-full whitespace-nowrap`}
              label={loading ? "Loading..." : "Login with Steam"}
              disabled={loading}
            />
          )}

          <Link
            href={isAuthenticated ? "/upload" : "/download"}
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-amber-200/14 px-5 text-center text-[13px] font-medium leading-tight text-white/85 transition hover:border-amber-200/32 hover:text-amber-50"
          >
            {isAuthenticated ? "Upload Replay" : "Download Watcher"}
          </Link>

          <Link
            href="/rivalries"
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-amber-200/14 px-5 text-center text-[13px] font-medium leading-tight text-white/85 transition hover:border-amber-200/32 hover:text-amber-50"
          >
            View Rivalries
          </Link>
        </div>
      </div>
    );
  }

  if (tileViewMode === "advanced") {
    const pulseItems = buildPulseItems({
      pulse: aoe2hdPulse,
      leaderboard,
      recentMatches,
    });

    return (
      <div
        className="space-y-5 cursor-pointer"
        data-lobby-hero-stack="true"
        onClick={handleTileClick}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className={`text-sm uppercase tracking-[0.4em] ${accentTextClassName}`}>
              Community Lobby
            </div>
            <div className={`rounded-full border px-3 py-1 text-xs ${tone.statusBadge}`}>
              Advanced
            </div>
            <div
              className={`rounded-full px-3 py-1 text-xs ${
                liveConnected
                  ? viewMode === "field"
                    ? "border border-emerald-300/30 bg-emerald-500/12 text-emerald-50"
                    : "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                  : "border border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              {liveConnected ? "Live updates connected" : "Polling fallback"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2" data-ignore-tile-toggle="true">
            <div className="rounded-full border border-cyan-200/20 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-50">
              {formatSteamHdChip(aoe2hdPulse)}
            </div>
            <TileModeToggle
              tileViewMode={tileViewMode}
              tone={tone}
              onTileViewModeChange={onTileViewModeChange}
            />
          </div>
        </div>

        {authError && (
          <div className="max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            Steam sign-in failed{authDetail ? `: ${authDetail}` : "."}
          </div>
        )}

        {lobbyError && (
          <div className="max-w-2xl rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
            {lobbyError}
          </div>
        )}

        <section className={`rounded-[1.85rem] border p-5 sm:p-6 ${tone.panelShell}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={`text-xs uppercase tracking-[0.35em] ${tone.eyebrow}`}>
                AoE2HD Pulse
              </div>
              <div className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                Compressed lobby signal for who is around, what moved, and where the board is warm.
              </div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${tone.neutralPill}`}>
              {aoe2hdPulse?.sourceLabel || "AoE2HDBets"}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {pulseItems.map((item) => (
              <div
                key={`${item.label}:${item.value}`}
                className={`min-h-[7.5rem] rounded-2xl border px-4 py-4 ${tone.insetPanel}`}
              >
                <div className={`text-[10px] uppercase tracking-[0.28em] ${tone.eyebrow}`}>
                  {item.label}
                </div>
                <div className="mt-3 break-words text-2xl font-semibold leading-tight text-white">
                  {item.value}
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-400">
                  {item.detail || "\u00a0"}
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`rounded-2xl border px-4 py-4 ${tone.insetPanel}`}>
            <div className={`text-[10px] uppercase tracking-[0.26em] ${tone.eyebrow}`}>
              Board
            </div>
            <div className="mt-2 text-2xl font-semibold text-white">
              {leaderboard.trackedPlayers}
            </div>
            <div className="mt-1 text-xs text-slate-400">competitive identity rows</div>
          </div>
          <div className={`rounded-2xl border px-4 py-4 ${tone.insetPanel}`}>
            <div className={`text-[10px] uppercase tracking-[0.26em] ${tone.eyebrow}`}>
              Vanguard
            </div>
            <div className="mt-2 truncate text-xl font-semibold text-white">
              {leaderboard.entries[0]?.name || "Open"}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {leaderboard.entries[0]?.primaryRating
                ? `#1 · ${leaderboard.entries[0].primaryRating} rating`
                : "Awaiting a rated contender"}
            </div>
          </div>
        </div>

        <div data-ignore-tile-toggle="true">
          <LeaderboardPanel
            leaderboard={leaderboard}
            onlineCount={leaderboard.activePlayers}
            themeKey={themeKey}
            viewMode={viewMode}
            onViewModeChange={onViewModeChange}
            leaderboardLane={leaderboardLane}
            leaderboardLaneLoading={leaderboardLaneLoading}
            onLeaderboardLaneChange={onLeaderboardLaneChange}
            laneToggleVariant="compact"
            surface={showExtremeStats ? "extreme" : "standard"}
          />
        </div>

        <div
          className={
            isAuthenticated
              ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              : "grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]"
          }
          data-ignore-tile-toggle="true"
        >
          {isAuthenticated ? (
            <Link href="/profile" className={primaryActionClassName}>
              Open Profile
            </Link>
          ) : (
            <SteamLoginButton
              className={`${primaryActionClassName} w-full whitespace-nowrap`}
              label={loading ? "Loading..." : "Login with Steam"}
              disabled={loading}
            />
          )}

          <Link
            href={isAuthenticated ? "/upload" : "/download"}
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/15 px-5 text-center text-[13px] font-medium leading-tight text-white/85 transition hover:border-white/30 hover:text-white"
          >
            {isAuthenticated ? "Upload Replay" : "Download Watcher"}
          </Link>

          <Link
            href="/rivalries"
            className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/15 px-5 text-center text-[13px] font-medium leading-tight text-white/85 transition hover:border-white/30 hover:text-white"
          >
            View Rivalries
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="space-y-6 cursor-pointer"
      data-lobby-hero-stack="true"
      onClick={handleTileClick}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className={`text-sm uppercase tracking-[0.4em] ${accentTextClassName}`}>
            Community Lobby
          </div>
          <div
            className={`rounded-full px-3 py-1 text-xs ${
              liveConnected
                ? viewMode === "field"
                  ? "border border-emerald-300/30 bg-emerald-500/12 text-emerald-50"
                  : "border border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                : "border border-white/10 bg-white/5 text-slate-300"
            }`}
          >
            {liveConnected ? "Live updates connected" : "Polling fallback"}
          </div>

          {wolo?.enabled && (
            <div className={`rounded-full px-3 py-1 text-xs ${woloPillClassName}`}>
              WoloChain {wolo.chainId}
            </div>
          )}
        </div>

        <div data-ignore-tile-toggle="true">
          <TileModeToggle
            tileViewMode={tileViewMode}
            tone={tone}
            onTileViewModeChange={onTileViewModeChange}
          />
        </div>
      </div>

      {authError && (
        <div className="max-w-2xl rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Steam sign-in failed{authDetail ? `: ${authDetail}` : "."}
        </div>
      )}

      {lobbyError && (
        <div className="max-w-2xl rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          {lobbyError}
        </div>
      )}

      <LeaderboardPanel
        leaderboard={leaderboard}
        onlineCount={leaderboard.activePlayers}
        themeKey={themeKey}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        leaderboardLane={leaderboardLane}
        leaderboardLaneLoading={leaderboardLaneLoading}
        onLeaderboardLaneChange={onLeaderboardLaneChange}
        surface={showExtremeStats ? "extreme" : "standard"}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Active Players"
          value={String(leaderboard.activePlayers)}
          subtext="Online right now."
          tone="emerald"
          themeKey={themeKey}
          viewMode={viewMode}
        />
        <StatCard
          label="Resolved Today"
          value={String(leaderboard.matchesToday)}
          subtext={
            leaderboard.needsReviewToday > 0
              ? `${leaderboard.needsReviewToday} final replay${leaderboard.needsReviewToday === 1 ? "" : "s"} need review.`
              : "Reliable final games."
          }
          themeKey={themeKey}
          viewMode={viewMode}
        />
      </div>

      {wolo?.enabled && (
        <div className={`rounded-[1.5rem] p-4 sm:p-5 ${woloShellClassName}`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">
                WOLO Dev Rail
              </div>
              <div className="mt-1 text-sm text-white/70">
                Local chain snapshot feeding AoE2HDBets dev mode.
              </div>
            </div>
            <div className="text-xs text-white/45">
              {wolo.updatedAt ? (
                <>Updated <TimeDisplayText value={wolo.updatedAt} /></>
              ) : (
                "Waiting for snapshot"
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Faucet Pool"
              value={formatCompactWolo(faucetPool)}
              subtext="Daily claim fuel."
              tone="emerald"
              themeKey={themeKey}
              viewMode={viewMode}
            />
            <StatCard
              label="Treasury"
              value={formatCompactWolo(treasury)}
              subtext="Community war chest."
              themeKey={themeKey}
              viewMode={viewMode}
            />
            <StatCard
              label="DEX Liquidity Reserve"
              value={formatCompactWolo(liquidity)}
              subtext="Reserved market depth."
              themeKey={themeKey}
              viewMode={viewMode}
            />
          </div>
        </div>
      )}

      <div
        className={
          isAuthenticated
            ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            : "grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]"
        }
      >
        {isAuthenticated ? (
          <Link href="/profile" className={primaryActionClassName}>
            Open Profile
          </Link>
        ) : (
          <SteamLoginButton
            className={`${primaryActionClassName} w-full whitespace-nowrap`}
            label={loading ? "Loading..." : "Login with Steam"}
            disabled={loading}
          />
        )}

        <Link
          href={isAuthenticated ? "/upload" : "/download"}
          className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/15 px-5 text-center text-[13px] font-medium leading-tight text-white/85 transition hover:border-white/30 hover:text-white"
        >
          {isAuthenticated ? "Upload Replay" : "Download Watcher"}
        </Link>

        <Link
          href="/rivalries"
          className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/15 px-5 text-center text-[13px] font-medium leading-tight text-white/85 transition hover:border-white/30 hover:text-white"
        >
          View Rivalries
        </Link>
      </div>
    </div>
  );
}
