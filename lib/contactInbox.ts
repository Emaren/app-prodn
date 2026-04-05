import type { PrismaClient } from "@/lib/generated/prisma";

import { AI_CONCIERGE_UID } from "@/lib/aiConciergeConfig";
import { ensureAiConciergeUser } from "@/lib/aiConcierge";
import { getAiThreadKind } from "@/lib/aiPersonaInbox";
import { loadChallengeThreadTile, type ScheduledMatchTile } from "@/lib/challenges";
import {
  loadUserCommunitySummaries,
  normalizeGiftKind,
  normalizeHonorStatus,
  type CommunityBadge,
} from "@/lib/communityHonors";
import {
  DIRECT_MESSAGE_REACTIONS,
  DIRECT_MESSAGE_MAX_CHARS,
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
  url: string;
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
  sharedLobbyMessageId: number | null;
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
  activeChallenge: ScheduledMatchTile | null;
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

type ConversationSummaryMembership = {
  conversationId: number;
  lastReadAt: Date | null;
  conversation: {
    participants: Array<{
      userId: number;
      user: {
        id: number;
        uid: string;
        isAdmin: boolean;
        inGameName: string | null;
        steamPersonaName: string | null;
      };
    }>;
    messages: Array<{
      body: string | null;
      attachmentKind: string | null;
      createdAt: Date;
    }>;
  };
};

type DirectInboxWriteClient = Pick<
  PrismaClient,
  "directConversation" | "directConversationParticipant" | "directMessage"
>;

function displayNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function resolveThreadKind(uid: string) {
  return getAiThreadKind(uid);
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
  id: number;
  attachmentKind: string | null;
  attachmentName: string | null;
  attachmentMimeType: string | null;
  attachmentDurationSeconds: number | null;
}): InboxMessageAttachment | null {
  if (message.attachmentKind !== "image" && message.attachmentKind !== "audio") {
    return null;
  }

  return {
    kind: message.attachmentKind,
    name: message.attachmentName ?? null,
    mimeType: message.attachmentMimeType ?? null,
    url: `/api/contact-emaren/attachments/${message.id}`,
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
  return value.replace(/\r\n?/g, "\n").trim().slice(0, DIRECT_MESSAGE_MAX_CHARS);
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
  prisma: DirectInboxWriteClient,
  leftUserId: number,
  rightUserId: number
) {
  const pairKey = buildPairKey(leftUserId, rightUserId);

  const existing = await prisma.directConversation.findUnique({
    where: { pairKey },
    include: {
      participants: true,
    },
  });

  if (existing) {
    return prisma.directConversation.update({
      where: { pairKey },
      data: {
        updatedAt: new Date(),
      },
      include: {
        participants: true,
      },
    });
  }

  try {
    return await prisma.directConversation.create({
      data: {
        pairKey,
        participants: {
          create: [{ userId: leftUserId }, { userId: rightUserId }],
        },
      },
      include: {
        participants: true,
      },
    });
  } catch (error) {
    const isUniquePairKeyRace =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002";

    if (!isUniquePairKeyRace) {
      throw error;
    }

    return prisma.directConversation.update({
      where: { pairKey },
      data: {
        updatedAt: new Date(),
      },
      include: {
        participants: true,
      },
    });
  }
}

export async function postDirectInboxMessage(
  prisma: DirectInboxWriteClient,
  {
    senderUserId,
    targetUserId,
    body,
    now = new Date(),
  }: {
    senderUserId: number;
    targetUserId: number;
    body: string;
    now?: Date;
  }
) {
  const normalizedBody = normalizeInboxMessageBody(body);
  if (!normalizedBody) {
    throw new Error("Direct inbox message body cannot be empty.");
  }

  const conversation = await getOrCreateConversationByUsers(
    prisma,
    senderUserId,
    targetUserId
  );

  await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId,
      body: normalizedBody,
    },
  });

  await prisma.directConversation.update({
    where: { id: conversation.id },
    data: {
      updatedAt: now,
    },
  });

  await prisma.directConversationParticipant.updateMany({
    where: {
      conversationId: conversation.id,
      userId: senderUserId,
    },
    data: {
      lastReadAt: now,
      typingUpdatedAt: null,
    },
  });

  return conversation;
}

function resolveCounterpartParticipant(
  membership: ConversationSummaryMembership,
  viewerUserId: number
) {
  return membership.conversation.participants.find(
    (participant) => participant.userId !== viewerUserId
  ) ?? null;
}

