import Link from "next/link";

import { getPrisma } from "@/lib/prisma";
import { loadLiveGamesSnapshot } from "@/lib/liveGames";
import { getTournamentMatchStatusLabel } from "@/lib/lobby";
import { displayName } from "@/components/lobby/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function formatTime(value: string | null) {
  if (!value) return "Clocking in now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Clocking in now";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function LiveGamesPage() {
  const snapshot = await loadLiveGamesSnapshot(getPrisma());

  return (
    <main className="space-y-4 py-2 text-white sm:space-y-6 sm:py-3">
      <section className="overflow-hidden rounded-[1.9rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.12),_transparent_22%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.10),_transparent_24%),linear-gradient(135deg,_#101828,_#0f172a_45%,_#020617)] p-5 sm:rounded-[2rem] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.38em] text-red-200/70">Live Games</div>
            <h1 className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Watch. Spectate. Bet.</h1>
            <div className="mt-3 text-sm text-slate-400">
              {snapshot.tournament ? snapshot.tournament.title : "Tournament rail standing by"}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-100">
              {snapshot.liveCount} live
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
              {snapshot.readyCount} ready
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
              {formatTime(snapshot.updatedAt)}
            </div>
            <Link
              href="/lobby"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Open Lobby
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-red-200/70">Now Playing</div>
                <h2 className="mt-2 text-3xl font-semibold text-white">Live board</h2>
              </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {snapshot.liveMatches.length} live
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {snapshot.liveMatches.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-6 text-sm leading-6 text-slate-300">
                No live matches flagged yet.
              </div>
            ) : (
              snapshot.liveMatches.map((match) => (
                <LiveMatchCard key={match.id} match={match} emphasis="live" />
              ))
            )}
          </div>
        </div>

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
                  <LiveMatchCard key={match.id} match={match} emphasis="ready" compact />
                ))
              )}
            </div>
          </section>

          <section className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-white/45">Fresh Proof</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent proof</h2>
              </div>
              <Link
                href="/game-stats"
                className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                View all matches
              </Link>
            </div>

            <div className="mt-5 space-y-3">
              {snapshot.recentMatches.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  Waiting on the next parsed result.
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

function LiveMatchCard({
  match,
  emphasis,
  compact = false,
}: {
  match: {
    id: number;
    label: string | null;
    round: number;
    position: number;
    status: string;
    scheduledAt: string | null;
    proof: {
      gameStatsId: number;
      mapName: string | null;
      playedOn: string | null;
      winner: string | null;
    } | null;
    playerOne: {
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
    playerTwo: {
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
  };
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
          href="/lobby"
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
        >
          Spectate Rail
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
