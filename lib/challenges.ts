
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
import {
  buildChallengeEconomySurface,
  type ScheduledMatchDisplayState,
  type ScheduledMatchEconomySurface,
  type ScheduledMatchPersistedStatus,
} from "@/lib/challengeEconomy";
import {
  deriveChallengeLifecycle,
  deriveChallengeMoneyState,
  type ChallengeLifecyclePhase,
  type ChallengeMoneyState,
  type ChallengeTimingMode,
} from "@/lib/challengeLifecycle";
import {
  TERMINAL_TITLE_CHALLENGE_STATUSES,
  TITLE_RESULT_REVIEW_SETTLEMENT_STATUS,
  TITLE_RESULT_REVIEW_STATUS,
} from "@/lib/challengeTitlePolicy";
import {
  acquireChallengeDesyncAdvisoryLock,
  assertTitleTransferAllowed,
  assertWinnerSettlementAllowed,
  ChallengeDesyncError,
  loadDesyncIncidentsForSettlement,
} from "@/lib/desyncChallenge";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { loadLiveSessionSnapshot } from "@/lib/liveSessionSnapshot";
import { buildClaimedPlayerHref } from "@/lib/publicPlayers";
import {
  EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE,
  normalizeScheduledMatchViewerPreference,
  type ScheduledMatchViewerPreference,
} from "@/lib/scheduledMatchPreferences";
import {
  executeScheduledMatchSettlement,
  ScheduledMatchSettlementError,
} from "@/lib/scheduledMatchSettlements";
import {
  WOLO_CHAIN_ID,
  WOLO_CHALLENGE_ESCROW_ADDRESS,
} from "@/lib/woloChain";
import { userIsOnline } from "@/lib/userOnlinePresence";
const CHALLENGE_LOOKAHEAD_MS = 30 * 24 * 60 * 60 * 1000;
const CHALLENGE_HISTORY_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_RECENT_LINGER_MS = 15 * 60 * 1000;
const CHALLENGE_START_GRACE_MS = 60 * 1000;
const SESSION_MATCH_LOOKBACK_MS = 45 * 60 * 1000;
const SESSION_MATCH_LOOKAHEAD_MS = 8 * 60 * 60 * 1000;
const INITIAL_CHALLENGE_HISTORY_LIMIT = 24;
const EXPECTED_AUTOMATIC_SETTLEMENT_SKIP_CODES = new Set([
  "ALREADY_SETTLED",
  "PLAN_BLOCKED",
  "SETTLEMENT_UNCONFIGURED",
  "EXECUTION_IN_PROGRESS",
  "NO_FUNDING",
  "NO_TRANSFERS",
  "SETTLEMENT_REVIEW_ONLY",
  "DESYNC_WINNER_SETTLEMENT_BLOCKED",
]);
const ACTIVE_SCHEDULED_STATUSES = [
  "pending",
  "accepted",
  "proposed",
  "terms_accepted",
  "creator_funded",
  "opponent_funded",
  "funded",
  "left_checked_in",
  "right_checked_in",
  "ready",
  "live_confirmed",
  "desync_review",
] as const;
const RESOLVED_SCHEDULED_STATUSES = [
  "completed",
  "forfeited",
  "declined",
  "cancelled",
  "canceled",
  "expired",
  "funding_expired",
  "no_show_left",
  "no_show_right",
  "double_no_show",
  "refunded",
] as const;

type ChallengeUserRow = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  lastSeen: Date | null;
  walletAddress: string | null;
  isAdmin: boolean;
};

type ScheduledMatchRow = {
  id: number;
  status: string;
  scheduledAt: Date;
  timingMode: string;
  acceptBy: Date | null;
  fundBy: Date | null;
  playBy: Date | null;
  matchTime: Date | null;
  matchTimeProposedByUserId: number | null;
  matchTimeConfirmedAt: Date | null;
  expiredAt: Date | null;
  reconciledAt: Date | null;
  creationRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  cancelledAt: Date | null;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  challengerFundingTxHash: string | null;
  challengerFundingWalletAddress: string | null;
  challengerFundedAt: Date | null;
  challengedFundingTxHash: string | null;
  challengedFundingWalletAddress: string | null;
  challengedFundedAt: Date | null;
  challengerCheckedInAt: Date | null;
  challengedCheckedInAt: Date | null;
  liveConfirmedAt: Date | null;
  resultAt: Date | null;
  settlementReadyAt: Date | null;
  linkedSessionKey: string | null;
  linkedMapName: string | null;
  linkedWinner: string | null;
  linkedDurationSeconds: number | null;
  challengeNote: string | null;
  challenger: ChallengeUserRow;
  challenged: ChallengeUserRow;
  trophyChallenges: Array<{
    id: number;
    status: string;
    settlementStatus: string;
    trophy: {
      trophyId: string;
      displayName: string;
      kind: string;
      family: string;
      nftImageUri: string | null;
      chainStatus: string;
    };
  }>;
  settlements: Array<{
    status: string;
    action: string;
    amountWolo: number;
    txHash: string | null;
    executedAt: Date | null;
  }>;
  replayDesyncIncidents: Array<{
    id: number;
    gameStatsId: number;
    supersedesId: number | null;
    desyncOccurred: boolean;
    competitiveResultStatus: string;
    settlementDisposition: string;
    reviewerUidSnapshot: string;
    reviewerDisplayNameSnapshot: string;
    note: string | null;
    sourceReplayHash: string;
    sourceParseIteration: number;
    parserDesyncCandidate: boolean;
    createdAt: Date;
  }>;
};

type ComparableSession = {
  id: number;
  sessionKey: string;
  updatedAt: string;
  completedAt: string | null;
  mapName: string | null;
  winner: string | null;
  durationSeconds: number | null;
  players: Array<{ name: string }>;
  state: "live" | "completed";
};

export type ChallengePlayerSurface = {
  uid: string;
  href: string;
  name: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  isOnline: boolean;
};

export type ScheduledMatchTile = {
  id: number;
  status: ScheduledMatchPersistedStatus;
  displayState: ScheduledMatchDisplayState;
  lifecycle: {
    phase: ChallengeLifecyclePhase;
    timingMode: ChallengeTimingMode;
    terminal: boolean;
    active: boolean;
    awaitingActor: "opponent" | "creator" | "both" | null;
    deadlineAt: string | null;
    exactTime: string | null;
    canPlayAnytime: boolean;
  };
  money: {
    state: ChallengeMoneyState;
    label: string;
    executedWolo: number;
    plannedWolo: number;
    chainTxCount: number;
    netImpactWolo: number | null;
  };
  scheduledAt: string;
  acceptBy: string | null;
  fundBy: string | null;
  playBy: string | null;
  matchTime: string | null;
  matchTimeProposedByUid: string | null;
  matchTimeConfirmedAt: string | null;
  expiredAt: string | null;
  createdAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  cancelledAt: string | null;
  activityAt: string;
  challengeNote: string | null;
  terms: {
    wagerAmountWolo: number;
    guaranteeAmountWolo: number;
    totalFundingWolo: number;
  };
  viewerPreference: ScheduledMatchViewerPreference;
  economy: ScheduledMatchEconomySurface;
  challenger: ChallengePlayerSurface;
  challenged: ChallengePlayerSurface;
  linkedSessionKey: string | null;
  linkedSessionState: "live" | "completed" | null;
  linkedMapName: string | null;
  linkedWinner: string | null;
  durationSeconds: number | null;
  desyncIncident: {
    id: number;
    gameStatsId: number;
    supersedesId: number | null;
    desyncOccurred: boolean;
    competitiveResultStatus: string;
    settlementDisposition: string;
    reviewerUid: string;
    reviewerDisplayName: string;
    note: string | null;
    sourceReplayHash: string;
    sourceParseIteration: number;
    parserDesyncCandidate: boolean;
    createdAt: string;
  } | null;
  fundingRail: ChallengeFundingRailSurface;
  titleStakes: Array<{
    challengeId: number;
    trophyId: string;
    displayName: string;
    kind: string;
    family: string;
    imageUrl: string | null;
    status: string;
    settlementStatus: string;
    chainStatus: string;
  }>;
};

export type ChallengeFundingRailSurface = {
  chainId: string;
  escrowAddress: string | null;
  configured: boolean;
  proofMode: "wolochain_challenge_v1";
};

