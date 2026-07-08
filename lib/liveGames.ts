import { type ScheduledMatchTile, loadScheduledMatchTilesForLiveBoard } from "@/lib/challenges";
import { getFeaturedTournament } from "@/lib/communityStore";
import { type PrismaClient } from "@/lib/generated/prisma";
import { type LobbyMatchRow, type LobbyTournamentMatch } from "@/lib/lobby";
import {
  type LiveGameSession,
  loadLiveSessionSnapshot,
  normalizeSessionKey,
} from "@/lib/liveSessionSnapshot";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  resolveReliableReplayWinner,
} from "@/lib/unresolvedWatcherResult";
import { loadReplayReviewMarketSummaryMap } from "@/lib/replayReviewQueue";
import { toWatchStreamPayload, type WatchStreamPayload } from "@/lib/watchStreams";

type StreamedLiveGameSession = LiveGameSession & {
  streams: WatchStreamPayload[];
  primaryStream: WatchStreamPayload | null;
};

const BROWSER_STREAM_STALE_MS = 120_000;
const BROWSER_STREAM_ARCHIVE_MS = 6 * 60 * 60 * 1000;
const EXTERNAL_STREAM_STALE_MS = 20 * 60 * 1000;
const LIVE_GAMES_RECENT_MATCH_LIMIT = 24;
const LIVE_GAMES_COMPLETED_SESSION_DEPTH = 8;

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

  const legacyRecentMatches = await fetchRecentMatchesFrom("/api/game_stats?limit=160");
  return legacyRecentMatches.slice(0, LIVE_GAMES_RECENT_MATCH_LIMIT);
}


// AOE2WAR_COMPLETED_UPLOADER_HYDRATION
type CompletedUploaderHydrationUploader = {
  displayName: string;
  parseRows: number;
};

type CompletedUploaderHydrationSession = {
  id?: number | string | null;
  sessionKey?: string | null;
  completedAt?: string | Date | null;
  playedOn?: string | Date | null;
  createdAt?: string | Date | null;
  players?: Array<{ name?: string | null } | null> | null;
  uploaders?: CompletedUploaderHydrationUploader[] | null;
};

type CompletedUploaderHydrationRow = {
  display_name: string | null;
  parse_rows: number | string | bigint | null;
};

type CompletedUploaderHydrationPrisma = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
};

function completedUploaderDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date : null;
}

