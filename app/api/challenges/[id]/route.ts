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
import { projectChallengeLifecycle } from "@/lib/challengeLifecycle";
import { Prisma } from "@/lib/generated/prisma";
import { postChallengeInboxNotice } from "@/lib/contactInbox";
import { publishDirectMessageEvent } from "@/lib/directMessageEvents";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import { recordUserActivity } from "@/lib/userExperience";
import { verifyChallengeFundingTransfer } from "@/lib/woloBetSettlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 30 * DAY_MS;
const FUNDING_WINDOW_MS = HOUR_MS;
const OPEN_PLAY_WINDOW_MS = 30 * DAY_MS;
const CHALLENGE_LIFECYCLE_LOCK_NAMESPACE = 752026;
const CHALLENGE_FUNDING_PROOF_LOCK_NAMESPACE = 752027;
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

class ChallengeActionError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "ChallengeActionError";
    this.status = status;
  }
}

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
  scheduleMode: true,
  scheduledAt: true,
  acceptanceExpiresAt: true,
  fundingExpiresAt: true,
  playExpiresAt: true,
  expiredAt: true,
  fundingExpiredAt: true,
  playExpiredAt: true,
  proposedMatchAt: true,
  proposedMatchByUserId: true,
  timeProposedAt: true,
  timeConfirmedAt: true,
  lifecycleVersion: true,
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

function validateScheduledAtWindow(scheduledAt: Date, now = new Date()) {
  const nowMs = now.getTime();

  if (scheduledAt.getTime() < nowMs + SCHEDULE_WINDOW_MIN_MS) {
    return "Schedule the game at least two minutes ahead.";
  }

  if (scheduledAt.getTime() > nowMs + SCHEDULE_WINDOW_MAX_MS) {
    return "Keep exact match times inside the next 30 days.";
  }

  return null;
}

function normalizeRequestId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 96) : null;
}

function actionEventKey(input: {
  action: string;
  requestId: string | null;
  viewerId: number;
  scheduledAt?: string;
  fundingTxHash?: string;
  linkedSessionKey?: string;
}) {
  const suffix = input.requestId
    || input.fundingTxHash?.trim().toUpperCase()
    || [
      input.viewerId,
      input.scheduledAt?.trim(),
      input.linkedSessionKey?.trim(),
    ].filter(Boolean).join(":");
  return `${input.action}:${suffix}`.slice(0, 128);
}

function isAtOrPast(deadline: Date | null, now: Date) {
  return Boolean(deadline && now.getTime() >= deadline.getTime());
}

function sameNullableDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
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
    scheduleMode: string;
    scheduledAt: Date | null;
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
  if (scheduledMatch.scheduleMode !== "exact" || !scheduledMatch.scheduledAt) {
    const rawStatus = scheduledMatch.status.toLowerCase();
    const terminalStatuses = new Set([
      "declined",
      "expired",
      "funding_expired",
      "play_expired",
      "canceled",
      "cancelled",
      "completed",
      "forfeited",
      "no_show_left",
      "no_show_right",
      "double_no_show",
      "refunded",
    ]);
    const bothFunded = Boolean(
      scheduledMatch.challengerFundedAt && scheduledMatch.challengedFundedAt
    );
    const oneFunded = Boolean(
      scheduledMatch.challengerFundedAt || scheduledMatch.challengedFundedAt
    );
    const displayState = terminalStatuses.has(rawStatus)
      ? rawStatus
      : rawStatus === "live_confirmed"
        ? "live"
        : ["live", "ready", "result_pending"].includes(rawStatus)
          ? rawStatus
      : bothFunded
          ? "funded"
          : oneFunded
            ? scheduledMatch.challengerFundedAt
              ? "creator_funded"
              : "opponent_funded"
            : scheduledMatch.acceptedAt
              ? "terms_accepted"
              : rawStatus === "pending"
                ? "pending"
                : "proposed";
    const statusLabels: Record<string, string> = {
      proposed: "Awaiting response",
      pending: "Awaiting response",
      terms_accepted: "Funding window open",
      creator_funded: "Waiting on opponent funding",
      opponent_funded: "Waiting on creator funding",
      funded: "Match ready",
      canceled: "Cancelled",
      cancelled: "Cancelled",
      declined: "Declined",
      expired: "Expired",
      funding_expired: "Funding expired",
      play_expired: "Play window expired",
      completed: "Completed",
      refunded: "Refunded",
      live: "Live proof detected",
      ready: "Match ready",
      result_pending: "Result pending",
    };
    return {
      persistedStatus: displayState,
      displayState,
      economy: {
        statusLabel: statusLabels[displayState] || displayState.replaceAll("_", " "),
        statusDetail: statusLabels[displayState] || displayState.replaceAll("_", " "),
        checkInWindowState: "later" as const,
        resolution: { label: null as string | null },
      },
    };
  }

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

function optionalMatchTimeLines(scheduledAt: Date | null) {
  return scheduledAt
    ? [
        `Match time: ${formatScheduledAtForInbox(scheduledAt)}`,
        `Match time ISO: ${scheduledAt.toISOString()}`,
      ]
    : ["Match time: Play anytime after both players fund"];
}

function buildTermsAcceptedMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date | null;
  fundingExpiresAt: Date;
  totalFundingWolo: number;
  nextStatus: string;
}) {
  return [
    "Challenge terms accepted",
    `${input.challengerName} vs ${input.challengedName}`,
    ...optionalMatchTimeLines(input.scheduledAt),
    `Fund by: ${formatScheduledAtForInbox(input.fundingExpiresAt)}`,
    `Fund by ISO: ${input.fundingExpiresAt.toISOString()}`,
    `Funding: ${formatWolo(input.totalFundingWolo)} WOLO each`,
    `Status: ${input.nextStatus}`,
  ].join("\n");
}

function buildDeclineMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date | null;
  refundPending?: boolean;
}) {
  const lines = [
    "Challenge declined",
    `${input.challengerName} vs ${input.challengedName}`,
    ...optionalMatchTimeLines(input.scheduledAt),
    "Status: Terms declined",
  ];
  if (input.refundPending) lines.push("Refund: Processing on the verified settlement rail");
  return lines.join("\n");
}

function buildCancellationMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date | null;
  cancelledByName: string;
  refundPending?: boolean;
}) {
  const lines = [
    "Challenge cancelled",
    `${input.challengerName} vs ${input.challengedName}`,
    ...optionalMatchTimeLines(input.scheduledAt),
    `Status: Cancelled by ${input.cancelledByName}`,
  ];

  if (input.refundPending) {
    lines.push("Refund: Processing on the verified settlement rail");
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
  scheduledAt: Date | null;
  actorName: string;
  totalFundingWolo: number;
  statusLabel: string;
}) {
  return [
    "Challenge funding recorded",
    `${input.challengerName} vs ${input.challengedName}`,
    ...optionalMatchTimeLines(input.scheduledAt),
    `Funding: ${input.actorName} locked ${formatWolo(input.totalFundingWolo)} WOLO`,
    `Status: ${input.statusLabel}`,
  ].join("\n");
}

function buildTimeProposalMessage(input: {
  challengerName: string;
  challengedName: string;
  proposedAt: Date;
  proposedByName: string;
}) {
  return [
    "Challenge time proposed",
    `${input.challengerName} vs ${input.challengedName}`,
    `Proposed time: ${formatScheduledAtForInbox(input.proposedAt)}`,
    `Proposed time ISO: ${input.proposedAt.toISOString()}`,
    `Status: Waiting for the other player to confirm ${input.proposedByName}'s proposal`,
  ].join("\n");
}

function buildTimeConfirmedMessage(input: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date;
}) {
  return [
    "Challenge time confirmed",
    `${input.challengerName} vs ${input.challengedName}`,
    `Match time: ${formatScheduledAtForInbox(input.scheduledAt)}`,
    `Match time ISO: ${input.scheduledAt.toISOString()}`,
    "Status: Exact time confirmed by both players",
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
    eventKey: string;
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
      eventKey: input.eventKey.slice(0, 128),
      detail: input.detail?.slice(0, 255) || undefined,
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: input.createdAt,
    },
  });
}

async function hasActionEvent(
  prisma: ReturnType<typeof getPrisma>,
  scheduledMatchId: number,
  eventKey: string
) {
  return Boolean(
    await prisma.scheduledMatchActivity.findFirst({
      where: { scheduledMatchId, eventKey },
      select: { id: true },
    })
  );
}

