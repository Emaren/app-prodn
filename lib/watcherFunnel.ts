import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WATCHER_PARSE_SOURCES = ["watcher_live", "watcher_final"] as const;
const RECENT_EVENT_SCAN_LIMIT = 5000;
const SESSION_ROW_LIMIT = 50;
const FOCUS_USER_EVENT_LIMIT = 120;
const JULIO_UID_PREFIX = "u_79ce46af3d";
const SUPPORT_USER_TILE_LIMIT = 10;
const SUPPORT_USER_TARGETS: WatcherSupportUserTarget[] = [
  {
    label: "Julio Alvarez",
    uidPrefix: JULIO_UID_PREFIX,
    nameMatches: ["Julio"],
    tileKind: "dedicated",
  },
  {
    label: "Emaren",
    nameMatches: ["Emaren"],
    tileKind: "dedicated",
  },
];
const WATCHER_FAILURE_EVENTS = [
  "upload_failed",
  "parse_failed",
  "watcher_error",
  "watcher_update_error",
  "batch_upload_failed",
  "batch_upload_file_failed",
  "stream_error",
  "stream_track_ended",
  "stream_recorder_error",
  "stream_chunk_failed",
  "stream_heartbeat_failed",
];
const STREAM_EVENTS = [
  "stream_sources_listed",
  "stream_capture_requested",
  "stream_preview_started",
  "stream_source_ready",
  "stream_started",
  "stream_chunk_uploaded",
  "stream_chunk_dropped",
  "stream_heartbeat",
  "stream_stopped",
  "stream_track_ended",
  "stream_recorder_error",
  "stream_chunk_failed",
  "stream_heartbeat_failed",
  "stream_error",
];
const STREAM_FAILURE_EVENTS = [
  "stream_track_ended",
  "stream_recorder_error",
  "stream_chunk_failed",
  "stream_heartbeat_failed",
  "stream_error",
];

export type WatcherFunnelWindowKey = "allTime" | "last30Days" | "last7Days" | "last24Hours";

export type WatcherFunnelWindowCounts = Record<WatcherFunnelWindowKey, number>;

export type WatcherFunnelStage = {
  key: string;
  label: string;
  description: string;
  source: string;
  status: "tracked" | "partial";
  counts: WatcherFunnelWindowCounts;
  note?: string;
};

export type WatcherFunnelSessionRow = {
  key: string;
  watcherId: string | null;
  sessionId: string | null;
  userId: number | null;
  userUid: string | null;
  appVersion: string | null;
  platform: string | null;
  firstSeen: string;
  lastSeen: string;
  totalEvents: number;
  lastEventType: string;
  heartbeatCount: number;
  replayDetections: number;
  uploadsStarted: number;
  uploadsFinished: number;
  uploadsFailed: number;
  parsedGameCount: number | null;
  eventCounts: Record<string, number>;
};

export type WatcherFocusUserEvent = {
  createdAt: string;
  eventType: string;
  appVersion: string | null;
  platform: string | null;
  watcherId: string | null;
  sessionId: string | null;
  replayHash: string | null;
  replayFile: string | null;
  parseSource: string | null;
  parseReason: string | null;
  finalityStatus: string | null;
  finalAccepted: boolean | null;
  shouldSettle: boolean | null;
  reason: string | null;
  detail: string | null;
  errorMessage: string | null;
  fileSizeBytes: number | null;
  streamId: string | null;
  streamSessionKey: string | null;
  streamSourceType: string | null;
  streamSourceName: string | null;
  streamSourceKind: string | null;
  streamCaptureMode: string | null;
  streamModeDetail: string | null;
  streamVideoBitrate: number | null;
  streamChunkTimesliceMs: number | null;
  streamSequence: number | null;
  streamBlobSize: number | null;
  streamUploadQueueLength: number | null;
  streamLastUploadLatencyMs: number | null;
  streamDroppedChunks: number | null;
  streamHeartbeatFailures: number | null;
};

export type WatcherFocusUserStreamDiagnostics = {
  status: "live_or_recent" | "idle" | "issue";
  sourceType: string | null;
  sourceName: string | null;
  sourceKind: string | null;
  captureMode: string | null;
  modeDetail: string | null;
  videoBitrate: number | null;
  chunkTimesliceMs: number | null;
  streamId: string | null;
  sessionKey: string | null;
  lastEventAt: string | null;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastChunkAt: string | null;
  lastHeartbeatAt: string | null;
  lastErrorAt: string | null;
  chunkEvents: number;
  droppedChunkEvents: number;
  heartbeatEvents: number;
  failureCount: number;
  lastChunkBytes: number | null;
  uploadFailures: number | null;
  uploadQueueLength: number | null;
  lastUploadLatencyMs: number | null;
  droppedChunks: number | null;
  heartbeatFailures: number | null;
  lastErrorMessage: string | null;
  lastDetail: string | null;
};

