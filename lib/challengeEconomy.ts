export const CHALLENGE_CHECKIN_WINDOW_MS = 10 * 60 * 1000;
export const CHALLENGE_NEAR_CHECKIN_WINDOW_MS = 20 * 60 * 1000;
export const CHALLENGE_TERM_MAX_WOLO = 5_000;

export type ScheduledMatchPersistedStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed"
  | "forfeited"
  | "proposed"
  | "terms_accepted"
  | "creator_funded"
  | "opponent_funded"
  | "funded"
  | "left_checked_in"
  | "right_checked_in"
  | "ready"
  | "live_confirmed"
  | "no_show_left"
  | "no_show_right"
  | "double_no_show"
  | "refunded"
  | "canceled";

export type ScheduledMatchDisplayState =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "completed"
  | "forfeited"
  | "proposed"
  | "terms_accepted"
  | "creator_funded"
  | "opponent_funded"
  | "funded"
  | "checkin_open"
  | "left_checked_in"
  | "right_checked_in"
  | "ready"
  | "live"
  | "no_show_left"
  | "no_show_right"
  | "double_no_show"
  | "refunded"
  | "canceled";

export type ScheduledMatchResolutionSurface = {
  label: string | null;
  guarantee: string | null;
  wager: string | null;
  treasury: string | null;
};

export type ScheduledMatchEconomySurface = {
  hasTerms: boolean;
  wagerAmountWolo: number;
  guaranteeAmountWolo: number;
  totalFundingWolo: number;
  statusLabel: string;
  statusDetail: string;
  creatorFundedAt: string | null;
  creatorFundingTxHash: string | null;
  creatorFundingWalletAddress: string | null;
  opponentFundedAt: string | null;
  opponentFundingTxHash: string | null;
  opponentFundingWalletAddress: string | null;
  leftCheckedInAt: string | null;
  rightCheckedInAt: string | null;
  checkInOpensAt: string;
  checkInClosesAt: string;
  checkInWindowState: "disabled" | "upcoming" | "open" | "closed";
  countdownMode: "opens_in" | "closes_in" | null;
  countdownTargetAt: string | null;
  resolution: ScheduledMatchResolutionSurface;
  readyForSettlement: boolean;
  settlementReadyAt: string | null;
};

type ChallengeEconomyInput = {
  status: string;
  scheduledAt: Date;
  acceptedAt?: Date | null;
  resultAt?: Date | null;
  liveConfirmedAt?: Date | null;
  settlementReadyAt?: Date | null;
  wagerAmountWolo?: number | null;
  guaranteeAmountWolo?: number | null;
  challengerFundedAt?: Date | null;
  challengerFundingTxHash?: string | null;
  challengerFundingWalletAddress?: string | null;
  challengedFundedAt?: Date | null;
  challengedFundingTxHash?: string | null;
  challengedFundingWalletAddress?: string | null;
  challengerCheckedInAt?: Date | null;
  challengedCheckedInAt?: Date | null;
};

function formatWolo(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
}

export function normalizeChallengeWoloAmount(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && Number.isFinite(parsed) ? parsed : null;
}

export function validateChallengeTermsAmounts(
  wagerAmountWolo: number | null,
  guaranteeAmountWolo: number | null
) {
  const normalizedWager = Number.isInteger(wagerAmountWolo) ? wagerAmountWolo : null;
  const normalizedGuarantee = Number.isInteger(guaranteeAmountWolo) ? guaranteeAmountWolo : null;

  if (normalizedWager === null || normalizedWager < 1) {
    return "Set Wolo Wager to at least 1 WOLO.";
  }

  if (normalizedGuarantee === null || normalizedGuarantee < 1) {
    return "Set Match Guarantee to at least 1 WOLO.";
  }

  if (
    normalizedWager > CHALLENGE_TERM_MAX_WOLO ||
    normalizedGuarantee > CHALLENGE_TERM_MAX_WOLO
  ) {
    return `Keep each scheduled-match term at ${CHALLENGE_TERM_MAX_WOLO.toLocaleString()} WOLO or below for now.`;
  }

  return null;
}

