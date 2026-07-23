import type { PrismaClient } from "@/lib/generated/prisma";

import { displayPlayerName, parsePlayers, readPlayedAt } from "@/lib/gameStatsView";
import {
  LOBBY_LEADERBOARD_MIN_MATCHES,
  type LobbyLeaderboardEntry,
  type LobbyLeaderboardSummary,
} from "@/lib/lobby";
import {
  loadPublicPlayerDirectory,
  type PublicPlayerDirectoryEntry,
} from "@/lib/publicPlayerDirectory";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  applyReplayAdjudicationToGameStats,
  EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
} from "@/lib/replayAdjudications";
import {
  normalizeLeaderboardLane,
  type LeaderboardLane,
} from "@/lib/leaderboardLane";
import {
  normalizeLeaderboardSortDirection,
  normalizeLeaderboardSortKey,
  streakSortScore,
  type LeaderboardSortDirection,
  type LeaderboardSortKey,
} from "@/lib/leaderboardSort";
import {
  matchesLeaderboardSearch,
  normalizeLeaderboardSearch,
} from "@/lib/leaderboardPage";
import {
  resolveReplayResultForPlayer,
  type ReplayPlayerResultGame,
} from "@/lib/replayPlayerResult";

const BASE_ARENA_ELO = 1500;
const ARENA_ELO_K_FACTOR = 32;
const LEADERBOARD_GAME_WINDOW = 5000;
const LEADERBOARD_CACHE_TTL_MS = 15_000;
const LEADERBOARD_CACHE_MAX_ENTRIES = 24;

type LeaderboardCacheEntry = {
  expiresAt: number;
  value: LobbyLeaderboardSummary;
};

const leaderboardCache = new Map<string, LeaderboardCacheEntry>();
const leaderboardPromises =
  new Map<string, Promise<LobbyLeaderboardSummary>>();

const SUPERSEDED_PARSE_REASON = "superseded_by_later_upload";

export type LoadLobbyLeaderboardOptions = {
  offset?: number;
  limit?: number;
  includePendingClaimed?: boolean;
  lane?: LeaderboardLane;
  query?: string | null;
  sortKey?: LeaderboardSortKey | null;
  sortDirection?: LeaderboardSortDirection | null;
};

type PreparedLeaderboardGame = Omit<ReplayPlayerResultGame, "players"> & {
  players: ReturnType<typeof parsePlayers>;
  playedAtMs: number;
};

type CandidateLeaderboardGame = {
  createdAt: Date;
  event_types: unknown;
  id: number;
  is_final: boolean;
  key_events: unknown;
  original_filename: string | null;
  played_on: Date | null;
  players: unknown;
  replay_file: string | null;
  replayHash: string | null;
  timestamp: Date | null;
  winner: string | null;
  parse_reason: string | null;
  parse_source: string | null;
};

type EnrichedLeaderboardEntry = PublicPlayerDirectoryEntry & {
  aliasKeys: Set<string>;
  resolvedMatches: number;
  winRate: number;
  lastPlayedAtMs: number;
  arenaElo: number;
  pendingWoloClaimCount: number;
  pendingWoloClaimAmount: number;
  streakLabel: string | null;
  streakScore: number;
};

function normalizeLeaderboardKey(value: string | null | undefined) {
  return normalizePublicPlayerName(value).toLowerCase();
}

function buildAliasKeys(entry: PublicPlayerDirectoryEntry) {
  const aliasKeys = new Set<string>();

  for (const value of [entry.name, entry.inGameName, entry.steamPersonaName, ...entry.aliases]) {
    const normalized = normalizeLeaderboardKey(value);
    if (normalized) {
      aliasKeys.add(normalized);
    }
  }

  return aliasKeys;
}

