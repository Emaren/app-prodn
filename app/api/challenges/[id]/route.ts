import { NextRequest, NextResponse } from "next/server";

import { loadChallengeHubSnapshot } from "@/lib/challenges";
import { postDirectInboxMessage } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    };

    const scheduledMatch = await prisma.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        status: true,
        scheduledAt: true,
        challengerUserId: true,
        challengedUserId: true,
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

    if (payload.action !== "accept") {
      return NextResponse.json({ detail: "Unknown challenge action." }, { status: 400 });
    }

    if (scheduledMatch.challengedUserId !== viewer.id) {
      return NextResponse.json({ detail: "Only the challenged player can accept this match." }, { status: 403 });
    }

    if (scheduledMatch.status !== "pending") {
      return NextResponse.json({ detail: "This challenge is no longer awaiting acceptance." }, { status: 409 });
    }

    const acceptedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.scheduledMatch.update({
        where: { id: challengeId },
        data: {
          status: "accepted",
          acceptedAt,
        },
      });

      await postDirectInboxMessage(tx, {
        senderUserId: viewer.id,
        targetUserId: scheduledMatch.challengerUserId,
        body: buildAcceptanceMessage({
          challengerName: playerName(scheduledMatch.challenger),
          challengedName: playerName(scheduledMatch.challenged),
          scheduledAt: scheduledMatch.scheduledAt,
        }),
        now: acceptedAt,
      });
    });

    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update scheduled match:", error);
    const detail = error instanceof Error ? error.message : "Challenge update failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
