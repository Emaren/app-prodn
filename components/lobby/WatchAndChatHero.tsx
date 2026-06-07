"use client";

import Link from "next/link";
import { Coins, ExternalLink, Flame, MessageSquareMore, Play, Skull, Swords } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { displayName, formatLobbyMoment } from "@/components/lobby/utils";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { BetBoardMarket, BetBoardSnapshot, BetSide } from "@/lib/bets";
import type { LobbyMatchRow, LobbyMessage, LobbySnapshot } from "@/lib/lobby";
import type { LiveGameSession } from "@/lib/liveSessionSnapshot";
import type { WatchStreamPayload } from "@/lib/watchStreams";

type WatchAndChatHeroProps = {
  tournament: LobbySnapshot["tournament"];
  recentMatches: LobbyMatchRow[];
  messages: LobbyMessage[];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
  isAuthenticated?: boolean;
  messageBody?: string;
  chatPending?: boolean;
  onMessageBodyChange?: (value: string) => void;
  onSendMessage?: () => void;
  onLogin?: () => void;
};

type LiveGamesPayload = {
  activeSessions?: LiveGameSession[];
  recentlyCompletedSessions?: LiveGameSession[];
};

type FeaturedWar = {
  key: string;
  sessionKey: string | null;
  statusLabel: string;
  title: string;
  players: string[];
  mapName: string | null;
  detail: string;
  href: string;
};

type ReactionKey = "fire" | "sword" | "skull" | "wolo";

const HERO_STAKE_OPTIONS = [10, 25, 50, 100] as const;

const REACTIONS: Array<{
  key: ReactionKey;
  label: string;
  icon: typeof Flame;
}> = [
  { key: "fire", label: "Fire", icon: Flame },
  { key: "sword", label: "Sword", icon: Swords },
  { key: "skull", label: "Skull", icon: Skull },
  { key: "wolo", label: "WOLO", icon: Coins },
];

function matchPlayersFromRow(match: LobbyMatchRow | null | undefined) {
  if (!match) return [];
  if (Array.isArray(match.players)) {
    return match.players
      .map((player) => player.name?.trim())
      .filter((name): name is string => Boolean(name));
  }

  if (typeof match.players === "string") {
    return match.players
      .split(/,| vs |\sv\s/gi)
      .map((name) => name.trim())
      .filter(Boolean);
  }

  return [];
}

function mapNameFromRow(match: LobbyMatchRow | null | undefined) {
  if (!match) return null;
  if (typeof match.map === "string") return match.map;
  return typeof match.map?.name === "string" ? match.map.name : null;
}

function sessionPlayerNames(session: LiveGameSession) {
  return session.players.map((player) => player.name).filter(Boolean);
}

function titleFromPlayers(players: string[], fallback: string) {
  if (players.length >= 2) return `${players[0]} vs ${players[1]}`;
  if (players.length === 1) return players[0];
  return fallback;
}

function featuredFromReplay(match: LobbyMatchRow | null, tournamentTitle: string): FeaturedWar {
  if (!match) {
    return {
      key: "next-tournament",
      sessionKey: null,
      statusLabel: "On Deck",
      title: tournamentTitle,
      players: [],
      mapName: null,
      detail: "Next community war room",
      href: "/live-games",
    };
  }

  const players = matchPlayersFromRow(match);
  const mapName = mapNameFromRow(match);
  const playedAt = match.played_on || match.played_at || match.derived_played_on || match.created_at || match.createdAt || null;
  const sessionKey = match.original_filename || match.replay_file || null;

  return {
    key: `replay-${match.id}`,
    sessionKey,
    statusLabel: "Replay",
    title: titleFromPlayers(players, match.winner ? `Winner ${match.winner}` : "Latest verified war"),
    players,
    mapName,
    detail: playedAt ? `Parsed ${formatLobbyMoment(playedAt)}` : "Latest HD parse",
    href: `/game-stats/${match.id}`,
  };
}

