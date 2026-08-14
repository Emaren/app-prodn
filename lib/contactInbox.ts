import type { PrismaClient } from "@/lib/generated/prisma";

import { AI_CONCIERGE_UID, isAiPersonaUid } from "@/lib/aiConciergeConfig";
import {
  CHALLENGE_PROTOCOL_NAME,
  CHALLENGE_PROTOCOL_UID,
} from "@/lib/internalSystemAccounts";
import { ensureAiConciergeUser } from "@/lib/aiConcierge";
import { getAiThreadKind } from "@/lib/aiPersonaInbox";
import {
  CHALLENGE_NOTICE_HEADLINES,
  addChallengeIdToInboxNotice,
  isChallengeInboxNoticeBody,
  summarizeChallengeInboxMessage,
} from "@/lib/challengeInboxMessages";
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
  status: "sent" | "delivered" | "read";
  deliveredAt: string | null;
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
  replyTo: {
    messageId: number;
    senderName: string;
    body: string;
  } | null;
  isPinned: boolean;
  editedAt: string | null;
  transcription: string | null;
  transcriptionStatus: string | null;
  translations: Array<{ language: string; text: string }>;
  replayCard: {
    id: number;
    players: string[];
    mapName: string | null;
    winner: string | null;
    durationSeconds: number | null;
    playedAt: string | null;
  } | null;
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
  messagePage: {
    hasMore: boolean;
    beforeMessageId: number | null;
  };
  draft: {
    body: string;
    replyToMessageId: number | null;
    updatedAt: string;
  } | null;
  pinnedMessages: InboxTextMessage[];
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

const COMMISSIONER_NOTICE_LOCK_NAMESPACE = 752_009;
const COMMISSIONER_NOTICE_DELIVERED_EVENT = "commissioner_notice_delivered";
const PROTOCOL_NOTICE_DELIVERED_EVENT = "protocol_notice_delivered";

type ChallengeNoticeMessageRow = {
  id: number;
  body: string | null;
  challengeId: number | null;
  createdAt: Date;
};

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
    const challengeSummary = summarizeChallengeInboxMessage(trimmedBody);
    if (challengeSummary) {
      return challengeSummary.compactLine.slice(0, 120);
    }

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

function challengeNoticeBodyWhere() {
  return {
    OR: Object.keys(CHALLENGE_NOTICE_HEADLINES).map((headline) => ({
      body: {
        startsWith: headline,
      },
    })),
  };
}

function pickLatestChallengeNotice(rows: ChallengeNoticeMessageRow[]) {
  return [...rows].sort((left, right) => {
    const timeDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (timeDelta !== 0) {
      return timeDelta;
    }

    return right.id - left.id;
  })[0] ?? null;
}

function challengeNoticeGroupKey(row: ChallengeNoticeMessageRow) {
  return row.challengeId ? `challenge:${row.challengeId}` : "legacy";
}

async function loadChallengeNoticeMessages(
  prisma: Pick<PrismaClient, "directMessage">,
  conversationId: number
) {
  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId,
      attachmentKind: null,
      attachmentName: null,
      attachmentMimeType: null,
      attachmentDataUrl: null,
      sharedLobbyMessageId: null,
      ...challengeNoticeBodyWhere(),
    },
    select: {
      id: true,
      body: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return rows
    .map((row) => {
      const notice = summarizeChallengeInboxMessage(row.body);
      if (!notice || !isChallengeInboxNoticeBody(row.body)) {
        return null;
      }

      return {
        ...row,
        challengeId: notice.challengeId,
      };
    })
    .filter((row): row is ChallengeNoticeMessageRow => row !== null);
}

