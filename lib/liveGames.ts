import { type ScheduledMatchTile, loadScheduledMatchTilesForLiveBoard } from "@/lib/challenges";
import { getFeaturedTournament } from "@/lib/communityStore";
import { type PrismaClient } from "@/lib/generated/prisma";
import { type LobbyMatchRow, type LobbyTournamentMatch } from "@/lib/lobby";
import {
  type LiveGameSession,
  loadLiveSessionSnapshot,
  normalizeSessionKey,
} from "@/lib/liveSessionSnapshot";
import { toWatchStreamPayload, type WatchStreamPayload } from "@/lib/watchStreams";

type StreamedLiveGameSession = LiveGameSession & {
  streams: WatchStreamPayload[];
  primaryStream: WatchStreamPayload | null;
};

const BROWSER_STREAM_STALE_MS = 120_000;
const BROWSER_STREAM_ARCHIVE_MS = 6 * 60 * 60 * 1000;
const EXTERNAL_STREAM_STALE_MS = 20 * 60 * 1000;

export type LiveGamesSummary = {
  liveCount: number;
  readyCount: number;
  onDeckCount: number;
  updatedAt: string;
};

export type LiveGamesSnapshot = LiveGamesSummary & {
  tournament: {
    title: string;
    slug: string;
    format: string;
    status: string;
  } | null;
  activeSessions: StreamedLiveGameSession[];
  recentlyCompletedSessions: StreamedLiveGameSession[];
  liveMatches: LobbyTournamentMatch[];
  readyMatches: LobbyTournamentMatch[];
  scheduledMatches: ScheduledMatchTile[];
  recentMatches: LobbyMatchRow[];
};

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  try {
    const response = await fetch("http://127.0.0.1:3030/api/game_stats", { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as LobbyMatchRow[] | unknown;
    return Array.isArray(payload) ? payload.slice(0, 240) : [];
  } catch (error) {
    console.warn("Failed to load recent matches for live games:", error);
    return [];
  }
}

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const [tournament, recentMatches, sessionSnapshot] = await Promise.all([
    getFeaturedTournament(prisma),
    loadRecentMatches(),
    loadLiveSessionSnapshot(prisma),
  ]);

  const { activeSessions, recentlyCompletedSessions } = sessionSnapshot;
  let scheduledMatches: ScheduledMatchTile[] = [];
  let matchedActiveSessionKeys = new Set<string>();
  let matchedCompletedSessionKeys = new Set<string>();

  try {
    const scheduledSnapshot = await loadScheduledMatchTilesForLiveBoard(
      prisma,
      activeSessions,
      recentlyCompletedSessions
    );
    scheduledMatches = scheduledSnapshot.tiles;
    matchedActiveSessionKeys = scheduledSnapshot.matchedActiveSessionKeys;
    matchedCompletedSessionKeys = scheduledSnapshot.matchedCompletedSessionKeys;
  } catch (error) {
    console.warn("Failed to load scheduled matches for live games:", error);
  }

  const filteredActiveSessions = activeSessions.filter(
    (session) => !matchedActiveSessionKeys.has(session.sessionKey)
  );
  const filteredCompletedSessions = recentlyCompletedSessions.filter(
    (session) => !matchedCompletedSessionKeys.has(session.sessionKey)
  );

  const liveMatches = tournament.matches.filter((match) => match.status === "live");
  const readyMatches = tournament.matches.filter((match) => match.status === "ready");
  const recentlyCompletedKeys = new Set([
    ...filteredCompletedSessions.map((session) => session.sessionKey),
    ...matchedCompletedSessionKeys,
  ]);
  const filteredRecentMatches = recentMatches
    .filter((match) => !recentlyCompletedKeys.has(normalizeSessionKey(match)))
    .slice(0, 240);

  const fallbackRecentOutcomeMatch = filteredRecentMatches[0] ?? null;

  const sessionKeys = [
    ...filteredActiveSessions.flatMap(sessionStreamKeys),
    ...filteredCompletedSessions.flatMap(sessionStreamKeys),
    ...(fallbackRecentOutcomeMatch ? recentMatchStreamKeys(fallbackRecentOutcomeMatch) : []),
  ];
  const streamsBySession = await loadStreamsBySession(prisma, sessionKeys);
  const streamedActiveSessionBase = attachStreams(filteredActiveSessions, streamsBySession);
  const streamedCompletedSessionBase = attachStreams(filteredCompletedSessions, streamsBySession);

  const promotedLiveStreamSessions = streamedCompletedSessionBase
    .filter(sessionHasLiveNativeStream)
    .map((session) => ({
      ...session,
      state: "live" as const,
      completedAt: null,
    }));

  const standaloneLiveStreamSessions = await loadStandaloneLiveStreamSessions(
    prisma,
    new Set([
      ...streamedActiveSessionBase.flatMap(sessionStreamKeys),
      ...promotedLiveStreamSessions.flatMap(sessionStreamKeys),
    ])
  );

  const streamedActiveSessions = dedupeStreamedSessions([
    ...promotedLiveStreamSessions,
    ...standaloneLiveStreamSessions,
    ...streamedActiveSessionBase,
  ]);

  const activeSessionKeys = new Set(streamedActiveSessions.map((session) => session.sessionKey));
  const streamedCompletedSessions = streamedCompletedSessionBase.filter(
    (session) => !sessionHasLiveNativeStream(session) && !activeSessionKeys.has(session.sessionKey)
  );

  const fallbackRecentOutcomeSessions =
    streamedCompletedSessions.length === 0 && fallbackRecentOutcomeMatch
      ? compactNullable([buildRecentOutcomeSession(fallbackRecentOutcomeMatch, streamsBySession)])
      : [];

  const displayedCompletedSessions =
    streamedCompletedSessions.length > 0 ? streamedCompletedSessions : fallbackRecentOutcomeSessions;

  const displayedCompletedKeys = new Set(
    displayedCompletedSessions.map((session) => session.sessionKey)
  );

  const displayedRecentMatches = filteredRecentMatches.filter(
    (match) => !displayedCompletedKeys.has(normalizeSessionKey(match))
  );

  const scheduledLiveCount = scheduledMatches.filter((match) => match.displayState === "live").length;
  const scheduledReadyCount = scheduledMatches.filter(
    (match) =>
      [
        "accepted",
        "terms_accepted",
        "creator_funded",
        "opponent_funded",
        "funded",
        "checkin_open",
        "left_checked_in",
        "right_checked_in",
        "ready",
      ].includes(match.displayState)
  ).length;
  const scheduledOnDeckCount = scheduledMatches.filter((match) =>
    [
      "proposed",
      "pending",
      "accepted",
      "terms_accepted",
      "creator_funded",
      "opponent_funded",
      "funded",
      "checkin_open",
      "left_checked_in",
      "right_checked_in",
      "ready",
    ].includes(match.displayState)
  ).length;

  return {
    liveCount: liveMatches.length + streamedActiveSessions.length + scheduledLiveCount,
    readyCount: readyMatches.length + scheduledReadyCount,
    onDeckCount: readyMatches.length + scheduledOnDeckCount,
    updatedAt: new Date().toISOString(),
    tournament: tournament.isFallback
      ? null
      : {
          title: tournament.title,
          slug: tournament.slug,
          format: tournament.format,
          status: tournament.status,
        },
    activeSessions: streamedActiveSessions,
    recentlyCompletedSessions: displayedCompletedSessions,
    liveMatches,
    readyMatches,
    scheduledMatches,
    recentMatches: displayedRecentMatches,
  };
}

