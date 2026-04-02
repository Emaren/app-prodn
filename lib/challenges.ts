import type { PrismaClient } from "@/lib/generated/prisma";
import { loadLiveSessionSnapshot } from "@/lib/liveSessionSnapshot";
import { buildClaimedPlayerHref } from "@/lib/publicPlayers";

const CHALLENGE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const CHALLENGE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_HISTORY_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_RECENT_LINGER_MS = 15 * 60 * 1000;
const CHALLENGE_START_GRACE_MS = 60 * 1000;
const SESSION_MATCH_LOOKBACK_MS = 45 * 60 * 1000;
const SESSION_MATCH_LOOKAHEAD_MS = 8 * 60 * 60 * 1000;
const ACTIVE_SCHEDULED_STATUSES = ["pending", "accepted"] as const;

type ChallengeUserRow = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  lastSeen: Date | null;
};

type ScheduledMatchRow = {
  id: number;
  status: string;
  scheduledAt: Date;
  createdAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  challengeNote: string | null;
  challenger: ChallengeUserRow;
  challenged: ChallengeUserRow;
};

type ComparableSession = {
  id: number;
  sessionKey: string;
  updatedAt: string;
  completedAt: string | null;
  mapName: string | null;
  winner: string | null;
  durationSeconds: number | null;
  players: Array<{ name: string }>;
  state: "live" | "completed";
};

export type ChallengePlayerSurface = {
  uid: string;
  href: string;
  name: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  isOnline: boolean;
};

export type ScheduledMatchTile = {
  id: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
  displayState:
    | "pending"
    | "accepted"
    | "live"
    | "completed"
    | "forfeited"
    | "declined"
    | "cancelled";
  scheduledAt: string;
  createdAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  activityAt: string;
  challengeNote: string | null;
  challenger: ChallengePlayerSurface;
  challenged: ChallengePlayerSurface;
  linkedSessionKey: string | null;
  linkedSessionState: "live" | "completed" | null;
  linkedMapName: string | null;
  linkedWinner: string | null;
  durationSeconds: number | null;
};

export type ChallengeHubSnapshot = {
  viewer: ChallengePlayerSurface | null;
  candidates: ChallengePlayerSurface[];
  scheduledMatches: ScheduledMatchTile[];
  updatedAt: string;
};

const CHALLENGE_PLAYER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  verified: true,
  verificationLevel: true,
  lastSeen: true,
} as const;

const SCHEDULED_MATCH_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  createdAt: true,
  acceptedAt: true,
  declinedAt: true,
  cancelledAt: true,
  challengeNote: true,
  challenger: {
    select: CHALLENGE_PLAYER_SELECT,
  },
  challenged: {
    select: CHALLENGE_PLAYER_SELECT,
  },
} as const;

