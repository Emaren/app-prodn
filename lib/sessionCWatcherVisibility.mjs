/**
 * Session C source-only Watcher 1.6.5 heartbeat visibility.
 *
 * Original telemetry is already collected elsewhere. This pure projection
 * never writes, sends alerts, follows sessions, or asserts a Watcher process
 * is monitoring games merely because it sent a heartbeat.
 */
export const EXPECTED_WATCHER_SOURCE_VERSION = "1.6.5";

function validUtc(raw) {
  if (typeof raw !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(raw) ||
      !Number.isFinite(Date.parse(raw))) {
    throw new Error("HOLD_WATCHER_INVALID_UTC_RECEIPT");
  }
  const ms = Date.parse(raw);
  if (new Date(ms).toISOString().slice(0,19) !== raw.slice(0,19)) {
    throw new Error("HOLD_UNREAL_UTC_CALENDAR_DATE");
  }
  return ms;
}

export function inspectWatcherTelemetry({
  events = [],
  nowUtc,
  thresholdSeconds = 600,
} = {}) {
  const now = validUtc(nowUtc);
  if (!Number.isSafeInteger(thresholdSeconds) ||
      thresholdSeconds < 30 || thresholdSeconds > 3600 ||
      !Array.isArray(events) || events.length > 200) {
    throw new Error("HOLD_WATCHER_UNBOUNDED_SOURCE");
  }
  const status = { current: 0, stale: 0, future: 0,
    outdatedVersion: 0, disconnected: 0, unverified: 0,
    monitoringClaimProven: 0 };
  // Do not copy a stable watcher/device/user identifier into the output.
  let newestUtc = null;
  for (const value of events) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        typeof value.version !== "string" ||
        typeof value.serverVerified !== "boolean" ||
        typeof value.connected !== "boolean") {
      throw new Error("HOLD_WATCHER_INVALID_EVENT_CONTRACT");
    }
    const observed = validUtc(value.lastSeenUtc);
    const skew = observed - now;
    if (skew > 60_000) {
      status.future++;
    } else if (!value.serverVerified) {
      status.unverified++;
    } else if (value.version !== EXPECTED_WATCHER_SOURCE_VERSION) {
      status.outdatedVersion++;
    } else if (!value.connected) {
      status.disconnected++;
    } else if (now - observed > thresholdSeconds * 1000) {
      status.stale++;
    } else {
      status.current++;
    }
    if (observed <= now + 60_000) {
      newestUtc = Math.max(newestUtc ?? -Infinity, observed);
    }
  }
  return Object.freeze({
    schema: "SESSION_C_WATCHER_165_VISIBILITY_ONLY_V1",
    status: "OBSERVATIONAL_HOLD_NOT_A_LIVE_WATCHER_ADMISSION",
    sourceVersion: EXPECTED_WATCHER_SOURCE_VERSION,
    eventCount: events.length,
    classifications: status,
    newestSeenUtc: newestUtc === null ? null :
      new Date(newestUtc).toISOString(),
    connectedMeansReplayMonitoring: false,
    telemetrySourceNativeVerified: false,
    canAutoNotifyOrRestart: false,
    noDeviceOrUserIdentifiersReturned: true,
  });
}
