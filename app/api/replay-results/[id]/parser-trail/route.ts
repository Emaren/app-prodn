import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  loadReplayParserTrail,
} from "@/lib/replayParserTrail";

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

async function gameId(
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

export async function GET(
  _request:
    NextRequest,
  context:
    RouteContext
) {
  const id =
    await gameId(
      context
    );

  if (
    id === null
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
            id,
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

    return json(
      await loadReplayParserTrail(
        prisma,
        id
      )
    );
  } catch (
    error
  ) {
    console.error(
      "Replay parser trail failed:",
      error
    );

    return json(
      {
        detail:
          "Parser history is temporarily unavailable.",
        code:
          "parser_trail_unavailable",
      },
      500
    );
  }
}
