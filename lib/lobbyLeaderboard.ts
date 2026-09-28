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
  type PublicPlayerReplayEvidence,
} from "@/lib/publicPlayerDirectory";
import { loadPublicPlayerDirectoryGeneration } from "@/lib/publicPlayerDirectoryGeneration";
import { loadPublicPresenceSnapshot } from "@/lib/publicPresence";
import { createGenerationKeyedLoader } from "@/lib/generationKeyedLoader";
import { loadPublicReplayGeneration } from "@/lib/publicReplayGeneration";
import { isPublicBattleArchiveRow } from "@/lib/publicBattleArchiveEligibility";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  applyReplayAdjudicationToGameStats,
} from "@/lib/replayAdjudications";
import {
  normalizeLeaderboardLane,
  type LeaderboardLane,
} from "@/lib/leaderboardLane";
import {
  normalizeLeaderboardScope,
  type LeaderboardScope,
} from "@/lib/leaderboardScope";
import {
  normalizeLeaderboardSortDirection,
  normalizeLeaderboardSortKey,
  streakSortScore,
  type LeaderboardSortDirection,
  type LeaderboardSortKey,
} from "@/lib/leaderboardSort";
import {
  normalizeLeaderboardSearch,
} from "@/lib/leaderboardPage";
import {
  resolveReplayResultForPlayer,
  type ReplayPlayerResultGame,
} from "@/lib/replayPlayerResult";
import {
  normalizeLeaderboardSteamId,
  readLeaderboardSteamId,
  resolveRankDelta24h,
  type LeaderboardRankDelta24h,
} from "@/lib/leaderboardIdentity";
import { isLeaderboardExcludedSystemUid } from "@/lib/internalSystemAccounts";
import { featuredWarriorBestRank } from "@/lib/featuredWarriorPresentation";

import {
  loadPublicLeaderboardRawGames,
} from "@/lib/publicLeaderboardGameCorpus";

import {
  matchesPublicPlayerSearch,
} from "@/lib/publicPlayerSearch";

const BASE_ARENA_ELO = 1500;
const ARENA_ELO_K_FACTOR = 32;
const LEADERBOARD_TIME_BUCKET_MS = 5 * 60_000;
const LEADERBOARD_CACHE_MAX_ENTRIES = 24;

type LeaderboardCacheEntry = {
  generation: string;
  timeBucket: number;
  value: LobbyLeaderboardSummary;
};

const leaderboardCache = new Map<string, LeaderboardCacheEntry>();
const leaderboardPromises =
  new Map<string, Promise<LobbyLeaderboardSummary>>();

type LeaderboardGameCorpus = {
  uniqueGames: CandidateLeaderboardGame[];
  resolvedGames: CandidateLeaderboardGame[];
  preparedGames: PreparedLeaderboardGame[];
  recentGames: PreparedLeaderboardGame[];
};

const loadLeaderboardGameCorpusByGeneration =
  createGenerationKeyedLoader<
    PrismaClient,
    LeaderboardGameCorpus
  >(2);
let leaderboardGameCorpusEpoch = 0;


export type LoadLobbyLeaderboardOptions = {
  offset?: number;
  limit?: number;
  includePendingClaimed?: boolean;
  includeFeaturedClaimed?: boolean;
  lane?: LeaderboardLane;
  scope?: LeaderboardScope;
  query?: string | null;
  sortKey?: LeaderboardSortKey | null;
  sortDirection?: LeaderboardSortDirection | null;
  /**
   * Live presence is an observational response overlay, not projection
   * authority. Server-only consumers that do not render presence can skip it.
   */
  includePresence?: boolean;
  /**
   * Internal generation hint for callers that already captured directory
   * authority and need multiple competition reads to share one exact build.
   */
  projectionGeneration?: string | null;
};

type PreparedLeaderboardGame = Omit<
  ReplayPlayerResultGame,
  "id" | "players"
