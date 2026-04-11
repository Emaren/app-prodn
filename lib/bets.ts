import type { PrismaClient } from "@/lib/generated/prisma";
import {
  loadScheduledMatchTilesForLiveBoard,
  type ScheduledMatchTile,
} from "@/lib/challenges";
import { parsePlayers, readMapName } from "@/lib/gameStatsView";
import {
  loadLiveSessionSnapshot,
  type LiveGameSession,
} from "@/lib/liveSessionSnapshot";
import { resolveFinalGameStatsIdForSessionKey } from "@/lib/liveReplayDetail";
import {
  createPendingWoloClaim,
  normalizePendingWoloClaimName,
} from "@/lib/pendingWoloClaims";
import { settleFounderBonuses } from "@/lib/betFounderBonuses";
import {
  executeWoloSettlementRun,
  getWoloSettlementSurfaceStatus,
  hasWoloPayoutExecutionConfigured,
  type SettlementRunResult,
  validateWoloSettlementRun,
} from "@/lib/woloBetSettlement";
import { recordUserActivity } from "@/lib/userExperience";
import {
  WOLO_BET_TEST_MODE,
  buildWoloRestTxLookupUrl,
  getWoloBetEscrowRuntime,
} from "@/lib/woloChain";
import {
  BET_STAKE_INTENT_RECOVERABLE_STATUSES,
  isBetStakeIntentCountableStatus,
  loadViewerBetStakeIntents,
} from "@/lib/betStakeIntents";

export type BetSide = "left" | "right";
export type BetStatus = "open" | "closing" | "live" | "settled";
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

export type BetBoardMarket = {
  id: number;
  slug: string;
  title: string;
  eventLabel: string;
  href: string | null;
  linkedSessionKey: string | null;
  linkedGameStatsId: number | null;
  status: BetStatus;
  featured: boolean;
  closeLabel: string;
  totalPotWolo: number;
  left: BetBoardSide;
  right: BetBoardSide;
  founderBonuses: BetFounderChip[];
  warTape: BetWarTapeRow[];
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
  status: BetStatus;
  executionMode: "app_only" | "onchain_escrow";
  stakeTxHash: string | null;
  stakeProofUrl: string | null;
};

export type BetSettledResult = {
  id: number;
  title: string;
  eventLabel: string;
  winner: string;
  mapName: string;
  totalPotWolo: number;
  payoutWolo: number;
  settledAt: string | null;
  href: string | null;
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
  };
  featuredMarket: BetBoardMarket | null;
  openMarkets: BetBoardMarket[];
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
const CHALLENGE_MARKET_SLUG_PREFIX = "challenge-runway-";
const WATCHER_MARKET_SLUG_PREFIX = "watcher-live-";

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

function buildBetMarketHref(input: {
  linkedGameStatsId: number | null;
  linkedSessionKey: string | null;
}) {
  if (typeof input.linkedGameStatsId === "number" && Number.isFinite(input.linkedGameStatsId)) {
    return `/game-stats/${input.linkedGameStatsId}`;
  }

  const sessionKey = input.linkedSessionKey?.trim();
  if (sessionKey) {
    return `/game-stats/live/${encodeURIComponent(sessionKey)}`;
  }

  return null;
}

function getNamedSessionPlayers(session: LiveGameSession) {
  const seen = new Map<string, { name: string; winner: boolean | null }>();

  for (const player of session.players) {
    const name = normalizeName(player.name);
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, { name, winner: player.winner });
      continue;
    }

    if (player.winner === true && existing.winner !== true) {
      existing.winner = true;
    }
  }

  return Array.from(seen.values());
}

type SessionSideDescription = {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftNames: string[];
  rightNames: string[];
};

function describeSessionSides(session: LiveGameSession): SessionSideDescription | null {
  const players = getNamedSessionPlayers(session);

  if (players.length < 2) {
    return null;
  }

  const [focusPlayer, ...fieldPlayers] = players;
  if (fieldPlayers.length === 0) {
    return null;
  }

  return {
    title: players.map((player) => player.name).join(" vs "),
    leftLabel: focusPlayer.name,
    rightLabel:
      fieldPlayers.length === 1
        ? fieldPlayers[0].name
        : fieldPlayers.map((player) => player.name).join(" / "),
    leftNames: [focusPlayer.name],
    rightNames: fieldPlayers.map((player) => player.name),
  };
}

