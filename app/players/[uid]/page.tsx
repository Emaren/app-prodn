import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import CommunityBadgePill from "@/components/contact/CommunityBadgePill";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  displayParseReason,
  displayPlayerName,
  formatDurationLabel,
  outcomeBadgeLabel,
  parsePlayers,
  parseStatusLabel,
  readMapName,
  readPlayedAt,
  winnerLabel,
} from "@/lib/gameStatsView";
import { buildPlayerPerformanceStats } from "@/lib/playerPerformance";
import { buildMatchupHref, buildRivalSummaries } from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import {
  applyPendingWoloClaimSummary,
  buildClaimedPublicPlayerRef,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";
import { loadUserCommunitySummaries } from "@/lib/communityHonors";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";

export const dynamic = "force-dynamic";

export default async function PublicPlayerPage({
  params,
}: {
  params: Promise<{ uid: string }>;
}) {
  const { uid } = await params;
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { uid },
  });

  if (!user) {
    notFound();
  }

  const parseAttempts = await prisma.replayParseAttempt.findMany({
    where: { userUid: uid },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const candidateMatches = await prisma.gameStats.findMany({
    where: { is_final: true },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
    take: 250,
  });

  const identityKeys = Array.from(
    new Set(
      [user.inGameName, user.steamPersonaName]
        .map((name) => normalizePublicPlayerName(name).toLowerCase())
        .filter(Boolean)
    )
  );

  const matchedGames = candidateMatches
    .filter((game) =>
      parsePlayers(game.players).some((player) =>
        identityKeys.includes(normalizePublicPlayerName(displayPlayerName(player)).toLowerCase())
      )
    );
  const aliasSet = new Set<string>(
    [user.inGameName, user.steamPersonaName]
      .map((name) => normalizePublicPlayerName(name))
      .filter(Boolean)
  );

  for (const game of matchedGames) {
    for (const player of parsePlayers(game.players)) {
      const playerName = normalizePublicPlayerName(displayPlayerName(player));
      if (identityKeys.includes(playerName.toLowerCase())) {
        aliasSet.add(playerName);
      }
    }
  }

  const failedAttempts = parseAttempts.filter((attempt) => attempt.status !== "stored");
  const liveThreshold = new Date(Date.now() - 2 * 60 * 1000);
  const displayName = user.inGameName || user.steamPersonaName || user.uid;
  const isLive = Boolean(user.lastSeen && user.lastSeen > liveThreshold);
  const community = (await loadUserCommunitySummaries(prisma, [user.id])).get(user.id) ?? {
    badges: [],
    gifts: [],
    giftedWolo: 0,
  };
  const aliases = Array.from(aliasSet);
  const pendingClaimSummaries = await loadPendingWoloClaimSummariesByName(prisma, aliases);
  const currentPlayer = applyPendingWoloClaimSummary(
    buildClaimedPublicPlayerRef(user, displayName),
    pendingClaimSummaries
  );
  const performance = buildPlayerPerformanceStats(matchedGames, currentPlayer);
  const publicMatches = matchedGames.slice(0, 24);
  const rivalries = await buildRivalSummaries(prisma, publicMatches, currentPlayer);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">Public Warrior Page</div>
            <h1 className="text-4xl font-semibold text-white sm:text-5xl">{displayName}</h1>
            <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
              Steam-linked public profile, recent replay-backed matches, and parser reliability signals.
            </p>

            <div className="flex flex-wrap gap-2">
              {user.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
              <Tag>{user.verified ? "Replay verified" : "Claimed profile"}</Tag>
              <Tag>verification level {user.verificationLevel}</Tag>
              {currentPlayer.pendingWoloClaimCount > 0 ? (
                <Tag>Unclaimed WOLO · {currentPlayer.pendingWoloClaimAmount}</Tag>
              ) : null}
              {isLive ? <Tag>online now</Tag> : null}
              {community.badges.map((badge) => (
                <CommunityBadgePill key={badge.id} label={badge.label} />
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/players"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Browse Players
            </Link>
            <Link
              href="/"
              className="rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
            >
              Back To Lobby
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-6">
          <Panel title="Performance Snapshot" eyebrow="Stats">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          </Panel>

          <Panel title="Identity" eyebrow="Profile">
            <dl className="grid gap-4">
              <StatRow label="Public Name" value={displayName} />
              <StatRow label="UID" value={user.uid} />
              <StatRow label="Steam Persona" value={user.steamPersonaName || "Unknown"} />
              <StatRow label="Steam ID" value={user.steamId || "Unknown"} />
              <StatRow label="Verification Method" value={user.verificationMethod} />
              <StatRow
                label="Known Aliases"
                value={
                  aliases.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {aliases.map((alias) => (
                        <Tag key={alias}>{alias}</Tag>
                      ))}
                    </div>
                  ) : (
                    "None yet"
                  )
                }
              />
              <StatRow
                label="Verified At"
                value={user.verifiedAt ? user.verifiedAt.toLocaleString() : "Not yet"}
              />
              <StatRow
                label="Presence"
                value={user.lastSeen ? user.lastSeen.toLocaleString() : "No recent heartbeat"}
              />
            </dl>
          </Panel>

          {currentPlayer.pendingWoloClaimCount > 0 ? (
            <Panel title="Unclaimed WOLO" eyebrow="Claim Rail">
              <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm leading-6 text-amber-100">
                {currentPlayer.pendingWoloClaimAmount} WOLO is still waiting in the app-side claim
                ledger for this identity across {currentPlayer.pendingWoloClaimCount} row
                {currentPlayer.pendingWoloClaimCount === 1 ? "" : "s"}.
              </div>
            </Panel>
          ) : null}

          {community.badges.length > 0 || community.giftedWolo > 0 ? (
            <Panel title="Community Honors" eyebrow="Recognition">
              <div className="space-y-4">
                {community.badges.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {community.badges.map((badge) => (
                      <CommunityBadgePill key={badge.id} label={badge.label} />
                    ))}
                  </div>
                ) : null}
                {community.giftedWolo > 0 ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-4 text-sm text-amber-100">
                    Community grant ledger: {community.giftedWolo} WOLO recorded for this player.
                  </div>
                ) : null}
              </div>
            </Panel>
          ) : null}

          <Panel title="Reliability" eyebrow="Parser Health">
            <dl className="grid gap-4 sm:grid-cols-2">
              <StatRow label="Public Matches" value={String(matchedGames.length)} />
              <StatRow label="Recent Parse Misses" value={String(failedAttempts.length)} />
            </dl>

            <div className="mt-5 space-y-3">
              {failedAttempts.length === 0 ? (
                <EmptyPanel message="No recent parse misses recorded for this player." />
              ) : (
                failedAttempts.slice(0, 10).map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">
                          {attempt.originalFilename || "Replay file"}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-300">
                          {attempt.detail || "No parser detail recorded."}
                        </div>
                      </div>
                      <div className="rounded-full border border-red-400/20 bg-red-500/10 px-3 py-1 text-xs text-red-100">
                        {parseStatusLabel(attempt.status)}
                      </div>
                    </div>
                    <div className="mt-3 text-xs text-slate-400">
                      {attempt.createdAt.toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </Panel>

          <Panel title="Top Rivalries" eyebrow="Head-To-Head">
            <div className="space-y-3">
              {rivalries.length === 0 ? (
                <EmptyPanel message="No repeat opponents yet. Once this player meets the same rival again, the head-to-head graph will start here." />
              ) : (
                rivalries.slice(0, 6).map((rivalry) => (
                  <Link
                    key={rivalry.ref.token}
                    href={buildMatchupHref(currentPlayer, rivalry.ref)}
                    className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-amber-300/30 hover:bg-white/10"
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
          </Panel>
        </div>

        <Panel title="Recent Replay-Backed Matches" eyebrow="Match Feed">
          <div className="space-y-3">
            {publicMatches.length === 0 ? (
              <EmptyPanel message="No public replay-backed matches have been connected to this player yet." />
            ) : (
              publicMatches.map((game) => {
                const players = parsePlayers(game.players);
                const playedAt = readPlayedAt(game);
                const outcomeLabel = outcomeBadgeLabel(game.parse_reason, game.winner);

                return (
                  <Link
                    key={game.id}
                    href={`/game-stats/${game.id}`}
                    className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-amber-300/30 hover:bg-white/10"
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
                      <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                        {winnerLabel(game.winner, game.parse_reason)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
                      <Tag>{displayParseReason(game.parse_reason)}</Tag>
                      {game.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
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
        </Panel>
      </section>
    </main>
  );
}

function Panel({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-6">
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
      {children}
    </span>
  );
}

function StatRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4">
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm text-slate-200">{value}</dd>
    </div>
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

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}
