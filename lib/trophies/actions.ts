import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  executePendingTrophyTributePayouts,
  projectedTrophyBounty,
  recordNationalityChange,
} from "@/lib/trophies/service";

export class TrophyActionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "TrophyActionError";
    this.status = status;
  }
}

type AdminActor = {
  id: number;
  uid: string;
};

type ActionPayload = Record<string, unknown>;

function stringValue(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function nullableString(value: unknown, max = 255) {
  const parsed = stringValue(value, max);
  return parsed || null;
}

function intValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function nullableInt(value: unknown) {
  const parsed = intValue(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function displayName(user: {
  inGameName: string | null;
  steamPersonaName: string | null;
  uid: string;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

async function getTrophy(prisma: PrismaClient, payload: ActionPayload) {
  const trophyId = nullableInt(payload.trophyId);
  const trophyKey = nullableString(payload.trophyKey, 100);
  const trophy = trophyId
    ? await prisma.trophy.findUnique({ where: { id: trophyId } })
    : trophyKey
      ? await prisma.trophy.findUnique({ where: { trophyId: trophyKey } })
      : null;
  if (!trophy) throw new TrophyActionError("Trophy not found.", 404);
  return trophy;
}

async function getUser(prisma: PrismaClient, userId: number | null) {
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      walletAddress: true,
      representedCountry: true,
    },
  });
  if (!user) throw new TrophyActionError("Player not found.", 404);
  return user;
}

function eligibilityForUser(
  trophy: {
    family: string;
    eligibleNationality: string | null;
    eloBandMin: number | null;
    eloBandMax: number | null;
  },
  user: {
    representedCountry: string | null;
  },
  rating: number | null
) {
  if (trophy.family === "national") {
    return {
      eligible: user.representedCountry === trophy.eligibleNationality,
      detail: `Requires ${trophy.eligibleNationality || "configured nationality"}; player represents ${user.representedCountry || "unset"}.`,
    };
  }
  if (trophy.family === "elo") {
    if (rating === null) {
      return { eligible: false, detail: "No current replay-backed rating is available." };
    }
    const meetsMax = trophy.eloBandMax === null || rating <= trophy.eloBandMax;
    return {
      eligible: meetsMax,
      detail:
        trophy.eloBandMin !== null && rating < trophy.eloBandMin
          ? `Rating ${rating}; eligible as an upward invader into ${trophy.eloBandMin}-${trophy.eloBandMax ?? "open"} ELO.`
          : `Rating ${rating}; eligible for ${trophy.eloBandMin ?? "open"}-${trophy.eloBandMax ?? "open"} ELO.`,
    };
  }
  return { eligible: true, detail: "No nationality or ELO restriction." };
}

async function recordEvent(
  prisma: PrismaClient,
  input: {
    trophyId: number;
    eventType: string;
    actor: AdminActor;
    status?: string;
    fromHolderUserId?: number | null;
    toHolderUserId?: number | null;
    fromWoloAddress?: string | null;
    toWoloAddress?: string | null;
    challengeId?: number | null;
    replayId?: number | null;
    amountWolo?: number | null;
    rawRequest?: Prisma.InputJsonValue;
    rawResponse?: Prisma.InputJsonValue;
    errorMessage?: string | null;
  }
) {
  return prisma.trophyEvent.create({
    data: {
      trophyId: input.trophyId,
      eventType: input.eventType,
      actorUserId: input.actor.id,
      actorRole: "admin",
      initiatedBy: "admin",
      status: input.status || "recorded",
      fromHolderUserId: input.fromHolderUserId ?? null,
      toHolderUserId: input.toHolderUserId ?? null,
      fromWoloAddress: input.fromWoloAddress ?? null,
      toWoloAddress: input.toWoloAddress ?? null,
      challengeId: input.challengeId ?? null,
      replayId: input.replayId ?? null,
      amountWolo: input.amountWolo ?? null,
      rawRequest: input.rawRequest,
      rawResponse: input.rawResponse,
      errorMessage: input.errorMessage ?? null,
    },
  });
}

async function assignHolder(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  const user = await getUser(prisma, nullableInt(payload.userId));
  if (!user) throw new TrophyActionError("Choose a holder.");
  const rating = nullableInt(payload.rating);
  const eligibility = eligibilityForUser(trophy, user, rating);
  const override = boolValue(payload.eligibilityOverride);
  if (!eligibility.eligible && !override) {
    throw new TrophyActionError(`Holder is not eligible. ${eligibility.detail}`);
  }

  const previousHolderId = trophy.currentHolderUserId;
  const previousAddress = trophy.currentHolderWoloAddress;
  const nextName = displayName(user);
  await prisma.$transaction(async (tx) => {
    await tx.trophy.update({
      where: { id: trophy.id },
      data: {
        currentHolderUserId: user.id,
        currentHolderDisplayName: nextName,
        currentHolderWoloAddress: user.walletAddress,
        status: "held",
        holderSince: new Date(),
        forfeitureNeeded: false,
        eligibilityNote: eligibility.eligible
          ? eligibility.detail
          : `Admin eligibility override: ${eligibility.detail}`,
      },
    });
    await recordEvent(tx as PrismaClient, {
      trophyId: trophy.id,
      eventType: previousHolderId ? "HOLDER_REASSIGNED" : "HOLDER_ASSIGNED",
      actor,
      fromHolderUserId: previousHolderId,
      toHolderUserId: user.id,
      fromWoloAddress: previousAddress,
      toWoloAddress: user.walletAddress,
      rawRequest: jsonValue({
        eligibility,
        eligibilityOverride: override,
      }),
    });
  });
}

async function assignGuardian(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  const guardian = await getUser(prisma, nullableInt(payload.userId));
  if (!guardian) throw new TrophyActionError("Choose a Guardian.");
  await prisma.$transaction(async (tx) => {
    await tx.trophy.update({
      where: { id: trophy.id },
      data: {
        guardianHolderUserId: guardian.id,
        guardianHolderDisplayName: displayName(guardian),
        guardianHolderWoloAddress: guardian.walletAddress,
        currentHolderUserId: null,
        currentHolderDisplayName: null,
        currentHolderWoloAddress: null,
        status: "guardian_held",
        holderSince: new Date(),
        forfeitureNeeded: false,
        eligibilityNote: "Commissioner Guardian custody; Guardian nationality does not define title eligibility.",
      },
    });
    await recordEvent(tx as PrismaClient, {
      trophyId: trophy.id,
      eventType: "GUARDIAN_ASSIGNED",
      actor,
      fromHolderUserId: trophy.currentHolderUserId,
      toHolderUserId: guardian.id,
      fromWoloAddress: trophy.currentHolderWoloAddress,
      toWoloAddress: guardian.walletAddress,
    });
  });
}

async function changeTrophyStatus(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  const nextStatus = stringValue(payload.status, 32);
  const allowed = new Set([
    "draft",
    "active",
    "paused",
    "retired",
    "vacant",
    "held",
    "guardian_held",
  ]);
  if (!allowed.has(nextStatus)) throw new TrophyActionError("Invalid trophy status.");
  const clearing = nextStatus === "vacant" || nextStatus === "retired";
  await prisma.$transaction([
    prisma.trophy.update({
      where: { id: trophy.id },
      data: {
        status: nextStatus,
        ...(clearing
          ? {
              currentHolderUserId: null,
              currentHolderDisplayName: null,
              currentHolderWoloAddress: null,
              holderSince: null,
            }
          : {}),
      },
    }),
    prisma.trophyEvent.create({
      data: {
        trophyId: trophy.id,
        eventType:
          nextStatus === "vacant"
            ? "TROPHY_VACATED"
            : nextStatus === "retired"
              ? "TROPHY_RETIRED"
              : "TROPHY_STATUS_CHANGED",
        actorUserId: actor.id,
        actorRole: "admin",
        initiatedBy: "admin",
        fromHolderUserId: trophy.currentHolderUserId,
        fromWoloAddress: trophy.currentHolderWoloAddress,
        status: "recorded",
        rawRequest: { previousStatus: trophy.status, nextStatus },
      },
    }),
  ]);
}

async function updateEconomics(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  const tributeAmountWolo = Math.max(0, intValue(payload.tributeAmountWolo, trophy.tributeAmountWolo));
  const bountyGrowthWolo = Math.max(0, intValue(payload.bountyGrowthWolo, trophy.bountyGrowthWolo));
  const payoutFrequency = stringValue(payload.payoutFrequency, 24) || trophy.payoutFrequency;
  const bountyAccrualFrequency =
    stringValue(payload.bountyAccrualFrequency, 24) || trophy.bountyAccrualFrequency;
  const reason = nullableString(payload.reason, 255) || "Admin economics update.";
  const now = new Date();
  await prisma.$transaction([
    prisma.trophyEconomicsVersion.updateMany({
      where: { trophyId: trophy.id, effectiveTo: null },
      data: { effectiveTo: now },
    }),
    prisma.trophyEconomicsVersion.create({
      data: {
        trophyId: trophy.id,
        tributeAmountWolo,
        bountyGrowthWolo,
        payoutFrequency,
        bountyAccrualFrequency,
        effectiveFrom: now,
        changedByUserId: actor.id,
        reason,
      },
    }),
    prisma.trophy.update({
      where: { id: trophy.id },
      data: {
        currentBountyWolo: projectedTrophyBounty(trophy),
        holderSince: trophy.holderSince ? now : null,
        tributeAmountWolo,
        bountyGrowthWolo,
        payoutFrequency,
        bountyAccrualFrequency,
      },
    }),
    prisma.trophyEvent.create({
      data: {
        trophyId: trophy.id,
        eventType: "ECONOMICS_CHANGED",
        actorUserId: actor.id,
        actorRole: "admin",
        initiatedBy: "admin",
        status: "recorded",
        rawRequest: {
          previous: {
            tributeAmountWolo: trophy.tributeAmountWolo,
            bountyGrowthWolo: trophy.bountyGrowthWolo,
            payoutFrequency: trophy.payoutFrequency,
            bountyAccrualFrequency: trophy.bountyAccrualFrequency,
          },
          next: {
            tributeAmountWolo,
            bountyGrowthWolo,
            payoutFrequency,
            bountyAccrualFrequency,
          },
          reason,
        },
      },
    }),
  ]);
}

async function createTrophy(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophyKey = stringValue(payload.trophyKey, 100)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const displayNameValue = stringValue(payload.displayName, 160);
  const kind = stringValue(payload.kind, 24) || "artifact";
  const family = stringValue(payload.family, 32) || "artifact";
  if (!trophyKey || !displayNameValue) {
    throw new TrophyActionError("Trophy id and display name are required.");
  }
  const created = await prisma.trophy.create({
    data: {
      trophyId: trophyKey,
      displayName: displayNameValue,
      kind,
      family,
      tier: nullableString(payload.tier, 40),
      status: "draft",
      tributeAmountWolo: Math.max(0, intValue(payload.tributeAmountWolo, kind === "artifact" ? 1 : 0)),
      bountyGrowthWolo: Math.max(0, intValue(payload.bountyGrowthWolo, kind === "artifact" ? 1 : 0)),
      eligibleNationality: nullableString(payload.eligibleNationality, 40),
      eloBandMin: nullableInt(payload.eloBandMin),
      eloBandMax: nullableInt(payload.eloBandMax),
      nftClassId: `aoe2war.wartrophy.${family}`,
      nftId: trophyKey,
      nftMetadataUri: `/api/trophies/${trophyKey}/metadata`,
      nftImageUri: nullableString(payload.nftImageUri, 500),
      chainStatus: "app_only",
    },
  });
  await prisma.$transaction([
    prisma.trophyEconomicsVersion.create({
      data: {
        trophyId: created.id,
        tributeAmountWolo: created.tributeAmountWolo,
        bountyGrowthWolo: created.bountyGrowthWolo,
        payoutFrequency: created.payoutFrequency,
        bountyAccrualFrequency: created.bountyAccrualFrequency,
        changedByUserId: actor.id,
        reason: "Initial trophy definition.",
      },
    }),
    prisma.trophyEvent.create({
      data: {
        trophyId: created.id,
        eventType: "TROPHY_CREATED",
        actorUserId: actor.id,
        actorRole: "admin",
        initiatedBy: "admin",
        status: "recorded",
      },
    }),
  ]);
}

async function createChallenge(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  const challenger = await getUser(prisma, nullableInt(payload.challengerUserId));
  if (!challenger) throw new TrophyActionError("Choose a challenger.");
  const defender = await getUser(
    prisma,
    nullableInt(payload.defenderUserId) ?? trophy.currentHolderUserId
  );
  const guardian = await getUser(
    prisma,
    nullableInt(payload.guardianUserId) ?? trophy.guardianHolderUserId
  );
  const rating = nullableInt(payload.challengerRating);
  const eligibility = eligibilityForUser(trophy, challenger, rating);
  const override = boolValue(payload.eligibilityOverride);
  if (!eligibility.eligible && !override) {
    throw new TrophyActionError(`Challenger is not eligible. ${eligibility.detail}`);
  }
  const challengeKind =
    trophy.status === "guardian_held" || (!defender && guardian)
      ? "guardian_activation"
      : trophy.family;
  const challenge = await prisma.trophyChallenge.create({
    data: {
      trophyId: trophy.id,
      challengeKind,
      challengerUserId: challenger.id,
      defenderUserId: defender?.id ?? null,
      guardianUserId: guardian?.id ?? null,
      challengerWoloAddress: challenger.walletAddress,
      defenderWoloAddress: defender?.walletAddress ?? guardian?.walletAddress ?? null,
      expectedPlayerNames: [
        displayName(challenger),
        defender ? displayName(defender) : guardian ? displayName(guardian) : null,
      ].filter(Boolean),
      requiredNationality: trophy.eligibleNationality,
      requiredEloMin: trophy.eloBandMin,
      requiredEloMax: trophy.eloBandMax,
      eligibilitySnapshot: {
        eligible: eligibility.eligible,
        detail: eligibility.detail,
        challengerCountry: challenger.representedCountry,
        challengerRating: rating,
        capturedAt: new Date().toISOString(),
      },
      eligibilityOverride: override,
      status: "proposed",
      watcherSessionId: nullableString(payload.watcherSessionId, 255),
      watcherPairingId: nullableString(payload.watcherPairingId, 255),
      scheduledMatchId: nullableInt(payload.scheduledMatchId),
      settlementStatus: "not_started",
    },
  });
  await recordEvent(prisma, {
    trophyId: trophy.id,
    eventType: "CHALLENGE_CREATED",
    actor,
    challengeId: challenge.id,
    toHolderUserId: challenger.id,
    rawRequest: jsonValue({ eligibility, eligibilityOverride: override, challengeKind }),
  });
}

async function updateChallenge(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const challengeId = nullableInt(payload.challengeId);
  if (!challengeId) throw new TrophyActionError("Challenge id is required.");
  const challenge = await prisma.trophyChallenge.findUnique({
    where: { id: challengeId },
    include: {
      trophy: true,
      challenger: true,
      defender: true,
      guardian: true,
      winner: true,
    },
  });
  if (!challenge) throw new TrophyActionError("Challenge not found.", 404);
  const operation = stringValue(payload.operation, 40);

  if (operation === "approve") {
    await prisma.trophyChallenge.update({
      where: { id: challenge.id },
      data: { status: "accepted", errorState: null },
    });
    await recordEvent(prisma, {
      trophyId: challenge.trophyId,
      eventType: "CHALLENGE_APPROVED",
      actor,
      challengeId: challenge.id,
    });
    return;
  }

  if (operation === "cancel" || operation === "dispute") {
    const nextStatus = operation === "cancel" ? "cancelled" : "disputed";
    await prisma.trophyChallenge.update({
      where: { id: challenge.id },
      data: { status: nextStatus, errorState: nullableString(payload.reason, 255) },
    });
    await recordEvent(prisma, {
      trophyId: challenge.trophyId,
      eventType: operation === "cancel" ? "CHALLENGE_CANCELLED" : "CHALLENGE_DISPUTED",
      actor,
      challengeId: challenge.id,
      status: operation === "dispute" ? "attention_required" : "recorded",
    });
    return;
  }

  if (operation === "attach_replay") {
    const replayId = nullableInt(payload.replayId);
    if (!replayId) throw new TrophyActionError("Choose replay proof.");
    const replay = await prisma.gameStats.findUnique({ where: { id: replayId } });
    if (!replay) throw new TrophyActionError("Replay not found.", 404);
    await prisma.trophyChallenge.update({
      where: { id: challenge.id },
      data: {
        replayId,
        gameId: replay.id,
        status: "replay_uploaded",
        watcherSessionId:
          nullableString(payload.watcherSessionId, 255) || challenge.watcherSessionId,
        watcherPairingId:
          nullableString(payload.watcherPairingId, 255) || challenge.watcherPairingId,
      },
    });
    await recordEvent(prisma, {
      trophyId: challenge.trophyId,
      eventType: "WATCHER_PROOF_ATTACHED",
      actor,
      challengeId: challenge.id,
      replayId,
      rawResponse: jsonValue({
        replayWinner: replay.winner,
        replayHash: replay.replayHash,
        watcherSessionId:
          nullableString(payload.watcherSessionId, 255) || challenge.watcherSessionId,
      }),
    });
    return;
  }

  if (operation === "verify") {
    const winnerUserId = nullableInt(payload.winnerUserId);
    if (!winnerUserId) throw new TrophyActionError("Choose the verified winner.");
    const validWinnerIds = [
      challenge.challengerUserId,
      challenge.defenderUserId,
      challenge.guardianUserId,
    ].filter(Boolean);
    if (!validWinnerIds.includes(winnerUserId)) {
      throw new TrophyActionError("Winner must be the challenger, defender, or Guardian.");
    }
    const challengerWon = winnerUserId === challenge.challengerUserId;
    await prisma.trophyChallenge.update({
      where: { id: challenge.id },
      data: {
        winnerUserId,
        status: challengerWon ? "verified_challenger_win" : "verified_defender_win",
        verificationSummary:
          nullableString(payload.verificationSummary, 2000) ||
          `Admin-reviewed result. ${challengerWon ? "Challenger" : "Defender/Guardian"} verified as winner.`,
        settlementStatus: "ready_for_dry_run",
        errorState: null,
      },
    });
    await recordEvent(prisma, {
      trophyId: challenge.trophyId,
      eventType: "REPLAY_VERIFIED",
      actor,
      challengeId: challenge.id,
      replayId: challenge.replayId,
      toHolderUserId: winnerUserId,
      rawResponse: jsonValue({ challengerWon }),
    });
    return;
  }

  if (operation === "dry_run") {
    if (!challenge.winnerUserId) throw new TrophyActionError("Verify a winner first.");
    const challengerWon = challenge.winnerUserId === challenge.challengerUserId;
    const bounty = challengerWon ? projectedTrophyBounty(challenge.trophy) : 0;
    const winner = await getUser(prisma, challenge.winnerUserId);
    await prisma.$transaction(async (tx) => {
      await tx.trophyChallenge.update({
        where: { id: challenge.id },
        data: { status: "settlement_dry_run", settlementStatus: "dry_run_ready" },
      });
      if (bounty > 0 && winner) {
        await tx.trophyPayout.create({
          data: {
            trophyId: challenge.trophyId,
            recipientUserId: winner.id,
            recipientDisplayName: displayName(winner),
            recipientWoloAddress: winner.walletAddress,
            amountWolo: bounty,
            payoutKind: "dethrone_bounty",
            status: "dry_run",
            rawRequest: {
              challengeId: challenge.id,
              chainBacked: challenge.trophy.chainStatus !== "app_only",
            },
          },
        });
      }
      await recordEvent(tx as PrismaClient, {
        trophyId: challenge.trophyId,
        eventType: "SETTLEMENT_DRY_RUN",
        actor,
        challengeId: challenge.id,
        replayId: challenge.replayId,
        toHolderUserId: challenge.winnerUserId,
        amountWolo: bounty,
        rawResponse: jsonValue({
          challengerWon,
          wouldTransferHolder: challengerWon,
          wouldPayBountyWolo: bounty,
          mode: challenge.trophy.chainStatus === "app_only" ? "app_only" : "chain_intent",
        }),
      });
    });
    return;
  }

  if (operation === "settle") {
    if (!challenge.winnerUserId) throw new TrophyActionError("Verify a winner first.");
    const settings = await prisma.trophySetting.findMany({
      where: { key: { in: ["dry_run_only", "chain_backed_trophies_enabled", "app_only_fallback_enabled"] } },
    });
    const settingMap = new Map(settings.map((setting) => [setting.key, setting.value]));
    if (settingMap.get("dry_run_only") !== false) {
      throw new TrophyActionError("Dry-run-only mode is enabled. Disable it in Trophy Settings before settlement.");
    }
    const challengerWon = challenge.winnerUserId === challenge.challengerUserId;
    const winner = await getUser(prisma, challenge.winnerUserId);
    if (!winner) throw new TrophyActionError("Winner account is unavailable.");
    const chainBacked =
      settingMap.get("chain_backed_trophies_enabled") === true &&
      challenge.trophy.chainStatus !== "app_only";

    if (chainBacked) {
      await prisma.$transaction([
        prisma.trophyChallenge.update({
          where: { id: challenge.id },
          data: { status: "settling", settlementStatus: "chain_intent_recorded" },
        }),
        prisma.trophyEvent.create({
          data: {
            trophyId: challenge.trophyId,
            challengeId: challenge.id,
            eventType: "NFT_REASSIGN_REQUESTED",
            actorUserId: actor.id,
            actorRole: "admin",
            initiatedBy: "admin",
            toHolderUserId: winner.id,
            toWoloAddress: winner.walletAddress,
            status: "pending_chain",
            rawRequest: {
              nftClassId: challenge.trophy.nftClassId,
              nftId: challenge.trophy.nftId,
              note: "Chain execution intentionally stubbed in app-prodn.",
            },
          },
        }),
      ]);
      return;
    }

    if (settingMap.get("app_only_fallback_enabled") !== true) {
      throw new TrophyActionError("App-only fallback is disabled and chain-backed settlement is unavailable.");
    }

    const bounty = challengerWon ? projectedTrophyBounty(challenge.trophy) : 0;
    await prisma.$transaction(async (tx) => {
      if (challengerWon) {
        await tx.trophy.update({
          where: { id: challenge.trophyId },
          data: {
            currentHolderUserId: winner.id,
            currentHolderDisplayName: displayName(winner),
            currentHolderWoloAddress: winner.walletAddress,
            status: "held",
            currentBountyWolo: 0,
            holderSince: new Date(),
            forfeitureNeeded: false,
            eligibilityNote: "Transferred after verified trophy challenge.",
          },
        });
      }
      await tx.trophyChallenge.update({
        where: { id: challenge.id },
        data: {
          status: "settled",
          settlementStatus: "app_only_settled",
          errorState: null,
        },
      });
      if (bounty > 0) {
        await tx.trophyPayout.create({
          data: {
            trophyId: challenge.trophyId,
            recipientUserId: winner.id,
            recipientDisplayName: displayName(winner),
            recipientWoloAddress: winner.walletAddress,
            amountWolo: bounty,
            payoutKind: "dethrone_bounty",
            status: "pending",
            rawRequest: {
              challengeId: challenge.id,
              settlementMode: "app_only",
              fundingTruth: "Not escrowed; operator payout required.",
            },
          },
        });
      }
      await recordEvent(tx as PrismaClient, {
        trophyId: challenge.trophyId,
        eventType: challengerWon ? "CHALLENGE_SETTLED_HOLDER_CHANGED" : "CHALLENGE_SETTLED_DEFENSE",
        actor,
        challengeId: challenge.id,
        replayId: challenge.replayId,
        fromHolderUserId:
          challenge.trophy.currentHolderUserId || challenge.trophy.guardianHolderUserId,
        toHolderUserId: challengerWon ? winner.id : challenge.trophy.currentHolderUserId,
        amountWolo: bounty,
        rawResponse: jsonValue({
          mode: "app_only",
          payoutCreated: bounty > 0,
          bountyIsEscrowed: false,
        }),
      });
    });
    return;
  }

  if (operation === "retry") {
    await prisma.trophyChallenge.update({
      where: { id: challenge.id },
      data: { status: "settlement_dry_run", settlementStatus: "retry_requested", errorState: null },
    });
    await recordEvent(prisma, {
      trophyId: challenge.trophyId,
      eventType: "SETTLEMENT_RETRY_REQUESTED",
      actor,
      challengeId: challenge.id,
    });
    return;
  }

  throw new TrophyActionError("Unsupported challenge operation.");
}

async function updatePayout(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const payoutId = nullableInt(payload.payoutId);
  if (!payoutId) throw new TrophyActionError("Payout id is required.");
  const payout = await prisma.trophyPayout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new TrophyActionError("Payout not found.", 404);
  const operation = stringValue(payload.operation, 24);

  if ((payout.status === "paid" || payout.txHash?.trim()) && operation !== "execute") {
    throw new TrophyActionError("Paid or tx-backed trophy payouts cannot be changed from the admin rail.", 409);
  }

  if (operation === "execute") {
    const result = await executePendingTrophyTributePayouts(prisma, {
      payoutId: payout.id,
      limit: 1,
    });

    if (result.scanned < 1) {
      throw new TrophyActionError("No executable trophy payout found. It may already be paid, cancelled, or not due yet.", 409);
    }

    const failed = result.results.find((row) => row.status === "failed");
    if (failed) {
      throw new TrophyActionError(failed.detail || "Trophy payout execution failed.", 409);
    }

    return;
  }

  const status =
    operation === "retry"
      ? "retrying"
      : operation === "cancel"
        ? "cancelled"
        : operation === "dry_run"
          ? "dry_run"
          : null;
  if (!status) throw new TrophyActionError("Unsupported payout operation.");
  await prisma.$transaction([
    prisma.trophyPayout.update({
      where: { id: payout.id },
      data: {
        status,
        retryCount: operation === "retry" ? { increment: 1 } : undefined,
        errorState: operation === "retry" ? null : payout.errorState,
      },
    }),
    prisma.trophyEvent.create({
      data: {
        trophyId: payout.trophyId,
        eventType: operation === "retry" ? "PAYOUT_RETRY_REQUESTED" : "PAYOUT_STATUS_CHANGED",
        actorUserId: actor.id,
        actorRole: "admin",
        initiatedBy: "admin",
        amountWolo: payout.amountWolo,
        status: "recorded",
        rawRequest: { payoutId, operation, nextStatus: status },
      },
    }),
  ]);
}

async function updateSetting(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const key = stringValue(payload.key, 100);
  if (!key) throw new TrophyActionError("Setting key is required.");
  await prisma.trophySetting.upsert({
    where: { key },
    update: {
      value: jsonValue(payload.value),
      changedByUserId: actor.id,
      reason: nullableString(payload.reason, 255),
    },
    create: {
      key,
      value: jsonValue(payload.value),
      changedByUserId: actor.id,
      reason: nullableString(payload.reason, 255),
    },
  });
}

async function updateUserNationality(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const user = await getUser(prisma, nullableInt(payload.userId));
  if (!user) throw new TrophyActionError("Choose a player.");
  const nextCountry = nullableString(payload.representedCountry, 40);
  const allowed = new Set(["Canada", "USA", "Mexico", "UK"]);
  if (nextCountry && !allowed.has(nextCountry)) {
    throw new TrophyActionError("Nationality must be Canada, USA, Mexico, UK, or blank.");
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      representedCountry: nextCountry,
      representedCountryUpdatedAt: new Date(),
    },
  });
  await recordNationalityChange(prisma, {
    userId: user.id,
    actorUserId: actor.id,
    previousCountry: user.representedCountry,
    nextCountry,
    initiatedBy: "admin",
    strict: true,
  });
}

