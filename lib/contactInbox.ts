import type { PrismaClient } from "@/lib/generated/prisma";

import { AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import { ensureAiConciergeUser } from "@/lib/aiConcierge";
import {
  loadUserCommunitySummaries,
  normalizeGiftKind,
  normalizeHonorStatus,
  type CommunityBadge,
} from "@/lib/communityHonors";
import {
  DIRECT_MESSAGE_REACTIONS,
  DIRECT_MESSAGE_TYPING_WINDOW_MS,
} from "@/lib/contactInboxConfig";
import { recordUserActivity } from "@/lib/userExperience";

export type InboxCounterpart = {
  uid: string;
  displayName: string;
  threadKind: "direct" | "ai";
  isAdmin: boolean;
  badges: CommunityBadge[];
  giftedWolo: number;
};

export type InboxSummary = {
  targetUid: string;
  displayName: string;
  threadKind: "direct" | "ai";
  isAdmin: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageSnippet: string | null;
  badges: CommunityBadge[];
  giftedWolo: number;
};

type InboxSender = {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  badges: CommunityBadge[];
};

type InboxReadReceipt = {
  status: "sent" | "read";
  readAt: string | null;
};

type InboxMessageReaction = {
  emoji: string;
  count: number;
  viewerReacted: boolean;
};

type InboxMessageAttachment = {
  kind: "image" | "audio";
  name: string | null;
  mimeType: string | null;
  dataUrl: string;
  durationSeconds: number | null;
};

type InboxHonorBase = {
  id: number;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
};

export type InboxBadgeMessage = {
  id: string;
  kind: "badge";
  createdAt: string;
  sender: InboxSender;
  receipt: null;
  badge: InboxHonorBase & {
    label: string;
  };
};

export type InboxGiftMessage = {
  id: string;
  kind: "gift";
  createdAt: string;
  sender: InboxSender;
  receipt: null;
  gift: InboxHonorBase & {
    kind: string;
    amount: number | null;
  };
};

export type InboxTextMessage = {
  id: string;
  messageId: number;
  kind: "text";
  createdAt: string;
  sender: InboxSender;
  receipt: InboxReadReceipt | null;
  body: string;
  attachment: InboxMessageAttachment | null;
  reactions: InboxMessageReaction[];
};

export type InboxMessage = InboxTextMessage | InboxBadgeMessage | InboxGiftMessage;

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
  conversation: {
    counterpartLastReadAt: string | null;
    counterpartTyping: boolean;
  } | null;
};

type ViewerUser = {
  id: number;
  uid: string;
  isAdmin: boolean;
  inGameName: string | null;
  steamPersonaName: string | null;
};

type PairHonorSummary = {
  unreadCount: number;
  latestAt: Date | null;
  latestSnippet: string | null;
};

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function resolveThreadKind(uid: string) {
  return uid === AI_CONCIERGE_UID ? "ai" : "direct";
}

function buildPairKey(leftUserId: number, rightUserId: number) {
  return [leftUserId, rightUserId].sort((a, b) => a - b).join(":");
}

function buildBadgeSnippet(label: string, status: string) {
  if (status === "accepted") {
    return `${label} badge accepted`;
  }
  if (status === "declined") {
    return `${label} badge declined`;
  }
  return `${label} badge waiting`;
}

function buildGiftSnippet(kind: string, amount: number | null, status: string) {
  const prefix = amount ? `${amount} ${kind}` : kind;
  if (status === "accepted") {
    return `${prefix} accepted`;
  }
  if (status === "declined") {
    return `${prefix} declined`;
  }
  return `${prefix} waiting`;
}

function buildDirectMessageSnippet(message: {
  body: string | null;
  attachmentKind: string | null;
}) {
  const trimmedBody = message.body?.trim();
  if (trimmedBody) {
    return trimmedBody.slice(0, 120);
  }

  if (message.attachmentKind === "image") {
    return "Attachment";
  }

  if (message.attachmentKind === "audio") {
    return "Voice note";
  }

  return "Message";
}

function buildMessageAttachment(message: {
  attachmentKind: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentDataUrl: string | null;
  attachmentDurationSeconds: number | null;
}): InboxMessageAttachment | null {
  if (!message.attachmentDataUrl) {
    return null;
  }

  if (message.attachmentKind !== "image" && message.attachmentKind !== "audio") {
    return null;
  }

  return {
    kind: message.attachmentKind,
    name: message.attachmentName ?? null,
    mimeType: message.attachmentMimeType ?? null,
    dataUrl: message.attachmentDataUrl,
    durationSeconds:
      typeof message.attachmentDurationSeconds === "number"
        ? message.attachmentDurationSeconds
        : null,
  };
}

