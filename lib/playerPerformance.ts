import {
  displayPlayerName,
  normalizeDurationSeconds,
  parsePlayers,
  readMapName,
  readPlayedAt,
  readPlayerSteamDmRating,
  readPlayerSteamRmRating,
} from "@/lib/gameStatsView";
import { type PublicPlayerRef, publicPlayerMatchesName } from "@/lib/publicPlayers";
import { applyReplayAdjudicationToGameStats } from "@/lib/replayAdjudications";
import {
  normalizePublicReplayText,
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";

type PerformanceGame = {
  id?: number | string | null;
  winner: string | null;
  players: unknown;
  map: unknown;
  duration?: number | null;
  game_duration?: number | null;
  event_types?: unknown;
  key_events?: unknown;
  parse_reason?: string | null;
  parse_source?: string | null;
  played_on?: Date | string | null;
  timestamp?: Date | string | null;
};

export type PlayerPerformanceStats = {
  matches: number;
  wins: number;
  losses: number;
  unknowns: number;
  winRate: number | null;
  averageDurationSeconds: number | null;
  longestDurationSeconds: number | null;
  shortestDurationSeconds: number | null;
  ratedMatches: number;
  uniqueOpponents: number;
  civilizationsPlayed: number;
  mostPlayedMap: string | null;
  steamRating: number | null;
  ladderRating: number | null;
  ratingLastSeenAt: string | null;
};

function readBooleanFlag(source: unknown, key: string) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return false;
  }

  return Boolean((source as Record<string, unknown>)[key]);
}

function readCivilization(player: Record<string, unknown>) {
  const value = player.civilization;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

function playerWinnerFlagIsTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function buildPlayerPerformanceStats(
  matches: PerformanceGame[],
  currentPlayer: PublicPlayerRef
): PlayerPerformanceStats {
  const durations: number[] = [];
  const opponentKeys = new Set<string>();
  const civilizations = new Set<string>();
  const mapCounts = new Map<string, number>();

  let wins = 0;
  let losses = 0;
  let unknowns = 0;
  let ratedMatches = 0;
  let steamRating: number | null = null;
  let ladderRating: number | null = null;
  let ratingLastSeenAt: string | null = null;
  let ratingLastSeenMs = 0;

  for (const rawMatch of matches) {
    const match = applyReplayAdjudicationToGameStats(rawMatch);
    const players = parsePlayers(match.players);
    const currentRecord = players.find((player) =>
      publicPlayerMatchesName(currentPlayer, displayPlayerName(player))
    );

    if (currentRecord) {
      const civ = readCivilization(currentRecord);
      if (civ) civilizations.add(civ);

      const nextSteamRating = readPlayerSteamRmRating(currentRecord);
      const nextLadderRating = readPlayerSteamDmRating(currentRecord);
      if (nextSteamRating !== null || nextLadderRating !== null) {
        const nextPlayedAt = readPlayedAt(match);
        const nextPlayedAtMs = nextPlayedAt ? new Date(nextPlayedAt).getTime() : 0;
        const shouldReplace =
          ratingLastSeenMs === 0 ||
          nextPlayedAtMs === 0 ||
          nextPlayedAtMs >= ratingLastSeenMs;

        if (shouldReplace) {
          steamRating = nextSteamRating;
          ladderRating = nextLadderRating;
          ratingLastSeenMs = nextPlayedAtMs || ratingLastSeenMs;
          ratingLastSeenAt =
            nextPlayedAtMs > 0 ? new Date(nextPlayedAtMs).toISOString() : ratingLastSeenAt;
        }
      }
    }

    for (const player of players) {
      const name = normalizePublicReplayText(player.name);
      if (!name) continue;
      if (!publicPlayerMatchesName(currentPlayer, name)) {
        opponentKeys.add(name.toLowerCase());
      }
    }

    const mapName = normalizePublicReplayText(readMapName(match.map));
    if (mapName) {
      mapCounts.set(mapName, (mapCounts.get(mapName) || 0) + 1);
    }

    const durationSeconds = normalizeDurationSeconds(match.duration ?? match.game_duration ?? null);
    if (durationSeconds) {
      durations.push(durationSeconds);
    }

    if (readBooleanFlag(match.key_events, "rated")) {
      ratedMatches += 1;
    }

    const winner = resolveReliableReplayWinner({
      winner: match.winner,
      players,
      parseReason: match.parse_reason,
      parseSource: match.parse_source,
      keyEvents: match.key_events,
      eventTypes: match.event_types,
    });
    if (winner) {
      if (
        playerWinnerFlagIsTrue(currentRecord?.winner) ||
        publicPlayerMatchesName(currentPlayer, winner)
      ) {
        wins += 1;
      } else {
        losses += 1;
      }
    } else {
      unknowns += 1;
    }
  }

  const averageDurationSeconds =
    durations.length > 0
      ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
      : null;

  const mostPlayedMap =
    mapCounts.size > 0
      ? Array.from(mapCounts.entries()).sort((left, right) => {
          if (left[1] !== right[1]) return right[1] - left[1];
          return left[0].localeCompare(right[0]);
        })[0][0]
      : null;

  return {
    matches: matches.length,
    wins,
    losses,
    unknowns,
    winRate: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
    averageDurationSeconds,
    longestDurationSeconds: durations.length > 0 ? Math.max(...durations) : null,
    shortestDurationSeconds: durations.length > 0 ? Math.min(...durations) : null,
    ratedMatches,
    uniqueOpponents: opponentKeys.size,
    civilizationsPlayed: civilizations.size,
    mostPlayedMap,
    steamRating,
    ladderRating,
    ratingLastSeenAt,
  };
}
