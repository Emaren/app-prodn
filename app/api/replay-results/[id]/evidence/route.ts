import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  ReplayResultReviewError,
  requireReplayResultReviewAccess,
} from "@/lib/replayResultAdjudications";

import {
  listReplayScreenshotEvidence,
  ReplayScreenshotEvidenceError,
  storeReplayScreenshotEvidence,
} from "@/lib/replayScreenshotEvidence";

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

function json(
  body:
    unknown,
  status =
    200
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "no-store, max-age=0",
      },
    }
  );
}

async function readGameId(
  context:
    RouteContext
) {
  const {
    id,
  } =
    await context.params;

  const value =
    Number(id);

  return (
    Number.isSafeInteger(
      value
    ) &&
    value > 0
  )
    ? value
    : null;
}


/*
 * PUBLIC READ
 */
export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext
) {
  const gameStatsId =
    await readGameId(
      context
    );

  if (
    gameStatsId ===
    null
  ) {
    return json(
      {
        detail:
          "Invalid replay game id.",
        code:
          "invalid_game_id",
      },
      400
    );
  }

  const prisma =
    getPrisma();

  try {
    const game =
      await prisma
        .gameStats
        .findUnique({
          where: {
            id:
              gameStatsId,
          },
          select: {
            id: true,
          },
        });

    if (!game) {
      return json(
        {
          detail:
            "Replay game not found.",
          code:
            "game_not_found",
        },
        404
      );
    }

    return json({
      maxScreenshots:
        6,

      evidence:
        await listReplayScreenshotEvidence(
          prisma,
          gameStatsId
        ),
    });
  } catch (
    error
  ) {
    console.error(
      "Replay evidence list failed:",
      error
    );

    return json(
      {
        detail:
          "Replay evidence is temporarily unavailable.",
        code:
          "evidence_unavailable",
      },
      500
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
    return json(
      {
        detail:
          "Admin authentication required.",
        code:
          "session_required",
      },
      401
    );
  }

  const gameStatsId =
    await readGameId(
      context
    );

  if (
    gameStatsId ===
    null
  ) {
    return json(
      {
        detail:
          "Invalid replay game id.",
        code:
          "invalid_game_id",
      },
      400
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
      return json(
        {
          detail:
            "Only a site admin can add screenshot evidence.",
          code:
            "evidence_admin_required",
        },
        403
      );
    }

    const form =
      await request.formData();

    const files =
      form
        .getAll(
          "images"
        )
        .filter(
          (
            entry
          ): entry is File =>
            entry instanceof
            File
        );

    const evidence =
      await storeReplayScreenshotEvidence(
        prisma,
        gameStatsId,
        viewerUid,
        files
      );

    return json(
      {
        maxScreenshots:
          6,
        evidence,
      },
      201
    );
  } catch (
    error
  ) {
    if (
      error instanceof
      ReplayResultReviewError
    ) {
      return json(
        {
          detail:
            error.message,
          code:
            error.code,
        },
        error.status
      );
    }

    if (
      error instanceof
      ReplayScreenshotEvidenceError
    ) {
      return json(
        {
          detail:
            error.message,
          code:
            error.code,
        },
        error.status
      );
    }

    console.error(
      "Replay evidence upload failed:",
      error
    );

    return json(
      {
        detail:
          "The screenshots could not be stored.",
        code:
          "evidence_upload_failed",
      },
      500
    );
  }
}
