import { NextRequest, NextResponse } from "next/server";
import { getBackendUpstreamBase } from "@/lib/backendUpstream";
import { getFeaturedTournament, getLobbyMessages } from "@/lib/communityStore";
import { type LobbyMatchRow, type LobbyOnlineUser } from "@/lib/lobby";
import { getPrisma } from "@/lib/prisma";
import { getSessionUid } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function loadOnlineUsers() {
  const prisma = getPrisma();
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

export async function GET(request: NextRequest) {
  const prisma = getPrisma();
  const viewerUid = await getSessionUid(request);

  const [tournament, messages, onlineUsers, recentMatches] = await Promise.all([
    getFeaturedTournament(prisma, viewerUid),
    getLobbyMessages(prisma),
    loadOnlineUsers(),
    loadRecentMatches(),
  ]);

  return NextResponse.json({
    tournament,
    messages,
    onlineUsers,
    recentMatches,
  });
}
