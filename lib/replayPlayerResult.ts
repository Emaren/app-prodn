import { applyReplayAdjudicationToGameStats } from "./replayAdjudications.ts";
import {
  normalizeReplayPlayerName,
  normalizeReplayPlayers,
  resolveReplayTeams,
  resolveWinningTeamIndex,
  type CanonicalReplayPlayer,
  type ReplayTeamResolution,
} from "./teamResolution.ts";
import { resolveReliableReplayWinner } from "./unresolvedWatcherResult.ts";

export type ReplayPlayerResult = "win" | "loss" | "unknown";

export type ReplayPlayerResultGame = {
  id?: unknown;
  winner?: unknown;
  winnerPlayers?: unknown;
  winner_players?: unknown;
  winningPlayerKeys?: unknown;
  winning_player_keys?: unknown;
  winningTeamKey?: unknown;
  winning_team_key?: unknown;
  players?: unknown;
  parse_reason?: string | null;
  parseReason?: string | null;
  parse_source?: string | null;
  parseSource?: string | null;
  key_events?: unknown;
  keyEvents?: unknown;
  event_types?: unknown;
  eventTypes?: unknown;
  replayResultAdjudications?: unknown;
  replayResultAdjudication?: unknown;
};

export type ReplayPlayerMatcher = (player: CanonicalReplayPlayer) => boolean;

type ReplayResultProjection = {
  players: CanonicalReplayPlayer[];
  resolution: ReplayTeamResolution | null;
  winnerTeamIndex: number | null;
};

const replayResultProjectionCache = new WeakMap<object, ReplayResultProjection>();