function buildEnrichedEntry(entry: PublicPlayerDirectoryEntry): EnrichedLeaderboardEntry {
  const resolvedMatches = entry.wins + entry.losses;

  return {
    ...entry,
    aliasKeys: buildAliasKeys(entry),
    resolvedMatches,
    winRate: resolvedMatches > 0 ? entry.wins / resolvedMatches : 0,
    lastPlayedAtMs: entry.lastPlayedAt ? new Date(entry.lastPlayedAt).getTime() : 0,
    arenaElo: BASE_ARENA_ELO,
    pendingWoloClaimCount: entry.pendingWoloClaimCount || 0,
    pendingWoloClaimAmount: entry.pendingWoloClaimAmount || 0,
    streakLabel: null,
    streakScore: 0,
  };
}

function hasTrackedHistory(entry: EnrichedLeaderboardEntry) {
  return entry.totalMatches > 0;
}

function getLaneRating(entry: EnrichedLeaderboardEntry, lane: LeaderboardLane) {
  const rating = lane === "dm" ? entry.steamDmRating : entry.steamRmRating;
  return typeof rating === "number" && Number.isFinite(rating) ? rating : null;
}

function hasLaneRating(entry: EnrichedLeaderboardEntry, lane: LeaderboardLane) {
  return getLaneRating(entry, lane) !== null;
}

function getPrimaryRatingValue(entry: EnrichedLeaderboardEntry, lane: LeaderboardLane) {
  const laneRating = getLaneRating(entry, lane);
  if (laneRating !== null) {
    return Math.round(laneRating);
  }

  if (lane === "dm" || !hasTrackedHistory(entry)) {
    return null;
  }

  return entry.arenaElo;
}

function compareLeaderboardEntries(
  left: EnrichedLeaderboardEntry,
  right: EnrichedLeaderboardEntry,
  lane: LeaderboardLane
) {
  const leftPrimaryRating = getPrimaryRatingValue(left, lane);
  const rightPrimaryRating = getPrimaryRatingValue(right, lane);

  if (leftPrimaryRating !== rightPrimaryRating) {
    return (rightPrimaryRating ?? Number.NEGATIVE_INFINITY) - (leftPrimaryRating ?? Number.NEGATIVE_INFINITY);
  }

  if (hasLaneRating(left, lane) !== hasLaneRating(right, lane)) {
    return Number(hasLaneRating(right, lane)) - Number(hasLaneRating(left, lane));
  }

  if (left.arenaElo !== right.arenaElo) {
    return right.arenaElo - left.arenaElo;
  }

  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }

  if (left.resolvedMatches !== right.resolvedMatches) {
    return right.resolvedMatches - left.resolvedMatches;
  }

  if (left.wins !== right.wins) {
    return right.wins - left.wins;
  }

  if (left.lastPlayedAtMs !== right.lastPlayedAtMs) {
    return right.lastPlayedAtMs - left.lastPlayedAtMs;
  }

  if (left.verified !== right.verified) {
    return Number(right.verified) - Number(left.verified);
  }

  if (left.claimed !== right.claimed) {
    return Number(right.claimed) - Number(left.claimed);
  }

  return left.name.localeCompare(right.name);
}

const LOBBY_LEADERBOARD_INITIAL_ENTRY_LIMIT = 600;

function compareNullableSortNumber(
  left: number | null,
  right: number | null,
  direction: LeaderboardSortDirection
) {
  if (left === null && right === null) {
    return 0;
  }

  // Missing values always stay at the bottom regardless of direction.
  if (left === null) {
    return 1;
  }

  if (right === null) {
    return -1;
  }

  return direction === "asc"
    ? left - right
    : right - left;
}

