import type { PrismaClient } from "@/lib/generated/prisma";

import { displayPlayerName, parsePlayers, readPlayedAt } from "@/lib/gameStatsView";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import {
  applyPendingWoloClaimSummary,
  buildPublicPlayerRef,
  type PublicPlayerRef,
  findClaimedUsersForReplayNames,
  normalizePublicPlayerName,
  publicPlayerMatchesName,
} from "@/lib/publicPlayers";
import { loadPendingWoloClaimSummariesByName } from "@/lib/pendingWoloClaims";

const RECENT_FINAL_MATCH_SCAN_LIMIT = 5000;

export type MatchupGameRow = {
  id: number;
  winner: string | null;
  players: unknown;
  played_on: Date | string | null;
  timestamp: Date | string | null;
  createdAt?: Date | string | null;
  original_filename?: string | null;
  replay_file?: string | null;
  parse_reason?: string | null;
  map?: unknown;
  disconnect_detected?: boolean;
  duration?: number | null;
  game_duration?: number | null;
  key_events?: unknown;
};

export type RivalSummary = {
  ref: PublicPlayerRef;
  totalMatches: number;
  wins: number;
  losses: number;
  unknowns: number;
  lastPlayedAt: string | null;
};

export type PublicRivalryEntry = {
  key: string;
  left: PublicPlayerRef;
  right: PublicPlayerRef;
  leftWins: number;
  rightWins: number;
  unknowns: number;
  totalMatches: number;
  lastPlayedAt: string | null;
  href: string;
};

export function canonicalizeMatchupPlayers(left: PublicPlayerRef, right: PublicPlayerRef) {
  return [left, right].sort((a, b) => {
    if (a.token === b.token) return 0;
    return a.token.localeCompare(b.token);
  }) as [PublicPlayerRef, PublicPlayerRef];
}

export function buildMatchupHref(left: PublicPlayerRef, right: PublicPlayerRef) {
  const [canonicalLeft, canonicalRight] = canonicalizeMatchupPlayers(left, right);
  return `/matchups/${encodeURIComponent(canonicalLeft.token)}/${encodeURIComponent(canonicalRight.token)}`;
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

function extractDistinctReplayNames(players: unknown) {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const player of parsePlayers(players)) {
    const normalized = normalizePublicPlayerName(displayPlayerName(player));
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    names.push(normalized);
  }

  return names;
}

function sortMatchRowsByPlayedAtDesc(left: MatchupGameRow, right: MatchupGameRow) {
  const playedAtDelta = getLobbyMatchPlayedAtMs(right) - getLobbyMatchPlayedAtMs(left);
  if (playedAtDelta !== 0) {
    return playedAtDelta;
  }

  return right.id - left.id;
}

export async function loadRecentFinalMatchupRows(prisma: PrismaClient, take: number) {
  const candidateMatches = await prisma.gameStats.findMany({
    where: { is_final: true },
    orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: Math.max(take, RECENT_FINAL_MATCH_SCAN_LIMIT),
    select: {
      id: true,
      winner: true,
      players: true,
      played_on: true,
      timestamp: true,
      createdAt: true,
      original_filename: true,
      replay_file: true,
      parse_reason: true,
      map: true,
      disconnect_detected: true,
      duration: true,
      game_duration: true,
      key_events: true,
    },
  });

  return candidateMatches.sort(sortMatchRowsByPlayedAtDesc).slice(0, take);
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
  const pendingClaimSummaries = await loadPendingWoloClaimSummariesByName(prisma, opponentNames);
  const summaries = new Map<string, RivalSummary>();

  for (const match of matches) {
    const players = parsePlayers(match.players);
    const opponents = players
      .map((player) => displayPlayerName(player))
      .filter((name) => !publicPlayerMatchesName(currentPlayer, name));
    const playedAt = readPlayedAt(match);

    for (const opponentName of opponents) {
      const ref = applyPendingWoloClaimSummary(
        buildPublicPlayerRef(opponentName, claimedPlayers),
        pendingClaimSummaries
      );
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

export async function loadPublicRivalries(
  prisma: PrismaClient,
  options?: { take?: number }
): Promise<PublicRivalryEntry[]> {
  const candidateMatches = await loadRecentFinalMatchupRows(prisma, options?.take ?? 400);

  const duelSeeds = candidateMatches
    .map((match) => ({
      match,
      names: extractDistinctReplayNames(match.players),
    }))
    .filter((entry) => entry.names.length === 2);

  const claimedPlayers = await findClaimedUsersForReplayNames(
    prisma,
    Array.from(new Set(duelSeeds.flatMap((entry) => entry.names)))
  );
  const pendingClaimSummaries = await loadPendingWoloClaimSummariesByName(
    prisma,
    Array.from(new Set(duelSeeds.flatMap((entry) => entry.names)))
  );

  const rivalries = new Map<string, PublicRivalryEntry>();

  for (const entry of duelSeeds) {
    const firstRef = applyPendingWoloClaimSummary(
      buildPublicPlayerRef(entry.names[0], claimedPlayers),
      pendingClaimSummaries
    );
    const secondRef = applyPendingWoloClaimSummary(
      buildPublicPlayerRef(entry.names[1], claimedPlayers),
      pendingClaimSummaries
    );
    const [left, right] = canonicalizeMatchupPlayers(firstRef, secondRef);
    const key = `${left.token}::${right.token}`;

    const rivalry =
      rivalries.get(key) ||
      ({
        key,
        left,
        right,
        leftWins: 0,
        rightWins: 0,
        unknowns: 0,
        totalMatches: 0,
        lastPlayedAt: null,
        href: buildMatchupHref(left, right),
      } satisfies PublicRivalryEntry);

    rivalry.totalMatches += 1;
    rivalry.lastPlayedAt = updateLastPlayedAt(rivalry.lastPlayedAt, readPlayedAt(entry.match));

    if (winnerMatchesPlayer(left, entry.match.winner)) {
      rivalry.leftWins += 1;
    } else if (winnerMatchesPlayer(right, entry.match.winner)) {
      rivalry.rightWins += 1;
    } else {
      rivalry.unknowns += 1;
    }

    rivalries.set(key, rivalry);
  }

  return Array.from(rivalries.values()).sort((left, right) => {
    if (left.totalMatches !== right.totalMatches) {
      return right.totalMatches - left.totalMatches;
    }

    if (left.lastPlayedAt && right.lastPlayedAt) {
      return new Date(right.lastPlayedAt).getTime() - new Date(left.lastPlayedAt).getTime();
    }

    if (left.lastPlayedAt || right.lastPlayedAt) {
      return left.lastPlayedAt ? -1 : 1;
    }

    if (left.unknowns !== right.unknowns) {
      return left.unknowns - right.unknowns;
    }

    const leftLabel = `${left.left.name} ${left.right.name}`;
    const rightLabel = `${right.left.name} ${right.right.name}`;
    return leftLabel.localeCompare(rightLabel);
  });
}