function buildMessageReactions(
  reactions: Array<{ emoji: string; userId: number }>,
  viewerUserId: number
): InboxMessageReaction[] {
  const grouped = new Map<string, InboxMessageReaction>();

  for (const reaction of reactions) {
    const current = grouped.get(reaction.emoji);
    if (current) {
      current.count += 1;
      current.viewerReacted = current.viewerReacted || reaction.userId === viewerUserId;
      continue;
    }

    grouped.set(reaction.emoji, {
      emoji: reaction.emoji,
      count: 1,
      viewerReacted: reaction.userId === viewerUserId,
    });
  }

  const order = new Map<string, number>(DIRECT_MESSAGE_REACTIONS.map((emoji, index) => [emoji, index]));
  return Array.from(grouped.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return (order.get(left.emoji) ?? 999) - (order.get(right.emoji) ?? 999);
  });
}

function senderShapeFromUser(
  user:
    | {
        id: number;
        uid: string;
        isAdmin: boolean;
        inGameName: string | null;
        steamPersonaName: string | null;
      }
    | null
    | undefined,
  badges: CommunityBadge[] = []
): InboxSender {
  return {
    uid: user?.uid ?? "system",
    displayName: user ? displayNameForUser(user) : "AoE2HDBets",
    isAdmin: Boolean(user?.isAdmin),
    badges,
  };
}

