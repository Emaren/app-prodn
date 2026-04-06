import { NextRequest, NextResponse } from "next/server";

import {
  loadChallengeHubSnapshot,
  normalizeChallengeNote,
  parseScheduledMatchDate,
} from "@/lib/challenges";
import { postDirectInboxMessage } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const ACTIVE_SCHEDULED_MATCH_STATUSES = ["pending", "accepted"] as const;
const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const EXISTING_MATCH_LOOKBACK_MS = 12 * 60 * 60 * 1000;

const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
} as const;

function playerName(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
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

function buildAcceptanceMessage({
  challengerName,
  challengedName,
  scheduledAt,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
}) {
  return [
    "Challenge accepted",
    `${challengerName} vs ${challengedName}`,
    `Start: ${formatScheduledAtForInbox(scheduledAt)}`,
    "Status: Ready",
  ].join("\n");
}

function buildDeclineMessage({
  challengerName,
  challengedName,
  scheduledAt,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
}) {
  return [
    "Challenge declined",
    `${challengerName} vs ${challengedName}`,
    `Start: ${formatScheduledAtForInbox(scheduledAt)}`,
    "Status: Declined",
  ].join("\n");
}

function buildCancellationMessage({
  challengerName,
  challengedName,
  scheduledAt,
  cancelledByName,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  cancelledByName: string;
}) {
  return [
    "Challenge cancelled",
    `${challengerName} vs ${challengedName}`,
    `Start: ${formatScheduledAtForInbox(scheduledAt)}`,
    `Cancelled by: ${cancelledByName}`,
    "Status: Cancelled",
  ].join("\n");
}

function buildRescheduleMessage({
  challengerName,
  challengedName,
  scheduledAt,
  challengeNote,
  updatedByName,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  challengeNote: string | null;
  updatedByName: string;
}) {
  const lines = [
    "Challenge rescheduled",
    `${challengerName} vs ${challengedName}`,
    `New start: ${formatScheduledAtForInbox(scheduledAt)}`,
    `Updated by: ${updatedByName}`,
    "Status: Awaiting acceptance",
  ];

  if (challengeNote) {
    lines.push(`Note: ${challengeNote}`);
  }

  return lines.join("\n");
}

function validateScheduledAtWindow(scheduledAt: Date) {
  const now = Date.now();

  if (scheduledAt.getTime() < now + SCHEDULE_WINDOW_MIN_MS) {
    return "Schedule the game at least two minutes ahead.";
  }

  if (scheduledAt.getTime() > now + SCHEDULE_WINDOW_MAX_MS) {
    return "Keep scheduled matches inside the next seven days for now.";
  }

  return null;
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

    const payload = (await request.json().catch(() => ({}))) as {
      action?: string;
      scheduledAt?: string;
      challengeNote?: string;
    };

    const scheduledMatch = await prisma.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        challengerUserId: true,
        challengedUserId: true,
        acceptedAt: true,
        declinedAt: true,
        cancelledAt: true,
        challengeNote: true,
        challenger: {
          select: VIEWER_SELECT,
        },
        challenged: {
          select: VIEWER_SELECT,
        },
      },
    });

    if (!scheduledMatch) {
      return NextResponse.json({ detail: "Scheduled match not found." }, { status: 404 });
    }

    const viewerIsChallenger = scheduledMatch.challengerUserId === viewer.id;
    const viewerIsChallenged = scheduledMatch.challengedUserId === viewer.id;

    if (!viewerIsChallenger && !viewerIsChallenged) {
      return NextResponse.json({ detail: "You are not part of this scheduled match." }, { status: 403 });
    }

    if (
      payload.action !== "accept" &&
      payload.action !== "decline" &&
      payload.action !== "cancel" &&
      payload.action !== "reschedule"
    ) {
      return NextResponse.json({ detail: "Unknown challenge action." }, { status: 400 });
    }

    const challengerName = playerName(scheduledMatch.challenger);
    const challengedName = playerName(scheduledMatch.challenged);
    const challengeLabel = buildChallengeLabel({ challengerName, challengedName });

    if (payload.action === "accept") {
      if (!viewerIsChallenged) {
        return NextResponse.json(
          { detail: "Only the challenged player can accept this match." },
          { status: 403 }
        );
      }

      if (scheduledMatch.status !== "pending") {
        return NextResponse.json(
          { detail: "This challenge is no longer awaiting acceptance." },
          { status: 409 }
        );
      }

      const acceptedAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "accepted",
            acceptedAt,
            declinedAt: null,
            cancelledAt: null,
          },
        });

        await postDirectInboxMessage(tx, {
          senderUserId: viewer.id,
          targetUserId: scheduledMatch.challengerUserId,
          body: buildAcceptanceMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
          }),
          now: acceptedAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_accepted",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            role: "challenger",
            acceptedByUid: viewer.uid,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_accepted",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            role: "challenged",
            acceptedByUid: viewer.uid,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
          },
        });
      });
    }

    if (payload.action === "decline") {
      if (!viewerIsChallenged) {
        return NextResponse.json(
          { detail: "Only the challenged player can decline this match." },
          { status: 403 }
        );
      }

      if (scheduledMatch.status !== "pending") {
        return NextResponse.json(
          { detail: "This challenge is no longer awaiting acceptance." },
          { status: 409 }
        );
      }

      const declinedAt = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "declined",
            declinedAt,
          },
        });

        await postDirectInboxMessage(tx, {
          senderUserId: viewer.id,
          targetUserId: scheduledMatch.challengerUserId,
          body: buildDeclineMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
          }),
          now: declinedAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_declined",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            role: "challenger",
            declinedByUid: viewer.uid,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_declined",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            role: "challenged",
            declinedByUid: viewer.uid,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
          },
        });
      });
    }

    if (payload.action === "cancel") {
      if (
        scheduledMatch.status !== "pending" &&
        scheduledMatch.status !== "accepted"
      ) {
        return NextResponse.json(
          { detail: "Only active scheduled matches can be cancelled." },
          { status: 409 }
        );
      }

      if (scheduledMatch.status === "pending" && !viewerIsChallenger) {
        return NextResponse.json(
          { detail: "Only the challenger can cancel a pending match." },
          { status: 403 }
        );
      }

      const cancelledAt = new Date();
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;
      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "cancelled",
            cancelledAt,
          },
        });

        await postDirectInboxMessage(tx, {
          senderUserId: viewer.id,
          targetUserId,
          body: buildCancellationMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
            cancelledByName: playerName(viewer),
          }),
          now: cancelledAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_cancelled",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            cancelledByUid: viewer.uid,
            role: viewerIsChallenger ? "challenger" : "challenged",
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_cancelled",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            cancelledByUid: viewer.uid,
            role: viewerIsChallenger ? "challenged" : "challenger",
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
          },
        });
      });
    }

    if (payload.action === "reschedule") {
      if (
        scheduledMatch.status !== "pending" &&
        scheduledMatch.status !== "accepted" &&
        scheduledMatch.status !== "declined" &&
        scheduledMatch.status !== "cancelled"
      ) {
        return NextResponse.json(
          { detail: "This scheduled match can no longer be reopened." },
          { status: 409 }
        );
      }

      const nextScheduledAt = parseScheduledMatchDate(payload.scheduledAt);
      if (!nextScheduledAt) {
        return NextResponse.json({ detail: "Choose a valid new start time." }, { status: 400 });
      }

      const scheduledAtWindowError = validateScheduledAtWindow(nextScheduledAt);
      if (scheduledAtWindowError) {
        return NextResponse.json({ detail: scheduledAtWindowError }, { status: 400 });
      }

      const nextChallengeNote = normalizeChallengeNote(payload.challengeNote);
      const duplicateActiveMatch = await prisma.scheduledMatch.findFirst({
        where: {
          id: { not: challengeId },
          status: {
            in: [...ACTIVE_SCHEDULED_MATCH_STATUSES],
          },
          scheduledAt: {
            gte: new Date(Date.now() - EXISTING_MATCH_LOOKBACK_MS),
            lte: new Date(Date.now() + SCHEDULE_WINDOW_MAX_MS),
          },
          OR: [
            {
              challengerUserId: scheduledMatch.challengerUserId,
              challengedUserId: scheduledMatch.challengedUserId,
            },
            {
              challengerUserId: scheduledMatch.challengedUserId,
              challengedUserId: scheduledMatch.challengerUserId,
            },
          ],
        },
        select: {
          id: true,
          scheduledAt: true,
        },
      });

      if (duplicateActiveMatch) {
        return NextResponse.json(
          {
            detail: `Another active scheduled match between these players already exists for ${formatScheduledAtForInbox(
              duplicateActiveMatch.scheduledAt
            )}.`,
          },
          { status: 409 }
        );
      }

      const rescheduledAt = new Date();
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;
      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "pending",
            scheduledAt: nextScheduledAt,
            challengeNote: nextChallengeNote,
            acceptedAt: null,
            declinedAt: null,
            cancelledAt: null,
          },
        });

        await postDirectInboxMessage(tx, {
          senderUserId: viewer.id,
          targetUserId,
          body: buildRescheduleMessage({
            challengerName,
            challengedName,
            scheduledAt: nextScheduledAt,
            challengeNote: nextChallengeNote,
            updatedByName: playerName(viewer),
          }),
          now: rescheduledAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_rescheduled",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            updatedByUid: viewer.uid,
            role: viewerIsChallenger ? "challenger" : "challenged",
            scheduledAt: nextScheduledAt.toISOString(),
            challengeNote: nextChallengeNote,
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_rescheduled",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            updatedByUid: viewer.uid,
            role: viewerIsChallenger ? "challenged" : "challenger",
            scheduledAt: nextScheduledAt.toISOString(),
            challengeNote: nextChallengeNote,
          },
        });
      });
    }

    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update scheduled match:", error);
    const detail = error instanceof Error ? error.message : "Challenge update failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
