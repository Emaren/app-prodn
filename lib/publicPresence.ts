import type { PrismaClient } from "@/lib/generated/prisma";
import type { LobbyOnlineUser } from "@/lib/lobby";

export const PUBLIC_PRESENCE_WINDOW_MS = 2 * 60 * 1000;
export const PUBLIC_PRESENCE_MAX_USERS = 500;

export type PublicPresenceSnapshot = {
  activePlayers: number;
  generatedAt: string;
  onlineUsers: LobbyOnlineUser[];
};

/**
 * One canonical, request-time sample for public AoE2WAR presence.
 *
 * Consumers must derive both the visible roster and its count from this same
 * value. Traffic attribution is intentionally not part of site-presence truth.
 */
export async function loadPublicPresenceSnapshot(
  prisma: PrismaClient,
): Promise<PublicPresenceSnapshot> {
  const generatedAt = new Date();
  const onlineThreshold = new Date(
    generatedAt.getTime() - PUBLIC_PRESENCE_WINDOW_MS,
  );

  const users = await prisma.user.findMany({
    where: {
      inGameName: { not: null },
      lastSeen: { gt: onlineThreshold },
    },
    orderBy: [
      { lastSeen: "desc" },
      { uid: "asc" },
    ],
    select: {
      uid: true,
      inGameName: true,
      verified: true,
      verificationLevel: true,
    },
    take: PUBLIC_PRESENCE_MAX_USERS,
  });

  const onlineUsers = users.map(
    (user) =>
      ({
        uid: user.uid,
        in_game_name: user.inGameName || user.uid,
        verified: user.verified,
        verificationLevel: user.verificationLevel,
      }) satisfies LobbyOnlineUser,
  );

  return {
    activePlayers: onlineUsers.length,
    generatedAt: generatedAt.toISOString(),
    onlineUsers,
  };
}