function serializeBadge(
  badge: {
    id: number;
    label: string;
    note: string | null;
    status: string;
    displayOnProfile: boolean;
    acceptedAt: Date | null;
    createdAt: Date;
    createdBy: {
      id: number;
      uid: string;
      isAdmin: boolean;
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
  },
  senderBadges: CommunityBadge[]
): InboxBadgeMessage {
  return {
    id: `badge-${badge.id}`,
    kind: "badge",
    createdAt: badge.createdAt.toISOString(),
    sender: senderShapeFromUser(badge.createdBy, senderBadges),
    receipt: null,
    badge: {
      id: badge.id,
      label: badge.label,
      note: badge.note,
      status: normalizeHonorStatus(badge.status),
      displayOnProfile: badge.displayOnProfile,
      acceptedAt: badge.acceptedAt?.toISOString() ?? null,
    },
  };
}

function serializeGift(
  gift: {
    id: number;
    kind: string;
    amount: number | null;
    note: string | null;
    status: string;
    displayOnProfile: boolean;
    acceptedAt: Date | null;
    createdAt: Date;
    createdBy: {
      id: number;
      uid: string;
      isAdmin: boolean;
      inGameName: string | null;
      steamPersonaName: string | null;
    } | null;
  },
  senderBadges: CommunityBadge[]
): InboxGiftMessage {
  return {
    id: `gift-${gift.id}`,
    kind: "gift",
    createdAt: gift.createdAt.toISOString(),
    sender: senderShapeFromUser(gift.createdBy, senderBadges),
    receipt: null,
    gift: {
      id: gift.id,
      kind: normalizeGiftKind(gift.kind),
      amount: typeof gift.amount === "number" ? gift.amount : null,
      note: gift.note,
      status: normalizeHonorStatus(gift.status),
      displayOnProfile: gift.displayOnProfile,
      acceptedAt: gift.acceptedAt?.toISOString() ?? null,
    },
  };
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

async function loadHonorSummary(
  prisma: PrismaClient,
  viewerUserId: number,
  counterpartUserId: number,
  lastReadAt: Date | null
): Promise<PairHonorSummary> {
  const unreadWhere = {
    userId: viewerUserId,
    createdByUserId: counterpartUserId,
    ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
  };

  const [latestBadge, latestGift, unreadBadgeCount, unreadGiftCount] = await Promise.all([
    prisma.userBadge.findFirst({
      where: {
        userId: viewerUserId,
        createdByUserId: counterpartUserId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        label: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.userGift.findFirst({
      where: {
        userId: viewerUserId,
        createdByUserId: counterpartUserId,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        kind: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.userBadge.count({ where: unreadWhere }),
    prisma.userGift.count({ where: unreadWhere }),
  ]);

  const badgeSnippet = latestBadge
    ? buildBadgeSnippet(latestBadge.label, normalizeHonorStatus(latestBadge.status))
    : null;
  const giftSnippet = latestGift
    ? buildGiftSnippet(
        normalizeGiftKind(latestGift.kind),
        typeof latestGift.amount === "number" ? latestGift.amount : null,
        normalizeHonorStatus(latestGift.status)
      )
    : null;

  if (
    latestGift?.createdAt &&
    (!latestBadge?.createdAt || latestGift.createdAt.getTime() >= latestBadge.createdAt.getTime())
  ) {
    return {
      unreadCount: unreadBadgeCount + unreadGiftCount,
      latestAt: latestGift.createdAt,
      latestSnippet: giftSnippet,
    };
  }

  return {
    unreadCount: unreadBadgeCount + unreadGiftCount,
    latestAt: latestBadge?.createdAt ?? null,
    latestSnippet: badgeSnippet,
  };
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

      const [unreadMessageCount, honorSummary] = await Promise.all([
        prisma.directMessage.count({
          where: {
            conversationId: membership.conversationId,
            senderUserId: { not: viewerUserId },
            ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
          },
        }),
        loadHonorSummary(
          prisma,
          viewerUserId,
          counterpartParticipant.userId,
          membership.lastReadAt
        ),
      ]);

      const lastMessage = membership.conversation.messages[0] ?? null;
      const community = communityMap.get(counterpartParticipant.userId) ?? {
        badges: [],
        gifts: [],
        giftedWolo: 0,
      };

      const lastDirectTime = lastMessage?.createdAt ?? null;
      const lastEventAt =
        honorSummary.latestAt && (!lastDirectTime || honorSummary.latestAt.getTime() >= lastDirectTime.getTime())
          ? honorSummary.latestAt
          : lastDirectTime;
      const lastSnippet =
        honorSummary.latestAt && (!lastDirectTime || honorSummary.latestAt.getTime() >= lastDirectTime.getTime())
          ? honorSummary.latestSnippet
          : lastMessage
            ? buildDirectMessageSnippet(lastMessage)
            : honorSummary.latestSnippet;

      return {
        targetUid: counterpartParticipant.user.uid,
        displayName: displayNameForUser(counterpartParticipant.user),
        threadKind: resolveThreadKind(counterpartParticipant.user.uid),
        isAdmin: counterpartParticipant.user.isAdmin,
        unreadCount: unreadMessageCount + honorSummary.unreadCount,
        lastMessageAt: lastEventAt?.toISOString() ?? null,
        lastMessageSnippet: lastSnippet ?? null,
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
        include: {
          reactions: {
            select: {
              emoji: true,
              userId: true,
            },
          },
        },
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
      counterpartLastReadAt: null as string | null,
      counterpartTyping: false,
    };
  }

  const counterpartParticipant = conversation.participants.find(
    (participant) => participant.userId === targetUserId
  );

  const communityMap = await loadUserCommunitySummaries(
    prisma,
    counterpartParticipant ? [counterpartParticipant.userId] : []
  );
  const community = counterpartParticipant
    ? communityMap.get(counterpartParticipant.userId) ?? { badges: [], gifts: [], giftedWolo: 0 }
    : { badges: [], gifts: [], giftedWolo: 0 };

  const [badges, gifts] = await Promise.all([
    prisma.userBadge.findMany({
      where: {
        OR: [
          { userId: viewerUserId, createdByUserId: targetUserId },
          { userId: targetUserId, createdByUserId: viewerUserId },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            uid: true,
            isAdmin: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.userGift.findMany({
      where: {
        OR: [
          { userId: viewerUserId, createdByUserId: targetUserId },
          { userId: targetUserId, createdByUserId: viewerUserId },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            uid: true,
            isAdmin: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const senderIds = Array.from(
    new Set([
      ...conversation.messages.map((message) => message.senderUserId),
      ...badges.map((badge) => badge.createdByUserId).filter((value): value is number => typeof value === "number"),
      ...gifts.map((gift) => gift.createdByUserId).filter((value): value is number => typeof value === "number"),
    ])
  );
  const senderCommunityMap = await loadUserCommunitySummaries(prisma, senderIds);

  const counterpartLastReadAt = counterpartParticipant?.lastReadAt?.toISOString() ?? null;
  const counterpartTyping = Boolean(
    counterpartParticipant?.typingUpdatedAt &&
      Date.now() - counterpartParticipant.typingUpdatedAt.getTime() <= DIRECT_MESSAGE_TYPING_WINDOW_MS
  );
  const latestOutgoingTextMessage =
    [...conversation.messages].reverse().find((message) => message.senderUserId === viewerUserId) ?? null;
  const latestReadOutgoingTextMessage =
    counterpartParticipant?.lastReadAt
      ? [...conversation.messages]
          .reverse()
          .find(
            (message) =>
              message.senderUserId === viewerUserId &&
              counterpartParticipant.lastReadAt &&
              counterpartParticipant.lastReadAt.getTime() >= message.createdAt.getTime()
          ) ?? null
      : null;

  const messageEvents: InboxMessage[] = conversation.messages.map((message) => {
    const sender = conversation.participants.find(
      (participant) => participant.userId === message.senderUserId
    )?.user;
    const senderCommunity =
      sender && senderCommunityMap.get(sender.id)
        ? senderCommunityMap.get(sender.id)
        : { badges: [], gifts: [], giftedWolo: 0 };

    const isReceiptAnchor =
      sender?.id === viewerUserId && latestOutgoingTextMessage?.id === message.id;
    const readAt =
      isReceiptAnchor &&
      latestReadOutgoingTextMessage?.id === message.id &&
      counterpartParticipant?.lastReadAt
        ? counterpartParticipant.lastReadAt.toISOString()
        : null;

    return {
      id: `message-${message.id}`,
      messageId: message.id,
      kind: "text",
      body: message.body ?? "",
      createdAt: message.createdAt.toISOString(),
      sender: senderShapeFromUser(sender, senderCommunity?.badges ?? []),
      attachment: buildMessageAttachment(message),
      reactions: buildMessageReactions(message.reactions, viewerUserId),
      receipt:
        isReceiptAnchor
          ? {
              status: readAt ? "read" : "sent",
              readAt,
            }
          : null,
    } satisfies InboxTextMessage;
  });

  const badgeEvents = badges.map((badge) =>
    serializeBadge(
      badge,
      badge.createdBy && senderCommunityMap.get(badge.createdBy.id)
        ? senderCommunityMap.get(badge.createdBy.id)?.badges ?? []
        : []
    )
  );
  const giftEvents = gifts.map((gift) =>
    serializeGift(
      gift,
      gift.createdBy && senderCommunityMap.get(gift.createdBy.id)
        ? senderCommunityMap.get(gift.createdBy.id)?.badges ?? []
        : []
    )
  );

  const combinedMessages = [...messageEvents, ...badgeEvents, ...giftEvents].sort((left, right) => {
    const leftTime = new Date(left.createdAt).getTime();
    const rightTime = new Date(right.createdAt).getTime();
    if (leftTime !== rightTime) {
      return leftTime - rightTime;
    }

    return left.id.localeCompare(right.id);
  });

  return {
    conversation,
    messages: combinedMessages,
    counterpart: counterpartParticipant
      ? ({
          uid: counterpartParticipant.user.uid,
          displayName: displayNameForUser(counterpartParticipant.user),
          threadKind: resolveThreadKind(counterpartParticipant.user.uid),
          isAdmin: counterpartParticipant.user.isAdmin,
          badges: community.badges,
          giftedWolo: community.giftedWolo,
        } satisfies InboxCounterpart)
      : null,
    counterpartLastReadAt,
    counterpartTyping,
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
    const aiConcierge = await ensureAiConciergeUser(prisma);
    await getOrCreateConversationByUsers(prisma, viewer.id, aiConcierge.id);

    if (options?.targetUid === AI_CONCIERGE_UID) {
      activeTargetUser = {
        id: aiConcierge.id,
        uid: aiConcierge.uid,
        isAdmin: false,
        inGameName: aiConcierge.inGameName,
        steamPersonaName: aiConcierge.steamPersonaName,
      };
    } else {
      activeTargetUser = await resolvePrimaryAdminContact(prisma);
    }

    if (!activeTargetUser) {
      unavailableReason = "Emaren contact is not configured yet.";
    }
  }

  if (!options?.summaryOnly && activeTargetUser && activeTargetUser.id !== viewer.id) {
    await markConversationRead(prisma, viewer.id, activeTargetUser.id);
    await recordUserActivity(prisma, {
      userId: viewer.id,
      type: "inbox_opened",
      path: "/contact-emaren",
      label: activeTargetUser.uid,
      metadata: { targetUid: activeTargetUser.uid },
      dedupeWithinSeconds: 180,
    });
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
      conversation: null,
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
        threadKind: resolveThreadKind(activeTargetUser.uid),
        isAdmin: activeTargetUser.isAdmin,
        badges: community.badges,
        giftedWolo: community.giftedWolo,
      },
      messages: [],
      unavailableReason,
      conversation: {
        counterpartLastReadAt: null,
        counterpartTyping: false,
      },
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
    conversation: {
      counterpartLastReadAt: activeConversation.counterpartLastReadAt,
      counterpartTyping: activeConversation.counterpartTyping,
    },
  };
}
