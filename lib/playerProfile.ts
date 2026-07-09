import {
  displayParseReason,
  displayPlayerName,
  formatDurationLabel,
  normalizeDurationSeconds,
  outcomeBadgeLabel,
  parsePlayers,
  readMapName,
  readPlayedAt,
  readPlayerCivilizationLabel,
  readPlayerSteamDmRating,
  readPlayerSteamId,
  readPlayerSteamRmRating,
  winnerLabel,
  isEarlyExitNoResult,
} from "@/lib/gameStatsView";
import type { PrismaClient } from "@/lib/generated/prisma";
import { normalizeSessionKey } from "@/lib/liveSessionSnapshot";
import {
  loadPendingWoloClaimSummariesByName,
  pendingWoloClaimNameKeys,
  type PendingWoloClaimSummary,
} from "@/lib/pendingWoloClaims";
import { buildPlayerPerformanceStats } from "@/lib/playerPerformance";
import { buildRivalSummaries, type RivalSummary } from "@/lib/publicMatchups";
import {
  applyPendingWoloClaimSummary,
  buildClaimedPublicPlayerRef,
  buildReplayPublicPlayerRef,
  normalizePublicPlayerName,
  publicPlayerMatchesName,
  type PublicPlayerRef,
} from "@/lib/publicPlayers";
import { isAtOrAfterWoloMainnetStart, isMainnetVisibleBetWager } from "@/lib/woloChain";
import { loadUserCommunitySummaries, type UserCommunitySummary } from "@/lib/communityHonors";
import { applyReplayAdjudicationToGameStats } from "@/lib/replayAdjudications";
import { cleanPublicGameRows, type PublicGameStatsLike } from "@/lib/publicReplayTruth";
import {
  normalizePublicReplayText,
  publicReplayMapLabel,
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";

export type PlayerProfileViewMode = "basic" | "advanced" | "extreme";
export type PlayerProfileIdentity =
  | { kind: "claimed"; uid: string }
  | { kind: "replay"; name: string };

export type PlayerProfileGameRow = {
  id: number;
  winner: string | null;
  players: unknown;
  played_on: Date | string | null;
  timestamp: Date | string | null;
  createdAt?: Date | string | null;
  original_filename?: string | null;
  replay_file?: string | null;
  parse_reason?: string | null;
  parse_source?: string | null;
  map: unknown;
  disconnect_detected?: boolean;
  duration?: number | null;
  game_duration?: number | null;
  key_events?: unknown;
  event_types?: unknown;
  is_final?: boolean | null;
  winnerProof?: string | null;
  reviewNeeded?: boolean | null;
  unresolvedResult?: {
    code?: string;
    label?: string;
    explanation?: string;
    reviewNeeded?: boolean;
  } | null;
};

export type PlayerProfileMatchItem = {
  id: number;
  href: string;
  mapName: string;
  playersLabel: string;
  winnerLabel: string;
  outcomeLabel: string | null;
  parseLabel: string;
  playedAt: string | null;
  durationLabel: string;
  disconnectDetected: boolean;
  playerCivilization: string;
  result: "win" | "loss" | "unknown";
  score: number | null;
  eapm: number | null;
};

export type PlayerProfileMatchFeedPage = {
  items: PlayerProfileMatchItem[];
  nextCursor: number | null;
  totalMatches: number;
};

export type PlayerProfile = {
  identity: PlayerProfileIdentity;
  displayName: string;
  href: string;
  claimHref: string | null;
  currentPlayer: PublicPlayerRef;
  aliases: string[];
  isClaimed: boolean;
  isVerified: boolean;
  verificationLevel: number;
  verificationMethod: string;
  createdAt: string | null;
  verifiedAt: string | null;
  lastSeenAt: string | null;
  isLive: boolean;
  steam: {
    personaName: string | null;
    steamId: string | null;
    rmRating: number | null;
    dmRating: number | null;
    ratingLastSeenAt: string | null;
  };
  stream: {
    twitchUrl: string | null;
    twitchChannel: string | null;
    recentFeedCount: number;
    primarySessionKey: string | null;
  };
  community: {
    badges: Array<{ id: number; label: string }>;
    giftedWolo: number;
  };
  performance: ReturnType<typeof buildPlayerPerformanceStats>;
  command: PlayerCommandStats;
  resources: PlayerResourceStats;
  watcher: PlayerWatcherStats;
  wolo: PlayerWoloStats;
  charts: {
    form: PlayerFormPoint[];
    civs: PlayerBreakdownRow[];
    maps: PlayerBreakdownRow[];
  };
  bestGames: PlayerBestGame[];
  rivalries: RivalSummary[];
  matchFeed: PlayerProfileMatchFeedPage;
  tickerItems: string[];
};

export type PlayerCommandStats = {
  totalMatches: number;
  wins: number;
  losses: number;
  unknowns: number;
  winRate: number | null;
  last10WinRate: number | null;
  last30WinRate: number | null;
  currentStreakLabel: string;
  activeDays: number;
  matchesLast7Days: number;
  matchesLast30Days: number;
  firstMatchAt: string | null;
  latestMatchAt: string | null;
  watcherBackedMatches: number;
  manualBackfillMatches: number;
  averageScore: number | null;
  bestScore: number | null;
  averageEapm: number | null;
  bestEapm: number | null;
  mostPlayedCivilization: string | null;
  favoriteMap: string | null;
};

export type PlayerResourceStats = {
  visibleGames: number;
  unavailableReason: string | null;
  totals: Record<"food" | "wood" | "gold" | "stone", number | null>;
  best: Record<"food" | "wood" | "gold" | "stone", PlayerBestResourceGame | null>;
};

export type PlayerBestResourceGame = {
  gameId: number;
  mapName: string;
  value: number;
  playedAt: string | null;
};

export type PlayerWatcherStats = {
  watcherKeys: number;
  watcherEventCount: number;
  watcherBackedMatches: number;
  uniqueWatchers: number;
  multiWatcherProofGames: number;
  bestMultiWatcherProofLabel: string | null;
  bestMultiWatcherSourceCount: number;
  lastWatcherSeenAt: string | null;
  recentParseMisses: number;
  parserStoredAttempts: number;
  parserFailedAttempts: number;
  proofScore: number;
};

export type PlayerWoloStats = {
  pendingClaimWolo: number;
  pendingClaimCount: number;
  claimedClaimWolo: number;
  claimedClaimCount: number;
  payoutTxCount: number;
  wageredWolo: number;
  payoutWolo: number;
  activeStakeWolo: number;
  stakingRewardsWolo: number;
  communityGiftWolo: number;
  totalFlexWolo: number;
};

export type PlayerFormPoint = {
  gameId: number;
  result: "win" | "loss" | "unknown";
  label: string;
};

export type PlayerBreakdownRow = {
  label: string;
  matches: number;
  wins: number;
  losses: number;
  unknowns: number;
  winRate: number | null;
  share: number;
};

export type PlayerBestGame = {
  key: string;
  label: string;
  value: string;
  href: string;
  mapName: string;
  playedAt: string | null;
};

type ClaimedProfileUser = {
  id: number;
  uid: string;
  inGameName: string | null;
  steamPersonaName: string | null;
  steamId: string | null;
  twitchStreamUrl: string | null;
  verified: boolean;
  verificationLevel: number;
  verificationMethod: string;
  verifiedAt: Date | null;
  lastSeen: Date | null;
  createdAt: Date | null;
};

const PROFILE_MATCH_SCAN_LIMIT = 8000;
const PROFILE_INITIAL_MATCH_LIMIT = 18;
const PROFILE_MATCH_PAGE_LIMIT = 18;

const RESOURCE_KEYS = {
  food: ["food", "food gathered", "food collected", "food_collected", "food_gathered", "total_food"],
  wood: ["wood", "wood gathered", "wood collected", "wood_collected", "wood_gathered", "total_wood"],
  gold: ["gold", "gold gathered", "gold collected", "gold_collected", "gold_gathered", "total_gold"],
  stone: ["stone", "stone gathered", "stone collected", "stone_collected", "stone_gathered", "total_stone"],
} as const;

function isMissingPrismaStorageError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    ((error as { code?: string }).code === "P2021" || (error as { code?: string }).code === "P2022")
  );
}