function featuredFromLiveSession(session: LiveGameSession): FeaturedWar {
  const players = sessionPlayerNames(session);

  return {
    key: `live-${session.sessionKey}`,
    sessionKey: session.sessionKey,
    statusLabel: session.state === "live" ? "Live" : "Replay",
    title: titleFromPlayers(players, session.mapName || "Live AoE2HD war"),
    players,
    mapName: session.mapName,
    detail:
      session.state === "live"
        ? `Updated ${formatLobbyMoment(session.updatedAt)}`
        : `Completed ${formatLobbyMoment(session.completedAt || session.updatedAt)}`,
    href: session.state === "live" ? "/live-games" : `/game-stats/${session.id}`,
  };
}

function getEmbedSrc(stream: WatchStreamPayload | null, parentHost: string | null) {
  if (!stream?.canEmbed || !stream.embedId) return null;

  if (stream.provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
      stream.embedId
    )}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1`;
  }

  if (stream.provider === "twitch" && parentHost) {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(
      stream.embedId
    )}&parent=${encodeURIComponent(parentHost)}&autoplay=true&muted=true`;
  }

  return null;
}

function formatCompactWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function projectHeroReturn(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function safeStakeDraft(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 7);
}

export function WatchAndChatHero({
  tournament,
  recentMatches,
  messages,
  themeKey,
  viewMode,
  isAuthenticated = false,
  messageBody = "",
  chatPending = false,
  onMessageBodyChange,
  onSendMessage,
  onLogin,
}: WatchAndChatHeroProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const quickChatReady = messageBody.trim().length > 0 && !chatPending;

  function handleQuickChatSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isAuthenticated) {
      onLogin?.();
      return;
    }

    if (!quickChatReady) return;
    onSendMessage?.();
  }
  const [liveGames, setLiveGames] = useState<LiveGamesPayload | null>(null);
  const [streams, setStreams] = useState<WatchStreamPayload[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [parentHost, setParentHost] = useState<string | null>(null);
  const [betBoard, setBetBoard] = useState<BetBoardSnapshot | null>(null);
  const [selectedBetSide, setSelectedBetSide] = useState<BetSide>("left");
  const [stakeDraft, setStakeDraft] = useState("25");
  const [reactionCounts, setReactionCounts] = useState<Record<ReactionKey, number>>({
    fire: 0,
    sword: 0,
    skull: 0,
    wolo: 0,
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setParentHost(window.location.hostname);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveGames() {
      try {
        const response = await fetch("/api/live-games", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as LiveGamesPayload;
        if (!cancelled) {
          setLiveGames(payload);
        }
      } catch (error) {
        console.warn("Failed to load Watch & Chat live games:", error);
      }
    }

    void loadLiveGames();
    const interval = window.setInterval(() => {
      void loadLiveGames();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadBetBoard() {
      try {
        const response = await fetch("/api/bets", { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as BetBoardSnapshot;
        if (!cancelled) {
          setBetBoard(payload);
        }
      } catch (error) {
        console.warn("Failed to load Watch & Chat bet slip:", error);
      }
    }

    void loadBetBoard();
    const interval = window.setInterval(() => {
      void loadBetBoard();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const featuredOptions = useMemo(() => {
    const liveSessions = liveGames?.activeSessions ?? [];
    const completedSessions = liveGames?.recentlyCompletedSessions ?? [];
    const options = [
      ...liveSessions.slice(0, 4).map(featuredFromLiveSession),
      ...completedSessions.slice(0, 2).map(featuredFromLiveSession),
    ];
    if (options.length > 0) return options;
    return [featuredFromReplay(recentMatches[0] ?? null, tournament.title)];
  }, [liveGames?.activeSessions, liveGames?.recentlyCompletedSessions, recentMatches, tournament.title]);

  const selectedWar =
    featuredOptions.find((option) => option.sessionKey === selectedSessionKey) ?? featuredOptions[0];

  useEffect(() => {
    setSelectedSessionKey((current) => {
      if (current && featuredOptions.some((option) => option.sessionKey === current)) {
        return current;
      }
      return featuredOptions[0]?.sessionKey ?? null;
    });
  }, [featuredOptions]);

  useEffect(() => {
    let cancelled = false;
    const sessionKey = selectedWar?.sessionKey;

    if (!sessionKey) {
      setStreams([]);
      return;
    }
    const activeSessionKey = sessionKey;

    async function loadStreams() {
      try {
        const response = await fetch(
          `/api/watch-streams?sessionKey=${encodeURIComponent(activeSessionKey)}`,
          { cache: "no-store" }
        );
        if (!response.ok) {
          if (!cancelled) setStreams([]);
          return;
        }
        const payload = (await response.json()) as { streams?: WatchStreamPayload[] };
        if (!cancelled) {
          setStreams(Array.isArray(payload.streams) ? payload.streams : []);
        }
      } catch (error) {
        console.warn("Failed to load Watch & Chat streams:", error);
        if (!cancelled) setStreams([]);
      }
    }

    void loadStreams();

    return () => {
      cancelled = true;
    };
  }, [selectedWar?.sessionKey]);

  const shouldEmbedStream = selectedWar.statusLabel === "Live";
  const primaryStream = shouldEmbedStream
    ? streams.find((stream) => stream.isPrimary && stream.canEmbed) ??
      streams.find((stream) => stream.canEmbed) ??
      null
    : null;
  const embedSrc = getEmbedSrc(primaryStream, parentHost);
  const actionHref = primaryStream?.url || selectedWar.href;
  const commentMessages = messages.slice(-5);
  const heroBetMarket = betBoard?.featuredMarket ?? betBoard?.openMarkets?.[0] ?? null;

  return (
    <section className={`overflow-hidden rounded-[2rem] border ${tone.panelShell}`}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.74fr)]">
        <div className="flex min-w-0 flex-col">
          <div className="relative aspect-video min-h-[15rem] overflow-hidden bg-black sm:min-h-[20rem] lg:min-h-[27rem]">
            {embedSrc ? (
              <iframe
                src={embedSrc}
                title={primaryStream?.label || selectedWar.title}
                className="absolute inset-0 h-full w-full border-0"
                allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                allowFullScreen
              />
            ) : (
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_18%,rgba(245,158,11,0.22),transparent_30%),radial-gradient(circle_at_78%_42%,rgba(56,189,248,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.99))]">
                <div className="absolute inset-x-8 top-8 h-px bg-gradient-to-r from-transparent via-amber-200/35 to-transparent" />
                <div className="absolute bottom-8 left-8 right-8 top-12 rounded-[1.5rem] border border-white/10 bg-black/20 shadow-[inset_0_0_80px_rgba(251,191,36,0.05)]" />
                <div className="absolute inset-0 flex items-center justify-center px-8">
                  <div className="text-center">
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-200/20 bg-amber-300/10 text-amber-100 shadow-[0_0_48px_rgba(251,191,36,0.18)]">
                      <Play className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <div className="mt-6 text-[10px] uppercase tracking-[0.38em] text-amber-100/70">
                      {selectedWar.statusLabel}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={`border-t p-4 sm:p-5 ${tone.insetPanel}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.34em] text-amber-100/70">
                  Watch & Chat
                </div>
                <h2 className="mt-2 break-words text-2xl font-semibold text-white sm:text-3xl">
                  {selectedWar.title}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-emerald-100">
                    {selectedWar.statusLabel}
                  </span>
                  {selectedWar.mapName ? (
                    <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                      {selectedWar.mapName}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1">
                    {selectedWar.detail}
                  </span>
                </div>
              </div>

              <Link
                href={actionHref}
                target={primaryStream?.url ? "_blank" : undefined}
                rel={primaryStream?.url ? "noreferrer" : undefined}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${tone.primaryButton}`}
              >
                Watch
                {primaryStream?.url ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : null}
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className={`text-[10px] uppercase tracking-[0.28em] ${tone.accentText}`}>
                  Reactions
                </span>
                {selectedWar.players.length > 0 ? (
                  selectedWar.players.slice(0, 3).map((player) => (
                    <span key={player} className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
                      {player}
                    </span>
                  ))
                ) : (
                  <span className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
                    Founders Cup
                  </span>
                )}
              </div>

              {featuredOptions.length > 1 ? (
                <div className="flex flex-wrap gap-2">
                  {featuredOptions.slice(0, 3).map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setSelectedSessionKey(option.sessionKey)}
                      className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                        option.key === selectedWar.key
                          ? "border-amber-200/45 bg-amber-300/10 text-white"
                          : `${tone.neutralPill} hover:border-white/24 hover:text-white`
                      }`}
                    >
                      {option.statusLabel}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {REACTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setReactionCounts((current) => ({
                      ...current,
                      [key]: current[key] + 1,
                    }))
                  }
                  className="flex min-h-[3.3rem] flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] text-xs text-slate-200 transition hover:border-amber-200/35 hover:bg-amber-300/10 hover:text-white"
                  title={label}
                >
                  <Icon className="h-[1.1rem] w-[1.1rem]" aria-hidden="true" />
                  <span className="tabular-nums">{reactionCounts[key]}</span>
                </button>
              ))}
            </div>

            <HeroBetSlip
              market={heroBetMarket}
              selectedWar={selectedWar}
              selectedSide={selectedBetSide}
              stakeDraft={stakeDraft}
              onSelectedSideChange={setSelectedBetSide}
              onStakeDraftChange={setStakeDraft}
              tone={tone}
            />
          </div>
        </div>

        <aside className="flex min-h-[22rem] flex-col border-t border-white/10 p-4 sm:p-5 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
                Live Comments
              </div>
              <div className="mt-1 truncate text-sm text-slate-400">
                {selectedWar.title}
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
              {messages.length} recent
            </span>
          </div>

          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {commentMessages.length === 0 ? (
              <div className={`rounded-2xl border px-4 py-5 text-sm text-slate-300 ${tone.subduedCard}`}>
                No comments yet. The first war-room callout lands here.
              </div>
            ) : (
              commentMessages.map((message) => (
                <CompactCommentCard key={message.id} message={message} tone={tone} />
              ))
            )}
          </div>

          {isAuthenticated && onMessageBodyChange && onSendMessage ? (
              <form
                onSubmit={handleQuickChatSubmit}
                className="pointer-events-auto mt-4 flex min-w-[min(100%,18rem)] max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/30 p-1.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
              >
                <input
                  value={messageBody}
                  maxLength={180}
                  onChange={(event) => onMessageBodyChange(event.target.value)}
                  placeholder="Chat with the lobby..."
                  className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-slate-500"
                />
                <button
                  type="submit"
                  disabled={!quickChatReady}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-300 text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-45"
                  aria-label={chatPending ? "Sending chat message" : "Send chat message"}
                  title={chatPending ? "Sending..." : "Send"}
                >
                  {chatPending ? (
                    <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-current/70" />
                  ) : (
                    <svg viewBox="0 0 20 20" className="h-4.5 w-4.5" fill="none" aria-hidden="true">
                      <path
                        d="M3.25 10.35 16.5 3.75l-4.1 12.5-2.45-5.05-5.25-1.15Z"
                        stroke="currentColor"
                        strokeWidth="1.55"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m9.95 11.2 2.8-2.95"
                        stroke="currentColor"
                        strokeWidth="1.55"
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </button>
              </form>
            ) : onLogin ? (
              <button
                type="button"
                onClick={onLogin}
                className="pointer-events-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
                Sign In To Chat
              </button>
            ) : (
              <a
                href="#lobby-chat"
                className="pointer-events-auto mt-4 inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                <MessageSquareMore className="h-4 w-4" aria-hidden="true" />
                Open Chat
              </a>
            )}
        </aside>
      </div>
    </section>
  );
}

function HeroBetSlip({
  market,
  selectedWar,
  selectedSide,
  stakeDraft,
  onSelectedSideChange,
  onStakeDraftChange,
  tone,
}: {
  market: BetBoardMarket | null;
  selectedWar: FeaturedWar;
  selectedSide: BetSide;
  stakeDraft: string;
  onSelectedSideChange: (side: BetSide) => void;
  onStakeDraftChange: (value: string) => void;
  tone: ReturnType<typeof getLobbyPresentationTone>;
}) {
  const fallbackNames = selectedWar.players.length >= 2
    ? [selectedWar.players[0], selectedWar.players[1]]
    : ["Player 1", "Player 2"];
  const leftName = market?.left.name || fallbackNames[0];
  const rightName = market?.right.name || fallbackNames[1];
  const stakeWolo = Math.max(0, Math.round(Number(stakeDraft) || 0));
  const selectedPool = selectedSide === "left" ? market?.left.poolWolo ?? 0 : market?.right.poolWolo ?? 0;
  const oppositePool = selectedSide === "left" ? market?.right.poolWolo ?? 0 : market?.left.poolWolo ?? 0;
  const projectedReturn = market
    ? projectHeroReturn(stakeWolo, selectedPool, oppositePool)
    : stakeWolo;
  const betHref = market
    ? `/bets?market=${market.id}&side=${selectedSide}&stake=${stakeWolo || 25}`
    : "/bets";

  return (
    <div className={`mt-4 rounded-[1.45rem] border p-4 ${tone.subduedCard}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className={`text-[10px] uppercase tracking-[0.28em] ${tone.accentText}`}>
            Betting
          </div>
          <div className="mt-1 text-sm font-semibold text-white">
            {market?.title || selectedWar.title}
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs ${tone.neutralPill}`}>
          {market ? `${formatCompactWolo(market.totalPotWolo)} WOLO pot` : "Book arming"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <HeroBetSideButton
          active={selectedSide === "left"}
          name={leftName}
          poolWolo={market?.left.poolWolo ?? null}
          crowdPercent={market?.left.crowdPercent ?? null}
          onClick={() => onSelectedSideChange("left")}
        />
        <HeroBetSideButton
          active={selectedSide === "right"}
          name={rightName}
          poolWolo={market?.right.poolWolo ?? null}
          crowdPercent={market?.right.crowdPercent ?? null}
          onClick={() => onSelectedSideChange("right")}
        />
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap gap-1.5">
            {HERO_STAKE_OPTIONS.map((stake) => (
              <button
                key={stake}
                type="button"
                onClick={() => onStakeDraftChange(String(stake))}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  stakeDraft === String(stake)
                    ? "border-amber-200/45 bg-amber-300/10 text-amber-50"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/24 hover:text-white"
                }`}
              >
                {stake}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/35 px-3 py-2.5">
            <input
              aria-label="WOLO stake"
              inputMode="numeric"
              value={stakeDraft}
              onChange={(event) => onStakeDraftChange(safeStakeDraft(event.target.value))}
              className="min-w-0 bg-transparent text-lg font-semibold text-white outline-none placeholder:text-slate-500"
              placeholder="25"
            />
            <span className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-slate-100">
              WOLO
            </span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] lg:min-w-[18rem]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">If right</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {formatCompactWolo(projectedReturn)} WOLO
            </div>
          </div>
          <Link
            href={betHref}
            className={`inline-flex min-h-12 items-center justify-center rounded-2xl px-5 text-sm font-semibold transition ${tone.primaryButton}`}
          >
            Open Slip
          </Link>
        </div>
      </div>
    </div>
  );
}

function HeroBetSideButton({
  active,
  name,
  poolWolo,
  crowdPercent,
  onClick,
}: {
  active: boolean;
  name: string;
  poolWolo: number | null;
  crowdPercent: number | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-left transition ${
        active
          ? "border-amber-200/45 bg-amber-300/10 text-white shadow-[inset_0_0_0_1px_rgba(251,191,36,0.08)]"
          : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/24 hover:text-white"
      }`}
    >
      <div className="truncate text-sm font-semibold">{name}</div>
      <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-400">
        <span>{poolWolo == null ? "new side" : `${formatCompactWolo(poolWolo)} WOLO`}</span>
        <span>{crowdPercent == null ? "open" : `${crowdPercent}% crowd`}</span>
      </div>
    </button>
  );
}

function CompactCommentCard({
  message,
  tone,
}: {
  message: LobbyMessage;
  tone: ReturnType<typeof getLobbyPresentationTone>;
}) {
  const name = displayName(message.user.inGameName, message.user.steamPersonaName);
  const visibleReactions = message.reactions.filter((reaction) => reaction.count > 0).slice(0, 3);

  return (
    <article className={`rounded-2xl border px-3.5 py-3 ${tone.subduedCard}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate text-sm font-semibold text-white">{name}</div>
        <time className="shrink-0 text-[11px] text-slate-500">
          {formatLobbyMoment(message.createdAt)}
        </time>
      </div>
      <p className="mt-2 max-h-14 overflow-hidden text-sm leading-5 text-slate-300">
        {message.body}
      </p>
      {visibleReactions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visibleReactions.map((reaction) => (
            <span
              key={`${message.id}-${reaction.emoji}`}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300"
            >
              {reaction.emoji} {reaction.count}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
