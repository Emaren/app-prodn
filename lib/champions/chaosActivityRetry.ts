/**
 * Process-local cache for costly read-only historical projections.
 * A failed cold read remains unavailable, never a successful zero-row snapshot.
 * A stale successful read remains usable while one eligible refresh runs.
 */
export function createStaleWhileRevalidateBackoff<T>({
  ttlMs,
  retryMs,
  now = Date.now,
}: {
  ttlMs: number;
  retryMs: number;
  now?: () => number;
}) {
  if (ttlMs <= 0 || retryMs <= 0) {
    throw new Error("The cache and failure cooldown must be positive");
  }

  let successful: { value: T; expiresAt: number } | null = null;
  let inflight: Promise<T> | null = null;
  let retryNotBefore = 0;
  let lastFailure: unknown = null;

  function refresh(read: () => Promise<T>): Promise<T> {
    if (inflight) return inflight;
    if (now() < retryNotBefore) {
      return Promise.reject(
        lastFailure ?? new Error("Historical activity temporarily unavailable"),
      );
    }

    const run = Promise.resolve()
      .then(read)
      .then(
        (value) => {
          successful = { value, expiresAt: now() + ttlMs };
          retryNotBefore = 0;
          lastFailure = null;
          return value;
        },
        (error: unknown) => {
          retryNotBefore = now() + retryMs;
          lastFailure = error;
          throw error;
        },
      )
      .finally(() => {
        if (inflight === run) inflight = null;
      });

    inflight = run;
    return run;
  }

  function get(
    read: () => Promise<T>,
    onBackgroundFailure: (error: unknown) => void = () => undefined,
  ): Promise<T> {
    const cached = successful;
    if (cached) {
      if (
        cached.expiresAt <= now() &&
        !inflight &&
        now() >= retryNotBefore
      ) {
        void refresh(read).catch(onBackgroundFailure);
      }
      return Promise.resolve(cached.value);
    }
    return refresh(read);
  }

  return { get };
}
