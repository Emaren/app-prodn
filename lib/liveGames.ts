import path from "node:path";

import { PrismaClient } from "@/lib/generated/prisma";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getFeaturedTournament } from "@/lib/communityStore";
import { type LobbyMatchRow, type LobbyTournamentMatch } from "@/lib/lobby";

export type LiveGamesSummary = {
  liveCount: number;
  readyCount: number;
  updatedAt: string;
};

export type LiveGamesSnapshot = LiveGamesSummary & {
  tournament: {
    title: string;
    slug: string;
    format: string;
    status: string;
  } | null;
  activeSessions: LiveGameSession[];
  recentlyCompletedSessions: LiveGameSession[];
  liveMatches: LobbyTournamentMatch[];
  readyMatches: LobbyTournamentMatch[];
  recentMatches: LobbyMatchRow[];
};

export type LiveGameSession = {
  id: number;
  sessionKey: string;
  replayHash: string;
  parseIteration: number;
  createdAt: string;
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
const LIVE_SESSION_LINGER_MS = 60 * 1000;

function normalizeSessionKey(row: {
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

type SessionRow = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  createdAt: Date;
  played_on: Date | null;
  map: unknown;
  game_duration: number | null;
  winner: string | null;
  players: unknown;
  disconnect_detected: boolean;
  parse_source?: string;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
};

function buildSessionFromRow(
  row: SessionRow,
  sessionKey: string,
  state: LiveGameSession["state"]
): LiveGameSession {
  return {
    id: row.id,
    sessionKey,
    replayHash: row.replayHash,
    parseIteration: row.parse_iteration,
    createdAt: row.createdAt.toISOString(),
    completedAt: state === "completed" ? row.createdAt.toISOString() : null,
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

async function loadSessionSnapshot(prisma: PrismaClient): Promise<{
  activeSessions: LiveGameSession[];
  recentlyCompletedSessions: LiveGameSession[];
}> {
  const freshnessCutoff = new Date(Date.now() - LIVE_SESSION_FRESHNESS_MS);
  const lingerCutoff = Date.now() - LIVE_SESSION_LINGER_MS;

  const [activeRows, finalRows] = await Promise.all([
    prisma.gameStats.findMany({
      where: {
        is_final: false,
        createdAt: {
          gte: freshnessCutoff,
        },
        parse_iteration: {
          gt: 0,
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
        played_on: true,
        map: true,
        game_duration: true,
        winner: true,
        players: true,
        disconnect_detected: true,
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
        createdAt: {
          gte: freshnessCutoff,
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
    if (!latestLiveBySession.has(sessionKey)) {
      latestLiveBySession.set(sessionKey, row);
    }
  }

  const latestFinalBySession = new Map<string, (typeof finalRows)[number]>();
  for (const row of finalRows) {
    const sessionKey = normalizeSessionKey(row);
    if (!latestFinalBySession.has(sessionKey)) {
      latestFinalBySession.set(sessionKey, row);
    }
  }

  const activeSessions: LiveGameSession[] = [];
  const recentlyCompletedSessions: LiveGameSession[] = [];

  for (const [sessionKey, row] of latestLiveBySession.entries()) {
    const finalRow = latestFinalBySession.get(sessionKey);
    if (finalRow) {
      if (finalRow.createdAt.getTime() >= lingerCutoff) {
        recentlyCompletedSessions.push(buildSessionFromRow(finalRow, sessionKey, "completed"));
      }
      continue;
    }

    activeSessions.push(buildSessionFromRow(row, sessionKey, "live"));
  }

  for (const [sessionKey, row] of latestFinalBySession.entries()) {
    if (latestLiveBySession.has(sessionKey)) {
      continue;
    }
    if (!String(row.parse_source || "").startsWith("watcher")) {
      continue;
    }
    if (row.createdAt.getTime() < lingerCutoff) {
      continue;
    }
    recentlyCompletedSessions.push(buildSessionFromRow(row, sessionKey, "completed"));
  }

  activeSessions.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
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

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 12) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for live games:", error);
    return [];
  }
}

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const [tournament, recentMatches, sessionSnapshot] = await Promise.all([
    getFeaturedTournament(prisma),
    loadRecentMatches(),
    loadSessionSnapshot(prisma),
  ]);

  const { activeSessions, recentlyCompletedSessions } = sessionSnapshot;
  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");
  const recentlyCompletedKeys = new Set(recentlyCompletedSessions.map((session) => session.sessionKey));
  const filteredRecentMatches = recentMatches
    .filter((match) => !recentlyCompletedKeys.has(normalizeSessionKey(match)))
    .slice(0, 8);

  return {
    liveCount: liveMatches.length + activeSessions.length,
    readyCount: readyMatches.length,
    updatedAt: new Date().toISOString(),
    tournament: tournament.isFallback
      ? null
      : {
          title: tournament.title,
          slug: tournament.slug,
          format: tournament.format,
          status: tournament.status,
        },
    activeSessions,
    recentlyCompletedSessions,
    liveMatches,
    readyMatches,
    recentMatches: filteredRecentMatches,
  };
}
