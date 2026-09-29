export type WatcherBattleStartEvidence = {
  canonicalSessionKey: string;
  startedAt: Date;
};

export type WatcherBattleStartIndex = Map<
  string,
  WatcherBattleStartEvidence | null
>;

export type WatcherBattleStartSession = {
  sessionKey: string;
  identityAliases?: readonly string[] | null;
  createdAt: string | Date | null | undefined;
};

function normalizeSessionIdentity(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function validDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/**
 * Index the server-stabilized Watcher start fence by canonical session identity
 * and every exact promotion alias.
 *
 * An alias claimed by two different canonical sessions is ambiguous and loses
 * authority entirely. We never choose by timestamp, row order, or display name.
 */
export function buildWatcherBattleStartIndex(
  sessions: readonly WatcherBattleStartSession[]
): WatcherBattleStartIndex {
  const index: WatcherBattleStartIndex = new Map();

  for (const session of sessions) {
    const canonicalSessionKey = normalizeSessionIdentity(session.sessionKey);
    const startedAt = validDate(session.createdAt);
    if (!canonicalSessionKey || !startedAt) continue;

    const identities = new Set(
      [session.sessionKey, ...(session.identityAliases ?? [])]
        .map(normalizeSessionIdentity)
        .filter(Boolean)
    );

    for (const identity of identities) {
      const existing = index.get(identity);

      if (existing === null) continue;

      if (!existing) {
        index.set(identity, {
          canonicalSessionKey,
          startedAt: new Date(startedAt),
        });
        continue;
      }

      if (existing.canonicalSessionKey !== canonicalSessionKey) {
        index.set(identity, null);
        continue;
      }

      if (startedAt.getTime() < existing.startedAt.getTime()) {
        index.set(identity, {
          canonicalSessionKey,
          startedAt: new Date(startedAt),
        });
      }
    }
  }

  return index;
}

export function resolveWatcherBattleStartedAt(
  index: WatcherBattleStartIndex,
  sessionKey: string | null | undefined
) {
  const identity = normalizeSessionIdentity(sessionKey);
  if (!identity) return null;
  const evidence = index.get(identity);
  return evidence ? new Date(evidence.startedAt) : null;
}

export function earliestBattleStartedAt(
  values: readonly (Date | null | undefined)[]
) {
  let earliest: Date | null = null;

  for (const value of values) {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) continue;
    if (!earliest || value.getTime() < earliest.getTime()) {
      earliest = new Date(value);
    }
  }

  return earliest;
}