export type ChallengeActivityItem = {
  id: number;
  scheduledMatchId: number;
  eventType: string;
  detail: string | null;
  actorUid: string | null;
  actorName: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

export type ChallengeActivityRow = {
  id: number;
  scheduledMatchId: number;
  eventType: string;
  detail: string | null;
  createdAt: Date;
  metadata: unknown;
  actor: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName"> | null;
};

export type ChallengeRecordSummary = {
  wins: number;
  losses: number;
  pending: number;
  accepted: number;
  funded: number;
  ready: number;
  declined: number;
  cancelled: number;
  completed: number;
  forfeited: number;
  noShows: number;
  total: number;
};

export type ChallengeHubSnapshot = {
  viewer: ChallengePlayerSurface | null;
  historyScope: "global" | "participant";
  historyPage: {
    hasMore: boolean;
    nextCursor: number | null;
  };
  candidates: ChallengePlayerSurface[];
  scheduledMatches: ScheduledMatchTile[];
  historyMatches: ScheduledMatchTile[];
  activities: ChallengeActivityItem[];
  record: ChallengeRecordSummary;
  fundingRail: ChallengeFundingRailSurface;
  serverNow: string;
  updatedAt: string;
};

function buildChallengeFundingRailSurface(): ChallengeFundingRailSurface {
  const escrowAddress = WOLO_CHALLENGE_ESCROW_ADDRESS?.trim() || null;
  return {
    chainId: WOLO_CHAIN_ID,
    escrowAddress,
    configured: Boolean(escrowAddress),
    proofMode: "wolochain_challenge_v1",
  };
}

const CHALLENGE_PLAYER_SELECT = {
  id: true,
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  verified: true,
  verificationLevel: true,
  lastSeen: true,
  walletAddress: true,
  isAdmin: true,
} as const;

const SCHEDULED_MATCH_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
  timingMode: true,
  acceptBy: true,
  fundBy: true,
  playBy: true,
  matchTime: true,
  matchTimeProposedByUserId: true,
  matchTimeConfirmedAt: true,
  expiredAt: true,
  reconciledAt: true,
  creationRequestId: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  declinedAt: true,
  cancelledAt: true,
  wagerAmountWolo: true,
  guaranteeAmountWolo: true,
  challengerFundingTxHash: true,
  challengerFundingWalletAddress: true,
  challengerFundedAt: true,
  challengedFundingTxHash: true,
  challengedFundingWalletAddress: true,
  challengedFundedAt: true,
  challengerCheckedInAt: true,
  challengedCheckedInAt: true,
  liveConfirmedAt: true,
  resultAt: true,
  settlementReadyAt: true,
  linkedSessionKey: true,
  linkedMapName: true,
  linkedWinner: true,
  linkedDurationSeconds: true,
  challengeNote: true,
  challenger: {
    select: CHALLENGE_PLAYER_SELECT,
  },
  challenged: {
    select: CHALLENGE_PLAYER_SELECT,
  },
  trophyChallenges: {
    select: {
      id: true,
      status: true,
      settlementStatus: true,
      trophy: {
        select: {
          trophyId: true,
          displayName: true,
          kind: true,
          family: true,
          nftImageUri: true,
          chainStatus: true,
        },
      },
    },
    orderBy: {
      id: "asc",
    },
  },
  settlements: {
    select: {
      status: true,
      action: true,
      amountWolo: true,
      txHash: true,
      executedAt: true,
    },
    orderBy: {
      id: "asc",
    },
  },
  replayDesyncIncidents: {
    select: {
      id: true,
      gameStatsId: true,
      supersedesId: true,
      desyncOccurred: true,
      competitiveResultStatus: true,
      settlementDisposition: true,
      reviewerUidSnapshot: true,
      reviewerDisplayNameSnapshot: true,
      note: true,
      sourceReplayHash: true,
      sourceParseIteration: true,
      parserDesyncCandidate: true,
      createdAt: true,
    },
    orderBy: { id: "desc" },
    take: 1,
  },
} as const;

function emptyChallengeRecord(): ChallengeRecordSummary {
  return {
    wins: 0,
    losses: 0,
    pending: 0,
    accepted: 0,
    funded: 0,
    ready: 0,
    declined: 0,
    cancelled: 0,
    completed: 0,
    forfeited: 0,
    noShows: 0,
    total: 0,
  };
}

