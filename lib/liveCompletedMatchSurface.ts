import type { LobbyMatchRow } from "@/lib/lobby";
import { getLobbyMatchPlayedAtMs } from "@/lib/lobbyMatchTime";
import type { LiveGameSession } from "@/lib/liveSessionSnapshot";

function normalizeSurfaceText(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function sessionMatchKey(session: LiveGameSession) {
  return session.sessionKey
    ? `session:${session.sessionKey.toLowerCase()}`
    : `game:${session.id}`;
}

function lobbyMatchKey(match: LobbyMatchRow) {
  const original = normalizeSurfaceText(match.original_filename);
  const replay = normalizeSurfaceText(match.replay_file);
  if (original || replay) return `file:${(original || replay).toLowerCase()}`;

  const players = Array.isArray(match.players)
    ? match.players.map((player) => normalizeSurfaceText(player.name)).join(" vs ")
    : normalizeSurfaceText(match.players);

  const mapName =
    typeof match.map === "string"
      ? match.map
      : match.map && typeof match.map === "object"
        ? normalizeSurfaceText(match.map.name)
        : "";

  return `match:${players.toLowerCase()}::${mapName.toLowerCase()}::${getLobbyMatchPlayedAtMs(match)}`;
}

export function completedSessionToLobbyMatch(session: LiveGameSession): LobbyMatchRow {
  const playedAt = session.playedOn || session.completedAt || session.updatedAt || session.createdAt;

  return {
    id: session.id,
    winner: session.winner,
    map: session.mapName ? { name: session.mapName } : null,
    players: session.players.map((player) => ({
      name: player.name,
      winner: player.winner,
    })),
    created_at: session.createdAt,
    createdAt: session.createdAt,
    derived_played_on: playedAt,
    played_at: playedAt,
    played_on: playedAt,
    timestamp: session.updatedAt || playedAt,
    parse_reason: "completed_watcher_live",
    original_filename: session.originalFilename || session.replayFile || session.sessionKey,
    replay_file: session.replayFile || session.originalFilename || session.sessionKey,
  };
}

export function mergeCompletedSessionsIntoLobbyMatches(
  matches: LobbyMatchRow[],
  completedSessions: LiveGameSession[],
  limit = 24
) {
  const rows: LobbyMatchRow[] = [];
  const seen = new Set<string>();

  for (const session of completedSessions) {
    const row = completedSessionToLobbyMatch(session);
    const keys = [
      sessionMatchKey(session),
      lobbyMatchKey(row),
      `id:${row.id}`,
    ];

    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    rows.push(row);
  }

  for (const match of matches) {
    const key = lobbyMatchKey(match);
    const idKey = `id:${match.id}`;
    if (seen.has(key) || seen.has(idKey)) continue;
    seen.add(key);
    seen.add(idKey);
    rows.push(match);
  }

  return rows
    .sort((left, right) => getLobbyMatchPlayedAtMs(right) - getLobbyMatchPlayedAtMs(left))
    .slice(0, limit);
}
