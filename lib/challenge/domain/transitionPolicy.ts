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
