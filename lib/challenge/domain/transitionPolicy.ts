import {
  CHALLENGE_DEFAULT_GUARANTEE_WOLO,
  CHALLENGE_DEFAULT_WAGER_WOLO,
} from "@/lib/challengeConfig";

import {
  normalizeChallengeNote,
  parseScheduledMatchDate,
} from "@/lib/challenges";

import {
  normalizeChallengeWoloAmount,
  validateChallengeTermsAmounts,
} from "@/lib/challengeEconomy";

import {
  buildChallengeFundBy,
  buildChallengePlayBy,
} from "@/lib/challengeLifecycle";

import type {
  ChallengeActorRole,
} from "@/lib/challenge/domain/contracts";

import {
  ChallengeConflictError,
} from "@/lib/challenge/domain/errors";


const ACCEPTABLE_DISPLAY_STATES =
  new Set([
    "proposed",
    "pending",
    "creator_funded",
  ]);


const CANCELLABLE_DISPLAY_STATES =
  new Set([
    "proposed",
    "pending",
    "terms_accepted",
    "accepted",
    "creator_funded",
    "opponent_funded",
    "funded",
    "checkin_open",
  ]);


export function planChallengeAcceptance(
  input: {
    actorRole:
      ChallengeActorRole;

    displayState:
      string;

    acceptBy:
      Date | null;

    now:
      Date;

    fundingTotal:
      number;

    matchTime:
      Date | null;

    timingMode:
      string;

    matchTimeConfirmedAt:
      Date | null;

    challengerFundedAt:
      Date | null;

    challengedFundedAt:
      Date | null;
  },
) {
  if (
    input.actorRole !==
    "challenged"
  ) {
    throw new ChallengeConflictError(
      "Only the challenged player can accept this match.",
      403,
    );
  }

  if (
    !ACCEPTABLE_DISPLAY_STATES.has(
      input.displayState,
    )
  ) {
    throw new ChallengeConflictError(
      "This challenge is no longer awaiting terms acceptance.",
    );
  }

  if (
    input.acceptBy &&
    input.now.getTime() >=
      input.acceptBy.getTime()
  ) {
    throw new ChallengeConflictError(
      "This challenge expired before it was accepted.",
    );
  }

  const fundBy =
    input.fundingTotal > 0
      ? buildChallengeFundBy(
          input.now,
          input.matchTime,
        )
      : null;

  const playBy =
    input.fundingTotal <= 0
      ? buildChallengePlayBy(
          input.now,
        )
      : null;

  const nextStatus =
    input.fundingTotal > 0
      ? (
          input.challengerFundedAt &&
          !input.challengedFundedAt
            ? "creator_funded"
            : "terms_accepted"
        )
      : "accepted";

  const matchTimeConfirmedAt =
    input.timingMode ===
      "scheduled" &&
    input.matchTime
      ? input.now
      : input.matchTimeConfirmedAt;

  return {
    acceptedAt:
      input.now,

    fundBy,

    playBy,

    nextStatus,

    matchTimeConfirmedAt,
  };
}


export function assertChallengeDeclineAllowed(
  input: {
    actorRole:
      ChallengeActorRole;

    displayState:
      string;
  },
) {
  if (
    input.actorRole !==
    "challenged"
  ) {
    throw new ChallengeConflictError(
      "Only the challenged player can decline this match.",
      403,
    );
  }

  if (
    !ACCEPTABLE_DISPLAY_STATES.has(
      input.displayState,
    )
  ) {
    throw new ChallengeConflictError(
      "This challenge is no longer awaiting terms acceptance.",
    );
  }
}


export function planChallengeCancellation(
  input: {
    displayState:
      string;

    challengerFundedAt:
      Date | null;

    challengedFundedAt:
      Date | null;

    challengerCheckedInAt:
      Date | null;

    challengedCheckedInAt:
      Date | null;

    resultAt:
      Date | null;

    settlementReadyAt:
      Date | null;

    now:
      Date;
  },
) {
  const hasAnyFunding =
    Boolean(
      input.challengerFundedAt,
    ) ||
    Boolean(
      input.challengedFundedAt,
    );

  const hasAnyCheckIn =
    Boolean(
      input.challengerCheckedInAt,
    ) ||
    Boolean(
      input.challengedCheckedInAt,
    );

  if (
    hasAnyCheckIn ||
    input.displayState ===
      "live"
  ) {
    throw new ChallengeConflictError(
      "This match is already checked in or live. Keep it on the rail for result resolution.",
    );
  }

  if (
    !CANCELLABLE_DISPLAY_STATES.has(
      input.displayState,
    )
  ) {
    throw new ChallengeConflictError(
      "Only active scheduled matches can be cancelled.",
    );
  }

  return {
    cancelledAt:
      input.now,

    hasAnyFunding,

    resultAt:
      hasAnyFunding
        ? input.now
        : input.resultAt,

    settlementReadyAt:
      hasAnyFunding
        ? input.now
        : input.settlementReadyAt,
  };
}