async function lockExpectedChallengeVersion(
  tx: Prisma.TransactionClient,
  challengeId: number,
  expectedVersion: number,
  action?: "cancel" | "check_in" | "resolve_no_show",
  viewerUserId?: number
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_LIFECYCLE_LOCK_NAMESPACE}, ${challengeId})`;
  const locked = await tx.scheduledMatch.findUnique({
    where: { id: challengeId },
    select: SCHEDULED_MATCH_SELECT,
  });
  if (!locked || locked.lifecycleVersion !== expectedVersion) {
    throw new ChallengeActionError(
      "This Challenge changed while the action was in flight. Refresh and try once more."
    );
  }
  const lockedAt = new Date();
  const projected = projectChallengeLifecycle(locked, lockedAt);
  if (["expired", "funding_expired", "play_expired"].includes(projected.lifecycleState)) {
    throw new ChallengeActionError(
      "This Challenge's deadline has elapsed. Expiry and any required refund are reconciling now."
    );
  }

  const surface = computeChallengeSurface(locked, lockedAt);
  if (action === "cancel") {
    const hasAnyCheckIn = Boolean(
      locked.challengerCheckedInAt || locked.challengedCheckedInAt
    );
    if (
      hasAnyCheckIn ||
      surface.displayState === "live" ||
      !MANAGEABLE_DISPLAY_STATES.has(surface.displayState)
    ) {
      throw new ChallengeActionError(
        "This Challenge has crossed its match lock and can no longer be cancelled as a full refund."
      );
    }
  }

  if (action === "check_in") {
    const viewerIsChallenger = viewerUserId === locked.challengerUserId;
    const viewerIsChallenged = viewerUserId === locked.challengedUserId;
    if (!viewerIsChallenger && !viewerIsChallenged) {
      throw new ChallengeActionError("Only match participants can check in.", 403);
    }
    if (
      locked.scheduleMode !== "exact" ||
      !locked.scheduledAt ||
      surface.economy.checkInWindowState !== "open"
    ) {
      throw new ChallengeActionError(
        "Check-in is no longer open for this Challenge. Refresh for the authoritative match state."
      );
    }
    if (
      (viewerIsChallenger && locked.challengerCheckedInAt) ||
      (viewerIsChallenged && locked.challengedCheckedInAt)
    ) {
      throw new ChallengeActionError("This participant's check-in is already on file.");
    }
  }

  if (
    action === "resolve_no_show" &&
    !["no_show_left", "no_show_right", "double_no_show"].includes(
      surface.persistedStatus
    )
  ) {
    throw new ChallengeActionError(
      "This Challenge is not in an authoritative no-show resolution state."
    );
  }

  return { locked, lockedAt, surface };
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
      requestId?: string | null;
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
    const bothFunded = Boolean(
      scheduledMatch.challengerFundedAt && scheduledMatch.challengedFundedAt
    );
    const requestId = normalizeRequestId(
      payload.requestId || request.headers.get("Idempotency-Key")
    );

    if (!payload.action) {
      return NextResponse.json({ detail: "Choose a challenge action." }, { status: 400 });
    }

    const eventKey = actionEventKey({
      action: payload.action,
      requestId,
      viewerId: viewer.id,
      scheduledAt:
        payload.scheduledAt ||
        (payload.action === "confirm_time"
          ? scheduledMatch.proposedMatchAt?.toISOString()
          : scheduledMatch.scheduledAt?.toISOString()
            || scheduledMatch.acceptanceExpiresAt?.toISOString()
            || undefined),
      fundingTxHash: payload.fundingTxHash,
      linkedSessionKey: payload.linkedSessionKey,
    });

    if (
      payload.action !== "accept" &&
      payload.action !== "decline" &&
      payload.action !== "cancel" &&
      payload.action !== "reschedule" &&
      payload.action !== "propose_time" &&
      payload.action !== "confirm_time" &&
      payload.action !== "fund" &&
      payload.action !== "check_in" &&
      payload.action !== "resolve_no_show" &&
      payload.action !== "mark_completed"
    ) {
      return NextResponse.json({ detail: "Unknown challenge action." }, { status: 400 });
    }

    if (await hasActionEvent(prisma, challengeId, eventKey)) {
      const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
      return NextResponse.json({ ...refreshed, idempotentReplay: true });
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
      if (isAtOrPast(scheduledMatch.acceptanceExpiresAt, acceptedAt)) {
        return NextResponse.json(
          { detail: "This challenge's acceptance window has expired." },
          { status: 409 }
        );
      }
      const fullFundingExpiresAt = new Date(acceptedAt.getTime() + FUNDING_WINDOW_MS);
      const fundingExpiresAt =
        scheduledMatch.scheduleMode === "exact" &&
        scheduledMatch.scheduledAt &&
        scheduledMatch.scheduledAt < fullFundingExpiresAt
          ? scheduledMatch.scheduledAt
          : fullFundingExpiresAt;
      const nextStatus =
        fundingTotal > 0
          ? scheduledMatch.challengerFundedAt && !scheduledMatch.challengedFundedAt
            ? "creator_funded"
            : "terms_accepted"
          : "accepted";
      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(tx, challengeId, scheduledMatch.lifecycleVersion);
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: nextStatus,
            acceptedAt,
            fundingExpiresAt,
            timeConfirmedAt:
              scheduledMatch.scheduleMode === "exact"
                ? scheduledMatch.timeConfirmedAt ?? acceptedAt
                : scheduledMatch.timeConfirmedAt,
            declinedAt: null,
            cancelledAt: null,
            lifecycleVersion: { increment: 1 },
          },
        });
        await tx.trophyChallenge.updateMany({
          where: {
            scheduledMatchId: challengeId,
            status: { notIn: ["settled", "cancelled", "canceled", "disputed"] },
          },
          data: {
            status: "accepted",
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
          eventType: fundingTotal > 0 ? "terms_accepted" : "accepted",
          detail:
            fundingTotal > 0 && scheduledMatch.challengerFundedAt
              ? `Terms accepted. Opponent funding is next for ${formatWolo(fundingTotal)} WOLO.`
              : fundingTotal > 0
              ? `Terms accepted. Creator funding is next for ${formatWolo(fundingTotal)} WOLO.`
              : "Accepted and ready to lock.",
          metadata: {
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
            fundingExpiresAt: fundingExpiresAt.toISOString(),
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
            fundingExpiresAt,
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
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
            fundingExpiresAt: fundingExpiresAt.toISOString(),
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
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
            fundingExpiresAt: fundingExpiresAt.toISOString(),
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

      if (!["proposed", "pending", "creator_funded"].includes(currentSurface.displayState)) {
        return NextResponse.json(
          { detail: "This challenge is no longer awaiting terms acceptance." },
          { status: 409 }
        );
      }

      const declinedAt = new Date();
      const hasAnyFunding = Boolean(
        scheduledMatch.challengerFundedAt || scheduledMatch.challengedFundedAt
      );
      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(tx, challengeId, scheduledMatch.lifecycleVersion);
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "declined",
            declinedAt,
            settlementReadyAt: hasAnyFunding
              ? scheduledMatch.settlementReadyAt ?? declinedAt
              : scheduledMatch.settlementReadyAt,
            lifecycleVersion: { increment: 1 },
          },
        });
        await tx.trophyChallenge.updateMany({
          where: {
            scheduledMatchId: challengeId,
            status: { notIn: ["settled", "cancelled", "canceled", "disputed"] },
          },
          data: {
            status: "cancelled",
            settlementStatus: "cancelled",
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
          eventType: "declined",
          detail: hasAnyFunding
            ? "Challenge declined. Verified deposits are ready for refund processing."
            : "Challenge declined.",
          metadata: hasAnyFunding
            ? {
                refundPending: true,
                challengerFunded: Boolean(scheduledMatch.challengerFundedAt),
                challengedFunded: Boolean(scheduledMatch.challengedFundedAt),
              }
            : undefined,
          createdAt: declinedAt,
        });

        if (hasAnyFunding) {
          await recordChallengeActivity(tx, {
            scheduledMatchId: challengeId,
            actorUserId: viewer.id,
            eventKey: `refund-request:${requestId || eventKey}`.slice(0, 128),
            eventType: "refund_requested",
            detail: "Verified deposits queued for deterministic refund processing.",
            metadata: {
              terminalStatus: "declined",
              challengerFunded: Boolean(scheduledMatch.challengerFundedAt),
              challengedFunded: Boolean(scheduledMatch.challengedFundedAt),
              totalFundingWolo: fundingTotal,
            },
            createdAt: declinedAt,
          });
        }

        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId: scheduledMatch.challengerUserId,
          challengeId,
          body: buildDeclineMessage({
            challengerName,
            challengedName,
            scheduledAt: scheduledMatch.scheduledAt,
            refundPending: hasAnyFunding,
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
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
            refundPending: hasAnyFunding,
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
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
            refundPending: hasAnyFunding,
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
        ? `${challengeLabel} · cancelled · verified deposits queued for refund processing`
        : `${challengeLabel} · cancelled`;

      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(
          tx,
          challengeId,
          scheduledMatch.lifecycleVersion,
          "cancel",
          viewer.id
        );
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "canceled",
            cancelledAt,
            settlementReadyAt: hasAnyFunding
              ? scheduledMatch.settlementReadyAt ?? cancelledAt
              : scheduledMatch.settlementReadyAt,
            lifecycleVersion: { increment: 1 },
          },
        });
        await tx.trophyChallenge.updateMany({
          where: {
            scheduledMatchId: challengeId,
            status: { notIn: ["settled", "cancelled", "canceled", "disputed"] },
          },
          data: {
            status: "cancelled",
            settlementStatus: "cancelled",
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
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

        if (hasAnyFunding) {
          await recordChallengeActivity(tx, {
            scheduledMatchId: challengeId,
            actorUserId: viewer.id,
            eventKey: `refund-request:${requestId || eventKey}`.slice(0, 128),
            eventType: "refund_requested",
            detail: "Verified deposits queued for deterministic refund processing.",
            metadata: {
              terminalStatus: "canceled",
              challengerFunded: Boolean(scheduledMatch.challengerFundedAt),
              challengedFunded: Boolean(scheduledMatch.challengedFundedAt),
              totalFundingWolo: fundingTotal,
            },
            createdAt: cancelledAt,
          });
        }

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
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
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
            scheduledAt: scheduledMatch.scheduledAt?.toISOString() ?? null,
            refundPending: hasAnyFunding,
          },
        });
      });
    }

    if (payload.action === "propose_time" || (payload.action === "reschedule" && bothFunded)) {
      if (!viewerIsChallenger && !viewerIsChallenged) {
        return NextResponse.json(
          { detail: "Only the two players can propose a match time." },
          { status: 403 }
        );
      }
      if (!bothFunded) {
        return NextResponse.json(
          { detail: "Both players must fund before using mutual time proposals." },
          { status: 409 }
        );
      }
      if (
        scheduledMatch.challengerCheckedInAt ||
        scheduledMatch.challengedCheckedInAt ||
        currentSurface.displayState === "live" ||
        ["live", "completed", "canceled", "cancelled", "declined", "expired", "funding_expired", "play_expired"].includes(
          scheduledMatch.status.toLowerCase()
        )
      ) {
        return NextResponse.json(
          { detail: "This challenge can no longer accept a new time proposal." },
          { status: 409 }
        );
      }

      const proposedMatchAt = parseScheduledMatchDate(payload.scheduledAt);
      if (!proposedMatchAt) {
        return NextResponse.json({ detail: "Choose a valid proposed match time." }, { status: 400 });
      }
      const proposedAt = new Date();
      const proposalWindowError = validateScheduledAtWindow(proposedMatchAt, proposedAt);
      if (proposalWindowError) {
        return NextResponse.json({ detail: proposalWindowError }, { status: 400 });
      }
      if (
        scheduledMatch.playExpiresAt &&
        proposedMatchAt.getTime() > scheduledMatch.playExpiresAt.getTime()
      ) {
        return NextResponse.json(
          { detail: "Choose a time inside this challenge's play window." },
          { status: 400 }
        );
      }

      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;
      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(tx, challengeId, scheduledMatch.lifecycleVersion);
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "funded",
            proposedMatchAt,
            proposedMatchByUserId: viewer.id,
            timeProposedAt: proposedAt,
            lifecycleVersion: { increment: 1 },
          },
        });
        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
          eventType: "time_proposed",
          detail: `${playerName(viewer)} proposed ${formatScheduledAtForInbox(proposedMatchAt)}.`,
          metadata: {
            proposedMatchAt: proposedMatchAt.toISOString(),
            proposedByUserId: viewer.id,
          },
          createdAt: proposedAt,
        });
        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId,
          challengeId,
          body: buildTimeProposalMessage({
            challengerName,
            challengedName,
            proposedAt: proposedMatchAt,
            proposedByName: playerName(viewer),
          }),
          now: proposedAt,
        });
      });
    }

    if (payload.action === "confirm_time") {
      if (!viewerIsChallenger && !viewerIsChallenged) {
        return NextResponse.json(
          { detail: "Only the two players can confirm a match time." },
          { status: 403 }
        );
      }
      if (!bothFunded || !scheduledMatch.proposedMatchAt || !scheduledMatch.proposedMatchByUserId) {
        return NextResponse.json(
          { detail: "There is no funded time proposal to confirm." },
          { status: 409 }
        );
      }
      if (
        scheduledMatch.challengerCheckedInAt ||
        scheduledMatch.challengedCheckedInAt ||
        currentSurface.displayState === "live" ||
        ["completed", "canceled", "cancelled", "declined", "expired", "funding_expired", "play_expired"].includes(
          scheduledMatch.status.toLowerCase()
        )
      ) {
        return NextResponse.json(
          { detail: "This challenge can no longer confirm a different match time." },
          { status: 409 }
        );
      }
      if (scheduledMatch.proposedMatchByUserId === viewer.id) {
        return NextResponse.json(
          { detail: "The other player must confirm your proposed time." },
          { status: 409 }
        );
      }
      const confirmedMatchAt = scheduledMatch.proposedMatchAt;
      const proposedByUserId = scheduledMatch.proposedMatchByUserId;
      const confirmedAt = new Date();
      if (confirmedMatchAt.getTime() < confirmedAt.getTime() + SCHEDULE_WINDOW_MIN_MS) {
        return NextResponse.json(
          { detail: "That proposed time has passed or is too close. Propose a new time." },
          { status: 409 }
        );
      }
      const targetUserId = proposedByUserId;
      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(tx, challengeId, scheduledMatch.lifecycleVersion);
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: "funded",
            scheduleMode: "exact",
            scheduledAt: confirmedMatchAt,
            playExpiresAt: null,
            proposedMatchAt: null,
            proposedMatchByUserId: null,
            timeProposedAt: null,
            timeConfirmedAt: confirmedAt,
            challengerCheckedInAt: null,
            challengedCheckedInAt: null,
            lifecycleVersion: { increment: 1 },
          },
        });
        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
          eventType: "time_confirmed",
          detail: `Both players confirmed ${formatScheduledAtForInbox(confirmedMatchAt)}.`,
          metadata: {
            scheduledAt: confirmedMatchAt.toISOString(),
            proposedByUserId,
            confirmedByUserId: viewer.id,
          },
          createdAt: confirmedAt,
        });
        await postChallengeInboxNotice(tx, {
          senderUserId: viewer.id,
          targetUserId,
          challengeId,
          body: buildTimeConfirmedMessage({
            challengerName,
            challengedName,
            scheduledAt: confirmedMatchAt,
          }),
          now: confirmedAt,
        });
      });
    }

    if (payload.action === "reschedule" && !bothFunded) {
      const hasAnyFunding =
        Boolean(scheduledMatch.challengerFundedAt) || Boolean(scheduledMatch.challengedFundedAt);
      const hasAnyCheckIn =
        Boolean(scheduledMatch.challengerCheckedInAt) || Boolean(scheduledMatch.challengedCheckedInAt);

      if (hasAnyFunding || scheduledMatch.acceptedAt) {
        return NextResponse.json(
          {
            detail:
              "Accepted or funded Challenges cannot be moved unilaterally. Finish funding, then propose a time for the other player to confirm.",
          },
          { status: 409 }
        );
      }

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
      const resetAcceptanceExpiresAt = new Date(
        Math.min(
          rescheduledAt.getTime() + 72 * HOUR_MS,
          nextScheduledAt.getTime()
        )
      );
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;
      const nextFundingTotal = wagerAmountWolo + guaranteeAmountWolo;
      const nextShape = {
        ...scheduledMatch,
        scheduleMode: "exact",
        scheduledAt: nextScheduledAt,
        challengeNote: nextChallengeNote,
        wagerAmountWolo,
        guaranteeAmountWolo,
      };
      const nextSurface = hasAnyFunding
        ? computeChallengeSurface(nextShape, rescheduledAt)
        : null;

      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(tx, challengeId, scheduledMatch.lifecycleVersion);
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: hasAnyFunding
            ? {
                status: nextSurface?.persistedStatus ?? scheduledMatch.status,
                scheduleMode: "exact",
                scheduledAt: nextScheduledAt,
                challengeNote: nextChallengeNote,
                wagerAmountWolo,
                guaranteeAmountWolo,
                declinedAt: null,
                cancelledAt: null,
                proposedMatchAt: null,
                proposedMatchByUserId: null,
                timeProposedAt: null,
                timeConfirmedAt: null,
                lifecycleVersion: { increment: 1 },
              }
            : {
                status: "proposed",
                scheduleMode: "exact",
                scheduledAt: nextScheduledAt,
                acceptanceExpiresAt: resetAcceptanceExpiresAt,
                fundingExpiresAt: null,
                playExpiresAt: null,
                proposedMatchAt: null,
                proposedMatchByUserId: null,
                timeProposedAt: null,
                timeConfirmedAt: null,
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
                lifecycleVersion: { increment: 1 },
              },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
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
            acceptanceExpiresAt: hasAnyFunding
              ? scheduledMatch.acceptanceExpiresAt?.toISOString() ?? null
              : resetAcceptanceExpiresAt.toISOString(),
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
          { detail: "Accept the challenge before funding your side." },
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

      const fundingAttemptAt = new Date();
      if (
        !scheduledMatch.acceptedAt &&
        isAtOrPast(scheduledMatch.acceptanceExpiresAt, fundingAttemptAt)
      ) {
        return NextResponse.json(
          { detail: "Funding closed when the invitation expired." },
          { status: 409 }
        );
      }
      if (
        scheduledMatch.acceptedAt &&
        isAtOrPast(scheduledMatch.fundingExpiresAt, fundingAttemptAt)
      ) {
        return NextResponse.json(
          { detail: "This challenge's funding window has expired." },
          { status: 409 }
        );
      }
      if (
        scheduledMatch.scheduleMode === "exact" &&
        scheduledMatch.scheduledAt &&
        scheduledMatch.scheduledAt.getTime() <= fundingAttemptAt.getTime()
      ) {
        return NextResponse.json({ detail: "Funding closed when the exact match time locked." }, { status: 409 });
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
      const fundedAt = fundingAttemptAt;
      const targetUserId = viewerIsChallenger
        ? scheduledMatch.challengedUserId
        : scheduledMatch.challengerUserId;

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_LIFECYCLE_LOCK_NAMESPACE}, ${challengeId})`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_FUNDING_PROOF_LOCK_NAMESPACE}, hashtext(${verifiedFundingTxHash}))`;
        const lockedMatch = await tx.scheduledMatch.findUnique({
          where: { id: challengeId },
          select: SCHEDULED_MATCH_SELECT,
        });
        if (!lockedMatch || !FUNDABLE_STATUSES.has(lockedMatch.status.toLowerCase())) {
          throw new ChallengeActionError("This match is no longer open for funding.");
        }
        const fundingBasisChanged =
          lockedMatch.lifecycleVersion !== scheduledMatch.lifecycleVersion ||
          lockedMatch.wagerAmountWolo !== scheduledMatch.wagerAmountWolo ||
          lockedMatch.guaranteeAmountWolo !== scheduledMatch.guaranteeAmountWolo ||
          lockedMatch.scheduleMode !== scheduledMatch.scheduleMode ||
          !sameNullableDate(lockedMatch.scheduledAt, scheduledMatch.scheduledAt) ||
          !sameNullableDate(lockedMatch.acceptedAt, scheduledMatch.acceptedAt) ||
          !sameNullableDate(
            lockedMatch.acceptanceExpiresAt,
            scheduledMatch.acceptanceExpiresAt
          ) ||
          !sameNullableDate(lockedMatch.fundingExpiresAt, scheduledMatch.fundingExpiresAt);
        if (fundingBasisChanged) {
          throw new ChallengeActionError(
            "Challenge terms changed while WoloChain verified this deposit. The proof was not attached to stale terms; refresh and use the funding recovery path before sending anything again."
          );
        }
        if (
          (!lockedMatch.acceptedAt && isAtOrPast(lockedMatch.acceptanceExpiresAt, fundedAt)) ||
          (lockedMatch.acceptedAt && isAtOrPast(lockedMatch.fundingExpiresAt, fundedAt))
        ) {
          throw new ChallengeActionError("This challenge's funding window has expired.");
        }

        const existingSideHash = viewerIsChallenger
          ? lockedMatch.challengerFundingTxHash
          : lockedMatch.challengedFundingTxHash;
        const existingSideFundedAt = viewerIsChallenger
          ? lockedMatch.challengerFundedAt
          : lockedMatch.challengedFundedAt;
        if (existingSideFundedAt) {
          if (existingSideHash?.toUpperCase() === verifiedFundingTxHash.toUpperCase()) {
            return;
          }
          throw new ChallengeActionError("Funding is already recorded for this participant.");
        }

        const oppositeSideHash = viewerIsChallenger
          ? lockedMatch.challengedFundingTxHash
          : lockedMatch.challengerFundingTxHash;
        if (oppositeSideHash?.toUpperCase() === verifiedFundingTxHash.toUpperCase()) {
          throw new ChallengeActionError(
            "That funding tx is already attached to the other participant in this Challenge."
          );
        }

        const duplicateProof = await tx.scheduledMatch.findFirst({
          where: {
            OR: [
              { challengerFundingTxHash: verifiedFundingTxHash },
              { challengedFundingTxHash: verifiedFundingTxHash },
            ],
          },
          select: { id: true },
        });
        if (duplicateProof) {
          throw new ChallengeActionError(
            `That funding tx is already attached to challenge #${duplicateProof.id}.`
          );
        }

        const nextShape = {
          ...lockedMatch,
          challengerFundedAt: viewerIsChallenger ? fundedAt : lockedMatch.challengerFundedAt,
          challengerFundingTxHash: viewerIsChallenger
            ? verifiedFundingTxHash
            : lockedMatch.challengerFundingTxHash,
          challengerFundingWalletAddress: viewerIsChallenger
            ? fundingWalletAddress
            : lockedMatch.challengerFundingWalletAddress,
          challengedFundedAt: viewerIsChallenged ? fundedAt : lockedMatch.challengedFundedAt,
          challengedFundingTxHash: viewerIsChallenged
            ? verifiedFundingTxHash
            : lockedMatch.challengedFundingTxHash,
          challengedFundingWalletAddress: viewerIsChallenged
            ? fundingWalletAddress
            : lockedMatch.challengedFundingWalletAddress,
        };
        const nextBothFunded = Boolean(
          nextShape.challengerFundedAt && nextShape.challengedFundedAt
        );
        const nextStatus = nextBothFunded
          ? "funded"
          : nextShape.challengerFundedAt
            ? "creator_funded"
            : "opponent_funded";
        const playExpiresAt =
          nextBothFunded && lockedMatch.scheduleMode === "open"
            ? lockedMatch.playExpiresAt ?? new Date(fundedAt.getTime() + OPEN_PLAY_WINDOW_MS)
            : lockedMatch.playExpiresAt;
        const nextSurface = computeChallengeSurface(
          { ...nextShape, status: nextStatus },
          fundedAt
        );

        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: nextStatus,
            playExpiresAt,
            timeConfirmedAt:
              nextBothFunded && lockedMatch.scheduleMode === "exact"
                ? lockedMatch.timeConfirmedAt ?? fundedAt
                : lockedMatch.timeConfirmedAt,
            challengerFundedAt: viewerIsChallenger ? fundedAt : undefined,
            challengerFundingTxHash: viewerIsChallenger ? verifiedFundingTxHash : undefined,
            challengerFundingWalletAddress: viewerIsChallenger ? fundingWalletAddress : undefined,
            challengedFundedAt: viewerIsChallenged ? fundedAt : undefined,
            challengedFundingTxHash: viewerIsChallenged ? verifiedFundingTxHash : undefined,
            challengedFundingWalletAddress: viewerIsChallenged ? fundingWalletAddress : undefined,
            lifecycleVersion: { increment: 1 },
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
          eventType: viewerIsChallenger ? "creator_funded" : "opponent_funded",
          detail: `${playerName(viewer)} locked ${formatWolo(fundingTotal)} WOLO.`,
          metadata: {
            fundingTxHash: verifiedFundingTxHash,
            fundingWalletAddress,
            totalFundingWolo: fundingTotal,
            proofUrl: fundingVerification.proofUrl ?? null,
            verifiedBy: "wolochain",
            bothFunded: nextBothFunded,
            playExpiresAt: playExpiresAt?.toISOString() ?? null,
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
            scheduledAt: lockedMatch.scheduledAt,
            actorName: playerName(viewer),
            totalFundingWolo: fundingTotal,
            statusLabel: nextBothFunded
              ? lockedMatch.scheduleMode === "open"
                ? "Match ready · play anytime"
                : "Match ready"
              : nextSurface.economy.statusLabel,
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

    if (payload.action === "check_in") {
      if (!viewerIsChallenger && !viewerIsChallenged) {
        return NextResponse.json({ detail: "Only match participants can check in." }, { status: 403 });
      }

      const exactScheduledAt =
        scheduledMatch.scheduleMode === "exact" ? scheduledMatch.scheduledAt : null;
      if (!exactScheduledAt) {
        return NextResponse.json(
          { detail: "Play-anytime challenges do not use check-in. Propose and confirm an exact time first." },
          { status: 409 }
        );
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
        await lockExpectedChallengeVersion(
          tx,
          challengeId,
          scheduledMatch.lifecycleVersion,
          "check_in",
          viewer.id
        );
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: nextSurface.persistedStatus,
            challengerCheckedInAt: viewerIsChallenger ? checkedInAt : undefined,
            challengedCheckedInAt: viewerIsChallenged ? checkedInAt : undefined,
            lifecycleVersion: { increment: 1 },
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewer.id,
          eventKey,
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
            scheduledAt: exactScheduledAt,
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

      const exactScheduledAt =
        scheduledMatch.scheduleMode === "exact" ? scheduledMatch.scheduledAt : null;
      if (!exactScheduledAt) {
        return NextResponse.json(
          { detail: "Open play-anytime challenges cannot resolve as no-shows." },
          { status: 409 }
        );
      }

      const resolvedSurface = computeChallengeSurface(scheduledMatch, new Date());
      if (
        resolvedSurface.persistedStatus !== "no_show_left" &&
        resolvedSurface.persistedStatus !== "no_show_right" &&
        resolvedSurface.persistedStatus !== "double_no_show"
      ) {
        return NextResponse.json({ detail: "This match is not in a no-show resolution state." }, { status: 409 });
      }

      const resolvedAt = new Date(exactScheduledAt);
      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(
          tx,
          challengeId,
          scheduledMatch.lifecycleVersion,
          "resolve_no_show",
          viewer.id
        );
        await tx.scheduledMatch.update({
          where: { id: challengeId },
          data: {
            status: resolvedSurface.persistedStatus,
            resultAt: scheduledMatch.resultAt ?? resolvedAt,
            settlementReadyAt: scheduledMatch.settlementReadyAt ?? resolvedAt,
            lifecycleVersion: { increment: 1 },
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          actorUserId: viewerIsChallenger || viewerIsChallenged ? viewer.id : undefined,
          eventKey,
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
              scheduledAt: exactScheduledAt,
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

      if (!["funded", "ready", "live"].includes(currentSurface.displayState)) {
        return NextResponse.json(
          { detail: "Only ready or live-confirmed matches can move to result-ready." },
          { status: 409 }
        );
      }

      const completedAt = new Date();
      const requestedLinkedSessionKey = payload.linkedSessionKey?.trim() || null;
      if (
        scheduledMatch.linkedSessionKey &&
        requestedLinkedSessionKey &&
        requestedLinkedSessionKey !== scheduledMatch.linkedSessionKey
      ) {
        return NextResponse.json(
          { detail: "A durable replay link cannot be replaced through generic completion." },
          { status: 409 }
        );
      }
      const linkedSessionKey =
        scheduledMatch.linkedSessionKey ?? requestedLinkedSessionKey;
      if (linkedSessionKey) {
        const existingReplayClaim = await prisma.scheduledMatch.findFirst({
          where: {
            id: { not: challengeId },
            linkedSessionKey,
          },
          select: { id: true },
        });
        if (existingReplayClaim) {
          return NextResponse.json(
            { detail: `That replay is already durable proof for challenge #${existingReplayClaim.id}.` },
            { status: 409 }
          );
        }
      }
      const linkedMapName =
        payload.linkedMapName?.trim() || scheduledMatch.linkedMapName || null;
      const linkedWinner =
        payload.linkedWinner?.trim() || scheduledMatch.linkedWinner || null;
      const linkedDurationSeconds =
        typeof payload.linkedDurationSeconds === "number" && Number.isFinite(payload.linkedDurationSeconds)
          ? Math.max(0, Math.floor(payload.linkedDurationSeconds))
          : scheduledMatch.linkedDurationSeconds;

      await prisma.$transaction(async (tx) => {
        await lockExpectedChallengeVersion(tx, challengeId, scheduledMatch.lifecycleVersion);
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
            lifecycleVersion: { increment: 1 },
          },
        });

        await recordChallengeActivity(tx, {
          scheduledMatchId: challengeId,
          eventKey,
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

    publishDirectMessageEvent(scheduledMatch.challenger.uid, {
      type: "message",
      targetUid: scheduledMatch.challenged.uid,
    });
    publishDirectMessageEvent(scheduledMatch.challenged.uid, {
      type: "message",
      targetUid: scheduledMatch.challenger.uid,
    });
    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json(refreshed);
  } catch (error) {
    console.error("Failed to update scheduled match:", error);
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : null;
    const detail = error instanceof Error ? error.message : "Challenge update failed.";
    return NextResponse.json(
      {
        detail:
          errorCode === "P2002"
            ? "That request, funding proof, activity, or replay link is already attached to another Challenge."
            : detail,
      },
      {
        status:
          error instanceof ChallengeActionError
            ? error.status
            : errorCode === "P2002"
              ? 409
              : 500,
      }
    );
  }
}
