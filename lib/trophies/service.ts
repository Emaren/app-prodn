import type { Prisma, PrismaClient, Trophy } from "@/lib/generated/prisma";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import {
  allChampionTitles,
  eloTitles,
  nationalTitles,
  type ChampionTitleDefinition,
} from "@/lib/champions/titles";
import { managedMediaPublicUrl } from "@/lib/managedMediaAssets";
import type {
  TrophyCommandSnapshot,
  TrophyHolding,
  TrophyRow,
  TrophyUserOption,
} from "@/lib/trophies/types";

type TrophySeed = {
  trophyId: string;
  definition: ChampionTitleDefinition;
  family: "national" | "elo";
  tier: string;
  holderName?: string;
  guardianName?: string;
  status: "held" | "guardian_held" | "vacant";
};

const SEEDS: TrophySeed[] = [
  {
    trophyId: "canada_champion_belt",
    definition: nationalTitles.find((title) => title.country === "Canada")!,
    family: "national",
    tier: "National",
    holderName: "Emaren",
    status: "held",
  },
  {
    trophyId: "usa_champion_belt",
    definition: nationalTitles.find((title) => title.country === "USA")!,
    family: "national",
    tier: "National",
    holderName: "Jim",
    status: "held",
  },
  {
    trophyId: "mexico_champion_belt",
    definition: nationalTitles.find((title) => title.country === "Mexico")!,
    family: "national",
    tier: "National",
    holderName: "Julio Alvarez",
    status: "held",
  },
  {
    trophyId: "uk_champion_belt",
    definition: nationalTitles.find((title) => title.country === "UK")!,
    family: "national",
    tier: "National",
    holderName: "Sniper",
    status: "held",
  },
  {
    trophyId: "elite_champion_belt",
    definition: eloTitles.find((title) => title.id === "elo-elite")!,
    family: "elo",
    tier: "Elite",
    guardianName: "Emaren",
    status: "guardian_held",
  },
];

const DEFAULT_SETTINGS: Array<{ key: string; value: Prisma.InputJsonValue; reason: string }> = [
  {
    key: "chain_backed_trophies_enabled",
    value: false,
    reason: "WoloChain Warbound module is not live yet.",
  },
  {
    key: "app_only_fallback_enabled",
    value: true,
    reason: "App-side trophy custody remains the current settlement source.",
  },
  {
    key: "dry_run_only",
    value: true,
    reason: "Trophy payout and chain settlement actions default to dry-run.",
  },
  {
    key: "nationality_change_cooldown_days",
    value: 30,
    reason: "Placeholder cooldown for represented-country changes.",
  },
  {
    key: "elo_belt_grace_period_days",
    value: 14,
    reason: "Grace window before an out-of-band ELO holder must defend or vacate.",
  },
  {
    key: "artifact_tiers",
    value: ["Common", "Rare", "Epic", "Mythic", "Legend"],
    reason: "Future artifact rarity lanes.",
  },
];

function normalizeName(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function userName(user: {
  inGameName: string | null;
  steamPersonaName: string | null;
  uid: string;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

type TrophySeedUser = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress: string | null;
  representedCountry: string | null;
};

async function findSeedUser(
  prisma: PrismaClient,
  displayName: string | undefined
): Promise<TrophySeedUser | null> {
  if (!displayName) return null;
  const target = normalizeName(displayName);
  let users: TrophySeedUser[] = [];
  const where = {
    OR: [
      { inGameName: { equals: displayName, mode: "insensitive" as const } },
      { steamPersonaName: { equals: displayName, mode: "insensitive" as const } },
    ],
  };
  try {
    users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
        representedCountry: true,
      },
      take: 10,
    });
  } catch (error) {
    console.warn("Trophy seed identity lookup unavailable; preserving display custody only:", error);
    return null;
  }
  return (
    users.find(
      (user) =>
        normalizeName(user.inGameName) === target ||
        normalizeName(user.steamPersonaName) === target
    ) ?? null
  );
}

export function projectedTrophyBounty(trophy: Pick<Trophy, "currentBountyWolo" | "bountyGrowthWolo" | "holderSince" | "status">) {
  if (!trophy.holderSince || !["held", "active", "guardian_held"].includes(trophy.status)) {
    return trophy.currentBountyWolo;
  }
  const elapsedMs = Math.max(0, Date.now() - trophy.holderSince.getTime());
  const elapsedDays = Math.floor(elapsedMs / 86_400_000);
  return trophy.currentBountyWolo + elapsedDays * trophy.bountyGrowthWolo;
}

