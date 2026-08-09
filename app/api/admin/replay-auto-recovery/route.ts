import "server-only";

import {
  extname,
} from "node:path";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  HD_REPLAY_PARSER_CONTRACT,
} from "@/lib/replayEngineRoom";

import {
  ReplayParserOnDemandError,
  runLatestReplayParserForGame,
} from "@/lib/replayParserOnDemand";

import {
  reconcileAutomaticWatcherTerminalResults,
} from "@/lib/replayResultAdjudications";

import {
  ensureReplayIdentityProjections,
} from "@/lib/replayIdentityProjection";

import {
  selectReplayParserRecoveryBatch,
  selectRecurrentReplayRecoveryBatch,
} from "@/lib/replayRecoveryBatch";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  300;

const FINAL_RECORDING_EXTENSIONS =
  new Set([
    ".aoe2record",
    ".mgz",
    ".mgx",
    ".mgl",
  ]);

function authorized(
  request: NextRequest
) {
  const expected =
    process.env
      .INTERNAL_API_KEY
      ?.trim();

  const supplied =
    request.headers
      .get("x-api-key")
      ?.trim();

  return Boolean(
    expected &&
    supplied &&
    expected === supplied
  );
}

function boundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed =
    Number.parseInt(
      value || "",
      10
    );

  if (
    !Number.isFinite(parsed)
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      parsed
    )
  );
}

function recoverySince() {
  const configured =
    process.env
      .REPLAY_AUTO_RECOVERY_SINCE
      ?.trim();

  const parsed =
    configured
      ? new Date(configured)
      : new Date(
          Date.now() -
            14 *
              24 *
              60 *
              60 *
              1000
        );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    throw new Error(
      "REPLAY_AUTO_RECOVERY_SINCE is invalid."
    );
  }

  return parsed;
}

function finalRecording(
  game: {
    original_filename:
      string | null;

    replay_file:
      string;
  }
) {
  const filename =
    game.original_filename ||
    game.replay_file;

  return FINAL_RECORDING_EXTENSIONS
    .has(
      extname(
        filename
      ).toLowerCase()
    );
}

function errorDetail(
  error: unknown
) {
  if (
    error instanceof
      ReplayParserOnDemandError
  ) {
    return {
      name:
        error.name,

      status:
        error.status,

      code:
        error.code,

      message:
        error.message,
    };
  }

  if (
    error instanceof Error
  ) {
    return {
      name:
        error.name,

      status:
        null,

      code:
        null,

      message:
        error.message,
    };
  }

  return {
    name:
      "Error",

    status:
      null,

    code:
      null,

    message:
      String(error),
  };
}

type ReplayAutoRecoveryCandidate = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_source: string;
  parse_reason: string;
  createdAt: Date;
};

type ReplayReconciliationCandidate =
  ReplayAutoRecoveryCandidate & {
    missingIdentityProjection:
      boolean;
    missingAcceptedResult:
      boolean;
    staleIdentityResultProjection:
      boolean;
  };

const EXACT_CURRENT_HASH_SELECTION = {
  currentReplayHashRequired: true,
  parserContractRequired: true,
  candidateOnlyRequired: true,
  anyExactContractRunSuppressesRedispatch: true,
  candidateHorizon:
    "complete_configured_lookback",
  candidateRotation:
    true,
} as const;

const RECURRENT_OUTPUT_SELECTION = {
  currentReplayHashRequired:
    true,
  parserContractRequired:
    true,
  exactContractRunRequired:
    true,
  missingAcceptedIdentityProjectionOrResultRequired:
    true,
  parserRedispatch:
    false,
  identityGapsFirst:
    true,
  identityGapsRotate:
    true,
  resultOnlyGapsRotate:
    true,
  mixedLaneIdentityShare:
    "3:1",
  candidateHorizon:
    "complete_configured_lookback",
} as const;

