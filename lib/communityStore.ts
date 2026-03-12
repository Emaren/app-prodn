import { PrismaClient } from "@/lib/generated/prisma";
import {
  getFallbackTournament,
  LOBBY_ROOM_SLUG,
  type LobbyMessage,
  type LobbyTournament,
} from "@/lib/lobby";
import { toLobbyEntrant, toLobbyTournamentMatch } from "@/lib/tournamentMatchView";

export async function ensureLobbyRoom(prisma: PrismaClient) {
  return prisma.chatRoom.upsert({
    where: { slug: LOBBY_ROOM_SLUG },
    update: {
      name: "Lobby Chat",
      description: "Main community chat for tournaments, match talk, and quick coordination.",
      scope: "lobby",
    },
    create: {
      slug: LOBBY_ROOM_SLUG,
      name: "Lobby Chat",
      description: "Main community chat for tournaments, match talk, and quick coordination.",
      scope: "lobby",
    },
  });
}

export async function ensureTournamentRoom(prisma: PrismaClient, slug: string, title: string) {
  const roomSlug = `tournament-${slug}`.slice(0, 80);
  return prisma.chatRoom.upsert({
    where: { slug: roomSlug },
    update: {
      name: `${title} Chat`.slice(0, 120),
      description: `Tournament room for ${title}`,
      scope: "tournament",
    },
    create: {
      slug: roomSlug,
      name: `${title} Chat`.slice(0, 120),
      description: `Tournament room for ${title}`,
      scope: "tournament",
    },
  });
}

export async function getFeaturedTournament(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<LobbyTournament> {
  const tournament = await prisma.tournament.findFirst({
    where: {
      OR: [
        { featured: true },
        { status: { in: ["planning", "open", "active"] } },
      ],
    },
    orderBy: [{ featured: "desc" }, { startsAt: "asc" }, { createdAt: "desc" }],
    include: {
      entries: {
        orderBy: { joinedAt: "asc" },
        include: {
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
              verificationLevel: true,
              verified: true,
            },
          },
        },
      },
      _count: {
        select: { entries: true },
      },
      chatRoom: {
        select: { slug: true },
      },
      matches: {
        orderBy: [{ round: "asc" }, { position: "asc" }],
        include: {
          sourceGameStats: {
            select: {
              id: true,
              replayHash: true,
              winner: true,
              players: true,
              played_on: true,
              timestamp: true,
              map: true,
              original_filename: true,
            },
          },
          playerOne: {
            include: {
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                  verificationLevel: true,
                  verified: true,
                },
              },
            },
          },
          playerTwo: {
            include: {
              user: {
                select: {
                  uid: true,
                  inGameName: true,
                  steamPersonaName: true,
                  verificationLevel: true,
                  verified: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!tournament) {
    return getFallbackTournament(false);
  }

  const viewerJoined = viewerUid
    ? Boolean(
        await prisma.tournamentEntry.findFirst({
          where: {
            tournamentId: tournament.id,
            user: { uid: viewerUid },
          },
          select: { id: true },
        })
      )
    : false;

  return {
    id: tournament.id,
    slug: tournament.slug,
    title: tournament.title,
    description:
      tournament.description ||
      "Next featured tournament for the AoE2HD lobby. Join now and use chat to find real opponents.",
    format: tournament.format,
    status: tournament.status as LobbyTournament["status"],
    startsAt: tournament.startsAt ? tournament.startsAt.toISOString() : null,
    featured: tournament.featured,
    entryCount: tournament._count.entries,
    entrants: tournament.entries.map(toLobbyEntrant),
    viewerJoined,
    roomSlug: tournament.chatRoom?.slug || LOBBY_ROOM_SLUG,
    isFallback: false,
    matches: tournament.matches.map(toLobbyTournamentMatch),
  };
}

export async function getLobbyMessages(
  prisma: PrismaClient,
  roomSlug = LOBBY_ROOM_SLUG,
  limit = 30
): Promise<LobbyMessage[]> {
  const room =
    roomSlug === LOBBY_ROOM_SLUG
      ? await ensureLobbyRoom(prisma)
      : await prisma.chatRoom.findUnique({
          where: { slug: roomSlug },
          select: { id: true, slug: true },
        });

  if (!room) return [];

  const messages = await prisma.chatMessage.findMany({
    where: { roomId: room.id },
    orderBy: { createdAt: "desc" },
    take: Math.max(1, Math.min(limit, 50)),
    include: {
      user: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
          verificationLevel: true,
          verified: true,
        },
      },
    },
  });

  return messages
    .reverse()
    .map((message) => ({
      id: message.id,
      roomSlug: room.slug,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      user: {
        uid: message.user.uid,
        inGameName: message.user.inGameName,
        steamPersonaName: message.user.steamPersonaName,
        verificationLevel: message.user.verificationLevel,
        verified: message.user.verified,
      },
    }));
}
