import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  displayParseReason,
  readMapName,
  readPlayedAt,
} from "@/lib/gameStatsView";
import {
  buildMatchupHref,
  buildTeamMatchupHref,
  filterTeamMatchupMatches,
  loadRecentFinalMatchupRows,
  resolvePublicTeamRosterToken,
  resolveTeamMatchWinnerSide,
  summarizeTeamMatchup,
  teamRivalryFormatLabel,
} from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import {
  applyPendingWoloClaimSummary,
  type PublicPlayerRef,
} from "@/lib/publicPlayers";
import {
  loadPendingWoloClaimSummariesByName,
} from "@/lib/pendingWoloClaims";

export const dynamic = "force-dynamic";

export default async function TeamMatchupPage({
  params,
}: {
  params: Promise<{
    left: string;
    right: string;
  }>;
}) {
  const { left, right } = await params;
  const prisma = getPrisma();

  const [rawLeftRoster, rawRightRoster] =
    await Promise.all([
      resolvePublicTeamRosterToken(
        prisma,
        decodeURIComponent(left)
      ),
      resolvePublicTeamRosterToken(
        prisma,
        decodeURIComponent(right)
      ),
    ]);

  if (
    !rawLeftRoster ||
    !rawRightRoster ||
    rawLeftRoster.length !==
      rawRightRoster.length ||
    rawLeftRoster.length < 2 ||
    rawLeftRoster.length > 4
  ) {
    notFound();
  }

  const pendingClaimSummaries =
    await loadPendingWoloClaimSummariesByName(
      prisma,
      [
        ...rawLeftRoster.flatMap(
          (player) => player.aliases
        ),
        ...rawRightRoster.flatMap(
          (player) => player.aliases
        ),
      ]
    );

  const leftRoster = rawLeftRoster.map(
    (player) =>
      applyPendingWoloClaimSummary(
        player,
        pendingClaimSummaries
      )
  );

  const rightRoster = rawRightRoster.map(
    (player) =>
      applyPendingWoloClaimSummary(
        player,
        pendingClaimSummaries
      )
  );

  const canonicalHref =
    buildTeamMatchupHref(
      leftRoster,
      rightRoster
    );

  const currentHref =
    `/matchups/team/${encodeURIComponent(
      decodeURIComponent(left)
    )}/${encodeURIComponent(
      decodeURIComponent(right)
    )}`;

  if (canonicalHref !== currentHref) {
    redirect(canonicalHref);
  }

  const candidateMatches =
    await loadRecentFinalMatchupRows(
      prisma,
      5000
    );

  const matches = filterTeamMatchupMatches(
    candidateMatches,
    leftRoster,
    rightRoster
  ).slice(0, 48);

  const summary = summarizeTeamMatchup(
    matches,
    leftRoster,
    rightRoster
  );

  const teamSize = leftRoster.length;
  const format =
    `${teamSize}v${teamSize}` as
      | "2v2"
      | "3v3"
      | "4v4";

  const leftLabel = rosterLabel(leftRoster);
  const rightLabel = rosterLabel(rightRoster);

  const lastPlayedLabel =
    summary.lastPlayedAt
      ? new Date(
          summary.lastPlayedAt
        ).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Waiting for first battle";

  return (
    <main className="space-y-8 py-6 text-white">
      <section className="overflow-hidden rounded-[2.3rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.16),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.45)] sm:p-10">
        <div className="space-y-8">
          <div>
            <div className="text-xs uppercase tracking-[0.35em] text-amber-200/70">
              {teamRivalryFormatLabel(format)}
            </div>

            <h1 className="mt-5 max-w-5xl text-4xl font-semibold leading-[1.02] text-white sm:text-5xl">
              {leftLabel}
              <span className="mx-3 text-slate-500">
                vs
              </span>
              {rightLabel}
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-8 text-slate-300">
              Replay-backed roster history. These warriors remain
              together as the side that entered battle—not flattened
              into misleading individual duels.
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Tag>
                {summary.totalMatches} battles
              </Tag>
              <Tag>{teamSize}v{teamSize}</Tag>
              <Tag>
                {summary.unknowns} unknown
              </Tag>
              <Tag>
                Last fought {lastPlayedLabel}
              </Tag>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="#player-rivalries"
                className="rounded-full bg-sky-300 px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
              >
                Open Player Rivalries
              </Link>

              <Link
                href="/rivalries"
                className="rounded-full border border-white/15 px-6 py-3.5 text-sm text-white/85 transition hover:border-white/30 hover:text-white"
              >
                Browse Rivalries
              </Link>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-6 shadow-2xl shadow-black/30">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="text-xs uppercase tracking-[0.35em] text-white/45">
                Live Rivalry Score
              </div>

              <Tag>
                Final parsed team replays
              </Tag>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <RosterHero
                roster={leftRoster}
                label="Left War Party"
              />

              <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 px-6 py-5 text-center">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  Series
                </div>

                <div className="mt-2 whitespace-nowrap text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                  {summary.leftWins}
                  <span className="px-3 text-slate-500">
                    -
                  </span>
                  {summary.rightWins}
                </div>
              </div>

              <RosterHero
                roster={rightRoster}
                label="Right War Party"
              />
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <SummaryMetric
                label="Battles"
                value={String(
                  summary.totalMatches
                )}
              />

              <SummaryMetric
                label="Unknown Results"
                value={String(
                  summary.unknowns
                )}
              />

              <SummaryMetric
                label="Last Battle"
                value={lastPlayedLabel}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <Panel
          title="The War Parties"
          eyebrow="Roster Record"
        >
          <div className="space-y-5">
            <RosterRecord
              roster={leftRoster}
              wins={summary.leftWins}
              losses={summary.rightWins}
              unknowns={summary.unknowns}
            />

            <RosterRecord
              roster={rightRoster}
              wins={summary.rightWins}
              losses={summary.leftWins}
              unknowns={summary.unknowns}
            />
          </div>
        </Panel>

        <Panel
          title="Recent Battles"
          eyebrow="Match Feed"
        >
          <div className="space-y-3">
            {matches.length === 0 ? (
              <EmptyPanel message="No safely reconstructed battles between these exact rosters were found." />
            ) : (
              matches.map((match) => {
                const playedAt =
                  readPlayedAt(match);

                const winnerSide =
                  resolveTeamMatchWinnerSide(
                    match,
                    leftRoster,
                    rightRoster
                  );

                const winnerText =
                  winnerSide === "left"
                    ? leftLabel
                    : winnerSide === "right"
                      ? rightLabel
                      : "Result unresolved";

                return (
                  <article
                    key={match.id}
                    className="relative isolate cursor-pointer rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition hover:border-sky-300/30 hover:bg-white/10"
                    data-team-battle-card
                  >
                    <Link
                      href={`/game-stats/${match.id}`}
                      className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70"
                      aria-label={`Open game stats for battle ${match.id}`}
                      data-team-battle-card-link
                    >
                      <span className="sr-only">
                        Open game stats
                      </span>
                    </Link>

                    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.9fr)] lg:items-start">
                      <div className="min-w-0">
                        <div className="break-words text-xl font-semibold leading-tight text-white">
                          {readMapName(match.map)}
                        </div>

                        <div className="relative z-20 mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-6 text-slate-400">
                          <MatchFeedRosterLinks
                            roster={leftRoster}
                          />

                          <span className="text-slate-600">
                            vs
                          </span>

                          <MatchFeedRosterLinks
                            roster={rightRoster}
                          />
                        </div>
                      </div>

                      <div className="min-w-0 rounded-xl border border-amber-200/10 bg-amber-100/[0.04] px-4 py-3 lg:text-right">
                        <div className="text-[10px] uppercase tracking-[0.26em] text-amber-200/55">
                          {winnerSide
                            ? "Battle Victor"
                            : "Result"}
                        </div>

                        <div className="mt-2 break-words text-sm font-medium leading-6 text-amber-100/85">
                          {winnerText}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Tag>
                        {displayParseReason(
                          match.parse_reason
                        )}
                      </Tag>

                      {match.disconnect_detected ? (
                        <Tag>
                          disconnect suspected
                        </Tag>
                      ) : null}
                    </div>

                    {playedAt ? (
                      <div className="mt-3 text-xs text-slate-400">
                        {new Date(
                          playedAt
                        ).toLocaleString()}
                      </div>
                    ) : null}
                  </article>
                );
              })
            )}
          </div>
        </Panel>
      </section>
      <Panel
        id="player-rivalries"
        title="Individual Rivalry Matrix"
        eyebrow="Every Warrior Against Every Enemy"
      >
        <p className="max-w-4xl text-sm leading-7 text-slate-400">
          Every warrior on one side receives a
          comprehensive rivalry against every
          warrior on the opposing side. Those
          records combine true duels with every
          2v2, 3v3, and 4v4 battle in which they
          stood against one another.
        </p>

        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {leftRoster.flatMap(
            (leftWarrior) =>
              rightRoster.map(
                (rightWarrior) => (
                  <IndividualRivalryLink
                    key={`${leftWarrior.token}:${rightWarrior.token}`}
                    left={leftWarrior}
                    right={rightWarrior}
                  />
                )
              )
          )}
        </div>
      </Panel>

    </main>
  );
}

