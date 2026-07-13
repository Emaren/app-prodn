import { createHash } from "node:crypto";

export type ReplayTeamFormat = "1v1" | "2v2" | "3v3" | "4v4" | "unknown";
export type ReplayTeamResolutionStatus =
  | "resolved"
  | "incomplete"
  | "conflicting"
  | "unsupported";
export type ReplayTeamConfidence = "high" | "medium" | "low";
export type ReplayTeamProvenance =
  | "explicit_replay_team_ids"
  | "explicit_final_team_ids"
  | "one_vs_one_roster"
  | "scheduled_match_roster"
  | "commissioner_verified"
  | "unresolved";

export type CanonicalReplayPlayer = {
  name: string;
  normalizedName: string;
  stablePlayerKey: string;
  steamId: string | null;
  civilizationId: number | null;
  civilizationName: string | null;
  color: number | null;
  position: [number, number] | null;
  teamId: string | null;
  playerNumber: number | null;
  winner: boolean | null;
  totalScore: number | null;
  ratingSnapshot: number | null;
  eapm: number | null;
  achievements: unknown;
  aliases: string[];
};

export type ResolvedReplayTeam = {
  teamKey: string;
  players: CanonicalReplayPlayer[];
};

export type ReplayTeamResolution = {
  format: ReplayTeamFormat;
  status: ReplayTeamResolutionStatus;
  confidence: ReplayTeamConfidence;
  provenance: ReplayTeamProvenance;
  teams: ResolvedReplayTeam[];
  reasonCodes: string[];
  rosterHash: string | null;
  propositionHash: string | null;
};

type PlayerRecord = Record<string, unknown>;

function asRecord(value: unknown): PlayerRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PlayerRecord)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function normalizeReplayPlayerName(value: unknown) {
  return text(value).toLocaleLowerCase("en-US");
}

function finiteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function integer(value: unknown) {
  const parsed = finiteNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}

function truth(value: unknown): boolean | null {
  if (value === true || value === "true" || value === 1 || value === "1") return true;
  if (value === false || value === "false" || value === 0 || value === "0") return false;
  return null;
}

function normalizeSteamId(value: unknown) {
  const normalized = text(value);
  return /^\d{15,20}$/.test(normalized) ? normalized : null;
}

function normalizeTeamId(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = finiteNumber(value);
  if (numeric !== null) {
    const normalized = String(Math.trunc(numeric));
    return normalized === "-1" ? null : normalized;
  }
  const normalized = text(value);
  if (!normalized || ["none", "unknown", "null", "-1"].includes(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

function normalizePosition(value: unknown): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2) {
    const x = finiteNumber(value[0]);
    const y = finiteNumber(value[1]);
    return x === null || y === null ? null : [x, y];
  }
  const record = asRecord(value);
  if (!record) return null;
  const x = finiteNumber(record.x);
  const y = finiteNumber(record.y);
  return x === null || y === null ? null : [x, y];
}

function stableKey(name: string, steamId: string | null) {
  return steamId ? `steam:${steamId}` : `name:${normalizeReplayPlayerName(name)}`;
}

export function normalizeReplayPlayer(value: unknown): CanonicalReplayPlayer | null {
  const record = asRecord(value);
  if (!record) return null;
  const name = text(record.name ?? record.player ?? record.player_name ?? record.displayName);
  if (!name) return null;
  const steamId = normalizeSteamId(record.steam_id ?? record.steamId ?? record.user_id);
  const aliases = Array.isArray(record.aliases)
    ? [...new Set(record.aliases.map(text).filter(Boolean))]
    : [];
  const civilizationValue = record.civilization_id ?? record.civilizationId ?? record.civilization;
  const civilizationId = integer(civilizationValue);
  const civilizationName = text(record.civilization_name ?? record.civilizationName) ||
    (typeof civilizationValue === "string" && integer(civilizationValue) === null
      ? text(civilizationValue)
      : null);
  return {
    name,
    normalizedName: normalizeReplayPlayerName(name),
    stablePlayerKey: stableKey(name, steamId),
    steamId,
    civilizationId,
    civilizationName,
    color: integer(record.color_id ?? record.colorId ?? record.color),
    position: normalizePosition(record.position),
    teamId: normalizeTeamId(
      record.team_id ?? record.teamId ?? record.team_number ?? record.teamNumber ?? record.team
    ),
    playerNumber: integer(record.player_number ?? record.playerNumber ?? record.number),
    winner: truth(record.winner ?? record.isWinner ?? record.won),
    totalScore: integer(record.total_score ?? record.totalScore ?? record.score),
    ratingSnapshot: integer(record.rating_snapshot ?? record.ratingSnapshot ?? record.rate_snapshot),
    eapm: finiteNumber(record.eapm),
    achievements: record.achievements ?? null,
    aliases,
  };
}

export function normalizeReplayPlayers(value: unknown): CanonicalReplayPlayer[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeReplayPlayer).filter((player): player is CanonicalReplayPlayer => Boolean(player));
}

