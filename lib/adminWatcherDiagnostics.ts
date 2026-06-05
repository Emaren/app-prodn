import type { PrismaClient } from "@/lib/generated/prisma";

export type AdminWatcherReplayRollup = {
  key: string;
  replayFile: string | null;
  replayHash: string | null;
  lastSeenAt: string | null;
  eventCount: number;
  parseAttemptCount: number;
  parsedGameStatsIds: number[];
  statuses: string[];
  failureDetails: string[];
};

export type AdminWatcherDiagnosticUser = {
  key: string;
  userId: number | null;
  userUid: string | null;
  displayName: string;
  appVersion: string | null;
  platform: string | null;
  artifact: string | null;
  lastHeartbeatAt: string | null;
  lastEventAt: string | null;
  replayFiles: number;
  replayHashes: number;
  parsedFinals: number;
  unparsedFinals: number;
  uploadFailed: number;
  parseFailed: number;
  replayRollups: AdminWatcherReplayRollup[];
};

export type AdminWatcherDiagnosticsPayload = {
  checkedAt: string;
  windowDays: number;
  userCount: number;
  rows: AdminWatcherDiagnosticUser[];
};

type UserKey = string;

type MutableWatcherUser = AdminWatcherDiagnosticUser & {
  fileSet: Set<string>;
  hashSet: Set<string>;
  parsedFinalSet: Set<number>;
  unparsedFinalSet: Set<string>;
  rollupMap: Map<string, MutableReplayRollup>;
};

type MutableReplayRollup = {
  key: string;
  replayFile: string | null;
  replayHash: string | null;
  lastSeenAt: Date | null;
  eventCount: number;
  parseAttemptCount: number;
  parsedGameStatsIds: Set<number>;
  statuses: Set<string>;
  failureDetails: Set<string>;
};

function displayUserName(user: {
  uid?: string | null;
  inGameName?: string | null;
  steamPersonaName?: string | null;
}) {
  return user.inGameName || user.steamPersonaName || user.uid || "Unknown watcher";
}

function userKey(input: { userId?: number | null; userUid?: string | null }) {
  if (typeof input.userId === "number") return `id:${input.userId}`;
  if (input.userUid?.trim()) return `uid:${input.userUid.trim()}`;
  return "anonymous";
}

function replayKey(input: { replayFile?: string | null; replayHash?: string | null }) {
  return (
    input.replayHash?.trim() ||
    input.replayFile?.trim() ||
    `unknown-${Math.random().toString(36).slice(2)}`
  );
}

function maxDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return right.getTime() > left.getTime() ? right : left;
}

function eventLooksLikeUploadFailure(value: string) {
  return /upload.*fail|upload_failed|upload_error|failed_upload/i.test(value);
}

function eventLooksLikeParseFailure(value: string) {
  return /parse.*fail|parse_failed|parse_error|unparsed|final_unparsed/i.test(value);
}

function eventLooksLikeHeartbeat(value: string) {
  return /heartbeat|watcher_started|watcher_status|app_open|startup/i.test(value);
}

function isParsedAttemptStatus(value: string | null | undefined) {
  return /parsed|stored|accepted|success|final/i.test(value || "") &&
    !/unparsed|fail|error/i.test(value || "");
}

function getOrCreateUser(
  rows: Map<UserKey, MutableWatcherUser>,
  input: {
    userId?: number | null;
    userUid?: string | null;
    displayName?: string | null;
  }
) {
  const key = userKey(input);
  let row = rows.get(key);
  if (row) return row;

  row = {
    key,
    userId: input.userId ?? null,
    userUid: input.userUid ?? null,
    displayName: input.displayName || input.userUid || "Unknown watcher",
    appVersion: null,
    platform: null,
    artifact: null,
    lastHeartbeatAt: null,
    lastEventAt: null,
    replayFiles: 0,
    replayHashes: 0,
    parsedFinals: 0,
    unparsedFinals: 0,
    uploadFailed: 0,
    parseFailed: 0,
    replayRollups: [],
    fileSet: new Set(),
    hashSet: new Set(),
    parsedFinalSet: new Set(),
    unparsedFinalSet: new Set(),
    rollupMap: new Map(),
  };
  rows.set(key, row);
  return row;
}

function touchUser(row: MutableWatcherUser, at: Date | null) {
  const next = maxDate(row.lastEventAt ? new Date(row.lastEventAt) : null, at);
  row.lastEventAt = next?.toISOString() ?? row.lastEventAt;
}