const CHALLENGE_SCHEDULE_WINDOW_MIN_MS =
  2 *
  60 *
  1000;

const CHALLENGE_SCHEDULE_WINDOW_MAX_MS =
  30 *
  24 *
  60 *
  60 *
  1000;


export function validateChallengeScheduledAtWindow(
  scheduledAt: Date,
  now:
    Date,
) {
  if (
    scheduledAt.getTime() <
    now.getTime() +
      CHALLENGE_SCHEDULE_WINDOW_MIN_MS
  ) {
    return "Schedule the game at least two minutes ahead.";
  }

  if (
    scheduledAt.getTime() >
    now.getTime() +
      CHALLENGE_SCHEDULE_WINDOW_MAX_MS
  ) {
    return "Keep exact match times inside the next 30 days.";
  }

  return null;
}


export function planChallengeReschedule(
  input: {
    actorRole:
      ChallengeActorRole;

    actorIsAdmin:
      boolean;

    acceptedAt:
      Date | null;

    displayState:
      string;

    challengerFundedAt:
      Date | null;

    challengedFundedAt:
      Date | null;

    challengerCheckedInAt:
      Date | null;

    challengedCheckedInAt:
      Date | null;

    playBy:
      Date | null;

    acceptBy:
      Date | null;

    fundBy:
      Date | null;

    requestedMatchTime?:
      unknown;

    requestedScheduledAt?:
      unknown;

    requestedChallengeNote?:
      unknown;

    requestedWagerAmountWolo?:
      unknown;

    requestedGuaranteeAmountWolo?:
      unknown;

    currentWagerAmountWolo:
      number;

    currentGuaranteeAmountWolo:
      number;

    now:
      Date;
  },
) {
  if (
    !input.acceptedAt &&
    input.actorRole !==
      "challenger" &&
    !input.actorIsAdmin
  ) {
    throw new ChallengeConflictError(
      "Only the challenger can change terms or propose a time before acceptance.",
      403,
    );
  }

  const hasAnyFunding =
    Boolean(
      input.challengerFundedAt,
    ) ||
    Boolean(
      input.challengedFundedAt,
    );

  const hasAnyCheckIn =
    Boolean(
      input.challengerCheckedInAt,
    ) ||
    Boolean(
      input.challengedCheckedInAt,
    );

  if (
    hasAnyCheckIn ||
    input.displayState ===
      "live"
  ) {
    throw new ChallengeConflictError(
      "This match is already checked in or live. Keep it on the existing rail.",
    );
  }

  if (
    !CANCELLABLE_DISPLAY_STATES.has(
      input.displayState,
    )
  ) {
    throw new ChallengeConflictError(
      "This scheduled match can no longer be reopened.",
    );
  }

  const nextScheduledAt =
    parseScheduledMatchDate(
      input.requestedMatchTime ??
        input.requestedScheduledAt,
    );

  if (
    !nextScheduledAt
  ) {
    throw new ChallengeConflictError(
      "Choose a valid new start time.",
      400,
    );
  }

  const scheduledAtWindowError =
    validateChallengeScheduledAtWindow(
      nextScheduledAt,
      input.now,
    );

  if (
    scheduledAtWindowError
  ) {
    throw new ChallengeConflictError(
      scheduledAtWindowError,
      400,
    );
  }

  if (
    input.playBy &&
    input.challengerFundedAt &&
    input.challengedFundedAt &&
    nextScheduledAt.getTime() >
      input.playBy.getTime()
  ) {
    throw new ChallengeConflictError(
      "Choose an exact time before this funded challenge's play window expires.",
      400,
    );
  }

  const nextChallengeNote =
    normalizeChallengeNote(
      input.requestedChallengeNote,
    );

  const accepted =
    Boolean(
      input.acceptedAt,
    );

  const preserveLifecycle =
    accepted ||
    hasAnyFunding;

  const wagerAmountWolo =
    preserveLifecycle
      ? input.currentWagerAmountWolo
      : (
          normalizeChallengeWoloAmount(
            input.requestedWagerAmountWolo,
          ) ??
          input.currentWagerAmountWolo ??
          CHALLENGE_DEFAULT_WAGER_WOLO
        );

  const guaranteeAmountWolo =
    preserveLifecycle
      ? input.currentGuaranteeAmountWolo
      : (
          normalizeChallengeWoloAmount(
            input.requestedGuaranteeAmountWolo,
          ) ??
          input.currentGuaranteeAmountWolo ??
          CHALLENGE_DEFAULT_GUARANTEE_WOLO
        );

  const termsError =
    validateChallengeTermsAmounts(
      wagerAmountWolo,
      guaranteeAmountWolo,
    );

  if (
    termsError
  ) {
    throw new ChallengeConflictError(
      termsError,
      400,
    );
  }

  const acceptByUpdate =
    preserveLifecycle
      ? (
          !input.acceptedAt &&
          (
            !input.acceptBy ||
            nextScheduledAt.getTime() <
              input.acceptBy.getTime()
          )
            ? nextScheduledAt
            : undefined
        )
      : (
          !input.acceptBy ||
          nextScheduledAt.getTime() <
            input.acceptBy.getTime()
            ? nextScheduledAt
            : input.acceptBy
        );

  const fundByUpdate =
    preserveLifecycle &&
    input.acceptedAt &&
    input.fundBy &&
    nextScheduledAt.getTime() <
      input.fundBy.getTime()
      ? nextScheduledAt
      : undefined;

  return {
    rescheduledAt:
      input.now,

    nextScheduledAt,

    nextChallengeNote,

    wagerAmountWolo,

    guaranteeAmountWolo,

    nextFundingTotal:
      wagerAmountWolo +
      guaranteeAmountWolo,

    accepted,

    preserveLifecycle,

    hasAnyFunding,

    acceptByUpdate,

    fundByUpdate,

    matchTimeConfirmedAt:
      input.actorIsAdmin
        ? input.now
        : null,
  };
}