function normalizeNameKey(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function challengePlayerName(
  user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName">
) {
  return user.inGameName || user.steamPersonaName || user.uid;
}

function playerAliases(user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName">) {
  const values = [user.inGameName, user.steamPersonaName, user.uid]
    .map((value) => normalizeNameKey(value))
    .filter(Boolean);

  return Array.from(new Set(values));
}

function buildPlayerSurface(user: ChallengeUserRow): ChallengePlayerSurface {
  return {
    uid: user.uid,
    href: buildClaimedPlayerHref(user.uid),
    name: challengePlayerName(user),
    inGameName: user.inGameName,
    steamPersonaName: user.steamPersonaName,
    verified: user.verified,
    verificationLevel: user.verificationLevel,
    isOnline: userIsOnline(user.uid, user.lastSeen),
  };
}

function challengeActivityActorName(
  user: Pick<ChallengeUserRow, "uid" | "inGameName" | "steamPersonaName"> | null
) {
  if (!user) return null;
  return user.inGameName || user.steamPersonaName || user.uid;
}

function normalizeActivityMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function buildChallengeActivityItem(row: ChallengeActivityRow): ChallengeActivityItem {
  return {
    id: row.id,
    scheduledMatchId: row.scheduledMatchId,
    eventType: row.eventType,
    detail: row.detail ?? null,
    actorUid: row.actor?.uid ?? null,
    actorName: challengeActivityActorName(row.actor),
    createdAt: row.createdAt.toISOString(),
    metadata: normalizeActivityMetadata(row.metadata),
  };
}

async function loadPersistedChallengeActivityRows(
  prisma: PrismaClient,
  scheduledMatchIds: number[]
): Promise<ChallengeActivityItem[]> {
  if (scheduledMatchIds.length === 0) {
    return [];
  }

  const rows = await prisma.scheduledMatchActivity.findMany({
    where: {
      scheduledMatchId: {
        in: scheduledMatchIds,
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      scheduledMatchId: true,
      eventType: true,
      detail: true,
      createdAt: true,
      metadata: true,
      actor: {
        select: {
          uid: true,
          inGameName: true,
          steamPersonaName: true,
        },
      },
    },
  });

  return rows.map((row) =>
    buildChallengeActivityItem({
      ...row,
      actor: row.actor,
    })
  );
}

function formatChallengeWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

function buildTermsSummary(row: ScheduledMatchRow) {
  const total = row.wagerAmountWolo + row.guaranteeAmountWolo;
  if (total <= 0) {
    return null;
  }

  return `Wolo Wager ${formatChallengeWolo(row.wagerAmountWolo)} · Match Guarantee ${formatChallengeWolo(row.guaranteeAmountWolo)} · ${formatChallengeWolo(total)} each`;
}

function buildSyntheticChallengeActivities(rows: ScheduledMatchRow[]): ChallengeActivityItem[] {
  const items: ChallengeActivityItem[] = [];

  for (const row of rows) {
    const challengerName =
      row.challenger.inGameName || row.challenger.steamPersonaName || row.challenger.uid;
    const challengedName =
      row.challenged.inGameName || row.challenged.steamPersonaName || row.challenged.uid;
    const termsSummary = buildTermsSummary(row);

    items.push({
      id: row.id * 10_000 + 1,
      scheduledMatchId: row.id,
      eventType: "scheduled",
      detail: [
        `Scheduled for ${challengerName} vs ${challengedName}.`,
        termsSummary,
        row.challengeNote ? `Note: ${row.challengeNote}` : null,
      ]
        .filter(Boolean)
        .join(" "),
      actorUid: row.challenger.uid,
      actorName: challengePlayerName(row.challenger),
      createdAt: row.createdAt.toISOString(),
      metadata: {
        scheduledAt: row.scheduledAt.toISOString(),
        wagerAmountWolo: row.wagerAmountWolo,
        guaranteeAmountWolo: row.guaranteeAmountWolo,
      },
    });

    if (row.acceptedAt) {
      items.push({
        id: row.id * 10_000 + 2,
        scheduledMatchId: row.id,
        eventType: row.wagerAmountWolo + row.guaranteeAmountWolo > 0 ? "terms_accepted" : "accepted",
        detail:
          row.wagerAmountWolo + row.guaranteeAmountWolo > 0
            ? `Terms accepted. Creator funding is next for ${formatChallengeWolo(
                row.wagerAmountWolo + row.guaranteeAmountWolo
              )} WOLO.`
            : `Accepted for ${row.scheduledAt.toLocaleString()}.`,
        actorUid: row.challenged.uid,
        actorName: challengePlayerName(row.challenged),
        createdAt: row.acceptedAt.toISOString(),
        metadata: null,
      });
    }

    if (row.declinedAt) {
      items.push({
        id: row.id * 10_000 + 3,
        scheduledMatchId: row.id,
        eventType: "declined",
        detail: "Challenge declined.",
        actorUid: row.challenged.uid,
        actorName: challengePlayerName(row.challenged),
        createdAt: row.declinedAt.toISOString(),
        metadata: null,
      });
    }

    if (row.cancelledAt) {
      items.push({
        id: row.id * 10_000 + 4,
        scheduledMatchId: row.id,
        eventType: "canceled",
        detail: "Challenge cancelled.",
        actorUid: null,
        actorName: null,
        createdAt: row.cancelledAt.toISOString(),
        metadata: null,
      });
    }

    if (row.challengerFundedAt) {
      items.push({
        id: row.id * 10_000 + 5,
        scheduledMatchId: row.id,
        eventType: "creator_funded",
        detail: `Creator funding recorded for ${formatChallengeWolo(
          row.wagerAmountWolo + row.guaranteeAmountWolo
        )} WOLO.`,
        actorUid: row.challenger.uid,
        actorName: challengePlayerName(row.challenger),
        createdAt: row.challengerFundedAt.toISOString(),
        metadata: row.challengerFundingTxHash ? { fundingTxHash: row.challengerFundingTxHash } : null,
      });
    }

    if (row.challengedFundedAt) {
      items.push({
        id: row.id * 10_000 + 6,
        scheduledMatchId: row.id,
        eventType: "opponent_funded",
        detail: `Opponent funding recorded for ${formatChallengeWolo(
          row.wagerAmountWolo + row.guaranteeAmountWolo
        )} WOLO.`,
        actorUid: row.challenged.uid,
        actorName: challengePlayerName(row.challenged),
        createdAt: row.challengedFundedAt.toISOString(),
        metadata: row.challengedFundingTxHash ? { fundingTxHash: row.challengedFundingTxHash } : null,
      });
    }

    if (row.challengerCheckedInAt) {
      items.push({
        id: row.id * 10_000 + 7,
        scheduledMatchId: row.id,
        eventType: "left_checked_in",
        detail: `${challengerName} checked in before the lock.`,
        actorUid: row.challenger.uid,
        actorName: challengePlayerName(row.challenger),
        createdAt: row.challengerCheckedInAt.toISOString(),
        metadata: null,
      });
    }

    if (row.challengedCheckedInAt) {
      items.push({
        id: row.id * 10_000 + 8,
        scheduledMatchId: row.id,
        eventType: "right_checked_in",
        detail: `${challengedName} checked in before the lock.`,
        actorUid: row.challenged.uid,
        actorName: challengePlayerName(row.challenged),
        createdAt: row.challengedCheckedInAt.toISOString(),
        metadata: null,
      });
    }

    if (row.liveConfirmedAt) {
      items.push({
        id: row.id * 10_000 + 9,
        scheduledMatchId: row.id,
        eventType: "live_confirmed",
        detail: row.linkedSessionKey
          ? `Live session linked: ${row.linkedSessionKey}.`
          : "Live match confirmed.",
        actorUid: null,
        actorName: null,
        createdAt: row.liveConfirmedAt.toISOString(),
        metadata: row.linkedSessionKey ? { linkedSessionKey: row.linkedSessionKey } : null,
      });
    }

    if (row.resultAt && row.status === "completed") {
      items.push({
        id: row.id * 10_000 + 10,
        scheduledMatchId: row.id,
        eventType: "completed",
        detail: row.linkedWinner
          ? `Completed. Winner: ${row.linkedWinner}.`
          : "Completed and stored.",
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: row.linkedMapName
          ? { mapName: row.linkedMapName, linkedSessionKey: row.linkedSessionKey }
          : row.linkedSessionKey
            ? { linkedSessionKey: row.linkedSessionKey }
            : null,
      });
    }

    if (row.resultAt && row.status === "forfeited") {
      items.push({
        id: row.id * 10_000 + 11,
        scheduledMatchId: row.id,
        eventType: "forfeited",
        detail: "Marked forfeited after the start grace window passed.",
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: null,
      });
    }

    if (row.resultAt && row.status === "no_show_left") {
      items.push({
        id: row.id * 10_000 + 12,
        scheduledMatchId: row.id,
        eventType: "no_show_left",
        detail: `${challengerName} missed check-in. ${challengedName} is owed both Match Guarantees; both Wolo Wagers are queued to return.`,
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: null,
      });
    }

    if (row.resultAt && row.status === "no_show_right") {
      items.push({
        id: row.id * 10_000 + 13,
        scheduledMatchId: row.id,
        eventType: "no_show_right",
        detail: `${challengedName} missed check-in. ${challengerName} is owed both Match Guarantees; both Wolo Wagers are queued to return.`,
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: null,
      });
    }

    if (row.resultAt && row.status === "double_no_show") {
      items.push({
        id: row.id * 10_000 + 14,
        scheduledMatchId: row.id,
        eventType: "double_no_show",
        detail: "Both players missed the check-in lock. Match Guarantees are owed to Community Treasury; both Wolo Wagers are queued to return.",
        actorUid: null,
        actorName: null,
        createdAt: row.resultAt.toISOString(),
        metadata: null,
      });
    }
  }

  items.sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );

  return items;
}

async function loadChallengeActivityRows(
  prisma: PrismaClient,
  rows: ScheduledMatchRow[]
): Promise<ChallengeActivityItem[]> {
  const scheduledMatchIds = rows.map((row) => row.id);
  const persisted = await loadPersistedChallengeActivityRows(prisma, scheduledMatchIds);
  const synthetic = buildSyntheticChallengeActivities(rows);

  const merged = new Map<string, ChallengeActivityItem>();

  for (const item of [...persisted, ...synthetic]) {
    const key = `${item.scheduledMatchId}:${item.eventType}:${item.createdAt}`;
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values())
    .sort(
      (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    );
}

function readSessionTime(session: Pick<ComparableSession, "updatedAt" | "completedAt">) {
  const raw = session.completedAt || session.updatedAt;
  const parsed = new Date(raw).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function sessionMatchesScheduledPlayers(
  session: ComparableSession,
  challenger: ChallengeUserRow,
  challenged: ChallengeUserRow
) {
  const names = session.players.map((player) => normalizeNameKey(player.name)).filter(Boolean);
  const challengerAliases = playerAliases(challenger);
  const challengedAliases = playerAliases(challenged);

  const includesAlias = (aliases: string[]) => aliases.some((alias) => names.includes(alias));

  return includesAlias(challengerAliases) && includesAlias(challengedAliases);
}

function readSessionStartTime(session: ComparableSession) {
  const endTime = readSessionTime(session);
  if (!Number.isFinite(endTime) || endTime <= 0) return null;
  if (session.durationSeconds === null || !Number.isFinite(session.durationSeconds)) return null;
  return endTime - Math.max(0, session.durationSeconds) * 1000;
}

function openChallengePairKey(row: ScheduledMatchRow) {
  return [row.challenger.id, row.challenged.id].sort((left, right) => left - right).join(":");
}

function findLinkedSession(
  sessions: ComparableSession[],
  row: ScheduledMatchRow,
  usedSessionKeys: Set<string>,
  options?: { allowOpenPlayAnytimeCorrelation?: boolean }
) {
  if (row.linkedSessionKey) {
    const exact = sessions.find(
      (session) =>
        session.sessionKey === row.linkedSessionKey &&
        !usedSessionKeys.has(session.sessionKey) &&
        sessionMatchesScheduledPlayers(session, row.challenger, row.challenged)
    );
    if (exact) return exact;
  }

  const correlationAnchor = row.matchTime ?? (row.timingMode === "scheduled" ? row.scheduledAt : null);
  if (!correlationAnchor) {
    if (!options?.allowOpenPlayAnytimeCorrelation) return null;
    if (!row.challengerFundedAt || !row.challengedFundedAt) return null;

    // Open Play Anytime challenges bind to the first 1v1 watcher session that
    // starts after both verified escrow deposits and before the play runway
    // closes. The caller only enables this when the user pair has exactly one
    // unlinked funded open challenge, so two simultaneous wagers can never race
    // to claim the same replay by loose name matching.
    const readyAt = Math.max(
      row.challengerFundedAt.getTime(),
      row.challengedFundedAt.getTime()
    );
    const playBy = row.playBy?.getTime() ?? Number.POSITIVE_INFINITY;
    let earliest: ComparableSession | null = null;
    let earliestStart = Number.POSITIVE_INFINITY;

    for (const session of sessions) {
      if (usedSessionKeys.has(session.sessionKey)) continue;
      if (session.players.length !== 2) continue;
      if (!sessionMatchesScheduledPlayers(session, row.challenger, row.challenged)) continue;
      const startedAt = readSessionStartTime(session);
      if (startedAt === null || startedAt < readyAt || startedAt > playBy) continue;
      if (startedAt < earliestStart) {
        earliest = session;
        earliestStart = startedAt;
      }
    }

    return earliest;
  }

  const scheduledAt = correlationAnchor.getTime();
  let bestMatch: ComparableSession | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const session of sessions) {
    if (usedSessionKeys.has(session.sessionKey)) {
      continue;
    }

    const sessionTime = readSessionTime(session);
    if (sessionTime < scheduledAt - SESSION_MATCH_LOOKBACK_MS) continue;
    if (sessionTime > scheduledAt + SESSION_MATCH_LOOKAHEAD_MS) continue;
    if (!sessionMatchesScheduledPlayers(session, row.challenger, row.challenged)) continue;

    const delta = Math.abs(sessionTime - scheduledAt);
    if (delta < bestDelta) {
      bestMatch = session;
      bestDelta = delta;
    }
  }

  return bestMatch;
}

function buildActivityAt(row: ScheduledMatchRow, displayState: ScheduledMatchDisplayState) {
  const timestamps = [
    row.settlementReadyAt,
    row.resultAt,
    row.liveConfirmedAt,
    row.challengerCheckedInAt,
    row.challengedCheckedInAt,
    row.challengerFundedAt,
    row.challengedFundedAt,
    row.acceptedAt,
    row.declinedAt,
    row.cancelledAt,
    row.expiredAt,
    row.matchTimeConfirmedAt,
    row.matchTime,
    row.playBy,
    row.fundBy,
    row.acceptBy,
    row.updatedAt,
    row.createdAt,
    row.scheduledAt,
  ].filter((value): value is Date => value instanceof Date);

  if (displayState === "proposed" || displayState === "terms_accepted") {
    const deadline = row.acceptBy ?? row.scheduledAt;
    return deadline > row.createdAt ? deadline : row.createdAt;
  }

  return timestamps[0] ?? row.scheduledAt;
}

function challengeMoneyLabel(state: ChallengeMoneyState) {
  switch (state) {
    case "unfunded": return "Not funded";
    case "partially_funded": return "Partially funded";
    case "locked": return "WOLO locked";
    case "refund_pending": return "Refund pending";
    case "partially_refunded": return "Refund partially confirmed";
    case "refunded": return "Refunded";
    case "settlement_pending": return "Settlement pending";
    case "settled": return "Settled";
    case "settlement_failed": return "Settlement needs attention";
  }
}

function buildChallengeMoneySurface(row: ScheduledMatchRow) {
  const executed = row.settlements.filter((settlement) => settlement.status === "executed" && settlement.txHash);
  const failed = row.settlements.filter((settlement) => settlement.status === "failed");
  const terminalStatus = row.status.toLowerCase();
  const isRefundTerminal = ["canceled", "cancelled", "expired", "funding_expired", "refunded"].includes(terminalStatus);
  const fundedCount = Number(Boolean(row.challengerFundedAt)) + Number(Boolean(row.challengedFundedAt));
  const inferredPlannedTransfers = isRefundTerminal ? fundedCount : terminalStatus === "completed" && fundedCount === 2 ? 3 : 0;
  const plannedTransferCount = Math.max(row.settlements.length, inferredPlannedTransfers);
  const state = deriveChallengeMoneyState({
    challengerFunded: Boolean(row.challengerFundedAt),
    challengedFunded: Boolean(row.challengedFundedAt),
    terminalStatus,
    plannedTransferCount,
    executedTransferCount: executed.length,
    failedTransferCount: failed.length,
  });
  const executedWolo = executed.reduce((sum, settlement) => sum + settlement.amountWolo, 0);
  const plannedWolo = row.settlements.length > 0
    ? row.settlements.reduce((sum, settlement) => sum + settlement.amountWolo, 0)
    : isRefundTerminal
      ? fundedCount * (row.wagerAmountWolo + row.guaranteeAmountWolo)
      : terminalStatus === "completed" && fundedCount === 2
        ? 2 * (row.wagerAmountWolo + row.guaranteeAmountWolo)
        : 0;
  return {
    state,
    label: challengeMoneyLabel(state),
    executedWolo,
    plannedWolo,
    chainTxCount: new Set(executed.map((settlement) => settlement.txHash).filter(Boolean)).size,
    netImpactWolo: state === "refunded" ? 0 : null,
  };
}

function buildScheduledMatchTile(
  row: ScheduledMatchRow,
  linkedSession: ComparableSession | null,
  now = new Date(),
  viewerPreference: ScheduledMatchViewerPreference = EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE
): ScheduledMatchTile {
  const latestDesyncIncident = row.replayDesyncIncidents[0] ?? null;
  const desyncReviewActive = Boolean(
    row.status === "desync_review" &&
      latestDesyncIncident?.desyncOccurred &&
      latestDesyncIncident.settlementDisposition === "commissioner_review"
  );
  const linkedSessionState =
    linkedSession?.state ??
    (row.status === "completed" ? "completed" : row.status === "live_confirmed" ? "live" : null);
  const surface = buildChallengeEconomySurface(
    {
      status: desyncReviewActive
        ? "desync_review"
        : linkedSessionState === "live"
          ? "live_confirmed"
          : linkedSessionState === "completed"
            ? "completed"
            : row.status,
      scheduledAt: row.scheduledAt,
      timingMode: row.timingMode,
      matchTime: row.matchTime,
      acceptedAt: row.acceptedAt,
      resultAt: row.resultAt,
      liveConfirmedAt: row.liveConfirmedAt,
      settlementReadyAt: row.settlementReadyAt,
      wagerAmountWolo: row.wagerAmountWolo,
      guaranteeAmountWolo: row.guaranteeAmountWolo,
      challengerFundedAt: row.challengerFundedAt,
      challengerFundingTxHash: row.challengerFundingTxHash,
      challengerFundingWalletAddress: row.challengerFundingWalletAddress,
      challengedFundedAt: row.challengedFundedAt,
      challengedFundingTxHash: row.challengedFundingTxHash,
      challengedFundingWalletAddress: row.challengedFundingWalletAddress,
      challengerCheckedInAt: row.challengerCheckedInAt,
      challengedCheckedInAt: row.challengedCheckedInAt,
    },
    now
  );
  const lifecycle = deriveChallengeLifecycle(
    {
      status: desyncReviewActive
        ? "desync_review"
        : linkedSessionState === "live"
          ? "live_confirmed"
          : linkedSessionState === "completed"
            ? "completed"
            : row.status,
      timingMode: row.timingMode,
      createdAt: row.createdAt,
      acceptBy: row.acceptBy,
      acceptedAt: row.acceptedAt,
      fundBy: row.fundBy,
      playBy: row.playBy,
      matchTime: row.matchTime,
      matchTimeConfirmedAt: row.matchTimeConfirmedAt,
      expiredAt: row.expiredAt,
      cancelledAt: row.cancelledAt,
      declinedAt: row.declinedAt,
      resultAt: row.resultAt,
      liveConfirmedAt: row.liveConfirmedAt,
      challengerFundedAt: row.challengerFundedAt,
      challengedFundedAt: row.challengedFundedAt,
      challengerCheckedInAt: row.challengerCheckedInAt,
      challengedCheckedInAt: row.challengedCheckedInAt,
    },
    now
  );
  const displayState = desyncReviewActive
    ? "desync_review"
    : linkedSessionState === "live"
      ? "live"
      : linkedSessionState === "completed"
        ? "completed"
        : lifecycle.phase === "expired"
        ? "expired"
        : lifecycle.phase === "funding_expired"
          ? "funding_expired"
          : surface.displayState;
  const activityAt = buildActivityAt(row, displayState);
  const money = buildChallengeMoneySurface(row);

  return {
    id: row.id,
    status: normalizeChallengeStatusForTile(row.status),
    displayState,
    lifecycle: {
      phase: lifecycle.phase,
      timingMode: lifecycle.timingMode,
      terminal: lifecycle.terminal,
      active: lifecycle.active,
      awaitingActor: lifecycle.awaitingActor,
      deadlineAt: lifecycle.deadlineAt?.toISOString() ?? null,
      exactTime: lifecycle.exactTime?.toISOString() ?? null,
      canPlayAnytime: lifecycle.canPlayAnytime,
    },
    money,
    scheduledAt: row.scheduledAt.toISOString(),
    acceptBy: row.acceptBy?.toISOString() ?? null,
    fundBy: row.fundBy?.toISOString() ?? null,
    playBy: row.playBy?.toISOString() ?? null,
    matchTime: row.matchTime?.toISOString() ?? null,
    matchTimeProposedByUid:
      row.matchTimeProposedByUserId === row.challenger.id
        ? row.challenger.uid
        : row.matchTimeProposedByUserId === row.challenged.id
          ? row.challenged.uid
          : null,
    matchTimeConfirmedAt: row.matchTimeConfirmedAt?.toISOString() ?? null,
    expiredAt: row.expiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    declinedAt: row.declinedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    activityAt: activityAt.toISOString(),
    challengeNote: row.challengeNote ?? null,
    terms: {
      wagerAmountWolo: row.wagerAmountWolo,
      guaranteeAmountWolo: row.guaranteeAmountWolo,
      totalFundingWolo: row.wagerAmountWolo + row.guaranteeAmountWolo,
    },
    viewerPreference,
    economy: {
      ...surface.economy,
      statusLabel:
        desyncReviewActive
          ? "DESYNCED"
          : linkedSessionState === "live"
          ? "Live confirmed"
          : linkedSessionState === "completed"
            ? "Completed"
            : surface.economy.statusLabel,
      statusDetail:
        desyncReviewActive
          ? "Human-confirmed desync. Competitive result, winner payout, and title movement are halted pending commissioner disposition."
          : linkedSessionState === "live"
          ? "The match session is linked and underway."
          : linkedSessionState === "completed"
            ? "Result is ready for Match Guarantee return and Wolo Wager settlement."
            : surface.economy.statusDetail,
      readyForSettlement:
        desyncReviewActive
          ? false
          : linkedSessionState === "completed"
            ? true
            : surface.economy.readyForSettlement,
      settlementReadyAt:
        desyncReviewActive
          ? null
          : linkedSessionState === "completed"
          ? row.settlementReadyAt?.toISOString() ?? row.resultAt?.toISOString() ?? null
          : surface.economy.settlementReadyAt,
    },
    challenger: buildPlayerSurface(row.challenger),
    challenged: buildPlayerSurface(row.challenged),
    linkedSessionKey: linkedSession?.sessionKey ?? row.linkedSessionKey ?? null,
    linkedSessionState,
    linkedMapName: linkedSession?.mapName ?? row.linkedMapName ?? null,
    // The parser/watcher's winner remains in storage as machine evidence, but
    // it must never be projected as competitive truth during human desync review.
    linkedWinner: desyncReviewActive ? null : linkedSession?.winner ?? row.linkedWinner ?? null,
    durationSeconds: linkedSession?.durationSeconds ?? row.linkedDurationSeconds ?? null,
    desyncIncident: latestDesyncIncident
      ? {
          id: latestDesyncIncident.id,
          gameStatsId: latestDesyncIncident.gameStatsId,
          supersedesId: latestDesyncIncident.supersedesId,
          desyncOccurred: latestDesyncIncident.desyncOccurred,
          competitiveResultStatus: latestDesyncIncident.competitiveResultStatus,
          settlementDisposition: latestDesyncIncident.settlementDisposition,
          reviewerUid: latestDesyncIncident.reviewerUidSnapshot,
          reviewerDisplayName: latestDesyncIncident.reviewerDisplayNameSnapshot,
          note: latestDesyncIncident.note,
          sourceReplayHash: latestDesyncIncident.sourceReplayHash,
          sourceParseIteration: latestDesyncIncident.sourceParseIteration,
          parserDesyncCandidate: latestDesyncIncident.parserDesyncCandidate,
          createdAt: latestDesyncIncident.createdAt.toISOString(),
        }
      : null,
    fundingRail: buildChallengeFundingRailSurface(),
    titleStakes: row.trophyChallenges.map((challenge) => ({
      challengeId: challenge.id,
      trophyId: challenge.trophy.trophyId,
      displayName: challenge.trophy.displayName,
      kind: challenge.trophy.kind,
      family: challenge.trophy.family,
      imageUrl: challenge.trophy.nftImageUri,
      status: challenge.status,
      settlementStatus: challenge.settlementStatus,
      chainStatus: challenge.trophy.chainStatus,
    })),
  };
}

function normalizeChallengeStatusForTile(value: string): ScheduledMatchPersistedStatus {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cancelled") {
    return "canceled";
  }
  return normalized as ScheduledMatchPersistedStatus;
}

function rowAlreadyFinalized(row: ScheduledMatchRow) {
  return [
    "completed",
    "forfeited",
    "declined",
    "cancelled",
    "canceled",
    "no_show_left",
    "no_show_right",
    "double_no_show",
    "refunded",
    "expired",
    "funding_expired",
  ].includes(row.status) && row.resultAt !== null;
}

function rowsMatchLinkedSession(row: ScheduledMatchRow, session: ComparableSession | null) {
  if (!session) {
    return (
      row.linkedSessionKey === null &&
      row.linkedMapName === null &&
      row.linkedWinner === null &&
      row.linkedDurationSeconds === null
    );
  }

  return (
    row.linkedSessionKey === session.sessionKey &&
    row.linkedMapName === (session.mapName ?? null) &&
    row.linkedWinner === (session.winner ?? null) &&
    row.linkedDurationSeconds === (session.durationSeconds ?? null)
  );
}

async function recordAutoScheduledMatchActivity(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: {
    scheduledMatchId: number;
    eventType: string;
    detail: string;
    createdAt: Date;
    metadata?: Record<string, unknown> | null;
  }
) {
  await prisma.scheduledMatchActivity.create({
    data: {
      scheduledMatchId: input.scheduledMatchId,
      eventType: input.eventType.slice(0, 32),
      detail: input.detail.slice(0, 255),
      metadata: (input.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt: input.createdAt,
    },
  });
}

async function loadLockedScheduledMatchDesyncIncidents(
  tx: Prisma.TransactionClient,
  input: {
    scheduledMatchId: number;
    gameStatsId: number;
  }
) {
  // Serialize replay-result projection against both commissioner Challenge
  // actions and append-only incident writes. The incident writer uses this
  // same single-key replay lock; the Challenge protocol uses the namespaced
  // match lock.
  await acquireChallengeDesyncAdvisoryLock(tx, input.scheduledMatchId);
  const preliminaryIncidents = await loadDesyncIncidentsForSettlement(tx, {
    gameStatsId: input.gameStatsId,
    scheduledMatchId: input.scheduledMatchId,
  });
  const replayLockIds = Array.from(
    new Set([
      input.gameStatsId,
      ...preliminaryIncidents.map((incident) => incident.gameStatsId),
    ])
  ).sort((left, right) => left - right);
  for (const replayLockId of replayLockIds) {
    await tx.$queryRaw<Array<{ lock_acquired: number }>>`
      SELECT 1::int AS lock_acquired
      FROM pg_advisory_xact_lock(${replayLockId})
    `;
  }
  return loadDesyncIncidentsForSettlement(tx, {
    gameStatsId: input.gameStatsId,
    scheduledMatchId: input.scheduledMatchId,
  });
}

async function recordVerifiedScheduledMatchTitleResults(
  prisma: PrismaClient,
  row: ScheduledMatchRow,
  session: ComparableSession,
  completedAt: Date
) {
  const winnerKey = normalizeNameKey(session.winner);
  if (!winnerKey) return;

  const winner = playerAliases(row.challenger).includes(winnerKey)
    ? row.challenger
    : playerAliases(row.challenged).includes(winnerKey)
      ? row.challenged
      : null;
  if (!winner) return;

  const titleChallenges = await prisma.trophyChallenge.findMany({
    where: {
      scheduledMatchId: row.id,
      winnerUserId: null,
      status: {
        notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES],
      },
    },
    include: {
      trophy: true,
    },
  });

  for (const titleChallenge of titleChallenges) {
    const currentCustodianId =
      titleChallenge.trophy.currentHolderUserId ??
      titleChallenge.trophy.guardianHolderUserId;
    const expectedCustodianIds = new Set(
      [titleChallenge.defenderUserId, titleChallenge.guardianUserId].filter(
        (value): value is number => typeof value === "number"
      )
    );
    const challengerWon = titleChallenge.challengerUserId === winner.id;
    const isArtifact = titleChallenge.trophy.kind === "artifact";
    const staleCustody = Boolean(
      currentCustodianId && !expectedCustodianIds.has(currentCustodianId)
    );
    const proposedDisposition = isArtifact
      ? "artifact_metric_review"
      : challengerWon
        ? "transfer_to_challenger"
        : "retain_current_holder";
    const settlementStatus = staleCustody
      ? "stale_custody_commissioner_review"
      : TITLE_RESULT_REVIEW_SETTLEMENT_STATUS;

    await prisma.$transaction(async (tx) => {
      const incidents = await loadLockedScheduledMatchDesyncIncidents(tx, {
        scheduledMatchId: row.id,
        gameStatsId: session.id,
      });
      assertTitleTransferAllowed({
        incidents,
        competitiveCandidate: {
          gameStatsId: session.id,
          observedAt: completedAt,
        },
      });

      const claimedSettlement = await tx.trophyChallenge.updateMany({
        where: {
          id: titleChallenge.id,
          winnerUserId: null,
          status: {
            notIn: [...TERMINAL_TITLE_CHALLENGE_STATUSES],
          },
        },
        data: {
          winnerUserId: winner.id,
          replayId: session.id,
          gameId: session.id,
          watcherSessionId: session.sessionKey,
          status: TITLE_RESULT_REVIEW_STATUS,
          settlementStatus,
          verificationSummary: [
            `Scheduled match #${row.id} matched replay #${session.id}; ${challengePlayerName(winner)} verified as winner.`,
            isArtifact
              ? "Artifact metric proof and custody require commissioner review."
              : `Proposed title disposition: ${proposedDisposition.replaceAll("_", " ")}. Commissioner approval is required before custody or bounty changes.`,
          ].join(" "),
          errorState: staleCustody
            ? "Title custody changed before this result was recorded. Commissioner review is required."
            : null,
        },
      });
      if (claimedSettlement.count === 0) return;

      await tx.trophyEvent.create({
        data: {
          trophyId: titleChallenge.trophyId,
          eventType: "REPLAY_VERIFIED",
          actorRole: "system",
          initiatedBy: "system",
          fromHolderUserId:
            titleChallenge.trophy.currentHolderUserId ??
            titleChallenge.trophy.guardianHolderUserId,
          toHolderUserId: winner.id,
          gameId: session.id,
          replayId: session.id,
          challengeId: titleChallenge.id,
          status: "attention_required",
          rawResponse: {
            scheduledMatchId: row.id,
            watcherSessionId: session.sessionKey,
            winner: session.winner,
            challengerWon,
            completedAt: completedAt.toISOString(),
            commissionerReviewRequired: true,
            proposedDisposition,
            staleCustody,
            settlementStatus,
          },
        },
      });
      await tx.scheduledMatchActivity.create({
        data: {
          scheduledMatchId: row.id,
          eventType: "title_result_pending_review",
          detail: `${titleChallenge.trophy.displayName}: watcher result recorded for commissioner review.`.slice(
            0,
            255
          ),
          metadata: {
            trophyChallengeId: titleChallenge.id,
            trophyId: titleChallenge.trophyId,
            trophyName: titleChallenge.trophy.displayName,
            winnerUserId: winner.id,
            watcherSessionId: session.sessionKey,
            proposedDisposition,
            custodyChanged: false,
            commissionerReviewRequired: true,
          },
          createdAt: completedAt,
        },
      });
    });
  }
}

async function attemptAutomaticScheduledMatchSettlement(
  prisma: PrismaClient,
  scheduledMatchId: number
) {
  try {
    await executeScheduledMatchSettlement(prisma, scheduledMatchId, null);
  } catch (error) {
    if (
      error instanceof ScheduledMatchSettlementError &&
      EXPECTED_AUTOMATIC_SETTLEMENT_SKIP_CODES.has(error.code)
    ) {
      console.warn(
        `Automatic settlement skipped for scheduled match #${scheduledMatchId} (${error.code}): ${error.message}`
      );
      return;
    }

    console.error(
      `Automatic settlement failed for scheduled match #${scheduledMatchId}:`,
      error
    );
  }
}

async function persistScheduledMatchResults(
  prisma: PrismaClient,
  rows: ScheduledMatchRow[],
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[],
  now = new Date()
) {
  const updatedRows: ScheduledMatchRow[] = [];
  const matchedActiveSessionKeys = new Set<string>();
  const matchedCompletedSessionKeys = new Set<string>();
  const unlinkedFundedOpenPairCounts = new Map<string, number>();
  const needsOpenCorrelationGuard = rows.some(
    (row) =>
      row.timingMode === "open" &&
      !row.matchTime &&
      !row.linkedSessionKey &&
      row.challengerFundedAt &&
      row.challengedFundedAt &&
      !rowAlreadyFinalized(row)
  );

  if (needsOpenCorrelationGuard) {
    const allUnlinkedFundedOpenChallenges = await prisma.scheduledMatch.findMany({
      where: {
        timingMode: "open",
        matchTime: null,
        linkedSessionKey: null,
        challengerFundedAt: { not: null },
        challengedFundedAt: { not: null },
        status: { notIn: [...RESOLVED_SCHEDULED_STATUSES] },
      },
      select: { challengerUserId: true, challengedUserId: true },
    });

    for (const challenge of allUnlinkedFundedOpenChallenges) {
      const key = [challenge.challengerUserId, challenge.challengedUserId]
        .sort((left, right) => left - right)
        .join(":");
      unlinkedFundedOpenPairCounts.set(key, (unlinkedFundedOpenPairCounts.get(key) ?? 0) + 1);
    }
  }

  for (const row of rows) {
    // A late watcher result must never reopen a challenge that already reached
    // a refund/no-show/expiry verdict. Completed rows stay eligible below so a
    // previously failed title-review write can still be retried idempotently.
    if (row.status !== "completed" && rowAlreadyFinalized(row)) {
      updatedRows.push(row);
      continue;
    }

    const surface = buildChallengeEconomySurface(
      {
        status: row.status,
        scheduledAt: row.scheduledAt,
        timingMode: row.timingMode,
        matchTime: row.matchTime,
        acceptedAt: row.acceptedAt,
        resultAt: row.resultAt,
        liveConfirmedAt: row.liveConfirmedAt,
        settlementReadyAt: row.settlementReadyAt,
        wagerAmountWolo: row.wagerAmountWolo,
        guaranteeAmountWolo: row.guaranteeAmountWolo,
        challengerFundedAt: row.challengerFundedAt,
        challengerFundingTxHash: row.challengerFundingTxHash,
        challengerFundingWalletAddress: row.challengerFundingWalletAddress,
        challengedFundedAt: row.challengedFundedAt,
        challengedFundingTxHash: row.challengedFundingTxHash,
        challengedFundingWalletAddress: row.challengedFundingWalletAddress,
        challengerCheckedInAt: row.challengerCheckedInAt,
        challengedCheckedInAt: row.challengedCheckedInAt,
      },
      now
    );
    const hasTerms = surface.economy.hasTerms;
    const openPairIsUnambiguous =
      row.timingMode === "open" &&
      !row.matchTime &&
      (Boolean(row.linkedSessionKey) ||
        unlinkedFundedOpenPairCounts.get(openChallengePairKey(row)) === 1);
    const canLinkScheduledSession =
      row.timingMode === "scheduled" &&
      Boolean(row.matchTime) &&
      (hasTerms
        ? surface.displayState === "ready" || row.status === "live_confirmed" || row.status === "completed"
        : row.status === "accepted" || row.status === "completed");
    const canLinkOpenSession =
      openPairIsUnambiguous &&
      Boolean(row.challengerFundedAt && row.challengedFundedAt) &&
      ["funded", "ready", "live"].includes(surface.displayState);
    const canLinkSessions = canLinkScheduledSession || canLinkOpenSession || Boolean(row.linkedSessionKey);

    if (canLinkSessions) {
      const completedSession = findLinkedSession(
        recentlyCompletedSessions,
        row,
        matchedCompletedSessionKeys,
        { allowOpenPlayAnytimeCorrelation: openPairIsUnambiguous }
      );

      if (completedSession) {
        matchedCompletedSessionKeys.add(completedSession.sessionKey);
        const completedAt = new Date(completedSession.completedAt || completedSession.updatedAt);
        const nextRow = {
          ...row,
          status: "completed",
          liveConfirmedAt: row.liveConfirmedAt ?? completedAt,
          resultAt: completedAt,
          settlementReadyAt: row.settlementReadyAt ?? completedAt,
          linkedSessionKey: completedSession.sessionKey,
          linkedMapName: completedSession.mapName ?? null,
          linkedWinner: completedSession.winner ?? null,
          linkedDurationSeconds: completedSession.durationSeconds ?? null,
        } satisfies ScheduledMatchRow;

        const completedData = {
          status: "completed" as const,
          liveConfirmedAt: row.liveConfirmedAt ?? completedAt,
          resultAt: completedAt,
          settlementReadyAt: row.settlementReadyAt ?? completedAt,
          linkedSessionKey: completedSession.sessionKey,
          linkedMapName: completedSession.mapName,
          linkedWinner: completedSession.winner,
          linkedDurationSeconds: completedSession.durationSeconds,
        };
        let transitionedToCompleted = false;
        try {
          transitionedToCompleted = await prisma.$transaction(async (tx) => {
            const incidents = await loadLockedScheduledMatchDesyncIncidents(tx, {
              scheduledMatchId: row.id,
              gameStatsId: completedSession.id,
            });
            assertWinnerSettlementAllowed({
              incidents,
              competitiveCandidate: {
                gameStatsId: completedSession.id,
                observedAt: completedAt,
              },
            });

            if (row.status === "completed") {
              await tx.scheduledMatch.update({
                where: { id: row.id },
                data: completedData,
              });
              return false;
            }

            const transition = await tx.scheduledMatch.updateMany({
              where: { id: row.id, status: row.status },
              data: completedData,
            });
            if (transition.count === 0) return false;

            await recordAutoScheduledMatchActivity(tx, {
              scheduledMatchId: row.id,
              eventType: "completed",
              detail: completedSession.winner
                ? `Completed. Winner: ${completedSession.winner}.`
                : "Completed and stored.",
              createdAt: completedAt,
              metadata: {
                linkedSessionKey: completedSession.sessionKey,
                mapName: completedSession.mapName ?? null,
              },
            });
            return true;
          });
        } catch (error) {
          if (error instanceof ChallengeDesyncError) {
            console.warn(
              `Watcher result held for scheduled match #${row.id} (${error.code}): ${error.message}`
            );
            updatedRows.push(row);
            continue;
          }
          throw error;
        }

        if (row.status !== "completed" && !transitionedToCompleted) {
          updatedRows.push(row);
          continue;
        }

        try {
          await recordVerifiedScheduledMatchTitleResults(
            prisma,
            row,
            completedSession,
            completedAt
          );
        } catch (error) {
          console.error(
            `Failed to record title results for scheduled match #${row.id}:`,
            error
          );
        }

        if (transitionedToCompleted) {
          await attemptAutomaticScheduledMatchSettlement(prisma, row.id);
        }

        updatedRows.push(nextRow);
        continue;
      }

      const activeSession = findLinkedSession(activeSessions, row, matchedActiveSessionKeys, {
        allowOpenPlayAnytimeCorrelation: openPairIsUnambiguous,
      });

      if (activeSession) {
        matchedActiveSessionKeys.add(activeSession.sessionKey);
        const liveConfirmedAt = row.liveConfirmedAt ?? new Date(activeSession.updatedAt);
        if (!rowsMatchLinkedSession(row, activeSession) || row.status !== "live_confirmed") {
          await prisma.scheduledMatch.update({
            where: { id: row.id },
            data: {
              status: "live_confirmed",
              liveConfirmedAt,
              linkedSessionKey: activeSession.sessionKey,
              linkedMapName: activeSession.mapName,
              linkedWinner: activeSession.winner,
              linkedDurationSeconds: activeSession.durationSeconds,
            },
          });

          if (row.status !== "live_confirmed") {
            await recordAutoScheduledMatchActivity(prisma, {
              scheduledMatchId: row.id,
              eventType: "live_confirmed",
              detail: activeSession.sessionKey
                ? `Live session linked: ${activeSession.sessionKey}.`
                : "Live match confirmed.",
              createdAt: liveConfirmedAt,
              metadata: {
                linkedSessionKey: activeSession.sessionKey,
                mapName: activeSession.mapName ?? null,
              },
            });
          }
        }

        updatedRows.push({
          ...row,
          status: "live_confirmed",
          liveConfirmedAt,
          linkedSessionKey: activeSession.sessionKey,
          linkedMapName: activeSession.mapName ?? null,
          linkedWinner: activeSession.winner ?? null,
          linkedDurationSeconds: activeSession.durationSeconds ?? null,
        });
        continue;
      }
    }

    if (hasTerms) {
      const desiredStatus = surface.persistedStatus;
      const terminalNoShow =
        desiredStatus === "no_show_left" ||
        desiredStatus === "no_show_right" ||
        desiredStatus === "double_no_show";

      if (terminalNoShow && row.status !== desiredStatus) {
        const resolvedAt = new Date(row.matchTime ?? row.scheduledAt);
        const nextRow = {
          ...row,
          status: desiredStatus,
          resultAt: row.resultAt ?? resolvedAt,
          settlementReadyAt: row.settlementReadyAt ?? resolvedAt,
          linkedSessionKey: null,
          linkedMapName: null,
          linkedWinner: null,
          linkedDurationSeconds: null,
        } satisfies ScheduledMatchRow;

        const noShowTransition = await prisma.scheduledMatch.updateMany({
          where: {
            id: row.id,
            status: row.status,
            challengerCheckedInAt: row.challengerCheckedInAt,
            challengedCheckedInAt: row.challengedCheckedInAt,
          },
          data: {
            status: desiredStatus,
            resultAt: row.resultAt ?? resolvedAt,
            settlementReadyAt: row.settlementReadyAt ?? resolvedAt,
            linkedSessionKey: null,
            linkedMapName: null,
            linkedWinner: null,
            linkedDurationSeconds: null,
          },
        });
        if (noShowTransition.count === 0) {
          updatedRows.push(row);
          continue;
        }

        await recordAutoScheduledMatchActivity(prisma, {
          scheduledMatchId: row.id,
          eventType: desiredStatus,
          detail:
            desiredStatus === "no_show_left"
              ? `${challengePlayerName(row.challenger)} missed check-in. ${challengePlayerName(row.challenged)} is owed both Match Guarantees; both Wolo Wagers are queued to return.`
              : desiredStatus === "no_show_right"
                ? `${challengePlayerName(row.challenged)} missed check-in. ${challengePlayerName(row.challenger)} is owed both Match Guarantees; both Wolo Wagers are queued to return.`
                : "Both players missed the check-in lock. Match Guarantees are owed to Community Treasury; both Wolo Wagers are queued to return.",
          createdAt: resolvedAt,
        });

        await attemptAutomaticScheduledMatchSettlement(prisma, row.id);

        updatedRows.push(nextRow);
        continue;
      }

      if (desiredStatus !== row.status && !rowAlreadyFinalized(row)) {
        await prisma.scheduledMatch.update({
          where: { id: row.id },
          data: {
            status: desiredStatus,
          },
        });

        updatedRows.push({
          ...row,
          status: desiredStatus,
        });
        continue;
      }

      updatedRows.push(row);
      continue;
    }

    if (rowAlreadyFinalized(row)) {
      updatedRows.push(row);
      continue;
    }

    if (row.status !== "accepted" || row.timingMode !== "scheduled" || !row.matchTime) {
      updatedRows.push(row);
      continue;
    }

    const forfeitedAt = new Date(row.matchTime.getTime() + CHALLENGE_START_GRACE_MS);
    if (now.getTime() >= forfeitedAt.getTime()) {
      const nextRow = {
        ...row,
        status: "forfeited",
        resultAt: forfeitedAt,
        linkedSessionKey: null,
        linkedMapName: null,
        linkedWinner: null,
        linkedDurationSeconds: null,
      } satisfies ScheduledMatchRow;

      await prisma.scheduledMatch.update({
        where: { id: row.id },
        data: {
          status: "forfeited",
          resultAt: forfeitedAt,
          settlementReadyAt: row.settlementReadyAt ?? forfeitedAt,
          linkedSessionKey: null,
          linkedMapName: null,
          linkedWinner: null,
          linkedDurationSeconds: null,
        },
      });

      updatedRows.push(nextRow);
      continue;
    }

    updatedRows.push(row);
  }

  return updatedRows;
}

function compareScheduledTileOrder(left: ScheduledMatchTile, right: ScheduledMatchTile) {
  const priority = (tile: ScheduledMatchTile) => {
    switch (tile.displayState) {
      case "desync_review":
        return 0;
      case "live":
        return 1;
      case "ready":
        return 2;
      case "checkin_open":
        return 3;
      case "left_checked_in":
      case "right_checked_in":
        return 3;
      case "funded":
        return 4;
      case "creator_funded":
      case "opponent_funded":
        return 5;
      case "terms_accepted":
      case "accepted":
        return 6;
      case "proposed":
      case "pending":
        return 7;
      case "completed":
        return 8;
      case "no_show_left":
      case "no_show_right":
      case "double_no_show":
      case "refunded":
        return 9;
      case "forfeited":
        return 10;
      case "declined":
        return 11;
      case "cancelled":
      case "canceled":
        return 12;
      default:
        return 13;
    }
  };

  if (priority(left) !== priority(right)) {
    return priority(left) - priority(right);
  }

  const leftScheduledAt = new Date(left.lifecycle.deadlineAt ?? left.matchTime ?? left.scheduledAt).getTime();
  const rightScheduledAt = new Date(right.lifecycle.deadlineAt ?? right.matchTime ?? right.scheduledAt).getTime();

  if (
    [
      "proposed",
      "pending",
      "terms_accepted",
      "accepted",
      "creator_funded",
      "opponent_funded",
      "funded",
      "checkin_open",
      "left_checked_in",
      "right_checked_in",
      "ready",
      "desync_review",
    ].includes(left.displayState)
  ) {
    return leftScheduledAt - rightScheduledAt;
  }

  return new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime();
}

function compareHistoryTileOrder(left: ScheduledMatchTile, right: ScheduledMatchTile) {
  return right.id - left.id;
}

function isActiveChallengeDisplayState(displayState: ScheduledMatchTile["displayState"]) {
  return [
    "proposed",
    "pending",
    "terms_accepted",
    "accepted",
    "creator_funded",
    "opponent_funded",
    "funded",
    "checkin_open",
    "left_checked_in",
    "right_checked_in",
    "ready",
    "live",
    "desync_review",
  ].includes(displayState);
}

function isResolvedChallengeDisplayState(displayState: ScheduledMatchTile["displayState"]) {
  return [
    "completed",
    "forfeited",
    "declined",
    "cancelled",
    "canceled",
    "no_show_left",
    "no_show_right",
    "double_no_show",
    "refunded",
    "expired",
    "funding_expired",
  ].includes(displayState);
}

function deriveMatchedSessionKeys(tiles: ScheduledMatchTile[]) {
  const matchedActiveSessionKeys = new Set<string>();
  const matchedCompletedSessionKeys = new Set<string>();

  for (const tile of tiles) {
    if (!tile.linkedSessionKey) {
      continue;
    }

    if (tile.displayState === "live") {
      matchedActiveSessionKeys.add(tile.linkedSessionKey);
    }

    if (tile.displayState === "completed") {
      matchedCompletedSessionKeys.add(tile.linkedSessionKey);
    }
  }

  return {
    matchedActiveSessionKeys,
    matchedCompletedSessionKeys,
  };
}

function buildComparableChallengeTiles(rows: ScheduledMatchRow[], now = new Date()) {
  return rows.map((row) => buildScheduledMatchTile(row, null, now));
}

export function normalizeChallengeNote(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, CHALLENGE_NOTE_MAX_CHARS);
  return normalized || null;
}

