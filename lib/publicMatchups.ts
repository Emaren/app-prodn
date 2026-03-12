import type { PrismaClient } from "@/lib/generated/prisma";

import { displayPlayerName, parsePlayers, readPlayedAt } from "@/lib/gameStatsView";
import {
  buildPublicPlayerRef,
  type PublicPlayerRef,
  findClaimedUsersForReplayNames,
  publicPlayerMatchesName,
} from "@/lib/publicPlayers";

export type MatchupGameRow = {
  id: number;
  winner: string | null;
  players: unknown;
  played_on: Date | string | null;
  timestamp: Date | string | null;
  parse_reason?: string | null;
  map?: unknown;
  disconnect_detected?: boolean;
};

export type RivalSummary = {
  ref: PublicPlayerRef;
  totalMatches: number;
  wins: number;
  losses: number;
  unknowns: number;
  lastPlayedAt: string | null;
};

export function buildMatchupHref(left: PublicPlayerRef, right: PublicPlayerRef) {
  return `/matchups/${encodeURIComponent(left.token)}/${encodeURIComponent(right.token)}`;
}

function updateLastPlayedAt(current: string | null, next: Date | string | null) {
  if (!next) return current;

  const nextDate = new Date(next);
  if (Number.isNaN(nextDate.getTime())) {
    return current;
  }

  if (!current) {
    return nextDate.toISOString();
  }

  const currentDate = new Date(current);
  if (Number.isNaN(currentDate.getTime()) || nextDate > currentDate) {
    return nextDate.toISOString();
  }

  return current;
}

function winnerMatchesPlayer(player: PublicPlayerRef, winner: string | null | undefined) {
  if (!winner || winner === "Unknown") {
    return false;
  }

  return publicPlayerMatchesName(player, winner);
}

export function filterHeadToHeadMatches(
  games: MatchupGameRow[],
  left: PublicPlayerRef,
  right: PublicPlayerRef
) {
  return games.filter((game) => {
    const players = parsePlayers(game.players);
    const hasLeft = players.some((player) => publicPlayerMatchesName(left, displayPlayerName(player)));
    const hasRight = players.some((player) => publicPlayerMatchesName(right, displayPlayerName(player)));
    return hasLeft && hasRight;
  });
}

export function summarizeHeadToHead(
  games: MatchupGameRow[],
  left: PublicPlayerRef,
  right: PublicPlayerRef
) {
  let leftWins = 0;
  let rightWins = 0;
  let unknowns = 0;
  let lastPlayedAt: string | null = null;

  for (const game of games) {
    if (winnerMatchesPlayer(left, game.winner)) {
      leftWins += 1;
    } else if (winnerMatchesPlayer(right, game.winner)) {
      rightWins += 1;
    } else {
      unknowns += 1;
    }

    lastPlayedAt = updateLastPlayedAt(lastPlayedAt, readPlayedAt(game));
  }

  return {
    leftWins,
    rightWins,
    unknowns,
    totalMatches: games.length,
    lastPlayedAt,
  };
}

export async function buildRivalSummaries(
  prisma: PrismaClient,
  matches: MatchupGameRow[],
  currentPlayer: PublicPlayerRef
) {
  const opponentNames = Array.from(
    new Set(
      matches.flatMap((match) =>
        parsePlayers(match.players)
          .map((player) => displayPlayerName(player))
          .filter((name) => !publicPlayerMatchesName(currentPlayer, name))
      )
    )
  );

  const claimedPlayers = await findClaimedUsersForReplayNames(prisma, opponentNames);
  const summaries = new Map<string, RivalSummary>();

  for (const match of matches) {
    const players = parsePlayers(match.players);
    const opponents = players
      .map((player) => displayPlayerName(player))
      .filter((name) => !publicPlayerMatchesName(currentPlayer, name));
    const playedAt = readPlayedAt(match);

    for (const opponentName of opponents) {
      const ref = buildPublicPlayerRef(opponentName, claimedPlayers);
      const summary =
        summaries.get(ref.token) ||
        ({
          ref,
          totalMatches: 0,
          wins: 0,
          losses: 0,
          unknowns: 0,
          lastPlayedAt: null,
        } satisfies RivalSummary);

      summary.totalMatches += 1;
      summary.lastPlayedAt = updateLastPlayedAt(summary.lastPlayedAt, playedAt);

      if (winnerMatchesPlayer(currentPlayer, match.winner)) {
        summary.wins += 1;
      } else if (winnerMatchesPlayer(ref, match.winner)) {
        summary.losses += 1;
      } else {
        summary.unknowns += 1;
      }

      summaries.set(ref.token, summary);
    }
  }

  return Array.from(summaries.values()).sort((left, right) => {
    if (left.totalMatches !== right.totalMatches) {
      return right.totalMatches - left.totalMatches;
    }

    if (left.wins !== right.wins) {
      return right.wins - left.wins;
    }

    if (left.lastPlayedAt && right.lastPlayedAt) {
      return new Date(right.lastPlayedAt).getTime() - new Date(left.lastPlayedAt).getTime();
    }

    if (left.lastPlayedAt || right.lastPlayedAt) {
      return left.lastPlayedAt ? -1 : 1;
    }

    return left.ref.name.localeCompare(right.ref.name);
  });
}