function compareTeamKeys(left: string, right: string) {
  const leftNumber = finiteNumber(left);
  const rightNumber = finiteNumber(right);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }
  return left.localeCompare(right);
}

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function buildRosterHash(players: CanonicalReplayPlayer[]) {
  if (players.length === 0) return null;
  return hash(players.map((player) => player.stablePlayerKey).sort());
}

export function buildPropositionHash(teams: ResolvedReplayTeam[], format: ReplayTeamFormat) {
  if (teams.length !== 2) return null;
  return hash({
    format,
    teams: teams.map((team) => ({
      teamKey: team.teamKey,
      players: team.players.map((player) => player.stablePlayerKey).sort(),
    })),
  });
}

function unresolved(
  players: CanonicalReplayPlayer[],
  status: ReplayTeamResolutionStatus,
  reasonCodes: string[]
): ReplayTeamResolution {
  return {
    format: "unknown",
    status,
    confidence: "low",
    provenance: "unresolved",
    teams: [],
    reasonCodes: [...new Set(reasonCodes)],
    rosterHash: buildRosterHash(players),
    propositionHash: null,
  };
}

export function resolveReplayTeams(
  input: unknown,
  options: {
    final?: boolean;
    provenance?: ReplayTeamProvenance;
    conflictReasonCodes?: string[];
    identityAliases?: Record<string, string>;
  } = {}
): ReplayTeamResolution {
  const players = Array.isArray(input) && input.every((player) => asRecord(player)?.stablePlayerKey)
    ? (input as CanonicalReplayPlayer[])
    : normalizeReplayPlayers(input);
  const externalConflicts = options.conflictReasonCodes?.filter(Boolean) ?? [];
  if (externalConflicts.length > 0) return unresolved(players, "conflicting", externalConflicts);
  if (players.length < 2) return unresolved(players, "incomplete", ["roster_incomplete"]);

  const aliases = options.identityAliases ?? {};
  const identityKeys = players.map((player) => aliases[player.stablePlayerKey] || player.stablePlayerKey);
  if (new Set(identityKeys).size !== players.length) {
    return unresolved(players, "conflicting", ["duplicate_player_identity"]);
  }

  if (players.length === 2) {
    const teams = players
      .map((player) => ({ teamKey: player.stablePlayerKey, players: [player] }))
      .sort((left, right) => left.teamKey.localeCompare(right.teamKey));
    return {
      format: "1v1",
      status: "resolved",
      confidence: "high",
      provenance: options.provenance ?? "one_vs_one_roster",
      teams,
      reasonCodes: [],
      rosterHash: buildRosterHash(players),
      propositionHash: buildPropositionHash(teams, "1v1"),
    };
  }

  if (![4, 6, 8].includes(players.length)) {
    return unresolved(players, "unsupported", ["unsupported_team_format"]);
  }
  if (players.some((player) => player.teamId === null)) {
    return unresolved(players, "incomplete", ["team_id_missing"]);
  }

  const grouped = new Map<string, CanonicalReplayPlayer[]>();
  for (const player of players) {
    const teamKey = player.teamId as string;
    const team = grouped.get(teamKey) ?? [];
    team.push(player);
    grouped.set(teamKey, team);
  }
  if (grouped.size !== 2) {
    return unresolved(players, "conflicting", ["expected_exactly_two_teams"]);
  }

  const expectedSize = players.length / 2;
  if ([...grouped.values()].some((team) => team.length !== expectedSize)) {
    return unresolved(players, "conflicting", ["unequal_team_sizes"]);
  }

  const format = `${expectedSize}v${expectedSize}` as ReplayTeamFormat;
  const teams = [...grouped.entries()]
    .sort(([left], [right]) => compareTeamKeys(left, right))
    .map(([teamKey, teamPlayers]) => ({
      teamKey,
      players: [...teamPlayers].sort((left, right) =>
        left.stablePlayerKey.localeCompare(right.stablePlayerKey)
      ),
    }));
  const provenance = options.provenance ??
    (options.final ? "explicit_final_team_ids" : "explicit_replay_team_ids");
  return {
    format,
    status: "resolved",
    confidence: "high",
    provenance,
    teams,
    reasonCodes: [],
    rosterHash: buildRosterHash(players),
    propositionHash: buildPropositionHash(teams, format),
  };
}

