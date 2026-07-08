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
  label: "Winner under review" | "Result review" | "Awaiting final proof";
  explanation: string;
  reviewNeeded: boolean;
};

export const REPLAY_TRUTH_CONFIDENCES = [
  "proven",
  "recovered",
  "inferred_low_confidence",
  "unresolved",
] as const;

export type ReplayTruthConfidence =
  (typeof REPLAY_TRUTH_CONFIDENCES)[number];

export const REPLAY_WINNER_TRUTH_REASON_CODES = [
  "stored_winner_field",
  "reliable_player_winner_flag",
  "recorded_resignation",
  "postgame_block",
  "scoreboard_completion",
  "manual_recovery",
  "uploader_opponent_inference_rejected",
  "generic_inference_rejected",
  "winner_missing",
  "no_postgame_block",
  "no_scores",
  "no_achievements",
  "no_resignation_event",
  "no_reliable_winner_flag",
  "no_completion_signal",
  "conflicting_winner_flags",
  "insufficient_final_signal",
] as const;

export type ReplayWinnerTruthReason =
  (typeof REPLAY_WINNER_TRUTH_REASON_CODES)[number];

export type ReplayWinnerTruth = {
  winner: string | null;
  candidateWinner: string | null;
  confidence: ReplayTruthConfidence;
  truthReasons: ReplayWinnerTruthReason[];
  publicLabel: string;
  statsEligible: boolean;
  bettingEligible: boolean;
  diagnosticSummary: string;
  neededEvidence: string[];
};

export type ReplayWinnerTruthInput = {
  winner: unknown;
  players?: Array<{ name?: unknown; winner?: unknown }> | null;
  parseReason?: string | null;
  parseSource?: string | null;
  keyEvents?: unknown;
  eventTypes?: unknown;
};

type UnresolvedWatcherResultInput = {
  winner?: unknown;
  players?: Array<{ name?: unknown; winner?: unknown }> | null;
  playerCount?: number | null;
  mapName?: unknown;
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
  "unknown map",
  "unknown player",
  "unknown opponent",
  "unknown result",
  "unknown battlefield",
  "undetermined",
  "unresolved",
  "map unresolved",
  "roster unresolved",
  "winner unresolved",
  "opponent unresolved",
  "none",
  "null",
  "n/a",
  "na",
  "parsing",
  "players parsing",
  "game in progress",
  "tbd",
  "to be determined",
  "-",
  "--",
]);

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePublicReplayText(value: unknown) {
  const text = textValue(value);
  if (!text || NON_WINNER_VALUES.has(text.toLowerCase())) {
    return null;
  }
  return text;
}

export function isUnknownishReplayValue(value: unknown) {
  return normalizePublicReplayText(value) === null;
}

export function publicReplayMapLabel(value: unknown, fallback = "Map unresolved") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return normalizePublicReplayText((value as { name?: unknown }).name) ?? fallback;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return normalizePublicReplayText((parsed as { name?: unknown }).name) ?? fallback;
      }
      if (typeof parsed === "string") {
        return normalizePublicReplayText(parsed) ?? fallback;
      }
    } catch {
      return normalizePublicReplayText(value) ?? fallback;
    }
  }

  return fallback;
}

export function publicReplayPlayerLabel(value: unknown, fallback = "Roster unresolved") {
  return normalizePublicReplayText(value) ?? fallback;
}

export function unresolvedReplayReviewLabel(parseReason: string | null | undefined) {
  const reason = textValue(parseReason).toLowerCase();
  if (reason.includes("final_unparsed") || reason.includes("unknown_fields")) {
    return "Parser review";
  }
  if (reason.includes("pending") || reason.includes("cooldown")) {
    return "Awaiting proof";
  }
  return "Needs review";
}

