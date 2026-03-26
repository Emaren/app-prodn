import type { PrismaClient } from "@/lib/generated/prisma";

import { loadUserCommunitySummaries, type CommunityBadge } from "@/lib/communityHonors";

export type InboxCounterpart = {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  badges: CommunityBadge[];
  giftedWolo: number;
};

export type InboxSummary = {
  targetUid: string;
  displayName: string;
  isAdmin: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageSnippet: string | null;
  badges: CommunityBadge[];
  giftedWolo: number;
};

export type InboxMessage = {
  id: number;
  body: string;
  createdAt: string;
  sender: {
    uid: string;
    displayName: string;
    isAdmin: boolean;
    badges: CommunityBadge[];
  };
};

export type InboxPayload = {
  viewer: {
    uid: string;
    displayName: string;
    isAdmin: boolean;
  };
  totalUnreadCount: number;
  summaries: InboxSummary[];
  activeTargetUid: string | null;
  activeCounterpart: InboxCounterpart | null;
  messages: InboxMessage[];
  unavailableReason: string | null;
};

type ViewerUser = {
  id: number;
  uid: string;
  isAdmin: boolean;
  inGameName: string | null;
  steamPersonaName: string | null;
};

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function buildPairKey(leftUserId: number, rightUserId: number) {
  return [leftUserId, rightUserId].sort((a, b) => a - b).join(":");
}

export function normalizeInboxMessageBody(value: string) {
  return value.replace(/\r\n?/g, "\n").trim().slice(0, 1000);
}

async function findViewer(prisma: PrismaClient, viewerUid: string) {
  return prisma.user.findUnique({
    where: { uid: viewerUid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });
}

export async function resolvePrimaryAdminContact(
  prisma: PrismaClient
): Promise<ViewerUser | null> {
  const admins = await prisma.user.findMany({
    where: { isAdmin: true },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  if (admins.length === 0) {
    return null;
  }

  const namedEmaren = admins.find((admin) =>
    [admin.inGameName, admin.steamPersonaName]
      .filter(Boolean)
      .some((value) => value?.trim().toLowerCase() === "emaren")
  );

  return namedEmaren || admins[0] || null;
}

export async function getOrCreateConversationByUsers(
  prisma: PrismaClient,
  leftUserId: number,
  rightUserId: number
) {
  const pairKey = buildPairKey(leftUserId, rightUserId);

  return prisma.directConversation.upsert({
    where: { pairKey },
    update: {
      updatedAt: new Date(),
    },
    create: {
      pairKey,
      participants: {
        create: [{ userId: leftUserId }, { userId: rightUserId }],
      },
    },
    include: {
      participants: true,
    },
  });
}

async function loadConversationSummaries(prisma: PrismaClient, viewerUserId: number) {
  const memberships = await prisma.directConversationParticipant.findMany({
    where: { userId: viewerUserId },
    include: {
      conversation: {
        include: {
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  uid: true,
                  isAdmin: true,
                  inGameName: true,
                  steamPersonaName: true,
                },
              },
            },
          },
          messages: {
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1,
          },
        },
      },
    },
  });

  const counterpartIds = memberships
    .map((membership) =>
      membership.conversation.participants.find((participant) => participant.userId !== viewerUserId)?.userId
    )
    .filter((value): value is number => typeof value === "number");

  const communityMap = await loadUserCommunitySummaries(prisma, counterpartIds);

  const summaries = await Promise.all(
    memberships.map(async (membership) => {
      const counterpartParticipant = membership.conversation.participants.find(
        (participant) => participant.userId !== viewerUserId
      );

      if (!counterpartParticipant) {
        return null;
      }

      const unreadCount = await prisma.directMessage.count({
        where: {
          conversationId: membership.conversationId,
          senderUserId: { not: viewerUserId },
          ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
        },
      });

      const lastMessage = membership.conversation.messages[0] ?? null;
      const community = communityMap.get(counterpartParticipant.userId) ?? {
        badges: [],
        gifts: [],
        giftedWolo: 0,
      };

      return {
        targetUid: counterpartParticipant.user.uid,
        displayName: displayNameForUser(counterpartParticipant.user),
        isAdmin: counterpartParticipant.user.isAdmin,
        unreadCount,
        lastMessageAt: lastMessage?.createdAt.toISOString() ?? null,
        lastMessageSnippet: lastMessage ? lastMessage.body.slice(0, 120) : null,
        badges: community.badges,
        giftedWolo: community.giftedWolo,
      } satisfies InboxSummary;
    })
  );

  return summaries
    .filter((summary): summary is NonNullable<typeof summary> => summary !== null)
    .sort((left, right) => {
      if (left.unreadCount !== right.unreadCount) {
        return right.unreadCount - left.unreadCount;
      }

      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0;
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0;
      return rightTime - leftTime;
    });
}

