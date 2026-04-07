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
import { dedupeFinalReplayRows } from "@/lib/finalReplayIdentity";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";

const BASE_ARENA_ELO = 1500;
const ARENA_ELO_K_FACTOR = 32;
const LEADERBOARD_GAME_WINDOW = 5000;

type PreparedLeaderboardGame = {
  winner: string | null;
  players: ReturnType<typeof parsePlayers>;
  playedAtMs: number;
};

type CandidateLeaderboardGame = {
  createdAt: Date;
  id: number;
  key_events: unknown;
  original_filename: string | null;
  played_on: Date | null;
  players: unknown;
  replay_file: string | null;
  replayHash: string | null;
  timestamp: Date | null;
  winner: string | null;
};

type EnrichedLeaderboardEntry = PublicPlayerDirectoryEntry & {
  aliasKeys: Set<string>;
  resolvedMatches: number;
  winRate: number;
  lastPlayedAtMs: number;
  arenaElo: number;
  pendingWoloClaimCount: number;
  pendingWoloClaimAmount: number;
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
    pendingWoloClaimCount: 0,
    pendingWoloClaimAmount: 0,
  };
}

function hasTrackedHistory(entry: EnrichedLeaderboardEntry) {
  return entry.totalMatches > 0;
}

function hasSteamRmRating(entry: EnrichedLeaderboardEntry) {
  return typeof entry.steamRmRating === "number" && Number.isFinite(entry.steamRmRating);
}

function getPrimaryRatingValue(entry: EnrichedLeaderboardEntry) {
  if (hasSteamRmRating(entry)) {
    return Math.round(entry.steamRmRating ?? BASE_ARENA_ELO);
  }

  if (!hasTrackedHistory(entry)) {
    return null;
  }

  return entry.arenaElo;
}

