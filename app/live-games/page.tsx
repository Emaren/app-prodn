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
      <section className="overflow-hidden rounded-[1.9rem] border border-red-400/15 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.16),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_26%),linear-gradient(135deg,_#101828,_#0f172a_45%,_#020617)] p-5 sm:rounded-[2.2rem] sm:p-7 lg:p-8">
        <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-xs uppercase tracking-[0.4em] text-red-200/70">Live Games</div>
              <div className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs text-red-100">
                {snapshot.liveCount} live now
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {snapshot.readyCount} on deck
              </div>
            </div>

            <div className="max-w-3xl space-y-3">
              <h1 className="text-4xl font-semibold leading-tight text-white sm:text-5xl">
                Watch the games that matter while they are still hot.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                This is the live rail for active bracket battles, ready-to-fire matchups, and the
                freshest replay-backed proof the site can surface right now.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatTile label="Live games" value={String(snapshot.liveCount)} detail="Tournament matches flagged live" />
            <StatTile label="Ready next" value={String(snapshot.readyCount)} detail="Queue pressure building now" />
            <StatTile
              label="Feed freshness"
              value={formatTime(snapshot.updatedAt)}
              detail={snapshot.tournament ? snapshot.tournament.title : "Waiting for a featured event"}
              compact
            />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/75 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-red-200/70">Now Playing</div>
              <h2 className="mt-2 text-3xl font-semibold text-white">Current live board</h2>
            </div>
            <Link
              href="/lobby"
              className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Open Lobby
            </Link>
          </div>

          <div className="mt-5 space-y-4">
            {snapshot.liveMatches.length === 0 ? (
              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-5 py-6 text-sm leading-6 text-slate-300">
                No tournament matches are marked live yet. The page is ready, the nav count will flip as
                soon as admins or match automation move games into `live`.
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
                <h2 className="mt-2 text-2xl font-semibold text-white">Ready to spectate</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                {snapshot.readyMatches.length} ready
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {snapshot.readyMatches.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  No matches are queued in `ready` right now.
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
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent parsed games</h2>
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
                  Recent parsed proof will land here as soon as the watcher pushes it.
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

function StatTile({
  label,
  value,
  detail,
  compact = false,
}: {
  label: string;
  value: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-[1.45rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.32em] text-slate-400">{label}</div>
      <div className={compact ? "mt-3 text-lg font-semibold text-white" : "mt-3 text-4xl font-semibold text-white"}>
        {value}
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-400">{detail}</div>
    </div>
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

