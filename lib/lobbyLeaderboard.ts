import type { PrismaClient } from "@/lib/generated/prisma";

import { displayPlayerName, parsePlayers } from "@/lib/gameStatsView";
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

const BASE_ARENA_ELO = 1500;
const ARENA_ELO_K_FACTOR = 32;

type PreparedLeaderboardGame = {
  winner: string | null;
  players: ReturnType<typeof parsePlayers>;
  playedAtMs: number;
};

type EnrichedLeaderboardEntry = PublicPlayerDirectoryEntry & {
  aliasKeys: Set<string>;
  resolvedMatches: number;
  winRate: number;
  lastPlayedAtMs: number;
  arenaElo: number;
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
  };
}

function hasSteamRmRating(entry: EnrichedLeaderboardEntry) {
  return typeof entry.steamRmRating === "number" && Number.isFinite(entry.steamRmRating);
}

function getPrimaryRatingValue(entry: EnrichedLeaderboardEntry) {
  return hasSteamRmRating(entry) ? Math.round(entry.steamRmRating ?? BASE_ARENA_ELO) : entry.arenaElo;
}

function compareLeaderboardEntries(left: EnrichedLeaderboardEntry, right: EnrichedLeaderboardEntry) {
  const leftPrimaryRating = getPrimaryRatingValue(left);
  const rightPrimaryRating = getPrimaryRatingValue(right);

  if (leftPrimaryRating !== rightPrimaryRating) {
    return rightPrimaryRating - leftPrimaryRating;
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

  const selectedEntries = entries
    .filter((entry) => entry.totalMatches > 0)
    .sort(compareLeaderboardEntries);

  return { eligibleEntries, selectedEntries };
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
  return String(Math.round(getPrimaryRatingValue(entry)));
}

function buildPrimaryRatingSourceLabel(entry: EnrichedLeaderboardEntry) {
  return hasSteamRmRating(entry) ? "Steam RM" : "Arena Elo";
}

function buildSecondaryRatingLabel(entry: EnrichedLeaderboardEntry) {
  if (!hasSteamRmRating(entry)) {
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
    totalMatches: entry.totalMatches,
    lastPlayedAt: entry.lastPlayedAt,
    provisional: entry.totalMatches < LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}

export async function loadLobbyLeaderboard(
  prisma: PrismaClient
): Promise<LobbyLeaderboardSummary> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [directory, leaderboardGames, matchesToday] = await Promise.all([
    loadPublicPlayerDirectory(prisma),
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [{ played_on: "asc" }, { timestamp: "asc" }, { createdAt: "asc" }],
      take: 600,
      select: {
        winner: true,
        players: true,
        played_on: true,
        timestamp: true,
      },
    }),
    prisma.gameStats.count({
      where: {
        is_final: true,
        OR: [
          { played_on: { gte: dayStart } },
          { played_on: null, timestamp: { gte: dayStart } },
          { played_on: null, timestamp: null, createdAt: { gte: dayStart } },
        ],
      },
    }),
  ]);

  const preparedGames: PreparedLeaderboardGame[] = leaderboardGames.map((game) => ({
    winner: game.winner,
    players: parsePlayers(game.players),
    playedAtMs: new Date(game.played_on ?? game.timestamp ?? 0).getTime(),
  }));
  const recentGames = [...preparedGames].sort((left, right) => right.playedAtMs - left.playedAtMs);

  const candidates = directory.allEntries
    .filter((entry) => entry.totalMatches > 0)
    .map(buildEnrichedEntry);
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
    rankedPlayers: eligibleEntries.length,
    minimumMatches: LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}
