import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";
import type { ReactNode } from "react";

import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import TimeDisplayText from "@/components/time/TimeDisplayText";
import {
  readMapName,
  readPlayedAt,
} from "@/lib/gameStatsView";
import {
  buildMatchupHref,
  buildPlayerPairRivalryContext,
  loadRecentFinalMatchupRows,
  PUBLIC_MATCHUP_SCAN_LIMIT,
  teamRivalryFormatLabel,
  type PlayerPairBattle,
  type PlayerPairTeamSeries,
} from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import {
  applyPendingWoloClaimSummary,
  resolvePublicPlayerToken,
  type PublicPlayerRef,
} from "@/lib/publicPlayers";
import {
  loadPendingWoloClaimSummariesByName,
} from "@/lib/pendingWoloClaims";
import {
  resolvePublicWarEngineStatus,
} from "@/lib/warEngine";

export const dynamic = "force-dynamic";

export default async function MatchupPage({
  params,
}: {
  params: Promise<{
    left: string;
    right: string;
  }>;
}) {
  const { left, right } = await params;
  const prisma = getPrisma();

  const [
    rawLeftPlayer,
    rawRightPlayer,
  ] = await Promise.all([
    resolvePublicPlayerToken(
      prisma,
      decodeURIComponent(left)
    ),
    resolvePublicPlayerToken(
      prisma,
      decodeURIComponent(right)
    ),
  ]);

  if (
    !rawLeftPlayer ||
    !rawRightPlayer ||
    rawLeftPlayer.token ===
      rawRightPlayer.token
  ) {
    notFound();
  }

  const pendingClaimSummaries =
    await loadPendingWoloClaimSummariesByName(
      prisma,
      [
        ...rawLeftPlayer.aliases,
        ...rawRightPlayer.aliases,
      ]
    );

  const leftPlayer =
    applyPendingWoloClaimSummary(
      rawLeftPlayer,
      pendingClaimSummaries
    );

  const rightPlayer =
    applyPendingWoloClaimSummary(
      rawRightPlayer,
      pendingClaimSummaries
    );

  const canonicalHref = buildMatchupHref(
    leftPlayer,
    rightPlayer
  );

  const currentHref =
    `/matchups/${encodeURIComponent(
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
      PUBLIC_MATCHUP_SCAN_LIMIT
    );

  const rivalry =
    buildPlayerPairRivalryContext(
      candidateMatches,
      leftPlayer,
      rightPlayer
    );

  const recentOpposing =
    rivalry.opposingBattles.slice(0, 24);

  const recentAllied =
    rivalry.alliedBattles.slice(0, 12);

  const matchCountLabel =
    rivalry.totalMatches === 1
      ? "1 opposing meeting"
      : `${rivalry.totalMatches} opposing meetings`;

  return (
    <main className="space-y-8 py-6 text-white">
      <section className="overflow-hidden rounded-[2.3rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.22),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(245,158,11,0.14),_transparent_28%),linear-gradient(135deg,_#0f172a,_#111827_56%,_#020617)] p-8 shadow-[0_30px_90px_rgba(2,6,23,0.45)] sm:p-10">
        <div className="space-y-8">
          <div className="space-y-6">
            <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">
              Rivalry Record
            </div>

            <div className="max-w-4xl space-y-4">
              <h1 className="text-4xl font-semibold leading-[0.92] text-white sm:text-5xl lg:text-6xl">
                {leftPlayer.name} vs{" "}
                {rightPlayer.name}
              </h1>

              <p className="max-w-3xl text-base leading-8 text-slate-300 sm:text-lg">
                Every stored battle in which
                these warriors stood on opposing
                sides. Duels remain duels. Team
                battles retain every warrior who
                entered the field.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Tag>{matchCountLabel}</Tag>
              <Tag>
                {rivalry.duelCount} duels
              </Tag>

              <Tag>
                {rivalry.tagTeamCount} tag-team
                battles
              </Tag>

              <Tag>
                {rivalry.triTeamCount} tri-team
                battles
              </Tag>

              <Tag>
                {rivalry.warTeamCount} war-team
                battles
              </Tag>

              {rivalry.alliedBattleCount > 0 ? (
                <Tag>
                  {rivalry.alliedBattleCount} allied
                  battles
                </Tag>
              ) : null}

              <Tag>
                Last fought{" "}
                {rivalry.lastPlayedAt ? (
                  <TimeDisplayText value={rivalry.lastPlayedAt} />
                ) : (
                  "waiting for first battle"
                )}
              </Tag>
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

              {rivalry.teamSeries.length === 1 ? (
                <Link
                  href={rivalry.teamSeries[0].href}
                  className="rounded-full bg-sky-300 px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
                >
                  Open Team Rivalry
                </Link>
              ) : rivalry.teamSeries.length > 1 ? (
                <Link
                  href="#team-rivalries"
                  className="rounded-full bg-sky-300 px-6 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-200"
                >
                  Open Team Rivalries
                </Link>
              ) : null}

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
                All opposing replay-backed battles
              </Tag>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
              <HeroPlayer
                player={leftPlayer}
              />

              <div className="rounded-[1.7rem] border border-white/10 bg-slate-950/70 px-6 py-5 text-center">
                <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  Series
                </div>

                <div className="mt-2 text-5xl font-semibold tracking-tight text-white sm:text-6xl">
                  {rivalry.leftWins}
                  <span className="px-3 text-slate-500">
                    -
                  </span>
                  {rivalry.rightWins}
                </div>
              </div>

              <HeroPlayer
                player={rightPlayer}
              />
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <SummaryMetric
                label="Opposing Meetings"
                value={String(
                  rivalry.totalMatches
                )}
              />

              <SummaryMetric
                label="Duels"
                value={String(
                  rivalry.duelCount
                )}
              />

              <SummaryMetric
                label="Tag Team"
                value={String(
                  rivalry.tagTeamCount
                )}
              />

              <SummaryMetric
                label="Tri-Team"
                value={String(
                  rivalry.triTeamCount
                )}
              />

              <SummaryMetric
                label="War Team"
                value={String(
                  rivalry.warTeamCount
                )}
              />

              <SummaryMetric
                label="Allied Battles"
                value={String(
                  rivalry.alliedBattleCount
                )}
              />
            </div>
          </div>
        </div>
      </section>

      {rivalry.teamSeries.length > 0 ? (
        <Panel
          id="team-rivalries"
          title="Exact War Party Series"
          eyebrow="The Armies Behind The Rivalry"
        >
          <p className="max-w-4xl text-sm leading-7 text-slate-400">
            Every distinct roster remains its own
            rivalry. A changed warrior creates a
            new war party and a new historical
            series.
          </p>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {rivalry.teamSeries.map(
              (series) => (
                <TeamSeriesCard
                  key={series.key}
                  series={series}
                />
              )
            )}
          </div>
        </Panel>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
        <Panel
          title="Series Record"
          eyebrow="Rivalry"
        >
          <div className="space-y-5">
            <PlayerSummaryCard
              player={leftPlayer}
              wins={rivalry.leftWins}
              losses={rivalry.rightWins}
            />

            <PlayerSummaryCard
              player={rightPlayer}
              wins={rivalry.rightWins}
              losses={rivalry.leftWins}
            />
          </div>
        </Panel>

        <Panel
          title="Recent Opposing Battles"
          eyebrow="Match Feed"
        >
          <div className="space-y-3">
            {recentOpposing.length === 0 ? (
              <EmptyPanel message="No replay-backed battles have placed these warriors on opposing sides yet." />
            ) : (
              recentOpposing.map((battle) => (
                <BattleCard
                  key={battle.game.id}
                  battle={battle}
                  leftPlayer={leftPlayer}
                  rightPlayer={rightPlayer}
                />
              ))
            )}
          </div>
        </Panel>
      </section>

      {recentAllied.length > 0 ? (
        <Panel
          title="Allied Battles"
          eyebrow="They Once Shared A Banner"
        >
          <div className="grid gap-3 xl:grid-cols-2">
            {recentAllied.map((battle) => (
              <BattleCard
                key={battle.game.id}
                battle={battle}
                leftPlayer={leftPlayer}
                rightPlayer={rightPlayer}
                allied
              />
            ))}
          </div>
        </Panel>
      ) : null}
    </main>
  );
}

function TeamSeriesCard({
  series,
}: {
  series: PlayerPairTeamSeries;
}) {
  return (
    <Link
      href={series.href}
      className="block rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-5 transition-colors hover:border-amber-300/30 hover:bg-white/10"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-amber-200/65">
            {teamRivalryFormatLabel(
              series.format
            )}
            {" · "}
            {series.format}
          </div>

          <div className="mt-2 text-sm text-slate-400">
            Exact roster rivalry
          </div>
        </div>

        <Tag>
          {series.meetingCount === 1
            ? "1 battle"
            : `${series.meetingCount} battles`}
        </Tag>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <RosterLine
          names={series.leftNames}
          highlighted
        />

        <div className="text-center text-xs uppercase tracking-[0.3em] text-slate-600">
          VS
        </div>

        <RosterLine
          names={series.rightNames}
          highlighted
          align="right"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <span className="text-slate-500">
          Last battle{" "}
          {series.lastPlayedAt ? (
            <TimeDisplayText value={series.lastPlayedAt} />
          ) : (
            "series archived"
          )}
        </span>

        <span className="font-medium text-sky-200">
          Open Team Rivalry
        </span>
      </div>
    </Link>
  );
}

function BattleCard({
  battle,
  leftPlayer,
  rightPlayer,
  allied = false,
}: {
  battle: PlayerPairBattle;
  leftPlayer: PublicPlayerRef;
  rightPlayer: PublicPlayerRef;
  allied?: boolean;
}) {
  const playedAt = readPlayedAt(
    battle.game
  );
  const warEngineStatus =
    resolvePublicWarEngineStatus(
      battle.game
    );

  const leftRoster =
    battle.leftSideNames.join(" / ");

  const rightRoster =
    battle.rightSideNames.join(" / ");

  const winnerRoster =
    battle.winnerSide === "left"
      ? leftRoster
      : battle.winnerSide === "right"
        ? rightRoster
        : null;

  let resultLabel =
    warEngineStatus?.badge ??
    "Battle preserved";
  let resultDetail =
    warEngineStatus?.detail ?? null;

  if (winnerRoster) {
    resultDetail = null;
    if (allied) {
      resultLabel =
        battle.winnerSide ===
        battle.leftPlayerSide
          ? "Alliance victorious"
          : "Alliance defeated";
    } else if (
      battle.winnerSide ===
      battle.leftPlayerSide
    ) {
      resultLabel =
        `${leftPlayer.name} side won`;
    } else if (
      battle.winnerSide ===
      battle.rightPlayerSide
    ) {
      resultLabel =
        `${rightPlayer.name} side won`;
    }
  }

  return (
    <article className="relative isolate cursor-pointer rounded-2xl border border-white/8 bg-white/5 px-4 py-4 transition-colors hover:border-sky-300/20 hover:bg-white/[0.07]">
      <Link
        href={`/game-stats/${battle.game.id}`}
        className="absolute inset-0 z-10 rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-200/70"
        aria-label={`Open game stats for battle ${battle.game.id}`}
        data-player-battle-card-link
      >
        <span className="sr-only">
          Open game stats
        </span>
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.28em] text-sky-200/55">
            {teamRivalryFormatLabel(
              battle.format
            )}
            {" · "}
            {battle.format}
          </div>

          <div className="mt-2 text-lg font-semibold text-white">
            {publicBattlefieldLabel(battle.game.map)}
          </div>
        </div>

        <div className="max-w-[16rem] text-right">
          <div className="text-[11px] uppercase tracking-[0.22em] text-amber-100/75">
            {resultLabel}
          </div>

          {winnerRoster ? (
            <div className="mt-2 text-xs leading-5 text-slate-400">
              {winnerRoster}
            </div>
          ) : resultDetail ? (
            <div className="mt-2 text-xs leading-5 text-slate-400">
              {resultDetail}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <MatchFeedRosterLine
          names={battle.leftSideNames}
          linkedPlayers={[
            leftPlayer,
            rightPlayer,
          ]}
          highlighted={
            battle.leftPlayerSide === "left" ||
            battle.rightPlayerSide === "left"
          }
        />

        <div className="text-center text-xs uppercase tracking-[0.3em] text-slate-600">
          VS
        </div>

        <MatchFeedRosterLine
          names={battle.rightSideNames}
          linkedPlayers={[
            leftPlayer,
            rightPlayer,
          ]}
          highlighted={
            battle.leftPlayerSide === "right" ||
            battle.rightPlayerSide === "right"
          }
          align="right"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        {playedAt ? (
          <span>
            <TimeDisplayText value={playedAt} includeYear />
          </span>
        ) : null}
      </div>

      {battle.exactTeam ? (
        <div className="relative z-20 mt-4 flex flex-wrap gap-3">
          <Link
            href={battle.exactTeam.href}
            className="inline-flex items-center rounded-full bg-sky-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-sky-200"
          >
            Open Team Rivalry
          </Link>
        </div>
      ) : null}
    </article>
  );
}

function MatchFeedRosterLine({
  names,
  linkedPlayers,
  highlighted,
  align = "left",
}: {
  names: string[];
  linkedPlayers: PublicPlayerRef[];
  highlighted: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-3 ${
        highlighted
          ? "border-sky-300/20 bg-sky-300/[0.055]"
          : "border-white/8 bg-white/[0.035]"
      }`}
    >
      <div
        className={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 ${
          align === "right"
            ? "justify-end text-right"
            : ""
        }`}
      >
        {names.map((name, index) => {
          const linkedPlayer =
            linkedPlayers.find(
              (candidate) =>
                normalizeMatchFeedName(
                  candidate.name
                ) ===
                normalizeMatchFeedName(
                  name
                )
            );

          return (
            <span
              key={`${name}:${index}`}
              className="inline-flex min-w-0 items-center"
            >
              {index > 0 ? (
                <span className="mr-2 text-slate-600">
                  /
                </span>
              ) : null}

              {linkedPlayer ? (
                <Link
                  href={linkedPlayer.href}
                  className="relative z-20 min-w-0 break-words font-medium text-slate-200 transition hover:text-sky-200 [overflow-wrap:anywhere]"
                  data-match-feed-player-link
                >
                  {name}
                </Link>
              ) : (
                <span className="min-w-0 break-words font-medium text-slate-200 [overflow-wrap:anywhere]">
                  {name}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function normalizeMatchFeedName(
  value: string
) {
  return value
    .trim()
    .toLocaleLowerCase();
}

function RosterLine({
  names,
  highlighted,
  align = "left",
}: {
  names: string[];
  highlighted: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border px-3 py-3 ${
        highlighted
          ? "border-sky-300/15 bg-sky-300/[0.06]"
          : "border-white/[0.06] bg-slate-950/30"
      } ${
        align === "right"
          ? "md:text-right"
          : ""
      }`}
    >
      <div className="space-y-1">
        {names.map((name) => (
          <div
            key={name}
            className="break-words text-sm font-medium leading-5 text-slate-200"
          >
            {name}
          </div>
        ))}
      </div>
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

