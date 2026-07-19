export const CHALLENGE_ACCEPTANCE_WINDOWS_HOURS = [24, 72, 168, 720] as const;
export const DEFAULT_CHALLENGE_ACCEPTANCE_HOURS = 72;
export const CHALLENGE_FUNDING_WINDOW_MS = 60 * 60 * 1000;
export const CHALLENGE_PLAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export type ChallengeScheduleMode = "open" | "exact";
export type ChallengeDeadlineKind = "acceptance" | "funding" | "play" | "match" | null;
export type ChallengeFinancialState =
  | "unfunded"
  | "creator_locked"
  | "opponent_locked"
  | "fully_locked"
  | "refund_due"
  | "refund_processing"
  | "refund_failed"
  | "refunded"
  | "settlement_pending"
  | "settled";

const TERMINAL_STATUSES = new Set([
  "completed",
  "forfeited",
  "declined",
  "cancelled",
  "canceled",
  "expired",
  "funding_expired",
  "play_expired",
  "no_show_left",
  "no_show_right",
  "double_no_show",
  "refunded",
]);

const FULL_REFUND_STATUSES = new Set([
  "declined",
  "cancelled",
  "canceled",
  "expired",
  "funding_expired",
  "play_expired",
]);

export function normalizeChallengeScheduleMode(
  value: string | null | undefined
): ChallengeScheduleMode {
  return value?.trim().toLowerCase() === "exact" ? "exact" : "open";
}

export function normalizeChallengeStatus(value: string | null | undefined) {
  const normalized = (value || "proposed").trim().toLowerCase();
  return normalized === "cancelled" ? "canceled" : normalized;
}

export function normalizeAcceptanceWindowHours(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return CHALLENGE_ACCEPTANCE_WINDOWS_HOURS.includes(
    parsed as (typeof CHALLENGE_ACCEPTANCE_WINDOWS_HOURS)[number]
  )
    ? parsed
    : DEFAULT_CHALLENGE_ACCEPTANCE_HOURS;
}

export function buildAcceptanceExpiry(createdAt: Date, hours: unknown) {
  return new Date(
    createdAt.getTime() + normalizeAcceptanceWindowHours(hours) * 60 * 60 * 1000
  );
}

export function buildFundingExpiry(acceptedAt: Date) {
  return new Date(acceptedAt.getTime() + CHALLENGE_FUNDING_WINDOW_MS);
}

export function buildPlayExpiry(fullyFundedAt: Date) {
  return new Date(fullyFundedAt.getTime() + CHALLENGE_PLAY_WINDOW_MS);
}

export function isTerminalChallengeStatus(value: string | null | undefined) {
  return TERMINAL_STATUSES.has(normalizeChallengeStatus(value));
}

export function isFullRefundStatus(value: string | null | undefined) {
  return FULL_REFUND_STATUSES.has(normalizeChallengeStatus(value));
}

export type ChallengeLifecycleProjectionInput = {
  status: string;
  scheduleMode?: string | null;
  scheduledAt?: Date | null;
  acceptanceExpiresAt?: Date | null;
  fundingExpiresAt?: Date | null;
  playExpiresAt?: Date | null;
  acceptedAt?: Date | null;
  challengerFundedAt?: Date | null;
  challengedFundedAt?: Date | null;
};

export type ChallengeLifecycleProjection = {
  scheduleMode: ChallengeScheduleMode;
  lifecycleState: string;
  headline: string;
  detail: string;
  active: boolean;
  deadlineKind: ChallengeDeadlineKind;
  deadlineAt: Date | null;
  exactMatchAt: Date | null;
};

/**
 * Projects one human lifecycle truth without mutating persistence. Deadlines that
 * have elapsed are displayed honestly even if the protected reconciler has not yet
 * claimed the row; money state remains a separate projection.
 */
