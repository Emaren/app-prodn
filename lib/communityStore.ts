import { Prisma, PrismaClient } from "@/lib/generated/prisma";
import { isAiConciergeUid } from "@/lib/aiConciergeConfig";
import {
  getFallbackTournament,
  LOBBY_ROOM_SLUG,
  type LobbyMessage,
  type LobbyMessageReaction,
  type LobbyTournament,
} from "@/lib/lobby";
import { LOBBY_MESSAGE_REACTIONS } from "@/lib/lobbyReactionConfig";
import { toLobbyEntrant, toLobbyTournamentMatch } from "@/lib/tournamentMatchView";

const TOURNAMENT_INCLUDE = {
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
} satisfies Prisma.TournamentInclude;

type TournamentRecord = Prisma.TournamentGetPayload<{
  include: typeof TOURNAMENT_INCLUDE;
}>;

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function buildLobbyMessageReactions(
  reactions: Array<{
    emoji: string;
    user: {
      uid: string;
      inGameName: string | null;
      steamPersonaName: string | null;
    };
  }>,
  guestReactions: Array<{
    emoji: string;
    guestSessionId: string;
  }>,
  viewerUid?: string | null,
  guestSessionId?: string | null
): LobbyMessageReaction[] {
  const grouped = new Map<string, LobbyMessageReaction>();

  for (const reaction of reactions) {
    const current =
      grouped.get(reaction.emoji) ||
      ({
        emoji: reaction.emoji,
        count: 0,
        viewerReacted: false,
        anonymousCount: 0,
        users: [],
      } satisfies LobbyMessageReaction);

    current.count += 1;
    current.viewerReacted = current.viewerReacted || reaction.user.uid === viewerUid;
    current.users.push({
      uid: reaction.user.uid,
      displayName: displayNameForUser(reaction.user),
    });
    grouped.set(reaction.emoji, current);
  }

  for (const reaction of guestReactions) {
    const current =
      grouped.get(reaction.emoji) ||
      ({
        emoji: reaction.emoji,
        count: 0,
        viewerReacted: false,
        anonymousCount: 0,
        users: [],
      } satisfies LobbyMessageReaction);

    current.count += 1;
    current.anonymousCount += 1;
    current.viewerReacted =
      current.viewerReacted || reaction.guestSessionId === guestSessionId;
    grouped.set(reaction.emoji, current);
  }

  const order = new Map<string, number>(
    LOBBY_MESSAGE_REACTIONS.map((emoji, index) => [emoji, index])
  );
  return Array.from(grouped.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return (order.get(left.emoji) ?? 999) - (order.get(right.emoji) ?? 999);
  });
}

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

async function viewerHasJoinedTournament(
  prisma: PrismaClient,
  tournamentId: number,
  viewerUid?: string | null
) {
  if (!viewerUid) {
    return false;
  }

  return Boolean(
    await prisma.tournamentEntry.findFirst({
      where: {
        tournamentId,
        user: { uid: viewerUid },
      },
      select: { id: true },
    })
  );
}

async function buildLobbyTournament(
  prisma: PrismaClient,
  tournament: TournamentRecord,
  viewerUid?: string | null
): Promise<LobbyTournament> {
  const viewerJoined = await viewerHasJoinedTournament(prisma, tournament.id, viewerUid);

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
    include: TOURNAMENT_INCLUDE,
  });

  if (!tournament) {
    return getFallbackTournament(false);
  }

  return buildLobbyTournament(prisma, tournament, viewerUid);
}

export async function getTournamentBySlug(
  prisma: PrismaClient,
  slug: string,
  viewerUid?: string | null
): Promise<LobbyTournament | null> {
  const tournament = await prisma.tournament.findUnique({
    where: { slug },
    include: TOURNAMENT_INCLUDE,
  });

  if (!tournament) {
    return null;
  }

  return buildLobbyTournament(prisma, tournament, viewerUid);
}

export async function getLobbyMessages(
  prisma: PrismaClient,
  roomSlug = LOBBY_ROOM_SLUG,
  limit = 60,
  viewer?: {
    uid?: string | null;
    guestSessionId?: string | null;
  }
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
    take: Math.max(1, Math.min(limit, 100)),
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
      reactions: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          emoji: true,
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
      guestReactions: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          emoji: true,
          guestSessionId: true,
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
      reactions: buildLobbyMessageReactions(
        message.reactions,
        message.guestReactions,
        viewer?.uid ?? null,
        viewer?.guestSessionId ?? null
      ),
      user: {
        uid: message.user.uid,
        inGameName: message.user.inGameName,
        steamPersonaName: message.user.steamPersonaName,
        verificationLevel: message.user.verificationLevel,
        verified: message.user.verified,
        isAi: isAiConciergeUid(message.user.uid),
      },
    }));
}