function completeness(player: CanonicalReplayPlayer) {
  return [
    player.steamId,
    player.teamId,
    player.playerNumber,
    player.civilizationId,
    player.civilizationName,
    player.color,
    player.position,
    player.winner,
    player.totalScore,
    player.ratingSnapshot,
    player.eapm,
    player.achievements,
  ].filter((value) => value !== null && value !== undefined).length;
}

export function mergeReplayPlayerIterations(iterations: unknown[]) {
  const normalizedIterations = iterations.map(normalizeReplayPlayers).filter((players) => players.length > 0);
  const conflicts = new Set<string>();
  const allByIdentity = new Map<string, CanonicalReplayPlayer[]>();
  for (const players of normalizedIterations) {
    for (const player of players) {
      const bucket = allByIdentity.get(player.stablePlayerKey) ?? [];
      bucket.push(player);
      allByIdentity.set(player.stablePlayerKey, bucket);
    }
  }

  const players = [...allByIdentity.values()].map((versions) => {
    const ordered = [...versions].sort((left, right) => completeness(right) - completeness(left));
    const best = { ...ordered[0], aliases: [...ordered[0].aliases] };
    const teamIds = new Set(versions.map((player) => player.teamId).filter((value): value is string => value !== null));
    if (teamIds.size > 1) conflicts.add("team_assignment_changed_between_iterations");
    best.teamId = teamIds.size === 1 ? [...teamIds][0] : best.teamId;
    for (const version of ordered.slice(1)) {
      best.steamId ??= version.steamId;
      best.civilizationId ??= version.civilizationId;
      best.civilizationName ??= version.civilizationName;
      best.color ??= version.color;
      best.position ??= version.position;
      best.playerNumber ??= version.playerNumber;
      best.winner ??= version.winner;
      best.totalScore ??= version.totalScore;
      best.ratingSnapshot ??= version.ratingSnapshot;
      best.eapm ??= version.eapm;
      best.achievements ??= version.achievements;
      best.aliases = [...new Set([...best.aliases, ...version.aliases, version.name])];
    }
    return best;
  });

  const rosterSizes = new Set(normalizedIterations.map((iteration) => iteration.length));
  if (rosterSizes.size > 1) conflicts.add("roster_size_changed_between_iterations");
  return {
    players,
    conflictReasonCodes: [...conflicts].sort(),
  };
}

export function resolveWinningTeamIndex(players: CanonicalReplayPlayer[], resolution: ReplayTeamResolution) {
  if (resolution.status !== "resolved" || resolution.teams.length !== 2) return null;
  const flags = resolution.teams.map((team) => team.players.map((player) => player.winner));
  const winningIndexes = flags
    .map((teamFlags, index) =>
      teamFlags.length > 0 && teamFlags.every((flag) => flag === true) ? index : -1
    )
    .filter((index) => index >= 0);
  const losingIndexes = flags
    .map((teamFlags, index) =>
      teamFlags.length > 0 && teamFlags.every((flag) => flag === false) ? index : -1
    )
    .filter((index) => index >= 0);
  return winningIndexes.length === 1 && losingIndexes.length === 1 && winningIndexes[0] !== losingIndexes[0]
    ? winningIndexes[0]
    : null;
}

