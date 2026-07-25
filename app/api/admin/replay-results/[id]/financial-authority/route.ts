import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  ensureBetMarketsAfterCommit,
} from "@/lib/bets";
import {
  approveReplayFinancialAuthority,
  planReplayFinancialAuthority,
  ReplayFinancialAuthorityError,
} from "@/lib/replayFinancialAuthority";
import {
  getPrisma,
} from "@/lib/prisma";
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

async function gameStatsId(
  context: RouteContext
) {
  const {
    id,
  } =
    await context.params;
  const parsed =
    Number(id);

  return (
    Number.isSafeInteger(
      parsed
    ) &&
    parsed > 0
  )
    ? parsed
    : null;
}

function errorResponse(
  error: unknown
) {
  if (
    error instanceof
    ReplayFinancialAuthorityError
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
    "Replay financial authority request failed:",
    error
  );
  return noStoreJson(
    {
      detail:
        "Replay financial authority is temporarily unavailable.",
      code:
        "financial_authority_unavailable",
    },
    {
      status:
        500,
    }
  );
}

export async function GET(
  request: NextRequest,
  context: RouteContext
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

  const id =
    await gameStatsId(
      context
    );

  if (!id) {
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

  try {
    return noStoreJson(
      {
        plan:
          await planReplayFinancialAuthority({
            prisma:
              getPrisma(),
            viewerUid,
            gameStatsId:
              id,
          }),
      }
    );
  } catch (error) {
    return errorResponse(
      error
    );
  }
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

  const id =
    await gameStatsId(
      context
    );

  if (!id) {
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

  let body: {
    expectedFingerprint?: unknown;
    confirmation?: unknown;
  };

  try {
    const raw:
      unknown =
      await request.json();

    if (
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) {
      throw new Error(
        "invalid body"
      );
    }

    body =
      raw as typeof body;
  } catch {
    return noStoreJson(
      {
        detail:
          "A valid JSON financial-authority confirmation is required.",
        code:
          "invalid_json",
      },
      {
        status:
          400,
      }
    );
  }

  try {
    const approved =
      await approveReplayFinancialAuthority({
        prisma:
          getPrisma(),
        viewerUid,
        gameStatsId:
          id,
        expectedFingerprint:
          typeof body.expectedFingerprint ===
          "string"
            ? body.expectedFingerprint
            : "",
        confirmation:
          typeof body.confirmation ===
          "string"
            ? body.confirmation
            : "",
      });

    try {
      /*
       * Do not merely join a reconciliation pass that may have started before
       * this append-only authority commit. The after-commit helper waits out
       * any older single-flight pass and then guarantees a subsequent pass.
       */
      await ensureBetMarketsAfterCommit(
        getPrisma()
      );

      return noStoreJson(
        {
          ...approved,
          reconciliation: {
            status:
              "completed",
          },
        },
        {
          status:
            approved.created
              ? 201
              : 200,
        }
      );
    } catch (
      reconciliationError
    ) {
      console.error(
        `Replay financial authority #${approved.adjudication.id} committed, but betting reconciliation failed:`,
        reconciliationError
      );

      /*
       * The authority row is append-only and already committed.
       * Report a retryable reconciliation failure without pretending
       * the authorization itself rolled back.
       */
      return noStoreJson(
        {
          ...approved,
          reconciliation: {
            status:
              "failed",
            detail:
              "Financial authority was recorded, but reconciliation failed. Retry this same confirmed fingerprint or run the betting reconciliation rail.",
          },
        },
        {
          status:
            202,
        }
      );
    }
  } catch (error) {
    return errorResponse(
      error
    );
  }
}