async function updateTrophyDefinition(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  await prisma.$transaction([
    prisma.trophy.update({
      where: { id: trophy.id },
      data: {
        displayName: stringValue(payload.displayName, 160) || trophy.displayName,
        tier: Object.prototype.hasOwnProperty.call(payload, "tier")
          ? nullableString(payload.tier, 40)
          : trophy.tier,
        eligibleNationality: Object.prototype.hasOwnProperty.call(payload, "eligibleNationality")
          ? nullableString(payload.eligibleNationality, 40)
          : trophy.eligibleNationality,
        eloBandMin: Object.prototype.hasOwnProperty.call(payload, "eloBandMin")
          ? nullableInt(payload.eloBandMin)
          : trophy.eloBandMin,
        eloBandMax: Object.prototype.hasOwnProperty.call(payload, "eloBandMax")
          ? nullableInt(payload.eloBandMax)
          : trophy.eloBandMax,
        nftClassId: Object.prototype.hasOwnProperty.call(payload, "nftClassId")
          ? nullableString(payload.nftClassId, 120)
          : trophy.nftClassId,
        nftId: Object.prototype.hasOwnProperty.call(payload, "nftId")
          ? nullableString(payload.nftId, 160)
          : trophy.nftId,
        nftMetadataUri: Object.prototype.hasOwnProperty.call(payload, "nftMetadataUri")
          ? nullableString(payload.nftMetadataUri, 500)
          : trophy.nftMetadataUri,
        nftImageUri: Object.prototype.hasOwnProperty.call(payload, "nftImageUri")
          ? nullableString(payload.nftImageUri, 500)
          : trophy.nftImageUri,
        chainStatus: stringValue(payload.chainStatus, 32) || trophy.chainStatus,
        chainOwnerAddress: Object.prototype.hasOwnProperty.call(payload, "chainOwnerAddress")
          ? nullableString(payload.chainOwnerAddress, 100)
          : trophy.chainOwnerAddress,
        lastChainSyncAt: Object.prototype.hasOwnProperty.call(payload, "chainOwnerAddress")
          ? new Date()
          : trophy.lastChainSyncAt,
      },
    }),
    prisma.trophyEvent.create({
      data: {
        trophyId: trophy.id,
        eventType: "TROPHY_METADATA_CHANGED",
        actorUserId: actor.id,
        actorRole: "admin",
        initiatedBy: "admin",
        status: "recorded",
        rawRequest: jsonValue(payload),
      },
    }),
  ]);
}