function normalizeNameKey(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function challengePlayerName(user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName">) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function playerAliases(user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName">) {
  const values = [user.inGameName, user.steamPersonaName, user.uid]
    .map((value) => normalizeNameKey(value))
    .filter(Boolean);

  return Array.from(new Set(values));
}

function playerIsOnline(lastSeen: Date | null) {
  if (!lastSeen) return false;
  return Date.now() - lastSeen.getTime() <= CHALLENGE_ONLINE_WINDOW_MS;
}

function buildPlayerSurface(user: ChallengeUserRow): ChallengePlayerSurface {
  return {
    uid: user.uid,
    href: buildClaimedPlayerHref(user.uid),
    name: challengePlayerName(user),
    inGameName: user.inGameName,
    steamPersonaName: user.steamPersonaName,
    verified: user.verified,
    verificationLevel: user.verificationLevel,
    isOnline: playerIsOnline(user.lastSeen),
  };
}

function readSessionTime(session: Pick<ComparableSession, "updatedAt" | "completedAt">) {
  const raw = session.completedAt || session.updatedAt;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sessionMatchesScheduledPlayers(
  session: ComparableSession,
  challenger: ChallengeUserRow,
  challenged: ChallengeUserRow
) {
  const names = session.players.map((player) => normalizeNameKey(player.name)).filter(Boolean);
  const challengerAliases = playerAliases(challenger);
  const challengedAliases = playerAliases(challenged);

  const includesAlias = (aliases: string[]) => aliases.some((alias) => names.includes(alias));

  return includesAlias(challengerAliases) && includesAlias(challengedAliases);
}

function findLinkedSession(
  sessions: ComparableSession[],
  row: ScheduledMatchRow,
  usedSessionKeys: Set<string>
) {
  const scheduledAt = row.scheduledAt.getTime();
  let bestMatch: ComparableSession | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const session of sessions) {
    if (usedSessionKeys.has(session.sessionKey)) {
      continue;
    }

    const sessionTime = readSessionTime(session);
    if (sessionTime < scheduledAt - SESSION_MATCH_LOOKBACK_MS) continue;
    if (sessionTime > scheduledAt + SESSION_MATCH_LOOKAHEAD_MS) continue;
    if (!sessionMatchesScheduledPlayers(session, row.challenger, row.challenged)) continue;

    const delta = Math.abs(sessionTime - scheduledAt);
    if (delta < bestDelta) {
      bestMatch = session;
      bestDelta = delta;
    }
  }

  return bestMatch;
}

function buildScheduledMatchTile(
  row: ScheduledMatchRow,
  displayState: ScheduledMatchTile["displayState"],
  activityAt: Date,
  linkedSession: ComparableSession | null
): ScheduledMatchTile {
  return {
    id: row.id,
    status:
      row.status === "accepted"
        ? "accepted"
        : row.status === "declined"
          ? "declined"
          : row.status === "cancelled"
            ? "cancelled"
            : "pending",
    displayState,
    scheduledAt: row.scheduledAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    declinedAt: row.declinedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    activityAt: activityAt.toISOString(),
    challengeNote: row.challengeNote ?? null,
    challenger: buildPlayerSurface(row.challenger),
    challenged: buildPlayerSurface(row.challenged),
    linkedSessionKey: linkedSession?.sessionKey ?? null,
    linkedSessionState: linkedSession?.state ?? null,
    linkedMapName: linkedSession?.mapName ?? null,
    linkedWinner: linkedSession?.winner ?? null,
    durationSeconds: linkedSession?.durationSeconds ?? null,
  };
}

function compareScheduledTileOrder(left: ScheduledMatchTile, right: ScheduledMatchTile) {
  const priority = (tile: ScheduledMatchTile) => {
    switch (tile.displayState) {
      case "live":
        return 0;
      case "accepted":
        return 1;
      case "pending":
        return 2;
      case "completed":
        return 3;
      case "forfeited":
        return 4;
      case "declined":
        return 5;
      case "cancelled":
        return 6;
      default:
        return 7;
    }
  };

  if (priority(left) !== priority(right)) {
    return priority(left) - priority(right);
  }

  const leftScheduledAt = new Date(left.scheduledAt).getTime();
  const rightScheduledAt = new Date(right.scheduledAt).getTime();

  if (left.displayState === "pending" || left.displayState === "accepted") {
    return leftScheduledAt - rightScheduledAt;
  }

  return new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime();
}

export function normalizeChallengeNote(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 160);
  return normalized || null;
}

