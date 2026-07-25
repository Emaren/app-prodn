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
    await prisma.gameStats.findMany({
      where: {
        is_final:
          true,

        createdAt: {
          gte:
            since,
        },

        replayParseRuns: {
          none: {
            parserName:
              HD_REPLAY_PARSER_CONTRACT
                .parserName,

            parserVersion:
              HD_REPLAY_PARSER_CONTRACT
                .parserVersion,

            passName:
              HD_REPLAY_PARSER_CONTRACT
                .passName,

            passVersion:
              HD_REPLAY_PARSER_CONTRACT
                .passVersion,

            schemaVersion:
              HD_REPLAY_PARSER_CONTRACT
                .schemaVersion,
          },
        },
      },

      orderBy: [
        {
          createdAt:
            "desc",
        },
        {
          id:
            "desc",
        },
      ],

      take:
        100,

      select: {
        id:
          true,

        replayHash:
          true,

        replay_file:
          true,

        original_filename:
          true,

        parse_source:
          true,

        parse_reason:
          true,

        createdAt:
          true,
      },
    });

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