export function normalizeScheduledMatchStatus(value: string | null | undefined) {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) {
    return "proposed" as ScheduledMatchPersistedStatus;
  }

  if (normalized === "cancelled") {
    return "canceled" as ScheduledMatchPersistedStatus;
  }

  return normalized as ScheduledMatchPersistedStatus;
}

export function buildCheckInOpenAt(scheduledAt: Date) {
  return new Date(scheduledAt.getTime() - CHALLENGE_CHECKIN_WINDOW_MS);
}

export function buildChallengeEconomySurface(
  input: ChallengeEconomyInput,
  now = new Date()
): {
  persistedStatus: ScheduledMatchPersistedStatus;
  displayState: ScheduledMatchDisplayState;
  economy: ScheduledMatchEconomySurface;
} {
  const wagerAmountWolo = Math.max(0, input.wagerAmountWolo ?? 0);
  const guaranteeAmountWolo = Math.max(0, input.guaranteeAmountWolo ?? 0);
  const totalFundingWolo = wagerAmountWolo + guaranteeAmountWolo;
  const hasTerms = totalFundingWolo > 0;
  const rawStatus = normalizeScheduledMatchStatus(input.status);
  const checkInOpensAt = buildCheckInOpenAt(input.scheduledAt);
  const checkInClosesAt = input.scheduledAt;
  const creatorFunded = Boolean(input.challengerFundedAt);
  const opponentFunded = Boolean(input.challengedFundedAt);
  const bothFunded = creatorFunded && opponentFunded;
  const leftCheckedIn = Boolean(input.challengerCheckedInAt);
  const rightCheckedIn = Boolean(input.challengedCheckedInAt);
  const readyForSettlement =
    rawStatus === "completed" ||
    rawStatus === "no_show_left" ||
    rawStatus === "no_show_right" ||
    rawStatus === "double_no_show" ||
    rawStatus === "refunded";

  if (!hasTerms) {
    const legacyDisplayState: ScheduledMatchDisplayState =
      rawStatus === "accepted"
        ? "accepted"
        : rawStatus === "declined"
          ? "declined"
          : rawStatus === "completed"
            ? "completed"
            : rawStatus === "forfeited"
              ? "forfeited"
              : rawStatus === "canceled"
                ? "cancelled"
                : "pending";

    const legacyStatusLabel =
      legacyDisplayState === "accepted"
        ? "Accepted"
        : legacyDisplayState === "completed"
          ? "Completed"
          : legacyDisplayState === "forfeited"
            ? "Forfeit"
            : legacyDisplayState === "declined"
              ? "Declined"
              : legacyDisplayState === "cancelled"
                ? "Cancelled"
                : "Awaiting acceptance";
    const legacyStatusDetail =
      legacyDisplayState === "accepted"
        ? "Legacy scheduled match without economy terms."
        : legacyDisplayState === "completed"
          ? "Legacy result stored."
          : legacyDisplayState === "forfeited"
            ? "Legacy start window expired."
            : legacyDisplayState === "declined"
              ? "Legacy challenge declined."
              : legacyDisplayState === "cancelled"
                ? "Legacy challenge cancelled."
                : "Legacy challenge awaiting acceptance.";

    return {
      persistedStatus: rawStatus,
      displayState: legacyDisplayState,
      economy: {
        hasTerms: false,
        wagerAmountWolo,
        guaranteeAmountWolo,
        totalFundingWolo,
        statusLabel: legacyStatusLabel,
        statusDetail: legacyStatusDetail,
        creatorFundedAt: null,
        creatorFundingTxHash: null,
        creatorFundingWalletAddress: null,
        opponentFundedAt: null,
        opponentFundingTxHash: null,
        opponentFundingWalletAddress: null,
        leftCheckedInAt: null,
        rightCheckedInAt: null,
        checkInOpensAt: checkInOpensAt.toISOString(),
        checkInClosesAt: checkInClosesAt.toISOString(),
        checkInWindowState: "disabled",
        countdownMode: null,
        countdownTargetAt: null,
        resolution: {
          label: null,
          guarantee: null,
          wager: null,
          treasury: null,
        },
        readyForSettlement: legacyDisplayState === "completed" || legacyDisplayState === "forfeited",
        settlementReadyAt: input.settlementReadyAt?.toISOString() ?? null,
      },
    };
  }

  const timeUntilCheckInOpen = checkInOpensAt.getTime() - now.getTime();
  const checkInWindowState: ScheduledMatchEconomySurface["checkInWindowState"] = !bothFunded
    ? "disabled"
    : now.getTime() < checkInOpensAt.getTime()
      ? "upcoming"
      : now.getTime() < input.scheduledAt.getTime()
        ? "open"
        : "closed";

  let displayState: ScheduledMatchDisplayState;

  if (rawStatus === "declined") {
    displayState = "declined";
  } else if (rawStatus === "canceled") {
    displayState = "canceled";
  } else if (rawStatus === "completed") {
    displayState = "completed";
  } else if (rawStatus === "live_confirmed") {
    displayState = "live";
  } else if (rawStatus === "no_show_left") {
    displayState = "no_show_left";
  } else if (rawStatus === "no_show_right") {
    displayState = "no_show_right";
  } else if (rawStatus === "double_no_show") {
    displayState = "double_no_show";
  } else if (rawStatus === "refunded") {
    displayState = "refunded";
  } else if (leftCheckedIn && rightCheckedIn) {
    displayState = "ready";
  } else if (checkInWindowState === "open" && leftCheckedIn) {
    displayState = "left_checked_in";
  } else if (checkInWindowState === "open" && rightCheckedIn) {
    displayState = "right_checked_in";
  } else if (checkInWindowState === "open") {
    displayState = "checkin_open";
  } else if (bothFunded) {
    displayState = "funded";
  } else if (creatorFunded) {
    displayState = "creator_funded";
  } else if (opponentFunded) {
    displayState = "opponent_funded";
  } else if (input.acceptedAt || rawStatus === "accepted" || rawStatus === "terms_accepted") {
    displayState = "terms_accepted";
  } else {
    displayState = "proposed";
  }

  if (checkInWindowState === "closed" && bothFunded && rawStatus !== "completed" && rawStatus !== "live_confirmed") {
    if (leftCheckedIn && rightCheckedIn) {
      displayState = "ready";
    } else if (leftCheckedIn) {
      displayState = "no_show_right";
    } else if (rightCheckedIn) {
      displayState = "no_show_left";
    } else {
      displayState = "double_no_show";
    }
  }

  const persistedStatus: ScheduledMatchPersistedStatus =
    displayState === "checkin_open"
      ? "funded"
      : displayState === "live"
        ? "live_confirmed"
        : (displayState as ScheduledMatchPersistedStatus);

  const countdownMode: ScheduledMatchEconomySurface["countdownMode"] =
    checkInWindowState === "open"
      ? "closes_in"
      : checkInWindowState === "upcoming" && timeUntilCheckInOpen <= CHALLENGE_NEAR_CHECKIN_WINDOW_MS
        ? "opens_in"
        : null;

  const countdownTargetAt =
    countdownMode === "opens_in"
      ? checkInOpensAt.toISOString()
      : countdownMode === "closes_in"
        ? input.scheduledAt.toISOString()
        : null;

  let statusLabel = "Creator funding required";
  let statusDetail = `Creator locks ${formatWolo(totalFundingWolo)} WOLO before opponent accepts.`;
  let resolution: ScheduledMatchResolutionSurface = {
    label: null,
    guarantee: null,
    wager: null,
    treasury: null,
  };

  switch (displayState) {
    case "terms_accepted":
      statusLabel = "Awaiting creator funding";
      statusDetail = `${formatWolo(totalFundingWolo)} WOLO creator funding required.`;
      break;
    case "creator_funded":
      statusLabel = "Awaiting opponent funding";
      statusDetail = `Creator locked ${formatWolo(totalFundingWolo)} WOLO.`;
      break;
    case "opponent_funded":
      statusLabel = "Awaiting creator funding";
      statusDetail = `Opponent locked ${formatWolo(totalFundingWolo)} WOLO.`;
      break;
    case "funded":
      statusLabel = "Funded";
      statusDetail = "Check-in opens exactly 10 minutes before start.";
      break;
    case "checkin_open":
      statusLabel = "Check-in open";
      statusDetail = "Check in closes exactly at scheduled start.";
      break;
    case "left_checked_in":
      statusLabel = "Creator checked in";
      statusDetail = "Waiting on opponent before the lock.";
      break;
    case "right_checked_in":
      statusLabel = "Opponent checked in";
      statusDetail = "Waiting on creator before the lock.";
      break;
    case "ready":
      statusLabel = "Ready";
      statusDetail = "Both players checked in before the lock.";
      resolution = {
        label: "Guarantees protected",
        guarantee: "Both Match Guarantees return after the match.",
        wager: "Wolo Wager stays locked for result settlement.",
        treasury: null,
      };
      break;
    case "live":
      statusLabel = "Live confirmed";
      statusDetail = "The match session is linked and underway.";
      resolution = {
        label: "Guarantees protected",
        guarantee: "Both Match Guarantees return after the match.",
        wager: "Wolo Wager stays locked for result settlement.",
        treasury: null,
      };
      break;
    case "completed":
      statusLabel = "Completed";
      statusDetail = "Result is ready for Match Guarantee return and Wolo Wager settlement.";
      resolution = {
        label: "Result ready",
        guarantee: "Both Match Guarantees return.",
        wager: "Wolo Wager settles on the match result.",
        treasury: null,
      };
      break;
    case "no_show_left":
      statusLabel = "No-show resolved";
      statusDetail = "Opponent checked in. Creator missed the lock.";
      resolution = {
        label: "Creator no-show",
        guarantee: "Opponent Match Guarantee returns; creator Match Guarantee goes to Community Treasury.",
        wager: "Both Wolo Wagers release because no match was played.",
        treasury: "Community Treasury",
      };
      break;
    case "no_show_right":
      statusLabel = "No-show resolved";
      statusDetail = "Creator checked in. Opponent missed the lock.";
      resolution = {
        label: "Opponent no-show",
        guarantee: "Creator Match Guarantee returns; opponent Match Guarantee goes to Community Treasury.",
        wager: "Both Wolo Wagers release because no match was played.",
        treasury: "Community Treasury",
      };
      break;
    case "double_no_show":
      statusLabel = "No-show resolved";
      statusDetail = "Neither player checked in before the lock.";
      resolution = {
        label: "Double no-show",
        guarantee: "Both Match Guarantees go to Community Treasury.",
        wager: "Both Wolo Wagers release because no match was played.",
        treasury: "Community Treasury",
      };
      break;
    case "declined":
      statusLabel = "Declined";
      statusDetail = "The opponent declined the terms.";
      break;
    case "canceled":
      statusLabel = "Canceled";
      statusDetail = "The scheduled match was closed before launch.";
      break;
    case "refunded":
      statusLabel = "Refunded";
      statusDetail = "Manual refund review completed.";
      resolution = {
        label: "Refunded",
        guarantee: "Match Guarantee returned per the recorded disposition.",
        wager: "Wolo Wager released.",
        treasury: null,
      };
      break;
    default:
      break;
  }

  return {
    persistedStatus,
    displayState,
    economy: {
      hasTerms: true,
      wagerAmountWolo,
      guaranteeAmountWolo,
      totalFundingWolo,
      statusLabel,
      statusDetail,
      creatorFundedAt: input.challengerFundedAt?.toISOString() ?? null,
      creatorFundingTxHash: input.challengerFundingTxHash?.trim() || null,
      creatorFundingWalletAddress: input.challengerFundingWalletAddress?.trim() || null,
      opponentFundedAt: input.challengedFundedAt?.toISOString() ?? null,
      opponentFundingTxHash: input.challengedFundingTxHash?.trim() || null,
      opponentFundingWalletAddress: input.challengedFundingWalletAddress?.trim() || null,
      leftCheckedInAt: input.challengerCheckedInAt?.toISOString() ?? null,
      rightCheckedInAt: input.challengedCheckedInAt?.toISOString() ?? null,
      checkInOpensAt: checkInOpensAt.toISOString(),
      checkInClosesAt: checkInClosesAt.toISOString(),
      checkInWindowState,
      countdownMode,
      countdownTargetAt,
      resolution,
      readyForSettlement:
        readyForSettlement ||
        displayState === "completed" ||
        displayState === "no_show_left" ||
        displayState === "no_show_right" ||
        displayState === "double_no_show" ||
        displayState === "refunded",
      settlementReadyAt: input.settlementReadyAt?.toISOString() ?? null,
    },
  };
}
