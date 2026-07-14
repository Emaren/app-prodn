import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import ReviewReplayResultButton from "@/components/game-stats/ReviewReplayResultButton";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import {
  formatDurationLabel,
  displayGameType,
  displayGameVersion,
  displayPlayerName,
  displayReplayFilename,
  outcomeBadgeLabel,
  parsePlayers,
  parseStatusLabel,
  readMapName,
  readMapSize,
  readPlayerCivilizationLabel,
  readPlayerSteamDmRating,
  readPlayerSteamId,
  readPlayerSteamRmRating,
  readPlayedAt,
  shortHash,
  stringifyJson,
} from "@/lib/gameStatsView";
import {
  buildMatchupHref,
  buildTeamMatchupHref,
  filterHeadToHeadMatches,
  loadRecentFinalMatchupRows,
  summarizeHeadToHead,
} from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import { parseReplaySides } from "@/lib/replaySides";
import {
  buildPublicPlayerRef,
  findClaimedUsersForReplayNames,
  getClaimedPublicPlayer,
  getPublicPlayerHref,
} from "@/lib/publicPlayers";
import { resolveReliableReplayWinner } from "@/lib/unresolvedWatcherResult";
import {
  applyReplayAdjudicationToGameStats,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import {
  getReplayAchievementGroups,
  type ReplayAchievementGroup,
} from "@/lib/replayAchievementMetrics";

export const dynamic = "force-dynamic";

type ReplayDetailViewMode = "basic" | "advanced" | "extreme";

function parseReplayDetailViewMode(value: string | string[] | undefined): ReplayDetailViewMode {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "basic" || raw === "advanced" || raw === "extreme" ? raw : "advanced";
}

export default async function GameStatsDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ view?: string | string[] }>;
}) {
  const { id } = await params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const detailView = parseReplayDetailViewMode(resolvedSearchParams.view);
  const showRawReplayOutput = detailView === "extreme";

  const prisma = getPrisma();
  const rawGame = await prisma.gameStats.findUnique({
    where: { id: gameId },
    include: {
      replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          verificationLevel: true,
          verified: true,
          lastSeen: true,
        },
      },
      tournamentMatchProof: {
        select: {
          id: true,
          tournament: {
            select: {
              slug: true,
              title: true,
            },
          },
        },
      },
    },
  });

  if (!rawGame) {
    notFound();
  }

  const game = applyReplayAdjudicationToGameStats(rawGame);
  const commissionerVerified = Boolean(
    (game as Record<string, unknown>).replayResultAdjudication
  );

  const parseAttempts = await prisma.replayParseAttempt.findMany({
    where: {
      OR: [
        { gameStatsId: game.id },
        ...(game.original_filename ? [{ originalFilename: game.original_filename }] : []),
        ...(game.replayHash ? [{ replayHash: game.replayHash }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const players = parsePlayers(game.players).filter(
    (player) => displayPlayerName(player) !== "Roster unresolved"
  );
  const resultReviewSubmitterUids = [
    game.userUid,
    ...parseAttempts.map((attempt) => attempt.userUid),
  ];
  const battleTapeSessionKey = game.original_filename || game.replay_file || null;
  const battleTapeHref = battleTapeSessionKey
    ? `/game-stats/live/${encodeURIComponent(battleTapeSessionKey)}`
    : null;
  const linkedBetMarket = await prisma.betMarket.findFirst({
    where: {
      OR: [
        { linkedGameStatsId: game.id },
        ...(battleTapeSessionKey ? [{ linkedSessionKey: battleTapeSessionKey }] : []),
      ],
    },
    select: {
      founderBonuses: {
        where: {
          rescindedAt: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          bonusType: true,
          totalAmountWolo: true,
          note: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });
  const founderBonuses = (linkedBetMarket?.founderBonuses || []).map((bonus) => ({
    id: bonus.id,
    bonusType: (bonus.bonusType === "winner" ? "winner" : "participants") as
      | "winner"
      | "participants",
    totalAmountWolo: bonus.totalAmountWolo,
    note: bonus.note ?? null,
    status: bonus.status,
    createdAt: bonus.createdAt.toISOString(),
  }));
  const claimedPlayers = await findClaimedUsersForReplayNames(
    prisma,
    players.map((player) => displayPlayerName(player))
  );
  const playerRefs = players.map((player) =>
    buildPublicPlayerRef(displayPlayerName(player), claimedPlayers)
  );
  // AOE2WAR_GAME_STATS_EXACT_RIVALRY_LINK
  const replaySides =
    parseReplaySides(game.players);

  const rivalryHref =
    replaySides?.format === "1v1" &&
    playerRefs.length === 2
      ? buildMatchupHref(
          playerRefs[0],
          playerRefs[1]
        )
      : replaySides &&
          replaySides.format !== "1v1"
        ? buildTeamMatchupHref(
            replaySides.left.map(
              (member) =>
                buildPublicPlayerRef(
                  member.name,
                  claimedPlayers
                )
            ),
            replaySides.right.map(
              (member) =>
                buildPublicPlayerRef(
                  member.name,
                  claimedPlayers
                )
            )
          )
        : null;

  const rivalryActionLabel =
    replaySides?.format === "1v1"
      ? "Open Player Rivalry"
      : replaySides
        ? "Open Team Rivalry"
        : "Open Rivalry";
  const rivalryCandidates =
    playerRefs.length === 2
      ? await loadRecentFinalMatchupRows(prisma, 800)
      : [];
  const rivalrySummary =
    playerRefs.length === 2
      ? summarizeHeadToHead(
          filterHeadToHeadMatches(rivalryCandidates, playerRefs[0], playerRefs[1]),
          playerRefs[0],
          playerRefs[1]
        )
      : null;
  const playedAt = readPlayedAt(game);
  const eventTypes = Array.isArray(game.event_types) ? game.event_types : [];
  const keyEvents =
    game.key_events && typeof game.key_events === "object" && !Array.isArray(game.key_events)
      ? game.key_events
      : {};
  const keyEventRecord = keyEvents as Record<string, unknown>;
  const publicKeyEventRecord = { ...keyEventRecord };
  delete publicKeyEventRecord.chat_preview;
  delete publicKeyEventRecord.chatPreview;
  const publicKeyEvents =
    keyEvents && typeof keyEvents === "object" && !Array.isArray(keyEvents)
      ? publicKeyEventRecord
      : keyEvents;
  const settingsSummary =
    keyEventRecord.settings &&
    typeof keyEventRecord.settings === "object" &&
    !Array.isArray(keyEventRecord.settings)
      ? (keyEventRecord.settings as Record<string, unknown>)
      : {};
  const publicSettingsEntries = Object.entries(settingsSummary).filter(
    ([, value]) => value !== null && value !== undefined && value !== ""
  );
  const reliableWinner = resolveReliableReplayWinner({
    winner: game.winner,
    players,
    parseReason: game.parse_reason,
    keyEvents: game.key_events,
    eventTypes,
  });
  const outcomeLabel = reliableWinner
    ? outcomeBadgeLabel(game.parse_reason, game.winner)
    : null;
  const winningPlayerNames = players
    .filter((player) => player.winner === true || player.winner === "true" || player.winner === 1)
    .map((player) => displayPlayerName(player));
  const publicWinnerLabel =
    winningPlayerNames.length > 0 ? winningPlayerNames.join(" / ") : reliableWinner;
  const suppressPlayerWinnerState =
    game.parse_reason === "hd_early_exit_under_60s" || !reliableWinner;
  const rivalryMatchCountLabel = rivalrySummary
    ? rivalrySummary.totalMatches === 1
      ? "1 replay-backed meeting"
      : `${rivalrySummary.totalMatches} replay-backed meetings`
    : null;
  const rivalryLastPlayedLabel = rivalrySummary?.lastPlayedAt
    ? new Date(rivalrySummary.lastPlayedAt).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "Waiting for the first stored clash";

  const mainShellClassName =
    "aoe2war-replay-detail-shell mx-auto w-full space-y-6 overflow-x-hidden px-3 py-4 text-white sm:px-4 sm:py-6 2xl:px-0";

  const heroSectionClassName =
    detailView === "extreme"
      ? "overflow-hidden rounded-[2.25rem] border border-amber-200/15 bg-[radial-gradient(circle_at_top_left,_rgba(251,191,36,0.18),_transparent_26%),radial-gradient(circle_at_90%_15%,_rgba(56,189,248,0.14),_transparent_30%),linear-gradient(135deg,_#101827,_#0b1120_52%,_#020617)] p-5 shadow-[0_30px_100px_rgba(0,0,0,0.35)] sm:p-8"
      : "overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.16),_transparent_32%),linear-gradient(135deg,_#0f172a,_#111827_60%,_#020617)] p-5 sm:p-8";

  const detailGridClassName =
    detailView === "extreme"
      ? "grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1.16fr)_minmax(24rem,0.62fr)]"
      : detailView === "advanced"
        ? "grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.72fr)]"
        : "grid min-w-0 gap-6 xl:grid-cols-[1.15fr_0.85fr]";

  const summaryGridClassName =
    detailView === "basic"
      ? "grid gap-4 sm:grid-cols-2"
      : "grid gap-3 md:grid-cols-2 2xl:grid-cols-3";

  const settingsGridClassName =
    detailView === "extreme"
      ? "mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3"
      : "mt-3 grid gap-3 md:grid-cols-2";

  const playerGridClassName =
    detailView === "basic"
      ? "grid gap-4 xl:grid-cols-2"
      : "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]";

  return (
    <main className={mainShellClassName} data-replay-detail-view={detailView}>
      <section className={heroSectionClassName}>
        <div className="space-y-6">
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs uppercase tracking-[0.35em] text-sky-200/70">Replay Detail</div>
              <ReplayDetailViewToggle activeView={detailView} gameId={game.id} />
            </div>
</div>
            <h1 className="break-words text-4xl font-semibold text-white sm:text-5xl [overflow-wrap:anywhere]">
              {readMapName(game.map) === "Map unavailable"
                ? "AoE2HD Battle Record"
                : readMapName(game.map)}
            </h1>
            <div className="flex max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 break-words text-base leading-7 text-slate-300 sm:text-lg [overflow-wrap:anywhere]">
              {replaySides &&
              replaySides.format !== "1v1" ? (
                <>
                  <span
                    className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                    data-replay-team-side="left"
                  >
                    {replaySides.left.map(
                      (member, index) => (
                        <span
                          key={`left:${member.name}:${index}`}
                          className="inline-flex min-w-0 items-center gap-x-2"
                        >
                          {index > 0 ? (
                            <span className="text-slate-500">
                              /
                            </span>
                          ) : null}

                          <Link
                            href={getPublicPlayerHref(
                              member.name,
                              claimedPlayers
                            )}
                            className="min-w-0 break-words text-sky-200 transition hover:text-sky-100"
                            data-replay-team-player-link
                          >
                            {member.name}
                          </Link>
                        </span>
                      )
                    )}
                  </span>

                  <span
                    className="px-1 font-medium text-slate-500"
                    data-replay-team-versus
                  >
                    vs
                  </span>

                  <span
                    className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                    data-replay-team-side="right"
                  >
                    {replaySides.right.map(
                      (member, index) => (
                        <span
                          key={`right:${member.name}:${index}`}
                          className="inline-flex min-w-0 items-center gap-x-2"
                        >
                          {index > 0 ? (
                            <span className="text-slate-500">
                              /
                            </span>
                          ) : null}

                          <Link
                            href={getPublicPlayerHref(
                              member.name,
                              claimedPlayers
                            )}
                            className="min-w-0 break-words text-sky-200 transition hover:text-sky-100"
                            data-replay-team-player-link
                          >
                            {member.name}
                          </Link>
                        </span>
                      )
                    )}
                  </span>
                </>
              ) : players.length > 0 ? (
                players.map((player, index) => {
                  const name = displayPlayerName(player);

                  return (
                    <span
                      key={`${name}-${index}`}
                      className="inline-flex min-w-0 items-center gap-x-2"
                    >
                      {index > 0 ? (
                        <span className="text-slate-500">
                          vs
                        </span>
                      ) : null}

                      <Link
                        href={getPublicPlayerHref(
                          name,
                          claimedPlayers
                        )}
                        className="min-w-0 break-words text-sky-200 transition hover:text-sky-100"
                      >
                        {name}
                      </Link>
                    </span>
                  );
                })
              ) : (
                "Replay roster preserved"
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Tag>{publicWinnerLabel ? `${publicWinnerLabel} victorious` : "Battle filed"}</Tag>
              {commissionerVerified ? <Tag>Commissioner verified</Tag> : null}
              <Tag>HD replay</Tag>
              <Tag>{game.is_final ? "final replay" : "battle capture"}</Tag>
              {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
            </div>
            <FounderBonusChips bonuses={founderBonuses} />
          </div>

          <div className="flex flex-wrap gap-3">
            <ReviewReplayResultButton
              gameStatsId={game.id}
              submitterUids={resultReviewSubmitterUids}
            />
            {rivalryHref ? (
              <Link
                href={rivalryHref}
                className="w-full rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-sky-300/40 hover:text-white sm:w-auto"
                data-game-stats-rivalry-link
              >
                {rivalryActionLabel}
              </Link>
            ) : null}
            {battleTapeHref ? (
              <Link
                href={battleTapeHref}
                className="w-full rounded-full border border-amber-300/30 bg-amber-400/10 px-5 py-3 text-center text-sm text-amber-100 transition hover:bg-amber-400/15 sm:w-auto"
              >
                Open Battle Tape
              </Link>
            ) : null}
            <Link
              href="/game-stats"
              className="w-full rounded-full border border-white/15 px-5 py-3 text-center text-sm text-white/85 transition hover:border-white/30 hover:text-white sm:w-auto"
            >
              Back To Battle Intelligence
            </Link>
            <Link
              href="/"
              className="w-full rounded-full bg-sky-300 px-5 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-sky-200 sm:w-auto"
            >
              Back To Lobby
            </Link>
          </div>

          {rivalrySummary && playerRefs.length === 2 ? (
            <div className="rounded-[1.75rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.03))] p-5 shadow-2xl shadow-black/25 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.35em] text-white/45">Rivalry Score</div>
                </div>
                {rivalryMatchCountLabel ? <Tag>{rivalryMatchCountLabel}</Tag> : null}
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                <RivalryHeroSide
                  name={playerRefs[0].name}
                  wins={rivalrySummary.leftWins}
                  align="left"
                  href={playerRefs[0].href}
                />
                <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/70 px-5 py-4 text-center">
                  <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Series</div>
                  <div className="mt-2 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                    {rivalrySummary.leftWins}
                    <span className="px-3 text-slate-500">-</span>
                    {rivalrySummary.rightWins}
                  </div>
                </div>
                <RivalryHeroSide
                  name={playerRefs[1].name}
                  wins={rivalrySummary.rightWins}
                  align="right"
                  href={playerRefs[1].href}
                />
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Tag>Last played {rivalryLastPlayedLabel}</Tag>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={detailGridClassName}>
        <div className="space-y-6">
          <Panel title="Replay Summary" eyebrow="Overview">
            <dl className={summaryGridClassName}>
              <StatRow label="Replay ID" value={`#${game.id}`} />
              {publicWinnerLabel ? (
                <StatRow label="Winner" value={publicWinnerLabel} />
              ) : (
                <StatRow label="Archive Status" value="Battle preserved" />
              )}
              {outcomeLabel ? <StatRow label="Victory Type" value={outcomeLabel} /> : null}
              {readMapName(game.map) !== "Map unavailable" ? <StatRow label="Map" value={readMapName(game.map)} /> : null}
              {readMapSize(game.map) !== "Size unavailable" ? <StatRow label="Map Size" value={readMapSize(game.map)} /> : null}
              {game.game_version ? <StatRow label="Game Version" value={displayGameVersion(game.game_version)} /> : null}
              {game.game_type ? <StatRow label="Game Type" value={displayGameType(game.game_type)} /> : null}
              {keyEventRecord.platform_id !== null && keyEventRecord.platform_id !== undefined ? <StatRow label="Platform" value={formatPrimitive(keyEventRecord.platform_id)} /> : null}
              {keyEventRecord.rated !== null && keyEventRecord.rated !== undefined ? <StatRow label="Rated" value={formatPrimitive(keyEventRecord.rated)} /> : null}
              {(game.duration || game.game_duration) ? <StatRow label="Duration" value={formatDurationLabel(game.duration || game.game_duration)} /> : null}
              {keyEventRecord.platform_match_id ? <StatRow label="Match ID" value={formatPrimitive(keyEventRecord.platform_match_id)} /> : null}
              {playedAt ? <StatRow label="Played On" value={formatDateTime(playedAt)} /> : null}
              <StatRow label="Recorded At" value={formatDateTime(game.createdAt)} />
              {game.user ? <StatRow label="Uploader" value={renderUploader(game.user)} /> : null}
              {keyEventRecord.lobby_name ? <StatRow label="Lobby Name" value={formatPrimitive(keyEventRecord.lobby_name)} /> : null}
              <StatRow
                label="Replay File"
                value={displayReplayFilename(game.original_filename, game.replay_file)}
              />
              <StatRow label="Replay Hash" value={shortHash(game.replayHash, 20)} />
            </dl>

            {game.tournamentMatchProof ? (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-100">
                Linked to tournament match #{game.tournamentMatchProof.id}
                {game.tournamentMatchProof.tournament
                  ? ` in ${game.tournamentMatchProof.tournament.title}`
                  : ""}
                .
              </div>
            ) : null}
          </Panel>

          {players.length > 0 ? <Panel title="Players" eyebrow="Roster">
            <div className={playerGridClassName}>
              {players.map((player, index) => {
                  const playerName = displayPlayerName(player);
                  const playerRef = playerRefs[index];
                  const claimedPlayer = getClaimedPublicPlayer(playerName, claimedPlayers);
                  const civilizationLabel = readPlayerCivilizationLabel(player);
                  const steamId = readPlayerSteamId(player);
                  const rmRating = readPlayerSteamRmRating(player);
                  const dmRating = readPlayerSteamDmRating(player);
                  const hasEapm = typeof player.eapm === "number" && Number.isFinite(player.eapm);
                  const hasPosition = Array.isArray(player.position) && player.position.length === 2;
                  const hasScore = typeof player.score === "number" && Number.isFinite(player.score);
                  const hasPlayerMetrics = Boolean(
                    steamId || rmRating !== null || dmRating !== null || hasEapm || hasPosition || hasScore
                  );

                  return (
                    <Link
                      key={`${playerName}-${index}`}
                      href={playerRef?.href || getPublicPlayerHref(playerName, claimedPlayers)}
                      className="group block min-w-0 cursor-pointer rounded-2xl border border-white/8 bg-white/5 p-5 transition hover:border-sky-300/30 hover:bg-white/10"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="break-words text-lg font-semibold leading-7 text-white transition group-hover:text-sky-100">
                            {playerName}
                          </div>
                          <div className="mt-1 text-[11px] uppercase tracking-[0.22em] text-slate-400">
                            {claimedPlayer
                              ? !suppressPlayerWinnerState && player.winner === true
                                ? "claimed player · winner"
                                : "claimed player"
                              : !suppressPlayerWinnerState && player.winner === true
                                ? "unclaimed warrior · winner"
                                : "unclaimed warrior"}
                          </div>
                        </div>
                        {!civilizationLabel.toLowerCase().includes("unavailable") ? (
                          <div className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                            {civilizationLabel}
                          </div>
                        ) : null}
                      </div>

                      {hasPlayerMetrics ? <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                        {steamId ? <PlayerMetric label="Steam ID" value={steamId} /> : null}
                        {rmRating !== null ? <PlayerMetric
                          label="RM Rating"
                          value={formatRatingMetric(rmRating)}
                        /> : null}
                        {dmRating !== null ? <PlayerMetric
                          label="DM Rating"
                          value={formatRatingMetric(dmRating)}
                        /> : null}
                        {hasEapm ? <PlayerMetric label="EAPM" value={formatPrimitive(player.eapm)} /> : null}
                        {hasPosition ? <PlayerMetric
                          label="Starting Position"
                          value={formatPositionValue(player.position)}
                        /> : null}
                        {hasScore ? <PlayerMetric label="Score" value={formatPrimitive(player.score)} /> : null}
                      </dl> : null}

                      <div className="mt-5 space-y-4">
                        {getReplayAchievementGroups(player).map((group) =>
                          renderAchievementGroup(group)
                        )}
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/8 pt-4 text-sm text-slate-400">
                        <span className="min-w-0 font-medium text-slate-300">Public player page</span>
                        <span className="shrink-0 text-sky-200 transition group-hover:translate-x-0.5 group-hover:text-sky-100">
                          Open profile
                        </span>
                      </div>
                    </Link>
                  );
                })}
            </div>
          </Panel> : null}
        </div>

        <div className="space-y-6">
          {(publicSettingsEntries.length > 0 || eventTypes.length > 0 || showRawReplayOutput) ? <Panel title="Parse Signals" eyebrow="Metadata">
            <div className="space-y-4">
              {publicSettingsEntries.length > 0 ? (
                <div>
                  <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Settings</div>
                  <dl className={settingsGridClassName}>
                    {publicSettingsEntries.map(([key, value]) => (
                      <StatRow key={key} label={humanizeKey(key)} value={formatPrimitive(value)} compact />
                    ))}
                  </dl>
                </div>
              ) : null}

              {eventTypes.length > 0 ? <div>
                <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Event Types</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventTypes.map((eventType) => <Tag key={String(eventType)}>{String(eventType)}</Tag>)}
                </div>
              </div> : null}

              {showRawReplayOutput ? (
                <>
                  <JsonPanel title="Key Events JSON" value={publicKeyEvents} />
                  <JsonPanel title="Map JSON" value={game.map} />
                </>
              ) : (
                <div className="rounded-2xl border border-amber-200/10 bg-amber-300/[0.045] px-4 py-4 text-sm leading-6 text-amber-50/78">
                  Raw parser output is tucked into Extreme. Advanced keeps the battle record clean.
                </div>
              )}
            </div>
          </Panel> : null}

          {showRawReplayOutput && parseAttempts.length > 0 ? <Panel title="Parse Attempts" eyebrow="Operator Trail">
            <div className="space-y-3">
              {parseAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className="rounded-2xl border border-white/8 bg-white/5 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium text-white">
                          {displayReplayFilename(attempt.originalFilename, null)}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-slate-300">
                          {attempt.detail || "No parser detail recorded."}
                        </div>
                      </div>
                      <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                        {parseStatusLabel(attempt.status)}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <Tag>{attempt.parseSource}</Tag>
                      {attempt.uploadMode ? <Tag>{attempt.uploadMode}</Tag> : null}
                      <Tag>{shortHash(attempt.replayHash)}</Tag>
                    </div>

                    <div className="mt-3 text-xs text-slate-400">
                      {attempt.createdAt.toLocaleString()}
                    </div>
                  </div>
                ))}
            </div>
          </Panel> : null}

          {showRawReplayOutput ? (
            <Panel title="Stored Player JSON" eyebrow="Raw Output">
              <JsonPanel title="Players JSON" value={game.players} />
            </Panel>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ReplayDetailViewToggle({
  activeView,
  gameId,
}: {
  activeView: ReplayDetailViewMode;
  gameId: number;
}) {
  const modes: Array<{ value: ReplayDetailViewMode; label: string; title: string }> = [
    { value: "basic", label: "B", title: "Basic" },
    { value: "advanced", label: "A", title: "Advanced" },
    { value: "extreme", label: "E", title: "Extreme" },
  ];

  return (
    <nav
      aria-label="Replay detail view"
      className="inline-flex rounded-full border border-white/10 bg-black/24 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      {modes.map((mode) => {
        const active = mode.value === activeView;
        const href =
          mode.value === "advanced"
            ? `/game-stats/${gameId}`
            : `/game-stats/${gameId}?view=${mode.value}`;

        return (
          <Link
            key={mode.value}
            href={href}
            title={mode.title}
            aria-current={active ? "page" : undefined}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold uppercase tracking-[0.16em] transition ${
              active
                ? "bg-sky-200 text-slate-950 shadow-[0_10px_24px_rgba(56,189,248,0.22)]"
                : "text-slate-400 hover:bg-white/8 hover:text-slate-100"
            }`}
          >
            {mode.label}
          </Link>
        );
      })}
    </nav>
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
    <section className="rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-4 sm:p-6">
      <div className="text-xs uppercase tracking-[0.35em] text-white/45">{eyebrow}</div>
      <h2 className="mt-2 text-2xl font-semibold text-white">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function JsonPanel({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{title}</div>
      <pre className="mt-3 overflow-x-auto rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-xs leading-6 text-slate-200">
        {stringifyJson(value)}
      </pre>
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

function StatRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "rounded-2xl border border-white/8 bg-white/5 px-4 py-4"}>
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 break-words text-sm leading-6 text-slate-200 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function PlayerMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 rounded-[1rem] border border-white/8 bg-slate-950/40 px-3 py-3">
      <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-5 text-slate-100 [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}

function RivalryHeroSide({
  name,
  wins,
  align,
  href,
}: {
  name: string;
  wins: number;
  align: "left" | "right";
  href?: string;
}) {
  const sideLabel = align === "left" ? "Left side" : "Right side";
  const winWord = wins === 1 ? "win" : "wins";
  const sideClassName = `group/rivalry block min-w-0 rounded-[1.5rem] border border-white/8 bg-white/5 px-4 py-4 text-left transition hover:border-sky-200/25 hover:bg-white/[0.075] hover:shadow-[0_16px_44px_rgba(56,189,248,0.08)] ${
    align === "right" ? "sm:text-right" : ""
  }`;

  const content = (
    <>
      <div className="text-[11px] uppercase tracking-[0.24em] text-slate-500">{sideLabel}</div>
      <div className="mt-2 break-words text-2xl font-semibold text-white transition group-hover/rivalry:text-sky-100">
        {name}
      </div>
      <div className="mt-3 text-sm text-slate-300">
        {wins} {winWord} in stored finals
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={sideClassName} title={`Open ${name} player page`}>
        {content}
      </Link>
    );
  }

  return <div className={sideClassName}>{content}</div>;
}


function renderAchievementGroup(group: ReplayAchievementGroup) {
  return (
    <div key={group.key}>
      <div className="text-xs uppercase tracking-[0.25em] text-slate-500">{group.label}</div>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {group.metrics.map((metric) => (
          <StatRow key={metric.key} label={metric.label} value={formatPrimitive(metric.value)} compact />
        ))}
      </dl>
    </div>
  );
}

function renderUploader(
  user:
    | {
        uid: string;
        inGameName: string | null;
        steamPersonaName: string | null;
        verificationLevel: number;
        verified: boolean;
        lastSeen: Date | null;
      }
    | null
) {
  if (!user) return "Battle contributor";
  const label = user.inGameName || user.steamPersonaName || user.uid;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <Link href={`/players/${user.uid}`} className="text-sky-200 transition hover:text-sky-100">
        {label}
      </Link>
      {user.verificationLevel > 0 ? <SteamLinkedBadge compact /> : null}
    </span>
  );
}

function formatPrimitive(value: unknown) {
  if (value === null || value === undefined || value === "") return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatRatingMetric(value: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "Unavailable";
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Unavailable";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return date.toLocaleString();
}

function formatPositionValue(value: unknown) {
  return Array.isArray(value) && value.length === 2 ? value.join(", ") : "Unavailable";
}

function humanizeKey(value: string) {
  return value.replace(/_/g, " ");
}
