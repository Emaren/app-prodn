import {
  applyReplayAdjudicationToGameStats,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import {
  replayResultAdjudicationAuthorizesBets,
} from "@/lib/replayResultAdjudications";
import { Prisma, type PrismaClient } from "@/lib/generated/prisma";
import {
  canonicalBattleIdentityKey,
  ensurePublicBattleIdentities,
  platformMatchIdFromBattleSession,
} from "@/lib/battleIdentity";
import {
  loadScheduledMatchTilesForLiveBoard,
  type ScheduledMatchTile,
} from "@/lib/challenges";
import {
  acquireChallengeDesyncAdvisoryLock,
  assertOrdinaryBetMarketWinnerPayoutAllowedFromDb,
  ChallengeDesyncError,
  loadDesyncIncidentsForSettlement,
  planBetMarketDesyncReview,
} from "@/lib/desyncChallenge";
import { parsePlayers, readMapName } from "@/lib/gameStatsView";
import {
  DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES,
  DESYNC_SIDE_MARKET_LEFT_LABEL,
  DESYNC_SIDE_MARKET_RIGHT_LABEL,
  DESYNC_SIDE_MARKET_TYPE,
  WINNER_MARKET_TYPE,
  buildDesyncSideMarketSlug,
  desyncReviewDeadlineMs,
  isDesyncSideMarketType,
  nestDesyncSideMarkets,
  resolveDesyncSideMarketWinner,
  winnerSlugFromDesyncSideMarketSlug,
} from "@/lib/desyncSideMarket";
import {
  classifyResolvedMarketSettlement,
  planResolvedWagerSettlements,
} from "@/lib/betWagerSettlement";
import {
  acquireReplayDesyncAdvisoryLock,
  loadReplayDesyncIncidentProvenance,
} from "@/lib/replayDesyncIncidents";
import { loadLiveSessionSnapshot, type LiveGameSession } from "@/lib/liveSessionSnapshot";
import { resolveFinalGameStatsIdForSessionKey } from "@/lib/liveReplayDetail";
import {
  isUnknownishReplayValue,
  resolveReplayWinnerTruth,
} from "@/lib/unresolvedWatcherResult";
import {
  normalizeReplayPlayerName,
  normalizeReplayPlayers,
  isTerminalVoidedMarketStatus,
  resolveReplayTeams,
  resolveWinningTeamIndex,
  rosterSnapshot,
  validateMarketFinalIntegrity,
  type ReplayTeamConfidence,
  type ReplayTeamFormat,
  type ReplayTeamProvenance,
  type ReplayTeamResolutionStatus,
} from "@/lib/teamResolution";
import {
  createPendingWoloClaim,
  normalizePendingWoloClaimName,
} from "@/lib/pendingWoloClaims";
import {
  retryPendingClaimSettlement,
} from "@/lib/adminWoloClaims";
import { settleFounderBonuses } from "@/lib/betFounderBonuses";
import {
  acquireBetStakeTicketLock,
  effectiveBetWagerStakeTxHash,
  isRecordedBetStakeTicket,
} from "@/lib/betStakeFunding";
import {
  buildBetStakeTicketMarketGuardWhere,
  canonicalBetStakeTicketPropositionSetHash,
  loadViewerBetStakeTickets,
} from "@/lib/betStakeTickets";
import {
  buildBetStakeTicketMemo,
} from "@/lib/betStakeMemo";
import {
  executeWoloEscrowSettlementRun,
  findConfirmedWoloPayoutByMemo,
  getWoloPayoutExecutionBlocker,
  getWoloSettlementSurfaceStatus,
  hasWoloEscrowSettlementExecutionConfigured,
  hasWoloPayoutExecutionConfigured,
  type SettlementRunResult,
  validateWoloEscrowSettlementRun,
} from "@/lib/woloBetSettlement";
import {
  validateDistinctClaimPayoutTxBatch,
  type ClaimPayoutGuardResult,
} from "@/lib/woloClaimPayoutGuards";
import { recordUserActivity } from "@/lib/userExperience";
import {
  WOLO_BET_TEST_MODE,
  buildWoloRestTxLookupUrl,
  getWoloMainnetDisplayStartAt,
  getWoloBetEscrowRuntime,
  isMainnetVisibleBetWager,
  isWoloMainnet,
} from "@/lib/woloChain";
import {
  BET_STAKE_INTENT_RECOVERABLE_STATUSES,
  isBetStakeIntentCountableStatus,
  loadViewerBetStakeIntents,
} from "@/lib/betStakeIntents";
import {
  BETTING_FEE_RATE_BPS,
  BPS_DENOMINATOR,
} from "@/lib/bettingFees";
import {
  freshBettingCloseReason,
} from "@/lib/betMarketWagerability";
import {
  toWatchStreamPayload,
  type WatchStreamPayload,
} from "@/lib/watchStreams";
import {
  buildBetBroadcastPreviewUrls,
  EMPTY_BET_BROADCAST_PREVIEW_URLS,
  loadBetBroadcastPreviewMap,
  type BetBroadcastPreviewUrls,
} from "@/lib/betBroadcastPreviews";

export type BetSide = "left" | "right";
export type BetStatus =
  | "open"
  | "closing"
  | "live"
  | "awaiting_final_proof"
  | "settled"
  | "voided"
  | "under_review";
export type BetFounderBonusType = "participants" | "winner";

export type BetBoardSide = {
  key: BetSide;
  name: string;
  href: string | null;
  poolWolo: number;
  crowdPercent: number;
  slips: number;
  seededWolo: number;
};

export type BetFounderChip = {
  id: number;
  bonusType: BetFounderBonusType;
  totalAmountWolo: number;
  note: string | null;
  status: string;
  createdAt: string;
};

export type BetWarTapeRow = {
  id: string;
  kind: "tx" | "event";
  label: string;
  actor: string | null;
  amountWolo: number | null;
  side: BetSide | null;
  note: string | null;
  txHash: string | null;
  txUrl: string | null;
  createdAt: string;
};

export type BetBroadcastFeeds = {
  left: WatchStreamPayload | null;
  god: WatchStreamPayload | null;
  right: WatchStreamPayload | null;
};

const EMPTY_BROADCAST_FEEDS: BetBroadcastFeeds = {
  left: null,
  god: null,
  right: null,
};

export type BetBoardMarket = {
  id: number;
  parentMarketId: number | null;
  battleNumber: number | null;
  slug: string;
  title: string;
  eventLabel: string;
  marketType: string;
  href: string | null;
  linkedSessionKey: string | null;
  linkedGameStatsId: number | null;
  status: BetStatus;
  bettingOpen: boolean;
  bettingCloseReason: string | null;
  teamFormat: string | null;
  teamResolutionStatus: string | null;
  teamResolutionProvenance: string | null;
  teamConfidence: string | null;
  integrityStatus: string;
  integrityReason: string | null;
  rosterLockedAt: string | null;
  featured: boolean;
  closeLabel: string;
  scheduledStartAt: string | null;
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  founderBonuses: BetFounderChip[];
  warTape: BetWarTapeRow[];
  broadcastFeeds: BetBroadcastFeeds;
  broadcastPreviewUrls: BetBroadcastPreviewUrls;
  viewerWager: {
    side: BetSide;
    amountWolo: number;
    slipCount: number;
    executionMode: "app_only" | "onchain_escrow";
    stakeTxHash: string | null;
    stakeWalletAddress: string | null;
    stakeLockedAt: string | null;
  } | null;
  winnerSide: BetSide | null;
  desyncMarket: BetBoardMarket | null;
};

export type BetBookEntry = {
  marketId: number;
  marketSlug: string;
  title: string;
  eventLabel: string;
  side: BetSide;
  pickedLabel: string;
  amountWolo: number;
  slipCount: number;
  projectedReturnWolo: number;
  closeLabel: string;
  scheduledStartAt: string | null;
  status: BetStatus;
  executionMode: "app_only" | "onchain_escrow";
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
};

export type BetSettledResult = {
  id: number;
  battleNumber: number | null;
  title: string;
  eventLabel: string;
  winner: string;
  resolutionStatus: "settled" | "voided" | "under_review";
  resolutionReason: string | null;
  refundStatus: string | null;
  settlementStatus: string | null;
  settlementFailureCode: string | null;
  settlementAttemptedAt: string | null;
  settlementExecutedAt: string | null;
  payoutState: "executed" | "pending" | "partial" | "failed" | "corrected";
  payoutTxHashes: string[];
  payoutProofUrls: string[];
  teamFormat: string | null;
  teamResolutionProvenance: string | null;
  integrityStatus: string;
  integrityReason: string | null;
  integritySummary: string | null;
  correctionStatus: string | null;
  amountStillOwedWolo: number;
  overpaymentWolo: number;
  mapName: string;
  totalPotWolo: number;
  payoutWolo: number;
  settledAt: string | null;
  href: string | null;
  linkedSessionKey: string | null;
  broadcastFeeds: BetBroadcastFeeds;
  broadcastPreviewUrls: BetBroadcastPreviewUrls;
  founderBonuses: BetFounderChip[];
};

export type BetBoardSnapshot = {
  generatedAt: string;
  viewerName: string | null;
  wolo: {
    betEscrowMode: "disabled" | "optional" | "required";
    betEscrowAddress: string | null;
    onchainEscrowEnabled: boolean;
    onchainEscrowRequired: boolean;
    escrowConfigError: string | null;
    betTestMode: boolean;
    settlementServiceConfigured: boolean;
    settlementAuthConfigured: boolean;
    settlementExecutionMode: "settlement_service" | "local_signer_fallback" | "unconfigured";
    groupedRunCapability:
      | "supported"
      | "fallback_to_singles"
      | "not_configured"
      | "auth_required"
      | "auth_failed"
      | "unknown";
    escrowVerifyCapability: "supported" | "not_configured" | "unavailable" | "unknown";
    escrowRecentCapability: "supported" | "not_configured" | "unavailable" | "unknown";
    settlementSurfaceWarnings: string[];
    settlementSurfaceDetail: string | null;
  };
  recovery: {
    unresolvedStakeIntents: Array<{
      id: number;
      marketId: number;
      marketStatus: BetStatus;
      title: string;
      eventLabel: string;
      side: BetSide;
      amountWolo: number;
      status: string;
      stakeTxHash: string | null;
      walletAddress: string | null;
      errorDetail: string | null;
      updatedAt: string;
    }>;
    unresolvedStakeTickets: Array<{
      id: number;
      version: number;
      status: string;
      totalAmountWolo: number;
      stakeTxHash: string | null;
      walletAddress: string;
      memo: string;
      errorDetail: string | null;
      updatedAt: string;
      legs: Array<{
        marketId: number;
        marketStatus: BetStatus;
        title: string;
        eventLabel: string;
        legRole: string;
        side: BetSide;
        amountWolo: number;
      }>;
    }>;
  };
  featuredMarket: BetBoardMarket | null;
  openMarkets: BetBoardMarket[];
  awaitingProofMarkets: BetBoardMarket[];
  settledResults: BetSettledResult[];
  yourBook: {
    activeCount: number;
    stakedWolo: number;
    projectedReturnWolo: number;
    openWagers: BetBookEntry[];
  };
  heat: {
    biggestPot: {
      label: string;
      potWolo: number;
    } | null;
    bestReturn: {
      label: string;
      returnMultiplier: number;
    } | null;
    liveCount: number;
  };
};


const OPEN_STATUSES: BetStatus[] = ["open", "closing", "live"];
const BETTOR_SETTLEMENT_CLAIM_KINDS = [
  "bet_payout",
  "bet_refund",
  "bet_corrective_refund",
] as const;

function isCoreBetSettlementClaimKind(value: string) {
  return BETTOR_SETTLEMENT_CLAIM_KINDS.some((claimKind) => claimKind === value);
}

export const RECONCILABLE_WATCHER_STATUSES: BetStatus[] = [
  ...OPEN_STATUSES,
  "awaiting_final_proof",
  "under_review",
];
const WATCHER_FINAL_PROOF_GRACE_MINUTES = Math.max(
  5,
  Number.parseInt(process.env.WATCHER_FINAL_PROOF_GRACE_MINUTES || "20", 10) || 20
);

/*
 * Live watcher projections may briefly rotate between physical parse rows
 * while retaining the same stable platform session key.
 *
 * Keep the existing market visible but financially locked during that
 * continuity window instead of immediately removing it from the live deck.
 */
const WATCHER_LIVE_SNAPSHOT_GRACE_SECONDS = Math.max(
  15,
  Number.parseInt(
    process.env.WATCHER_LIVE_SNAPSHOT_GRACE_SECONDS || "120",
    10
  ) || 120
);

const DESYNC_MARKET_REVIEW_GRACE_MINUTES = Math.max(
  1,
  Number.parseInt(
    process.env.DESYNC_MARKET_REVIEW_GRACE_MINUTES ||
      String(DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES),
    10
  ) || DEFAULT_DESYNC_MARKET_REVIEW_GRACE_MINUTES
);
const CHALLENGE_MARKET_SLUG_PREFIX = "challenge-runway-";
const WATCHER_MARKET_SLUG_PREFIX = "watcher-live-";
const LOW_CONFIDENCE_MARKET_LABELS = [
  "players parsing",
  "parsing",
  "live 4v4 detected",
  "live 4v4",
  "unknown",
  "game in progress",
] as const;

type MarketConfidenceInput = {
  title: string | null | undefined;
  eventLabel: string | null | undefined;
  leftLabel: string | null | undefined;
  rightLabel: string | null | undefined;
};

export function isConfidentBetMarket(input: MarketConfidenceInput) {
  const labels = [
    input.title,
    input.eventLabel,
    input.leftLabel,
    input.rightLabel,
  ].map((value) => normalizeName(value).toLowerCase());

  return (
    labels.every(Boolean) &&
    labels.every(
      (label) =>
        !LOW_CONFIDENCE_MARKET_LABELS.some((blockedLabel) =>
          label.includes(blockedLabel)
        )
    )
  );
}

function normalizeName(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function uniqueNames(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeName(value);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }

  return result;
}


function hashValue(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_003;
  }
  return Math.abs(hash);
}

function projectReturnWolo(stakeWolo: number, selectedPoolWolo: number, oppositePoolWolo: number) {
  if (stakeWolo <= 0) return 0;
  const nextSelectedPool = selectedPoolWolo + stakeWolo;
  if (nextSelectedPool <= 0) return stakeWolo;
  return Math.max(
    stakeWolo,
    Math.round(stakeWolo + oppositePoolWolo * (stakeWolo / nextSelectedPool))
  );
}

function computeSharePercent(sidePoolWolo: number, totalPotWolo: number) {
  if (totalPotWolo <= 0) return 50;
  return Math.round((sidePoolWolo / totalPotWolo) * 100);
}

function formatCloseLabel(status: BetStatus, closeAt: Date | null) {
  if (status === "settled") return "Settled";
  if (WOLO_BET_TEST_MODE) {
    return status === "live" ? "Live until final" : "Open until final";
  }
  if (status === "live") return "Live";
  if (!closeAt) return status === "closing" ? "Closing soon" : "Open";

  const diffMs = closeAt.getTime() - Date.now();
  if (diffMs <= 0) return status === "closing" ? "Locking now" : "Open";

  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000));
  if (diffMinutes >= 60) {
    const hours = Math.round(diffMinutes / 60);
    return `${hours}h left`;
  }

  return `${diffMinutes}m left`;
}

function buildBetMarketHref(marketId: number) {
  if (!Number.isSafeInteger(marketId) || marketId <= 0) return null;
  return `/bets/${marketId}`;
}

type SessionSideDescription = {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftNames: string[];
  rightNames: string[];
};

function compactTeamLabel(names: string[]) {
  if (names.length <= 4) return names.join(" / ");
  return `${names[0]} / ${names[1]} / ${names[2]} / ${names[3]} + ${names.length - 4} more`;
}

function clampMarketLabel(label: string) {
  const clean = normalizeName(label);
  if (clean.length <= 255) return clean;
  return `${clean.slice(0, 252).trimEnd()}…`;
}

function formatTeamLabel(names: string[]) {
  return clampMarketLabel(compactTeamLabel(names));
}

function describeSessionSides(session: LiveGameSession): SessionSideDescription | null {
  const resolution = session.teamResolution;
  if (
    resolution.status !== "resolved" ||
    resolution.confidence !== "high" ||
    resolution.teams.length !== 2
  ) {
    return null;
  }
  const leftNames = resolution.teams[0].players.map((player) => player.name);
  const rightNames = resolution.teams[1].players.map((player) => player.name);
  const leftLabel = formatTeamLabel(leftNames);
  const rightLabel = formatTeamLabel(rightNames);
  return {
    title: `${leftLabel} vs ${rightLabel}`,
    leftLabel,
    rightLabel,
    leftNames,
    rightNames,
  };
}

function inferWinnerSideFromSession(session: LiveGameSession): BetSide | null {
  const winningIndex = resolveWinningTeamIndex(session.players, session.teamResolution);
  return winningIndex === 0 ? "left" : winningIndex === 1 ? "right" : null;
}

export function watcherSessionCanSeedSettledWinnerMarket(input: {
  state: string;
  finalProofPending: boolean;
  parseSource: string | null | undefined;
  bettingEligible: boolean;
}) {
  const parseSource = normalizeName(input.parseSource).toLowerCase();
  const hasCanonicalFinalReplay =
    input.state === "completed" &&
    parseSource !== "watcher_live" &&
    parseSource !== "watcher_stream";

  return Boolean(
    hasCanonicalFinalReplay &&
      !input.finalProofPending &&
      input.bettingEligible
  );
}

export function expiredWatcherMarketResolutionReason(input: {
  resolutionReason: string | null | undefined;
  linkedGameStatsId: number | null | undefined;
}) {
  if (input.resolutionReason === "explicit_desync_without_safe_winner") {
    return input.resolutionReason;
  }

  if (input.linkedGameStatsId) {
    if (
      input.resolutionReason &&
      input.resolutionReason !== "final_replay_pending"
    ) {
      return input.resolutionReason;
    }
    return "final_result_not_betting_eligible";
  }

  return "final_replay_not_received";
}

export type MarketSeed = {
  battleId?: number | null;
  scheduledMatchId: number | null;
  linkedSessionKey: string | null;
  /** Exact pre-platform identities proven by the live-session grouper. */
  identityAliases?: string[];
  linkedGameStatsId?: number | null;
  slug: string;
  title: string;
  eventLabel: string;
  marketType:
    | typeof WINNER_MARKET_TYPE
    | typeof DESYNC_SIDE_MARKET_TYPE;
  status: BetStatus;
  featured: boolean;
  sortOrder: number;
  source: "challenge" | "session";
  leftLabel: string;
  rightLabel: string;
  leftHref: string | null;
  rightHref: string | null;
  seedLeftWolo: number;
  seedRightWolo: number;
  closeAt: Date | null;
  proofDeadlineAt?: Date | null;
  resolutionReason?: string | null;
  settledAt: Date | null;
  winnerSide: BetSide | null;
  teamFormat: ReplayTeamFormat | null;
  teamResolutionStatus: ReplayTeamResolutionStatus | null;
  teamResolutionProvenance: ReplayTeamProvenance | null;
  teamConfidence: ReplayTeamConfidence | null;
  leftRosterSnapshot: Prisma.InputJsonValue;
  rightRosterSnapshot: Prisma.InputJsonValue;
  sourceParseIteration: number | null;
  sourceRosterHash: string | null;
  propositionHash: string | null;
  integrityStatus: string;
  integrityReason: string | null;
};

export function reconciledWinnerMarketSessionKeys(
  seeds: ReadonlyArray<{
    linkedSessionKey: string | null;
    marketType: string;
  }>
) {
  return new Set(
    seeds
      .filter(
        (seed) =>
          seed.marketType ===
          WINNER_MARKET_TYPE
      )
      .map((seed) =>
        normalizeName(
          seed.linkedSessionKey
        )
      )
      .filter(Boolean)
  );
}

export function watcherMarketNeedsDetachedReconciliation(input: {
  normalizedSessionKey: string;
  marketStatus: string;
  reconciledSessionKeys: ReadonlySet<string>;
}) {
  return Boolean(
    input.normalizedSessionKey &&
      (
        !input.reconciledSessionKeys.has(
          input.normalizedSessionKey
        ) ||
        input.marketStatus ===
          "under_review"
      )
  );
}

function marketSeedCreateData(seed: MarketSeed) {
  return {
    battleId: seed.battleId ?? null,
    scheduledMatchId: seed.scheduledMatchId,
    linkedSessionKey: seed.linkedSessionKey,
    linkedGameStatsId: seed.linkedGameStatsId ?? null,
    slug: seed.slug,
    title: seed.title,
    eventLabel: seed.eventLabel,
    marketType: seed.marketType,
    status: seed.status,
    featured: seed.featured,
    sortOrder: seed.sortOrder,
    leftLabel: seed.leftLabel,
    rightLabel: seed.rightLabel,
    leftHref: seed.leftHref,
    rightHref: seed.rightHref,
    seedLeftWolo: seed.seedLeftWolo,
    seedRightWolo: seed.seedRightWolo,
    closeAt: seed.closeAt,
    proofDeadlineAt: seed.proofDeadlineAt ?? null,
    resolutionReason: seed.resolutionReason ?? null,
    settledAt: seed.settledAt,
    winnerSide: seed.winnerSide,
    teamFormat: seed.teamFormat,
    teamResolutionStatus: seed.teamResolutionStatus,
    teamResolutionProvenance: seed.teamResolutionProvenance,
    teamConfidence: seed.teamConfidence,
    leftRosterSnapshot: seed.leftRosterSnapshot,
    rightRosterSnapshot: seed.rightRosterSnapshot,
    sourceParseIteration: seed.sourceParseIteration,
    sourceRosterHash: seed.sourceRosterHash,
    propositionHash: seed.propositionHash,
    integrityStatus: seed.integrityStatus,
    integrityReason: seed.integrityReason,
  };
}

function marketSeedUpdateData(
  seed: MarketSeed,
  existing?: {
    status: string;
    settledAt: Date | null;
    winnerSide: string | null;
    title: string;
    leftLabel: string;
    rightLabel: string;
    leftHref: string | null;
    rightHref: string | null;
    propositionHash: string | null;
    firstStakeAcceptedAt: Date | null;
    closeAt: Date | null;
    proofDeadlineAt: Date | null;
    resolutionReason: string | null;
    createdAt: Date;
  } | null
) {
  const existingWinnerSide =
    existing?.winnerSide === "left" || existing?.winnerSide === "right"
      ? (existing.winnerSide as BetSide)
      : null;
  const existingFinalized =
    existing?.status === "settled" && Boolean(existing?.settledAt) && Boolean(existingWinnerSide);
  const keepSettledWinnerLatch =
    existingFinalized && (seed.status !== "settled" || seed.winnerSide !== existingWinnerSide);
  const propositionLocked = Boolean(existing?.firstStakeAcceptedAt);
  const propositionChanged = Boolean(
    propositionLocked && existing?.propositionHash && seed.propositionHash !== existing.propositionHash
  );

  // Voiding is a terminal financial decision. A later final replay or routine
  // market seed reconciliation may attach evidence, but it can never resurrect
  // the book, restore a winner side, or interrupt an in-flight refund.
  if (isTerminalVoidedMarketStatus(existing?.status)) {
    return {
      status: "voided",
      featured: false,
      closeAt: null,
      settledAt: existing?.settledAt ?? null,
      winnerSide: null,
    };
  }

  if (existing?.status === "under_review") {
    return {
      scheduledMatchId: seed.scheduledMatchId,
      linkedSessionKey: seed.linkedSessionKey,
      eventLabel: seed.eventLabel,
      status: "under_review",
      featured: false,
      sortOrder: seed.sortOrder,
      closeAt:
        existing.closeAt ??
        new Date(),
      settledAt: existing.settledAt,
      winnerSide: null,
    };
  }

  if (propositionChanged) {
    return {
      scheduledMatchId: seed.scheduledMatchId,
      linkedSessionKey: seed.linkedSessionKey,
      eventLabel: seed.eventLabel,
      status: "under_review",
      featured: false,
      sortOrder: seed.sortOrder,
      closeAt: new Date(),
      settledAt: existing?.settledAt ?? null,
      winnerSide: null,
      integrityStatus: "under_review",
      integrityReason: "roster_changed_after_stake",
      commissionerReviewState: "roster_changed_after_stake",
      underReviewAt: new Date(),
      proofDeadlineAt: null,
    };
  }

  const nextProofDeadlineAt =
    seed.status === "awaiting_final_proof"
      ? existing?.proofDeadlineAt ??
        seed.proofDeadlineAt ??
        watcherFinalProofDeadline({
          proofDeadlineAt: null,
          underReviewAt: null,
          proofObservedAt: seed.closeAt,
          closeAt: existing?.closeAt ?? null,
          createdAt: existing?.createdAt ?? null,
        })
      : null;

  return {
    ...(seed.battleId ? { battleId: seed.battleId } : {}),
    scheduledMatchId: seed.scheduledMatchId,
    linkedSessionKey: seed.linkedSessionKey,
    title: propositionLocked ? existing?.title ?? seed.title : seed.title,
    eventLabel: seed.eventLabel,
    ...(seed.linkedGameStatsId
      ? { linkedGameStatsId: seed.linkedGameStatsId }
      : {}),
    marketType: seed.marketType,
    status: keepSettledWinnerLatch ? "settled" : seed.status,
    featured: keepSettledWinnerLatch ? false : seed.featured,
    sortOrder: seed.sortOrder,
    leftLabel: propositionLocked ? existing?.leftLabel ?? seed.leftLabel : seed.leftLabel,
    rightLabel: propositionLocked ? existing?.rightLabel ?? seed.rightLabel : seed.rightLabel,
    leftHref: propositionLocked ? existing?.leftHref ?? null : seed.leftHref,
    rightHref: propositionLocked ? existing?.rightHref ?? null : seed.rightHref,
    seedLeftWolo: seed.seedLeftWolo,
    seedRightWolo: seed.seedRightWolo,
    closeAt: keepSettledWinnerLatch ? null : seed.closeAt,
    proofDeadlineAt:
      keepSettledWinnerLatch
        ? null
        : nextProofDeadlineAt,
    ...(seed.status === "awaiting_final_proof"
      ? {
          resolutionReason:
            seed.resolutionReason ??
            existing?.resolutionReason ??
            "final_replay_pending",
        }
      : {}),
    settledAt: keepSettledWinnerLatch ? existing?.settledAt ?? seed.settledAt : seed.settledAt,
    winnerSide: keepSettledWinnerLatch ? existingWinnerSide : seed.winnerSide,
    ...(propositionLocked
      ? {}
      : {
          teamFormat: seed.teamFormat,
          teamResolutionStatus: seed.teamResolutionStatus,
          teamResolutionProvenance: seed.teamResolutionProvenance,
          teamConfidence: seed.teamConfidence,
          leftRosterSnapshot: seed.leftRosterSnapshot,
          rightRosterSnapshot: seed.rightRosterSnapshot,
          sourceParseIteration: seed.sourceParseIteration,
          sourceRosterHash: seed.sourceRosterHash,
          propositionHash: seed.propositionHash,
          integrityStatus: seed.integrityStatus,
          integrityReason: seed.integrityReason,
        }),
  };
}

export function buildWatcherMarketSlugForSessionKey(sessionKey: string) {
  const stableKey = slugify(sessionKey);
  return `${WATCHER_MARKET_SLUG_PREFIX}${stableKey}`.slice(0, 120);
}

function buildSessionMarketSlug(session: LiveGameSession, leftLabel: string, rightLabel: string) {
  return buildWatcherMarketSlugForSessionKey(
    session.sessionKey || session.originalFilename || `${leftLabel}-vs-${rightLabel}`
  );
}

function buildSessionEventLabel(session: LiveGameSession) {
  return buildWatcherEventLabel(
    session.finalProofPending ? "Final" : session.state === "live" ? "Live" : "Final",
    session.mapName
  );
}

function clampDbText(value: string, max: number) {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

function buildDesyncSideMarketSeed(
  parent: MarketSeed
): MarketSeed | null {
  /*
   * Only an actually live battle gets a desync proposition.
   *
   * It must also have a stable watcher session and proposition
   * identity so the side market can never float between games.
   */
  if (
    parent.marketType !== WINNER_MARKET_TYPE ||
    parent.status !== "live" ||
    !normalizeName(parent.linkedSessionKey) ||
    !parent.propositionHash
  ) {
    return null;
  }

  return {
    ...parent,

    /*
     * scheduledMatchId is unique on bet_markets.
     * The competitive winner market remains canonical.
     */
    scheduledMatchId: null,

    slug:
      buildDesyncSideMarketSlug(
        parent.slug
      ),

    title:
      "Will this battle desync?",

    eventLabel:
      clampDbText(
        `${parent.eventLabel} • Desync Market`,
        180
      ),

    marketType:
      DESYNC_SIDE_MARKET_TYPE,

    featured:
      false,

    sortOrder:
      parent.sortOrder + 1,

    leftLabel:
      DESYNC_SIDE_MARKET_LEFT_LABEL,

    rightLabel:
      DESYNC_SIDE_MARKET_RIGHT_LABEL,

    leftHref:
      null,

    rightHref:
      null,

    seedLeftWolo:
      0,

    seedRightWolo:
      0,

    closeAt:
      null,

    settledAt:
      null,

    winnerSide:
      null,

    /*
     * This proposition is NO / YES, not Team A / Team B.
     * propositionHash remains inherited to freeze battle identity.
     */
    teamFormat:
      null,

    teamResolutionStatus:
      null,

    teamResolutionProvenance:
      null,

    teamConfidence:
      null,

    leftRosterSnapshot:
      [],

    rightRosterSnapshot:
      [],

    integrityStatus:
      "verified",

    integrityReason:
      null,
  };
}


function clampNullableDbText(value: string | null | undefined, max: number) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return clampDbText(trimmed, max);
}

function buildWatcherEventLabel(mode: "Live" | "Final", mapName: string | null | undefined) {
  const normalizedMapName = normalizeName(mapName);
  const label = normalizedMapName ? `Watcher ${mode} • ${normalizedMapName}` : `Watcher ${mode}`;
  return clampDbText(label, 120);
}

function buildSessionMarketTitle(session: LiveGameSession) {
  const sides = describeSessionSides(session);
  if (sides) {
    return sides.title;
  }

  return session.players.length > 0
    ? session.players.map((player) => normalizeName(player.name)).filter(Boolean).join(" vs ")
    : session.originalFilename || "Replay-backed result";
}

function normalizeSettledMatchKey(title: string, mapName: string | null | undefined) {
  return `${normalizeName(title).toLowerCase()}::${normalizeName(mapName).toLowerCase()}`;
}

function readMarketMapLabel(eventLabel: string) {
  return eventLabel.includes("•")
    ? eventLabel.split("•").slice(1).join("•").trim() || eventLabel
    : eventLabel;
}

function marketSideKey(value: string | null | undefined) {
  return normalizeName(value).toLowerCase();
}

function resolveMarketSideTransfer(
  source: {
    leftLabel: string;
    rightLabel: string;
  },
  target: {
    leftLabel: string;
    rightLabel: string;
  }
) {
  const sourceLeft = marketSideKey(source.leftLabel);
  const sourceRight = marketSideKey(source.rightLabel);
  const targetLeft = marketSideKey(target.leftLabel);
  const targetRight = marketSideKey(target.rightLabel);

  if (!sourceLeft || !sourceRight || !targetLeft || !targetRight) {
    return null;
  }

  if (sourceLeft === targetLeft && sourceRight === targetRight) {
    return { left: "left", right: "right" } as const;
  }

  if (sourceLeft === targetRight && sourceRight === targetLeft) {
    return { left: "right", right: "left" } as const;
  }

  return null;
}

const WATCHER_PROMOTION_ELIGIBLE_STATUSES = new Set([
  "open",
  "closing",
  "live",
  "awaiting_final_proof",
]);
const WATCHER_PROMOTION_TERMINAL_STATUSES = new Set([
  "settled",
  "voided",
]);

