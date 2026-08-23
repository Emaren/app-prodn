import { NextRequest, NextResponse } from "next/server";

import {
  loadChallengeHubSnapshot,
  loadChallengeTileById,
} from "@/lib/challenges";
import {
  buildChallengeEconomySurface,
} from "@/lib/challengeEconomy";
import {
  parseChallengeAction,
  type ChallengeActorRole,
  type ChallengeMutationPayload,
} from "@/lib/challenge/domain/contracts";
import {
  acceptChallenge,
  cancelChallenge,
  checkInChallenge,
  completeChallengeManually,
  confirmChallengeTime,
  declineChallenge,
  fundChallenge,
  rescheduleChallenge,
  resolveChallengeDesync,
  resolveChallengeNoShow,
} from "@/lib/challenge/domain/commands";
import {
  recordChallengeActivity,
} from "@/lib/challenge/domain/activity";
import {
  ChallengeConflictError,
} from "@/lib/challenge/domain/errors";
import { ChallengeDesyncError } from "@/lib/desyncChallenge";
import { postChallengeCommissionerNotice, postChallengeInboxNotice } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  isAdmin: true,
} as const;

const SCHEDULED_MATCH_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  timingMode: true,
  acceptBy: true,
  fundBy: true,
  playBy: true,
  matchTime: true,
  matchTimeProposedByUserId: true,
  matchTimeConfirmedAt: true,
  expiredAt: true,
  reconciledAt: true,
  creationRequestId: true,
  challengeNote: true,
  acceptedAt: true,
  declinedAt: true,
  cancelledAt: true,
  wagerAmountWolo: true,
  guaranteeAmountWolo: true,
  challengerFundingTxHash: true,
  challengerFundingWalletAddress: true,
  challengerFundedAt: true,
  challengedFundingTxHash: true,
  challengedFundingWalletAddress: true,
  challengedFundedAt: true,
  challengerCheckedInAt: true,
  challengedCheckedInAt: true,
  liveConfirmedAt: true,
  resultAt: true,
  settlementReadyAt: true,
  linkedSessionKey: true,
  linkedMapName: true,
  linkedWinner: true,
  linkedDurationSeconds: true,
  challengerUserId: true,
  challengedUserId: true,
  challenger: {
    select: VIEWER_SELECT,
  },
  challenged: {
    select: VIEWER_SELECT,
  },
} as const;