export function planChallengeTimeConfirmation(
  input: {
    acceptedAt:
      Date | null;

    matchTime:
      Date | null;

    matchTimeProposedByUserId:
      number | null;

    matchTimeConfirmedAt:
      Date | null;

    actorUserId:
      number;

    actorIsAdmin:
      boolean;

    challengerCheckedInAt:
      Date | null;

    challengedCheckedInAt:
      Date | null;

    displayState:
      string;

    now:
      Date;
  },
) {
  if (
    !input.acceptedAt
  ) {
    throw new ChallengeConflictError(
      "Accept the challenge first. Acceptance confirms the initially proposed exact time.",
    );
  }

  if (
    !input.matchTime ||
    !input.matchTimeProposedByUserId
  ) {
    throw new ChallengeConflictError(
      "There is no proposed exact time to confirm.",
    );
  }

  if (
    input.matchTimeConfirmedAt
  ) {
    throw new ChallengeConflictError(
      "This exact match time is already confirmed.",
    );
  }

  if (
    input.matchTime.getTime() <=
    input.now.getTime()
  ) {
    throw new ChallengeConflictError(
      "That proposed match time has passed. Propose a new exact time instead.",
    );
  }

  if (
    !input.actorIsAdmin &&
    input.matchTimeProposedByUserId ===
      input.actorUserId
  ) {
    throw new ChallengeConflictError(
      "The other player must confirm the proposed exact time.",
    );
  }

  const hasAnyCheckIn =
    Boolean(
      input.challengerCheckedInAt,
    ) ||
    Boolean(
      input.challengedCheckedInAt,
    );

  if (
    hasAnyCheckIn ||
    input.displayState ===
      "live"
  ) {
    throw new ChallengeConflictError(
      "This match is already checked in or live. The time can no longer be changed.",
    );
  }

  return {
    confirmedAt:
      input.now,

    matchTime:
      input.matchTime,

    matchTimeProposedByUserId:
      input.matchTimeProposedByUserId,
  };
}
