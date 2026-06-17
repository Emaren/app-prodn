import path from "node:path";

import type { PrismaClient } from "@/lib/generated/prisma";

export type LiveGameSession = {
  id: number;
  sessionKey: string;
  replayFile: string | null;
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
  uploaders: Array<{
    uid: string;
    displayName: string;
    parseRows: number;
    lastSeenAt: string;
  }>;
  watcherCount: number;
  parseRows: number;
  coverageLevel: "unknown" | "single" | "dual" | "stacked";
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
const UNPARSED_FINAL_PARSE_REASON = "watcher_final_unparsed";

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
  key_events?: unknown;
}) {
  const keyEvents = readKeyEvents(row.key_events);
  const platformMatchId =
    typeof keyEvents.platform_match_id === "string" ? keyEvents.platform_match_id.trim() : "";
  if (platformMatchId) {
    return `platform:${platformMatchId}`;
  }

  const rawName = row.original_filename?.trim() || path.basename(row.replay_file || "").trim();
  return rawName || row.replay_file || "";
}

function readKeyEvents(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
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

function collectUploaders(rows: SessionRow[]) {
  const uploaders = new Map<
    string,
    {
      uid: string;
      displayName: string;
      parseRows: number;
      lastSeenAt: Date;
    }
  >();

  for (const row of rows) {
    if (!row.user) continue;

    const activityTime = getRowActivityTime(row);
    const existing = uploaders.get(row.user.uid);
    if (!existing) {
      uploaders.set(row.user.uid, {
        uid: row.user.uid,
        displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
        parseRows: 1,
        lastSeenAt: activityTime,
      });
      continue;
    }

    existing.parseRows += 1;
    if (activityTime > existing.lastSeenAt) {
      existing.lastSeenAt = activityTime;
    }
  }

  return Array.from(uploaders.values())
    .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
    .map((uploader) => ({
      uid: uploader.uid,
      displayName: uploader.displayName,
      parseRows: uploader.parseRows,
      lastSeenAt: uploader.lastSeenAt.toISOString(),
    }));
}

function coverageLevel(watcherCount: number): LiveGameSession["coverageLevel"] {
  if (watcherCount >= 3) return "stacked";
  if (watcherCount === 2) return "dual";
  if (watcherCount === 1) return "single";
  return "unknown";
}

function buildSessionFromRow(
  row: SessionRow,
  sessionKey: string,
  state: LiveGameSession["state"],
  sourceRows: SessionRow[] = [row]
): LiveGameSession {
  const activityTime = getRowActivityTime(row);
  const uploaders = collectUploaders(sourceRows);
  const primaryUploader = uploaders[0] ?? null;
  return {
    id: row.id,
    sessionKey,
    replayFile: row.replay_file ?? null,
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
    uploaders,
    watcherCount: uploaders.length,
    parseRows: sourceRows.length,
    coverageLevel: coverageLevel(uploaders.length),
    uploader: primaryUploader
      ? {
          uid: primaryUploader.uid,
          displayName: primaryUploader.displayName,
        }
      : row.user
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
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
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
          parse_reason: {
            in: [SUPERSEDED_PARSE_REASON, UNPARSED_FINAL_PARSE_REASON],
          },
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
        key_events: true,
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
  const liveRowsBySession = new Map<string, (typeof activeRows)>();
  for (const row of activeRows) {
    const sessionKey = normalizeSessionKey(row);
    const rows = liveRowsBySession.get(sessionKey) ?? [];
    rows.push(row);
    liveRowsBySession.set(sessionKey, rows);

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
  const finalRowsBySession = new Map<string, (typeof finalRows)>();
  for (const row of finalRows) {
    const sessionKey = normalizeSessionKey(row);
    const rows = finalRowsBySession.get(sessionKey) ?? [];
    rows.push(row);
    finalRowsBySession.set(sessionKey, rows);

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

    if (finalRow) {
      const finalActivityAt = getRowActivityTime(finalRow).getTime();
      if (finalActivityAt >= liveActivityAt) {
        if (finalActivityAt >= lingerCutoff) {
          recentlyCompletedSessions.push(
            buildSessionFromRow(
              finalRow,
              sessionKey,
              "completed",
              finalRowsBySession.get(sessionKey) ?? [finalRow]
            )
          );
        }
        continue;
      }
    }

    activeSessions.push(
      buildSessionFromRow(row, sessionKey, "live", liveRowsBySession.get(sessionKey) ?? [row])
    );
  }

  for (const [sessionKey, row] of latestFinalBySession.entries()) {
    if (latestLiveBySession.has(sessionKey)) {
      continue;
    }
    if (getRowActivityTime(row).getTime() < lingerCutoff) {
      continue;
    }
    recentlyCompletedSessions.push(
      buildSessionFromRow(row, sessionKey, "completed", finalRowsBySession.get(sessionKey) ?? [row])
    );
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