async function loadConversationMessages(
  prisma: PrismaClient,
  viewerUserId: number,
  targetUserId: number
) {
  const conversation = await prisma.directConversation.findUnique({
    where: { pairKey: buildPairKey(viewerUserId, targetUserId) },
    include: {
      messages: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 80,
      },
      participants: {
        include: {
          user: {
            select: {
              id: true,
              uid: true,
              isAdmin: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
    },
  });

  if (!conversation) {
    return {
      conversation: null,
      messages: [] as InboxMessage[],
      counterpart: null as InboxCounterpart | null,
    };
  }

  const counterpartParticipant = conversation.participants.find(
    (participant) => participant.userId !== viewerUserId
  );

  const communityMap = await loadUserCommunitySummaries(
    prisma,
    counterpartParticipant ? [counterpartParticipant.userId] : []
  );
  const community = counterpartParticipant
    ? communityMap.get(counterpartParticipant.userId) ?? { badges: [], gifts: [], giftedWolo: 0 }
    : { badges: [], gifts: [], giftedWolo: 0 };

  const senderIds = Array.from(new Set(conversation.messages.map((message) => message.senderUserId)));
  const senderCommunityMap = await loadUserCommunitySummaries(prisma, senderIds);

  return {
    conversation,
    messages: conversation.messages.map((message) => {
      const sender = conversation.participants.find(
        (participant) => participant.userId === message.senderUserId
      )?.user;
      const senderCommunity =
        sender && senderCommunityMap.get(sender.id)
          ? senderCommunityMap.get(sender.id)
          : { badges: [], gifts: [], giftedWolo: 0 };

      return {
        id: message.id,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        sender: {
          uid: sender?.uid ?? `user-${message.senderUserId}`,
          displayName: sender ? displayNameForUser(sender) : "Unknown user",
          isAdmin: Boolean(sender?.isAdmin),
          badges: senderCommunity?.badges ?? [],
        },
      } satisfies InboxMessage;
    }),
    counterpart: counterpartParticipant
      ? ({
          uid: counterpartParticipant.user.uid,
          displayName: displayNameForUser(counterpartParticipant.user),
          isAdmin: counterpartParticipant.user.isAdmin,
          badges: community.badges,
          giftedWolo: community.giftedWolo,
        } satisfies InboxCounterpart)
      : null,
  };
}

async function markConversationRead(
  prisma: PrismaClient,
  viewerUserId: number,
  targetUserId: number
) {
  const conversation = await prisma.directConversation.findUnique({
    where: { pairKey: buildPairKey(viewerUserId, targetUserId) },
    select: { id: true },
  });

  if (!conversation) {
    return;
  }

  await prisma.directConversationParticipant.updateMany({
    where: {
      conversationId: conversation.id,
      userId: viewerUserId,
    },
    data: {
      lastReadAt: new Date(),
    },
  });
}

export async function loadInboxPayload(
  prisma: PrismaClient,
  viewerUid: string,
  options?: {
    targetUid?: string | null;
    summaryOnly?: boolean;
  }
): Promise<InboxPayload> {
  const viewer = await findViewer(prisma, viewerUid);
  if (!viewer) {
    throw new Error("Viewer not found");
  }

  let activeTargetUser: ViewerUser | null = null;
  let unavailableReason: string | null = null;

  if (viewer.isAdmin) {
    if (options?.targetUid) {
      activeTargetUser = await prisma.user.findUnique({
        where: { uid: options.targetUid },
        select: {
          id: true,
          uid: true,
          isAdmin: true,
          inGameName: true,
          steamPersonaName: true,
        },
      });
    }
  } else {
    activeTargetUser = await resolvePrimaryAdminContact(prisma);
    if (!activeTargetUser) {
      unavailableReason = "Emaren contact is not configured yet.";
    }
  }

  if (!options?.summaryOnly && activeTargetUser && activeTargetUser.id !== viewer.id) {
    await markConversationRead(prisma, viewer.id, activeTargetUser.id);
  }

  const summaries = await loadConversationSummaries(prisma, viewer.id);
  const totalUnreadCount = summaries.reduce((sum, summary) => sum + summary.unreadCount, 0);

  if (!activeTargetUser && viewer.isAdmin && summaries[0]) {
    activeTargetUser = await prisma.user.findUnique({
      where: { uid: summaries[0].targetUid },
      select: {
        id: true,
        uid: true,
        isAdmin: true,
        inGameName: true,
        steamPersonaName: true,
      },
    });
  }

  if (options?.summaryOnly || !activeTargetUser || activeTargetUser.id === viewer.id) {
    return {
      viewer: {
        uid: viewer.uid,
        displayName: displayNameForUser(viewer),
        isAdmin: viewer.isAdmin,
      },
      totalUnreadCount,
      summaries,
      activeTargetUid: activeTargetUser && activeTargetUser.id !== viewer.id ? activeTargetUser.uid : null,
      activeCounterpart: null,
      messages: [],
      unavailableReason,
    };
  }

  const activeConversation = await loadConversationMessages(prisma, viewer.id, activeTargetUser.id);

  if (!activeConversation.counterpart) {
    const communityMap = await loadUserCommunitySummaries(prisma, [activeTargetUser.id]);
    const community = communityMap.get(activeTargetUser.id) ?? { badges: [], gifts: [], giftedWolo: 0 };

    return {
      viewer: {
        uid: viewer.uid,
        displayName: displayNameForUser(viewer),
        isAdmin: viewer.isAdmin,
      },
      totalUnreadCount,
      summaries,
      activeTargetUid: activeTargetUser.uid,
      activeCounterpart: {
        uid: activeTargetUser.uid,
        displayName: displayNameForUser(activeTargetUser),
        isAdmin: activeTargetUser.isAdmin,
        badges: community.badges,
        giftedWolo: community.giftedWolo,
      },
      messages: [],
      unavailableReason,
    };
  }

  return {
    viewer: {
      uid: viewer.uid,
      displayName: displayNameForUser(viewer),
      isAdmin: viewer.isAdmin,
    },
    totalUnreadCount,
    summaries,
    activeTargetUid: activeTargetUser.uid,
    activeCounterpart: activeConversation.counterpart,
    messages: activeConversation.messages,
    unavailableReason,
  };
}
