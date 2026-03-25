import type { PrismaClient } from "@/lib/generated/prisma";

import { displayPlayerName, parsePlayers } from "@/lib/gameStatsView";
import {
  LOBBY_LEADERBOARD_ENTRY_LIMIT,
  LOBBY_LEADERBOARD_MIN_MATCHES,
  type LobbyLeaderboardEntry,
  type LobbyLeaderboardSummary,
} from "@/lib/lobby";
import {
  loadPublicPlayerDirectory,
  type PublicPlayerDirectoryEntry,
} from "@/lib/publicPlayerDirectory";
import { normalizePublicPlayerName } from "@/lib/publicPlayers";

type PreparedLeaderboardGame = {
  winner: string | null;
  players: ReturnType<typeof parsePlayers>;
};

type EnrichedLeaderboardEntry = PublicPlayerDirectoryEntry & {
  aliasKeys: Set<string>;
  resolvedMatches: number;
  winRate: number;
  lastPlayedAtMs: number;
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
  };
}

function compareLeaderboardEntries(left: EnrichedLeaderboardEntry, right: EnrichedLeaderboardEntry) {
  if (left.claimed !== right.claimed) {
    return Number(right.claimed) - Number(left.claimed);
  }

  if (left.verified !== right.verified) {
    return Number(right.verified) - Number(left.verified);
  }

  if (left.winRate !== right.winRate) {
    return right.winRate - left.winRate;
  }

  if (left.wins !== right.wins) {
    return right.wins - left.wins;
  }

  if (left.lastPlayedAtMs !== right.lastPlayedAtMs) {
    return right.lastPlayedAtMs - left.lastPlayedAtMs;
  }

  if (left.isOnline !== right.isOnline) {
    return Number(right.isOnline) - Number(left.isOnline);
  }

  if (left.totalMatches !== right.totalMatches) {
    return right.totalMatches - left.totalMatches;
  }

  return left.name.localeCompare(right.name);
}

function buildLeaderboardSelection(entries: EnrichedLeaderboardEntry[]) {
  const eligibleEntries = entries
    .filter((entry) => entry.totalMatches >= LOBBY_LEADERBOARD_MIN_MATCHES)
    .sort(compareLeaderboardEntries);

  const selectedEntries = eligibleEntries.slice(0, LOBBY_LEADERBOARD_ENTRY_LIMIT);

  if (selectedEntries.length < LOBBY_LEADERBOARD_ENTRY_LIMIT) {
    const fallbackEntries = entries
      .filter((entry) => entry.totalMatches > 0 && entry.totalMatches < LOBBY_LEADERBOARD_MIN_MATCHES)
      .sort(compareLeaderboardEntries);

    for (const fallbackEntry of fallbackEntries) {
      if (selectedEntries.some((entry) => entry.key === fallbackEntry.key)) {
        continue;
      }

      selectedEntries.push(fallbackEntry);

      if (selectedEntries.length >= LOBBY_LEADERBOARD_ENTRY_LIMIT) {
        break;
      }
    }
  }

  return { eligibleEntries, selectedEntries };
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

function buildRatingLabel(entry: EnrichedLeaderboardEntry) {
  if (entry.resolvedMatches <= 0) {
    return entry.totalMatches === 1 ? "1 match" : `${entry.totalMatches} matches`;
  }

  return `${Math.round(entry.winRate * 100)}% WR`;
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
    ratingLabel: buildRatingLabel(entry),
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
  };
}

export async function loadLobbyLeaderboard(
  prisma: PrismaClient
): Promise<LobbyLeaderboardSummary> {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  const [directory, recentGames, matchesToday] = await Promise.all([
    loadPublicPlayerDirectory(prisma),
    prisma.gameStats.findMany({
      where: { is_final: true },
      orderBy: [{ played_on: "desc" }, { timestamp: "desc" }, { createdAt: "desc" }],
      take: 120,
      select: {
        winner: true,
        players: true,
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

  const preparedGames: PreparedLeaderboardGame[] = recentGames.map((game) => ({
    winner: game.winner,
    players: parsePlayers(game.players),
  }));

  const candidates = directory.allEntries
    .filter((entry) => entry.totalMatches > 0)
    .map(buildEnrichedEntry);

  const { eligibleEntries, selectedEntries } = buildLeaderboardSelection(candidates);

  return {
    title: "Season Leaderboard",
    statusLabel: eligibleEntries.length > 0 ? "Live rankings" : "Building the ladder",
    entries: selectedEntries.map((entry, index) =>
      toLobbyLeaderboardEntry(entry, index + 1, preparedGames)
    ),
    activePlayers: directory.activeClaimed.length,
    matchesToday,
    woloStatusLabel: "Primed",
    rankedPlayers: eligibleEntries.length,
    minimumMatches: LOBBY_LEADERBOARD_MIN_MATCHES,
  };
}