export type WatcherFocusUserDiagnostics = {
  label: string;
  uidPrefix: string | null;
  tileKind: "dedicated" | "recent";
  userFound: boolean;
  user: {
    id: number;
    uid: string;
    inGameName: string | null;
    steamPersonaName: string | null;
  } | null;
  latestStatus: "online" | "watching" | "idle" | "no_telemetry";
  lastSeenAt: string | null;
  lastHeartbeatAt: string | null;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  lastAuthAt: string | null;
  lastReplayDetectedAt: string | null;
  lastUploadAt: string | null;
  lastFailureAt: string | null;
  activeWatcherId: string | null;
  activeSessionId: string | null;
  appVersion: string | null;
  platform: string | null;
  totalEvents: number;
  failureCount: number;
  finalCandidateDeferrals: number;
  lastFinalityStatus: string | null;
  stream: WatcherFocusUserStreamDiagnostics | null;
  eventCounts: Record<string, number>;
  recentEvents: WatcherFocusUserEvent[];
};

export type WatcherFunnelUnavailableMetric = {
  label: string;
  reason: string;
};

export type WatcherFunnelDashboardData = {
  generatedAt: string;
  windows: Array<{
    key: WatcherFunnelWindowKey;
    label: string;
    description: string;
  }>;
  stages: WatcherFunnelStage[];
  supplementalMetrics: Array<{
    key: string;
    label: string;
    description: string;
    counts: WatcherFunnelWindowCounts;
  }>;
  sessionRows: WatcherFunnelSessionRow[];
  focusUser: WatcherFocusUserDiagnostics;
  supportUsers: WatcherFocusUserDiagnostics[];
  recentEventScanLimit: number;
  sessionRowLimit: number;
  unknownRecentEvents: number;
  unavailableMetrics: WatcherFunnelUnavailableMetric[];
  operatorNotes: string[];
};

type StableKeyPreference = "watcher" | "session";

type RecentWatcherEventRow = {
  createdAt: Date;
  userId: number | null;
  userUid: string | null;
  eventType: string;
  appVersion: string | null;
  platform: string | null;
  watcherId: string | null;
  sessionId: string | null;
  replayHash: string | null;
};

type FocusWatcherEventRow = RecentWatcherEventRow & {
  replayFile: string | null;
  parseSource: string | null;
  parseReason: string | null;
  metadata: Prisma.JsonValue | null;
};

type WatcherSupportUserTarget = {
  label: string;
  uidPrefix?: string;
  nameMatches?: string[];
  userId?: number | null;
  userUid?: string | null;
  tileKind: "dedicated" | "recent";
};

type SessionAccumulator = {
  key: string;
  watcherId: string | null;
  sessionId: string | null;
  userId: number | null;
  userUid: string | null;
  appVersion: string | null;
  platform: string | null;
  firstSeen: Date;
  lastSeen: Date;
  totalEvents: number;
  lastEventType: string;
  heartbeatCount: number;
  replayDetections: number;
  uploadsStarted: number;
  uploadsFinished: number;
  uploadsFailed: number;
  eventCounts: Record<string, number>;
  replayHashes: Set<string>;
};

function buildWindowDefinitions(now: Date) {
  const time = now.getTime();

  return [
    {
      key: "allTime" as const,
      label: "All time",
      description: "Every stored row.",
      cutoff: null,
    },
    {
      key: "last30Days" as const,
      label: "Last 30 days",
      description: "Rows created in the last 30 days.",
      cutoff: new Date(time - 30 * ONE_DAY_MS),
    },
    {
      key: "last7Days" as const,
      label: "Last 7 days",
      description: "Rows created in the last 7 days.",
      cutoff: new Date(time - 7 * ONE_DAY_MS),
    },
    {
      key: "last24Hours" as const,
      label: "Last 24 hours",
      description: "Rows created in the last 24 hours.",
      cutoff: new Date(time - ONE_DAY_MS),
    },
  ];
}

function numberFromCount(value: bigint | number | string | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  return 0;
}

function metadataObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, Prisma.JsonValue>;
}

