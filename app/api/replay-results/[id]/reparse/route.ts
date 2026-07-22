import {
  NextRequest,
  NextResponse,
} from "next/server";

import { getPrisma } from "@/lib/prisma";
import {
  ReplayParserOnDemandError,
  runLatestReplayParserForGame,
} from "@/lib/replayParserOnDemand";
import {
  ReplayResultReviewError,
  requireReplayResultReviewAccess,
} from "@/lib/replayResultAdjudications";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function json(
  body: unknown,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control":
        "private, no-store, max-age=0",
    },
  });
}

async function gameId(
  context: RouteContext
) {
  const { id } = await context.params;
  const value = Number(id);

  return Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const viewerUid =
    await getSessionUid(request);

  if (!viewerUid) {
    return json(
      {
        detail:
          "Sign in before running the parser.",
        code: "session_required",
      },
      401
    );
  }

  const id = await gameId(context);

  if (id === null) {
    return json(
      {
        detail: "Invalid replay game id.",
        code: "invalid_game_id",
      },
      400
    );
  }

  const prisma = getPrisma();

  try {
    const { viewer, access } =
      await requireReplayResultReviewAccess(
        prisma,
        viewerUid,
        id
      );

    if (!access.isAdmin) {
      return json(
        {
          detail:
            "Only a site admin can launch an Engine Room parser pass.",
          code: "parser_admin_required",
        },
        403
      );
    }

    const result =
      await runLatestReplayParserForGame(
        prisma,
        id,
        viewer.uid
      );

    return json(result);
  } catch (error) {
    if (
      error instanceof
      ReplayResultReviewError
    ) {
      return json(
        {
          detail: error.message,
          code: error.code,
        },
        error.status
      );
    }

    if (
      error instanceof
      ReplayParserOnDemandError
    ) {
      return json(
        {
          detail: error.message,
          code: error.code,
        },
        error.status
      );
    }

    console.error(
      "Run latest replay parser failed:",
      error
    );

    return json(
      {
        detail:
          "The canonical parser could not be launched.",
        code: "parser_run_unavailable",
      },
      500
    );
  }
}
