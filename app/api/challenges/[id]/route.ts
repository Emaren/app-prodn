import { NextRequest, NextResponse } from "next/server";

import {
  loadChallengeHubSnapshot,
  loadChallengeTileById,
  parseScheduledMatchDate,
} from "@/lib/challenges";
import {
  buildChallengeEconomySurface,
} from "@/lib/challengeEconomy";
import { Prisma } from "@/lib/generated/prisma";
import {
  buildChallengePlayBy,
} from "@/lib/challengeLifecycle";
import {
  parseChallengeAction,
  type ChallengeActorRole,
  type ChallengeMutationPayload,
} from "@/lib/challenge/domain/contracts";
import {
  acceptChallenge,
  cancelChallenge,
  confirmChallengeTime,
  declineChallenge,
  rescheduleChallenge,
} from "@/lib/challenge/domain/commands";
import {
  recordChallengeActivity,
} from "@/lib/challenge/domain/activity";
import {
  ChallengeConflictError,
} from "@/lib/challenge/domain/errors";
import { ChallengeDesyncError } from "@/lib/desyncChallenge";
import { resolveChallengeDesyncDisposition } from "@/lib/desyncChallengeProtocol";
import { postChallengeCommissionerNotice, postChallengeInboxNotice } from "@/lib/contactInbox";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import { verifyChallengeFundingTransfer } from "@/lib/woloBetSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 30 * 24 * 60 * 60 * 1000;
const FUNDABLE_STATUSES = new Set([
  "proposed",
  "pending",
  "terms_accepted",
  "accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
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

function validateScheduledAtWindow(scheduledAt: Date) {
  const now = Date.now();

  if (scheduledAt.getTime() < now + SCHEDULE_WINDOW_MIN_MS) {
    return "Schedule the game at least two minutes ahead.";
  }

  if (scheduledAt.getTime() > now + SCHEDULE_WINDOW_MAX_MS) {
    return "Keep exact match times inside the next 30 days.";
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

function buildFundingMessage(input: {
  challengerName: string;
  challengedName: string;
  matchTime: Date | null;
  actorName: string;
  totalFundingWolo: number;
  statusLabel: string;
}) {
  return [
    "Challenge funding recorded",
    `${input.challengerName} vs ${input.challengedName}`,
    ...challengeTimingNoticeLines(input.matchTime),
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
      if (!viewer.isAdmin) {
        return NextResponse.json(
          { detail: "Only a site admin can resolve a confirmed desync." },
          { status: 403 }
        );
      }

      const desyncIncidentId = Number(payload.desyncIncidentId);
      if (!Number.isSafeInteger(desyncIncidentId) || desyncIncidentId <= 0) {
        return NextResponse.json(
          { detail: "Choose the confirmed desync incident to resolve." },
          { status: 400 }
        );
      }

      const idempotencyKey = payload.idempotencyKey?.trim() || "";
      if (!idempotencyKey || idempotencyKey.length > 128) {
        return NextResponse.json(
          { detail: "A valid idempotency key is required for commissioner disposition." },
          { status: 400 }
        );
      }

      const dispositionAction =
        action ===
        "desync_rematch"
          ? "rematch"
          : "void_refund";

      const rematchAt =
        dispositionAction ===
        "rematch"
          ? parseScheduledMatchDate(
              payload.rematchAt,
            )
          : null;

      if (
        dispositionAction ===
        "rematch"
      ) {
        if (!rematchAt) {
          return NextResponse.json(
            { detail: "Choose a valid future time for the rematch." },
            { status: 400 }
          );
        }
        const scheduledAtWindowError = validateScheduledAtWindow(rematchAt);
        if (scheduledAtWindowError) {
          return NextResponse.json({ detail: scheduledAtWindowError }, { status: 400 });
        }
      }

      const desyncResolution = await resolveChallengeDesyncDisposition({
        prisma,
        viewerUid: viewer.uid,
        challengeId,
        incidentId: desyncIncidentId,
        action:
          dispositionAction,
        idempotencyKey,
        rematchAt,
        note: payload.note?.trim().slice(0, 1_000) || null,
      });
      const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
      return NextResponse.json({ ...refreshed, desyncResolution });
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
      const fundingTxHash = payload.fundingTxHash?.trim().toUpperCase() ?? "";
      const fundingWalletAddress = payload.fundingWalletAddress?.trim() || "";

      if (!viewerIsChallenger && !viewerIsChallenged) {
        return NextResponse.json({ detail: "Only match participants can record funding." }, { status: 403 });
      }

      if (!FUNDABLE_STATUSES.has(scheduledMatch.status.toLowerCase())) {
        return NextResponse.json({ detail: "This match is not open for funding." }, { status: 409 });
      }

      if (viewerIsChallenged && !scheduledMatch.acceptedAt) {
        return NextResponse.json(
          { detail: "Accept the challenge before funding it." },
          { status: 409 }
        );
      }

      if (!fundingTxHash) {
        return NextResponse.json({ detail: "Add the signed funding tx hash." }, { status: 400 });
      }

      if (!fundingWalletAddress) {
        return NextResponse.json(
          { detail: "The signed funding wallet address is required." },
          { status: 400 }
        );
      }

      const fundingDeadline = viewerIsChallenged
        ? scheduledMatch.fundBy
        : scheduledMatch.acceptedAt
          ? scheduledMatch.fundBy
          : scheduledMatch.acceptBy;
      if (fundingDeadline && fundingDeadline.getTime() <= Date.now()) {
        return NextResponse.json({ detail: "The funding window has expired." }, { status: 409 });
      }

      if (viewerIsChallenger && scheduledMatch.challengerFundedAt) {
        return NextResponse.json({ detail: "Creator funding is already on file." }, { status: 409 });
      }

      if (viewerIsChallenged && scheduledMatch.challengedFundedAt) {
        return NextResponse.json({ detail: "Opponent funding is already on file." }, { status: 409 });
      }

      const existingFundingProof = await prisma.scheduledMatch.findFirst({
        where: {
          id: { not: challengeId },
          OR: [
            { challengerFundingTxHash: fundingTxHash },
            { challengedFundingTxHash: fundingTxHash },
          ],
        },
        select: { id: true },
      });
      if (existingFundingProof) {
        return NextResponse.json(
          {
            detail: `That funding tx is already attached to challenge #${existingFundingProof.id}.`,
          },
          { status: 409 }
        );
      }

      const fundingVerification = await verifyChallengeFundingTransfer({
        challengeId,
        txHash: fundingTxHash,
        fromAddress: fundingWalletAddress,
        participantSide: viewerIsChallenger ? "left" : "right",
        wagerAmountWolo: scheduledMatch.wagerAmountWolo,
        guaranteeAmountWolo: scheduledMatch.guaranteeAmountWolo,
      });
      if (!fundingVerification.verified) {
        return NextResponse.json(
          {
            detail:
              fundingVerification.detail ||
              "WoloChain could not verify this challenge escrow deposit.",
          },
          { status: 409 }
        );
      }

      const verifiedFundingTxHash = fundingVerification.txHash || fundingTxHash;
      const fundedAt = new Date();
      const nextShape = {
        ...scheduledMatch,
        challengerFundedAt: viewerIsChallenger ? fundedAt : scheduledMatch.challengerFundedAt,
        challengerFundingTxHash: viewerIsChallenger
          ? verifiedFundingTxHash
          : scheduledMatch.challengerFundingTxHash,
        challengerFundingWalletAddress: viewerIsChallenger
          ? fundingWalletAddress
          : scheduledMatch.challengerFundingWalletAddress,
        challengedFundedAt: viewerIsChallenged ? fundedAt : scheduledMatch.challengedFundedAt,
        challengedFundingTxHash: viewerIsChallenged
          ? verifiedFundingTxHash
          : scheduledMatch.challengedFundingTxHash,
        challengedFundingWalletAddress: viewerIsChallenged
          ? fundingWalletAddress
          : scheduledMatch.challengedFundingWalletAddress,
      };
      const nextSurface = computeChallengeSurface(nextShape, fundedAt);
      const bothFunded = Boolean(nextShape.challengerFundedAt && nextShape.challengedFundedAt);
      const playBy = bothFunded
        ? scheduledMatch.playBy ?? buildChallengePlayBy(fundedAt)
        : scheduledMatch.playBy;
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;

      await prisma.$transaction(async (tx) => {
        await tx.scheduledMatchFundingProof.create({
          data: {
            scheduledMatchId: challengeId,
            participantSide: viewerIsChallenger ? "left" : "right",
            txHash: verifiedFundingTxHash,
            walletAddress: fundingWalletAddress,
            amountWolo: fundingTotal,
          },
        }).catch((error) => {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new ChallengeConflictError("That funding proof is already attached to a challenge side.");
          }
          throw error;
        });

        const funded = await tx.scheduledMatch.updateMany({
          where: {
            id: challengeId,
            wagerAmountWolo: scheduledMatch.wagerAmountWolo,
            guaranteeAmountWolo: scheduledMatch.guaranteeAmountWolo,
            status: { in: Array.from(FUNDABLE_STATUSES) },
            ...(viewerIsChallenger
              ? { challengerFundedAt: null }
              : { challengedFundedAt: null, acceptedAt: { not: null } }),
            OR: scheduledMatch.acceptedAt
              ? [{ fundBy: null }, { fundBy: { gt: fundedAt } }]
              : [{ acceptBy: null }, { acceptBy: { gt: fundedAt } }],
          },
          data: {
            status: nextSurface.persistedStatus,
            challengerFundedAt: viewerIsChallenger ? fundedAt : undefined,
            challengerFundingTxHash: viewerIsChallenger ? verifiedFundingTxHash : undefined,
            challengerFundingWalletAddress: viewerIsChallenger ? fundingWalletAddress : undefined,
            challengedFundedAt: viewerIsChallenged ? fundedAt : undefined,
            challengedFundingTxHash: viewerIsChallenged ? verifiedFundingTxHash : undefined,
            challengedFundingWalletAddress: viewerIsChallenged ? fundingWalletAddress : undefined,
            playBy: bothFunded ? playBy : undefined,
          },
        });
        if (funded.count !== 1) {
          throw new ChallengeConflictError("Challenge terms or funding state changed while the chain proof was being verified.");
        }

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventType: viewerIsChallenger ? "creator_funded" : "opponent_funded",
          detail: `${playerName(viewer)} locked ${formatWolo(fundingTotal)} WOLO.`,
          metadata: {
            fundingTxHash: verifiedFundingTxHash,
            fundingWalletAddress,
            totalFundingWolo: fundingTotal,
            proofUrl: fundingVerification.proofUrl ?? null,
            verifiedBy: "wolochain",
            playBy: playBy?.toISOString() ?? null,
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
            matchTime: scheduledMatch.matchTime,
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
            fundingTxHash: verifiedFundingTxHash,
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
            fundingTxHash: verifiedFundingTxHash,
          },
        });
      });
    }

    if (action === "check_in") {
      if (scheduledMatch.timingMode !== "scheduled" || !scheduledMatch.matchTime) {
        return NextResponse.json(
          { detail: "Play-anytime challenges do not require check-in. Propose an exact time first if you want the scheduling rail." },
          { status: 409 }
        );
      }
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

    if (action === "resolve_no_show") {
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

    if (action === "mark_completed") {
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
