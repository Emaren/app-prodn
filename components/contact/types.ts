import type { ScheduledMatchTile } from "@/lib/challenges";

export type ContactChallengeActionKind =
  | "accept"
  | "decline"
  | "cancel"
  | "reschedule";

export type ContactChallengeActionState = {
  challengeId: number | null;
  action: ContactChallengeActionKind | null;
};

export type ContactBadge = {
  id: number;
  label: string;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

export type ContactGift = {
  id: number;
  kind: string;
  amount: number | null;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

export type ContactInboxSummary = {
  targetUid: string;
  displayName: string;
  threadKind: "direct" | "ai";
  isAdmin: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageSnippet: string | null;
  badges: ContactBadge[];
  giftedWolo: number;
};

export type ContactMessageReaction = {
  emoji: string;
  count: number;
  viewerReacted: boolean;
};

export type ContactMessageAttachment = {
  kind: "image" | "audio";
  name: string | null;
  mimeType: string | null;
  url: string;
  durationSeconds: number | null;
};

type ContactInboxSender = {
  uid: string;
  displayName: string;
  isAdmin: boolean;
  badges: ContactBadge[];
};

type ContactInboxReceipt = {
  status: "sent" | "read";
  readAt: string | null;
};

export type ContactTextMessage = {
  id: string;
  messageId: number;
  kind: "text";
  createdAt: string;
  sender: ContactInboxSender;
  receipt: ContactInboxReceipt | null;
  body: string;
  attachment: ContactMessageAttachment | null;
  reactions: ContactMessageReaction[];
  sharedLobbyMessageId: number | null;
};

export type ContactBadgeMessage = {
  id: string;
  kind: "badge";
  createdAt: string;
  sender: ContactInboxSender;
  receipt: null;
  badge: ContactBadge;
};

export type ContactGiftMessage = {
  id: string;
  kind: "gift";
  createdAt: string;
  sender: ContactInboxSender;
  receipt: null;
  gift: ContactGift;
};

export type ContactInboxMessage =
  | ContactTextMessage
  | ContactBadgeMessage
  | ContactGiftMessage;

export type ContactInboxCounterpart = {
  uid: string;
  displayName: string;
  threadKind: "direct" | "ai";
  isAdmin: boolean;
  badges: ContactBadge[];
  giftedWolo: number;
};

export type ContactInboxPayload = {
  viewer: {
    uid: string;
    displayName: string;
    isAdmin: boolean;
  };
  totalUnreadCount: number;
  summaries: ContactInboxSummary[];
  activeTargetUid: string | null;
  activeCounterpart: ContactInboxCounterpart | null;
  activeChallenge: ScheduledMatchTile | null;
  messages: ContactInboxMessage[];
  unavailableReason: string | null;
  conversation: {
    counterpartLastReadAt: string | null;
    counterpartTyping: boolean;
  } | null;
};
