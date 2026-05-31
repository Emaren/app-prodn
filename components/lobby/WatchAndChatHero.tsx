"use client";

import Link from "next/link";
import { Coins, ExternalLink, Flame, MessageSquareMore, Play, Skull, Swords } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatLobbyMoment } from "@/components/lobby/utils";
import {
  getLobbyPresentationTone,
  type LobbyThemeKey,
  type LobbyViewMode,
} from "@/components/lobby/lobbyPresentation";
import type { LobbyMatchRow, LobbySnapshot } from "@/lib/lobby";
import type { LiveGameSession } from "@/lib/liveSessionSnapshot";
import type { WatchStreamPayload } from "@/lib/watchStreams";

type WatchAndChatHeroProps = {
  tournament: LobbySnapshot["tournament"];
  recentMatches: LobbyMatchRow[];
  themeKey: LobbyThemeKey;
  viewMode: LobbyViewMode;
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
    return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(stream.embedId)}`;
  }

  if (stream.provider === "twitch" && parentHost) {
    return `https://player.twitch.tv/?channel=${encodeURIComponent(stream.embedId)}&parent=${encodeURIComponent(parentHost)}&muted=true`;
  }

  return null;
}

export function WatchAndChatHero({
  tournament,
  recentMatches,
  themeKey,
  viewMode,
}: WatchAndChatHeroProps) {
  const tone = getLobbyPresentationTone(themeKey, viewMode);
  const [liveGames, setLiveGames] = useState<LiveGamesPayload | null>(null);
  const [streams, setStreams] = useState<WatchStreamPayload[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [parentHost, setParentHost] = useState<string | null>(null);
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

  return (
    <section className={`overflow-hidden rounded-[2rem] border ${tone.panelShell}`}>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.45fr)_minmax(21rem,0.72fr)]">
        <div className="relative min-h-[21rem] overflow-hidden bg-black lg:min-h-[28rem]">
          {embedSrc ? (
            <iframe
              src={embedSrc}
              title={primaryStream?.label || selectedWar.title}
              className="absolute inset-0 h-full w-full"
              allow="autoplay; fullscreen; picture-in-picture"
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

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/88 via-black/12 to-black/20" />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 p-5 sm:p-7">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.34em] text-amber-100/70">
                  Watch & Chat
                </div>
                <h2 className="mt-2 break-words text-2xl font-semibold text-white sm:text-3xl">
                  {selectedWar.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300">
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
                className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
              >
                Watch
                {primaryStream?.url ? <ExternalLink className="h-4 w-4" aria-hidden="true" /> : null}
              </Link>
            </div>
          </div>
        </div>

        <aside className="flex flex-col gap-5 border-t border-white/10 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div>
            <div className={`text-xs uppercase tracking-[0.35em] ${tone.accentText}`}>
              Live War Room
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedWar.players.length > 0 ? (
                selectedWar.players.slice(0, 4).map((player) => (
                  <span
                    key={player}
                    className={`rounded-full border px-3 py-1.5 text-xs ${tone.neutralPill}`}
                  >
                    {player}
                  </span>
                ))
              ) : (
                <span className={`rounded-full border px-3 py-1.5 text-xs ${tone.neutralPill}`}>
                  Founders Cup
                </span>
              )}
            </div>
          </div>

          {featuredOptions.length > 1 ? (
            <div className="space-y-2">
              {featuredOptions.slice(0, 4).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSelectedSessionKey(option.sessionKey)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    option.key === selectedWar.key
                      ? "border-amber-200/45 bg-amber-300/10 text-white"
                      : `${tone.card} ${tone.cardHover}`
                  }`}
                >
                  <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">
                    {option.statusLabel}
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold">{option.title}</div>
                </button>
              ))}
            </div>
          ) : null}

          <div className={`rounded-[1.35rem] border p-4 ${tone.insetPanel}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">
                Reactions
              </div>
              <a
                href="#lobby-chat"
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${tone.secondaryButton}`}
              >
                <MessageSquareMore className="h-3.5 w-3.5" aria-hidden="true" />
                Chat
              </a>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
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
                  className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/[0.04] text-xs text-slate-200 transition hover:border-amber-200/35 hover:bg-amber-300/10 hover:text-white"
                  title={label}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="tabular-nums">{reactionCounts[key]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {["Tip Player", "Tip Pool", "Bet"].map((label) => (
              <button
                key={label}
                type="button"
                disabled
                className="min-h-11 rounded-full border border-white/10 bg-white/[0.03] px-4 text-xs font-semibold text-slate-500"
              >
                {label}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