export type WatcherMarketPromotionSnapshot = {
  id: number;
  parentMarketId: number | null;
  slug: string;
  linkedSessionKey: string | null;
  marketType: string;
  status: string;
  resolutionReason: string | null;
  leftLabel: string;
  rightLabel: string;
  propositionHash: string | null;
  createdAt: Date | string;
  firstStakeAcceptedAt: Date | null;
  voidedAt: Date | null;
  refundStatus: string | null;
  settlementRunId: string | null;
  settlementStatus: string | null;
  settlementAttemptedAt: Date | null;
  settlementExecutedAt: Date | null;
  openIntegrityIncidentCount: number;
  wagerCount: number;
  founderBonusCount: number;
  autoExecutionCount: number;
  walletLocks: Array<{
    id: number;
    walletAddress: string;
    side: string;
  }>;
  wagers: Array<{
    id: number;
    userId: number;
    side: string;
  }>;
  stakeIntents: Array<{
    id: number;
    userId: number;
    status: string;
    propositionHash: string | null;
    side: string;
  }>;
  stakeTicketLegs: Array<{
    id: number;
    ticketId: number;
    userId: number;
    propositionHash: string;
    side: string;
  }>;
  pendingClaims: Array<{
    id: number;
    normalizedPlayerName: string;
    claimKind: string;
    claimGroupKey: string;
  }>;
};

export type WatcherMarketPromotionTransfer = {
  sourceId: number;
  targetId: number;
  sideTransfer: {
    left: BetSide;
    right: BetSide;
  };
  duplicateWalletLockIds: number[];
};

export type WatcherMarketIdentityPromotionPlan =
  | { kind: "noop" }
  | { kind: "blocked"; reason: string }
  | {
      kind: "promote";
      winnerTargetId: number;
      desyncTargetId: number | null;
      winnerTransfers: WatcherMarketPromotionTransfer[];
      desyncTransfers: WatcherMarketPromotionTransfer[];
      affectedTicketIds: number[];
    };

function promotionMarketHasFinancialState(
  market: WatcherMarketPromotionSnapshot
) {
  return Boolean(
    market.firstStakeAcceptedAt ||
      market.wagerCount > 0 ||
      market.founderBonusCount > 0 ||
      market.autoExecutionCount > 0 ||
      market.walletLocks.length > 0 ||
      market.wagers.length > 0 ||
      market.stakeIntents.length > 0 ||
      market.stakeTicketLegs.length > 0 ||
      market.pendingClaims.length > 0
  );
}

function promotionMarketHasSettlementState(
  market: WatcherMarketPromotionSnapshot
) {
  return Boolean(
    market.voidedAt ||
      market.refundStatus ||
      market.settlementRunId ||
      market.settlementStatus ||
      market.settlementAttemptedAt ||
      market.settlementExecutedAt
  );
}

function promotionMarketObservedAtMs(
  market: WatcherMarketPromotionSnapshot
) {
  const value = new Date(market.createdAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

function promotionMappedSide(
  side: string,
  transfer: { left: BetSide; right: BetSide }
) {
  return side === "right" ? transfer.right : transfer.left;
}

function promotionFinancialSideIsValid(side: string) {
  return side === "left" || side === "right";
}

function promotionClaimKey(
  claim: WatcherMarketPromotionSnapshot["pendingClaims"][number]
) {
  return [
    claim.normalizedPlayerName.trim().toLowerCase(),
    claim.claimKind.trim().toLowerCase(),
    claim.claimGroupKey.trim().toLowerCase(),
  ].join("|");
}

function planWatcherPromotionFamily(input: {
  markets: WatcherMarketPromotionSnapshot[];
  canonicalSlug: string;
  canonicalPropositionHash: string;
}) {
  const canonicalMarkets = input.markets.filter(
    (market) => market.slug === input.canonicalSlug
  );
  if (canonicalMarkets.length > 1) {
    return { kind: "blocked", reason: "duplicate_canonical_slug" } as const;
  }

  const canonicalMarket = canonicalMarkets[0] ?? null;
  if (
    canonicalMarket &&
    (!WATCHER_PROMOTION_ELIGIBLE_STATUSES.has(canonicalMarket.status) ||
      promotionMarketHasSettlementState(canonicalMarket))
  ) {
    return { kind: "blocked", reason: "canonical_market_is_terminal" } as const;
  }

  for (const market of input.markets) {
    const hasFinancialState = promotionMarketHasFinancialState(market);
    const isTerminal = WATCHER_PROMOTION_TERMINAL_STATUSES.has(market.status);
    if (
      market.status === "under_review" ||
      market.openIntegrityIncidentCount > 0
    ) {
      return { kind: "blocked", reason: "market_integrity_review_exists" } as const;
    }
    const isEmptyPromotionTombstone =
      isTerminal &&
      !hasFinancialState &&
      market.resolutionReason === "merged_into_platform_market";
    if (
      (!isEmptyPromotionTombstone && promotionMarketHasSettlementState(market)) ||
      (isTerminal && hasFinancialState)
    ) {
      return { kind: "blocked", reason: "terminal_financial_state_exists" } as const;
    }
  }

  const activeMarkets = input.markets.filter((market) =>
    WATCHER_PROMOTION_ELIGIBLE_STATUSES.has(market.status)
  );
  if (activeMarkets.length === 0) {
    return { kind: "noop" } as const;
  }

  const recoverableIntentMarketIds = new Set(
    activeMarkets.flatMap((market) =>
      market.stakeIntents.some((intent) =>
        BET_STAKE_INTENT_RECOVERABLE_STATUSES.includes(
          intent.status as (typeof BET_STAKE_INTENT_RECOVERABLE_STATUSES)[number]
        )
      )
        ? [market.id]
        : []
    )
  );
  if (recoverableIntentMarketIds.size > 1) {
    return {
      kind: "blocked",
      reason: "multiple_legacy_memo_market_ids",
    } as const;
  }

  const forcedTargetId = [...recoverableIntentMarketIds][0] ?? null;
  const target = forcedTargetId
    ? activeMarkets.find((market) => market.id === forcedTargetId) ?? null
    : canonicalMarket ??
      [...activeMarkets].sort((left, right) => {
        const financialDiff =
          Number(promotionMarketHasFinancialState(right)) -
          Number(promotionMarketHasFinancialState(left));
        return (
          financialDiff ||
          promotionMarketObservedAtMs(left) -
            promotionMarketObservedAtMs(right) ||
          left.id - right.id
        );
      })[0] ??
      null;
  if (!target) {
    return { kind: "blocked", reason: "promotion_target_missing" } as const;
  }

  const transferByMarketId = new Map<
    number,
    { left: BetSide; right: BetSide }
  >();
  transferByMarketId.set(target.id, { left: "left", right: "right" });
  const targetFirstMarkets = [
    target,
    ...activeMarkets
      .filter((market) => market.id !== target.id)
      .sort((left, right) => left.id - right.id),
  ];
  for (const market of targetFirstMarkets) {
    if (market.id === target.id) continue;
    const sideTransfer = resolveMarketSideTransfer(market, target);
    if (!sideTransfer && promotionMarketHasFinancialState(market)) {
      return { kind: "blocked", reason: "market_sides_do_not_match" } as const;
    }
    transferByMarketId.set(
      market.id,
      sideTransfer ?? { left: "left", right: "right" }
    );
  }

  for (const market of targetFirstMarkets) {
    if (
      [
        ...market.walletLocks,
        ...market.wagers,
        ...market.stakeIntents,
        ...market.stakeTicketLegs,
      ].some((row) => !promotionFinancialSideIsValid(row.side))
    ) {
      return { kind: "blocked", reason: "invalid_financial_side" } as const;
    }
    if (!promotionMarketHasFinancialState(market)) continue;
    if (
      !market.propositionHash ||
      market.propositionHash !== input.canonicalPropositionHash
    ) {
      return { kind: "blocked", reason: "proposition_hash_mismatch" } as const;
    }
    if (
      market.stakeTicketLegs.some(
        (leg) => leg.propositionHash !== input.canonicalPropositionHash
      ) ||
      market.stakeIntents.some(
        (intent) =>
          Boolean(intent.propositionHash) &&
          intent.propositionHash !== input.canonicalPropositionHash
      )
    ) {
      return { kind: "blocked", reason: "frozen_stake_proposition_mismatch" } as const;
    }
  }

  const walletSides = new Map<string, BetSide>();
  const userSides = new Map<string, BetSide>();
  const ticketMarketIds = new Map<number, number>();
  const claimMarketIds = new Map<string, number>();
  const duplicateWalletLockIds: number[] = [];

  for (const market of targetFirstMarkets) {
    const transfer = transferByMarketId.get(market.id) ?? {
      left: "left" as const,
      right: "right" as const,
    };
    for (const wallet of market.walletLocks) {
      const key = wallet.walletAddress.trim().toLowerCase();
      if (!key) continue;
      const side = promotionMappedSide(wallet.side, transfer);
      const existing = walletSides.get(key);
      if (existing && existing !== side) {
        return { kind: "blocked", reason: "wallet_opposite_side_collision" } as const;
      }
      if (existing === side && market.id !== target.id) {
        duplicateWalletLockIds.push(wallet.id);
      }
      walletSides.set(key, side);
    }
    for (const exposure of [
      ...market.wagers.map((wager) => ({
        key: `user:${wager.userId}`,
        side: wager.side,
      })),
      ...market.stakeIntents.map((intent) => ({
        key: `user:${intent.userId}`,
        side: intent.side,
      })),
      ...market.stakeTicketLegs.map((leg) => ({
        key: `user:${leg.userId}`,
        side: leg.side,
      })),
    ]) {
      const side = promotionMappedSide(exposure.side, transfer);
      const existing = userSides.get(exposure.key);
      if (existing && existing !== side) {
        return { kind: "blocked", reason: "user_opposite_side_collision" } as const;
      }
      userSides.set(exposure.key, side);
    }
    for (const leg of market.stakeTicketLegs) {
      const existingMarketId = ticketMarketIds.get(leg.ticketId);
      if (existingMarketId && existingMarketId !== market.id) {
        return { kind: "blocked", reason: "ticket_leg_target_collision" } as const;
      }
      ticketMarketIds.set(leg.ticketId, market.id);
    }
    for (const claim of market.pendingClaims) {
      const key = promotionClaimKey(claim);
      const existingMarketId = claimMarketIds.get(key);
      if (existingMarketId && existingMarketId !== market.id) {
        return { kind: "blocked", reason: "pending_claim_target_collision" } as const;
      }
      claimMarketIds.set(key, market.id);
    }
  }

  const duplicateWalletIds = new Set(duplicateWalletLockIds);
  const transfers = activeMarkets
    .filter((market) => market.id !== target.id)
    .map((market) => ({
      sourceId: market.id,
      targetId: target.id,
      sideTransfer: transferByMarketId.get(market.id) ?? {
        left: "left" as const,
        right: "right" as const,
      },
      duplicateWalletLockIds: market.walletLocks
        .filter((wallet) => duplicateWalletIds.has(wallet.id))
        .map((wallet) => wallet.id),
    }));

  return {
    kind: "promote",
    targetId: target.id,
    transfers,
    affectedTicketIds: [...ticketMarketIds.keys()].sort((left, right) => left - right),
  } as const;
}

export function planWatcherMarketIdentityPromotion(input: {
  canonicalWinnerSlug: string;
  canonicalDesyncSlug: string;
  canonicalPropositionHash: string;
  markets: WatcherMarketPromotionSnapshot[];
}): WatcherMarketIdentityPromotionPlan {
  const winnerMarkets = input.markets.filter(
    (market) => market.marketType === WINNER_MARKET_TYPE
  );
  const desyncMarkets = input.markets.filter(
    (market) => market.marketType === DESYNC_SIDE_MARKET_TYPE
  );
  const winnerMarketIds = new Set(winnerMarkets.map((market) => market.id));
  const childrenByParent = new Map<number, number>();
  for (const market of desyncMarkets) {
    if (!market.parentMarketId) continue;
    if (
      !winnerMarketIds.has(market.parentMarketId) &&
      promotionMarketHasFinancialState(market)
    ) {
      return { kind: "blocked", reason: "orphaned_desync_market" };
    }
    const count = (childrenByParent.get(market.parentMarketId) ?? 0) + 1;
    childrenByParent.set(market.parentMarketId, count);
    if (count > 1) {
      return { kind: "blocked", reason: "multiple_desync_children" };
    }
  }

  const winnerPlan = planWatcherPromotionFamily({
    markets: winnerMarkets,
    canonicalSlug: input.canonicalWinnerSlug,
    canonicalPropositionHash: input.canonicalPropositionHash,
  });
  if (winnerPlan.kind === "blocked" || winnerPlan.kind === "noop") {
    return winnerPlan;
  }
  const desyncPlan = planWatcherPromotionFamily({
    markets: desyncMarkets,
    canonicalSlug: input.canonicalDesyncSlug,
    canonicalPropositionHash: input.canonicalPropositionHash,
  });
  if (desyncPlan.kind === "blocked") {
    return desyncPlan;
  }

  return {
    kind: "promote",
    winnerTargetId: winnerPlan.targetId,
    desyncTargetId:
      desyncPlan.kind === "promote" ? desyncPlan.targetId : null,
    winnerTransfers: winnerPlan.transfers,
    desyncTransfers:
      desyncPlan.kind === "promote" ? desyncPlan.transfers : [],
    affectedTicketIds: [
      ...new Set([
        ...winnerPlan.affectedTicketIds,
        ...(desyncPlan.kind === "promote"
          ? desyncPlan.affectedTicketIds
          : []),
      ]),
    ].sort((left, right) => left - right),
  };
}

function readMarketTruthObject(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function truthyMarketValue(value: unknown) {
  return (
    value === true ||
    value === 1 ||
    value === "1" ||
    value === "true"
  );
}

function projectCompleteMarketWinningTeam(
  players: ReturnType<typeof normalizeReplayPlayers>,
  winningPlayerKeysValue: unknown,
  winningPlayerNamesValue: unknown
) {
  const winningPlayerKeys = new Set(
    (
      Array.isArray(winningPlayerKeysValue)
        ? winningPlayerKeysValue
        : []
    )
      .map((value) => String(value ?? "").trim())
      .filter(Boolean)
  );

  const winningNames = new Set(
    (
      Array.isArray(winningPlayerNamesValue)
        ? winningPlayerNamesValue
        : []
    )
      .map((value) => normalizeReplayPlayerName(value))
      .filter(Boolean)
  );

  if (
    winningPlayerKeys.size === 0 &&
    winningNames.size === 0
  ) {
    return null;
  }

  const isWinner = (
    player: (typeof players)[number]
  ) =>
    (
      winningPlayerKeys.size > 0 &&
      winningPlayerKeys.has(player.stablePlayerKey)
    ) ||
    winningNames.has(player.normalizedName);

  const enriched = players.map((player) => ({
    ...player,
    winner: isWinner(player),
  }));

  const enrichedWinnerCount = enriched.filter(
    (player) => player.winner
  ).length;

  const expectedWinnerCount = Math.max(
    winningPlayerKeys.size,
    winningNames.size
  );

  if (enrichedWinnerCount !== expectedWinnerCount) {
    return null;
  }

  // Never allow projected truth to contradict an explicit true winner flag
  // belonging to the other side.
  if (
    players.some(
      (player) =>
        player.winner === true &&
        !isWinner(player)
    )
  ) {
    return null;
  }

  const resolution = resolveReplayTeams(
    enriched,
    { final: true }
  );

  if (
    resolution.status !== "resolved" ||
    resolution.confidence !== "high" ||
    resolveWinningTeamIndex(
      enriched,
      resolution
    ) === null
  ) {
    return null;
  }

  return enriched;
}

export function trustedStructuredMarketWinningPlayers(
  keyEvents: unknown,
  players: ReturnType<typeof normalizeReplayPlayers>
) {
  const events = readMarketTruthObject(keyEvents);
  const result = readMarketTruthObject(
    events.result_resolution
  );
  const teamResolution = readMarketTruthObject(
    events.team_resolution
  );

  const provenance = String(
    result.result_provenance ?? ""
  )
    .trim()
    .toLowerCase();

  const allowlistedProvenance = new Set([
    "complete_losing_team_resignation",
    "postgame_winner_flags",
    "scoreboard_winner_flags",
    "postgame_single_team_winner_flags",
    "scoreboard_single_team_winner_flags",
  ]);

  if (
    !truthyMarketValue(result.result_trusted) ||
    String(result.result_status ?? "").toLowerCase() !==
      "resolved" ||
    !allowlistedProvenance.has(provenance) ||
    String(teamResolution.status ?? "").toLowerCase() !==
      "resolved" ||
    String(teamResolution.confidence ?? "").toLowerCase() !==
      "high"
  ) {
    return null;
  }

  // A trusted structured result is converted into a complete
  // winner/loser projection only inside the frozen-market
  // validation path.
  return projectCompleteMarketWinningTeam(
    players,
    result.winning_player_keys,
    result.winning_player_names
  );
}

export function applyBettingAuthorizedReplayAdjudication<T extends object>(
  game: T
): T {
  const adjudications = (
    game as T & {
      replayResultAdjudications?: unknown;
    }
  ).replayResultAdjudications;
  const effectiveAdjudication =
    Array.isArray(adjudications)
      ? (
          adjudications[0] ??
          null
        ) as Parameters<
          typeof replayResultAdjudicationAuthorizesBets
        >[0]
      : null;

  return replayResultAdjudicationAuthorizesBets(
    effectiveAdjudication
  )
    ? applyReplayAdjudicationToGameStats(
        game
      )
    : game;
}

export function buildFinalMarketTruth(game: {
  winner: string | null;
  players: unknown;
  parse_reason?: string | null;
  key_events?: unknown;
  winnerProof?: unknown;
}) {
  const players = normalizeReplayPlayers(
    game.players
  );

  const events = readMarketTruthObject(
    game.key_events
  );
  const adjudication = readMarketTruthObject(
    events.replay_result_adjudication
  );
  const adjudicationIdempotencyKey = String(
    adjudication.idempotency_key ?? ""
  ).trim();
  const adjudicationAuthorizesBets =
    adjudicationIdempotencyKey.startsWith("evidence:auto:") ||
    (
      truthyMarketValue(adjudication.affects_bets) &&
      adjudicationIdempotencyKey.startsWith("financial-authority:")
    );

  /*
   * An immutable accepted adjudication overlay intentionally preserves the
   * parser's original result_resolution for audit. That older contract must
   * not override the complete winner projection authorized by the newer
   * adjudication ledger.
   */
  if (
    String(game.winnerProof ?? "").trim().toLowerCase() ===
      "replay_result_adjudication" &&
    [
      "manual_result_adjudication",
      "automatic_result_evidence",
    ].includes(
      String(game.parse_reason ?? "").trim().toLowerCase()
    ) &&
    String(adjudication.decision_status ?? "").trim().toLowerCase() ===
      "accepted" &&
    adjudicationAuthorizesBets
  ) {
    const adjudicatedPlayers =
      projectCompleteMarketWinningTeam(
        players,
        adjudication.winning_player_keys,
        adjudication.winning_player_names
      );

    if (adjudicatedPlayers) {
      return {
        players: adjudicatedPlayers,
        winner: null,
        bettingEligible: true,
      };
    }
  }

  const structuredPlayers =
    trustedStructuredMarketWinningPlayers(
      game.key_events,
      players
    );

  if (structuredPlayers) {
    return {
      players: structuredPlayers,
      // Do not compare a team label like "A / B" against one
      // individual member of the winning roster.
      winner: null,
      bettingEligible: true,
    };
  }

  const structuredResult = readMarketTruthObject(
    events.result_resolution
  );
  const hasStructuredResultContract =
    Object.keys(structuredResult).length > 0 &&
    [
      "result_status",
      "result_trusted",
      "winning_team_id",
      "winning_player_keys",
      "winning_player_names",
    ].some((field) => field in structuredResult);

  // Once the parser emitted a structured result contract it outranks the
  // legacy scalar winner field. If that contract failed the complete frozen
  // market projection above, fail closed instead of resurrecting a partial or
  // contradictory winner through the legacy 1v1 fallback.
  if (hasStructuredResultContract) {
    return {
      players,
      winner: null,
      bettingEligible: false,
    };
  }

  const winnerTruth = resolveReplayWinnerTruth({
    winner: game.winner,
    players,
    parseReason: game.parse_reason,
    keyEvents: game.key_events,
  });

  return {
    players,
    winner: winnerTruth.winner,
    bettingEligible: winnerTruth.bettingEligible,
  };
}


export function evaluateFinalMarketIntegrity(
  market: {
    leftLabel: string;
    rightLabel: string;
    propositionHash: string | null;
    leftRosterSnapshot: unknown;
    rightRosterSnapshot: unknown;
  },
  game: {
    winner: string | null;
    players: unknown;
    parse_reason?: string | null;
    key_events?: unknown;
    winnerProof?: unknown;
  }
) {
  const finalTruth = buildFinalMarketTruth(game);

  return validateMarketFinalIntegrity({
    propositionHash: market.propositionHash,
    leftRosterSnapshot: market.leftRosterSnapshot,
    rightRosterSnapshot: market.rightRosterSnapshot,
    finalPlayers: finalTruth.players,
    finalWinner: finalTruth.winner,
    finalBettingEligible: finalTruth.bettingEligible,
  });
}

export type WatcherFinalFailureDisposition =
  | "awaiting_final_proof"
  | "integrity_review";

const INCONCLUSIVE_WATCHER_FINAL_REASON_CODES = new Set([
  "final_replay_not_betting_eligible",
  "final_winning_team_not_coherent",
  /*
   * Historical integrity_reason values were clamped to 120 characters with a
   * Unicode ellipsis. The second code in the known evidence-only pair was
   * therefore persisted as exactly `final_winning_team_…`; the token scanner
   * sees `final_winning_team_`. Keep this exact compatibility token narrow so
   * no other truncated structural mismatch can recover automatically.
   */
  "final_winning_team_",
]);

/**
 * Separate missing result proof from a contradictory frozen proposition.
 *
 * A final replay that merely lacks one coherent trusted winner belongs on the
 * bounded proof-grace/refund rail. Any additional failure is structural
 * evidence (roster, team, proposition, or winner conflict) and remains an
 * operator-visible integrity incident.
 */
export function classifyWatcherFinalFailure(
  reasonCodes: string[]
): WatcherFinalFailureDisposition {
  const normalized = [
    ...new Set(
      reasonCodes
        .flatMap((reason) =>
          String(reason ?? "")
            .toLowerCase()
            .match(/\b(?:market|final|stored|winner)_[a-z0-9_]+\b/g) ?? []
        )
        .filter((reason) => reason !== "market_integrity_blocked")
    ),
  ];

  return (
    normalized.length > 0 &&
    normalized.every((reason) =>
      INCONCLUSIVE_WATCHER_FINAL_REASON_CODES.has(reason)
    )
  )
    ? "awaiting_final_proof"
    : "integrity_review";
}

/**
 * Only the automated, evidence-only review state may recover without an
 * operator. A roster/proposition mismatch or another commissioner state
 * remains sticky even if a later parse happens to look settlement-ready.
 */
export function canAutoRecoverWatcherIntegrityReview(input: {
  status: string;
  integrityReason: string | null;
  commissionerReviewState: string | null;
}) {
  if (input.status !== "under_review") {
    return true;
  }

  if (
    input.commissionerReviewState &&
    input.commissionerReviewState !== "settlement_blocked"
  ) {
    return false;
  }

  /*
   * Older settlement passes cross-checked the legacy scalar winner even when
   * it contained a placeholder such as "Unknown". A trusted structured
   * result may still have proved the complete winning team. Let only that
   * exact placeholder mismatch return to the frozen-market validator; real
   * player/team contradictions remain sticky operator work.
   */
  if (
    isRecoverableUnknownScalarWinnerReview(
      input.integrityReason
    )
  ) {
    return true;
  }

  return (
    classifyWatcherFinalFailure(
      String(input.integrityReason ?? "")
        .split(",")
    ) === "awaiting_final_proof"
  );
}

type WatcherFinalProofClock = {
  proofDeadlineAt: Date | null;
  underReviewAt: Date | null;
  proofObservedAt?: Date | null;
  closeAt?: Date | null;
  createdAt?: Date | null;
};

export function watcherFinalProofGraceStartedAt(
  input: WatcherFinalProofClock,
  nowMs = Date.now()
) {
  return (
    input.underReviewAt ??
    input.proofObservedAt ??
    input.closeAt ??
    input.createdAt ??
    new Date(nowMs)
  );
}

export function watcherFinalProofDeadline(
  input: WatcherFinalProofClock,
  nowMs = Date.now()
) {
  if (input.proofDeadlineAt) {
    return input.proofDeadlineAt;
  }

  const graceStartedAtMs =
    watcherFinalProofGraceStartedAt(
      input,
      nowMs
    ).getTime();

  return new Date(
    graceStartedAtMs +
      WATCHER_FINAL_PROOF_GRACE_MINUTES * 60 * 1000
  );
}

type WatcherFinalProofTransitionClock =
  WatcherFinalProofClock & {
    status: string;
  };

/**
 * Start a new proof grace from the observation that caused a market to enter
 * the proof rail. A live/open market's creation time is game age, not proof
 * age, so it must never shorten its first proof window. Reconciliation may
 * revisit an already-closing/awaiting market; in that case retain its explicit
 * persisted proof clock and only use the new observation when no such clock
 * exists.
 */
export function watcherFinalProofDeadlineForTransition(
  input: WatcherFinalProofTransitionClock,
  proofObservedAt = new Date()
) {
  const preservesExistingProofClock =
    input.status === "closing" ||
    input.status === "awaiting_final_proof";

  if (!preservesExistingProofClock) {
    return watcherFinalProofDeadline(
      {
        proofDeadlineAt: null,
        underReviewAt: null,
        proofObservedAt,
        closeAt: null,
        createdAt: null,
      },
      proofObservedAt.getTime()
    );
  }

  const hasPersistedProofClock = Boolean(
    input.proofDeadlineAt ||
      input.underReviewAt ||
      input.closeAt
  );

  return watcherFinalProofDeadline(
    {
      proofDeadlineAt: input.proofDeadlineAt,
      underReviewAt: input.underReviewAt,
      proofObservedAt:
        hasPersistedProofClock
          ? null
          : proofObservedAt,
      closeAt: input.closeAt,
      // createdAt is intentionally excluded from live reconciliation. It is
      // only a deterministic fallback for repairing already-historical rows.
      createdAt: null,
    },
    proofObservedAt.getTime()
  );
}

/**
 * Repair a missing persisted proof clock without retroactively consuming grace.
 *
 * Normal realtime transitions persist their deadline atomically from the proof
 * observation that caused the transition. Reaching this helper therefore means
 * the row predates that invariant or suffered an anomalous missing-clock write.
 * Give that row one bounded repair grace from this repair observation, persist
 * it once, and never restart it on later reconciliation.
 */
export function watcherMissingProofDeadlineRepairDeadline(
  repairObservedAt = new Date()
) {
  return watcherFinalProofDeadlineForTransition(
    {
      status: "awaiting_final_proof",
      proofDeadlineAt: null,
      underReviewAt: null,
      closeAt: null,
      createdAt: null,
    },
    repairObservedAt
  );
}

function buildSessionMarketSeed(
  session: LiveGameSession,
  index: number,
  featured: boolean
): MarketSeed | null {
  const sides = describeSessionSides(session);

  // A watcher row is not a bettable market until the parser can name both sides.
  if (!sides) return null;
  const resolution = session.teamResolution;
  if (
    resolution.status !== "resolved" ||
    resolution.confidence !== "high" ||
    resolution.teams.length !== 2 ||
    !resolution.propositionHash ||
    !resolution.rosterHash
  ) {
    return null;
  }

  const leftLabel = sides.leftLabel;
  const rightLabel = sides.rightLabel;
  const rightNames = sides.rightNames;
  const title = sides.title;
  const settledAtRaw = session.completedAt || session.updatedAt || session.createdAt;

  /*
   * "completed" is also used by the legacy completed-live compatibility
   * surface. A watcher_live row may therefore look completed before the
   * canonical is_final replay row exists.
   *
   * That distinction is harmless for presentation but critical for money.
   * Only a completed session sourced beyond watcher_live may seed a settled
   * winner market. The payout rail independently requires a linked is_final
   * GameStats row before any winner money can move.
   */
  const hasCanonicalFinalReplay =
    (session.state === "completed" || session.finalProofPending) &&
    session.parseSource !== "watcher_live";
  const settlementReadyFinalReplay =
    watcherSessionCanSeedSettledWinnerMarket(session);

  const resolvedWinnerSide =
    settlementReadyFinalReplay
      ? inferWinnerSideFromSession(session)
      : null;

  /*
   * Completed presentation/statistics truth is not financial authority.
   * A public/archive projection can legitimately know who won while the
   * betting rail remains locked (for example an accepted adjudication with
   * affects_bets=false). Such a row must never manufacture a fresh settled
   * market. Existing live books are handled by detached final reconciliation.
   */
  if (
    session.state === "completed" &&
    !session.finalProofPending &&
    (!settlementReadyFinalReplay || !resolvedWinnerSide)
  ) {
    return null;
  }

  const watcherMarketStatus: BetStatus =
    session.finalProofPending
      ? "awaiting_final_proof"
      : session.state !== "completed"
        ? "live"
        : hasCanonicalFinalReplay
          ? "settled"
          : "awaiting_final_proof";
  const proofObservedAt = new Date(settledAtRaw);
  const normalizedProofObservedAt = Number.isNaN(
    proofObservedAt.getTime()
  )
    ? new Date(session.createdAt)
    : proofObservedAt;
  const awaitingFinalProof =
    watcherMarketStatus === "awaiting_final_proof";

  const seed = {
    scheduledMatchId: null,
    linkedSessionKey: session.sessionKey || session.originalFilename || null,
    identityAliases: [...new Set(session.identityAliases ?? [])]
      .map((alias) => normalizeName(alias))
      .filter(
        (alias) =>
          Boolean(alias) && alias !== normalizeName(session.sessionKey)
      )
      .sort((left, right) => left.localeCompare(right)),
    linkedGameStatsId: hasCanonicalFinalReplay ? session.id : null,
    slug: buildSessionMarketSlug(session, leftLabel, rightLabel),
    title,
    eventLabel: buildSessionEventLabel(session),
    marketType: WINNER_MARKET_TYPE,
    status: watcherMarketStatus,
    featured,
    sortOrder: index,
    source: "session",
    leftLabel,
    rightLabel,
    leftHref:
      sides.leftNames.length === 1
        ? `/players/by-name/${encodeURIComponent(sides.leftNames[0])}`
        : null,
    rightHref:
      rightNames.length === 1
        ? `/players/by-name/${encodeURIComponent(rightNames[0])}`
        : null,
    seedLeftWolo: 0,
    seedRightWolo: 0,
    closeAt:
      awaitingFinalProof
        ? normalizedProofObservedAt
        : null,
    proofDeadlineAt:
      awaitingFinalProof
        ? watcherFinalProofDeadline({
            proofDeadlineAt: null,
            underReviewAt: null,
            proofObservedAt:
              normalizedProofObservedAt,
          })
        : null,
    resolutionReason:
      awaitingFinalProof
        ? hasCanonicalFinalReplay
          ? "final_result_not_betting_eligible"
          : "final_replay_pending"
        : null,
    settledAt: settlementReadyFinalReplay ? new Date(settledAtRaw) : null,
    winnerSide: settlementReadyFinalReplay ? resolvedWinnerSide : null,
    teamFormat: resolution.format,
    teamResolutionStatus: resolution.status,
    teamResolutionProvenance: resolution.provenance,
    teamConfidence: resolution.confidence,
    leftRosterSnapshot: rosterSnapshot(resolution.teams[0]),
    rightRosterSnapshot: rosterSnapshot(resolution.teams[1]),
    sourceParseIteration: session.parseIteration,
    sourceRosterHash: resolution.rosterHash,
    propositionHash: resolution.propositionHash,
    integrityStatus: "verified",
    integrityReason: null,
  } satisfies MarketSeed;

  return isConfidentBetMarket(seed) ? seed : null;
}

function scheduledMatchIntegritySeed(match: ScheduledMatchTile) {
  const resolution = resolveReplayTeams([
    { name: match.challenger.name },
    { name: match.challenged.name },
  ], { provenance: "scheduled_match_roster" });
  return {
    teamFormat: resolution.format,
    teamResolutionStatus: resolution.status,
    teamResolutionProvenance: resolution.provenance,
    teamConfidence: resolution.confidence,
    leftRosterSnapshot: resolution.teams[0] ? rosterSnapshot(resolution.teams[0]) : [],
    rightRosterSnapshot: resolution.teams[1] ? rosterSnapshot(resolution.teams[1]) : [],
    sourceParseIteration: null,
    sourceRosterHash: resolution.rosterHash,
    propositionHash: resolution.propositionHash,
    integrityStatus: resolution.status === "resolved" ? "verified" : "blocked",
    integrityReason: resolution.reasonCodes.join(",") || null,
  } satisfies Pick<
    MarketSeed,
    | "teamFormat"
    | "teamResolutionStatus"
    | "teamResolutionProvenance"
    | "teamConfidence"
    | "leftRosterSnapshot"
    | "rightRosterSnapshot"
    | "sourceParseIteration"
    | "sourceRosterHash"
    | "propositionHash"
    | "integrityStatus"
    | "integrityReason"
  >;
}

function marketStatusFromScheduledMatch(displayState: ScheduledMatchTile["displayState"]): BetStatus {
  if (displayState === "live") return "live";
  if (
    [
      "accepted",
      "terms_accepted",
      "creator_funded",
      "opponent_funded",
      "funded",
      "checkin_open",
      "left_checked_in",
      "right_checked_in",
      "ready",
    ].includes(displayState)
  ) {
    return "closing";
  }
  return "settled";
}

function inferWinnerSideFromChallenge(match: ScheduledMatchTile): BetSide | null {
  const winnerKey = normalizeName(match.linkedWinner).toLowerCase();
  if (!winnerKey) return null;

  const challengerNames = uniqueNames([
    match.challenger.name,
    match.challenger.inGameName,
    match.challenger.steamPersonaName,
    match.challenger.uid,
  ]).map((value) => value.toLowerCase());
  const challengedNames = uniqueNames([
    match.challenged.name,
    match.challenged.inGameName,
    match.challenged.steamPersonaName,
    match.challenged.uid,
  ]).map((value) => value.toLowerCase());

  if (challengerNames.includes(winnerKey)) return "left";
  if (challengedNames.includes(winnerKey)) return "right";
  return null;
}

function buildChallengeMarketSeeds(scheduledMatches: ScheduledMatchTile[]) {
  const challengeMatches = scheduledMatches.filter((match) =>
    [
      "proposed",
      "pending",
      "accepted",
      "terms_accepted",
      "creator_funded",
      "opponent_funded",
      "funded",
      "checkin_open",
      "left_checked_in",
      "right_checked_in",
      "ready",
      "live",
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
    ].includes(
      match.displayState
    )
  );
  const featuredChallengeIndex = challengeMatches.findIndex((match) =>
    [
      "accepted",
      "terms_accepted",
      "creator_funded",
      "opponent_funded",
      "funded",
      "checkin_open",
      "left_checked_in",
      "right_checked_in",
      "ready",
      "live",
    ].includes(match.displayState)
  );

  return challengeMatches
    .map((match, index) => ({
      scheduledMatchId: match.id,
      linkedSessionKey: match.linkedSessionKey,
      slug: `${CHALLENGE_MARKET_SLUG_PREFIX}${match.id}`,
      title: `${match.challenger.name} vs ${match.challenged.name}`,
      eventLabel: match.linkedMapName ? `Scheduled Match • ${match.linkedMapName}` : "Scheduled Match",
      marketType: WINNER_MARKET_TYPE,
      status: marketStatusFromScheduledMatch(match.displayState),
      featured:
        featuredChallengeIndex >= 0
          ? index === featuredChallengeIndex
          : false,
      sortOrder: -100 + index,
      source: "challenge" as const,
      leftLabel: match.challenger.name,
      rightLabel: match.challenged.name,
      leftHref: match.challenger.href,
      rightHref: match.challenged.href,
      seedLeftWolo: 0,
      seedRightWolo: 0,
      closeAt: new Date(match.scheduledAt),
      settledAt:
        match.displayState === "completed" ||
        match.displayState === "forfeited" ||
        match.displayState === "declined" ||
        match.displayState === "cancelled" ||
        match.displayState === "canceled" ||
        match.displayState === "expired" ||
        match.displayState === "funding_expired" ||
        match.displayState === "no_show_left" ||
        match.displayState === "no_show_right" ||
        match.displayState === "double_no_show" ||
        match.displayState === "refunded"
          ? new Date(match.activityAt)
          : null,
      winnerSide: match.displayState === "completed" ? inferWinnerSideFromChallenge(match) : null,
      ...scheduledMatchIntegritySeed(match),
    }) satisfies MarketSeed)
    .filter(isConfidentBetMarket);
}


function claimPlayerNameForUser(user: {
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
}) {
  return normalizeName(user.inGameName) || normalizeName(user.steamPersonaName) || user.uid;
}

function canAutoClaimForKnownUser(user: {
  verified?: boolean | null;
  verificationLevel?: number | null;
  steamId?: string | null;
  inGameName: string | null;
  steamPersonaName: string | null;
  walletAddress?: string | null;
}) {
  const hasTrustedIdentity = Boolean(
    user.verified || (typeof user.verificationLevel === "number" && user.verificationLevel > 0) || user.steamId
  );
  return Boolean(
    hasTrustedIdentity &&
      user.walletAddress &&
      (normalizeName(user.inGameName) || normalizeName(user.steamPersonaName))
  );
}

async function findAutoClaimUserForPlayerName(
  prisma: PrismaClient,
  playerName: string
) {
  const normalized = normalizeName(playerName).toLowerCase();
  if (!normalized) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: {
      AND: [
        { OR: [{ verified: true }, { verificationLevel: { gt: 0 } }, { steamId: { not: null } }] },
        { OR: [{ inGameName: { not: null } }, { steamPersonaName: { not: null } }] },
      ],
    },
    select: {
      id: true,
      inGameName: true,
      steamPersonaName: true,
      verified: true,
      verificationLevel: true,
      steamId: true,
      walletAddress: true,
    },
    take: 250,
  });

  return (
    users.find((user) => {
      const names = [user.inGameName, user.steamPersonaName]
        .map((value) => normalizeName(value).toLowerCase())
        .filter(Boolean);
      return Boolean(user.walletAddress) && names.includes(normalized);
    }) || null
  );
}

function buildPendingClaimNote(
  market: { title: string; eventLabel: string },
  outcome: "won" | "void",
  payoutWolo: number
) {
  const reason = outcome === "void" ? "Void refund" : "Settled payout";
  return `${reason} · ${market.title} · ${market.eventLabel} · ${payoutWolo} WOLO`;
}
function buildWinnerBountyNote(
  market: { title: string; eventLabel: string },
  winnerName: string,
  losingName: string,
  payoutWolo: number
) {
  return `Winner bounty · ${market.title} · ${winnerName} beat ${losingName} · ${payoutWolo} WOLO`;
}

function buildAwaitingWalletLinkClaimDetail(playerName: string) {
  const resolvedName = normalizeName(playerName) || "this player";
  return `Awaiting verified wallet-linked account for ${resolvedName}. This payout stays pending until the player links a verified wallet.`;
}

function getWinningPlayerName(market: { leftLabel: string; rightLabel: string }, winningSide: BetSide) {
  return winningSide === "left" ? market.leftLabel : market.rightLabel;
}

function getLosingPlayerName(market: { leftLabel: string; rightLabel: string }, winningSide: BetSide) {
  return winningSide === "left" ? market.rightLabel : market.leftLabel;
}


type SettlementWinnerTruthMarket = {
  id: number;
  leftLabel: string;
  rightLabel: string;
  linkedGameStatsId: number | null;
  scheduledMatchId: number | null;
  propositionHash: string | null;
  leftRosterSnapshot: unknown;
  rightRosterSnapshot: unknown;
};

async function assertLockedOrdinaryMarketWinnerPayoutAllowed(
  prisma: PrismaClient,
  market: SettlementWinnerTruthMarket & { winnerSide: string | null }
) {
  if (market.winnerSide !== "left" && market.winnerSide !== "right") return;

  await prisma.$transaction(async (tx) => {
    if (market.scheduledMatchId) {
      await acquireChallengeDesyncAdvisoryLock(tx, market.scheduledMatchId);
    }
    const preliminaryIncidents = await loadDesyncIncidentsForSettlement(tx, {
      gameStatsId: market.linkedGameStatsId,
      scheduledMatchId: market.scheduledMatchId,
    });
    const replayLockIds = Array.from(
      new Set(
        [market.linkedGameStatsId, ...preliminaryIncidents.map((incident) => incident.gameStatsId)]
          .filter((id): id is number => typeof id === "number" && id > 0)
      )
    ).sort((left, right) => left - right);
    for (const replayLockId of replayLockIds) {
      await tx.$queryRaw<Array<{ lock_acquired: number }>>`
        SELECT 1::int AS lock_acquired
        FROM pg_advisory_xact_lock(${replayLockId})
      `;
    }

    await assertOrdinaryBetMarketWinnerPayoutAllowedFromDb({
      prisma: tx,
      market,
    });
  });
}

function settlementTruthName(value: string | null | undefined) {
  return normalizeName(value).toLowerCase();
}

export function isConcreteSettlementWinnerScalar(
  value: string | null | undefined
) {
  return !isUnknownishReplayValue(value);
}

export function isRecoverableUnknownScalarWinnerReview(
  value: string | null | undefined
) {
  const match = String(value ?? "").match(
    /^WINNER_TRUTH_MISMATCH: market \d+ game_stats \d+ winner "([^"]+)" does not match market sides$/i
  );

  return Boolean(
    match &&
      !isConcreteSettlementWinnerScalar(
        match[1]
      )
  );
}

