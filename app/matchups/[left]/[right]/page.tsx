import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  displayParseReason,
  outcomeBadgeLabel,
  readMapName,
  readPlayedAt,
  winnerLabel,
} from "@/lib/gameStatsView";
import {
  buildMatchupHref,
  filterHeadToHeadMatches,
  loadRecentFinalMatchupRows,
  summarizeHeadToHead,
} from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import {
  applyPendingWoloClaimSummary,
  resolvePublicPlayerToken,
  type PublicPlayerRef,
} from "@/lib/publicPlayers";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";

export const dynamic = "force-dynamic";

export default async function MatchupPage({
  params,
}: {
  params: Promise<{ left: string; right: string }>;
}) {
  const { left, right } = await params;
  const prisma = getPrisma();

  const [rawLeftPlayer, rawRightPlayer] = await Promise.all([
    resolvePublicPlayerToken(prisma, decodeURIComponent(left)),
    resolvePublicPlayerToken(prisma, decodeURIComponent(right)),
  ]);

  if (!rawLeftPlayer || !rawRightPlayer || rawLeftPlayer.token === rawRightPlayer.token) {
    notFound();
  }

  const pendingClaimSummaries = await loadPendingWoloClaimSummariesByName(prisma, [
    ...rawLeftPlayer.aliases,
    ...rawRightPlayer.aliases,
  ]);
  const leftPlayer = applyPendingWoloClaimSummary(rawLeftPlayer, pendingClaimSummaries);
  const rightPlayer = applyPendingWoloClaimSummary(rawRightPlayer, pendingClaimSummaries);

  const canonicalHref = buildMatchupHref(leftPlayer, rightPlayer);
  const currentHref = `/matchups/${encodeURIComponent(decodeURIComponent(left))}/${encodeURIComponent(
    decodeURIComponent(right)
  )}`;
  if (canonicalHref !== currentHref) {
    redirect(canonicalHref);
  }

  const candidateMatches = await loadRecentFinalMatchupRows(prisma, 800);

  const matches = filterHeadToHeadMatches(candidateMatches, leftPlayer, rightPlayer).slice(0, 24);
  const summary = summarizeHeadToHead(matches, leftPlayer, rightPlayer);
  const matchCountLabel = summary.totalMatches === 1 ? "1 match" : `${summary.totalMatches} matches`;
  const lastPlayedLabel = summary.lastPlayedAt
    ? new Date(summary.lastPlayedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Waiting for first match";

  return (
    <main className="space-y-8 py-6 text-white">
      <section className="overflow-hidden rounded-[2.3rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.45)] sm:p-10">
        <div className="space-y-8">
          <div className="space-y-6">
            <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Head-To-Head</div>
            <div className="max-w-4xl space-y-4">
              <h1 className="text-4xl font-semibold leading-[0.92] text-white sm:text-5xl lg:text-6xl">
                {leftPlayer.name} vs {rightPlayer.name}
              </h1>
              <p className="max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
                Replay-backed rivalry record. Every stored meeting between these two players lands
                here with results, timestamps, and direct paths into each public identity page.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Tag>{matchCountLabel}</Tag>
              <Tag>{leftPlayer.name}: {summary.leftWins}</Tag>
              <Tag>{rightPlayer.name}: {summary.rightWins}</Tag>
              {summary.unknowns > 0 ? <Tag>{summary.unknowns} unknown</Tag> : null}
              <Tag>Last played {lastPlayedLabel}</Tag>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={leftPlayer.href}
                className="rounded-full bg-sky-300 px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                View {leftPlayer.name}
              </Link>
              <Link
                href={rightPlayer.href}
                className="rounded-full border border-white/15 px-6 py-3.5 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                View {rightPlayer.name}
              </Link>
              <Link
                href="/players"
                className="rounded-full border border-white/15 px-6 py-3.5 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Browse Players
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-6 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">Live Rivalry Score</div>
              <Tag>Updated from final parsed replays</Tag>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <HeroPlayer player={leftPlayer} />
              <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 px-6 py-5 text-center">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Series</div>
                <div className="mt-2 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                  {summary.leftWins}
                  <span className="px-3 text-slate-500">-</span>
                  {summary.rightWins}
                </div>
              </div>
              <HeroPlayer player={rightPlayer} />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <SummaryMetric label="Meetings" value={String(summary.totalMatches)} />
              <SummaryMetric label="Unknown Results" value={String(summary.unknowns)} />
              <SummaryMetric label="Last Meeting" value={lastPlayedLabel} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <Panel title="Series Record" eyebrow="Rivalry">
          <div className="space-y-5">
            <PlayerSummaryCard
              player={leftPlayer}
              wins={summary.leftWins}
              losses={summary.rightWins}
              unknowns={summary.unknowns}
            />
            <PlayerSummaryCard
              player={rightPlayer}
              wins={summary.rightWins}
              losses={summary.leftWins}
              unknowns={summary.unknowns}
            />
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
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-semibold text-white">{readMapName(match.map)}</div>
                        <div className="mt-1 text-sm leading-6 text-slate-300">
                          {leftPlayer.name} vs {rightPlayer.name}
                        </div>
                      </div>
                      <div className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-sky-100">
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
    <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.72))] p-7 shadow-[0_20px_60px_rgba(2,6,23,0.35)]">
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-semibold text-white">{title}</h2>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function HeroPlayer({
  player,
}: {
  player: PublicPlayerRef;
}) {
  return (
    <div className="min-w-0 rounded-[1.6rem] border border-white/8 bg-white/5 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {player.claimed ? "Claimed Warrior" : "Unclaimed Warrior"}
      </div>
      <div className="mt-3 break-words text-2xl font-semibold leading-tight text-white">
        {player.name}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {player.claimed ? (
          <Link href={player.href} className="inline-flex">
            <SteamLinkedBadge compact />
          </Link>
        ) : (
          <Tag>Replay-built identity</Tag>
        )}
        {player.pendingWoloClaimCount > 0 ? <Tag>{player.pendingWoloClaimAmount} WOLO unclaimed</Tag> : null}
      </div>
    </div>
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
    <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-lg shadow-black/20">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-2xl font-semibold leading-tight text-white break-words sm:text-3xl">
              {player.name}
            </div>
            {player.claimed ? (
              <Link href={player.href} className="inline-flex">
                <SteamLinkedBadge compact />
              </Link>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Tag>{identityLabel}</Tag>
            <Tag>{wins + losses + unknowns} recorded</Tag>
            {player.pendingWoloClaimCount > 0 ? <Tag>{player.pendingWoloClaimAmount} WOLO unclaimed</Tag> : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <RecordMetric label="Wins" value={wins} accent="emerald" />
          <RecordMetric label="Losses" value={losses} accent="rose" />
          <RecordMetric label="Unknown" value={unknowns} accent="slate" />
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={player.href}
            className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
          >
            Open profile
          </Link>
          {!player.claimed ? (
            <Link
              href={`/profile?claim_name=${encodeURIComponent(player.name)}`}
              className="inline-flex max-w-full items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
            >
              <span className="truncate">Claim {player.name}</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RecordMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "emerald" | "rose" | "slate";
}) {
  const accentClasses =
    accent === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : accent === "rose"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : "border-white/10 bg-slate-950/60 text-slate-200";

  return (
    <div className={`rounded-2xl border px-4 py-4 ${accentClasses}`}>
      <div className="text-[11px] uppercase tracking-[0.25em] text-white/55">{label}</div>
      <div className="mt-1 text-sm text-white/75">Series result</div>
      <div className="mt-4 text-4xl font-semibold text-white">{value}</div>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-3 break-words text-xl font-semibold leading-7 text-white">
        {value}
      </div>
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs leading-5 text-slate-300 break-words">
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
