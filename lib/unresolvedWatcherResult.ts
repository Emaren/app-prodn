export const UNRESOLVED_WATCHER_RESULT_CODES = [
  "roster_missing",
  "winner_missing",
  "parser_unknown_fields",
  "final_proof_unparsed",
  "duplicate_or_alias_conflict",
  "replay_still_cooling_down",
  "incomplete_single_watcher_proof",
  "impossible_from_available_replay_data",
] as const;

export type UnresolvedWatcherResultCode =
  (typeof UNRESOLVED_WATCHER_RESULT_CODES)[number];

export type UnresolvedWatcherResult = {
  code: UnresolvedWatcherResultCode;
  label: "Winner unresolved" | "Needs parser review" | "Awaiting fuller proof";
  explanation: string;
  reviewNeeded: boolean;
};

type UnresolvedWatcherResultInput = {
  winner?: unknown;
  players?: Array<{ name?: unknown; winner?: unknown }> | null;
  playerCount?: number | null;
  state?: string | null;
  parseReason?: string | null;
  parseSource?: string | null;
  keyEvents?: unknown;
  eventType?: string | null;
  finalityStatus?: string | null;
  unparsedFinal?: boolean | null;
  finalAccepted?: boolean | null;
  reason?: string | null;
  waitMs?: number | null;
  watcherCount?: number | null;
};

const NON_WINNER_VALUES = new Set([
  "unknown",
  "undetermined",
  "unresolved",
  "none",
  "null",
  "n/a",
  "na",
  "parsing",
  "players parsing",
  "game in progress",
]);

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeResolvedWinner(value: unknown) {
  const winner = textValue(value);
  if (!winner || NON_WINNER_VALUES.has(winner.toLowerCase())) {
    return null;
  }
  return winner;
}

function readKeyEvents(value: unknown): Record<string, unknown> {
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

function result(
  code: UnresolvedWatcherResultCode,
  label: UnresolvedWatcherResult["label"],
  explanation: string,
  reviewNeeded: boolean
): UnresolvedWatcherResult {
  return { code, label, explanation, reviewNeeded };
}

export function classifyUnresolvedWatcherResult(
  input: UnresolvedWatcherResultInput
): UnresolvedWatcherResult | null {
  const players = Array.isArray(input.players) ? input.players : [];
  const namedPlayers = players.filter((player) => textValue(player?.name));
  const playerCount =
    typeof input.playerCount === "number" && Number.isFinite(input.playerCount)
      ? Math.max(0, Math.floor(input.playerCount))
      : namedPlayers.length;
  const winnerFlags = players.some((player) => player?.winner === true);
  const winner = normalizeResolvedWinner(input.winner);

  if (winner || winnerFlags) {
    return null;
  }

  const rawWinner = textValue(input.winner).toLowerCase();
  const keyEvents = readKeyEvents(input.keyEvents);
  const completionSource = textValue(keyEvents.completion_source);
  const eventType = textValue(input.eventType).toLowerCase();
  const finalityStatus = textValue(input.finalityStatus).toLowerCase();
  const parseReason = textValue(input.parseReason).toLowerCase();
  const reason = textValue(input.reason).toLowerCase();
  const state = textValue(input.state).toLowerCase();
  const combined = [
    eventType,
    finalityStatus,
    parseReason,
    reason,
    textValue(input.parseSource).toLowerCase(),
    completionSource.toLowerCase(),
  ].join(" ");
  const explicitlyUnknown = Boolean(rawWinner && NON_WINNER_VALUES.has(rawWinner));
  const finalish =
    state === "completed" ||
    input.finalAccepted === true ||
    keyEvents.completed === true ||
    Boolean(completionSource) ||
    combined.includes("final") ||
    combined.includes("resignation");

  if (
    input.unparsedFinal === true ||
    finalityStatus === "final_unparsed_proof" ||
    parseReason === "watcher_final_unparsed" ||
    combined.includes("final_unparsed")
  ) {
    return result(
      "final_proof_unparsed",
      "Needs parser review",
      "Final proof preserved but parser could not extract winner",
      true
    );
  }

  if (
    (eventType === "final_candidate_deferred" &&
      (reason === "final_candidate_cooldown" || !reason)) ||
    combined.includes("cooling") ||
    combined.includes("cooldown")
  ) {
    const seconds =
      typeof input.waitMs === "number" && input.waitMs > 0
        ? Math.max(1, Math.ceil(input.waitMs / 1000))
        : null;
    return result(
      "replay_still_cooling_down",
      "Awaiting fuller proof",
      `Replay still cooling down${seconds ? ` · ${seconds}s remaining` : ""}`,
      false
    );
  }

  if (
    eventType === "replay_detected_ignored" ||
    combined.includes("duplicate") ||
    combined.includes("alias_conflict") ||
    combined.includes("superseded_by_later_upload")
  ) {
    return result(
      "duplicate_or_alias_conflict",
      "Needs parser review",
      "Duplicate replay candidate ignored",
      false
    );
  }

  if (eventType === "final_candidate_accepted" || input.finalAccepted === true) {
    return null;
  }

  if (
    playerCount === 1 &&
    (finalish ||
      explicitlyUnknown ||
      eventType === "parse_pending" ||
      eventType === "parse_result_unknown_fields")
  ) {
    return result(
      "incomplete_single_watcher_proof",
      "Awaiting fuller proof",
      "Only one player detected; awaiting fuller proof",
      false
    );
  }

  if (
    combined.includes("impossible") ||
    combined.includes("unrecoverable") ||
    combined.includes("insufficient_replay_data")
  ) {
    return result(
      "impossible_from_available_replay_data",
      "Winner unresolved",
      "Winner is impossible to determine from the available replay data",
      true
    );
  }

  if (
    eventType === "parse_result_unknown_fields" ||
    combined.includes("unknown_fields") ||
    explicitlyUnknown
  ) {
    return result(
      "parser_unknown_fields",
      "Needs parser review",
      "Parser returned unknown replay fields; needs parser review",
      true
    );
  }

  if (playerCount === 0 && eventType === "parse_pending") {
    return result(
      "roster_missing",
      "Awaiting fuller proof",
      "Player roster missing; awaiting fuller proof",
      false
    );
  }

  if (playerCount >= 2 && finalish) {
    return result(
      "winner_missing",
      "Winner unresolved",
      "Replay parsed but winner field missing",
      true
    );
  }

  if (finalish) {
    return result(
      "impossible_from_available_replay_data",
      "Winner unresolved",
      "Winner is impossible to determine from the available replay data",
      true
    );
  }

  return null;
}
