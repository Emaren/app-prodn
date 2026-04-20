import { NextRequest, NextResponse } from "next/server";

import {
  normalizeScheduledMatchColorTag,
  normalizeScheduledMatchViewerPreference,
  scheduledMatchPreferenceIsEmpty,
} from "@/lib/scheduledMatchPreferences";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sessionUid = await getSessionUid(request);
    if (!sessionUid) {
      return NextResponse.json({ detail: "No active session" }, { status: 401 });
    }

    const { id: idRaw } = await context.params;
    const challengeId = Number.parseInt(idRaw, 10);
    if (!Number.isFinite(challengeId)) {
      return NextResponse.json({ detail: "Challenge id is required." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      favorite?: boolean;
      bookmarked?: boolean;
      colorTag?: string | null;
    };

    const prisma = getPrisma();
    const viewer = await prisma.user.findUnique({
      where: { uid: sessionUid },
      select: { id: true },
    });

    if (!viewer) {
      return NextResponse.json({ detail: "Viewer not found" }, { status: 404 });
    }

    const scheduledMatch = await prisma.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: {
        challengerUserId: true,
        challengedUserId: true,
      },
    });

    if (!scheduledMatch) {
      return NextResponse.json({ detail: "Scheduled match not found." }, { status: 404 });
    }

    if (
      scheduledMatch.challengerUserId !== viewer.id &&
      scheduledMatch.challengedUserId !== viewer.id
    ) {
      return NextResponse.json({ detail: "Only match participants can organize this tile." }, { status: 403 });
    }

    const colorTag =
      payload.colorTag === null ? null : normalizeScheduledMatchColorTag(payload.colorTag);

    if (payload.colorTag && !colorTag) {
      return NextResponse.json({ detail: "Use gold, green, blue, or red for color tags." }, { status: 400 });
    }

    const nextPreference = {
      favorite: Boolean(payload.favorite),
      bookmarked: Boolean(payload.bookmarked),
      colorTag,
    };

    if (scheduledMatchPreferenceIsEmpty(nextPreference)) {
      await prisma.scheduledMatchUserPreference.deleteMany({
        where: {
          scheduledMatchId: challengeId,
          userId: viewer.id,
        },
      });

      return NextResponse.json({
        preference: normalizeScheduledMatchViewerPreference(null),
      });
    }

    const row = await prisma.scheduledMatchUserPreference.upsert({
      where: {
        scheduledMatchId_userId: {
          scheduledMatchId: challengeId,
          userId: viewer.id,
        },
      },
      create: {
        scheduledMatchId: challengeId,
        userId: viewer.id,
        ...nextPreference,
      },
      update: nextPreference,
      select: {
        favorite: true,
        bookmarked: true,
        colorTag: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      preference: normalizeScheduledMatchViewerPreference(row),
    });
  } catch (error) {
    console.error("Failed to update scheduled match preference:", error);
    return NextResponse.json({ detail: "Scheduled match preference update failed." }, { status: 500 });
  }
}