function HeroPlayer({
  player,
}: {
  player: PublicPlayerRef;
}) {
  return (
    <div className="min-w-0 rounded-[1.6rem] border border-white/8 bg-white/5 px-5 py-5">
      <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
        {player.claimed
          ? "Claimed Warrior"
          : "Unclaimed Warrior"}
      </div>

      <div className="mt-3 break-words text-2xl font-semibold leading-tight text-white">
        {player.name}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {player.claimed ? (
          <Link
            href={player.href}
            className="inline-flex"
          >
            <SteamLinkedBadge compact />
          </Link>
        ) : (
          <Tag>Replay-built identity</Tag>
        )}

        {player.pendingWoloClaimCount > 0 ? (
          <Tag>
            {player.pendingWoloClaimAmount} WOLO unclaimed
          </Tag>
        ) : null}
      </div>
    </div>
  );
}

function PlayerSummaryCard({
  player,
  wins,
  losses,
}: {
  player: PublicPlayerRef;
  wins: number;
  losses: number;
}) {
  const identityLabel = player.claimed
    ? "Claimed profile"
    : "Unclaimed warrior";

  return (
    <div className="rounded-[1.8rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))] p-6 shadow-lg shadow-black/20">
      <div className="space-y-5">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="break-words text-2xl font-semibold leading-tight text-white sm:text-3xl">
              {player.name}
            </div>

            {player.claimed ? (
              <Link
                href={player.href}
                className="inline-flex"
              >
                <SteamLinkedBadge compact />
              </Link>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Tag>{identityLabel}</Tag>
            <Tag>
              {wins + losses} decided
            </Tag>

            {player.pendingWoloClaimCount > 0 ? (
              <Tag>
                {player.pendingWoloClaimAmount} WOLO unclaimed
              </Tag>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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
              href={`/profile?claim_name=${encodeURIComponent(
                player.name
              )}`}
              className="inline-flex max-w-full items-center rounded-full bg-rose-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-rose-200"
            >
              <span className="truncate">
                Claim {player.name}
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function publicBattlefieldLabel(value: unknown) {
  const mapName = readMapName(value);
  return mapName.toLowerCase().includes("unavailable")
    ? "Recorded Battlefield"
    : mapName;
}

function RecordMetric({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent:
    | "emerald"
    | "rose"
    | "slate";
}) {
  const accentClasses =
    accent === "emerald"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
      : accent === "rose"
        ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
        : "border-white/10 bg-slate-950/60 text-slate-200";

  return (
    <div
      className={`rounded-2xl border px-4 py-4 ${accentClasses}`}
    >
      <div className="text-[11px] uppercase tracking-[0.25em] text-white/55">
        {label}
      </div>

      <div className="mt-1 text-sm text-white/75">
        Rivalry result
      </div>

      <div className="mt-4 text-4xl font-semibold text-white">
        {value}
      </div>
    </div>
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
    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>

      <div className="mt-3 break-words text-xl font-semibold leading-7 text-white">
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
