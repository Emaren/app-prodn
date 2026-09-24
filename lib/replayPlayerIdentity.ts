function text(value: unknown) {
  return typeof value === "string"
    ? value.replace(/\s+/g, " ").trim()
    : "";
}

export function normalizeReplayPlayerName(value: unknown) {
  return text(value).toLocaleLowerCase("en-US");
}

export function normalizeReplaySteamId(value: unknown) {
  const normalized = text(value);
  return /^\d{15,20}$/.test(normalized)
    ? normalized
    : null;
}

export function canonicalReplayStablePlayerKey(
  name: string,
  steamId: string | null
) {
  return steamId
    ? `steam:${steamId}`
    : `name:${normalizeReplayPlayerName(name)}`;
}
