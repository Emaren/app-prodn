import { NextRequest, NextResponse } from "next/server";

import {
  CHALLENGE_DEFAULT_GUARANTEE_WOLO,
  CHALLENGE_DEFAULT_WAGER_WOLO,
} from "@/lib/challengeConfig";
import {
  loadChallengeHubSnapshot,
  normalizeChallengeNote,
  parseScheduledMatchDate,
} from "@/lib/challenges";
import {
  buildChallengeEconomySurface,
  normalizeChallengeWoloAmount,
  validateChallengeTermsAmounts,
} from "@/lib/challengeEconomy";
import { Prisma } from "@/lib/generated/prisma";
import { postChallengeInboxNotice } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 7 * 24 * 60 * 60 * 1000;
const FUNDABLE_STATUSES = new Set([
  "proposed",
  "pending",
  "terms_accepted",
  "accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
]);
const MANAGEABLE_DISPLAY_STATES = new Set([
  "proposed",
  "pending",
  "terms_accepted",
  "accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
  "checkin_open",
]);

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

function computeChallengeSurface(
  scheduledMatch: {
    status: string;
    scheduledAt: Date;
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

function buildTermsAcceptedMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  totalFundingWolo: number;
  nextStatus: string;
}) {
  return [
    "Challenge terms accepted",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    `Funding: ${formatWolo(input.totalFundingWolo)} WOLO each`,
    `Status: ${input.nextStatus}`,
  ].join("\n");
}

function buildDeclineMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
}) {
  return [
    "Challenge declined",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    "Status: Terms declined",
  ].join("\n");
}

function buildCancellationMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  cancelledByName: string;
  refundPending?: boolean;
}) {
  const lines = [
    "Challenge cancelled",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    `Status: Cancelled by ${input.cancelledByName}`,
  ];

  if (input.refundPending) {
    lines.push("Refund: Pending operator review");
  }

  return lines.join("\n");
}

function buildRescheduleMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  challengeNote: string | null;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  fundingPreserved?: boolean;
}) {
  const totalFunding = input.wagerAmountWolo + input.guaranteeAmountWolo;
  const lines = [
    "Challenge rescheduled",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    `Wolo Wager: ${formatWolo(input.wagerAmountWolo)} WOLO`,
    `Match Guarantee: ${formatWolo(input.guaranteeAmountWolo)} WOLO`,
    `Funding: ${formatWolo(totalFunding)} WOLO each`,
    input.fundingPreserved ? "Status: Funding preserved" : "Status: Awaiting terms acceptance",
  ];

  if (input.challengeNote) {
    lines.push(`Note: ${input.challengeNote}`);
  }

  return lines.join("\n");
}

function buildFundingMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  actorName: string;
  totalFundingWolo: number;
  statusLabel: string;
}) {
  return [
    "Challenge funding recorded",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    `Funding: ${input.actorName} locked ${formatWolo(input.totalFundingWolo)} WOLO`,
    `Status: ${input.statusLabel}`,
  ].join("\n");
}

function buildCheckInMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  actorName: string;
  statusLabel: string;
}) {
  return [
    input.statusLabel === "Ready" ? "Challenge ready" : "Challenge check-in recorded",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    `Status: ${input.actorName} checked in`,
    input.statusLabel === "Ready" ? "Lock: Both players checked in" : "Lock: Waiting on the other side",
  ].join("\n");
}

function buildNoShowMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
  resolutionLabel: string | null;
  statusDetail: string;
}) {
  return [
    "Challenge no-show resolved",
    `${input.challengerName} vs ${input.challengedName}`,
    `Start: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Start ISO: ${input.scheduledAt.toISOString()}`,
    `Status: ${input.resolutionLabel || "No-show resolved"}`,
    input.statusDetail,
  ].join("\n");
}