async function forceForfeiture(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  await prisma.$transaction([
    prisma.trophy.update({
      where: { id: trophy.id },
      data: {
        status: "vacant",
        currentHolderUserId: null,
        currentHolderDisplayName: null,
        currentHolderWoloAddress: null,
        holderSince: null,
        forfeitureNeeded: false,
        eligibilityNote: nullableString(payload.reason, 255) || "Forfeiture resolved by admin.",
      },
    }),
    prisma.trophyEvent.create({
      data: {
        trophyId: trophy.id,
        eventType: "NATIONAL_ELIGIBILITY_FORFEITURE",
        actorUserId: actor.id,
        actorRole: "admin",
        initiatedBy: "admin",
        fromHolderUserId: trophy.currentHolderUserId,
        fromWoloAddress: trophy.currentHolderWoloAddress,
        status: "recorded",
        rawRequest: {
          reason: nullableString(payload.reason, 255) || "Admin-resolved eligibility conflict.",
        },
      },
    }),
  ]);
}

async function requestNftOperation(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const trophy = await getTrophy(prisma, payload);
  const operation = stringValue(payload.operation, 24);
  const eventType =
    operation === "mint"
      ? "NFT_MINT_REQUESTED"
      : operation === "retire"
        ? "NFT_RETIRE_REQUESTED"
        : operation === "burn"
          ? "NFT_BURN_REQUESTED"
          : null;
  if (!eventType) throw new TrophyActionError("Unsupported NFT operation.");
  await recordEvent(prisma, {
    trophyId: trophy.id,
    eventType,
    actor,
    status: "pending_chain",
    rawRequest: jsonValue({
      nftClassId: trophy.nftClassId,
      nftId: trophy.nftId,
      chainExecution: "stubbed_in_app",
      destructive: operation === "burn",
    }),
  });
}

