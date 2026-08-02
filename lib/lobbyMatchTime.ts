type DateLike = string | number | Date;
type PlayedAtValue = string | Date;

export type LobbyMatchTimeSource = {
  played_at?: DateLike | null;
  played_at_is_absolute?: boolean | null;
  watcher_file_mtime?: DateLike | null;
  played_on?: DateLike | null;
  derived_played_on?: DateLike | null;
  created_at?: DateLike | null;
  createdAt?: DateLike | null;
  timestamp?: DateLike | null;
  original_filename?: string | null;
  originalFilename?: string | null;
  replay_file?: string | null;
  replayFile?: string | null;
};

function stringHasExplicitZone(value: string) {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function toAbsoluteDate(value: unknown, explicitlyAbsolute = false) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  if (!explicitlyAbsolute && !stringHasExplicitZone(value)) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function originalValueOrDate(value: DateLike, parsed: Date): PlayedAtValue {
  return typeof value === "number" ? parsed : value;
}

export function pickLobbyMatchPlayedAt(match: LobbyMatchTimeSource): PlayedAtValue | null {
  const watcherMtime = toAbsoluteDate(match.watcher_file_mtime, true);
  if (watcherMtime && match.watcher_file_mtime !== null && match.watcher_file_mtime !== undefined) {
    return originalValueOrDate(match.watcher_file_mtime, watcherMtime);
  }

  // The API explicitly marks filename/source-local replay clocks as non-absolute.
  // Once that warning exists, do not silently replace the game time with row
  // creation or reprocessing time. Missing is more truthful than a false instant.
  if (match.played_at && match.played_at_is_absolute === false) {
    return null;
  }

  const candidates: Array<{ value: DateLike | null | undefined; absolute?: boolean }> = [
    { value: match.played_at, absolute: match.played_at_is_absolute === true },
    { value: match.played_on },
    { value: match.derived_played_on },
    { value: match.created_at },
    { value: match.createdAt },
    { value: match.timestamp },
  ];

  for (const candidate of candidates) {
    if (candidate.value === null || candidate.value === undefined) continue;
    const parsed = toAbsoluteDate(candidate.value, candidate.absolute === true);
    if (parsed) {
      return originalValueOrDate(candidate.value, parsed);
    }
  }

  return null;
}

export function getLobbyMatchPlayedAtMs(match: LobbyMatchTimeSource) {
  const playedAt = pickLobbyMatchPlayedAt(match);
  if (!playedAt) return 0;

  const parsed = new Date(playedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
