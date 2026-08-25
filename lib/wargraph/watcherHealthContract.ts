const STOP_EVENTS = new Set([
  "watcher_stopped",
  "watching_stopped",
  "watcher_error",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * A heartbeat proves connection. Ready attribution additionally requires the
 * authenticated client to report its HD folder watcher as attached and valid.
 */
export function classifyWarGraphWatcherHealth(input: {
  eventType: string;
  metadata: unknown;
}): { connected: true; monitorAttached: boolean } {
  const metadata = record(input.metadata);
  const stopped = STOP_EVENTS.has(input.eventType);
  const folderKind =
    typeof metadata.folderKind === "string"
      ? metadata.folderKind.toLowerCase()
      : null;
  const monitorAttached = Boolean(
    !stopped &&
      metadata.isWatching === true &&
      metadata.monitorAttached === true &&
      metadata.folderValid === true &&
      folderKind !== "de",
  );
  return { connected: true, monitorAttached };
}


export const WARGRAPH_WATCHER_FRESH_MS = 2 * 60 * 1000;

const WARGRAPH_WATCHER_IDENTITY_HASH = /^[a-f0-9]{64}$/u;

export function isWarGraphWatcherHeartbeatFresh(
  watcherSeenAt: Date | null | undefined,
  now: Date,
): boolean {
  if (
    !watcherSeenAt ||
    !Number.isFinite(watcherSeenAt.getTime()) ||
    !Number.isFinite(now.getTime())
  ) {
    return false;
  }

  const age = now.getTime() - watcherSeenAt.getTime();
  return age >= 0 && age <= WARGRAPH_WATCHER_FRESH_MS;
}

/**
 * Pairing READY is stronger than public "Ready Now":
 * it proves a fresh authenticated HD Watcher monitor at the server clock.
 */
export function isWarGraphPairingReadyWatcherEvidence(input: {
  watcherSeenAt: Date | null | undefined;
  watcherHealthy: boolean;
  watcherIdentityHash: string | null | undefined;
  now: Date;
}): boolean {
  return Boolean(
    input.watcherHealthy === true &&
      WARGRAPH_WATCHER_IDENTITY_HASH.test(
        input.watcherIdentityHash ?? "",
      ) &&
      isWarGraphWatcherHeartbeatFresh(
        input.watcherSeenAt,
        input.now,
      ),
  );
}
