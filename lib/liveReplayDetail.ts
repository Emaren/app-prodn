import path from "node:path";

import { PrismaClient } from "@/lib/generated/prisma";

const SUPERSEDED_PARSE_REASON = "superseded_by_later_upload";

export type LiveReplayPlayerRecord = Record<string, unknown>;

const USER_SELECT = {
  uid: true,
  inGameName: true,
  steamPersonaName: true,
  verificationLevel: true,
  verified: true,
  lastSeen: true,
} as const;

const GAME_SELECT = {
  id: true,
  replayHash: true,
  replay_file: true,
  original_filename: true,
  parse_iteration: true,
  is_final: true,
  parse_source: true,
  parse_reason: true,
  createdAt: true,
  timestamp: true,
  played_on: true,
  map: true,
  game_version: true,
  game_type: true,
  duration: true,
  game_duration: true,
  winner: true,
  players: true,
  event_types: true,
  key_events: true,
  disconnect_detected: true,
  user: {
    select: USER_SELECT,
  },
} as const;

type ReplayRow = {
  id: number;
  replayHash: string;
  replay_file: string;
  original_filename: string | null;
  parse_iteration: number;
  is_final: boolean;
  parse_source: string;
  parse_reason: string;
  createdAt: Date;
  timestamp: Date | null;
  played_on: Date | null;
  map: unknown;
  game_version: string | null;
  game_type: string | null;
  duration: number | null;
  game_duration: number | null;
  winner: string | null;
  players: unknown;
  event_types: unknown;
  key_events: unknown;
  disconnect_detected: boolean;
  user: {
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
    verificationLevel: number;
    verified: boolean;
    lastSeen: Date | null;
  } | null;
};

type KeyEventRecord = Record<string, unknown>;

export type LiveReplayDetailSnapshot = {
  sessionKey: string;
  mode: "live" | "final";
  finalGameId: number | null;
  updatedAt: string;
  telemetry: {
    historyRows: number;
    historyWindowSeconds: number | null;
    latestChatCount: number | null;
    latestEventTypeCount: number;
    uniqueEventTypeCount: number;
    hasScores: boolean;
    hasAchievements: boolean;
    hasAchievementShell: boolean;
    achievementShellCount: number;
    hasPostgame: boolean;
    completedSignal: boolean;
    completionSource: string | null;
  };
  game: {
    id: number;
    replayHash: string;
    replayFile: string;
    originalFilename: string | null;
    parseIteration: number;
    isFinal: boolean;
    parseSource: string;
    parseReason: string;
    createdAt: string;
    updatedAt: string;
    playedOn: string | null;
    map: unknown;
    gameVersion: string | null;
    gameType: string | null;
    duration: number | null;
    gameDuration: number | null;
    winner: string | null;
    players: LiveReplayPlayerRecord[];
    eventTypes: unknown;
    keyEvents: unknown;
    disconnectDetected: boolean;
    user: {
      uid: string;
      inGameName: string | null;
      steamPersonaName: string | null;
      verificationLevel: number;
      verified: boolean;
      lastSeen: string | null;
    } | null;
  };
  history: Array<{
    id: number;
    replayHash: string;
    parseIteration: number;
    isFinal: boolean;
    parseSource: string;
    parseReason: string;
    winner: string | null;
    duration: number | null;
    updatedAt: string;
    players: LiveReplayPlayerRecord[];
    eventTypes: string[];
    eventTypeCount: number;
    chatCount: number | null;
    completed: boolean;
    hasAchievements: boolean;
    postgameAvailable: boolean;
    disconnectDetected: boolean;
  }>;
  parseAttempts: Array<{
    id: number;
    status: string;
    detail: string | null;
    parseSource: string;
    uploadMode: string | null;
    replayHash: string | null;
    originalFilename: string | null;
    gameStatsId: number | null;
    createdAt: string;
  }>;
};

function getRowActivityTime(row: Pick<ReplayRow, "timestamp" | "createdAt">) {
  return row.timestamp ?? row.createdAt;
}

function parsePlayers(value: unknown): LiveReplayPlayerRecord[] {
  if (Array.isArray(value)) {
    return value.filter(
      (player): player is LiveReplayPlayerRecord => Boolean(player) && typeof player === "object"
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter(
            (player): player is LiveReplayPlayerRecord => Boolean(player) && typeof player === "object"
          )
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function readKeyEvents(value: unknown): KeyEventRecord {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as KeyEventRecord;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as KeyEventRecord;
      }
    } catch {
      return {};
    }
  }

  return {};
}

