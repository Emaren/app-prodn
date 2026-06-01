import type { Prisma, PrismaClient } from "@/lib/generated/prisma";
import {
  buildClaimedPlayerHref,
  buildClaimedPlayerToken,
  buildReplayPlayerHref,
  buildReplayPlayerToken,
  normalizePublicPlayerName,
} from "@/lib/publicPlayers";
import { normalizePendingWoloClaimName } from "@/lib/pendingWoloClaims";
import type {
  LobbyWoloEarnersBoard,
  LobbyWoloEarnersEntry,
  LobbyWoloEarnersMode,
} from "@/lib/lobby";
import { getWoloMainnetDisplayStartAt, isWoloMainnet } from "@/lib/woloChain";

const WEEKLY_TIMEFRAME_DAYS = 7;
const MIN_VISIBLE_SLOTS = 3;

type LoadLobbyWoloEarnersBoardOptions = {
  mode?: LobbyWoloEarnersMode;
};

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
  claimKind: string;
  status: string;
  createdAt: Date;
  rescindedAt: Date | null;
};

type WagerSample = {
  userId: number;
  amountWolo: number;
  payoutWolo: number | null;
  status: string;
  createdAt: Date;
  settledAt: Date | null;
};

type ActorMetrics = {
  actorKey: string;
  user: UserIdentity | null;
  replayName: string | null;
  weeklyTakeWolo: number;
  settledWolo: number;
  wageredWolo: number;
  claimCount: number;
  wagerCount: number;
  claimableWolo: number;
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

function getAllTimeTakeWolo(metrics: Pick<ActorMetrics, "settledWolo" | "claimableWolo">) {
  return metrics.settledWolo + metrics.claimableWolo;
}

function compareSharedTieBreakers(a: ActorMetrics, b: ActorMetrics) {
  if (b.wageredWolo !== a.wageredWolo) {
    return b.wageredWolo - a.wageredWolo;
  }
  if (b.settledWolo !== a.settledWolo) {
    return b.settledWolo - a.settledWolo;
  }
  if (b.claimableWolo !== a.claimableWolo) {
    return b.claimableWolo - a.claimableWolo;
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

function sortMetricsForMode(mode: LobbyWoloEarnersMode) {
  return (a: ActorMetrics, b: ActorMetrics) => {
    const aAllTimeTake = getAllTimeTakeWolo(a);
    const bAllTimeTake = getAllTimeTakeWolo(b);

    if (mode === "all_time") {
      if (bAllTimeTake !== aAllTimeTake) {
        return bAllTimeTake - aAllTimeTake;
      }
      if (b.weeklyTakeWolo !== a.weeklyTakeWolo) {
        return b.weeklyTakeWolo - a.weeklyTakeWolo;
      }
      return compareSharedTieBreakers(a, b);
    }

    if (b.weeklyTakeWolo !== a.weeklyTakeWolo) {
      return b.weeklyTakeWolo - a.weeklyTakeWolo;
    }
    if (bAllTimeTake !== aAllTimeTake) {
      return bAllTimeTake - aAllTimeTake;
    }
    return compareSharedTieBreakers(a, b);
  };
}

function getCurrentUtcWeekStart(now: Date) {
  const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  return weekStart;
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
      allTimeTakeWolo: getAllTimeTakeWolo(metrics),
      weeklyTakeWolo: metrics.weeklyTakeWolo,
      settledWolo: metrics.settledWolo,
      wageredWolo: metrics.wageredWolo,
      claimCount: metrics.claimCount,
      wagerCount: metrics.wagerCount,
      claimableWolo: metrics.claimableWolo,
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
    allTimeTakeWolo: getAllTimeTakeWolo(metrics),
    weeklyTakeWolo: metrics.weeklyTakeWolo,
    settledWolo: metrics.settledWolo,
    wageredWolo: metrics.wageredWolo,
    claimCount: metrics.claimCount,
    wagerCount: metrics.wagerCount,
    claimableWolo: metrics.claimableWolo,
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
    weeklyTakeWolo: 0,
    settledWolo: 0,
    wageredWolo: 0,
    claimCount: 0,
    wagerCount: 0,
    claimableWolo: 0,
    lastActiveAt: null,
  };

  map.set(input.actorKey, created);
  return created;
}

async function loadClaims(prisma: PrismaClient) {
  return prisma.pendingWoloClaim.findMany({
    where: {
      rescindedAt: null,
      ...(isWoloMainnet() ? { createdAt: { gte: getWoloMainnetDisplayStartAt() } } : {}),
    },
    select: {
      claimedByUserId: true,
      normalizedPlayerName: true,
      displayPlayerName: true,
      amountWolo: true,
      claimKind: true,
      status: true,
      createdAt: true,
      rescindedAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }) as Promise<ClaimSample[]>;
}

async function loadWagers(prisma: PrismaClient) {
  return prisma.betWager.findMany({
    where: visibleMainnetWagerWhere(),
    select: {
      userId: true,
      amountWolo: true,
      payoutWolo: true,
      status: true,
      createdAt: true,
      settledAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  }) as Promise<WagerSample[]>;
}

function visibleMainnetWagerWhere(): Prisma.BetWagerWhereInput {
  if (!isWoloMainnet()) return {};
  return {
    executionMode: "onchain_escrow",
    stakeTxHash: { not: null },
    stakeLockedAt: { gte: getWoloMainnetDisplayStartAt() },
    stakeIntent: {
      is: {
        status: "recorded",
      },
    },
  };
}

function claimCountsAsWeeklyTake(claim: Pick<ClaimSample, "claimKind">) {
  return claim.claimKind !== "bet_payout" && claim.claimKind !== "bet_refund";
}

function claimCountsAsSettled(claim: Pick<ClaimSample, "claimKind" | "status">) {
  return claim.status === "claimed" && claimCountsAsWeeklyTake(claim);
}

function wagerCountsAsSettled(wager: Pick<WagerSample, "status" | "payoutWolo">) {
  return (wager.status === "won" || wager.status === "void") && (wager.payoutWolo ?? 0) > 0;
}

async function loadBoardMetrics(prisma: PrismaClient, weekStartsAt: Date) {
  const [claims, wagers] = await Promise.all([loadClaims(prisma), loadWagers(prisma)]);

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

    if (claimCountsAsWeeklyTake(claim) && claim.createdAt.getTime() >= weekStartsAt.getTime()) {
      actor.weeklyTakeWolo += claim.amountWolo;
    }
    if (claimCountsAsSettled(claim)) {
      actor.settledWolo += claim.amountWolo;
    }
    if (claim.status === "pending") {
      actor.claimableWolo += claim.amountWolo;
    }
    actor.claimCount += 1;
    actor.lastActiveAt = setLatestActivity(actor.lastActiveAt, claim.createdAt);
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

    const takeSettledAt = wager.settledAt ?? wager.createdAt;
    if (wagerCountsAsSettled(wager)) {
      actor.settledWolo += wager.payoutWolo ?? 0;
      if (takeSettledAt.getTime() >= weekStartsAt.getTime()) {
        actor.weeklyTakeWolo += wager.payoutWolo ?? 0;
      }
      actor.lastActiveAt = setLatestActivity(actor.lastActiveAt, takeSettledAt);
    }
  }

  return Array.from(metrics.values())
    .filter(
      (entry) =>
        entry.weeklyTakeWolo > 0 ||
        entry.settledWolo > 0 ||
        entry.wageredWolo > 0 ||
        entry.claimableWolo > 0
    );
}

export async function loadLobbyWoloEarnersBoard(
  prisma: PrismaClient,
  options: LoadLobbyWoloEarnersBoardOptions = {}
): Promise<LobbyWoloEarnersBoard> {
  const mode = options.mode ?? "weekly";
  const generatedAt = new Date();
  const weekStartsAt = getCurrentUtcWeekStart(generatedAt);
  const allMetrics = await loadBoardMetrics(prisma, weekStartsAt);

  const entries = allMetrics
    .sort(sortMetricsForMode(mode))
    .map((entry, index) =>
      buildEntry(entry, index + 1, entry.weeklyTakeWolo > 0 ? "weekly" : "backfill")
    );

  return {
    mode,
    timeframeDays: WEEKLY_TIMEFRAME_DAYS,
    visibleSlots: MIN_VISIBLE_SLOTS,
    totalParticipants: entries.length,
    backfilled: entries.some((entry) => entry.sourceWindow === "backfill"),
    weekStartsAt: weekStartsAt.toISOString(),
    generatedAt: generatedAt.toISOString(),
    entries,
  };
}
