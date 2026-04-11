import type {
  MarketRailRow,
  MarketRailSummary,
} from "@/components/admin/WoloMarketRail";
import type {
  SettlementRailRow,
  SettlementRailSummary,
} from "@/components/admin/WoloSettlementRail";

export type FounderBonusType = "participants" | "winner";

export type Badge = {
  id: number;
  label: string;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

export type GiftRow = {
  id: number;
  kind: string;
  amount: number | null;
  note: string | null;
  status: string;
  displayOnProfile: boolean;
  acceptedAt: string | null;
  createdAt: string;
};

export type ClaimRow = {
  id: number;
  displayPlayerName: string;
  normalizedPlayerName: string;
  amountWolo: number;
  status: string;
  note: string | null;
  createdAt: string;
  claimedAt: string | null;
  rescindedAt: string | null;
  sourceMarketId: number | null;
  sourceGameStatsId: number | null;
};

export type Appearance = {
  themeKey: string;
  tileThemeKey: string;
  viewMode: string;
  textColor: string;
  timeDisplayMode: string;
  timezoneOverride: string | null;
  updatedAt: string | null;
};

export type Activity = {
  id: number;
  type: string;
  path: string | null;
  label: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ScheduledMatchSummary = {
  id: number;
  status: string;
  role: "challenger" | "challenged";
  opponentName: string;
  opponentUid: string;
  scheduledAt: string;
  activityAt: string;
  linkedMapName: string | null;
  linkedWinner: string | null;
};

export type BetLedgerRow = {
  id: number;
  marketId: number;
  marketTitle: string;
  eventLabel: string;
  side: string;
  amountWolo: number;
  payoutWolo: number | null;
  status: string;
  executionMode: string;
  stakeTxHash: string | null;
  stakeWalletAddress: string | null;
  stakeLockedAt: string | null;
  createdAt: string;
  updatedAt: string;
  settledAt: string | null;
};

export type BetStats = {
  activeCount: number;
  wonCount: number;
  lostCount: number;
  stakedWolo: number;
  paidOutWolo: number;
};

export type AdminUserRow = {
  uid: string;
  email: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
  steamId: string | null;
  displayName: string;
  verified: boolean;
  verificationLevel: number;
  createdAt: string;
  lastSeen: string | null;
  isAdmin: boolean;
  badges: Badge[];
  giftedWolo: number;
  gifts: GiftRow[];
  unreadCount: number;
  userUnreadCount: number;
  lastInboxReadAt: string | null;
  adminLastInboxReadAt: string | null;
  appearance: Appearance | null;
  recentActions: Activity[];
  recentActionsTotalCount: number;
  lastActivityAt: string | null;
  pendingBadgeCount: number;
  pendingGiftCount: number;
  pendingWoloClaims: ClaimRow[];
  pendingWoloClaimCount: number;
  pendingWoloClaimAmount: number;
  claimedWoloClaims: ClaimRow[];
  claimedWoloClaimCount: number;
  claimedWoloClaimAmount: number;
  rescindedWoloClaims: ClaimRow[];
  scheduledMatches: ScheduledMatchSummary[];
  betLedger: BetLedgerRow[];
  betStats: BetStats;
};

export type AdminOverview = {
  totalUsers: number;
  activeUsers24h: number;
  unreadForAdmin: number;
  unreadForUsers: number;
  pendingHonors: number;
  pendingWoloClaims: number;
  pendingWoloClaimAmount: number;
  claimedWoloClaims: number;
  claimedWoloClaimAmount: number;
  totalActionEvents: number;
  themeBreakdown: Array<{ themeKey: string; count: number }>;
  viewBreakdown: Array<{ viewMode: string; count: number }>;
};

export type WatcherDownloadSummaryRow = {
  key: string;
  platform: "windows" | "macos" | "linux";
  title: string;
  shortLabel: string;
  format: string;
  totalCount: number;
  likelyExternalCount: number;
  likelyInternalTestCount: number;
  last24Hours: number;
  last7Days: number;
};

export type WatcherDownloadRecentRow = {
  id: number;
  createdAt: string;
  platform: "windows" | "macos" | "linux";
  artifact: string;
  title: string;
  format: string;
  version: string;
  filename: string;
  ipAddress: string | null;
  userAgent: string | null;
  referer: string | null;
  trafficClass: "external" | "internal_test";
  userUid: string | null;
  userDisplayName: string | null;
};

export type WatcherDownloadsPayload = {
  summary: {
    totalCount: number;
    likelyExternalCount: number;
    likelyInternalTestCount: number;
    last24Hours: number;
    last7Days: number;
    rows: WatcherDownloadSummaryRow[];
  };
  recent: WatcherDownloadRecentRow[];
};

export type AdminUsersPayload = {
  users: AdminUserRow[];
  overview: AdminOverview;
  settlementRail: {
    summary: SettlementRailSummary;
    rows: SettlementRailRow[];
  };
  marketRail: {
    summary: MarketRailSummary;
    rows: MarketRailRow[];
  };
  watcherDownloads: WatcherDownloadsPayload;
};

export type ActivityHistoryPayload = {
  items: Activity[];
  total: number;
  nextOffset: number | null;
};

export type ReconcilePendingClaimsPayload = {
  ok: boolean;
  summary: {
    scannedCount: number;
    claimedCount: number;
    claimedAmountWolo: number;
    failedCount: number;
    skippedUnmatchedCount: number;
    skippedHasTxHashCount: number;
  };
};

export type AdminUserLiveRow = Pick<
  AdminUserRow,
  | "uid"
  | "displayName"
  | "lastSeen"
  | "unreadCount"
  | "userUnreadCount"
  | "lastInboxReadAt"
  | "adminLastInboxReadAt"
  | "recentActions"
  | "recentActionsTotalCount"
  | "lastActivityAt"
  | "pendingBadgeCount"
  | "pendingGiftCount"
  | "pendingWoloClaimCount"
  | "pendingWoloClaimAmount"
  | "giftedWolo"
>;

export type AdminUsersLivePayload = {
  overview: AdminOverview;
  users: AdminUserLiveRow[];
};

export type AdminUsersRailsPayload = Pick<
  AdminUsersPayload,
  "marketRail" | "settlementRail" | "watcherDownloads"
>;

export type DraftState = {
  customBadge: string;
  giftKind: string;
  giftAmount: string;
  giftNote: string;
  rescindNote: string;
};

export type FounderComposerState = {
  marketId: number;
  marketTitle: string;
  bonusType: FounderBonusType;
  amountValue: string;
  noteValue: string;
};
