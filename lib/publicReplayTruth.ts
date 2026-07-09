import { resolveReplayOwnerDisplay } from "@/lib/replayOwnerDisplay";
import {
  classifyUnresolvedWatcherResult,
  normalizePublicReplayText,
  resolveReplayWinnerTruth,
  type UnresolvedWatcherResult,
} from "./unresolvedWatcherResult.ts";
import {
  applyReplayAdjudicationToGameStats,
  getReplayAdjudicationForGameStatsId,
} from "@/lib/replayAdjudications";

export type PublicGameStatsLike = {
  id?: number | string | null;
  replayHash?: string | null;
  replay_hash?: string | null;
  replayFile?: string | null;
  replay_file?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  winner?: string | null;
  players?: unknown;
  map?: unknown;
  mapName?: string | null;
  map_name?: string | null;
  key_events?: unknown;
  keyEvents?: unknown;
  event_types?: unknown;
  eventTypes?: unknown;
  parse_reason?: string | null;
  parseReason?: string | null;
  parse_source?: string | null;
  parseSource?: string | null;
  is_final?: boolean | null;
  isFinal?: boolean | null;
  timestamp?: string | Date | null;
  played_on?: string | Date | null;
  playedOn?: string | Date | null;
  createdAt?: string | Date | null;
  created_at?: string | Date | null;
  parse_iteration?: number | null;
  parseIteration?: number | null;
  unresolvedResult?: UnresolvedWatcherResult | null;
  [key: string]: unknown;
};

