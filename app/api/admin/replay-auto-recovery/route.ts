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

const EXACT_CURRENT_HASH_SELECTION = {
  currentReplayHashRequired: true,
  parserContractRequired: true,
  candidateOnlyRequired: true,
  anyExactContractRunSuppressesRedispatch: true,
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

  const since =
    recoverySince();

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
      LIMIT 100
    `;

  const eligible =
    candidates
      .filter(
        finalRecording
      )
      .slice(
        0,
        batchSize
      );

  if (
    dryRun
  ) {
    return NextResponse.json({
      ok:
        true,

      dryRun:
        true,

      since:
        since.toISOString(),

      parserContract:
        HD_REPLAY_PARSER_CONTRACT,

      selectionInvariant:
        EXACT_CURRENT_HASH_SELECTION,

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
      const result =
        await runLatestReplayParserForGame(
          prisma,
          game.id,
          requestedByUid
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

        result,

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

  return NextResponse.json({
    ok:
      failed === 0,

    dryRun:
      false,

    since:
      since.toISOString(),

    parserContract:
      HD_REPLAY_PARSER_CONTRACT,

    selectionInvariant:
      EXACT_CURRENT_HASH_SELECTION,

    candidateCount:
      candidates.length,

    eligibleCount:
      eligible.length,

    processedCount:
      results.length,

    succeededCount:
      succeeded,

    failedCount:
      failed,

    results,

    authorityBoundary: {
      candidateOnly:
        true,

      affectsPublicAggregates:
        false,

      gameStatsChanges:
        0,

      marketChanges:
        0,

      bettingAuthority:
        false,

      settlementAuthority:
        false,
    },
  }, {
    status:
      failed === 0
        ? 200
        : 503,
  });
}
