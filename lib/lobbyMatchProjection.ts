import type { LobbyMatchPlayer, LobbyMatchRow } from "@/lib/lobby";

type UnknownRecord = Record<string, unknown>;

function readRecord(value: unknown): UnknownRecord | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as UnknownRecord;
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as UnknownRecord;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function readArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function projectPlayer(value: unknown): LobbyMatchPlayer & {
  team_id?: unknown;
  teamId?: unknown;
} | null {
  if (typeof value === "string" && value.trim()) {
    return { name: value.trim() };
  }

  const player = readRecord(value);
  if (!player) return null;

  const name = typeof player.name === "string" ? player.name.trim() : "";
  if (!name) return null;

  const projected: LobbyMatchPlayer & {
    team_id?: unknown;
    teamId?: unknown;
  } = { name };

  if (player.winner === true || player.winner === false || player.winner === null) {
    projected.winner = player.winner;
  }

  if (player.team_id !== undefined) projected.team_id = player.team_id;
  if (player.teamId !== undefined) projected.teamId = player.teamId;

  return projected;
}

function projectPlayers(value: LobbyMatchRow["players"]): LobbyMatchRow["players"] {
  const players = readArray(value);
  if (!players) return value;

  return players
    .map(projectPlayer)
    .filter((player): player is NonNullable<ReturnType<typeof projectPlayer>> => Boolean(player));
}

function projectKeyEvents(value: unknown) {
  const keyEvents = readRecord(value);
  if (!keyEvents) return undefined;

  const projected: UnknownRecord = {};
  for (const key of [
    "team_resolution",
    "replay_result_adjudication",
    "commissioner_adjudication",
    "disconnect_detected",
  ]) {
    if (keyEvents[key] !== undefined) {
      projected[key] = keyEvents[key];
    }
  }

  return Object.keys(projected).length > 0 ? projected : undefined;
}

const OPTIONAL_LOBBY_FIELDS = [
  "sessionKey",
  "replayHash",
  "replay_hash",
  "created_at",
  "createdAt",
  "derived_played_on",
  "played_at",
  "played_at_is_absolute",
  "watcher_file_mtime",
  "parse_reason",
  "parseReason",
  "original_filename",
  "replay_file",
  "disconnect_detected",
  "disconnectDetected",
  "unresolvedResult",
  "winnerProof",
  "reviewNeeded",
  "replayResultAdjudication",
  "humanSuppliedEvidence",
  "humanSuppliedEvidenceCount",
  "humanConfirmedDesync",
] as const;

/**
 * Shrink the server-to-client lobby payload after public replay truth, human
 * evidence and desync hydration have already completed.
 *
 * This is a presentation projection only. It must never become a replay,
 * parser, statistics, betting or settlement authority.
 */
export function projectLobbyMatchRow(row: LobbyMatchRow): LobbyMatchRow {
  const source = row as LobbyMatchRow & UnknownRecord;
  const projected: UnknownRecord = {
    id: row.id,
    winner: row.winner,
    map: row.map,
    players: projectPlayers(row.players),
    played_on: row.played_on,
    timestamp: row.timestamp,
  };

  for (const key of OPTIONAL_LOBBY_FIELDS) {
    if (source[key] !== undefined) {
      projected[key] = source[key];
    }
  }

  const keyEvents = projectKeyEvents(source.key_events ?? source.keyEvents);
  if (keyEvents) {
    projected.key_events = keyEvents;
  }

  return projected as LobbyMatchRow;
}
