type LiveSessionTiming = {
  id?: number | string | null;
  sessionKey?: string | null;
  createdAt?: string | Date | null;
  playedOn?: string | Date | null;
  updatedAt?: string | Date | null;
};

function timestampMs(value: string | Date | null | undefined) {
  if (!value) return null;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function earliestLiveObservationMs(
  rows: Array<{ createdAt?: string | Date | null }>,
  fallback: string | Date | null | undefined = null
) {
  let earliest = timestampMs(fallback) ?? Number.MAX_SAFE_INTEGER;

  for (const row of rows) {
    const observedAt = timestampMs(row.createdAt);
    if (observedAt !== null && observedAt < earliest) {
      earliest = observedAt;
    }
  }

  return earliest === Number.MAX_SAFE_INTEGER ? 0 : earliest;
}

export function earliestLivePlayedOnMs(
  rows: Array<{ played_on?: string | Date | null; playedOn?: string | Date | null }>,
  fallback: string | Date | null | undefined = null
) {
  let earliest = timestampMs(fallback) ?? Number.MAX_SAFE_INTEGER;

  for (const row of rows) {
    const playedOn = timestampMs(row.played_on ?? row.playedOn);
    if (playedOn !== null && playedOn < earliest) {
      earliest = playedOn;
    }
  }

  return earliest === Number.MAX_SAFE_INTEGER ? 0 : earliest;
}

export function liveSessionStartedMs(session: LiveSessionTiming) {
  for (const value of [session.createdAt, session.playedOn, session.updatedAt]) {
    const ms = timestampMs(value);
    if (ms !== null) return ms;
  }

  return Number.MAX_SAFE_INTEGER;
}

export function liveSessionActivityMs(session: LiveSessionTiming) {
  for (const value of [session.updatedAt, session.playedOn, session.createdAt]) {
    const ms = timestampMs(value);
    if (ms !== null) return ms;
  }

  return 0;
}

function stableSessionIdentity(session: LiveSessionTiming) {
  const sessionKey = String(session.sessionKey ?? "").trim().toLowerCase();
  if (sessionKey) return `session:${sessionKey}`;
  return `row:${String(session.id ?? "")}`;
}

/**
 * Live cards are append-stable: an older battle keeps its slot while watcher
 * pulses only update card contents. Identity, never heartbeat recency, breaks
 * equal-start ties so the server render and every browser poll agree.
 */
export function compareLiveSessionOrder(
  left: LiveSessionTiming,
  right: LiveSessionTiming
) {
  const startedDiff = liveSessionStartedMs(left) - liveSessionStartedMs(right);
  if (startedDiff !== 0) return startedDiff;

  const identityDiff = stableSessionIdentity(left).localeCompare(
    stableSessionIdentity(right)
  );
  if (identityDiff !== 0) return identityDiff;

  return Number(left.id ?? 0) - Number(right.id ?? 0);
}

export const RECENT_OUTCOME_BASE_WINDOW_MS = 15 * 60_000;
export const RECENT_OUTCOME_BUSY_WINDOW_MS = 10 * 60_000;
export const RECENT_OUTCOME_SURGE_WINDOW_MS = 5 * 60_000;

export function recentOutcomePresentationWindowMs(
  activeSessionCount: number,
  completedCandidateCount: number
) {
  const boardPressure = Math.max(0, activeSessionCount) + Math.max(0, completedCandidateCount);
  if (boardPressure >= 24) return RECENT_OUTCOME_SURGE_WINDOW_MS;
  if (boardPressure >= 10) return RECENT_OUTCOME_BUSY_WINDOW_MS;
  return RECENT_OUTCOME_BASE_WINDOW_MS;
}

export function completedSessionRecencyMs(session: {
  completedAt?: string | Date | null;
  updatedAt?: string | Date | null;
  playedOn?: string | Date | null;
  createdAt?: string | Date | null;
}) {
  for (const value of [
    session.completedAt,
    session.updatedAt,
    session.playedOn,
    session.createdAt,
  ]) {
    const ms = timestampMs(value);
    if (ms !== null) return ms;
  }

  return 0;
}

export function isInRecentOutcomePresentationWindow(
  session: Parameters<typeof completedSessionRecencyMs>[0],
  nowMs: number,
  windowMs: number
) {
  const completedAt = completedSessionRecencyMs(session);
  return completedAt > 0 && completedAt >= nowMs - windowMs;
}
