import { NextRequest, NextResponse } from "next/server";

import {
  CHALLENGE_DEFAULT_GUARANTEE_WOLO,
  CHALLENGE_DEFAULT_WAGER_WOLO,
} from "@/lib/challengeConfig";
import {
  loadChallengeHubSnapshot,
  loadChallengeThreadTile,
  normalizeChallengeNote,
  parseScheduledMatchDate,
} from "@/lib/challenges";
import {
  normalizeChallengeWoloAmount,
  validateChallengeTermsAmounts,
} from "@/lib/challengeEconomy";
import { postChallengeInboxNotice } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 7 * 24 * 60 * 60 * 1000;

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

function buildChallengeInviteMessage({
  challengerName,
  challengedName,
  scheduledAt,
  challengeNote,
  wagerAmountWolo,
  guaranteeAmountWolo,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  challengeNote: string | null;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
}) {
  const totalFundingWolo = wagerAmountWolo + guaranteeAmountWolo;
  const lines = [
    "Challenge scheduled",
    `${challengerName} vs ${challengedName}`,
    `Start: ${formatScheduledAtForInbox(scheduledAt)}`,
    `Start ISO: ${scheduledAt.toISOString()}`,
    `Wolo Wager: ${formatWolo(wagerAmountWolo)} WOLO`,
    `Match Guarantee: ${formatWolo(guaranteeAmountWolo)} WOLO`,
    `Funding: ${formatWolo(totalFundingWolo)} WOLO each`,
    "Status: Awaiting terms acceptance",
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
      wagerAmountWolo?: string | number | null;
      guaranteeAmountWolo?: string | number | null;
    };

    const challengedUid =
      typeof payload.challengedUid === "string" ? payload.challengedUid.trim() : "";
    const scheduledAt = parseScheduledMatchDate(payload.scheduledAt);
    const challengeNote = normalizeChallengeNote(payload.challengeNote);
    const wagerAmountWolo =
      normalizeChallengeWoloAmount(payload.wagerAmountWolo) ?? CHALLENGE_DEFAULT_WAGER_WOLO;
    const guaranteeAmountWolo =
      normalizeChallengeWoloAmount(payload.guaranteeAmountWolo) ??
      CHALLENGE_DEFAULT_GUARANTEE_WOLO;

    if (!challengedUid) {
      return NextResponse.json({ detail: "Pick a player to challenge." }, { status: 400 });
    }

    if (challengedUid === viewer.uid) {
      return NextResponse.json({ detail: "Challenge another player, not yourself." }, { status: 400 });
    }

    if (!scheduledAt) {
      return NextResponse.json({ detail: "Choose a valid start time." }, { status: 400 });
    }

    const termsError = validateChallengeTermsAmounts(wagerAmountWolo, guaranteeAmountWolo);
    if (termsError) {
      return NextResponse.json({ detail: termsError }, { status: 400 });
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
    const duplicateWarning = existingActiveMatch
      ? `You already have another match with ${playerName(challenged)}. Scheduling anyway.`
      : null;

    const challengerName = playerName(viewer);
    const challengedName = playerName(challenged);
    const challengeLabel = buildChallengeLabel({ challengerName, challengedName });
    const totalFundingWolo = wagerAmountWolo + guaranteeAmountWolo;
    let createdChallengeId: number | null = null;

    await prisma.$transaction(async (tx) => {
      const createdMatch = await tx.scheduledMatch.create({
        data: {
          challengerUserId: viewer.id,
          challengedUserId: challenged.id,
          scheduledAt,
          challengeNote,
          status: "proposed",
          wagerAmountWolo,
          guaranteeAmountWolo,
        },
      });
      createdChallengeId = createdMatch.id;

      await tx.scheduledMatchActivity.create({
        data: {
          scheduledMatchId: createdMatch.id,
          actorUserId: viewer.id,
          eventType: "scheduled",
          detail: [
            `Scheduled for ${challengerName} vs ${challengedName}.`,
            `Funding ${formatWolo(totalFundingWolo)} WOLO each.`,
            challengeNote ? `Note: ${challengeNote}` : null,
          ]
            .filter(Boolean)
            .join(" "),
          metadata: {
            scheduledAt: scheduledAt.toISOString(),
            wagerAmountWolo,
            guaranteeAmountWolo,
            totalFundingWolo,
          },
        },
      });

      await postChallengeInboxNotice(tx, {
        senderUserId: viewer.id,
        targetUserId: challenged.id,
        challengeId: createdMatch.id,
        body: buildChallengeInviteMessage({
          challengerName,
          challengedName,
          scheduledAt,
          challengeNote,
          wagerAmountWolo,
          guaranteeAmountWolo,
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
          wagerAmountWolo,
          guaranteeAmountWolo,
          totalFundingWolo,
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
          wagerAmountWolo,
          guaranteeAmountWolo,
          totalFundingWolo,
        },
        dedupeWithinSeconds: 5,
      });
    });

    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json({
      ...refreshed,
      createdChallengeId,
      duplicateWarning,
    });
  } catch (error) {
    console.error("Failed to create scheduled match:", error);
    const detail = error instanceof Error ? error.message : "Challenge could not be scheduled.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