function warnOptionalProfileRail(label: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Player profile ${label} rail unavailable: ${message}`);
}

function emptyWoloStats(communityGiftWolo = 0): PlayerWoloStats {
  return {
    pendingClaimWolo: 0,
    pendingClaimCount: 0,
    claimedClaimWolo: 0,
    claimedClaimCount: 0,
    payoutTxCount: 0,
    wageredWolo: 0,
    payoutWolo: 0,
    activeStakeWolo: 0,
    stakingRewardsWolo: 0,
    communityGiftWolo,
    totalFlexWolo: communityGiftWolo,
  };
}

async function safeLoadPendingWoloClaimSummaries(
  prisma: PrismaClient,
  aliases: string[]
): Promise<Map<string, PendingWoloClaimSummary>> {
  try {
    return await loadPendingWoloClaimSummariesByName(prisma, aliases);
  } catch (error) {
    if (!isMissingPrismaStorageError(error)) {
      throw error;
    }
    warnOptionalProfileRail("pending WOLO claim", error);
    return new Map();
  }
}

function normalizeKey(value: string | null | undefined) {
  return (value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function findNumericByNormalizedKey(source: unknown, candidateKeys: readonly string[]) {
  const record = readRecord(source);
  if (!record) return null;

  const wanted = new Set(candidateKeys.map((key) => normalizeKey(key).replace(/_/g, " ")));
  for (const [key, value] of Object.entries(record)) {
    if (!wanted.has(normalizeKey(key).replace(/_/g, " "))) continue;
    const number = readNumber(value);
    if (number !== null) return Math.round(number);
  }

  return null;
}

function readNestedNumeric(source: unknown, candidateKeys: readonly string[]) {
  const direct = findNumericByNormalizedKey(source, candidateKeys);
  if (direct !== null) return direct;

  const record = readRecord(source);
  if (!record) return null;

  for (const value of Object.values(record)) {
    const nested = findNumericByNormalizedKey(value, candidateKeys);
    if (nested !== null) return nested;
  }

  return null;
}

function currentPlayerRecord(game: PlayerProfileGameRow, currentPlayer: PublicPlayerRef) {
  return parsePlayers(game.players).find((player) =>
    publicPlayerMatchesName(currentPlayer, displayPlayerName(player))
  );
}

function gameResult(game: PlayerProfileGameRow, currentPlayer: PublicPlayerRef): "win" | "loss" | "unknown" {
  const adjudicatedGame = applyReplayAdjudicationToGameStats(game) as PlayerProfileGameRow;
  const winner = playerProfileReliableWinner(adjudicatedGame);

  if (!winner) return "unknown";
  return publicPlayerMatchesName(currentPlayer, winner) ? "win" : "loss";
}

function comparePlayedAtDesc(left: PlayerProfileGameRow, right: PlayerProfileGameRow) {
  const leftAt = readPlayedAt(left);
  const rightAt = readPlayedAt(right);
  const leftMs = leftAt ? new Date(leftAt).getTime() : 0;
  const rightMs = rightAt ? new Date(rightAt).getTime() : 0;
  if (leftMs !== rightMs) return rightMs - leftMs;
  return right.id - left.id;
}

function readPlayerScore(player: Record<string, unknown> | undefined) {
  return player ? readNumber(player.score) : null;
}

function readPlayerEapm(player: Record<string, unknown> | undefined) {
  return player ? readNumber(player.eapm) : null;
}

function readPlayerResource(player: Record<string, unknown> | undefined, resource: keyof typeof RESOURCE_KEYS) {
  if (!player) return null;

  const achievements = readRecord(player.achievements);
  const economy = achievements ? readRecord(achievements.economy) : null;
  const resources = readRecord(player.resources) || readRecord(player.resource_stats);

  return (
    readNestedNumeric(economy, RESOURCE_KEYS[resource]) ??
    readNestedNumeric(resources, RESOURCE_KEYS[resource]) ??
    readNestedNumeric(achievements, RESOURCE_KEYS[resource])
  );
}

function percentage(wins: number, total: number) {
  return total > 0 ? Math.round((wins / total) * 100) : null;
}

function buildBreakdownRow(label: string, matches: number, wins: number, losses: number, unknowns: number, total: number) {
  return {
    label,
    matches,
    wins,
    losses,
    unknowns,
    winRate: percentage(wins, wins + losses),
    share: total > 0 ? Math.round((matches / total) * 100) : 0,
  } satisfies PlayerBreakdownRow;
}

function updateBreakdown(
  map: Map<string, { matches: number; wins: number; losses: number; unknowns: number }>,
  key: string,
  result: "win" | "loss" | "unknown"
) {
  const row = map.get(key) ?? { matches: 0, wins: 0, losses: 0, unknowns: 0 };
  row.matches += 1;
  if (result === "win") row.wins += 1;
  else if (result === "loss") row.losses += 1;
  else row.unknowns += 1;
  map.set(key, row);
}

function sortBreakdowns(rows: PlayerBreakdownRow[]) {
  return rows.sort((left, right) => {
    if (left.matches !== right.matches) return right.matches - left.matches;
    if ((left.winRate ?? -1) !== (right.winRate ?? -1)) return (right.winRate ?? -1) - (left.winRate ?? -1);
    return left.label.localeCompare(right.label);
  });
}

// AOE2WAR_PROFILE_HIDE_NO_GAME_EARLY_EXITS
function readProfileKeyEvents(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function profileTruthy(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function isNoGameProfileReplay(game: PlayerProfileGameRow) {
  const keyEvents = readProfileKeyEvents(game.key_events);
  const duration = normalizeDurationSeconds(game.duration ?? game.game_duration ?? null) ?? 0;
  const earlyExit =
    isEarlyExitNoResult(game.parse_reason) ||
    profileTruthy(keyEvents.early_exit_under_60s);
  const noRatedResult = profileTruthy(keyEvents.no_rated_result);
  const completed = profileTruthy(keyEvents.completed);

  return earlyExit && noRatedResult && !completed && duration < 60;
}

function filterVisiblePlayerProfileGames(games: PlayerProfileGameRow[]) {
  return games.filter((game) => !isNoGameProfileReplay(game));
}

function buildCurrentStreakLabel(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef) {
  let streakKind: "win" | "loss" | null = null;
  let count = 0;

  for (const game of games) {
    const result = gameResult(game, currentPlayer);
    if (result === "unknown") {
      if (count === 0) return "Awaiting result proof";
      return `${count} ${streakKind === "win" ? (count === 1 ? "win" : "wins") : count === 1 ? "loss" : "losses"} · proof boundary`;
    }

    if (!streakKind) {
      streakKind = result;
      count = 1;
      continue;
    }

    if (result !== streakKind) break;
    count += 1;
  }

  if (!streakKind || count === 0) return "No locked streak";
  if (streakKind === "win") return `${count} ${count === 1 ? "win" : "wins"}`;
  return `${count} ${count === 1 ? "loss" : "losses"}`;
}

function buildCommandStats(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef): PlayerCommandStats {
  const now = Date.now();
  const activeDayKeys = new Set<string>();
  const civCounts = new Map<string, number>();
  const mapCounts = new Map<string, number>();
  const scores: number[] = [];
  const eapms: number[] = [];

  let wins = 0;
  let losses = 0;
  let unknowns = 0;
  let matchesLast7Days = 0;
  let matchesLast30Days = 0;
  let watcherBackedMatches = 0;
  let manualBackfillMatches = 0;
  let firstMatchAt: string | null = null;
  let latestMatchAt: string | null = null;

  for (const game of games) {
    const result = gameResult(game, currentPlayer);
    if (result === "win") wins += 1;
    else if (result === "loss") losses += 1;
    else unknowns += 1;

    const player = currentPlayerRecord(game, currentPlayer);
    const civ = player ? normalizePublicReplayText(readPlayerCivilizationLabel(player)) : null;
    if (civ) civCounts.set(civ, (civCounts.get(civ) ?? 0) + 1);

    const mapName = normalizePublicReplayText(readMapName(game.map));
    if (mapName) mapCounts.set(mapName, (mapCounts.get(mapName) ?? 0) + 1);

    if (result !== "unknown") {
      const score = readPlayerScore(player);
      if (score !== null && score > 0) scores.push(score);

      const eapm = readPlayerEapm(player);
      if (eapm !== null && eapm > 0) eapms.push(eapm);
    }

    const playedAt = readPlayedAt(game);
    const playedIso = toIso(playedAt);
    if (playedIso) {
      const playedMs = new Date(playedIso).getTime();
      activeDayKeys.add(playedIso.slice(0, 10));
      if (!latestMatchAt || playedMs > new Date(latestMatchAt).getTime()) latestMatchAt = playedIso;
      if (!firstMatchAt || playedMs < new Date(firstMatchAt).getTime()) firstMatchAt = playedIso;
      if (now - playedMs <= 7 * 24 * 60 * 60 * 1000) matchesLast7Days += 1;
      if (now - playedMs <= 30 * 24 * 60 * 60 * 1000) matchesLast30Days += 1;
    }

    if ((game.parse_source || "").startsWith("watcher")) watcherBackedMatches += 1;
    if (displayParseReason(game.parse_reason).toLowerCase().includes("manual")) manualBackfillMatches += 1;
  }

  const resolvedResults = (rows: PlayerProfileGameRow[]) =>
    rows
      .map((game) => gameResult(game, currentPlayer))
      .filter((result) => result !== "unknown");
  const last10Results = resolvedResults(games).slice(0, 10);
  const last30Results = resolvedResults(games).slice(0, 30);

  return {
    totalMatches: games.length,
    wins,
    losses,
    unknowns,
    winRate: percentage(wins, wins + losses),
    last10WinRate: percentage(
      last10Results.filter((result) => result === "win").length,
      last10Results.length
    ),
    last30WinRate: percentage(
      last30Results.filter((result) => result === "win").length,
      last30Results.length
    ),
    currentStreakLabel: buildCurrentStreakLabel(games, currentPlayer),
    activeDays: activeDayKeys.size,
    matchesLast7Days,
    matchesLast30Days,
    firstMatchAt,
    latestMatchAt,
    watcherBackedMatches,
    manualBackfillMatches,
    averageScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
    bestScore: scores.length ? Math.max(...scores) : null,
    averageEapm: eapms.length ? Math.round((eapms.reduce((sum, value) => sum + value, 0) / eapms.length) * 10) / 10 : null,
    bestEapm: eapms.length ? Math.round(Math.max(...eapms) * 10) / 10 : null,
    mostPlayedCivilization: Array.from(civCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    favoriteMap: Array.from(mapCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  };
}

function buildResourceStats(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef): PlayerResourceStats {
  const totals: PlayerResourceStats["totals"] = {
    food: null,
    wood: null,
    gold: null,
    stone: null,
  };
  const best: PlayerResourceStats["best"] = {
    food: null,
    wood: null,
    gold: null,
    stone: null,
  };
  const visibleGameIds = new Set<number>();

  for (const game of games) {
    if (gameResult(game, currentPlayer) === "unknown") continue;

    const player = currentPlayerRecord(game, currentPlayer);
    const playedAt = toIso(readPlayedAt(game));
    const mapName = readMapName(game.map);

    for (const resource of Object.keys(RESOURCE_KEYS) as Array<keyof typeof RESOURCE_KEYS>) {
      const value = readPlayerResource(player, resource);
      if (value === null || value <= 0) continue;
      visibleGameIds.add(game.id);
      totals[resource] = (totals[resource] ?? 0) + value;
      if (!best[resource] || value > best[resource]!.value) {
        best[resource] = {
          gameId: game.id,
          mapName,
          value,
          playedAt,
        };
      }
    }
  }

  return {
    visibleGames: visibleGameIds.size,
    unavailableReason:
      visibleGameIds.size > 0
        ? null
        : "HD has not surfaced filled postgame economy tables for these stored games yet.",
    totals,
    best,
  };
}

function buildCharts(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef) {
  const civs = new Map<string, { matches: number; wins: number; losses: number; unknowns: number }>();
  const maps = new Map<string, { matches: number; wins: number; losses: number; unknowns: number }>();

  for (const game of games) {
    const result = gameResult(game, currentPlayer);
    const player = currentPlayerRecord(game, currentPlayer);
    const civ = player ? normalizePublicReplayText(readPlayerCivilizationLabel(player)) : null;
    const mapName = normalizePublicReplayText(readMapName(game.map));
    if (civ) updateBreakdown(civs, civ, result);
    if (mapName) updateBreakdown(maps, mapName, result);
  }

  const form = games
    .slice(0, 12)
    .reverse()
    .map((game, index) => ({
      gameId: game.id,
      result: gameResult(game, currentPlayer),
      label: `G${index + 1}`,
    }));

  return {
    form,
    civs: sortBreakdowns(
      Array.from(civs.entries()).map(([label, row]) =>
        buildBreakdownRow(label, row.matches, row.wins, row.losses, row.unknowns, games.length)
      )
    ),
    maps: sortBreakdowns(
      Array.from(maps.entries()).map(([label, row]) =>
        buildBreakdownRow(label, row.matches, row.wins, row.losses, row.unknowns, games.length)
      )
    ),
  };
}

function buildBestGames(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef): PlayerBestGame[] {
  const best: PlayerBestGame[] = [];
  let highestScore: { game: PlayerProfileGameRow; value: number } | null = null;
  let highestEapm: { game: PlayerProfileGameRow; value: number } | null = null;
  let longestGame: { game: PlayerProfileGameRow; value: number } | null = null;
  let fastestWin: { game: PlayerProfileGameRow; value: number } | null = null;

  for (const game of games) {
    const player = currentPlayerRecord(game, currentPlayer);
    const result = gameResult(game, currentPlayer);
    if (result !== "unknown") {
      const score = readPlayerScore(player);
      if (score !== null && score > 0 && (!highestScore || score > highestScore.value)) {
        highestScore = { game, value: score };
      }

      const eapm = readPlayerEapm(player);
      if (eapm !== null && eapm > 0 && (!highestEapm || eapm > highestEapm.value)) {
        highestEapm = { game, value: eapm };
      }
    }

    const duration = normalizeDurationSeconds(game.duration ?? game.game_duration ?? null);
    if (duration && (!longestGame || duration > longestGame.value)) {
      longestGame = { game, value: duration };
    }

    if (duration && gameResult(game, currentPlayer) === "win" && (!fastestWin || duration < fastestWin.value)) {
      fastestWin = { game, value: duration };
    }
  }

  const pushBest = (key: string, label: string, value: string, game: PlayerProfileGameRow) => {
    best.push({
      key,
      label,
      value,
      href: `/game-stats/${game.id}`,
      mapName: publicReplayMapLabel(game.map),
      playedAt: toIso(readPlayedAt(game)),
    });
  };

  if (highestScore) pushBest("score", "Highest score", Math.round(highestScore.value).toLocaleString(), highestScore.game);
  if (highestEapm) pushBest("eapm", "Peak EAPM", String(Math.round(highestEapm.value * 10) / 10), highestEapm.game);
  if (fastestWin) pushBest("fastest-win", "Fastest win", formatDurationLabel(fastestWin.value), fastestWin.game);
  if (longestGame) pushBest("marathon", "Longest game", formatDurationLabel(longestGame.value), longestGame.game);

  return best;
}

function toMatchItem(game: PlayerProfileGameRow, currentPlayer: PublicPlayerRef): PlayerProfileMatchItem {
  game = applyReplayAdjudicationToGameStats(game);
  const players = parsePlayers(game.players);
  const player = currentPlayerRecord(game, currentPlayer);
  const playedAt = toIso(readPlayedAt(game));
  const result = gameResult(game, currentPlayer);

  return {
    id: game.id,
    href: `/game-stats/${game.id}`,
    mapName: publicReplayMapLabel(game.map),
    playersLabel: (() => {
      const names = players
        .map((entry) => normalizePublicReplayText(entry.name))
        .filter((name): name is string => Boolean(name));
      if (names.length >= 2) return names.join(" vs ");
      if (names.length === 1) return `${names[0]} · Opponent unresolved`;
      return "Roster unresolved";
    })(),
    winnerLabel: playerProfileWinnerLabel(game),
    outcomeLabel: playerProfileOutcomeLabel(game),
    parseLabel: displayParseReason(game.parse_reason),
    playedAt,
    durationLabel: formatDurationLabel(game.duration ?? game.game_duration ?? null),
    disconnectDetected: Boolean(game.disconnect_detected),
    playerCivilization:
      (player ? normalizePublicReplayText(readPlayerCivilizationLabel(player)) : null) ??
      "Civilization unavailable",
    result,
    score: readPlayerScore(player),
    eapm: readPlayerEapm(player),
  };
}

function isManualProfileResultReason(parseReason: string | null | undefined) {
  const reason = String(parseReason || "").trim().toLowerCase();
  return (
    reason === "manual_override" ||
    reason === "manual_recovery" ||
    reason.includes("manual_backfill") ||
    reason.includes("manual_recovery") ||
    reason.includes("manual_override")
  );
}

function playerWinnerFlagIsTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function trustedManualProfileWinner(game: PlayerProfileGameRow, storedWinner: string | null) {
  if (!storedWinner || !isManualProfileResultReason(game.parse_reason)) {
    return null;
  }

  const winnerKey = storedWinner.trim().toLowerCase();
  const players = parsePlayers(game.players);

  const matchingWinnerFlag = players.some((player) => {
    const playerName = normalizePublicReplayText(displayPlayerName(player));
    return Boolean(
      playerName &&
      playerName.trim().toLowerCase() === winnerKey &&
      playerWinnerFlagIsTrue(player.winner)
    );
  });

  return matchingWinnerFlag ? storedWinner : null;
}

function playerProfileReliableWinner(game: PlayerProfileGameRow) {
  const storedWinner = normalizePublicReplayText(game.winner);

  const manualWinner = trustedManualProfileWinner(game, storedWinner);
  if (manualWinner) return manualWinner;

  if (game.winnerProof === "historical_inferred_fallback" && storedWinner) {
    return storedWinner;
  }

  return resolveReliableReplayWinner({
    winner: game.winner,
    players: parsePlayers(game.players),
    parseReason: game.parse_reason,
    parseSource: game.parse_source,
    keyEvents: game.key_events,
    eventTypes: game.event_types,
  });
}

function playerProfileUnresolvedResult(game: PlayerProfileGameRow) {
  const unresolved = game.unresolvedResult;
  return unresolved && typeof unresolved === "object" ? unresolved : null;
}

function playerProfileWinnerLabel(game: PlayerProfileGameRow) {
  const unresolved = playerProfileUnresolvedResult(game);
  if (unresolved?.code === "winner_not_captured") return "Winner not captured";

  const reliableWinner = playerProfileReliableWinner(game);
  if (reliableWinner) return reliableWinner;

  return winnerLabel(game.winner, game.parse_reason);
}

function playerProfileOutcomeLabel(game: PlayerProfileGameRow) {
  const unresolved = playerProfileUnresolvedResult(game);
  if (unresolved?.code === "winner_not_captured") return "Completed";
  if (unresolved?.label === "Completed") return "Completed";
  if (game.winnerProof === "historical_inferred_fallback" && playerProfileReliableWinner(game)) return null;
  return outcomeBadgeLabel(game.parse_reason, game.winner);
}

function buildMatchFeed(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef, offset = 0, limit = PROFILE_MATCH_PAGE_LIMIT): PlayerProfileMatchFeedPage {
  const items = games.slice(offset, offset + limit).map((game) => toMatchItem(game, currentPlayer));
  const nextOffset = offset + items.length;

  return {
    items,
    nextCursor: nextOffset < games.length ? nextOffset : null,
    totalMatches: games.length,
  };
}

function buildTickerItems(profile: {
  displayName: string;
  command: PlayerCommandStats;
  watcher: PlayerWatcherStats;
  wolo: PlayerWoloStats;
  resources: PlayerResourceStats;
  stream: PlayerProfile["stream"];
}) {
  const items = [
    `${profile.displayName} command center online`,
    `${profile.command.totalMatches} replay-backed games`,
    profile.command.winRate !== null ? `${profile.command.winRate}% win rate` : "Win rate calibrating",
    profile.command.favoriteMap ? `Best-known battlefield: ${profile.command.favoriteMap}` : null,
    profile.command.mostPlayedCivilization ? `Most played civ: ${profile.command.mostPlayedCivilization}` : null,
    profile.watcher.watcherBackedMatches > 0 ? `${profile.watcher.watcherBackedMatches} watcher-backed proofs` : null,
    profile.resources.visibleGames > 0 ? `${profile.resources.visibleGames} games with economy tables visible` : "Economy vault awaiting postgame tables",
    profile.wolo.totalFlexWolo > 0 ? `${profile.wolo.totalFlexWolo} WOLO profile flex` : null,
    profile.stream.twitchUrl ? `Twitch rail linked${profile.stream.twitchChannel ? `: ${profile.stream.twitchChannel}` : ""}` : null,
  ].filter((item): item is string => Boolean(item));

  return items.slice(0, 8);
}

function extractTwitchChannel(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!url.hostname.includes("twitch.tv")) return null;
    return url.pathname.split("/").filter(Boolean)[0] ?? null;
  } catch {
    return null;
  }
}


// AOE2WAR_PROFILE_REPLAY_DEDUPE
type PlayerProfileGameRowWithFinal = PlayerProfileGameRow & {
  is_final?: boolean | null;
};

function playerProfileDateMs(value: Date | string | null | undefined) {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
}

function playerProfileReplayDedupeKey(game: PlayerProfileGameRow) {
  const replayFile = String(game.replay_file ?? "").trim();
  const originalFilename = String(game.original_filename ?? "").trim();
  const replayKey = replayFile || originalFilename;
  return replayKey ? `replay:${replayKey.toLowerCase()}` : `game:${game.id}`;
}

function playerProfileIsFinal(game: PlayerProfileGameRow) {
  return Boolean((game as PlayerProfileGameRowWithFinal).is_final);
}

function playerProfileHasResolvedWinner(game: PlayerProfileGameRow) {
  const adjudicatedGame = applyReplayAdjudicationToGameStats(game) as PlayerProfileGameRow;
  return Boolean(playerProfileReliableWinner(adjudicatedGame));
}

function playerProfilePreferenceScore(game: PlayerProfileGameRow) {
  const parseSource = String(game.parse_source ?? "").toLowerCase();
  const parseReason = String(game.parse_reason ?? "").toLowerCase();

  return (
    (playerProfileIsFinal(game) ? 10000 : 0) +
    (parseSource === "watcher_final" ? 2000 : 0) +
    (playerProfileHasResolvedWinner(game) ? 1000 : 0) +
    (parseReason.includes("final") ? 250 : 0) +
    (parseReason.includes("resignation") ? 150 : 0)
  );
}

function playerProfileRecencyScore(game: PlayerProfileGameRow) {
  return Math.max(
    playerProfileDateMs(game.played_on),
    playerProfileDateMs(game.timestamp),
    playerProfileDateMs(game.createdAt)
  );
}

function isPreferredPlayerProfileGame(candidate: PlayerProfileGameRow, current: PlayerProfileGameRow) {
  const candidateScore = playerProfilePreferenceScore(candidate);
  const currentScore = playerProfilePreferenceScore(current);

  if (candidateScore !== currentScore) return candidateScore > currentScore;

  const candidateRecency = playerProfileRecencyScore(candidate);
  const currentRecency = playerProfileRecencyScore(current);

  if (candidateRecency !== currentRecency) return candidateRecency > currentRecency;

  return candidate.id > current.id;
}

function dedupePlayerProfileGamesByReplay(games: PlayerProfileGameRow[]) {
  const bestByReplay = new Map<string, PlayerProfileGameRow>();

  for (const game of games) {
    const key = playerProfileReplayDedupeKey(game);
    const current = bestByReplay.get(key);

    if (!current || isPreferredPlayerProfileGame(game, current)) {
      bestByReplay.set(key, game);
    }
  }

  return filterVisiblePlayerProfileGames([...bestByReplay.values()].sort(comparePlayedAtDesc));
}


async function loadCandidateFinalGames(prisma: PrismaClient): Promise<PlayerProfileGameRow[]> {
  const rows = await prisma.gameStats.findMany({
    where: {
      OR: [
        { is_final: true },
        {
          is_final: false,
          parse_source: "watcher_live",
          parse_iteration: {
            gt: 0,
          },
          OR: [
            {
              parse_reason: {
                contains: "final",
                mode: "insensitive",
              },
            },
            {
              parse_reason: {
                contains: "resignation",
                mode: "insensitive",
              },
            },
            {
              winner: {
                notIn: ["", "Unknown"],
              },
            },
          ],
        },
      ],
      NOT: {
        parse_reason: {
          in: ["superseded_by_later_upload"],
        },
      },
    },
    orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: PROFILE_MATCH_SCAN_LIMIT,
    select: {
      id: true,
        is_final: true,
      winner: true,
      players: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      original_filename: true,
      replay_file: true,
      parse_reason: true,
      parse_source: true,
      map: true,
      disconnect_detected: true,
      duration: true,
      game_duration: true,
      key_events: true,
      event_types: true,
    },
  });

  const publicRows = cleanPublicGameRows(rows as unknown as PublicGameStatsLike[], {
    includeReview: true,
    includeLive: false,
  }) as unknown as PlayerProfileGameRow[];

  return dedupePlayerProfileGamesByReplay(publicRows);
}

function filterGamesForPlayer(games: PlayerProfileGameRow[], currentPlayer: PublicPlayerRef) {
  return games
    .filter((game) => currentPlayerRecord(game, currentPlayer))
    .sort(comparePlayedAtDesc);
}

async function loadWoloStats(
  prisma: PrismaClient,
  aliases: string[],
  user: { id: number } | null,
  communityGiftWolo: number
): Promise<PlayerWoloStats> {
  const keys = pendingWoloClaimNameKeys(aliases);
  const claimWhere =
    keys.length > 0 && user
      ? {
          OR: [
            { normalizedPlayerName: { in: keys } },
            { claimedByUserId: user.id },
          ],
        }
      : keys.length > 0
        ? { normalizedPlayerName: { in: keys } }
        : user
          ? { claimedByUserId: user.id }
          : null;

  let claims: Array<{
    amountWolo: number;
    status: string;
    payoutTxHash: string | null;
    createdAt: Date;
    claimedAt: Date | null;
    rescindedAt: Date | null;
  }>;
  let wagers: Array<{
    amountWolo: number;
    payoutWolo: number | null;
    payoutTxHash: string | null;
    executionMode: string;
    stakeTxHash: string | null;
    createdAt: Date;
    stakeLockedAt: Date | null;
  }>;
  let position: {
    currentStakedWolo: number;
    pendingRewardsWolo: number;
    lifetimeRewardsWolo: number;
    claimedRewardsWolo: number;
  } | null;
  let allocations: Array<{ rewardWolo: number; createdAt: Date }>;

  try {
    [claims, wagers, position, allocations] = await Promise.all([
      claimWhere
        ? prisma.pendingWoloClaim.findMany({
            where: claimWhere,
            select: {
              amountWolo: true,
              status: true,
              payoutTxHash: true,
              createdAt: true,
              claimedAt: true,
              rescindedAt: true,
            },
          })
        : Promise.resolve([]),
      user
        ? prisma.betWager.findMany({
            where: { userId: user.id },
            select: {
              amountWolo: true,
              payoutWolo: true,
              payoutTxHash: true,
              executionMode: true,
              stakeTxHash: true,
              createdAt: true,
              stakeLockedAt: true,
            },
          })
        : Promise.resolve([]),
      user
        ? prisma.stakingPosition.findUnique({
            where: { userId: user.id },
            select: {
              currentStakedWolo: true,
              pendingRewardsWolo: true,
              lifetimeRewardsWolo: true,
              claimedRewardsWolo: true,
            },
          })
        : Promise.resolve(null),
      user
        ? prisma.stakingRewardAllocation.findMany({
            where: { userId: user.id },
            select: {
              rewardWolo: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
    ]);
  } catch (error) {
    if (!isMissingPrismaStorageError(error)) {
      throw error;
    }
    warnOptionalProfileRail("WOLO", error);
    return emptyWoloStats(communityGiftWolo);
  }

  let profileGiftRows: Array<{
    amount: number | null;
    status: string;
    acceptedAt: Date | null;
    createdAt: Date;
  }> = [];
  
  if (user) {
    try {
      profileGiftRows = await prisma.userGift.findMany({
        where: {
          userId: user.id,
          kind: "WOLO",
          status: { in: ["pending", "accepted"] },
          amount: { gt: 0 },
        },
        select: {
          amount: true,
          status: true,
          acceptedAt: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (!isMissingPrismaStorageError(error)) {
        throw error;
      }
      warnOptionalProfileRail("pending WOLO gift", error);
    }
  }
  
  const visibleClaims = claims.filter((claim) => isAtOrAfterWoloMainnetStart(claim.claimedAt || claim.createdAt));
  const pendingClaims = visibleClaims.filter((claim) => claim.status === "pending" && !claim.rescindedAt);
  const claimedClaims = visibleClaims.filter((claim) => claim.status === "claimed" || claim.claimedAt);
  const visibleGiftRows = profileGiftRows.filter((gift) => isAtOrAfterWoloMainnetStart(gift.acceptedAt || gift.createdAt));
  const pendingGiftRows = visibleGiftRows.filter((gift) => gift.status === "pending");
  const pendingGiftWolo = pendingGiftRows.reduce((sum, gift) => sum + (gift.amount ?? 0), 0);
  const visibleWagers = wagers.filter(isMainnetVisibleBetWager);
  const payoutWolo = visibleWagers.reduce((sum, wager) => sum + (wager.payoutTxHash ? wager.payoutWolo ?? 0 : 0), 0);
  const stakingRewardsWolo =
    (position?.pendingRewardsWolo ?? 0) +
    (position?.claimedRewardsWolo ?? 0) +
    allocations.reduce((sum, allocation) => sum + (isAtOrAfterWoloMainnetStart(allocation.createdAt) ? allocation.rewardWolo : 0), 0);

  const claimedClaimWolo = claimedClaims.reduce((sum, claim) => sum + claim.amountWolo, 0);

  return {
    pendingClaimWolo: pendingClaims.reduce((sum, claim) => sum + claim.amountWolo, 0) + pendingGiftWolo,
    pendingClaimCount: pendingClaims.length + pendingGiftRows.length,
    claimedClaimWolo,
    claimedClaimCount: claimedClaims.length,
    payoutTxCount:
      visibleClaims.filter((claim) => claim.payoutTxHash).length +
      visibleWagers.filter((wager) => wager.payoutTxHash).length,
    wageredWolo: visibleWagers.reduce((sum, wager) => sum + wager.amountWolo, 0),
    payoutWolo,
    activeStakeWolo: position?.currentStakedWolo ?? 0,
    stakingRewardsWolo,
    communityGiftWolo,
    totalFlexWolo: claimedClaimWolo + payoutWolo + stakingRewardsWolo + communityGiftWolo,
  };
}



// AOE2WAR_PROFILE_MULTI_WATCHER_PROOF
type PlayerProfileWatcherProofRow = {
  display_name: string | null;
  proof_rows: number | string | bigint | null;
};

type PlayerProfileMultiWatcherProofStats = {
  multiWatcherProofGames: number;
  bestMultiWatcherProofLabel: string | null;
  bestMultiWatcherSourceCount: number;
};

function playerProfileProofDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function playerProfileGameAnchorDate(game: PlayerProfileGameRow) {
  return (
    playerProfileProofDate(readPlayedAt(game)) ??
    playerProfileProofDate(game.played_on) ??
    playerProfileProofDate(game.timestamp) ??
    playerProfileProofDate(game.createdAt)
  );
}

function playerProfileGameProofNames(game: PlayerProfileGameRow) {
  const names = new Set<string>();

  for (const player of parsePlayers(game.players)) {
    const name = normalizePublicReplayText(player.name);
    if (name) names.add(name);
  }

  return [...names];
}

async function loadMultiWatcherProofStats(
  prisma: PrismaClient,
  games: PlayerProfileGameRow[]
): Promise<PlayerProfileMultiWatcherProofStats> {
  let multiWatcherProofGames = 0;
  let bestMultiWatcherProofLabel: string | null = null;
  let bestMultiWatcherSourceCount = 0;

  const proofGames = games
    .filter((game) => String(game.parse_source ?? "").startsWith("watcher"))
    .slice(0, 24);

  for (const game of proofGames) {
    const anchorDate = playerProfileGameAnchorDate(game);
    const playerNames = playerProfileGameProofNames(game);
    if (!anchorDate || playerNames.length < 2) continue;

    const playerNameSet = new Set(playerNames.map((name) => name.toLowerCase()));

    try {
      const rows = await prisma.$queryRawUnsafe<PlayerProfileWatcherProofRow[]>(
        `
          with replay_rows as (
            select
              coalesce(u.in_game_name, u.steam_persona_name, u.uid, r.user_uid) as display_name,
              count(*)::int as proof_rows
            from replay_parse_attempts r
            left join users u on u.uid = r.user_uid
            where r.created_at >= $1::timestamptz - interval '120 minutes'
              and r.created_at <= $1::timestamptz + interval '20 minutes'
              and coalesce(r.parse_source, '') in ('watcher_live', 'watcher_final')
              and coalesce(r.status, '') not ilike '%fail%'
            group by coalesce(u.in_game_name, u.steam_persona_name, u.uid, r.user_uid)
          ),
          event_rows as (
            select
              coalesce(u.in_game_name, u.steam_persona_name, u.uid, e.user_uid) as display_name,
              count(*)::int as proof_rows
            from watcher_client_events e
            left join users u on u.id = e.user_id
            where e.created_at >= $1::timestamptz - interval '120 minutes'
              and e.created_at <= $1::timestamptz + interval '20 minutes'
              and e.event_type in (
                'upload_succeeded',
                'upload_success',
                'parse_succeeded',
                'stream_chunk_uploaded',
                'stream_heartbeat',
                'final_candidate_ready',
                'final_candidate_accepted'
              )
            group by coalesce(u.in_game_name, u.steam_persona_name, u.uid, e.user_uid)
          ),
          combined as (
            select * from replay_rows
            union all
            select * from event_rows
          )
          select display_name, sum(proof_rows)::int as proof_rows
          from combined
          where display_name is not null
          group by display_name
          order by sum(proof_rows) desc, display_name asc
        `,
        anchorDate.toISOString()
      );

      const uniqueProofNames = [
        ...new Set(
          rows
            .map((row) => String(row.display_name ?? "").trim())
            .filter((name) => name && playerNameSet.has(name.toLowerCase()))
        ),
      ];

      if (uniqueProofNames.length >= 2) {
        multiWatcherProofGames += 1;

        if (uniqueProofNames.length > bestMultiWatcherSourceCount) {
          bestMultiWatcherSourceCount = uniqueProofNames.length;
          bestMultiWatcherProofLabel = uniqueProofNames.slice(0, 3).join(" + ");
        }
      }
    } catch (error) {
      warnOptionalProfileRail("multi watcher proof", error);
    }
  }

  return {
    multiWatcherProofGames,
    bestMultiWatcherProofLabel,
    bestMultiWatcherSourceCount,
  };
}


async function loadWatcherStats(
  prisma: PrismaClient,
  user: { id: number; uid: string } | null,
  games: PlayerProfileGameRow[],
  verificationLevel: number
): Promise<PlayerWatcherStats> {
  if (!user) {
    const watcherBackedMatches = games.filter((game) => (game.parse_source || "").startsWith("watcher")).length;
    return {
      watcherKeys: 0,
      watcherEventCount: 0,
      watcherBackedMatches,
      uniqueWatchers: 0,
      multiWatcherProofGames: 0,
      bestMultiWatcherProofLabel: null,
      bestMultiWatcherSourceCount: 0,
      lastWatcherSeenAt: null,
      recentParseMisses: 0,
      parserStoredAttempts: 0,
      parserFailedAttempts: 0,
      proofScore: Math.min(100, watcherBackedMatches * 6),
    };
  }

  const [watcherKeys, watcherEvents, parseAttempts] = await Promise.all([
    prisma.apiKey.count({ where: { userId: user.id, kind: "watcher", revokedAt: null } }),
    prisma.watcherClientEvent.findMany({
      where: {
        OR: [{ userId: user.id }, { userUid: user.uid }],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 160,
      select: {
        eventType: true,
        watcherId: true,
        createdAt: true,
        replayHash: true,
      },
    }),
    prisma.replayParseAttempt.findMany({
      where: { userUid: user.uid },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
      select: {
        status: true,
        createdAt: true,
      },
    }),
  ]);

  const watcherBackedMatches = games.filter((game) => (game.parse_source || "").startsWith("watcher")).length;
  const uniqueWatchers = new Set(watcherEvents.map((event) => event.watcherId).filter(Boolean)).size;
  const parserStoredAttempts = parseAttempts.filter((attempt) => attempt.status === "stored").length;
  const parserFailedAttempts = parseAttempts.filter((attempt) => attempt.status !== "stored").length;
  const multiWatcherProof = await loadMultiWatcherProofStats(prisma, games);
  const proofScore = Math.min(
    100,
    verificationLevel * 12 +
      watcherKeys * 8 +
      watcherBackedMatches * 4 +
      multiWatcherProof.multiWatcherProofGames * 14 +
      Math.max(0, multiWatcherProof.bestMultiWatcherSourceCount - 1) * 6 +
      parserStoredAttempts * 2 -
      parserFailedAttempts * 2
  );

  return {
    watcherKeys,
    watcherEventCount: watcherEvents.length,
    watcherBackedMatches,
    uniqueWatchers,
    ...multiWatcherProof,
    lastWatcherSeenAt: watcherEvents[0]?.createdAt.toISOString() ?? null,
    recentParseMisses: parserFailedAttempts,
    parserStoredAttempts,
    parserFailedAttempts,
    proofScore: Math.max(0, proofScore),
  };
}

async function loadStreamStats(
  prisma: PrismaClient,
  twitchUrl: string | null | undefined,
  games: PlayerProfileGameRow[]
): Promise<PlayerProfile["stream"]> {
  const sessionKeys = Array.from(
    new Set(
      games
        .slice(0, 30)
        .map((game) => normalizeSessionKey(game))
        .filter(Boolean)
    )
  );

  const feeds =
    sessionKeys.length > 0
      ? await prisma.gameWatchStream.findMany({
          where: {
            sessionKey: { in: sessionKeys },
            status: "live",
          },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
          take: 20,
          select: {
            sessionKey: true,
            isPrimary: true,
          },
        })
      : [];

  return {
    twitchUrl: twitchUrl || null,
    twitchChannel: extractTwitchChannel(twitchUrl),
    recentFeedCount: feeds.length,
    primarySessionKey: feeds.find((feed) => feed.isPrimary)?.sessionKey ?? feeds[0]?.sessionKey ?? null,
  };
}

async function buildProfileFromPlayer(
  prisma: PrismaClient,
  input: {
    identity: PlayerProfileIdentity;
    currentPlayer: PublicPlayerRef;
    displayName: string;
    aliases: string[];
    user: ClaimedProfileUser | null;
  }
): Promise<PlayerProfile> {
  const candidateGames = await loadCandidateFinalGames(prisma);
  const matchedGames = filterGamesForPlayer(candidateGames, input.currentPlayer);
  const pendingClaimSummaries = await safeLoadPendingWoloClaimSummaries(prisma, input.aliases);
  const currentPlayer = applyPendingWoloClaimSummary(input.currentPlayer, pendingClaimSummaries);
  let community: UserCommunitySummary = { badges: [], gifts: [], giftedWolo: 0 };
  if (input.user) {
    try {
      community = (await loadUserCommunitySummaries(prisma, [input.user.id])).get(input.user.id) ?? community;
    } catch (error) {
      if (!isMissingPrismaStorageError(error)) {
        throw error;
      }
      warnOptionalProfileRail("community honor", error);
    }
  }

  const performance = buildPlayerPerformanceStats(matchedGames, currentPlayer);
  const command = buildCommandStats(matchedGames, currentPlayer);
  const resources = buildResourceStats(matchedGames, currentPlayer);
  const charts = buildCharts(matchedGames, currentPlayer);
  const bestGames = buildBestGames(matchedGames, currentPlayer);

  const [watcher, wolo, stream, rivalries] = await Promise.all([
    loadWatcherStats(prisma, input.user, matchedGames, input.user?.verificationLevel ?? 0),
    loadWoloStats(prisma, input.aliases, input.user ? { id: input.user.id } : null, community.giftedWolo),
    loadStreamStats(prisma, input.user?.twitchStreamUrl ?? null, matchedGames),
    buildRivalSummaries(prisma, matchedGames.slice(0, 60), currentPlayer),
  ]);

  const latestPlayerRecord = matchedGames.map((game) => currentPlayerRecord(game, currentPlayer)).find(Boolean);
  const steamRmRating =
    latestPlayerRecord ? readPlayerSteamRmRating(latestPlayerRecord) : performance.steamRating;
  const steamDmRating =
    latestPlayerRecord ? readPlayerSteamDmRating(latestPlayerRecord) : performance.ladderRating;
  const steamId = latestPlayerRecord ? readPlayerSteamId(latestPlayerRecord) : input.user?.steamId ?? null;

  const profileCore = {
    displayName: input.displayName,
    command,
    watcher,
    wolo,
    resources,
    stream,
  };

  return {
    identity: input.identity,
    displayName: input.displayName,
    href:
      input.identity.kind === "claimed"
        ? `/players/${input.identity.uid}`
        : `/players/by-name/${encodeURIComponent(input.identity.name)}`,
    claimHref:
      input.identity.kind === "replay"
        ? `/profile?claim_name=${encodeURIComponent(input.identity.name)}`
        : null,
    currentPlayer,
    aliases: input.aliases,
    isClaimed: Boolean(input.user),
    isVerified: Boolean(input.user?.verified),
    verificationLevel: input.user?.verificationLevel ?? 0,
    verificationMethod: input.user?.verificationMethod ?? "replay",
    createdAt: toIso(input.user?.createdAt ?? null),
    verifiedAt: toIso(input.user?.verifiedAt ?? null),
    lastSeenAt: toIso(input.user?.lastSeen ?? null),
    isLive: Boolean(input.user?.lastSeen && input.user.lastSeen.getTime() > Date.now() - 2 * 60 * 1000),
    steam: {
      personaName: input.user?.steamPersonaName ?? null,
      steamId,
      rmRating: steamRmRating,
      dmRating: steamDmRating,
      ratingLastSeenAt: performance.ratingLastSeenAt,
    },
    stream,
    community: {
      badges: community.badges,
      giftedWolo: community.giftedWolo,
    },
    performance,
    command,
    resources,
    watcher,
    wolo,
    charts,
    bestGames,
    rivalries,
    matchFeed: buildMatchFeed(matchedGames, currentPlayer, 0, PROFILE_INITIAL_MATCH_LIMIT),
    tickerItems: buildTickerItems(profileCore),
  };
}

async function loadClaimedProfileUser(prisma: PrismaClient, uid: string): Promise<ClaimedProfileUser | null> {
  try {
    return await prisma.user.findUnique({
      where: { uid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        steamId: true,
        twitchStreamUrl: true,
        verified: true,
        verificationLevel: true,
        verificationMethod: true,
        verifiedAt: true,
        lastSeen: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (!isMissingPrismaStorageError(error)) {
      throw error;
    }

    warnOptionalProfileRail("claimed user detail", error);
    const fallbackUser = await prisma.user.findUnique({
      where: { uid },
      select: {
        id: true,
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        steamId: true,
        verified: true,
        verificationLevel: true,
        verifiedAt: true,
        lastSeen: true,
        createdAt: true,
      },
    });

    return fallbackUser
      ? {
          ...fallbackUser,
          twitchStreamUrl: null,
          verificationMethod: "none",
        }
      : null;
  }
}

export async function loadClaimedPlayerProfile(prisma: PrismaClient, uid: string) {
  const user = await loadClaimedProfileUser(prisma, uid);

  if (!user) return null;

  const displayName = user.inGameName || user.steamPersonaName || user.uid;
  const currentPlayer = buildClaimedPublicPlayerRef(user, displayName);
  const aliases = Array.from(
    new Set(
      [user.inGameName, user.steamPersonaName, displayName]
        .map((name) => normalizePublicPlayerName(name))
        .filter(Boolean)
    )
  );

  return buildProfileFromPlayer(prisma, {
    identity: { kind: "claimed", uid },
    currentPlayer,
    displayName,
    aliases,
    user,
  });
}

export async function loadReplayPlayerProfile(prisma: PrismaClient, name: string) {
  const playerName = normalizePublicPlayerName(name);
  if (!playerName) return null;

  const currentPlayer = buildReplayPublicPlayerRef(playerName);
  const profile = await buildProfileFromPlayer(prisma, {
    identity: { kind: "replay", name: playerName },
    currentPlayer,
    displayName: playerName,
    aliases: [playerName],
    user: null,
  });

  return profile.command.totalMatches > 0 ? profile : null;
}

async function resolveMatchFeedIdentity(prisma: PrismaClient, identity: PlayerProfileIdentity) {
  if (identity.kind === "claimed") {
    const user = await prisma.user.findUnique({
      where: { uid: identity.uid },
      select: {
        uid: true,
        inGameName: true,
        steamPersonaName: true,
        verified: true,
        verificationLevel: true,
      },
    });
    if (!user) return null;
    const displayName = user.inGameName || user.steamPersonaName || user.uid;
    return buildClaimedPublicPlayerRef(user, displayName);
  }

  const name = normalizePublicPlayerName(identity.name);
  return name ? buildReplayPublicPlayerRef(name) : null;
}

export async function loadPlayerProfileMatchPage(
  prisma: PrismaClient,
  identity: PlayerProfileIdentity,
  cursor = 0,
  limit = PROFILE_MATCH_PAGE_LIMIT
) {
  const currentPlayer = await resolveMatchFeedIdentity(prisma, identity);
  if (!currentPlayer) return null;

  const games = filterGamesForPlayer(await loadCandidateFinalGames(prisma), currentPlayer);
  return buildMatchFeed(
    games,
    currentPlayer,
    Math.max(0, Math.round(cursor || 0)),
    Math.max(1, Math.min(36, Math.round(limit || PROFILE_MATCH_PAGE_LIMIT)))
  );
}

export function parsePlayerProfileViewMode(
  value: string | string[] | undefined,
  defaultMode: PlayerProfileViewMode = "advanced"
): PlayerProfileViewMode {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "basic" || raw === "advanced") return raw;
  return defaultMode;
}