export async function ensureTrophySeedData(prisma: PrismaClient) {
  for (const seed of SEEDS) {
    const existing = await prisma.trophy.findUnique({ where: { trophyId: seed.trophyId } });
    if (existing) continue;

    const holder = await findSeedUser(prisma, seed.holderName);
    const guardian = await findSeedUser(prisma, seed.guardianName);
    const definition = seed.definition;
    const created = await prisma.trophy.create({
      data: {
        trophyId: seed.trophyId,
        displayName: definition.displayName,
        kind: "belt",
        family: seed.family,
        tier: seed.tier,
        status: seed.status,
        currentHolderUserId: holder?.id ?? null,
        currentHolderDisplayName: seed.holderName ?? null,
        currentHolderWoloAddress: holder?.walletAddress ?? null,
        guardianHolderUserId: guardian?.id ?? null,
        guardianHolderDisplayName: seed.guardianName ?? null,
        guardianHolderWoloAddress: guardian?.walletAddress ?? null,
        eligibleNationality: definition.country ?? null,
        eloBandMin: definition.eloMin ?? null,
        eloBandMax: definition.eloMax ?? null,
        tributeAmountWolo: definition.dailyWolo,
        bountyGrowthWolo: definition.dailyWolo,
        payoutFrequency: "daily",
        bountyAccrualFrequency: "daily",
        currentBountyWolo: 0,
        holderSince: seed.status === "held" || seed.status === "guardian_held" ? new Date() : null,
        nftClassId: `aoe2war.wartrophy.${seed.family}`,
        nftId: seed.trophyId,
        nftMetadataUri: `/api/trophies/${seed.trophyId}/metadata`,
        nftImageUri: definition.assetUrl,
        chainStatus: "app_only",
      },
    });

    await prisma.trophyEconomicsVersion.create({
      data: {
        trophyId: created.id,
        tributeAmountWolo: definition.dailyWolo,
        bountyGrowthWolo: definition.dailyWolo,
        payoutFrequency: "daily",
        bountyAccrualFrequency: "daily",
        reason: "Initial AoE2WAR War Trophy seed economics.",
      },
    });

    await prisma.trophyEvent.create({
      data: {
        trophyId: created.id,
        eventType:
          seed.status === "guardian_held"
            ? "GUARDIAN_ASSIGNED"
            : seed.status === "held"
              ? "HOLDER_ASSIGNED"
              : "TROPHY_CREATED",
        actorRole: "system",
        initiatedBy: "system",
        toHolderUserId: holder?.id ?? guardian?.id ?? null,
        toWoloAddress: holder?.walletAddress ?? guardian?.walletAddress ?? null,
        status: "recorded",
        rawResponse: {
          seededDisplayName: seed.holderName ?? seed.guardianName ?? null,
          appIdentityLinked: Boolean(holder || guardian),
        },
      },
    });
  }

  for (const setting of DEFAULT_SETTINGS) {
    await prisma.trophySetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    });
  }
}

async function loadRatings(prisma: PrismaClient) {
  const ratings = new Map<string, number>();
  try {
    const board = await loadLobbyLeaderboard(prisma, {
      limit: 500,
      includePendingClaimed: true,
    });
    for (const entry of board.entries) {
      const rating = entry.primaryRating ?? entry.steamRmRating ?? entry.elo ?? entry.arenaElo;
      if (typeof rating === "number" && Number.isFinite(rating)) {
        ratings.set(normalizeName(entry.name), rating);
      }
    }
  } catch (error) {
    console.warn("Trophy rating lookup unavailable:", error);
  }
  return ratings;
}