function metadataString(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = metadataObject(metadata)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function metadataBoolean(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = metadataObject(metadata)[key];
  return typeof value === "boolean" ? value : null;
}

function metadataNumber(metadata: Prisma.JsonValue | null | undefined, key: string) {
  const value = metadataObject(metadata)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function firstEventAt(events: FocusWatcherEventRow[], eventTypes: string[]) {
  const eventTypeSet = new Set(eventTypes);
  return events.find((event) => eventTypeSet.has(event.eventType))?.createdAt ?? null;
}

function countEvents(events: FocusWatcherEventRow[], eventTypes: string[]) {
  const eventTypeSet = new Set(eventTypes);
  return events.filter((event) => eventTypeSet.has(event.eventType)).length;
}

function deriveFocusStatus(events: FocusWatcherEventRow[]) {
  if (events.length === 0) {
    return "no_telemetry" as const;
  }

  const lastHeartbeat = firstEventAt(events, ["heartbeat"]);
  if (lastHeartbeat && Date.now() - lastHeartbeat.getTime() <= 2.5 * 60 * 1000) {
    return "online" as const;
  }

  const lastStart = firstEventAt(events, ["watching_started", "watcher_started"]);
  const lastStop = firstEventAt(events, ["watching_stopped", "watcher_stopped"]);
  if (lastStart && (!lastStop || lastStart > lastStop)) {
    return "watching" as const;
  }

  return "idle" as const;
}

function compactEventCounts(events: FocusWatcherEventRow[]) {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
    return counts;
  }, {});
}

function firstMetadataString(events: FocusWatcherEventRow[], key: string) {
  return events.map((event) => metadataString(event.metadata, key)).find(Boolean) ?? null;
}

function firstMetadataNumber(events: FocusWatcherEventRow[], key: string) {
  return events.map((event) => metadataNumber(event.metadata, key)).find((value) => value !== null) ?? null;
}

function buildStreamDiagnostics(events: FocusWatcherEventRow[]): WatcherFocusUserStreamDiagnostics | null {
  const streamEvents = events.filter((event) => STREAM_EVENTS.includes(event.eventType));
  if (streamEvents.length === 0) {
    return null;
  }

  const lastStartedAt = firstEventAt(streamEvents, ["stream_started"]);
  const lastStoppedAt = firstEventAt(streamEvents, ["stream_stopped"]);
  const lastErrorAt = firstEventAt(streamEvents, STREAM_FAILURE_EVENTS);
  const hasActiveStart = Boolean(lastStartedAt && (!lastStoppedAt || lastStartedAt > lastStoppedAt));
  const hasCurrentIssue = Boolean(lastErrorAt && (!lastStartedAt || lastErrorAt >= lastStartedAt));
  const lastErrorEvent = streamEvents.find((event) => STREAM_FAILURE_EVENTS.includes(event.eventType)) ?? null;

  return {
    status: hasCurrentIssue ? "issue" : hasActiveStart ? "live_or_recent" : "idle",
    sourceType: firstMetadataString(streamEvents, "sourceType"),
    sourceName: firstMetadataString(streamEvents, "sourceName"),
    sourceKind: firstMetadataString(streamEvents, "sourceKind"),
    captureMode: firstMetadataString(streamEvents, "captureMode"),
    modeDetail: firstMetadataString(streamEvents, "modeDetail"),
    videoBitrate: firstMetadataNumber(streamEvents, "videoBitrate"),
    chunkTimesliceMs: firstMetadataNumber(streamEvents, "chunkTimesliceMs"),
    streamId: firstMetadataString(streamEvents, "streamId"),
    sessionKey: firstMetadataString(streamEvents, "sessionKey"),
    lastEventAt: isoOrNull(streamEvents[0]?.createdAt),
    lastStartedAt: isoOrNull(lastStartedAt),
    lastStoppedAt: isoOrNull(lastStoppedAt),
    lastChunkAt: isoOrNull(firstEventAt(streamEvents, ["stream_chunk_uploaded"])),
    lastHeartbeatAt: isoOrNull(firstEventAt(streamEvents, ["stream_heartbeat"])),
    lastErrorAt: isoOrNull(lastErrorAt),
    chunkEvents: countEvents(streamEvents, ["stream_chunk_uploaded"]),
    droppedChunkEvents: countEvents(streamEvents, ["stream_chunk_dropped"]),
    heartbeatEvents: countEvents(streamEvents, ["stream_heartbeat"]),
    failureCount: countEvents(streamEvents, STREAM_FAILURE_EVENTS),
    lastChunkBytes: firstMetadataNumber(streamEvents, "lastChunkBytes") ?? firstMetadataNumber(streamEvents, "blobSize"),
    uploadFailures: firstMetadataNumber(streamEvents, "uploadFailures"),
    uploadQueueLength: firstMetadataNumber(streamEvents, "uploadQueueLength"),
    lastUploadLatencyMs: firstMetadataNumber(streamEvents, "lastUploadLatencyMs") ?? firstMetadataNumber(streamEvents, "uploadLatencyMs"),
    droppedChunks: firstMetadataNumber(streamEvents, "droppedChunks"),
    heartbeatFailures: firstMetadataNumber(streamEvents, "heartbeatFailures"),
    lastErrorMessage: lastErrorEvent ? metadataString(lastErrorEvent.metadata, "errorMessage") : null,
    lastDetail: firstMetadataString(streamEvents, "detail"),
  };
}