export function normalizeResolvedWinner(value: unknown) {
  return normalizePublicReplayText(value);
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

const UNRELIABLE_WINNER_INFERENCE_REASONS = new Set([
  "watcher_inferred_opponent_win_on_incomplete_1v1",
  "watcher_inferred_opponent_win_on_incomplete",
  "watcher_inferred_backfill",
]);

export function isUnreliableWinnerInference(
  parseReason: string | null | undefined,
  keyEvents?: unknown
) {
  const reason = textValue(parseReason).toLowerCase();
  if (
    UNRELIABLE_WINNER_INFERENCE_REASONS.has(reason) ||
    reason.startsWith("watcher_inferred_")
  ) {
    return true;
  }

  const inference = readKeyEvents(keyEvents).winner_inference;
  if (!inference || typeof inference !== "object" || Array.isArray(inference)) {
    return false;
  }

  const inferenceType = textValue(
    (inference as { type?: unknown }).type
  ).toLowerCase();
  return Boolean(inferenceType);
}

function truthBoolean(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function truthCount(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
  }
  return 0;
}

function hasArrayValues(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

function eventTypeSet(value: unknown) {
  return new Set(
    (Array.isArray(value) ? value : [])
      .map((entry) => textValue(entry).toLowerCase())
      .filter(Boolean)
  );
}

function winnerFlagNames(
  players: ReplayWinnerTruthInput["players"]
) {
  const names = new Set<string>();
  for (const player of Array.isArray(players) ? players : []) {
    if (!truthBoolean(player?.winner)) continue;
    const name = normalizePublicReplayText(player?.name);
    if (name) names.add(name);
  }
  return [...names];
}

function missingWinnerProofReasons(
  keyEvents: Record<string, unknown>,
  eventTypes: Set<string>,
  reliableWinnerFlag: boolean
) {
  const reasons: ReplayWinnerTruthReason[] = [];
  if (!truthBoolean(keyEvents.postgame_available)) {
    reasons.push("no_postgame_block");
  }
  if (
    !truthBoolean(keyEvents.has_scores) &&
    truthCount(keyEvents.player_score_count) === 0
  ) {
    reasons.push("no_scores");
  }
  if (
    !truthBoolean(keyEvents.has_achievements) &&
    truthCount(keyEvents.achievement_player_count) === 0
  ) {
    reasons.push("no_achievements");
  }
  if (
    !hasArrayValues(keyEvents.resigned_player_names) &&
    !hasArrayValues(keyEvents.resigned_player_numbers) &&
    !eventTypes.has("resign")
  ) {
    reasons.push("no_resignation_event");
  }
  if (!reliableWinnerFlag) {
    reasons.push("no_reliable_winner_flag");
  }
  if (
    !truthBoolean(keyEvents.completed) &&
    !textValue(keyEvents.completion_source)
  ) {
    reasons.push("no_completion_signal");
  }
  reasons.push("insufficient_final_signal");
  return reasons;
}

function neededWinnerEvidence(reasons: ReplayWinnerTruthReason[]) {
  const needed = new Set<string>();
  if (reasons.includes("no_postgame_block")) {
    needed.add("a parsed postgame block");
  }
  if (reasons.includes("no_reliable_winner_flag")) {
    needed.add("a reliable winner flag");
  }
  if (reasons.includes("no_resignation_event")) {
    needed.add("an explicit resignation or defeat event");
  }
  if (reasons.includes("no_scores") || reasons.includes("no_achievements")) {
    needed.add("a completed score or achievement table");
  }
  if (reasons.includes("no_completion_signal")) {
    needed.add("a decisive replay completion signal");
  }
  return [...needed];
}

function recoveredWinnerReason(parseReason: string) {
  return (
    parseReason.includes("manual_backfill") ||
    parseReason.includes("manual_override") ||
    parseReason.includes("repaired")
  );
}

export function resolveReplayWinnerTruth(
  input: ReplayWinnerTruthInput
): ReplayWinnerTruth {
  const keyEvents = readKeyEvents(input.keyEvents);
  const eventTypes = eventTypeSet(input.eventTypes);
  const parseReason = textValue(input.parseReason).toLowerCase();
  const storedWinner = normalizeResolvedWinner(input.winner);
  const flaggedWinners = winnerFlagNames(input.players);
  const reliableFlagWinner =
    flaggedWinners.length === 1 ? flaggedWinners[0] : null;
  const inferenceRejected = isUnreliableWinnerInference(
    input.parseReason,
    input.keyEvents
  );
  const resignationProof =
    hasArrayValues(keyEvents.resigned_player_names) ||
    hasArrayValues(keyEvents.resigned_player_numbers) ||
    eventTypes.has("resign") ||
    parseReason === "recorded_resignation_final" ||
    textValue(keyEvents.completion_source).toLowerCase() === "resignation";
  const postgameProof = truthBoolean(keyEvents.postgame_available);
  const scoreboardProof =
    truthBoolean(keyEvents.has_scores) ||
    truthBoolean(keyEvents.has_achievements) ||
    truthCount(keyEvents.player_score_count) > 0 ||
    truthCount(keyEvents.achievement_player_count) > 0;
  const decisivePlayerFlag =
    Boolean(reliableFlagWinner) &&
    (truthBoolean(keyEvents.completed) ||
      postgameProof ||
      scoreboardProof ||
      resignationProof);
  const candidateWinner = storedWinner ?? reliableFlagWinner;

  if (inferenceRejected) {
    const inference = readKeyEvents(input.keyEvents).winner_inference;
    const inferenceType =
      inference && typeof inference === "object" && !Array.isArray(inference)
        ? textValue((inference as { type?: unknown }).type).toLowerCase()
        : "";
    const rejectionReason: ReplayWinnerTruthReason =
      inferenceType === "uploader_incomplete_1v1_opponent" ||
      parseReason === "watcher_inferred_opponent_win_on_incomplete_1v1"
        ? "uploader_opponent_inference_rejected"
        : "generic_inference_rejected";
    const truthReasons = [
      rejectionReason,
      ...missingWinnerProofReasons(keyEvents, eventTypes, false),
    ];
    return {
      winner: null,
      candidateWinner,
      confidence: "inferred_low_confidence",
      truthReasons,
      publicLabel: "Winner under review",
      statsEligible: false,
      bettingEligible: false,
      diagnosticSummary: candidateWinner
        ? `Candidate ${candidateWinner} came only from a rejected replay inference; decisive winner proof is missing.`
        : "A low-confidence replay inference was rejected because decisive winner proof is missing.",
      neededEvidence: neededWinnerEvidence(truthReasons),
    };
  }

  if (storedWinner) {
    const truthReasons: ReplayWinnerTruthReason[] = ["stored_winner_field"];
    if (
      reliableFlagWinner &&
      reliableFlagWinner.toLowerCase() === storedWinner.toLowerCase()
    ) {
      truthReasons.push("reliable_player_winner_flag");
    }
    if (resignationProof) truthReasons.push("recorded_resignation");
    if (postgameProof) truthReasons.push("postgame_block");
    if (scoreboardProof) truthReasons.push("scoreboard_completion");
    if (recoveredWinnerReason(parseReason)) {
      truthReasons.push("manual_recovery");
    }
    const confidence: ReplayTruthConfidence = recoveredWinnerReason(parseReason)
      ? "recovered"
      : "proven";
    return {
      winner: storedWinner,
      candidateWinner: storedWinner,
      confidence,
      truthReasons,
      publicLabel: storedWinner,
      statsEligible: true,
      bettingEligible: true,
      diagnosticSummary:
        confidence === "recovered"
          ? `Winner ${storedWinner} was recovered from reviewed replay metadata.`
          : `Winner ${storedWinner} is supported by the stored replay result.`,
      neededEvidence: [],
    };
  }

  if (decisivePlayerFlag && reliableFlagWinner) {
    const truthReasons: ReplayWinnerTruthReason[] = [
      "reliable_player_winner_flag",
    ];
    if (resignationProof) truthReasons.push("recorded_resignation");
    if (postgameProof) truthReasons.push("postgame_block");
    if (scoreboardProof) truthReasons.push("scoreboard_completion");
    return {
      winner: reliableFlagWinner,
      candidateWinner: reliableFlagWinner,
      confidence: "recovered",
      truthReasons,
      publicLabel: reliableFlagWinner,
      statsEligible: true,
      bettingEligible: true,
      diagnosticSummary: `Winner ${reliableFlagWinner} was recovered from a decisive player result signal.`,
      neededEvidence: [],
    };
  }

  const truthReasons = missingWinnerProofReasons(
    keyEvents,
    eventTypes,
    false
  );
  if (flaggedWinners.length > 1) {
    truthReasons.unshift("conflicting_winner_flags");
  } else {
    truthReasons.unshift("winner_missing");
  }
  const lowConfidenceFlag = Boolean(reliableFlagWinner);
  return {
    winner: null,
    candidateWinner: reliableFlagWinner,
    confidence: lowConfidenceFlag
      ? "inferred_low_confidence"
      : "unresolved",
    truthReasons,
    publicLabel: "Winner under review",
    statsEligible: false,
    bettingEligible: false,
    diagnosticSummary: lowConfidenceFlag
      ? `Player flag for ${reliableFlagWinner} lacks a decisive completion, postgame, scoreboard, or resignation signal.`
      : "Replay did not expose a decisive winner signal.",
    neededEvidence: neededWinnerEvidence(truthReasons),
  };
}

export function resolveReliableReplayWinner(input: ReplayWinnerTruthInput) {
  const truth = resolveReplayWinnerTruth(input);
  if (!truth.statsEligible) {
    return null;
  }
  return truth.winner;
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
  const winnerTruth = resolveReplayWinnerTruth({
    winner: input.winner,
    players,
    parseReason: input.parseReason,
    parseSource: input.parseSource,
    keyEvents: input.keyEvents,
  });

  if (winnerTruth.statsEligible) {
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
  const hasKnownMap = normalizePublicReplayText(input.mapName) !== null;
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
    eventType === "final_candidate_reopened" ||
    reason === "replay_changed_after_final_acceptance"
  ) {
    return result(
      "replay_still_cooling_down",
      "Awaiting final proof",
      "Replay changed after final acceptance; live proof reopened",
      false
    );
  }

  if (!finalish && state === "live") {
    if (playerCount === 0) {
      return result(
        "roster_missing",
        "Awaiting final proof",
        "Player roster still parsing",
        false
      );
    }

    if (playerCount === 1) {
      return result(
        "incomplete_single_watcher_proof",
        "Awaiting final proof",
        "Only one player detected; awaiting fuller proof",
        false
      );
    }

    if (!hasKnownMap) {
      return result(
        "parser_unknown_fields",
        "Awaiting final proof",
        "Map unavailable; live replay metadata still parsing",
        false
      );
    }

    // A live replay is not expected to expose winner proof yet. Known roster and
    // map metadata are enough to present it as a normal active game.
    return null;
  }

  if (winnerTruth.confidence === "inferred_low_confidence") {
    return result(
      "impossible_from_available_replay_data",
      "Winner under review",
      winnerTruth.diagnosticSummary,
      true
    );
  }

  if (
    input.unparsedFinal === true ||
    finalityStatus === "final_unparsed_proof" ||
    parseReason === "watcher_final_unparsed" ||
    combined.includes("final_unparsed")
  ) {
    return result(
      "final_proof_unparsed",
      "Result review",
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
      "Awaiting final proof",
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
      "Result review",
      "Duplicate replay candidate ignored",
      false
    );
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
      "Awaiting final proof",
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
      "Winner under review",
      "Winner is impossible to determine from the available replay data",
      true
    );
  }

  if (playerCount >= 2 && finalish) {
    return result(
      "winner_missing",
      "Winner under review",
      "Replay parsed but winner field missing",
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
      "Result review",
      "Parser returned unknown replay fields; needs parser review",
      true
    );
  }

  if (playerCount === 0 && eventType === "parse_pending") {
    return result(
      "roster_missing",
      "Awaiting final proof",
      "Player roster missing; awaiting fuller proof",
      false
    );
  }

  if (finalish) {
    return result(
      "impossible_from_available_replay_data",
      "Winner under review",
      "Winner is impossible to determine from the available replay data",
      true
    );
  }

  return null;
}
