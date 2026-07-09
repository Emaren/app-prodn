import type { PrismaClient } from "@/lib/generated/prisma";
import {
  loadScheduledMatchTilesForLiveBoard,
  type ScheduledMatchTile,
} from "@/lib/challenges";
import { parsePlayers, readMapName } from "@/lib/gameStatsView";
import { loadLiveSessionSnapshot, type LiveGameSession } from "@/lib/liveSessionSnapshot";
import { loadLiveGamesSnapshot } from "@/lib/liveGames";
import { resolveFinalGameStatsIdForSessionKey } from "@/lib/liveReplayDetail";
import { resolveReplayWinnerTruth } from "@/lib/unresolvedWatcherResult";
import {
  createPendingWoloClaim,
  normalizePendingWoloClaimName,
} from "@/lib/pendingWoloClaims";
import { settleFounderBonuses } from "@/lib/betFounderBonuses";
import {
  executeWoloSettlementRun,
  getWoloPayoutExecutionBlocker,
  getWoloSettlementSurfaceStatus,
  hasWoloPayoutExecutionConfigured,
  type SettlementRunResult,
  validateWoloSettlementRun,
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
  slug: string;
  title: string;
  eventLabel: string;
  href: string | null;
  linkedSessionKey: string | null;
  linkedGameStatsId: number | null;
  status: BetStatus;
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
  title: string;
  eventLabel: string;
  winner: string;
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

function getNamedSessionPlayers(session: LiveGameSession) {
  const seen = new Map<
    string,
    {
      name: string;
      winner: boolean | null;
      team?: unknown;
      teamNumber?: unknown;
      team_number?: unknown;
      teamId?: unknown;
      team_id?: unknown;
    }
  >();

  for (const player of session.players) {
    const name = normalizeName(player.name);
    if (!name) continue;

    const record = player as {
      name?: unknown;
      winner?: boolean | null;
      team?: unknown;
      teamNumber?: unknown;
      team_number?: unknown;
      teamId?: unknown;
      team_id?: unknown;
    };

    const key = name.toLowerCase();
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, {
        name,
        winner: player.winner,
        team: record.team,
        teamNumber: record.teamNumber,
        team_number: record.team_number,
        teamId: record.teamId,
        team_id: record.team_id,
      });
      continue;
    }

    if (player.winner === true && existing.winner !== true) {
      existing.winner = true;
    }

    existing.team ??= record.team;
    existing.teamNumber ??= record.teamNumber;
    existing.team_number ??= record.team_number;
    existing.teamId ??= record.teamId;
    existing.team_id ??= record.team_id;
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


function readSessionPlayerTeam(player: ReturnType<typeof getNamedSessionPlayers>[number]) {
  const record = player as {
    team?: unknown;
    teamNumber?: unknown;
    team_number?: unknown;
    teamId?: unknown;
    team_id?: unknown;
  };

  const rawTeam =
    record.team ??
    record.teamNumber ??
    record.team_number ??
    record.teamId ??
    record.team_id ??
    null;

  if (typeof rawTeam === "number" && Number.isFinite(rawTeam) && rawTeam > 0) {
    return String(Math.trunc(rawTeam));
  }

  const teamText = normalizeName(String(rawTeam ?? ""));
  if (!teamText) return null;

  const lowered = teamText.toLowerCase();
  if (lowered === "0" || lowered === "-1" || lowered === "none" || lowered === "unknown") {
    return null;
  }

  return teamText;
}

function teamSortKey(team: string) {
  const numeric = Number(team);
  return Number.isFinite(numeric) ? numeric : 999;
}

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
  const players = getNamedSessionPlayers(session);

  if (players.length < 2) {
    return null;
  }

  const teams = new Map<string, string[]>();

  for (const player of players) {
    const team = readSessionPlayerTeam(player);
    if (!team) continue;

    const existing = teams.get(team) || [];
    existing.push(player.name);
    teams.set(team, existing);
  }

  const teamEntries = [...teams.entries()]
    .filter(([, names]) => names.length > 0)
    .sort((left, right) => teamSortKey(left[0]) - teamSortKey(right[0]) || left[0].localeCompare(right[0]));

  if (teamEntries.length === 2) {
    const leftNames = teamEntries[0][1];
    const rightNames = teamEntries[1][1];
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

  const balancedTeamSize = players.length / 2;

  if (
    Number.isInteger(balancedTeamSize) &&
    balancedTeamSize >= 1 &&
    balancedTeamSize <= 4
  ) {
    const leftNames = players.slice(0, balancedTeamSize).map((player) => player.name);
    const rightNames = players.slice(balancedTeamSize).map((player) => player.name);
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

function clampDbText(value: string, max: number) {
  if (value.length <= max) return value;
  if (max <= 1) return value.slice(0, max);
  return `${value.slice(0, max - 1).trimEnd()}…`;
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

function splitSideNames(label: string) {
  return normalizeName(label)
    .split(/\s*\/\s*|\s+\+\s+/)
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
    parse_reason?: string | null;
    key_events?: unknown;
  }
): BetSide | null {
  const leftNames = splitSideNames(market.leftLabel);
  const rightNames = splitSideNames(market.rightLabel);
  const players = parsePlayers(game.players);
  const winnerTruth = resolveReplayWinnerTruth({
    winner: game.winner,
    players,
    parseReason: game.parse_reason,
    keyEvents: game.key_events,
  });
  if (!winnerTruth.bettingEligible) return null;

  const normalizedWinner = normalizeName(winnerTruth.winner).toLowerCase();

  if (normalizedWinner) {
    if (leftNames.includes(normalizedWinner)) return "left";
    if (rightNames.includes(normalizedWinner)) return "right";
  }

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

  // A watcher row is not a bettable market until the parser can name both sides.
  if (!sides) return null;

  const leftLabel = sides.leftLabel;
  const rightLabel = sides.rightLabel;
  const rightNames = sides.rightNames;
  const title = sides.title;
  const settledAtRaw = session.completedAt || session.updatedAt || session.createdAt;
  const seed = {
    scheduledMatchId: null,
    linkedSessionKey: session.sessionKey || session.originalFilename || null,
    slug: buildSessionMarketSlug(session, leftLabel, rightLabel),
    title,
    eventLabel: buildSessionEventLabel(session),
    status: session.state === "completed" ? "settled" : "live",
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
    closeAt: null,
    settledAt: session.state === "completed" ? new Date(settledAtRaw) : null,
    winnerSide:
      session.state === "completed"
        ? inferWinnerSideFromSession(session)
        : null,
  } satisfies MarketSeed;

  return isConfidentBetMarket(seed) ? seed : null;
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
        match.displayState === "no_show_left" ||
        match.displayState === "no_show_right" ||
        match.displayState === "double_no_show" ||
        match.displayState === "refunded"
          ? new Date(match.activityAt)
          : null,
      winnerSide: match.displayState === "completed" ? inferWinnerSideFromChallenge(match) : null,
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
};

function settlementTruthName(value: string | null | undefined) {
  return normalizeName(value).toLowerCase();
}

function settlementTruthSide(
  market: Pick<SettlementWinnerTruthMarket, "leftLabel" | "rightLabel">,
  value: string | null | undefined
): BetSide | null {
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
  prisma: Pick<PrismaClient, "gameStats">,
  market: SettlementWinnerTruthMarket,
  winningSide: BetSide | null
) {
  if (!market.linkedGameStatsId || !winningSide) return;

  const game = await prisma.gameStats.findUnique({
    where: { id: market.linkedGameStatsId },
    select: { id: true, winner: true, players: true },
  });

  if (!game) {
    throw new Error(
      "WINNER_TRUTH_MISMATCH: market " +
        market.id +
        " linked game_stats " +
        market.linkedGameStatsId +
        " is missing"
    );
  }

  const rowSide = settlementTruthSide(market, game.winner);
  if (game.winner && !rowSide) {
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
  const players = Array.isArray(game.players) ? game.players : [];

  for (const player of players) {
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
    stakeTxHash?: string | null;
    createdAt?: Date | string | null;
    stakeLockedAt?: Date | string | null;
    stakeIntent?: { status: string | null } | null;
  }
) {
  if (!isMainnetVisibleBetWager(wager)) {
    return false;
  }

  return (
    wager.executionMode !== "onchain_escrow" || isCountableOnchainWagerStakeIntent(wager.stakeIntent)
  );
}

function buildCountableActiveWagerWhere() {
  if (isWoloMainnet()) {
    return {
      status: "active",
      executionMode: "onchain_escrow",
      stakeTxHash: { not: null },
      stakeLockedAt: { gte: getWoloMainnetDisplayStartAt() },
      stakeIntent: {
        is: {
          status: "recorded",
        },
      },
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
    ],
  };
}

function allocateBettingFeeByWagerId(
  wagers: Array<{ id: number; amountWolo: number }>,
  totalFeeWolo: number
) {
  const feeByWagerId = new Map<number, number>();
  const totalWinningStake = wagers.reduce((sum, wager) => sum + wager.amountWolo, 0);

  if (totalFeeWolo <= 0 || totalWinningStake <= 0) {
    return feeByWagerId;
  }

  const allocations = wagers.map((wager) => {
    const exact = (totalFeeWolo * wager.amountWolo) / totalWinningStake;
    const base = Math.floor(exact);
    return {
      id: wager.id,
      amountWolo: wager.amountWolo,
      feeWolo: base,
      remainder: exact - base,
    };
  });

  let assigned = allocations.reduce((sum, allocation) => sum + allocation.feeWolo, 0);
  let remaining = Math.max(0, totalFeeWolo - assigned);

  allocations
    .sort((left, right) => {
      if (right.remainder !== left.remainder) return right.remainder - left.remainder;
      if (right.amountWolo !== left.amountWolo) return right.amountWolo - left.amountWolo;
      return left.id - right.id;
    })
    .forEach((allocation) => {
      if (remaining <= 0) return;
      allocation.feeWolo += 1;
      remaining -= 1;
    });

  assigned = allocations.reduce((sum, allocation) => sum + allocation.feeWolo, 0);
  if (assigned > totalFeeWolo) {
    let overage = assigned - totalFeeWolo;
    [...allocations]
      .sort((left, right) => {
        if (left.remainder !== right.remainder) return left.remainder - right.remainder;
        if (left.amountWolo !== right.amountWolo) return left.amountWolo - right.amountWolo;
        return right.id - left.id;
      })
      .forEach((allocation) => {
        if (overage <= 0 || allocation.feeWolo <= 0) return;
        allocation.feeWolo -= 1;
        overage -= 1;
      });
  }

  for (const allocation of allocations) {
    feeByWagerId.set(allocation.id, allocation.feeWolo);
  }

  return feeByWagerId;
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

    await assertSettlementWinnerTruthGate(prisma, market, winningSide);
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
    const settledUserPool = market.wagers.reduce((sum, wager) => sum + wager.amountWolo, 0);
    const bettingFeePoolWolo =
      winningSide && settledUserPool > 0
        ? Math.round((settledUserPool * BETTING_FEE_RATE_BPS) / BPS_DENOMINATOR)
        : 0;
    const feeByWinningWagerId = allocateBettingFeeByWagerId(
      winningSide ? market.wagers.filter((wager) => wager.side === winningSide) : [],
      bettingFeePoolWolo
    );

    const claimPlans = new Map<string, MarketSettlementClaimPlan>();

    await prisma.$transaction(async (tx) => {
      for (const wager of market.wagers) {
        let nextStatus: "won" | "lost" | "void";
        let payoutWolo: number;
        let bettingFeeWolo = 0;

        if (!winningSide) {
          nextStatus = "void";
          payoutWolo = wager.amountWolo;
        } else if (wager.side !== winningSide) {
          nextStatus = "lost";
          payoutWolo = 0;
        } else {
          nextStatus = "won";
          bettingFeeWolo = feeByWinningWagerId.get(wager.id) ?? 0;
          payoutWolo =
            winningUserPool > 0
              ? Math.max(
                  0,
                  Math.round(
                    wager.amountWolo +
                      losingSidePool * (wager.amountWolo / winningUserPool)
                  ) - bettingFeeWolo
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
    });

    if (winningSide) {
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


async function buildOpenMarketSeeds(prisma: PrismaClient) {
  const sessionSnapshot = await loadLiveGamesSnapshot(prisma);
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
      parse_reason: string | null;
      key_events: unknown;
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
            parse_reason: true,
            key_events: true,
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
    })
  );
}

async function reconcileChallengeSessionShadowMarkets(
  prisma: PrismaClient,
  seeds: MarketSeed[]
) {
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
      scheduledMatchId: true,
      linkedSessionKey: true,
      slug: true,
      status: true,
      leftLabel: true,
      rightLabel: true,
    },
  });

  const canonicalBySessionKey = new Map<string, (typeof markets)[number]>();
  for (const market of markets) {
    const sessionKey = normalizeName(market.linkedSessionKey);
    if (!sessionKey || typeof market.scheduledMatchId !== "number") {
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

    try {
      await prisma.$transaction(async (tx) => {
        const [sourceWallets, targetWallets] = await Promise.all([
          tx.betMarketWallet.findMany({
            where: { marketId: shadow.id },
            select: {
              id: true,
              walletAddress: true,
              side: true,
            },
          }),
          tx.betMarketWallet.findMany({
            where: { marketId: canonical.id },
            select: {
              walletAddress: true,
            },
          }),
        ]);
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
              marketId: canonical.id,
              side: wallet.side === "right" ? sideTransfer.right : sideTransfer.left,
            },
          });
        }

        await Promise.all([
          tx.betWager.updateMany({
            where: { marketId: shadow.id, side: "left" },
            data: { marketId: canonical.id, side: sideTransfer.left },
          }),
          tx.betWager.updateMany({
            where: { marketId: shadow.id, side: "right" },
            data: { marketId: canonical.id, side: sideTransfer.right },
          }),
          tx.betStakeIntent.updateMany({
            where: { marketId: shadow.id, side: "left" },
            data: { marketId: canonical.id, side: sideTransfer.left },
          }),
          tx.betStakeIntent.updateMany({
            where: { marketId: shadow.id, side: "right" },
            data: { marketId: canonical.id, side: sideTransfer.right },
          }),
          tx.betMarketFounderBonus.updateMany({
            where: { marketId: shadow.id },
            data: { marketId: canonical.id },
          }),
          tx.pendingWoloClaim.updateMany({
            where: { sourceMarketId: shadow.id },
            data: { sourceMarketId: canonical.id },
          }),
        ]);

        await tx.betMarket.update({
          where: { id: shadow.id },
          data: {
            status: "settled",
            featured: false,
            closeAt: null,
            settledAt: new Date(),
            winnerSide: null,
          },
        });
      });
    } catch (error) {
      console.warn(
        `Failed to merge watcher market #${shadow.id} into challenge market #${canonical.id}:`,
        error
      );
    }
  }
}

