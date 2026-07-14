import Link from "next/link";
import type { ReactNode } from "react";

import ReviewReplayResultButton from "@/components/game-stats/ReviewReplayResultButton";
import {
  displayPlayerName,
  displayReplayFilename,
  formatDurationLabel,
  parsePlayers,
  readMapName,
  readPlayedAt,
} from "@/lib/gameStatsView";
import { getPrisma } from "@/lib/prisma";
import {
  applyReplayAdjudicationsToGameStatsRows,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import { resolveReliableReplayWinner } from "@/lib/unresolvedWatcherResult";

export const dynamic = "force-dynamic";

function playerWon(player: Record<string, unknown>) {
  return player.winner === true || player.winner === "true" || player.winner === 1;
}

export default async function GameStatsPage() {
  const prisma = getPrisma();
  const [rawGames, totalGames] = await Promise.all([
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            verificationLevel: true,
            verified: true,
          },
        },
        replayParseAttempts: {
          select: { userUid: true },
        },
      },
    }),
    prisma.gameStats.count({ where: { is_final: true } }),
  ]);
  const games = applyReplayAdjudicationsToGameStatsRows(rawGames);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="relative overflow-hidden rounded-[2.2rem] border border-amber-100/12 bg-[radial-gradient(circle_at_14%_0%,rgba(251,191,36,0.17),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(56,189,248,0.12),transparent_28%),linear-gradient(140deg,#111827,#07111f_58%,#080b12)] p-7 shadow-[0_32px_110px_rgba(0,0,0,0.34)] sm:p-10">
        <div className="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-amber-100/50 to-transparent" />
        <div className="relative grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.38em] text-amber-100/70">
              AoE2HD Battle Intelligence
            </div>
            <h1 className="mt-4 max-w-4xl font-serif text-4xl leading-[1.02] tracking-[-0.035em] text-white sm:text-6xl">
              The permanent war record for Age of Empires II HD.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Replays become battle records, rivalries, player histories, command timelines, and a living archive for the HD community.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/upload" className="rounded-full bg-amber-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-200">
                Upload Your Replays
              </Link>
              <Link href="/battle-archive" className="rounded-full border border-white/16 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10">
                Enter The War Vault
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <StatCard label="Battles Filed" value={totalGames.toLocaleString()} />
            <StatCard label="Latest Records" value={String(games.length)} />
            <StatCard label="Replay Standard" value="HD 5.8" />
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_20rem]">
        <div className="rounded-[1.8rem] border border-white/10 bg-slate-950/72 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-sky-100/55">Freshly Filed</div>
              <h2 className="mt-2 text-3xl font-semibold text-white">Latest HD battle records</h2>
            </div>
            <Link href="/battle-archive" className="text-sm font-semibold text-amber-200 transition hover:text-amber-100">
              Browse all {totalGames.toLocaleString()} battles →
            </Link>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {games.map((game) => {
              const players = parsePlayers(game.players);
              const winningNames = players.filter(playerWon).map(displayPlayerName);
              const reliableWinner = resolveReliableReplayWinner({
                winner: game.winner,
                players,
                parseReason: game.parse_reason,
                keyEvents: game.key_events,
                eventTypes: game.event_types,
              });
              const victoryLabel = winningNames.length > 0 ? winningNames.join(" / ") : reliableWinner;
              const playedAt = readPlayedAt(game);
              const parsedMapName = readMapName(game.map);
              const mapName = parsedMapName === "Map unavailable" ? "HD Battle Record" : parsedMapName;

              return (
                <article
                  key={game.id}
                  className="group rounded-[1.45rem] border border-white/8 bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] p-5 transition hover:-translate-y-0.5 hover:border-amber-200/25 hover:bg-white/[0.07]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-sky-100/55">
                        Battle #{game.id}
                      </div>
                      <h3 className="mt-2 break-words text-xl font-semibold text-white">{mapName}</h3>
                    </div>
                    <Tag>{victoryLabel ? "Decisive result" : "Battle filed"}</Tag>
                  </div>

                  <div className="mt-4 break-words text-sm leading-6 text-slate-300">
                    {players.length > 0
                      ? players.map(displayPlayerName).join(" · ")
                      : "Replay roster preserved"}
                  </div>

                  {victoryLabel ? (
                    <div className="mt-4 rounded-xl border border-emerald-200/12 bg-emerald-300/[0.06] px-3 py-2 text-sm font-semibold text-emerald-100">
                      {victoryLabel} victorious
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <Tag>{displayReplayFilename(game.original_filename, game.replay_file)}</Tag>
                    {game.game_duration && game.game_duration > 0 ? <Tag>{formatDurationLabel(game.game_duration)}</Tag> : null}
                    {game.user ? <Tag>{game.user.inGameName || game.user.steamPersonaName || "HD warrior"}</Tag> : null}
                  </div>
                  {playedAt ? <div className="mt-3 text-xs text-slate-500">{new Date(playedAt).toLocaleString()}</div> : null}
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-white/8 pt-4">
                    <Link
                      href={`/game-stats/${game.id}`}
                      className="w-full rounded-full border border-white/14 bg-white/5 px-4 py-2 text-center text-sm font-semibold text-white transition hover:border-sky-200/35 hover:bg-white/10 sm:w-auto"
                    >
                      Open Battle
                    </Link>
                    <ReviewReplayResultButton
                      gameStatsId={game.id}
                      submitterUids={[
                        game.userUid,
                        ...game.replayParseAttempts.map((attempt) => attempt.userUid),
                      ]}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="space-y-4">
          <Feature title="Teams & Results" body="Exact replay rosters, team sides, winner evidence, and a commissioner-backed correction trail." />
          <Feature title="Player War Books" body="Every uploaded battle strengthens player profiles, rivalries, map history, and long-term form." />
          <Feature title="Command Intelligence" body="Build orders, research, unit commands, resign timing, and battle rhythm power the next HD analytics layer." />
          <div className="rounded-[1.5rem] border border-amber-200/18 bg-amber-300/[0.07] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-amber-100/65">Bring Your History Home</div>
            <p className="mt-3 text-sm leading-6 text-slate-300">Old HD files still have stories to tell. Upload a folder and build your permanent player archive.</p>
            <Link href="/upload" className="mt-4 inline-flex rounded-full bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-200">Start your vault</Link>
          </div>
        </aside>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[1.35rem] border border-white/10 bg-black/20 px-4 py-4"><div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold text-white">{value}</div></div>;
}

function Feature({ title, body }: { title: string; body: string }) {
  return <div className="rounded-[1.4rem] border border-white/9 bg-slate-950/72 p-5"><h3 className="text-lg font-semibold text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-400">{body}</p></div>;
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{children}</span>;
}
