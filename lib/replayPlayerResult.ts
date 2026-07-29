import {
  resolveExplicitUnevenTeamStats,
} from "./replayExplicitTeamStats.ts";

import { applyReplayAdjudicationToGameStats } from "./replayAdjudications.ts";
import {
  normalizeReplayPlayerName,
  normalizeReplayPlayers,
  resolveReplayTeams,
  resolveWinningTeamIndex,
  type CanonicalReplayPlayer,
  type ReplayTeamResolution,
} from "./teamResolution.ts";
import { resolveReplayWinnerTruth } from "./unresolvedWatcherResult.ts";

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
  is_final?: boolean | null;
  isFinal?: boolean | null;
  disconnect_detected?: boolean | null;
  disconnectDetected?: boolean | null;
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

function record(
  value: unknown
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    try {
      const parsed =
        JSON.parse(value) as unknown;

      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }

  return {};
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


type StatsTruthTeamProjection = {
  present: boolean;
  valid: boolean;
  teamIndex: number | null;
};

/*
 * Maps the structured parser result contract back onto the
 * canonical ReplayTeamResolution.
 *
 * This supports both:
 *
 *   result_resolution.winning_team_id
 *
 * and the strict final-stats bridge:
 *
 *   result_evidence.winner_flag_team_id
 *
 * A result is accepted only when the complete names or stable
 * player keys equal exactly one complete canonical team.
 */
function statsTruthWinningTeamIndex(
  game: ReplayPlayerResultGame,
  resolution: ReplayTeamResolution
): StatsTruthTeamProjection {
  const keyEvents =
    record(
      game.key_events ??
      game.keyEvents
    );

  const resultResolution =
    record(
      keyEvents
        .result_resolution
    );

  const resultEvidence =
    record(
      resultResolution
        .result_evidence
    );

  const teamResolution =
    record(
      keyEvents
        .team_resolution
    );

  const structuredTeamId =
    resultResolution
      .winning_team_id;

  const bridgeTeamId =
    resultEvidence
      .winner_flag_team_id;

  const selectedTeamId =
    structuredTeamId !== null &&
    structuredTeamId !== undefined &&
    String(
      structuredTeamId
    ).trim() !== ""
      ? String(
          structuredTeamId
        )
      : bridgeTeamId !== null &&
          bridgeTeamId !== undefined &&
          String(
            bridgeTeamId
          ).trim() !== ""
        ? String(
            bridgeTeamId
          )
        : null;

  if (!selectedTeamId) {
    return {
      present:
        false,

      valid:
        true,

      teamIndex:
        null,
    };
  }

  const directPlayerKeyTeamIndex =
    teamIndexForPlayerKey(
      resolution,
      selectedTeamId
    );

  if (
    directPlayerKeyTeamIndex !==
    null
  ) {
    return {
      present:
        true,

      valid:
        true,

      teamIndex:
        directPlayerKeyTeamIndex,
    };
  }

  const rawTeams =
    Array.isArray(
      teamResolution.teams
    )
      ? teamResolution.teams
      : [];

  const matchingTeams =
    rawTeams
      .filter(
        (
          value
        ): value is Record<
          string,
          unknown
        > =>
          Boolean(value) &&
          typeof value ===
            "object" &&
          !Array.isArray(value)
      )
      .filter(
        (team) =>
          String(
            team.team_id
          ) ===
          selectedTeamId
      );

  if (
    matchingTeams.length !==
    1
  ) {
    return {
      present:
        true,

      valid:
        false,

      teamIndex:
        null,
    };
  }

  const rawTeam =
    matchingTeams[0];

  const stableKeys =
    stringList(
      rawTeam.player_keys
    );

  const names =
    stringList(
      rawTeam.players
    );

  const candidates:
    number[] =
    [];

  if (
    stableKeys.length >
    0
  ) {
    const keyProjection =
      explicitWinnerSetTeamIndex(
        resolution,
        stableKeys,
        "stable_key"
      );

    if (
      !keyProjection.valid ||
      keyProjection.teamIndex ===
        null
    ) {
      return {
        present:
          true,

        valid:
          false,

        teamIndex:
          null,
      };
    }

    candidates.push(
      keyProjection.teamIndex
    );
  }

  if (
    names.length >
    0
  ) {
    const nameProjection =
      explicitWinnerSetTeamIndex(
        resolution,
        names,
        "name"
      );

    if (
      !nameProjection.valid ||
      nameProjection.teamIndex ===
        null
    ) {
      return {
        present:
          true,

        valid:
          false,

        teamIndex:
          null,
      };
    }

    candidates.push(
      nameProjection.teamIndex
    );
  }

  const uniqueCandidates =
    new Set(
      candidates
    );

  if (
    uniqueCandidates.size !==
    1
  ) {
    return {
      present:
        true,

      valid:
        false,

      teamIndex:
        null,
    };
  }

  return {
    present:
      true,

    valid:
      true,

    teamIndex:
      [...uniqueCandidates][0],
  };
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

  /*
   * Accepted adjudication projections above remain authoritative.
   * Parser-derived structured truth is consulted only when no
   * explicit winning roster/team projection was supplied.
   */
  const explicitProjectionPresent =
    winnerNameSet.present ||
    winnerKeySet.present ||
    Boolean(winningTeamKey);

  const winnerTruth =
    resolveReplayWinnerTruth({
      winner:
        game.winner,

      players,

      parseReason:
        game.parse_reason ??
        game.parseReason ??
        null,

      parseSource:
        game.parse_source ??
        game.parseSource ??
        null,

      keyEvents:
        game.key_events ??
        game.keyEvents,

      eventTypes:
        game.event_types ??
        game.eventTypes,

      isFinal:
        game.is_final ===
          true ||
        game.isFinal ===
          true,

      disconnectDetected:
        game.disconnect_detected ===
          true ||
        game.disconnectDetected ===
          true,
    });

  if (
    !explicitProjectionPresent &&
    winnerTruth.statsEligible
  ) {
    const statsProjection =
      statsTruthWinningTeamIndex(
        game,
        resolution
      );

    if (
      statsProjection.present &&
      !statsProjection.valid
    ) {
      conflict =
        true;
    }

    if (
      statsProjection.present &&
      statsProjection.valid
    ) {
      addCandidate(
        statsProjection
          .teamIndex
      );
    }
  }

  /*
   * A scalar winner is still useful when it names exactly one
   * canonical participant. A complete team label such as
   * "actgun / CRAZY_ALLOWED" is not a scalar-player conflict;
   * its team was projected from the structured contract above.
   */
  const scalarWinner = winnerTruth.statsEligible ? text(game.winner) : null;

  const scalarWinnerTeam =
    teamIndexForName(
      resolution,
      scalarWinner
    );

  if (
    scalarWinnerTeam !==
    null
  ) {
    addCandidate(
      scalarWinnerTeam
    );
  } else if (
    scalarWinner &&
    resolution.format ===
      "1v1" &&
    !explicitProjectionPresent
  ) {
    conflict =
      true;
  }

  /*
   * Raw player flags are parser evidence, not an independent result
   * authority. In particular, historical watcher opponent inference wrote a
   * complete true/false pair even though canonical replay truth rejected the
   * inferred winner. Never let those flags re-enter public W/L through this
   * lower-level team projector.
   */
  if (winnerTruth.statsEligible) {
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

// AOE2WAR_DURABLE_ADJUDICATION_PLAYER_RESULT
function durableAdjudicatedParticipantResult(
  game: ReplayPlayerResultGame,
  player: CanonicalReplayPlayer
): ReplayPlayerResult | null {
  const source =
    game as ReplayPlayerResultGame &
      Record<string, unknown>;

  const evidence =
    record(
      source
        .replayResultAdjudication
    );

  const winnerProof =
    text(
      source.winnerProof
    ).toLowerCase();

  const parseReason =
    text(
      game.parse_reason ??
        game.parseReason
    ).toLowerCase();

  /*
   * This path trusts only a projection emitted by the immutable
   * replay-result adjudication ledger.
   *
   * It does not infer a result from scalar winner text, resignation
   * evidence, incomplete teams or parser heuristics.
   *
   * It is deliberately limited to statistics-only adjudications.
   * Betting and settlement authority remain false.
   */
  if (
    winnerProof !==
      "replay_result_adjudication" ||
    parseReason !==
      "manual_result_adjudication" ||
    text(
      evidence
        .decision_status
    ).toLowerCase() !==
      "accepted" ||
    !truth(
      evidence
        .affects_stats
    ) ||
    evidence
      .affects_bets !==
      false ||
    (
      game.is_final !==
        true &&
      game.isFinal !==
        true
    ) ||
    game.disconnect_detected ===
      true ||
    game.disconnectDetected ===
      true
  ) {
    return null;
  }

  const evidenceWinningKeys =
    new Set(
      stringList(
        evidence
          .winning_player_keys
      )
    );

  const projectedWinningKeys =
    new Set(
      stringList(
        game.winningPlayerKeys ??
          game.winning_player_keys
      )
    );

  if (
    evidenceWinningKeys.size ===
      0 ||
    !sameKeys(
      evidenceWinningKeys,
      projectedWinningKeys
    )
  ) {
    return null;
  }

  const isWinner =
    evidenceWinningKeys.has(
      player.stablePlayerKey
    );

  /*
   * The immutable adjudication projector writes both the winning-key
   * set and a complete true/false player flag set. Require them to
   * agree before assigning any participant result.
   */
  if (
    player.winner !==
      isWinner
  ) {
    return null;
  }

  return isWinner
    ? "win"
    : "loss";
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

  const projectedGame =
    applyReplayAdjudicationToGameStats(
      sourceGame
    ) as ReplayPlayerResultGame;

  const adjudicatedResult =
    durableAdjudicatedParticipantResult(
      projectedGame,
      matchingPlayers[0]
    );

  if (
    adjudicatedResult
  ) {
    return adjudicatedResult;
  }

  const unevenTeamStats =
    resolveExplicitUnevenTeamStats({
      winner:
        projectedGame.winner,

      players:
        projectedGame.players,

      keyEvents:
        projectedGame.key_events ??
        projectedGame.keyEvents,

      isFinal:
        projectedGame.is_final ===
          true ||
        projectedGame.isFinal ===
          true,

      disconnectDetected:
        projectedGame
          .disconnect_detected ===
          true ||
        projectedGame
          .disconnectDetected ===
          true,
    });

  if (unevenTeamStats) {
    const targetKey =
      matchingPlayers[0]
        .stablePlayerKey;

    if (
      unevenTeamStats
        .winningPlayerKeys
        .includes(
          targetKey
        )
    ) {
      return "win";
    }

    if (
      unevenTeamStats
        .losingPlayerKeys
        .includes(
          targetKey
        )
    ) {
      return "loss";
    }

    return "unknown";
  }

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