function settlementTruthSide(
  market: Pick<SettlementWinnerTruthMarket, "leftLabel" | "rightLabel">,
  value: string | null | undefined
): BetSide | null {
  if (!isConcreteSettlementWinnerScalar(value)) {
    return null;
  }
  const key = settlementTruthName(value);
  if (!key) return null;
  if (key === settlementTruthName(market.leftLabel)) return "left";
  if (key === settlementTruthName(market.rightLabel)) return "right";
  return null;
}

function settlementTruthWinnerFlag(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const raw = record.winner ?? record.isWinner ?? record.won;
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

function settlementTruthPlayerName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const raw =
    typeof record.name === "string"
      ? record.name
      : typeof record.player === "string"
        ? record.player
        : typeof record.player_name === "string"
          ? record.player_name
          : typeof record.displayName === "string"
            ? record.displayName
            : "";
  return normalizeName(raw);
}

async function assertSettlementWinnerTruthGate(
  prisma: Pick<
    PrismaClient,
    "gameStats" |
      "replayResultAdjudication"
  >,
  market: SettlementWinnerTruthMarket,
  winningSide: BetSide | null
) {
  if (!winningSide) return;

  /*
   * A scheduled match has its own durable winner/desync settlement
   * contract in assertLockedOrdinaryMarketWinnerPayoutAllowed().
   *
   * A watcher market does not. For watcher-backed winner markets,
   * absence of a linked final replay is a blocker, never permission
   * to settle from provisional live winner flags.
   */
  if (!market.linkedGameStatsId) {
    if (market.scheduledMatchId) {
      return;
    }

    throw new Error(
      `FINAL_REPLAY_REQUIRED: market ${market.id} winner payout blocked until a final replay row is linked`
    );
  }

  const rawGame =
    await prisma.gameStats.findUnique({
      where: {
        id:
          market.linkedGameStatsId,
      },
      select: {
        id:
          true,
        is_final:
          true,
        replayHash:
          true,
        winner:
          true,
        players:
          true,
        parse_reason:
          true,
        key_events:
          true,
        replayResultAdjudications:
          EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      },
    });

  if (!rawGame) {
    throw new Error(
      "WINNER_TRUTH_MISMATCH: market " +
        market.id +
        " linked game_stats " +
        market.linkedGameStatsId +
        " is missing"
    );
  }

  if (!rawGame.is_final) {
    throw new Error(
      `FINAL_REPLAY_REQUIRED: market ${market.id} linked game_stats ${rawGame.id} is not final`
    );
  }

  const game =
    applyBettingAuthorizedReplayAdjudication(
      rawGame
    );

  const finalTruth =
    buildFinalMarketTruth(
      game
    );

  const integrity = validateMarketFinalIntegrity({
    propositionHash: market.propositionHash,
    leftRosterSnapshot: market.leftRosterSnapshot,
    rightRosterSnapshot: market.rightRosterSnapshot,
    finalPlayers: finalTruth.players,
    finalWinner: finalTruth.winner,
    finalBettingEligible: finalTruth.bettingEligible,
  });
  if (!integrity.ok || integrity.winningSide !== winningSide) {
    throw new Error(
      `MARKET_INTEGRITY_BLOCKED: market ${market.id} final proposition failed: ${integrity.reasonCodes.join(",") || "winning_side_mismatch"}`
    );
  }
  const snapshotPlayerCount =
    (Array.isArray(market.leftRosterSnapshot) ? market.leftRosterSnapshot.length : 0) +
    (Array.isArray(market.rightRosterSnapshot) ? market.rightRosterSnapshot.length : 0);
  if (snapshotPlayerCount > 2) return;

  const rowSide = settlementTruthSide(market, game.winner);
  if (
    isConcreteSettlementWinnerScalar(
      game.winner
    ) &&
    !rowSide
  ) {
    throw new Error(
      'WINNER_TRUTH_MISMATCH: market ' +
        market.id +
        ' game_stats ' +
        game.id +
        ' winner "' +
        game.winner +
        '" does not match market sides'
    );
  }

  if (rowSide && rowSide !== winningSide) {
    throw new Error(
      'WINNER_TRUTH_MISMATCH: market ' +
        market.id +
        ' winner_side=' +
        winningSide +
        ', game_stats ' +
        game.id +
        ' winner="' +
        game.winner +
        '" maps to ' +
        rowSide
    );
  }

  const flaggedSides = new Set<BetSide>();
  const flaggedNames: string[] = [];
  const rawPlayers = Array.isArray(game.players) ? game.players : [];

  for (const player of rawPlayers) {
    if (!settlementTruthWinnerFlag(player)) continue;
    const name = settlementTruthPlayerName(player);
    if (!name) continue;
    flaggedNames.push(name);
    const side = settlementTruthSide(market, name);
    if (side) flaggedSides.add(side);
  }

  if (flaggedSides.size > 1) {
    throw new Error(
      "WINNER_TRUTH_MISMATCH: market " +
        market.id +
        " game_stats " +
        game.id +
        " players JSON has conflicting winner flags (" +
        flaggedNames.join(", ") +
        ")"
    );
  }

  const flaggedSide = Array.from(flaggedSides)[0] ?? null;
  if (flaggedSide && rowSide && flaggedSide !== rowSide) {
    throw new Error(
      "WINNER_TRUTH_MISMATCH: market " +
        market.id +
        " game_stats " +
        game.id +
        " row winner maps to " +
        rowSide +
        ", players JSON winner flag maps to " +
        flaggedSide +
        " (" +
        flaggedNames.join(", ") +
        ")"
    );
  }

  if (flaggedSide && !rowSide && flaggedSide !== winningSide) {
    throw new Error(
      "WINNER_TRUTH_MISMATCH: market " +
        market.id +
        " winner_side=" +
        winningSide +
        ", players JSON winner flag maps to " +
        flaggedSide +
        " (" +
        flaggedNames.join(", ") +
        ")"
    );
  }
}

function buildOnchainSettlementNote(
  market: { title: string; eventLabel: string },
  payoutWolo: number,
  txHash: string,
  settlementRunId?: string | null
) {
  const runLabel = settlementRunId ? ` · run ${settlementRunId}` : "";
  return `Auto-settled on-chain · ${market.title} · ${market.eventLabel} · ${payoutWolo} WOLO · tx ${txHash}${runLabel}`;
}

function displayMarketActorName(user: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
} | null | undefined) {
  return normalizeName(user?.inGameName) || normalizeName(user?.steamPersonaName) || user?.uid || "Unknown";
}

function buildFounderChipSurface(
  bonuses: Array<{
    id: number;
    bonusType: string;
    totalAmountWolo: number;
    note: string | null;
    status: string;
    createdAt: Date;
  }>
): BetFounderChip[] {
  return bonuses.map((bonus) => ({
    id: bonus.id,
    bonusType: bonus.bonusType === "winner" ? "winner" : "participants",
    totalAmountWolo: bonus.totalAmountWolo,
    note: bonus.note ?? null,
    status: bonus.status,
    createdAt: bonus.createdAt.toISOString(),
  }));
}

function isAwaitingVerifiedWalletLinkDetail(value: string | null | undefined) {
  return /awaiting verified wallet-linked account|target unresolved|no verified wallet-linked user matches/i.test(
    value || ""
  );
}

function claimKindTapeLabel(
  claimKind: string,
  status: string,
  errorState: string | null | undefined
) {
  if (isAwaitingVerifiedWalletLinkDetail(errorState)) return "Awaiting Wallet Link";
  if (errorState) return "Retryable Failure";
  if (status === "rescinded") return "Rescinded";
  if (claimKind === "bet_refund") return "Refund";
  if (claimKind === "founders_bonus") return "Founders Bonus Payout";
  if (claimKind === "founders_win") return "Founders Win Payout";
  if (claimKind === "winner_bounty") return "Winner Bounty";
  return "Payout";
}

function claimKindTargetScope(claimKind: string) {
  if (claimKind === "founders_bonus") return "both_participants";
  if (claimKind === "founders_win") return "winner_only";
  return null;
}

function marketSnapshotRosterNames(snapshot: unknown) {
  if (!Array.isArray(snapshot)) {
    return [];
  }

  const seen = new Set<string>();
  const names: string[] = [];

  for (const entry of snapshot) {
    let rawName = "";

    if (typeof entry === "string") {
      rawName = entry;
    } else if (entry && typeof entry === "object" && "name" in entry) {
      const value = (entry as { name?: unknown }).name;
      rawName = typeof value === "string" ? value : "";
    }

    const clean = normalizeName(rawName);
    const key = clean.toLowerCase();

    if (!clean || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(clean);
  }

  return names;
}

function splitMarketRosterLabel(label: string | null | undefined) {
  return normalizeName(label)
    .split(/\s*\/\s*|\s+\+\s+/)
    .map((value) => normalizeName(value))
    .filter(Boolean)
    .filter((value) => !/^\d+\s+more$/i.test(value));
}

function marketFounderParticipantCount(market: {
  leftLabel: string;
  rightLabel: string;
  leftRosterSnapshot?: unknown;
  rightRosterSnapshot?: unknown;
}) {
  const leftSnapshot =
    marketSnapshotRosterNames(market.leftRosterSnapshot);

  const rightSnapshot =
    marketSnapshotRosterNames(market.rightRosterSnapshot);

  const left =
    leftSnapshot.length > 0
      ? leftSnapshot
      : splitMarketRosterLabel(market.leftLabel);

  const right =
    rightSnapshot.length > 0
      ? rightSnapshot
      : splitMarketRosterLabel(market.rightLabel);

  return Math.max(
    2,
    left.length + right.length
  );
}

function buildMarketWarTapeRows(
  market: {
    leftLabel: string;
    rightLabel: string;
    leftRosterSnapshot?: unknown;
    rightRosterSnapshot?: unknown;
    wagers: Array<{
      id: number;
      side: string;
      amountWolo: number;
      stakeTxHash: string | null;
      stakeLeg?: {
        ticket?: {
          id?: number;
          status: string;
          stakeTxHash: string | null;
        } | null;
      } | null;
      createdAt: Date;
      user: {
        uid: string;
        inGameName: string | null;
        steamPersonaName: string | null;
      };
    }>;
    founderBonuses: Array<{
      id: number;
      bonusType: string;
      totalAmountWolo: number;
      note: string | null;
      createdAt: Date;
      createdBy: {
        uid: string;
        inGameName: string | null;
        steamPersonaName: string | null;
      } | null;
    }>;
  },
  claims: Array<{
    id: number;
    displayPlayerName: string;
    amountWolo: number;
    claimKind: string;
    status: string;
    note: string | null;
    payoutTxHash: string | null;
    payoutProofUrl: string | null;
    errorState: string | null;
    createdAt: Date;
    claimedAt: Date | null;
    rescindedAt: Date | null;
  }>
): BetWarTapeRow[] {
  const participantNames = new Map<string, BetSide>([
    [normalizeName(market.leftLabel).toLowerCase(), "left"],
    [normalizeName(market.rightLabel).toLowerCase(), "right"],
  ]);

  const spectatorOrdinalByWagerId = new Map<number, number>();
  let spectatorCount = 0;

  [...market.wagers]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime() || left.id - right.id)
    .forEach((wager) => {
      const actorName = displayMarketActorName(wager.user);
      const actorKey = normalizeName(actorName).toLowerCase();
      const participantSide = participantNames.get(actorKey);
      if (participantSide && participantSide === (wager.side === "right" ? "right" : "left")) {
        return;
      }
      spectatorCount += 1;
      spectatorOrdinalByWagerId.set(wager.id, spectatorCount);
    });

  const wagerRows = market.wagers.map((wager) => {
    const actorName = displayMarketActorName(wager.user);
    const actorKey = normalizeName(actorName).toLowerCase();
    const participantSide = participantNames.get(actorKey);
    const side = wager.side === "right" ? "right" : "left";
    const isPlayerBet = participantSide && participantSide === side;
    const selectedName = side === "left" ? market.leftLabel : market.rightLabel;
    const txHash = effectiveBetWagerStakeTxHash(wager);

    return {
      id: `wager-${wager.id}`,
      kind: txHash ? ("tx" as const) : ("event" as const),
      label: isPlayerBet
        ? "Player Bet"
        : `Spectator Bet #${spectatorOrdinalByWagerId.get(wager.id) ?? 1}`,
      actor: actorName,
      amountWolo: wager.amountWolo,
      side,
      note: `on ${selectedName}`,
      txHash,
      txUrl: txHash ? buildWoloRestTxLookupUrl(txHash) : null,
      createdAt: wager.createdAt.toISOString(),
    } satisfies BetWarTapeRow;
  });

  const founderRows = market.founderBonuses.map((bonus) => {
    const actorName = displayMarketActorName(bonus.createdBy);
    const participantCount =
      marketFounderParticipantCount(market);

    const dividesEvenly =
      participantCount > 0 &&
      bonus.totalAmountWolo % participantCount === 0;

    const perPlayerWolo =
      dividesEvenly
        ? bonus.totalAmountWolo / participantCount
        : null;

    const note =
      bonus.bonusType === "winner"
        ? `${actorName} added ${bonus.totalAmountWolo} WOLO -> winner`
        : perPlayerWolo !== null
          ? `${actorName} added ${bonus.totalAmountWolo} WOLO -> ${perPlayerWolo} each x ${participantCount} players`
          : `${actorName} added ${bonus.totalAmountWolo} WOLO -> ${participantCount} players · legacy total not evenly divisible`;

    return {
      id: `founder-${bonus.id}`,
      kind: "event" as const,
      label: bonus.bonusType === "winner" ? "Founders Win" : "Founders Bonus",
      actor: actorName,
      amountWolo: bonus.totalAmountWolo,
      side: null,
      note: bonus.note?.trim() || note,
      txHash: null,
      txUrl: null,
      createdAt: bonus.createdAt.toISOString(),
    } satisfies BetWarTapeRow;
  });

  const claimRows = claims.map((claim) => {
    const txHash = claim.payoutTxHash?.trim() || null;
    const timestamp = claim.claimedAt ?? claim.rescindedAt ?? claim.createdAt;
    return {
      id: `claim-${claim.id}`,
      kind: txHash ? ("tx" as const) : ("event" as const),
      label: claimKindTapeLabel(claim.claimKind, claim.status, claim.errorState),
      actor: claim.displayPlayerName,
      amountWolo: claim.amountWolo,
      side: null,
      note: claim.errorState || claim.note || null,
      txHash,
      txUrl: claim.payoutProofUrl || (txHash ? buildWoloRestTxLookupUrl(txHash) : null),
      createdAt: timestamp.toISOString(),
    } satisfies BetWarTapeRow;
  });

  return [...wagerRows, ...founderRows, ...claimRows]
    .sort((left, right) => {
      const leftMs = new Date(left.createdAt).getTime();
      const rightMs = new Date(right.createdAt).getTime();
      return rightMs - leftMs;
    })
    .slice(0, 8);
}

function mergeWarTapeRows(
  primaryRows: BetWarTapeRow[],
  additionalRows: BetWarTapeRow[]
) {
  const byId = new Map<string, BetWarTapeRow>();

  for (const row of [
    ...primaryRows,
    ...additionalRows,
  ]) {
    byId.set(row.id, row);
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime()
    )
    .slice(0, 8);
}

function attachDesyncWarTapeToWinnerMarkets(
  markets: BetBoardMarket[]
): BetBoardMarket[] {
  const desyncByWinnerSlug =
    new Map<string, BetBoardMarket>();

  const desyncBySession =
    new Map<string, BetBoardMarket>();

  for (const market of markets) {
    if (
      !isDesyncSideMarketType(
        market.marketType
      )
    ) {
      continue;
    }

    const winnerSlug =
      winnerSlugFromDesyncSideMarketSlug(
        market.slug
      );

    if (winnerSlug) {
      desyncByWinnerSlug.set(
        winnerSlug,
        market
      );
    }

    const sessionKey =
      market.linkedSessionKey?.trim();

    if (sessionKey) {
      desyncBySession.set(
        sessionKey,
        market
      );
    }
  }

  return markets.map((market) => {
    if (
      isDesyncSideMarketType(
        market.marketType
      )
    ) {
      return market;
    }

    const sessionKey =
      market.linkedSessionKey?.trim();

    const sibling =
      desyncByWinnerSlug.get(
        market.slug
      ) ??
      (
        sessionKey
          ? desyncBySession.get(
              sessionKey
            )
          : undefined
      );

    if (!sibling) {
      return market;
    }

    const desyncWagerRows =
      sibling.warTape
        .filter((row) =>
          row.id.startsWith(
            "wager-"
          )
        )
        .map((row) => ({
          ...row,
          label: "Desync Bet",
          note: row.note
            ? `${row.note} · desync market`
            : "desync market",
        }));

    if (
      desyncWagerRows.length === 0
    ) {
      return market;
    }

    return {
      ...market,
      warTape:
        mergeWarTapeRows(
          market.warTape,
          desyncWagerRows
        ),
    };
  });
}

type MarketSettlementClaimPlan = {
  requestId: string;
  claimPlayerName: string;
  displayPlayerName: string;
  amountWolo: number;
  claimReason: "bet_refund" | "bet_payout" | "winner_bounty";
  outcomeKind: "won" | "void" | "winner_bounty";
  winnerName: string | null;
  losingName: string | null;
  walletAddress: string | null;
  claimedByUserId: number | null;
  wagerIds: number[];
  activityUserIds: number[];
};

function buildMarketSettlementRunId(marketId: number) {
  return `aoe2-bet-market-${marketId}`;
}

function buildMarketSettlementRequestId(
  marketId: number,
  claimReason: MarketSettlementClaimPlan["claimReason"],
  key: string
) {
  return `aoe2-bet-${marketId}-${claimReason}-${hashValue(key)}`;
}

function upsertSettlementClaimPlan(
  plans: Map<string, MarketSettlementClaimPlan>,
  input: {
    marketId: number;
    planKey: string;
    claimPlayerName: string;
    displayPlayerName: string;
    amountWolo: number;
    claimReason: MarketSettlementClaimPlan["claimReason"];
    outcomeKind: MarketSettlementClaimPlan["outcomeKind"];
    winnerName?: string | null;
    losingName?: string | null;
    walletAddress: string | null;
    claimedByUserId: number | null;
    wagerId?: number | null;
    activityUserId?: number | null;
  }
) {
  if (input.amountWolo < 1) return;
  const existing = plans.get(input.planKey);
  if (existing) {
    existing.amountWolo += input.amountWolo;
    if (typeof input.wagerId === "number") {
      existing.wagerIds.push(input.wagerId);
    }
    if (typeof input.activityUserId === "number" && !existing.activityUserIds.includes(input.activityUserId)) {
      existing.activityUserIds.push(input.activityUserId);
    }
    return;
  }

  plans.set(input.planKey, {
    requestId: buildMarketSettlementRequestId(input.marketId, input.claimReason, input.planKey),
    claimPlayerName: input.claimPlayerName,
    displayPlayerName: input.displayPlayerName,
    amountWolo: input.amountWolo,
    claimReason: input.claimReason,
    outcomeKind: input.outcomeKind,
    winnerName: input.winnerName ?? null,
    losingName: input.losingName ?? null,
    walletAddress: input.walletAddress,
    claimedByUserId: input.claimedByUserId,
    wagerIds: typeof input.wagerId === "number" ? [input.wagerId] : [],
    activityUserIds: typeof input.activityUserId === "number" ? [input.activityUserId] : [],
  });
}

function canExecuteValidatedSettlementRun(result: SettlementRunResult) {
  return result.ok && !["failed", "invalid", "refused"].includes(result.status);
}

export function resolveMarketSettlementStatus(
  execution: SettlementRunResult | null,
  validation: SettlementRunResult | null,
  claimPlanCount: number
) {
  if (execution) {
    if (execution.status === "partial") return "partial";
    if (execution.ok && execution.executedPayoutCount > 0) {
      return execution.executedPayoutCount >= claimPlanCount
        ? "executed"
        : "partial";
    }
    return "failed";
  }

  if (validation && !canExecuteValidatedSettlementRun(validation)) {
    return "dry_run";
  }

  if (claimPlanCount > 0) {
    return "pending";
  }

  return null;
}

function resolveSettlementPlanError(
  validation: SettlementRunResult | null,
  payoutResult?: SettlementRunResult["payouts"][number]
) {
  return (
    payoutResult?.detail ||
    payoutResult?.failureCode ||
    validation?.detail ||
    validation?.failureCode ||
    null
  );
}

function isCountableOnchainWagerStakeIntent(
  stakeIntent: { status: string | null } | null | undefined
) {
  return Boolean(stakeIntent && isBetStakeIntentCountableStatus(stakeIntent.status));
}

function isCountableBetWager(
  wager: {
    executionMode: string;
    stakeTxHash?: string | null;
    createdAt?: Date | string | null;
    stakeLockedAt?: Date | string | null;
    stakeIntent?: { status: string | null } | null;
    stakeLeg?: {
      ticket?: {
        status: string;
        stakeTxHash: string | null;
      } | null;
    } | null;
  }
) {
  const effectiveStakeTxHash =
    effectiveBetWagerStakeTxHash(wager);

  if (
    !isMainnetVisibleBetWager({
      ...wager,
      stakeTxHash:
        effectiveStakeTxHash,
    })
  ) {
    return false;
  }

  return (
    wager.executionMode !== "onchain_escrow" ||
    isCountableOnchainWagerStakeIntent(wager.stakeIntent) ||
    isRecordedBetStakeTicket(
      wager.stakeLeg?.ticket
    )
  );
}

function buildCountableActiveWagerWhere() {
  if (isWoloMainnet()) {
    return {
      status: "active",
      executionMode: "onchain_escrow",
      stakeLockedAt: { gte: getWoloMainnetDisplayStartAt() },
      OR: [
        {
          stakeTxHash: { not: null },
          stakeIntent: {
            is: {
              status: "recorded",
            },
          },
        },
        {
          stakeLeg: {
            is: {
              ticket: {
                is: {
                  status: "recorded",
                  stakeTxHash: { not: null },
                },
              },
            },
          },
        },
      ],
    };
  }

  return {
    status: "active",
    OR: [
      {
        executionMode: "app_only",
      },
      {
        executionMode: "onchain_escrow",
        stakeIntent: {
          is: {
            status: "recorded",
          },
        },
      },
      {
        executionMode: "onchain_escrow",
        stakeLeg: {
          is: {
            ticket: {
              is: {
                status: "recorded",
                stakeTxHash: { not: null },
              },
            },
          },
        },
      },
    ],
  };
}

