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
  normalizeChallengeWoloAmount,
  validateChallengeTermsAmounts,
} from "@/lib/challengeEconomy";
import { postChallengeInboxNotice } from "@/lib/contactInbox";
import { publishDirectMessageEvent } from "@/lib/directMessageEvents";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";
import {
  ensureTrophySeedData,
  loadTrophyUsers,
  seededTrophyKeyForChallenge,
} from "@/lib/trophies/service";
import { recordUserActivity } from "@/lib/userExperience";
import { countriesEligibilityMatch } from "@/lib/countryEligibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const SCHEDULE_WINDOW_MIN_MS = 2 * 60 * 1000;
const SCHEDULE_WINDOW_MAX_MS = 30 * DAY_MS;
const DEFAULT_ACCEPTANCE_WINDOW_HOURS = 72;
const ACCEPTANCE_WINDOW_HOURS = new Set([24, 72, 7 * 24, 30 * 24]);
const CHALLENGE_PAIR_LOCK_NAMESPACE = 752028;
const CHALLENGE_TROPHY_LOCK_NAMESPACE = 752029;
const ACTIVE_CHALLENGE_PAIR_STATUSES = [
  "pending",
  "accepted",
  "proposed",
  "terms_accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
  "left_checked_in",
  "right_checked_in",
  "ready",
  "live_confirmed",
  "live",
  "result_pending",
] as const;

class ChallengeCreationError extends Error {
  status: number;
  existingChallengeId?: number;

  constructor(message: string, status = 409, existingChallengeId?: number) {
    super(message);
    this.name = "ChallengeCreationError";
    this.status = status;
    this.existingChallengeId = existingChallengeId;
  }
}

const VIEWER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  walletAddress: true,
  representedCountry: true,
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
  acceptanceExpiresAt,
  challengeNote,
  wagerAmountWolo,
  guaranteeAmountWolo,
  titleStakeNames,
}: {
  challengerName: string;
  challengedName: string;
  scheduledAt: Date | null;
  acceptanceExpiresAt: Date;
  challengeNote: string | null;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  titleStakeNames: string[];
}) {
  const totalFundingWolo = wagerAmountWolo + guaranteeAmountWolo;
  const lines = [
    "Challenge issued",
    `${challengerName} vs ${challengedName}`,
    `Accept by: ${formatScheduledAtForInbox(acceptanceExpiresAt)}`,
    `Accept by ISO: ${acceptanceExpiresAt.toISOString()}`,
    ...(scheduledAt
      ? [
          `Match time: ${formatScheduledAtForInbox(scheduledAt)}`,
          `Match time ISO: ${scheduledAt.toISOString()}`,
        ]
      : ["Match time: Play anytime after both players fund"]),
    `Wolo Wager: ${formatWolo(wagerAmountWolo)} WOLO`,
    `Match Guarantee: ${formatWolo(guaranteeAmountWolo)} WOLO`,
    `Funding: ${formatWolo(totalFundingWolo)} WOLO each`,
    "Status: Awaiting terms acceptance",
  ];

  if (titleStakeNames.length > 0) {
    lines.push(`Title Stakes: ${titleStakeNames.join(", ")}`);
    lines.push("Title Rule: Eligible app-side titles move only after verified watcher or replay proof.");
  }

  if (challengeNote) {
    lines.push(`Note: ${challengeNote}`);
  }

  return lines.join("\n");
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
  if (!normalized) return null;
  return normalized.slice(0, 128);
}

