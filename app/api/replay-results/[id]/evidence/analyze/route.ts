import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  ReplayResultReviewError,
  requireReplayResultReviewAccess,
} from "@/lib/replayResultAdjudications";
import {
  analyzeReplayScreenshotEvidence,
  ReplayScreenshotEvidenceError,
} from "@/lib/replayScreenshotEvidence";
import {
  getSessionUid,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function json(
  body: unknown,
  status = 200
) {
  return NextResponse.json(
    body,
    {
      status,
      headers: {
        "Cache-Control":
          "private, no-store, max-age=0",
      },
    }
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const viewerUid =
    await getSessionUid(
      request
    );

  if (!viewerUid) {
    return json(
      {
        detail:
          "Sign in before analyzing replay evidence.",
        code:
          "session_required",
      },
      401
    );
  }

  const { id } =
    await context.params;

  const gameStatsId =
    Number(id);

  if (
    !Number.isSafeInteger(
      gameStatsId
    ) ||
    gameStatsId <= 0
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
      viewer,
      access,
    } =
      await requireReplayResultReviewAccess(
        prisma,
        viewerUid,
        gameStatsId
      );

    if (!access.isAdmin) {
      return json(
        {
          detail:
            "Only a site admin can launch an evidence-assisted parser pass.",
          code:
            "evidence_parser_admin_required",
        },
        403
      );
    }

    const result =
      await analyzeReplayScreenshotEvidence(
        prisma,
        gameStatsId,
        viewer.uid
      );

    return json(
      result,
      result.outcome ===
        "created"
        ? 201
        : 200
    );
  } catch (error) {
    if (
      error instanceof
        ReplayResultReviewError ||
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
      "Screenshot evidence pass failed:",
      error
    );

    return json(
      {
        detail:
          "The screenshot evidence pass could not complete.",
        code:
          "evidence_analysis_failed",
      },
      500
    );
  }
}
