import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { type ScheduledMatchTile, loadScheduledMatchTilesForLiveBoard } from "@/lib/challenges";
import { getFeaturedTournament } from "@/lib/communityStore";
import { type PrismaClient } from "@/lib/generated/prisma";
import { type LobbyMatchRow, type LobbyTournamentMatch } from "@/lib/lobby";
import {
  type LiveGameSession,
  loadLiveSessionSnapshot,
  normalizeSessionKey,
} from "@/lib/liveSessionSnapshot";

export type LiveGamesSummary = {
  liveCount: number;
  readyCount: number;
  onDeckCount: number;
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
  scheduledMatches: ScheduledMatchTile[];
  recentMatches: LobbyMatchRow[];
};

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 24) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for live games:", error);
    return [];
  }
}

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const [tournament, recentMatches, sessionSnapshot] = await Promise.all([
    getFeaturedTournament(prisma),
    loadRecentMatches(),
    loadLiveSessionSnapshot(prisma),
  ]);

  const { activeSessions, recentlyCompletedSessions } = sessionSnapshot;
  const { tiles: scheduledMatches, matchedActiveSessionKeys, matchedCompletedSessionKeys } =
    await loadScheduledMatchTilesForLiveBoard(prisma, activeSessions, recentlyCompletedSessions);

  const filteredActiveSessions = activeSessions.filter(
    (session) => !matchedActiveSessionKeys.has(session.sessionKey)
  );
  const filteredCompletedSessions = recentlyCompletedSessions.filter(
    (session) => !matchedCompletedSessionKeys.has(session.sessionKey)
  );

  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");
  const recentlyCompletedKeys = new Set([
    ...filteredCompletedSessions.map((session) => session.sessionKey),
    ...matchedCompletedSessionKeys,
  ]);
  const filteredRecentMatches = recentMatches
    .filter((match) => !recentlyCompletedKeys.has(normalizeSessionKey(match)))
    .slice(0, 12);

  const scheduledLiveCount = scheduledMatches.filter((match) => match.displayState === "live").length;
  const scheduledReadyCount = scheduledMatches.filter(
    (match) => match.displayState === "accepted"
  ).length;
  const scheduledOnDeckCount = scheduledMatches.filter((match) =>
    ["pending", "accepted"].includes(match.displayState)
  ).length;

  return {
    liveCount: liveMatches.length + filteredActiveSessions.length + scheduledLiveCount,
    readyCount: readyMatches.length + scheduledReadyCount,
    onDeckCount: readyMatches.length + scheduledOnDeckCount,
    updatedAt: new Date().toISOString(),
    tournament: tournament.isFallback
      ? null
      : {
          title: tournament.title,
          slug: tournament.slug,
          format: tournament.format,
          status: tournament.status,
        },
    activeSessions: filteredActiveSessions,
    recentlyCompletedSessions: filteredCompletedSessions,
    liveMatches,
    readyMatches,
    scheduledMatches,
    recentMatches: filteredRecentMatches,
  };
}