export async function POST(
  request: NextRequest
) {
  if (
    !authorized(request)
  ) {
    return NextResponse.json(
      {
        detail:
          "Invalid internal API key.",
      },
      {
        status:
          401,
      }
    );
  }

  const dryRun =
    request.nextUrl
      .searchParams
      .get("dryRun") ===
    "1";

  const batchSize =
    boundedInteger(
      process.env
        .REPLAY_AUTO_RECOVERY_BATCH_SIZE,
      1,
      1,
      3
    );

  const reconciliationBatchSize =
    boundedInteger(
      process.env
        .REPLAY_AUTO_RECONCILE_BATCH_SIZE,
      8,
      1,
      24
    );

  const since =
    recoverySince();

  const recoveryMinuteBucket =
    Math.floor(
      Date.now() /
        60_000
    );

  const targetGameStatsIdRaw =
    request.nextUrl
      .searchParams
      .get("gameStatsId");

  const targetGameStatsId =
    targetGameStatsIdRaw === null
      ? null
      : Number.parseInt(
          targetGameStatsIdRaw,
          10
        );

  if (
    targetGameStatsIdRaw !== null &&
    (
      !Number.isSafeInteger(
        targetGameStatsId
      ) ||
      (targetGameStatsId ?? 0) < 1
    )
  ) {
    return NextResponse.json(
      {
        detail:
          "gameStatsId must be a positive integer.",
      },
      {
        status:
          400,
      }
    );
  }

  const prisma =
    getPrisma();

  const candidates =
    await prisma.$queryRaw<
      ReplayAutoRecoveryCandidate[]
    >`
      SELECT
        game.id,
        game.replay_hash AS "replayHash",
        game.replay_file,
        game.original_filename,
        game.parse_source,
        game.parse_reason,
        game.created_at AS "createdAt"
      FROM game_stats AS game
      WHERE game.is_final = TRUE
        AND game.created_at >= ${since}
        AND (
          ${targetGameStatsId}::integer IS NULL
          OR game.id =
            ${targetGameStatsId}::integer
        )
        AND NOT EXISTS (
          SELECT 1
          FROM replay_parse_runs AS run
          WHERE run.game_stats_id = game.id
            AND lower(run.input_hash) = lower(game.replay_hash)
            AND run.parser_name =
              ${HD_REPLAY_PARSER_CONTRACT.parserName}
            AND run.parser_version =
              ${HD_REPLAY_PARSER_CONTRACT.parserVersion}
            AND run.pass_name =
              ${HD_REPLAY_PARSER_CONTRACT.passName}
            AND run.pass_version =
              ${HD_REPLAY_PARSER_CONTRACT.passVersion}
            AND run.schema_version =
              ${HD_REPLAY_PARSER_CONTRACT.schemaVersion}
            AND run.candidate_only = TRUE
            AND run.affects_public_aggregates = FALSE
        )
      ORDER BY
        game.created_at DESC,
        game.id DESC
    `;

  const eligible =
    selectReplayParserRecoveryBatch({
      candidates:
        candidates.filter(
          finalRecording
        ),
      batchSize,
      targetGameStatsId,
      minuteBucket:
        recoveryMinuteBucket,
    });

  /*
   * Parser dispatch and post-parse publication are separate recovery lanes.
   * The parser lane intentionally stops redispatching after any exact current-
   * hash contract run. This recurrent lane closes the corresponding output
   * hole: an exact run must never permanently suppress a missing accepted
   * identity projection or result reconciliation after a transient failure.
   */
  const reconciliationCandidates =
    await prisma.$queryRaw<
      ReplayReconciliationCandidate[]
    >`
      WITH recurrent_final AS (
        SELECT
          game.id,
          game.replay_hash AS "replayHash",
          game.replay_file,
          game.original_filename,
          game.parse_source,
          game.parse_reason,
          game.created_at AS "createdAt",
          EXISTS (
            SELECT 1
            FROM replay_parse_runs AS run
            WHERE run.game_stats_id = game.id
              AND lower(run.input_hash) = lower(game.replay_hash)
              AND run.parser_name =
                ${HD_REPLAY_PARSER_CONTRACT.parserName}
              AND run.parser_version =
                ${HD_REPLAY_PARSER_CONTRACT.parserVersion}
              AND run.pass_name =
                ${HD_REPLAY_PARSER_CONTRACT.passName}
              AND run.pass_version =
                ${HD_REPLAY_PARSER_CONTRACT.passVersion}
              AND run.schema_version =
                ${HD_REPLAY_PARSER_CONTRACT.schemaVersion}
              AND run.candidate_only = TRUE
              AND run.affects_public_aggregates = FALSE
          ) AS "hasExactParserRun",
          EXISTS (
            SELECT 1
            FROM replay_stat_projections AS projection
            WHERE projection.game_stats_id = game.id
              AND projection.projection_status = 'accepted'
              AND projection.affects_public_aggregates = TRUE
              AND NOT EXISTS (
                SELECT 1
                FROM replay_stat_projections AS successor
                WHERE successor.supersedes_id = projection.id
              )
          ) AS "hasAcceptedIdentityProjection",
          EXISTS (
            SELECT 1
            FROM replay_stat_projections AS resolved_projection
            WHERE resolved_projection.game_stats_id = game.id
              AND resolved_projection.projection_status = 'accepted'
              AND resolved_projection.affects_public_aggregates = TRUE
              AND resolved_projection.result_eligibility = 'resolved'
              AND NOT EXISTS (
                SELECT 1
                FROM replay_stat_projections AS resolved_successor
                WHERE resolved_successor.supersedes_id = resolved_projection.id
              )
          ) AS "hasResolvedIdentityProjection",
          (
            lower(
              btrim(
                coalesce(game.winner, '')
              )
            ) NOT IN (
              '',
              'unknown',
              'n/a',
              'na',
              'none',
              'pending',
              'unresolved',
              'result under review',
              'to be determined'
            )
            OR EXISTS (
              SELECT 1
              FROM replay_result_adjudications AS adjudication
              WHERE adjudication.game_stats_id = game.id
                AND adjudication.decision_status = 'accepted'
                AND adjudication.affects_stats = TRUE
            )
            OR EXISTS (
              SELECT 1
              FROM replay_stat_projections AS result_projection
              WHERE result_projection.game_stats_id = game.id
                AND result_projection.projection_status = 'accepted'
                AND result_projection.affects_public_aggregates = TRUE
                AND result_projection.result_eligibility = 'resolved'
                AND NOT EXISTS (
                  SELECT 1
                  FROM replay_stat_projections AS result_successor
                  WHERE result_successor.supersedes_id = result_projection.id
                )
            )
          ) AS "hasAcceptedResult",
          EXISTS (
            SELECT 1
            FROM replay_result_adjudications AS newer_adjudication
            WHERE newer_adjudication.game_stats_id = game.id
              AND newer_adjudication.decision_status = 'accepted'
              AND newer_adjudication.affects_stats = TRUE
              AND newer_adjudication.created_at > coalesce(
                (
                  SELECT max(current_projection.created_at)
                  FROM replay_stat_projections AS current_projection
                  WHERE current_projection.game_stats_id = game.id
                    AND current_projection.projection_status = 'accepted'
                    AND current_projection.affects_public_aggregates = TRUE
                    AND NOT EXISTS (
                      SELECT 1
                      FROM replay_stat_projections AS current_successor
                      WHERE current_successor.supersedes_id = current_projection.id
                    )
                ),
                TIMESTAMP 'epoch'
              )
          ) AS "hasNewerAcceptedAdjudication"
        FROM game_stats AS game
        WHERE game.is_final = TRUE
          AND game.created_at >= ${since}
          AND (
            ${targetGameStatsId}::integer IS NULL
            OR game.id =
              ${targetGameStatsId}::integer
          )
      )
      SELECT
        recurrent_final.id,
        recurrent_final."replayHash",
        recurrent_final.replay_file,
        recurrent_final.original_filename,
        recurrent_final.parse_source,
        recurrent_final.parse_reason,
        recurrent_final."createdAt",
        NOT recurrent_final."hasAcceptedIdentityProjection"
          AS "missingIdentityProjection",
        NOT recurrent_final."hasAcceptedResult"
          AS "missingAcceptedResult",
        (
          recurrent_final."hasAcceptedIdentityProjection" = TRUE
          AND recurrent_final."hasAcceptedResult" = TRUE
          AND (
            recurrent_final."hasResolvedIdentityProjection" = FALSE
            OR recurrent_final."hasNewerAcceptedAdjudication" = TRUE
          )
        ) AS "staleIdentityResultProjection"
      FROM recurrent_final
      WHERE recurrent_final."hasExactParserRun" = TRUE
        AND (
          recurrent_final."hasAcceptedIdentityProjection" = FALSE
          OR recurrent_final."hasAcceptedResult" = FALSE
          OR (
            recurrent_final."hasAcceptedIdentityProjection" = TRUE
            AND recurrent_final."hasAcceptedResult" = TRUE
            AND (
              recurrent_final."hasResolvedIdentityProjection" = FALSE
              OR recurrent_final."hasNewerAcceptedAdjudication" = TRUE
            )
          )
        )
      ORDER BY
        recurrent_final."createdAt" DESC,
        recurrent_final.id DESC
    `;

  const reconciliationEligible =
    selectRecurrentReplayRecoveryBatch({
      candidates:
        reconciliationCandidates.filter(
          finalRecording
        ),

      batchSize:
        reconciliationBatchSize,

      targetGameStatsId,

      minuteBucket:
        recoveryMinuteBucket,
    });

  if (
    dryRun
  ) {
    return NextResponse.json({
      ok:
        true,

      dryRun:
        true,

      targetGameStatsId,

      since:
        since.toISOString(),

      parserContract:
        HD_REPLAY_PARSER_CONTRACT,

      selectionInvariant:
        EXACT_CURRENT_HASH_SELECTION,

      recurrentSelectionInvariant:
        RECURRENT_OUTPUT_SELECTION,

      candidateCount:
        candidates.length,

      eligibleCount:
        eligible.length,

      eligible:
        eligible.map(
          (
            game
          ) => ({
            ...game,

            createdAt:
              game.createdAt
                .toISOString(),
          })
        ),

      reconciliationCandidateCount:
        reconciliationCandidates.length,

      reconciliationEligibleCount:
        reconciliationEligible.length,

      reconciliationEligible:
        reconciliationEligible.map(
          (
            game
          ) => ({
            ...game,

            createdAt:
              game.createdAt
                .toISOString(),
          })
        ),

      authorityBoundary: {
        databaseWrites:
          0,

        parserRunsCreated:
          0,

        gameStatsChanges:
          0,

        marketsChanged:
          0,

        bettingAuthority:
          false,

        settlementAuthority:
          false,
      },
    });
  }

  const requestedByUid =
    process.env
      .REPLAY_AUTO_RECOVERY_REQUESTED_BY_UID
      ?.trim();

  if (
    !requestedByUid
  ) {
    return NextResponse.json(
      {
        detail:
          "REPLAY_AUTO_RECOVERY_REQUESTED_BY_UID is not configured.",
      },
      {
        status:
          500,
      }
    );
  }

  const results:
    Array<
      Record<string, unknown>
    > =
    [];

  for (
    const game of
    eligible
  ) {
    const startedAt =
      new Date();

    try {
      const parserResult =
        await runLatestReplayParserForGame(
          prisma,
          game.id,
          requestedByUid
        );

      /*
       * Parser recovery creates the evidence rail.
       *
       * Immediately retry the automatic terminal-result policy
       * after the exact current-hash Engine Room run exists.
       * This closes the old timing hole where post-ingest result
       * reconciliation ran before raw action-tail evidence was
       * available and was never retried afterward.
       */
      const automaticTerminalResult =
        await reconcileAutomaticWatcherTerminalResults(
          prisma,
          [
            game.id,
          ]
        );

      const identityProjection =
        await ensureReplayIdentityProjections(
          prisma,
          [
            game.id,
          ]
        );

      results.push({
        gameStatsId:
          game.id,

        replayHash:
          game.replayHash,

        filename:
          game.original_filename ||
          game.replay_file,

        ok:
          true,

        parserResult,

        automaticTerminalResult,

        identityProjection,

        startedAt:
          startedAt
            .toISOString(),

        completedAt:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      results.push({
        gameStatsId:
          game.id,

        replayHash:
          game.replayHash,

        filename:
          game.original_filename ||
          game.replay_file,

        ok:
          false,

        error:
          errorDetail(
            error
          ),

        startedAt:
          startedAt
            .toISOString(),

        completedAt:
          new Date()
            .toISOString(),
      });
    }
  }

  const reconciliationResults:
    Array<
      Record<string, unknown>
    > =
    [];

  for (
    const game of
    reconciliationEligible
  ) {
    const startedAt =
      new Date();

    try {
      const automaticTerminalResult =
        await reconcileAutomaticWatcherTerminalResults(
          prisma,
          [
            game.id,
          ]
        );

      /*
       * Result reconciliation runs first so a newly accepted adjudication is
       * part of the immutable public projection created immediately after it.
       */
      const identityProjection =
        await ensureReplayIdentityProjections(
          prisma,
          [
            game.id,
          ]
        );

      reconciliationResults.push({
        gameStatsId:
          game.id,

        replayHash:
          game.replayHash,

        filename:
          game.original_filename ||
          game.replay_file,

        missingIdentityProjection:
          game.missingIdentityProjection,

        missingAcceptedResult:
          game.missingAcceptedResult,

        staleIdentityResultProjection:
          game.staleIdentityResultProjection,

        ok:
          true,

        automaticTerminalResult,

        identityProjection,

        startedAt:
          startedAt
            .toISOString(),

        completedAt:
          new Date()
            .toISOString(),
      });
    } catch (
      error
    ) {
      reconciliationResults.push({
        gameStatsId:
          game.id,

        replayHash:
          game.replayHash,

        filename:
          game.original_filename ||
          game.replay_file,

        missingIdentityProjection:
          game.missingIdentityProjection,

        missingAcceptedResult:
          game.missingAcceptedResult,

        staleIdentityResultProjection:
          game.staleIdentityResultProjection,

        ok:
          false,

        error:
          errorDetail(
            error
          ),

        startedAt:
          startedAt
            .toISOString(),

        completedAt:
          new Date()
            .toISOString(),
      });
    }
  }

  const succeeded =
    results.filter(
      (
        result
      ) =>
        result.ok ===
          true
    ).length;

  const failed =
    results.length -
    succeeded;

  const reconciliationSucceeded =
    reconciliationResults.filter(
      (
        result
      ) =>
        result.ok ===
          true
    ).length;

  const reconciliationFailed =
    reconciliationResults.length -
    reconciliationSucceeded;

  const totalFailed =
    failed +
    reconciliationFailed;

  return NextResponse.json({
    ok:
      totalFailed === 0,

    dryRun:
      false,

    targetGameStatsId,

    since:
      since.toISOString(),

    parserContract:
      HD_REPLAY_PARSER_CONTRACT,

    selectionInvariant:
      EXACT_CURRENT_HASH_SELECTION,

    recurrentSelectionInvariant:
      RECURRENT_OUTPUT_SELECTION,

    candidateCount:
      candidates.length,

    eligibleCount:
      eligible.length,

    processedCount:
      results.length +
      reconciliationResults.length,

    succeededCount:
      succeeded +
      reconciliationSucceeded,

    failedCount:
      totalFailed,

    parserProcessedCount:
      results.length,

    parserSucceededCount:
      succeeded,

    parserFailedCount:
      failed,

    results,

    reconciliationCandidateCount:
      reconciliationCandidates.length,

    reconciliationEligibleCount:
      reconciliationEligible.length,

    reconciliationProcessedCount:
      reconciliationResults.length,

    reconciliationSucceededCount:
      reconciliationSucceeded,

    reconciliationFailedCount:
      reconciliationFailed,

    reconciliationResults,

    authorityBoundary: {
      parserCandidateOnly:
        true,

      parserAffectsPublicAggregates:
        false,

      gameStatsChanges:
        0,

      resultAdjudicationMayBeAppended:
        true,

      resultAdjudicationAffectsStats:
        true,

      marketChanges:
        0,

      bettingAuthority:
        false,

      settlementAuthority:
        false,
    },
  }, {
    status:
      totalFailed === 0
        ? 200
        : 503,
  });
}
