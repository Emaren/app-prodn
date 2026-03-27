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
  liveMatches: LobbyTournamentMatch[];
  readyMatches: LobbyTournamentMatch[];
  recentMatches: LobbyMatchRow[];
};

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
  const [tournament, recentMatches] = await Promise.all([
    getFeaturedTournament(prisma),
    loadRecentMatches(),
  ]);

  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");

  return {
    liveCount: liveMatches.length,
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
    liveMatches,
    readyMatches,
    recentMatches,
  };
}