> & {
  id: number;
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

type EnrichedLeaderboardEntry =
  PublicPlayerDirectoryEntry &
  LeaderboardRankDelta24h & {
  aliasKeys: Set<string>;
  evidenceGameIds: Set<number>;
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
    evidenceGameIds: new Set(
      entry.replayEvidence.map(
        (evidence) =>
          evidence.gameStatsId,
      ),
    ),
    resolvedMatches,
    winRate: resolvedMatches > 0 ? entry.wins / resolvedMatches : 0,
    lastPlayedAtMs: entry.lastPlayedAt ? new Date(entry.lastPlayedAt).getTime() : 0,
    arenaElo: BASE_ARENA_ELO,
    pendingWoloClaimCount: entry.pendingWoloClaimCount || 0,
    pendingWoloClaimAmount: entry.pendingWoloClaimAmount || 0,
    streakLabel: null,
    streakScore: 0,
    rank24hAgo: null,
    rankDelta24h: null,
    rankDelta24hState:
      entry.totalMatches > 0
        ? "new"
        : "unranked",
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

  const nameComparison =
    left.name.localeCompare(
      right.name,
      undefined,
      {
        numeric: true,
        sensitivity: "base",
      },
    );

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return left.key.localeCompare(
    right.key,
  );
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

    case "rank_change_24h":
      comparison = compareNullableSortNumber(
        left.rankDelta24h,
        right.rankDelta24h,
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
  const scope = normalizeLeaderboardScope(
    options.scope,
  );
  const scopedEntries =
    scope === "claimed"
      ? entries.filter(
          (entry) => entry.claimed,
        )
      : entries;

  const eligibleEntries = scopedEntries
    .filter(
      (entry) =>
        entry.totalMatches >= LOBBY_LEADERBOARD_MIN_MATCHES
    )
    .sort((left, right) =>
      compareLeaderboardEntries(left, right, lane)
    );

  const rankedEntries = scopedEntries
    .filter((entry) => entry.totalMatches > 0)
    .sort((left, right) =>
      compareLeaderboardEntries(left, right, lane)
    );

  const pendingClaimedEntries = scopedEntries
    .filter(
      (entry) =>
        entry.claimed &&
        entry.totalMatches === 0
    )
    .sort((left, right) => {
      // Presence is a request-time overlay, not ranking authority. Keeping it
      // out of the expensive projection lets heartbeat churn stay off the
      // historical leaderboard critical path.
      if (left.verified !== right.verified) {
        return Number(right.verified) - Number(left.verified);
      }

      return left.name.localeCompare(right.name);
    });

  const featuredClaimedEntries = scopedEntries
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

  // Rank is always canonical within the selected board scope. Sorting
  // another column changes row order, never the warrior's scope rank.
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
  const includeFeaturedClaimed =
    options.includeFeaturedClaimed ?? false;

  const defaultOrderedEntries = [
    ...rankedEntries,
    ...pendingClaimedEntries,
  ];

  const normalizedQuery =
    normalizeLeaderboardSearch(options.query);

  const filteredEntries = normalizedQuery
    ? defaultOrderedEntries.filter(
        (entry) =>
          matchesPublicPlayerSearch(
            {
              name: entry.name,
              inGameName:
                entry.inGameName,
              steamPersonaName:
                entry.steamPersonaName,
              aliases:
                entry.aliases,
            },
            normalizedQuery,
          ),
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

  if (
    includeFeaturedClaimed &&
    !normalizedQuery
  ) {
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

type LeaderboardIdentityLookup = {
  steamById: Map<
    string,
    EnrichedLeaderboardEntry
  >;
  nameOnlyByAlias: Map<
    string,
    EnrichedLeaderboardEntry | null
  >;
};

function playerRecord(
  player: unknown,
) {
  return player &&
    typeof player === "object" &&
    !Array.isArray(player)
    ? player as Record<string, unknown>
    : {};
}

function playerIdentitySteamId(
  player: unknown,
) {
  return readLeaderboardSteamId(
    playerRecord(player),
  );
}

function playerIdentityName(
  player: unknown,
) {
  const record =
    playerRecord(player);

  return normalizeLeaderboardKey(
    typeof record.name === "string"
      ? record.name
      : displayPlayerName(record),
  );
}

function buildIdentityLookup(
  entries: EnrichedLeaderboardEntry[],
): LeaderboardIdentityLookup {
  const steamById =
    new Map<
      string,
      EnrichedLeaderboardEntry
    >();
  const nameOnlyByAlias =
    new Map<
      string,
      EnrichedLeaderboardEntry | null
    >();

  for (const entry of entries) {
    const steamId =
      normalizeLeaderboardSteamId(
        entry.steamId,
      );

    if (
      entry.identityKind === "steam" &&
      steamId
    ) {
      steamById.set(
        steamId,
        entry,
      );
      continue;
    }

    /*
     * A site profile without verified Steam control is not replay identity.
     * Only provisional name-only replay rows may match a player lacking an
     * exact SteamID64.
     */
    if (entry.identityKind !== "name") {
      continue;
    }

    for (const aliasKey of entry.aliasKeys) {
      const hasExisting =
        nameOnlyByAlias.has(aliasKey);
      const existing =
        nameOnlyByAlias.get(aliasKey);

      nameOnlyByAlias.set(
        aliasKey,
        hasExisting &&
          (!existing ||
          existing.key !== entry.key
          )
          ? null
          : entry,
      );
    }
  }

  return {
    steamById,
    nameOnlyByAlias,
  };
}

function matchesLeaderboardPlayer(
  entry: EnrichedLeaderboardEntry,
  player: unknown,
  gameStatsId: number,
) {
  if (
    !entry.evidenceGameIds.has(
      gameStatsId,
    )
  ) {
    return false;
  }

  const steamId =
    playerIdentitySteamId(player);

  if (steamId) {
    return (
      entry.identityKind === "steam" &&
      entry.steamId === steamId
    );
  }

  return (
    entry.identityKind === "name" &&
    entry.aliasKeys.has(
      playerIdentityName(player),
    )
  );
}

function findEntryForReplayPlayer(
  lookup: LeaderboardIdentityLookup,
  player: unknown,
  gameStatsId: number,
) {
  const steamId =
    playerIdentitySteamId(player);
  const entry = steamId
    ? lookup.steamById.get(steamId)
    : lookup.nameOnlyByAlias.get(
        playerIdentityName(player),
      );

  return (
    entry &&
    matchesLeaderboardPlayer(
      entry,
      player,
      gameStatsId,
    )
  )
    ? entry
    : null;
}

function buildArenaElo(
  entries: EnrichedLeaderboardEntry[],
  games: PreparedLeaderboardGame[],
) {
  const identityLookup =
    buildIdentityLookup(entries);
  const ratings = new Map(entries.map((entry) => [entry.key, BASE_ARENA_ELO]));

  const chronologicalGames =
    [...games].sort(
      (left, right) =>
        left.playedAtMs -
          right.playedAtMs ||
        left.id - right.id,
    );

  for (const game of chronologicalGames) {
    if (game.players.length !== 2) {
      continue;
    }

    const participantEntries =
      game.players.map((player) =>
        findEntryForReplayPlayer(
          identityLookup,
          player,
          game.id,
        ),
      );

    if (
      !participantEntries[0] ||
      !participantEntries[1]
    ) {
      continue;
    }

    if (participantEntries[0].key === participantEntries[1].key) {
      continue;
    }

    const [entryA, entryB] = participantEntries;
    const outcomeA = resolveReplayResultForPlayer(
      game,
      (player) =>
        matchesLeaderboardPlayer(
          entryA,
          player,
          game.id,
        ),
    );
    const outcomeB = resolveReplayResultForPlayer(
      game,
      (player) =>
        matchesLeaderboardPlayer(
          entryB,
          player,
          game.id,
        ),
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
    (player) =>
      matchesLeaderboardPlayer(
        entry,
        player,
        game.id,
      ),
  );
  return result === "win" ? "W" : result === "loss" ? "L" : null;
}

function buildStreakLabel(entry: EnrichedLeaderboardEntry, games: PreparedLeaderboardGame[]) {
  let direction: "W" | "L" | null = null;
  let count = 0;

  for (const game of games) {
    if (
      !entry.evidenceGameIds.has(
        game.id,
      )
    ) {
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

function populateLeaderboardStreaks(
  entries: EnrichedLeaderboardEntry[],
  games: PreparedLeaderboardGame[]
) {
  for (const entry of entries) {
    entry.streakLabel =
      buildStreakLabel(entry, games);

    entry.streakScore =
      streakSortScore(entry.streakLabel);
  }
}

function evidenceAcceptedAtMs(
  evidence: PublicPlayerReplayEvidence,
) {
  const parsed =
    new Date(
      evidence.acceptedAt,
    ).getTime();

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function latestEvidenceRating(
  evidence: PublicPlayerReplayEvidence[],
  lane: "rm" | "dm",
) {
  for (const item of evidence) {
    const rating =
      lane === "dm"
        ? item.steamDmRating
        : item.steamRmRating;

    if (
      typeof rating === "number" &&
      Number.isFinite(rating)
    ) {
      return rating;
    }
  }

  return null;
}

function buildHistoricalLeaderboardEntry(
  entry: EnrichedLeaderboardEntry,
  cutoffMs: number,
): EnrichedLeaderboardEntry {
  const replayEvidence =
    entry.replayEvidence.filter(
      (evidence) => {
        const acceptedAtMs =
          evidenceAcceptedAtMs(
            evidence,
          );

        return (
          acceptedAtMs !== null &&
          acceptedAtMs <= cutoffMs
        );
      },
    );
  const latestEvidence =
    replayEvidence[0] ?? null;
  const wins =
    replayEvidence.filter(
      (evidence) =>
        evidence.result === "win",
    ).length;
  const losses =
    replayEvidence.filter(
      (evidence) =>
        evidence.result === "loss",
    ).length;
  const unknowns =
    replayEvidence.length -
    wins -
    losses;
  const resolvedMatches =
    wins + losses;
  const latestRatingEvidence =
    replayEvidence.find(
      (evidence) =>
        evidence.steamRmRating !==
          null ||
        evidence.steamDmRating !==
          null,
    ) ?? null;
  const historical: PublicPlayerDirectoryEntry = {
    ...entry,
    name:
      latestEvidence?.observedName ??
      entry.name,
    latestObservedName:
      latestEvidence?.observedName ??
      entry.latestObservedName,
    totalMatches:
      replayEvidence.length,
    wins,
    losses,
    unknowns,
    lastPlayedAt:
      latestEvidence?.observedAt ??
      null,
    ratingLastSeenAt:
      latestRatingEvidence
        ?.observedAt ?? null,
    steamRmRating:
      latestEvidenceRating(
        replayEvidence,
        "rm",
      ),
    steamDmRating:
      latestEvidenceRating(
        replayEvidence,
        "dm",
      ),
    aliases: Array.from(
      new Set(
        replayEvidence
          .map(
            (evidence) =>
              evidence.observedName,
          )
          .filter(Boolean),
      ),
    ),
    replayEvidence,
  };

  return {
    ...historical,
    aliasKeys:
      buildAliasKeys(historical),
    evidenceGameIds: new Set(
      replayEvidence.map(
        (evidence) =>
          evidence.gameStatsId,
      ),
    ),
    resolvedMatches,
    winRate:
      resolvedMatches > 0
        ? wins / resolvedMatches
        : 0,
    lastPlayedAtMs:
      latestEvidence?.observedAt
        ? new Date(
            latestEvidence.observedAt,
          ).getTime()
        : 0,
    arenaElo: BASE_ARENA_ELO,
    streakLabel: null,
    streakScore: 0,
    rank24hAgo: null,
    rankDelta24h: null,
    rankDelta24hState:
      replayEvidence.length > 0
        ? "unchanged"
        : "unranked",
  };
}

function buildCanonicalRankMap(
  entries: EnrichedLeaderboardEntry[],
  lane: LeaderboardLane,
) {
  const rankByKey =
    new Map<string, number>();

  entries
    .filter(
      (entry) =>
        entry.totalMatches > 0,
    )
    .sort((left, right) =>
      compareLeaderboardEntries(
        left,
        right,
        lane,
      ),
    )
    .forEach((entry, index) => {
      rankByKey.set(
        entry.key,
        index + 1,
      );
    });

  return rankByKey;
}

function populateRankDelta24h(
  entries: EnrichedLeaderboardEntry[],
  games: PreparedLeaderboardGame[],
  lane: LeaderboardLane,
  scope: LeaderboardScope,
  asOf: Date,
) {
  const cutoff =
    new Date(
      asOf.getTime() -
        24 * 60 * 60 * 1000,
    );
  const historicalEntries =
    entries.map((entry) =>
      buildHistoricalLeaderboardEntry(
        entry,
        cutoff.getTime(),
      ),
    );
  const historicalGameIds =
    new Set(
      historicalEntries.flatMap(
        (entry) =>
          Array.from(
            entry.evidenceGameIds,
          ),
      ),
    );
  const historicalGames =
    games.filter((game) =>
      historicalGameIds.has(
        game.id,
      ),
    );

  buildArenaElo(
    historicalEntries,
    historicalGames,
  );

  const currentRankByKey =
    buildCanonicalRankMap(
      scope === "claimed"
        ? entries.filter(
            (entry) =>
              entry.claimed,
          )
        : entries,
      lane,
    );
  const historicalRankByKey =
    buildCanonicalRankMap(
      scope === "claimed"
        ? historicalEntries.filter(
            (entry) =>
              entry.claimed,
          )
        : historicalEntries,
      lane,
    );

  for (const entry of entries) {
    const inScope =
      scope === "all" ||
      entry.claimed;

    Object.assign(
      entry,
      resolveRankDelta24h({
        currentRank:
          inScope
            ? currentRankByKey.get(
                entry.key,
              ) ?? null
            : null,
        previousRank:
          inScope
            ? historicalRankByKey.get(
                entry.key,
              ) ?? null
            : null,
        currentlyRanked:
          inScope &&
          entry.totalMatches > 0,
        previouslyRanked:
          inScope &&
          historicalRankByKey.has(
            entry.key,
          ),
      }),
    );
  }

  return {
    asOf: asOf.toISOString(),
    cutoff: cutoff.toISOString(),
  };
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

function buildLast10Results(
  entry: EnrichedLeaderboardEntry,
): LobbyLeaderboardEntry["last10Results"] {
  return entry.replayEvidence
    .slice(0, 10)
    .reverse()
    .map((evidence) =>
      evidence.result === "win"
        ? "W"
        : evidence.result === "loss"
          ? "L"
          : "U",
    );
}

function buildLast30Record(
  entry: EnrichedLeaderboardEntry,
  asOfMs: number,
) {
  const cutoffMs =
    asOfMs -
    30 * 24 * 60 * 60 * 1000;

  let last30Wins = 0;
  let last30Losses = 0;
  let last30Unknowns = 0;

  for (const evidence of entry.replayEvidence) {
    if (!evidence.observedAt) {
      continue;
    }

    const playedAtMs =
      new Date(
        evidence.observedAt,
      ).getTime();

    if (
      !Number.isFinite(playedAtMs) ||
      playedAtMs < cutoffMs ||
      playedAtMs > asOfMs
    ) {
      continue;
    }

    if (evidence.result === "win") {
      last30Wins += 1;
    } else if (
      evidence.result === "loss"
    ) {
      last30Losses += 1;
    } else {
      last30Unknowns += 1;
    }
  }

  return {
    last30Wins,
    last30Losses,
    last30Unknowns,
    last30Games:
      last30Wins +
      last30Losses +
      last30Unknowns,
  };
}

function toLobbyLeaderboardEntry(
  entry: EnrichedLeaderboardEntry,
  rank: number,
  lane: LeaderboardLane,
  asOfMs: number,
  featuredRank: number | null,
): LobbyLeaderboardEntry {
  const last30 =
    buildLast30Record(
      entry,
      asOfMs,
    );

  return {
    rank,
    key: entry.key,
    identityKind:
      entry.identityKind,
    name: entry.name,
    currentName:
      entry.latestObservedName,
    latestObservedName:
      entry.latestObservedName,
    nameHistory:
      entry.nameHistory,
    uid: "uid" in entry ? ((entry as { uid?: string | null }).uid ?? null) : null,
    steamId: entry.steamId,
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
    featuredAvatarRevision:
      entry.featuredAvatarRevision,
    featuredRank,
    pendingWoloClaimCount: entry.pendingWoloClaimCount,
    pendingWoloClaimAmount: entry.pendingWoloClaimAmount,
    totalMatches: entry.totalMatches,
    lastPlayedAt: entry.lastPlayedAt,
    last10Results:
      buildLast10Results(entry),
    ...last30,
    rank24hAgo:
      entry.rank24hAgo,
    rankDelta24h:
      entry.rankDelta24h,
    rankDelta24hState:
      entry.rankDelta24hState,
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


async function buildLeaderboardGameCorpusFresh(
  prisma: PrismaClient,
  replayGeneration: string | null,
): Promise<LeaderboardGameCorpus> {
  const rawLeaderboardGames =
    await loadPublicLeaderboardRawGames(
      prisma,
      replayGeneration,
    );

  const leaderboardGames =
    rawLeaderboardGames
      .map(
        (game) =>
          applyReplayAdjudicationToGameStats(
            game,
          ) as CandidateLeaderboardGame,
      )
      .sort(
        sortCandidateGamesByPlayedAtDesc,
      );

  const publicBattleGames =
    leaderboardGames.filter(
      isPublicBattleArchiveRow,
    );

  const uniqueGames =
    cleanPublicGameRows(
      publicBattleGames,
      {
        includeReview: true,
        includeLive: false,
      },
    ) as CandidateLeaderboardGame[];

  const resolvedGames =
    cleanPublicGameRows(
      publicBattleGames,
      {
        includeReview: false,
        includeLive: false,
      },
    ) as CandidateLeaderboardGame[];

  const preparedGames:
    PreparedLeaderboardGame[] =
    resolvedGames.map(
      (game) => {
        const playedAt =
          readPlayedAt(game);

        return {
          ...game,
          players:
            parsePlayers(
              game.players,
            ),
          playedAtMs:
            playedAt
              ? new Date(
                  playedAt,
                ).getTime()
              : 0,
        };
      },
    );

  const recentGames =
    [...preparedGames].sort(
      (left, right) =>
        right.playedAtMs -
        left.playedAtMs,
    );

  return {
    uniqueGames,
    resolvedGames,
    preparedGames,
    recentGames,
  };
}

async function loadLeaderboardGameCorpus(
  prisma: PrismaClient,
): Promise<LeaderboardGameCorpus> {
  let replayGeneration: string;

  try {
    replayGeneration =
      await loadPublicReplayGeneration(
        prisma,
      );
  } catch (error) {
    console.warn(
      "Leaderboard replay generation unavailable; building fresh corpus:",
      error,
    );
    return buildLeaderboardGameCorpusFresh(
      prisma,
      null,
    );
  }

  const generationKey =
    `${replayGeneration}:epoch:${leaderboardGameCorpusEpoch}`;

  return loadLeaderboardGameCorpusByGeneration(
    prisma,
    generationKey,
    () =>
      buildLeaderboardGameCorpusFresh(
        prisma,
        replayGeneration,
      ),
  );
}

export function invalidateLobbyLeaderboardCache() {
  leaderboardCache.clear();
  leaderboardPromises.clear();
  leaderboardGameCorpusEpoch += 1;
}

async function loadLobbyLeaderboardFresh(
  prisma: PrismaClient,
  options: LoadLobbyLeaderboardOptions = {},
  projectionGeneration: string,
): Promise<LobbyLeaderboardSummary> {
  const lane = normalizeLeaderboardLane(options.lane);
  const scope = normalizeLeaderboardScope(
    options.scope,
  );
  const rankDeltaAsOf = new Date();
  const dayStart = new Date(
    rankDeltaAsOf,
  );
  dayStart.setHours(0, 0, 0, 0);

    const [directory, gameCorpus] =
    await Promise.all([
      loadPublicPlayerDirectory(
        prisma,
        projectionGeneration,
        { includePresence: false },
      ),
      loadLeaderboardGameCorpus(prisma),
    ]);

  const {
    uniqueGames,
    resolvedGames,
    preparedGames,
    recentGames,
  } = gameCorpus;
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
    .filter(
      (entry) =>
        (entry.totalMatches > 0 ||
          entry.claimed) &&
        !isLeaderboardExcludedSystemUid(
          entry.uid,
        ),
    )
    .map(buildEnrichedEntry);

  buildArenaElo(candidates, preparedGames);

  const featuredRankCandidates =
    scope === "claimed"
      ? candidates.filter(
          (entry) => entry.claimed
        )
      : candidates;
  const featuredRmRankByKey =
    buildCanonicalRankMap(
      featuredRankCandidates,
      "rm"
    );
  const featuredDmRankByKey =
    buildCanonicalRankMap(
      featuredRankCandidates,
      "dm"
    );

  const rankDeltaWindow =
    populateRankDelta24h(
      candidates,
      preparedGames,
      lane,
      scope,
      rankDeltaAsOf,
    );

  const identityRows =
    candidates.length;
  const steamIdentityRows =
    candidates.filter(
      (entry) =>
        entry.identityKind === "steam" &&
        entry.totalMatches > 0,
    ).length;
  const nameOnlyIdentityRows =
    candidates.filter(
      (entry) =>
        entry.identityKind === "name" &&
        entry.totalMatches > 0,
    ).length;
  const siteOnlyIdentityRows =
    candidates.filter(
      (entry) =>
        entry.identityKind === "site",
    ).length;
  const claimedProfileOnlyRows =
    candidates.filter(
      (entry) =>
        entry.claimed &&
        entry.totalMatches === 0,
    ).length;
  const claimedIdentityRows =
    candidates.filter(
      (entry) => entry.claimed,
    ).length;
  const accountsWithAliasHistory =
    candidates.filter(
      (entry) =>
        entry.identityKind === "steam" &&
        entry.totalMatches > 0 &&
        entry.nameHistory.length > 1,
    ).length;

  const requestedSortKey =
    normalizeLeaderboardSortKey(
      options.sortKey
    );

  // Global streak ordering genuinely requires streak truth
  // for every candidate before pagination.
  //
  // Every other leaderboard view can paginate first and
  // calculate streak labels only for the rows being returned.
  if (requestedSortKey === "streak") {
    populateLeaderboardStreaks(
      candidates,
      recentGames
    );
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

  if (requestedSortKey !== "streak") {
    populateLeaderboardStreaks(
      selectedEntries,
      recentGames
    );
  }

  return {
    title: lane === "dm" ? "Deathmatch Leaderboard" : "Ranked Match Leaderboard",
    lane,
    scope,
    statusLabel: lane.toUpperCase(),
    entries: selectedEntries.map((entry) =>
      toLobbyLeaderboardEntry(
        entry,
        rankByKey.get(entry.key) ?? 1,
        lane,
        rankDeltaAsOf.getTime(),
        featuredWarriorBestRank(
          featuredRmRankByKey.get(
            entry.key
          ),
          featuredDmRankByKey.get(
            entry.key
          )
        ),
      )
    ),
    // Live presence is overlaid after cache lookup. The expensive projection
    // is deliberately presence-neutral.
    activePlayers: 0,
    matchesToday,
    resolvedGamesToday: matchesToday,
    uniqueReplaysToday,
    needsReviewToday,
    trackedPlayers: fullEntryCount,
    identityRows,
    steamIdentityRows,
    nameOnlyIdentityRows,
    siteOnlyIdentityRows,
    claimedIdentityRows,
    claimedProfileOnlyRows,
    accountsWithAliasHistory,
    rankedPlayers: eligibleEntries.length,
    minimumMatches: LOBBY_LEADERBOARD_MIN_MATCHES,
    rankDelta24hAsOf:
      rankDeltaWindow.asOf,
    rankDelta24hCutoff:
      rankDeltaWindow.cutoff,
    rankDelta24hMethod:
      "reconstructed_current_corpus",
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
    includeFeaturedClaimed:
      options.includeFeaturedClaimed ?? false,
    scope: normalizeLeaderboardScope(
      options.scope,
    ),
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

async function overlayLeaderboardPresence(
  prisma: PrismaClient,
  snapshot: LobbyLeaderboardSummary,
): Promise<LobbyLeaderboardSummary> {
  try {
    const presence =
      await loadPublicPresenceSnapshot(
        prisma,
      );
    const onlineUids =
      new Set(
        presence.onlineUsers.map(
          (user) => user.uid,
        ),
      );

    return {
      ...snapshot,
      activePlayers:
        presence.activePlayers,
      entries:
        snapshot.entries.map(
          (entry) => ({
            ...entry,
            isOnline:
              Boolean(
                entry.uid &&
                onlineUids.has(
                  entry.uid,
                ),
              ),
          }),
        ),
    };
  } catch (error) {
    /*
     * Presence is an observational overlay, never ranking authority.
     * A degraded live-presence rail must not make the historical board fail.
     */
    console.warn(
      "Leaderboard presence overlay unavailable:",
      error,
    );
    return snapshot;
  }
}

function startLeaderboardRefresh(
  prisma: PrismaClient,
  options: LoadLobbyLeaderboardOptions,
  cacheKey: string,
  projectionGeneration: string,
  timeBucket: number,
): Promise<LobbyLeaderboardSummary> {
  const promiseKey =
    `${cacheKey}|generation:${projectionGeneration}|time:${timeBucket}`;
  const existing =
    leaderboardPromises.get(
      promiseKey,
    );

  if (existing) {
    return existing;
  }

  const run =
    loadLobbyLeaderboardFresh(
      prisma,
      options,
      projectionGeneration,
    )
      .then((value) => {
        leaderboardCache.set(
          cacheKey,
          {
            generation:
              projectionGeneration,
            timeBucket,
            value,
          },
        );

        /*
         * The cache is bounded by option variants, not wall-clock expiry.
         * Old option entries are cheapest to discard by insertion order.
         */
        while (
          leaderboardCache.size >
          LEADERBOARD_CACHE_MAX_ENTRIES
        ) {
          const oldestKey =
            leaderboardCache
              .keys()
              .next()
              .value;

          if (
            oldestKey === undefined
          ) {
            break;
          }

          leaderboardCache.delete(
            oldestKey,
          );
        }

        return value;
      })
      .finally(() => {
        if (
          leaderboardPromises.get(
            promiseKey,
          ) === run
        ) {
          leaderboardPromises.delete(
            promiseKey,
          );
        }
      });

  leaderboardPromises.set(
    promiseKey,
    run,
  );

  return run;
}

async function loadLeaderboardProjectionGeneration(
  prisma: PrismaClient,
) {
  try {
    return await loadPublicPlayerDirectoryGeneration(
      prisma,
    );
  } catch (error) {
    /*
     * Isolated tools/test doubles may not expose every directory-generation
     * table. Keep their old bounded behavior rather than retaining unknown
     * state indefinitely.
     */
    console.warn(
      "Leaderboard projection generation unavailable; using bounded fallback:",
      error,
    );

    return `fallback:${Math.floor(
      Date.now() / 15_000,
    )}`;
  }
}

export async function loadLobbyLeaderboard(
  prisma: PrismaClient,
  options: LoadLobbyLeaderboardOptions = {},
): Promise<LobbyLeaderboardSummary> {
  const now = Date.now();
  const cacheKey =
    buildLeaderboardCacheKey(
      options,
    );
  const projectionGeneration =
    options.projectionGeneration ??
    await loadLeaderboardProjectionGeneration(
      prisma,
    );
  const timeBucket =
    Math.floor(
      now /
        LEADERBOARD_TIME_BUCKET_MS,
    );
  const cached =
    leaderboardCache.get(
      cacheKey,
    );
  const cacheIsCurrent =
    cached?.generation ===
      projectionGeneration &&
    cached?.timeBucket ===
      timeBucket;

  if (cached) {
    if (!cacheIsCurrent) {
      /*
       * Data-generation or bounded time-derived truth changed. Refresh in the
       * background; a previously good board never turns the next navigation
       * into a whole-corpus rebuild.
       */
      void startLeaderboardRefresh(
        prisma,
        options,
        cacheKey,
        projectionGeneration,
        timeBucket,
      ).catch((error) => {
        console.warn(
          "Leaderboard background refresh failed:",
          error,
        );
      });
    }

    return options.includePresence === false
      ? cached.value
      : overlayLeaderboardPresence(
          prisma,
          cached.value,
        );
  }

  /*
   * Only the genuinely cold first computation waits. Concurrent cold callers
   * for the exact same generation/time bucket share one in-flight build.
   */
  const value =
    await startLeaderboardRefresh(
      prisma,
      options,
      cacheKey,
      projectionGeneration,
      timeBucket,
    );

  return options.includePresence === false
    ? value
    : overlayLeaderboardPresence(
        prisma,
        value,
      );
}

