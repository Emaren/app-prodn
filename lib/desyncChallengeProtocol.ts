import type { Prisma, PrismaClient } from "@/lib/generated/prisma";

import {
  CHALLENGE_DESYNC_REVIEW_STATUS,
  ChallengeDesyncError,
  acquireChallengeDesyncAdvisoryLock,
  appendChallengeDesyncActivity,
  buildChallengeDesyncNotice,
  planBetMarketDesyncDisposition,
  planBetMarketDesyncReview,
  planDesyncCommissionerAction,
  type ChallengeActivityDelegate,
  type DesyncCommissionerAction,
  type DesyncIncidentDecision,
} from "@/lib/desyncChallenge";
import {
  postChallengeCommissionerNotice,
  postChallengeProtocolNoticeToParticipants,
} from "@/lib/contactInbox";
import {
  DESYNC_COMPETITIVE_UNRESOLVED,
  submitReplayDesyncIncident,
  type ReplayDesyncSettlementDisposition,
} from "@/lib/replayDesyncIncidents";
import {
  TERMINAL_TITLE_CHALLENGE_STATUSES,
  TITLE_RESULT_REVIEW_SETTLEMENT_STATUS,
  TITLE_RESULT_REVIEW_STATUS,
} from "@/lib/challengeTitlePolicy";
import {
  executeScheduledMatchSettlement,
  ScheduledMatchSettlementError,
} from "@/lib/scheduledMatchSettlements";

const DESYNC_CORRECTION_EVENT = "desync_human_corrected";
const EXPECTED_REFUND_SKIP_CODES = new Set([
  "ALREADY_SETTLED",
  "NO_FUNDING",
  "NO_TRANSFERS",
  "SETTLEMENT_UNCONFIGURED",
  "EXECUTION_IN_PROGRESS",
]);

export type ReplayDesyncProtocolIncident = DesyncIncidentDecision & {
  competitiveResultStatus: string;
  settlementDisposition: string;
  reviewerUid: string;
  reviewerDisplayName: string;
  sourceReplayHash: string;
  sourceParseIteration: number;
};