function touchHeartbeat(row: MutableWatcherUser, at: Date | null) {
  const next = maxDate(row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt) : null, at);
  row.lastHeartbeatAt = next?.toISOString() ?? row.lastHeartbeatAt;
}

function getOrCreateRollup(
  row: MutableWatcherUser,
  input: { replayFile?: string | null; replayHash?: string | null }
) {
  const key = replayKey(input);
  let rollup = row.rollupMap.get(key);
  if (rollup) return rollup;

  rollup = {
    key,
    replayFile: input.replayFile?.trim() || null,
    replayHash: input.replayHash?.trim() || null,
    lastSeenAt: null,
    eventCount: 0,
    parseAttemptCount: 0,
    parsedGameStatsIds: new Set(),
    statuses: new Set(),
    failureDetails: new Set(),
  };
  row.rollupMap.set(key, rollup);
  return rollup;
}

function applyReplaySeen(
  row: MutableWatcherUser,
  input: {
    replayFile?: string | null;
    replayHash?: string | null;
    seenAt?: Date | null;
    status?: string | null;
    detail?: string | null;
    gameStatsId?: number | null;
    countAsEvent?: boolean;
    countAsAttempt?: boolean;
  }
) {
  const replayFile = input.replayFile?.trim() || null;
  const replayHash = input.replayHash?.trim() || null;
  if (replayFile) row.fileSet.add(replayFile);
  if (replayHash) row.hashSet.add(replayHash);

  if (!replayFile && !replayHash) return;
  const rollup = getOrCreateRollup(row, { replayFile, replayHash });
  rollup.lastSeenAt = maxDate(rollup.lastSeenAt, input.seenAt ?? null);
  if (input.countAsEvent) rollup.eventCount += 1;
  if (input.countAsAttempt) rollup.parseAttemptCount += 1;
  if (input.status?.trim()) rollup.statuses.add(input.status.trim());
  if (input.detail?.trim()) rollup.failureDetails.add(input.detail.trim().slice(0, 180));
  if (typeof input.gameStatsId === "number") rollup.parsedGameStatsIds.add(input.gameStatsId);
}

