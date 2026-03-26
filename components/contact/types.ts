export type ContactBadge = {
  id: number;
  label: string;
  note: string | null;
  createdAt: string;
};

export type ContactInboxSummary = {
  targetUid: string;
  displayName: string;
  isAdmin: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessageSnippet: string | null;
  badges: ContactBadge[];
  giftedWolo: number;
};

export type ContactInboxMessage = {
  id: number;
  body: string;
  createdAt: string;
  sender: {
    uid: string;
    displayName: string;
    isAdmin: boolean;
    badges: ContactBadge[];
  };
};

export type ContactInboxCounterpart = {
  uid: string;
  displayName: string;
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
  messages: ContactInboxMessage[];
  unavailableReason: string | null;
};
