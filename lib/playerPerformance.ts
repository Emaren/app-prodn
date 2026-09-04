import {
  normalizeDurationSeconds,
  parsePlayers,
  readMapName,
  readPlayerSteamDmRating,
  readPlayerSteamRmRating,
} from "@/lib/gameStatsView";
import {
  parseReplayRatingObservation,
  shouldReplaceCurrentReplayRating,
} from "@/lib/playerRatingRecency";
import {
  type PublicPlayerRef,
  publicPlayerMatchesReplayParticipant,
} from "@/lib/publicPlayers";
import { applyReplayAdjudicationToGameStats } from "@/lib/replayAdjudications";
import {
  normalizePublicReplayText,
} from "@/lib/unresolvedWatcherResult";
import { resolveReplayResultForPlayer } from "@/lib/replayPlayerResult";

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
  is_final?: boolean | null;
  isFinal?: boolean | null;
  disconnect_detected?: boolean | null;
  disconnectDetected?: boolean | null;
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

  for (const rawMatch of matches) {
    const match = applyReplayAdjudicationToGameStats(rawMatch);
    const players = parsePlayers(match.players);
    const currentRecord = players.find((player) =>
      publicPlayerMatchesReplayParticipant(currentPlayer, player)
    );

    if (currentRecord) {
      const civ = readCivilization(currentRecord);
      if (civ) civilizations.add(civ);

      const nextSteamRating = readPlayerSteamRmRating(currentRecord);
      const nextLadderRating = readPlayerSteamDmRating(currentRecord);
      if (nextSteamRating !== null || nextLadderRating !== null) {
        const currentHasRating =
          steamRating !== null ||
          ladderRating !== null;

        const shouldReplace =
          shouldReplaceCurrentReplayRating({
            currentHasRating,
            currentObservedAt:
              ratingLastSeenAt,
            nextPlayedOn:
              match.played_on,
          });

        if (shouldReplace) {
          /*
           * Preserve each lane independently. A replay carrying only one
           * official rating must not erase the other lane.
           */
          if (nextSteamRating !== null) {
            steamRating =
              nextSteamRating;
          }

          if (nextLadderRating !== null) {
            ladderRating =
              nextLadderRating;
          }

          const observation =
            parseReplayRatingObservation(
              match.played_on,
            );

          if (observation) {
            ratingLastSeenAt =
              observation.iso;
          }
        }
      }
    }

    for (const player of players) {
      const name = normalizePublicReplayText(player.name);
      if (!name) continue;
      if (!publicPlayerMatchesReplayParticipant(currentPlayer, player)) {
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

    const result =
      resolveReplayResultForPlayer(
        match,
        (player) =>
          publicPlayerMatchesReplayParticipant(
            currentPlayer,
            player
          )
      );

    if (
      result === "win"
    ) {
      wins += 1;
    } else if (
      result === "loss"
    ) {
      losses += 1;
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
