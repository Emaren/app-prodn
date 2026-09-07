import { isEarlyExitNoResult, isResignationOutcome } from "./gameStatsView.ts";
import { normalizeResolvedWinner } from "./unresolvedWatcherResult.ts";

type SanitizedLobbyWinnerInput = {
  winner?: unknown;
  winnerProof?: unknown;
  reviewNeeded?: unknown;
  unresolvedResult?: unknown;
  humanConfirmedDesync?: unknown;
  disconnect_detected?: unknown;
  disconnectDetected?: unknown;
  parse_reason?: unknown;
  parseReason?: unknown;
  key_events?: unknown;
  keyEvents?: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function flagged(value: unknown) {
  return value === true || value === "true" || value === 1 || value === "1";
}

/**
 * Present a winner already accepted by toPublicGameStatsRow. This does not
 * infer a result from a scalar/flag or grant statistics/settlement authority.
 * Human adjudications and historical fallback keep their existing UI path.
 */
export function presentSanitizedLobbyWinner(row: SanitizedLobbyWinnerInput): {
  headline: string;
  pill: "Win by resignation" | "Replay result";
} | null {
  if (
    !["trusted_structured_result", "replay_winner_truth", "manual_winner_flag"]
      .includes(typeof row.winnerProof === "string" ? row.winnerProof : "") ||
    row.reviewNeeded !== false ||
    row.unresolvedResult != null
  ) {
    return null;
  }

  const keyEvents = record(row.key_events ?? row.keyEvents);
  const parseReasonValue = row.parse_reason ?? row.parseReason;
  const parseReason = typeof parseReasonValue === "string"
    ? parseReasonValue.trim().toLowerCase()
    : "";
  if (
    flagged(row.humanConfirmedDesync) ||
    flagged(row.disconnect_detected) ||
    flagged(row.disconnectDetected) ||
    flagged(keyEvents?.disconnect_detected) ||
    parseReason.startsWith("watcher_inferred_") ||
    isEarlyExitNoResult(parseReason)
  ) {
    return null;
  }

  const winner = normalizeResolvedWinner(row.winner);
  if (!winner) return null;

  return {
    headline: winner,
    pill: isResignationOutcome(parseReason) ? "Win by resignation" : "Replay result",
  };
}