function combineSettlementDetail(
  detail: string | null,
  warnings: string[] = []
) {
  const normalizedWarnings = warnings
    .map((warning) => warning.trim())
    .filter(Boolean);

  let combined: string | null = null;

  if (!detail && normalizedWarnings.length === 0) {
    combined = null;
  } else if (!detail) {
    combined = normalizedWarnings.join(" ");
  } else if (normalizedWarnings.length === 0) {
    combined = detail;
  } else {
    combined = `${detail} Warnings: ${normalizedWarnings.join(" ")}`;
  }

  return clampNullableDbText(combined, 255);
}

function guardFailureDetail(result: ClaimPayoutGuardResult | null | undefined) {
  if (!result || result.ok) return null;
  return result.detail || result.failureCode || "WOLO payout tx failed distinct-send validation.";
}

function summarizeSettlementConfigBlocker() {
  return (
    getWoloPayoutExecutionBlocker() ||
    "Claim rail pending manual or unmatched payouts; no auto payout signer matched these claims."
  );
}

async function markMarketUnderIntegrityReview(
  prisma: PrismaClient,
  input: {
    marketId: number;
    title: string;
    leftLabel: string;
    rightLabel: string;
    priorStatus: string;
    reason: string;
    linkedGameStatsId?: number | null;
  }
) {
  const now = new Date();
  const reason = clampDbText(input.reason || "settlement_integrity_blocked", 120);
  await prisma.$transaction(async (tx) => {
    await tx.betMarket.update({
      where: { id: input.marketId },
      data: {
        status: "under_review",
        featured: false,
        closeAt: now,
        winnerSide: null,
        integrityStatus: "under_review",
        integrityReason: reason,
        commissionerReviewState: "settlement_blocked",
        underReviewAt: now,
        linkedGameStatsId: input.linkedGameStatsId ?? undefined,
      },
    });

    await tx.betMarketIntegrityIncident.upsert({
      where: { incidentKey: `automated-integrity-block-${input.marketId}` },
      create: {
        marketId: input.marketId,
        incidentKey: `automated-integrity-block-${input.marketId}`,
        incidentType: "settlement_integrity_blocked",
        status: "open",
        publicSummary: "Betting paused while the replay teams and result are reviewed.",
        evidence: {
          source: "automated_settlement_gate",
          priorStatus: input.priorStatus,
          reason,
          linkedGameStatsId: input.linkedGameStatsId ?? null,
          detectedAt: now.toISOString(),
        },
        originalLeftLabel: input.leftLabel,
        originalRightLabel: input.rightLabel,
      },
      update: {
        status: "open",
        evidence: {
          source: "automated_settlement_gate",
          priorStatus: input.priorStatus,
          reason,
          linkedGameStatsId: input.linkedGameStatsId ?? null,
          detectedAt: now.toISOString(),
        },
      },
    });

    const affectedUsers = await tx.betWager.findMany({
      where: { marketId: input.marketId },
      distinct: ["userId"],
      select: { userId: true },
    });
    for (const { userId } of affectedUsers) {
      await recordUserActivity(tx, {
        userId,
        type: "settlement_integrity_blocked",
        path: "/bets",
        label: input.title,
        metadata: {
          marketId: input.marketId,
          reason,
          linkedGameStatsId: input.linkedGameStatsId ?? null,
        },
        dedupeWithinSeconds: 86_400,
      });
    }
  });
}

async function resolveAutomatedWatcherIntegrityIncident(
  prisma: PrismaClient,
  marketId: number
) {
  await prisma.betMarketIntegrityIncident.updateMany({
    where: {
      marketId,
      incidentKey: `automated-integrity-block-${marketId}`,
      incidentType: "settlement_integrity_blocked",
      status: "open",
    },
    data: {
      status: "resolved",
      resolvedAt: new Date(),
    },
  });
}