export function projectChallengeLifecycle(
  input: ChallengeLifecycleProjectionInput,
  now = new Date()
): ChallengeLifecycleProjection {
  const status = normalizeChallengeStatus(input.status);
  const scheduleMode = normalizeChallengeScheduleMode(input.scheduleMode);
  const creatorFunded = Boolean(input.challengerFundedAt);
  const opponentFunded = Boolean(input.challengedFundedAt);
  const bothFunded = creatorFunded && opponentFunded;
  const accepted = Boolean(input.acceptedAt) || ["accepted", "terms_accepted"].includes(status);

  if (isTerminalChallengeStatus(status)) {
    const labels: Record<string, [string, string]> = {
      completed: ["Completed", "Replay result recorded."],
      forfeited: ["Forfeit", "The exact-time match closed without final proof."],
      declined: ["Declined", "The opponent declined this challenge."],
      canceled: ["Canceled", "The challenge was closed before completion."],
      expired: ["Expired", "The opponent did not accept before the invitation closed."],
      funding_expired: ["Funding expired", "Acceptance was recorded, but funding was not completed."],
      play_expired: ["Play window expired", "The funded play-anytime window closed without a verified match."],
      no_show_left: ["Creator no-show", "The creator missed the confirmed match time."],
      no_show_right: ["Opponent no-show", "The opponent missed the confirmed match time."],
      double_no_show: ["Double no-show", "Neither player checked in for the confirmed match time."],
      refunded: ["Refunded", "All required refund transfers are confirmed."],
    };
    const [headline, detail] = labels[status] ?? ["Closed", "This challenge is closed."];
    return {
      scheduleMode,
      lifecycleState: status,
      headline,
      detail,
      active: false,
      deadlineKind: null,
      deadlineAt: null,
      exactMatchAt: input.scheduledAt ?? null,
    };
  }

  if (!accepted && input.acceptanceExpiresAt && now >= input.acceptanceExpiresAt) {
    return {
      scheduleMode,
      lifecycleState: "expired",
      headline: "Expired",
      detail: "The acceptance window has closed. Refund reconciliation is next if funds were locked.",
      active: false,
      deadlineKind: null,
      deadlineAt: null,
      exactMatchAt: input.scheduledAt ?? null,
    };
  }

  if (accepted && !bothFunded && input.fundingExpiresAt && now >= input.fundingExpiresAt) {
    return {
      scheduleMode,
      lifecycleState: "funding_expired",
      headline: "Funding expired",
      detail: "The one-hour opponent funding window has closed.",
      active: false,
      deadlineKind: null,
      deadlineAt: null,
      exactMatchAt: input.scheduledAt ?? null,
    };
  }

  if (bothFunded && scheduleMode === "open" && input.playExpiresAt && now >= input.playExpiresAt) {
    return {
      scheduleMode,
      lifecycleState: "play_expired",
      headline: "Play window expired",
      detail: "No verified match arrived during the 30-day play-anytime window.",
      active: false,
      deadlineKind: null,
      deadlineAt: null,
      exactMatchAt: null,
    };
  }

  if (status === "live_confirmed") {
    return {
      scheduleMode,
      lifecycleState: "live",
      headline: "Live",
      detail: "The replay watcher has linked this match.",
      active: true,
      deadlineKind: null,
      deadlineAt: null,
      exactMatchAt: input.scheduledAt ?? null,
    };
  }

  if (bothFunded) {
    const hasExactTime = Boolean(input.scheduledAt);
    return {
      scheduleMode,
      lifecycleState: hasExactTime ? "scheduled" : "funded",
      headline: hasExactTime ? "Match scheduled" : "Match Ready",
      detail: hasExactTime
        ? "Both players are funded. Check-in opens ten minutes before the confirmed time."
        : "Both players are funded. Play anytime or propose an exact time.",
      active: true,
      deadlineKind: hasExactTime ? "match" : "play",
      deadlineAt: input.scheduledAt ?? input.playExpiresAt ?? null,
      exactMatchAt: input.scheduledAt ?? null,
    };
  }

  if (accepted) {
    return {
      scheduleMode,
      lifecycleState: creatorFunded ? "creator_funded" : opponentFunded ? "opponent_funded" : "accepted",
      headline: "Accepted · funding needed",
      detail: "Complete the matching deposit before the one-hour funding window closes.",
      active: true,
      deadlineKind: "funding",
      deadlineAt: input.fundingExpiresAt ?? null,
      exactMatchAt: input.scheduledAt ?? null,
    };
  }

  return {
    scheduleMode,
    lifecycleState: creatorFunded ? "creator_funded" : "proposed",
    headline: creatorFunded ? "Awaiting opponent" : "Challenge sent",
    detail: creatorFunded
      ? "Your WOLO is locked. The opponent can accept and match the deposit."
      : "The opponent can accept before the invitation closes.",
    active: true,
    deadlineKind: "acceptance",
    deadlineAt: input.acceptanceExpiresAt ?? null,
    exactMatchAt: input.scheduledAt ?? null,
  };
}

