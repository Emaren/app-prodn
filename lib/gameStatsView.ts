type ReplayPlayerRecord = Record<string, unknown>;

export function parsePlayers(value: unknown): ReplayPlayerRecord[] {
  if (Array.isArray(value)) {
    return value.filter((player): player is ReplayPlayerRecord => Boolean(player) && typeof player === "object");
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((player): player is ReplayPlayerRecord => Boolean(player) && typeof player === "object")
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function readMapRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { name: value };
    }
  }

  return {};
}

export function readMapName(value: unknown) {
  const record = readMapRecord(value);
  const name = record.name;
  return typeof name === "string" && name.trim() ? name : "Unknown Map";
}

export function readMapSize(value: unknown) {
  const record = readMapRecord(value);
  const size = record.size;
  return typeof size === "string" && size.trim() ? size : "Unknown";
}

export function readPlayedAt(value: { played_on?: Date | string | null; timestamp?: Date | string | null }) {
  return value.played_on ?? value.timestamp ?? null;
}

export function shortHash(value: string | null | undefined, length = 12) {
  if (!value) return "n/a";
  return value.slice(0, length);
}

export function displayReplayFilename(originalFilename: string | null | undefined, replayFile: string | null | undefined) {
  return originalFilename || replayFile || "Replay file";
}

export function isInferredOutcome(parseReason: string | null | undefined) {
  return Boolean(parseReason && parseReason.startsWith("watcher_inferred_"));
}

export function winnerLabel(winner: string | null | undefined, parseReason: string | null | undefined) {
  if (winner && winner !== "Unknown") {
    return isInferredOutcome(parseReason) ? `${winner} (inferred)` : winner;
  }
  return "Unknown";
}

export function stringifyJson(value: unknown) {
  try {
    return JSON.stringify(value ?? null, null, 2);
  } catch {
    return JSON.stringify({ error: "Unable to serialize value" }, null, 2);
  }
}

export function parseStatusLabel(status: string) {
  switch (status) {
    case "stored":
      return "Stored";
    case "parse_failed":
      return "Parse Failed";
    case "duplicate_final":
      return "Duplicate Final";
    default:
      return status.replace(/_/g, " ");
  }
}

export function displayPlayerName(player: ReplayPlayerRecord) {
  const name = player.name;
  return typeof name === "string" && name.trim() ? name : "Unknown player";
}