async function settleResolvedMarketWagers(prisma: PrismaClient) {
  const markets = await prisma.betMarket.findMany({
    where: {
      status: { in: ["settled", "voided"] },
      wagers: {
        some: buildCountableActiveWagerWhere(),
      },
    },
    select: {
      id: true,
      status: true,
      title: true,
      eventLabel: true,
      marketType: true,
      parentMarketId: true,
      slug: true,
      linkedSessionKey: true,
      leftLabel: true,
      rightLabel: true,
      linkedGameStatsId: true,
      scheduledMatchId: true,
      propositionHash: true,
      leftRosterSnapshot: true,
      rightRosterSnapshot: true,
      winnerSide: true,
      seedLeftWolo: true,
      seedRightWolo: true,
      settledAt: true,
      wagers: {
        where: buildCountableActiveWagerWhere(),
        select: {
          id: true,
          userId: true,
          side: true,
          amountWolo: true,
          payoutTxHash: true,
          payoutProofUrl: true,
          executionMode: true,
          stakeIntent: {
            select: {
              status: true,
            },
          },
          stakeLeg: {
            select: {
              ticket: {
                select: {
                  id: true,
                  status: true,
                  stakeTxHash: true,
                },
              },
            },
          },
          user: {
            select: {
              id: true,
              uid: true,
              inGameName: true,
              steamPersonaName: true,
              verified: true,
              verificationLevel: true,
              steamId: true,
              walletAddress: true,
            },
          },
        },
      },
    },
  });

  for (const market of markets) {
    const settledAt = market.settledAt ?? new Date();
    const settlementIntent = classifyResolvedMarketSettlement({
      status: market.status,
      winnerSide: market.winnerSide,
    });
    const winningSide = settlementIntent.winningSide;

    const wagerSettlementPlan = planResolvedWagerSettlements({
      winningSide,
      marketType: market.marketType,
      desyncMarketType: DESYNC_SIDE_MARKET_TYPE,
      seedLeftWolo: market.seedLeftWolo,
      seedRightWolo: market.seedRightWolo,
      wagers: market.wagers,
      feeRateBps: BETTING_FEE_RATE_BPS,
      feeDenominator: BPS_DENOMINATOR,
    });
    const bettingFeePoolWolo = wagerSettlementPlan.bettingFeePoolWolo;
    const settlementOutcomeByWagerId = new Map(
      wagerSettlementPlan.outcomes.map((outcome) => [outcome.id, outcome] as const)
    );

    const claimPlans = new Map<string, MarketSettlementClaimPlan>();

    let terminalizedActiveWagers = false;
    try {
      if (settlementIntent.kind === "blocked") {
        throw new Error(
          `RESOLVED_MARKET_INVALID: ${market.status} market ${market.id} has no concrete payout side`
        );
      }

      if (
        !isDesyncSideMarketType(market.marketType) &&
        settlementIntent.kind === "payout"
      ) {
        await assertLockedOrdinaryMarketWinnerPayoutAllowed(
          prisma,
          market
        );

        await assertSettlementWinnerTruthGate(
          prisma,
          market,
          winningSide
        );
      }

      terminalizedActiveWagers = await prisma.$transaction(async (tx) => {
        if (isDesyncSideMarketType(market.marketType)) {
          if (settlementIntent.kind === "payout") {
            if (!market.linkedGameStatsId) {
              throw new Error(
                "Desync side-market payout blocked: final replay evidence is not linked."
              );
            }

            /*
             * This is the financial commit point for the side proposition. Use
             * the exact replay lock held by human incident append, then re-read
             * effective truth inside this same transaction. A concurrent YES
             * can therefore never land between truth validation and wager
             * terminalization.
             */
            await acquireReplayDesyncAdvisoryLock(
              tx,
              market.linkedGameStatsId
            );
            await assertDesyncSideMarketSettlementTruthGate(
              tx,
              market,
              winningSide
            );
          }

          const stillActiveWagers = await tx.betWager.count({
            where: {
              id: {
                in: market.wagers.map((wager) => wager.id),
              },
              ...buildCountableActiveWagerWhere(),
            },
          });
          if (stillActiveWagers !== market.wagers.length) {
            return false;
          }
        }

        for (const wager of market.wagers) {
          const outcome = settlementOutcomeByWagerId.get(wager.id);
          if (!outcome) {
            throw new Error(`Missing wager settlement outcome for wager #${wager.id}.`);
          }
          const nextStatus = outcome.status;
          const payoutWolo = outcome.payoutWolo;
          const bettingFeeWolo = outcome.bettingFeeWolo;

          await tx.betWager.update({
            where: { id: wager.id },
            data: {
              status: nextStatus,
              payoutWolo,
              payoutTxHash: null,
              payoutProofUrl: null,
              settledAt,
            },
          });

          await recordUserActivity(tx, {
            userId: wager.userId,
            type:
              nextStatus === "won"
                ? "bet_wager_won"
                : nextStatus === "void"
                  ? "bet_wager_voided"
                  : "bet_wager_lost",
            path: "/bets",
            label: market.title,
            metadata: {
              marketId: market.id,
              wagerId: wager.id,
              eventLabel: market.eventLabel,
              side: wager.side,
              amountWolo: wager.amountWolo,
              payoutWolo,
              bettingFeeRateBps: BETTING_FEE_RATE_BPS,
              bettingFeeWolo,
              settledAt: settledAt.toISOString(),
              outcome: nextStatus,
              winnerSide: winningSide,
            },
            dedupeWithinSeconds: 5,
          });

          if (nextStatus === "lost" || payoutWolo < 1) {
            continue;
          }

          const claimPlayerName = claimPlayerNameForUser(wager.user);
          const claimReason = nextStatus === "void" ? "bet_refund" : "bet_payout";
          const planKey = wager.user.id
            ? `user:${wager.user.id}:${claimReason}`
            : `name:${normalizePendingWoloClaimName(claimPlayerName)}:${claimReason}`;

          upsertSettlementClaimPlan(claimPlans, {
            marketId: market.id,
            planKey,
            claimPlayerName,
            displayPlayerName: claimPlayerName,
            amountWolo: payoutWolo,
            claimReason,
            outcomeKind: nextStatus,
            walletAddress: canAutoClaimForKnownUser(wager.user)
              ? wager.user.walletAddress ?? null
              : null,
            claimedByUserId: canAutoClaimForKnownUser(wager.user) ? wager.user.id : null,
            wagerId: wager.id,
            activityUserId: wager.userId,
          });
        }

        return true;
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (error instanceof ChallengeDesyncError) {
        await prisma.betMarket.update({
          where: { id: market.id },
          data: planBetMarketDesyncReview(),
        });
        console.warn(`Blocked winner payout for market #${market.id} (${error.code}): ${detail}`);
        continue;
      }
      await markMarketUnderIntegrityReview(prisma, {
        marketId: market.id,
        title: market.title,
        leftLabel: market.leftLabel,
        rightLabel: market.rightLabel,
        reason: detail,
        priorStatus: market.status,
        linkedGameStatsId: market.linkedGameStatsId,
      });
      console.error(`Blocked settlement for market #${market.id}:`, error);
      continue;
    }

    if (!terminalizedActiveWagers) {
      continue;
    }

    if (
      winningSide &&
      !isDesyncSideMarketType(
        market.marketType
      )
    ) {
      const winningWagers = market.wagers.filter((wager) => wager.side === winningSide);
      const losingWagers = market.wagers.filter((wager) => wager.side !== winningSide);
      const grossWinnerBountyWolo = losingWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
      const winnerBountyWolo = Math.max(0, grossWinnerBountyWolo - bettingFeePoolWolo);

      if (winningWagers.length === 0 && winnerBountyWolo > 0) {
        const winnerName = getWinningPlayerName(market, winningSide);
        const losingName = getLosingPlayerName(market, winningSide);
        const autoClaimUser = await findAutoClaimUserForPlayerName(prisma, winnerName);
        upsertSettlementClaimPlan(claimPlans, {
          marketId: market.id,
          planKey: autoClaimUser?.id
            ? `user:${autoClaimUser.id}:winner_bounty`
            : `name:${normalizePendingWoloClaimName(winnerName)}:winner_bounty`,
          claimPlayerName: winnerName,
          displayPlayerName: winnerName,
          amountWolo: winnerBountyWolo,
          claimReason: "winner_bounty",
          outcomeKind: "winner_bounty",
          winnerName,
          losingName,
          walletAddress: autoClaimUser?.walletAddress ?? null,
          claimedByUserId: autoClaimUser?.id ?? null,
          activityUserId: autoClaimUser?.id ?? null,
        });
      }
    }

    const claimPlanList = [...claimPlans.values()];
    const autoClaimPlans = claimPlanList.filter(
      (plan) =>
        Boolean(plan.walletAddress && plan.claimedByUserId) &&
        hasWoloEscrowSettlementExecutionConfigured()
    );

    let validationResult: SettlementRunResult | null = null;
    let executionResult: SettlementRunResult | null = null;
    let settlementRunId: string | null = null;
    let settlementAttemptedAt: Date | null = null;
    let settlementExecutedAt: Date | null = null;

    if (autoClaimPlans.length > 0) {
      settlementRunId = buildMarketSettlementRunId(market.id);
      settlementAttemptedAt = new Date();
      validationResult = await validateWoloEscrowSettlementRun({
        settlementRunId,
        sourceApp: "aoe2hdbets",
        sourceEventId: `bet-market-${market.id}`,
        note: `Bet settlement · ${market.title}`,
        memo: `AoE2 bet settlement · market ${market.id}`,
        payouts: autoClaimPlans.map((plan) => ({
          requestId: plan.requestId,
          toAddress: plan.walletAddress as string,
          amountWolo: plan.amountWolo,
          memo: `${market.title} · ${plan.claimReason}`,
        })),
      });

      executionResult = await executeWoloEscrowSettlementRun({
        settlementRunId,
        sourceApp: "aoe2hdbets",
        sourceEventId: `bet-market-${market.id}`,
        note: `Bet settlement · ${market.title}`,
        memo: `AoE2 bet settlement · market ${market.id}`,
        payouts: autoClaimPlans.map((plan) => ({
          requestId: plan.requestId,
          toAddress: plan.walletAddress as string,
          amountWolo: plan.amountWolo,
          memo: `${market.title} · ${plan.claimReason}`,
        })),
      });
      settlementExecutedAt = new Date();
    }

    const payoutByRequestId = new Map(
      (executionResult?.payouts || []).map((payout) => [payout.requestId, payout] as const)
    );

    const payoutGuardByRequestId = new Map<string, ClaimPayoutGuardResult>();
    const payoutGuardEntries = autoClaimPlans
      .map((plan) => {
        const payout = payoutByRequestId.get(plan.requestId);
        if (!payout?.ok || !payout.txHash || !plan.walletAddress) return null;
        return {
          key: plan.requestId,
          txHash: payout.txHash,
          toAddress: plan.walletAddress,
          amountWolo: plan.amountWolo,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    if (payoutGuardEntries.length > 0) {
      const guardResults = await validateDistinctClaimPayoutTxBatch(prisma, payoutGuardEntries);
      for (const [requestId, result] of guardResults.entries()) {
        payoutGuardByRequestId.set(requestId, result);
      }
    }

    const guardFailures = Array.from(payoutGuardByRequestId.values()).filter(
      (result) => !result.ok
    );
    const settlementStatus =
      guardFailures.length > 0
        ? guardFailures.length >= payoutGuardByRequestId.size
          ? "failed"
          : "partial"
        : resolveMarketSettlementStatus(
            executionResult,
            validationResult,
            claimPlanList.length
          );
    const fallbackSettlementDetail =
      claimPlanList.length > 0 && autoClaimPlans.length === 0
        ? hasWoloPayoutExecutionConfigured()
          ? "Claim rail pending manual or unmatched payouts."
          : summarizeSettlementConfigBlocker()
        : null;
    const guardWarnings = guardFailures.map(
      (result) =>
        `Duplicate guard ${result.key}: ${result.detail || result.failureCode || "failed"}`
    );
    const settlementFailureCode = clampNullableDbText(
      guardFailures.length > 0
        ? "DUPLICATE_TX_GUARD"
        : executionResult?.failureCode || validationResult?.failureCode || null,
      80
    );
    const settlementDetail = combineSettlementDetail(
      executionResult?.detail ||
      validationResult?.detail ||
      guardFailureDetail(guardFailures[0]) ||
      fallbackSettlementDetail,
      [
        ...(validationResult?.warnings || []),
        ...(executionResult?.warnings || []),
        ...guardWarnings,
      ]
    );

    await prisma.$transaction(async (tx) => {
      await tx.betMarket.update({
        where: { id: market.id },
        data: {
          settlementRunId,
          settlementStatus,
          settlementFailureCode,
          settlementDetail,
          settlementAttemptedAt,
          settlementExecutedAt,
          refundStatus: !winningSide
            ? settlementStatus === "executed"
              ? "refunded"
              : settlementStatus === "failed"
                ? "failed"
                : "queued"
            : undefined,
        },
      });

      for (const plan of claimPlanList) {
        const payout = payoutByRequestId.get(plan.requestId);
        const payoutGuard = payoutGuardByRequestId.get(plan.requestId) ?? null;
        const payoutSucceeded = Boolean(payout?.ok && payout.txHash && payoutGuard?.ok);
        const awaitingWalletLink = !plan.walletAddress || !plan.claimedByUserId;
        const payoutError =
          guardFailureDetail(payoutGuard) || resolveSettlementPlanError(validationResult, payout);
        const pendingError =
          !payoutSucceeded && awaitingWalletLink
            ? buildAwaitingWalletLinkClaimDetail(plan.displayPlayerName)
            : payoutError;
        const claimNote =
          plan.outcomeKind === "winner_bounty"
            ? buildWinnerBountyNote(
                market,
                plan.winnerName || plan.displayPlayerName,
                plan.losingName || "the field",
                plan.amountWolo
              )
            : buildPendingClaimNote(
                market,
                plan.outcomeKind === "void" ? "void" : "won",
                plan.amountWolo
              );

        if (payoutSucceeded) {
          await createPendingWoloClaim(tx as PrismaClient, {
            playerName: plan.claimPlayerName,
            displayPlayerName: plan.displayPlayerName,
            amountWolo: plan.amountWolo,
            claimKind: plan.claimReason,
            claimGroupKey: "market",
            targetScope: claimKindTargetScope(plan.claimReason),
            sourceMarketId: market.id,
            sourceGameStatsId: market.linkedGameStatsId ?? null,
            payoutTxHash: payout?.txHash ?? null,
            payoutProofUrl: payoutGuard?.proofUrl ?? payout?.proofUrl ?? null,
            errorState: null,
            payoutAttemptedAt: settlementExecutedAt ?? settledAt,
            note: buildOnchainSettlementNote(
              market,
              plan.amountWolo,
              payout?.txHash ?? "",
              settlementRunId
            ),
            status: "claimed",
            claimedByUserId: plan.claimedByUserId,
            claimedAt: settledAt,
          });

          if (plan.wagerIds.length > 0) {
            await tx.betWager.updateMany({
              where: { id: { in: plan.wagerIds } },
              data: {
                payoutTxHash: payout?.txHash ?? null,
                payoutProofUrl: payoutGuard?.proofUrl ?? payout?.proofUrl ?? null,
              },
            });
          }
        } else {
          await createPendingWoloClaim(tx as PrismaClient, {
            playerName: plan.claimPlayerName,
            displayPlayerName: plan.displayPlayerName,
            amountWolo: plan.amountWolo,
            claimKind: plan.claimReason,
            claimGroupKey: "market",
            targetScope: claimKindTargetScope(plan.claimReason),
            sourceMarketId: market.id,
            sourceGameStatsId: market.linkedGameStatsId ?? null,
            payoutTxHash: payout?.txHash ?? null,
            payoutProofUrl: payoutGuard?.proofUrl ?? payout?.proofUrl ?? null,
            errorState: pendingError,
            payoutAttemptedAt: awaitingWalletLink ? null : settlementAttemptedAt,
            note: claimNote,
            status: "pending",
          });
        }

        for (const activityUserId of plan.activityUserIds) {
          await recordUserActivity(tx, {
            userId: activityUserId,
            type: payoutSucceeded ? "wolo_claim_auto_settled" : "pending_wolo_claim_created",
            path: "/bets",
            label: market.title,
            metadata: {
              marketId: market.id,
              eventLabel: market.eventLabel,
              amountWolo: plan.amountWolo,
              claimReason: plan.claimReason,
              claimStatus: payoutSucceeded ? "claimed" : "pending",
              payoutTxHash: payout?.txHash ?? null,
              payoutProofUrl: payoutGuard?.proofUrl ?? payout?.proofUrl ?? null,
              settlementRunId,
              settledAt: settledAt.toISOString(),
              errorState: payoutSucceeded ? null : pendingError,
            },
            dedupeWithinSeconds: 5,
          });
        }
      }
    });
  }
}

const CORE_BET_SETTLEMENT_CLAIM_KINDS = [
  "bet_payout",
  "bet_refund",
] as const;

async function reconcilePendingCoreBetClaims(
  prisma: PrismaClient
) {
  const retryCutoff =
    new Date(
      Date.now() -
        5 * 60_000
    );
  const claims =
    await prisma.pendingWoloClaim.findMany({
      where: {
        status: "pending",
        rescindedAt: null,
        sourceMarketId: {
          not: null,
        },
        claimKind: {
          in: [
            ...CORE_BET_SETTLEMENT_CLAIM_KINDS,
          ],
        },
        OR: [
          {
            payoutTxHash: {
              not: null,
            },
          },
          {
            payoutTxHash: null,
            payoutAttemptedAt: {
              not: null,
              lte: retryCutoff,
            },
          },
        ],
      },
      orderBy: [
        {
          createdAt: "asc",
        },
        {
          id: "asc",
        },
      ],
      select: {
        id: true,
      },
      take: 25,
    });

  for (const claim of claims) {
    const result =
      await retryPendingClaimSettlement(
        prisma,
        claim.id,
        {
          activityPath: "/bets",
          memoTag:
            "automated_core_bet_recovery",
        }
      );

    if (
      result.outcome ===
      "failed"
    ) {
      console.warn(
        `Core bet claim retry failed for claim #${claim.id}: ${result.detail}`
      );
    }
  }
}

async function settleMarketIntegrityCorrections(prisma: PrismaClient) {
  const retryCutoff = new Date(Date.now() - 5 * 60_000);
  const candidates = await prisma.betMarketFinancialAdjustment.findMany({
    where: {
      amountStillOwedWolo: { gt: 0 },
      OR: [
        { adjustmentStatus: "corrective_refund_pending" },
        { adjustmentStatus: "corrective_refund_failed", updatedAt: { lt: retryCutoff } },
        { adjustmentStatus: "corrective_refund_processing", updatedAt: { lt: retryCutoff } },
      ],
      incident: {
        market: { status: "voided" },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    include: {
      incident: {
        include: {
          market: true,
        },
      },
    },
  });

  for (const adjustment of candidates) {
    const acquired = await prisma.betMarketFinancialAdjustment.updateMany({
      where: {
        id: adjustment.id,
        amountStillOwedWolo: { gt: 0 },
        OR: [
          { adjustmentStatus: "corrective_refund_pending" },
          { adjustmentStatus: "corrective_refund_failed", updatedAt: { lt: retryCutoff } },
          { adjustmentStatus: "corrective_refund_processing", updatedAt: { lt: retryCutoff } },
        ],
      },
      data: { adjustmentStatus: "corrective_refund_processing" },
    });
    if (acquired.count !== 1) continue;

    const user = await prisma.user.findUnique({
      where: { id: adjustment.userId },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        verified: true,
        verificationLevel: true,
        steamId: true,
        walletAddress: true,
      },
    });
    const market = adjustment.incident.market;
    const displayName = user ? claimPlayerNameForUser(user) : `User #${adjustment.userId}`;
    const claimGroupKey = `integrity:${adjustment.incidentId}`;
    const memo = `AoE2 integrity correction · incident ${adjustment.incidentId} · wager ${adjustment.wagerId}`;
    const requestId = `integrity-${adjustment.incidentId}-wager-${adjustment.wagerId}`;
    const walletAddress = user && canAutoClaimForKnownUser(user) ? user.walletAddress : null;
    const escrowAddress = getWoloBetEscrowRuntime().escrowAddress;

    if (!walletAddress || !escrowAddress || !hasWoloEscrowSettlementExecutionConfigured()) {
      const claim = await createPendingWoloClaim(prisma, {
        playerName: displayName,
        displayPlayerName: displayName,
        amountWolo: adjustment.amountStillOwedWolo,
        claimKind: "bet_corrective_refund",
        claimGroupKey,
        targetScope: "integrity_correction",
        sourceMarketId: market.id,
        sourceGameStatsId: market.linkedGameStatsId,
        errorState: walletAddress
          ? summarizeSettlementConfigBlocker()
          : buildAwaitingWalletLinkClaimDetail(displayName),
        note: `Invalid team assignment · exact stake correction · wager ${adjustment.wagerId}`,
        status: "pending",
      });
      await prisma.betMarketFinancialAdjustment.update({
        where: { id: adjustment.id },
        data: {
          adjustmentStatus: walletAddress
            ? "corrective_refund_failed"
            : "awaiting_wallet",
          correctiveClaimId: claim?.id ?? null,
        },
      });
      continue;
    }

    let payout = await findConfirmedWoloPayoutByMemo({
      toAddress: walletAddress,
      amountWolo: adjustment.amountStillOwedWolo,
      memo,
      fromAddress: escrowAddress,
    });
    let failureDetail: string | null = null;
    const attemptedAt = new Date();
    if (!payout) {
      const settlementRunId = `aoe2-integrity-incident-${adjustment.incidentId}`;
      const validation = await validateWoloEscrowSettlementRun({
        settlementRunId,
        sourceApp: "aoe2hdbets",
        sourceEventId: `market-integrity-${adjustment.incidentId}`,
        note: `Market integrity correction · market ${market.id}`,
        memo,
        payouts: [{
          requestId,
          toAddress: walletAddress,
          amountWolo: adjustment.amountStillOwedWolo,
          memo,
        }],
      });
      if (validation?.ok) {
        const execution = await executeWoloEscrowSettlementRun({
          settlementRunId,
          sourceApp: "aoe2hdbets",
          sourceEventId: `market-integrity-${adjustment.incidentId}`,
          note: `Market integrity correction · market ${market.id}`,
          memo,
          payouts: [{
            requestId,
            toAddress: walletAddress,
            amountWolo: adjustment.amountStillOwedWolo,
            memo,
          }],
        });
        const result = execution.payouts.find((entry) => entry.requestId === requestId) ?? null;
        if (result?.ok && result.txHash) {
          payout = {
            txHash: result.txHash,
            proofUrl: result.proofUrl || buildWoloRestTxLookupUrl(result.txHash),
            recovered: Boolean(result.idempotentReplay),
          };
        } else {
          failureDetail = result?.detail || execution.detail || execution.failureCode || "Correction payout failed.";
        }
      } else {
        failureDetail = validation?.detail || validation?.failureCode || "Correction payout validation failed.";
      }
    }

    if (!payout) {
      const claim = await createPendingWoloClaim(prisma, {
        playerName: displayName,
        displayPlayerName: displayName,
        amountWolo: adjustment.amountStillOwedWolo,
        claimKind: "bet_corrective_refund",
        claimGroupKey,
        targetScope: "integrity_correction",
        sourceMarketId: market.id,
        sourceGameStatsId: market.linkedGameStatsId,
        errorState: failureDetail,
        payoutAttemptedAt: attemptedAt,
        note: `Invalid team assignment · exact stake correction · wager ${adjustment.wagerId}`,
        status: "pending",
      });
      await prisma.betMarketFinancialAdjustment.update({
        where: { id: adjustment.id },
        data: {
          adjustmentStatus: "corrective_refund_failed",
          correctiveClaimId: claim?.id ?? null,
        },
      });
      continue;
    }

    const guard = (
      await validateDistinctClaimPayoutTxBatch(prisma, [{
        key: requestId,
        txHash: payout.txHash,
        toAddress: walletAddress,
        amountWolo: adjustment.amountStillOwedWolo,
      }])
    ).get(requestId);
    if (!guard?.ok) {
      await prisma.betMarketFinancialAdjustment.update({
        where: { id: adjustment.id },
        data: {
          adjustmentStatus: "corrective_tx_guard_failed",
          correctiveTxHash: payout.txHash,
        },
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const claim = await createPendingWoloClaim(tx as PrismaClient, {
        playerName: displayName,
        displayPlayerName: displayName,
        amountWolo: adjustment.amountStillOwedWolo,
        claimKind: "bet_corrective_refund",
        claimGroupKey,
        targetScope: "integrity_correction",
        sourceMarketId: market.id,
        sourceGameStatsId: market.linkedGameStatsId,
        payoutTxHash: payout.txHash,
        payoutProofUrl: guard.proofUrl ?? payout.proofUrl,
        payoutAttemptedAt: attemptedAt,
        note: `Invalid team assignment corrected on-chain · wager ${adjustment.wagerId}`,
        status: "claimed",
        claimedByUserId: user?.id ?? null,
        claimedAt: new Date(),
      });
      await tx.betMarketFinancialAdjustment.update({
        where: { id: adjustment.id },
        data: {
          adjustmentStatus: "corrective_refund_paid",
          amountStillOwedWolo: 0,
          correctiveClaimId: claim?.id ?? null,
          correctiveTxHash: payout.txHash,
        },
      });
      await tx.betWager.update({
        where: { id: adjustment.wagerId },
        data: {
          status: "void",
          payoutWolo: adjustment.voidEntitlementWolo,
          payoutTxHash: payout.txHash,
          payoutProofUrl: guard.proofUrl ?? payout.proofUrl,
        },
      });
      await recordUserActivity(tx, {
        userId: adjustment.userId,
        type: "corrective_refund_completed",
        path: `/bets/${market.id}`,
        label: market.title,
        metadata: {
          marketId: market.id,
          incidentId: adjustment.incidentId,
          wagerId: adjustment.wagerId,
          amountWolo: adjustment.voidEntitlementWolo,
          txHash: payout.txHash,
          recoveredFromChain: payout.recovered,
        },
        dedupeWithinSeconds: 86_400,
      });

      const remaining = await tx.betMarketFinancialAdjustment.count({
        where: {
          incidentId: adjustment.incidentId,
          amountStillOwedWolo: { gt: 0 },
        },
      });
      if (remaining === 0) {
        const hasRecordedOverpayment = adjustment.incident.overpaymentWolo > 0;
        await tx.betMarketIntegrityIncident.update({
          where: { id: adjustment.incidentId },
          data: {
            status: hasRecordedOverpayment ? "resolved_overpayment" : "resolved",
            operatorReturnStatus: hasRecordedOverpayment
              ? "not_requested"
              : "not_applicable",
            resolvedAt: new Date(),
          },
        });
        await tx.betMarket.update({
          where: { id: market.id },
          data: {
            refundStatus: hasRecordedOverpayment
              ? "corrected_with_overpayment"
              : "refunded",
            settlementStatus: "corrected",
            settlementFailureCode: null,
            settlementDetail: hasRecordedOverpayment
              ? "Invalid team assignment voided; exact unpaid stake returned. Prior overpayment remains recorded without automatic clawback."
              : "Invalid team assignment voided; exact unpaid stake returned on-chain.",
          },
        });
      }
    });
  }
}

async function voidExpiredWatcherMarkets(prisma: PrismaClient) {
  const now = new Date();
  const expired = await prisma.betMarket.findMany({
    where: {
      marketType: WINNER_MARKET_TYPE,
      status: "awaiting_final_proof",
      proofDeadlineAt: { lte: now },
    },
    select: {
      id: true,
      resolutionReason: true,
      linkedGameStatsId: true,
    },
  });
  if (expired.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const market of expired) {
      await tx.betMarket.updateMany({
        where: { id: market.id, status: "awaiting_final_proof" },
        data: {
          status: "voided",
          featured: false,
          winnerSide: null,
          closeAt: null,
          settledAt: now,
          voidedAt: now,
          refundStatus: "queued",
          resolutionReason:
            expiredWatcherMarketResolutionReason(market),
        },
      });
      await tx.betMarketFounderBonus.updateMany({
        where: {
          marketId: market.id,
          status: { in: ["armed", "pending", "ready", "partial"] },
          rescindedAt: null,
        },
        data: {
          status: "rescinded",
          rescindedAt: now,
          failureReason: "Market voided; winner and participant bonuses are not payable.",
        },
      });
      await tx.pendingWoloClaim.updateMany({
        where: {
          sourceMarketId: market.id,
          claimKind: { in: ["founders_bonus", "founders_win", "winner_bounty"] },
          status: "pending",
        },
        data: {
          status: "rescinded",
          rescindedAt: now,
          errorState: "Market voided before bonus settlement.",
        },
      });
    }
  });
}

async function repairMissingWatcherProofDeadlines(
  prisma: PrismaClient
) {
  const missing = await prisma.betMarket.findMany({
    where: {
      status: "awaiting_final_proof",
      proofDeadlineAt: null,
      marketType: {
        in: [
          WINNER_MARKET_TYPE,
          DESYNC_SIDE_MARKET_TYPE,
        ],
      },
    },
    select: {
      id: true,
      marketType: true,
      closeAt: true,
      createdAt: true,
      underReviewAt: true,
      proofDeadlineAt: true,
      resolutionReason: true,
      parentMarket: {
        select: {
          proofDeadlineAt: true,
          closeAt: true,
          createdAt: true,
          underReviewAt: true,
        },
      },
    },
  });

  if (missing.length === 0) {
    return;
  }

  /*
   * Missing proof deadlines are a migration/anomaly condition, not proof that
   * grace began at market creation. Historical production contains real-money
   * awaiting_final_proof books created before proof_deadline_at was persisted.
   *
   * Capture one observation for the whole repair batch. A parent and its
   * deadline-less desync child therefore receive the same fresh bounded window.
   * If the parent already owns a deadline, the child inherits that deadline
   * instead of inventing another clock.
   */
  const repairObservedAt = new Date();

  await prisma.$transaction(
    missing.map((market) => {
      const parentProofClock =
        market.marketType === DESYNC_SIDE_MARKET_TYPE &&
        market.parentMarket
          ? market.parentMarket
          : null;

      const inheritedParentDeadline =
        parentProofClock?.proofDeadlineAt ?? null;

      const proofDeadlineAt =
        inheritedParentDeadline ??
        watcherMissingProofDeadlineRepairDeadline(
          repairObservedAt
        );

      const repairCloseAt =
        inheritedParentDeadline
          ? parentProofClock?.closeAt ??
            parentProofClock?.underReviewAt ??
            repairObservedAt
          : repairObservedAt;

      return prisma.betMarket.updateMany({
        where: {
          id: market.id,
          status: "awaiting_final_proof",
          proofDeadlineAt: null,
        },
        data: {
          closeAt:
            market.closeAt ??
            repairCloseAt,
          proofDeadlineAt,
          resolutionReason:
            market.resolutionReason ??
            (market.marketType === DESYNC_SIDE_MARKET_TYPE
              ? "desync_final_replay_pending"
              : "final_replay_pending"),
        },
      });
    })
  );
}

async function linkLateFinalEvidence(prisma: PrismaClient) {
  const voidedMarkets = await prisma.betMarket.findMany({
    where: {
      marketType: WINNER_MARKET_TYPE,
      status: "voided",
      linkedSessionKey: { not: null },
      lateFinalGameStatsId: null,
    },
    select: {
      id: true,
      linkedSessionKey: true,
      linkedGameStatsId: true,
      leftLabel: true,
      rightLabel: true,
      resolutionReason: true,
    },
    take: 50,
  });
  for (const market of voidedMarkets) {
    const sessionKey = normalizeName(market.linkedSessionKey);
    if (!sessionKey) continue;
    const finalGameId = await resolveFinalGameStatsIdForSessionKey(prisma, sessionKey);
    if (!finalGameId) continue;
    // This is only late evidence when it is new to the market. Integrity voids
    // commonly retain the final game that proved the proposition was invalid.
    if (market.linkedGameStatsId === finalGameId) continue;
    const linked = await prisma.betMarket.updateMany({
      where: { id: market.id, status: "voided", lateFinalGameStatsId: null },
      data: {
        lateFinalGameStatsId: finalGameId,
        commissionerReviewState: "late_final_evidence",
      },
    });
    if (linked.count === 1) {
      await prisma.betMarketIntegrityIncident.upsert({
        where: { incidentKey: `late-final-after-void-${market.id}` },
        create: {
          marketId: market.id,
          incidentKey: `late-final-after-void-${market.id}`,
          incidentType: "late_final_after_void",
          status: "open",
          publicSummary: "Final replay evidence arrived after this market had already been voided.",
          evidence: {
            linkedGameStatsId: finalGameId,
            priorResolutionReason: market.resolutionReason,
            automaticReopen: false,
          },
          originalLeftLabel: market.leftLabel,
          originalRightLabel: market.rightLabel,
        },
        update: {
          evidence: {
            linkedGameStatsId: finalGameId,
            priorResolutionReason: market.resolutionReason,
            automaticReopen: false,
          },
        },
      });
    }
  }
}

type WatcherMarketPromotionSeedFamily = {
  canonicalSessionKey: string;
  aliases: string[];
  winnerSeed: MarketSeed;
  canonicalDesyncSlug: string;
};

function watcherMarketPromotionSeedFamilies(
  seeds: MarketSeed[]
): WatcherMarketPromotionSeedFamily[] {
  return seeds
    .filter(
      (seed) =>
        seed.source === "session" &&
        seed.marketType === WINNER_MARKET_TYPE &&
        normalizeName(seed.linkedSessionKey).toLowerCase().startsWith("platform:") &&
        Boolean(seed.propositionHash) &&
        (seed.identityAliases?.length ?? 0) > 0
    )
    .map((winnerSeed) => {
      const canonicalSessionKey = normalizeName(winnerSeed.linkedSessionKey);
      return {
        canonicalSessionKey,
        aliases: [...new Set(winnerSeed.identityAliases ?? [])]
          .map((alias) => normalizeName(alias))
          .filter((alias) => Boolean(alias) && alias !== canonicalSessionKey)
          .sort((left, right) => left.localeCompare(right)),
        winnerSeed,
        canonicalDesyncSlug: buildDesyncSideMarketSlug(winnerSeed.slug),
      };
    })
    .filter((family) => family.aliases.length > 0)
    .sort((left, right) =>
      left.canonicalSessionKey.localeCompare(right.canonicalSessionKey)
    );
}

function watcherPromotionIdentityKeys(
  canonicalSessionKey: string,
  aliases: readonly string[]
) {
  return [...new Set([canonicalSessionKey, ...aliases])]
    .map((sessionKey) => canonicalBattleIdentityKey(sessionKey))
    .filter((identityKey): identityKey is string => Boolean(identityKey))
    .sort((left, right) => left.localeCompare(right));
}

async function markWatcherIdentityPromotionBlocked(
  tx: Prisma.TransactionClient,
  input: {
    markets: Array<{
      id: number;
      status: string;
      leftLabel: string;
      rightLabel: string;
    }>;
    canonicalSessionKey: string;
    aliases: string[];
    reason: string;
  }
) {
  const now = new Date();
  const marketIds = input.markets.map((market) => market.id);
  if (marketIds.length > 0) {
    await tx.betMarket.updateMany({
      where: {
        id: { in: marketIds },
        status: {
          in: ["open", "closing", "live", "awaiting_final_proof"],
        },
      },
      data: {
        status: "under_review",
        featured: false,
        closeAt: now,
        proofDeadlineAt: null,
        winnerSide: null,
        integrityStatus: "under_review",
        integrityReason: "watcher_identity_promotion_ambiguous",
        commissionerReviewState: "identity_promotion_ambiguous",
        underReviewAt: now,
      },
    });
  }

  for (const market of input.markets) {
    await tx.betMarketIntegrityIncident.upsert({
      where: {
        incidentKey: `watcher-identity-promotion-${market.id}`,
      },
      create: {
        marketId: market.id,
        incidentKey: `watcher-identity-promotion-${market.id}`,
        incidentType: "watcher_identity_promotion",
        status: "open",
        publicSummary:
          "Betting paused because multiple watcher identities could not be consolidated safely.",
        evidence: {
          canonicalSessionKey: input.canonicalSessionKey,
          exactAliases: input.aliases,
          reason: input.reason,
        },
        originalLeftLabel: market.leftLabel,
        originalRightLabel: market.rightLabel,
      },
      update: {
        status: "open",
        resolvedAt: null,
        evidence: {
          canonicalSessionKey: input.canonicalSessionKey,
          exactAliases: input.aliases,
          reason: input.reason,
        },
      },
    });
  }
}

async function applyWatcherPromotionTransfer(
  tx: Prisma.TransactionClient,
  transfer: WatcherMarketPromotionTransfer,
  source: WatcherMarketPromotionSnapshot
) {
  const duplicateWalletIds = new Set(transfer.duplicateWalletLockIds);
  if (duplicateWalletIds.size > 0) {
    await tx.betMarketWallet.deleteMany({
      where: {
        id: { in: [...duplicateWalletIds] },
        marketId: transfer.sourceId,
      },
    });
  }
  for (const wallet of source.walletLocks) {
    if (duplicateWalletIds.has(wallet.id)) continue;
    await tx.betMarketWallet.update({
      where: { id: wallet.id },
      data: {
        marketId: transfer.targetId,
        side: promotionMappedSide(wallet.side, transfer.sideTransfer),
      },
    });
  }
  for (const leg of source.stakeTicketLegs) {
    await tx.betStakeLeg.update({
      where: { id: leg.id },
      data: {
        marketId: transfer.targetId,
        side: promotionMappedSide(leg.side, transfer.sideTransfer),
      },
    });
  }
  await Promise.all([
    tx.betWager.updateMany({
      where: { marketId: transfer.sourceId, side: "left" },
      data: { marketId: transfer.targetId, side: transfer.sideTransfer.left },
    }),
    tx.betWager.updateMany({
      where: { marketId: transfer.sourceId, side: "right" },
      data: { marketId: transfer.targetId, side: transfer.sideTransfer.right },
    }),
    tx.betStakeIntent.updateMany({
      where: { marketId: transfer.sourceId, side: "left" },
      data: { marketId: transfer.targetId, side: transfer.sideTransfer.left },
    }),
    tx.betStakeIntent.updateMany({
      where: { marketId: transfer.sourceId, side: "right" },
      data: { marketId: transfer.targetId, side: transfer.sideTransfer.right },
    }),
    tx.betMarketFounderBonus.updateMany({
      where: { marketId: transfer.sourceId },
      data: { marketId: transfer.targetId },
    }),
    tx.pendingWoloClaim.updateMany({
      where: { sourceMarketId: transfer.sourceId },
      data: { sourceMarketId: transfer.targetId },
    }),
  ]);
}

function earliestPromotionDate(
  values: Array<Date | null | undefined>
) {
  const timestamps = values
    .filter((value): value is Date => value instanceof Date)
    .map((value) => value.getTime())
    .filter(Number.isFinite);
  return timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
}

type WatcherPromotionMutableMarket = {
  id: number;
  battleId: number | null;
  parentMarketId: number | null;
  slug: string;
  linkedSessionKey: string | null;
  title: string;
  eventLabel: string;
  marketType: string;
  sortOrder: number;
  leftLabel: string;
  rightLabel: string;
  leftHref: string | null;
  rightHref: string | null;
  seedLeftWolo: number;
  seedRightWolo: number;
  propositionHash: string | null;
  firstStakeAcceptedAt: Date | null;
  rosterLockedAt: Date | null;
  bettingLockedAt: Date | null;
};

async function canonicalizeWatcherPromotionFamily(
  tx: Prisma.TransactionClient,
  input: {
    canonicalSessionKey: string;
    canonicalSlug: string;
    targetId: number;
    transfers: WatcherMarketPromotionTransfer[];
    marketById: Map<number, WatcherPromotionMutableMarket>;
    parentMarketId?: number | null;
  }
) {
  const target = input.marketById.get(input.targetId);
  if (!target) {
    throw new Error(`Watcher identity promotion target #${input.targetId} disappeared.`);
  }
  const sourceRows = input.transfers
    .map((transfer) => input.marketById.get(transfer.sourceId))
    .filter(
      (market): market is WatcherPromotionMutableMarket => Boolean(market)
    );
  const familyRows = [target, ...sourceRows];
  const targetOriginalSlug = target.slug;
  const targetOriginalSessionKey = target.linkedSessionKey;
  const canonicalSlugSource = sourceRows.find(
    (source) => source.slug === input.canonicalSlug
  );
  const now = new Date();

  if (target.slug !== input.canonicalSlug && canonicalSlugSource) {
    await tx.betMarket.update({
      where: { id: canonicalSlugSource.id },
      data: { slug: `identity-promotion-temp-${canonicalSlugSource.id}` },
    });
  }

  await tx.betMarket.update({
    where: { id: target.id },
    data: {
      slug: input.canonicalSlug,
      linkedSessionKey: input.canonicalSessionKey,
      parentMarketId: input.parentMarketId ?? target.parentMarketId,
      firstStakeAcceptedAt: earliestPromotionDate(
        familyRows.map((market) => market.firstStakeAcceptedAt)
      ),
      rosterLockedAt: earliestPromotionDate(
        familyRows.map((market) => market.rosterLockedAt)
      ),
      bettingLockedAt: earliestPromotionDate(
        familyRows.map((market) => market.bettingLockedAt)
      ),
    },
  });

  for (const source of sourceRows) {
    const reservesTargetAlias =
      targetOriginalSlug !== input.canonicalSlug &&
      source.id === canonicalSlugSource?.id;
    await tx.betMarket.update({
      where: { id: source.id },
      data: {
        slug: reservesTargetAlias ? targetOriginalSlug : source.slug,
        linkedSessionKey: reservesTargetAlias
          ? targetOriginalSessionKey
          : source.linkedSessionKey,
        parentMarketId: null,
        status: "voided",
        featured: false,
        closeAt: null,
        proofDeadlineAt: null,
        settledAt: now,
        voidedAt: now,
        winnerSide: null,
        refundStatus: null,
        resolutionReason: "merged_into_platform_market",
        commissionerReviewState: null,
        underReviewAt: null,
        firstStakeAcceptedAt: null,
        rosterLockedAt: null,
        bettingLockedAt: null,
      },
    });
  }

  if (
    targetOriginalSlug !== input.canonicalSlug &&
    !canonicalSlugSource
  ) {
    await tx.betMarket.create({
      data: {
        battleId: target.battleId,
        scheduledMatchId: null,
        linkedSessionKey: targetOriginalSessionKey,
        slug: targetOriginalSlug,
        title: target.title,
        eventLabel: target.eventLabel,
        marketType: target.marketType,
        status: "voided",
        featured: false,
        sortOrder: target.sortOrder,
        leftLabel: target.leftLabel,
        rightLabel: target.rightLabel,
        leftHref: target.leftHref,
        rightHref: target.rightHref,
        seedLeftWolo: target.seedLeftWolo,
        seedRightWolo: target.seedRightWolo,
        settledAt: now,
        voidedAt: now,
        winnerSide: null,
        refundStatus: null,
        resolutionReason: "merged_into_platform_market",
        propositionHash: target.propositionHash,
        integrityStatus: "verified",
        integrityReason: null,
      },
    });
  }
}

async function assertWatcherPromotionSourcesDrained(
  tx: Prisma.TransactionClient,
  sourceIds: number[]
) {
  if (sourceIds.length === 0) return;
  const [
    wagers,
    wallets,
    intents,
    legs,
    bonuses,
    claims,
    winnerExecutions,
    desyncExecutions,
  ] = await Promise.all([
    tx.betWager.count({ where: { marketId: { in: sourceIds } } }),
    tx.betMarketWallet.count({ where: { marketId: { in: sourceIds } } }),
    tx.betStakeIntent.count({ where: { marketId: { in: sourceIds } } }),
    tx.betStakeLeg.count({ where: { marketId: { in: sourceIds } } }),
    tx.betMarketFounderBonus.count({ where: { marketId: { in: sourceIds } } }),
    tx.pendingWoloClaim.count({ where: { sourceMarketId: { in: sourceIds } } }),
    tx.betAutoExecution.count({ where: { winnerMarketId: { in: sourceIds } } }),
    tx.betAutoExecution.count({ where: { desyncMarketId: { in: sourceIds } } }),
  ]);
  if (
    wagers ||
    wallets ||
    intents ||
    legs ||
    bonuses ||
    claims ||
    winnerExecutions ||
    desyncExecutions
  ) {
    throw new Error(
      `Watcher identity promotion source drain failed for markets ${sourceIds.join(",")}.`
    );
  }
}

export async function reconcileWatcherMarketIdentityPromotions(
  prisma: PrismaClient,
  seeds: MarketSeed[]
) {
  const blockedSessionKeys = new Set<string>();
  const families = watcherMarketPromotionSeedFamilies(seeds);

  for (const family of families) {
    const blocked = await prisma.$transaction(async (tx) => {
      const exactSessionKeys = [
        ...new Set([family.canonicalSessionKey, ...family.aliases]),
      ];
      const exactSessionKeySet = new Set(exactSessionKeys);
      const identityKeys = watcherPromotionIdentityKeys(
        family.canonicalSessionKey,
        family.aliases
      );
      for (const identityKey of identityKeys) {
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${identityKey}, 0))`
        );
      }

      const aliasWinnerSlugs = family.aliases.map(
        buildWatcherMarketSlugForSessionKey
      );
      const candidateSlugs = [
        family.winnerSeed.slug,
        family.canonicalDesyncSlug,
        ...aliasWinnerSlugs,
        ...aliasWinnerSlugs.map(buildDesyncSideMarketSlug),
      ];
      const initialMarkets = await tx.betMarket.findMany({
        where: {
          marketType: { in: [WINNER_MARKET_TYPE, DESYNC_SIDE_MARKET_TYPE] },
          OR: [
            {
              scheduledMatchId: null,
              linkedSessionKey: { in: exactSessionKeys },
            },
            { slug: { in: candidateSlugs } },
          ],
        },
        select: { id: true },
      });
      const marketIds = initialMarkets
        .map((market) => market.id)
        .sort((left, right) => left - right);
      if (marketIds.length > 0) {
        const locked = await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
          SELECT "id"
          FROM "bet_markets"
          WHERE "id" IN (${Prisma.join(marketIds)})
          ORDER BY "id"
          FOR UPDATE
        `);
        if (locked.length !== marketIds.length) {
          throw new Error("Watcher identity promotion market lock set changed.");
        }
      }

      const markets = marketIds.length > 0
        ? await tx.betMarket.findMany({
            where: { id: { in: marketIds } },
            select: {
              id: true,
              battleId: true,
              parentMarketId: true,
              scheduledMatchId: true,
              linkedSessionKey: true,
              slug: true,
              title: true,
              eventLabel: true,
              marketType: true,
              status: true,
              sortOrder: true,
              resolutionReason: true,
              leftLabel: true,
              rightLabel: true,
              leftHref: true,
              rightHref: true,
              seedLeftWolo: true,
              seedRightWolo: true,
              propositionHash: true,
              createdAt: true,
              firstStakeAcceptedAt: true,
              rosterLockedAt: true,
              bettingLockedAt: true,
              voidedAt: true,
              refundStatus: true,
              settlementRunId: true,
              settlementStatus: true,
              settlementAttemptedAt: true,
              settlementExecutedAt: true,
              walletLocks: {
                select: { id: true, walletAddress: true, side: true },
              },
              wagers: {
                select: { id: true, userId: true, side: true },
              },
              stakeIntents: {
                select: {
                  id: true,
                  userId: true,
                  status: true,
                  propositionHash: true,
                  side: true,
                },
              },
              stakeTicketLegs: {
                select: {
                  id: true,
                  ticketId: true,
                  ticket: { select: { userId: true } },
                  propositionHash: true,
                  side: true,
                },
              },
              founderBonuses: { select: { id: true } },
              integrityIncidents: {
                where: { status: "open" },
                select: { id: true },
              },
            },
          })
        : [];
      const unrelatedSlugMarket = markets.find(
        (market) =>
          market.scheduledMatchId !== null ||
          !exactSessionKeySet.has(normalizeName(market.linkedSessionKey))
      );

      const [pendingClaims, autoExecutions] = await Promise.all([
        marketIds.length > 0
          ? tx.pendingWoloClaim.findMany({
              where: { sourceMarketId: { in: marketIds } },
              select: {
                id: true,
                sourceMarketId: true,
                normalizedPlayerName: true,
                claimKind: true,
                claimGroupKey: true,
              },
            })
          : Promise.resolve([]),
        tx.betAutoExecution.findMany({
          where: {
            OR: [
              ...(marketIds.length > 0
                ? [
                    { winnerMarketId: { in: marketIds } },
                    { desyncMarketId: { in: marketIds } },
                  ]
                : []),
              { sessionKey: { in: exactSessionKeys } },
              {
                gameIdentityKey: {
                  in: [...new Set([...exactSessionKeys, ...identityKeys])],
                },
              },
            ],
          },
          select: {
            id: true,
            presetId: true,
            winnerMarketId: true,
            desyncMarketId: true,
            sessionKey: true,
            gameIdentityKey: true,
            propositionHash: true,
          },
        }),
      ]);
      const claimByMarketId = new Map<number, typeof pendingClaims>();
      for (const claim of pendingClaims) {
        if (!claim.sourceMarketId) continue;
        const claims = claimByMarketId.get(claim.sourceMarketId) ?? [];
        claims.push(claim);
        claimByMarketId.set(claim.sourceMarketId, claims);
      }
      const autoCountByMarketId = new Map<number, number>();
      for (const execution of autoExecutions) {
        autoCountByMarketId.set(
          execution.winnerMarketId,
          (autoCountByMarketId.get(execution.winnerMarketId) ?? 0) + 1
        );
        if (execution.desyncMarketId) {
          autoCountByMarketId.set(
            execution.desyncMarketId,
            (autoCountByMarketId.get(execution.desyncMarketId) ?? 0) + 1
          );
        }
      }
      const snapshots: WatcherMarketPromotionSnapshot[] = markets.map(
        (market) => ({
          id: market.id,
          parentMarketId: market.parentMarketId,
          slug: market.slug,
          linkedSessionKey: market.linkedSessionKey,
          marketType: market.marketType,
          status: market.status,
          resolutionReason: market.resolutionReason,
          leftLabel: market.leftLabel,
          rightLabel: market.rightLabel,
          propositionHash: market.propositionHash,
          createdAt: market.createdAt,
          firstStakeAcceptedAt: market.firstStakeAcceptedAt,
          voidedAt: market.voidedAt,
          refundStatus: market.refundStatus,
          settlementRunId: market.settlementRunId,
          settlementStatus: market.settlementStatus,
          settlementAttemptedAt: market.settlementAttemptedAt,
          settlementExecutedAt: market.settlementExecutedAt,
          openIntegrityIncidentCount: market.integrityIncidents.length,
          wagerCount: market.wagers.length,
          founderBonusCount: market.founderBonuses.length,
          autoExecutionCount: autoCountByMarketId.get(market.id) ?? 0,
          walletLocks: market.walletLocks,
          wagers: market.wagers,
          stakeIntents: market.stakeIntents,
          stakeTicketLegs: market.stakeTicketLegs.map((leg) => ({
            id: leg.id,
            ticketId: leg.ticketId,
            userId: leg.ticket.userId,
            propositionHash: leg.propositionHash,
            side: leg.side,
          })),
          pendingClaims: (claimByMarketId.get(market.id) ?? []).map((claim) => ({
            id: claim.id,
            normalizedPlayerName: claim.normalizedPlayerName,
            claimKind: claim.claimKind,
            claimGroupKey: claim.claimGroupKey,
          })),
        })
      );

      let blockReason = unrelatedSlugMarket
        ? "canonical_or_alias_slug_owned_by_unrelated_session"
        : null;
      const autoByPreset = new Map<number, number>();
      for (const execution of autoExecutions) {
        const referencesExactMarket =
          marketIds.includes(execution.winnerMarketId) ||
          (execution.desyncMarketId
            ? marketIds.includes(execution.desyncMarketId)
            : false);
        if (!referencesExactMarket) {
          blockReason = "auto_execution_identity_collision";
          break;
        }
        if (execution.propositionHash !== family.winnerSeed.propositionHash) {
          blockReason = "auto_execution_proposition_mismatch";
          break;
        }
        autoByPreset.set(
          execution.presetId,
          (autoByPreset.get(execution.presetId) ?? 0) + 1
        );
        if ((autoByPreset.get(execution.presetId) ?? 0) > 1) {
          blockReason = "auto_execution_preset_collision";
          break;
        }
      }

      const plan = blockReason
        ? ({ kind: "blocked", reason: blockReason } as const)
        : planWatcherMarketIdentityPromotion({
            canonicalWinnerSlug: family.winnerSeed.slug,
            canonicalDesyncSlug: family.canonicalDesyncSlug,
            canonicalPropositionHash: family.winnerSeed.propositionHash ?? "",
            markets: snapshots,
          });

      const platformMatchId = platformMatchIdFromBattleSession(
        family.canonicalSessionKey
      );
      const marketBattleIds = [
        ...new Set(
          markets
            .map((market) => market.battleId)
            .filter((battleId): battleId is number => typeof battleId === "number")
        ),
      ];
      const battleIdentities = identityKeys.length > 0
        ? await tx.battleIdentity.findMany({
            where: {
              OR: [
                { identityKey: { in: identityKeys } },
                ...(marketBattleIds.length > 0
                  ? [{ id: { in: marketBattleIds } }]
                  : []),
                ...(platformMatchId
                  ? [{ platformMatchId }]
                  : []),
              ],
            },
            orderBy: [{ publicNumber: "asc" }, { id: "asc" }],
          })
        : [];
      if (battleIdentities.length > 0) {
        const identityIds = battleIdentities.map((identity) => identity.id);
        await tx.$queryRaw<Array<{ id: number }>>(Prisma.sql`
          SELECT "id"
          FROM "battle_identities"
          WHERE "id" IN (${Prisma.join(identityIds)})
          ORDER BY "id"
          FOR UPDATE
        `);
        const identityMarkets = await tx.betMarket.findMany({
          where: { battleId: { in: identityIds } },
          select: { id: true, linkedSessionKey: true },
        });
        if (
          identityMarkets.some(
            (market) =>
              !exactSessionKeySet.has(normalizeName(market.linkedSessionKey))
          ) ||
          battleIdentities.some(
            (identity) =>
              (
                !identityKeys.includes(identity.identityKey) &&
                identity.platformMatchId !== platformMatchId
              ) ||
              (
                Boolean(identity.platformMatchId) &&
                identity.platformMatchId !== platformMatchId
              )
          )
        ) {
          blockReason = "battle_identity_referenced_by_unrelated_family";
        }
        const prospectiveSurvivor = battleIdentities[0];
        if (
          prospectiveSurvivor?.state === "completed" &&
          family.winnerSeed.status !== "settled"
        ) {
          blockReason = "battle_identity_is_terminal";
        }
      }

      if (plan.kind === "blocked" || blockReason) {
        await markWatcherIdentityPromotionBlocked(tx, {
          markets: markets.filter((market) =>
            exactSessionKeySet.has(normalizeName(market.linkedSessionKey))
          ),
          canonicalSessionKey: family.canonicalSessionKey,
          aliases: family.aliases,
          reason: blockReason ?? (plan.kind === "blocked" ? plan.reason : "unknown"),
        });
        return true;
      }

      if (plan.kind === "promote") {
        const snapshotById = new Map(
          snapshots.map((snapshot) => [snapshot.id, snapshot] as const)
        );
        for (const transfer of [
          ...plan.winnerTransfers,
          ...plan.desyncTransfers,
        ]) {
          const source = snapshotById.get(transfer.sourceId);
          if (!source) {
            throw new Error(
              `Watcher identity promotion source #${transfer.sourceId} disappeared.`
            );
          }
          await applyWatcherPromotionTransfer(tx, transfer, source);
        }

        const winnerSourceToTarget = new Map(
          plan.winnerTransfers.map((transfer) => [
            transfer.sourceId,
            transfer.targetId,
          ])
        );
        const desyncSourceToTarget = new Map(
          plan.desyncTransfers.map((transfer) => [
            transfer.sourceId,
            transfer.targetId,
          ])
        );
        for (const execution of autoExecutions) {
          await tx.betAutoExecution.update({
            where: { id: execution.id },
            data: {
              winnerMarketId:
                winnerSourceToTarget.get(execution.winnerMarketId) ??
                execution.winnerMarketId,
              desyncMarketId: execution.desyncMarketId
                ? desyncSourceToTarget.get(execution.desyncMarketId) ??
                  execution.desyncMarketId
                : null,
              sessionKey: family.canonicalSessionKey,
              gameIdentityKey: family.canonicalSessionKey,
            },
          });
        }

        if (plan.affectedTicketIds.length > 0) {
          const tickets = await tx.betStakeTicket.findMany({
            where: { id: { in: plan.affectedTicketIds } },
            select: {
              id: true,
              legs: {
                select: {
                  marketId: true,
                  legRole: true,
                  side: true,
                  amountWolo: true,
                  propositionHash: true,
                },
              },
            },
          });
          for (const ticket of tickets) {
            await tx.betStakeTicket.update({
              where: { id: ticket.id },
              data: {
                propositionSetHash:
                  canonicalBetStakeTicketPropositionSetHash(ticket.legs),
              },
            });
          }
        }

        const marketById = new Map(
          markets.map((market) => [market.id, market] as const)
        );
        await assertWatcherPromotionSourcesDrained(
          tx,
          [
            ...plan.winnerTransfers,
            ...plan.desyncTransfers,
          ].map((transfer) => transfer.sourceId)
        );
        await canonicalizeWatcherPromotionFamily(tx, {
          canonicalSessionKey: family.canonicalSessionKey,
          canonicalSlug: family.winnerSeed.slug,
          targetId: plan.winnerTargetId,
          transfers: plan.winnerTransfers,
          marketById,
        });
        if (plan.desyncTargetId) {
          await canonicalizeWatcherPromotionFamily(tx, {
            canonicalSessionKey: family.canonicalSessionKey,
            canonicalSlug: family.canonicalDesyncSlug,
            targetId: plan.desyncTargetId,
            transfers: plan.desyncTransfers,
            marketById,
            parentMarketId: plan.winnerTargetId,
          });
        }
      }

      if (battleIdentities.length > 0) {
        const survivor = battleIdentities[0];
        for (const loser of battleIdentities.slice(1)) {
          await tx.battleIdentity.update({
            where: { id: loser.id },
            data: {
              state: "completed",
              platformMatchId: null,
              completedAt: loser.completedAt ?? new Date(),
              lastSeenAt: new Date(),
            },
          });
        }
        await tx.battleIdentity.update({
          where: { id: survivor.id },
          data: {
            platformMatchId,
            state:
              family.winnerSeed.status === "settled"
                ? "completed"
                : family.winnerSeed.status === "awaiting_final_proof"
                  ? "awaiting_final_proof"
                  : "live",
            completedAt:
              family.winnerSeed.status === "settled"
                ? family.winnerSeed.settledAt ?? new Date()
                : null,
            lastSeenAt: new Date(),
          },
        });
        await tx.betMarket.updateMany({
          where: {
            battleId: {
              in: battleIdentities.map((identity) => identity.id),
            },
          },
          data: { battleId: survivor.id },
        });
        if (plan.kind === "promote") {
          await tx.betMarket.updateMany({
            where: {
              id: {
                in: [
                  plan.winnerTargetId,
                  ...(plan.desyncTargetId ? [plan.desyncTargetId] : []),
                ],
              },
            },
            data: { battleId: survivor.id },
          });
        }
      }

      return false;
    });
    if (blocked) {
      blockedSessionKeys.add(family.canonicalSessionKey);
    }
  }

  return blockedSessionKeys;
}


async function buildOpenMarketSeeds(prisma: PrismaClient) {
  /*
   * Financial market discovery is a financial projection and must consume the
   * canonical replay/session snapshot directly. loadLiveGamesSnapshotFresh is
   * a presentation surface
   * that intentionally mixes in public/archive fallback outcome rows; those
   * rows may carry statistics-authorized winner truth and must never become a
   * second betting proposition for an already-live watcher battle.
   */
  const sessionSnapshot = await loadLiveSessionSnapshot(prisma);
  const {
    tiles: scheduledMatchTiles,
    matchedActiveSessionKeys,
    matchedCompletedSessionKeys,
  } = await loadScheduledMatchTilesForLiveBoard(
    prisma,
    sessionSnapshot.activeSessions,
    sessionSnapshot.recentlyCompletedSessions
  );
  let seeds: MarketSeed[] = [];
  const seenSlugs = new Set<string>();
  const challengeSeeds = buildChallengeMarketSeeds(scheduledMatchTiles);
  const hasFeaturedChallenge = challengeSeeds.some((seed) => seed.featured);

  challengeSeeds.forEach((seed) => {
    if (seenSlugs.has(seed.slug)) return;
    seenSlugs.add(seed.slug);
    seeds.push(seed);
  });

  sessionSnapshot.activeSessions.forEach((session, index) => {
    if (matchedActiveSessionKeys.has(session.sessionKey)) return;

    // Live watcher games are the actual war-room surface.
    // They must outrank stale scheduled challenge books while the game is live.
    const seed = buildSessionMarketSeed(
      session,
      -300 + index,
      index === 0 || (!hasFeaturedChallenge && seeds.length === 0)
    );

    if (!seed || seenSlugs.has(seed.slug)) return;
    seenSlugs.add(seed.slug);
    seeds.push(seed);
  });

  sessionSnapshot.recentlyCompletedSessions.forEach((session, index) => {
    if (matchedCompletedSessionKeys.has(session.sessionKey)) return;
    const seed = buildSessionMarketSeed(session, 100 + index, false);
    if (!seed || seenSlugs.has(seed.slug)) return;
    seenSlugs.add(seed.slug);
    seeds.push(seed);
  });

  /*
   * Every current live winner proposition gets exactly one
   * independent NO / YES desync sibling.
   */
  const desyncSeeds =
    seeds
      .map(
        buildDesyncSideMarketSeed
      )
      .filter(
        (
          seed
        ): seed is MarketSeed =>
          Boolean(seed)
      );

  for (const seed of desyncSeeds) {
    if (seenSlugs.has(seed.slug)) {
      continue;
    }

    seenSlugs.add(seed.slug);
    seeds.push(seed);
  }

  /*
   * Exact watcher fallback identities must be reconciled before either public
   * battle-number allocation or slug upsert. Otherwise the later platform ID
   * can manufacture a second empty book while stakes remain on the first one.
   * Any ambiguity suppresses the complete winner + Desync seed family and
   * leaves the persisted books in sticky operator review.
   */
  const blockedPromotionSessionKeys =
    await reconcileWatcherMarketIdentityPromotions(prisma, seeds);
  if (blockedPromotionSessionKeys.size > 0) {
    seeds = seeds.filter(
      (seed) =>
        !blockedPromotionSessionKeys.has(
          normalizeName(seed.linkedSessionKey)
        )
    );
  }

  const battleIdentities = await ensurePublicBattleIdentities(
    prisma,
    seeds
      .filter((seed) => Boolean(normalizeName(seed.linkedSessionKey)))
      .map((seed) => ({
        sessionKey: normalizeName(seed.linkedSessionKey),
        state:
          seed.status === "settled"
            ? "completed" as const
            : seed.status === "under_review"
              ? "under_review" as const
              : seed.status === "awaiting_final_proof"
                ? "awaiting_final_proof" as const
                : "live" as const,
        completedAt: seed.settledAt,
        // A public number is born only while a battle is genuinely live. This
        // keeps historical proof/review rows that predate the numbering rail
        // from consuming #2,820+. Once born, the identity may still advance
        // through proof, review, and completion because the resolver updates
        // an existing row even when creation is disabled for those states.
        allowCreate: seed.status === "live",
      }))
  );

  for (const seed of seeds) {
    const identityKey = canonicalBattleIdentityKey(normalizeName(seed.linkedSessionKey));
    seed.battleId = identityKey ? battleIdentities.get(identityKey)?.id ?? null : null;
  }

  /*
   * Visibility alone is not financial reconciliation. An active/completed
   * watcher row may be structurally ineligible and therefore produce no seed.
   * Only a winner seed that survived validation/upsert may protect an existing
   * same-session book from the detached/finality safety pass.
   */
  const reconciledSessionKeys =
    reconciledWinnerMarketSessionKeys(
      seeds
    );

  return {
    seeds,
    reconciledSessionKeys,
  };
}

const BET_MARKET_STATS_LINK_RESOLUTION_CONCURRENCY = 12;

export async function reconcileBetMarketStatsLinks(prisma: PrismaClient) {
  const markets = await prisma.betMarket.findMany({
    where: {
      linkedSessionKey: { not: null },
      linkedGameStatsId: null,
      status: "settled",
      /*
       * Final-evidence linking is a financial prerequisite only while a
       * settled book still has a countable wager to process. Historical and
       * already-linked books are immutable evidence, not a 5-second polling
       * workload. Detached watcher reconciliation owns live/proof states.
       */
      wagers: {
        some: buildCountableActiveWagerWhere(),
      },
    },
    select: {
      linkedSessionKey: true,
    },
  });

  const sessionKeys = [
    ...new Set(
      markets
        .map((market) => market.linkedSessionKey?.trim() ?? "")
        .filter(Boolean)
    ),
  ];

  for (
    let offset = 0;
    offset < sessionKeys.length;
    offset += BET_MARKET_STATS_LINK_RESOLUTION_CONCURRENCY
  ) {
    const batch = sessionKeys.slice(
      offset,
      offset + BET_MARKET_STATS_LINK_RESOLUTION_CONCURRENCY
    );
    const resolved = await Promise.all(
      batch.map(async (sessionKey) => ({
        sessionKey,
        finalGameId: await resolveFinalGameStatsIdForSessionKey(
          prisma,
          sessionKey
        ),
      }))
    );

    await Promise.all(
      resolved.flatMap(({ sessionKey, finalGameId }) =>
        finalGameId
          ? [
              prisma.betMarket.updateMany({
                where: {
                  linkedSessionKey: sessionKey,
                  linkedGameStatsId: null,
                  status: "settled",
                  wagers: {
                    some: buildCountableActiveWagerWhere(),
                  },
                },
                data: {
                  linkedGameStatsId: finalGameId,
                },
              }),
            ]
          : []
      )
    );
  }
}

function loadDetachedWatcherFinalGame(
  prisma: PrismaClient,
  finalGameId: number
) {
  return prisma.gameStats.findUnique({
    where: { id: finalGameId },
    select: {
      id: true,
      replayHash: true,
      winner: true,
      players: true,
      parse_reason: true,
      key_events: true,
      disconnect_detected: true,
      map: true,
      timestamp: true,
      createdAt: true,
      replayResultAdjudications:
        EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
    },
  });
}

export async function reconcileDetachedWatcherMarkets(
  prisma: PrismaClient,
  reconciledSessionKeys: ReadonlySet<string>
) {
  const markets = await prisma.betMarket.findMany({
    where: {
      marketType: WINNER_MARKET_TYPE,
      status: { in: RECONCILABLE_WATCHER_STATUSES },
      scheduledMatchId: null,
      linkedSessionKey: { not: null },
    },
    select: {
      id: true,
      title: true,
      linkedSessionKey: true,
      linkedGameStatsId: true,
      leftLabel: true,
      rightLabel: true,
      propositionHash: true,
      leftRosterSnapshot: true,
      rightRosterSnapshot: true,
      eventLabel: true,
      updatedAt: true,
      closeAt: true,
      status: true,
      integrityReason: true,
      commissionerReviewState: true,
      underReviewAt: true,
      proofDeadlineAt: true,
      resolutionReason: true,
      createdAt: true,
    },
  });

  if (markets.length === 0) {
    return;
  }

  const finalGameIdBySessionKey = new Map<string, number | null>();
  const finalGameById = new Map<
    number,
    Awaited<ReturnType<typeof loadDetachedWatcherFinalGame>>
  >();

  for (const market of markets) {
    const sessionKey = normalizeName(market.linkedSessionKey);
    if (
      !watcherMarketNeedsDetachedReconciliation({
        normalizedSessionKey:
          sessionKey,
        marketStatus:
          market.status,
        reconciledSessionKeys,
      })
    ) {
      continue;
    }

    if (!finalGameIdBySessionKey.has(sessionKey)) {
      finalGameIdBySessionKey.set(
        sessionKey,
        await resolveFinalGameStatsIdForSessionKey(prisma, sessionKey)
      );
    }

    const finalGameId = finalGameIdBySessionKey.get(sessionKey) ?? null;
    if (finalGameId && !finalGameById.has(finalGameId)) {
      finalGameById.set(
        finalGameId,
        await loadDetachedWatcherFinalGame(
          prisma,
          finalGameId
        )
      );
    }
  }

  await Promise.all(
    markets.map(async (market) => {
      const sessionKey = normalizeName(market.linkedSessionKey);
      if (
        !watcherMarketNeedsDetachedReconciliation({
          normalizedSessionKey:
            sessionKey,
          marketStatus:
            market.status,
          reconciledSessionKeys,
        })
      ) {
        return;
      }

      const finalGameId = finalGameIdBySessionKey.get(sessionKey) ?? null;
      const rawFinalGame =
        finalGameId
          ? finalGameById.get(finalGameId) ?? null
          : null;
      const finalGame =
        rawFinalGame
          ? applyBettingAuthorizedReplayAdjudication(
              rawFinalGame
            )
          : null;
      const autoRecoverableReview =
        canAutoRecoverWatcherIntegrityReview(market);

      if (
        market.status === "under_review" &&
        !autoRecoverableReview
      ) {
        return;
      }

      /*
       * A watcher session disappearing from one projection is not final
       * result proof. The watcher may be rotating from one physical live
       * parse row to another while retaining the stable session identity.
       *
       * First miss:
       *   - keep the market in the primary/open board
       *   - change it to closing so new WOLO cannot enter
       *   - preserve every existing wager and founder bonus
       *
       * Continuous miss beyond the bounded grace:
       *   - move into the existing awaiting-final-proof rail
       */
      if (!finalGame) {
        const snapshotGapObservedAt =
          new Date();

        if (market.status === "live") {
          const held =
            await prisma.betMarket.updateMany({
              where: {
                id: market.id,
                status: "live",
                voidedAt: null,
              },
              data: {
                status: "closing",
                closeAt:
                  snapshotGapObservedAt,
                proofDeadlineAt: null,
                resolutionReason:
                  "live_snapshot_revalidating",
                settledAt: null,
                winnerSide: null,
              },
            });

          if (held.count === 1) {
            console.warn(
              `Holding live market #${market.id} during a transient watcher snapshot gap.`
            );
          }

          return;
        }

        const snapshotGapStartedAt =
          market.closeAt ??
          market.updatedAt;

        const withinSnapshotGrace =
          market.status === "closing" &&
          market.resolutionReason ===
            "live_snapshot_revalidating" &&
          snapshotGapObservedAt.getTime() -
            snapshotGapStartedAt.getTime() <
            WATCHER_LIVE_SNAPSHOT_GRACE_SECONDS *
              1000;

        if (withinSnapshotGrace) {
          return;
        }

        const moved = await prisma.betMarket.updateMany({
          where: {
            id: market.id,
            status: {
              in: [
                "open",
                "closing",
                "live",
                "awaiting_final_proof",
                "under_review",
              ],
            },
            voidedAt: null,
          },
          data: {
            status: "awaiting_final_proof",
            featured: false,
            closeAt: snapshotGapObservedAt,
            proofDeadlineAt:
              watcherFinalProofDeadlineForTransition(
                market,
                snapshotGapObservedAt
              ),
            resolutionReason: "final_replay_pending",
            settledAt: null,
            winnerSide: null,
            integrityStatus: "verified",
            integrityReason: null,
            commissionerReviewState: null,
            underReviewAt: null,
          },
        });

        if (
          moved.count === 1 &&
          market.status === "under_review"
        ) {
          await resolveAutomatedWatcherIntegrityIncident(
            prisma,
            market.id
          );
        }

        return;
      }

      const integrity = evaluateFinalMarketIntegrity(
        market,
        finalGame
      );
      if (!integrity.ok || !integrity.winningSide) {
        const failureDisposition =
          classifyWatcherFinalFailure(integrity.reasonCodes);
        if (failureDisposition === "integrity_review") {
          await markMarketUnderIntegrityReview(prisma, {
            marketId: market.id,
            title: market.title,
            leftLabel: market.leftLabel,
            rightLabel: market.rightLabel,
            priorStatus: market.status,
            reason: integrity.reasonCodes.join(",") || "settlement_integrity_blocked",
            linkedGameStatsId: finalGame.id,
          });
          return;
        }
        const disconnectEvidence = Boolean(
          finalGame.disconnect_detected ||
          (finalGame.key_events &&
            typeof finalGame.key_events === "object" &&
            !Array.isArray(finalGame.key_events) &&
            (finalGame.key_events as Record<string, unknown>).disconnect_detected) ||
          String(finalGame.parse_reason || "").toLowerCase().includes("disconnect") ||
            String(finalGame.parse_reason || "").toLowerCase().includes("desync")
        );
        const proofObservedAt = new Date();
        const moved = await prisma.betMarket.updateMany({
          where: {
            id: market.id,
            status: {
              in: [
                "open",
                "closing",
                "live",
                "awaiting_final_proof",
                "under_review",
              ],
            },
            voidedAt: null,
          },
          data: {
            status: "awaiting_final_proof",
            featured: false,
            closeAt: proofObservedAt,
            proofDeadlineAt:
              watcherFinalProofDeadlineForTransition(
                market,
                proofObservedAt
              ),
            resolutionReason: disconnectEvidence
              ? "explicit_desync_without_safe_winner"
              : "final_result_not_betting_eligible",
            linkedGameStatsId: finalGame.id,
            winnerSide: null,
            settledAt: null,
            integrityStatus: "verified",
            integrityReason: null,
            commissionerReviewState: null,
            underReviewAt: null,
          },
        });
        if (
          moved.count === 1 &&
          market.status === "under_review"
        ) {
          await resolveAutomatedWatcherIntegrityIncident(
            prisma,
            market.id
          );
        }
        return;
      }
      const winnerSide = integrity.winningSide;
      const settledAt =
        finalGame.timestamp ??
        finalGame.createdAt ??
        market.updatedAt ??
        new Date();
      const mapName = readMapName(finalGame.map);

      const settled = await prisma.betMarket.updateMany({
        where: {
          id: market.id,
          status: {
            in: RECONCILABLE_WATCHER_STATUSES,
          },
          voidedAt: null,
        },
        data: {
          status: "settled",
          featured: false,
          closeAt: null,
          settledAt,
          winnerSide,
          proofDeadlineAt: null,
          resolutionReason: "trusted_final_received",
          integrityStatus: "verified",
          integrityReason: null,
          commissionerReviewState: null,
          underReviewAt: null,
          linkedGameStatsId: finalGame?.id ?? market.linkedGameStatsId ?? null,
          eventLabel: buildWatcherEventLabel(
            "Final",
            mapName &&
              mapName !== "Unknown Map" &&
              mapName !== "Map unresolved"
              ? mapName
              : market.eventLabel.includes("•")
                ? market.eventLabel.split("•").slice(1).join("•").trim() || null
                : null
          ),
        },
      });

      if (
        settled.count === 1 &&
        market.status === "under_review"
      ) {
        await resolveAutomatedWatcherIntegrityIncident(
          prisma,
          market.id
        );
      }
    })
  );
}

async function reconcileChallengeSessionShadowMarkets(
  prisma: PrismaClient,
  seeds: MarketSeed[]
) {
  const ticketMarketGuard = buildBetStakeTicketMarketGuardWhere();
  const challengeSessionKeys = [
    ...new Set(
      seeds
        .filter((seed) => seed.source === "challenge")
        .map((seed) => normalizeName(seed.linkedSessionKey))
        .filter(Boolean)
    ),
  ];

  if (challengeSessionKeys.length === 0) {
    return;
  }

  const markets = await prisma.betMarket.findMany({
    where: {
      linkedSessionKey: {
        in: challengeSessionKeys,
      },
    },
    select: {
      id: true,
      parentMarketId: true,
      scheduledMatchId: true,
      linkedSessionKey: true,
      slug: true,
      marketType: true,
      status: true,
      leftLabel: true,
      rightLabel: true,
      propositionHash: true,
    },
  });

  const canonicalBySessionKey = new Map<string, (typeof markets)[number]>();
  for (const market of markets) {
    const sessionKey = normalizeName(market.linkedSessionKey);
    if (
      !sessionKey ||
      typeof market.scheduledMatchId !== "number" ||
      !OPEN_STATUSES.includes(market.status as BetStatus)
    ) {
      continue;
    }

    const existing = canonicalBySessionKey.get(sessionKey);
    if (!existing || market.id < existing.id) {
      canonicalBySessionKey.set(sessionKey, market);
    }
  }

  const shadowMarkets = markets.filter((market) => {
    const sessionKey = normalizeName(market.linkedSessionKey);
    const canonical = sessionKey ? canonicalBySessionKey.get(sessionKey) : null;
    return Boolean(
      canonical &&
        canonical.id !== market.id &&
        market.scheduledMatchId === null &&
        market.marketType === WINNER_MARKET_TYPE &&
        market.slug.startsWith(WATCHER_MARKET_SLUG_PREFIX) &&
        OPEN_STATUSES.includes(market.status as BetStatus)
    );
  });

  for (const shadow of shadowMarkets) {
    const sessionKey = normalizeName(shadow.linkedSessionKey);
    const canonical = sessionKey ? canonicalBySessionKey.get(sessionKey) : null;
    if (!canonical) {
      continue;
    }

    const sideTransfer = resolveMarketSideTransfer(shadow, canonical);
    if (!sideTransfer) {
      console.warn(
        `Skipped watcher market #${shadow.id} merge into challenge market #${canonical.id}: side labels do not match.`
      );
      continue;
    }

    const shadowDesyncMarkets = markets.filter(
      (market) =>
        market.parentMarketId === shadow.id &&
        market.marketType === DESYNC_SIDE_MARKET_TYPE &&
        OPEN_STATUSES.includes(market.status as BetStatus)
    );
    const canonicalDesyncMarkets = markets.filter(
      (market) =>
        market.parentMarketId === canonical.id &&
        market.marketType === DESYNC_SIDE_MARKET_TYPE &&
        OPEN_STATUSES.includes(market.status as BetStatus)
    );
    if (
      shadowDesyncMarkets.length > 1 ||
      canonicalDesyncMarkets.length > 1 ||
      (shadowDesyncMarkets.length === 1 && canonicalDesyncMarkets.length !== 1)
    ) {
      console.warn(
        `Skipped watcher market #${shadow.id} merge into challenge market #${canonical.id}: companion Desync market is ambiguous or missing.`
      );
      continue;
    }

    const marketPairs = [
      {
        source: shadow,
        target: canonical,
        sideTransfer,
      },
    ];
    if (shadowDesyncMarkets.length === 1) {
      const shadowDesync = shadowDesyncMarkets[0];
      const canonicalDesync = canonicalDesyncMarkets[0];
      const desyncSideTransfer = resolveMarketSideTransfer(
        shadowDesync,
        canonicalDesync
      );
      if (!desyncSideTransfer) {
        console.warn(
          `Skipped watcher market #${shadow.id} merge into challenge market #${canonical.id}: Desync side labels do not match.`
        );
        continue;
      }
      marketPairs.push({
        source: shadowDesync,
        target: canonicalDesync,
        sideTransfer: desyncSideTransfer,
      });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const affectedTicketIds = new Set<number>();

        for (const pair of marketPairs) {
          const [sourceWallets, targetWallets, ticketLegs, recoverableIntents] =
            await Promise.all([
              tx.betMarketWallet.findMany({
                where: { marketId: pair.source.id },
                select: {
                  id: true,
                  walletAddress: true,
                  side: true,
                },
              }),
              tx.betMarketWallet.findMany({
                where: { marketId: pair.target.id },
                select: {
                  walletAddress: true,
                },
              }),
              tx.betStakeLeg.findMany({
                where: { marketId: pair.source.id },
                select: {
                  id: true,
                  ticketId: true,
                  side: true,
                  propositionHash: true,
                },
              }),
              tx.betStakeIntent.findMany({
                where: {
                  marketId: pair.source.id,
                  status: {
                    in: [...BET_STAKE_INTENT_RECOVERABLE_STATUSES],
                  },
                },
                select: { propositionHash: true },
              }),
            ]);

          const pairTicketIds = [
            ...new Set(ticketLegs.map((leg) => leg.ticketId)),
          ].sort((left, right) => left - right);
          for (const ticketId of pairTicketIds) {
            await acquireBetStakeTicketLock(tx, ticketId);
          }

          const incompatibleTicketLeg = ticketLegs.find(
            (leg) =>
              !pair.target.propositionHash ||
              leg.propositionHash !== pair.target.propositionHash
          );
          const incompatibleIntent = recoverableIntents.find(
            (intent) =>
              !pair.target.propositionHash ||
              intent.propositionHash !== pair.target.propositionHash
          );
          if (incompatibleTicketLeg || incompatibleIntent) {
            throw new Error(
              `Cannot merge market #${pair.source.id}: a pending stake freezes a different proposition than target #${pair.target.id}.`
            );
          }

          const targetWalletKeys = new Set(
            targetWallets.map((wallet) => marketSideKey(wallet.walletAddress))
          );
          for (const wallet of sourceWallets) {
            const walletKey = marketSideKey(wallet.walletAddress);
            if (targetWalletKeys.has(walletKey)) {
              await tx.betMarketWallet.delete({
                where: { id: wallet.id },
              });
              continue;
            }

            await tx.betMarketWallet.update({
              where: { id: wallet.id },
              data: {
                marketId: pair.target.id,
                side:
                  wallet.side === "right"
                    ? pair.sideTransfer.right
                    : pair.sideTransfer.left,
              },
            });
          }

          for (const leg of ticketLegs) {
            await tx.betStakeLeg.update({
              where: { id: leg.id },
              data: {
                marketId: pair.target.id,
                side:
                  leg.side === "right"
                    ? pair.sideTransfer.right
                    : pair.sideTransfer.left,
              },
            });
            affectedTicketIds.add(leg.ticketId);
          }

          await Promise.all([
            tx.betWager.updateMany({
              where: { marketId: pair.source.id, side: "left" },
              data: { marketId: pair.target.id, side: pair.sideTransfer.left },
            }),
            tx.betWager.updateMany({
              where: { marketId: pair.source.id, side: "right" },
              data: { marketId: pair.target.id, side: pair.sideTransfer.right },
            }),
            tx.betStakeIntent.updateMany({
              where: { marketId: pair.source.id, side: "left" },
              data: { marketId: pair.target.id, side: pair.sideTransfer.left },
            }),
            tx.betStakeIntent.updateMany({
              where: { marketId: pair.source.id, side: "right" },
              data: { marketId: pair.target.id, side: pair.sideTransfer.right },
            }),
            tx.betMarketFounderBonus.updateMany({
              where: { marketId: pair.source.id },
              data: { marketId: pair.target.id },
            }),
            tx.pendingWoloClaim.updateMany({
              where: { sourceMarketId: pair.source.id },
              data: { sourceMarketId: pair.target.id },
            }),
          ]);
        }

        if (affectedTicketIds.size > 0) {
          const affectedTickets = await tx.betStakeTicket.findMany({
            where: { id: { in: [...affectedTicketIds] } },
            select: {
              id: true,
              legs: {
                select: {
                  marketId: true,
                  legRole: true,
                  side: true,
                  amountWolo: true,
                  propositionHash: true,
                },
              },
            },
          });
          for (const ticket of affectedTickets) {
            await tx.betStakeTicket.update({
              where: { id: ticket.id },
              data: {
                propositionSetHash:
                  canonicalBetStakeTicketPropositionSetHash(ticket.legs),
              },
            });
          }
        }

        const mergedAt = new Date();
        for (const pair of marketPairs) {
          const terminalized = await tx.betMarket.updateMany({
            where: {
              id: pair.source.id,
              status: { in: OPEN_STATUSES },
              wagers: { none: { status: "active" } },
              stakeIntents: {
                none: {
                  status: {
                    in: [...BET_STAKE_INTENT_RECOVERABLE_STATUSES],
                  },
                },
              },
              stakeTicketLegs: {
                none: {
                  ticket: { is: ticketMarketGuard },
                },
              },
            },
            data: {
              status: "settled",
              featured: false,
              closeAt: null,
              settledAt: mergedAt,
              winnerSide: null,
              resolutionReason: "merged_into_challenge_market",
            },
          });
          if (terminalized.count !== 1) {
            throw new Error(
              `Watcher market #${pair.source.id} received new financial state during challenge merge.`
            );
          }
        }
      });
    } catch (error) {
      console.warn(
        `Failed to merge watcher market #${shadow.id} into challenge market #${canonical.id}:`,
        error
      );
    }
  }
}

