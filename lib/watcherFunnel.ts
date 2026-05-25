import { Prisma, type PrismaClient } from "@/lib/generated/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WATCHER_PARSE_SOURCES = ["watcher_live", "watcher_final"] as const;
const RECENT_EVENT_SCAN_LIMIT = 5000;
const SESSION_ROW_LIMIT = 50;

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
        note: "The current watcher event name is upload_attempted; replay_upload_started is not tracked yet.",
      },
      {
        key: "upload_finished",
        label: "Unique replay uploads finished",
        description: "Stable watcher/session/user keys that emitted the current upload-finished event.",
        source: "watcher_client_events.event_type = upload_succeeded",
        status: "tracked",
        counts: uploadsFinished,
        note: "The current watcher event name is upload_succeeded; replay_upload_finished is not tracked yet.",
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
    recentEventScanLimit: RECENT_EVENT_SCAN_LIMIT,
    sessionRowLimit: SESSION_ROW_LIMIT,
    unknownRecentEvents: recentSessions.unknownRecentEvents,
    unavailableMetrics: [
      {
        label: "replay_upload_started / replay_upload_finished / replay_upload_failed",
        reason: "Those event names are not accepted by the current watcher telemetry route; the live equivalents are upload_attempted, upload_succeeded, and upload_failed.",
      },
      {
        label: "historical_import_started / historical_import_finished",
        reason: "No accepted watcher telemetry event currently records historical import lifecycle events.",
      },
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
