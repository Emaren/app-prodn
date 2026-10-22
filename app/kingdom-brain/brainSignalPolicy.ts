/**
 * Page-local observation policy. A fresh HTTP 200 is transport evidence, not
 * proof that a source, deployment, agent or declared graph edge is healthy.
 * No API writes, new collectors, scores or claims of independent attestation.
 */
export type BrainSignalSource = "index" | "agents" | "patrol" | "census";
export type BrainSignalState = "observed" | "policy-only" | "stale" | "unverified" | "unavailable";
export type BrainSignalReason =
  | "source-observed" | "policy-declared" | "source-stale" | "source-future"
  | "timestamp-unknown" | "authority-unverified" | "source-unavailable";
export type BrainSignalDecision = {
  state: BrainSignalState;
  reason: BrainSignalReason;
  sourceAt: string | null;
  sourceAtMs: number | null;
};

export const BRAIN_SIGNAL_MAX_AGE_MS = 5 * 60_000;
export const BRAIN_SIGNAL_FUTURE_SKEW_MS = 30_000;
export const BRAIN_REFRESH_INTERVAL_MS = 120_000;
export const BRAIN_REFRESH_TIMEOUT_MS = 12_000;
export const BRAIN_ENDPOINT_COUNT = 4;
const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
const nonnegative = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const nonempty = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 150;
const unknown = (reason: BrainSignalReason = "authority-unverified"): BrainSignalDecision =>
  ({ state: "unverified", reason, sourceAt: null, sourceAtMs: null });
export const unavailableBrainSignal = (): BrainSignalDecision =>
  ({ state: "unavailable", reason: "source-unavailable", sourceAt: null, sourceAtMs: null });

export function classifyBrainSignal(source: BrainSignalSource, value: unknown, nowMs: number): BrainSignalDecision {
  const data = record(value);
  if (!data || data.schema !== 1 || !Number.isFinite(nowMs)) return unknown();
  let at: unknown;
  let state: BrainSignalState = "observed";

  if (source === "index") {
    // generatedAt is the public Index projection's creation time, not the
    // checkedAt/score validity of the individual pages contained within it.
    if (!Array.isArray(data.pages) || (data.source !== "file" && data.source !== "review-baseline")) return unknown();
    at = data.generatedAt;
  } else if (source === "agents") {
    if (!Array.isArray(data.agents)) return unknown();
    at = data.observedAt;
  } else if (source === "patrol") {
    if (!Array.isArray(data.entries) || !nonempty(data.policyVersion) ||
      !nonnegative(data.registered) || !nonnegative(data.assigned) ||
      data.assigned > data.registered || data.agentsRunning !== null ||
      data.entries.length !== data.registered ||
      !data.entries.every(entry => record(entry)?.status === "POLICY_ONLY")) return unknown();
    at = data.generatedAt;
    state = "policy-only"; // A fresh policy is NEVER proof that agents are running.
  } else {
    const counts = record(data.counts);
    if (data.status !== "verified" || data.source !== "deployed-next-app-paths-manifest" ||
      !nonempty(data.buildVersion) || !counts ||
      !nonnegative(counts.totalPages) || !nonnegative(counts.apiHandlers)) return unknown();
    at = data.capturedAt;
  }

  if (typeof at !== "string" || at.length > 50 || !ISO.test(at)) return unknown("timestamp-unknown");
  const atMs = Date.parse(at);
  if (!Number.isFinite(atMs)) return unknown("timestamp-unknown");
  // Date.parse may silently normalize impossible dates such as February 30.
  const [year, month, day] = at.slice(0, 10).split("-").map(Number);
  const localDay = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  if (localDay !== at.slice(0, 10)) return unknown("timestamp-unknown");
  const sourceAt = new Date(atMs).toISOString();
  if (atMs > nowMs + BRAIN_SIGNAL_FUTURE_SKEW_MS) return { state: "unverified", reason: "source-future", sourceAt, sourceAtMs: atMs };
  if (nowMs - atMs > BRAIN_SIGNAL_MAX_AGE_MS) return { state: "stale", reason: "source-stale", sourceAt, sourceAtMs: atMs };

  if (source === "agents") {
    const origins = record(data.sources);
    // An API-generated observedAt alone says nothing about underlying
    // intelligence freshness or alignment. Absence must fail closed.
    if (!origins || origins.intelligenceStale === undefined) {
      return { state: "unverified", reason: "authority-unverified", sourceAt, sourceAtMs: atMs };
    }
    if (origins.intelligenceStale === true) {
      return { state: "stale", reason: "source-stale", sourceAt, sourceAtMs: atMs };
    }
    if (origins.intelligence !== true || origins.inspections !== true ||
      origins.releaseAlignment !== "aligned" ||
      typeof data.releaseSha !== "string" || !/^[0-9a-f]{12}$/.test(data.releaseSha)) {
      return { state: "unverified", reason: "authority-unverified", sourceAt, sourceAtMs: atMs };
    }
  }
  // OBSERVED means a bounded source-specific read, not certified runtime health.
  return { state, reason: state === "policy-only" ? "policy-declared" : "source-observed", sourceAt, sourceAtMs: atMs };
}

export function isBrainSignalDisplayable(decision: BrainSignalDecision, nowMs: number): boolean {
  return (decision.state === "observed" || decision.state === "policy-only") &&
    decision.sourceAtMs !== null && Number.isFinite(nowMs) &&
    decision.sourceAtMs <= nowMs + BRAIN_SIGNAL_FUTURE_SKEW_MS &&
    nowMs - decision.sourceAtMs <= BRAIN_SIGNAL_MAX_AGE_MS;
}

/** Guarantees that late completions, even promises ignoring AbortSignal, are discarded. */
export function createBrainRefreshCoordinator<T>(options: {
  load(signal: AbortSignal): Promise<T>;
  publish(value: T): void;
  setBusy(value: boolean): void;
  failed?(error: unknown): void;
}) {
  let generation = 0;
  let controller: AbortController | null = null;
  let disposed = false;
  const cancel = () => {
    generation++;
    controller?.abort();
    controller = null;
    if (!disposed) options.setBusy(false);
  };
  return {
    async refresh(): Promise<void> {
      if (disposed) return;
      cancel();
      const mine = generation;
      const active = new AbortController();
      controller = active;
      options.setBusy(true);
      try {
        const value = await options.load(active.signal);
        if (!disposed && generation === mine) options.publish(value);
      } catch (error) {
        if (!disposed && generation === mine) options.failed?.(error);
      } finally {
        if (!disposed && generation === mine) {
          controller = null;
          options.setBusy(false);
        }
      }
    },
    cancel,
    dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      controller?.abort();
      controller = null;
    },
  };
}