function completedUploaderPlayerNames(session: CompletedUploaderHydrationSession) {
  const names = new Set<string>();
  for (const player of session.players ?? []) {
    const name = player?.name?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

async function hydrateCompletedSessionUploaders<T extends CompletedUploaderHydrationSession>(
  prisma: CompletedUploaderHydrationPrisma,
  sessions: T[]
): Promise<T[]> {
  if (!sessions.length) return sessions;

  const hydrated: T[] = [];

  for (const session of sessions) {
    const existingUploaders = session.uploaders ?? [];
    if (existingUploaders.length >= 2) {
      hydrated.push(session);
      continue;
    }

    const playerNames = completedUploaderPlayerNames(session);
    const anchorDate =
      completedUploaderDate(session.completedAt) ??
      completedUploaderDate(session.playedOn) ??
      completedUploaderDate(session.createdAt);

    if (!anchorDate || playerNames.length < 2) {
      hydrated.push(session);
      continue;
    }

    try {
      const rows = await prisma.$queryRawUnsafe<CompletedUploaderHydrationRow[]>(
        `
          with replay_rows as (
            select
              coalesce(u.in_game_name, u.uid) as display_name,
              count(*)::int as parse_rows
            from replay_parse_attempts r
            left join users u on u.uid = r.user_uid
            where r.created_at >= $1::timestamptz - interval '120 minutes'
              and r.created_at <= $1::timestamptz + interval '20 minutes'
              and coalesce(u.in_game_name, u.uid) = any($2::text[])
              and coalesce(r.parse_source, '') in ('watcher_live', 'watcher_final')
              and coalesce(r.status, '') not ilike '%fail%'
            group by coalesce(u.in_game_name, u.uid)
          ),
          event_rows as (
            select
              coalesce(u.in_game_name, u.uid) as display_name,
              count(*)::int as parse_rows
            from watcher_client_events e
            left join users u on u.id = e.user_id
            where e.created_at >= $1::timestamptz - interval '120 minutes'
              and e.created_at <= $1::timestamptz + interval '20 minutes'
              and coalesce(u.in_game_name, u.uid) = any($2::text[])
              and (
                coalesce(e.parse_source, '') in ('watcher_live', 'watcher_final')
                or e.event_type in ('upload_succeeded', 'upload_success', 'parse_succeeded')
              )
            group by coalesce(u.in_game_name, u.uid)
          ),
          combined as (
            select * from replay_rows
            union all
            select * from event_rows
          )
          select
            display_name,
            sum(parse_rows)::int as parse_rows
          from combined
          where display_name is not null
          group by display_name
          order by sum(parse_rows) desc, display_name asc
        `,
        anchorDate.toISOString(),
        playerNames
      );

      const proofUploaders = rows
        .map((row) => ({
          displayName: String(row.display_name ?? "").trim(),
          parseRows: Number(row.parse_rows ?? 0),
        }))
        .filter((row) => row.displayName && row.parseRows > 0);

      hydrated.push(
        proofUploaders.length >= 2
          ? {
              ...session,
              uploaders: proofUploaders,
            }
          : session
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn("completed uploader hydration skipped", {
        sessionId: session.id,
        sessionKey: session.sessionKey,
        message,
      });
      hydrated.push(session);
    }
  }

  return hydrated;
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

  const displayedCompletedSessionsBase = dedupeStreamedSessions(
    [
      ...streamedCompletedSessions,
      ...fallbackRecentOutcomeSessions,
    ].sort(compareCompletedSessionRecency)
  ).slice(0, LIVE_GAMES_COMPLETED_SESSION_DEPTH);

  const hydratedCompletedSessions = await hydrateCompletedSessionUploaders(
    prisma,
    displayedCompletedSessionsBase
  );
  const reviewMarketSummaries = await loadReplayReviewMarketSummaryMap(
    prisma,
    hydratedCompletedSessions
      .filter((session) => Boolean(session.unresolvedResult))
      .map((session) => ({ id: session.id, sessionKey: session.sessionKey }))
  ).catch((error) => {
    console.warn("Failed to load replay review market summaries:", error);
    return new Map();
  });
  const displayedCompletedSessions = hydratedCompletedSessions.map((session) => ({
    ...session,
    reviewMarket: reviewMarketSummaries.get(session.id) ?? null,
  }));

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

function readMatchMapName(match: LobbyMatchRow) {
  const row = match as unknown as Record<string, unknown>;
  const map = row.map;
  if (map && typeof map === "object" && !Array.isArray(map)) {
    const name = normalizePublicReplayText(
      (map as Record<string, unknown>).name
    );
    if (name) return name;
  }
  return normalizePublicReplayText(
    readMatchText(match, "map_name", "mapName")
  );
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
  const truthPlayers = rawPlayers.filter(
    (player): player is { name?: unknown; winner?: unknown } =>
      Boolean(player) && typeof player === "object"
  );
  const winner =
    resolveReliableReplayWinner({
      winner: readMatchText(match, "winner", "winner_name", "winnerName"),
      players: truthPlayers,
      parseReason: readMatchText(match, "parse_reason", "parseReason") || null,
      keyEvents: row.key_events ?? row.keyEvents,
    })?.toLowerCase() ?? "";

  if (rawPlayers.length > 0) {
    return rawPlayers
      .map((player) => {
        const record = player as Record<string, unknown>;
        const name =
          normalizePublicReplayText(record.name ?? record.player ?? record.playerName) ?? "";
        if (!name) return null;
        return {
          name,
          winner: winner ? name.toLowerCase() === winner : null,
        };
      })
      .filter(Boolean) as LiveGameSession["players"];
  }

  const title = readMatchText(match, "title", "matchTitle", "name");
  const parts = title
    .split(/\s+vs\s+/i)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.slice(0, 2).flatMap((name) => {
    const resolvedName = normalizePublicReplayText(name);
    if (!resolvedName) return [];
    return [{
    name: resolvedName,
    winner: winner ? name.toLowerCase() === winner : false,
    }];
  });
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
  const rawWinner = readMatchText(match, "winner", "winner_name", "winnerName");
  const parseReason = readMatchText(match, "parse_reason", "parseReason") || null;
  const parseSource = readMatchText(match, "parse_source", "parseSource") || null;
  const mapName = readMatchMapName(match);

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
    mapName,
    durationSeconds: readMatchNumber(match, "duration_seconds", "durationSeconds"),
    originalFilename: originalFilename || replayFile || sessionKey,
    disconnectDetected: false,
    winner: resolveReliableReplayWinner({
      winner: rawWinner,
      players,
      parseReason,
      keyEvents: (match as unknown as Record<string, unknown>).key_events,
    }),
    parseReason,
    parseSource,
    unresolvedResult: classifyUnresolvedWatcherResult({
      winner: rawWinner,
      players,
      mapName,
      state: "completed",
      parseReason,
      parseSource,
      keyEvents: (match as unknown as Record<string, unknown>).key_events,
      watcherCount: 1,
    }),
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


function normalizeSessionDedupeKey(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  const basename = streamKeyBasename(trimmed).toLowerCase();
  const simplified = basename
    .replace(/\.(aoe2record|aoe2mpgame|zip|webm|mp4)$/i, "")
    .replace(/[^a-z0-9]+/g, "");

  if (!simplified || simplified.length < 6) return "";

  if (
    [
      "watcherstream",
      "watcherlive",
      "playersparsing",
      "battlecam",
      "maincast",
      "observer",
    ].includes(simplified)
  ) {
    return "";
  }

  return simplified;
}

function sessionDedupeKeys(session: StreamedLiveGameSession) {
  const values = [
    session.sessionKey,
    session.originalFilename,
    session.replayFile,
    streamKeyBasename(session.replayFile),
    ...session.streams.flatMap((stream) => [
      stream.sessionKey,
      stream.title,
      stream.url,
      stream.playbackUrl,
    ]),
  ];

  return Array.from(
    new Set(
      values
        .map((value) => normalizeSessionDedupeKey(value))
        .filter(Boolean)
    )
  );
}

function dedupeStreamedSessions(sessions: StreamedLiveGameSession[]) {
  const seen = new Set<string>();

  return sessions.filter((session) => {
    const keys = sessionDedupeKeys(session);
    const gameId = Number(session.id);
    const fallbackKey =
      Number.isFinite(gameId) && gameId > 0
        ? `game:${gameId}`
        : `session:${normalizeSessionDedupeKey(session.sessionKey) || session.completedAt || session.updatedAt || "unknown"}`;

    const finalKeys = keys.length > 0 ? keys : [fallbackKey];

    if (finalKeys.some((key) => seen.has(key))) {
      return false;
    }

    for (const key of finalKeys) {
      seen.add(key);
    }

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


function cleanStandaloneStreamTitle(value: string | null | undefined) {
  const title = String(value ?? "").replace(/\s+/g, " ").trim();

  if (!title) return "Watcher Live";
  if (/^platform:/i.test(title)) return "Watcher Live";
  if (/^aoe2war:\/\/stream/i.test(title)) return "Watcher Live";
  if (/^mp replay/i.test(title)) return "Players parsing";

  return title;
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

    const title = cleanStandaloneStreamTitle(stream.title || stream.playerLabel || stream.label);
    const nowIso = new Date().toISOString();
    const activityIso = stream.lastHeartbeatAt || stream.updatedAt || nowIso;

    sessions.push({
      id: -Math.abs(stream.id),
      sessionKey: stream.sessionKey,
      replayFile: title || stream.sessionKey,
      replayHash: `stream:${stream.id}`,
      parseIteration: 1,
      createdAt: stream.startedAt || stream.createdAt || activityIso,
      updatedAt: activityIso,
      completedAt: null,
      playedOn: stream.startedAt || stream.createdAt || null,
      mapName: null,
      durationSeconds: null,
      originalFilename: title || "Watcher Live",
      disconnectDetected: false,
      winner: null,
      parseReason: null,
      parseSource: "watcher_stream",
      unresolvedResult: null,
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
