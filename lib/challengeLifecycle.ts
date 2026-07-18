export const CHALLENGE_ACCEPTANCE_WINDOW_OPTIONS_HOURS = [24, 72, 168, 720] as const;
export const CHALLENGE_DEFAULT_ACCEPTANCE_WINDOW_HOURS = 72;
export const CHALLENGE_FUNDING_WINDOW_MS = 60 * 60 * 1000;
export const CHALLENGE_PLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const CHALLENGE_EXACT_START_MIN_MS = 2 * 60 * 1000;
export const CHALLENGE_EXACT_START_MAX_MS = 30 * 24 * 60 * 60 * 1000;

export type ChallengeTimingMode = "open" | "scheduled";

export type ChallengeLifecyclePhase =
  | "awaiting_opponent"
  | "awaiting_creator_funding"
  | "awaiting_opponent_funding"
  | "match_ready"
  | "time_proposed"
  | "scheduled"
  | "checkin_open"
  | "ready"
  | "live"
  | "result_pending"
  | "completed"
  | "declined"
  | "expired"
  | "funding_expired"
  | "cancelled"
  | "no_show"
  | "refunded"
  | "forfeited";

export type ChallengeLifecycleInput = {
  status: string;
  timingMode?: string | null;
  createdAt: Date;
  acceptBy?: Date | null;
  acceptedAt?: Date | null;
  fundBy?: Date | null;
  playBy?: Date | null;
  matchTime?: Date | null;
  matchTimeConfirmedAt?: Date | null;
  expiredAt?: Date | null;
  cancelledAt?: Date | null;
  declinedAt?: Date | null;
  resultAt?: Date | null;
  liveConfirmedAt?: Date | null;
  challengerFundedAt?: Date | null;
  challengedFundedAt?: Date | null;
  challengerCheckedInAt?: Date | null;
  challengedCheckedInAt?: Date | null;
};

export type ChallengeLifecycleSnapshot = {
  phase: ChallengeLifecyclePhase;
  timingMode: ChallengeTimingMode;
  terminal: boolean;
  active: boolean;
  awaitingActor: "opponent" | "creator" | "both" | null;
  deadlineAt: Date | null;
  shouldExpireAcceptance: boolean;
  shouldExpireFunding: boolean;
  shouldExpirePlayWindow: boolean;
  exactTime: Date | null;
  canPlayAnytime: boolean;
};

function normalizeStatus(status: string | null | undefined) {
  return (status || "").trim().toLowerCase();
}

export function normalizeChallengeTimingMode(value: unknown): ChallengeTimingMode {
  return value === "scheduled" ? "scheduled" : "open";
}

export function normalizeAcceptanceWindowHours(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return CHALLENGE_DEFAULT_ACCEPTANCE_WINDOW_HOURS;
  const rounded = Math.round(parsed);
  return (CHALLENGE_ACCEPTANCE_WINDOW_OPTIONS_HOURS as readonly number[]).includes(rounded)
    ? rounded
    : CHALLENGE_DEFAULT_ACCEPTANCE_WINDOW_HOURS;
}

export function buildChallengeAcceptBy(createdAt = new Date(), hours = CHALLENGE_DEFAULT_ACCEPTANCE_WINDOW_HOURS) {
  return new Date(createdAt.getTime() + normalizeAcceptanceWindowHours(hours) * 60 * 60 * 1000);
}

export function buildChallengeFundBy(acceptedAt = new Date(), hardDeadline?: Date | null) {
  const candidate = new Date(acceptedAt.getTime() + CHALLENGE_FUNDING_WINDOW_MS);
  if (hardDeadline && !Number.isNaN(hardDeadline.getTime()) && hardDeadline.getTime() < candidate.getTime()) {
    return new Date(hardDeadline);
  }
  return candidate;
}

export function buildChallengePlayBy(fundedAt = new Date()) {
  return new Date(fundedAt.getTime() + CHALLENGE_PLAY_WINDOW_MS);
}

export function validateExactMatchTime(value: Date | null, now = new Date()) {
  if (!value || Number.isNaN(value.getTime())) return "Choose a valid exact match time.";
  const delta = value.getTime() - now.getTime();
  if (delta < CHALLENGE_EXACT_START_MIN_MS) return "Schedule the match at least two minutes ahead.";
  if (delta > CHALLENGE_EXACT_START_MAX_MS) return "Keep exact match times inside the next 30 days.";
  return null;
}