export function parseScheduledMatchDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function loadScheduledMatchRows(
  prisma: PrismaClient,
  options?: {
    viewerUserId?: number | null;
    counterpartUserId?: number | null;
    challengeId?: number | null;
    includeResolved?: boolean;
  }
) {
  const now = Date.now();
  const earliest = new Date(now - CHALLENGE_HISTORY_LOOKBACK_MS);
  const latest = new Date(now + CHALLENGE_LOOKAHEAD_MS);
  const recentResolvedCutoff = new Date(now - CHALLENGE_RECENT_LINGER_MS);
  const statusFilters = [
    // Commissioner review is an explicit hold and must remain visible even
    // when the original match time has fallen outside the active runway.
    { status: "desync_review" },
    {
      status: {
        in: [...ACTIVE_SCHEDULED_STATUSES],
      },
      OR: [
        { acceptBy: { gte: earliest, lte: latest } },
        { fundBy: { gte: earliest, lte: latest } },
        { playBy: { gte: earliest } },
        { matchTime: { gte: earliest, lte: new Date(now + 30 * 24 * 60 * 60 * 1000) } },
        {
          AND: [
            { acceptBy: null },
            { fundBy: null },
            { playBy: null },
            { matchTime: null },
            { scheduledAt: { gte: earliest, lte: latest } },
          ],
        },
      ],
    },
    {
      status: "completed",
      resultAt: {
        gte: recentResolvedCutoff,
      },
    },
    {
      status: "forfeited",
      resultAt: {
        gte: recentResolvedCutoff,
      },
    },
    {
      status: {
        in: ["no_show_left", "no_show_right", "double_no_show", "refunded"],
      },
      resultAt: {
        gte: recentResolvedCutoff,
      },
    },
    ...(options?.includeResolved
      ? [
          {
            status: "declined",
            declinedAt: {
              gte: recentResolvedCutoff,
            },
          },
          {
            status: "cancelled",
            cancelledAt: {
              gte: recentResolvedCutoff,
            },
          },
          {
            status: "canceled",
            cancelledAt: {
              gte: recentResolvedCutoff,
            },
          },
          {
            status: { in: ["expired", "funding_expired"] },
            expiredAt: { gte: recentResolvedCutoff },
          },
        ]
      : []),
  ];
  const participantFilters =
    options?.viewerUserId && options?.counterpartUserId
      ? [
          {
            OR: [
              {
                challengerUserId: options.viewerUserId,
                challengedUserId: options.counterpartUserId,
              },
              {
                challengerUserId: options.counterpartUserId,
                challengedUserId: options.viewerUserId,
              },
            ],
          },
        ]
      : options?.viewerUserId
        ? [
            {
              OR: [
                { challengerUserId: options.viewerUserId },
                { challengedUserId: options.viewerUserId },
              ],
            },
          ]
        : [];

  return prisma.scheduledMatch.findMany({
    where: options?.challengeId
      ? {
          AND: [{ id: options.challengeId }, ...participantFilters],
        }
      : {
          AND: [{ OR: statusFilters }, ...participantFilters],
        },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    select: SCHEDULED_MATCH_SELECT,
  });
}