function readEventTypes(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function readBooleanValue(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (lowered === "true") return true;
    if (lowered === "false") return false;
  }

  return false;
}

function readNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readStringValue(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

function hasVisiblePlayerScore(players: LiveReplayPlayerRecord[]) {
  return players.some((player) => readNumberValue(player.score) !== null);
}

function normalizeSessionCandidates(sessionKey: string) {
  const trimmed = sessionKey.trim();
  const basename = path.basename(trimmed);
  return Array.from(new Set([trimmed, basename].filter(Boolean)));
}

function buildSessionWhere(sessionCandidates: string[]) {
  return {
    OR: sessionCandidates.flatMap((value) => [
      { original_filename: value },
      { replay_file: value },
    ]),
  };
}

function serializeUser(user: ReplayRow["user"]) {
  if (!user) {
    return null;
  }

  return {
    uid: user.uid,
    inGameName: user.inGameName,
    steamPersonaName: user.steamPersonaName,
    verificationLevel: user.verificationLevel,
    verified: user.verified,
    lastSeen: user.lastSeen?.toISOString() ?? null,
  };
}

function serializeGame(row: ReplayRow) {
  return {
    id: row.id,
    replayHash: row.replayHash,
    replayFile: row.replay_file,
    originalFilename: row.original_filename,
    parseIteration: row.parse_iteration,
    isFinal: row.is_final,
    parseSource: row.parse_source,
    parseReason: row.parse_reason,
    createdAt: row.createdAt.toISOString(),
    updatedAt: getRowActivityTime(row).toISOString(),
    playedOn: row.played_on?.toISOString() ?? null,
    map: row.map,
    gameVersion: row.game_version,
    gameType: row.game_type,
    duration: row.duration,
    gameDuration: row.game_duration,
    winner: row.winner,
    players: parsePlayers(row.players),
    eventTypes: row.event_types,
    keyEvents: row.key_events,
    disconnectDetected: row.disconnect_detected,
    user: serializeUser(row.user),
  };
}

export async function resolveFinalGameStatsIdForSessionKey(
  prisma: PrismaClient,
  rawSessionKey: string
) {
  const sessionCandidates = normalizeSessionCandidates(rawSessionKey);
  if (sessionCandidates.length === 0) {
    return null;
  }

  const latestFinal = await prisma.gameStats.findFirst({
    where: {
      ...buildSessionWhere(sessionCandidates),
      is_final: true,
    },
    orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
    },
  });

  return latestFinal?.id ?? null;
}

