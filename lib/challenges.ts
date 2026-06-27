
import { CHALLENGE_NOTE_MAX_CHARS } from "@/lib/challengeConfig";
import {
  buildChallengeEconomySurface,
  type ScheduledMatchDisplayState,
  type ScheduledMatchEconomySurface,
  type ScheduledMatchPersistedStatus,
} from "@/lib/challengeEconomy";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import { loadLiveSessionSnapshot } from "@/lib/liveSessionSnapshot";
import { buildClaimedPlayerHref } from "@/lib/publicPlayers";
import {
  EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE,
  normalizeScheduledMatchViewerPreference,
  type ScheduledMatchViewerPreference,
} from "@/lib/scheduledMatchPreferences";
import {
  WOLO_CHAIN_ID,
  WOLO_CHALLENGE_ESCROW_ADDRESS,
} from "@/lib/woloChain";

const CHALLENGE_ONLINE_WINDOW_MS = 2 * 60 * 1000;
const CHALLENGE_LOOKAHEAD_MS = 7 * 24 * 60 * 60 * 1000;
const CHALLENGE_HISTORY_LOOKBACK_MS = 12 * 60 * 60 * 1000;
const CHALLENGE_RECENT_LINGER_MS = 15 * 60 * 1000;
const CHALLENGE_START_GRACE_MS = 60 * 1000;
const SESSION_MATCH_LOOKBACK_MS = 45 * 60 * 1000;
const SESSION_MATCH_LOOKAHEAD_MS = 8 * 60 * 60 * 1000;
const CHALLENGE_LEDGER_LOOKBACK_MS = 45 * 24 * 60 * 60 * 1000;
const CHALLENGE_ACTIVITY_LIMIT = 40;
const TROPHY_DAY_MS = 24 * 60 * 60 * 1000;
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
] as const;

function projectedChallengeTrophyBounty(trophy: {
  currentBountyWolo: number;
  bountyGrowthWolo: number;
  holderSince: Date | null;
  status: string;
}) {
  if (!trophy.holderSince || !["held", "active", "guardian_held"].includes(trophy.status)) {
    return trophy.currentBountyWolo;
  }
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.now() - trophy.holderSince.getTime()) / TROPHY_DAY_MS)
  );
  return trophy.currentBountyWolo + elapsedDays * trophy.bountyGrowthWolo;
}

type ChallengeUserRow = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  verified: boolean;
  verificationLevel: number;
  lastSeen: Date | null;
  walletAddress: string | null;
};

type ScheduledMatchRow = {
  id: number;
  status: string;
  scheduledAt: Date;
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
  scheduledAt: string;
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
} as const;

const SCHEDULED_MATCH_SELECT = {
  id: true,
  status: true,
  scheduledAt: true,
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

function playerIsOnline(lastSeen: Date | null) {
  if (!lastSeen) return false;
  return Date.now() - lastSeen.getTime() <= CHALLENGE_ONLINE_WINDOW_MS;
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
    isOnline: playerIsOnline(user.lastSeen),
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
    take: CHALLENGE_ACTIVITY_LIMIT,
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
        detail: `${challengerName} missed check-in. The missed-side Match Guarantee routes to Community Treasury.`,
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
        detail: `${challengedName} missed check-in. The missed-side Match Guarantee routes to Community Treasury.`,
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
        detail: "Both players missed the check-in lock. Match Guarantees route to Community Treasury.",
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

  return items.slice(0, CHALLENGE_ACTIVITY_LIMIT);
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
    )
    .slice(0, CHALLENGE_ACTIVITY_LIMIT);
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

function findLinkedSession(
  sessions: ComparableSession[],
  row: ScheduledMatchRow,
  usedSessionKeys: Set<string>
) {
  const scheduledAt = row.scheduledAt.getTime();
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
    row.updatedAt,
    row.createdAt,
    row.scheduledAt,
  ].filter((value): value is Date => value instanceof Date);

  if (displayState === "proposed" || displayState === "terms_accepted") {
    return row.scheduledAt > row.createdAt ? row.scheduledAt : row.createdAt;
  }

  return timestamps[0] ?? row.scheduledAt;
}

