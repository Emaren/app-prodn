type WatcherTelemetryIdentity = {
  resolved: boolean;
  userId: number | null;
  userUid: string | null;
};

type CoalescibleWatcherEvent = {
  eventType: string;
  watcherId?: string | null;
  replayHash?: string | null;
  replayFile?: string | null;
  parseReason?: string | null;
  metadata?: unknown;
};

type CoalescerEntry = {
  acceptedAt: number;
  generation: number;
  lastSeenAt: number;
  suppressedCount: number;
  // Coalescing is an acknowledgment, which requires a durable predecessor.
  committed: boolean;
  pendingGenerations: Map<number, string | null>;
  failedEventIds: Set<string>;
  forceAdmission: boolean;
};

export type WatcherTelemetryAdmission<T> = {
  accepted: boolean;
  event: T;
  generation: number | null;
  key: string | null;
};

export const WATCHER_IGNORED_EVENT_COALESCE_WINDOW_MS = 30_000;
export const WATCHER_IGNORED_EVENT_COALESCE_MAX_KEYS = 2_048;
const MAX_PENDING_PER_KEY = 64;
const MAX_FAILED_IDS_PER_KEY = 64;

function normalized(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function telemetryEventId(event: CoalescibleWatcherEvent) {
  const value = metadataRecord(event.metadata).telemetryEventId;
  return typeof value === "string" && /^telemetry_[a-f0-9]{32}$/i.test(value)
    ? value.toLowerCase() : null;
}

function ignoredReason(event: CoalescibleWatcherEvent) {
  const metadata = metadataRecord(event.metadata);
  return normalized(metadata.reason ?? event.parseReason);
}

function replayIdentity(event: CoalescibleWatcherEvent) {
  const replayFile = normalized(event.replayFile);
  if (replayFile) return `file:${replayFile}`;

  const replayHash = normalized(event.replayHash);
  return replayHash ? `hash:${replayHash}` : "";
}

function watcherIdentity(
  identity: WatcherTelemetryIdentity,
  event: CoalescibleWatcherEvent,
) {
  const userIdentity =
    typeof identity.userId === "number" && identity.userId > 0
      ? `user:${identity.userId}`
      : normalized(identity.userUid)
        ? `uid:${normalized(identity.userUid)}`
        : "";
  const watcherId = normalized(event.watcherId);

  if (!userIdentity && !watcherId) return "";
  return `${userIdentity || "unresolved"}|watcher:${watcherId || "unknown"}`;
}

function eventKey(
  identity: WatcherTelemetryIdentity,
  event: CoalescibleWatcherEvent,
) {
  const owner = watcherIdentity(identity, event);
  const replay = replayIdentity(event);
  return owner && replay ? `${owner}|${replay}` : null;
}

function withCoalescingSummary<T extends CoalescibleWatcherEvent>(
  event: T,
  count: number,
  windowMs: number,
) {
  return {
    ...event,
    metadata: {
      ...metadataRecord(event.metadata),
      serverCoalescedCount: count,
      serverCoalescedWindowMs: windowMs,
    },
  } satisfies CoalescibleWatcherEvent as T;
}

export function createWatcherTelemetryCoalescer({
  maxKeys = WATCHER_IGNORED_EVENT_COALESCE_MAX_KEYS,
  now = Date.now,
  windowMs = WATCHER_IGNORED_EVENT_COALESCE_WINDOW_MS,
}: {
  maxKeys?: number;
  now?: () => number;
  windowMs?: number;
} = {}) {
  const effectiveMaxKeys =
    Number.isSafeInteger(maxKeys) && maxKeys > 0
      ? Math.min(maxKeys, 4_096)
      : WATCHER_IGNORED_EVENT_COALESCE_MAX_KEYS;
  const effectiveWindowMs =
    Number.isFinite(windowMs) && windowMs > 0
      ? windowMs
      : WATCHER_IGNORED_EVENT_COALESCE_WINDOW_MS;
  const retentionMs = effectiveWindowMs * 4;
  const entries = new Map<string, CoalescerEntry>();
  let generation = 0;
  let lastPrunedAt = 0;

  function prune(observedAt: number, force = false) {
    if (
      !force &&
      entries.size <= effectiveMaxKeys &&
      observedAt - lastPrunedAt < effectiveWindowMs
    ) {
      return;
    }

    const expiresBefore = observedAt - retentionMs;
    for (const [key, entry] of entries) {
      if (entry.lastSeenAt < expiresBefore) {
        entries.delete(key);
      }
    }

    while (entries.size > effectiveMaxKeys) {
      let oldestKey: string | null = null;
      let oldestSeenAt = Number.POSITIVE_INFINITY;

      for (const [key, entry] of entries) {
        if (entry.lastSeenAt < oldestSeenAt) {
          oldestKey = key;
          oldestSeenAt = entry.lastSeenAt;
        }
      }

      if (!oldestKey) break;
      entries.delete(oldestKey);
    }

    lastPrunedAt = observedAt;
  }

  function clearReplay(
    identity: WatcherTelemetryIdentity,
    event: CoalescibleWatcherEvent,
  ) {
    const key = eventKey(identity, event);
    if (key) entries.delete(key);
  }

  return {
    admit<T extends CoalescibleWatcherEvent>(
      event: T,
      identity: WatcherTelemetryIdentity,
    ): WatcherTelemetryAdmission<T> {
      const observedAt = Number(now());
      prune(observedAt);

      if (event.eventType === "monitor_stop") {
        clearReplay(identity, event);
        return {
          accepted: true,
          event,
          generation: null,
          key: null,
        };
      }

      if (
        event.eventType !== "replay_detected_ignored" ||
        ignoredReason(event) !== "monitoring"
      ) {
        return {
          accepted: true,
          event,
          generation: null,
          key: null,
        };
      }

      const key = eventKey(identity, event);
      if (!key) {
        return {
          accepted: true,
          event,
          generation: null,
          key: null,
        };
      }

      const prior = entries.get(key);
      const retryId = telemetryEventId(event);
      const unresolved = (prior?.pendingGenerations.size ?? 0) > 0;
      const failedRetry = Boolean(retryId && prior?.failedEventIds.has(retryId));
      // A coalescer-only HTTP 200 is unsafe until an earlier write commits.
      if (prior && prior.committed && !unresolved && !failedRetry &&
          !prior.forceAdmission &&
          observedAt - prior.acceptedAt < effectiveWindowMs) {
        prior.lastSeenAt = observedAt;
        prior.suppressedCount += 1;
        return { accepted: false, event, generation: null, key };
      }

      generation += 1;
      const nextGeneration = generation;
      const representedCount = (prior?.suppressedCount ?? 0) + 1;
      const current: CoalescerEntry = prior ?? {
        acceptedAt: observedAt,
        generation: nextGeneration,
        lastSeenAt: observedAt,
        suppressedCount: 0,
        committed: false,
        pendingGenerations: new Map(),
        failedEventIds: new Set(),
        forceAdmission: false,
      };
      current.acceptedAt = observedAt;
      current.lastSeenAt = observedAt;
      current.generation = nextGeneration;
      current.suppressedCount = 0;
      if (current.pendingGenerations.size < MAX_PENDING_PER_KEY) {
        current.pendingGenerations.set(nextGeneration, retryId);
      } else {
        // Prefer another PostgreSQL write over an unproven HTTP ACK.
        current.forceAdmission = true;
      }
      entries.set(key, current);
      prune(observedAt, entries.size > effectiveMaxKeys);

      return {
        accepted: true,
        event: withCoalescingSummary(event, representedCount, effectiveWindowMs),
        generation: nextGeneration,
        key,
      };
    },

    recordWriteFailure<T>(admission: WatcherTelemetryAdmission<T>) {
      if (!admission.key || admission.generation === null) return;
      const current = entries.get(admission.key);
      if (!current?.pendingGenerations.has(admission.generation)) return;
      const eventId = current.pendingGenerations.get(admission.generation);
      current.pendingGenerations.delete(admission.generation);
      const metadata = metadataRecord((admission.event as CoalescibleWatcherEvent).metadata);
      const count = Number(metadata.serverCoalescedCount);
      current.suppressedCount += Number.isSafeInteger(count) && count > 0 ? count : 1;
      if (eventId) {
        if (current.failedEventIds.size < MAX_FAILED_IDS_PER_KEY) {
          current.failedEventIds.add(eventId);
        } else {
          current.forceAdmission = true;
        }
      } else {
        current.forceAdmission = true;
      }
    },

    recordWriteSuccess<T>(admission: WatcherTelemetryAdmission<T>) {
      if (!admission.key || admission.generation === null) return;
      const current = entries.get(admission.key);
      if (!current?.pendingGenerations.has(admission.generation)) return;
      const eventId = current.pendingGenerations.get(admission.generation);
      current.pendingGenerations.delete(admission.generation);
      current.committed = true;
      if (eventId) current.failedEventIds.delete(eventId);
    },

    size() {
      return entries.size;
    },
  };
}

export const watcherTelemetryCoalescer =
  createWatcherTelemetryCoalescer();
