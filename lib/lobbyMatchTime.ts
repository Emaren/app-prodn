import type { LobbyMatchRow } from "@/lib/lobby";

type DateLike = string | number | Date;

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

export function pickLobbyMatchPlayedAt(match: LobbyMatchRow): DateLike | null {
  const candidates: unknown[] = [
    match.played_at,
    match.played_on,
    match.derived_played_on,
    match.created_at,
    match.createdAt,
    match.timestamp,
  ];

  for (const value of candidates) {
    const parsed = toValidDate(value);
    if (parsed) {
      return value as DateLike;
    }
  }

  return null;
}

export function getLobbyMatchPlayedAtMs(match: LobbyMatchRow) {
  const playedAt = pickLobbyMatchPlayedAt(match);
  if (!playedAt) return 0;

  const parsed = new Date(playedAt).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