function MatchFeedRosterLinks({
  roster,
}: {
  roster: PublicPlayerRef[];
}) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
      {roster.map(
        (player, index) => (
          <span
            key={player.token}
            className="inline-flex min-w-0 items-center"
          >
            {index > 0 ? (
              <span className="mr-1 text-slate-600">
                /
              </span>
            ) : null}

            <Link
              href={player.href}
              className="relative z-20 max-w-full break-words font-medium text-slate-300 transition hover:text-sky-200 [overflow-wrap:anywhere]"
              data-match-feed-player-link
            >
              {player.name}
            </Link>
          </span>
        )
      )}
    </span>
  );
}

function IndividualRivalryLink({
  left,
  right,
}: {
  left: PublicPlayerRef;
  right: PublicPlayerRef;
}) {
  return (
    <article
      className="group relative isolate cursor-pointer rounded-[1.4rem] border border-white/8 bg-white/5 p-4 transition-colors hover:border-sky-300/30 hover:bg-white/10"
      data-individual-rivalry-card
    >
      <Link
        href={buildMatchupHref(
          left,
          right
        )}
        className="absolute inset-0 z-10 rounded-[1.4rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70"
        aria-label={`Open rivalry between ${left.name} and ${right.name}`}
      >
        <span className="sr-only">
          Open player rivalry
        </span>
      </Link>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0">
          <Link
            href={left.href}
            className="relative z-20 break-words text-sm font-semibold leading-5 text-white transition hover:text-sky-200"
            data-matrix-player-link
          >
            {left.name}
          </Link>

          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Left side
          </div>
        </div>

        <div className="text-[10px] uppercase tracking-[0.28em] text-slate-600">
          VS
        </div>

        <div className="min-w-0 text-right">
          <Link
            href={right.href}
            className="relative z-20 break-words text-sm font-semibold leading-5 text-white transition hover:text-sky-200"
            data-matrix-player-link
          >
            {right.name}
          </Link>

          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            Right side
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-slate-500">
        Duels + team opposition
      </div>
    </article>
  );
}