function holderEligible(
  trophy: {
    family: string;
    eligibleNationality: string | null;
    eloBandMin: number | null;
    eloBandMax: number | null;
    currentHolder: {
      representedCountry: string | null;
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
  },
  ratings: Map<string, number>
) {
  if (!trophy.currentHolder) return null;
  if (trophy.family === "national") {
    return trophy.currentHolder.representedCountry === trophy.eligibleNationality;
  }
  if (trophy.family === "elo") {
    const rating =
      ratings.get(normalizeName(trophy.currentHolder.inGameName)) ??
      ratings.get(normalizeName(trophy.currentHolder.steamPersonaName)) ??
      null;
    if (rating === null) return null;
    if (trophy.eloBandMax !== null && rating > trophy.eloBandMax) return false;
    return true;
  }
  return true;
}

function trophyDefinitionForRow(trophyId: string) {
  const seed = SEEDS.find((item) => item.trophyId === trophyId);
  return seed?.definition ?? allChampionTitles.find((title) => title.id === trophyId) ?? null;
}

export async function loadTrophyUsers(prisma: PrismaClient): Promise<TrophyUserOption[]> {
  const [users, ratings] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        walletAddress: true,
        representedCountry: true,
      },
      orderBy: [{ lastSeen: "desc" }, { id: "asc" }],
      take: 500,
    }),
    loadRatings(prisma),
  ]);
  return users.map((user) => ({
    id: user.id,
    uid: user.uid,
    name: userName(user),
    walletAddress: user.walletAddress,
    representedCountry: user.representedCountry,
    rating:
      ratings.get(normalizeName(user.inGameName)) ??
      ratings.get(normalizeName(user.steamPersonaName)) ??
      null,
  }));
}

