/**
 * One process-local Watcher V3 current-account refresh gate.
 *
 * Successful snapshots live for 15s. A failed attempt permits a new retry
 * only after a separate 30s cooldown; it never turns UNKNOWN into [].
 * A last-known-good snapshot survives failed background refreshes.
 * No shared state, database writes, new schema or cross-process authority.
 */
type Snapshot<T> = {
  value: T[];
  expiresAt: number;
};

export function createCurrentWatcherAccountStateRefreshGate<T>(options: {
  successTtlMs: number;
  failureCooldownMs: number;
  now?: () => number;
  onBackgroundError?: (error: unknown) => void;
}) {
  const {
    successTtlMs,
    failureCooldownMs,
    now = () => Date.now(),
    onBackgroundError = () => {},
  } = options;
  if (
    !Number.isSafeInteger(successTtlMs) ||
    !Number.isSafeInteger(failureCooldownMs) ||
    successTtlMs <= 0 ||
    failureCooldownMs <= 0
  ) {
    throw new Error("Invalid Watcher refresh timing contract");
  }

  let snapshot: Snapshot<T> | null = null;
  let pending: Promise<T[]> | null = null;
  let retryNotBefore = 0;
  let lastError: unknown = null;
  let generation = 0;

  function refresh(load: () => Promise<T[]>): Promise<T[]> {
    if (pending) return pending;

    const issuedGeneration = generation;
    const run: Promise<T[]> = Promise.resolve()
      .then(load)
      .then((rows) => {
        if (issuedGeneration === generation) {
          snapshot = { value: rows, expiresAt: now() + successTtlMs };
          lastError = null;
          retryNotBefore = 0;
        }
        return rows;
      })
      .catch((error: unknown) => {
        if (issuedGeneration === generation) {
          lastError = error;
          retryNotBefore = now() + failureCooldownMs;
        }
        throw error;
      })
      .finally(() => {
        if (pending === run) pending = null;
      });

    pending = run;
    return run;
  }

  function read(load: () => Promise<T[]>): Promise<T[]> {
    const current = now();
    if (snapshot) {
      // Never block a page on an expensive historical refresh while a
      // genuine last-known-good snapshot exists, even when it has expired.
      const value = snapshot.value;
      if (current >= snapshot.expiresAt &&
          current >= retryNotBefore &&
          !pending) {
        void refresh(load).catch(onBackgroundError);
      }
      return Promise.resolve(value);
    }

    if (pending) return pending;
    if (current < retryNotBefore) {
      // A cold failure remains unavailable. Never invent a [] snapshot.
      return Promise.reject(lastError ?? new Error("Watcher state unavailable"));
    }
    return refresh(load);
  }

  function invalidate(): void {
    generation += 1;
    snapshot = null;
    pending = null;
    retryNotBefore = 0;
    lastError = null;
  }

  return { read, invalidate };
}