async function collapseChallengeNoticeMessagesInConversation(
  prisma: Pick<PrismaClient, "directMessage">,
  conversationId: number,
  keepMessageId?: number | null
) {
  const noticeRows = await loadChallengeNoticeMessages(prisma, conversationId);
  if (noticeRows.length <= 1) {
    return 0;
  }

  const keepIds = new Set<number>();
  const explicitKeep = keepMessageId
    ? noticeRows.find((row) => row.id === keepMessageId)
    : null;
  const rowsByGroup = new Map<string, ChallengeNoticeMessageRow[]>();

  for (const row of noticeRows) {
    const groupKey = challengeNoticeGroupKey(row);
    rowsByGroup.set(groupKey, [...(rowsByGroup.get(groupKey) ?? []), row]);
  }

  for (const rows of rowsByGroup.values()) {
    const keep =
      explicitKeep && rows.some((row) => row.id === explicitKeep.id)
        ? explicitKeep
        : pickLatestChallengeNotice(rows);
    if (keep) {
      keepIds.add(keep.id);
    }
  }

  const redundantIds = noticeRows
    .filter((row) => !keepIds.has(row.id))
    .map((row) => row.id);

  if (redundantIds.length === 0) {
    return 0;
  }

  const result = await prisma.directMessage.deleteMany({
    where: {
      id: {
        in: redundantIds,
      },
    },
  });

  return result.count;
}

async function collapseChallengeNoticeMessagesForViewer(
  prisma: PrismaClient,
  viewerUserId: number
) {
  const memberships = await prisma.directConversationParticipant.findMany({
    where: {
      userId: viewerUserId,
    },
    select: {
      conversationId: true,
    },
  });

  for (const membership of memberships) {
    await collapseChallengeNoticeMessagesInConversation(prisma, membership.conversationId);
  }
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

  // `skipDuplicates` compiles to ON CONFLICT DO NOTHING on PostgreSQL.  Unlike
  // catching P2002, this remains safe inside the interactive transactions used
  // by challenge actions: a simultaneous first message cannot abort the whole
  // acceptance/funding/check-in transaction.
  await prisma.directConversation.createMany({
    data: [{ pairKey }],
    skipDuplicates: true,
  });
  const conversation = await prisma.directConversation.findUnique({
    where: { pairKey },
    select: { id: true },
  });
  if (!conversation) {
    throw new Error("Direct conversation could not be created.");
  }

  await prisma.directConversationParticipant.createMany({
    data: [
      { conversationId: conversation.id, userId: leftUserId },
      { conversationId: conversation.id, userId: rightUserId },
    ],
    skipDuplicates: true,
  });

  return prisma.directConversation.update({
    where: { pairKey },
    data: { updatedAt: new Date() },
    include: { participants: true },
  });
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

export async function postChallengeInboxNotice(
  prisma: DirectInboxWriteClient,
  {
    senderUserId,
    targetUserId,
    body,
    challengeId,
    now = new Date(),
  }: {
    senderUserId: number;
    targetUserId: number;
    body: string;
    challengeId?: number | null;
    now?: Date;
  }
) {
  const normalizedBody = normalizeInboxMessageBody(
    addChallengeIdToInboxNotice(body, challengeId)
  );
  if (!normalizedBody || !summarizeChallengeInboxMessage(normalizedBody)) {
    throw new Error("Challenge inbox notice body is not recognized.");
  }

  const conversation = await getOrCreateConversationByUsers(
    prisma,
    senderUserId,
    targetUserId
  );

  const existingNotices = await loadChallengeNoticeMessages(prisma, conversation.id);
  const sameChallengeNotice =
    typeof challengeId === "number" && Number.isFinite(challengeId)
      ? pickLatestChallengeNotice(existingNotices.filter((notice) => notice.challengeId === challengeId))
      : null;
  const existingNotice =
    sameChallengeNotice ||
    pickLatestChallengeNotice(existingNotices.filter((notice) => notice.challengeId === null));

  // Replace an updated Challenge card with a fresh message id. Message history
  // paginates by id, so mutating an old row's createdAt could otherwise make an
  // unread update invisible from the latest page.
  const message = await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderUserId,
      body: normalizedBody,
      createdAt: now,
    },
    select: {
      id: true,
    },
  });
  if (existingNotice) {
    await prisma.directMessage.delete({ where: { id: existingNotice.id } });
  }

  if (sameChallengeNotice === null && existingNotice?.challengeId === null && challengeId) {
    const legacyIds = existingNotices
      .filter((notice) => notice.challengeId === null && notice.id !== message.id)
      .map((notice) => notice.id);
    if (legacyIds.length) {
      await prisma.directMessage.deleteMany({
        where: {
          id: {
            in: legacyIds,
          },
        },
      });
    }
  }

  await collapseChallengeNoticeMessagesInConversation(prisma, conversation.id, message.id);

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

