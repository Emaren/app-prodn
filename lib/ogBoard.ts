import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

import {
  displayGameType,
  displayGameVersion,
  normalizeDurationSeconds,
  parsePlayers,
  readMapName,
  readMapSize,
  readPlayerCivilizationLabel,
  readPlayerSteamDmRating,
  readPlayerSteamRmRating,
  readPlayedAt,
} from "@/lib/gameStatsView";
import { cleanPublicGameRows } from "@/lib/publicReplayTruth";
import {
  buildPublicPlayerRef,
  findClaimedUsersForReplayNames,
} from "@/lib/publicPlayers";
import {
  getReplayAchievementGroups,
  type ReplayAchievementGroup,
} from "@/lib/replayAchievementMetrics";
import { normalizePublicReplayText } from "@/lib/unresolvedWatcherResult";

export type OgBoardPlayer = {
  name: string;
  href: string;
  civilization: string;
  winner: boolean;
  score: number | null;
  eapm: number | null;
  position: string | null;
  teamId: string | null;
  rmRating: number | null;
  dmRating: number | null;
  achievements: ReplayAchievementGroup[];
};

export type OgBoardEntry = {
  id: number;
  href: string;
  mapName: string;
  mapSize: string | null;
  gameVersion: string;
  gameType: string;
  durationSeconds: number | null;
  playedAt: string | null;
  winnerName: string | null;
  parseCompleteness: "full" | "partial" | "metadata_only";
  players: OgBoardPlayer[];
};

export type OgBoardPage = {
  entries: OgBoardEntry[];
  nextOffset: number;
  hasMore: boolean;
};

type OgBoardRawRow = {
  id: number;
  createdAt: Date;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  game_version: string | null;
  map: Prisma.JsonValue | null;
  game_type: string | null;
  duration: number | null;
  game_duration: number | null;
  winner: string | null;
  players: Prisma.JsonValue | null;
  event_types: Prisma.JsonValue | null;
  key_events: Prisma.JsonValue | null;
  timestamp: Date | null;
  played_on: Date | null;
  parse_iteration: number;
  is_final: boolean;
  parse_source: string;
  parse_reason: string;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumber(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.round(parsed);
    }
  }
  return null;
}

function readTeamId(player: Record<string, unknown>) {
  for (const key of ["team_id", "teamId", "team"]) {
    const value = player[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value < 0 ? "Solo" : String(Math.round(value) + 1);
    }
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 32);
  }
  return null;
}

function readPosition(player: Record<string, unknown>) {
  const value = player.position;
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [x, y] = value;
  return typeof x === "number" && typeof y === "number"
    ? `${Math.round(x)}, ${Math.round(y)}`
    : null;
}

function meaningfulRating(value: number | null) {
  return value !== null && value > 0 ? value : null;
}

function toIso(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function loadOgBoardPage(
  prisma: PrismaClient,
  options: { offset?: number; limit?: number } = {}
): Promise<OgBoardPage> {
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limit = Math.max(1, Math.min(40, Math.floor(options.limit ?? 24)));
  const rawRows = await prisma.$queryRaw<OgBoardRawRow[]>(Prisma.sql`
    SELECT
      id,
      created_at AS "createdAt",
      replay_hash AS "replayHash",
      replay_file,
      original_filename,
      game_version,
      map,
      game_type,
      duration,
      game_duration,
      winner,
      players,
      event_types,
      key_events,
      timestamp,
      played_on,
      parse_iteration,
      is_final,
      parse_source,
      parse_reason
    FROM game_stats
    WHERE is_final = true
      AND parse_reason <> 'superseded_by_later_upload'
    ORDER BY COALESCE(played_on, timestamp, created_at) DESC, id DESC
    OFFSET ${offset}
    LIMIT ${limit}
  `);

  const rows = cleanPublicGameRows(rawRows, {
    includeReview: true,
    includeLive: false,
  });
  const allNames = rows.flatMap((row) =>
    parsePlayers(row.players)
      .map((player) => normalizePublicReplayText(player.name))
      .filter((name): name is string => Boolean(name))
  );
  const claimedPlayers = await findClaimedUsersForReplayNames(prisma, allNames);

  const entries = rows.map((row): OgBoardEntry => {
    const players = parsePlayers(row.players).filter((player) =>
      Boolean(normalizePublicReplayText(player.name))
    );
    const keyEvents = readRecord(row.key_events);
    const scoresUnavailable = keyEvents.has_scores === false;
    const achievementsUnavailable = keyEvents.has_achievements === false;
    const projectedPlayers = players.map((player): OgBoardPlayer => {
      const name = normalizePublicReplayText(player.name) as string;
      const playerRef = buildPublicPlayerRef(name, claimedPlayers);
      const achievements = achievementsUnavailable
        ? []
        : getReplayAchievementGroups(player);

      return {
        name,
        href: playerRef.href,
        civilization: readPlayerCivilizationLabel(player),
        winner: player.winner === true,
        score: scoresUnavailable ? null : readNumber(player, "score"),
        eapm: readNumber(player, "eapm"),
        position: readPosition(player),
        teamId: readTeamId(player),
        rmRating: meaningfulRating(readPlayerSteamRmRating(player)),
        dmRating: meaningfulRating(readPlayerSteamDmRating(player)),
        achievements,
      };
    });
    const hasPostgame = projectedPlayers.some(
      (player) => player.score !== null || player.achievements.length > 0
    );
    const playedAt = readPlayedAt(row);

    const mapSizeLabel = readMapSize(row.map);

    return {
      id: row.id,
      href: `/game-stats/${row.id}`,
      mapName: readMapName(row.map),
      mapSize: mapSizeLabel === "Size unavailable" ? null : mapSizeLabel,
      gameVersion: displayGameVersion(row.game_version),
      gameType: displayGameType(row.game_type),
      durationSeconds: normalizeDurationSeconds(row.duration || row.game_duration),
      playedAt: toIso(playedAt),
      winnerName: typeof row.winner === "string" && row.winner.trim() ? row.winner.trim() : null,
      parseCompleteness: hasPostgame
        ? "full"
        : projectedPlayers.length > 0
          ? "partial"
          : "metadata_only",
      players: projectedPlayers,
    };
  });

  return {
    entries,
    nextOffset: offset + rawRows.length,
    hasMore: rawRows.length === limit,
  };
}
