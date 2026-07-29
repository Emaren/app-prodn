import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import type {
  ComponentProps,
  ReactNode,
} from "react";

import FounderBonusChips from "@/components/bets/FounderBonusChips";
import ConfirmedDesyncBanner from "@/components/game-stats/ConfirmedDesyncBanner";
import ReplayVerdictTrail from "@/components/game-stats/ReplayVerdictTrail";
import ReviewReplayResultButton from "@/components/game-stats/ReviewReplayResultButton";
import {
  currentConfirmedDesync,
  type ReplayDesyncIncidentView,
} from "@/components/game-stats/desyncIncidentView";
import SteamLinkedBadge from "@/components/SteamLinkedBadge";
import TimeDisplayText from "@/components/time/TimeDisplayText";
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
import { canShowReplayParserDiagnostics } from "@/lib/replayDiagnosticsVisibility";
import {
  buildMatchupHref,
  buildPlayerPairRivalryContext,
  buildTeamMatchupHref,
  loadRecentFinalMatchupRows,
  PUBLIC_MATCHUP_SCAN_LIMIT,
} from "@/lib/publicMatchups";
import { getPrisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";
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
import { loadReplayDesyncIncidentProvenance } from "@/lib/replayDesyncIncidents";
import { normalizeReplayPlayer } from "@/lib/teamResolution";

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
      replayStatProjections: {
        where: {
          projectionStatus: "accepted",
          affectsPublicAggregates: true,
          supersededBy: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          schemaVersion: true,
          metricDictionaryVersion: true,
          parserName: true,
          parserVersion: true,
          passName: true,
          passVersion: true,
          statEligibility: true,
          resultEligibility: true,
          playerMetricCount: true,
          gameMetricCount: true,
          createdAt: true,
          playerSnapshots: {
            where: { statEligible: true },
            orderBy: [{ playerSlot: "asc" }, { id: "asc" }],
            select: {
              playerKey: true,
              displayName: true,
              normalizedName: true,
              playerSlot: true,
              teamKey: true,
              civilizationName: true,
              resultEligible: true,
              resultStatus: true,
              metrics: {
                where: {
                  statEligible: true,
                  exact: true,
                },
                orderBy: [
                  { metricGroup: "asc" },
                  { metricKey: "asc" },
                ],
                select: {
                  metricKey: true,
                  metricGroup: true,
                  numericValue: true,
                  textValue: true,
                  booleanValue: true,
                  unit: true,
                  sourceKind: true,
                  sourcePath: true,
                  confidenceBps: true,
                },
              },
            },
          },
          gameMetrics: {
            where: {
              statEligible: true,
              exact: true,
            },
            orderBy: [
              { metricGroup: "asc" },
              { metricKey: "asc" },
            ],
            select: {
              metricKey: true,
              metricGroup: true,
              numericValue: true,
              textValue: true,
              booleanValue: true,
              unit: true,
              sourceKind: true,
              sourcePath: true,
              confidenceBps: true,
            },
          },
        },
      },
    },
  });

  if (!rawGame) {
    notFound();
  }

  const cookieStore = await cookies();
  const claims = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  const viewer = claims?.uid
    ? await prisma.user.findUnique({
        where: { uid: claims.uid },
        select: { isAdmin: true },
      })
    : null;
  const showAdminDiagnostics = canShowReplayParserDiagnostics(
    detailView,
    Boolean(viewer?.isAdmin)
  );

  const game = applyReplayAdjudicationToGameStats(rawGame);
  const normalizedStatsProjection =
    rawGame.replayStatProjections[0] ?? null;

  const replayResultEvidence =
    (game as Record<string, unknown>).replayResultAdjudication;

  const reviewedResult =
    replayResultEvidence &&
    typeof replayResultEvidence === "object" &&
    !Array.isArray(replayResultEvidence)
      ? (replayResultEvidence as Record<string, unknown>)
      : null;

  const reviewedResultVerified = Boolean(reviewedResult);

  const reviewedBy =
    typeof reviewedResult?.adjudicated_by === "string"
      ? reviewedResult.adjudicated_by.trim()
      : "";

  const reviewedAt =
    typeof reviewedResult?.created_at === "string"
      ? reviewedResult.created_at
      : null;

  const reviewedReason =
    typeof reviewedResult?.reason === "string"
      ? reviewedResult.reason.trim()
      : "";

  const verdictHistory = reviewedResultVerified
    ? await prisma.replayResultAdjudication.findMany({
        where: {
          gameStatsId: game.id,
          decisionStatus: "accepted",
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: {
          id: true,
          decisionStatus: true,
          actorDisplayNameSnapshot: true,
          actorRole: true,
          teamAssignments: true,
          winningTeamKey: true,
          reason: true,
          createdAt: true,
        },
      })
    : [];

  const verdictTrailAdjudications =
    verdictHistory.map((entry) => ({
      id:
        entry.id,

      decisionStatus:
        entry.decisionStatus,

      actorDisplayNameSnapshot:
        entry.actorDisplayNameSnapshot,

      actorRole:
        entry.actorRole,

      teamAssignments:
        entry.teamAssignments,

      winningTeamKey:
        entry.winningTeamKey,

      reason:
        entry.reason,

      createdAt:
        entry.createdAt.toISOString(),
    })) as ComponentProps<
      typeof ReplayVerdictTrail
    >["adjudications"];

  const desyncProvenance = await loadReplayDesyncIncidentProvenance(
    prisma,
    game.id
  );
  const verdictTrailDesyncIncidents = desyncProvenance.desyncIncidents.map(
    (incident) => ({
      ...incident,
      competitiveResultStatus:
        incident.competitiveResultStatus as ReplayDesyncIncidentView["competitiveResultStatus"],
      settlementDisposition:
        incident.settlementDisposition as ReplayDesyncIncidentView["settlementDisposition"],
      machineEvidence:
        incident.machineEvidence as ReplayDesyncIncidentView["machineEvidence"],
      createdAt: incident.createdAt.toISOString(),
    })
  );
  const confirmedDesync = currentConfirmedDesync(verdictTrailDesyncIncidents);

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
      ? await loadRecentFinalMatchupRows(
          prisma,
          PUBLIC_MATCHUP_SCAN_LIMIT
        )
      : [];
  const rivalrySummary =
    playerRefs.length === 2
      ? buildPlayerPairRivalryContext(
          rivalryCandidates,
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
  const outcomeLabel = !confirmedDesync && reliableWinner
    ? outcomeBadgeLabel(game.parse_reason, game.winner)
    : null;
  const winningPlayerNames = players
    .filter((player) => player.winner === true || player.winner === "true" || player.winner === 1)
    .map((player) => displayPlayerName(player));
  const publicWinnerLabel =
    confirmedDesync
      ? null
      : winningPlayerNames.length > 0
        ? winningPlayerNames.join(" / ")
        : reliableWinner;
  const replayFilename = displayReplayFilename(
    game.original_filename,
    game.replay_file
  );
  const isSavedCheckpoint = replayFilename
    .toLowerCase()
    .endsWith(".aoe2mpgame");
  const unresolvedBattleLabel = confirmedDesync
    ? "Desynced · result unresolved"
    : isSavedCheckpoint
      ? "Saved checkpoint · not final proof"
      : game.is_final
        ? "Result under review"
        : "Battle capture · result not final";
  const suppressPlayerWinnerState =
    Boolean(confirmedDesync) ||
    game.parse_reason === "hd_early_exit_under_60s" ||
    !reliableWinner;
  const rivalryMatchCountLabel = rivalrySummary
    ? rivalrySummary.totalMatches === 1
      ? "1 replay-backed meeting"
      : `${rivalrySummary.totalMatches} replay-backed meetings`
    : null;
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
              <Tag>
                {confirmedDesync
                  ? "DESYNCED · result unresolved"
                  : publicWinnerLabel
                    ? `${publicWinnerLabel} victorious`
                    : unresolvedBattleLabel}
              </Tag>
              {reviewedResultVerified && !confirmedDesync ? (
                <Tag>
                  Reviewed Result{reviewedBy ? ` · ${reviewedBy}` : ""}
                </Tag>
              ) : reviewedResultVerified ? (
                <Tag>Prior result preserved in provenance</Tag>
              ) : null}
              <Tag>HD replay</Tag>
              <Tag>
                {isSavedCheckpoint
                  ? "saved checkpoint"
                  : game.is_final
                    ? "final replay"
                    : "battle capture"}
              </Tag>
              {outcomeLabel ? <Tag>{outcomeLabel}</Tag> : null}
            </div>
            <FounderBonusChips bonuses={founderBonuses} />

            {reviewedResultVerified && !confirmedDesync ? (
              <details
                className="hidden group rounded-[1.5rem] border border-amber-200/15 bg-[linear-gradient(135deg,rgba(251,191,36,0.07),rgba(255,255,255,0.018))] [&>summary::-webkit-details-marker]:hidden"
                data-reviewed-result-provenance
              >
                <summary className="flex min-h-[3.25rem] cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 select-none sm:px-5">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-white/45">
                    Verdict Trail
                  </div>

                  <div className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-slate-500">
                    <span>Human confirmed</span>
                    <span className="text-white/20">·</span>
                    <span>
                      {verdictHistory.length} {verdictHistory.length === 1 ? "entry" : "entries"}
                    </span>
                    <span
                      aria-hidden="true"
                      className="ml-1 text-sm leading-none text-slate-500 transition-transform duration-200 group-open:rotate-90"
                    >
                      ›
                    </span>
                  </div>
                </summary>

                <div className="border-t border-white/8 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.32em] text-amber-200/65">
                      Reviewed Result
                    </div>
                    <div className="mt-2 break-words text-lg font-semibold text-amber-50 sm:text-xl">
                      {publicWinnerLabel
                        ? `${publicWinnerLabel} victorious`
                        : "Battle result verified"}
                    </div>
                  </div>

                  <Tag>
                    {reviewedBy
                      ? `Verified by ${reviewedBy}`
                      : "Verified result"}
                  </Tag>
                </div>

                <div className="mt-3 text-sm leading-6 text-slate-300">
                  Result verified
                  {reviewedBy ? (
                    <>
                      {" "}by{" "}
                      <span className="font-semibold text-slate-100">
                        {reviewedBy}
                      </span>
                    </>
                  ) : null}
                  {reviewedAt ? (
                    <> · <TimeDisplayText value={reviewedAt} includeYear /></>
                  ) : null}
                </div>

                {reviewedReason ? (
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    {reviewedReason}
                  </p>
                ) : null}

                {verdictHistory.length > 0 ? (
                  <div className="mt-5 border-t border-white/8 pt-4">
                    <div className="text-[11px] uppercase tracking-[0.28em] text-white/40">
                      Verdict History ({verdictHistory.length})
                    </div>

                    <div className="mt-3 space-y-2">
                      {verdictHistory.map((entry, index) => {
                        const winningTeamLabel =
                          readAdjudicationWinningTeamLabel(
                            entry.teamAssignments,
                            entry.winningTeamKey
                          );

                        return (
                          <div
                            key={entry.id}
                            className="rounded-xl border border-white/8 bg-black/15 px-3 py-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-medium text-slate-100">
                                #{entry.id} · {entry.actorDisplayNameSnapshot}
                              </div>

                              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                {index === 0
                                  ? "Current Verdict"
                                  : "Prior Verdict"}
                              </div>
                            </div>

                            {winningTeamLabel ? (
                              <div className="mt-2 text-sm text-amber-100/90">
                                {winningTeamLabel} victorious
                              </div>
                            ) : null}

                            <p className="mt-1 text-xs leading-5 text-slate-400">
                              {entry.reason}
                            </p>

                            <div className="mt-2 text-[10px] text-slate-600">
                              <TimeDisplayText value={entry.createdAt} includeYear />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                              </div>
              </details>
            ) : null}
          </div>

          {confirmedDesync ? (
            <ConfirmedDesyncBanner incident={confirmedDesync} />
          ) : null}

          <div className="flex flex-wrap gap-3">
            {viewer?.isAdmin ? (
              <ReviewReplayResultButton
                gameStatsId={game.id}
                submitterUids={resultReviewSubmitterUids}
              />
            ) : (
              <Link
                href={`/game-stats/${game.id}/review`}
                className="w-full rounded-full border border-cyan-200/20 bg-cyan-300/[0.06] px-5 py-3 text-center text-sm font-semibold text-cyan-50/85 transition hover:border-cyan-200/35 hover:bg-cyan-300/[0.1] sm:w-auto"
              >
                Open Verdict Trail
              </Link>
            )}
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
                <Tag>
                  Last played{" "}
                  {rivalrySummary.lastPlayedAt ? (
                    <TimeDisplayText value={rivalrySummary.lastPlayedAt} />
                  ) : (
                    "waiting for the first stored clash"
                  )}
                </Tag>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="min-w-0">
        <ReplayVerdictTrail
          gameStatsId={game.id}
          isAdmin={false}
          adjudications={verdictTrailAdjudications}
          desyncIncidents={verdictTrailDesyncIncidents}
        />
      </section>

      <section className={detailGridClassName}>
        <div className="space-y-6">
          <Panel title="Replay Summary" eyebrow="Overview">
            <dl className={summaryGridClassName}>
              <StatRow label="Replay ID" value={`#${game.id}`} />
              {confirmedDesync ? (
                <StatRow
                  label="Competitive Result"
                  value="Unresolved — human-confirmed desync"
                />
              ) : publicWinnerLabel ? (
                <StatRow label="Winner" value={publicWinnerLabel} />
              ) : (
                <StatRow label="Result Status" value={unresolvedBattleLabel} />
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
              {playedAt ? <StatRow label="Played On" value={<TimeDisplayText value={playedAt} includeYear />} /> : null}
              <StatRow label="Recorded At" value={<TimeDisplayText value={game.createdAt} includeYear />} />
              {game.user ? <StatRow label="Uploader" value={renderUploader(game.user)} /> : null}
              {keyEventRecord.lobby_name ? <StatRow label="Lobby Name" value={formatPrimitive(keyEventRecord.lobby_name)} /> : null}
              <StatRow
                label="Replay File"
                value={displayReplayFilename(game.original_filename, game.replay_file)}
              />
              <StatRow label="Replay Hash" value={shortHash(game.replayHash, 20)} />
              {normalizedStatsProjection ? (
                <StatRow
                  label="Deep Stat Vault"
                  value={`${normalizedStatsProjection.playerMetricCount} player · ${normalizedStatsProjection.gameMetricCount} game metrics`}
                />
              ) : null}
              {normalizedStatsProjection ? (
                <StatRow
                  label="Stat / Result Eligibility"
                  value={`${normalizedStatsProjection.statEligibility} / ${normalizedStatsProjection.resultEligibility}`}
                />
              ) : null}
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
                  const canonicalPlayer = normalizeReplayPlayer(player);
                  const normalizedPlayerSnapshots =
                    normalizedStatsProjection?.playerSnapshots ?? [];
                  const stableKeyMatch = canonicalPlayer
                    ? normalizedPlayerSnapshots.find(
                        (snapshot) =>
                          snapshot.playerKey ===
                          canonicalPlayer.stablePlayerKey
                      ) ?? null
                    : null;
                  const slotMatches =
                    canonicalPlayer?.playerNumber === null ||
                    canonicalPlayer?.playerNumber === undefined
                      ? []
                      : normalizedPlayerSnapshots.filter(
                          (snapshot) =>
                            snapshot.playerSlot ===
                            canonicalPlayer.playerNumber
                        );
                  const nameMatches = canonicalPlayer
                    ? normalizedPlayerSnapshots.filter(
                        (snapshot) =>
                          snapshot.normalizedName ===
                          canonicalPlayer.normalizedName
                      )
                    : [];
                  const normalizedPlayerSnapshot =
                    stableKeyMatch ??
                    (slotMatches.length === 1
                      ? slotMatches[0]
                      : nameMatches.length === 1
                        ? nameMatches[0]
                        : null);
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
                        {hasEapm ? (
                          <PlayerMetric
                            label="Recorded packets / min"
                            value={`${formatPrimitive(player.eapm)} · diagnostic`}
                          />
                        ) : null}
                        {hasPosition ? <PlayerMetric
                          label="Starting Position"
                          value={formatPositionValue(player.position)}
                        /> : null}
                        {hasScore ? <PlayerMetric label="Score" value={formatPrimitive(player.score)} /> : null}
                      </dl> : null}

                      <div className="mt-5 space-y-4">
                        {normalizedPlayerSnapshot &&
                        normalizedPlayerSnapshot.metrics.length > 0 ? (
                          <NormalizedReplayMetricGroups
                            metrics={normalizedPlayerSnapshot.metrics}
                          />
                        ) : (
                          getReplayAchievementGroups(player).map((group) =>
                            renderAchievementGroup(group)
                          )
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
          {normalizedStatsProjection ? (
            <Panel
              title="Normalized Stat Receipt"
              eyebrow="Exact Replay Evidence"
            >
              <div className="rounded-2xl border border-emerald-300/14 bg-emerald-400/[0.05] px-4 py-4 text-xs leading-5 text-emerald-50/80">
                Accepted statistics are versioned independently from the battle
                verdict. This receipt cannot decide a winner, settle a bet, or
                authorize a chain transfer.
              </div>
              {normalizedStatsProjection.gameMetrics.length > 0 ? (
                <div className="mt-4">
                  <NormalizedReplayMetricGroups
                    metrics={normalizedStatsProjection.gameMetrics}
                  />
                </div>
              ) : null}
              <dl className="mt-4 grid gap-3">
                <StatRow
                  label="Schema"
                  value={normalizedStatsProjection.schemaVersion}
                  compact
                />
                <StatRow
                  label="Metric Dictionary"
                  value={normalizedStatsProjection.metricDictionaryVersion}
                  compact
                />
                <StatRow
                  label="Parser Pass"
                  value={[
                    normalizedStatsProjection.parserName,
                    normalizedStatsProjection.parserVersion,
                    normalizedStatsProjection.passName,
                    normalizedStatsProjection.passVersion,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Legacy exact projection"}
                  compact
                />
              </dl>
            </Panel>
          ) : null}

          {(publicSettingsEntries.length > 0 || showAdminDiagnostics) ? <Panel
            title={showAdminDiagnostics ? "Parse Signals" : "Battle Settings"}
            eyebrow={showAdminDiagnostics ? "Admin Diagnostics" : "Match Setup"}
          >
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

              {showAdminDiagnostics && eventTypes.length > 0 ? <div>
                <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Event Types</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {eventTypes.map((eventType) => <Tag key={String(eventType)}>{String(eventType)}</Tag>)}
                </div>
              </div> : null}

              {showAdminDiagnostics ? (
                <>
                  <JsonPanel title="Key Events JSON" value={publicKeyEvents} />
                  <JsonPanel title="Map JSON" value={game.map} />
                </>
              ) : null}
            </div>
          </Panel> : null}

          {showAdminDiagnostics && parseAttempts.length > 0 ? <Panel title="Parse Attempts" eyebrow="Operator Trail">
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
                      <TimeDisplayText value={attempt.createdAt} includeYear />
                    </div>
                  </div>
                ))}
            </div>
          </Panel> : null}

          {showAdminDiagnostics ? (
            <Panel title="Stored Player JSON" eyebrow="Raw Output">
              <JsonPanel title="Players JSON" value={game.players} />
            </Panel>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function readAdjudicationWinningTeamLabel(
  teamAssignments: unknown,
  winningTeamKey: string
) {
  if (!Array.isArray(teamAssignments)) return null;

  const winningTeam = teamAssignments.find((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry)
    ) {
      return false;
    }

    return (
      String(
        (entry as Record<string, unknown>).teamKey || ""
      ) === winningTeamKey
    );
  });

  if (
    !winningTeam ||
    typeof winningTeam !== "object" ||
    Array.isArray(winningTeam)
  ) {
    return null;
  }

  const rawPlayers =
    (winningTeam as Record<string, unknown>).players;

  if (!Array.isArray(rawPlayers)) return null;

  const names = rawPlayers
    .map((player) => {
      if (
        !player ||
        typeof player !== "object" ||
        Array.isArray(player)
      ) {
        return "";
      }

      const name =
        (player as Record<string, unknown>).name;

      return typeof name === "string"
        ? name.trim()
        : "";
    })
    .filter(Boolean);

  return names.length > 0
    ? names.join(" / ")
    : null;
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

type NormalizedReplayMetricRow = {
  metricKey: string;
  metricGroup: string;
  numericValue:
    | number
    | string
    | { toString(): string }
    | null;
  textValue: string | null;
  booleanValue: boolean | null;
  unit: string;
  sourceKind: string;
  sourcePath: string;
  confidenceBps: number | null;
};

function normalizedReplayMetricLabel(metric: NormalizedReplayMetricRow) {
  const localKey = metric.metricKey.startsWith(`${metric.metricGroup}.`)
    ? metric.metricKey.slice(metric.metricGroup.length + 1)
    : metric.metricKey;
  return localKey
    .replaceAll(".", " · ")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizedReplayMetricValue(metric: NormalizedReplayMetricRow) {
  if (metric.numericValue !== null) {
    const numeric = Number(metric.numericValue);
    if (Number.isFinite(numeric)) {
      if (metric.unit === "seconds") {
        return formatDurationLabel(Math.max(0, Math.round(numeric)));
      }
      if (metric.unit === "milliseconds") {
        return formatDurationLabel(
          Math.max(0, Math.round(numeric / 1000))
        );
      }
      if (metric.unit === "percent") {
        return `${numeric.toLocaleString(undefined, {
          maximumFractionDigits: 1,
        })}%`;
      }
      return numeric.toLocaleString(undefined, {
        maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
      });
    }
  }
  if (metric.textValue) return metric.textValue;
  if (metric.booleanValue !== null) {
    return metric.booleanValue ? "Yes" : "No";
  }
  return "Unavailable";
}

function NormalizedReplayMetricGroups({
  metrics,
}: {
  metrics: NormalizedReplayMetricRow[];
}) {
  const groups = [
    ...new Set(metrics.map((metric) => metric.metricGroup)),
  ];
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group}>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-100/55">
              {group}
            </div>
            <div className="text-[9px] uppercase tracking-[0.15em] text-slate-600">
              exact
            </div>
          </div>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {metrics
              .filter((metric) => metric.metricGroup === group)
              .map((metric) => (
                <div
                  key={metric.metricKey}
                  className="min-w-0 rounded-[0.9rem] border border-white/[0.065] bg-slate-950/35 px-3 py-3"
                  title={`${metric.sourceKind}: ${metric.sourcePath}`}
                >
                  <dt className="text-[9px] uppercase tracking-[0.13em] text-slate-500">
                    {normalizedReplayMetricLabel(metric)}
                  </dt>
                  <dd className="mt-1 break-words text-sm font-semibold text-slate-100">
                    {normalizedReplayMetricValue(metric)}
                  </dd>
                  <div className="mt-1 truncate text-[9px] text-slate-700">
                    {metric.sourcePath}
                    {metric.confidenceBps !== null
                      ? ` · ${Math.round(metric.confidenceBps / 100)}%`
                      : ""}
                  </div>
                </div>
              ))}
          </dl>
        </section>
      ))}
    </div>
  );
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

function formatPositionValue(value: unknown) {
  return Array.isArray(value) && value.length === 2 ? value.join(", ") : "Unavailable";
}

function humanizeKey(value: string) {
  return value.replace(/_/g, " ");
}