function parseAcceptanceWindowHours(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_ACCEPTANCE_WINDOW_HOURS;
  }
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) && ACCEPTANCE_WINDOW_HOURS.has(parsed) ? parsed : null;
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
    const requestedFocusId = Number.parseInt(request.nextUrl.searchParams.get("focus") || "", 10);
    const payload = await loadChallengeHubSnapshot(prisma, viewerUid, {
      focusId: Number.isFinite(requestedFocusId) && requestedFocusId > 0 ? requestedFocusId : null,
    });
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
      scheduleMode?: string;
      acceptanceWindowHours?: string | number | null;
      creationRequestId?: string | null;
      requestId?: string | null;
      challengeNote?: string;
      wagerAmountWolo?: string | number | null;
      guaranteeAmountWolo?: string | number | null;
      trophyTitleId?: string | null;
      trophyCountry?: string | null;
    };

    const challengedUid =
      typeof payload.challengedUid === "string" ? payload.challengedUid.trim() : "";
    const createdAt = new Date();
    if (
      payload.scheduleMode !== undefined &&
      payload.scheduleMode !== "open" &&
      payload.scheduleMode !== "exact"
    ) {
      return NextResponse.json(
        { detail: "Schedule mode must be open or exact." },
        { status: 400 }
      );
    }
    const scheduleMode = payload.scheduleMode === "exact" ? "exact" : "open";
    const scheduledAt = scheduleMode === "exact"
      ? parseScheduledMatchDate(payload.scheduledAt)
      : null;
    const acceptanceWindowHours = parseAcceptanceWindowHours(payload.acceptanceWindowHours);
    const creationRequestId = normalizeRequestId(
      payload.creationRequestId || payload.requestId || request.headers.get("Idempotency-Key")
    );
    if (creationRequestId) {
      const existingRequest = await prisma.scheduledMatch.findUnique({
        where: { creationRequestId },
        select: { id: true, challengerUserId: true },
      });
      if (existingRequest) {
        if (existingRequest.challengerUserId !== viewer.id) {
          return NextResponse.json(
            { detail: "That creation request id is already in use." },
            { status: 409 }
          );
        }
        const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
        return NextResponse.json({
          ...refreshed,
          createdChallengeId: existingRequest.id,
          idempotentReplay: true,
        });
      }
    }
    const challengeNote = normalizeChallengeNote(payload.challengeNote);
    const wagerAmountWolo =
      normalizeChallengeWoloAmount(payload.wagerAmountWolo) ?? CHALLENGE_DEFAULT_WAGER_WOLO;
    const guaranteeAmountWolo =
      normalizeChallengeWoloAmount(payload.guaranteeAmountWolo) ??
      CHALLENGE_DEFAULT_GUARANTEE_WOLO;
    const trophyKey = seededTrophyKeyForChallenge(
      typeof payload.trophyTitleId === "string" ? payload.trophyTitleId : null,
      typeof payload.trophyCountry === "string" ? payload.trophyCountry : null
    );

    if (!challengedUid) {
      return NextResponse.json({ detail: "Pick a player to challenge." }, { status: 400 });
    }

    if (challengedUid === viewer.uid) {
      return NextResponse.json({ detail: "Challenge another player, not yourself." }, { status: 400 });
    }

    if (acceptanceWindowHours === null) {
      return NextResponse.json(
        { detail: "Choose an acceptance window of 24 hours, 3 days, 7 days, or 30 days." },
        { status: 400 }
      );
    }

    if (scheduleMode === "exact" && !scheduledAt) {
      return NextResponse.json({ detail: "Choose a valid exact match time." }, { status: 400 });
    }

    const termsError = validateChallengeTermsAmounts(wagerAmountWolo, guaranteeAmountWolo);
    if (termsError) {
      return NextResponse.json({ detail: termsError }, { status: 400 });
    }

    if (scheduledAt) {
      const scheduledAtWindowError = validateScheduledAtWindow(scheduledAt, createdAt);
      if (scheduledAtWindowError) {
        return NextResponse.json({ detail: scheduledAtWindowError }, { status: 400 });
      }
    }

    const requestedAcceptanceExpiresAt = new Date(
      createdAt.getTime() + acceptanceWindowHours * HOUR_MS
    );
    const acceptanceExpiresAt = scheduledAt && scheduledAt < requestedAcceptanceExpiresAt
      ? scheduledAt
      : requestedAcceptanceExpiresAt;

    const challenged = await prisma.user.findUnique({
      where: { uid: challengedUid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
        representedCountry: true,
      },
    });

    if (!challenged) {
      return NextResponse.json({ detail: "Challenged player not found." }, { status: 404 });
    }

    const pairWhere = {
      status: { in: [...ACTIVE_CHALLENGE_PAIR_STATUSES] },
      OR: [
        { challengerUserId: viewer.id, challengedUserId: challenged.id },
        { challengerUserId: challenged.id, challengedUserId: viewer.id },
      ],
    };
    const existingActiveMatch = await prisma.scheduledMatch.findFirst({
      where: pairWhere,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (existingActiveMatch) {
      return NextResponse.json(
        {
          detail: `You and ${playerName(challenged)} already have active challenge #${existingActiveMatch.id}. Finish or cancel it before issuing another.`,
          existingChallengeId: existingActiveMatch.id,
        },
        { status: 409 }
      );
    }
    const duplicateWarning = null;

    const challengerName = playerName(viewer);
    const challengedName = playerName(challenged);
    const challengeLabel = buildChallengeLabel({ challengerName, challengedName });
    const totalFundingWolo = wagerAmountWolo + guaranteeAmountWolo;
    let targetTrophy:
      | Awaited<ReturnType<typeof prisma.trophy.findUnique>>
      | null = null;
    let challengerRating: number | null = null;

    if (trophyKey) {
      await ensureTrophySeedData(prisma);
      targetTrophy = await prisma.trophy.findUnique({ where: { trophyId: trophyKey } });
      if (!targetTrophy) {
        return NextResponse.json({ detail: "That trophy target is unavailable." }, { status: 404 });
      }

      const expectedDefenderId =
        targetTrophy.currentHolderUserId ?? targetTrophy.guardianHolderUserId;
      if (
        !expectedDefenderId &&
        ["held", "active", "guardian_held"].includes(targetTrophy.status)
      ) {
        return NextResponse.json(
          {
            detail: `${targetTrophy.displayName} custody is not linked to an app identity yet. An admin must link the holder or Guardian before scheduling its title fight.`,
          },
          { status: 409 }
        );
      }
      if (expectedDefenderId && expectedDefenderId !== challenged.id) {
        const targetName =
          targetTrophy.currentHolderDisplayName ||
          targetTrophy.guardianHolderDisplayName ||
          "the current custodian";
        return NextResponse.json(
          { detail: `${targetTrophy.displayName} must be scheduled against ${targetName}.` },
          { status: 400 }
        );
      }

      if (targetTrophy.family === "national") {
        if (!countriesEligibilityMatch(viewer.representedCountry, targetTrophy.eligibleNationality)) {
          return NextResponse.json(
            {
              detail: `Set Representing Country to ${targetTrophy.eligibleNationality} before challenging for this belt.`,
            },
            { status: 400 }
          );
        }
      } else if (targetTrophy.family === "elo") {
        const trophyUsers = await loadTrophyUsers(prisma);
        challengerRating =
          trophyUsers.find((user) => user.id === viewer.id)?.rating ?? null;
        const meetsMaximum =
          targetTrophy.eloBandMax === null ||
          (challengerRating !== null && challengerRating <= targetTrophy.eloBandMax);
        if (challengerRating === null || !meetsMaximum) {
          return NextResponse.json(
            {
              detail: `${targetTrophy.displayName} requires replay-backed ELO at or below ${targetTrophy.eloBandMax ?? "the open upper bound"}. Lower-rated upward invaders are eligible.`,
            },
            { status: 400 }
          );
        }
      }

      const existingTitleDefense = await prisma.trophyChallenge.findFirst({
        where: {
          trophyId: targetTrophy.id,
          scheduledMatchId: { not: null },
          status: {
            notIn: ["cancelled", "canceled", "disputed", "settled"],
          },
        },
        select: { id: true, scheduledMatchId: true },
      });
      if (existingTitleDefense) {
        return NextResponse.json(
          {
            detail: `${targetTrophy.displayName} is already attached to active challenge #${existingTitleDefense.scheduledMatchId}.`,
          },
          { status: 409 }
        );
      }
    }

    const titleStakePlans: Array<{
      trophy: NonNullable<typeof targetTrophy>;
      challenger: typeof viewer | typeof challenged;
      opponent: typeof viewer | typeof challenged;
      challengerRating: number | null;
      automatic: boolean;
    }> = [];

    if (targetTrophy) {
      titleStakePlans.push({
        trophy: targetTrophy,
        challenger: viewer,
        opponent: challenged,
        challengerRating,
        automatic: false,
      });
    } else {
      const participantIds = [viewer.id, challenged.id];
      const heldTitles = await prisma.trophy.findMany({
        where: {
          OR: [
            { currentHolderUserId: { in: participantIds } },
            { guardianHolderUserId: { in: participantIds } },
          ],
        },
        orderBy: [{ kind: "asc" }, { displayName: "asc" }],
      });
      const trophyUsers = heldTitles.some((trophy) => trophy.family === "elo")
        ? await loadTrophyUsers(prisma)
        : [];
      const activeTitleChallenges =
        heldTitles.length > 0
          ? await prisma.trophyChallenge.findMany({
              where: {
                trophyId: { in: heldTitles.map((trophy) => trophy.id) },
                scheduledMatchId: { not: null },
                status: {
                  notIn: ["cancelled", "canceled", "disputed", "settled"],
                },
              },
              select: { trophyId: true },
            })
          : [];
      const busyTitleIds = new Set(
        activeTitleChallenges.map((challenge) => challenge.trophyId)
      );
      const ratingByUserId = new Map(
        trophyUsers.map((user) => [user.id, user.rating] as const)
      );

      for (const trophy of heldTitles) {
        if (busyTitleIds.has(trophy.id)) continue;
        const custodianId =
          trophy.currentHolderUserId ?? trophy.guardianHolderUserId;
        const automaticChallenger =
          custodianId === challenged.id
            ? viewer
            : custodianId === viewer.id
              ? challenged
              : null;
        const automaticOpponent =
          custodianId === challenged.id
            ? challenged
            : custodianId === viewer.id
              ? viewer
              : null;
        if (!automaticChallenger || !automaticOpponent) continue;

        const automaticRating =
          ratingByUserId.get(automaticChallenger.id) ?? null;
        const eligible =
          trophy.family === "national"
            ? countriesEligibilityMatch(automaticChallenger.representedCountry, trophy.eligibleNationality)
            : trophy.family === "elo"
              ? automaticRating !== null &&
                (trophy.eloBandMax === null || automaticRating <= trophy.eloBandMax)
              : true;
        if (!eligible) continue;

        titleStakePlans.push({
          trophy,
          challenger: automaticChallenger,
          opponent: automaticOpponent,
          challengerRating: automaticRating,
          automatic: true,
        });
      }
    }

    let createdChallengeId: number | null = null;
    let linkedTrophyChallengeId: number | null = null;
    const linkedTrophyChallengeIds: number[] = [];
    const titleStakeNames = titleStakePlans.map((plan) => plan.trophy.displayName);
    let idempotentReplay = false;

    try {
      await prisma.$transaction(async (tx) => {
        const pairKey = `${Math.min(viewer.id, challenged.id)}:${Math.max(viewer.id, challenged.id)}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_PAIR_LOCK_NAMESPACE}, hashtext(${pairKey}))`;

        if (creationRequestId) {
          const replay = await tx.scheduledMatch.findUnique({
            where: { creationRequestId },
            select: { id: true, challengerUserId: true },
          });
          if (replay) {
            if (replay.challengerUserId !== viewer.id) {
              throw new ChallengeCreationError(
                "That creation request id is already in use."
              );
            }
            createdChallengeId = replay.id;
            idempotentReplay = true;
            return;
          }
        }

        const activePair = await tx.scheduledMatch.findFirst({
          where: pairWhere,
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          select: { id: true },
        });
        if (activePair) {
          throw new ChallengeCreationError(
            `You and ${challengedName} already have active challenge #${activePair.id}. Finish or cancel it before issuing another.`,
            409,
            activePair.id
          );
        }

        for (const titleStake of [...titleStakePlans].sort(
          (left, right) => left.trophy.id - right.trophy.id
        )) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHALLENGE_TROPHY_LOCK_NAMESPACE}, ${titleStake.trophy.id})`;
          const activeTitle = await tx.trophyChallenge.findFirst({
            where: {
              trophyId: titleStake.trophy.id,
              scheduledMatchId: { not: null },
              status: { notIn: ["cancelled", "canceled", "disputed", "settled"] },
            },
            select: { scheduledMatchId: true },
          });
          if (activeTitle) {
            throw new ChallengeCreationError(
              `${titleStake.trophy.displayName} is already attached to active challenge #${activeTitle.scheduledMatchId}.`,
              409,
              activeTitle.scheduledMatchId ?? undefined
            );
          }
        }

        const createdMatch = await tx.scheduledMatch.create({
        data: {
          challengerUserId: viewer.id,
          challengedUserId: challenged.id,
          scheduleMode,
          scheduledAt,
          acceptanceExpiresAt,
          creationRequestId,
          lifecycleVersion: 1,
          challengeNote,
          status: "proposed",
          wagerAmountWolo,
          guaranteeAmountWolo,
        },
        });
        createdChallengeId = createdMatch.id;

      for (const titleStake of titleStakePlans) {
        const title = titleStake.trophy;
        const linkedTrophyChallenge = await tx.trophyChallenge.create({
          data: {
            trophyId: title.id,
            challengeKind:
              title.status === "guardian_held" ||
              (!title.currentHolderUserId && title.guardianHolderUserId)
                ? "guardian_activation"
                : title.family,
            challengerUserId: titleStake.challenger.id,
            defenderUserId: title.currentHolderUserId,
            guardianUserId: title.guardianHolderUserId,
            challengerWoloAddress: titleStake.challenger.walletAddress,
            defenderWoloAddress:
              title.currentHolderWoloAddress ||
              title.guardianHolderWoloAddress,
            expectedPlayerNames: [
              playerName(titleStake.challenger),
              playerName(titleStake.opponent),
            ],
            requiredNationality: title.eligibleNationality,
            requiredEloMin: title.eloBandMin,
            requiredEloMax: title.eloBandMax,
            eligibilitySnapshot: {
              eligible: true,
              challengerCountry: titleStake.challenger.representedCountry,
              challengerRating: titleStake.challengerRating,
              capturedAt: new Date().toISOString(),
              source: titleStake.automatic
                ? "scheduled_match_auto_stakes"
                : "public_challenge_flow",
            },
            status: "proposed",
            scheduledMatchId: createdMatch.id,
            settlementStatus: "not_started",
          },
        });
        linkedTrophyChallengeIds.push(linkedTrophyChallenge.id);
        linkedTrophyChallengeId ??= linkedTrophyChallenge.id;

        await tx.trophyEvent.create({
          data: {
            trophyId: title.id,
            eventType: "CHALLENGE_CREATED",
            actorUserId: viewer.id,
            actorRole:
              titleStake.challenger.id === viewer.id ? "challenger" : "system",
            initiatedBy: titleStake.automatic ? "system" : "user",
            toHolderUserId:
              title.currentHolderUserId ??
              title.guardianHolderUserId,
            challengeId: linkedTrophyChallenge.id,
            status: "recorded",
            rawRequest: {
              scheduledMatchId: createdMatch.id,
              trophyTitleId: payload.trophyTitleId || null,
              trophyCountry: payload.trophyCountry || null,
              automatic: titleStake.automatic,
            },
          },
        });
      }

      await tx.scheduledMatchActivity.create({
        data: {
          scheduledMatchId: createdMatch.id,
          actorUserId: viewer.id,
          eventType: "challenge_created",
          eventKey: creationRequestId
            ? `challenge_created:${creationRequestId}`.slice(0, 128)
            : "challenge_created:v2",
          detail: [
            `Challenge issued: ${challengerName} vs ${challengedName}.`,
            scheduledAt
              ? `Exact match time ${formatScheduledAtForInbox(scheduledAt)}.`
              : "Play anytime after both players fund.",
            `Accept by ${formatScheduledAtForInbox(acceptanceExpiresAt)}.`,
            `Funding ${formatWolo(totalFundingWolo)} WOLO each.`,
            challengeNote ? `Note: ${challengeNote}` : null,
          ]
            .filter(Boolean)
            .join(" "),
          metadata: {
            scheduleMode,
            scheduledAt: scheduledAt?.toISOString() ?? null,
            acceptanceExpiresAt: acceptanceExpiresAt.toISOString(),
            acceptanceWindowHours,
            creationRequestId,
            wagerAmountWolo,
            guaranteeAmountWolo,
            totalFundingWolo,
            trophyIds: titleStakePlans.map((plan) => plan.trophy.trophyId),
            trophyChallengeIds: linkedTrophyChallengeIds,
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
          acceptanceExpiresAt,
          challengeNote,
          wagerAmountWolo,
          guaranteeAmountWolo,
          titleStakeNames,
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
          scheduleMode,
          scheduledAt: scheduledAt?.toISOString() ?? null,
          acceptanceExpiresAt: acceptanceExpiresAt.toISOString(),
          challengeNote,
          wagerAmountWolo,
          guaranteeAmountWolo,
          totalFundingWolo,
          trophyIds: titleStakePlans.map((plan) => plan.trophy.trophyId),
          trophyChallengeIds: linkedTrophyChallengeIds,
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
          scheduleMode,
          scheduledAt: scheduledAt?.toISOString() ?? null,
          acceptanceExpiresAt: acceptanceExpiresAt.toISOString(),
          challengeNote,
          wagerAmountWolo,
          guaranteeAmountWolo,
          totalFundingWolo,
          trophyIds: titleStakePlans.map((plan) => plan.trophy.trophyId),
          trophyChallengeIds: linkedTrophyChallengeIds,
        },
        dedupeWithinSeconds: 5,
      });
      });
    } catch (error) {
      const errorCode =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : null;
      if (!creationRequestId || errorCode !== "P2002") {
        throw error;
      }
      const existingRequest = await prisma.scheduledMatch.findUnique({
        where: { creationRequestId },
        select: { id: true, challengerUserId: true },
      });
      if (!existingRequest || existingRequest.challengerUserId !== viewer.id) {
        throw error;
      }
      createdChallengeId = existingRequest.id;
      idempotentReplay = true;
    }

    publishDirectMessageEvent(challenged.uid, {
      type: "message",
      targetUid: viewer.uid,
    });

    const refreshed = await loadChallengeHubSnapshot(prisma, viewer.uid);
    return NextResponse.json({
      ...refreshed,
      createdChallengeId,
      linkedTrophyChallengeId,
      linkedTrophyChallengeIds,
      titleStakeNames,
      duplicateWarning,
      idempotentReplay,
    });
  } catch (error) {
    console.error("Failed to create scheduled match:", error);
    if (error instanceof ChallengeCreationError) {
      return NextResponse.json(
        {
          detail: error.message,
          existingChallengeId: error.existingChallengeId,
        },
        { status: error.status }
      );
    }
    const errorCode =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : null;
    if (errorCode === "P2002") {
      return NextResponse.json(
        { detail: "An active Challenge already owns this player pair, title, request, or replay proof." },
        { status: 409 }
      );
    }
    const detail = error instanceof Error ? error.message : "Challenge could not be scheduled.";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
