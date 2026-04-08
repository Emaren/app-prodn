import { PrismaClient } from "@/lib/generated/prisma";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getFeaturedTournament, getLobbyMessages } from "@/lib/communityStore";
import { loadLobbyLeaderboard } from "@/lib/lobbyLeaderboard";
import { loadLobbyWoloEarnersBoard } from "@/lib/lobbyWoloEarners";
import {
  LOBBY_ROOM_SLUG,
  getFallbackLeaderboard,
  getFallbackTournament,
  getFallbackWoloEarnersBoard,
  type LobbyMatchRow,
  type LobbyOnlineUser,
  type LobbySnapshot,
} from "@/lib/lobby";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import { reconcileTournamentMatchProofs } from "@/lib/tournamentProofReconciler";
import { loadWoloDevSnapshot } from "@/lib/woloDevSnapshot";

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const base = getBackendUpstreamBase();
    const response = await fetch(`${base}/api/game_stats`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    if (!Array.isArray(payload)) return [];

    return payload
      .slice()
      .sort((a, b) => getLobbyMatchPlayedAtMs(b) - getLobbyMatchPlayedAtMs(a))
      .slice(0, 6);
  } catch (error) {
    console.warn("Failed to load recent matches for lobby:", error);
    return [];
  }
}

async function loadOnlineUsers(prisma: PrismaClient): Promise<LobbyOnlineUser[]> {
  try {
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
        verificationLevel: true,
      },
      take: 12,
    });

    return users.map(
      (user) =>
        ({
          uid: user.uid,
          in_game_name: user.inGameName || user.uid,
          verified: user.verified,
          verificationLevel: user.verificationLevel,
        }) satisfies LobbyOnlineUser
    );
  } catch (error) {
    console.warn("Failed to load online users for lobby:", error);
    return [];
  }
}

export async function loadLobbySnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null,
  guestReactionSessionId?: string | null
): Promise<LobbySnapshot> {
  const wolo = await loadWoloDevSnapshot();

  try {
    await reconcileTournamentMatchProofs(prisma);
    const tournament = await getFeaturedTournament(prisma, viewerUid);

    const [tournamentMessages, onlineUsers, recentMatches, leaderboard, woloEarners] = await Promise.all([
      getLobbyMessages(prisma, tournament.roomSlug, 60, {
        uid: viewerUid,
        guestSessionId: guestReactionSessionId,
      }),
      loadOnlineUsers(prisma),
      loadRecentMatches(),
      loadLobbyLeaderboard(prisma),
      loadLobbyWoloEarnersBoard(prisma),
    ]);

    const messages =
      tournamentMessages.length > 0 || tournament.roomSlug === LOBBY_ROOM_SLUG
        ? tournamentMessages
        : await getLobbyMessages(prisma, LOBBY_ROOM_SLUG, 60, {
            uid: viewerUid,
            guestSessionId: guestReactionSessionId,
          });

    return {
      tournament,
      messages,
      onlineUsers,
      recentMatches,
      leaderboard,
      wolo,
      woloEarners,
    };
  } catch (error) {
    console.warn("Falling back to lobby snapshot defaults:", error);

    return {
      tournament: getFallbackTournament(false),
      messages: [],
      onlineUsers: [],
      recentMatches: await loadRecentMatches(),
      leaderboard: getFallbackLeaderboard(),
      wolo,
      woloEarners: getFallbackWoloEarnersBoard(),
    };
  }
}
