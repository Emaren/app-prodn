import type { PrismaClient } from "@/lib/generated/prisma";
import {
  buildClaimedPlayerHref,
  buildClaimedPlayerToken,
  buildReplayPlayerHref,
  buildReplayPlayerToken,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";
import { normalizePendingWoloClaimName } from "@/lib/pendingWoloClaims";
import type { LobbyWoloEarnersBoard, LobbyWoloEarnersEntry } from "@/lib/lobby";

const WEEKLY_TIMEFRAME_DAYS = 7;
const MIN_VISIBLE_SLOTS = 3;
const WEEKLY_TIMEFRAME_MS = WEEKLY_TIMEFRAME_DAYS * 24 * 60 * 60 * 1000;

type UserIdentity = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
};

type ClaimSample = {
  claimedByUserId: number | null;
  normalizedPlayerName: string;
  displayPlayerName: string;
  amountWolo: number;
  status: string;
  createdAt: Date;
  rescindedAt: Date | null;
};

type WagerSample = {
  userId: number;
  amountWolo: number;
  createdAt: Date;
};

type ActorMetrics = {
  actorKey: string;
  user: UserIdentity | null;
  replayName: string | null;
  earnedWolo: number;
  wageredWolo: number;
  claimCount: number;
  wagerCount: number;
  unclaimedWolo: number;
  lastActiveAt: Date | null;
};

function normalizeNameKey(value: string | null | undefined) {
  return normalizePendingWoloClaimName(value);
}

function formatUserDisplayName(user: UserIdentity) {
  return (
    normalizePublicPlayerName(user.inGameName) ||
    normalizePublicPlayerName(user.steamPersonaName) ||
    user.uid
  );
}

function setLatestActivity(current: Date | null, candidate: Date) {
  if (!current || candidate.getTime() > current.getTime()) {
    return candidate;
  }
  return current;
}

function sortMetrics(a: ActorMetrics, b: ActorMetrics) {
  if (b.earnedWolo !== a.earnedWolo) {
    return b.earnedWolo - a.earnedWolo;
  }
  if (b.wageredWolo !== a.wageredWolo) {
    return b.wageredWolo - a.wageredWolo;
  }
  if (b.wagerCount !== a.wagerCount) {
    return b.wagerCount - a.wagerCount;
  }
  if (b.claimCount !== a.claimCount) {
    return b.claimCount - a.claimCount;
  }

  const aMs = a.lastActiveAt?.getTime() ?? 0;
  const bMs = b.lastActiveAt?.getTime() ?? 0;
  if (bMs !== aMs) {
    return bMs - aMs;
  }

  const aName = a.user ? formatUserDisplayName(a.user) : a.replayName || "";
  const bName = b.user ? formatUserDisplayName(b.user) : b.replayName || "";
  return aName.localeCompare(bName);
}

function buildEntry(
  metrics: ActorMetrics,
  rank: number,
  sourceWindow: "weekly" | "backfill"
): LobbyWoloEarnersEntry {
  if (metrics.user) {
    const name = formatUserDisplayName(metrics.user);
    return {
      rank,
      key: buildClaimedPlayerToken(metrics.user.uid),
      name,
      href: buildClaimedPlayerHref(metrics.user.uid),
      claimed: true,
      verified: metrics.user.verified,
      verificationLevel: metrics.user.verificationLevel,
      earnedWolo: metrics.earnedWolo,
      wageredWolo: metrics.wageredWolo,
      claimCount: metrics.claimCount,
      wagerCount: metrics.wagerCount,
      unclaimedWolo: metrics.unclaimedWolo,
      lastActiveAt: metrics.lastActiveAt?.toISOString() ?? null,
      sourceWindow,
    };
  }

  const replayName = normalizePublicPlayerName(metrics.replayName) || "Unknown player";
  return {
    rank,
    key: buildReplayPlayerToken(replayName),
    name: replayName,
    href: buildReplayPlayerHref(replayName),
    claimed: false,
    verified: false,
    verificationLevel: 0,
    earnedWolo: metrics.earnedWolo,
    wageredWolo: metrics.wageredWolo,
    claimCount: metrics.claimCount,
    wagerCount: metrics.wagerCount,
    unclaimedWolo: metrics.unclaimedWolo,
    lastActiveAt: metrics.lastActiveAt?.toISOString() ?? null,
    sourceWindow,
  };
}

async function loadUsersByIds(prisma: PrismaClient, ids: number[]) {
  const uniqueIds = Array.from(new Set(ids.filter((value) => Number.isInteger(value))));
  const map = new Map<number, UserIdentity>();

  if (uniqueIds.length === 0) {
    return map;
  }

  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
    },
  });

  for (const user of users) {
    map.set(user.id, user);
  }

  return map;
}

async function loadUsersByNames(prisma: PrismaClient, names: string[]) {
  const normalizedNames = Array.from(new Set(names.map((value) => normalizeNameKey(value)).filter(Boolean)));
  const map = new Map<string, UserIdentity>();

  if (normalizedNames.length === 0) {
    return map;
  }

  const users = await prisma.user.findMany({
    where: {
      OR: normalizedNames.flatMap((name) => [
        { inGameName: { equals: name, mode: "insensitive" as const } },
        { steamPersonaName: { equals: name, mode: "insensitive" as const } },
      ]),
    },
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
    },
  });

  for (const user of users) {
    const keys = [user.inGameName, user.steamPersonaName]
      .map((value) => normalizeNameKey(value))
      .filter(Boolean);

    for (const key of keys) {
      if (!map.has(key)) {
        map.set(key, user);
      }
    }
  }

  return map;
}

