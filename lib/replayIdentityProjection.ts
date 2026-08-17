import type { PrismaClient } from "./generated/prisma/index.js";

import {
  applyReplayAdjudicationToGameStats,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "./replayAdjudications.ts";
import {
  buildReplayNormalizedStatProjection,
  persistReplayNormalizedStatProjection,
  REPLAY_METRIC_DICTIONARY_VERSION,
  REPLAY_STAT_PROJECTION_POLICY_VERSION,
  REPLAY_STATS_SCHEMA_VERSION,
} from "./replayNormalizedStats.ts";
import { resolveReplayResultForPlayer } from "./replayPlayerResult.ts";
import { normalizeReplayPlayers } from "./teamResolution.ts";
import { invalidatePublicPlayerDirectoryCache } from "./publicPlayerDirectory.ts";
import { invalidateLobbyLeaderboardCache } from "./lobbyLeaderboard.ts";
import { invalidatePublicLeaderboardRawGameCache } from "./publicLeaderboardGameCorpus.ts";

export type ReplayIdentityRosterBlocker =
  | "canonical_roster_incomplete"
  | "canonical_roster_ambiguous";

export function classifyReplayIdentityRoster(rawPlayers: unknown) {
  const players = normalizeReplayPlayers(
    Array.isArray(rawPlayers) ? rawPlayers : []
  );
  const blocker: ReplayIdentityRosterBlocker | null =
    players.length < 2
      ? "canonical_roster_incomplete"
      : new Set(
            players.map((player) => player.stablePlayerKey)
          ).size !== players.length
        ? "canonical_roster_ambiguous"
        : null;

  return {
    players,
    blocker,
  };
}

export type ReplayIdentityProjectionReport = {
  requestedCount: number;
  createdCount: number;
  existingCount: number;
  skippedCount: number;
  outcomes: Array<{
    gameStatsId: number;
    outcome: "created" | "existing" | "skipped";
    detail: string;
    projectionId: number | null;
  }>;
};

export type ReplayIdentityProjectionRefreshReason =
  | "source_identity_changed"
  | "source_hash_changed"
  | "result_eligibility_changed"
  | "winning_players_changed";

export function replayIdentityProjectionRefreshReason(input: {
  current: {
    sourceIdentity: string;
    sourceHash: string;
    resultEligibility: string;
    playerSnapshots: Array<{
      playerKey: string;
      resultStatus: string;
    }>;
  };
  intended: {
    sourceIdentity: string;
    sourceHash: string;
    resultEligibility: "resolved" | "unresolved";
    winningPlayerKeys: string[];
  };
}): ReplayIdentityProjectionRefreshReason | null {
  if (input.current.sourceIdentity !== input.intended.sourceIdentity) {
    return "source_identity_changed";
  }
  if (input.current.sourceHash !== input.intended.sourceHash) {
    return "source_hash_changed";
  }
  if (input.current.resultEligibility !== input.intended.resultEligibility) {
    return "result_eligibility_changed";
  }
  if (input.intended.resultEligibility !== "resolved") return null;

  const currentWinners = input.current.playerSnapshots
    .filter((snapshot) => snapshot.resultStatus === "win")
    .map((snapshot) => snapshot.playerKey)
    .sort((left, right) => left.localeCompare(right));
  const intendedWinners = [...input.intended.winningPlayerKeys].sort(
    (left, right) => left.localeCompare(right)
  );

  return currentWinners.length === intendedWinners.length &&
    currentWinners.every((winner, index) => winner === intendedWinners[index])
    ? null
    : "winning_players_changed";
}

function positiveGameIds(values: readonly (string | number | null | undefined)[]) {
  return [
    ...new Set(
      values
        .map((value) => Number(value))
        .filter(
          (value): value is number =>
            Number.isSafeInteger(value) && value > 0
        )
    ),
  ].sort((left, right) => left - right);
}

function resultProjection(game: {
  players: unknown;
  [key: string]: unknown;
}) {
  const players = normalizeReplayPlayers(
    Array.isArray(game.players) ? game.players : []
  );
  const results = players.map((player) => ({
    playerKey: player.stablePlayerKey,
    result: resolveReplayResultForPlayer(
      game,
      (candidate) => candidate.stablePlayerKey === player.stablePlayerKey
    ),
  }));
  const resolved =
    results.length >= 2 &&
    results.every((entry) => entry.result !== "unknown") &&
    results.some((entry) => entry.result === "win") &&
    results.some((entry) => entry.result === "loss");

  return {
    resultEligibility: resolved ? ("resolved" as const) : ("unresolved" as const),
    winningPlayerKeys: resolved
      ? results
          .filter((entry) => entry.result === "win")
          .map((entry) => entry.playerKey)
      : [],
  };
}

export async function ensureReplayIdentityProjections(
  prisma: PrismaClient,
  rawGameStatsIds: readonly (string | number | null | undefined)[]
): Promise<ReplayIdentityProjectionReport> {
  const gameStatsIds = positiveGameIds(rawGameStatsIds);
  const report: ReplayIdentityProjectionReport = {
    requestedCount: gameStatsIds.length,
    createdCount: 0,
    existingCount: 0,
    skippedCount: 0,
    outcomes: [],
  };

  if (gameStatsIds.length === 0) return report;

  const games = await prisma.gameStats.findMany({
    where: {
      id: { in: gameStatsIds },
      is_final: true,
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      replayHash: true,
      replay_file: true,
      parse_iteration: true,
      parse_source: true,
      parse_reason: true,
      duration: true,
      game_duration: true,
      winner: true,
      players: true,
      key_events: true,
      event_types: true,
      is_final: true,
      disconnect_detected: true,
      replayResultAdjudications:
        EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      replayParseRuns: {
        where: { status: "completed" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          parserName: true,
          parserVersion: true,
          passName: true,
          passVersion: true,
          schemaVersion: true,
          candidateOutputHash: true,
          runIdentityHash: true,
          observations: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
              id: true,
              parseRunId: true,
              fieldPath: true,
              value: true,
              confidenceBps: true,
              provenance: true,
              createdAt: true,
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
          sourceIdentity: true,
          sourceHash: true,
          projectionHash: true,
          resultEligibility: true,
          playerSnapshots: {
            orderBy: { id: "asc" },
            select: {
              playerKey: true,
              resultStatus: true,
            },
          },
        },
      },
    },
  });

  for (const game of games) {
    const current = game.replayStatProjections[0] ?? null;
    const parseRun = game.replayParseRuns[0] ?? null;
    const sourceIdentity = parseRun
      ? `parse-run:${parseRun.runIdentityHash}`
      : `game-stats:${game.id}:${game.parse_iteration}`;
    const sourceHash = parseRun?.candidateOutputHash ?? game.replayHash;
    const effectiveGame = applyReplayAdjudicationToGameStats(game);
    const result = resultProjection(effectiveGame);
    const refreshReason = current
      ? replayIdentityProjectionRefreshReason({
          current,
          intended: {
            sourceIdentity,
            sourceHash,
            resultEligibility: result.resultEligibility,
            winningPlayerKeys: result.winningPlayerKeys,
          },
        })
      : null;

    if (current && refreshReason === null) {
      report.existingCount += 1;
      report.outcomes.push({
        gameStatsId: game.id,
        outcome: "existing",
        detail: "accepted_public_projection_exists",
        projectionId: current.id,
      });
      continue;
    }

    const roster = classifyReplayIdentityRoster(
      effectiveGame.players
    );
    const players = roster.players;

    if (roster.blocker) {
      if (current) {
        report.existingCount += 1;
      } else {
        report.skippedCount += 1;
      }
      report.outcomes.push({
        gameStatsId: game.id,
        outcome: current ? "existing" : "skipped",
        detail: current
          ? `accepted_public_projection_preserved:${roster.blocker}`
          : roster.blocker,
        projectionId: current?.id ?? null,
      });
      continue;
    }

    const steamIds = [
      ...new Set(
        players
          .map((player) => player.steamId)
          .filter((steamId): steamId is string => Boolean(steamId))
      ),
    ];
    const linkedUsers =
      steamIds.length > 0
        ? await prisma.user.findMany({
            where: { steamId: { in: steamIds } },
            select: { id: true, steamId: true },
          })
        : [];
    const userIdBySteamId = new Map<string, number>();
    for (const user of linkedUsers) {
      if (user.steamId) {
        userIdBySteamId.set(user.steamId, user.id);
      }
    }
    const userIdByPlayerKey: Record<string, number | null> = {};
    for (const player of players) {
      if (!player.steamId) continue;
      userIdByPlayerKey[player.stablePlayerKey] =
        userIdBySteamId.get(player.steamId) ?? null;
    }

    const projection = buildReplayNormalizedStatProjection({
      gameStatsId: game.id,
      replayHash: game.replayHash,
      parseRunId: parseRun?.id,
      supersedesId: current?.id,
      projectedByUidSnapshot: "system:replay-post-ingest",
      sourceKind: parseRun ? "parse_run" : "game_stats",
      sourceIdentity,
      sourceHash,
      parserName: parseRun?.parserName,
      parserVersion: parseRun?.parserVersion,
      passName: parseRun?.passName,
      passVersion: parseRun?.passVersion,
      schemaVersion: REPLAY_STATS_SCHEMA_VERSION,
      metricDictionaryVersion: REPLAY_METRIC_DICTIONARY_VERSION,
      projectionPolicyVersion: REPLAY_STAT_PROJECTION_POLICY_VERSION,
      projectionStatus: "accepted",
      affectsPublicAggregates: true,
      statEligibility: "eligible",
      resultEligibility: result.resultEligibility,
      resultEligibilityReason:
        result.resultEligibility === "resolved"
          ? "effective_replay_result"
          : "result_not_required_for_identity_projection",
      winningPlayerKeys: result.winningPlayerKeys,
      userIdByPlayerKey,
      players: effectiveGame.players,
      keyEvents: effectiveGame.key_events,
      durationSeconds: effectiveGame.duration ?? effectiveGame.game_duration,
      observations: parseRun?.observations,
      provenance: {
        command: "automatic-replay-identity-projection",
        replay_file: game.replay_file,
        parse_source: effectiveGame.parse_source,
        parse_reason: effectiveGame.parse_reason,
        source_parser_schema_version: parseRun?.schemaVersion ?? null,
        identity_policy: "latest-steam-name-folding-v1",
        supersedes_projection_id: current?.id ?? null,
        refresh_reason: refreshReason,
      },
    });
    const persisted = await persistReplayNormalizedStatProjection(
      prisma,
      projection
    );

    if (persisted.outcome === "created") {
      report.createdCount += 1;
    } else {
      report.existingCount += 1;
    }
    report.outcomes.push({
      gameStatsId: game.id,
      outcome: persisted.outcome,
      detail: sourceIdentity,
      projectionId: persisted.projectionId,
    });
  }

  const missingGameIds = gameStatsIds.filter(
    (gameStatsId) => !games.some((game) => game.id === gameStatsId)
  );
  for (const gameStatsId of missingGameIds) {
    report.skippedCount += 1;
    report.outcomes.push({
      gameStatsId,
      outcome: "skipped",
      detail: "final_game_not_found",
      projectionId: null,
    });
  }

  if (report.createdCount > 0) {
    invalidatePublicLeaderboardRawGameCache();
    invalidatePublicPlayerDirectoryCache();
    invalidateLobbyLeaderboardCache();
  }

  return report;
}
