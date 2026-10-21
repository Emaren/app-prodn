import "server-only";
import { getPrisma } from "@/lib/prisma";
import { WATCHER_RELEASE, WATCHER_DOWNLOAD_ARTIFACTS } from "@/lib/watcherRelease";

export type WatcherSignalState = "monitoring" | "detected" | "batch" | "uploading" | "streaming" | "idle";
export type WatcherPublicSignal = { state: WatcherSignalState; version: string | null; minutesAgo: number };
export type WatcherPublicSnapshot = {
  schema: 1;
  observedAt: string;
  available: boolean;
  release: {
    current: string;
    previous: string;
    releasedOn: string;
    signingStatus: string;
    platforms: number;
    formats: number;
    features: string[];
  };
  build: {
    version: string;
    phase: "development";
    certification: "not-certified";
    pullRequest: string;
    source: string;
    checkedEvidence: string;
    nodeTests: number;
    nativeJobs: number;
    hardwareBenchmarks: null;
  };
  fleet: {
    downloadReceipts: number | null;
    signedInDownloaders: number | null;
    observedSessions: number | null;
    active: number | null;
    monitoring: number | null;
    detected: number | null;
    batch: number | null;
    uploading: number | null;
    streaming: number | null;
    idle: number | null;
    manualImports24h: number | null;
    signals: WatcherPublicSignal[];
    sampledEvents: number;
    truncated: boolean;
  };
  resources: {
    cpuPercent: number | null;
    workingSetMb: number | null;
    idleWakeupsPerSecond: number | null;
    reportingSessions: number;
  };
  streaming: {
    fourteenDays: Array<{ date: string; starts: number }>;
    truncated: boolean;
    totalObserved: number | null;
  };
};

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const ACTIVE_WINDOW_MS = 150_000;
const RECENT_STATE_MS = 5 * 60_000;
const EVENT_CAP = 2400;
const STREAM_CAP = 12000;