async function findWinnerMarketForDesyncSideMarket(
  prisma: PrismaClient | Prisma.TransactionClient,
  market: {
    slug: string;
    linkedSessionKey: string | null;
    parentMarketId?: number | null;
  }
) {
  const parentSelect = {
    id: true,
    slug: true,
    marketType: true,
    scheduledMatchId: true,
    linkedSessionKey: true,
    linkedGameStatsId: true,
    status: true,
    winnerSide: true,
    settledAt: true,
    proofDeadlineAt: true,
  } as const;

  if (
    typeof market.parentMarketId === "number"
  ) {
    const explicitParent =
      await prisma.betMarket.findUnique({
        where: {
          id: market.parentMarketId,
        },
        select: parentSelect,
      });

    if (
      explicitParent?.marketType ===
      WINNER_MARKET_TYPE
    ) {
      return explicitParent;
    }
  }

  const sessionKey =
    normalizeName(
      market.linkedSessionKey
    );

  if (sessionKey) {
    const scheduledCanonical =
      await prisma.betMarket.findFirst({
        where: {
          marketType:
            WINNER_MARKET_TYPE,

          linkedSessionKey:
            sessionKey,

          scheduledMatchId: {
            not:
              null,
          },
        },

        orderBy: {
          id:
            "asc",
        },

        select:
          parentSelect,
      });

    if (scheduledCanonical) {
      return scheduledCanonical;
    }
  }

  const winnerSlug =
    winnerSlugFromDesyncSideMarketSlug(
      market.slug
    );

  if (winnerSlug) {
    const exact =
      await prisma.betMarket.findUnique({
        where: {
          slug:
            winnerSlug,
        },

        select:
          parentSelect,
      });

    if (
      exact?.marketType ===
      WINNER_MARKET_TYPE
    ) {
      return exact;
    }
  }

  if (!sessionKey) {
    return null;
  }

  return prisma.betMarket.findFirst({
    where: {
      marketType:
        WINNER_MARKET_TYPE,

      linkedSessionKey:
        sessionKey,
    },

    orderBy: {
      id:
        "asc",
    },

    select:
      parentSelect,
  });
}


async function reconcileDesyncSideMarkets(
  prisma: PrismaClient
) {
  const markets =
    await prisma.betMarket.findMany({
      where: {
        marketType:
          DESYNC_SIDE_MARKET_TYPE,

        status: {
          in: [
            "open",
            "closing",
            "live",
            "awaiting_final_proof",
            "under_review",
          ],
        },
      },

      select: {
        id:
          true,

        parentMarketId:
          true,

        slug:
          true,

        linkedSessionKey:
          true,

        linkedGameStatsId:
          true,

        status:
          true,

        closeAt:
          true,

        proofDeadlineAt:
          true,

        resolutionReason:
          true,
      },
    });

  for (const market of markets) {
    const parent =
      await findWinnerMarketForDesyncSideMarket(
        prisma,
        market
      );

    if (
      parent &&
      market.parentMarketId !==
        parent.id
    ) {
      await prisma.betMarket.updateMany({
        where: {
          id: market.id,
          parentMarketId:
            market.parentMarketId,
        },
        data: {
          parentMarketId:
            parent.id,
        },
      });
    }

    const sessionKey =
      normalizeName(
        market.linkedSessionKey
      );

    let gameStatsId =
      market.linkedGameStatsId ??
      parent?.linkedGameStatsId ??
      null;

    if (
      !gameStatsId &&
      sessionKey
    ) {
      gameStatsId =
        await resolveFinalGameStatsIdForSessionKey(
          prisma,
          sessionKey
        );
    }

    const truth =
      gameStatsId
        ? await loadReplayDesyncIncidentProvenance(
            prisma,
            gameStatsId
          )
        : null;

    const humanDesyncDecisionPresent =
      Boolean(
        truth?.currentDesyncIncident
      );

    const now =
      new Date();

    const winningSide =
      resolveDesyncSideMarketWinner({
        desyncOccurred:
          truth?.desyncOccurred ??
          false,

        humanDesyncDecisionPresent,

        parentStatus:
          parent?.status ??
          null,

        parentWinnerSide:
          parent?.winnerSide ??
          null,

        parentSettledAtMs:
          parent?.settledAt?.getTime() ??
          null,

        nowMs:
          now.getTime(),

        reviewGraceMinutes:
          DESYNC_MARKET_REVIEW_GRACE_MINUTES,
      });

    if (winningSide) {
      await prisma.betMarket.updateMany({
        where: {
          id:
            market.id,

          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
              "under_review",
            ],
          },
        },

        data: {
          status:
            "settled",

          featured:
            false,

          closeAt:
            null,

          settledAt:
            now,

          winnerSide:
            winningSide,

          linkedGameStatsId:
            gameStatsId,

          proofDeadlineAt:
            null,

          commissionerReviewState:
            null,

          resolutionReason:
            winningSide ===
              "right"
              ? "human_confirmed_desync"
              : humanDesyncDecisionPresent
                ? "human_confirmed_no_desync"
                : "review_window_closed_no_desync",
        },
      });

      continue;
    }

    if (
      parent?.status ===
        "settled" &&
      (
        parent.winnerSide ===
          "left" ||
        parent.winnerSide ===
          "right"
      ) &&
      parent.settledAt
    ) {
      const deadline =
        new Date(
          desyncReviewDeadlineMs(
            parent.settledAt.getTime(),
            DESYNC_MARKET_REVIEW_GRACE_MINUTES
          )
        );

      await prisma.betMarket.updateMany({
        where: {
          id:
            market.id,

          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
              "under_review",
            ],
          },
        },

        data: {
          status:
            "closing",

          featured:
            false,

          closeAt:
            deadline,

          proofDeadlineAt:
            deadline,

          linkedGameStatsId:
            gameStatsId,

          winnerSide:
            null,

          commissionerReviewState:
            "desync_review_window",

          resolutionReason:
            "desync_review_window_open",
        },
      });

      continue;
    }

    if (
      parent?.status ===
        "settled" &&
      !parent.winnerSide
    ) {
      await prisma.betMarket.updateMany({
        where: {
          id: market.id,
          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
              "under_review",
            ],
          },
        },
        data: {
          status: "voided",
          featured: false,
          closeAt: null,
          settledAt: now,
          voidedAt: now,
          winnerSide: null,
          linkedGameStatsId: gameStatsId,
          refundStatus: "queued",
          commissionerReviewState: null,
          resolutionReason:
            "desync_parent_terminal_unresolved",
        },
      });

      continue;
    }

    if (
      parent?.status ===
      "awaiting_final_proof"
    ) {
      const alreadyAligned =
        Boolean(parent.proofDeadlineAt) &&
        market.status ===
          "awaiting_final_proof" &&
        market.proofDeadlineAt?.getTime() ===
          parent.proofDeadlineAt?.getTime() &&
        market.linkedGameStatsId ===
          gameStatsId &&
        market.resolutionReason ===
          "desync_final_replay_pending";

      if (alreadyAligned) {
        continue;
      }

      await prisma.betMarket.updateMany({
        where: {
          id:
            market.id,

          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
            ],
          },
        },

        data: {
          status:
            "awaiting_final_proof",

          featured:
            false,

          closeAt:
            market.closeAt ??
            now,

          proofDeadlineAt:
            parent.proofDeadlineAt,

          linkedGameStatsId:
            gameStatsId,

          winnerSide:
            null,

          resolutionReason:
            "desync_final_replay_pending",
        },
      });

      continue;
    }

    if (
      parent?.status ===
      "under_review"
    ) {
      await prisma.betMarket.updateMany({
        where: {
          id:
            market.id,

          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
            ],
          },
        },

        data: {
          status:
            "under_review",

          featured:
            false,

          closeAt:
            now,

          linkedGameStatsId:
            gameStatsId,

          winnerSide:
            null,

          commissionerReviewState:
            "desync_side_market_review",

          resolutionReason:
            "competitive_result_under_review",
        },
      });

      continue;
    }

    if (
      parent?.status ===
      "voided"
    ) {
      await prisma.betMarket.updateMany({
        where: {
          id:
            market.id,

          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
              "under_review",
            ],
          },
        },

        data: {
          status:
            "voided",

          featured:
            false,

          closeAt:
            null,

          settledAt:
            now,

          voidedAt:
            now,

          winnerSide:
            null,

          linkedGameStatsId:
            gameStatsId,

          refundStatus:
            "queued",

          resolutionReason:
            "desync_truth_unprovable",
        },
      });

      continue;
    }

    if (
      !parent &&
      gameStatsId
    ) {
      await prisma.betMarket.updateMany({
        where: {
          id:
            market.id,

          status: {
            in: [
              "open",
              "closing",
              "live",
              "awaiting_final_proof",
            ],
          },
        },

        data: {
          status:
            "under_review",

          featured:
            false,

          closeAt:
            now,

          linkedGameStatsId:
            gameStatsId,

          winnerSide:
            null,

          commissionerReviewState:
            "desync_side_market_review",

          resolutionReason:
            "desync_parent_market_unresolved",
        },
      });
    }
  }
}


