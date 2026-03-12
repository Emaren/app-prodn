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

function cleanVersionName(value: string) {
  return value.replace(/^Version\./, "").replace(/_/g, " ").trim();
}

export function shortHash(value: string | null | undefined, length = 12) {
  if (!value) return "n/a";
  return value.slice(0, length);
}

export function displayReplayFilename(originalFilename: string | null | undefined, replayFile: string | null | undefined) {
  return originalFilename || replayFile || "Replay file";
}

export function displayGameVersion(value: string | null | undefined) {
  if (!value) return "Unknown";

  const trimmed = value.trim();
  if (!trimmed) return "Unknown";

  return cleanVersionName(trimmed);
}

export function displayGameType(value: string | null | undefined) {
  if (!value) return "Unknown";

  const trimmed = value.trim();
  if (!trimmed) return "Unknown";

  const tupleMatch = trimmed.match(/^\(<Version\.([^:>]+):\s*\d+>,\s*'([^']+)'/);
  if (tupleMatch) {
    const [, version, build] = tupleMatch;
    return `${cleanVersionName(version)} match (${build})`;
  }

  if (trimmed.startsWith("Version.")) {
    return `${cleanVersionName(trimmed)} match`;
  }

  return trimmed.replace(/\s+/g, " ");
}

export function isInferredOutcome(parseReason: string | null | undefined) {
  return Boolean(parseReason && parseReason.startsWith("watcher_inferred_"));
}

export function isResignationOutcome(parseReason: string | null | undefined) {
  if (!parseReason) return false;

  return (
    parseReason.startsWith("watcher_inferred_") ||
    parseReason.includes("disconnect") ||
    parseReason.includes("resign")
  );
}

export function winnerLabel(winner: string | null | undefined, parseReason?: string | null | undefined) {
  void parseReason;
  if (winner && winner !== "Unknown") {
    return winner;
  }
  return "Unknown";
}

export function outcomeBadgeLabel(
  parseReason: string | null | undefined,
  winner?: string | null | undefined
) {
  if (!winner || winner === "Unknown") return null;
  return isResignationOutcome(parseReason) ? "Win by resignation" : null;
}

export function normalizeDurationSeconds(value: number | null | undefined) {
  if (!value || value <= 0) return null;

  const rounded = Math.floor(value);

  // Some parsed HD replays still come through in milliseconds for shorter games.
  if (rounded > 12 * 3600) {
    return Math.max(1, Math.floor(rounded / 1000));
  }

  return rounded;
}

export function formatDurationLabel(value: number | null | undefined) {
  const totalSeconds = normalizeDurationSeconds(value);
  if (!totalSeconds) return "Unknown";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
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
