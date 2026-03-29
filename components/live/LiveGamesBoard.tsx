"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { displayName } from "@/components/lobby/utils";
import type { LiveGamesSnapshot } from "@/lib/liveGames";
import { getTournamentMatchStatusLabel } from "@/lib/lobby";

type LiveGamesBoardProps = {
  initialSnapshot: LiveGamesSnapshot;
};

const LIVE_GAMES_POLL_INTERVAL_MS = 5_000;

function formatTime(value: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatUpdatedTime(value: string | null) {
  if (!value) return "Now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Now";
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDurationCompact(value: number | null) {
  if (!value || value <= 0) return null;

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function playerLabel(
  entrant:
    | {
        inGameName: string | null;
        steamPersonaName: string | null;
      }
    | null
    | undefined
) {
  if (!entrant) return "Open slot";
  return displayName(entrant.inGameName, entrant.steamPersonaName);
}

export default function LiveGamesBoard({ initialSnapshot }: LiveGamesBoardProps) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const response = await fetch("/api/live-games", {
          cache: "no-store",
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as LiveGamesSnapshot;
        if (!cancelled) {
          setSnapshot(payload);
        }
      } catch (error) {
        console.warn("Failed to refresh live games:", error);
      }
    };

    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, LIVE_GAMES_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const liveItems = useMemo(
    () => [...snapshot.activeSessions, ...snapshot.liveMatches, ...snapshot.recentlyCompletedSessions],
    [snapshot.activeSessions, snapshot.liveMatches, snapshot.recentlyCompletedSessions]
  );
  const sectionStatusLabel =
    snapshot.liveCount > 0
      ? `${snapshot.liveCount} live`
      : snapshot.recentlyCompletedSessions.length > 0
        ? `${snapshot.recentlyCompletedSessions.length} recent`
        : "0 live";

  return (
    <main className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
      <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.12),_transparent_22%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.10),_transparent_24%),linear-gradient(135deg,_#101828,_#0f172a_45%,_#020617)] p-5 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.38em] text-red-200/70">Live Games</div>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Live board</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-100">
              {snapshot.liveCount} live
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
              {snapshot.readyCount} ready
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              {formatUpdatedTime(snapshot.updatedAt)}
            </div>
            <Link
              href="/lobby"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Lobby
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-red-200/70">Now Playing</div>
              <h2 className="mt-2 text-3xl font-semibold text-white">Playing now</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {sectionStatusLabel}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {liveItems.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-6 text-sm text-slate-300">
                No live games yet.
              </div>
            ) : (
              <>
                {snapshot.activeSessions.map((session) => (
                  <LiveSessionCard key={`session-${session.id}`} session={session} />
                ))}
                {snapshot.liveMatches.map((match) => (
                  <TournamentLiveMatchCard key={`match-${match.id}`} match={match} emphasis="live" />
                ))}
                {snapshot.recentlyCompletedSessions.map((session) => (
                  <LiveSessionCard key={`completed-${session.id}`} session={session} />
                ))}
              </>
            )}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">On Deck</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Ready next</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {snapshot.readyMatches.length} ready
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {snapshot.readyMatches.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Nothing queued in ready.
                </div>
              ) : (
                snapshot.readyMatches.map((match) => (
                  <TournamentLiveMatchCard key={`ready-${match.id}`} match={match} emphasis="ready" compact />
                ))
              )}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold text-white">Recently Played</h2>
              <Link
                href="/game-stats"
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                All matches
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {snapshot.recentMatches.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Waiting on the next completed match.
                </div>
              ) : (
                snapshot.recentMatches.slice(0, 4).map((match) => (
                  <Link
                    key={match.id}
                    href={`/game-stats/${match.id}`}
                    className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:border-white/20 hover:bg-white/7"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">
                          {Array.isArray(match.players)
                            ? match.players.map((player) => player.name).filter(Boolean).join(" vs ")
                            : "Replay-backed result"}
                        </div>
                        <div className="mt-1 text-sm text-slate-300">
                          {typeof match.map === "string"
                            ? match.map
                            : match.map && typeof match.map === "object" && "name" in match.map
                              ? String(match.map.name || "Unknown map")
                              : "Unknown map"}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-400">
                        {formatTime(match.played_on || match.timestamp)}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function LiveSessionCard({
  session,
}: {
  session: LiveGamesSnapshot["activeSessions"][number];
}) {
  const isCompleted = session.state === "completed";
  const gameHref = `/game-stats/live/${encodeURIComponent(session.sessionKey)}`;
  const title =
    session.players.length > 0
      ? session.players.map((player) => player.name).join(" vs ")
      : session.originalFilename || "Game in progress";
  const shellClass = isCompleted
    ? "border-emerald-400/20 bg-emerald-500/10"
    : "border-red-400/20 bg-red-500/10";
  const badgeClass = isCompleted
    ? "border-emerald-400/25 bg-emerald-500/12 text-emerald-50"
    : "border-red-400/25 bg-red-500/12 text-red-50";
  const eyebrowClass = isCompleted ? "text-emerald-100/80" : "text-red-100/80";
  const eyebrowLabel = isCompleted ? "Just finished" : "Watcher live";
  const badgeLabel = isCompleted ? "Final stored" : "Live parse";
  const compactDuration = formatDurationCompact(session.durationSeconds);

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${shellClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-xs uppercase tracking-[0.3em] ${eyebrowClass}`}>{eyebrowLabel}</div>
          <div className="mt-2 text-xl font-semibold text-white">{title}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {session.mapName ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {session.mapName}
              </span>
            ) : null}
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              Parse #{session.parseIteration}
            </span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              Updated {formatUpdatedTime(session.completedAt || session.updatedAt)}
            </span>
            {session.uploader ? (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {session.uploader.displayName}
              </span>
            ) : null}
            {isCompleted && session.winner && session.winner !== "Unknown" ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                Winner {session.winner}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-2 text-right">
          <div className={`rounded-full border px-3 py-1 text-xs ${badgeClass}`}>
            {badgeLabel}
          </div>
          {compactDuration ? (
            <div className="text-xs text-slate-300">{compactDuration}</div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href={gameHref}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {isCompleted ? "Open Final Stats" : "Watch Live Stats"}
        </Link>
        <Link
          href="/lobby"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Open Lobby
        </Link>
        <Link
          href="/wolo"
          className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15"
        >
          Bet Rail
        </Link>
      </div>
    </div>
  );
}

function TournamentLiveMatchCard({
  match,
  emphasis,
  compact = false,
}: {
  match: LiveGamesSnapshot["liveMatches"][number];
  emphasis: "live" | "ready";
  compact?: boolean;
}) {
  const accentClass =
    emphasis === "live"
      ? "border-red-400/20 bg-red-500/10"
      : "border-amber-300/20 bg-amber-400/10";
  const actionHref = match.proof ? `/game-stats/${match.proof.gameStatsId}` : "/lobby";

  return (
    <div className={`rounded-[1.5rem] border px-4 py-4 ${accentClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.3em] text-slate-300/75">
            {match.label || `Round ${match.round} Match ${match.position}`}
          </div>
          <div className="mt-2 text-xl font-semibold text-white">
            {playerLabel(match.playerOne)} vs {playerLabel(match.playerTwo)}
          </div>
          <div className="mt-2 text-sm text-slate-300">
            {match.proof?.mapName || "Map lock incoming"} · {formatTime(match.proof?.playedOn || match.scheduledAt)}
          </div>
        </div>

        <div className="space-y-2 text-right">
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white">
            {getTournamentMatchStatusLabel(match.status as never)}
          </div>
          {match.proof?.winner ? (
            <div className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">
              Winner {match.proof.winner}
            </div>
          ) : null}
        </div>
      </div>

      <div className={`mt-4 flex flex-wrap gap-3 ${compact ? "" : "pt-1"}`}>
        <Link
          href={actionHref}
          className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
        >
          {match.proof ? "Watch Proof" : "Open Lobby"}
        </Link>
        <Link
          href="/wolo"
          className="rounded-full border border-amber-300/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100 transition hover:bg-amber-400/15"
        >
          Bet Rail
        </Link>
      </div>
    </div>
  );
}