function compareLeaderboardEntries(left: EnrichedLeaderboardEntry, right: EnrichedLeaderboardEntry) {
  const leftPrimaryRating = getPrimaryRatingValue(left);
  const rightPrimaryRating = getPrimaryRatingValue(right);

  if (leftPrimaryRating !== rightPrimaryRating) {
    return (rightPrimaryRating ?? Number.NEGATIVE_INFINITY) - (leftPrimaryRating ?? Number.NEGATIVE_INFINITY);
  }

  if (hasSteamRmRating(left) !== hasSteamRmRating(right)) {
    return Number(hasSteamRmRating(right)) - Number(hasSteamRmRating(left));
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

function buildLeaderboardSelection(entries: EnrichedLeaderboardEntry[]) {
  const eligibleEntries = entries
    .filter((entry) => entry.totalMatches >= LOBBY_LEADERBOARD_MIN_MATCHES)
    .sort(compareLeaderboardEntries);

  const rankedEntries = entries
    .filter((entry) => entry.totalMatches > 0)
    .sort(compareLeaderboardEntries);

  const pendingClaimedEntries = entries
    .filter((entry) => entry.claimed && entry.totalMatches === 0)
    .sort((left, right) => {
      if (left.isOnline !== right.isOnline) {
        return Number(right.isOnline) - Number(left.isOnline);
      }

      if (left.verified !== right.verified) {
        return Number(right.verified) - Number(left.verified);
      }

      return left.name.localeCompare(right.name);
    });

  return { eligibleEntries, selectedEntries: [...rankedEntries, ...pendingClaimedEntries] };
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
    let pendingCount = 0;
    let pendingAmountWolo = 0;

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
    const resolvedWinner = normalizeLeaderboardKey(game.winner);
    if (!resolvedWinner || resolvedWinner === "unknown") {
      continue;
    }

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

    const winnerEntry = aliasToEntry.get(resolvedWinner);
    if (!winnerEntry) {
      continue;
    }

    const [entryA, entryB] = participantEntries;
    if (winnerEntry.key !== entryA.key && winnerEntry.key !== entryB.key) {
      continue;
    }

    const ratingA = ratings.get(entryA.key) ?? BASE_ARENA_ELO;
    const ratingB = ratings.get(entryB.key) ?? BASE_ARENA_ELO;
    const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
    const expectedB = 1 / (1 + 10 ** ((ratingA - ratingB) / 400));
    const scoreA = winnerEntry.key === entryA.key ? 1 : 0;
    const scoreB = winnerEntry.key === entryB.key ? 1 : 0;

    ratings.set(entryA.key, ratingA + ARENA_ELO_K_FACTOR * (scoreA - expectedA));
    ratings.set(entryB.key, ratingB + ARENA_ELO_K_FACTOR * (scoreB - expectedB));
  }

  for (const entry of entries) {
    entry.arenaElo = Math.round(ratings.get(entry.key) ?? BASE_ARENA_ELO);
  }
}

function buildEntryOutcome(entry: EnrichedLeaderboardEntry, winner: string | null | undefined) {
  const normalizedWinner = normalizeLeaderboardKey(winner);
  if (!normalizedWinner || normalizedWinner === "unknown") {
    return null;
  }

  return entry.aliasKeys.has(normalizedWinner) ? "W" : "L";
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

    const outcome = buildEntryOutcome(entry, game.winner);
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

function buildPrimaryRatingLabel(entry: EnrichedLeaderboardEntry) {
  const value = getPrimaryRatingValue(entry);
  return value === null ? "Pending" : String(Math.round(value));
}

function buildPrimaryRatingSourceLabel(entry: EnrichedLeaderboardEntry) {
  if (hasSteamRmRating(entry)) {
    return "Steam RM";
  }

  return hasTrackedHistory(entry) ? "Arena Elo" : "Profile";
}

function buildSecondaryRatingLabel(entry: EnrichedLeaderboardEntry) {
  if (!hasSteamRmRating(entry) || !hasTrackedHistory(entry)) {
    return null;
  }

  return `Arena ${Math.round(entry.arenaElo)}`;
}

function toLobbyLeaderboardEntry(
  entry: EnrichedLeaderboardEntry,
  rank: number,
  games: PreparedLeaderboardGame[]
): LobbyLeaderboardEntry {
  return {
    rank,
    key: entry.key,
    name: entry.name,
    href: entry.href,
    elo: Math.round(entry.arenaElo),
    arenaElo: Math.round(entry.arenaElo),
    steamRmRating: entry.steamRmRating,
    steamDmRating: entry.steamDmRating,
    primaryRating: getPrimaryRatingValue(entry),
    primaryRatingLabel: buildPrimaryRatingLabel(entry),
    primaryRatingSourceLabel: buildPrimaryRatingSourceLabel(entry),
    secondaryRatingLabel: buildSecondaryRatingLabel(entry),
    ratingLabel: buildPrimaryRatingLabel(entry),
    wins: entry.wins,
    losses: entry.losses,
    unknowns: entry.unknowns,
    streakLabel: buildStreakLabel(entry, games),
    verified: entry.verified,
    verificationLevel: entry.verificationLevel,
    isOnline: entry.isOnline,
    claimed: entry.claimed,
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

export async function loadLobbyLeaderboard(
  prisma: PrismaClient
): Promise<LobbyLeaderboardSummary> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [directory, rawLeaderboardGames] = await Promise.all([
    loadPublicPlayerDirectory(prisma),
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      take: LEADERBOARD_GAME_WINDOW,
      select: {
        createdAt: true,
        id: true,
        key_events: true,
        original_filename: true,
        played_on: true,
        players: true,
        replay_file: true,
        replayHash: true,
        timestamp: true,
        winner: true,
      },
    }),
  ]);

  const leaderboardGames = [...rawLeaderboardGames].sort(sortCandidateGamesByPlayedAtDesc);
  const uniqueGames = dedupeFinalReplayRows(leaderboardGames);

  const preparedGames: PreparedLeaderboardGame[] = uniqueGames.map((game) => {
    const playedAt = readPlayedAt(game);

    return {
      winner: game.winner,
      players: parsePlayers(game.players),
      playedAtMs: playedAt ? new Date(playedAt).getTime() : 0,
    };
  });

  const recentGames = [...preparedGames].sort((left, right) => right.playedAtMs - left.playedAtMs);
  const dayStartMs = dayStart.getTime();
  const matchesToday = preparedGames.filter(
    (game) => Number.isFinite(game.playedAtMs) && game.playedAtMs >= dayStartMs
  ).length;

  const candidates = directory.allEntries
    .filter((entry) => entry.totalMatches > 0 || entry.claimed)
    .map(buildEnrichedEntry);

  const pendingSummaries = await loadPendingWoloClaimSummariesByName(
    prisma,
    candidates.flatMap((entry) => [entry.name, entry.inGameName, entry.steamPersonaName, ...entry.aliases])
  );
  applyPendingClaimSummaries(candidates, pendingSummaries);
  buildArenaElo(candidates, preparedGames);

  const { eligibleEntries, selectedEntries } = buildLeaderboardSelection(candidates);

  return {
    title: "Season Leaderboard",
    statusLabel: selectedEntries.some(hasSteamRmRating)
      ? "Steam RM + Arena"
      : eligibleEntries.length > 0
        ? "Arena Elo"
        : "Need games",
    entries: selectedEntries.map((entry, index) =>
      toLobbyLeaderboardEntry(entry, index + 1, recentGames)
    ),
    activePlayers: directory.activeClaimed.length,
    matchesToday,
    trackedPlayers: selectedEntries.length,
    rankedPlayers: eligibleEntries.length,
    minimumMatches: LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}