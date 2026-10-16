/**
 * An imported replay's server temporary-file timestamp is not a game clock.
 * Compare any purported game time to independent, original client filename
 * and file mtime hints. These are NOT a Steam rating or a new authority:
 * they only provide a fail-closed contradiction check.
 *
 * File mtime can be later than a game (copying, backups), so it is used only
 * to reject played_on that is implausibly AFTER that recorded mtime.
 * Source-local replay filename time may have timezone ambiguity (48h slack).
 */
const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
const DATED_REPLAY_NAME =
  /@(\d{4})[._-](\d{2})[._-](\d{2})[\s_-](\d{2})[:._-]?(\d{2})[:._-]?(\d{2})/;
const COMPACT_REPLAY_NAME =
  /(?:^|[^0-9])(\d{4})(\d{2})(\d{2})[\s_-]?(\d{2})(\d{2})(\d{2})(?!\d)/;

function clientFilenameClock(name: string | null | undefined): number | null {
  if (!name) return null;
  const m = name.match(DATED_REPLAY_NAME) ?? name.match(COMPACT_REPLAY_NAME);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  const value = Date.UTC(year, month - 1, day, hour, minute, second);
  if (!Number.isFinite(value)) return null;
  const date = new Date(value);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month ||
      date.getUTCDate() !== day || date.getUTCHours() !== hour ||
      date.getUTCMinutes() !== minute || date.getUTCSeconds() !== second) {
    return null;
  }
  return value;
}

function originalFileMtime(events: unknown): number | null {
  if (!events || typeof events !== "object" || Array.isArray(events)) return null;
  const watcher = (events as Record<string, unknown>).watcher_upload;
  if (!watcher || typeof watcher !== "object" || Array.isArray(watcher)) return null;
  const raw = (watcher as Record<string, unknown>).file_mtime_ms;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const value = String(raw);
  if (!/^[0-9]{13}$/.test(value)) return null;
  const ms = Number(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * False means: independent original-file evidence contradicts the claimed
 * played_on time. It does not rewrite games, W/L statistics or source rating.
 * If no original evidence exists, this check alone cannot validate a clock;
 * other existing authenticated source gates still apply.
 */
export function isReplayRatingClockConsistent(input: {
  playedOn: Date | string | null | undefined;
  originalFilename: string | null | undefined;
  keyEvents?: unknown;
}): boolean {
  if (!input.playedOn) return false;
  const playedMs = new Date(input.playedOn).getTime();
  if (!Number.isFinite(playedMs)) return false;
  const namedMs = clientFilenameClock(input.originalFilename);
  if (namedMs !== null && Math.abs(playedMs - namedMs) > TWO_DAYS_MS) return false;
  const mtimeMs = originalFileMtime(input.keyEvents);
  if (mtimeMs !== null && playedMs > mtimeMs + TWO_DAYS_MS) return false;
  return true;
}