/**
 * Deliver a reserved Challenge Protocol card to both duelists. The activity
 * receipt makes retries idempotent; ordinary chat authors cannot forge the
 * recognized card headline because the message route rejects it.
 */
export async function postChallengeProtocolNoticeToParticipants(
  prisma: PrismaClient,
  input: {
    challengeId: number;
    body: string;
    deliveryKey: string;
    now?: Date;
  }
) {
  if (!Number.isSafeInteger(input.challengeId) || input.challengeId <= 0) {
    return [];
  }
  if (!summarizeChallengeInboxMessage(input.body)) {
    throw new Error("Challenge Protocol notice body is not recognized.");
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ${COMMISSIONER_NOTICE_LOCK_NAMESPACE},
        ${input.challengeId}
      )
    `;

    const match = await tx.scheduledMatch.findUnique({
      where: { id: input.challengeId },
      select: {
        challengerUserId: true,
        challengedUserId: true,
      },
    });
    if (!match) return [];

    const protocolSender =
      (await tx.user.findUnique({
        where: { uid: CHALLENGE_PROTOCOL_UID },
        select: { id: true },
      })) ??
      (await tx.user.upsert({
        where: { uid: CHALLENGE_PROTOCOL_UID },
        update: {},
        create: {
          uid: CHALLENGE_PROTOCOL_UID,
          verified: true,
          lockName: true,
          verificationLevel: 1,
          verificationMethod: "system",
          steamPersonaName: CHALLENGE_PROTOCOL_NAME,
        },
        select: { id: true },
      }));

    const delivered: number[] = [];
    for (const targetUserId of [
      match.challengerUserId,
      match.challengedUserId,
    ]) {
      const recipientDeliveryKey = `${input.deliveryKey}:${targetUserId}`;
      const existing = await tx.scheduledMatchActivity.findFirst({
        where: {
          scheduledMatchId: input.challengeId,
          eventType: PROTOCOL_NOTICE_DELIVERED_EVENT,
          metadata: {
            path: ["deliveryKey"],
            equals: recipientDeliveryKey,
          },
        },
        select: { id: true },
      });
      if (existing) continue;

      await postChallengeInboxNotice(tx, {
        senderUserId: protocolSender.id,
        targetUserId,
        challengeId: input.challengeId,
        body: input.body,
        now: input.now ?? new Date(),
      });
      await tx.scheduledMatchActivity.create({
        data: {
          scheduledMatchId: input.challengeId,
          eventType: PROTOCOL_NOTICE_DELIVERED_EVENT,
          detail: "Challenge Protocol notice delivered to a duelist.",
          metadata: {
            deliveryKey: recipientDeliveryKey,
            targetUserId,
            source: "challenge_protocol",
          },
          createdAt: input.now,
        },
      });
      delivered.push(targetUserId);
    }

    return delivered;
  });
}

export async function postChallengeCommissionerNotice(
  prisma: PrismaClient,
  challengeId: number
) {
  if (!Number.isSafeInteger(challengeId) || challengeId <= 0) {
    return null;
  }

  const configuredCommissionerUid = process.env.CHALLENGE_COMMISSIONER_UID?.trim() || null;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT pg_advisory_xact_lock(
        ${COMMISSIONER_NOTICE_LOCK_NAMESPACE},
        ${challengeId}
      )
    `;

    const admins = await tx.user.findMany({
      where: configuredCommissionerUid
        ? { uid: configuredCommissionerUid, isAdmin: true }
        : { isAdmin: true },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const commissioner =
      (configuredCommissionerUid
        ? admins[0]
        : admins.find((admin) =>
            [admin.inGameName, admin.steamPersonaName]
              .filter(Boolean)
              .some((value) => value?.trim().toLowerCase() === "emaren")
          )) ?? null;

    if (!commissioner) {
      return null;
    }

    const protocolSender =
      (await tx.user.findUnique({
        where: { uid: CHALLENGE_PROTOCOL_UID },
        select: { id: true },
      })) ??
      (await tx.user.upsert({
        where: { uid: CHALLENGE_PROTOCOL_UID },
        update: {},
        create: {
          uid: CHALLENGE_PROTOCOL_UID,
          verified: true,
          lockName: true,
          verificationLevel: 1,
          verificationMethod: "system",
          steamPersonaName: CHALLENGE_PROTOCOL_NAME,
        },
        select: { id: true },
      }));

    const match = await tx.scheduledMatch.findUnique({
      where: { id: challengeId },
      select: {
        status: true,
        wagerAmountWolo: true,
        guaranteeAmountWolo: true,
        updatedAt: true,
        challengerUserId: true,
        challengedUserId: true,
        challenger: { select: { uid: true, inGameName: true, steamPersonaName: true } },
        challenged: { select: { uid: true, inGameName: true, steamPersonaName: true } },
      },
    });
    if (
      !match ||
      commissioner.id === match.challengerUserId ||
      commissioner.id === match.challengedUserId
    ) {
      return null;
    }

    const deliveryKey = [
      match.updatedAt.toISOString(),
      match.status,
      commissioner.uid,
    ].join("|");
    const existingDelivery = await tx.scheduledMatchActivity.findFirst({
      where: {
        scheduledMatchId: challengeId,
        eventType: COMMISSIONER_NOTICE_DELIVERED_EVENT,
        metadata: {
          path: ["deliveryKey"],
          equals: deliveryKey,
        },
      },
      select: { id: true },
    });
    if (existingDelivery) {
      return null;
    }

    const normalizedStatus = match.status.trim().toLowerCase();
    const headline =
      normalizedStatus === "desync_review"
        ? "Challenge desync confirmed"
        : normalizedStatus === "declined"
        ? "Challenge declined"
        : ["cancelled", "canceled"].includes(normalizedStatus)
          ? "Challenge cancelled"
          : normalizedStatus === "expired"
            ? "Challenge expired"
            : normalizedStatus === "funding_expired"
              ? "Challenge funding expired"
              : normalizedStatus === "refunded"
                ? "Challenge refunded"
                : ["no_show_left", "no_show_right", "double_no_show"].includes(normalizedStatus)
                  ? "Challenge no-show resolved"
                  : normalizedStatus === "completed"
                    ? "Challenge result ready"
                    : ["left_checked_in", "right_checked_in"].includes(normalizedStatus)
                      ? "Challenge check-in recorded"
                      : ["funded", "ready", "live_confirmed"].includes(normalizedStatus)
                        ? "Challenge ready"
                        : ["terms_accepted", "accepted"].includes(normalizedStatus)
                          ? "Challenge terms accepted"
                          : ["creator_funded", "opponent_funded"].includes(normalizedStatus)
                            ? "Challenge funding recorded"
                            : "Challenge issued";
    const challengerName = displayNameForUser(match.challenger);
    const challengedName = displayNameForUser(match.challenged);
    const totalWolo = match.wagerAmountWolo + match.guaranteeAmountWolo;
    const body = [
      headline,
      `${challengerName} vs ${challengedName}`,
      `Funding: ${totalWolo.toLocaleString("en-US")} WOLO each`,
      `Status: Commissioner update · ${normalizedStatus.replaceAll("_", " ")}`,
    ].join("\n");

    const conversation = await postChallengeInboxNotice(tx, {
      senderUserId: protocolSender.id,
      targetUserId: commissioner.id,
      challengeId,
      body,
      now: match.updatedAt,
    });

    await tx.scheduledMatchActivity.create({
      data: {
        scheduledMatchId: challengeId,
        actorUserId: null,
        eventType: COMMISSIONER_NOTICE_DELIVERED_EVENT,
        detail: `Commissioner notice delivered to ${commissioner.uid}.`.slice(0, 255),
        metadata: {
          deliveryKey,
          matchUpdatedAt: match.updatedAt.toISOString(),
          matchStatus: match.status,
          commissionerUid: commissioner.uid,
        },
      },
    });

    return conversation;
  });
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
  const [memberships, directoryUsers] = await Promise.all([
    prisma.directConversationParticipant.findMany({
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
    }),
    prisma.user.findMany({
      where: {
        id: { not: viewerUserId },
        verificationMethod: { not: "system" },
      },
      select: {
        id: true,
        uid: true,
        isAdmin: true,
        inGameName: true,
        steamPersonaName: true,
        lastSeen: true,
        createdAt: true,
      },
      orderBy: [{ lastSeen: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  // AI personas remain opt-in/system-managed threads. Every real signed-in
  // person is discoverable immediately without pre-creating an O(n^2) set of
  // empty conversations.
  const availableHumanUsers = directoryUsers.filter((user) => !isAiPersonaUid(user.uid));

  const counterpartLastReadAt = new Map<number, Date | null>();
  const existingCounterpartIds = memberships
    .map((membership) => {
      const counterpartParticipant = resolveCounterpartParticipant(membership, viewerUserId);
      if (!counterpartParticipant) {
        return null;
      }
      counterpartLastReadAt.set(counterpartParticipant.userId, membership.lastReadAt);
      return counterpartParticipant.userId;
    })
    .filter((value): value is number => typeof value === "number");
  const communityUserIds = Array.from(
    new Set([...existingCounterpartIds, ...availableHumanUsers.map((user) => user.id)])
  );

  const [communityMap, unreadMessageCountMap, honorSummaryMap] = await Promise.all([
    loadUserCommunitySummaries(prisma, communityUserIds),
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

  const existingSummaries = summaries.filter(
    (summary): summary is NonNullable<typeof summary> => summary !== null
  );
  const existingCounterpartIdSet = new Set(existingCounterpartIds);
  const availableSummaries = availableHumanUsers
    .filter((user) => !existingCounterpartIdSet.has(user.id))
    .map((user) => {
      const community = communityMap.get(user.id) ?? {
        badges: [],
        gifts: [],
        giftedWolo: 0,
      };

      return {
        targetUid: user.uid,
        displayName: displayNameForUser(user),
        threadKind: "direct" as const,
        isAdmin: user.isAdmin,
        unreadCount: 0,
        lastMessageAt: null,
        lastMessageSnippet: null,
        badges: community.badges,
        giftedWolo: community.giftedWolo,
      } satisfies InboxSummary;
    });

  return [...existingSummaries, ...availableSummaries]
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
  targetUserId: number,
  options?: { beforeMessageId?: number | null; limit?: number }
) {
  const conversation = await prisma.directConversation.findUnique({
    where: { pairKey: buildPairKey(viewerUserId, targetUserId) },
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
    },
  });

  if (!conversation) {
    return {
      conversation: null,
      messages: [] as InboxMessage[],
      counterpart: null as InboxCounterpart | null,
      counterpartLastReadAt: null as string | null,
      counterpartTyping: false,
      messagePage: { hasMore: false, beforeMessageId: null as number | null },
      draft: null,
      pinnedMessages: [] as InboxTextMessage[],
    };
  }

  const limit = Math.min(Math.max(options?.limit ?? 80, 20), 120);
  const rows = await prisma.directMessage.findMany({
    where: {
      conversationId: conversation.id,
      ...(options?.beforeMessageId ? { id: { lt: options.beforeMessageId } } : {}),
    },
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      senderUserId: true,
      body: true,
      attachmentKind: true,
      attachmentName: true,
      attachmentMimeType: true,
      attachmentDurationSeconds: true,
      sharedLobbyMessageId: true,
      replyToMessageId: true,
      deliveredAt: true,
      editedAt: true,
      transcription: true,
      transcriptionStatus: true,
      createdAt: true,
      replyTo: {
        select: {
          id: true,
          body: true,
          attachmentKind: true,
          sender: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
      reactions: { select: { emoji: true, userId: true } },
      pins: { where: { conversationId: conversation.id }, select: { id: true } },
      translations: { orderBy: { updatedAt: "desc" }, take: 4, select: { language: true, text: true } },
    },
  });
  const hasMore = rows.length > limit;
  const orderedMessages = rows.slice(0, limit).reverse();

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

  const [badges, gifts, draft, pinnedRows] = await Promise.all([
    options?.beforeMessageId ? Promise.resolve([]) : prisma.userBadge.findMany({
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
    options?.beforeMessageId ? Promise.resolve([]) : prisma.userGift.findMany({
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
    prisma.directMessageDraft.findUnique({
      where: {
        conversationId_userId: { conversationId: conversation.id, userId: viewerUserId },
      },
      select: { body: true, replyToMessageId: true, updatedAt: true },
    }),
    prisma.directMessage.findMany({
      where: { conversationId: conversation.id, pins: { some: {} } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 12,
      select: {
        id: true,
        senderUserId: true,
        body: true,
        attachmentKind: true,
        attachmentName: true,
        attachmentMimeType: true,
        attachmentDurationSeconds: true,
        sharedLobbyMessageId: true,
        replyToMessageId: true,
        deliveredAt: true,
        editedAt: true,
        transcription: true,
        transcriptionStatus: true,
        createdAt: true,
        replyTo: { select: { id: true, body: true, attachmentKind: true, sender: { select: { uid: true, inGameName: true, steamPersonaName: true } } } },
        reactions: { select: { emoji: true, userId: true } },
        pins: { select: { id: true } },
        translations: { orderBy: { updatedAt: "desc" }, take: 4, select: { language: true, text: true } },
      },
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
  const replayIds = Array.from(new Set([...orderedMessages, ...pinnedRows].flatMap((message) => {
    const matches = Array.from((message.body ?? "").matchAll(/\/game-stats\/(\d+)/g));
    return matches.map((match) => Number(match[1])).filter(Number.isFinite);
  })));
  const replayRows = replayIds.length
    ? await prisma.gameStats.findMany({
        where: { id: { in: replayIds } },
        select: { id: true, players: true, map: true, winner: true, duration: true, game_duration: true, played_on: true, timestamp: true },
      })
    : [];
  const replayMap = new Map(replayRows.map((row) => [row.id, row]));

  const serializeMessage = (message: (typeof orderedMessages)[number]): InboxTextMessage => {
    const sender = conversation.participants.find(
      (participant) => participant.userId === message.senderUserId
    )?.user;
    const senderCommunity =
      sender && senderCommunityMap.get(sender.id)
        ? senderCommunityMap.get(sender.id)
        : { badges: [], gifts: [], giftedWolo: 0 };

    const isOutgoing = sender?.id === viewerUserId;
    const readAt = isOutgoing && counterpartParticipant?.lastReadAt && counterpartParticipant.lastReadAt >= message.createdAt
      ? counterpartParticipant.lastReadAt.toISOString()
      : null;
    const replayIdMatch = message.body?.match(/\/game-stats\/(\d+)/);
    const replay = replayIdMatch ? replayMap.get(Number(replayIdMatch[1])) : null;
    const replayPlayers = replay && Array.isArray(replay.players)
      ? replay.players.map((player) => typeof player === "string" ? player : player && typeof player === "object" && "name" in player ? String(player.name) : "").filter(Boolean).slice(0, 8)
      : [];
    const replayMapName = replay && typeof replay.map === "string"
      ? replay.map
      : replay?.map && typeof replay.map === "object" && "name" in replay.map
        ? String(replay.map.name || "") || null
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
      replyTo: message.replyTo ? {
        messageId: message.replyTo.id,
        senderName: displayNameForUser(message.replyTo.sender),
        body: message.replyTo.body?.trim() || (message.replyTo.attachmentKind === "audio" ? "Voice note" : "Attachment"),
      } : null,
      isPinned: message.pins.length > 0,
      editedAt: message.editedAt?.toISOString() ?? null,
      transcription: message.transcription ?? null,
      transcriptionStatus: message.transcriptionStatus ?? null,
      translations: message.translations,
      replayCard: replay ? {
        id: replay.id,
        players: replayPlayers,
        mapName: replayMapName,
        winner: replay.winner ?? null,
        durationSeconds: replay.duration ?? replay.game_duration ?? null,
        playedAt: (replay.played_on ?? replay.timestamp)?.toISOString() ?? null,
      } : null,
      receipt: isOutgoing ? {
        status: readAt ? "read" : message.deliveredAt ? "delivered" : "sent",
        deliveredAt: message.deliveredAt?.toISOString() ?? null,
        readAt,
      } : null,
    };
  };

  const messageEvents: InboxMessage[] = orderedMessages.map(serializeMessage);

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
    messagePage: {
      hasMore,
      beforeMessageId: hasMore && orderedMessages[0] ? orderedMessages[0].id : null,
    },
    draft: draft ? {
      body: draft.body ?? "",
      replyToMessageId: draft.replyToMessageId ?? null,
      updatedAt: draft.updatedAt.toISOString(),
    } : null,
    pinnedMessages: pinnedRows.map(serializeMessage),
  };
}

async function markConversationRead(
  prisma: PrismaClient,
  viewerUserId: number,
  targetUserId: number
) {
  const conversation = await prisma.directConversation.findUnique({
    where: { pairKey: buildPairKey(viewerUserId, targetUserId) },
    select: {
      id: true,
      participants: {
        where: { userId: viewerUserId },
        take: 1,
        select: { lastReadAt: true },
      },
    },
  });

  if (!conversation) {
    return false;
  }

  const currentLastReadAt =
    conversation.participants[0]?.lastReadAt ?? null;

  // Freeze the read boundary before checking for unread activity.
  // Activity arriving after this instant stays unread.
  const readUpperBound = new Date();

  const createdAtWindow = currentLastReadAt
    ? {
        gt: currentLastReadAt,
        lte: readUpperBound,
      }
    : {
        lte: readUpperBound,
      };

  const [unreadMessage, unreadBadge, unreadGift] =
    await Promise.all([
      prisma.directMessage.findFirst({
        where: {
          conversationId: conversation.id,
          senderUserId: targetUserId,
          createdAt: createdAtWindow,
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: { id: true },
      }),
      prisma.userBadge.findFirst({
        where: {
          userId: viewerUserId,
          createdByUserId: targetUserId,
          createdAt: createdAtWindow,
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: { id: true },
      }),
      prisma.userGift.findFirst({
        where: {
          userId: viewerUserId,
          createdByUserId: targetUserId,
          createdAt: createdAtWindow,
        },
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        select: { id: true },
      }),
    ]);

  const hasUnreadActivity = Boolean(
    unreadMessage ||
    unreadBadge ||
    unreadGift
  );

  const markDelivered =
    prisma.directMessage.updateMany({
      where: {
        conversationId: conversation.id,
        senderUserId: targetUserId,
        deliveredAt: null,
      },
      data: {
        deliveredAt: readUpperBound,
      },
    });

  // Reopening an already-read thread must not turn lastReadAt
  // into a generic "last opened" timestamp.
  if (!hasUnreadActivity) {
    await markDelivered;
    return false;
  }

  await prisma.$transaction([
    prisma.directConversationParticipant.updateMany({
      where: {
        conversationId: conversation.id,
        userId: viewerUserId,
      },
      data: {
        lastReadAt: readUpperBound,
      },
    }),
    markDelivered,
  ]);

  return true;
}

export async function resolveInboxTargetForViewer(
  prisma: PrismaClient,
  viewer: ViewerUser,
  targetUid: string | null | undefined
): Promise<ViewerUser | null> {
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
      verificationMethod: true,
    },
  });

  if (!targetUser || targetUser.id === viewer.id) {
    return null;
  }

  if (
    viewer.isAdmin ||
    (targetUser.verificationMethod !== "system" && !isAiPersonaUid(targetUser.uid))
  ) {
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
    beforeMessageId?: number | null;
    messageLimit?: number;
    challengeId?: number | null;
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

  await collapseChallengeNoticeMessagesForViewer(prisma, viewer.id);

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
      ? await loadChallengeThreadTile(
          prisma,
          viewer.id,
          activeTargetUser.id,
          options?.challengeId
        )
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
      messagePage: { hasMore: false, beforeMessageId: null },
      draft: null,
      pinnedMessages: [],
      unavailableReason,
      conversation: null,
    };
  }

  const activeConversation = await loadConversationMessages(prisma, viewer.id, activeTargetUser.id, {
    beforeMessageId: options?.beforeMessageId,
    limit: options?.messageLimit,
  });

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
      messagePage: { hasMore: false, beforeMessageId: null },
      draft: null,
      pinnedMessages: [],
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
    messagePage: activeConversation.messagePage,
    draft: activeConversation.draft,
    pinnedMessages: activeConversation.pinnedMessages,
    unavailableReason,
    conversation: {
      counterpartLastReadAt: activeConversation.counterpartLastReadAt,
      counterpartTyping: activeConversation.counterpartTyping,
    },
  };
}