export function rosterSnapshot(team: ResolvedReplayTeam) {
  return team.players.map((player) => ({
    stablePlayerKey: player.stablePlayerKey,
    name: player.name,
    normalizedName: player.normalizedName,
    steamId: player.steamId,
    teamId: player.teamId,
    playerNumber: player.playerNumber,
    aliases: player.aliases,
  }));
}

export type MarketFinalIntegrityResult = {
  ok: boolean;
  winningSide: "left" | "right" | null;
  reasonCodes: string[];
  finalResolution: ReplayTeamResolution;
};

export function validateMarketFinalIntegrity(input: {
  propositionHash: string | null | undefined;
  leftRosterSnapshot: unknown;
  rightRosterSnapshot: unknown;
  finalPlayers: unknown;
  finalWinner?: string | null;
  finalBettingEligible: boolean;
}): MarketFinalIntegrityResult {
  const finalPlayers = normalizeReplayPlayers(input.finalPlayers);
  const finalResolution = resolveReplayTeams(finalPlayers, { final: true });
  const reasons: string[] = [];
  if (!input.propositionHash) reasons.push("market_proposition_snapshot_missing");
  if (!Array.isArray(input.leftRosterSnapshot) || !Array.isArray(input.rightRosterSnapshot)) {
    reasons.push("market_roster_snapshot_missing");
  }
  if (!input.finalBettingEligible) reasons.push("final_replay_not_betting_eligible");
  if (finalResolution.status !== "resolved" || finalResolution.confidence !== "high") {
    reasons.push(...finalResolution.reasonCodes.map((reason) => `final_${reason}`));
  }

  const marketPlayers = normalizeReplayPlayers([
    ...(Array.isArray(input.leftRosterSnapshot) ? input.leftRosterSnapshot : []),
    ...(Array.isArray(input.rightRosterSnapshot) ? input.rightRosterSnapshot : []),
  ]);
  const marketResolution = resolveReplayTeams(marketPlayers);
  if (marketResolution.status !== "resolved") {
    reasons.push("market_roster_snapshot_invalid");
  }
  if (
    input.propositionHash &&
    marketResolution.propositionHash !== input.propositionHash
  ) {
    reasons.push("stored_proposition_hash_mismatch");
  }
  if (
    input.propositionHash &&
    finalResolution.propositionHash !== input.propositionHash
  ) {
    reasons.push("final_proposition_hash_mismatch");
  }
  if (marketPlayers.length !== finalPlayers.length) reasons.push("final_roster_size_mismatch");

  const marketKeys = new Set(marketPlayers.map((player) => player.stablePlayerKey));
  const finalKeys = new Set(finalPlayers.map((player) => player.stablePlayerKey));
  if (
    marketKeys.size !== finalKeys.size ||
    [...marketKeys].some((key) => !finalKeys.has(key))
  ) {
    reasons.push("final_roster_identity_mismatch");
  }

  const winningIndex = resolveWinningTeamIndex(finalPlayers, finalResolution);
  if (winningIndex === null) {
    reasons.push("final_winning_team_not_coherent");
  }
  const normalizedWinner = normalizeReplayPlayerName(input.finalWinner);
  if (normalizedWinner && winningIndex !== null) {
    const winningNames = finalResolution.teams[winningIndex].players.map((player) => player.normalizedName);
    if (!winningNames.includes(normalizedWinner)) reasons.push("winner_string_conflicts_with_winning_team");
  }

  return {
    ok: reasons.length === 0 && winningIndex !== null,
    winningSide: winningIndex === 0 ? "left" : winningIndex === 1 ? "right" : null,
    reasonCodes: [...new Set(reasons)],
    finalResolution,
  };
}