async function assertDesyncSideMarketSettlementTruthGate(
  prisma: PrismaClient | Prisma.TransactionClient,
  market: {
    slug: string;
    linkedSessionKey: string | null;
    linkedGameStatsId: number | null;
    parentMarketId?: number | null;
  },
  winningSide: BetSide | null
) {
  if (!winningSide) {
    return;
  }

  if (!market.linkedGameStatsId) {
    throw new Error(
      "Desync side-market payout blocked: final replay evidence is not linked."
    );
  }

  const truth =
    await loadReplayDesyncIncidentProvenance(
      prisma,
      market.linkedGameStatsId
    );
  const parent =
    await findWinnerMarketForDesyncSideMarket(
      prisma,
      market
    );

  const expectedWinner =
    resolveDesyncSideMarketWinner({
      desyncOccurred:
        truth.desyncOccurred,

      humanDesyncDecisionPresent:
        Boolean(
          truth.currentDesyncIncident
        ),

      parentStatus:
        parent?.status ??
        null,

      parentWinnerSide:
        parent?.winnerSide ??
        null,

      parentSettledAtMs:
        parent?.settledAt?.getTime() ??
        null,

      nowMs:
        Date.now(),

      reviewGraceMinutes:
        DESYNC_MARKET_REVIEW_GRACE_MINUTES,
    });

  if (
    expectedWinner !==
    winningSide
  ) {
    throw new Error(
      `Desync side-market payout blocked: current truth expects ${
        expectedWinner ??
        "no settled side"
      }, not ${winningSide}.`
    );
  }
}


async function archiveLowConfidenceZeroPotMarkets(prisma: PrismaClient) {
  const ticketMarketGuard = buildBetStakeTicketMarketGuardWhere();
  const openMarkets = await prisma.betMarket.findMany({
    where: {
      status: { in: OPEN_STATUSES },
    },
    select: {
      id: true,
      title: true,
      eventLabel: true,
      leftLabel: true,
      rightLabel: true,
      seedLeftWolo: true,
      seedRightWolo: true,
      _count: {
        select: {
          wagers: true,
          stakeIntents: true,
          stakeTicketLegs: {
            where: {
              ticket: { is: ticketMarketGuard },
            },
          },
        },
      },
    },
  });

  const safeToArchiveIds = openMarkets
    .filter((market) => !isConfidentBetMarket(market))
    .filter(
      (market) =>
        market._count.wagers === 0 &&
        market._count.stakeIntents === 0 &&
        market._count.stakeTicketLegs === 0 &&
        market.seedLeftWolo + market.seedRightWolo === 0
    )
    .map((market) => market.id);

  if (safeToArchiveIds.length === 0) {
    return;
  }

  await prisma.betMarket.updateMany({
    where: {
      id: { in: safeToArchiveIds },
      status: { in: OPEN_STATUSES },
      wagers: { none: {} },
      stakeIntents: { none: {} },
      stakeTicketLegs: {
        none: {
          ticket: { is: ticketMarketGuard },
        },
      },
      seedLeftWolo: 0,
      seedRightWolo: 0,
    },
    data: {
      status: "settled",
      featured: false,
      settledAt: new Date(),
      winnerSide: null,
      closeAt: null,
    },
  });
}

function financialAuthorityIncidentIds(
  adjudication: {
    affectsBets?: boolean;
    idempotencyKey?: string | null;
    evidence?: unknown;
  } | null
) {
  if (
    !adjudication?.affectsBets ||
    !adjudication.idempotencyKey
      ?.startsWith(
        "financial-authority:"
      ) ||
    !adjudication.evidence ||
    typeof adjudication.evidence !==
      "object" ||
    Array.isArray(
      adjudication.evidence
    )
  ) {
    return [];
  }

  const raw = (
    adjudication.evidence as Record<
      string,
      unknown
    >
  )
    .recoverableIntegrityIncidentIds;

  if (!Array.isArray(raw)) {
    return [];
  }

  return [
    ...new Set(
      raw.filter(
        (
          id
        ): id is number =>
          typeof id ===
            "number" &&
          Number.isSafeInteger(
            id
          ) &&
          id > 0
      )
    ),
  ];
}

async function reconcileAuthorizedReplayVerdictMarkets(
  prisma: PrismaClient
) {
  const markets =
    await prisma.betMarket.findMany({
      where: {
        linkedGameStatsId: {
          not:
            null,
        },
        marketType:
          WINNER_MARKET_TYPE,
        status: {
          in: [
            "open",
            "closing",
            "live",
            "awaiting_final_proof",
            "under_review",
            "settled",
          ],
        },
      },
      select: {
        id:
          true,
        linkedGameStatsId:
          true,
        status:
          true,
        winnerSide:
          true,
        leftLabel:
          true,
        rightLabel:
          true,
        propositionHash:
          true,
        leftRosterSnapshot:
          true,
        rightRosterSnapshot:
          true,
        settledAt:
          true,
        voidedAt:
          true,
        refundStatus:
          true,
        settlementExecutedAt:
          true,
      },
    });

  for (
    const market of
    markets
  ) {
    if (
      !market.linkedGameStatsId ||
      market.winnerSide ===
        "left" ||
      market.winnerSide ===
        "right" ||
      market.voidedAt ||
      market.refundStatus ||
      market.settlementExecutedAt
    ) {
      continue;
    }

    const rawGame =
      await prisma.gameStats.findUnique({
        where: {
          id:
            market.linkedGameStatsId,
        },
        select: {
          id:
            true,
          replayHash:
            true,
          winner:
            true,
          players:
            true,
          parse_reason:
            true,
          key_events:
            true,
          timestamp:
            true,
          createdAt:
            true,
          replayResultAdjudications:
            EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
        },
      });

    if (!rawGame) {
      continue;
    }

    /*
     * Financial authority belongs to the effective (latest accepted)
     * adjudication itself. An older automatic or approved verdict can
     * never lend betting authority to a newer statistics-only correction.
     */
    const effectiveAdjudication =
      rawGame
        .replayResultAdjudications[0] ??
      null;
    const explicitFinancialAuthority =
      effectiveAdjudication
        ?.affectsBets === true &&
      effectiveAdjudication
        .idempotencyKey
        ?.startsWith(
          "financial-authority:"
        ) === true;

    if (
      !replayResultAdjudicationAuthorizesBets(
        effectiveAdjudication
      )
    ) {
      continue;
    }

    const game =
      applyReplayAdjudicationToGameStats(
        rawGame
      );

    const finalTruth =
      buildFinalMarketTruth(
        game
      );

    /*
     * The existing frozen-proposition integrity validator is
     * the authority for mapping effective final replay truth
     * onto the market's left/right sides.
     *
     * Do not introduce a second winner-side inference path.
     */
    const integrity =
      validateMarketFinalIntegrity({
        propositionHash:
          market.propositionHash,
        leftRosterSnapshot:
          market.leftRosterSnapshot,
        rightRosterSnapshot:
          market.rightRosterSnapshot,
        finalPlayers:
          finalTruth.players,
        finalWinner:
          finalTruth.winner,
        finalBettingEligible:
          finalTruth.bettingEligible,
      });

    const winningSide =
      integrity.winningSide;

    if (
      !integrity.ok ||
      (
        winningSide !==
          "left" &&
        winningSide !==
          "right"
      )
    ) {
      console.warn(
        "Authorized replay adjudication market integrity blocked",
        {
          marketId:
            market.id,
          gameStatsId:
            market.linkedGameStatsId,
          reasonCodes:
            integrity.reasonCodes,
        }
      );

      continue;
    }

    await prisma.betMarket.updateMany({
      where: {
        id:
          market.id,
        winnerSide:
          null,
        voidedAt:
          null,
      },
      data: {
        status:
          "settled",
        ...(explicitFinancialAuthority
          ? {
              integrityStatus:
                "verified",
              /*
               * The immutable idempotency key contains the exact
               * approved 64-hex plan fingerprint.
               */
              integrityReason:
                effectiveAdjudication
                  ?.idempotencyKey,
              commissionerReviewState:
                "financial_authority_approved",
            }
          : {}),
        featured:
          false,
        closeAt:
          null,
        settledAt:
          market.settledAt ??
          rawGame.timestamp ??
          rawGame.createdAt,
        winnerSide:
          winningSide,
        resolutionReason:
          explicitFinancialAuthority
            ? "admin_financial_authority"
            : "screenshot_evidence_adjudication",
      },
    });

    const recoverableIncidentIds =
      financialAuthorityIncidentIds(
        effectiveAdjudication
      );

    if (
      explicitFinancialAuthority &&
      recoverableIncidentIds.length >
        0
    ) {
      await prisma.betMarketIntegrityIncident.updateMany({
        where: {
          id: {
            in:
              recoverableIncidentIds,
          },
          marketId:
            market.id,
          status:
            "open",
          incidentType:
            "settlement_integrity_blocked",
        },
        data: {
          status:
            "resolved",
          resolvedAt:
            new Date(),
        },
      });
    }
  }
}

