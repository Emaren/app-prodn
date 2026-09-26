import "server-only";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getPrisma,
} from "@/lib/prisma";

import {
  applyTargetedReplayRosterRecovery,
  planTargetedReplayRosterRecovery,
} from "@/lib/targetedReplayRosterRecovery";


export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const maxDuration =
  120;


function authorized(
  request:
    NextRequest
) {
  const expected =
    process.env
      .INTERNAL_API_KEY
      ?.trim();

  const supplied =
    request.headers
      .get(
        "x-api-key"
      )
      ?.trim();

  return Boolean(
    expected &&
    supplied &&
    expected ===
      supplied
  );
}


function targetGameStatsId(
  request:
    NextRequest
) {
  const raw =
    request.nextUrl
      .searchParams
      .get(
        "gameStatsId"
      );

  const parsed =
    Number.parseInt(
      raw ?? "",
      10
    );

  return (
    raw &&
    Number.isSafeInteger(
      parsed
    ) &&
    parsed >
      0
  )
    ? parsed
    : null;
}


export async function POST(
  request:
    NextRequest
) {
  if (
    !authorized(
      request
    )
  ) {
    return NextResponse
      .json(
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

  const gameStatsId =
    targetGameStatsId(
      request
    );

  if (
    gameStatsId ===
      null
  ) {
    return NextResponse
      .json(
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

  const apply =
    request.nextUrl
      .searchParams
      .get(
        "apply"
      ) ===
    "1";

  const prisma =
    getPrisma();

  if (!apply) {
    const plan =
      await planTargetedReplayRosterRecovery(
        prisma,
        gameStatsId
      );

    return NextResponse
      .json({
        ok:
          plan !==
          null,

        dryRun:
          true,

        gameStatsId,

        plan,

        nextAction:
          plan
            ?.status ===
            "eligible"
            ? "apply_targeted_roster_recovery"
            : plan
                ?.status ===
                "already_applied" ||
              plan
                ?.status ===
                "not_required"
              ? "run_terminal_result_reconciliation"
              : "resolve_plan_blockers",

        authorityBoundary: {
          databaseWrites:
            0,

          rosterChanges:
            0,

          resultChanges:
            0,

          marketChanges:
            0,

          bettingAuthority:
            false,

          settlementAuthority:
            false,

          woloAuthority:
            false,
        },
      });
  }

  const actorUid =
    process.env
      .REPLAY_AUTO_RECOVERY_REQUESTED_BY_UID
      ?.trim();

  if (!actorUid) {
    return NextResponse
      .json(
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

  const result =
    await applyTargetedReplayRosterRecovery(
      prisma,
      gameStatsId,
      actorUid
    );

  return NextResponse
    .json({
      ok:
        result.outcome !==
          "blocked",

      dryRun:
        false,

      gameStatsId,

      result,

      nextAction:
        result.outcome ===
          "blocked"
          ? "resolve_plan_blockers"
          : "run_terminal_result_reconciliation",

      authorityBoundary: {
        rosterMutation:
          result.outcome ===
            "applied",

        replayRosterPromotion:
          result.outcome ===
            "applied",

        resultChanges:
          0,

        marketChanges:
          0,

        bettingAuthority:
          false,

        settlementAuthority:
          false,

        woloAuthority:
          false,
      },
    }, {
      status:
        result.outcome ===
          "blocked"
          ? 409
          : 200,
    });
}