function buildScheduledMatchTile(
  row: ScheduledMatchRow,
  linkedSession: ComparableSession | null,
  now = new Date(),
  viewerPreference: ScheduledMatchViewerPreference = EMPTY_SCHEDULED_MATCH_VIEWER_PREFERENCE
): ScheduledMatchTile {
  const linkedSessionState =
    linkedSession?.state ??
    (row.status === "completed" ? "completed" : row.status === "live_confirmed" ? "live" : null);
  const surface = buildChallengeEconomySurface(
    {
      status: linkedSessionState === "live" ? "live_confirmed" : linkedSessionState === "completed" ? "completed" : row.status,
      scheduledAt: row.scheduledAt,
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
  const displayState = linkedSessionState === "live" ? "live" : linkedSessionState === "completed" ? "completed" : surface.displayState;
  const activityAt = buildActivityAt(row, displayState);

  return {
    id: row.id,
    status: normalizeChallengeStatusForTile(row.status),
    displayState,
    scheduledAt: row.scheduledAt.toISOString(),
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
        linkedSessionState === "live"
          ? "Live confirmed"
          : linkedSessionState === "completed"
            ? "Completed"
            : surface.economy.statusLabel,
      statusDetail:
        linkedSessionState === "live"
          ? "The match session is linked and underway."
          : linkedSessionState === "completed"
            ? "Result is ready for Match Guarantee return and Wolo Wager settlement."
            : surface.economy.statusDetail,
      readyForSettlement:
        linkedSessionState === "completed" ? true : surface.economy.readyForSettlement,
      settlementReadyAt:
        linkedSessionState === "completed"
          ? row.settlementReadyAt?.toISOString() ?? row.resultAt?.toISOString() ?? null
          : surface.economy.settlementReadyAt,
    },
    challenger: buildPlayerSurface(row.challenger),
    challenged: buildPlayerSurface(row.challenged),
    linkedSessionKey: linkedSession?.sessionKey ?? row.linkedSessionKey ?? null,
    linkedSessionState,
    linkedMapName: linkedSession?.mapName ?? row.linkedMapName ?? null,
    linkedWinner: linkedSession?.winner ?? row.linkedWinner ?? null,
    durationSeconds: linkedSession?.durationSeconds ?? row.linkedDurationSeconds ?? null,
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
  prisma: PrismaClient,
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

async function settleVerifiedScheduledMatchTitleStakes(
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
        notIn: ["cancelled", "canceled", "disputed", "settled"],
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
    if (currentCustodianId && !expectedCustodianIds.has(currentCustodianId)) {
      await prisma.trophyChallenge.update({
        where: { id: titleChallenge.id },
        data: {
          status: "disputed",
          settlementStatus: "stale_custody_blocked",
          errorState:
            "Title custody changed before this scheduled result settled. Operator review required.",
        },
      });
      continue;
    }

    const challengerWon = titleChallenge.challengerUserId === winner.id;
    const isArtifact = titleChallenge.trophy.kind === "artifact";
    const appOnly = titleChallenge.trophy.chainStatus === "app_only";
    const challengeStatus = isArtifact
      ? "replay_uploaded"
      : appOnly
        ? "settled"
        : challengerWon
          ? "verified_challenger_win"
          : "verified_defender_win";
    const settlementStatus = isArtifact
      ? "artifact_proof_review"
      : appOnly
        ? "app_only_auto_settled"
        : "chain_intent_required";
    const dethroneBountyWolo =
      challengerWon && !isArtifact
        ? projectedChallengeTrophyBounty(titleChallenge.trophy)
        : 0;

    await prisma.$transaction(async (tx) => {
      const claimedSettlement = await tx.trophyChallenge.updateMany({
        where: {
          id: titleChallenge.id,
          winnerUserId: null,
        },
        data: {
          winnerUserId: winner.id,
          replayId: session.id,
          gameId: session.id,
          watcherSessionId: session.sessionKey,
          status: challengeStatus,
          settlementStatus,
          verificationSummary: isArtifact
            ? `Replay #${session.id} attached automatically. Artifact metric proof still requires review before custody moves.`
            : `Scheduled match #${row.id} matched replay #${session.id}; ${challengePlayerName(winner)} verified as winner.`,
          errorState: null,
        },
      });
      if (claimedSettlement.count === 0) return;

      if (challengerWon && appOnly && !isArtifact) {
        await tx.trophy.update({
          where: { id: titleChallenge.trophyId },
          data: {
            currentHolderUserId: winner.id,
            currentHolderDisplayName: challengePlayerName(winner),
            currentHolderWoloAddress: winner.walletAddress,
            status: "held",
            currentBountyWolo: 0,
            holderSince: completedAt,
            forfeitureNeeded: false,
            eligibilityNote: "Transferred automatically after verified scheduled-match proof.",
          },
        });
      }

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
          status: isArtifact ? "attention_required" : "recorded",
          rawResponse: {
            scheduledMatchId: row.id,
            watcherSessionId: session.sessionKey,
            winner: session.winner,
            challengerWon,
            settlementStatus,
          },
        },
      });

      if (!isArtifact && appOnly) {
        await tx.trophyEvent.create({
          data: {
            trophyId: titleChallenge.trophyId,
            eventType: challengerWon
              ? "CHALLENGE_SETTLED_HOLDER_CHANGED"
              : "CHALLENGE_SETTLED_DEFENSE",
            actorRole: "system",
            initiatedBy: "system",
            fromHolderUserId:
              titleChallenge.trophy.currentHolderUserId ??
              titleChallenge.trophy.guardianHolderUserId,
            toHolderUserId: challengerWon
              ? winner.id
              : titleChallenge.trophy.currentHolderUserId ??
                titleChallenge.trophy.guardianHolderUserId,
            gameId: session.id,
            replayId: session.id,
            challengeId: titleChallenge.id,
            status: "recorded",
            rawResponse: {
              mode: "app_only",
              automatic: true,
              scheduledMatchId: row.id,
            },
          },
        });
      }

      if (challengerWon && dethroneBountyWolo > 0) {
        await tx.trophyPayout.create({
          data: {
            trophyId: titleChallenge.trophyId,
            recipientUserId: winner.id,
            recipientDisplayName: challengePlayerName(winner),
            recipientWoloAddress: winner.walletAddress,
            amountWolo: dethroneBountyWolo,
            payoutKind: "dethrone_bounty",
            status: "pending",
            rawRequest: {
              challengeId: titleChallenge.id,
              scheduledMatchId: row.id,
              settlementMode: appOnly ? "app_only_auto" : "chain_intent",
              fundingTruth: "Operator payout remains required.",
            },
          },
        });
      }
    });
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

  for (const row of rows) {
    const surface = buildChallengeEconomySurface(
      {
        status: row.status,
        scheduledAt: row.scheduledAt,
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
    const canLinkSessions = hasTerms
      ? surface.displayState === "ready" || row.status === "live_confirmed" || row.status === "completed"
      : row.status === "accepted" || row.status === "completed";

    if (canLinkSessions) {
      const completedSession = findLinkedSession(
        recentlyCompletedSessions,
        row,
        matchedCompletedSessionKeys
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

        await prisma.scheduledMatch.update({
          where: { id: row.id },
          data: {
            status: "completed",
            liveConfirmedAt: row.liveConfirmedAt ?? completedAt,
            resultAt: completedAt,
            settlementReadyAt: row.settlementReadyAt ?? completedAt,
            linkedSessionKey: completedSession.sessionKey,
            linkedMapName: completedSession.mapName,
            linkedWinner: completedSession.winner,
            linkedDurationSeconds: completedSession.durationSeconds,
          },
        });

        if (row.status !== "completed") {
          await recordAutoScheduledMatchActivity(prisma, {
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
        }

        try {
          await settleVerifiedScheduledMatchTitleStakes(
            prisma,
            row,
            completedSession,
            completedAt
          );
        } catch (error) {
          console.error(
            `Failed to settle title stakes for scheduled match #${row.id}:`,
            error
          );
        }

        updatedRows.push(nextRow);
        continue;
      }

      const activeSession = findLinkedSession(activeSessions, row, matchedActiveSessionKeys);

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
        const resolvedAt = new Date(row.scheduledAt);
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

        await prisma.scheduledMatch.update({
          where: { id: row.id },
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

        await recordAutoScheduledMatchActivity(prisma, {
          scheduledMatchId: row.id,
          eventType: desiredStatus,
          detail:
            desiredStatus === "no_show_left"
              ? `${challengePlayerName(row.challenger)} missed check-in. Missed-side Match Guarantee routes to Community Treasury.`
              : desiredStatus === "no_show_right"
                ? `${challengePlayerName(row.challenged)} missed check-in. Missed-side Match Guarantee routes to Community Treasury.`
                : "Both players missed the check-in lock.",
          createdAt: resolvedAt,
        });

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

    if (row.status !== "accepted") {
      updatedRows.push(row);
      continue;
    }

    const forfeitedAt = new Date(row.scheduledAt.getTime() + CHALLENGE_START_GRACE_MS);
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
      case "live":
        return 0;
      case "ready":
        return 1;
      case "checkin_open":
        return 2;
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

  const leftScheduledAt = new Date(left.scheduledAt).getTime();
  const rightScheduledAt = new Date(right.scheduledAt).getTime();

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
    ].includes(left.displayState)
  ) {
    return leftScheduledAt - rightScheduledAt;
  }

  return new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime();
}

function compareHistoryTileOrder(left: ScheduledMatchTile, right: ScheduledMatchTile) {
  return new Date(right.activityAt).getTime() - new Date(left.activityAt).getTime();
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
    includeResolved?: boolean;
  }
) {
  const now = Date.now();
  const earliest = new Date(now - CHALLENGE_HISTORY_LOOKBACK_MS);
  const latest = new Date(now + CHALLENGE_LOOKAHEAD_MS);
  const recentResolvedCutoff = new Date(now - CHALLENGE_RECENT_LINGER_MS);
  const statusFilters = [
    {
      status: {
        in: [...ACTIVE_SCHEDULED_STATUSES],
      },
      scheduledAt: {
        gte: earliest,
        lte: latest,
      },
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
    where: {
      AND: [{ OR: statusFilters }, ...participantFilters],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "desc" }],
    select: SCHEDULED_MATCH_SELECT,
  });
}

async function loadChallengeHistoryRows(
  prisma: PrismaClient,
  viewerUserId: number
) {
  const lookbackCutoff = new Date(Date.now() - CHALLENGE_LEDGER_LOOKBACK_MS);

  return prisma.scheduledMatch.findMany({
    where: {
      AND: [
        {
          OR: [
            { challengerUserId: viewerUserId },
            { challengedUserId: viewerUserId },
          ],
        },
        {
          OR: [
            { createdAt: { gte: lookbackCutoff } },
            { scheduledAt: { gte: lookbackCutoff } },
            { acceptedAt: { gte: lookbackCutoff } },
            { declinedAt: { gte: lookbackCutoff } },
            { cancelledAt: { gte: lookbackCutoff } },
            { resultAt: { gte: lookbackCutoff } },
          ],
        },
      ],
    },
    orderBy: [{ scheduledAt: "desc" }, { createdAt: "desc" }],
    take: 120,
    select: SCHEDULED_MATCH_SELECT,
  });
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
        summary.ready += 1;
        break;
      case "declined":
        summary.declined += 1;
        break;
      case "cancelled":
      case "canceled":
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
  counterpartUserId: number
): Promise<ScheduledMatchTile | null> {
  const [rows, sessionSnapshot] = await Promise.all([
    loadScheduledMatchRows(prisma, {
      viewerUserId,
      counterpartUserId,
      includeResolved: true,
    }),
    loadLiveSessionSnapshot(prisma),
  ]);

  const { tiles } = deriveScheduledMatchTiles(
    await persistScheduledMatchResults(
      prisma,
      rows,
      sessionSnapshot.activeSessions,
      sessionSnapshot.recentlyCompletedSessions
    ),
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );

  return tiles[0] ?? null;
}

export async function loadChallengeHubSnapshot(
  prisma: PrismaClient,
  viewerUid: string | null
): Promise<ChallengeHubSnapshot> {
  const nowIso = new Date().toISOString();

  if (!viewerUid) {
    return {
      viewer: null,
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

  const [candidateRows, historyRows, sessionSnapshot] = await Promise.all([
    prisma.user.findMany({
      where: {
        uid: {
          not: viewerUid,
        },
        steamId: {
          not: null,
        },
      },
      select: CHALLENGE_PLAYER_SELECT,
      orderBy: [{ lastSeen: "desc" }, { verificationLevel: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    loadChallengeHistoryRows(prisma, viewer.id),
    loadLiveSessionSnapshot(prisma),
  ]);

  const reconciledRows = await persistScheduledMatchResults(
    prisma,
    historyRows,
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
  const record = buildChallengeRecordSummary(reconciledRows, viewer);

  return {
    viewer: buildPlayerSurface(viewer),
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
