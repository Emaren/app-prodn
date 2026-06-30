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
const LIVE_GAMES_RECENT_MATCH_LIMIT = 24;
const LIVE_GAMES_COMPLETED_SESSION_DEPTH = 3;

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

function normalizeRecentMatchPayload(payload: unknown): LobbyMatchRow[] {
  if (Array.isArray(payload)) {
    return payload as LobbyMatchRow[];
  }

  if (payload && typeof payload === "object") {
    const maybeMatches = (payload as { matches?: unknown }).matches;
    if (Array.isArray(maybeMatches)) {
      return maybeMatches as LobbyMatchRow[];
    }
  }

  return [];
}

async function fetchRecentMatchesFrom(pathname: string): Promise<LobbyMatchRow[]> {
  try {
    const response = await fetch(`http://127.0.0.1:3030${pathname}`, { cache: "no-store" });
    if (!response.ok) return [];

    const payload = (await response.json()) as unknown;
    return normalizeRecentMatchPayload(payload);
  } catch (error) {
    console.warn(`Failed to load recent matches from ${pathname}:`, error);
    return [];
  }
}

async function loadRecentMatches(): Promise<LobbyMatchRow[]> {
  const lobbyRecentMatches = await fetchRecentMatchesFrom("/api/lobby/recent-matches");
  if (lobbyRecentMatches.length > 0) {
    return lobbyRecentMatches.slice(0, LIVE_GAMES_RECENT_MATCH_LIMIT);
  }

  const legacyRecentMatches = await fetchRecentMatchesFrom("/api/game_stats");
  return legacyRecentMatches.slice(0, LIVE_GAMES_RECENT_MATCH_LIMIT);
}

async function loadLiveGamesSnapshotFresh(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
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
    .slice(0, LIVE_GAMES_RECENT_MATCH_LIMIT);

  const fallbackRecentOutcomeMatches = filteredRecentMatches.slice(0, LIVE_GAMES_COMPLETED_SESSION_DEPTH);

  const sessionKeys = [
    ...filteredActiveSessions.flatMap(sessionStreamKeys),
    ...filteredCompletedSessions.flatMap(sessionStreamKeys),
    ...fallbackRecentOutcomeMatches.flatMap(recentMatchStreamKeys),
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

  const fallbackRecentOutcomeSessions = compactNullable(
    fallbackRecentOutcomeMatches.map((match) => buildRecentOutcomeSession(match, streamsBySession))
  );

  const displayedCompletedSessions = dedupeStreamedSessions(
    [
      ...streamedCompletedSessions,
      ...fallbackRecentOutcomeSessions,
    ].sort(compareCompletedSessionRecency)
  ).slice(0, LIVE_GAMES_COMPLETED_SESSION_DEPTH);

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
  const players = extractRecentMatchPlayers(match);

  const streamsById = new Map<number, WatchStreamPayload>();
  for (const key of recentMatchStreamKeys(match)) {
    for (const stream of streamsBySession.get(key) ?? []) {
      streamsById.set(stream.id, stream);
    }
  }

  const streams = Array.from(streamsById.values()).sort(compareStreamsForPrimary);
  const primaryStream = selectPrimarySessionStream(streams, {
    players,
    state: "completed",
  });

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
    players,
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

  return sessions.filter((session) => {
    const gameId = Number(session.id);
    const key =
      Number.isFinite(gameId) && gameId > 0
        ? `game:${gameId}`
        : `session:${session.sessionKey || session.completedAt || session.updatedAt || "unknown"}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function completedSessionRecencyMs(session: StreamedLiveGameSession) {
  for (const value of [session.completedAt, session.updatedAt, session.playedOn, session.createdAt]) {
    if (!value) continue;

    const ms = new Date(value).getTime();
    if (Number.isFinite(ms)) {
      return ms;
    }
  }

  return 0;
}

function compareCompletedSessionRecency(left: StreamedLiveGameSession, right: StreamedLiveGameSession) {
  const recencyDiff = completedSessionRecencyMs(right) - completedSessionRecencyMs(left);
  if (recencyDiff !== 0) {
    return recencyDiff;
  }

  return Math.abs(right.id) - Math.abs(left.id);
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

function normalizeStreamIdentity(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function streamMatchesSessionPlayer(
  stream: WatchStreamPayload,
  session: Pick<LiveGameSession, "players">
) {
  const playerLabel = normalizeStreamIdentity(stream.playerLabel);
  if (!playerLabel) return false;

  return session.players.some((player) => {
    const playerName = normalizeStreamIdentity(player.name);
    return Boolean(
      playerName &&
        (playerName === playerLabel ||
          playerName.includes(playerLabel) ||
          playerLabel.includes(playerName))
    );
  });
}

function selectPrimarySessionStream(
  streams: WatchStreamPayload[],
  session: Pick<LiveGameSession, "players" | "state">
) {
  return (
    streams.find(
      (stream) =>
        stream.provider === "aoe2war" &&
        stream.status !== "ended" &&
        stream.chunkCount > 0
    ) ||
    streams.find(
      (stream) => stream.provider === "aoe2war" && stream.status !== "ended"
    ) ||
    streams.find(
      (stream) =>
        stream.provider === "aoe2war" &&
        stream.status === "ended" &&
        stream.chunkCount > 0
    ) ||
    (session.state === "live"
      ? streams.find((stream) => stream.isPrimary)
      : undefined) ||
    streams.find((stream) => streamMatchesSessionPlayer(stream, session)) ||
    null
  );
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
    const primaryStream = selectPrimarySessionStream(streams, session);

    return {
      ...session,
      streams,
      primaryStream,
    };
  });
}
type LiveGamesSnapshotCacheEntry = {
  expiresAt: number;
  staleUntil: number;
  refreshing: boolean;
  value: LiveGamesSnapshot;
};

const LIVE_GAMES_SNAPSHOT_CACHE_TTL_MS = 8000;
const LIVE_GAMES_SNAPSHOT_STALE_TTL_MS = 10 * 60 * 1000;
let liveGamesSnapshotCache: LiveGamesSnapshotCacheEntry | null = null;

export async function loadLiveGamesSnapshot(prisma: PrismaClient): Promise<LiveGamesSnapshot> {
  const now = Date.now();

  if (liveGamesSnapshotCache && liveGamesSnapshotCache.expiresAt > now) {
    return liveGamesSnapshotCache.value;
  }

  if (liveGamesSnapshotCache && liveGamesSnapshotCache.staleUntil > now) {
    if (!liveGamesSnapshotCache.refreshing) {
      liveGamesSnapshotCache.refreshing = true;

      void loadLiveGamesSnapshotFresh(prisma)
        .then((value) => {
          const refreshedAt = Date.now();

          liveGamesSnapshotCache = {
            expiresAt: refreshedAt + LIVE_GAMES_SNAPSHOT_CACHE_TTL_MS,
            staleUntil: refreshedAt + LIVE_GAMES_SNAPSHOT_STALE_TTL_MS,
            refreshing: false,
            value,
          };
        })
        .catch((error) => {
          console.error("Failed to refresh live games snapshot cache:", error);

          if (liveGamesSnapshotCache) {
            liveGamesSnapshotCache.refreshing = false;
          }
        });
    }

    return liveGamesSnapshotCache.value;
  }

  const value = await loadLiveGamesSnapshotFresh(prisma);

  liveGamesSnapshotCache = {
    expiresAt: now + LIVE_GAMES_SNAPSHOT_CACHE_TTL_MS,
    staleUntil: now + LIVE_GAMES_SNAPSHOT_STALE_TTL_MS,
    refreshing: false,
    value,
  };

  return value;
}