function numberAt(record: unknown, key: string): number | null {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const value = (record as Record<string, unknown>)[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function resourcesFrom(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const nested = (metadata as Record<string, unknown>).resourceProfile;
  return {
    cpu: numberAt(nested, "cpuPercent"),
    memory: numberAt(nested, "workingSetMb"),
    wakeups: numberAt(nested, "idleWakeupsPerSecond"),
  };
}
function avg(values: number[]): number | null {
  return values.length ? Math.round(values.reduce((sum, n) => sum + n, 0) / values.length * 10) / 10 : null;
}
function emptySnapshot(now: Date): WatcherPublicSnapshot {
  return {
    schema: 1,
    observedAt: now.toISOString(),
    available: false,
    release: {
      current: WATCHER_RELEASE.version,
      previous: WATCHER_RELEASE.previousVersion,
      releasedOn: WATCHER_RELEASE.releasedOn,
      signingStatus: WATCHER_RELEASE.signingStatus,
      platforms: new Set(WATCHER_DOWNLOAD_ARTIFACTS.map(row => row.platform)).size,
      formats: WATCHER_DOWNLOAD_ARTIFACTS.length,
      features: [...WATCHER_RELEASE.featureChips],
    },
    // Engineering source receipts are a pinned, explicitly non-release proof,
    // NEVER substituted for runtime production measurements.
    build: {
      version: "1.6.6",
      phase: "development",
      certification: "not-certified",
      pullRequest: "https://github.com/Emaren/aoe2-watcher/pull/76",
      source: "6adeb78a1294a07bfe63fcd43137f260e059c3b0",
      checkedEvidence: "https://github.com/Emaren/aoe2-watcher/actions/runs/39693198445",
      nodeTests: 455,
      nativeJobs: 4,
      hardwareBenchmarks: null,
    },
    fleet: {
      downloadReceipts: null,
      signedInDownloaders: null,
      observedSessions: null,
      active: null,
      monitoring: null,
      detected: null,
      batch: null,
      uploading: null,
      streaming: null,
      idle: null,
      manualImports24h: null,
      signals: [],
      sampledEvents: 0,
      truncated: false,
    },
    resources: { cpuPercent: null, workingSetMb: null, idleWakeupsPerSecond: null, reportingSessions: 0 },
    streaming: { fourteenDays: [], truncated: false, totalObserved: null },
  };
}
type Row = {
  createdAt: Date;
  userId: number | null;
  sessionId: string | null;
  appVersion: string | null;
  eventType: string;
  metadata: unknown;
};
const STREAM_STARTED = "stream_started";
const STATE_EVENTS = new Set([
  "batch_upload_started", "batch_upload_finished", "batch_upload_failed",
  "stream_started", "stream_stopped", "stream_error",
  "replay_detected", "upload_attempted", "upload_succeeded", "upload_failed",
  "watching_started", "watching_stopped", "watcher_stopped", "monitor_start", "monitor_stop",
]);
function stateFor(events: Row[], nowMs: number): WatcherSignalState {
  const transition = events.find(event => STATE_EVENTS.has(event.eventType));
  if (!transition || nowMs - transition.createdAt.getTime() > RECENT_STATE_MS) return "idle";
  switch (transition.eventType) {
    case "batch_upload_started": return "batch";
    case "stream_started": return "streaming";
    case "replay_detected": return "detected";
    case "upload_attempted": return "uploading";
    case "watching_started":
    case "monitor_start": return "monitoring";
    default: return "idle";
  }
}

let pending: Promise<WatcherPublicSnapshot> | null = null;
let cached: { until: number; snapshot: WatcherPublicSnapshot } | null = null;
export async function loadKingdomWatcherPublic(): Promise<WatcherPublicSnapshot> {
  if (cached && Date.now() < cached.until) return cached.snapshot;
  if (pending) return pending;
  pending = (async () => {
    const now = new Date();
    const result = emptySnapshot(now);
    const prisma = getPrisma();
    const recentCutoff = new Date(now.getTime() - FIFTEEN_MINUTES);
    const streamsCutoff = new Date(now.getTime() - 14 * 86_400_000);
    const dayCutoff = new Date(now.getTime() - 86_400_000);
    try {
      const [events, downloads, signedIn, manual, streams] = await Promise.all([
        prisma.watcherClientEvent.findMany({
          where: { createdAt: { gte: recentCutoff }, userId: { not: null } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: EVENT_CAP,
          select: { createdAt: true, userId: true, sessionId: true, appVersion: true, eventType: true, metadata: true },
        }),
        prisma.watcherDownloadEvent.count(),
        prisma.watcherDownloadEvent.groupBy({
          by: ["userId"],
          where: { userId: { not: null } },
          _count: { _all: true },
        }),
        prisma.replayParseAttempt.count({
          where: { createdAt: { gte: dayCutoff }, parseSource: "file_upload" },
        }),
        prisma.watcherClientEvent.findMany({
          where: { eventType: STREAM_STARTED, createdAt: { gte: streamsCutoff }, userId: { not: null } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: STREAM_CAP,
          select: { createdAt: true },
        }),
      ]);
      const sessions = new Map<string, Row[]>();
      for (const raw of events) {
        if (raw.userId === null || !raw.sessionId) continue;
        const key = raw.userId + ":" + raw.sessionId;
        const value = sessions.get(key) ?? [];
        value.push(raw as Row);
        sessions.set(key, value);
      }
      const signals: WatcherPublicSignal[] = [];
      const cpu: number[] = [], memory: number[] = [], wakeups: number[] = [];
      for (const session of sessions.values()) {
        const latest = session[0];
        if (now.getTime() - latest.createdAt.getTime() > ACTIVE_WINDOW_MS) continue;
        if (session.some(row => row.eventType === "watcher_stopped") &&
            session.find(row => row.eventType === "watcher_stopped") === latest) continue;
        const state = stateFor(session, now.getTime());
        signals.push({
          state, version: latest.appVersion,
          minutesAgo: Math.max(0, Math.floor((now.getTime() - latest.createdAt.getTime()) / 60_000)),
        });
        const heartbeat = session.find(row => row.eventType === "heartbeat");
        const sampled = resourcesFrom(heartbeat?.metadata);
        if (sampled) {
          if (sampled.cpu !== null && sampled.cpu <= 3200) cpu.push(sampled.cpu);
          if (sampled.memory !== null && sampled.memory <= 65_536) memory.push(sampled.memory);
          if (sampled.wakeups !== null && sampled.wakeups <= 100_000) wakeups.push(sampled.wakeups);
        }
      }
      const counts = { monitoring: 0, detected: 0, batch: 0, uploading: 0, streaming: 0, idle: 0 };
      for (const signal of signals) counts[signal.state] += 1;
      const dayBuckets = new Map<string, number>();
      for (const row of streams) {
        const day = row.createdAt.toISOString().slice(0, 10);
        dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + 1);
      }
      // Do not fabricate zero-volume days if the ledger query hit its cap.
      const truncated = streams.length === STREAM_CAP;
      result.streaming = {
        fourteenDays: [...dayBuckets].sort(([left], [right]) => left.localeCompare(right)).map(([date, starts]) => ({ date, starts })),
        truncated,
        totalObserved: streams.length,
      };
      result.fleet = {
        downloadReceipts: downloads,
        signedInDownloaders: signedIn.length,
        observedSessions: sessions.size,
        active: signals.length,
        ...counts,
        manualImports24h: manual,
        // No account name, stable user ID, token or device fingerprint ever
        // leaves this server aggregation. The public lights are anonymous.
        signals: signals.slice(0, 48),
        sampledEvents: events.length,
        truncated: events.length === EVENT_CAP,
      };
      result.resources = {
        cpuPercent: avg(cpu), workingSetMb: avg(memory),
        idleWakeupsPerSecond: avg(wakeups),
        reportingSessions: Math.max(cpu.length, memory.length, wakeups.length),
      };
      result.available = true;
    } catch (error) {
      console.warn("Kingdom Watcher public aggregate unavailable", error instanceof Error ? error.message : "unknown");
    }
    cached = { snapshot: result, until: Date.now() + 20_000 };
    return result;
  })();
  try { return await pending; } finally { pending = null; }
}