function compareRequestedLeaderboardSort(
  left: EnrichedLeaderboardEntry,
  right: EnrichedLeaderboardEntry,
  sortKey: LeaderboardSortKey,
  direction: LeaderboardSortDirection,
  lane: LeaderboardLane,
  rankByKey: Map<string, number>
) {
  let comparison = 0;

  switch (sortKey) {
    case "rank":
      comparison = compareNullableSortNumber(
        rankByKey.get(left.key) ?? null,
        rankByKey.get(right.key) ?? null,
        direction
      );
      break;

    case "rating":
      comparison = compareNullableSortNumber(
        getPrimaryRatingValue(left, lane),
        getPrimaryRatingValue(right, lane),
        direction
      );
      break;

    case "warrior":
      comparison = left.name.localeCompare(
        right.name,
        undefined,
        {
          numeric: true,
          sensitivity: "base",
        }
      );

      if (direction === "desc") {
        comparison *= -1;
      }
      break;

    case "win_rate":
      comparison = compareNullableSortNumber(
        left.resolvedMatches > 0 ? left.winRate : null,
        right.resolvedMatches > 0 ? right.winRate : null,
        direction
      );
      break;

    case "wins":
      comparison = compareNullableSortNumber(
        left.wins,
        right.wins,
        direction
      );
      break;

    case "losses":
      comparison = compareNullableSortNumber(
        left.losses,
        right.losses,
        direction
      );
      break;

    case "games":
      comparison = compareNullableSortNumber(
        left.totalMatches,
        right.totalMatches,
        direction
      );
      break;

    case "streak":
      comparison = compareNullableSortNumber(
        left.streakScore,
        right.streakScore,
        direction
      );
      break;
  }

  if (comparison !== 0) {
    return comparison;
  }

  // Every alternate sort gets a deterministic canonical-rank tie breaker.
  const rankComparison =
    (rankByKey.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
    (rankByKey.get(right.key) ?? Number.MAX_SAFE_INTEGER);

  if (rankComparison !== 0) {
    return rankComparison;
  }

  return compareLeaderboardEntries(left, right, lane);
}

function buildLeaderboardSelection(
  entries: EnrichedLeaderboardEntry[],
  options: LoadLobbyLeaderboardOptions = {}
) {
  const lane = normalizeLeaderboardLane(options.lane);

  const eligibleEntries = entries
    .filter(
      (entry) =>
        entry.totalMatches >= LOBBY_LEADERBOARD_MIN_MATCHES
    )
    .sort((left, right) =>
      compareLeaderboardEntries(left, right, lane)
    );

  const rankedEntries = entries
    .filter((entry) => entry.totalMatches > 0)
    .sort((left, right) =>
      compareLeaderboardEntries(left, right, lane)
    );

  const pendingClaimedEntries = entries
    .filter(
      (entry) =>
        entry.claimed &&
        entry.totalMatches === 0
    )
    .sort((left, right) => {
      if (left.isOnline !== right.isOnline) {
        return Number(right.isOnline) - Number(left.isOnline);
      }

      if (left.verified !== right.verified) {
        return Number(right.verified) - Number(left.verified);
      }

      return left.name.localeCompare(right.name);
    });

  const featuredClaimedEntries = entries
    .filter(
      (entry) =>
        entry.claimed &&
        entry.uid &&
        entry.hasFeaturedAvatar
    )
    .sort((left, right) =>
      compareLeaderboardEntries(
        left,
        right,
        lane
      )
    );

  // Rank is always canonical. Sorting another column changes row order,
  // never the warrior's actual ladder rank.
  const rankByKey = new Map<string, number>();

  rankedEntries.forEach((entry, index) => {
    rankByKey.set(entry.key, index + 1);
  });

  pendingClaimedEntries.forEach((entry, index) => {
    if (!rankByKey.has(entry.key)) {
      rankByKey.set(
        entry.key,
        rankedEntries.length + index + 1
      );
    }
  });

  const safeOffset = Math.max(
    0,
    Math.floor(options.offset ?? 0)
  );

  const safeLimit = Math.max(
    1,
    Math.min(
      2500,
      Math.floor(
        options.limit ??
          LOBBY_LEADERBOARD_INITIAL_ENTRY_LIMIT
      )
    )
  );

  const includePendingClaimed =
    options.includePendingClaimed ?? true;

  const defaultOrderedEntries = [
    ...rankedEntries,
    ...pendingClaimedEntries,
  ];

  const normalizedQuery =
    normalizeLeaderboardSearch(options.query);

  const filteredEntries = normalizedQuery
    ? defaultOrderedEntries.filter((entry) =>
        matchesLeaderboardSearch(
          entry.aliasKeys,
          normalizedQuery
        )
      )
    : defaultOrderedEntries;

  const sortKey =
    normalizeLeaderboardSortKey(options.sortKey);

  const sortDirection = sortKey
    ? normalizeLeaderboardSortDirection(
        options.sortDirection
      )
    : null;

  const searchableEntries =
    sortKey && sortDirection
      ? [...filteredEntries].sort((left, right) =>
          compareRequestedLeaderboardSort(
            left,
            right,
            sortKey,
            sortDirection,
            lane,
            rankByKey
          )
        )
      : filteredEntries;

  const selectedByKey =
    new Map<string, EnrichedLeaderboardEntry>();

  for (
    const entry of searchableEntries.slice(
      safeOffset,
      safeOffset + safeLimit
    )
  ) {
    selectedByKey.set(entry.key, entry);
  }

  if (
    includePendingClaimed &&
    !normalizedQuery
  ) {
    for (const entry of pendingClaimedEntries) {
      selectedByKey.set(entry.key, entry);
    }
  }

  if (!normalizedQuery) {
    for (const entry of featuredClaimedEntries) {
      selectedByKey.set(entry.key, entry);
    }
  }

  return {
    eligibleEntries,
    selectedEntries:
      Array.from(selectedByKey.values()),
    rankByKey,
    fullEntryCount: searchableEntries.length,
  };
}

function buildAliasEntryMap(entries: EnrichedLeaderboardEntry[]) {
  const aliasToEntry = new Map<string, EnrichedLeaderboardEntry>();

  for (const entry of entries) {
    for (const aliasKey of entry.aliasKeys) {
      const existing = aliasToEntry.get(aliasKey);
      if (!existing) {
        aliasToEntry.set(aliasKey, entry);
        continue;
      }

      if (existing.claimed === entry.claimed) {
        continue;
      }

      if (!existing.claimed && entry.claimed) {
        aliasToEntry.set(aliasKey, entry);
      }
    }
  }

  return aliasToEntry;
}


function applyPendingClaimSummaries(
  entries: EnrichedLeaderboardEntry[],
  summaryMap: Map<
    string,
    {
      pendingAmountWolo: number;
      pendingCount: number;
      latestCreatedAt: string | null;
      claimIds: number[];
    }
  >
) {
  for (const entry of entries) {
    const seenClaimIds = new Set<number>();

    let pendingCount = entry.pendingWoloClaimCount || 0;

    let pendingAmountWolo = entry.pendingWoloClaimAmount || 0;

    for (const aliasKey of entry.aliasKeys) {
      const summary = summaryMap.get(aliasKey);
      if (!summary) continue;

      for (const claimId of summary.claimIds) {
        if (seenClaimIds.has(claimId)) continue;
        seenClaimIds.add(claimId);
        pendingCount += 1;
      }

      pendingAmountWolo += summary.pendingAmountWolo;
    }

    entry.pendingWoloClaimCount = pendingCount;
    entry.pendingWoloClaimAmount = pendingAmountWolo;
  }
}

function buildArenaElo(entries: EnrichedLeaderboardEntry[], games: PreparedLeaderboardGame[]) {
  const aliasToEntry = buildAliasEntryMap(entries);
  const ratings = new Map(entries.map((entry) => [entry.key, BASE_ARENA_ELO]));

  for (const game of games) {
    const participantNames = game.players
      .map((player) => normalizeLeaderboardKey(displayPlayerName(player)))
      .filter(Boolean);

    if (participantNames.length !== 2) {
      continue;
    }

    const participantEntries = participantNames
      .map((playerName) => aliasToEntry.get(playerName))
      .filter((entry): entry is EnrichedLeaderboardEntry => Boolean(entry));

    if (participantEntries.length !== 2) {
      continue;
    }

    if (participantEntries[0].key === participantEntries[1].key) {
      continue;
    }

    const [entryA, entryB] = participantEntries;
    const outcomeA = resolveReplayResultForPlayer(
      game,
      (player) => entryA.aliasKeys.has(normalizeLeaderboardKey(player.name))
    );
    const outcomeB = resolveReplayResultForPlayer(
      game,
      (player) => entryB.aliasKeys.has(normalizeLeaderboardKey(player.name))
    );
    if (
      !(
        (outcomeA === "win" && outcomeB === "loss") ||
        (outcomeA === "loss" && outcomeB === "win")
      )
    ) {
      continue;
    }

    const ratingA = ratings.get(entryA.key) ?? BASE_ARENA_ELO;
    const ratingB = ratings.get(entryB.key) ?? BASE_ARENA_ELO;
    const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
    const expectedB = 1 / (1 + 10 ** ((ratingA - ratingB) / 400));
    const scoreA = outcomeA === "win" ? 1 : 0;
    const scoreB = outcomeB === "win" ? 1 : 0;

    ratings.set(entryA.key, ratingA + ARENA_ELO_K_FACTOR * (scoreA - expectedA));
    ratings.set(entryB.key, ratingB + ARENA_ELO_K_FACTOR * (scoreB - expectedB));
  }

  for (const entry of entries) {
    entry.arenaElo = Math.round(ratings.get(entry.key) ?? BASE_ARENA_ELO);
  }
}

function buildEntryOutcome(
  entry: EnrichedLeaderboardEntry,
  game: PreparedLeaderboardGame
) {
  const result = resolveReplayResultForPlayer(
    game,
    (player) => entry.aliasKeys.has(normalizeLeaderboardKey(player.name))
  );
  return result === "win" ? "W" : result === "loss" ? "L" : null;
}

function buildStreakLabel(entry: EnrichedLeaderboardEntry, games: PreparedLeaderboardGame[]) {
  let direction: "W" | "L" | null = null;
  let count = 0;

  for (const game of games) {
    const includesEntry = game.players.some((player) =>
      entry.aliasKeys.has(normalizeLeaderboardKey(displayPlayerName(player)))
    );

    if (!includesEntry) {
      continue;
    }

    const outcome = buildEntryOutcome(entry, game);
    if (!outcome) {
      if (direction) {
        break;
      }
      continue;
    }

    if (!direction) {
      direction = outcome;
      count = 1;
      continue;
    }

    if (outcome === direction) {
      count += 1;
      continue;
    }

    break;
  }

  return direction ? `${direction}${count}` : null;
}

function buildPrimaryRatingLabel(entry: EnrichedLeaderboardEntry, lane: LeaderboardLane) {
  const value = getPrimaryRatingValue(entry, lane);
  return value === null ? "Pending" : String(Math.round(value));
}

function buildPrimaryRatingSourceLabel(entry: EnrichedLeaderboardEntry, lane: LeaderboardLane) {
  if (hasLaneRating(entry, lane)) {
    return lane === "dm" ? "DM Rating" : "RM Rating";
  }

  if (lane === "dm") {
    return hasTrackedHistory(entry) ? "DM Rating" : "Profile";
  }

  return hasTrackedHistory(entry) ? "Site Elo" : "Profile";
}

function buildSecondaryRatingLabel(entry: EnrichedLeaderboardEntry, lane: LeaderboardLane) {
  if (!hasLaneRating(entry, lane) || !hasTrackedHistory(entry)) {
    return null;
  }

  return `Site ${Math.round(entry.arenaElo)}`;
}

function toLobbyLeaderboardEntry(
  entry: EnrichedLeaderboardEntry,
  rank: number,
  lane: LeaderboardLane
): LobbyLeaderboardEntry {
  return {
    rank,
    key: entry.key,
    name: entry.name,
    uid: "uid" in entry ? ((entry as { uid?: string | null }).uid ?? null) : null,
    href: entry.href,
    elo: Math.round(entry.arenaElo),
    arenaElo: Math.round(entry.arenaElo),
    steamRmRating: entry.steamRmRating,
    steamDmRating: entry.steamDmRating,
    primaryRating: getPrimaryRatingValue(entry, lane),
    primaryRatingLabel: buildPrimaryRatingLabel(entry, lane),
    primaryRatingSourceLabel: buildPrimaryRatingSourceLabel(entry, lane),
    secondaryRatingLabel: buildSecondaryRatingLabel(entry, lane),
    ratingLabel: buildPrimaryRatingLabel(entry, lane),
    wins: entry.wins,
    losses: entry.losses,
    unknowns: entry.unknowns,
    streakLabel: entry.streakLabel,
    verified: entry.verified,
    verificationLevel: entry.verificationLevel,
    isOnline: entry.isOnline,
    claimed: entry.claimed,
    hasFeaturedAvatar: entry.hasFeaturedAvatar,
    pendingWoloClaimCount: entry.pendingWoloClaimCount,
    pendingWoloClaimAmount: entry.pendingWoloClaimAmount,
    totalMatches: entry.totalMatches,
    lastPlayedAt: entry.lastPlayedAt,
    provisional: entry.totalMatches < LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}

function getCandidateGamePlayedAtMs(game: CandidateLeaderboardGame) {
  const playedAt = readPlayedAt(game);
  if (!playedAt) return 0;

  const playedAtMs = new Date(playedAt).getTime();
  return Number.isFinite(playedAtMs) ? playedAtMs : 0;
}

function sortCandidateGamesByPlayedAtDesc(
  left: CandidateLeaderboardGame,
  right: CandidateLeaderboardGame
) {
  const playedAtDiff = getCandidateGamePlayedAtMs(right) - getCandidateGamePlayedAtMs(left);
  if (playedAtDiff !== 0) {
    return playedAtDiff;
  }

  const timestampDiff =
    new Date(right.timestamp ?? right.createdAt).getTime() -
    new Date(left.timestamp ?? left.createdAt).getTime();
  if (timestampDiff !== 0) {
    return timestampDiff;
  }

  return right.id - left.id;
}

function discoveredPlayerKey(name: string | null | undefined) {
  return String(name ?? "").trim().toLowerCase();
}

function buildDiscoveredLeaderboardEntries(
  preparedGames: PreparedLeaderboardGame[],
  existingNames: Set<string>
) {
  const discovered = new Map<string, EnrichedLeaderboardEntry>();

  for (const game of preparedGames) {
    for (const player of game.players) {
      const name = String(player.name || "").trim();
      if (!name) continue;

      const normalizedName = discoveredPlayerKey(name);
      const key = `discovered:${normalizedName}`;
      if (existingNames.has(normalizedName) || discovered.has(key)) continue;

      const ratingSnapshot =
        typeof player.rate_snapshot === "number"
          ? player.rate_snapshot
          : null;

      const steamRmRating =
        typeof player.steam_rm_rating === "number"
          ? player.steam_rm_rating
          : ratingSnapshot;

      const steamDmRating =
        typeof player.steam_dm_rating === "number" ? player.steam_dm_rating : null;
      const result = resolveReplayResultForPlayer(
        game,
        (candidate) => normalizeLeaderboardKey(candidate.name) === normalizedName
      );

      discovered.set(key, {
        key,
        name,
        href: `/players/by-name/${encodeURIComponent(name)}`,
        profileHref: `/players/by-name/${encodeURIComponent(name)}`,
        inGameName: name,
        steamPersonaName: name,
        aliases: [name],
        aliasKeys: new Set([normalizedName]),
        claimed: false,
        verified: false,
        verificationLevel: 0,
         isOnline: false,
         hasFeaturedAvatar: false,
         lastSeen: null,
        lastSeenAt: null,
        avatarUrl: null,
        uid: null,
        steamId: typeof player.steam_id === "string" ? player.steam_id : null,
        steamRmRating,
        steamDmRating,
        arenaElo: ratingSnapshot ?? steamRmRating ?? steamDmRating ?? 1500,
        totalMatches: 1,
        wins: result === "win" ? 1 : 0,
        losses: result === "loss" ? 1 : 0,
        unknowns: result === "unknown" ? 1 : 0,
        currentStreak: result === "win" ? 1 : result === "loss" ? -1 : 0,
        lastPlayedAt: Number.isFinite(game.playedAtMs)
          ? new Date(game.playedAtMs).toISOString()
          : null,
        pendingWoloClaimAmount: 0,
        pendingWoloClaimCount: 0,
        streakLabel: null,
        streakScore: 0,
        lastSteamSyncAt: null,
      } as unknown as EnrichedLeaderboardEntry);
    }
  }

  return Array.from(discovered.values());
}

async function loadLobbyLeaderboardFresh(
  prisma: PrismaClient,
  options: LoadLobbyLeaderboardOptions = {}
): Promise<LobbyLeaderboardSummary> {
  const lane = normalizeLeaderboardLane(options.lane);
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [directory, rawLeaderboardGames] = await Promise.all([
    loadPublicPlayerDirectory(prisma),
    prisma.gameStats.findMany({
      where: {
        is_final: true,
        NOT: {
          parse_reason: SUPERSEDED_PARSE_REASON,
        },
      },
      orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: LEADERBOARD_GAME_WINDOW,
      select: {
        createdAt: true,
        event_types: true,
        id: true,
        is_final: true,
        key_events: true,
        original_filename: true,
        played_on: true,
        players: true,
        replay_file: true,
        replayHash: true,
        timestamp: true,
        winner: true,
        parse_reason: true,
        parse_source: true,
        replayResultAdjudications: EFFECTIVE_REPLAY_RESULT_ADJUDICATION_RELATION,
      },
    }),
  ]);

  const leaderboardGames = rawLeaderboardGames
    .map((game) => applyReplayAdjudicationToGameStats(game) as CandidateLeaderboardGame)
    .sort(sortCandidateGamesByPlayedAtDesc);
  const uniqueGames = cleanPublicGameRows(leaderboardGames, {
    includeReview: true,
    includeLive: false,
  });
  const resolvedGames = cleanPublicGameRows(leaderboardGames, {
    includeReview: false,
    includeLive: false,
  });

  const preparedGames: PreparedLeaderboardGame[] = resolvedGames.map((game) => {
    const playedAt = readPlayedAt(game);

    return {
      ...game,
      players: parsePlayers(game.players),
      playedAtMs: playedAt ? new Date(playedAt).getTime() : 0,
    };
  });

  const recentGames = [...preparedGames].sort((left, right) => right.playedAtMs - left.playedAtMs);
  const dayStartMs = dayStart.getTime();
  const isToday = (game: CandidateLeaderboardGame) => {
    const playedAt = readPlayedAt(game);
    const playedAtMs = playedAt ? new Date(playedAt).getTime() : 0;
    return Number.isFinite(playedAtMs) && playedAtMs >= dayStartMs;
  };
  const matchesToday = resolvedGames.filter(isToday).length;
  const uniqueReplaysToday = uniqueGames.filter(isToday).length;
  const needsReviewToday = Math.max(0, uniqueReplaysToday - matchesToday);

  const candidates = directory.allEntries
    .filter((entry) => entry.totalMatches > 0 || entry.claimed)
    .map(buildEnrichedEntry);

  const candidateNames = new Set(
    candidates.flatMap((entry) => [
      entry.name,
      entry.inGameName,
      entry.steamPersonaName,
      ...entry.aliases,
    ]).map(discoveredPlayerKey).filter(Boolean)
  );
  for (const discoveredEntry of buildDiscoveredLeaderboardEntries(preparedGames, candidateNames)) {
    candidates.push(discoveredEntry);
  }

  try {
    const pendingSummaries = await loadPendingWoloClaimSummariesByName(
      prisma,
      candidates.flatMap((entry) => [
        entry.name,
        entry.inGameName,
        entry.steamPersonaName,
        ...entry.aliases,
      ])
    );
    applyPendingClaimSummaries(candidates, pendingSummaries);
  } catch (error) {
    console.warn("Pending WOLO claim telemetry unavailable for leaderboard:", error);
  }
  buildArenaElo(candidates, preparedGames);

  for (const candidate of candidates) {
    candidate.streakLabel =
      buildStreakLabel(candidate, recentGames);
    candidate.streakScore =
      streakSortScore(candidate.streakLabel);
  }

  const {
    eligibleEntries,
    selectedEntries,
    rankByKey,
    fullEntryCount,
  } = buildLeaderboardSelection(
    candidates,
    options
  );

  return {
    title: lane === "dm" ? "Deathmatch Leaderboard" : "Ranked Match Leaderboard",
    lane,
    statusLabel: lane.toUpperCase(),
    entries: selectedEntries.map((entry) =>
      toLobbyLeaderboardEntry(
        entry,
        rankByKey.get(entry.key) ?? 1,
        lane
      )
    ),
    activePlayers: directory.activeClaimed.length,
    matchesToday,
    resolvedGamesToday: matchesToday,
    uniqueReplaysToday,
    needsReviewToday,
    trackedPlayers: fullEntryCount,
    rankedPlayers: eligibleEntries.length,
    minimumMatches: LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}

function buildLeaderboardCacheKey(
  options: LoadLobbyLeaderboardOptions
) {
  return JSON.stringify({
    lane: normalizeLeaderboardLane(options.lane),
    offset: Math.max(0, Math.floor(options.offset ?? 0)),
    limit: Math.max(
      1,
      Math.min(
        2500,
        Math.floor(
          options.limit ??
            LOBBY_LEADERBOARD_INITIAL_ENTRY_LIMIT
        )
      )
    ),
    includePendingClaimed:
      options.includePendingClaimed ?? true,
    query: normalizeLeaderboardSearch(options.query),
    sortKey: normalizeLeaderboardSortKey(
      options.sortKey
    ),
    sortDirection:
      normalizeLeaderboardSortDirection(
        options.sortDirection
      ),
  });
}

export async function loadLobbyLeaderboard(
  prisma: PrismaClient,
  options: LoadLobbyLeaderboardOptions = {}
): Promise<LobbyLeaderboardSummary> {
  const now = Date.now();
  const cacheKey = buildLeaderboardCacheKey(options);
  const cached = leaderboardCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inFlight = leaderboardPromises.get(cacheKey);

  if (inFlight) {
    return inFlight;
  }

  const run = loadLobbyLeaderboardFresh(prisma, options)
    .then((value) => {
      leaderboardCache.set(cacheKey, {
        expiresAt:
          Date.now() + LEADERBOARD_CACHE_TTL_MS,
        value,
      });

      if (
        leaderboardCache.size >
        LEADERBOARD_CACHE_MAX_ENTRIES
      ) {
        for (const [key, entry] of leaderboardCache) {
          if (
            entry.expiresAt <= Date.now() ||
            leaderboardCache.size >
              LEADERBOARD_CACHE_MAX_ENTRIES
          ) {
            leaderboardCache.delete(key);
          }
        }
      }

      return value;
    })
    .finally(() => {
      if (leaderboardPromises.get(cacheKey) === run) {
        leaderboardPromises.delete(cacheKey);
      }
    });

  leaderboardPromises.set(cacheKey, run);
  return run;
}
