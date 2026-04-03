import {
  pickLobbyMatchPlayedAt,
  type LobbyMatchTimeSource,
} from "@/lib/lobbyMatchTime";

type ReplayPlayerRecord = Record<string, unknown>;

const EARLY_EXIT_PARSE_REASON = "hd_early_exit_under_60s";

const HD_CIVILIZATION_NAMES: Record<number, string> = {
  1: "Britons",
  2: "Franks",
  3: "Goths",
  4: "Teutons",
  5: "Japanese",
  6: "Chinese",
  7: "Byzantines",
  8: "Persians",
  9: "Saracens",
  10: "Turks",
  11: "Vikings",
  12: "Mongols",
  13: "Celts",
  14: "Spanish",
  15: "Aztecs",
  16: "Mayans",
  17: "Huns",
  18: "Koreans",
  19: "Italians",
  20: "Indians",
  21: "Incas",
  22: "Magyars",
  23: "Slavs",
  24: "Portuguese",
  25: "Ethiopians",
  26: "Malians",
  27: "Berbers",
  28: "Khmer",
  29: "Malay",
  30: "Burmese",
  31: "Vietnamese",
};

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

export function readPlayedAt(value: LobbyMatchTimeSource) {
  return pickLobbyMatchPlayedAt(value);
}

function cleanVersionName(value: string) {
  return value.replace(/^Version\./, "").replace(/_/g, " ").trim();
}

function titleCaseWords(value: string) {
  return value.replace(/\b([a-z])/g, (match) => match.toUpperCase());
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

export function isEarlyExitNoResult(parseReason: string | null | undefined) {
  return parseReason === EARLY_EXIT_PARSE_REASON;
}

export function isResignationOutcome(parseReason: string | null | undefined) {
  if (!parseReason) return false;
  if (isEarlyExitNoResult(parseReason)) return false;

  return (
    parseReason.startsWith("watcher_inferred_") ||
    parseReason.includes("disconnect") ||
    parseReason.includes("resign")
  );
}

export function winnerLabel(winner: string | null | undefined, parseReason?: string | null | undefined) {
  if (isEarlyExitNoResult(parseReason)) {
    return "No rated result";
  }
  if (winner && winner !== "Unknown") {
    return winner;
  }
  return "Unknown";
}

export function outcomeBadgeLabel(
  parseReason: string | null | undefined,
  winner?: string | null | undefined
) {
  if (isEarlyExitNoResult(parseReason)) return "Under 60s drop";
  if (!winner || winner === "Unknown") return null;
  return isResignationOutcome(parseReason) ? "Win by resignation" : null;
}

export function displayParseReason(value: string | null | undefined) {
  if (!value) return "Unknown parse reason";

  const trimmed = value.trim();
  if (!trimmed) return "Unknown parse reason";

  switch (trimmed) {
    case "watcher_or_browser":
      return "Manual upload";
    case "watcher":
      return "Watcher upload";
    case "browser":
      return "Browser upload";
    case "file_upload":
      return "File upload";
    case "unspecified":
      return "Recorded parse";
    case "watcher_inferred_opponent_win_on_incomplete_1v1":
      return "Replay inference";
    case "watcher_inferred_opponent_win_on_incomplete":
      return "Replay inference";
    case "watcher_inferred_backfill":
      return "Replay backfill";
    case "recorded_resignation_final":
      return "Recorded resignation";
    case EARLY_EXIT_PARSE_REASON:
      return "Under 60s drop";
    default:
      break;
  }

  if (trimmed.startsWith("watcher_inferred_")) {
    return "Replay inference";
  }

  return titleCaseWords(trimmed.replace(/_/g, " "));
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
    case "duplicate_reviewed_match":
      return "Reviewed Match";
    default:
      return status.replace(/_/g, " ");
  }
}

export function displayPlayerName(player: ReplayPlayerRecord) {
  const name = player.name;
  return typeof name === "string" && name.trim() ? name : "Unknown player";
}

export function readPlayerCivilizationLabel(player: ReplayPlayerRecord) {
  const named = player.civilization_name;
  if (typeof named === "string" && named.trim()) {
    return named.trim();
  }

  const value = player.civilization;
  if (typeof value === "number" && Number.isFinite(value)) {
    return HD_CIVILIZATION_NAMES[Math.round(value)] || `Unknown (${Math.round(value)})`;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return "Unknown";
}

function readNumericPlayerField(player: ReplayPlayerRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = player[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.round(value);
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.round(parsed);
      }
    }
  }

  return null;
}

export function readPlayerSteamRmRating(player: ReplayPlayerRecord) {
  return readNumericPlayerField(player, "steam_rm_rating", "hd_rm_rating", "rate_snapshot");
}

export function readPlayerSteamDmRating(player: ReplayPlayerRecord) {
  return readNumericPlayerField(player, "steam_dm_rating", "hd_dm_rating");
}

export function readPlayerSteamId(player: ReplayPlayerRecord) {
  for (const key of ["steam_id", "steamId", "user_id"]) {
    const value = player[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return String(Math.trunc(value));
    }
  }

  return null;
}