async function runBetMarketEnsure(prisma: PrismaClient) {
  await archiveLowConfidenceZeroPotMarkets(prisma);
  const ticketMarketGuard = buildBetStakeTicketMarketGuardWhere();
  const { seeds, reconciledSessionKeys } = await buildOpenMarketSeeds(prisma);
  const slugs = [...new Set(seeds.map((seed) => seed.slug))];
  const staleMarketCutoff = new Date(Date.now() - 2 * 60_000);

  await Promise.all(
    seeds.map(async (seed) => {
      await prisma.$transaction(async (tx) => {
        const seedLockKey =
          canonicalBattleIdentityKey(normalizeName(seed.linkedSessionKey)) ??
          `bet-market-seed:${seed.slug}`;
        await tx.$executeRaw(
          Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${seedLockKey}, 0))`
        );
        const existing = await tx.betMarket.findUnique({
          where: { slug: seed.slug },
          select: {
            id: true,
            slug: true,
            status: true,
            settledAt: true,
            winnerSide: true,
            title: true,
            leftLabel: true,
            rightLabel: true,
            leftHref: true,
            rightHref: true,
            propositionHash: true,
            firstStakeAcceptedAt: true,
            closeAt: true,
            proofDeadlineAt: true,
            resolutionReason: true,
            createdAt: true,
          },
        });
        const rosterChangedAfterStake = Boolean(
          existing?.firstStakeAcceptedAt &&
          existing.propositionHash &&
          seed.propositionHash !== existing.propositionHash
        );
        const persisted = await tx.betMarket.upsert({
          where: { slug: seed.slug },
          create: marketSeedCreateData(seed),
          update: marketSeedUpdateData(seed, existing),
        });
        if (rosterChangedAfterStake) {
          await tx.betMarketIntegrityIncident.upsert({
            where: { incidentKey: `roster-changed-after-stake-${persisted.id}` },
            create: {
              marketId: persisted.id,
              incidentKey: `roster-changed-after-stake-${persisted.id}`,
              incidentType: "roster_changed_after_stake",
              status: "open",
              publicSummary:
                "Betting paused because later replay evidence changed a locked roster.",
              evidence: {
                priorPropositionHash: existing?.propositionHash ?? null,
                observedPropositionHash: seed.propositionHash,
                sourceParseIteration: seed.sourceParseIteration,
              },
              originalLeftLabel: existing?.leftLabel ?? persisted.leftLabel,
              originalRightLabel: existing?.rightLabel ?? persisted.rightLabel,
            },
            update: {
              status: "open",
              evidence: {
                priorPropositionHash: existing?.propositionHash ?? null,
                observedPropositionHash: seed.propositionHash,
                sourceParseIteration: seed.sourceParseIteration,
              },
            },
          });
        }
      });
    })
  );

  const desyncParentPairs = seeds
    .filter(
      (seed) =>
        seed.marketType ===
        DESYNC_SIDE_MARKET_TYPE
    )
    .map((seed) => ({
      childSlug: seed.slug,
      parentSlug:
        winnerSlugFromDesyncSideMarketSlug(
          seed.slug
        ),
    }))
    .filter(
      (
        pair
      ): pair is {
        childSlug: string;
        parentSlug: string;
      } =>
        Boolean(pair.parentSlug)
    );

  if (desyncParentPairs.length > 0) {
    const parents =
      await prisma.betMarket.findMany({
        where: {
          marketType:
            WINNER_MARKET_TYPE,
          slug: {
            in: desyncParentPairs.map(
              (pair) => pair.parentSlug
            ),
          },
        },
        select: {
          id: true,
          slug: true,
        },
      });
    const parentIdBySlug =
      new Map(
        parents.map((parent) => [
          parent.slug,
          parent.id,
        ])
      );

    await Promise.all(
      desyncParentPairs.map((pair) => {
        const parentMarketId =
          parentIdBySlug.get(
            pair.parentSlug
          );

        if (!parentMarketId) {
          return Promise.resolve();
        }

        return prisma.betMarket.updateMany({
          where: {
            slug: pair.childSlug,
            marketType:
              DESYNC_SIDE_MARKET_TYPE,
          },
          data: {
            parentMarketId,
          },
        });
      })
    );
  }

  await reconcileChallengeSessionShadowMarkets(prisma, seeds);
  await reconcileDetachedWatcherMarkets(prisma, reconciledSessionKeys);
  await linkLateFinalEvidence(prisma);
  /*
   * An explicitly authorized final result is trusted proof. Apply it before
   * the stale-proof grace worker can void an awaiting_final_proof market.
   * Terminal void/refund guards inside the reconciler remain authoritative.
   */
  await reconcileAuthorizedReplayVerdictMarkets(prisma);
  await repairMissingWatcherProofDeadlines(prisma);
  await voidExpiredWatcherMarkets(prisma);

  await prisma.betMarket.updateMany({
    where:
      slugs.length > 0
        ? {
            slug: { notIn: slugs },
            marketType: WINNER_MARKET_TYPE,
            status: { in: OPEN_STATUSES },
            updatedAt: { lt: staleMarketCutoff },
            wagers: {
              none: {
                status: "active",
              },
            },
            stakeIntents: {
              none: {
                status: {
                  in: [...BET_STAKE_INTENT_RECOVERABLE_STATUSES],
                },
              },
            },
            stakeTicketLegs: {
              none: {
                ticket: { is: ticketMarketGuard },
              },
            },
          }
        : {
            marketType: WINNER_MARKET_TYPE,
            status: { in: OPEN_STATUSES },
            updatedAt: { lt: staleMarketCutoff },
            wagers: {
              none: {
                status: "active",
              },
            },
            stakeIntents: {
              none: {
                status: {
                  in: [...BET_STAKE_INTENT_RECOVERABLE_STATUSES],
                },
              },
            },
            stakeTicketLegs: {
              none: {
                ticket: { is: ticketMarketGuard },
              },
            },
          },
    data: {
      status: "voided",
      featured: false,
      settledAt: new Date(),
      voidedAt: new Date(),
      winnerSide: null,
      closeAt: null,
      refundStatus: "queued",
      resolutionReason:
        "market_expired_without_stakes",
    },
  });

  await reconcileBetMarketStatsLinks(prisma);
  await reconcileDesyncSideMarkets(prisma);
  await settleResolvedMarketWagers(prisma);
  await reconcilePendingCoreBetClaims(prisma);
  await settleMarketIntegrityCorrections(prisma);
  await settleFounderBonuses(prisma);
}

// Several public/admin/replay routes can request the same reconciliation pass.
// Keep the entire pass single-flight in this Node process so two callers cannot
// submit different escrow-signer corrections with the same account sequence.
let betMarketEnsurePromise: Promise<void> | null = null;

export async function ensureBetMarkets(prisma: PrismaClient) {
  if (betMarketEnsurePromise) {
    return betMarketEnsurePromise;
  }

  const run = runBetMarketEnsure(prisma).finally(() => {
    if (betMarketEnsurePromise === run) {
      betMarketEnsurePromise = null;
    }
  });
  betMarketEnsurePromise = run;
  return run;
}

/**
 * Reconcile state that was committed immediately before this call.
 *
 * `ensureBetMarkets` is intentionally process-wide single-flight because the
 * settlement rail can submit chain transactions. Merely joining an older pass
 * is not sufficient for a newly committed financial-authority verdict: that
 * pass may already have moved beyond replay-result reconciliation. Capture and
 * await any pre-existing pass, then require a pass whose start is after this
 * function was called. Any pass we join in the second step necessarily began
 * after the caller's commit.
 */
export async function ensureBetMarketsAfterCommit(prisma: PrismaClient) {
  const preExistingPass = betMarketEnsurePromise;
  if (preExistingPass) {
    await preExistingPass;
  }

  await ensureBetMarkets(prisma);
}

function buildMarketCard(
  market: Awaited<ReturnType<typeof loadOpenMarkets>>[number],
  viewerUserId: number | null,
  claimsByMarketId: Map<
    number,
    Array<{
      id: number;
      displayPlayerName: string;
      amountWolo: number;
      claimKind: string;
      status: string;
      note: string | null;
      payoutTxHash: string | null;
      payoutProofUrl: string | null;
      errorState: string | null;
      createdAt: Date;
      claimedAt: Date | null;
      rescindedAt: Date | null;
    }>
  >
): BetBoardMarket {
  const activeWagers = market.wagers.filter(
    (wager) => wager.status === "active" && isCountableBetWager(wager)
  );
  const leftUserPool = activeWagers
    .filter((wager) => wager.side === "left")
    .reduce((sum, wager) => sum + wager.amountWolo, 0);
  const rightUserPool = activeWagers
    .filter((wager) => wager.side === "right")
    .reduce((sum, wager) => sum + wager.amountWolo, 0);
  const leftPoolWolo = market.seedLeftWolo + leftUserPool;
  const rightPoolWolo = market.seedRightWolo + rightUserPool;
  const totalPotWolo = leftPoolWolo + rightPoolWolo;
  const viewerWagers =
    viewerUserId == null ? [] : activeWagers.filter((wager) => wager.userId === viewerUserId);
  const latestViewerWager = viewerWagers[0] || null;
  const aggregatedViewerAmount = viewerWagers.reduce(
    (sum, wager) => sum + wager.amountWolo,
    0
  );
  const linkedSessionKey =
    market.linkedSessionKey?.trim() || market.scheduledMatch?.linkedSessionKey?.trim() || null;
  const founderBonuses = buildFounderChipSurface(market.founderBonuses);
  const warTape = buildMarketWarTapeRows(
    { ...market, wagers: activeWagers },
    claimsByMarketId.get(market.id) ?? []
  );

  const bettingCloseReason =
    freshBettingCloseReason({
      status: market.status,
      marketType: market.marketType,
      closeAt: market.closeAt,
      linkedSessionKey,
      scheduledMatchId:
        market.scheduledMatchId,
    });

  return {
    id: market.id,
    parentMarketId:
      market.parentMarketId ??
      null,
    battleNumber: market.battle?.publicNumber ?? null,
    slug: market.slug,
    title: market.title,
    eventLabel: market.eventLabel,
    marketType: market.marketType,
    href: buildBetMarketHref(market.id),
    linkedSessionKey,
    linkedGameStatsId: market.linkedGameStatsId ?? null,
    status: market.status as BetStatus,
    bettingOpen:
      bettingCloseReason === null,
    bettingCloseReason,
    teamFormat: market.teamFormat ?? null,
    teamResolutionStatus: market.teamResolutionStatus ?? null,
    teamResolutionProvenance: market.teamResolutionProvenance ?? null,
    teamConfidence: market.teamConfidence ?? null,
    integrityStatus: market.integrityStatus,
    integrityReason: market.integrityReason ?? null,
    rosterLockedAt: market.rosterLockedAt?.toISOString() ?? null,
    featured: market.featured,
    closeLabel:
      market.status === "closing" &&
      market.resolutionReason ===
        "live_snapshot_revalidating"
        ? "Revalidating live watcher"
        : market.status === "closing" &&
            linkedSessionKey &&
            !market.scheduledMatch
          ? "Awaiting final replay"
          : formatCloseLabel(
            market.status as BetStatus,
            market.closeAt
          ),
    scheduledStartAt: market.closeAt?.toISOString() ?? market.scheduledMatch?.scheduledAt?.toISOString() ?? null,
    totalPotWolo,
    left: {
      key: "left",
      name: market.leftLabel,
      href: market.leftHref,
      poolWolo: leftPoolWolo,
      crowdPercent: computeSharePercent(leftPoolWolo, totalPotWolo),
      slips: activeWagers.filter((wager) => wager.side === "left").length,
      seededWolo: market.seedLeftWolo,
    },
    right: {
      key: "right",
      name: market.rightLabel,
      href: market.rightHref,
      poolWolo: rightPoolWolo,
      crowdPercent: computeSharePercent(rightPoolWolo, totalPotWolo),
      slips: activeWagers.filter((wager) => wager.side === "right").length,
      seededWolo: market.seedRightWolo,
    },
    founderBonuses,
    warTape,
    broadcastFeeds: EMPTY_BROADCAST_FEEDS,
    broadcastPreviewUrls: { ...EMPTY_BET_BROADCAST_PREVIEW_URLS },
    viewerWager: latestViewerWager
      ? {
          side: latestViewerWager.side as BetSide,
          amountWolo: aggregatedViewerAmount,
          slipCount: viewerWagers.length,
          executionMode:
            viewerWagers.some((wager) => wager.executionMode === "onchain_escrow")
              ? "onchain_escrow"
              : "app_only",
          stakeTxHash:
            effectiveBetWagerStakeTxHash(
              latestViewerWager
            ),
          stakeWalletAddress: latestViewerWager.stakeWalletAddress ?? null,
          stakeLockedAt: latestViewerWager.stakeLockedAt?.toISOString() ?? null,
        }
      : null,
    winnerSide:
      market.winnerSide === "left" || market.winnerSide === "right"
        ? (market.winnerSide as BetSide)
        : null,
    desyncMarket: null,
  };
}

async function loadMarketsByStatus(prisma: PrismaClient, statuses: BetStatus[]) {
  const markets = await prisma.betMarket.findMany({
    where: { status: { in: statuses } },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    include: {
      battle: {
        select: {
          publicNumber: true,
        },
      },
      parentMarket: {
        select: {
          id: true,
          marketType: true,
          status: true,
          winnerSide: true,
          settledAt: true,
        },
      },
      scheduledMatch: {
        select: {
          scheduledAt: true,
          linkedSessionKey: true,
        },
      },
      founderBonuses: {
        where: {
          rescindedAt: null,
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          createdBy: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
      wagers: {
        where: { status: "active" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        include: {
          stakeIntent: {
            select: {
              status: true,
            },
          },
          stakeLeg: {
            select: {
              ticket: {
                select: {
                  id: true,
                  status: true,
                  stakeTxHash: true,
                },
              },
            },
          },
          user: {
            select: {
              uid: true,
              inGameName: true,
              steamPersonaName: true,
            },
          },
        },
      },
    },
  });

  return markets.filter(
    (market) =>
      isConfidentBetMarket(
        market
      ) &&
      market.integrityStatus ===
        "verified" &&
      Boolean(
        market.propositionHash
      ) &&
      (
        isDesyncSideMarketType(
          market.marketType
        )
          ? Boolean(
              market.parentMarket &&
                market.parentMarket.marketType ===
                  WINNER_MARKET_TYPE &&
                (
                  (
                    ["open", "live"].includes(
                      market.status
                    ) &&
                    ["open", "live"].includes(
                      market.parentMarket.status
                    )
                  ) ||
                  (
                    market.status ===
                      "closing" &&
                    (
                      ["open", "closing", "live"].includes(
                        market.parentMarket.status
                      ) ||
                      (
                        market.parentMarket.status ===
                          "settled" &&
                        ["left", "right"].includes(
                          market.parentMarket.winnerSide ??
                            ""
                        ) &&
                        Boolean(
                          market.parentMarket.settledAt
                        )
                      )
                    )
                  ) ||
                  (
                    market.status ===
                      "awaiting_final_proof" &&
                    market.parentMarket.status ===
                      "awaiting_final_proof"
                  ) ||
                  (
                    market.status ===
                      "under_review" &&
                    market.parentMarket.status ===
                      "under_review"
                  )
                )
            )
          :
        (
          market.teamResolutionStatus ===
            "resolved" &&
          market.teamConfidence ===
            "high"
        )
      )
  );
}

async function loadOpenMarkets(prisma: PrismaClient) {
  return loadMarketsByStatus(prisma, OPEN_STATUSES);
}

async function loadAwaitingProofMarkets(prisma: PrismaClient) {
  return loadMarketsByStatus(prisma, ["awaiting_final_proof"]);
}

export function classifyBetPayoutState(input: {
  settlementStatus: string | null;
  refundStatus: string | null;
  coreLiabilityWolo: number;
  claims: Array<{
    claimKind: string;
    amountWolo: number;
    status: string;
    payoutTxHash: string | null;
  }>;
}): BetSettledResult["payoutState"] {
  const correctionRecorded =
    input.settlementStatus === "corrected" ||
    input.refundStatus === "corrected_with_overpayment";
  const coreClaims = input.claims.filter((claim) =>
    isCoreBetSettlementClaimKind(claim.claimKind)
  );

  const claimIsProven = (
    claim: (typeof coreClaims)[number]
  ) =>
    claim.status === "claimed" &&
    Boolean(claim.payoutTxHash?.trim());
  const provenClaimCount =
    coreClaims.filter(claimIsProven).length;
  const provenCoreWolo = coreClaims
    .filter(claimIsProven)
    .reduce((sum, claim) => sum + claim.amountWolo, 0);
  const everyCoreLiabilityClaimProven =
    coreClaims.length > 0 &&
    provenClaimCount === coreClaims.length &&
    provenCoreWolo >= input.coreLiabilityWolo;

  if (input.coreLiabilityWolo <= 0) {
    return correctionRecorded ? "corrected" : "executed";
  }

  if (everyCoreLiabilityClaimProven) {
    return correctionRecorded ? "corrected" : "executed";
  }

  if (
    (
      input.settlementStatus === "failed" ||
      input.refundStatus === "failed"
    ) &&
    provenClaimCount === 0
  ) {
    return "failed";
  }

  if (
    provenClaimCount > 0
  ) {
    return "partial";
  }

  return "pending";
}

async function loadRecentSettledResults(prisma: PrismaClient): Promise<BetSettledResult[]> {
  const marketInclude = {
    battle: {
      select: {
        publicNumber: true,
      },
    },
    scheduledMatch: {
      select: {
        linkedSessionKey: true,
      },
    },
    founderBonuses: {
      where: {
        rescindedAt: null,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    },
    wagers: {
      select: {
        amountWolo: true,
        payoutWolo: true,
        status: true,
        executionMode: true,
        stakeTxHash: true,
        createdAt: true,
        stakeLockedAt: true,
        stakeIntent: {
          select: {
            status: true,
          },
        },
        stakeLeg: {
          select: {
            ticket: {
              select: {
                id: true,
                status: true,
                stakeTxHash: true,
              },
            },
          },
        },
      },
    },
    stakeIntents: {
      select: {
        amountWolo: true,
        status: true,
      },
    },
    integrityIncidents: {
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 1,
      include: {
        adjustments: {
          select: {
            amountStillOwedWolo: true,
            overpaymentWolo: true,
            adjustmentStatus: true,
          },
        },
      },
    },
  } satisfies Prisma.BetMarketInclude;

  const attentionMarketIds = (
    await prisma.pendingWoloClaim.findMany({
      where: {
        sourceMarketId: { not: null },
        status: "pending",
        rescindedAt: null,
        claimKind: {
          in: [...BETTOR_SETTLEMENT_CLAIM_KINDS],
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      distinct: ["sourceMarketId"],
      take: 24,
      select: {
        sourceMarketId: true,
      },
    })
  )
    .map((row) => row.sourceMarketId)
    .filter(
      (marketId): marketId is number =>
        typeof marketId === "number"
    );

  const [
    attentionMarketsRaw,
    terminalMarketsRaw,
    reviewMarketsRaw,
    sessionSnapshot,
  ] = await Promise.all([
    attentionMarketIds.length > 0
      ? prisma.betMarket.findMany({
          where: {
            id: { in: attentionMarketIds },
            marketType: WINNER_MARKET_TYPE,
            status: { in: ["settled", "voided"] },
          },
          orderBy: [
            { updatedAt: "desc" },
            { id: "desc" },
          ],
          include: marketInclude,
        })
      : [],
    prisma.betMarket.findMany({
      where: {
        marketType: WINNER_MARKET_TYPE,
        status: { in: ["settled", "voided"] },
      },
      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      take: 60,
      include: marketInclude,
    }),
    prisma.betMarket.findMany({
      where: {
        marketType: WINNER_MARKET_TYPE,
        status: "under_review",
      },
      orderBy: [
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      take: 20,
      include: marketInclude,
    }),
    loadLiveSessionSnapshot(prisma),
  ]);
  const settledMarketsRaw = [
    ...attentionMarketsRaw,
    ...terminalMarketsRaw,
    ...reviewMarketsRaw,
  ];
  const settledMarketBySurfaceKey = new Map<
    string,
    (typeof settledMarketsRaw)[number]
  >();

  for (const market of settledMarketsRaw) {
    const linkedSessionKey =
      normalizeName(market.linkedSessionKey) ||
      normalizeName(market.scheduledMatch?.linkedSessionKey) ||
      "";
    const mapName = readMarketMapLabel(market.eventLabel);
    const surfaceKey = linkedSessionKey
      ? `session:${linkedSessionKey.toLowerCase()}`
      : `match:${normalizeSettledMatchKey(market.title, mapName)}`;
    const existing = settledMarketBySurfaceKey.get(surfaceKey);

    if (!existing) {
      settledMarketBySurfaceKey.set(surfaceKey, market);
      continue;
    }

    if (
      existing.status !== "under_review" &&
      market.status === "under_review"
    ) {
      continue;
    }
    if (
      existing.status === "under_review" &&
      market.status !== "under_review"
    ) {
      settledMarketBySurfaceKey.set(surfaceKey, market);
      continue;
    }

    const marketIsChallenge = typeof market.scheduledMatchId === "number";
    const existingIsChallenge = typeof existing.scheduledMatchId === "number";
    if (marketIsChallenge && !existingIsChallenge) {
      settledMarketBySurfaceKey.set(surfaceKey, market);
    }
  }

  const displayableMarkets = [...settledMarketBySurfaceKey.values()]
    .filter((market) => {
      if (!isWoloMainnet()) return true;
      return (
        market.wagers.some((wager) => isCountableBetWager(wager)) ||
        market.stakeIntents.some((intent) => isBetStakeIntentCountableStatus(intent.status))
      );
    });
  const settledMarkets = displayableMarkets;

  const settledMarketIds = settledMarkets.map((market) => market.id);
  const [claimTotals, claimProofRows] =
    settledMarketIds.length > 0
      ? await Promise.all([
          prisma.pendingWoloClaim.groupBy({
            by: ["sourceMarketId"],
            where: {
              sourceMarketId: { in: settledMarketIds },
              rescindedAt: null,
              claimKind: {
                in: [...BETTOR_SETTLEMENT_CLAIM_KINDS],
              },
            },
            _sum: {
              amountWolo: true,
            },
          }),
          prisma.pendingWoloClaim.findMany({
            where: {
              sourceMarketId: { in: settledMarketIds },
              rescindedAt: null,
            },
            select: {
              sourceMarketId: true,
              claimKind: true,
              amountWolo: true,
              status: true,
              payoutTxHash: true,
              payoutProofUrl: true,
              errorState: true,
            },
          }),
        ])
      : [[], []];

  const claimTotalByMarketId = new Map<number, number>();
  for (const row of claimTotals) {
    if (typeof row.sourceMarketId === "number") {
      claimTotalByMarketId.set(row.sourceMarketId, row._sum.amountWolo ?? 0);
    }
  }

  const payoutTxHashesByMarketId = new Map<number, Set<string>>();
  const payoutProofUrlsByMarketId = new Map<number, Set<string>>();
  const claimProofRowsByMarketId = new Map<
    number,
    typeof claimProofRows
  >();
  for (const row of claimProofRows) {
    if (typeof row.sourceMarketId !== "number") continue;

    const marketClaimRows =
      claimProofRowsByMarketId.get(row.sourceMarketId) ??
      [];
    marketClaimRows.push(row);
    claimProofRowsByMarketId.set(
      row.sourceMarketId,
      marketClaimRows
    );

    if (
      isCoreBetSettlementClaimKind(row.claimKind) &&
      row.status === "claimed" &&
      row.payoutTxHash?.trim()
    ) {
      const hashes =
        payoutTxHashesByMarketId.get(row.sourceMarketId) ??
        new Set<string>();
      hashes.add(row.payoutTxHash.trim());
      payoutTxHashesByMarketId.set(row.sourceMarketId, hashes);
    }

    if (
      isCoreBetSettlementClaimKind(row.claimKind) &&
      row.status === "claimed" &&
      row.payoutProofUrl?.trim()
    ) {
      const proofUrls =
        payoutProofUrlsByMarketId.get(row.sourceMarketId) ??
        new Set<string>();
      proofUrls.add(row.payoutProofUrl.trim());
      payoutProofUrlsByMarketId.set(row.sourceMarketId, proofUrls);
    }
  }

  const sessionOutcomeByMatchKey = new Map(
    sessionSnapshot.recentlyCompletedSessions.map((session) => [
      normalizeSettledMatchKey(buildSessionMarketTitle(session), session.mapName),
      {
        settledAt: session.completedAt || session.updatedAt || session.createdAt,
      },
    ])
  );

  const marketResults = settledMarkets.map((market) => {
      const resolutionStatus = market.status as "settled" | "voided" | "under_review";
      const winner =
        resolutionStatus === "voided"
          ? market.refundStatus === "corrected_with_overpayment"
            ? "Voided · stake corrections recorded"
            : market.refundStatus === "refunded"
            ? "Voided · refunded"
            : market.refundStatus === "failed"
              ? "Voided · refund failed, retrying"
              : "Voided · refund queued"
          : resolutionStatus === "under_review"
            ? "Result under review"
            : market.winnerSide === "right"
              ? market.rightLabel
              : market.leftLabel;
      const countableWagers = market.wagers.filter((wager) => isCountableBetWager(wager));
      const wageredWolo = countableWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
      const intentWolo = market.stakeIntents
        .filter((intent) => isBetStakeIntentCountableStatus(intent.status))
        .reduce((sum, intent) => sum + intent.amountWolo, 0);
      const claimWolo = claimTotalByMarketId.get(market.id) ?? 0;
      const seededWolo = market.seedLeftWolo + market.seedRightWolo;
      const totalPotWolo = Math.max(seededWolo + wageredWolo, intentWolo, claimWolo);
      const settledPayoutTotal = market.wagers
        .filter((wager) => ["won", "void"].includes(wager.status))
        .reduce((sum, wager) => sum + (wager.payoutWolo ?? 0), 0);
      const payoutWolo =
        settledPayoutTotal > 0
          ? Math.max(settledPayoutTotal, claimWolo)
          : Math.max(totalPotWolo, claimWolo);
      const mapName = readMarketMapLabel(market.eventLabel);
      const matchedSession = sessionOutcomeByMatchKey.get(
        normalizeSettledMatchKey(market.title, mapName)
      );
      const linkedSessionKey =
        market.linkedSessionKey?.trim() || market.scheduledMatch?.linkedSessionKey?.trim() || null;
      const href = `/bets/${market.id}`;
      const integrityIncident = market.integrityIncidents[0] ?? null;
      const amountStillOwedWolo = integrityIncident?.adjustments.reduce(
        (sum, adjustment) => sum + adjustment.amountStillOwedWolo,
        0
      ) ?? 0;
      const overpaymentWolo = integrityIncident?.adjustments.reduce(
        (sum, adjustment) => sum + adjustment.overpaymentWolo,
        0
      ) ?? 0;
      const correctionStatus = integrityIncident
        ? integrityIncident.adjustments.every((adjustment) =>
            ["corrective_refund_paid", "overpayment_recorded", "no_adjustment_due"].includes(
              adjustment.adjustmentStatus
            )
          )
          ? "recorded"
          : "in_progress"
        : null;
      const payoutTxHashes = [
        ...(payoutTxHashesByMarketId.get(market.id) ?? []),
      ];
      const payoutProofUrls = [
        ...(payoutProofUrlsByMarketId.get(market.id) ?? []),
      ];
      const marketClaimRows =
        claimProofRowsByMarketId.get(market.id) ??
        [];
      const payoutState =
        classifyBetPayoutState({
          settlementStatus:
            market.settlementStatus ??
            null,
          refundStatus:
            market.refundStatus ??
            null,
          coreLiabilityWolo: Math.max(
            settledPayoutTotal,
            claimWolo
          ),
          claims:
            marketClaimRows,
        });

      return {
        id: market.id,
        battleNumber: market.battle?.publicNumber ?? null,
        title: market.title,
        eventLabel: market.eventLabel,
        winner,
        resolutionStatus,
        resolutionReason: market.resolutionReason ?? null,
        refundStatus: market.refundStatus ?? null,
        settlementStatus: market.settlementStatus ?? null,
        settlementFailureCode: market.settlementFailureCode ?? null,
        settlementAttemptedAt:
          market.settlementAttemptedAt?.toISOString() ?? null,
        settlementExecutedAt:
          market.settlementExecutedAt?.toISOString() ?? null,
        payoutState,
        payoutTxHashes,
        payoutProofUrls,
        teamFormat: market.teamFormat ?? null,
        teamResolutionProvenance: market.teamResolutionProvenance ?? null,
        integrityStatus: market.integrityStatus,
        integrityReason: market.integrityReason ?? null,
        integritySummary: integrityIncident?.publicSummary ?? null,
        correctionStatus,
        amountStillOwedWolo,
        overpaymentWolo,
        mapName,
        totalPotWolo,
        payoutWolo,
        settledAt: matchedSession?.settledAt || market.settledAt?.toISOString() || null,
        href,
        linkedSessionKey,
        broadcastFeeds: EMPTY_BROADCAST_FEEDS,
        broadcastPreviewUrls: { ...EMPTY_BET_BROADCAST_PREVIEW_URLS },
        founderBonuses: market.founderBonuses.map((bonus) => ({
          id: bonus.id,
          bonusType: bonus.bonusType === "winner" ? "winner" : "participants",
          totalAmountWolo: bonus.totalAmountWolo,
          note: bonus.note ?? null,
          status: bonus.status,
          createdAt: bonus.createdAt.toISOString(),
        })),
      } satisfies BetSettledResult;
    });

  if (marketResults.length > 0) {
    return [
      ...marketResults
        .filter(
          (result) =>
            result.resolutionStatus !== "under_review" &&
            !["executed", "corrected"].includes(result.payoutState)
        )
        .slice(0, 4),
      ...marketResults
        .filter(
          (result) =>
            result.resolutionStatus !== "under_review" &&
            ["executed", "corrected"].includes(result.payoutState)
        )
        .slice(0, 4),
      ...marketResults
        .filter(
          (result) =>
            result.resolutionStatus === "under_review"
        )
        .slice(0, 4),
    ];
  }

  if (isWoloMainnet()) {
    return [];
  }

  const rows = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      winner: { not: null },
    },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { id: "desc" }],
    take: 4,
    select: {
      id: true,
      replay_file: true,
      original_filename: true,
      winner: true,
      map: true,
      players: true,
      parse_reason: true,
      played_on: true,
      timestamp: true,
    },
  });

  return rows.map((row) => {
    const players = parsePlayers(row.players);
    const names = players
      .map((player) => normalizeName(String(player.name || player.player_name || "")))
      .filter(Boolean)
      .slice(0, 2);
    const title =
      names.length >= 2
        ? `${names[0]} vs ${names[1]}`
        : names.length === 1
          ? `${names[0]} result`
          : "Replay-backed result";
    const mapName = readMapName(row.map);
    return {
      id: row.id,
      battleNumber: null,
      title,
      eventLabel: row.parse_reason ? row.parse_reason.replace(/_/g, " ") : "Replay proof",
      winner: row.winner || "Unknown",
      resolutionStatus: "settled",
      resolutionReason: null,
      refundStatus: null,
      settlementStatus: "executed",
      settlementFailureCode: null,
      settlementAttemptedAt: null,
      settlementExecutedAt:
        row.played_on?.toISOString() ||
        row.timestamp?.toISOString() ||
        null,
      payoutState: "executed",
      payoutTxHashes: [],
      payoutProofUrls: [],
      teamFormat: null,
      teamResolutionProvenance: null,
      integrityStatus: "not_applicable",
      integrityReason: null,
      integritySummary: null,
      correctionStatus: null,
      amountStillOwedWolo: 0,
      overpaymentWolo: 0,
      mapName,
      totalPotWolo: 110 + (hashValue(`${row.id}:${row.winner}:pot`) % 240),
      payoutWolo: 110 + (hashValue(`${row.id}:${row.winner}`) % 240),
      settledAt: row.played_on?.toISOString() || row.timestamp?.toISOString() || null,
      href: null,
      linkedSessionKey: (row.original_filename || row.replay_file || "").trim() || null,
      broadcastFeeds: EMPTY_BROADCAST_FEEDS,
      broadcastPreviewUrls: { ...EMPTY_BET_BROADCAST_PREVIEW_URLS },
      founderBonuses: [],
    };
  });
}

function normalizeBroadcastToken(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function streamMatchesPlayer(stream: WatchStreamPayload, playerName: string) {
  const target = normalizeBroadcastToken(playerName);
  if (!target) return false;

  const fields = [stream.playerLabel, stream.label, stream.url]
    .map(normalizeBroadcastToken)
    .filter(Boolean);

  return fields.some((field) => field === target || field.includes(target));
}

function isPlayerViewStream(stream: WatchStreamPayload) {
  return stream.role === "player_pov" || stream.role === "team_pov";
}

function selectGodBroadcastFeed(streams: WatchStreamPayload[]) {
  return (
    streams.find((stream) => stream.isPrimary) ||
    streams.find((stream) => stream.role === "observer") ||
    streams.find((stream) => stream.role === "caster") ||
    streams.find((stream) => stream.role === "external") ||
    streams[0] ||
    null
  );
}

const BROWSER_STREAM_STALE_MS = 45_000;

function isVisibleBroadcastStream(stream: WatchStreamPayload) {
  if (stream.sourceType !== "browser" && stream.provider !== "aoe2war") {
    return stream.status !== "removed";
  }

  if (!["starting", "live"].includes(stream.status)) {
    return false;
  }

  const lastSeen = stream.lastHeartbeatAt || stream.updatedAt;
  const lastSeenMs = new Date(lastSeen).getTime();
  return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= BROWSER_STREAM_STALE_MS;
}

function selectPlayerBroadcastFeed({
  streams,
  playerName,
  side,
  godFeed,
}: {
  streams: WatchStreamPayload[];
  playerName: string;
  side: BetSide;
  godFeed: WatchStreamPayload | null;
}) {
  const playerStreams = streams.filter(
    (stream) => isPlayerViewStream(stream) && stream.id !== godFeed?.id
  );

  const namedMatch =
    playerStreams.find((stream) => streamMatchesPlayer(stream, playerName)) ||
    streams.find(
      (stream) =>
        stream.id !== godFeed?.id &&
        !stream.isPrimary &&
        !["caster", "observer"].includes(stream.role) &&
        streamMatchesPlayer(stream, playerName)
    );

  if (namedMatch) {
    return namedMatch;
  }

  if (playerStreams.length >= 2) {
    return side === "left" ? playerStreams[0] : playerStreams[1];
  }

  if (side === "left" && playerStreams.length === 1) {
    return playerStreams[0];
  }

  if (godFeed && streamMatchesPlayer(godFeed, playerName)) {
    return godFeed;
  }

  return null;
}

function buildBroadcastFeedsForMatch({
  streams,
  leftName,
  rightName,
}: {
  streams: WatchStreamPayload[] | undefined;
  leftName: string;
  rightName: string;
}): BetBroadcastFeeds {
  const availableStreams = streams ?? [];
  const god = selectGodBroadcastFeed(availableStreams);

  return {
    left: selectPlayerBroadcastFeed({
      streams: availableStreams,
      playerName: leftName,
      side: "left",
      godFeed: god,
    }),
    god,
    right: selectPlayerBroadcastFeed({
      streams: availableStreams,
      playerName: rightName,
      side: "right",
      godFeed: god,
    }),
  };
}

function splitBetTitlePlayers(title: string) {
  const [leftName = "", ...rightParts] = title.split(/\s+vs\s+/i);
  return {
    leftName: leftName.trim(),
    rightName: rightParts.join(" vs ").trim(),
  };
}

async function loadWatchStreamsBySession(
  prisma: PrismaClient,
  sessionKeys: string[]
) {
  const uniqueSessionKeys = Array.from(new Set(sessionKeys.map((key) => key.trim()).filter(Boolean)));
  if (!uniqueSessionKeys.length) {
    return new Map<string, WatchStreamPayload[]>();
  }

  const rows = await prisma.gameWatchStream
    .findMany({
      where: {
        sessionKey: {
          in: uniqueSessionKeys,
        },
        status: {
          not: "removed",
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    })
    .catch((error) => {
      console.warn("Failed to load streams for bet broadcasts:", error);
      return [];
    });

  const streamsBySession = new Map<string, WatchStreamPayload[]>();

  for (const row of rows) {
    const stream = toWatchStreamPayload(row);
    if (!isVisibleBroadcastStream(stream)) {
      continue;
    }
    const bucket = streamsBySession.get(stream.sessionKey) ?? [];
    bucket.push(stream);
    streamsBySession.set(stream.sessionKey, bucket);
  }

  return streamsBySession;
}


async function loadViewerRecentClosedBookEntries(
  prisma: PrismaClient,
  viewerId: number | null | undefined,
  excludedMarketIds: Set<number>
): Promise<BetBookEntry[]> {
  if (!viewerId) return [];

  const rows = await prisma.betWager.findMany({
    where: {
      userId: viewerId,
      status: { in: ["active", "won", "lost", "void"] },
      marketId: excludedMarketIds.size > 0 ? { notIn: Array.from(excludedMarketIds) } : undefined,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: 12,
    select: {
      id: true,
      marketId: true,
      side: true,
      amountWolo: true,
      status: true,
      payoutWolo: true,
      executionMode: true,
      stakeTxHash: true,
      stakeLeg: {
        select: {
          ticket: {
            select: {
              id: true,
              status: true,
              stakeTxHash: true,
            },
          },
        },
      },
      createdAt: true,
      updatedAt: true,
      market: {
        select: {
          id: true,
          slug: true,
          title: true,
          eventLabel: true,
          status: true,
          leftLabel: true,
          rightLabel: true,
          settledAt: true,
        },
      },
    },
  });

  const statusLabel = (status: string, payoutWolo: number | null) => {
    if (status === "active") return "Slip locked";
    if (status === "won") return "Won";
    if (status === "lost") return "Lost";
    if (status === "void") return (payoutWolo ?? 0) > 0 ? "Refund recorded" : "Voided";
    return status.replace(/_/g, " ");
  };

  return rows.map((row): BetBookEntry => {
    const side: BetSide = row.side === "right" ? "right" : "left";
    const pickedLabel = side === "left" ? row.market.leftLabel : row.market.rightLabel;
    const marketStatus: BetStatus = [
      "open",
      "closing",
      "live",
      "awaiting_final_proof",
      "settled",
      "voided",
      "under_review",
    ].includes(row.market.status)
      ? (row.market.status as BetStatus)
      : "settled";

    return {
      marketId: row.marketId,
      marketSlug: row.market.slug,
      title: row.market.title,
      eventLabel: row.market.eventLabel,
      side,
      pickedLabel,
      amountWolo: row.amountWolo,
      slipCount: 1,
      projectedReturnWolo: row.payoutWolo ?? 0,
      closeLabel: statusLabel(row.status, row.payoutWolo),
      scheduledStartAt: row.market.settledAt?.toISOString() ?? null,
      status: marketStatus,
      executionMode: row.executionMode === "onchain_escrow" ? "onchain_escrow" : "app_only",
      stakeTxHash: effectiveBetWagerStakeTxHash(row),
      stakeProofUrl: effectiveBetWagerStakeTxHash(row)
        ? buildWoloRestTxLookupUrl(effectiveBetWagerStakeTxHash(row) as string)
        : null,
    };
  });
}


type LoadBetBoardSnapshotOptions = {
  ensureMarkets?: boolean;
  settlementSurfaceMode?: "full" | "fast";
};

type WoloSettlementSurfaceSnapshot = Awaited<ReturnType<typeof getWoloSettlementSurfaceStatus>>;

let cachedSettlementSurface: {
  value: WoloSettlementSurfaceSnapshot;
  loadedAt: number;
} | null = null;

function fastSettlementSurfaceFallback(detail = "Settlement capability check deferred for fast bet-board load."): WoloSettlementSurfaceSnapshot {
  return {
    settlementServiceConfigured: false,
    settlementAuthConfigured: false,
    payoutExecutionMode: hasWoloPayoutExecutionConfigured()
      ? "local_signer_fallback"
      : "unconfigured",
    groupedRunCapability: "unknown",
    escrowVerifyCapability: "unknown",
    escrowRecentCapability: "unknown",
    warnings: [detail],
    detail,
  } as WoloSettlementSurfaceSnapshot;
}

async function loadSettlementSurfaceForBetBoard(
  mode: LoadBetBoardSnapshotOptions["settlementSurfaceMode"] = "full"
): Promise<WoloSettlementSurfaceSnapshot> {
  const now = Date.now();
  if (cachedSettlementSurface && now - cachedSettlementSurface.loadedAt < 60_000) {
    return cachedSettlementSurface.value;
  }

  if (mode !== "fast") {
    const value = await getWoloSettlementSurfaceStatus();
    cachedSettlementSurface = { value, loadedAt: Date.now() };
    return value;
  }

  const timeoutMs = 350;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    const value = await Promise.race([
      getWoloSettlementSurfaceStatus(),
      new Promise<WoloSettlementSurfaceSnapshot>((resolve) => {
        timeoutHandle = setTimeout(() => {
          resolve(fastSettlementSurfaceFallback());
        }, timeoutMs);
      }),
    ]);

    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    cachedSettlementSurface = { value, loadedAt: Date.now() };
    return value;
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    const value = fastSettlementSurfaceFallback(
      error instanceof Error
        ? `Settlement capability check deferred: ${error.message}`
        : "Settlement capability check deferred."
    );
    cachedSettlementSurface = { value, loadedAt: Date.now() };
    return value;
  }
}


export async function loadBetBoardSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null,
  options: LoadBetBoardSnapshotOptions = {}
): Promise<BetBoardSnapshot> {
  if (options.ensureMarkets !== false) {
    await ensureBetMarkets(prisma);
  }
  const escrowRuntime = getWoloBetEscrowRuntime();

  const viewer = viewerUid
    ? await prisma.user.findUnique({
        where: { uid: viewerUid },
        select: {
          id: true,
          inGameName: true,
          steamPersonaName: true,
        },
      })
    : null;

  const [
    openMarketsRaw,
    awaitingProofRaw,
    settledResultsRaw,
    unresolvedStakeIntents,
    unresolvedStakeTickets,
    settlementSurface,
  ] = await Promise.all([
    loadOpenMarkets(prisma),
    loadAwaitingProofMarkets(prisma),
    loadRecentSettledResults(prisma),
    viewer?.id ? loadViewerBetStakeIntents(prisma, viewer.id) : Promise.resolve([]),
    viewer?.id ? loadViewerBetStakeTickets(prisma, viewer.id) : Promise.resolve([]),
    loadSettlementSurfaceForBetBoard(options.settlementSurfaceMode),
  ]);

  const openMarketIds = [...openMarketsRaw, ...awaitingProofRaw].map((market) => market.id);
  const claimRows = openMarketIds.length
    ? await prisma.pendingWoloClaim.findMany({
        where: {
          sourceMarketId: { in: openMarketIds },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          sourceMarketId: true,
          displayPlayerName: true,
          amountWolo: true,
          claimKind: true,
          status: true,
          note: true,
          payoutTxHash: true,
          payoutProofUrl: true,
          errorState: true,
          createdAt: true,
          claimedAt: true,
          rescindedAt: true,
        },
      })
    : [];

  const claimsByMarketId = new Map<number, typeof claimRows>();
  for (const claim of claimRows) {
    if (typeof claim.sourceMarketId !== "number") {
      continue;
    }
    const bucket = claimsByMarketId.get(claim.sourceMarketId) ?? [];
    bucket.push(claim);
    claimsByMarketId.set(claim.sourceMarketId, bucket);
  }

  const openMarketsWithoutFeeds = openMarketsRaw.map((market) =>
    buildMarketCard(market, viewer?.id ?? null, claimsByMarketId)
  );
  const awaitingProofMarketsWithoutFeeds = awaitingProofRaw.map((market) =>
    buildMarketCard(market, viewer?.id ?? null, claimsByMarketId)
  );
  const broadcastSessionKeys = [
    ...openMarketsWithoutFeeds.map((market) => market.linkedSessionKey),
    ...awaitingProofMarketsWithoutFeeds.map((market) => market.linkedSessionKey),
    ...settledResultsRaw.map((result) => result.linkedSessionKey),
  ].filter(Boolean) as string[];
  const [streamsBySession, broadcastPreviewsByKey] = await Promise.all([
    loadWatchStreamsBySession(prisma, broadcastSessionKeys),
    loadBetBroadcastPreviewMap(),
  ]);
  const openMarketsWithFeeds = openMarketsWithoutFeeds.map((market) => ({
    ...market,
    broadcastFeeds: buildBroadcastFeedsForMatch({
      streams: market.linkedSessionKey
        ? streamsBySession.get(market.linkedSessionKey)
        : undefined,
      leftName: market.left.name,
      rightName: market.right.name,
    }),
    broadcastPreviewUrls: buildBetBroadcastPreviewUrls(
      market.linkedSessionKey,
      broadcastPreviewsByKey
    ),
  }));

  const openMarketRowsWithFeeds = attachDesyncWarTapeToWinnerMarkets(
    openMarketsWithFeeds
  );
  const openMarkets = nestDesyncSideMarkets(openMarketRowsWithFeeds);
  const awaitingProofMarketRowsWithFeeds = attachDesyncWarTapeToWinnerMarkets(
    awaitingProofMarketsWithoutFeeds.map((market) => ({
      ...market,
      broadcastFeeds: buildBroadcastFeedsForMatch({
        streams: market.linkedSessionKey
          ? streamsBySession.get(market.linkedSessionKey)
          : undefined,
        leftName: market.left.name,
        rightName: market.right.name,
      }),
      broadcastPreviewUrls: buildBetBroadcastPreviewUrls(
        market.linkedSessionKey,
        broadcastPreviewsByKey
      ),
    }))
  );
  const awaitingProofMarkets = nestDesyncSideMarkets(
    awaitingProofMarketRowsWithFeeds
  );

  const settledResults = settledResultsRaw.map((result) => {
    const { leftName, rightName } = splitBetTitlePlayers(result.title);

    return {
      ...result,
      broadcastFeeds: buildBroadcastFeedsForMatch({
        streams: result.linkedSessionKey
          ? streamsBySession.get(result.linkedSessionKey)
          : undefined,
        leftName,
        rightName,
      }),
      broadcastPreviewUrls: buildBetBroadcastPreviewUrls(
        result.linkedSessionKey,
        broadcastPreviewsByKey
      ),
    };
  });
  const primaryOpenMarkets =
    openMarkets.filter(
      (market) =>
        !isDesyncSideMarketType(
          market.marketType
        )
    );

  const liveWatcherMarket =
    primaryOpenMarkets.find((market) => market.status === "live" && Boolean(market.linkedSessionKey)) ||
    primaryOpenMarkets.find((market) => market.status === "closing" && Boolean(market.linkedSessionKey));

  const featuredMarket =
    liveWatcherMarket ||
    primaryOpenMarkets.find((market) => market.featured) ||
    primaryOpenMarkets[0] ||
    null;

  const activeOpenWagers = openMarketRowsWithFeeds
    .filter((market) => market.viewerWager)
    .map((market) => {
      const side = market.viewerWager?.side || "left";
      const amountWolo = market.viewerWager?.amountWolo || 0;
      const selectedPool = side === "left" ? market.left.poolWolo : market.right.poolWolo;
      const otherPool = side === "left" ? market.right.poolWolo : market.left.poolWolo;

      return {
        marketId: market.id,
        marketSlug: market.slug,
        title: market.title,
        eventLabel: market.eventLabel,
        side,
        pickedLabel: side === "left" ? market.left.name : market.right.name,
        amountWolo,
        slipCount: market.viewerWager?.slipCount || 0,
        projectedReturnWolo: projectReturnWolo(
          amountWolo,
          Math.max(0, selectedPool - amountWolo),
          otherPool
        ),
        closeLabel: market.closeLabel,
        scheduledStartAt: market.scheduledStartAt,
        status: market.status,
        executionMode: market.viewerWager?.executionMode || "app_only",
        stakeTxHash: market.viewerWager?.stakeTxHash || null,
        stakeProofUrl: market.viewerWager?.stakeTxHash
          ? buildWoloRestTxLookupUrl(market.viewerWager.stakeTxHash)
          : null,
      } satisfies BetBookEntry;
    })
    .sort((left, right) => right.amountWolo - left.amountWolo);


  const activeBookMarketIds = new Set(activeOpenWagers.map((entry) => entry.marketId));
  const recentClosedWagers = await loadViewerRecentClosedBookEntries(
    prisma,
    viewer?.id ?? null,
    activeBookMarketIds
  );
  const openWagers = [...activeOpenWagers, ...recentClosedWagers];

  const bestReturn = primaryOpenMarkets.reduce<{
    label: string;
    returnMultiplier: number;
  } | null>((current, market) => {
    const leftProjection = projectReturnWolo(25, market.left.poolWolo, market.right.poolWolo) / 25;
    const rightProjection = projectReturnWolo(25, market.right.poolWolo, market.left.poolWolo) / 25;
    const leftLabel = `${market.left.name} · ${market.eventLabel}`;
    const rightLabel = `${market.right.name} · ${market.eventLabel}`;

    const candidate =
      leftProjection >= rightProjection
        ? { label: leftLabel, returnMultiplier: Number(leftProjection.toFixed(2)) }
        : { label: rightLabel, returnMultiplier: Number(rightProjection.toFixed(2)) };

    if (!current || candidate.returnMultiplier > current.returnMultiplier) {
      return candidate;
    }

    return current;
  }, null);

  const biggestPot = [...primaryOpenMarkets.map((market) => ({
    label: market.title,
    potWolo: market.totalPotWolo,
  })), ...settledResults.map((result) => ({
    label: result.title,
    potWolo: result.totalPotWolo,
  }))].reduce<{
    label: string;
    potWolo: number;
  } | null>((current, market) => {
    const candidate = { label: market.label, potWolo: market.potWolo };
    if (!current || candidate.potWolo > current.potWolo) {
      return candidate;
    }
    return current;
  }, null);

  return {
    generatedAt: new Date().toISOString(),
    viewerName: viewer?.inGameName || viewer?.steamPersonaName || null,
    wolo: {
      betEscrowMode: escrowRuntime.mode,
      betEscrowAddress: escrowRuntime.escrowAddress,
      onchainEscrowEnabled: escrowRuntime.onchainAllowed,
      onchainEscrowRequired: escrowRuntime.onchainRequired,
      escrowConfigError: escrowRuntime.configError,
      betTestMode: WOLO_BET_TEST_MODE,
      settlementServiceConfigured: settlementSurface.settlementServiceConfigured,
      settlementAuthConfigured: settlementSurface.settlementAuthConfigured,
      settlementExecutionMode: settlementSurface.payoutExecutionMode,
      groupedRunCapability: settlementSurface.groupedRunCapability,
      escrowVerifyCapability: settlementSurface.escrowVerifyCapability,
      escrowRecentCapability: settlementSurface.escrowRecentCapability,
      settlementSurfaceWarnings: settlementSurface.warnings,
      settlementSurfaceDetail: settlementSurface.detail,
    },
    recovery: {
      unresolvedStakeIntents: unresolvedStakeIntents.map((intent) => ({
        id: intent.id,
        marketId: intent.marketId,
        marketStatus: intent.market.status as BetStatus,
        title: intent.market.title,
        eventLabel: intent.market.eventLabel,
        side: intent.side === "right" ? "right" : "left",
        amountWolo: intent.amountWolo,
        status: intent.status,
        stakeTxHash: intent.stakeTxHash ?? null,
        walletAddress: intent.walletAddress ?? null,
        errorDetail: intent.errorDetail ?? null,
        updatedAt: intent.updatedAt.toISOString(),
      })),
      unresolvedStakeTickets: unresolvedStakeTickets.map((ticket) => ({
        id: ticket.id,
        version: ticket.version,
        status: ticket.status,
        totalAmountWolo: ticket.totalAmountWolo,
        stakeTxHash: ticket.stakeTxHash ?? null,
        walletAddress: ticket.walletAddress,
        memo: buildBetStakeTicketMemo(ticket.id, ticket.version),
        errorDetail: ticket.errorDetail ?? null,
        updatedAt: ticket.updatedAt.toISOString(),
        legs: ticket.legs.map((leg) => ({
          marketId: leg.marketId,
          marketStatus: leg.market.status as BetStatus,
          title: leg.market.title,
          eventLabel: leg.market.eventLabel,
          legRole: leg.legRole,
          side: leg.side === "right" ? "right" : "left",
          amountWolo: leg.amountWolo,
        })),
      })),
    },
    featuredMarket,
    openMarkets,
    awaitingProofMarkets,
    settledResults,
    yourBook: {
      activeCount: activeOpenWagers.reduce((sum, wager) => sum + wager.slipCount, 0),
      stakedWolo: activeOpenWagers.reduce((sum, wager) => sum + wager.amountWolo, 0),
      projectedReturnWolo: activeOpenWagers.reduce(
        (sum, wager) => sum + wager.projectedReturnWolo,
        0
      ),
      openWagers,
    },
    heat: {
      biggestPot,
      bestReturn,
      liveCount: primaryOpenMarkets.filter((market) => market.status === "live").length,
    },
  };
}
