import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import { outcomeBadgeLabel, readMapName, readPlayedAt, winnerLabel } from "@/lib/gameStatsView";
import {
  buildMatchupHref,
  filterHeadToHeadMatches,
  summarizeHeadToHead,
} from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import { resolvePublicPlayerToken, type PublicPlayerRef } from "@/lib/publicPlayers";

export const dynamic = "force-dynamic";

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ left: string; right: string }>;
}) {
  const { left, right } = await params;
  const prisma = getPrisma();

  const [leftPlayer, rightPlayer] = await Promise.all([
    resolvePublicPlayerToken(prisma, decodeURIComponent(left)),
    resolvePublicPlayerToken(prisma, decodeURIComponent(right)),
  ]);

  if (!leftPlayer || !rightPlayer || leftPlayer.token === rightPlayer.token) {
    notFound();
  }

  const canonicalHref = buildMatchupHref(leftPlayer, rightPlayer);
  const currentHref = `/matchups/${encodeURIComponent(decodeURIComponent(left))}/${encodeURIComponent(
    decodeURIComponent(right)
  )}`;
  if (canonicalHref !== currentHref) {
    redirect(canonicalHref);
  }

  const candidateMatches = await prisma.gameStats.findMany({
    where: { is_final: true },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      winner: true,
      players: true,
      played_on: true,
      timestamp: true,
      parse_reason: true,
      map: true,
      disconnect_detected: true,
    },
  });

  const matches = filterHeadToHeadMatches(candidateMatches, leftPlayer, rightPlayer).slice(0, 24);
  const summary = summarizeHeadToHead(matches, leftPlayer, rightPlayer);

  return (
    <main className="space-y-6 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.18),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_58%,_#020617)] p-8">
        <div className="space-y-5">
          <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Head-To-Head</div>
          <h1 className="text-4xl font-semibold text-white sm:text-5xl">
            {leftPlayer.name} vs {rightPlayer.name}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-slate-300 sm:text-lg">
            Replay-backed rivalry record. Every stored meeting between these two players lands here
            with results, timestamps, and direct paths into each public identity page.
          </p>

          <div className="flex flex-wrap gap-2">
            <Tag>{summary.totalMatches} matches</Tag>
            <Tag>{leftPlayer.name}: {summary.leftWins}</Tag>
            <Tag>{rightPlayer.name}: {summary.rightWins}</Tag>
            {summary.unknowns > 0 ? <Tag>{summary.unknowns} unknown</Tag> : null}
            {summary.lastPlayedAt ? (
              <Tag>Last played {new Date(summary.lastPlayedAt).toLocaleString()}</Tag>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href={leftPlayer.href}
              className="rounded-full bg-sky-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
            >
              View {leftPlayer.name}
            </Link>
            <Link
              href={rightPlayer.href}
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              View {rightPlayer.name}
            </Link>
            <Link
              href="/players"
              className="rounded-full border border-white/15 px-5 py-3 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
            >
              Browse Players
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title="Series Record" eyebrow="Rivalry">
          <div className="grid gap-4 md:grid-cols-2">
            <PlayerSummaryCard player={leftPlayer} wins={summary.leftWins} losses={summary.rightWins} unknowns={summary.unknowns} />
            <PlayerSummaryCard player={rightPlayer} wins={summary.rightWins} losses={summary.leftWins} unknowns={summary.unknowns} />
          </div>
        </Panel>

        <Panel title="Recent Meetings" eyebrow="Match Feed">
          <div className="space-y-3">
            {matches.length === 0 ? (
              <EmptyPanel message="No replay-backed meetings between these two players have been stored yet." />
            ) : (
              matches.map((match) => {
                const playedAt = readPlayedAt(match);
                const outcomeLabel = outcomeBadgeLabel(match.parse_reason, match.winner);

                return (
                  <Link
                    key={match.id}
                    href={`/game-stats/${match.id}`}
                    className="block rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/10"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-medium text-white">{readMapName(match.map)}</div>
                        <div className="mt-1 text-sm text-slate-300">
                          {leftPlayer.name} vs {rightPlayer.name}
                        </div>
                      </div>
                      <div className="text-right text-xs uppercase tracking-[0.25em] text-slate-400">
                        {winnerLabel(match.winner, match.parse_reason)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
                      <Tag>{match.parse_reason || "unknown parse reason"}</Tag>
                      {match.disconnect_detected ? <Tag>disconnect suspected</Tag> : null}
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

function PlayerSummaryCard({
  player,
  wins,
  losses,
  unknowns,
}: {
  player: PublicPlayerRef;
  wins: number;
  losses: number;
  unknowns: number;
}) {
  const identityLabel = player.claimed ? "Claimed profile" : "Unclaimed warrior";

  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xl font-semibold text-white">{player.name}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
            {identityLabel}
          </div>
          {player.claimed ? (
            <div className="mt-3">
              <SteamLinkedBadge compact />
            </div>
          ) : null}
        </div>
        <Link
          href={player.href}
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-slate-300 transition hover:border-white/20 hover:text-white"
        >
          Open
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-2">
        <Stat label="Wins" value={String(wins)} />
        <Stat label="Losses" value={String(losses)} />
        <Stat label="Unknown" value={String(unknowns)} />
      </div>

      {!player.claimed ? (
        <div className="mt-6">
          <Link
            href={`/profile?claim_name=${encodeURIComponent(player.name)}`}
            className="rounded-full bg-rose-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-rose-200"
          >
            Claim {player.name}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-3 py-4 text-center">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-3 text-2xl font-semibold text-slate-100">{value}</div>
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

function EmptyPanel({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}
