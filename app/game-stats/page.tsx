import Link from "next/link";
import type { ReactNode } from "react";

import { getPrisma } from "@/lib/prisma";
import {
  displayParseReason,
  displayPlayerName,
  displayReplayFilename,
  outcomeBadgeLabel,
  parsePlayers,
  parseStatusLabel,
  readMapName,
  readPlayedAt,
  shortHash,
  winnerLabel,
} from "@/lib/gameStatsView";

export const dynamic = "force-dynamic";

export default async function GameStatsPage() {
  const prisma = getPrisma();

  const [games, recentAttempts] = await Promise.all([
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: {
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            verificationLevel: true,
            verified: true,
          },
        },
      },
    }),
    prisma.replayParseAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
  ]);

  const failedAttempts = recentAttempts.filter((attempt) => attempt.status !== "stored");
  const storedAttempts = recentAttempts.filter((attempt) => attempt.status === "stored");

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_35%),linear-gradient(135deg,_#0f172a,_#0f172a_55%,_#111827)] p-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-3">
            <div className="text-sm uppercase tracking-[0.4em] text-sky-200/70">Parser Lab</div>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white sm:text-5xl">
              Final replays, parse misses, and fresh uploads.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
              Track what landed, what failed, and what needs another pass.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Back To Lobby
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <StatCard label="Final Parsed Games" value={String(games.length)} />
            <StatCard label="Recent Failures" value={String(failedAttempts.length)} />
            <StatCard label="Recent Stored Uploads" value={String(storedAttempts.length)} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Final Games</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Successful Final Parses</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {games.length} visible
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {games.length === 0 ? (
              <EmptyPanel message="No final parses yet. Upload a replay with the watcher and it will land here." />
            ) : (
              games.map((game) => {
                const players = parsePlayers(game.players);
                const playedAt = readPlayedAt(game);
                const outcomeLabel = outcomeBadgeLabel(game.parse_reason, game.winner);

                return (
                  <Link
                    key={game.id}
                    href={`/game-stats/${game.id}`}
                    className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-white">{readMapName(game.map)}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {players.length > 0
                            ? players.map((player) => displayPlayerName(player)).join(" vs ")
                            : "Players unavailable"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
                          {winnerLabel(game.winner, game.parse_reason)}
                        </div>
                        {outcomeLabel ? (
                          <div className="mt-2">
                            <Tag>{outcomeLabel}</Tag>
                          </div>
                        ) : null}
                        <div className="mt-2 text-xs text-slate-500">#{game.id}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <Tag>{displayReplayFilename(game.original_filename, game.replay_file)}</Tag>
                      <Tag>{displayParseReason(game.parse_reason)}</Tag>
                      {game.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
                      {game.user ? (
                        <Tag>{game.user.inGameName || game.user.steamPersonaName || game.user.uid}</Tag>
                      ) : null}
                    </div>

                    {playedAt ? (
                      <div className="mt-3 text-xs text-slate-400">
                        {new Date(playedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </Link>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-white/45">Failures</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Recent Parse Misses</h2>
              </div>
              <div className="rounded-full border border-red-400/25 bg-red-500/10 px-3 py-1 text-xs text-red-100">
                {failedAttempts.length} recent
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {failedAttempts.length === 0 ? (
                <EmptyPanel message="No recent failures. New parse misses will stay visible here after deployment." />
              ) : (
                failedAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium text-white">
                          {displayReplayFilename(attempt.originalFilename, null)}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-300">
                          {attempt.detail || "No parser detail recorded."}
                        </p>
                      </div>
                      <div className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-100">
                        {parseStatusLabel(attempt.status)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                      <Tag>{attempt.uploadMode || "unknown mode"}</Tag>
                      <Tag>{attempt.parseSource}</Tag>
                      <Tag>{shortHash(attempt.replayHash)}</Tag>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {attempt.createdAt.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Ingestion</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recent Stored Uploads</h2>

            <div className="mt-5 space-y-3">
              {storedAttempts.length === 0 ? (
                <EmptyPanel message="Stored uploads will appear here after the first persisted parse attempt lands." />
              ) : (
                storedAttempts.slice(0, 12).map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-white">
                        {displayReplayFilename(attempt.originalFilename, null)}
                      </div>
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100">
                        Stored
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
                      <Tag>{attempt.uploadMode || "unknown mode"}</Tag>
                      <Tag>{shortHash(attempt.replayHash)}</Tag>
                      {attempt.gameStatsId ? (
                        <Link
                          href={`/game-stats/${attempt.gameStatsId}`}
                          className="rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-sky-100 transition hover:border-sky-300/35 hover:bg-sky-400/15"
                        >
                          Open game #{attempt.gameStatsId}
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {attempt.createdAt.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.4rem] border border-white/10 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-400">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}