export async function executeTrophyAdminAction(
  prisma: PrismaClient,
  actor: AdminActor,
  payload: ActionPayload
) {
  const action = stringValue(payload.action, 64);
  switch (action) {
    case "create_trophy":
      return createTrophy(prisma, actor, payload);
    case "update_trophy":
      return updateTrophyDefinition(prisma, actor, payload);
    case "assign_holder":
      return assignHolder(prisma, actor, payload);
    case "assign_guardian":
      return assignGuardian(prisma, actor, payload);
    case "change_status":
      return changeTrophyStatus(prisma, actor, payload);
    case "force_forfeiture":
      return forceForfeiture(prisma, actor, payload);
    case "update_economics":
      return updateEconomics(prisma, actor, payload);
    case "create_challenge":
      return createChallenge(prisma, actor, payload);
    case "challenge_action":
      return updateChallenge(prisma, actor, payload);
    case "payout_action":
      return updatePayout(prisma, actor, payload);
    case "update_setting":
      return updateSetting(prisma, actor, payload);
    case "update_user_nationality":
      return updateUserNationality(prisma, actor, payload);
    case "nft_action":
      return requestNftOperation(prisma, actor, payload);
    case "retry_event": {
      const eventId = nullableInt(payload.eventId);
      if (!eventId) throw new TrophyActionError("Event id is required.");
      await prisma.trophyEvent.update({
        where: { id: eventId },
        data: {
          retryCount: { increment: 1 },
          status: "retry_requested",
          errorMessage: null,
        },
      });
      return;
    }
    default:
      throw new TrophyActionError("Unsupported Trophy Command action.");
  }
}
