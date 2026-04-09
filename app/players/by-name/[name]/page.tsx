import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import {
  buildMatchupHref,
  buildRivalSummaries,
  loadRecentFinalMatchupRows,
} from "@/lib/publicMatchups";
import {
  displayParseReason,
  displayPlayerName,
  formatDurationLabel,
  outcomeBadgeLabel,
  parsePlayers,
  readMapName,
  readPlayedAt,
  winnerLabel,
} from "@/lib/gameStatsView";
import { buildPlayerPerformanceStats } from "@/lib/playerPerformance";
import { getPrisma } from "@/lib/prisma";
import {
  applyPendingWoloClaimSummary,
  buildReplayPublicPlayerRef,
  normalizePublicPlayerName,
  publicPlayerMatchesName,
} from "@/lib/publicPlayers";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";

export const dynamic = "force-dynamic";

export default async function ReplayOnlyPlayerPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const playerName = normalizePublicPlayerName(decodeURIComponent(name));
  if (!playerName) {
    notFound();
  }

  const prisma = getPrisma();
  const claimedUser = await prisma.user.findFirst({
    where: {
      OR: [
        { inGameName: { equals: playerName, mode: "insensitive" } },
        { steamPersonaName: { equals: playerName, mode: "insensitive" } },
      ],
    },
    select: { uid: true },
  });

  if (claimedUser) {
    redirect(`/players/${claimedUser.uid}`);
  }

  const replayPlayer = buildReplayPublicPlayerRef(playerName);
  const candidateMatches = await loadRecentFinalMatchupRows(prisma, 2400);

  const matchedGames = candidateMatches
    .filter((match) =>
      parsePlayers(match.players).some(
        (player) => publicPlayerMatchesName(replayPlayer, displayPlayerName(player))
      )
    );

  if (matchedGames.length === 0) {
    notFound();
  }

  const wins = matchedGames.filter((match) => publicPlayerMatchesName(replayPlayer, match.winner || "")).length;
  const losses = matchedGames.filter(
    (match) => match.winner && !publicPlayerMatchesName(replayPlayer, match.winner)
  ).length;
  const unknowns = matchedGames.length - wins - losses;
  const claimHref = `/profile?claim_name=${encodeURIComponent(playerName)}`;
  const pendingClaimSummaries = await loadPendingWoloClaimSummariesByName(prisma, [playerName]);
  const currentPlayer = applyPendingWoloClaimSummary(
    buildReplayPublicPlayerRef(playerName),
    pendingClaimSummaries
  );
  const performance = buildPlayerPerformanceStats(matchedGames, currentPlayer);
  const matches = matchedGames.slice(0, 24);
  const rivalries = await buildRivalSummaries(prisma, matches, currentPlayer);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(248,113,113,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-rose-200/70">Replay-Built Warrior Page</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{playerName}</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              This public page was created automatically from parsed AoE2HD replays. If this is
              you, sign in with Steam, claim the name, and start building a verified tournament and
              betting identity.
            </p>
            <div className="flex flex-wrap gap-2">
              <Tag>unclaimed identity</Tag>
              <Tag>{matchedGames.length} parsed matches</Tag>
              {currentPlayer.pendingWoloClaimCount > 0 ? (
                <Tag>{currentPlayer.pendingWoloClaimAmount} WOLO unclaimed</Tag>
              ) : null}
              {wins > 0 ? <Tag>{wins} wins</Tag> : null}
              {losses > 0 ? <Tag>{losses} losses</Tag> : null}
              {unknowns > 0 ? <Tag>{unknowns} unknown outcomes</Tag> : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={claimHref}
              className="rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
            >
              Claim This Identity
            </Link>
            <Link
              href="/players"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Browse Players
            </Link>
            <Link
              href="/game-stats"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Back To Parser Lab
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <section className="space-y-6">
          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            {currentPlayer.pendingWoloClaimCount > 0 ? (
              <div className="mb-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
                {currentPlayer.pendingWoloClaimAmount} WOLO is still waiting in the claim ledger for
                this replay-built warrior page.
              </div>
            ) : null}
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Stats</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Performance Snapshot</h2>

            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard label="Steam Rating" value={formatRatingMetric(performance.steamRating)} />
              <MetricCard label="RM Ladder" value={formatRatingMetric(performance.ladderRating)} />
              <MetricCard
                label="Win Rate"
                value={performance.winRate !== null ? `${performance.winRate}%` : "Unknown"}
              />
              <MetricCard label="Rated Matches" value={String(performance.ratedMatches)} />
              <MetricCard
                label="Avg Game Length"
                value={formatDurationLabel(performance.averageDurationSeconds)}
              />
              <MetricCard
                label="Longest Game"
                value={formatDurationLabel(performance.longestDurationSeconds)}
              />
              <MetricCard
                label="Shortest Game"
                value={formatDurationLabel(performance.shortestDurationSeconds)}
              />
              <MetricCard label="Unique Opponents" value={String(performance.uniqueOpponents)} />
              <MetricCard
                label="Civilizations Played"
                value={String(performance.civilizationsPlayed)}
              />
              <MetricCard label="Most Played Map" value={performance.mostPlayedMap || "Unknown"} />
            </div>
            {performance.ratingLastSeenAt ? (
              <div className="mt-4 text-xs text-slate-400">
                Official rating last seen {new Date(performance.ratingLastSeenAt).toLocaleString()}
              </div>
            ) : null}
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="text-xs uppercase tracking-[0.35em] text-white/45">Why Claim It</div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Turn replay sightings into a real profile</h2>

            <div className="mt-5 space-y-4 text-sm leading-6 text-slate-300">
              <p>
                Right now this page only knows what the parser saw in replay files. Claiming it lets
                you link Steam, join tournaments, chat in the lobby, mint a watcher key, and turn this
                into a verified player identity.
              </p>
              <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
                <div className="text-sm font-medium text-white">Claim flow</div>
                <ol className="mt-3 space-y-2 text-slate-300">
                  <li>1. Sign in with Steam.</li>
                  <li>2. Save this in-game name on your profile.</li>
                  <li>3. Upload one replay with your watcher key to verify it.</li>
                </ol>
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.35em] text-white/45">Rivalries</div>
                <h2 className="mt-2 text-2xl font-semibold text-white">Top Head-To-Heads</h2>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                {rivalries.length} rivals
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {rivalries.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
                  No rivalries yet. The first repeat opponent will show up here.
                </div>
              ) : (
                rivalries.slice(0, 6).map((rivalry) => (
                  <Link
                    key={rivalry.ref.token}
                    href={buildMatchupHref(currentPlayer, rivalry.ref)}
                    className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-rose-300/30 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-white">{rivalry.ref.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.25em] text-slate-400">
                          {rivalry.ref.claimed ? "claimed rival" : "replay-built rival"}
                        </div>
                      </div>
                      <div className="text-right text-xs text-slate-300">
                        {rivalry.wins}-{rivalry.losses}
                        {rivalry.unknowns > 0 ? ` · ${rivalry.unknowns} unknown` : ""}
                      </div>
                    </div>

                    {rivalry.lastPlayedAt ? (
                      <div className="mt-3 text-xs text-slate-400">
                        Last met {new Date(rivalry.lastPlayedAt).toLocaleString()}
                      </div>
                    ) : null}
                  </Link>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Match Feed</div>
              <h2 className="mt-2 text-2xl font-semibold text-white">Recent Parsed Matches</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              {matches.length} recent
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {matches.map((match) => {
              const players = parsePlayers(match.players);
              const playedAt = readPlayedAt(match);
              const outcomeLabel = outcomeBadgeLabel(match.parse_reason, match.winner);

              return (
                <Link
                  key={match.id}
                  href={`/game-stats/${match.id}`}
                  className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-rose-300/30 hover:bg-white/10"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="font-medium text-white">{readMapName(match.map)}</div>
                      <div className="mt-1 text-sm text-slate-300">
                        {players.length > 0
                          ? players.map((player) => displayPlayerName(player)).join(" vs ")
                          : "Players unavailable"}
                      </div>
                    </div>
                    <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                      {winnerLabel(match.winner, match.parse_reason)}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
                    <Tag>{displayParseReason(match.parse_reason)}</Tag>
                    {match.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
                  </div>

                  {playedAt ? (
                    <div className="mt-3 text-xs text-slate-400">
                      {new Date(playedAt).toLocaleString()}
                    </div>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</div>
      <div className="mt-3 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function formatRatingMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Unknown";
}
