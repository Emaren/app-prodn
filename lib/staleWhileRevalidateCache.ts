type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

/**
 * Small process-local stale-while-revalidate cache.
 *
 * - First caller waits for the loader.
 * - Concurrent cold callers share the same in-flight Promise.
 * - Fresh callers receive the cached value immediately.
 * - Once stale, callers still receive the last good value immediately
 *   while one background refresh runs.
 * - Failed refreshes never replace the last good value.
 *
 * This intentionally does not depend on Next's Data Cache semantics.
 */
export function createStaleWhileRevalidateCache<T>(
  loader: () => Promise<T>,
  ttlMs: number,
) {
  let entry: CacheEntry<T> | null = null;
  let inFlight: Promise<T> | null = null;

  const refresh = (): Promise<T> => {
    if (inFlight) {
      return inFlight;
    }

    const promise = loader().then((value) => {
      entry = {
        value,
        expiresAt: Date.now() + ttlMs,
      };

      return value;
    });

    inFlight = promise;

    void promise
      .finally(() => {
        if (inFlight === promise) {
          inFlight = null;
        }
      })
      .catch(() => {
        // The original Promise still carries the error to a cold caller.
        // A background refresh failure simply keeps the last good value.
      });

    return promise;
  };

  return async (): Promise<T> => {
    if (!entry) {
      return refresh();
    }

    if (Date.now() >= entry.expiresAt && !inFlight) {
      void refresh().catch(() => {
        // Preserve stale-but-good data until a later refresh succeeds.
      });
    }

    return entry.value;
  };
}
