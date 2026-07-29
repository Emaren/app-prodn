import "dotenv/config";

import { Prisma } from "@/lib/generated/prisma";
import { getPrisma } from "@/lib/prisma";
import {
  buildReplayNormalizedStatProjection,
  persistReplayNormalizedStatProjection,
  ReplayNormalizedStatsError,
  REPLAY_METRIC_DICTIONARY_VERSION,
  REPLAY_STAT_PROJECTION_POLICY_VERSION,
  REPLAY_STATS_SCHEMA_VERSION,
} from "@/lib/replayNormalizedStats";
import {
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import {
  resolveReplayResultForPlayer,
} from "@/lib/replayPlayerResult";
import {
  normalizeReplayPlayers,
} from "@/lib/teamResolution";

type Mode = "plan" | "candidate" | "accept";

const ACCEPT_CONFIRMATION = "ACCEPT-EXACT-REPLAY-STATS";
const INFERRED_RESULT_REPAIR_CONFIRMATION =
  "REPAIR-INFERRED-RESULT-PROJECTIONS";
const REJECTED_INFERRED_RESULT_REASON =
  "watcher_inferred_opponent_win_on_incomplete_1v1";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function integerArgument(name: string, fallback: number) {
  const raw = argument(name);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  return parsed;
}

function modeArgument(): Mode {
  const value = argument("--mode") ?? "plan";
  if (value === "plan" || value === "candidate" || value === "accept") {
    return value;
  }
  throw new Error("--mode must be plan, candidate, or accept.");
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

async function main() {
  const prisma = getPrisma();
  const mode = modeArgument();
  const repairInferredResults =
    process.argv.includes(
      "--repair-inferred-results"
    );
  const gameId = integerArgument("--game-id", 0);
  const afterId = integerArgument("--after-id", 0);
  const limit = Math.min(Math.max(integerArgument("--limit", 25), 1), 500);
  const allowCoverageRegression = process.argv.includes(
    "--allow-coverage-regression"
  );
  const operatorUid = argument("--operator-uid");
  if (
    repairInferredResults &&
    mode === "candidate"
  ) {
    throw new Error(
      "--repair-inferred-results supports only plan or accept mode."
    );
  }
  const requiredConfirmation =
    repairInferredResults
      ? INFERRED_RESULT_REPAIR_CONFIRMATION
      : ACCEPT_CONFIRMATION;
  if (
    mode === "accept" &&
    argument("--confirm") !==
      requiredConfirmation
  ) {
    throw new Error(
      `Accept mode requires --confirm ${requiredConfirmation}.`
    );
  }
  if (
    (
      mode === "accept" ||
      repairInferredResults
    ) &&
    !operatorUid
  ) {
    throw new Error(
      `${
        repairInferredResults
          ? "Inferred-result repair"
          : "Accept mode"
      } requires --operator-uid for audit attribution.`
    );
  }
  const operator = operatorUid
    ? await prisma.user.findUnique({
        where: { uid: operatorUid },
        select: { id: true, uid: true, isAdmin: true },
      })
    : null;
  if (
    (
      mode === "accept" ||
      repairInferredResults
    ) &&
    (!operator || !operator.isAdmin)
  ) {
    throw new Error(
      `${
        repairInferredResults
          ? "Inferred-result repair"
          : "Accept mode"
      } requires --operator-uid to name an existing site admin.`
    );
  }

  const acceptedProjectionShape =
    mode === "accept" ||
    repairInferredResults;

  const games = await prisma.gameStats.findMany({
    where: {
      id: gameId > 0 ? gameId : { gt: afterId },
      is_final: true,
      players: { not: Prisma.DbNull },
      ...(repairInferredResults
        ? {
            parse_reason:
              REJECTED_INFERRED_RESULT_REASON,
            replayStatProjections: {
              some: {
                projectionStatus:
                  "accepted",
                affectsPublicAggregates:
                  true,
                resultEligibility:
                  "resolved",
                supersededBy:
                  null,
              },
            },
          }
        : {}),
    },
    orderBy: { id: "asc" },
    take: gameId > 0 ? 1 : limit,
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
          resultEligibility:
            repairInferredResults
              ? "resolved"
              : undefined,
          supersededBy: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: {
          id: true,
          sourceIdentity: true,
          projectionHash: true,
          resultEligibility: true,
          playerMetricCount: true,
          gameMetricCount: true,
          createdAt: true,
        },
      },
    },
  });
  const normalizedPlayersByGame = new Map(
    games.map((game) => [
      game.id,
      normalizeReplayPlayers(
        Array.isArray(game.players) ? game.players : []
      ),
    ])
  );
  const replaySteamIds = [
    ...new Set(
      [...normalizedPlayersByGame.values()]
        .flat()
        .map((player) => player.steamId)
        .filter((steamId): steamId is string => Boolean(steamId))
    ),
  ];
  const linkedUsers =
    replaySteamIds.length > 0
      ? await prisma.user.findMany({
          where: { steamId: { in: replaySteamIds } },
          select: { id: true, steamId: true },
        })
      : [];
  const userIdBySteamId = new Map<string, number>();
  for (const user of linkedUsers) {
    if (user.steamId) userIdBySteamId.set(user.steamId, user.id);
  }

  const report: Array<Record<string, unknown>> = [];
  for (const game of games) {
    const parseRun = game.replayParseRuns[0] ?? null;
    const current = game.replayStatProjections[0] ?? null;
    const result = resultProjection(game);
    const sourceIdentity = parseRun
      ? `parse-run:${parseRun.runIdentityHash}`
      : `game-stats:${game.id}:${game.parse_iteration}`;
    const userIdByPlayerKey: Record<string, number | null> = {};
    for (const player of normalizedPlayersByGame.get(game.id) ?? []) {
      const linkedUserId = player.steamId
        ? userIdBySteamId.get(player.steamId)
        : null;
      if (linkedUserId) {
        userIdByPlayerKey[player.stablePlayerKey] = linkedUserId;
      }
    }
    let normalized:
      ReturnType<
        typeof buildReplayNormalizedStatProjection
      >;
    try {
      normalized = buildReplayNormalizedStatProjection({
        gameStatsId: game.id,
        replayHash: game.replayHash,
        parseRunId: parseRun?.id,
        supersedesId:
          acceptedProjectionShape
            ? current?.id
            : null,
        projectedByUserId:
          acceptedProjectionShape
            ? operator?.id
            : null,
        projectedByUidSnapshot:
          acceptedProjectionShape
            ? operator?.uid
            : null,
        sourceKind: parseRun ? "parse_run" : "game_stats",
        sourceIdentity,
        sourceHash: parseRun?.candidateOutputHash ?? game.replayHash,
        parserName: parseRun?.parserName,
        parserVersion: parseRun?.parserVersion,
        passName: parseRun?.passName,
        passVersion: parseRun?.passVersion,
        schemaVersion: REPLAY_STATS_SCHEMA_VERSION,
        metricDictionaryVersion: REPLAY_METRIC_DICTIONARY_VERSION,
        projectionPolicyVersion: REPLAY_STAT_PROJECTION_POLICY_VERSION,
        projectionStatus:
          acceptedProjectionShape
            ? "accepted"
            : "candidate",
        affectsPublicAggregates:
          acceptedProjectionShape,
        statEligibility: "eligible",
        resultEligibility: result.resultEligibility,
        resultEligibilityReason:
          result.resultEligibility === "resolved"
            ? "effective_replay_result"
            : "result_not_required_for_statistics",
        winningPlayerKeys: result.winningPlayerKeys,
        userIdByPlayerKey,
        players: game.players,
        keyEvents: game.key_events,
        durationSeconds: game.duration ?? game.game_duration,
        observations: parseRun?.observations,
        provenance: {
          command: "project-normalized-replay-stats",
          replay_file: game.replay_file,
          parse_source: game.parse_source,
          parse_reason: game.parse_reason,
          source_parser_schema_version: parseRun?.schemaVersion ?? null,
          ...(repairInferredResults
            ? {
                result_policy_repair:
                  true,
              }
            : {}),
        },
      });
    } catch (error) {
      if (!(error instanceof ReplayNormalizedStatsError)) {
        throw error;
      }
      report.push({
        gameStatsId: game.id,
        outcome: `skipped_${error.code}`,
        sourceIdentity,
        detail: error.message,
      });
      continue;
    }

    const totalMetricCount =
      normalized.receipt.playerMetricCount +
      normalized.receipt.gameMetricCount;
    if (totalMetricCount === 0) {
      report.push({
        gameStatsId: game.id,
        outcome: "skipped_no_metrics",
        sourceIdentity,
      });
      continue;
    }
    if (
      repairInferredResults &&
      normalized.receipt
        .resultEligibility !==
        "unresolved"
    ) {
      report.push({
        gameStatsId: game.id,
        outcome:
          "blocked_result_still_resolved",
        currentProjectionId:
          current?.id ?? null,
        currentResultEligibility:
          current
            ?.resultEligibility ??
          null,
        proposedResultEligibility:
          normalized.receipt
            .resultEligibility,
      });
      continue;
    }
    if (
      current &&
      current.sourceIdentity === sourceIdentity &&
      current.projectionHash === normalized.receipt.projectionHash
    ) {
      report.push({
        gameStatsId: game.id,
        outcome: "already_current",
        projectionId: current.id,
        sourceIdentity,
        projectionHash: current.projectionHash,
      });
      continue;
    }
    if (
      acceptedProjectionShape &&
      current &&
      !allowCoverageRegression &&
      (normalized.receipt.playerMetricCount < current.playerMetricCount ||
        normalized.receipt.gameMetricCount < current.gameMetricCount)
    ) {
      report.push({
        gameStatsId: game.id,
        outcome: "blocked_coverage_regression",
        current: {
          projectionId: current.id,
          playerMetricCount: current.playerMetricCount,
          gameMetricCount: current.gameMetricCount,
        },
        proposed: {
          playerMetricCount: normalized.receipt.playerMetricCount,
          gameMetricCount: normalized.receipt.gameMetricCount,
        },
      });
      continue;
    }

    const persisted =
      mode === "plan"
        ? null
        : await persistReplayNormalizedStatProjection(
            prisma,
            normalized
          );
    report.push({
      gameStatsId: game.id,
      outcome:
        mode === "plan"
          ? repairInferredResults
            ? current
              ? "would_supersede"
              : "would_create"
            : "planned"
          : persisted?.outcome,
      projectionId: persisted?.projectionId ?? null,
      sourceIdentity,
      currentProjectionId: current?.id ?? null,
      currentResultEligibility:
        current?.resultEligibility ??
        null,
      currentPlayerMetricCount:
        current?.playerMetricCount ??
        null,
      currentGameMetricCount:
        current?.gameMetricCount ??
        null,
      resultEligibility: normalized.receipt.resultEligibility,
      playerCount: normalized.receipt.playerCount,
      playerMetricCount: normalized.receipt.playerMetricCount,
      gameMetricCount: normalized.receipt.gameMetricCount,
      projectionHash: normalized.receipt.projectionHash,
      affectsPublicAggregates:
        normalized.receipt.affectsPublicAggregates,
    });
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        mode,
        dryRun: mode === "plan",
        repairInferredResults,
        operatorUid: operator?.uid ?? null,
        requested: {
          gameId: gameId || null,
          afterId,
          limit,
        },
        selectedGameCount: games.length,
        report,
        nextAfterId: games.at(-1)?.id ?? afterId,
      },
      null,
      2
    )}\n`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
