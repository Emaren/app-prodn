// Pure Watcher ingress shape validator. Do not silently discard any
// requested telemetry event, even in legacy HTTP batch mode.
export type RawWatcherEvent = Record<string, unknown>;

export function toWatcherEventArray(payload: unknown): RawWatcherEvent[] {
  if (payload && typeof payload === "object" && !Array.isArray(payload) &&
      Array.isArray((payload as { events?: unknown }).events)) {
    const batch = (payload as { events: unknown[] }).events;
    if (batch.some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry))) {
      throw new Error("Invalid watcher batch entry.");
    }
    return batch as RawWatcherEvent[];
  }
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? [payload as RawWatcherEvent] : [];
}