export async function loadAdminWatcherDiagnostics(
  prisma: PrismaClient,
  options?: { days?: number; take?: number }
): Promise<AdminWatcherDiagnosticsPayload> {
  const windowDays = Math.max(1, Math.min(options?.days ?? 30, 120));
  const take = Math.max(200, Math.min(options?.take ?? 5_000, 12_000));
  const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const rows = new Map<UserKey, MutableWatcherUser>();

  const [events, attempts, finals] = await Promise.all([
    prisma.watcherClientEvent.findMany({
      where: { createdAt: { gte: cutoff } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        createdAt: true,
        userId: true,
        userUid: true,
        eventType: true,
        appVersion: true,
        platform: true,
        artifact: true,
        replayHash: true,
        replayFile: true,
        parseSource: true,
        parseReason: true,
        metadata: true,
        user: {
          select: {
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
    prisma.replayParseAttempt.findMany({
      where: { createdAt: { gte: cutoff } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        createdAt: true,
        userUid: true,
        replayHash: true,
        originalFilename: true,
        parseSource: true,
        status: true,
        detail: true,
        gameStatsId: true,
      },
    }),
    prisma.gameStats.findMany({
      where: {
        createdAt: { gte: cutoff },
        parse_source: { startsWith: "watcher" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take,
      select: {
        id: true,
        userUid: true,
        replayHash: true,
        replay_file: true,
        original_filename: true,
        createdAt: true,
        is_final: true,
        parse_source: true,
        parse_reason: true,
        user: {
          select: {
            id: true,
            uid: true,
            inGameName: true,
            steamPersonaName: true,
          },
        },
      },
    }),
  ]);

  for (const event of events) {
    const row = getOrCreateUser(rows, {
      userId: event.userId,
      userUid: event.userUid,
      displayName: event.user ? displayUserName(event.user) : event.userUid,
    });
    row.appVersion ||= event.appVersion?.trim() || null;
    row.platform ||= event.platform?.trim() || null;
    row.artifact ||= event.artifact?.trim() || null;
    touchUser(row, event.createdAt);
    if (eventLooksLikeHeartbeat(event.eventType)) touchHeartbeat(row, event.createdAt);
    if (eventLooksLikeUploadFailure(event.eventType)) row.uploadFailed += 1;
    if (eventLooksLikeParseFailure(event.eventType)) row.parseFailed += 1;
    applyReplaySeen(row, {
      replayFile: event.replayFile,
      replayHash: event.replayHash,
      seenAt: event.createdAt,
      status: event.eventType,
      detail: event.parseReason || event.parseSource,
      countAsEvent: true,
    });
  }

  const usersByUid = new Map(
    finals
      .filter((row) => row.user)
      .map((row) => [
        row.userUid || row.user?.uid || "",
        {
          id: row.user?.id ?? null,
          displayName: row.user ? displayUserName(row.user) : null,
        },
      ] as const)
      .filter(([uid]) => Boolean(uid))
  );

  for (const attempt of attempts) {
    const matchedUser = usersByUid.get(attempt.userUid || "");
    const row = getOrCreateUser(rows, {
      userId: matchedUser?.id ?? null,
      userUid: attempt.userUid,
      displayName: matchedUser?.displayName ?? attempt.userUid,
    });
    touchUser(row, attempt.createdAt);
    const parsed = isParsedAttemptStatus(attempt.status);
    if (!parsed) {
      row.unparsedFinalSet.add(attempt.replayHash || attempt.originalFilename || `attempt-${attempt.id}`);
    }
    if (/upload/i.test(attempt.status || "") && /fail|error/i.test(attempt.status || "")) {
      row.uploadFailed += 1;
    }
    if (!parsed && /fail|error|unparsed/i.test(attempt.status || "")) {
      row.parseFailed += 1;
    }
    applyReplaySeen(row, {
      replayFile: attempt.originalFilename,
      replayHash: attempt.replayHash,
      seenAt: attempt.createdAt,
      status: attempt.status,
      detail: attempt.detail || attempt.parseSource,
      gameStatsId: attempt.gameStatsId,
      countAsAttempt: true,
    });
  }

  for (const final of finals) {
    const row = getOrCreateUser(rows, {
      userId: final.user?.id ?? null,
      userUid: final.userUid,
      displayName: final.user ? displayUserName(final.user) : final.userUid,
    });
    touchUser(row, final.createdAt);
    if (final.is_final) row.parsedFinalSet.add(final.id);
    applyReplaySeen(row, {
      replayFile: final.original_filename || final.replay_file,
      replayHash: final.replayHash,
      seenAt: final.createdAt,
      status: final.is_final ? "parsed_final" : "parsed_intermediate",
      detail: final.parse_reason || final.parse_source,
      gameStatsId: final.id,
    });
  }

  const resultRows = Array.from(rows.values()).map((row) => {
    const rollups = Array.from(row.rollupMap.values())
      .sort((left, right) => {
        const leftMs = left.lastSeenAt?.getTime() ?? 0;
        const rightMs = right.lastSeenAt?.getTime() ?? 0;
        return rightMs - leftMs;
      })
      .slice(0, 18)
      .map((rollup) => ({
        key: rollup.key,
        replayFile: rollup.replayFile,
        replayHash: rollup.replayHash,
        lastSeenAt: rollup.lastSeenAt?.toISOString() ?? null,
        eventCount: rollup.eventCount,
        parseAttemptCount: rollup.parseAttemptCount,
        parsedGameStatsIds: Array.from(rollup.parsedGameStatsIds).slice(0, 8),
        statuses: Array.from(rollup.statuses).slice(0, 8),
        failureDetails: Array.from(rollup.failureDetails).slice(0, 5),
      }));

    return {
      key: row.key,
      userId: row.userId,
      userUid: row.userUid,
      displayName: row.displayName,
      appVersion: row.appVersion,
      platform: row.platform,
      artifact: row.artifact,
      lastHeartbeatAt: row.lastHeartbeatAt,
      lastEventAt: row.lastEventAt,
      replayFiles: row.fileSet.size,
      replayHashes: row.hashSet.size,
      parsedFinals: row.parsedFinalSet.size,
      unparsedFinals: row.unparsedFinalSet.size,
      uploadFailed: row.uploadFailed,
      parseFailed: row.parseFailed,
      replayRollups: rollups,
    } satisfies AdminWatcherDiagnosticUser;
  });

  resultRows.sort((left, right) => {
    const leftMs = left.lastEventAt ? new Date(left.lastEventAt).getTime() : 0;
    const rightMs = right.lastEventAt ? new Date(right.lastEventAt).getTime() : 0;
    return rightMs - leftMs;
  });

  return {
    checkedAt: new Date().toISOString(),
    windowDays,
    userCount: resultRows.length,
    rows: resultRows.slice(0, 40),
  };
}