function inferWinnerSideFromSession(session: LiveGameSession): BetSide | null {
  const sides = describeSessionSides(session);
  if (!sides) return null;

  const normalizedWinner = normalizeName(session.winner).toLowerCase();
  if (normalizedWinner) {
    if (sides.leftNames.some((name) => name.toLowerCase() === normalizedWinner)) return "left";
    if (sides.rightNames.some((name) => name.toLowerCase() === normalizedWinner)) return "right";
  }

  const players = getNamedSessionPlayers(session);
  const leftWinner = players.some(
    (player) => player.winner === true && sides.leftNames.includes(player.name)
  );
  const rightWinner = players.some(
    (player) => player.winner === true && sides.rightNames.includes(player.name)
  );

  if (leftWinner && !rightWinner) return "left";
  if (rightWinner && !leftWinner) return "right";

  return null;
}

type MarketSeed = {
  scheduledMatchId: number | null;
  linkedSessionKey: string | null;
  slug: string;
  title: string;
  eventLabel: string;
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
  settledAt: Date | null;
  winnerSide: BetSide | null;
};

function marketSeedCreateData(seed: MarketSeed) {
  return {
    scheduledMatchId: seed.scheduledMatchId,
    linkedSessionKey: seed.linkedSessionKey,
    slug: seed.slug,
    title: seed.title,
    eventLabel: seed.eventLabel,
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
    settledAt: seed.settledAt,
    winnerSide: seed.winnerSide,
  };
}

