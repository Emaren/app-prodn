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
  playedOn: string | null;
  mapName: string | null;
  durationSeconds: number | null;
  originalFilename: string | null;
  disconnectDetected: boolean;
  winner: string | null;
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

function normalizeSessionKey(row: {
  original_filename: string | null;
  replay_file: string;
}) {
  const rawName = row.original_filename?.trim() || path.basename(row.replay_file || "").trim();
  return rawName || row.replay_file;
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

async function loadActiveSessions(prisma: PrismaClient): Promise<LiveGameSession[]> {
  const freshnessCutoff = new Date(Date.now() - LIVE_SESSION_FRESHNESS_MS);
  const activeRows = await prisma.gameStats.findMany({
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
  });

  if (activeRows.length === 0) {
    return [];
  }

  const latestBySession = new Map<string, (typeof activeRows)[number]>();
  for (const row of activeRows) {
    const sessionKey = normalizeSessionKey(row);
    if (!latestBySession.has(sessionKey)) {
      latestBySession.set(sessionKey, row);
    }
  }

  const finalRows = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      createdAt: {
        gte: freshnessCutoff,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 96,
    select: {
      replay_file: true,
      original_filename: true,
      createdAt: true,
    },
  });

  const latestFinalBySession = new Map<string, Date>();
  for (const row of finalRows) {
    const sessionKey = normalizeSessionKey(row);
    if (!latestBySession.has(sessionKey)) {
      continue;
    }
    if (!latestFinalBySession.has(sessionKey)) {
      latestFinalBySession.set(sessionKey, row.createdAt);
    }
  }

  return Array.from(latestBySession.entries())
    .filter(([, row]) => {
      const sessionKey = normalizeSessionKey(row);
      const finalAt = latestFinalBySession.get(sessionKey);
      return !finalAt || finalAt.getTime() < row.createdAt.getTime();
    })
    .map(([sessionKey, row]) => ({
      id: row.id,
      sessionKey,
      replayHash: row.replayHash,
      parseIteration: row.parse_iteration,
      createdAt: row.createdAt.toISOString(),
      playedOn: row.played_on?.toISOString() ?? null,
      mapName: parseMapName(row.map),
      durationSeconds:
        typeof row.game_duration === "number" && Number.isFinite(row.game_duration)
          ? row.game_duration
          : null,
      originalFilename: row.original_filename ?? null,
      disconnectDetected: row.disconnect_detected,
      winner: row.winner ?? null,
      players: parsePlayers(row.players),
      uploader: row.user
        ? {
            uid: row.user.uid,
            displayName: row.user.inGameName || row.user.steamPersonaName || row.user.uid,
          }
        : null,
    }))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 8) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for live games:", error);
    return [];
  }
}

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const [tournament, recentMatches, activeSessions] = await Promise.all([
    getFeaturedTournament(prisma),
    loadRecentMatches(),
    loadActiveSessions(prisma),
  ]);

  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");

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
    liveMatches,
    readyMatches,
    recentMatches,
  };
}