function RosterHero({
  roster,
  label,
}: {
  roster: PublicPlayerRef[];
  label: string;
}) {
  return (
    <div className="min-w-0 rounded-[1.6rem] border border-white/8 bg-white/5 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {label}
      </div>

      <div className="mt-4 space-y-3">
        {roster.map((player) => (
          <PlayerLine
            key={player.token}
            player={player}
          />
        ))}
      </div>
    </div>
  );
}

function RosterRecord({
  roster,
  wins,
  losses,
  unknowns,
}: {
  roster: PublicPlayerRef[];
  wins: number;
  losses: number;
  unknowns: number;
}) {
  return (
    <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-lg shadow-black/20">
      <div className="space-y-3">
        {roster.map((player) => (
          <PlayerLine
            key={player.token}
            player={player}
          />
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <RecordMetric
          label="Wins"
          value={wins}
          accent="emerald"
        />

        <RecordMetric
          label="Losses"
          value={losses}
          accent="rose"
        />

        <RecordMetric
          label="Unknown"
          value={unknowns}
          accent="slate"
        />
      </div>
    </div>
  );
}

function PlayerLine({
  player,
}: {
  player: PublicPlayerRef;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <Link
        href={player.href}
        className="break-words text-lg font-semibold text-white transition hover:text-sky-200"
      >
        {player.name}
      </Link>

      {player.claimed ? (
        <Link
          href={player.href}
          className="inline-flex"
        >
          <SteamLinkedBadge compact />
        </Link>
      ) : (
        <Tag>Replay-built</Tag>
      )}

      {player.pendingWoloClaimCount > 0 ? (
        <Tag>
          {player.pendingWoloClaimAmount} WOLO unclaimed
        </Tag>
      ) : null}
    </div>
  );
}

function Panel({
  id,
  title,
  eyebrow,
  children,
}: {
  id?: string;
  title: string;
  eyebrow: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(2,6,23,0.9),rgba(2,6,23,0.72))] p-7 shadow-[0_20px_60px_rgba(2,6,23,0.35)]"
    >
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">
        {eyebrow}
      </div>

      <h2 className="mt-3 text-3xl font-semibold text-white">
        {title}
      </h2>

      <div className="mt-6">{children}</div>
    </section>
  );
}

function SummaryMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-slate-950/60 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>

      <div className="mt-3 break-words text-sm font-medium leading-6 text-white">
        {value}
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
  const tone =
    accent === "emerald"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100"
      : accent === "rose"
        ? "border-rose-400/20 bg-rose-400/10 text-rose-100"
        : "border-white/10 bg-slate-950/60 text-slate-100";

  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${tone}`}
    >
      <div className="text-[11px] uppercase tracking-[0.22em] opacity-60">
        {label}
      </div>

      <div className="mt-3 text-3xl font-semibold">
        {value}
      </div>
    </div>
  );
}

function Tag({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs leading-5 text-slate-300 break-words">
      {children}
    </span>
  );
}

function EmptyPanel({
  message,
}: {
  message: string;
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 px-4 py-5 text-sm text-slate-300">
      {message}
    </div>
  );
}

function rosterLabel(
  roster: PublicPlayerRef[]
) {
  return roster
    .map((player) => player.name)
    .join(" / ");
}
