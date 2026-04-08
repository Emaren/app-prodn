
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
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
const CHALLENGE_LEDGER_LOOKBACK_MS = 45 * 24 * 60 * 60 * 1000;
const CHALLENGE_ACTIVITY_LIMIT = 40;
const ACTIVE_SCHEDULED_STATUSES = ["pending", "accepted"] as const;
const RESULT_SCHEDULED_STATUSES = ["completed", "forfeited"] as const;

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
  resultAt: Date | null;
  linkedSessionKey: string | null;
  linkedMapName: string | null;
  linkedWinner: string | null;
  linkedDurationSeconds: number | null;
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
  status:
    | "pending"
    | "accepted"
    | "declined"
    | "cancelled"
    | "completed"
    | "forfeited";
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

export type ChallengeActivityItem = {
  id: number;
  scheduledMatchId: number;
  eventType: string;
  detail: string | null;
  actorUid: string | null;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type ChallengeActivityRow = {
  id: number;
  scheduledMatchId: number;
  eventType: string;
  detail: string | null;
  createdAt: Date;
  metadata: unknown;
  actor: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName"> | null;
};

export type ChallengeRecordSummary = {
  wins: number;
  losses: number;
  pending: number;
  accepted: number;
  declined: number;
  cancelled: number;
  completed: number;
  forfeited: number;
  total: number;
};

export type ChallengeHubSnapshot = {
  viewer: ChallengePlayerSurface | null;
  candidates: ChallengePlayerSurface[];
  scheduledMatches: ScheduledMatchTile[];
  historyMatches: ScheduledMatchTile[];
  activities: ChallengeActivityItem[];
  record: ChallengeRecordSummary;
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
  resultAt: true,
  linkedSessionKey: true,
  linkedMapName: true,
  linkedWinner: true,
  linkedDurationSeconds: true,
  challengeNote: true,
  challenger: {
    select: CHALLENGE_PLAYER_SELECT,
  },
  challenged: {
    select: CHALLENGE_PLAYER_SELECT,
  },
} as const;

function emptyChallengeRecord(): ChallengeRecordSummary {
  return {
    wins: 0,
    losses: 0,
    pending: 0,
    accepted: 0,
    declined: 0,
    cancelled: 0,
    completed: 0,
    forfeited: 0,
    total: 0,
  };
}

function normalizeNameKey(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function challengePlayerName(
  user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName">
) {
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

function challengeActivityActorName(
  user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName"> | null
) {
  if (!user) return null;
  return user.inGameName || user.steamPersonaName || user.uid;
}

function normalizeActivityMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function buildChallengeActivityItem(row: ChallengeActivityRow): ChallengeActivityItem {
  return {
    id: row.id,
    scheduledMatchId: row.scheduledMatchId,
    eventType: row.eventType,
    detail: row.detail ?? null,
    actorUid: row.actor?.uid ?? null,
    actorName: challengeActivityActorName(row.actor),
    createdAt: row.createdAt.toISOString(),
    metadata: normalizeActivityMetadata(row.metadata),
  };
}

async function loadPersistedChallengeActivityRows(
  prisma: PrismaClient,
  scheduledMatchIds: number[]
): Promise<ChallengeActivityItem[]> {
  if (scheduledMatchIds.length === 0) {
    return [];
  }

  const rows = await prisma.scheduledMatchActivity.findMany({
    where: {
      scheduledMatchId: {
        in: scheduledMatchIds,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: CHALLENGE_ACTIVITY_LIMIT,
    select: {
      id: true,
      scheduledMatchId: true,
      eventType: true,
      detail: true,
      createdAt: true,
      metadata: true,
      actor: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
    },
  });

  return rows.map((row) =>
    buildChallengeActivityItem({
      ...row,
      actor: row.actor,
    })
  );
}

function buildSyntheticChallengeActivities(rows: ScheduledMatchRow[]): ChallengeActivityItem[] {
  const items: ChallengeActivityItem[] = [];

  for (const row of rows) {
    items.push({
      id: row.id * 10_000 + 1,
      scheduledMatchId: row.id,
      eventType: "scheduled",
      detail: row.challengeNote
        ? `Scheduled for ${row.challenger.inGameName || row.challenger.steamPersonaName || row.challenger.uid} vs ${row.challenged.inGameName || row.challenged.steamPersonaName || row.challenged.uid}. Note: ${row.challengeNote}`
        : `Scheduled for ${row.challenger.inGameName || row.challenger.steamPersonaName || row.challenger.uid} vs ${row.challenged.inGameName || row.challenged.steamPersonaName || row.challenged.uid}.`,
      actorUid: row.challenger.uid,
      actorName: challengePlayerName(row.challenger),
      createdAt: row.createdAt.toISOString(),
      metadata: {
        scheduledAt: row.scheduledAt.toISOString(),
      },
    });

    if (row.acceptedAt) {
      items.push({
        id: row.id * 10_000 + 2,
        scheduledMatchId: row.id,
        eventType: "accepted",
        detail: `Accepted for ${row.scheduledAt.toLocaleString()}.`,
        actorUid: row.challenged.uid,
        actorName: challengePlayerName(row.challenged),
        createdAt: row.acceptedAt.toISOString(),
        metadata: null,
      });
    }

    if (row.declinedAt) {
      items.push({
        id: row.id * 10_000 + 3,
        scheduledMatchId: row.id,
        eventType: "declined",
        detail: "Challenge declined.",
        actorUid: row.challenged.uid,
        actorName: challengePlayerName(row.challenged),
        createdAt: row.declinedAt.toISOString(),
        metadata: null,
      });
    }

    if (row.cancelledAt) {
      items.push({
        id: row.id * 10_000 + 4,
        scheduledMatchId: row.id,
        eventType: "cancelled",
        detail: "Challenge cancelled.",
        actorUid: null,
        actorName: null,
        createdAt: row.cancelledAt.toISOString(),
        metadata: null,
      });
    }

    if (row.resultAt && row.status === "completed") {
      items.push({
        id: row.id * 10_000 + 5,
        scheduledMatchId: row.id,
        eventType: "completed",
        detail: row.linkedWinner
          ? `Completed. Winner: ${row.linkedWinner}.`
          : "Completed and stored.",
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: row.linkedMapName
          ? { mapName: row.linkedMapName, linkedSessionKey: row.linkedSessionKey }
          : row.linkedSessionKey
            ? { linkedSessionKey: row.linkedSessionKey }
            : null,
      });
    }

    if (row.resultAt && row.status === "forfeited") {
      items.push({
        id: row.id * 10_000 + 6,
        scheduledMatchId: row.id,
        eventType: "forfeited",
        detail: "Marked forfeited after the start grace window passed.",
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: null,
      });
    }
  }

  items.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

  return items.slice(0, CHALLENGE_ACTIVITY_LIMIT);
}

async function loadChallengeActivityRows(
  prisma: PrismaClient,
  rows: ScheduledMatchRow[]
): Promise<ChallengeActivityItem[]> {
  const scheduledMatchIds = rows.map((row) => row.id);
  const persisted = await loadPersistedChallengeActivityRows(prisma, scheduledMatchIds);
  const synthetic = buildSyntheticChallengeActivities(rows);

  const merged = new Map<string, ChallengeActivityItem>();

  for (const item of [...persisted, ...synthetic]) {
    const key = `${item.scheduledMatchId}:${item.eventType}:${item.createdAt}`;
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values())
    .sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    )
    .slice(0, CHALLENGE_ACTIVITY_LIMIT);
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
            : row.status === "completed"
              ? "completed"
              : row.status === "forfeited"
                ? "forfeited"
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
    linkedSessionKey: linkedSession?.sessionKey ?? row.linkedSessionKey ?? null,
    linkedSessionState:
      linkedSession?.state ?? (row.status === "completed" ? "completed" : null),
    linkedMapName: linkedSession?.mapName ?? row.linkedMapName ?? null,
    linkedWinner: linkedSession?.winner ?? row.linkedWinner ?? null,
    durationSeconds: linkedSession?.durationSeconds ?? row.linkedDurationSeconds ?? null,
  };
}

function rowAlreadyFinalized(row: ScheduledMatchRow) {
  return (
    RESULT_SCHEDULED_STATUSES.includes(row.status as (typeof RESULT_SCHEDULED_STATUSES)[number]) &&
    row.resultAt !== null
  );
}

function rowsMatchLinkedSession(row: ScheduledMatchRow, session: ComparableSession | null) {
  if (!session) {
    return (
      row.linkedSessionKey === null &&
      row.linkedMapName === null &&
      row.linkedWinner === null &&
      row.linkedDurationSeconds === null
    );
  }

  return (
    row.linkedSessionKey === session.sessionKey &&
    row.linkedMapName === (session.mapName ?? null) &&
    row.linkedWinner === (session.winner ?? null) &&
    row.linkedDurationSeconds === (session.durationSeconds ?? null)
  );
}

async function persistScheduledMatchResults(
  prisma: PrismaClient,
  rows: ScheduledMatchRow[],
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[],
  now = new Date()
) {
  const updatedRows: ScheduledMatchRow[] = [];
  const matchedActiveSessionKeys = new Set<string>();
  const matchedCompletedSessionKeys = new Set<string>();

  for (const row of rows) {
    if (row.status !== "accepted" || rowAlreadyFinalized(row)) {
      updatedRows.push(row);
      continue;
    }

    const completedSession = findLinkedSession(
      recentlyCompletedSessions,
      row,
      matchedCompletedSessionKeys
    );

    if (completedSession) {
      matchedCompletedSessionKeys.add(completedSession.sessionKey);
      const completedAt = new Date(completedSession.completedAt || completedSession.updatedAt);
      const nextRow = {
        ...row,
        status: "completed",
        resultAt: completedAt,
        linkedSessionKey: completedSession.sessionKey,
        linkedMapName: completedSession.mapName ?? null,
        linkedWinner: completedSession.winner ?? null,
        linkedDurationSeconds: completedSession.durationSeconds ?? null,
      } satisfies ScheduledMatchRow;

      await prisma.scheduledMatch.update({
        where: { id: row.id },
        data: {
          status: "completed",
          resultAt: completedAt,
          linkedSessionKey: completedSession.sessionKey,
          linkedMapName: completedSession.mapName,
          linkedWinner: completedSession.winner,
          linkedDurationSeconds: completedSession.durationSeconds,
        },
      });

      updatedRows.push(nextRow);
      continue;
    }

    const activeSession = findLinkedSession(activeSessions, row, matchedActiveSessionKeys);

    if (activeSession) {
      matchedActiveSessionKeys.add(activeSession.sessionKey);
      if (!rowsMatchLinkedSession(row, activeSession)) {
        await prisma.scheduledMatch.update({
          where: { id: row.id },
          data: {
            linkedSessionKey: activeSession.sessionKey,
            linkedMapName: activeSession.mapName,
            linkedWinner: activeSession.winner,
            linkedDurationSeconds: activeSession.durationSeconds,
          },
        });
      }

      updatedRows.push({
        ...row,
        linkedSessionKey: activeSession.sessionKey,
        linkedMapName: activeSession.mapName ?? null,
        linkedWinner: activeSession.winner ?? null,
        linkedDurationSeconds: activeSession.durationSeconds ?? null,
      });
      continue;
    }

    const forfeitedAt = new Date(row.scheduledAt.getTime() + CHALLENGE_START_GRACE_MS);
    if (now.getTime() >= forfeitedAt.getTime()) {
      const nextRow = {
        ...row,
        status: "forfeited",
        resultAt: forfeitedAt,
        linkedSessionKey: null,
        linkedMapName: null,
        linkedWinner: null,
        linkedDurationSeconds: null,
      } satisfies ScheduledMatchRow;

      await prisma.scheduledMatch.update({
        where: { id: row.id },
        data: {
          status: "forfeited",
          resultAt: forfeitedAt,
          linkedSessionKey: null,
          linkedMapName: null,
          linkedWinner: null,
          linkedDurationSeconds: null,
        },
      });

      updatedRows.push(nextRow);
      continue;
    }

    updatedRows.push(row);
  }

  return updatedRows;
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

function compareHistoryTileOrder(left: ScheduledMatchTile, right: ScheduledMatchTile) {
  return new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime();
}

export function normalizeChallengeNote(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, CHALLENGE_NOTE_MAX_CHARS);
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
    {
      status: "completed",
      resultAt: {
        gte: recentResolvedCutoff,
      },
    },
    {
      status: "forfeited",
      resultAt: {
        gte: recentResolvedCutoff,
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

async function loadChallengeHistoryRows(
  prisma: PrismaClient,
  viewerUserId: number
) {
  const lookbackCutoff = new Date(Date.now() - CHALLENGE_LEDGER_LOOKBACK_MS);

  return prisma.scheduledMatch.findMany({
    where: {
      AND: [
        {
          OR: [
            { challengerUserId: viewerUserId },
            { challengedUserId: viewerUserId },
          ],
        },
        {
          OR: [
            { createdAt: { gte: lookbackCutoff } },
            { scheduledAt: { gte: lookbackCutoff } },
            { acceptedAt: { gte: lookbackCutoff } },
            { declinedAt: { gte: lookbackCutoff } },
            { cancelledAt: { gte: lookbackCutoff } },
            { resultAt: { gte: lookbackCutoff } },
          ],
        },
      ],
    },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 120,
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
    const resultAt = row.resultAt;

    if (row.status === "completed") {
      if (resultAt && now.getTime() - resultAt.getTime() <= CHALLENGE_RECENT_LINGER_MS) {
        tiles.push(buildScheduledMatchTile(row, "completed", resultAt, null));
      }
      continue;
    }

    if (row.status === "forfeited") {
      if (resultAt && now.getTime() - resultAt.getTime() <= CHALLENGE_RECENT_LINGER_MS) {
        tiles.push(buildScheduledMatchTile(row, "forfeited", resultAt, null));
      }
      continue;
    }

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

function deriveChallengeHistoryTiles(
  rows: ScheduledMatchRow[],
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[],
  excludedIds: Set<number>,
  now = new Date()
) {
  const tiles: ScheduledMatchTile[] = [];
  const matchedActiveSessionKeys = new Set<string>();
  const matchedCompletedSessionKeys = new Set<string>();

  for (const row of rows) {
    if (excludedIds.has(row.id)) {
      continue;
    }

    const scheduledAt = row.scheduledAt.getTime();

    if (row.status === "completed") {
      tiles.push(
        buildScheduledMatchTile(
          row,
          "completed",
          row.resultAt ?? row.createdAt,
          null
        )
      );
      continue;
    }

    if (row.status === "forfeited") {
      tiles.push(
        buildScheduledMatchTile(
          row,
          "forfeited",
          row.resultAt ?? row.createdAt,
          null
        )
      );
      continue;
    }

    if (row.status === "declined") {
      tiles.push(
        buildScheduledMatchTile(
          row,
          "declined",
          row.declinedAt ?? row.createdAt,
          null
        )
      );
      continue;
    }

    if (row.status === "cancelled") {
      tiles.push(
        buildScheduledMatchTile(
          row,
          "cancelled",
          row.cancelledAt ?? row.createdAt,
          null
        )
      );
      continue;
    }

    const activeSession =
      row.status === "accepted"
        ? findLinkedSession(activeSessions, row, matchedActiveSessionKeys)
        : null;

    if (activeSession?.sessionKey) {
      matchedActiveSessionKeys.add(activeSession.sessionKey);
      continue;
    }

    const completedSession =
      row.status === "accepted"
        ? findLinkedSession(recentlyCompletedSessions, row, matchedCompletedSessionKeys)
        : null;

    if (completedSession) {
      matchedCompletedSessionKeys.add(completedSession.sessionKey);
      const completedAt = new Date(completedSession.completedAt || completedSession.updatedAt);
      tiles.push(buildScheduledMatchTile(row, "completed", completedAt, completedSession));
      continue;
    }

    if (row.status === "accepted") {
      if (now.getTime() >= scheduledAt + CHALLENGE_START_GRACE_MS) {
        const forfeitedAt = new Date(scheduledAt + CHALLENGE_START_GRACE_MS);
        tiles.push(buildScheduledMatchTile(row, "forfeited", forfeitedAt, null));
      }
      continue;
    }

    tiles.push(
      buildScheduledMatchTile(
        row,
        "pending",
        row.scheduledAt > row.createdAt ? row.scheduledAt : row.createdAt,
        null
      )
    );
  }

  tiles.sort(compareHistoryTileOrder);

  return tiles;
}

function buildChallengeRecordSummary(
  rows: ScheduledMatchRow[],
  viewer: Pick<ChallengeUserRow, "id" | "uid" | "inGameName" | "steamPersonaName">
): ChallengeRecordSummary {
  const summary = emptyChallengeRecord();
  const aliases = new Set(playerAliases(viewer));

  for (const row of rows) {
    summary.total += 1;

    switch (row.status) {
      case "pending":
        summary.pending += 1;
        break;
      case "accepted":
        summary.accepted += 1;
        break;
      case "declined":
        summary.declined += 1;
        break;
      case "cancelled":
        summary.cancelled += 1;
        break;
      case "completed":
        summary.completed += 1;
        if (row.linkedWinner && aliases.has(normalizeNameKey(row.linkedWinner))) {
          summary.wins += 1;
        } else if (row.linkedWinner) {
          summary.losses += 1;
        }
        break;
      case "forfeited":
        summary.forfeited += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

export async function loadScheduledMatchTilesForLiveBoard(
  prisma: PrismaClient,
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[]
) {
  const rows = await loadScheduledMatchRows(prisma);
  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    rows,
    activeSessions,
    recentlyCompletedSessions
  );
  return deriveScheduledMatchTiles(reconciledRows, activeSessions, recentlyCompletedSessions);
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
    await persistScheduledMatchResults(
      prisma,
      rows,
      sessionSnapshot.activeSessions,
      sessionSnapshot.recentlyCompletedSessions
    ),
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
      historyMatches: [],
      activities: [],
      record: emptyChallengeRecord(),
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
      historyMatches: [],
      activities: [],
      record: emptyChallengeRecord(),
      updatedAt: new Date().toISOString(),
    };
  }

  const [candidateRows, historyRows, sessionSnapshot] = await Promise.all([
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
    loadChallengeHistoryRows(prisma, viewer.id),
    loadLiveSessionSnapshot(prisma),
  ]);

  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    historyRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  const { tiles } = deriveScheduledMatchTiles(
    reconciledRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  const historyMatches = deriveChallengeHistoryTiles(
    reconciledRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions,
    new Set(tiles.map((tile) => tile.id))
  );

  const activities = await loadChallengeActivityRows(prisma, reconciledRows);
  const record = buildChallengeRecordSummary(reconciledRows, viewer);

  return {
    viewer: buildPlayerSurface(viewer),
    candidates: candidateRows.map((candidate) => buildPlayerSurface(candidate)),
    scheduledMatches: tiles,
    historyMatches,
    activities,
    record,
    updatedAt: new Date().toISOString(),
  };
}
