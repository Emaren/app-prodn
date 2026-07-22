import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  loadReplayResultReviewState,
  ReplayResultReviewError,
  requireReplayResultReviewAccess,
  submitReplayResultAdjudication,
  type ReplayResultAdjudicationInput,
} from "@/lib/replayResultAdjudications";

import {
  getSessionUid,
} from "@/lib/session";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

type RouteContext = {
  params:
    Promise<{
      id: string;
    }>;
};

function noStoreJson(
  body: unknown,
  init?: {
    status?: number;
  }
) {
  return NextResponse.json(
    body,
    {
      ...init,
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    }
  );
}

async function readGameStatsId(
  context:
    RouteContext
) {
  const {
    id,
  } =
    await context.params;

  const gameStatsId =
    Number(id);

  return (
    Number.isSafeInteger(
      gameStatsId
    ) &&
    gameStatsId > 0
  )
    ? gameStatsId
    : null;
}

function errorResponse(
  error: unknown
) {
  if (
    error instanceof
    ReplayResultReviewError
  ) {
    return noStoreJson(
      {
        detail:
          error.message,
        code:
          error.code,
      },
      {
        status:
          error.status,
      }
    );
  }

  console.error(
    "Replay result adjudication request failed:",
    error
  );

  return noStoreJson(
    {
      detail:
        "Replay result review is temporarily unavailable.",
      code:
        "review_unavailable",
    },
    {
      status:
        500,
    }
  );
}


/*
 * PUBLIC READ
 */
export async function GET(
  request:
    NextRequest,
  context:
    RouteContext
) {
  const gameStatsId =
    await readGameStatsId(
      context
    );

  if (
    gameStatsId ===
    null
  ) {
    return noStoreJson(
      {
        detail:
          "Invalid replay game id.",
        code:
          "invalid_game_id",
      },
      {
        status:
          400,
      }
    );
  }

  const viewerUid =
    await getSessionUid(
      request
    );

  try {
    const state =
      await loadReplayResultReviewState(
        getPrisma(),
        viewerUid,
        gameStatsId
      );

    return noStoreJson(
      state
    );
  } catch (
    error
  ) {
    return errorResponse(
      error
    );
  }
}


/*
 * ADMIN WRITE
 */
export async function POST(
  request:
    NextRequest,
  context:
    RouteContext
) {
  const viewerUid =
    await getSessionUid(
      request
    );

  if (!viewerUid) {
    return noStoreJson(
      {
        detail:
          "Admin authentication required.",
        code:
          "session_required",
      },
      {
        status:
          401,
      }
    );
  }

  const gameStatsId =
    await readGameStatsId(
      context
    );

  if (
    gameStatsId ===
    null
  ) {
    return noStoreJson(
      {
        detail:
          "Invalid replay game id.",
        code:
          "invalid_game_id",
      },
      {
        status:
          400,
      }
    );
  }

  const prisma =
    getPrisma();

  try {
    const {
      access,
    } =
      await requireReplayResultReviewAccess(
        prisma,
        viewerUid,
        gameStatsId
      );

    if (
      !access.isAdmin
    ) {
      return noStoreJson(
        {
          detail:
            "Only a site admin can lock or correct a battle result.",
          code:
            "result_admin_required",
        },
        {
          status:
            403,
        }
      );
    }

    let payload:
      ReplayResultAdjudicationInput;

    try {
      const raw: unknown =
        await request.json();

      if (
        !raw ||
        typeof raw !==
          "object" ||
        Array.isArray(
          raw
        )
      ) {
        return noStoreJson(
          {
            detail:
              "A JSON verdict is required.",
            code:
              "invalid_body",
          },
          {
            status:
              400,
          }
        );
      }

      payload =
        raw as
          ReplayResultAdjudicationInput;
    } catch {
      return noStoreJson(
        {
          detail:
            "A valid JSON verdict is required.",
          code:
            "invalid_json",
        },
        {
          status:
            400,
        }
      );
    }

    const result =
      await submitReplayResultAdjudication({
        prisma,
        viewerUid,
        gameStatsId,
        payload,
      });

    return noStoreJson(
      result,
      {
        status:
          result.created
            ? 201
            : 200,
      }
    );
  } catch (
    error
  ) {
    return errorResponse(
      error
    );
  }
}
