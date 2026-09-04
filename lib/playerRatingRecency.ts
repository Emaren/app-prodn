export type ReplayRatingClock =
  | Date
  | string
  | null
  | undefined;

export type ReplayRatingObservation = {
  iso: string;
  ms: number;
};

export function isWatcherCurrentRatingSource(
  value: string | null | undefined,
) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return (
    normalized === "watcher_live" ||
    normalized === "watcher_final"
  );
}

/*
 * Current Steam rating chronology is replay-event truth.
 *
 * Upload time, parser execution time, GameStats.createdAt, and generic
 * timestamp fallbacks do not prove when the embedded rating was current.
 */
export function parseReplayRatingObservation(
  value: ReplayRatingClock,
): ReplayRatingObservation | null {
  if (!value) {
    return null;
  }

  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  const ms = parsed.getTime();

  if (!Number.isFinite(ms)) {
    return null;
  }

  return {
    ms,
    iso: new Date(ms).toISOString(),
  };
}

/*
 * An undated replay may bootstrap an identity with no known rating.
 *
 * Once a rating exists, an undated historical import can never replace it.
 * A dated observation may replace an undated bootstrap or an older dated
 * observation.
 */
export function shouldReplaceCurrentReplayRating(input: {
  currentHasRating: boolean;
  currentObservedAt: ReplayRatingClock;
  nextPlayedOn: ReplayRatingClock;
}) {
  const next =
    parseReplayRatingObservation(
      input.nextPlayedOn,
    );

  if (!next) {
    return !input.currentHasRating;
  }

  const current =
    parseReplayRatingObservation(
      input.currentObservedAt,
    );

  if (!current) {
    return true;
  }

  return next.ms >= current.ms;
}