export function parseScheduledMatchDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function loadScheduledMatchRows(
  prisma: PrismaClient,
  options?: {
    viewerUserId?: number | null;
    counterpartUserId?: number | null;
    includeResolved?: boolean;
  }
) {
  const now = Date.now();
  const earliest = new Date(now - CHALLENGE_HISTORY_LOOKBACK_MS);
  const latest = new Date(now + CHALLENGE_LOOKAHEAD_MS);
  const recentResolvedCutoff = new Date(now - CHALLENGE_RECENT_LINGER_MS);
  const statusFilters = [
    {
      status: {
        in: [...ACTIVE_SCHEDULED_STATUSES],
      },
      scheduledAt: {
        gte: earliest,
        lte: latest,
      },
    },
    ...(options?.includeResolved
      ? [
          {
            status: "declined",
            declinedAt: {
              gte: recentResolvedCutoff,
            },
          },
          {
            status: "cancelled",
            cancelledAt: {
              gte: recentResolvedCutoff,
            },
          },
        ]
      : []),
  ];
  const participantFilters =
    options?.viewerUserId && options?.counterpartUserId
      ? [
          {
            OR: [
              {
                challengerUserId: options.viewerUserId,
                challengedUserId: options.counterpartUserId,
              },
              {
                challengerUserId: options.counterpartUserId,
                challengedUserId: options.viewerUserId,
              },
            ],
          },
        ]
      : options?.viewerUserId
        ? [
            {
              OR: [
                { challengerUserId: options.viewerUserId },
                { challengedUserId: options.viewerUserId },
              ],
            },
          ]
        : [];

  return prisma.scheduledMatch.findMany({
    where: {
      AND: [{ OR: statusFilters }, ...participantFilters],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    select: SCHEDULED_MATCH_SELECT,
  });
}

export function deriveScheduledMatchTiles(
  rows: ScheduledMatchRow[],
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[],
  now = new Date()
) {
  const tiles: ScheduledMatchTile[] = [];
  const matchedActiveSessionKeys = new Set<string>();
  const matchedCompletedSessionKeys = new Set<string>();

  for (const row of rows) {
    const scheduledAt = row.scheduledAt.getTime();
    const declinedAt = row.declinedAt;
    const cancelledAt = row.cancelledAt;

    if (row.status === "declined") {
      if (declinedAt && now.getTime() - declinedAt.getTime() <= CHALLENGE_RECENT_LINGER_MS) {
        tiles.push(buildScheduledMatchTile(row, "declined", declinedAt, null));
      }
      continue;
    }

    if (row.status === "cancelled") {
      if (cancelledAt && now.getTime() - cancelledAt.getTime() <= CHALLENGE_RECENT_LINGER_MS) {
        tiles.push(buildScheduledMatchTile(row, "cancelled", cancelledAt, null));
      }
      continue;
    }

    const activeSession =
      row.status === "accepted"
        ? findLinkedSession(activeSessions, row, matchedActiveSessionKeys)
        : null;

    if (activeSession?.sessionKey) {
      matchedActiveSessionKeys.add(activeSession.sessionKey);
      tiles.push(buildScheduledMatchTile(row, "live", new Date(activeSession.updatedAt), activeSession));
      continue;
    }

    const completedSession =
      row.status === "accepted"
        ? findLinkedSession(recentlyCompletedSessions, row, matchedCompletedSessionKeys)
        : null;

    if (completedSession) {
      const completedAt = new Date(completedSession.completedAt || completedSession.updatedAt);
      if (now.getTime() - completedAt.getTime() <= CHALLENGE_RECENT_LINGER_MS) {
        matchedCompletedSessionKeys.add(completedSession.sessionKey);
        tiles.push(buildScheduledMatchTile(row, "completed", completedAt, completedSession));
      }
      continue;
    }

    if (row.status === "accepted") {
      if (now.getTime() >= scheduledAt + CHALLENGE_START_GRACE_MS) {
        const forfeitedAt = new Date(scheduledAt + CHALLENGE_START_GRACE_MS);
        if (now.getTime() - forfeitedAt.getTime() <= CHALLENGE_RECENT_LINGER_MS) {
          tiles.push(buildScheduledMatchTile(row, "forfeited", forfeitedAt, null));
        }
        continue;
      }

      if (now.getTime() >= scheduledAt) {
        tiles.push(buildScheduledMatchTile(row, "live", new Date(scheduledAt), null));
        continue;
      }

      tiles.push(buildScheduledMatchTile(row, "accepted", row.scheduledAt, null));
      continue;
    }

    if (now.getTime() <= scheduledAt + CHALLENGE_RECENT_LINGER_MS) {
      tiles.push(buildScheduledMatchTile(row, "pending", row.scheduledAt, null));
    }
  }

  tiles.sort(compareScheduledTileOrder);

  return {
    tiles,
    matchedActiveSessionKeys,
    matchedCompletedSessionKeys,
  };
}

export async function loadScheduledMatchTilesForLiveBoard(
  prisma: PrismaClient,
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[]
) {
  const rows = await loadScheduledMatchRows(prisma);
  return deriveScheduledMatchTiles(rows, activeSessions, recentlyCompletedSessions);
}

export async function loadChallengeThreadTile(
  prisma: PrismaClient,
  viewerUserId: number,
  counterpartUserId: number
): Promise<ScheduledMatchTile | null> {
  const [rows, sessionSnapshot] = await Promise.all([
    loadScheduledMatchRows(prisma, {
      viewerUserId,
      counterpartUserId,
      includeResolved: true,
    }),
    loadLiveSessionSnapshot(prisma),
  ]);

  const { tiles } = deriveScheduledMatchTiles(
    rows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  return tiles[0] ?? null;
}

export async function loadChallengeHubSnapshot(
  prisma: PrismaClient,
  viewerUid: string | null
): Promise<ChallengeHubSnapshot> {
  if (!viewerUid) {
    return {
      viewer: null,
      candidates: [],
      scheduledMatches: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const viewer = await prisma.user.findUnique({
    where: { uid: viewerUid },
    select: CHALLENGE_PLAYER_SELECT,
  });

  if (!viewer) {
    return {
      viewer: null,
      candidates: [],
      scheduledMatches: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const [candidateRows, scheduledRows, sessionSnapshot] = await Promise.all([
    prisma.user.findMany({
      where: {
        uid: {
          not: viewerUid,
        },
        steamId: {
          not: null,
        },
      },
      select: CHALLENGE_PLAYER_SELECT,
      orderBy: [{ lastSeen: "desc" }, { verificationLevel: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    loadScheduledMatchRows(prisma, { viewerUserId: viewer.id, includeResolved: true }),
    loadLiveSessionSnapshot(prisma),
  ]);

  const { tiles } = deriveScheduledMatchTiles(
    scheduledRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  return {
    viewer: buildPlayerSurface(viewer),
    candidates: candidateRows.map((candidate) => buildPlayerSurface(candidate)),
    scheduledMatches: tiles,
    updatedAt: new Date().toISOString(),
  };
}
