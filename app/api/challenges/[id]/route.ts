import { NextRequest, NextResponse } from "next/server";

import { loadChallengeHubSnapshot } from "@/lib/challenges";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWER_SELECT = {
  id: true,
  uid: true,
} as const;

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
        challengedUserId: true,
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

    await prisma.scheduledMatch.update({
      where: { id: challengeId },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
      },
    });

    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update scheduled match:", error);
    const detail = error instanceof Error ? error.message : "Challenge update failed.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
