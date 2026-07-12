import type { PrismaClient } from "@/lib/generated/prisma";

import {
  displayGameType,
  displayGameVersion,
  displayPlayerName,
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
  const rawRows = await prisma.gameStats.findMany({
    where: {
      is_final: true,
      NOT: { parse_reason: "superseded_by_later_upload" },
    },
    orderBy: [
      { played_on: "desc" },
      { timestamp: "desc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
    skip: offset,
    take: limit,
    select: {
      id: true,
      createdAt: true,
      replayHash: true,
      replay_file: true,
      original_filename: true,
      game_version: true,
      map: true,
      game_type: true,
      duration: true,
      game_duration: true,
      winner: true,
      players: true,
      event_types: true,
      key_events: true,
      timestamp: true,
      played_on: true,
      parse_iteration: true,
      is_final: true,
      parse_source: true,
      parse_reason: true,
    },
  });

  const rows = cleanPublicGameRows(rawRows, {
    includeReview: true,
    includeLive: false,
  });
  const allNames = rows.flatMap((row) =>
    parsePlayers(row.players).map((player) => displayPlayerName(player))
  );
  const claimedPlayers = await findClaimedUsersForReplayNames(prisma, allNames);

  const entries = rows.map((row): OgBoardEntry => {
    const players = parsePlayers(row.players);
    const keyEvents = readRecord(row.key_events);
    const scoresUnavailable = keyEvents.has_scores === false;
    const achievementsUnavailable = keyEvents.has_achievements === false;
    const projectedPlayers = players.map((player): OgBoardPlayer => {
      const name = displayPlayerName(player);
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
        rmRating: readPlayerSteamRmRating(player),
        dmRating: readPlayerSteamDmRating(player),
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
