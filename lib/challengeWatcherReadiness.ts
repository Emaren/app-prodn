import type { PrismaClient } from "@/lib/generated/prisma";
import {
  classifyWarGraphWatcherHealth,
  isWarGraphWatcherHeartbeatFresh,
} from "@/lib/wargraph/watcherHealthContract";

export type ChallengeWatcherReadinessState = "ready" | "connected" | "seen" | "absent";

export type ChallengeWatcherReadiness = {
  state: ChallengeWatcherReadinessState;
  label: "Ready" | "Connected" | "Seen" | "No Watcher";
  connected: boolean;
  monitorAttached: boolean;
  folderReady: boolean;
  lastSeenAt: string | null;
  appVersion: string | null;
};

export const ABSENT_CHALLENGE_WATCHER_READINESS: ChallengeWatcherReadiness = {
  state: "absent",
  label: "No Watcher",
  connected: false,
  monitorAttached: false,
  folderReady: false,
  lastSeenAt: null,
  appVersion: null,
};

type HeartbeatEvidence = {
  createdAt: Date;
  eventType: string;
  appVersion: string | null;
  metadata: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function projectChallengeWatcherReadiness(
  heartbeat: HeartbeatEvidence | null | undefined,
  now = new Date(),
): ChallengeWatcherReadiness {
  if (!heartbeat) return { ...ABSENT_CHALLENGE_WATCHER_READINESS };

  const metadata = metadataRecord(heartbeat.metadata);
  const connected = isWarGraphWatcherHeartbeatFresh(heartbeat.createdAt, now);
  const health = classifyWarGraphWatcherHealth({
    eventType: heartbeat.eventType,
    metadata,
  });
  const folderReady = metadata.folderValid === true &&
    String(metadata.folderKind ?? "").trim().toLowerCase() === "hd";
  const monitorAttached = metadata.monitorAttached === true && metadata.isWatching === true;
  const ready = connected && health.monitorAttached && monitorAttached && folderReady;

  return {
    state: ready ? "ready" : connected ? "connected" : "seen",
    label: ready ? "Ready" : connected ? "Connected" : "Seen",
    connected,
    monitorAttached,
    folderReady,
    lastSeenAt: heartbeat.createdAt.toISOString(),
    appVersion: heartbeat.appVersion?.trim() || null,
  };
}

export async function loadChallengeWatcherReadinessByUserId(
  prisma: PrismaClient,
  userIds: readonly number[],
  now = new Date(),
): Promise<Map<number, ChallengeWatcherReadiness>> {
  const ids = [...new Set(userIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  const output = new Map<number, ChallengeWatcherReadiness>();
  if (ids.length === 0) return output;

  const maxima = await prisma.watcherClientEvent.groupBy({
    by: ["userId"],
    where: { userId: { in: ids }, eventType: "heartbeat" },
    _max: { createdAt: true },
  });
  const pairs = maxima
    .filter((row): row is typeof row & { userId: number; _max: { createdAt: Date } } =>
      typeof row.userId === "number" && row._max.createdAt instanceof Date)
    .map((row) => ({ userId: row.userId, createdAt: row._max.createdAt }));
  if (pairs.length === 0) return output;

  const rows = await prisma.watcherClientEvent.findMany({
    where: {
      eventType: "heartbeat",
      OR: pairs.map((pair) => ({ userId: pair.userId, createdAt: pair.createdAt })),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { userId: true, createdAt: true, eventType: true, appVersion: true, metadata: true },
  });
  for (const row of rows) {
    if (row.userId === null || output.has(row.userId)) continue;
    output.set(row.userId, projectChallengeWatcherReadiness(row, now));
  }
  return output;
}
