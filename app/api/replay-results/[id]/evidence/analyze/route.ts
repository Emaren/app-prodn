import {
  NextRequest,
  NextResponse,
} from "next/server";

import { ensureBetMarkets } from "@/lib/bets";
import { getPrisma } from "@/lib/prisma";
import {
  loadReplayResultReviewState,
  ReplayResultReviewError,
  requireReplayResultReviewAccess,
  submitReplayResultAdjudication,
} from "@/lib/replayResultAdjudications";
import {
  analyzeReplayScreenshotEvidence,
  ReplayScreenshotEvidenceError,
} from "@/lib/replayScreenshotEvidence";
import {
  AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS,
  resolveScreenshotAutoVerdictEvidence,
} from "@/lib/screenshotAutoVerdictPolicy";
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

async function maybeAutoAdjudicateScreenshotEvidence(
  prisma: ReturnType<typeof getPrisma>,
  viewerUid: string,
  gameStatsId: number,
  parseRunId: number
): Promise<Record<string, unknown>> {
  const observations =
    await prisma.replayObservation.findMany({
      where: {
        parseRunId,
        fieldPath: {
          in: [
            "evidence.team_composition",
            "evidence.winner_loser",
            "result.winning_player_keys",
            "teams.resolution",
          ],
        },
      },
      select: {
        fieldPath: true,
        value: true,
        confidenceBps: true,
      },
    });

  const byPath =
    new Map(
      observations.map(
        (observation) => [
          observation.fieldPath,
          observation,
        ]
      )
    );

  const state =
    await loadReplayResultReviewState(
      prisma,
      viewerUid,
      gameStatsId
    );

  /*
   * Never silently replace an existing durable verdict.
   */
  if (
    state.adjudications.length >
    0
  ) {
    return {
      outcome:
        "existing_verdict",
      adjudicationId:
        state.adjudications[0]?.id ??
        null,
    };
  }

  /*
   * Winner evidence does not override an already-confirmed
   * human desync ruling.
   */
  if (
    state.currentDesyncIncident
      ?.desyncOccurred ===
    true
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "confirmed_desync_incident",
    };
  }

  const reviewGame =
    state.game;

  const resolution =
    resolveScreenshotAutoVerdictEvidence({
      teamAssessment:
        byPath.get(
          "evidence.team_composition"
        ),
      winnerAssessment:
        byPath.get(
          "evidence.winner_loser"
        ),
      winningKeysObservation:
        byPath.get(
          "result.winning_player_keys"
        ),
      teamsObservation:
        byPath.get(
          "teams.resolution"
        ),
      canonicalRoster:
        reviewGame.canonicalRoster.map(
          (player) => ({
            stablePlayerKey:
              player.stablePlayerKey,
            normalizedName:
              player.normalizedName,
          })
        ),
    });

  if (
    resolution.outcome ===
    "review_required"
  ) {
    return resolution;
  }

  const teams =
    resolution.evidenceTeams.map(
      (playerKeys, index) => ({
        teamKey:
          index === 0
            ? "gold"
            : "blue",
        playerKeys,
      })
    );

  const winningTeamKey =
    teams[
      resolution.winningTeamIndex
    ].teamKey;

  const reason =
    resolution.teamResolutionMode ===
      "canonical_duel_singletons"
      ? "High-confidence explicit postgame winner evidence confirmed a canonical two-player duel; the two canonical participants were resolved as opposing singleton sides."
      : "High-confidence postgame screenshot evidence confirmed the complete teams and victorious side.";

  const submitted =
    await submitReplayResultAdjudication({
      prisma,
      viewerUid,
      gameStatsId,
      payload: {
        idempotencyKey:
          `evidence:auto:${gameStatsId}:${parseRunId}`,
        sourceReplayHash:
          reviewGame.replayHash,
        sourceParseIteration:
          reviewGame.parse_iteration,
        sourceRosterHash:
          reviewGame.sourceRosterHash,
        teams,
        winningTeamKey,
        reason,
        evidence: {
          submittedVia:
            "automatic_screenshot_evidence_policy",
          policyVersion:
            "screenshot-auto-verdict-v2",
          parseRunId,
          minimumConfidenceBps:
            AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS,
          teamResolutionMode:
            resolution.teamResolutionMode,
          teamConfidenceBps:
            resolution.teamConfidenceBps,
          winnerConfidenceBps:
            resolution.winnerConfidenceBps,
        },
        supersedesId:
          null,
      },
    });

  if (
    submitted.adjudication
      .decisionStatus !==
    "accepted"
  ) {
    return {
      outcome:
        "review_required",
      reason:
        "adjudication_not_accepted",
      adjudicationId:
        submitted.adjudication.id,
    };
  }

  return {
    outcome:
      "adjudicated",
    adjudicationId:
      submitted.adjudication.id,
    parseRunId,
    winningTeamKey,
    teamResolutionMode:
      resolution.teamResolutionMode,
  };
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

    let autoAdjudication:
      Record<string, unknown> = {
        outcome:
          "evidence_run_unavailable",
      };

    let settlementReconcile:
      Record<string, unknown> = {
        outcome:
          "not_run",
      };

    const parseRunId =
      Number(
        result.run.id
      );

    if (
      Number.isSafeInteger(
        parseRunId
      ) &&
      parseRunId >
        0
    ) {
      try {
        autoAdjudication =
          await maybeAutoAdjudicateScreenshotEvidence(
            prisma,
            viewer.uid,
            gameStatsId,
            parseRunId
          );

        if (
          autoAdjudication
            .outcome ===
          "adjudicated"
        ) {
          try {
            /*
             * This invokes the existing protected market,
             * desync, integrity and settlement rails.
             */
            await ensureBetMarkets(
              prisma
            );

            settlementReconcile = {
              outcome:
                "completed",
            };
          } catch (
            settlementError
          ) {
            console.error(
              "Screenshot verdict saved; immediate bet reconciliation deferred:",
              settlementError
            );

            settlementReconcile = {
              outcome:
                "deferred",
              detail:
                settlementError instanceof
                  Error
                  ? settlementError.message
                  : "Bet reconciliation will retry through the normal betting rail.",
            };
          }
        }
      } catch (
        autoError
      ) {
        console.error(
          "Screenshot evidence auto-adjudication skipped:",
          autoError
        );

        autoAdjudication = {
          outcome:
            "review_required",
          reason:
            autoError instanceof
              Error
              ? autoError.message
              : "automatic_adjudication_failed",
        };
      }
    }

    console.info(
      "AOE2WAR screenshot auto-verdict outcome",
      {
        gameStatsId,
        evidenceOutcome:
          result.outcome,
        evidenceRunId:
          result.run.id,
        autoAdjudication,
        settlementReconcile,
      }
    );

    return json(
      {
        ...result,
        autoAdjudication,
        settlementReconcile,
      },
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
