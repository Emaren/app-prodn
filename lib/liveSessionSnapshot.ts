import path from "node:path";

import type { PrismaClient } from "@/lib/generated/prisma";

export type LiveGameSession = {
  id: number;
  sessionKey: string;
  replayHash: string;
  parseIteration: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  playedOn: string | null;
  mapName: string | null;
  durationSeconds: number | null;
  originalFilename: string | null;
  disconnectDetected: boolean;
  winner: string | null;
  state: "live" | "completed";
  players: Array<{
    name: string;
    winner: boolean | null;
  }>;
  uploader:
    | {
        uid: string;
        displayName: string;
      }
    | null;
};

const LIVE_SESSION_FRESHNESS_MS = 12 * 60 * 1000;
export const LIVE_SESSION_LINGER_MS = 15 * 60 * 1000;
const SUPERSEDED_PARSE_REASON = "superseded_by_later_upload";

type SessionRow = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  createdAt: Date;
  timestamp: Date | null;
  played_on: Date | null;
  map: unknown;
  game_duration: number | null;
  winner: string | null;
  players: unknown;
  key_events?: unknown;
  disconnect_detected: boolean;
  parse_reason?: string | null;
  parse_source?: string;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
};

export function normalizeSessionKey(row: {
  original_filename?: string | null;
  replay_file?: string | null;
}) {
  const rawName = row.original_filename?.trim() || path.basename(row.replay_file || "").trim();
  return rawName || row.replay_file || "";
}

function parseMapName(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const name = "name" in value ? value.name : null;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function parsePlayers(value: unknown): LiveGameSession["players"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const name = "name" in entry && typeof entry.name === "string" ? entry.name.trim() : "";
      if (!name) {
        return null;
      }

      const winner =
        "winner" in entry && typeof entry.winner === "boolean" ? entry.winner : null;

      return {
        name,
        winner,
      };
    })
    .filter((entry): entry is LiveGameSession["players"][number] => Boolean(entry));
}

function getRowActivityTime(row: Pick<SessionRow, "timestamp" | "createdAt">) {
  return row.timestamp ?? row.createdAt;
}

function readCompletedSignal(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return (value as Record<string, unknown>).completed === true;
}

function buildSessionFromRow(
  row: SessionRow,
  sessionKey: string,
  state: LiveGameSession["state"]
): LiveGameSession {
  const activityTime = getRowActivityTime(row);
  return {
    id: row.id,
    sessionKey,
    replayHash: row.replayHash,
    parseIteration: row.parse_iteration,
    createdAt: row.createdAt.toISOString(),
    updatedAt: activityTime.toISOString(),
    completedAt: state === "completed" ? activityTime.toISOString() : null,
    playedOn: row.played_on?.toISOString() ?? null,
    mapName: parseMapName(row.map),
    durationSeconds:
      typeof row.game_duration === "number" && Number.isFinite(row.game_duration)
        ? row.game_duration
        : null,
    originalFilename: row.original_filename ?? null,
    disconnectDetected: row.disconnect_detected,
    winner: row.winner ?? null,
    state,
    players: parsePlayers(row.players),
    uploader: row.user
      ? {
          uid: row.user.uid,
          displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
        }
      : null,
  };
}

export async function loadLiveSessionSnapshot(prisma: PrismaClient): Promise<{
  activeSessions: LiveGameSession[];
  recentlyCompletedSessions: LiveGameSession[];
}> {
  const freshnessCutoff = new Date(Date.now() - LIVE_SESSION_FRESHNESS_MS);
  const lingerCutoff = Date.now() - LIVE_SESSION_LINGER_MS;

  const [activeRows, finalRows] = await Promise.all([
    prisma.gameStats.findMany({
      where: {
        is_final: false,
        parse_iteration: {
          gt: 0,
        },
        OR: [
          {
            timestamp: {
              gte: freshnessCutoff,
            },
          },
          {
            createdAt: {
              gte: freshnessCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: SUPERSEDED_PARSE_REASON,
        },
      },
      orderBy: [{ createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      take: 48,
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        key_events: true,
        disconnect_detected: true,
        parse_reason: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.gameStats.findMany({
      where: {
        is_final: true,
        OR: [
          {
            timestamp: {
              gte: freshnessCutoff,
            },
          },
          {
            createdAt: {
              gte: freshnessCutoff,
            },
          },
        ],
        NOT: {
          parse_reason: SUPERSEDED_PARSE_REASON,
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 96,
      select: {
        id: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        parse_iteration: true,
        createdAt: true,
        timestamp: true,
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        disconnect_detected: true,
        parse_source: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
  ]);

  const latestLiveBySession = new Map<string, (typeof activeRows)[number]>();
  for (const row of activeRows) {
    const sessionKey = normalizeSessionKey(row);
    const existing = latestLiveBySession.get(sessionKey);
    if (
      !existing ||
      getRowActivityTime(row).getTime() > getRowActivityTime(existing).getTime() ||
      (
        getRowActivityTime(row).getTime() === getRowActivityTime(existing).getTime() &&
        row.parse_iteration > existing.parse_iteration
      )
    ) {
      latestLiveBySession.set(sessionKey, row);
    }
  }

  const latestFinalBySession = new Map<string, (typeof finalRows)[number]>();
  for (const row of finalRows) {
    const sessionKey = normalizeSessionKey(row);
    const existing = latestFinalBySession.get(sessionKey);
    if (
      !existing ||
      getRowActivityTime(row).getTime() > getRowActivityTime(existing).getTime() ||
      (
        getRowActivityTime(row).getTime() === getRowActivityTime(existing).getTime() &&
        row.parse_iteration > existing.parse_iteration
      )
    ) {
      latestFinalBySession.set(sessionKey, row);
    }
  }

  const activeSessions: LiveGameSession[] = [];
  const recentlyCompletedSessions: LiveGameSession[] = [];

  for (const [sessionKey, row] of latestLiveBySession.entries()) {
    const finalRow = latestFinalBySession.get(sessionKey);
    const liveActivityAt = getRowActivityTime(row).getTime();
    const liveCompleted = readCompletedSignal(row.key_events);

    if (finalRow) {
      const finalActivityAt = getRowActivityTime(finalRow).getTime();
      if (finalActivityAt >= liveActivityAt) {
        if (finalActivityAt >= lingerCutoff) {
          recentlyCompletedSessions.push(buildSessionFromRow(finalRow, sessionKey, "completed"));
        }
        continue;
      }
    }

    if (liveCompleted) {
      if (liveActivityAt >= lingerCutoff) {
        recentlyCompletedSessions.push(buildSessionFromRow(row, sessionKey, "completed"));
      }
      continue;
    }

    activeSessions.push(buildSessionFromRow(row, sessionKey, "live"));
  }

  for (const [sessionKey, row] of latestFinalBySession.entries()) {
    if (latestLiveBySession.has(sessionKey)) {
      continue;
    }
    if (getRowActivityTime(row).getTime() < lingerCutoff) {
      continue;
    }
    recentlyCompletedSessions.push(buildSessionFromRow(row, sessionKey, "completed"));
  }

  activeSessions.sort((left, right) => {
    const leftActivityAt = new Date(left.updatedAt).getTime();
    const rightActivityAt = new Date(right.updatedAt).getTime();
    return rightActivityAt - leftActivityAt;
  });

  recentlyCompletedSessions.sort(
    (left, right) =>
      new Date(right.completedAt || right.createdAt).getTime() -
      new Date(left.completedAt || left.createdAt).getTime()
  );

  return {
    activeSessions,
    recentlyCompletedSessions,
  };
}