async function loadStreamsBySession(prisma: PrismaClient, sessionKeys: string[]) {
  const uniqueSessionKeys = Array.from(new Set(sessionKeys.filter(Boolean)));
  if (uniqueSessionKeys.length === 0) {
    return new Map<string, WatchStreamPayload[]>();
  }

  const rows = await prisma.gameWatchStream
    .findMany({
      where: {
        sessionKey: {
          in: uniqueSessionKeys,
        },
        status: {
          not: "removed",
        },
      },
      orderBy: [
        { isPrimary: "desc" },
        { lastHeartbeatAt: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
    })
    .catch((error) => {
      console.warn("Failed to load streams for live games:", error);
      return [];
    });

  const streamsBySession = new Map<string, WatchStreamPayload[]>();
  for (const row of rows) {
    const stream = toWatchStreamPayload(row);
    if (!isVisibleStream(stream)) {
      continue;
    }
    const bucket = streamsBySession.get(stream.sessionKey) ?? [];
    bucket.push(stream);
    streamsBySession.set(stream.sessionKey, bucket);
  }

  return streamsBySession;
}

function isVisibleStream(stream: WatchStreamPayload) {
  if (stream.sourceType !== "browser" && stream.provider !== "aoe2war") {
    if (stream.status === "removed") return false;
    if (!["starting", "live"].includes(stream.status)) return true;
    const lastSeenMs = new Date(stream.updatedAt).getTime();
    return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= EXTERNAL_STREAM_STALE_MS;
  }

  if (!["starting", "live", "ended"].includes(stream.status)) {
    return false;
  }

  const lastSeen = stream.status === "ended"
    ? stream.endedAt || stream.updatedAt
    : stream.lastHeartbeatAt || stream.updatedAt;
  const lastSeenMs = new Date(lastSeen).getTime();
  const maxAge = stream.status === "ended" ? BROWSER_STREAM_ARCHIVE_MS : BROWSER_STREAM_STALE_MS;
  return Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs <= maxAge;
}

function sessionHasLiveNativeStream(session: StreamedLiveGameSession) {
  return session.streams.some(
    (stream) =>
      stream.provider === "aoe2war" &&
      ["starting", "live"].includes(stream.status) &&
      stream.chunkCount > 0
  );
}

function compactNullable<T>(items: Array<T | null | undefined>) {
  return items.filter(Boolean) as T[];
}

function readMatchText(match: LobbyMatchRow, ...keys: string[]) {
  const row = match as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function readMatchNumber(match: LobbyMatchRow, ...keys: string[]) {
  const row = match as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function recentMatchStreamKeys(match: LobbyMatchRow) {
  const row = match as unknown as Record<string, unknown>;
  const values = [
    normalizeSessionKey(match),
    row.sessionKey,
    row.session_key,
    row.originalFilename,
    row.original_filename,
    row.replayFile,
    row.replay_file,
  ];

  return Array.from(
    new Set(
      values
        .flatMap((value) => {
          const text = typeof value === "string" ? value.trim() : "";
          return text ? [text, streamKeyBasename(text)] : [];
        })
        .filter(Boolean)
    )
  );
}

function extractRecentMatchPlayers(match: LobbyMatchRow): LiveGameSession["players"] {
  const row = match as unknown as Record<string, unknown>;
  const rawPlayers = Array.isArray(row.players) ? row.players : [];
  const winner = readMatchText(match, "winner", "winner_name", "winnerName").toLowerCase();

  if (rawPlayers.length > 0) {
    return rawPlayers
      .map((player) => {
        const record = player as Record<string, unknown>;
        const name = String(record.name ?? record.player ?? record.playerName ?? "").trim();
        if (!name) return null;
        return {
          name,
          winner: winner ? name.toLowerCase() === winner : Boolean(record.winner),
        };
      })
      .filter(Boolean) as LiveGameSession["players"];
  }

  const title = readMatchText(match, "title", "matchTitle", "name");
  const parts = title
    .split(/\s+vs\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.slice(0, 2).map((name) => ({
    name,
    winner: winner ? name.toLowerCase() === winner : false,
  }));
}

function buildRecentOutcomeSession(
  match: LobbyMatchRow,
  streamsBySession: Map<string, WatchStreamPayload[]>
): StreamedLiveGameSession | null {
  const sessionKey = normalizeSessionKey(match);
  if (!sessionKey) return null;

  const streamsById = new Map<number, WatchStreamPayload>();
  for (const key of recentMatchStreamKeys(match)) {
    for (const stream of streamsBySession.get(key) ?? []) {
      streamsById.set(stream.id, stream);
    }
  }

  const streams = Array.from(streamsById.values()).sort(compareStreamsForPrimary);
  const primaryStream =
    streams.find((stream) => stream.provider === "aoe2war" && stream.chunkCount > 0) ||
    streams.find((stream) => stream.isPrimary) ||
    streams[0] ||
    null;

  const id = readMatchNumber(match, "id", "game_stats_id", "gameStatsId") ?? -1;
  const playedAt =
    readMatchText(match, "played_on", "playedOn", "timestamp", "created_at", "createdAt") ||
    new Date().toISOString();
  const originalFilename = readMatchText(match, "original_filename", "originalFilename", "filename");
  const replayFile = readMatchText(match, "replay_file", "replayFile") || originalFilename || null;

  return {
    id,
    sessionKey,
    replayFile,
    replayHash: readMatchText(match, "replay_hash", "replayHash") || `recent:${id}`,
    parseIteration: readMatchNumber(match, "parse_iteration", "parseIteration") ?? 1,
    createdAt: playedAt,
    updatedAt: readMatchText(match, "updated_at", "updatedAt") || playedAt,
    completedAt: playedAt,
    playedOn: playedAt,
    mapName: readMatchText(match, "map", "map_name", "mapName") || null,
    durationSeconds: readMatchNumber(match, "duration_seconds", "durationSeconds"),
    originalFilename: originalFilename || replayFile || sessionKey,
    disconnectDetected: false,
    winner: readMatchText(match, "winner", "winner_name", "winnerName") || null,
    state: "completed",
    players: extractRecentMatchPlayers(match),
    uploaders: [],
    watcherCount: 1,
    parseRows: 1,
    coverageLevel: "single",
    uploader: null,
    streams,
    primaryStream,
  };
}

function dedupeStreamedSessions(sessions: StreamedLiveGameSession[]) {
  const seen = new Set<string>();
  const result: StreamedLiveGameSession[] = [];

  for (const session of sessions) {
    if (seen.has(session.sessionKey)) continue;
    seen.add(session.sessionKey);
    result.push(session);
  }

  return result;
}

function parseStreamPlayers(title: string): LiveGameSession["players"] {
  const parts = title
    .split(/\s+vs\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return [];

  return parts.slice(0, 2).map((name) => ({
    name,
    winner: null,
  }));
}

async function loadStandaloneLiveStreamSessions(
  prisma: PrismaClient,
  knownActiveSessionKeys: Set<string>
): Promise<StreamedLiveGameSession[]> {
  const staleCutoff = new Date(Date.now() - BROWSER_STREAM_STALE_MS);

  const rows = await prisma.gameWatchStream
    .findMany({
      where: {
        provider: "aoe2war",
        sourceType: {
          in: ["watcher_native", "browser"],
        },
        status: {
          in: ["starting", "live"],
        },
        chunkCount: {
          gt: 0,
        },
        OR: [
          {
            lastHeartbeatAt: {
              gte: staleCutoff,
            },
          },
          {
            updatedAt: {
              gte: staleCutoff,
            },
          },
        ],
      },
      orderBy: [
        { isPrimary: "desc" },
        { lastHeartbeatAt: "desc" },
        { updatedAt: "desc" },
        { id: "desc" },
      ],
      take: 8,
    })
    .catch((error) => {
      console.warn("Failed to load standalone live streams:", error);
      return [];
    });

  const sessions: StreamedLiveGameSession[] = [];

  for (const row of rows) {
    const stream = toWatchStreamPayload(row);
    if (!isVisibleStream(stream)) continue;
    if (!stream.sessionKey || knownActiveSessionKeys.has(stream.sessionKey)) continue;

    const title = stream.title || stream.sessionKey || stream.label || "Watcher Live";
    const nowIso = new Date().toISOString();
    const activityIso = stream.lastHeartbeatAt || stream.updatedAt || nowIso;

    sessions.push({
      id: -Math.abs(stream.id),
      sessionKey: stream.sessionKey,
      replayFile: stream.sessionKey,
      replayHash: `stream:${stream.id}`,
      parseIteration: 1,
      createdAt: stream.startedAt || stream.createdAt || activityIso,
      updatedAt: activityIso,
      completedAt: null,
      playedOn: stream.startedAt || stream.createdAt || null,
      mapName: null,
      durationSeconds: null,
      originalFilename: stream.sessionKey,
      disconnectDetected: false,
      winner: null,
      state: "live",
      players: parseStreamPlayers(title),
      uploaders: [],
      watcherCount: 1,
      parseRows: 1,
      coverageLevel: "single",
      uploader: null,
      streams: [stream],
      primaryStream: stream,
    });
  }

  return sessions;
}

function streamKeyBasename(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.split(/[\\/]/).filter(Boolean).pop() || trimmed;
}

function sessionStreamKeys(
  session: Pick<LiveGameSession, "sessionKey" | "originalFilename" | "replayFile">
) {
  return Array.from(
    new Set(
      [
        session.sessionKey,
        session.originalFilename,
        session.replayFile,
        streamKeyBasename(session.replayFile),
      ]
        .map((value) => value?.trim() || "")
        .filter(Boolean)
    )
  );
}

function compareStreamsForPrimary(left: WatchStreamPayload, right: WatchStreamPayload) {
  const score = (stream: WatchStreamPayload) => {
    let value = 0;
    if (stream.isPrimary) value += 1000;
    if (stream.provider === "aoe2war") value += 500;
    if (["starting", "live"].includes(stream.status)) value += 250;
    if (stream.chunkCount > 0) value += 100;
    value += Math.min(stream.chunkCount || 0, 99);
    return value;
  };

  const scoreDiff = score(right) - score(left);
  if (scoreDiff !== 0) return scoreDiff;

  const rightSeen = new Date(right.lastHeartbeatAt || right.updatedAt).getTime();
  const leftSeen = new Date(left.lastHeartbeatAt || left.updatedAt).getTime();
  return rightSeen - leftSeen;
}

function attachStreams(
  sessions: LiveGameSession[],
  streamsBySession: Map<string, WatchStreamPayload[]>
): StreamedLiveGameSession[] {
  return sessions.map((session) => {
    const streamsById = new Map<number, WatchStreamPayload>();

    for (const key of sessionStreamKeys(session)) {
      for (const stream of streamsBySession.get(key) ?? []) {
        streamsById.set(stream.id, stream);
      }
    }

    const streams = Array.from(streamsById.values()).sort(compareStreamsForPrimary);
    const primaryStream =
      streams.find((stream) => stream.provider === "aoe2war" && stream.status !== "ended" && stream.chunkCount > 0) ||
      streams.find((stream) => stream.provider === "aoe2war" && stream.status !== "ended") ||
      streams.find((stream) => stream.provider === "aoe2war" && stream.status === "ended") ||
      streams.find((stream) => stream.isPrimary) ||
      streams[0] ||
      null;

    return {
      ...session,
      streams,
      primaryStream,
    };
  });
}