async function loadChallengeHistoryRows(
  prisma: PrismaClient,
  viewerUserId: number,
  includeGlobal: boolean
) {
  const visibilityFilter: Prisma.ScheduledMatchWhereInput = includeGlobal
    ? {}
    : {
        OR: [
          { challengerUserId: viewerUserId },
          { challengedUserId: viewerUserId },
        ],
      };

  // Active/actionable challenges must never disappear merely because a user has
  // more than one page of history. Bound the active runway separately from the
  // initial folded-history page, then lazy-load older terminal records.
  const [activeRows, resolvedRows] = await Promise.all([
    prisma.scheduledMatch.findMany({
      where: {
        ...visibilityFilter,
        status: { in: [...ACTIVE_SCHEDULED_STATUSES] },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      select: SCHEDULED_MATCH_SELECT,
    }),
    prisma.scheduledMatch.findMany({
      where: {
        ...visibilityFilter,
        status: { in: [...RESOLVED_SCHEDULED_STATUSES] },
      },
      orderBy: [{ id: "desc" }],
      take: INITIAL_CHALLENGE_HISTORY_LIMIT + 1,
      select: SCHEDULED_MATCH_SELECT,
    }),
  ]);

  const hasMore = resolvedRows.length > INITIAL_CHALLENGE_HISTORY_LIMIT;
  const initialResolvedRows = resolvedRows.slice(0, INITIAL_CHALLENGE_HISTORY_LIMIT);

  const byId = new Map<number, ScheduledMatchRow>();
  for (const row of [...activeRows, ...initialResolvedRows]) {
    byId.set(row.id, row);
  }
  return {
    rows: Array.from(byId.values()).sort((left, right) => right.id - left.id),
    page: {
      hasMore,
      nextCursor: hasMore
        ? initialResolvedRows[initialResolvedRows.length - 1]?.id ?? null
        : null,
    },
  };
}

export async function loadChallengeHistoryPage(
  prisma: PrismaClient,
  viewerUserId: number,
  options?: { cursor?: number | null; limit?: number; includeGlobal?: boolean }
) {
  const limit = Math.max(1, Math.min(options?.limit ?? 20, 50));
  const visibilityFilter: Prisma.ScheduledMatchWhereInput = options?.includeGlobal
    ? {}
    : {
        OR: [
          { challengerUserId: viewerUserId },
          { challengedUserId: viewerUserId },
        ],
      };
  const rows = await prisma.scheduledMatch.findMany({
    where: {
      ...visibilityFilter,
      status: {
        in: [...RESOLVED_SCHEDULED_STATUSES],
      },
      ...(options?.cursor ? { id: { lt: options.cursor } } : {}),
    },
    orderBy: [{ id: "desc" }],
    take: limit + 1,
    select: SCHEDULED_MATCH_SELECT,
  });
  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const tiles = buildComparableChallengeTiles(pageRows).sort(compareHistoryTileOrder);
  const activities = await loadChallengeActivityRows(prisma, pageRows);
  return {
    tiles,
    activities,
    hasMore,
    nextCursor: hasMore ? pageRows[pageRows.length - 1]?.id ?? null : null,
  };
}

export function deriveScheduledMatchTiles(
  rows: ScheduledMatchRow[],
  _activeSessions: ComparableSession[],
  _recentlyCompletedSessions: ComparableSession[],
  now = new Date()
) {
  const tiles = buildComparableChallengeTiles(rows, now)
    .filter((tile) => isActiveChallengeDisplayState(tile.displayState))
    .sort(compareScheduledTileOrder);

  const { matchedActiveSessionKeys, matchedCompletedSessionKeys } =
    deriveMatchedSessionKeys(tiles);

  return {
    tiles,
    matchedActiveSessionKeys,
    matchedCompletedSessionKeys,
  };
}

function deriveChallengeHistoryTiles(
  rows: ScheduledMatchRow[],
  _activeSessions: ComparableSession[],
  _recentlyCompletedSessions: ComparableSession[],
  excludedIds: Set<number>,
  now = new Date()
) {
  return buildComparableChallengeTiles(rows, now)
    .filter((tile) => !excludedIds.has(tile.id))
    .filter((tile) => isResolvedChallengeDisplayState(tile.displayState))
    .sort(compareHistoryTileOrder);
}

function buildChallengeRecordSummary(
  rows: ScheduledMatchRow[],
  viewer: Pick<ChallengeUserRow, "id" | "uid" | "inGameName" | "steamPersonaName">
): ChallengeRecordSummary {
  const summary = emptyChallengeRecord();
  const aliases = new Set(playerAliases(viewer));

  for (const row of rows) {
    const tile = buildScheduledMatchTile(row, null);
    summary.total += 1;

    switch (tile.displayState) {
      case "proposed":
      case "pending":
        summary.pending += 1;
        break;
      case "terms_accepted":
      case "accepted":
        summary.accepted += 1;
        break;
      case "creator_funded":
      case "opponent_funded":
      case "funded":
      case "checkin_open":
        summary.funded += 1;
        break;
      case "left_checked_in":
      case "right_checked_in":
      case "ready":
      case "live":
      case "desync_review":
        summary.ready += 1;
        break;
      case "declined":
        summary.declined += 1;
        break;
      case "cancelled":
      case "canceled":
      case "expired":
      case "funding_expired":
        summary.cancelled += 1;
        break;
      case "completed":
        summary.completed += 1;
        if (tile.linkedWinner && aliases.has(normalizeNameKey(tile.linkedWinner))) {
          summary.wins += 1;
        } else if (tile.linkedWinner) {
          summary.losses += 1;
        }
        break;
      case "forfeited":
        summary.forfeited += 1;
        break;
      case "no_show_left":
      case "no_show_right":
      case "double_no_show":
        summary.noShows += 1;
        break;
      default:
        break;
    }
  }

  return summary;
}

export async function loadScheduledMatchTilesForLiveBoard(
  prisma: PrismaClient,
  activeSessions: ComparableSession[],
  recentlyCompletedSessions: ComparableSession[]
) {
  const rows = await loadScheduledMatchRows(prisma);
  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    rows,
    activeSessions,
    recentlyCompletedSessions
  );
  const now = new Date();
  const activeSnapshot = deriveScheduledMatchTiles(
    reconciledRows,
    activeSessions,
    recentlyCompletedSessions,
    now
  );
  const recentResolvedTiles = buildComparableChallengeTiles(reconciledRows, now)
    .filter((tile) => isResolvedChallengeDisplayState(tile.displayState))
    .filter(
      (tile) => now.getTime() - new Date(tile.activityAt).getTime() <= CHALLENGE_RECENT_LINGER_MS
    )
    .sort(compareHistoryTileOrder);
  const combinedTiles = [...activeSnapshot.tiles, ...recentResolvedTiles];
  const { matchedActiveSessionKeys, matchedCompletedSessionKeys } =
    deriveMatchedSessionKeys(combinedTiles);

  return {
    tiles: combinedTiles,
    matchedActiveSessionKeys,
    matchedCompletedSessionKeys,
  };
}