function readString(row: PublicGameStatsLike, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function readNumber(row: PublicGameStatsLike, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return 0;
}

function readTimeMs(row: PublicGameStatsLike) {
  for (const value of [
    row.played_on,
    row.playedOn,
    row.timestamp,
    row.createdAt,
    row.created_at,
  ]) {
    if (!value) continue;
    const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function readRecord(value: unknown): Record<string, unknown> {
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
      return {};
    }
  }
  return {};
}

function readPlayers(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(
      (player): player is Record<string, unknown> =>
        Boolean(player) && typeof player === "object" && !Array.isArray(player)
    );
  }
  if (typeof value === "string") {
    try {
      return readPlayers(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function readMapName(row: PublicGameStatsLike) {
  const direct = normalizePublicReplayText(
    row.mapName ?? row.map_name
  );
  if (direct) return direct;
  return normalizePublicReplayText(readRecord(row.map).name);
}

function basename(value: string) {
  return value.split(/[\\/]/).pop()?.trim() || value.trim();
}

export function publicReplayParseReason(row: PublicGameStatsLike) {
  return readString(row, "parse_reason", "parseReason").toLowerCase();
}

export function publicReplayParseSource(row: PublicGameStatsLike) {
  return readString(row, "parse_source", "parseSource").toLowerCase();
}

export function publicReplayIsFinal(row: PublicGameStatsLike) {
  return row.is_final === true || row.isFinal === true;
}

export function publicReplayWinnerTruth(row: PublicGameStatsLike) {
  return resolveReplayWinnerTruth({
    winner: row.winner,
    players: readPlayers(row.players),
    parseReason: readString(row, "parse_reason", "parseReason") || null,
    parseSource: readString(row, "parse_source", "parseSource") || null,
    keyEvents: row.key_events ?? row.keyEvents,
    eventTypes: row.event_types ?? row.eventTypes,
  });
}

export function isPublicResolvedGameStatsRow(row: PublicGameStatsLike) {
  const adjudication = getReplayAdjudicationForGameStatsId(row.id);
  if (adjudication?.affectsStats) return publicReplayIsFinal(row);
  return publicReplayIsFinal(row) && publicReplayWinnerTruth(row).statsEligible;
}

export function publicReplayIdentity(row: PublicGameStatsLike) {
  const keyEvents = readRecord(row.key_events ?? row.keyEvents);
  const platformMatchId = normalizePublicReplayText(keyEvents.platform_match_id);
  if (platformMatchId) return `platform:${platformMatchId.toLowerCase()}`;

  const watcherUpload = readRecord(keyEvents.watcher_upload);
  const watcherSessionId = normalizePublicReplayText(
    watcherUpload.watcher_session_id
  );
  const file = readString(
    row,
    "original_filename",
    "originalFilename",
    "replay_file",
    "replayFile"
  );

  // Live replay hashes change while the file grows. The watcher session and
  // original filename remain stable across those parse iterations.
  if (watcherSessionId && file) {
    return `watcher:${watcherSessionId.toLowerCase()}:${basename(file).toLowerCase()}`;
  }
  if (file && publicReplayParseSource(row).startsWith("watcher")) {
    return `watcher-file:${basename(file).toLowerCase()}`;
  }

  const hash = readString(row, "replayHash", "replay_hash");
  if (hash) return `hash:${hash.toLowerCase()}`;
  if (file) return `file:${basename(file).toLowerCase()}`;
  return `row:${String(row.id ?? "")}`;
}

function metadataScore(row: PublicGameStatsLike) {
  const players = readPlayers(row.players);
  const knownPlayers = players.filter((player) =>
    normalizePublicReplayText(player.name)
  ).length;
  let score = knownPlayers * 50;
  if (readMapName(row)) score += 100;
  if (publicReplayIsFinal(row)) score += 500;
  if (getReplayAdjudicationForGameStatsId(row.id)?.affectsStats) score += 1400;
  else if (publicReplayWinnerTruth(row).statsEligible) score += 1000;
  score += Math.min(250, Math.max(0, readNumber(row, "parse_iteration", "parseIteration")));
  return score;
}

function comparePublicRows(left: PublicGameStatsLike, right: PublicGameStatsLike) {
  const scoreDiff = metadataScore(left) - metadataScore(right);
  if (scoreDiff !== 0) return scoreDiff;
  const timeDiff = readTimeMs(left) - readTimeMs(right);
  if (timeDiff !== 0) return timeDiff;
  return readNumber(left, "id") - readNumber(right, "id");
}

function clearUnsafeWinnerFields<T extends PublicGameStatsLike>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  next["winner"] = null;

  for (const key of [
    "winnerName",
    "winner_name",
    "winningTeam",
    "winning_team",
  ]) {
    if (key in next) next[key] = null;
  }

  const players = readPlayers(next["players"]);
  if (players.length > 0) {
    next["players"] = players.map((player) => ({
      ...player,
      winner: null,
    }));
  }

  const proof = next["proof"];
  if (proof && typeof proof === "object" && !Array.isArray(proof)) {
    const nextProof: Record<string, unknown> = {
      ...(proof as Record<string, unknown>),
    };
    for (const key of [
      "winner",
      "winnerName",
      "winner_name",
      "winningTeam",
      "winning_team",
    ]) {
      if (key in nextProof) nextProof[key] = null;
    }
    next["proof"] = nextProof;
  }

  return next as T;
}

function sanitizePublicMetadataFields<T extends PublicGameStatsLike>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  const map = readRecord(row.map);
  if (Object.keys(map).length > 0) {
    next["map"] = {
      ...map,
      name: normalizePublicReplayText(map.name),
      size: normalizePublicReplayText(map.size),
    };
  }
  for (const key of ["mapName", "map_name"]) {
    if (key in next) next[key] = normalizePublicReplayText(next[key]);
  }

  if (Array.isArray(row.players)) {
    next["players"] = readPlayers(row.players).flatMap((player) => {
      const name = normalizePublicReplayText(player.name);
      if (!name) return [];
      return [{
        ...player,
        name,
        civilization_name: normalizePublicReplayText(
          player.civilization_name
        ),
        civilization:
          typeof player.civilization === "string"
            ? normalizePublicReplayText(player.civilization)
            : player.civilization,
      }];
    });
  }

  const owner = resolveReplayOwnerDisplay(row);
  next["ownerPlayerName"] = owner.ownerPlayerName;
  next["owner_player_name"] = owner.ownerPlayerName;
  next["ownerDisplayName"] = owner.ownerDisplayName;
  next["ownerDisplaySource"] = owner.ownerDisplaySource;
  next["ownerWatcherId"] = owner.ownerWatcherId;

  return next as T;
}

function isManualPublicResultReason(parseReason: string | null | undefined) {
  const reason = String(parseReason || "").trim().toLowerCase();
  return (
    reason === "manual_override" ||
    reason === "manual_recovery" ||
    reason.includes("manual_backfill") ||
    reason.includes("manual_recovery") ||
    reason.includes("manual_override")
  );
}

function publicWinnerFlagIsTrue(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function trustedManualPublicWinner(row: PublicGameStatsLike) {
  const parseReason = readString(row, "parse_reason", "parseReason") || "";
  if (!isManualPublicResultReason(parseReason)) return null;

  const storedWinner = normalizePublicReplayText(
    readString(row, "winner", "winnerName", "winner_name")
  );
  if (!storedWinner) return null;

  const winnerKey = storedWinner.trim().toLowerCase();
  const players = readPlayers(row.players);

  const matchingWinnerFlag = players.some((player) => {
    const playerName = normalizePublicReplayText(player.name);
    return Boolean(
      playerName &&
      playerName.trim().toLowerCase() === winnerKey &&
      publicWinnerFlagIsTrue(player.winner)
    );
  });

  return matchingWinnerFlag ? storedWinner : null;
}

export function toPublicGameStatsRow<T extends PublicGameStatsLike>(row: T): T {
  const adjudicated = applyReplayAdjudicationToGameStats(row);
  if (getReplayAdjudicationForGameStatsId(row.id)) {
    return sanitizePublicMetadataFields(adjudicated);
  }

  const publicRow = sanitizePublicMetadataFields(row);

  const trustedManualWinner = trustedManualPublicWinner(row);
  if (trustedManualWinner) {
    const next: Record<string, unknown> = { ...publicRow };
    next["winner"] = trustedManualWinner;
    next["winnerProof"] = "manual_winner_flag";
    next["reviewNeeded"] = false;
    next["unresolvedResult"] = null;
    return next as T;
  }

  const parseReason = readString(row, "parse_reason", "parseReason") || "";
  const inferredFallbackWinner =
    readString(row, "winner", "winnerName", "winner_name") || "";

  const isHistoricalInferredWinnerFallback =
    publicReplayIsFinal(row) &&
    inferredFallbackWinner.length > 0 &&
    inferredFallbackWinner.toLowerCase() !== "unknown" &&
    (
      parseReason === "watcher_inferred_opponent_win_on_incomplete_1v1" ||
      parseReason === "watcher_inferred_opponent_win_on_incomplete"
    );

  if (isHistoricalInferredWinnerFallback) {
    const next: Record<string, unknown> = { ...publicRow };

    // Product truth policy:
    // The old incomplete-1v1 opponent inference remains the foreground fallback.
    // It is not perfect proof, but it is good enough for immediate public results.
    // Disputes/adjudication overlays still override it before this branch.
    next["winner"] = inferredFallbackWinner;
    next["unresolvedResult"] = null;
    next["reviewNeeded"] = false;
    next["winnerProof"] = "historical_inferred_fallback";

    return next as T;
  }

  const truth = publicReplayWinnerTruth(row);
  if (truth.statsEligible) return publicRow;

  const noCapturedWinnerReason = readString(row, "parse_reason", "parseReason") || "";
  const isQuietCompletedNoWinner =
    publicReplayIsFinal(row) &&
    (
      noCapturedWinnerReason === "hd_final_parse_match_fallback" ||
      noCapturedWinnerReason === "repaired_parse_match_fallback" ||
      noCapturedWinnerReason === "recorded_resignation_final" ||
      noCapturedWinnerReason === "watcher_final_unparsed" ||
      noCapturedWinnerReason === "watcher_final_submission"
    );

  if (isQuietCompletedNoWinner) {
    const next: Record<string, unknown> = clearUnsafeWinnerFields(publicRow);

    // Product truth policy:
    // If no winner can be captured, do not put the match in a scary manual-review state.
    // It is simply completed with no winner captured unless someone disputes it.
    next["unresolvedResult"] = {
      code: "winner_not_captured",
      label: "Completed",
      explanation: "Match completed, but no reliable winner was captured from the replay data.",
      reviewNeeded: false,
    };
    next["reviewNeeded"] = false;
    next["winnerProof"] = "not_captured";

    return next as T;
  }

  const players = readPlayers(row.players);
  const next: Record<string, unknown> = clearUnsafeWinnerFields(publicRow);
  next["unresolvedResult"] =
    row.unresolvedResult ??
    classifyUnresolvedWatcherResult({
      winner: row.winner,
      players,
      playerCount: players.length,
      mapName: readMapName(row),
      state: publicReplayIsFinal(row) ? "completed" : "live",
      parseReason: readString(row, "parse_reason", "parseReason") || null,
      parseSource: readString(row, "parse_source", "parseSource") || null,
      keyEvents: row.key_events ?? row.keyEvents,
    });
  return next as T;
}

export function sanitizePublicLiveGamesSnapshot<
  T extends Record<string, unknown>
>(snapshot: T): T {
  const sanitize = (value: unknown) =>
    Array.isArray(value)
      ? value.map((item) =>
          item && typeof item === "object"
            ? toPublicGameStatsRow(item as PublicGameStatsLike)
            : item
        )
      : value;

  return {
    ...snapshot,
    activeSessions: sanitize(snapshot.activeSessions),
    recentlyCompletedSessions: sanitize(snapshot.recentlyCompletedSessions),
    recentMatches: sanitize(snapshot.recentMatches),
  } as T;
}

export function cleanPublicGameRows<T extends PublicGameStatsLike>(
  rows: T[],
  options: { includeReview?: boolean; includeLive?: boolean } = {}
): T[] {
  const includeReview = options.includeReview ?? true;
  const includeLive = options.includeLive ?? false;
  const byIdentity = new Map<string, T>();

  for (const row of rows) {
    if (
      !includeLive &&
      !publicReplayIsFinal(row) &&
      publicReplayParseSource(row).startsWith("watcher")
    ) {
      continue;
    }
    if (!includeReview && !isPublicResolvedGameStatsRow(row)) continue;

    const key = publicReplayIdentity(row);
    const current = byIdentity.get(key);
    if (!current || comparePublicRows(row, current) > 0) {
      byIdentity.set(key, row);
    }
  }

  return [...byIdentity.values()]
    .sort((left, right) => readTimeMs(right) - readTimeMs(left))
    .map((row) => toPublicGameStatsRow(row));
}