export type ChallengeSettlementEvidence = {
  status: string;
  amountWolo: number;
  txHash?: string | null;
};

export function projectChallengeFinancialState(input: {
  lifecycleStatus: string;
  totalFundingWolo: number;
  challengerFunded: boolean;
  challengedFunded: boolean;
  settlements?: ChallengeSettlementEvidence[];
}) {
  const totalFundingWolo = Math.max(0, input.totalFundingWolo);
  const fundedCount = Number(input.challengerFunded) + Number(input.challengedFunded);
  const fundedLiabilityWolo = totalFundingWolo * fundedCount;
  const settlements = input.settlements ?? [];
  const executed = settlements.filter(
    (row) => row.status === "executed" && Boolean(row.txHash?.trim())
  );
  const executedWolo = executed.reduce((sum, row) => sum + Math.max(0, row.amountWolo), 0);
  const allEvidenceExecuted =
    settlements.length > 0 && executed.length === settlements.length && executedWolo >= fundedLiabilityWolo;
  const refundResolution = isFullRefundStatus(input.lifecycleStatus);

  let state: ChallengeFinancialState;
  let label: string;
  let detail: string;

  if (fundedCount === 0) {
    state = "unfunded";
    label = "No WOLO locked";
    detail = "No verified Challenge deposit is recorded.";
  } else if (settlements.some((row) => row.status === "failed")) {
    state = "refund_failed";
    label = refundResolution ? "Refund failed" : "Settlement failed";
    detail = "A verified settlement attempt failed and remains safely retryable.";
  } else if (allEvidenceExecuted) {
    state = refundResolution ? "refunded" : "settled";
    label = refundResolution ? "Refunded" : "Settled";
    detail = `${executedWolo.toLocaleString()} WOLO in confirmed chain transfers.`;
  } else if (settlements.some((row) => ["planned", "executing", "retrying"].includes(row.status))) {
    state = "refund_processing";
    label = refundResolution ? "Refund processing" : "Settlement processing";
    detail = "The deterministic settlement rail has queued or broadcast the required transfer.";
  } else if (refundResolution) {
    state = "refund_due";
    label = "Refund due";
    detail = `${fundedLiabilityWolo.toLocaleString()} WOLO awaits verified return from Bet Escrow.`;
  } else if (["completed", "no_show_left", "no_show_right", "double_no_show"].includes(normalizeChallengeStatus(input.lifecycleStatus))) {
    state = "settlement_pending";
    label = "Result recorded · settlement pending";
    detail = "Game truth is final; chain settlement is still a separate pending step.";
  } else if (input.challengerFunded && input.challengedFunded) {
    state = "fully_locked";
    label = `${fundedLiabilityWolo.toLocaleString()} WOLO locked`;
    detail = "Both deposits are verified in Bet Escrow.";
  } else if (input.challengerFunded) {
    state = "creator_locked";
    label = `${totalFundingWolo.toLocaleString()} WOLO creator locked`;
    detail = "The creator deposit is verified in Bet Escrow.";
  } else {
    state = "opponent_locked";
    label = `${totalFundingWolo.toLocaleString()} WOLO opponent locked`;
    detail = "The opponent deposit is verified in Bet Escrow.";
  }

  return {
    state,
    label,
    detail,
    fundedLiabilityWolo,
    executedWolo,
    confirmedTransferCount: executed.length,
  };
}