export function deriveChallengeLifecycle(
  input: ChallengeLifecycleInput,
  now = new Date()
): ChallengeLifecycleSnapshot {
  const status = normalizeStatus(input.status);
  const timingMode = normalizeChallengeTimingMode(input.timingMode);
  const creatorFunded = Boolean(input.challengerFundedAt);
  const opponentFunded = Boolean(input.challengedFundedAt);
  const bothFunded = creatorFunded && opponentFunded;
  const accepted = Boolean(input.acceptedAt) || [
    "accepted",
    "terms_accepted",
    "opponent_funded",
    "funded",
    "left_checked_in",
    "right_checked_in",
    "ready",
    "live_confirmed",
    "completed",
  ].includes(status);
  const exactTime = input.matchTime ?? null;
  const terminalMap: Record<string, ChallengeLifecyclePhase> = {
    declined: "declined",
    expired: "expired",
    funding_expired: "funding_expired",
    canceled: "cancelled",
    cancelled: "cancelled",
    refunded: "refunded",
    forfeited: "forfeited",
    completed: "completed",
    no_show_left: "no_show",
    no_show_right: "no_show",
    double_no_show: "no_show",
  };
  const terminalPhase = terminalMap[status];
  if (terminalPhase) {
    return {
      phase: terminalPhase,
      timingMode,
      terminal: true,
      active: false,
      awaitingActor: null,
      deadlineAt: null,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  if (status === "live_confirmed") {
    return {
      phase: "live",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: null,
      deadlineAt: input.playBy ?? exactTime,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  const shouldExpireAcceptance = !accepted && Boolean(input.acceptBy && input.acceptBy.getTime() <= now.getTime());
  if (shouldExpireAcceptance) {
    return {
      phase: "expired",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: "opponent",
      deadlineAt: input.acceptBy ?? null,
      shouldExpireAcceptance: true,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  if (!accepted) {
    return {
      phase: "awaiting_opponent",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: "opponent",
      deadlineAt: input.acceptBy ?? null,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  const shouldExpireFunding = !bothFunded && Boolean(input.fundBy && input.fundBy.getTime() <= now.getTime());
  if (shouldExpireFunding) {
    return {
      phase: "funding_expired",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: creatorFunded ? "opponent" : opponentFunded ? "creator" : "both",
      deadlineAt: input.fundBy ?? null,
      shouldExpireAcceptance: false,
      shouldExpireFunding: true,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  if (!bothFunded) {
    return {
      phase: creatorFunded ? "awaiting_opponent_funding" : "awaiting_creator_funding",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: creatorFunded ? "opponent" : "creator",
      deadlineAt: input.fundBy ?? null,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  const shouldExpirePlayWindow = Boolean(
    input.playBy && input.playBy.getTime() <= now.getTime() && !input.resultAt && !input.liveConfirmedAt
  );
  if (shouldExpirePlayWindow) {
    return {
      phase: "expired",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: null,
      deadlineAt: input.playBy ?? null,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: true,
      exactTime,
      canPlayAnytime: false,
    };
  }

  if (status === "ready" || (input.challengerCheckedInAt && input.challengedCheckedInAt)) {
    return {
      phase: "ready",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: null,
      deadlineAt: exactTime ?? input.playBy ?? null,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: timingMode === "open" && !exactTime,
    };
  }

  if (status === "left_checked_in" || status === "right_checked_in") {
    return {
      phase: "checkin_open",
      timingMode,
      terminal: false,
      active: true,
      awaitingActor: status === "left_checked_in" ? "opponent" : "creator",
      deadlineAt: exactTime,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  if (exactTime) {
    return {
      phase: input.matchTimeConfirmedAt ? "scheduled" : "time_proposed",
      timingMode: "scheduled",
      terminal: false,
      active: true,
      awaitingActor: input.matchTimeConfirmedAt ? null : "opponent",
      deadlineAt: exactTime,
      shouldExpireAcceptance: false,
      shouldExpireFunding: false,
      shouldExpirePlayWindow: false,
      exactTime,
      canPlayAnytime: false,
    };
  }

  return {
    phase: "match_ready",
    timingMode: "open",
    terminal: false,
    active: true,
    awaitingActor: null,
    deadlineAt: input.playBy ?? null,
    shouldExpireAcceptance: false,
    shouldExpireFunding: false,
    shouldExpirePlayWindow: false,
    exactTime: null,
    canPlayAnytime: true,
  };
}

export type ChallengeMoneyState =
  | "unfunded"
  | "partially_funded"
  | "locked"
  | "refund_pending"
  | "partially_refunded"
  | "refunded"
  | "settlement_pending"
  | "settled"
  | "settlement_failed";

export function deriveChallengeMoneyState(input: {
  challengerFunded: boolean;
  challengedFunded: boolean;
  terminalStatus?: string | null;
  plannedTransferCount?: number;
  executedTransferCount?: number;
  failedTransferCount?: number;
}) : ChallengeMoneyState {
  const fundedCount = Number(input.challengerFunded) + Number(input.challengedFunded);
  const planned = Math.max(0, input.plannedTransferCount ?? 0);
  const executed = Math.max(0, input.executedTransferCount ?? 0);
  const failed = Math.max(0, input.failedTransferCount ?? 0);
  const terminal = normalizeStatus(input.terminalStatus);

  if (failed > 0) return "settlement_failed";
  if (planned > 0 && executed >= planned) {
    return ["canceled", "cancelled", "expired", "funding_expired", "refunded"].includes(terminal)
      ? "refunded"
      : "settled";
  }
  if (planned > 0 && executed > 0) {
    return ["canceled", "cancelled", "expired", "funding_expired", "refunded"].includes(terminal)
      ? "partially_refunded"
      : "settlement_pending";
  }
  if (planned > 0) {
    return ["canceled", "cancelled", "expired", "funding_expired", "refunded"].includes(terminal)
      ? "refund_pending"
      : "settlement_pending";
  }
  if (fundedCount === 2) return "locked";
  if (fundedCount === 1) return "partially_funded";
  return "unfunded";
}