function stableClientKeySql(preference: StableKeyPreference) {
  const userIdKey = Prisma.sql`CASE WHEN user_id IS NOT NULL THEN 'user:' || user_id::text END`;
  const userUidKey = Prisma.sql`CASE WHEN user_uid IS NOT NULL THEN 'uid:' || user_uid END`;
  const watcherKey = Prisma.sql`CASE WHEN watcher_id IS NOT NULL AND watcher_id <> '' THEN 'watcher:' || watcher_id END`;
  const sessionKey = Prisma.sql`CASE WHEN session_id IS NOT NULL AND session_id <> '' THEN 'session:' || session_id END`;

  if (preference === "session") {
    return Prisma.sql`COALESCE(${sessionKey}, ${watcherKey}, ${userIdKey}, ${userUidKey})`;
  }

  return Prisma.sql`COALESCE(${watcherKey}, ${sessionKey}, ${userIdKey}, ${userUidKey})`;
}

function resolveStableClientKey(
  row: RecentWatcherEventRow,
  preference: StableKeyPreference
) {
  const watcherKey = row.watcherId ? `watcher:${row.watcherId}` : null;
  const sessionKey = row.sessionId ? `session:${row.sessionId}` : null;
  const userIdKey = row.userId ? `user:${row.userId}` : null;
  const userUidKey = row.userUid ? `uid:${row.userUid}` : null;

  if (preference === "session") {
    return sessionKey ?? watcherKey ?? userIdKey ?? userUidKey;
  }

  return watcherKey ?? sessionKey ?? userIdKey ?? userUidKey;
}

async function countDistinctClientKeys(
  prisma: PrismaClient,
  eventTypes: readonly string[],
  cutoff: Date | null,
  preference: StableKeyPreference
) {
  const keyExpression = stableClientKeySql(preference);
  const rows = await prisma.$queryRaw<Array<{ value: bigint | number | string | null }>>(Prisma.sql`
    SELECT COUNT(DISTINCT ${keyExpression})::bigint AS value
    FROM watcher_client_events
    WHERE event_type IN (${Prisma.join([...eventTypes])})
      ${cutoff ? Prisma.sql`AND created_at >= ${cutoff}` : Prisma.empty}
      AND ${keyExpression} IS NOT NULL
  `);

  return numberFromCount(rows[0]?.value);
}

async function countClientEvents(
  prisma: PrismaClient,
  eventTypes: readonly string[],
  cutoff: Date | null
) {
  return prisma.watcherClientEvent.count({
    where: {
      eventType: { in: [...eventTypes] },
      ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
    },
  });
}

async function countDownloads(prisma: PrismaClient, cutoff: Date | null) {
  if (!cutoff) {
    return prisma.watcherDownloadEvent.count();
  }

  return prisma.watcherDownloadEvent.count({
    where: { createdAt: { gte: cutoff } },
  });
}

async function countParsedWatcherGames(prisma: PrismaClient, cutoff: Date | null) {
  return prisma.gameStats.count({
    where: {
      parse_source: { in: [...WATCHER_PARSE_SOURCES] },
      ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
    },
  });
}

async function loadWindowCounts(
  windows: ReturnType<typeof buildWindowDefinitions>,
  loader: (cutoff: Date | null) => Promise<number>
): Promise<WatcherFunnelWindowCounts> {
  const values = await Promise.all(windows.map((window) => loader(window.cutoff)));

  return windows.reduce(
    (counts, window, index) => ({
      ...counts,
      [window.key]: values[index] ?? 0,
    }),
    {} as WatcherFunnelWindowCounts
  );
}

function applyEventToSession(group: SessionAccumulator, row: RecentWatcherEventRow) {
  group.totalEvents += 1;
  group.eventCounts[row.eventType] = (group.eventCounts[row.eventType] ?? 0) + 1;

  if (row.replayHash) {
    group.replayHashes.add(row.replayHash);
  }

  if (row.eventType === "heartbeat") group.heartbeatCount += 1;
  if (row.eventType === "replay_detected") group.replayDetections += 1;
  if (row.eventType === "upload_attempted") group.uploadsStarted += 1;
  if (row.eventType === "upload_succeeded") group.uploadsFinished += 1;
  if (row.eventType === "upload_failed") group.uploadsFailed += 1;

  if (row.createdAt < group.firstSeen) {
    group.firstSeen = row.createdAt;
  }

  if (row.createdAt >= group.lastSeen) {
    group.lastSeen = row.createdAt;
    group.lastEventType = row.eventType;
    group.appVersion = row.appVersion ?? group.appVersion;
    group.platform = row.platform ?? group.platform;
  }

  group.watcherId = group.watcherId ?? row.watcherId;
  group.sessionId = group.sessionId ?? row.sessionId;
  group.userId = group.userId ?? row.userId;
  group.userUid = group.userUid ?? row.userUid;
  group.appVersion = group.appVersion ?? row.appVersion;
  group.platform = group.platform ?? row.platform;
}

