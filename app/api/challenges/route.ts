import { NextRequest, NextResponse } from "next/server";

import {
  loadChallengeHubSnapshot,
  loadChallengeThreadTile,
  normalizeChallengeNote,
  parseScheduledMatchDate,
} from "@/lib/challenges";
import { postDirectInboxMessage } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const DUPLICATE_BLOCKING_STATES = new Set(["pending", "accepted", "live"]);

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

function buildChallengeInviteMessage({
  challengerName,
  challengedName,
  scheduledAt,
  challengeNote,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  challengeNote: string | null;
}) {
  const lines = [
    "Challenge scheduled",
    `${challengerName} vs ${challengedName}`,
    `Start: ${formatScheduledAtForInbox(scheduledAt)}`,
    "Status: Awaiting acceptance",
  ];

  if (challengeNote) {
    lines.push(`Note: ${challengeNote}`);
  }

  return lines.join("\n");
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

export async function GET(request: NextRequest) {
  try {
    const prisma = getPrisma();
    const viewerUid = await getSessionUid(request);
    const payload = await loadChallengeHubSnapshot(prisma, viewerUid);
    return NextResponse.json(payload);
  } catch (error) {
    console.error("Failed to load challenge hub:", error);
    return NextResponse.json({ detail: "Challenge hub unavailable." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerState = await requireViewer(request);
    if ("error" in viewerState) {
      return viewerState.error;
    }

    const { prisma, viewer } = viewerState;
    const payload = (await request.json().catch(() => ({}))) as {
      challengedUid?: string;
      scheduledAt?: string;
      challengeNote?: string;
    };

    const challengedUid =
      typeof payload.challengedUid === "string" ? payload.challengedUid.trim() : "";
    const scheduledAt = parseScheduledMatchDate(payload.scheduledAt);
    const challengeNote = normalizeChallengeNote(payload.challengeNote);

    if (!challengedUid) {
      return NextResponse.json({ detail: "Pick a player to challenge." }, { status: 400 });
    }

    if (challengedUid === viewer.uid) {
      return NextResponse.json({ detail: "Challenge another player, not yourself." }, { status: 400 });
    }

    if (!scheduledAt) {
      return NextResponse.json({ detail: "Choose a valid start time." }, { status: 400 });
    }

    const scheduledAtWindowError = validateScheduledAtWindow(scheduledAt);
    if (scheduledAtWindowError) {
      return NextResponse.json({ detail: scheduledAtWindowError }, { status: 400 });
    }

    const challenged = await prisma.user.findUnique({
      where: { uid: challengedUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });

    if (!challenged) {
      return NextResponse.json({ detail: "Challenged player not found." }, { status: 404 });
    }

    const existingActiveMatch = await loadChallengeThreadTile(prisma, viewer.id, challenged.id);

    if (
      existingActiveMatch &&
      DUPLICATE_BLOCKING_STATES.has(existingActiveMatch.displayState)
    ) {
      return NextResponse.json(
        {
          detail: `A scheduled match between these players is already active for ${formatScheduledAtForInbox(
            new Date(existingActiveMatch.scheduledAt)
          )}.`,
        },
        { status: 409 }
      );
    }

    const challengerName = playerName(viewer);
    const challengedName = playerName(challenged);
    const challengeLabel = buildChallengeLabel({ challengerName, challengedName });

    await prisma.$transaction(async (tx) => {
      const createdMatch = await tx.scheduledMatch.create({
        data: {
          challengerUserId: viewer.id,
          challengedUserId: challenged.id,
          scheduledAt,
          challengeNote,
        },
      });

      await postDirectInboxMessage(tx, {
        senderUserId: viewer.id,
        targetUserId: challenged.id,
        body: buildChallengeInviteMessage({
          challengerName,
          challengedName,
          scheduledAt,
          challengeNote,
        }),
      });

      await recordUserActivity(tx, {
        userId: viewer.id,
        type: "challenge_created",
        path: "/challenge",
        label: challengeLabel,
        metadata: {
          challengeId: createdMatch.id,
          role: "challenger",
          opponentUid: challenged.uid,
          scheduledAt: scheduledAt.toISOString(),
          challengeNote,
        },
        dedupeWithinSeconds: 5,
      });

      await recordUserActivity(tx, {
        userId: challenged.id,
        type: "challenge_received",
        path: "/challenge",
        label: challengeLabel,
        metadata: {
          challengeId: createdMatch.id,
          role: "challenged",
          opponentUid: viewer.uid,
          scheduledAt: scheduledAt.toISOString(),
          challengeNote,
        },
        dedupeWithinSeconds: 5,
      });
    });

    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to create scheduled match:", error);
    const detail = error instanceof Error ? error.message : "Challenge could not be scheduled.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