export async function loadTrophyCommandSnapshot(
  prisma: PrismaClient
): Promise<TrophyCommandSnapshot> {
  await ensureTrophySeedData(prisma);
  const ratings = await loadRatings(prisma);
  const [trophies, challenges, payouts, events, settings, users, replays] = await Promise.all([
    prisma.trophy.findMany({
      include: {
        currentHolder: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            representedCountry: true,
            walletAddress: true,
          },
        },
        guardianHolder: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
            walletAddress: true,
          },
        },
        economics: {
          include: {
            changedBy: {
              select: { uid: true, inGameName: true, steamPersonaName: true },
            },
          },
          orderBy: { effectiveFrom: "desc" },
          take: 12,
        },
      },
      orderBy: [{ kind: "asc" }, { family: "asc" }, { displayName: "asc" }],
    }),
    prisma.trophyChallenge.findMany({
      include: {
        trophy: true,
        challenger: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        defender: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        guardian: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        winner: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        replay: {
          select: { id: true, original_filename: true, winner: true, played_on: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    prisma.trophyPayout.findMany({
      include: {
        trophy: true,
        recipient: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    prisma.trophyEvent.findMany({
      include: {
        trophy: true,
        actor: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        fromHolder: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        toHolder: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.trophySetting.findMany({
      include: {
        changedBy: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
      orderBy: { key: "asc" },
    }),
    loadTrophyUsers(prisma),
    prisma.gameStats.findMany({
      where: { is_final: true },
      select: {
        id: true,
        original_filename: true,
        replay_file: true,
        winner: true,
        players: true,
        played_on: true,
        createdAt: true,
      },
      orderBy: [{ played_on: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);

  const trophyRows: TrophyRow[] = trophies.map((trophy) => {
    const eligible = holderEligible(trophy, ratings);
    const appChainMismatch = Boolean(
      trophy.chainOwnerAddress &&
        trophy.currentHolderWoloAddress &&
        trophy.chainOwnerAddress !== trophy.currentHolderWoloAddress
    );
    return {
      id: trophy.id,
      trophyId: trophy.trophyId,
      displayName: trophy.displayName,
      kind: trophy.kind,
      family: trophy.family,
      tier: trophy.tier,
      status: trophy.status,
      currentHolderUserId: trophy.currentHolderUserId,
      currentHolderDisplayName:
        trophy.currentHolderDisplayName ||
        (trophy.currentHolder ? userName(trophy.currentHolder) : null),
      currentHolderWoloAddress: trophy.currentHolderWoloAddress,
      guardianHolderUserId: trophy.guardianHolderUserId,
      guardianHolderDisplayName:
        trophy.guardianHolderDisplayName ||
        (trophy.guardianHolder ? userName(trophy.guardianHolder) : null),
      guardianHolderWoloAddress: trophy.guardianHolderWoloAddress,
      eligibleNationality: trophy.eligibleNationality,
      eloBandMin: trophy.eloBandMin,
      eloBandMax: trophy.eloBandMax,
      currentBountyWolo: trophy.currentBountyWolo,
      projectedBountyWolo: projectedTrophyBounty(trophy),
      tributeAmountWolo: trophy.tributeAmountWolo,
      bountyGrowthWolo: trophy.bountyGrowthWolo,
      payoutFrequency: trophy.payoutFrequency,
      bountyAccrualFrequency: trophy.bountyAccrualFrequency,
      nftClassId: trophy.nftClassId,
      nftId: trophy.nftId,
      nftMetadataUri: trophy.nftMetadataUri,
      nftImageUri: trophy.nftImageUri,
      chainStatus: trophy.chainStatus,
      chainOwnerAddress: trophy.chainOwnerAddress,
      lastChainSyncAt: trophy.lastChainSyncAt?.toISOString() ?? null,
      forfeitureNeeded: trophy.forfeitureNeeded,
      eligibilityNote: trophy.eligibilityNote,
      holderSince: trophy.holderSince?.toISOString() ?? null,
      appChainMismatch,
      currentHolderEligible: eligible,
      createdAt: trophy.createdAt.toISOString(),
      updatedAt: trophy.updatedAt.toISOString(),
      economics: trophy.economics.map((version) => ({
        id: version.id,
        tributeAmountWolo: version.tributeAmountWolo,
        bountyGrowthWolo: version.bountyGrowthWolo,
        payoutFrequency: version.payoutFrequency,
        bountyAccrualFrequency: version.bountyAccrualFrequency,
        effectiveFrom: version.effectiveFrom.toISOString(),
        effectiveTo: version.effectiveTo?.toISOString() ?? null,
        changedBy: version.changedBy ? userName(version.changedBy) : null,
        reason: version.reason,
      })),
    };
  });

  const pendingChallengeStatuses = new Set([
    "draft",
    "proposed",
    "accepted",
    "scheduled",
    "watcher_pending",
    "replay_uploaded",
    "verification_pending",
    "settlement_dry_run",
    "settling",
  ]);
  const failedChainTypes = new Set(["CHAIN_QUERY_FAILED", "CHAIN_TX_FAILED", "SETTLEMENT_FAILED"]);
  const totalDailyTribute = trophyRows
    .filter((trophy) => ["held", "active"].includes(trophy.status))
    .reduce((sum, trophy) => sum + trophy.tributeAmountWolo, 0);
  const totalDailyBountyGrowth = trophyRows
    .filter((trophy) => ["held", "active", "guardian_held"].includes(trophy.status))
    .reduce((sum, trophy) => sum + trophy.bountyGrowthWolo, 0);

  return {
    overview: {
      activeTrophies: trophyRows.filter((trophy) => ["held", "active"].includes(trophy.status)).length,
      vacantTrophies: trophyRows.filter((trophy) => trophy.status === "vacant").length,
      guardianHeldTrophies: trophyRows.filter((trophy) => trophy.status === "guardian_held").length,
      appOnlyTrophies: trophyRows.filter((trophy) => trophy.chainStatus === "app_only").length,
      chainBackedTrophies: trophyRows.filter((trophy) => trophy.chainStatus !== "app_only").length,
      mintedNfts: trophyRows.filter((trophy) => trophy.chainStatus === "minted").length,
      pendingChallenges: challenges.filter((challenge) =>
        pendingChallengeStatuses.has(challenge.status)
      ).length,
      pendingPayouts: payouts.filter((payout) =>
        ["pending", "dry_run", "retrying"].includes(payout.status)
      ).length,
      failedPayouts: payouts.filter((payout) => payout.status === "failed").length,
      failedChainEvents: events.filter(
        (event) => event.status === "failed" || failedChainTypes.has(event.eventType)
      ).length,
      totalDailyTribute,
      totalDailyBountyGrowth,
      estimatedYearlyExposure: (totalDailyTribute + totalDailyBountyGrowth) * 365,
      trophyRewardsWalletStatus: process.env.WOLO_TROPHY_REWARDS_ADDRESS
        ? "Configured · chain balance integration pending"
        : "Not configured · app-only dry-run",
      eligibilityConflicts: trophyRows.filter(
        (trophy) => trophy.forfeitureNeeded || trophy.currentHolderEligible === false
      ).length,
    },
    trophies: trophyRows,
    challenges: challenges.map((challenge) => ({
      id: challenge.id,
      trophyId: challenge.trophyId,
      trophyKey: challenge.trophy.trophyId,
      trophyName: challenge.trophy.displayName,
      challengeKind: challenge.challengeKind,
      challengerUserId: challenge.challengerUserId,
      challengerName: userName(challenge.challenger),
      defenderUserId: challenge.defenderUserId,
      defenderName: challenge.defender ? userName(challenge.defender) : null,
      guardianUserId: challenge.guardianUserId,
      guardianName: challenge.guardian ? userName(challenge.guardian) : null,
      requiredNationality: challenge.requiredNationality,
      requiredEloMin: challenge.requiredEloMin,
      requiredEloMax: challenge.requiredEloMax,
      eligibilitySnapshot: challenge.eligibilitySnapshot,
      eligibilityOverride: challenge.eligibilityOverride,
      status: challenge.status,
      replayId: challenge.replayId,
      replayLabel: challenge.replay
        ? `#${challenge.replay.id} · ${challenge.replay.original_filename || "parsed replay"}`
        : null,
      scheduledMatchId: challenge.scheduledMatchId,
      watcherSessionId: challenge.watcherSessionId,
      watcherPairingId: challenge.watcherPairingId,
      winnerUserId: challenge.winnerUserId,
      winnerName: challenge.winner ? userName(challenge.winner) : null,
      verificationSummary: challenge.verificationSummary,
      settlementStatus: challenge.settlementStatus,
      chainTxHash: challenge.chainTxHash,
      payoutTxHash: challenge.payoutTxHash,
      errorState: challenge.errorState,
      createdAt: challenge.createdAt.toISOString(),
      updatedAt: challenge.updatedAt.toISOString(),
    })),
    payouts: payouts.map((payout) => ({
      id: payout.id,
      trophyId: payout.trophyId,
      trophyKey: payout.trophy.trophyId,
      trophyName: payout.trophy.displayName,
      recipientUserId: payout.recipientUserId,
      recipientName:
        payout.recipientDisplayName || (payout.recipient ? userName(payout.recipient) : null),
      recipientWoloAddress: payout.recipientWoloAddress,
      amountWolo: payout.amountWolo,
      payoutKind: payout.payoutKind,
      status: payout.status,
      scheduledFor: payout.scheduledFor?.toISOString() ?? null,
      paidAt: payout.paidAt?.toISOString() ?? null,
      txHash: payout.txHash,
      errorState: payout.errorState,
      rawRequest: payout.rawRequest,
      rawResponse: payout.rawResponse,
      retryCount: payout.retryCount,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString(),
    })),
    events: events.map((event) => ({
      id: event.id,
      trophyId: event.trophyId,
      trophyKey: event.trophy.trophyId,
      trophyName: event.trophy.displayName,
      challengeId: event.challengeId,
      eventType: event.eventType,
      actorName: event.actor ? userName(event.actor) : null,
      actorRole: event.actorRole,
      initiatedBy: event.initiatedBy,
      fromHolderName: event.fromHolder ? userName(event.fromHolder) : null,
      toHolderName: event.toHolder ? userName(event.toHolder) : null,
      fromWoloAddress: event.fromWoloAddress,
      toWoloAddress: event.toWoloAddress,
      amountWolo: event.amountWolo,
      replayId: event.replayId,
      chainTxHash: event.chainTxHash,
      status: event.status,
      rawRequest: event.rawRequest,
      rawResponse: event.rawResponse,
      errorMessage: event.errorMessage,
      retryCount: event.retryCount,
      createdAt: event.createdAt.toISOString(),
    })),
    settings: settings.map((setting) => ({
      key: setting.key,
      value: setting.value,
      reason: setting.reason,
      changedBy: setting.changedBy ? userName(setting.changedBy) : null,
      updatedAt: setting.updatedAt.toISOString(),
    })),
    users,
    replays: replays.map((replay) => {
      const playerRows = Array.isArray(replay.players) ? replay.players : [];
      const players = playerRows
        .map((player) =>
          player && typeof player === "object" && "name" in player
            ? String((player as { name?: unknown }).name || "")
            : ""
        )
        .filter(Boolean);
      return {
        id: replay.id,
        label: `#${replay.id} · ${players.join(" vs ") || replay.original_filename || replay.replay_file}`,
        winner: replay.winner,
        players,
        playedOn: (replay.played_on || replay.createdAt).toISOString(),
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

export async function loadPublicTrophies(prisma: PrismaClient) {
  await ensureTrophySeedData(prisma);
  return prisma.trophy.findMany({
    include: {
      currentHolder: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
      guardianHolder: {
        select: { uid: true, inGameName: true, steamPersonaName: true },
      },
    },
    orderBy: [{ family: "asc" }, { displayName: "asc" }],
  });
}

export async function loadUserTrophyHoldings(
  prisma: PrismaClient,
  userId: number
): Promise<TrophyHolding[]> {
  await ensureTrophySeedData(prisma);
  const trophies = await prisma.trophy.findMany({
    where: { currentHolderUserId: userId, status: { in: ["held", "active"] } },
    orderBy: [{ kind: "asc" }, { displayName: "asc" }],
  });
  return trophies.map((trophy) => {
    const definition = trophyDefinitionForRow(trophy.trophyId);
    const type = definition?.type || trophy.family;
    const assetKind = trophy.kind === "artifact" ? "artifact" : "belt";
    return {
      id: trophy.trophyId,
      type,
      kind: trophy.kind,
      family: trophy.family,
      displayName: trophy.displayName,
      shortName: definition?.shortName || trophy.displayName.replace(/ Champion( Belt)?$/i, ""),
      dailyWolo: trophy.tributeAmountWolo,
      bountyGrowthWolo: trophy.bountyGrowthWolo,
      currentBountyWolo: projectedTrophyBounty(trophy),
      routeHref: definition?.routeHref || "/champions",
      assetUrl: managedMediaPublicUrl(
        assetKind,
        definition?.id || trophy.trophyId,
        trophy.nftImageUri || definition?.assetUrl
      ),
      holderSince: trophy.holderSince?.toISOString() ?? null,
      status: trophy.status,
      chainStatus: trophy.chainStatus,
      nftId: trophy.nftId,
      eligibleNationality: trophy.eligibleNationality,
    };
  });
}

export async function recordNationalityChange(
  prisma: PrismaClient,
  input: {
    userId: number;
    actorUserId?: number | null;
    previousCountry: string | null;
    nextCountry: string | null;
    initiatedBy: "user" | "admin";
    strict?: boolean;
  }
) {
  try {
    await ensureTrophySeedData(prisma);
    const heldNationalTrophies = await prisma.trophy.findMany({
      where: {
        family: "national",
        currentHolderUserId: input.userId,
        status: { in: ["held", "active"] },
      },
    });

    for (const trophy of heldNationalTrophies) {
      const eligible = trophy.eligibleNationality === input.nextCountry;
      await prisma.$transaction([
        prisma.trophyEvent.create({
          data: {
            trophyId: trophy.id,
            eventType: "NATIONALITY_CHANGED",
            actorUserId: input.actorUserId ?? input.userId,
            actorRole: input.initiatedBy === "admin" ? "admin" : "challenger",
            initiatedBy: input.initiatedBy,
            fromHolderUserId: input.userId,
            toHolderUserId: input.userId,
            status: "recorded",
            rawRequest: {
              previousCountry: input.previousCountry,
              nextCountry: input.nextCountry,
            },
          },
        }),
        ...(eligible
          ? []
          : [
              prisma.trophy.update({
                where: { id: trophy.id },
                data: {
                  forfeitureNeeded: true,
                  eligibilityNote: `Holder changed Representing Country from ${input.previousCountry || "unset"} to ${input.nextCountry || "unset"}. Admin vacate/reassign review required.`,
                },
              }),
              prisma.trophyEvent.create({
                data: {
                  trophyId: trophy.id,
                  eventType: "NATIONAL_ELIGIBILITY_FORFEITURE_NEEDED",
                  actorUserId: input.actorUserId ?? input.userId,
                  actorRole: input.initiatedBy === "admin" ? "admin" : "system",
                  initiatedBy: input.initiatedBy,
                  fromHolderUserId: input.userId,
                  status: "attention_required",
                  rawResponse: {
                    requiredNationality: trophy.eligibleNationality,
                    actualNationality: input.nextCountry,
                  },
                },
              }),
            ]),
      ]);
    }
  } catch (error) {
    if (input.strict) throw error;
    console.warn("Trophy nationality audit unavailable:", error);
  }
}

export function seededTrophyDefinition(trophyId: string) {
  return SEEDS.find((seed) => seed.trophyId === trophyId) ?? null;
}

export function seededTrophyKeyForChallenge(
  titleId: string | null | undefined,
  representedCountry?: string | null
) {
  const normalizedTitle = (titleId || "").trim().toLowerCase();
  const normalizedCountry = (representedCountry || "").trim().toLowerCase();

  if (normalizedTitle === "national" && normalizedCountry) {
    return (
      SEEDS.find(
        (seed) =>
          seed.family === "national" &&
          seed.definition.country?.toLowerCase() === normalizedCountry
      )?.trophyId ?? null
    );
  }

  return (
    SEEDS.find(
      (seed) =>
        seed.definition.id.toLowerCase() === normalizedTitle ||
        seed.trophyId.toLowerCase() === normalizedTitle
    )?.trophyId ?? null
  );
}