async function loadRecentSessionRows(
  prisma: PrismaClient,
  cutoff: Date
): Promise<{
  rows: WatcherFunnelSessionRow[];
  unknownRecentEvents: number;
}> {
  const recentEvents = await prisma.watcherClientEvent.findMany({
    where: { createdAt: { gte: cutoff } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: RECENT_EVENT_SCAN_LIMIT,
    select: {
      createdAt: true,
      userId: true,
      userUid: true,
      eventType: true,
      appVersion: true,
      platform: true,
      watcherId: true,
      sessionId: true,
      replayHash: true,
    },
  });

  const sessions = new Map<string, SessionAccumulator>();
  let unknownRecentEvents = 0;

  for (const row of recentEvents) {
    const key = resolveStableClientKey(row, "session");
    if (!key) {
      unknownRecentEvents += 1;
      continue;
    }

    const existing = sessions.get(key);
    if (existing) {
      applyEventToSession(existing, row);
      continue;
    }

    const group: SessionAccumulator = {
      key,
      watcherId: row.watcherId,
      sessionId: row.sessionId,
      userId: row.userId,
      userUid: row.userUid,
      appVersion: row.appVersion,
      platform: row.platform,
      firstSeen: row.createdAt,
      lastSeen: row.createdAt,
      totalEvents: 0,
      lastEventType: row.eventType,
      heartbeatCount: 0,
      replayDetections: 0,
      uploadsStarted: 0,
      uploadsFinished: 0,
      uploadsFailed: 0,
      eventCounts: {},
      replayHashes: new Set<string>(),
    };

    applyEventToSession(group, row);
    sessions.set(key, group);
  }

  const allReplayHashes = Array.from(
    new Set(Array.from(sessions.values()).flatMap((session) => Array.from(session.replayHashes)))
  );
  const parsedGameCountsByReplayHash = new Map<string, number>();

  if (allReplayHashes.length > 0) {
    const parsedRows = await prisma.gameStats.groupBy({
      by: ["replayHash"],
      where: {
        parse_source: { in: [...WATCHER_PARSE_SOURCES] },
        replayHash: { in: allReplayHashes },
      },
      _count: { _all: true },
    });

    for (const row of parsedRows) {
      parsedGameCountsByReplayHash.set(row.replayHash, row._count._all);
    }
  }

  const rows = Array.from(sessions.values())
    .sort((left, right) => right.lastSeen.getTime() - left.lastSeen.getTime())
    .slice(0, SESSION_ROW_LIMIT)
    .map((session) => {
      const parsedGameCount =
        session.replayHashes.size > 0
          ? Array.from(session.replayHashes).reduce(
              (sum, replayHash) => sum + (parsedGameCountsByReplayHash.get(replayHash) ?? 0),
              0
            )
          : null;

      return {
        key: session.key,
        watcherId: session.watcherId,
        sessionId: session.sessionId,
        userId: session.userId,
        userUid: session.userUid,
        appVersion: session.appVersion,
        platform: session.platform,
        firstSeen: session.firstSeen.toISOString(),
        lastSeen: session.lastSeen.toISOString(),
        totalEvents: session.totalEvents,
        lastEventType: session.lastEventType,
        heartbeatCount: session.heartbeatCount,
        replayDetections: session.replayDetections,
        uploadsStarted: session.uploadsStarted,
        uploadsFinished: session.uploadsFinished,
        uploadsFailed: session.uploadsFailed,
        parsedGameCount,
        eventCounts: session.eventCounts,
      };
    });

  return { rows, unknownRecentEvents };
}

function buildUserNameWhere(target: WatcherSupportUserTarget) {
  const clauses: Prisma.UserWhereInput[] = [];
  if (target.userId) {
    clauses.push({ id: target.userId });
  }
  if (target.userUid) {
    clauses.push({ uid: target.userUid });
  }
  if (target.uidPrefix) {
    clauses.push({ uid: { startsWith: target.uidPrefix } });
  }
  for (const match of target.nameMatches || []) {
    clauses.push({ inGameName: { contains: match, mode: "insensitive" } });
    clauses.push({ steamPersonaName: { contains: match, mode: "insensitive" } });
  }
  return clauses;
}

function buildFocusEventWhere(
  target: WatcherSupportUserTarget,
  cutoff: Date,
  focusUser: { id: number; uid: string } | null
): Prisma.WatcherClientEventWhereInput {
  const clauses: Prisma.WatcherClientEventWhereInput[] = [];
  if (focusUser) {
    clauses.push({ userId: focusUser.id }, { userUid: focusUser.uid });
  }
  if (target.userId) {
    clauses.push({ userId: target.userId });
  }
  if (target.userUid) {
    clauses.push({ userUid: target.userUid });
  }
  if (target.uidPrefix) {
    clauses.push({ userUid: { startsWith: target.uidPrefix } });
  }

  if (clauses.length === 0) {
    return { createdAt: { gte: cutoff }, userId: -1 };
  }

  return {
    createdAt: { gte: cutoff },
    OR: clauses,
  };
}

function displayNameForTarget(
  target: WatcherSupportUserTarget,
  user: { uid: string; inGameName: string | null; steamPersonaName: string | null } | null
) {
  if (target.tileKind === "dedicated") return target.label;
  return user?.inGameName || user?.steamPersonaName || target.label;
}

async function loadFocusUserDiagnostics(
  prisma: PrismaClient,
  cutoff: Date,
  target: WatcherSupportUserTarget
): Promise<WatcherFocusUserDiagnostics> {
  const userWhere = buildUserNameWhere(target);
  const focusUser = userWhere.length > 0 ? await prisma.user.findFirst({
    where: { OR: userWhere },
    orderBy: [{ uid: "asc" }],
    select: {
      id: true,
      uid: true,
      inGameName: true,
      steamPersonaName: true,
    },
  }) : null;

  const eventWhere = buildFocusEventWhere(target, cutoff, focusUser);

  const recentEvents = await prisma.watcherClientEvent.findMany({
    where: eventWhere,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: FOCUS_USER_EVENT_LIMIT,
    select: {
      createdAt: true,
      userId: true,
      userUid: true,
      eventType: true,
      appVersion: true,
      platform: true,
      watcherId: true,
      sessionId: true,
      replayHash: true,
      replayFile: true,
      parseSource: true,
      parseReason: true,
      metadata: true,
    },
  });

  const lastEvent = recentEvents[0] ?? null;
  const lastUpload = firstEventAt(recentEvents, [
    "upload_succeeded",
    "upload_failed",
    "upload_attempted",
  ]);
  const lastFailure = firstEventAt(recentEvents, [
    ...WATCHER_FAILURE_EVENTS,
  ]);
  const lastFinalityStatus =
    recentEvents
      .map((event) => metadataString(event.metadata, "finalityStatus"))
      .find(Boolean) ?? null;
  const stream = buildStreamDiagnostics(recentEvents);

  return {
    label: displayNameForTarget(target, focusUser),
    uidPrefix: target.uidPrefix || focusUser?.uid?.slice(0, 12) || target.userUid?.slice(0, 12) || null,
    tileKind: target.tileKind,
    userFound: Boolean(focusUser),
    user: focusUser,
    latestStatus: deriveFocusStatus(recentEvents),
    lastSeenAt: isoOrNull(lastEvent?.createdAt),
    lastHeartbeatAt: isoOrNull(firstEventAt(recentEvents, ["heartbeat"])),
    lastStartedAt: isoOrNull(firstEventAt(recentEvents, ["watching_started", "watcher_started"])),
    lastStoppedAt: isoOrNull(firstEventAt(recentEvents, ["watching_stopped", "watcher_stopped"])),
    lastAuthAt: isoOrNull(firstEventAt(recentEvents, ["auth_success", "auth_failed"])),
    lastReplayDetectedAt: isoOrNull(firstEventAt(recentEvents, ["replay_detected"])),
    lastUploadAt: isoOrNull(lastUpload),
    lastFailureAt: isoOrNull(lastFailure),
    activeWatcherId: lastEvent?.watcherId ?? null,
    activeSessionId: lastEvent?.sessionId ?? null,
    appVersion: lastEvent?.appVersion ?? null,
    platform: lastEvent?.platform ?? null,
    totalEvents: recentEvents.length,
    failureCount: countEvents(recentEvents, WATCHER_FAILURE_EVENTS),
    finalCandidateDeferrals: countEvents(recentEvents, ["final_candidate_deferred"]),
    lastFinalityStatus,
    stream,
    eventCounts: compactEventCounts(recentEvents),
    recentEvents: recentEvents.slice(0, 16).map((event) => ({
      createdAt: event.createdAt.toISOString(),
      eventType: event.eventType,
      appVersion: event.appVersion,
      platform: event.platform,
      watcherId: event.watcherId,
      sessionId: event.sessionId,
      replayHash: event.replayHash,
      replayFile: event.replayFile,
      parseSource: event.parseSource,
      parseReason: event.parseReason,
      finalityStatus: metadataString(event.metadata, "finalityStatus"),
      finalAccepted: metadataBoolean(event.metadata, "finalAccepted"),
      shouldSettle: metadataBoolean(event.metadata, "shouldSettle"),
      reason: metadataString(event.metadata, "reason"),
      detail: metadataString(event.metadata, "detail"),
      errorMessage: metadataString(event.metadata, "errorMessage"),
      fileSizeBytes: metadataNumber(event.metadata, "fileSizeBytes"),
      streamId: metadataString(event.metadata, "streamId"),
      streamSessionKey: metadataString(event.metadata, "sessionKey"),
      streamSourceType: metadataString(event.metadata, "sourceType"),
      streamSourceName: metadataString(event.metadata, "sourceName"),
      streamSourceKind: metadataString(event.metadata, "sourceKind"),
      streamCaptureMode: metadataString(event.metadata, "captureMode"),
      streamModeDetail: metadataString(event.metadata, "modeDetail"),
      streamVideoBitrate: metadataNumber(event.metadata, "videoBitrate"),
      streamChunkTimesliceMs: metadataNumber(event.metadata, "chunkTimesliceMs"),
      streamSequence: metadataNumber(event.metadata, "sequence"),
      streamBlobSize: metadataNumber(event.metadata, "blobSize"),
      streamUploadQueueLength: metadataNumber(event.metadata, "uploadQueueLength"),
      streamLastUploadLatencyMs: metadataNumber(event.metadata, "lastUploadLatencyMs") ?? metadataNumber(event.metadata, "uploadLatencyMs"),
      streamDroppedChunks: metadataNumber(event.metadata, "droppedChunks"),
      streamHeartbeatFailures: metadataNumber(event.metadata, "heartbeatFailures"),
    })),
  };
}

function buildSupportUserTargets(rows: WatcherFunnelSessionRow[]) {
  const targets = [...SUPPORT_USER_TARGETS];
  const seen = new Set(
    targets.flatMap((target) => [target.userId ? `id:${target.userId}` : "", target.userUid ? `uid:${target.userUid}` : "", target.uidPrefix ? `prefix:${target.uidPrefix}` : ""]).filter(Boolean)
  );

  for (const row of rows) {
    if (!row.userId && !row.userUid) continue;

    const idKey = row.userId ? `id:${row.userId}` : "";
    const uidKey = row.userUid ? `uid:${row.userUid}` : "";
    if ((idKey && seen.has(idKey)) || (uidKey && seen.has(uidKey))) continue;

    targets.push({
      label: row.userId ? `User ${row.userId}` : `Watcher ${row.userUid}`,
      userId: row.userId,
      userUid: row.userUid,
      tileKind: "recent",
    });
    if (idKey) seen.add(idKey);
    if (uidKey) seen.add(uidKey);
    if (targets.length >= SUPPORT_USER_TILE_LIMIT) break;
  }

  return targets;
}

export async function loadWatcherFunnelDashboard(
  prisma: PrismaClient
): Promise<WatcherFunnelDashboardData> {
  const now = new Date();
  const windows = buildWindowDefinitions(now);
  const last30DaysCutoff = windows.find((window) => window.key === "last30Days")?.cutoff;

  if (!last30DaysCutoff) {
    throw new Error("Watcher funnel window setup failed.");
  }

  const [
    downloads,
    appOpens,
    authSuccesses,
    heartbeats,
    replayDetections,
    uploadsStarted,
    uploadsFinished,
    uploadsFailed,
    parsedGames,
    recentSessions,
  ] = await Promise.all([
    loadWindowCounts(windows, (cutoff) => countDownloads(prisma, cutoff)),
    loadWindowCounts(windows, (cutoff) =>
      countDistinctClientKeys(prisma, ["app_open"], cutoff, "watcher")
    ),
    loadWindowCounts(windows, (cutoff) =>
      countDistinctClientKeys(prisma, ["auth_success"], cutoff, "watcher")
    ),
    loadWindowCounts(windows, (cutoff) =>
      countDistinctClientKeys(prisma, ["heartbeat"], cutoff, "session")
    ),
    loadWindowCounts(windows, (cutoff) =>
      countDistinctClientKeys(prisma, ["replay_detected"], cutoff, "watcher")
    ),
    loadWindowCounts(windows, (cutoff) =>
      countDistinctClientKeys(prisma, ["upload_attempted"], cutoff, "watcher")
    ),
    loadWindowCounts(windows, (cutoff) =>
      countDistinctClientKeys(prisma, ["upload_succeeded"], cutoff, "watcher")
    ),
    loadWindowCounts(windows, (cutoff) => countClientEvents(prisma, ["upload_failed"], cutoff)),
    loadWindowCounts(windows, (cutoff) => countParsedWatcherGames(prisma, cutoff)),
    loadRecentSessionRows(prisma, last30DaysCutoff),
  ]);
  const loadedSupportUsers = await Promise.all(
    buildSupportUserTargets(recentSessions.rows).map((target) =>
      loadFocusUserDiagnostics(prisma, last30DaysCutoff, target)
    )
  );
  const seenSupportUsers = new Set<string>();
  const supportUsers = loadedSupportUsers.filter((diagnostic) => {
    const key = diagnostic.user?.id
      ? `id:${diagnostic.user.id}`
      : diagnostic.user?.uid
        ? `uid:${diagnostic.user.uid}`
        : diagnostic.uidPrefix
          ? `prefix:${diagnostic.uidPrefix}`
          : diagnostic.label;
    if (seenSupportUsers.has(key)) {
      return false;
    }
    seenSupportUsers.add(key);
    return true;
  });
  const focusUser = supportUsers[0];
  if (!focusUser) {
    throw new Error("Watcher support user setup failed.");
  }

  return {
    generatedAt: now.toISOString(),
    windows: windows.map(({ key, label, description }) => ({ key, label, description })),
    stages: [
      {
        key: "downloads",
        label: "Installer/package downloads",
        description: "Raw package pulls recorded by the app download route.",
        source: "watcher_download_events",
        status: "partial",
        counts: downloads,
        note: "Tracks GET requests through /download/watcher/*; direct static/nginx pulls are outside this app table.",
      },
      {
        key: "app_open",
        label: "Unique watcher app opens",
        description: "Stable watcher/session/user keys that emitted app_open.",
        source: "watcher_client_events.event_type = app_open",
        status: "tracked",
        counts: appOpens,
      },
      {
        key: "auth_success",
        label: "Unique authenticated/pairing successes",
        description: "Stable watcher/session/user keys that completed auth_success.",
        source: "watcher_client_events.event_type = auth_success",
        status: "tracked",
        counts: authSuccesses,
      },
      {
        key: "heartbeat",
        label: "Unique active sessions with heartbeat",
        description: "Stable session-first keys that emitted heartbeat.",
        source: "watcher_client_events.event_type = heartbeat",
        status: "tracked",
        counts: heartbeats,
      },
      {
        key: "replay_detected",
        label: "Unique replay detections",
        description: "Stable watcher/session/user keys that emitted replay_detected.",
        source: "watcher_client_events.event_type = replay_detected",
        status: "tracked",
        counts: replayDetections,
      },
      {
        key: "upload_started",
        label: "Unique replay uploads started",
        description: "Stable watcher/session/user keys that emitted the current upload-start event.",
        source: "watcher_client_events.event_type = upload_attempted",
        status: "tracked",
        counts: uploadsStarted,
      },
      {
        key: "upload_finished",
        label: "Unique replay uploads finished",
        description: "Stable watcher/session/user keys that emitted the current upload-finished event.",
        source: "watcher_client_events.event_type = upload_succeeded",
        status: "tracked",
        counts: uploadsFinished,
      },
      {
        key: "parsed_games",
        label: "Parsed games from watcher uploads",
        description: "GameStats rows created by watcher parse sources.",
        source: "game_stats.parse_source IN (watcher_live, watcher_final)",
        status: "tracked",
        counts: parsedGames,
        note: "There is no enforced foreign key to watcher telemetry; per-session parsed counts join only by replay_hash when present.",
      },
    ],
    supplementalMetrics: [
      {
        key: "upload_failed",
        label: "Replay upload failures",
        description: "Raw upload_failed events, shown separately from the conversion funnel.",
        counts: uploadsFailed,
      },
    ],
    sessionRows: recentSessions.rows,
    focusUser,
    supportUsers,
    recentEventScanLimit: RECENT_EVENT_SCAN_LIMIT,
    sessionRowLimit: SESSION_ROW_LIMIT,
    unknownRecentEvents: recentSessions.unknownRecentEvents,
    unavailableMetrics: [
      {
        label: "Direct static or nginx-only package downloads",
        reason: "The app database only records downloads that pass through /download/watcher/*.",
      },
      {
        label: "Guaranteed parsed-game attribution per watcher session",
        reason: "Parsed games are joinable to telemetry only when replay_hash is present; there is no schema-level watcher session foreign key.",
      },
    ],
    operatorNotes: [
      "Unique watcher metrics use watcher_id first, then session_id, then linked user id/uid. Events without any stable key are excluded from unique counts.",
      "Heartbeat uses a session-first key so multiple active sessions from one watcher can be seen.",
      "Recent session rows scan the latest 5,000 watcher events from the last 30 days and render the 50 most recently active stable sessions.",
    ],
  };
}