async function recordChallengeActivity(
  tx: {
    scheduledMatchActivity: {
      create: (args: { data: Prisma.ScheduledMatchActivityUncheckedCreateInput }) => Promise<unknown>;
    };
  },
  input: {
    scheduledMatchId: number;
    actorUserId?: number | null;
    eventType: string;
    detail?: string | null;
    metadata?: Record<string, unknown> | null;
    createdAt?: Date;
  }
) {
  await tx.scheduledMatchActivity.create({
    data: {
      scheduledMatchId: input.scheduledMatchId,
      actorUserId: input.actorUserId ?? undefined,
      eventType: input.eventType.slice(0, 32),
      detail: input.detail?.slice(0, 255) || undefined,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: input.createdAt,
    },
  });
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
      wagerAmountWolo?: string | number | null;
      guaranteeAmountWolo?: string | number | null;
      fundingTxHash?: string;
      fundingWalletAddress?: string;
      linkedSessionKey?: string;
      linkedMapName?: string;
      linkedWinner?: string;
      linkedDurationSeconds?: number;
    };

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
    const viewerRole = viewerIsChallenger ? "challenger" : viewerIsChallenged ? "challenged" : "admin";

    if (
      payload.action !== "accept" &&
      payload.action !== "decline" &&
      payload.action !== "cancel" &&
      payload.action !== "reschedule" &&
      payload.action !== "fund" &&
      payload.action !== "check_in" &&
      payload.action !== "resolve_no_show" &&
      payload.action !== "mark_completed"
    ) {
      return NextResponse.json({ detail: "Unknown challenge action." }, { status: 400 });
    }

    if (payload.action === "accept") {
      if (!viewerIsChallenged) {
        return NextResponse.json(
          { detail: "Only the challenged player can accept this match." },
          { status: 403 }
        );
      }

      if (!["proposed", "pending", "creator_funded"].includes(currentSurface.displayState)) {
        return NextResponse.json(
          { detail: "This challenge is no longer awaiting terms acceptance." },
          { status: 409 }
        );
      }

      const acceptedAt = new Date();
      const nextStatus =
        fundingTotal > 0
          ? scheduledMatch.challengerFundedAt && !scheduledMatch.challengedFundedAt
            ? "creator_funded"
            : "terms_accepted"
          : "accepted";
      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: nextStatus,
            acceptedAt,
            declinedAt: null,
            cancelledAt: null,
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: fundingTotal > 0 ? "terms_accepted" : "accepted",
          detail:
            fundingTotal > 0 && scheduledMatch.challengerFundedAt
              ? `Terms accepted. Opponent funding is next for ${formatWolo(fundingTotal)} WOLO.`
              : fundingTotal > 0
              ? `Terms accepted. Creator funding is next for ${formatWolo(fundingTotal)} WOLO.`
              : "Accepted and ready to lock.",
          metadata: {
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
            totalFundingWolo: fundingTotal,
          },
          createdAt: acceptedAt,
        });

        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId: scheduledMatch.challengerUserId,
          challengeId,
          body: buildTermsAcceptedMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
            totalFundingWolo: fundingTotal,
            nextStatus: scheduledMatch.challengerFundedAt
              ? "Opponent funding next"
              : "Creator funding next",
          }),
          now: acceptedAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_terms_accepted",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            role: "challenger",
            acceptedByUid: viewer.uid,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
            totalFundingWolo: fundingTotal,
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_terms_accepted",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            role: "challenged",
            acceptedByUid: viewer.uid,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
            totalFundingWolo: fundingTotal,
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

      if (!["proposed", "pending"].includes(currentSurface.displayState)) {
        return NextResponse.json(
          { detail: "This challenge is no longer awaiting terms acceptance." },
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

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: "declined",
          detail: "Challenge declined.",
          createdAt: declinedAt,
        });

        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId: scheduledMatch.challengerUserId,
          challengeId,
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
      const hasAnyFunding =
        Boolean(scheduledMatch.challengerFundedAt) || Boolean(scheduledMatch.challengedFundedAt);
      const hasAnyCheckIn =
        Boolean(scheduledMatch.challengerCheckedInAt) || Boolean(scheduledMatch.challengedCheckedInAt);

      if (hasAnyCheckIn || currentSurface.displayState === "live") {
        return NextResponse.json(
          { detail: "This match is already checked in or live. Keep it on the rail for result resolution." },
          { status: 409 }
        );
      }

      if (!MANAGEABLE_DISPLAY_STATES.has(currentSurface.displayState)) {
        return NextResponse.json(
          { detail: "Only active scheduled matches can be cancelled." },
          { status: 409 }
        );
      }

      const cancelledAt = new Date();
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;
      const cancelDetail = hasAnyFunding
        ? `${challengeLabel} · cancelled · refund pending operator review`
        : `${challengeLabel} · cancelled`;

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "canceled",
            cancelledAt,
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: "canceled",
          detail: cancelDetail,
          metadata: hasAnyFunding
            ? {
                refundPending: true,
                challengerFunded: Boolean(scheduledMatch.challengerFundedAt),
                challengedFunded: Boolean(scheduledMatch.challengedFundedAt),
                totalFundingWolo: fundingTotal,
              }
            : undefined,
          createdAt: cancelledAt,
        });

        if (viewerIsChallenger || viewerIsChallenged) {
          await postChallengeInboxNotice(tx, {
            senderUserId: viewer.id,
            targetUserId,
            challengeId,
            body: buildCancellationMessage({
              challengerName,
              challengedName,
              scheduledAt: scheduledMatch.scheduledAt,
              cancelledByName: playerName(viewer),
              refundPending: hasAnyFunding,
            }),
            now: cancelledAt,
          });
        }

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_cancelled",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            cancelledByUid: viewer.uid,
            role: viewerRole,
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
            refundPending: hasAnyFunding,
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
            role: viewerRole === "challenger" ? "challenged" : viewerRole === "challenged" ? "challenger" : "admin",
            scheduledAt: scheduledMatch.scheduledAt.toISOString(),
            refundPending: hasAnyFunding,
          },
        });
      });
    }

    if (payload.action === "reschedule") {
      const hasAnyFunding =
        Boolean(scheduledMatch.challengerFundedAt) || Boolean(scheduledMatch.challengedFundedAt);
      const hasAnyCheckIn =
        Boolean(scheduledMatch.challengerCheckedInAt) || Boolean(scheduledMatch.challengedCheckedInAt);

      if (hasAnyCheckIn || currentSurface.displayState === "live") {
        return NextResponse.json(
          { detail: "This match is already checked in or live. Keep it on the existing rail." },
          { status: 409 }
        );
      }

      if (!MANAGEABLE_DISPLAY_STATES.has(currentSurface.displayState)) {
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
      const wagerAmountWolo =
        hasAnyFunding
          ? scheduledMatch.wagerAmountWolo
          : normalizeChallengeWoloAmount(payload.wagerAmountWolo) ?? scheduledMatch.wagerAmountWolo ?? CHALLENGE_DEFAULT_WAGER_WOLO;
      const guaranteeAmountWolo =
        hasAnyFunding
          ? scheduledMatch.guaranteeAmountWolo
          : normalizeChallengeWoloAmount(payload.guaranteeAmountWolo) ?? scheduledMatch.guaranteeAmountWolo ?? CHALLENGE_DEFAULT_GUARANTEE_WOLO;
      const termsError = validateChallengeTermsAmounts(wagerAmountWolo, guaranteeAmountWolo);

      if (termsError) {
        return NextResponse.json({ detail: termsError }, { status: 400 });
      }

      const rescheduledAt = new Date();
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;
      const nextFundingTotal = wagerAmountWolo + guaranteeAmountWolo;
      const nextShape = {
        ...scheduledMatch,
        scheduledAt: nextScheduledAt,
        challengeNote: nextChallengeNote,
        wagerAmountWolo,
        guaranteeAmountWolo,
      };
      const nextSurface = hasAnyFunding
        ? computeChallengeSurface(nextShape, rescheduledAt)
        : null;

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: hasAnyFunding
            ? {
                status: nextSurface?.persistedStatus ?? scheduledMatch.status,
                scheduledAt: nextScheduledAt,
                challengeNote: nextChallengeNote,
                wagerAmountWolo,
                guaranteeAmountWolo,
                declinedAt: null,
                cancelledAt: null,
              }
            : {
                status: "proposed",
                scheduledAt: nextScheduledAt,
                challengeNote: nextChallengeNote,
                wagerAmountWolo,
                guaranteeAmountWolo,
                acceptedAt: null,
                declinedAt: null,
                cancelledAt: null,
                challengerFundingTxHash: null,
                challengerFundingWalletAddress: null,
                challengerFundedAt: null,
                challengedFundingTxHash: null,
                challengedFundingWalletAddress: null,
                challengedFundedAt: null,
                challengerCheckedInAt: null,
                challengedCheckedInAt: null,
                liveConfirmedAt: null,
                resultAt: null,
                settlementReadyAt: null,
                linkedSessionKey: null,
                linkedMapName: null,
                linkedWinner: null,
                linkedDurationSeconds: null,
              },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: "rescheduled",
          detail: `${challengeLabel} · moved to ${formatScheduledAtForInbox(nextScheduledAt)}${
            hasAnyFunding ? " · funding preserved" : ""
          }`,
          metadata: {
            scheduledAt: nextScheduledAt.toISOString(),
            wagerAmountWolo,
            guaranteeAmountWolo,
            totalFundingWolo: nextFundingTotal,
            fundingPreserved: hasAnyFunding,
          },
          createdAt: rescheduledAt,
        });

        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId,
          challengeId,
          body: buildRescheduleMessage({
            challengerName,
            challengedName,
            scheduledAt: nextScheduledAt,
            challengeNote: nextChallengeNote,
            wagerAmountWolo,
            guaranteeAmountWolo,
            fundingPreserved: hasAnyFunding,
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
            role: viewerRole,
            scheduledAt: nextScheduledAt.toISOString(),
            challengeNote: nextChallengeNote,
            wagerAmountWolo,
            guaranteeAmountWolo,
            totalFundingWolo: nextFundingTotal,
            fundingPreserved: hasAnyFunding,
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
            role: viewerRole === "challenger" ? "challenged" : viewerRole === "challenged" ? "challenger" : "admin",
            scheduledAt: nextScheduledAt.toISOString(),
            challengeNote: nextChallengeNote,
            wagerAmountWolo,
            guaranteeAmountWolo,
            totalFundingWolo: nextFundingTotal,
            fundingPreserved: hasAnyFunding,
          },
        });
      });
    }

    if (payload.action === "fund") {
      const fundingTxHash = payload.fundingTxHash?.trim() ?? "";
      const fundingWalletAddress = payload.fundingWalletAddress?.trim() || null;

      if (!viewerIsChallenger && !viewerIsChallenged) {
        return NextResponse.json({ detail: "Only match participants can record funding." }, { status: 403 });
      }

      if (!FUNDABLE_STATUSES.has(scheduledMatch.status.toLowerCase())) {
        return NextResponse.json({ detail: "This match is not open for funding." }, { status: 409 });
      }

      if (viewerIsChallenged && ["proposed", "pending"].includes(scheduledMatch.status.toLowerCase())) {
        return NextResponse.json(
          { detail: "Wait for creator funding, then accept and fund." },
          { status: 409 }
        );
      }

      if (!fundingTxHash) {
        return NextResponse.json({ detail: "Add the signed funding tx hash." }, { status: 400 });
      }

      if (scheduledMatch.scheduledAt.getTime() <= Date.now()) {
        return NextResponse.json({ detail: "Funding closed when the scheduled start locked." }, { status: 409 });
      }

      if (viewerIsChallenger && scheduledMatch.challengerFundedAt) {
        return NextResponse.json({ detail: "Creator funding is already on file." }, { status: 409 });
      }

      if (viewerIsChallenged && scheduledMatch.challengedFundedAt) {
        return NextResponse.json({ detail: "Opponent funding is already on file." }, { status: 409 });
      }

      const fundedAt = new Date();
      const nextShape = {
        ...scheduledMatch,
        challengerFundedAt: viewerIsChallenger ? fundedAt : scheduledMatch.challengerFundedAt,
        challengerFundingTxHash: viewerIsChallenger ? fundingTxHash : scheduledMatch.challengerFundingTxHash,
        challengerFundingWalletAddress: viewerIsChallenger
          ? fundingWalletAddress
          : scheduledMatch.challengerFundingWalletAddress,
        challengedFundedAt: viewerIsChallenged ? fundedAt : scheduledMatch.challengedFundedAt,
        challengedFundingTxHash: viewerIsChallenged ? fundingTxHash : scheduledMatch.challengedFundingTxHash,
        challengedFundingWalletAddress: viewerIsChallenged
          ? fundingWalletAddress
          : scheduledMatch.challengedFundingWalletAddress,
      };
      const nextSurface = computeChallengeSurface(nextShape, fundedAt);
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: nextSurface.persistedStatus,
            challengerFundedAt: viewerIsChallenger ? fundedAt : undefined,
            challengerFundingTxHash: viewerIsChallenger ? fundingTxHash : undefined,
            challengerFundingWalletAddress: viewerIsChallenger ? fundingWalletAddress : undefined,
            challengedFundedAt: viewerIsChallenged ? fundedAt : undefined,
            challengedFundingTxHash: viewerIsChallenged ? fundingTxHash : undefined,
            challengedFundingWalletAddress: viewerIsChallenged ? fundingWalletAddress : undefined,
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: viewerIsChallenger ? "creator_funded" : "opponent_funded",
          detail: `${playerName(viewer)} locked ${formatWolo(fundingTotal)} WOLO.`,
          metadata: {
            fundingTxHash,
            fundingWalletAddress,
            totalFundingWolo: fundingTotal,
          },
          createdAt: fundedAt,
        });

        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId,
          challengeId,
          body: buildFundingMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
            actorName: playerName(viewer),
            totalFundingWolo: fundingTotal,
            statusLabel: nextSurface.economy.statusLabel,
          }),
          now: fundedAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_funding_recorded",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            actorUid: viewer.uid,
            role: viewerRole,
            totalFundingWolo: fundingTotal,
            fundingTxHash,
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_funding_recorded",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            actorUid: viewer.uid,
            role: viewerRole === "challenger" ? "challenged" : viewerRole === "challenged" ? "challenger" : "admin",
            totalFundingWolo: fundingTotal,
            fundingTxHash,
          },
        });
      });
    }

    if (payload.action === "check_in") {
      if (!viewerIsChallenger && !viewerIsChallenged) {
        return NextResponse.json({ detail: "Only match participants can check in." }, { status: 403 });
      }

      if (currentSurface.economy.checkInWindowState !== "open") {
        return NextResponse.json(
          { detail: "Check-in opens exactly 10 minutes before the scheduled start and closes at start." },
          { status: 409 }
        );
      }

      if (viewerIsChallenger && scheduledMatch.challengerCheckedInAt) {
        return NextResponse.json({ detail: "Creator check-in is already on file." }, { status: 409 });
      }

      if (viewerIsChallenged && scheduledMatch.challengedCheckedInAt) {
        return NextResponse.json({ detail: "Opponent check-in is already on file." }, { status: 409 });
      }

      const checkedInAt = new Date();
      const nextShape = {
        ...scheduledMatch,
        challengerCheckedInAt: viewerIsChallenger ? checkedInAt : scheduledMatch.challengerCheckedInAt,
        challengedCheckedInAt: viewerIsChallenged ? checkedInAt : scheduledMatch.challengedCheckedInAt,
      };
      const nextSurface = computeChallengeSurface(nextShape, checkedInAt);
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: nextSurface.persistedStatus,
            challengerCheckedInAt: viewerIsChallenger ? checkedInAt : undefined,
            challengedCheckedInAt: viewerIsChallenged ? checkedInAt : undefined,
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: viewerIsChallenger ? "left_checked_in" : "right_checked_in",
          detail: `${playerName(viewer)} checked in before the lock.`,
          createdAt: checkedInAt,
        });

        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId,
          challengeId,
          body: buildCheckInMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
            actorName: playerName(viewer),
            statusLabel: nextSurface.economy.statusLabel,
          }),
          now: checkedInAt,
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengerUserId,
          type: "challenge_checkin_recorded",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            actorUid: viewer.uid,
            role: viewerRole,
            checkedInAt: checkedInAt.toISOString(),
          },
        });

        await recordUserActivity(tx, {
          userId: scheduledMatch.challengedUserId,
          type: "challenge_checkin_recorded",
          path: "/challenge",
          label: challengeLabel,
          metadata: {
            challengeId,
            actorUid: viewer.uid,
            role: viewerRole === "challenger" ? "challenged" : viewerRole === "challenged" ? "challenger" : "admin",
            checkedInAt: checkedInAt.toISOString(),
          },
        });
      });
    }

    if (payload.action === "resolve_no_show") {
      if (!viewerIsChallenger && !viewerIsChallenged && !viewer.isAdmin) {
        return NextResponse.json({ detail: "Only participants or admins can resolve no-show state." }, { status: 403 });
      }

      const resolvedSurface = computeChallengeSurface(scheduledMatch, new Date());
      if (
        resolvedSurface.persistedStatus !== "no_show_left" &&
        resolvedSurface.persistedStatus !== "no_show_right" &&
        resolvedSurface.persistedStatus !== "double_no_show"
      ) {
        return NextResponse.json({ detail: "This match is not in a no-show resolution state." }, { status: 409 });
      }

      const resolvedAt = new Date(scheduledMatch.scheduledAt);
      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: resolvedSurface.persistedStatus,
            resultAt: scheduledMatch.resultAt ?? resolvedAt,
            settlementReadyAt: scheduledMatch.settlementReadyAt ?? resolvedAt,
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewerIsChallenger || viewerIsChallenged ? viewer.id : undefined,
          eventType: resolvedSurface.persistedStatus,
          detail: resolvedSurface.economy.statusDetail,
          createdAt: resolvedAt,
        });

        if (viewerIsChallenger || viewerIsChallenged) {
          await postChallengeInboxNotice(tx, {
            senderUserId: viewer.id,
            targetUserId: viewerIsChallenger
              ? scheduledMatch.challengedUserId
              : scheduledMatch.challengerUserId,
            challengeId,
            body: buildNoShowMessage({
              challengerName,
              challengedName,
              scheduledAt: scheduledMatch.scheduledAt,
              resolutionLabel: resolvedSurface.economy.resolution.label,
              statusDetail: resolvedSurface.economy.statusDetail,
            }),
            now: resolvedAt,
          });
        }
      });
    }

    if (payload.action === "mark_completed") {
      if (!viewer.isAdmin) {
        return NextResponse.json(
          { detail: "Only admins can mark this match result-ready for settlement." },
          { status: 403 }
        );
      }

      if (!["ready", "live"].includes(currentSurface.displayState)) {
        return NextResponse.json(
          { detail: "Only ready or live-confirmed matches can move to result-ready." },
          { status: 409 }
        );
      }

      const completedAt = new Date();
      const linkedSessionKey = payload.linkedSessionKey?.trim() || null;
      const linkedMapName = payload.linkedMapName?.trim() || null;
      const linkedWinner = payload.linkedWinner?.trim() || null;
      const linkedDurationSeconds =
        typeof payload.linkedDurationSeconds === "number" && Number.isFinite(payload.linkedDurationSeconds)
          ? Math.max(0, Math.floor(payload.linkedDurationSeconds))
          : null;

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "completed",
            liveConfirmedAt: scheduledMatch.liveConfirmedAt ?? completedAt,
            resultAt: completedAt,
            settlementReadyAt: completedAt,
            linkedSessionKey,
            linkedMapName,
            linkedWinner,
            linkedDurationSeconds,
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          eventType: "completed",
          detail: linkedWinner ? `Completed. Winner: ${linkedWinner}.` : "Completed and stored.",
          metadata: {
            linkedSessionKey,
            linkedMapName,
            linkedWinner,
            linkedDurationSeconds,
          },
          createdAt: completedAt,
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