function parsePlayers(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(
      (player): player is Record<string, unknown> =>
        Boolean(player) && typeof player === "object" && !Array.isArray(player)
    );
  }

  if (typeof value === "string") {
    try {
      return parsePlayers(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truth(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => text(entry)).filter(Boolean);
  }

  if (typeof value === "string" && value.trim()) {
    try {
      return stringList(JSON.parse(value));
    } catch {
      return [];
    }
  }

  return [];
}

function teamPlayerKeys(resolution: ReplayTeamResolution, teamIndex: number) {
  return new Set(
    resolution.teams[teamIndex]?.players.map((player) => player.stablePlayerKey) ?? []
  );
}

function sameKeys(left: Set<string>, right: Set<string>) {
  return left.size === right.size && [...left].every((key) => right.has(key));
}

function teamIndexForPlayerKey(
  resolution: ReplayTeamResolution,
  stablePlayerKey: string
) {
  const indexes = resolution.teams.flatMap((team, index) =>
    team.players.some((player) => player.stablePlayerKey === stablePlayerKey)
      ? [index]
      : []
  );
  return indexes.length === 1 ? indexes[0] : null;
}

function teamIndexForName(
  resolution: ReplayTeamResolution,
  value: unknown
) {
  const normalized = normalizeReplayPlayerName(value);
  if (!normalized) return null;

  const matches = resolution.teams.flatMap((team, index) =>
    team.players.some(
      (player) =>
        player.normalizedName === normalized ||
        player.aliases.some((alias) => normalizeReplayPlayerName(alias) === normalized)
    )
      ? [index]
      : []
  );
  return matches.length === 1 ? matches[0] : null;
}

function explicitWinnerSetTeamIndex(
  resolution: ReplayTeamResolution,
  values: string[],
  kind: "name" | "stable_key"
) {
  if (values.length === 0) return { present: false, valid: true, teamIndex: null };

  const keys = new Set<string>();
  for (const value of values) {
    if (kind === "stable_key") {
      const matchingPlayers = resolution.teams.flatMap((team) =>
        team.players.filter((player) => player.stablePlayerKey === value)
      );
      if (matchingPlayers.length !== 1) {
        return { present: true, valid: false, teamIndex: null };
      }
      keys.add(matchingPlayers[0].stablePlayerKey);
      continue;
    }

    const normalized = normalizeReplayPlayerName(value);
    const matchingPlayers = resolution.teams.flatMap((team) =>
      team.players.filter(
        (player) =>
          player.normalizedName === normalized ||
          player.aliases.some((alias) => normalizeReplayPlayerName(alias) === normalized)
      )
    );
    if (!normalized || matchingPlayers.length !== 1) {
      return { present: true, valid: false, teamIndex: null };
    }
    keys.add(matchingPlayers[0].stablePlayerKey);
  }

  const matchingTeams = resolution.teams.flatMap((_team, index) =>
    sameKeys(keys, teamPlayerKeys(resolution, index)) ? [index] : []
  );
  return matchingTeams.length === 1
    ? { present: true, valid: true, teamIndex: matchingTeams[0] }
    : { present: true, valid: false, teamIndex: null };
}

function winningTeamIndex(
  game: ReplayPlayerResultGame,
  players: CanonicalReplayPlayer[],
  resolution: ReplayTeamResolution
) {
  const candidates: number[] = [];
  let conflict = false;

  const addCandidate = (teamIndex: number | null) => {
    if (teamIndex === null) return;
    candidates.push(teamIndex);
  };

  const winnerNameSet = explicitWinnerSetTeamIndex(
    resolution,
    stringList(game.winnerPlayers ?? game.winner_players),
    "name"
  );
  const winnerKeySet = explicitWinnerSetTeamIndex(
    resolution,
    stringList(game.winningPlayerKeys ?? game.winning_player_keys),
    "stable_key"
  );
  if (!winnerNameSet.valid || !winnerKeySet.valid) conflict = true;
  if (winnerNameSet.present) addCandidate(winnerNameSet.teamIndex);
  if (winnerKeySet.present) addCandidate(winnerKeySet.teamIndex);

  const winningTeamKey = text(game.winningTeamKey ?? game.winning_team_key);
  if (winningTeamKey) {
    const matchingTeams = resolution.teams.flatMap((team, index) =>
      team.teamKey === winningTeamKey ? [index] : []
    );
    if (matchingTeams.length === 1) {
      addCandidate(matchingTeams[0]);
    } else if (resolution.format !== "1v1") {
      conflict = true;
    }
  }

  const reliableWinner = resolveReliableReplayWinner({
    winner: game.winner,
    players,
    parseReason: game.parse_reason ?? game.parseReason ?? null,
    parseSource: game.parse_source ?? game.parseSource ?? null,
    keyEvents: game.key_events ?? game.keyEvents,
    eventTypes: game.event_types ?? game.eventTypes,
  });
  // In a team game, one isolated player winner flag is not a winning side.
  // The scalar-side projection is available only when a reliable stored
  // winner actually names a member of that side. A 1v1 may still recover its
  // winner from the sole decisive player flag.
  const scalarWinner =
    resolution.format === "1v1" || text(game.winner) ? reliableWinner : null;
  const scalarWinnerTeam = teamIndexForName(resolution, scalarWinner);
  if (scalarWinner && scalarWinnerTeam === null) conflict = true;
  addCandidate(scalarWinnerTeam);

  const strictFlagWinner = resolveWinningTeamIndex(players, resolution);
  addCandidate(strictFlagWinner);

  const trueFlagPlayerKeys = new Set(
    players.filter((player) => truth(player.winner)).map((player) => player.stablePlayerKey)
  );
  if (trueFlagPlayerKeys.size > 0) {
    const flaggedTeamIndexes = new Set(
      [...trueFlagPlayerKeys]
        .map((key) => teamIndexForPlayerKey(resolution, key))
        .filter((index): index is number => index !== null)
    );
    if (flaggedTeamIndexes.size !== 1) {
      conflict = true;
    } else {
      const flaggedTeamIndex = [...flaggedTeamIndexes][0];
      if (sameKeys(trueFlagPlayerKeys, teamPlayerKeys(resolution, flaggedTeamIndex))) {
        addCandidate(flaggedTeamIndex);
      } else if (
        candidates.length === 0 ||
        candidates.some((candidate) => candidate !== flaggedTeamIndex)
      ) {
        // A partial winner flag set cannot establish a team result on its own.
        // It may support a scalar winner naming the same explicit team, which is
        // how older HD rows represented a winning side.
        conflict = true;
      }
    }
  }

  const uniqueCandidates = new Set(candidates);
  return !conflict && uniqueCandidates.size === 1 ? [...uniqueCandidates][0] : null;
}

function replayResultProjection(sourceGame: ReplayPlayerResultGame): ReplayResultProjection {
  const cached = replayResultProjectionCache.get(sourceGame);
  if (cached) return cached;

  const game = applyReplayAdjudicationToGameStats(sourceGame) as ReplayPlayerResultGame;
  const players = normalizeReplayPlayers(parsePlayers(game.players));
  const resolution = players.length >= 2
    ? resolveReplayTeams(players, { final: true })
    : null;
  const projection = {
    players,
    resolution,
    winnerTeamIndex:
      resolution?.status === "resolved" && resolution.teams.length === 2
        ? winningTeamIndex(game, players, resolution)
        : null,
  } satisfies ReplayResultProjection;
  replayResultProjectionCache.set(sourceGame, projection);
  return projection;
}

/**
 * Projects one replay result onto one player without treating the scalar
 * winner field as a one-person team. Accepted adjudications are applied first;
 * team games then require two complete explicit sides and one coherent winning
 * side. Any partial or conflicting team evidence is excluded from resolved W/L.
 */
export function resolveReplayResultForPlayer(
  sourceGame: ReplayPlayerResultGame,
  matchesPlayer: ReplayPlayerMatcher
): ReplayPlayerResult {
  const { players, resolution, winnerTeamIndex } = replayResultProjection(sourceGame);
  if (players.length < 2) return "unknown";

  const matchingPlayers = players.filter(matchesPlayer);
  if (matchingPlayers.length !== 1) return "unknown";

  if (!resolution || resolution.status !== "resolved" || resolution.teams.length !== 2) {
    return "unknown";
  }

  const targetTeamIndex = teamIndexForPlayerKey(
    resolution,
    matchingPlayers[0].stablePlayerKey
  );
  if (targetTeamIndex === null || winnerTeamIndex === null) return "unknown";

  return targetTeamIndex === winnerTeamIndex ? "win" : "loss";
}
