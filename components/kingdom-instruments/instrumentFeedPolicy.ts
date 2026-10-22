/**
 * Read-only instrument display policy. A failed/aborted reader cannot inherit
 * an earlier measured payload as if that observation were current.
 */
export type InstrumentFeed = {
  payload: Record<string, unknown> | null;
  state: "loading" | "observed" | "unavailable";
  fetchedAt: string | null;
};

export type InstrumentFeeds = Record<string, InstrumentFeed>;

function replaceSources(
  previous: InstrumentFeeds,
  urls: Iterable<string>,
  state: InstrumentFeed["state"],
): InstrumentFeeds {
  const next = { ...previous };
  for (const url of urls) {
    next[url] = { state, payload: null, fetchedAt: null };
  }
  return next;
}

export function beginInstrumentReads(
  previous: InstrumentFeeds,
  urls: readonly string[],
): InstrumentFeeds {
  return replaceSources(previous, urls, "loading");
}

export function hideInstrumentReads(
  previous: InstrumentFeeds,
  urls: readonly string[],
): InstrumentFeeds {
  return replaceSources(previous, urls, "unavailable");
}

/**
 * A batch can have some successful readers and some timed-out readers. Only
 * unresolved URLs may become unavailable; successful observations are retained.
 * The caller must fence the batch's AbortController before applying this.
 */
export function expirePendingInstrumentReads(
  previous: InstrumentFeeds,
  pending: ReadonlySet<string>,
): InstrumentFeeds {
  const next = { ...previous };
  for (const url of pending) {
    if (next[url]?.state === "loading") {
      next[url] = { state: "unavailable", payload: null, fetchedAt: null };
    }
  }
  return next;
}