export async function loadChallengeThreadTile(
  prisma: PrismaClient,
  viewerUserId: number,
  counterpartUserId: number,
  challengeId?: number | null
): Promise<ScheduledMatchTile | null> {
  const [rows, sessionSnapshot] = await Promise.all([
    loadScheduledMatchRows(prisma, {
      viewerUserId,
      counterpartUserId,
      challengeId,
      includeResolved: true,
    }),
    loadLiveSessionSnapshot(prisma),
  ]);

  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    rows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  // An embedded Match Room names an exact ledger record, including terminal
  // matches. Do not let the active-runway filter silently substitute another
  // challenge from the same pair or hide a resolved one.
  if (challengeId) {
    return buildComparableChallengeTiles(reconciledRows).find(
      (tile) => tile.id === challengeId
    ) ?? null;
  }

  const { tiles } = deriveScheduledMatchTiles(
    reconciledRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  return tiles[0] ?? null;
}

/** Load one exact ledger tile after the caller has enforced participant/admin access. */
export async function loadChallengeTileById(
  prisma: PrismaClient,
  challengeId: number
): Promise<ScheduledMatchTile | null> {
  const [rows, sessionSnapshot] = await Promise.all([
    loadScheduledMatchRows(prisma, {
      challengeId,
      includeResolved: true,
    }),
    loadLiveSessionSnapshot(prisma),
  ]);
  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    rows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );
  return buildComparableChallengeTiles(reconciledRows).find(
    (tile) => tile.id === challengeId
  ) ?? null;
}