function playerName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function formatWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatScheduledAtForInbox(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function buildChallengeLabel({
  challengerName,
  challengedName,
}: {
  challengerName: string;
  challengedName: string;
}) {
  return `${challengerName} vs ${challengedName}`;
}

async function requireViewer(request: NextRequest) {
  const sessionUid = await getSessionUid(request);
  if (!sessionUid) {
    return { error: NextResponse.json({ detail: "No active session" }, { status: 401 }) };
  }

  const prisma = getPrisma();
  const viewer = await prisma.user.findUnique({
    where: { uid: sessionUid },
    select: VIEWER_SELECT,
  });

  if (!viewer) {
    return { error: NextResponse.json({ detail: "Viewer not found" }, { status: 404 }) };
  }

  return { prisma, viewer };
}

function computeChallengeSurface(
  scheduledMatch: {
    status: string;
    scheduledAt: Date;
    timingMode: string;
    matchTime: Date | null;
    acceptedAt: Date | null;
    resultAt: Date | null;
    liveConfirmedAt: Date | null;
    settlementReadyAt: Date | null;
    wagerAmountWolo: number;
    guaranteeAmountWolo: number;
    challengerFundedAt: Date | null;
    challengerFundingTxHash: string | null;
    challengerFundingWalletAddress: string | null;
    challengedFundedAt: Date | null;
    challengedFundingTxHash: string | null;
    challengedFundingWalletAddress: string | null;
    challengerCheckedInAt: Date | null;
    challengedCheckedInAt: Date | null;
  },
  now = new Date()
) {
  return buildChallengeEconomySurface(
    {
      status: scheduledMatch.status,
      scheduledAt: scheduledMatch.scheduledAt,
      timingMode: scheduledMatch.timingMode,
      matchTime: scheduledMatch.matchTime,
      acceptedAt: scheduledMatch.acceptedAt,
      resultAt: scheduledMatch.resultAt,
      liveConfirmedAt: scheduledMatch.liveConfirmedAt,
      settlementReadyAt: scheduledMatch.settlementReadyAt,
      wagerAmountWolo: scheduledMatch.wagerAmountWolo,
      guaranteeAmountWolo: scheduledMatch.guaranteeAmountWolo,
      challengerFundedAt: scheduledMatch.challengerFundedAt,
      challengerFundingTxHash: scheduledMatch.challengerFundingTxHash,
      challengerFundingWalletAddress: scheduledMatch.challengerFundingWalletAddress,
      challengedFundedAt: scheduledMatch.challengedFundedAt,
      challengedFundingTxHash: scheduledMatch.challengedFundingTxHash,
      challengedFundingWalletAddress: scheduledMatch.challengedFundingWalletAddress,
      challengerCheckedInAt: scheduledMatch.challengerCheckedInAt,
      challengedCheckedInAt: scheduledMatch.challengedCheckedInAt,
    },
    now
  );
}

function totalFundingWolo(scheduledMatch: {
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
}) {
  return scheduledMatch.wagerAmountWolo + scheduledMatch.guaranteeAmountWolo;
}

function challengeTimingNoticeLines(matchTime: Date | null) {
  return matchTime
    ? [
        `Start: ${formatScheduledAtForInbox(matchTime)}`,
        `Start ISO: ${matchTime.toISOString()}`,
      ]
    : ["Play: Anytime after both sides fund"];
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) return viewerState.error;
    const { prisma, viewer } = viewerState;
    const { id } = await context.params;
    const challengeId = Number.parseInt(id, 10);
    if (!Number.isSafeInteger(challengeId) || challengeId <= 0) {
      return NextResponse.json({ detail: "Challenge id is invalid." }, { status: 400 });
    }

    const access = await prisma.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: { challengerUserId: true, challengedUserId: true },
    });
    if (!access) {
      return NextResponse.json({ detail: "Scheduled match not found." }, { status: 404 });
    }
    if (
      !viewer.isAdmin &&
      viewer.id !== access.challengerUserId &&
      viewer.id !== access.challengedUserId
    ) {
      return NextResponse.json({ detail: "You are not part of this scheduled match." }, { status: 403 });
    }

    const match = await loadChallengeTileById(prisma, challengeId);
    if (!match) {
      return NextResponse.json({ detail: "Scheduled match not found." }, { status: 404 });
    }
    await postChallengeCommissionerNotice(prisma, challengeId).catch((error) => {
      console.error(`Failed to retry commissioner notice for challenge #${challengeId}:`, error);
    });
    return NextResponse.json({ match, serverNow: new Date().toISOString() });
  } catch (error) {
    console.error("Failed to load scheduled match room:", error);
    return NextResponse.json({ detail: "Challenge room unavailable." }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const { id } = await context.params;
    const challengeId = Number.parseInt(id, 10);

    if (!Number.isFinite(challengeId)) {
      return NextResponse.json({ detail: "Challenge id is invalid." }, { status: 400 });
    }

    const payload =
      (
        await request
          .json()
          .catch(
            () => ({}),
          )
      ) as ChallengeMutationPayload;

    const scheduledMatch = await prisma.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: SCHEDULED_MATCH_SELECT,
    });

    if (!scheduledMatch) {
      return NextResponse.json({ detail: "Scheduled match not found." }, { status: 404 });
    }

    const viewerIsChallenger = scheduledMatch.challengerUserId === viewer.id;
    const viewerIsChallenged = scheduledMatch.challengedUserId === viewer.id;

    if (!viewerIsChallenger && !viewerIsChallenged && !viewer.isAdmin) {
      return NextResponse.json({ detail: "You are not part of this scheduled match." }, { status: 403 });
    }

    const challengerName = playerName(scheduledMatch.challenger);
    const challengedName = playerName(scheduledMatch.challenged);
    const challengeLabel = buildChallengeLabel({ challengerName, challengedName });
    const currentSurface = computeChallengeSurface(scheduledMatch);
    const fundingTotal = totalFundingWolo(scheduledMatch);
    const viewerRole:
      ChallengeActorRole =
        viewerIsChallenger
          ? "challenger"
          : viewerIsChallenged
          ? "challenged"
          : "admin";

    const action =
      parseChallengeAction(
        payload.action,
      );

    if (!action) {
      return NextResponse.json(
        {
          detail:
            "Unknown challenge action.",
        },
        {
          status:
            400,
        },
      );
    }

    if (action === "room_message") {
      const message =
        typeof payload.message === "string"
          ? payload.message.trim()
          : "";

      if (!message) {
        return NextResponse.json(
          { detail: "Write a Match Room message first." },
          { status: 400 }
        );
      }

      if (message.length > 2_000) {
        return NextResponse.json(
          { detail: "Match Room messages must be 2,000 characters or shorter." },
          { status: 413 }
        );
      }

      await recordChallengeActivity(prisma, {
        scheduledMatchId: challengeId,
        actorUserId: viewer.id,
        eventType: "room_message",
        metadata: {
          message,
          publicMatchRoom: true,
        },
        createdAt: new Date(),
      });

      return NextResponse.json({ ok: true });
    }

    if (
      action === "desync_rematch" ||
      action === "desync_void_refund"
    ) {
      const desyncResolution =
        await resolveChallengeDesync(
          {
            prisma,

            challengeId,

            actor: {
              uid:
                viewer.uid,

              isAdmin:
                viewer.isAdmin,
            },

            request: {
              action,

              desyncIncidentId:
                payload.desyncIncidentId,

              idempotencyKey:
                payload.idempotencyKey,

              rematchAt:
                payload.rematchAt,

              note:
                payload.note,
            },
          },
        );

      const refreshed =
        await loadChallengeHubSnapshot(
          prisma,
          viewer.uid,
        );

      return NextResponse.json(
        {
          ...refreshed,
          desyncResolution,
        },
      );
    }

    const lifecycleTransitionContext = {
      prisma,
      challengeId,

      actor: {
        id:
          viewer.id,

        uid:
          viewer.uid,

        name:
          playerName(
            viewer,
          ),

        role:
          viewerRole,

        isAdmin:
          viewer.isAdmin,
      },

      match:
        scheduledMatch,

      displayState:
        currentSurface.displayState,

      fundingTotal,

      challengerName,

      challengedName,

      challengeLabel,
    };

    if (action === "accept") {
      await acceptChallenge(
        lifecycleTransitionContext,
      );
    }

    if (action === "decline") {
      await declineChallenge(
        lifecycleTransitionContext,
      );
    }

    if (action === "cancel") {
      await cancelChallenge(
        lifecycleTransitionContext,
      );
    }

    if (action === "reschedule") {
      await rescheduleChallenge(
        {
          ...lifecycleTransitionContext,

          request: {
            matchTime:
              payload.matchTime,

            scheduledAt:
              payload.scheduledAt,

            challengeNote:
              payload.challengeNote,

            wagerAmountWolo:
              payload.wagerAmountWolo,

            guaranteeAmountWolo:
              payload.guaranteeAmountWolo,
          },
        },
      );
    }

    if (action === "confirm_time") {
      await confirmChallengeTime(
        lifecycleTransitionContext,
      );
    }

    if (action === "fund") {
      await fundChallenge(
        {
          ...lifecycleTransitionContext,

          request: {
            fundingTxHash:
              payload.fundingTxHash,

            fundingWalletAddress:
              payload.fundingWalletAddress,
          },
        },
      );
    }

    if (action === "check_in") {
      await checkInChallenge(
        {
          ...lifecycleTransitionContext,

          checkInWindowState:
            currentSurface
              .economy
              .checkInWindowState,
        },
      );
    }

    if (action === "resolve_no_show") {
      await resolveChallengeNoShow(
        lifecycleTransitionContext,
      );
    }

    if (action === "mark_completed") {
      await completeChallengeManually(
        {
          ...lifecycleTransitionContext,

          currentDisplayState:
            currentSurface.displayState,

          canonicalReplay: {
            linkedSessionKey:
              scheduledMatch.linkedSessionKey,

            linkedMapName:
              scheduledMatch.linkedMapName,

            linkedWinner:
              scheduledMatch.linkedWinner,

            linkedDurationSeconds:
              scheduledMatch.linkedDurationSeconds,
          },

          request: {
            linkedSessionKey:
              payload.linkedSessionKey,

            linkedMapName:
              payload.linkedMapName,

            linkedWinner:
              payload.linkedWinner,

            linkedDurationSeconds:
              payload.linkedDurationSeconds,
          },
        },
      );
    }

    await postChallengeCommissionerNotice(prisma, challengeId).catch((error) => {
      console.error(`Failed to notify commissioner for challenge #${challengeId}:`, error);
    });
    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update scheduled match:", error);
    if (error instanceof ChallengeConflictError) {
      return NextResponse.json({ detail: error.message }, { status: error.status });
    }
    if (error instanceof ChallengeDesyncError) {
      return NextResponse.json(
        { detail: error.message, code: error.code },
        { status: error.status }
      );
    }
    const detail = error instanceof Error ? error.message : "Challenge update failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
