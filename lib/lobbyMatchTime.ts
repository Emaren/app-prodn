type DateLike = string | number | Date;
type PlayedAtValue = string | Date;

export type LobbyMatchTimeSource = {
  played_at?: DateLike | null;
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

const FILENAME_TIME_PATTERNS = [
  /@?(\d{4})[._-](\d{2})[._-](\d{2})[ T_-]?(\d{2})[:._-]?(\d{2})[:._-]?(\d{2})/,
  /\b(\d{4})(\d{2})(\d{2})[ T_-]?(\d{2})(\d{2})(\d{2})\b/,
];

function toValidDate(value: unknown) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function derivePlayedAtFromFilename(match: LobbyMatchTimeSource) {
  const filenames = [
    match.original_filename,
    match.originalFilename,
    match.replay_file,
    match.replayFile,
  ];

  for (const value of filenames) {
    if (typeof value !== "string" || !value.trim()) continue;

    const basename = value.trim().split(/[\\/]/).pop() ?? value.trim();
    for (const pattern of FILENAME_TIME_PATTERNS) {
      const matchParts = basename.match(pattern);
      if (!matchParts) continue;

      const [, year, month, day, hour, minute, second] = matchParts;
      const playedAt = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
      const parsed = new Date(playedAt);

      if (Number.isFinite(parsed.getTime())) {
        return playedAt;
      }
    }
  }

  return null;
}

export function pickLobbyMatchPlayedAt(match: LobbyMatchTimeSource): PlayedAtValue | null {
  const candidates: unknown[] = [
    match.played_at,
    match.played_on,
    match.derived_played_on,
    derivePlayedAtFromFilename(match),
    match.created_at,
    match.createdAt,
    match.timestamp,
  ];

  for (const value of candidates) {
    const parsed = toValidDate(value);
    if (parsed) {
      return typeof value === "number" ? parsed : (value as PlayedAtValue);
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
