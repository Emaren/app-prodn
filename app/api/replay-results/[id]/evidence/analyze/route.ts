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

const AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS =
  9000;

function autoVerdictRecord(
  value: unknown
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function autoVerdictStringArray(
  value: unknown
) {
  return Array.isArray(value)
    ? value
        .map((entry) =>
          typeof entry === "string"
            ? entry.trim()
            : ""
        )
        .filter(Boolean)
    : [];
}

function autoVerdictAssessmentConfirmed(
  observation:
    | {
        value: unknown;
        confidenceBps: number | null;
      }
    | undefined
) {
  if (!observation) {
    return false;
  }

  const value =
    autoVerdictRecord(
      observation.value
    );

  const status =
    typeof value?.status ===
      "string"
      ? value.status
          .trim()
          .toLowerCase()
      : "";

  /*
   * Screenshot analysis distinguishes between:
   *
   * confirmed:
   *   explicit, directly conclusive evidence
   *
   * observed:
   *   materially visible evidence with a confidence score
   *
   * A high-confidence OBSERVED assessment is eligible for
   * automatic promotion only because the stronger canonical
   * checks below still require:
   *
   *   - complete mapped roster
   *   - complete mapped teams
   *   - mapped winning player keys
   *   - winner exactly matching one team
   *   - no existing durable verdict
   *   - no human-confirmed desync
   *
   * conflict / unclear / not_visible remain ineligible.
   */
  const eligibleStatus =
    status === "confirmed" ||
    status === "observed";

  return (
    eligibleStatus &&
    (
      observation.confidenceBps ??
      0
    ) >=
      AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS
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

  const teamAssessment =
    byPath.get(
      "evidence.team_composition"
    );

  const winnerAssessment =
    byPath.get(
      "evidence.winner_loser"
    );

  const winningKeysObservation =
    byPath.get(
      "result.winning_player_keys"
    );

  const teamsObservation =
    byPath.get(
      "teams.resolution"
    );

  if (
    !autoVerdictAssessmentConfirmed(
      teamAssessment
    ) ||
    !autoVerdictAssessmentConfirmed(
      winnerAssessment
    )
  ) {
    return {
      outcome: "review_required",
      reason:
        "team_or_winner_not_confirmed_at_90_percent",
    };
  }

  if (
    !winningKeysObservation ||
    (
      winningKeysObservation
        .confidenceBps ??
      0
    ) <
      AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS ||
    !teamsObservation ||
    (
      teamsObservation
        .confidenceBps ??
      0
    ) <
      AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS
  ) {
    return {
      outcome: "review_required",
      reason:
        "canonical_result_mapping_below_90_percent",
    };
  }

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
      outcome: "existing_verdict",
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
      outcome: "review_required",
      reason:
        "confirmed_desync_incident",
    };
  }

  const reviewGame =
    state.game;

  const winningPlayerKeys =
    autoVerdictStringArray(
      winningKeysObservation.value
    );

  const teamsValue =
    autoVerdictRecord(
      teamsObservation.value
    );

  const rawTeams =
    Array.isArray(
      teamsValue?.teams
    )
      ? teamsValue.teams
      : [];

  const evidenceTeams =
    rawTeams
      .map((entry) => {
        const team =
          autoVerdictRecord(
            entry
          );

        return autoVerdictStringArray(
          team?.player_keys
        );
      })
      .filter(
        (playerKeys) =>
          playerKeys.length >
          0
      );

  /*
   * Winner markets are always two opposing sides:
   * 1v1 / 2v2 / 3v3 / 4v4.
   */
  if (
    evidenceTeams.length !==
    2
  ) {
    return {
      outcome: "review_required",
      reason:
        "screenshot_team_count_not_two",
    };
  }

  const canonicalKeys =
    reviewGame.canonicalRoster
      .map(
        (player) =>
          player.stablePlayerKey
      )
      .sort();

  const assignedKeys =
    [
      ...new Set(
        evidenceTeams.flat()
      ),
    ].sort();

  const completeRoster =
    canonicalKeys.length ===
      assignedKeys.length &&
    canonicalKeys.every(
      (key, index) =>
        key ===
        assignedKeys[index]
    );

  if (!completeRoster) {
    return {
      outcome: "review_required",
      reason:
        "screenshot_roster_not_exactly_canonical",
    };
  }

  if (
    winningPlayerKeys.length <
    1
  ) {
    return {
      outcome: "review_required",
      reason:
        "winning_player_keys_missing",
    };
  }

  const winningTeamIndex =
    evidenceTeams.findIndex(
      (playerKeys) =>
        playerKeys.length ===
          winningPlayerKeys.length &&
        winningPlayerKeys.every(
          (key) =>
            playerKeys.includes(
              key
            )
        )
    );

  if (
    winningTeamIndex ===
    -1
  ) {
    return {
      outcome: "review_required",
      reason:
        "winning_players_do_not_exactly_match_one_team",
    };
  }

  const teams =
    evidenceTeams.map(
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
      winningTeamIndex
    ].teamKey;

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
        reason:
          "High-confidence postgame screenshot evidence confirmed the complete teams and victorious side.",
        evidence: {
          submittedVia:
            "automatic_screenshot_evidence_policy",
          policyVersion:
            "screenshot-auto-verdict-v1",
          parseRunId,
          minimumConfidenceBps:
            AUTO_SCREENSHOT_VERDICT_CONFIDENCE_BPS,
          teamConfidenceBps:
            teamAssessment
              ?.confidenceBps ??
            null,
          winnerConfidenceBps:
            winnerAssessment
              ?.confidenceBps ??
            null,
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
      outcome: "review_required",
      reason:
        "adjudication_not_accepted",
      adjudicationId:
        submitted.adjudication.id,
    };
  }

  return {
    outcome: "adjudicated",
    adjudicationId:
      submitted.adjudication.id,
    parseRunId,
    winningTeamKey,
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
