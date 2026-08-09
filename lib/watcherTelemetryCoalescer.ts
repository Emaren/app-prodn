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
};

export type WatcherTelemetryAdmission<T> = {
  accepted: boolean;
  event: T;
  generation: number | null;
  key: string | null;
};

export const WATCHER_IGNORED_EVENT_COALESCE_WINDOW_MS = 30_000;
export const WATCHER_IGNORED_EVENT_COALESCE_MAX_KEYS = 2_048;

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
      ? maxKeys
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
      if (
        prior &&
        observedAt - prior.acceptedAt < effectiveWindowMs
      ) {
        prior.lastSeenAt = observedAt;
        prior.suppressedCount += 1;
        return {
          accepted: false,
          event,
          generation: null,
          key,
        };
      }

      generation += 1;
      const nextGeneration = generation;
      const representedCount = (prior?.suppressedCount ?? 0) + 1;

      entries.set(key, {
        acceptedAt: observedAt,
        generation: nextGeneration,
        lastSeenAt: observedAt,
        suppressedCount: 0,
      });
      prune(observedAt, entries.size > effectiveMaxKeys);

      return {
        accepted: true,
        event: withCoalescingSummary(
          event,
          representedCount,
          effectiveWindowMs,
        ),
        generation: nextGeneration,
        key,
      };
    },

    recordWriteFailure<T>(admission: WatcherTelemetryAdmission<T>) {
      if (!admission.key || admission.generation === null) return;

      const current = entries.get(admission.key);
      if (!current || current.generation !== admission.generation) return;

      // Keep the admission window closed after a failed write. Reopening it
      // would turn a database outage back into one attempted write per raw
      // filesystem notification. The failed observation is represented in
      // the next admitted summary instead.
      current.suppressedCount += 1;
    },

    size() {
      return entries.size;
    },
  };
}

export const watcherTelemetryCoalescer =
  createWatcherTelemetryCoalescer();