async function archiveLowConfidenceZeroPotMarkets(prisma: PrismaClient) {
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

export async function ensureBetMarkets(prisma: PrismaClient) {
  await archiveLowConfidenceZeroPotMarkets(prisma);
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

  await reconcileChallengeSessionShadowMarkets(prisma, seeds);
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
  const warTape = buildMarketWarTapeRows(
    { ...market, wagers: activeWagers },
    claimsByMarketId.get(market.id) ?? []
  );

  return {
    id: market.id,
    slug: market.slug,
    title: market.title,
    eventLabel: market.eventLabel,
    href: buildBetMarketHref(market.id),
    linkedSessionKey,
    linkedGameStatsId: market.linkedGameStatsId ?? null,
    status: market.status as BetStatus,
    featured: market.featured,
    closeLabel: formatCloseLabel(market.status as BetStatus, market.closeAt),
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
  const markets = await prisma.betMarket.findMany({
    where: { status: { in: OPEN_STATUSES } },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
    include: {
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

  return markets.filter(isConfidentBetMarket);
}

async function loadRecentSettledResults(prisma: PrismaClient): Promise<BetSettledResult[]> {
  const [settledMarketsRaw, sessionSnapshot] = await Promise.all([
    prisma.betMarket.findMany({
      where: {
        status: "settled",
        winnerSide: {
          in: ["left", "right"],
        },
      },
      orderBy: [{ settledAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      take: 40,
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
            stakeTxHash: true,
            createdAt: true,
            stakeLockedAt: true,
            stakeIntent: {
              select: {
                status: true,
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
      },
    }),
    loadLiveSessionSnapshot(prisma),
  ]);
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

    const marketIsChallenge = typeof market.scheduledMatchId === "number";
    const existingIsChallenge = typeof existing.scheduledMatchId === "number";
    if (marketIsChallenge && !existingIsChallenge) {
      settledMarketBySurfaceKey.set(surfaceKey, market);
    }
  }

  const settledMarkets = [...settledMarketBySurfaceKey.values()]
    .filter((market) => {
      if (!isWoloMainnet()) return true;
      return (
        market.wagers.some((wager) => isCountableBetWager(wager)) ||
        market.stakeIntents.some((intent) => isBetStakeIntentCountableStatus(intent.status))
      );
    })
    .slice(0, 4);

  const settledMarketIds = settledMarkets.map((market) => market.id);
  const claimTotals =
    settledMarketIds.length > 0
      ? await prisma.pendingWoloClaim.groupBy({
          by: ["sourceMarketId"],
          where: {
            sourceMarketId: { in: settledMarketIds },
            rescindedAt: null,
          },
          _sum: {
            amountWolo: true,
          },
        })
      : [];

  const claimTotalByMarketId = new Map<number, number>();
  for (const row of claimTotals) {
    if (typeof row.sourceMarketId === "number") {
      claimTotalByMarketId.set(row.sourceMarketId, row._sum.amountWolo ?? 0);
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
      const winner = market.winnerSide === "right" ? market.rightLabel : market.leftLabel;
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
    return marketResults.slice(0, 4);
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
      title,
      eventLabel: row.parse_reason ? row.parse_reason.replace(/_/g, " ") : "Replay proof",
      winner: row.winner || "Unknown",
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
    const marketStatus: BetStatus = ["open", "closing", "live", "settled"].includes(row.market.status)
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
      stakeTxHash: row.stakeTxHash,
      stakeProofUrl: row.stakeTxHash ? buildWoloRestTxLookupUrl(row.stakeTxHash) : null,
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

  const [openMarketsRaw, settledResultsRaw, unresolvedStakeIntents, settlementSurface] = await Promise.all([
    loadOpenMarkets(prisma),
    loadRecentSettledResults(prisma),
    viewer?.id ? loadViewerBetStakeIntents(prisma, viewer.id) : Promise.resolve([]),
    loadSettlementSurfaceForBetBoard(options.settlementSurfaceMode),
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

  const openMarketsWithoutFeeds = openMarketsRaw.map((market) =>
    buildMarketCard(market, viewer?.id ?? null, claimsByMarketId)
  );
  const broadcastSessionKeys = [
    ...openMarketsWithoutFeeds.map((market) => market.linkedSessionKey),
    ...settledResultsRaw.map((result) => result.linkedSessionKey),
  ].filter(Boolean) as string[];
  const [streamsBySession, broadcastPreviewsByKey] = await Promise.all([
    loadWatchStreamsBySession(prisma, broadcastSessionKeys),
    loadBetBroadcastPreviewMap(),
  ]);
  const openMarkets = openMarketsWithoutFeeds.map((market) => ({
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
  const liveWatcherMarket =
    openMarkets.find((market) => market.status === "live" && Boolean(market.linkedSessionKey)) ||
    openMarkets.find((market) => market.status === "closing" && Boolean(market.linkedSessionKey));

  const featuredMarket =
    liveWatcherMarket || openMarkets.find((market) => market.featured) || openMarkets[0] || null;

  const activeOpenWagers = openMarkets
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
    },
    featuredMarket,
    openMarkets,
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
      liveCount: openMarkets.filter((market) => market.status === "live").length,
    },
  };
}