export async function loadLiveReplayDetailSnapshot(
  prisma: PrismaClient,
  rawSessionKey: string
): Promise<LiveReplayDetailSnapshot | null> {
  const sessionCandidates = normalizeSessionCandidates(rawSessionKey);
  if (sessionCandidates.length === 0) {
    return null;
  }

  const sessionWhere = buildSessionWhere(sessionCandidates);

  const [latestLive, latestFinal, historyRows] = await Promise.all([
    prisma.gameStats.findFirst({
      where: {
        ...sessionWhere,
        is_final: false,
        parse_iteration: {
          gt: 0,
        },
        parse_reason: {
          not: SUPERSEDED_PARSE_REASON,
        },
      },
      orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      select: GAME_SELECT,
    }),
    prisma.gameStats.findFirst({
      where: {
        ...sessionWhere,
        is_final: true,
      },
      orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { id: "desc" }],
      select: GAME_SELECT,
    }),
    prisma.gameStats.findMany({
      where: {
        ...sessionWhere,
        parse_reason: {
          not: SUPERSEDED_PARSE_REASON,
        },
      },
      orderBy: [{ timestamp: "desc" }, { createdAt: "desc" }, { parse_iteration: "desc" }, { id: "desc" }],
      take: 12,
      select: {
        id: true,
        replayHash: true,
        parse_iteration: true,
        is_final: true,
        parse_source: true,
        parse_reason: true,
        winner: true,
        duration: true,
        game_duration: true,
        players: true,
        event_types: true,
        key_events: true,
        disconnect_detected: true,
        createdAt: true,
        timestamp: true,
      },
    }),
  ]);

  if (!latestLive && !latestFinal) {
    return null;
  }

  const finalActivityAt = latestFinal ? getRowActivityTime(latestFinal).getTime() : null;
  const liveActivityAt = latestLive ? getRowActivityTime(latestLive).getTime() : null;
  const finalBeatsLive =
    finalActivityAt !== null && (liveActivityAt === null || finalActivityAt >= liveActivityAt);

  const selectedGame = (finalBeatsLive ? latestFinal : latestLive) || latestFinal || latestLive;
  if (!selectedGame) {
    return null;
  }

  const replayHashes = Array.from(
    new Set([latestLive?.replayHash, latestFinal?.replayHash].filter((value): value is string => Boolean(value)))
  );

  const parseAttempts = await prisma.replayParseAttempt.findMany({
    where: {
      OR: [
        ...sessionCandidates.map((value) => ({ originalFilename: value })),
        ...replayHashes.map((value) => ({ replayHash: value })),
        { gameStatsId: selectedGame.id },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  const telemetryRows = Array.from(
    new Map([selectedGame, ...historyRows].map((row) => [row.id, row])).values()
  );
  const telemetryTimes = telemetryRows
    .map((row) => getRowActivityTime(row).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
  const historyWindowSeconds =
    telemetryTimes.length >= 2
      ? Math.max(0, Math.round((telemetryTimes[telemetryTimes.length - 1] - telemetryTimes[0]) / 1000))
      : null;
  const latestKeyEvents = readKeyEvents(selectedGame.key_events);
  const latestEventTypes = readEventTypes(selectedGame.event_types);
  const uniqueEventTypes = new Set(
    telemetryRows.flatMap((row) => readEventTypes(row.event_types))
  );
  const hasScores = telemetryRows.some((row) => hasVisiblePlayerScore(parsePlayers(row.players)));
  const hasAchievements = telemetryRows.some((row) => readBooleanValue(readKeyEvents(row.key_events).has_achievements));
  const achievementShellCount = telemetryRows.reduce((count, row) => {
    const shellCount = readNumberValue(readKeyEvents(row.key_events).achievement_shell_count);
    return Math.max(count, shellCount ?? 0);
  }, 0);
  const hasAchievementShell = achievementShellCount > 0;
  const hasPostgame = telemetryRows.some((row) => readBooleanValue(readKeyEvents(row.key_events).postgame_available));
  const completionSource = readStringValue(latestKeyEvents.completion_source);

  return {
    sessionKey: sessionCandidates[0],
    mode: finalBeatsLive ? "final" : "live",
    finalGameId: latestFinal?.id ?? null,
    updatedAt: getRowActivityTime(selectedGame).toISOString(),
    telemetry: {
      historyRows: historyRows.length,
      historyWindowSeconds,
      latestChatCount: readNumberValue(latestKeyEvents.chat_count),
      latestEventTypeCount: latestEventTypes.length,
      uniqueEventTypeCount: uniqueEventTypes.size,
      hasScores,
      hasAchievements,
      hasAchievementShell,
      achievementShellCount,
      hasPostgame,
      completedSignal: readBooleanValue(latestKeyEvents.completed),
      completionSource,
    },
    game: serializeGame(selectedGame),
    history: historyRows.map((row) => ({
      id: row.id,
      replayHash: row.replayHash,
      parseIteration: row.parse_iteration,
      isFinal: row.is_final,
      parseSource: row.parse_source,
      parseReason: row.parse_reason,
      winner: row.winner,
      duration: row.duration ?? row.game_duration,
      updatedAt: (row.timestamp ?? row.createdAt).toISOString(),
      players: parsePlayers(row.players),
      eventTypes: readEventTypes(row.event_types),
      eventTypeCount: readEventTypes(row.event_types).length,
      chatCount: readNumberValue(readKeyEvents(row.key_events).chat_count),
      completed: readBooleanValue(readKeyEvents(row.key_events).completed),
      hasAchievements: readBooleanValue(readKeyEvents(row.key_events).has_achievements),
      postgameAvailable: readBooleanValue(readKeyEvents(row.key_events).postgame_available),
      disconnectDetected: row.disconnect_detected,
    })),
    parseAttempts: parseAttempts.map((attempt) => ({
      id: attempt.id,
      status: attempt.status,
      detail: attempt.detail,
      parseSource: attempt.parseSource,
      uploadMode: attempt.uploadMode,
      replayHash: attempt.replayHash,
      originalFilename: attempt.originalFilename,
      gameStatsId: attempt.gameStatsId,
      createdAt: attempt.createdAt.toISOString(),
    })),
  };
}