export async function loadChallengeHubSnapshot(
  prisma: PrismaClient,
  viewerUid: string | null
): Promise<ChallengeHubSnapshot> {
  const nowIso = new Date().toISOString();

  if (!viewerUid) {
    return {
      viewer: null,
      historyScope: "participant",
      historyPage: { hasMore: false, nextCursor: null },
      candidates: [],
      scheduledMatches: [],
      historyMatches: [],
      activities: [],
      record: emptyChallengeRecord(),
      fundingRail: buildChallengeFundingRailSurface(),
      serverNow: nowIso,
      updatedAt: nowIso,
    };
  }

  const viewer = await prisma.user.findUnique({
    where: { uid: viewerUid },
    select: CHALLENGE_PLAYER_SELECT,
  });

  if (!viewer) {
    return {
      viewer: null,
      historyScope: "participant",
      historyPage: { hasMore: false, nextCursor: null },
      candidates: [],
      scheduledMatches: [],
      historyMatches: [],
      activities: [],
      record: emptyChallengeRecord(),
      fundingRail: buildChallengeFundingRailSurface(),
      serverNow: nowIso,
      updatedAt: nowIso,
    };
  }

  const [candidateRows, historySnapshot, sessionSnapshot] = await Promise.all([
    prisma.user.findMany({
      where: {
        uid: {
          not: viewerUid,
        },
        verificationMethod: {
          not: "system",
        },
      },
      select: CHALLENGE_PLAYER_SELECT,
      orderBy: [{ lastSeen: "desc" }, { verificationLevel: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    loadChallengeHistoryRows(prisma, viewer.id, viewer.isAdmin),
    loadLiveSessionSnapshot(prisma),
  ]);

  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    historySnapshot.rows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  const preferenceRows =
    reconciledRows.length > 0
      ? await prisma.scheduledMatchUserPreference.findMany({
          where: {
            userId: viewer.id,
            scheduledMatchId: {
              in: reconciledRows.map((row) => row.id),
            },
          },
          select: {
            scheduledMatchId: true,
            favorite: true,
            bookmarked: true,
            colorTag: true,
            updatedAt: true,
          },
        })
      : [];
  const preferenceByMatchId = new Map(
    preferenceRows.map((row) => [
      row.scheduledMatchId,
      normalizeScheduledMatchViewerPreference(row),
    ])
  );
  const attachPreference = (tile: ScheduledMatchTile) => ({
    ...tile,
    viewerPreference:
      preferenceByMatchId.get(tile.id) ?? EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE,
  });

  const { tiles } = deriveScheduledMatchTiles(
    reconciledRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  const historyMatches = deriveChallengeHistoryTiles(
    reconciledRows,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions,
    new Set(tiles.map((tile) => tile.id))
  );

  const activities = await loadChallengeActivityRows(prisma, reconciledRows);
  const viewerRows = reconciledRows.filter(
    (row) => row.challenger.id === viewer.id || row.challenged.id === viewer.id
  );
  const record = buildChallengeRecordSummary(viewerRows, viewer);

  return {
    viewer: buildPlayerSurface(viewer),
    historyScope: viewer.isAdmin ? "global" : "participant",
    historyPage: historySnapshot.page,
    candidates: candidateRows.map((candidate) => buildPlayerSurface(candidate)),
    scheduledMatches: tiles.map(attachPreference),
    historyMatches: historyMatches.map(attachPreference),
    activities,
    record,
    fundingRail: buildChallengeFundingRailSurface(),
    serverNow: nowIso,
    updatedAt: nowIso,
  };
}
