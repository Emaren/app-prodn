import { PrismaClient } from "@/lib/generated/prisma";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getFeaturedTournament, getLobbyMessages } from "@/lib/communityStore";
import {
  type LobbyMatchRow,
  type LobbyOnlineUser,
  type LobbySnapshot,
} from "@/lib/lobby";

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 6) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for lobby:", error);
    return [];
  }
}

async function loadOnlineUsers(prisma: PrismaClient): Promise<LobbyOnlineUser[]> {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      inGameName: { not: null },
      lastSeen: { gt: twoMinutesAgo },
    },
    orderBy: { lastSeen: "desc" },
    select: {
      uid: true,
      inGameName: true,
      verified: true,
    },
    take: 12,
  });

  return users.map(
    (user) =>
      ({
        uid: user.uid,
        in_game_name: user.inGameName || user.uid,
        verified: user.verified,
      }) satisfies LobbyOnlineUser
  );
}

export async function loadLobbySnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<LobbySnapshot> {
  const [tournament, messages, onlineUsers, recentMatches] = await Promise.all([
    getFeaturedTournament(prisma, viewerUid),
    getLobbyMessages(prisma),
    loadOnlineUsers(prisma),
    loadRecentMatches(),
  ]);

  return {
    tournament,
    messages,
    onlineUsers,
    recentMatches,
  };
}