function safeDate(value: Date | string) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataDate(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function participantName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function linkedMarketWhere(incident: {
  gameStatsId: number;
  scheduledMatchId: number;
}) {
  return {
    OR: [
      { linkedGameStatsId: incident.gameStatsId },
      { scheduledMatchId: incident.scheduledMatchId },
    ],
  } satisfies Prisma.BetMarketWhereInput;
}

/**
 * Projects an append-only replay incident into mutable protocol state. The
 * incident remains the authority; this projection is intentionally retryable.
 */
export async function applyReplayDesyncIncidentProtocol(
  prisma: PrismaClient,
  incident: ReplayDesyncProtocolIncident
) {
  if (!incident.scheduledMatchId) {
    return { linked: false, activityCreated: false, noticesDelivered: 0 };
  }

  const confirmedAt = safeDate(incident.createdAt);
  const matchResult = await prisma.$transaction(async (tx) => {
    await acquireChallengeDesyncAdvisoryLock(tx, incident.scheduledMatchId!);

    const latestIncident = await tx.replayDesyncIncident.findFirst({
      where: { gameStatsId: incident.gameStatsId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (!latestIncident || latestIncident.id !== incident.id) {
      return {
        match: null,
        activityCreated: false,
        confirmation: false,
        staleProjectionSkipped: true,
      };
    }

    const match = await tx.scheduledMatch.findUnique({
      where: { id: incident.scheduledMatchId! },
      select: {
        id: true,
        status: true,
        settlementReadyAt: true,
        resultAt: true,
        linkedWinner: true,
        challengerUserId: true,
        challengedUserId: true,
        challenger: {
          select: { uid: true, inGameName: true, steamPersonaName: true },
        },
        challenged: {
          select: { uid: true, inGameName: true, steamPersonaName: true },
        },
      },
    });
    if (!match) {
      throw new ChallengeDesyncError(
        "DESYNC_MATCH_NOT_FOUND",
        `Linked Challenge Match #${incident.scheduledMatchId} was not found.`,
        404
      );
    }

    const reviewer = await tx.user.findUnique({
      where: { uid: incident.reviewerUid },
      select: { id: true },
    });

    if (!incident.desyncOccurred) {
      const originalActivity = await tx.scheduledMatchActivity.findFirst({
        where: {
          scheduledMatchId: match.id,
          eventType: "desync_human_confirmed",
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { metadata: true },
      });
      const originalMetadata = metadataRecord(originalActivity?.metadata);
      const previousStatus =
        typeof originalMetadata.previousStatus === "string"
          ? originalMetadata.previousStatus
          : match.resultAt
            ? "completed"
            : "accepted";
      const previousSettlementReadyAt = metadataDate(
        originalMetadata.previousSettlementReadyAt
      );

      await tx.scheduledMatch.updateMany({
        where: { id: match.id, status: CHALLENGE_DESYNC_REVIEW_STATUS },
        data: {
          status: previousStatus,
          settlementReadyAt: previousSettlementReadyAt,
        },
      });
      await tx.trophyChallenge.updateMany({
        where: {
          scheduledMatchId: match.id,
          status: CHALLENGE_DESYNC_REVIEW_STATUS,
        },
        data: {
          status: TITLE_RESULT_REVIEW_STATUS,
          settlementStatus: TITLE_RESULT_REVIEW_SETTLEMENT_STATUS,
          errorState: null,
        },
      });

      const existingCorrection = await tx.scheduledMatchActivity.findFirst({
        where: {
          scheduledMatchId: match.id,
          eventType: DESYNC_CORRECTION_EVENT,
          metadata: {
            path: ["desyncIncidentId"],
            equals: incident.id,
          },
        },
        select: { id: true },
      });
      if (!existingCorrection) {
        await tx.scheduledMatchActivity.create({
          data: {
            scheduledMatchId: match.id,
            actorUserId: reviewer?.id,
            eventType: DESYNC_CORRECTION_EVENT,
            detail:
              "A newer human correction withdrew the active desync flag; the original incident remains in provenance.",
            metadata: {
              desyncIncidentId: incident.id,
              supersedesId: incident.supersedesId ?? null,
              gameStatsId: incident.gameStatsId,
              historicalDesyncPreserved: true,
              restoredStatus: previousStatus,
            },
            createdAt: confirmedAt,
          },
        });
      }

      return {
        match,
        activityCreated: !existingCorrection,
        confirmation: false,
        staleProjectionSkipped: false,
      };
    }

    if (incident.settlementDisposition !== "commissioner_review") {
      return {
        match,
        activityCreated: false,
        confirmation: false,
        staleProjectionSkipped: false,
      };
    }

    const activity = await appendChallengeDesyncActivity({
      activity:
        tx.scheduledMatchActivity as unknown as ChallengeActivityDelegate,
      incident: {
        ...incident,
        reviewerUserId: reviewer?.id ?? null,
      },
      reviewerLabel: incident.reviewerDisplayName,
      contextMetadata: {
        previousStatus: match.status,
        previousSettlementReadyAt: match.settlementReadyAt?.toISOString() ?? null,
        machineLinkedWinner: match.linkedWinner,
      },
    });

    await tx.scheduledMatch.update({
      where: { id: match.id },
      data: {
        status: CHALLENGE_DESYNC_REVIEW_STATUS,
        settlementReadyAt: null,
      },
    });

    const titleChallenges = await tx.trophyChallenge.findMany({
      where: {
        scheduledMatchId: match.id,
        status: { notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES] },
      },
      select: { id: true, trophyId: true },
    });
    if (titleChallenges.length > 0) {
      await tx.trophyChallenge.updateMany({
        where: { id: { in: titleChallenges.map((entry) => entry.id) } },
        data: {
          status: CHALLENGE_DESYNC_REVIEW_STATUS,
          settlementStatus: "desync_commissioner_review",
          winnerUserId: null,
          errorState:
            "Human-confirmed desync. Title, belt, and artifact movement is halted pending commissioner disposition.",
        },
      });

      if (activity.created) {
        for (const titleChallenge of titleChallenges) {
          await tx.trophyEvent.create({
            data: {
              trophyId: titleChallenge.trophyId,
              challengeId: titleChallenge.id,
              replayId: incident.gameStatsId,
              gameId: incident.gameStatsId,
              actorUserId: reviewer?.id,
              actorRole: "site_admin",
              initiatedBy: "human_review",
              eventType: "DESYNC_REVIEW_REQUIRED",
              status: "attention_required",
              rawResponse: {
                desyncIncidentId: incident.id,
                scheduledMatchId: match.id,
                competitiveWinner: null,
                settlementDisposition: "commissioner_review",
                custodyChanged: false,
              },
            },
          });
        }
      }
    }

    await tx.betMarket.updateMany({
      where: {
        ...linkedMarketWhere({
          gameStatsId: incident.gameStatsId,
          scheduledMatchId: match.id,
        }),
        status: { not: "voided" },
        wagers: {
          none: {
            status: { in: ["won", "lost"] },
          },
        },
      },
      data: planBetMarketDesyncReview(confirmedAt),
    });

    return {
      match,
      activityCreated: activity.created,
      confirmation: true,
      staleProjectionSkipped: false,
    };
  });

  let noticesDelivered = 0;
  if (matchResult.confirmation && matchResult.match) {
    const body = buildChallengeDesyncNotice({
      challengeId: matchResult.match.id,
      challengerName: participantName(matchResult.match.challenger),
      challengedName: participantName(matchResult.match.challenged),
      reviewerName: incident.reviewerDisplayName,
      note: incident.note,
    });
    const delivered = await postChallengeProtocolNoticeToParticipants(prisma, {
      challengeId: matchResult.match.id,
      body,
      deliveryKey: `desync-incident:${incident.id}`,
      now: confirmedAt,
    });
    noticesDelivered = delivered.length;
    await postChallengeCommissionerNotice(prisma, matchResult.match.id);
  }

  return {
    linked: true,
    activityCreated: matchResult.activityCreated,
    noticesDelivered,
    staleProjectionSkipped: matchResult.staleProjectionSkipped,
  };
}

export async function resolveChallengeDesyncDisposition(input: {
  prisma: PrismaClient;
  viewerUid: string;
  challengeId: number;
  incidentId: number;
  action: DesyncCommissionerAction;
  idempotencyKey: string;
  rematchAt?: Date | null;
  note?: string | null;
}) {
  const { prisma } = input;
  const [viewer, match, originalIncident] = await Promise.all([
    prisma.user.findUnique({
      where: { uid: input.viewerUid },
      select: { id: true, uid: true, isAdmin: true },
    }),
    prisma.scheduledMatch.findUnique({
      where: { id: input.challengeId },
      select: {
        id: true,
        challengerUserId: true,
        challengedUserId: true,
        challengerFundedAt: true,
        challengedFundedAt: true,
        challenger: {
          select: { uid: true, inGameName: true, steamPersonaName: true },
        },
        challenged: {
          select: { uid: true, inGameName: true, steamPersonaName: true },
        },
        settlements: {
          where: { status: "executed" },
          select: { action: true, txHash: true },
        },
        trophyChallenges: {
          select: { id: true, status: true },
        },
        betMarket: {
          select: {
            id: true,
            wagers: {
              where: { status: { in: ["won", "lost"] } },
              select: { id: true, payoutTxHash: true },
            },
          },
        },
      },
    }),
    prisma.replayDesyncIncident.findUnique({
      where: { id: input.incidentId },
    }),
  ]);

  if (!viewer?.isAdmin) {
    throw new ChallengeDesyncError(
      "DESYNC_ADMIN_REQUIRED",
      "Only a site admin can resolve a confirmed desync.",
      403
    );
  }
  if (!match) {
    throw new ChallengeDesyncError(
      "DESYNC_MATCH_NOT_FOUND",
      "Challenge Match not found.",
      404
    );
  }
  if (
    !originalIncident ||
    originalIncident.scheduledMatchId !== match.id ||
    !originalIncident.desyncOccurred
  ) {
    throw new ChallengeDesyncError(
      "DESYNC_INCIDENT_REQUIRED",
      "The selected human-confirmed desync does not belong to this match."
    );
  }

  const hasExecutedWinnerSettlement =
    match.settlements.some((entry) =>
      /winner|wager_award|guarantee_awarded/.test(entry.action)
    ) || Boolean(match.betMarket?.wagers.length);
  const hasExecutedTitleTransfer = match.trophyChallenges.some(
    (entry) => entry.status === "settled"
  );
  const now = new Date();
  const originalDecision: DesyncIncidentDecision = {
    ...originalIncident,
    decisionStatus: "accepted",
  };
  const plan = planDesyncCommissionerAction({
    action: input.action,
    isAdmin: viewer.isAdmin,
    incident: originalDecision,
    now,
    rematchAt: input.rematchAt ?? null,
    bothParticipantsFunded: Boolean(
      match.challengerFundedAt && match.challengedFundedAt
    ),
    hasExecutedWinnerSettlement,
    hasExecutedTitleTransfer,
  });

  const appended = await submitReplayDesyncIncident({
    prisma,
    viewerUid: viewer.uid,
    gameStatsId: originalIncident.gameStatsId,
    payload: {
      idempotencyKey: input.idempotencyKey,
      sourceReplayHash: originalIncident.sourceReplayHash,
      sourceParseIteration: originalIncident.sourceParseIteration,
      desyncOccurred: true,
      competitiveResultStatus: DESYNC_COMPETITIVE_UNRESOLVED,
      settlementDisposition:
        plan.nextIncidentDisposition as ReplayDesyncSettlementDisposition,
      note: input.note ?? null,
      supersedesId: originalIncident.id,
      scheduledMatchId: match.id,
    },
  });
  const resolutionIncident = appended.incident;

  const applied = await prisma.$transaction(async (tx) => {
    await acquireChallengeDesyncAdvisoryLock(tx, match.id);
    const existingActivity = await tx.scheduledMatchActivity.findFirst({
      where: {
        scheduledMatchId: match.id,
        eventType: plan.activity.eventType,
        metadata: {
          path: ["resolutionIncidentId"],
          equals: resolutionIncident.id,
        },
      },
      select: { id: true },
    });
    if (existingActivity) return false;

    await tx.scheduledMatch.update({
      where: { id: match.id },
      data: plan.scheduledMatchData,
    });
    await tx.scheduledMatchActivity.create({
      data: {
        scheduledMatchId: match.id,
        actorUserId: viewer.id,
        eventType: plan.activity.eventType,
        detail: plan.activity.detail,
        metadata: {
          ...plan.activity.metadata,
          originalDesyncIncidentId: originalIncident.id,
          resolutionIncidentId: resolutionIncident.id,
          dispositionRecordedByUid: viewer.uid,
        },
        createdAt: plan.activity.createdAt,
      },
    });

    if (input.action === "rematch") {
      await tx.trophyChallenge.updateMany({
        where: {
          scheduledMatchId: match.id,
          status: { notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES] },
        },
        data: {
          status: "accepted",
          settlementStatus: "awaiting_rematch_result",
          winnerUserId: null,
          replayId: null,
          gameId: null,
          watcherSessionId: null,
          errorState: null,
        },
      });
    } else {
      await tx.trophyChallenge.updateMany({
        where: {
          scheduledMatchId: match.id,
          status: { notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES] },
        },
        data: {
          status: "cancelled",
          settlementStatus: "cancelled",
          winnerUserId: null,
          errorState: null,
        },
      });
    }

    await tx.betMarket.updateMany({
      where: linkedMarketWhere({
        gameStatsId: originalIncident.gameStatsId,
        scheduledMatchId: match.id,
      }),
      data: planBetMarketDesyncDisposition(input.action, now),
    });

    return true;
  });

  const participantNotice =
    input.action === "rematch"
      ? [
          "Challenge rescheduled",
          `${participantName(match.challenger)} vs ${participantName(match.challenged)}`,
          `Challenge ID: #${match.id}`,
          `New start: ${input.rematchAt?.toISOString() ?? "Pending"}`,
          `New start ISO: ${input.rematchAt?.toISOString() ?? ""}`,
          "Status: DESYNC rematch ordered · original incident preserved",
        ].join("\n")
      : [
          "Challenge cancelled",
          `${participantName(match.challenger)} vs ${participantName(match.challenged)}`,
          `Challenge ID: #${match.id}`,
          "Status: DESYNC void & refund queued",
          "Refund: Pending authenticated settlement proof",
        ].join("\n");
  await postChallengeProtocolNoticeToParticipants(prisma, {
    challengeId: match.id,
    body: participantNotice,
    deliveryKey: `desync-resolution:${resolutionIncident.id}`,
    now,
  });
  await postChallengeCommissionerNotice(prisma, match.id);

  let refundExecution:
    | { state: "not_requested" | "executed" | "queued"; detail: string | null }
    = { state: "not_requested", detail: null };
  if (plan.executeRefundSettlement) {
    const expectedRefundProofCount =
      Number(Boolean(match.challengerFundedAt)) +
      Number(Boolean(match.challengedFundedAt));
    const provenRefunds = match.settlements.filter(
      (entry) => /_full_refund$/.test(entry.action) && Boolean(entry.txHash)
    );
    if (
      expectedRefundProofCount > 0 &&
      provenRefunds.length >= expectedRefundProofCount
    ) {
      refundExecution = {
        state: "executed",
        detail: "Persisted settlement rows include chain proof for every funded participant refund.",
      };
    } else {
      try {
        const execution = await executeScheduledMatchSettlement(
          prisma,
          match.id,
          viewer.id
        );
        refundExecution = {
          state: execution.ok ? "executed" : "queued",
          detail: execution.plan.stateDetail,
        };
      } catch (error) {
        if (
          error instanceof ScheduledMatchSettlementError &&
          EXPECTED_REFUND_SKIP_CODES.has(error.code)
        ) {
          refundExecution = { state: "queued", detail: error.message };
        } else {
          throw error;
        }
      }
    }
  }

  return {
    action: input.action,
    applied,
    incident: resolutionIncident,
    incidentCreated: appended.created,
    refundExecution,
  };
}