async function loadUnreadMessageCounts(
  prisma: PrismaClient,
  viewerUserId: number,
  memberships: ConversationSummaryMembership[]
) {
  if (memberships.length === 0) {
    return new Map<number, number>();
  }

  const unreadRows = await prisma.directMessage.groupBy({
    by: ["conversationId"],
    where: {
      senderUserId: { not: viewerUserId },
      OR: memberships.map((membership) => ({
        conversationId: membership.conversationId,
        ...(membership.lastReadAt ? { createdAt: { gt: membership.lastReadAt } } : {}),
      })),
    },
    _count: {
      _all: true,
    },
  });

  return new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));
}

async function loadHonorSummaryMap(
  prisma: PrismaClient,
  viewerUserId: number,
  counterpartLastReadAt: Map<number, Date | null>
): Promise<Map<number, PairHonorSummary>> {
  const counterpartIds = Array.from(counterpartLastReadAt.keys());
  if (counterpartIds.length === 0) {
    return new Map();
  }

  const unreadHonorFilters = counterpartIds.map((counterpartUserId) => {
    const lastReadAt = counterpartLastReadAt.get(counterpartUserId) ?? null;
    return {
      createdByUserId: counterpartUserId,
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    };
  });

  const [latestBadges, latestGifts, unreadBadgeRows, unreadGiftRows] = await Promise.all([
    prisma.userBadge.findMany({
      where: {
        userId: viewerUserId,
        createdByUserId: { in: counterpartIds },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdByUserId: true,
        label: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.userGift.findMany({
      where: {
        userId: viewerUserId,
        createdByUserId: { in: counterpartIds },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        createdByUserId: true,
        kind: true,
        amount: true,
        status: true,
        createdAt: true,
      },
    }),
    prisma.userBadge.groupBy({
      by: ["createdByUserId"],
      where: {
        userId: viewerUserId,
        OR: unreadHonorFilters,
      },
      _count: {
        _all: true,
      },
    }),
    prisma.userGift.groupBy({
      by: ["createdByUserId"],
      where: {
        userId: viewerUserId,
        OR: unreadHonorFilters,
      },
      _count: {
        _all: true,
      },
    }),
  ]);

  const latestBadgeMap = new Map<number, (typeof latestBadges)[number]>();
  for (const badge of latestBadges) {
    if (badge.createdByUserId !== null && !latestBadgeMap.has(badge.createdByUserId)) {
      latestBadgeMap.set(badge.createdByUserId, badge);
    }
  }

  const latestGiftMap = new Map<number, (typeof latestGifts)[number]>();
  for (const gift of latestGifts) {
    if (gift.createdByUserId !== null && !latestGiftMap.has(gift.createdByUserId)) {
      latestGiftMap.set(gift.createdByUserId, gift);
    }
  }

  const unreadBadgeCountMap = new Map<number, number>();
  for (const row of unreadBadgeRows) {
    if (row.createdByUserId !== null) {
      unreadBadgeCountMap.set(row.createdByUserId, row._count._all);
    }
  }

  const unreadGiftCountMap = new Map<number, number>();
  for (const row of unreadGiftRows) {
    if (row.createdByUserId !== null) {
      unreadGiftCountMap.set(row.createdByUserId, row._count._all);
    }
  }
  const summaries = new Map<number, PairHonorSummary>();

  for (const counterpartUserId of counterpartIds) {
    const latestBadge = latestBadgeMap.get(counterpartUserId) ?? null;
    const latestGift = latestGiftMap.get(counterpartUserId) ?? null;
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

    const latestHonor =
      latestGift?.createdAt &&
      (!latestBadge?.createdAt || latestGift.createdAt.getTime() >= latestBadge.createdAt.getTime())
        ? {
            latestAt: latestGift.createdAt,
            latestSnippet: giftSnippet,
          }
        : {
            latestAt: latestBadge?.createdAt ?? null,
            latestSnippet: badgeSnippet,
          };

    summaries.set(counterpartUserId, {
      unreadCount:
        (unreadBadgeCountMap.get(counterpartUserId) ?? 0) +
        (unreadGiftCountMap.get(counterpartUserId) ?? 0),
      latestAt: latestHonor.latestAt,
      latestSnippet: latestHonor.latestSnippet,
    });
  }

  return summaries;
}

async function loadConversationSummaries(prisma: PrismaClient, viewerUserId: number) {
  const memberships = await prisma.directConversationParticipant.findMany({
    where: { userId: viewerUserId },
    select: {
      conversationId: true,
      lastReadAt: true,
      conversation: {
        select: {
          participants: {
            select: {
              userId: true,
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
            select: {
              body: true,
              attachmentKind: true,
              createdAt: true,
            },
          },
        },
      },
    },
  });

  const counterpartLastReadAt = new Map<number, Date | null>();
  const counterpartIds = memberships
    .map((membership) => {
      const counterpartParticipant = resolveCounterpartParticipant(membership, viewerUserId);
      if (!counterpartParticipant) {
        return null;
      }
      counterpartLastReadAt.set(counterpartParticipant.userId, membership.lastReadAt);
      return counterpartParticipant.userId;
    })
    .filter((value): value is number => typeof value === "number");

  const [communityMap, unreadMessageCountMap, honorSummaryMap] = await Promise.all([
    loadUserCommunitySummaries(prisma, counterpartIds),
    loadUnreadMessageCounts(prisma, viewerUserId, memberships),
    loadHonorSummaryMap(prisma, viewerUserId, counterpartLastReadAt),
  ]);

  const summaries = memberships.map((membership) => {
    const counterpartParticipant = resolveCounterpartParticipant(membership, viewerUserId);

    if (!counterpartParticipant) {
      return null;
    }

    const unreadMessageCount = unreadMessageCountMap.get(membership.conversationId) ?? 0;
    const honorSummary = honorSummaryMap.get(counterpartParticipant.userId) ?? {
      unreadCount: 0,
      latestAt: null,
      latestSnippet: null,
    };

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
  });

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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 80,
        select: {
        id: true,
        senderUserId: true,
        body: true,
        attachmentKind: true,
        attachmentName: true,
        attachmentMimeType: true,
        attachmentDurationSeconds: true,
        sharedLobbyMessageId: true,
        createdAt: true,
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

  const orderedMessages = [...conversation.messages].reverse();

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
      ...orderedMessages.map((message) => message.senderUserId),
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
    [...orderedMessages].reverse().find((message) => message.senderUserId === viewerUserId) ?? null;
  const latestReadOutgoingTextMessage =
    counterpartParticipant?.lastReadAt
      ? [...orderedMessages]
          .reverse()
          .find(
            (message) =>
              message.senderUserId === viewerUserId &&
              counterpartParticipant.lastReadAt &&
              counterpartParticipant.lastReadAt.getTime() >= message.createdAt.getTime()
          ) ?? null
      : null;

  const messageEvents: InboxMessage[] = orderedMessages.map((message) => {
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
      sharedLobbyMessageId: message.sharedLobbyMessageId ?? null,
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

export async function resolveInboxTargetForViewer(
  prisma: PrismaClient,
  viewer: ViewerUser,
  targetUid: string | null | undefined
) {
  if (!targetUid) {
    return null;
  }

  const targetUser = await prisma.user.findUnique({
    where: { uid: targetUid },
    select: {
      id: true,
      uid: true,
      isAdmin: true,
      inGameName: true,
      steamPersonaName: true,
    },
  });

  if (!targetUser || targetUser.id === viewer.id) {
    return null;
  }

  if (viewer.isAdmin || targetUser.isAdmin) {
    return targetUser;
  }

  const existingConversation = await prisma.directConversation.findUnique({
    where: {
      pairKey: buildPairKey(viewer.id, targetUser.id),
    },
    select: { id: true },
  });

  return existingConversation ? targetUser : null;
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
    activeTargetUser = await resolveInboxTargetForViewer(prisma, viewer, options?.targetUid);
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
      activeTargetUser =
        (await resolveInboxTargetForViewer(prisma, viewer, options?.targetUid)) ||
        (await resolvePrimaryAdminContact(prisma));
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

  const activeChallenge =
    !options?.summaryOnly &&
    activeTargetUser &&
    activeTargetUser.id !== viewer.id &&
    activeTargetUser.uid !== AI_CONCIERGE_UID
      ? await loadChallengeThreadTile(prisma, viewer.id, activeTargetUser.id)
      : null;

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
      activeChallenge: null,
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
      activeChallenge,
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
    activeChallenge,
    messages: activeConversation.messages,
    unavailableReason,
    conversation: {
      counterpartLastReadAt: activeConversation.counterpartLastReadAt,
      counterpartTyping: activeConversation.counterpartTyping,
    },
  };
}