function getOrCreateActor(
  map: Map<string, ActorMetrics>,
  input: {
    actorKey: string;
    user: UserIdentity | null;
    replayName: string | null;
  }
) {
  const existing = map.get(input.actorKey);
  if (existing) {
    if (!existing.user && input.user) {
      existing.user = input.user;
    }
    if (!existing.replayName && input.replayName) {
      existing.replayName = input.replayName;
    }
    return existing;
  }

  const created: ActorMetrics = {
    actorKey: input.actorKey,
    user: input.user,
    replayName: input.replayName,
    earnedWolo: 0,
    wageredWolo: 0,
    claimCount: 0,
    wagerCount: 0,
    unclaimedWolo: 0,
    lastActiveAt: null,
  };

  map.set(input.actorKey, created);
  return created;
}

async function loadClaims(prisma: PrismaClient, since: Date | null) {
  return prisma.pendingWoloClaim.findMany({
    where: {
      rescindedAt: null,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
    select: {
      claimedByUserId: true,
      normalizedPlayerName: true,
      displayPlayerName: true,
      amountWolo: true,
      status: true,
      createdAt: true,
      rescindedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }) as Promise<ClaimSample[]>;
}

async function loadWagers(prisma: PrismaClient, since: Date | null) {
  return prisma.betWager.findMany({
    where: since ? { createdAt: { gte: since } } : undefined,
    select: {
      userId: true,
      amountWolo: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }) as Promise<WagerSample[]>;
}

async function loadMetricsForPeriod(prisma: PrismaClient, since: Date | null) {
  const [claims, wagers] = await Promise.all([loadClaims(prisma, since), loadWagers(prisma, since)]);

  const claimedUserIds = claims
    .map((claim) => claim.claimedByUserId)
    .filter((value): value is number => Number.isInteger(value));
  const wagerUserIds = wagers.map((wager) => wager.userId);
  const orphanClaimNames = claims
    .filter((claim) => !claim.claimedByUserId)
    .map((claim) => claim.displayPlayerName || claim.normalizedPlayerName);

  const [usersById, usersByName] = await Promise.all([
    loadUsersByIds(prisma, [...claimedUserIds, ...wagerUserIds]),
    loadUsersByNames(prisma, orphanClaimNames),
  ]);

  const metrics = new Map<string, ActorMetrics>();

  for (const claim of claims) {
    const directUser = claim.claimedByUserId ? usersById.get(claim.claimedByUserId) ?? null : null;
    const matchedUser =
      directUser ??
      usersByName.get(claim.normalizedPlayerName) ??
      usersByName.get(normalizeNameKey(claim.displayPlayerName)) ??
      null;
    const actorKey = matchedUser ? `u:${matchedUser.id}` : `n:${claim.normalizedPlayerName}`;
    const actor = getOrCreateActor(metrics, {
      actorKey,
      user: matchedUser,
      replayName: matchedUser ? null : claim.displayPlayerName || claim.normalizedPlayerName,
    });

    actor.earnedWolo += claim.amountWolo;
    actor.claimCount += 1;
    actor.lastActiveAt = setLatestActivity(actor.lastActiveAt, claim.createdAt);

    if (claim.status === "pending") {
      actor.unclaimedWolo += claim.amountWolo;
    }
  }

  for (const wager of wagers) {
    const user = usersById.get(wager.userId);
    if (!user) continue;

    const actor = getOrCreateActor(metrics, {
      actorKey: `u:${user.id}`,
      user,
      replayName: null,
    });

    actor.wageredWolo += wager.amountWolo;
    actor.wagerCount += 1;
    actor.lastActiveAt = setLatestActivity(actor.lastActiveAt, wager.createdAt);
  }

  return Array.from(metrics.values())
    .filter((entry) => entry.earnedWolo > 0 || entry.wageredWolo > 0)
    .sort(sortMetrics);
}

export async function loadLobbyWoloEarnersBoard(
  prisma: PrismaClient
): Promise<LobbyWoloEarnersBoard> {
  const generatedAt = new Date();
  const weekStartsAt = new Date(generatedAt.getTime() - WEEKLY_TIMEFRAME_MS);
  const weeklyMetrics = await loadMetricsForPeriod(prisma, weekStartsAt);

  let combinedMetrics = weeklyMetrics;
  let backfilled = false;

  if (weeklyMetrics.length < MIN_VISIBLE_SLOTS) {
    const historicalMetrics = await loadMetricsForPeriod(prisma, null);
    const weeklyKeys = new Set(weeklyMetrics.map((entry) => entry.actorKey));
    const backfillMetrics = historicalMetrics.filter((entry) => !weeklyKeys.has(entry.actorKey));

    if (backfillMetrics.length > 0) {
      combinedMetrics = [...weeklyMetrics, ...backfillMetrics];
      backfilled = true;
    }
  }

  const entries = combinedMetrics.map((entry, index) =>
    buildEntry(entry, index + 1, index < weeklyMetrics.length ? "weekly" : "backfill")
  );

  return {
    timeframeDays: WEEKLY_TIMEFRAME_DAYS,
    visibleSlots: MIN_VISIBLE_SLOTS,
    totalParticipants: entries.length,
    backfilled,
    weekStartsAt: weekStartsAt.toISOString(),
    generatedAt: generatedAt.toISOString(),
    entries,
  };
}