function marketSeedUpdateData(
  seed: MarketSeed,
  existing?: {
    status: string;
    settledAt: Date | null;
    winnerSide: string | null;
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

  return {
    scheduledMatchId: seed.scheduledMatchId,
    linkedSessionKey: seed.linkedSessionKey,
    title: seed.title,
    eventLabel: seed.eventLabel,
    status: keepSettledWinnerLatch ? "settled" : seed.status,
    featured: keepSettledWinnerLatch ? false : seed.featured,
    sortOrder: seed.sortOrder,
    leftLabel: seed.leftLabel,
    rightLabel: seed.rightLabel,
    leftHref: seed.leftHref,
    rightHref: seed.rightHref,
    seedLeftWolo: seed.seedLeftWolo,
    seedRightWolo: seed.seedRightWolo,
    closeAt: keepSettledWinnerLatch ? null : seed.closeAt,
    settledAt: keepSettledWinnerLatch ? existing?.settledAt ?? seed.settledAt : seed.settledAt,
    winnerSide: keepSettledWinnerLatch ? existingWinnerSide : seed.winnerSide,
  };
}

function buildSessionMarketSlug(session: LiveGameSession, leftLabel: string, rightLabel: string) {
  const stableKey = slugify(
    session.sessionKey || session.originalFilename || `${leftLabel}-vs-${rightLabel}`
  );
  return `${WATCHER_MARKET_SLUG_PREFIX}${stableKey}`.slice(0, 120);
}

function buildSessionEventLabel(session: LiveGameSession) {
  return buildWatcherEventLabel(session.state === "live" ? "Live" : "Final", session.mapName);
}

function buildWatcherEventLabel(mode: "Live" | "Final", mapName: string | null | undefined) {
  const normalizedMapName = normalizeName(mapName);
  return normalizedMapName ? `Watcher ${mode} • ${normalizedMapName}` : `Watcher ${mode}`;
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

function splitSideNames(label: string) {
  return normalizeName(label)
    .split(/\s*\/\s*/)
    .map((value) => normalizeName(value))
    .filter(Boolean)
    .map((value) => value.toLowerCase());
}

function inferWinnerSideFromGameStats(
  market: {
    leftLabel: string;
    rightLabel: string;
  },
  game: {
    winner: string | null;
    players: unknown;
  }
): BetSide | null {
  const leftNames = splitSideNames(market.leftLabel);
  const rightNames = splitSideNames(market.rightLabel);
  const normalizedWinner = normalizeName(game.winner).toLowerCase();

  if (normalizedWinner) {
    if (leftNames.includes(normalizedWinner)) return "left";
    if (rightNames.includes(normalizedWinner)) return "right";
  }

  const players = parsePlayers(game.players);
  const leftWinner = players.some((player) => {
    const playerName = typeof player.name === "string" ? normalizeName(player.name).toLowerCase() : "";
    return Boolean(playerName && player.winner === true && leftNames.includes(playerName));
  });
  const rightWinner = players.some((player) => {
    const playerName = typeof player.name === "string" ? normalizeName(player.name).toLowerCase() : "";
    return Boolean(playerName && player.winner === true && rightNames.includes(playerName));
  });

  if (leftWinner && !rightWinner) return "left";
  if (rightWinner && !leftWinner) return "right";
  return null;
}

function buildSessionMarketSeed(
  session: LiveGameSession,
  index: number,
  featured: boolean
): MarketSeed | null {
  const sides = describeSessionSides(session);
  if (!sides) return null;

  const settledAtRaw = session.completedAt || session.updatedAt || session.createdAt;

  return {
    scheduledMatchId: null,
    linkedSessionKey: session.sessionKey || session.originalFilename || null,
    slug: buildSessionMarketSlug(session, sides.leftLabel, sides.rightLabel),
    title: sides.title,
    eventLabel: buildSessionEventLabel(session),
    status: session.state === "completed" ? "settled" : "live",
    featured,
    sortOrder: index,
    source: "session",
    leftLabel: sides.leftLabel,
    rightLabel: sides.rightLabel,
    leftHref: `/players/by-name/${encodeURIComponent(sides.leftLabel)}`,
    rightHref:
      sides.rightNames.length === 1
        ? `/players/by-name/${encodeURIComponent(sides.rightNames[0])}`
        : null,
    seedLeftWolo: 0,
    seedRightWolo: 0,
    closeAt: null,
    settledAt: session.state === "completed" ? new Date(settledAtRaw) : null,
    winnerSide: session.state === "completed" ? inferWinnerSideFromSession(session) : null,
  } satisfies MarketSeed;
}

function marketStatusFromScheduledMatch(displayState: ScheduledMatchTile["displayState"]): BetStatus {
  if (displayState === "live") return "live";
  if (displayState === "accepted") return "closing";
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
    ["accepted", "live", "completed", "forfeited", "declined", "cancelled"].includes(
      match.displayState
    )
  );
  const featuredChallengeIndex = challengeMatches.findIndex((match) =>
    ["accepted", "live"].includes(match.displayState)
  );

  return challengeMatches.map((match, index) => ({
    scheduledMatchId: match.id,
    linkedSessionKey: match.linkedSessionKey,
    slug: `${CHALLENGE_MARKET_SLUG_PREFIX}${match.id}`,
    title: `${match.challenger.name} vs ${match.challenged.name}`,
    eventLabel: match.linkedMapName ? `Scheduled Match • ${match.linkedMapName}` : "Scheduled Match",
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
      match.displayState === "cancelled"
        ? new Date(match.activityAt)
        : null,
    winnerSide: match.displayState === "completed" ? inferWinnerSideFromChallenge(match) : null,
  }) satisfies MarketSeed);
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

function buildMarketWarTapeRows(
  market: {
    leftLabel: string;
    rightLabel: string;
    wagers: Array<{
      id: number;
      side: string;
      amountWolo: number;
      stakeTxHash: string | null;
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
    const txHash = wager.stakeTxHash?.trim() || null;

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
    const evenSplit = Math.round(bonus.totalAmountWolo / 2);
    const note =
      bonus.bonusType === "winner"
        ? `${actorName} added ${bonus.totalAmountWolo} WOLO -> winner`
        : `${actorName} added ${bonus.totalAmountWolo} WOLO -> ${evenSplit} each`;

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

function resolveMarketSettlementStatus(
  execution: SettlementRunResult | null,
  validation: SettlementRunResult | null,
  claimPlanCount: number
) {
  if (execution) {
    if (execution.status === "partial") return "partial";
    if (execution.ok && execution.executedPayoutCount > 0) return "executed";
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
    stakeIntent?: { status: string | null } | null;
  }
) {
  return (
    wager.executionMode !== "onchain_escrow" || isCountableOnchainWagerStakeIntent(wager.stakeIntent)
  );
}

function buildCountableActiveWagerWhere() {
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

  if (!detail && normalizedWarnings.length === 0) {
    return null;
  }

  if (!detail) {
    return normalizedWarnings.join(" ");
  }

  if (normalizedWarnings.length === 0) {
    return detail;
  }

  return `${detail} Warnings: ${normalizedWarnings.join(" ")}`;
}

async function settleResolvedMarketWagers(prisma: PrismaClient) {
  const markets = await prisma.betMarket.findMany({
    where: {
      status: "settled",
      wagers: {
        some: buildCountableActiveWagerWhere(),
      },
    },
    select: {
      id: true,
      title: true,
      eventLabel: true,
      leftLabel: true,
      rightLabel: true,
      linkedGameStatsId: true,
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
    const winningSide =
      market.winnerSide === "left" || market.winnerSide === "right"
        ? market.winnerSide
        : null;
    const winningUserPool = winningSide
      ? market.wagers
          .filter((wager) => wager.side === winningSide)
          .reduce((sum, wager) => sum + wager.amountWolo, 0)
      : 0;
    const losingSidePool =
      winningSide === "left"
        ? market.seedRightWolo +
          market.wagers
            .filter((wager) => wager.side === "right")
            .reduce((sum, wager) => sum + wager.amountWolo, 0)
        : winningSide === "right"
        ? market.seedLeftWolo +
          market.wagers
            .filter((wager) => wager.side === "left")
            .reduce((sum, wager) => sum + wager.amountWolo, 0)
        : 0;

    const claimPlans = new Map<string, MarketSettlementClaimPlan>();

    await prisma.$transaction(async (tx) => {
      for (const wager of market.wagers) {
        let nextStatus: "won" | "lost" | "void";
        let payoutWolo: number;

        if (!winningSide) {
          nextStatus = "void";
          payoutWolo = wager.amountWolo;
        } else if (wager.side !== winningSide) {
          nextStatus = "lost";
          payoutWolo = 0;
        } else {
          nextStatus = "won";
          payoutWolo =
            winningUserPool > 0
              ? Math.max(
                  wager.amountWolo,
                  Math.round(
                    wager.amountWolo +
                      losingSidePool * (wager.amountWolo / winningUserPool)
                  )
                )
              : wager.amountWolo;
        }

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
    });

    if (winningSide) {
      const winningWagers = market.wagers.filter((wager) => wager.side === winningSide);
      const losingWagers = market.wagers.filter((wager) => wager.side !== winningSide);
      const winnerBountyWolo = losingWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);

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
        hasWoloPayoutExecutionConfigured()
    );

    let validationResult: SettlementRunResult | null = null;
    let executionResult: SettlementRunResult | null = null;
    let settlementRunId: string | null = null;
    let settlementAttemptedAt: Date | null = null;
    let settlementExecutedAt: Date | null = null;

    if (autoClaimPlans.length > 0) {
      settlementRunId = buildMarketSettlementRunId(market.id);
      settlementAttemptedAt = new Date();
      validationResult = await validateWoloSettlementRun({
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

      executionResult = await executeWoloSettlementRun({
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
    const settlementStatus = resolveMarketSettlementStatus(
      executionResult,
      validationResult,
      claimPlanList.length
    );
    const settlementFailureCode =
      executionResult?.failureCode || validationResult?.failureCode || null;
    const settlementDetail = combineSettlementDetail(
      executionResult?.detail ||
      validationResult?.detail ||
      (claimPlanList.length > 0 && autoClaimPlans.length === 0
        ? hasWoloPayoutExecutionConfigured()
          ? "Claim rail pending manual or unmatched payouts."
          : "Settlement execution is not configured in this environment."
        : null),
      [...(validationResult?.warnings || []), ...(executionResult?.warnings || [])]
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
        },
      });

      for (const plan of claimPlanList) {
        const payout = payoutByRequestId.get(plan.requestId);
        const payoutSucceeded = Boolean(payout?.ok && payout.txHash);
        const awaitingWalletLink = !plan.walletAddress || !plan.claimedByUserId;
        const payoutError = resolveSettlementPlanError(validationResult, payout);
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
            payoutProofUrl: payout?.proofUrl ?? null,
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
                payoutProofUrl: payout?.proofUrl ?? null,
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
            payoutProofUrl: payout?.proofUrl ?? null,
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
              payoutProofUrl: payout?.proofUrl ?? null,
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


async function buildOpenMarketSeeds(prisma: PrismaClient) {
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
  const visibleSessionKeys = new Set(
    [...sessionSnapshot.activeSessions, ...sessionSnapshot.recentlyCompletedSessions]
      .map((session) => normalizeName(session.sessionKey))
      .filter(Boolean)
  );

  const seeds: MarketSeed[] = [];
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
    const seed = buildSessionMarketSeed(session, index, !hasFeaturedChallenge && seeds.length === 0);
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

  return {
    seeds,
    visibleSessionKeys,
  };
}

async function reconcileBetMarketStatsLinks(prisma: PrismaClient) {
  const markets = await prisma.betMarket.findMany({
    where: {
      linkedSessionKey: { not: null },
    },
    select: {
      id: true,
      linkedSessionKey: true,
      linkedGameStatsId: true,
    },
  });

  const finalGameIdBySessionKey = new Map<string, number | null>();

  for (const market of markets) {
    const sessionKey = market.linkedSessionKey?.trim();
    if (!sessionKey) {
      continue;
    }

    if (!finalGameIdBySessionKey.has(sessionKey)) {
      finalGameIdBySessionKey.set(
        sessionKey,
        await resolveFinalGameStatsIdForSessionKey(prisma, sessionKey)
      );
    }
  }

  await Promise.all(
    markets.map(async (market) => {
      const sessionKey = market.linkedSessionKey?.trim();
      if (!sessionKey) return;

      const finalGameId = finalGameIdBySessionKey.get(sessionKey) ?? null;
      if ((market.linkedGameStatsId ?? null) === finalGameId) {
        return;
      }

      await prisma.betMarket.update({
        where: { id: market.id },
        data: {
          linkedGameStatsId: finalGameId,
        },
      });
    })
  );
}

async function reconcileDetachedWatcherMarkets(
  prisma: PrismaClient,
  visibleSessionKeys: Set<string>
) {
  const markets = await prisma.betMarket.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      scheduledMatchId: null,
      linkedSessionKey: { not: null },
      ...(visibleSessionKeys.size > 0
        ? {
            NOT: {
              linkedSessionKey: {
                in: [...visibleSessionKeys],
              },
            },
          }
        : {}),
    },
    select: {
      id: true,
      linkedSessionKey: true,
      linkedGameStatsId: true,
      leftLabel: true,
      rightLabel: true,
      eventLabel: true,
      updatedAt: true,
    },
  });

  if (markets.length === 0) {
    return;
  }

  const finalGameIdBySessionKey = new Map<string, number | null>();
  const finalGameById = new Map<
    number,
    {
      id: number;
      winner: string | null;
      players: unknown;
      map: unknown;
      timestamp: Date | null;
      createdAt: Date;
    } | null
  >();

  for (const market of markets) {
    const sessionKey = normalizeName(market.linkedSessionKey);
    if (!sessionKey || visibleSessionKeys.has(sessionKey)) {
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
        await prisma.gameStats.findUnique({
          where: { id: finalGameId },
          select: {
            id: true,
            winner: true,
            players: true,
            map: true,
            timestamp: true,
            createdAt: true,
          },
        })
      );
    }
  }

  await Promise.all(
    markets.map(async (market) => {
      const sessionKey = normalizeName(market.linkedSessionKey);
      if (!sessionKey || visibleSessionKeys.has(sessionKey)) {
        return;
      }

      const finalGameId = finalGameIdBySessionKey.get(sessionKey) ?? null;
      const finalGame = finalGameId ? finalGameById.get(finalGameId) ?? null : null;
      const winnerSide = finalGame
        ? inferWinnerSideFromGameStats(market, finalGame)
        : null;
      const settledAt = finalGame?.timestamp ?? finalGame?.createdAt ?? market.updatedAt ?? new Date();
      const mapName = finalGame ? readMapName(finalGame.map) : null;

      await prisma.betMarket.update({
        where: { id: market.id },
        data: {
          status: "settled",
          featured: false,
          closeAt: null,
          settledAt,
          winnerSide,
          linkedGameStatsId: finalGame?.id ?? market.linkedGameStatsId ?? null,
          eventLabel: buildWatcherEventLabel(
            "Final",
            mapName && mapName !== "Unknown Map"
              ? mapName
              : market.eventLabel.includes("•")
                ? market.eventLabel.split("•").slice(1).join("•").trim() || null
                : null
          ),
        },
      });
    })
  );
}

export async function ensureBetMarkets(prisma: PrismaClient) {
  const { seeds, visibleSessionKeys } = await buildOpenMarketSeeds(prisma);
  const slugs = [...new Set(seeds.map((seed) => seed.slug))];
  const staleMarketCutoff = new Date(Date.now() - 2 * 60_000);
  const existingMarkets = await prisma.betMarket.findMany({
    where: slugs.length > 0 ? { slug: { in: slugs } } : undefined,
    select: {
      slug: true,
      status: true,
      settledAt: true,
      winnerSide: true,
    },
  });
  const existingBySlug = new Map(existingMarkets.map((market) => [market.slug, market] as const));

  await Promise.all(
    seeds.map(async (seed) => {
      await prisma.betMarket.upsert({
        where: { slug: seed.slug },
        create: marketSeedCreateData(seed),
        update: marketSeedUpdateData(seed, existingBySlug.get(seed.slug)),
      });
    })
  );

  await reconcileDetachedWatcherMarkets(prisma, visibleSessionKeys);

  await prisma.betMarket.updateMany({
    where:
      slugs.length > 0
        ? {
            slug: { notIn: slugs },
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
          }
        : {
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
          },
    data: {
      status: "settled",
      featured: false,
      settledAt: new Date(),
      winnerSide: null,
      closeAt: null,
    },
  });

  await settleResolvedMarketWagers(prisma);
  await reconcileBetMarketStatsLinks(prisma);
  await settleFounderBonuses(prisma);
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
  const warTape = buildMarketWarTapeRows(market, claimsByMarketId.get(market.id) ?? []);

  return {
    id: market.id,
    slug: market.slug,
    title: market.title,
    eventLabel: market.eventLabel,
    href: buildBetMarketHref({
      linkedGameStatsId: market.linkedGameStatsId ?? null,
      linkedSessionKey,
    }),
    linkedSessionKey,
    linkedGameStatsId: market.linkedGameStatsId ?? null,
    status: market.status as BetStatus,
    featured: market.featured,
    closeLabel: formatCloseLabel(market.status as BetStatus, market.closeAt),
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
    viewerWager: latestViewerWager
      ? {
          side: latestViewerWager.side as BetSide,
          amountWolo: aggregatedViewerAmount,
          slipCount: viewerWagers.length,
          executionMode:
            viewerWagers.some((wager) => wager.executionMode === "onchain_escrow")
              ? "onchain_escrow"
              : "app_only",
          stakeTxHash: latestViewerWager.stakeTxHash ?? null,
          stakeWalletAddress: latestViewerWager.stakeWalletAddress ?? null,
          stakeLockedAt: latestViewerWager.stakeLockedAt?.toISOString() ?? null,
        }
      : null,
    winnerSide:
      market.winnerSide === "left" || market.winnerSide === "right"
        ? (market.winnerSide as BetSide)
        : null,
  };
}

async function loadOpenMarkets(prisma: PrismaClient) {
  return prisma.betMarket.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    include: {
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
}

async function loadRecentSettledResults(prisma: PrismaClient): Promise<BetSettledResult[]> {
  const [settledMarkets, sessionSnapshot] = await Promise.all([
    prisma.betMarket.findMany({
      where: {
        status: "settled",
        winnerSide: {
          in: ["left", "right"],
        },
      },
      orderBy: [{ settledAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 4,
      include: {
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
            stakeIntent: {
              select: {
                status: true,
              },
            },
          },
        },
      },
    }),
    loadLiveSessionSnapshot(prisma),
  ]);

  const sessionHrefByMatchKey = new Map(
    sessionSnapshot.recentlyCompletedSessions.map((session) => [
      normalizeSettledMatchKey(buildSessionMarketTitle(session), session.mapName),
      {
        href: `/game-stats/live/${encodeURIComponent(session.sessionKey)}`,
        settledAt: session.completedAt || session.updatedAt || session.createdAt,
      },
    ])
  );

  if (settledMarkets.length > 0) {
    return settledMarkets.map((market) => {
      const winner = market.winnerSide === "right" ? market.rightLabel : market.leftLabel;
      const countableWagers = market.wagers.filter(
        (wager) => wager.status !== "void" && isCountableBetWager(wager)
      );
      const totalPotWolo =
        market.seedLeftWolo +
        market.seedRightWolo +
        countableWagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
      const settledPayoutTotal = market.wagers
        .filter((wager) => wager.status === "won")
        .reduce((sum, wager) => sum + (wager.payoutWolo ?? 0), 0);
      const payoutWolo =
        settledPayoutTotal > 0
          ? settledPayoutTotal
          : totalPotWolo;
      const mapName = market.eventLabel.includes("•")
        ? market.eventLabel.split("•").slice(1).join("•").trim() || market.eventLabel
        : market.eventLabel;
      const matchedSession = sessionHrefByMatchKey.get(
        normalizeSettledMatchKey(market.title, mapName)
      );
      const linkedSessionKey =
        market.linkedSessionKey?.trim() || market.scheduledMatch?.linkedSessionKey?.trim() || null;
      const href =
        buildBetMarketHref({
          linkedGameStatsId: market.linkedGameStatsId ?? null,
          linkedSessionKey,
        }) ||
        matchedSession?.href ||
        null;

      return {
        id: market.id,
        title: market.title,
        eventLabel: market.eventLabel,
        winner,
        mapName,
        totalPotWolo,
        payoutWolo,
        settledAt: matchedSession?.settledAt || market.settledAt?.toISOString() || null,
        href,
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
      title,
      eventLabel: row.parse_reason ? row.parse_reason.replace(/_/g, " ") : "Replay proof",
      winner: row.winner || "Unknown",
      mapName,
      totalPotWolo: 110 + (hashValue(`${row.id}:${row.winner}:pot`) % 240),
      payoutWolo: 110 + (hashValue(`${row.id}:${row.winner}`) % 240),
      settledAt: row.played_on?.toISOString() || row.timestamp?.toISOString() || null,
      href: null,
      founderBonuses: [],
    };
  });
}

export async function loadBetBoardSnapshot(
  prisma: PrismaClient,
  viewerUid?: string | null
): Promise<BetBoardSnapshot> {
  await ensureBetMarkets(prisma);
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

  const [openMarketsRaw, settledResults, unresolvedStakeIntents, settlementSurface] = await Promise.all([
    loadOpenMarkets(prisma),
    loadRecentSettledResults(prisma),
    viewer?.id ? loadViewerBetStakeIntents(prisma, viewer.id) : Promise.resolve([]),
    getWoloSettlementSurfaceStatus(),
  ]);

  const openMarketIds = openMarketsRaw.map((market) => market.id);
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

  const openMarkets = openMarketsRaw.map((market) =>
    buildMarketCard(market, viewer?.id ?? null, claimsByMarketId)
  );
  const featuredMarket = openMarkets.find((market) => market.featured) || openMarkets[0] || null;

  const openWagers = openMarkets
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
        status: market.status,
        executionMode: market.viewerWager?.executionMode || "app_only",
        stakeTxHash: market.viewerWager?.stakeTxHash || null,
        stakeProofUrl: market.viewerWager?.stakeTxHash
          ? buildWoloRestTxLookupUrl(market.viewerWager.stakeTxHash)
          : null,
      } satisfies BetBookEntry;
    })
    .sort((left, right) => right.amountWolo - left.amountWolo);

  const bestReturn = openMarkets.reduce<{
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

  const biggestPot = [...openMarkets.map((market) => ({
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
    },
    featuredMarket,
    openMarkets,
    settledResults,
    yourBook: {
      activeCount: openWagers.reduce((sum, wager) => sum + wager.slipCount, 0),
      stakedWolo: openWagers.reduce((sum, wager) => sum + wager.amountWolo, 0),
      projectedReturnWolo: openWagers.reduce(
        (sum, wager) => sum + wager.projectedReturnWolo,
        0
      ),
      openWagers,
    },
    heat: {
      biggestPot,
      bestReturn,
      liveCount: openMarkets.filter((market) => market.status === "live").length,
    },
  };
}
