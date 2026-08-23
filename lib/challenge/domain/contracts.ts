export const CHALLENGE_ACTIONS = [
  "accept",
  "decline",
  "cancel",
  "reschedule",
  "confirm_time",
  "fund",
  "check_in",
  "resolve_no_show",
  "mark_completed",
  "desync_rematch",
  "desync_void_refund",
  "room_message",
] as const;

export type ChallengeAction =
  (typeof CHALLENGE_ACTIONS)[number];

const CHALLENGE_ACTION_SET:
  ReadonlySet<string> =
    new Set(
      CHALLENGE_ACTIONS,
    );

export function parseChallengeAction(
  value: unknown,
): ChallengeAction | null {
  if (
    typeof value !==
    "string"
  ) {
    return null;
  }

  return CHALLENGE_ACTION_SET.has(
    value,
  )
    ? (
        value as
          ChallengeAction
      )
    : null;
}

/*
 * HTTP transport payload.
 *
 * This deliberately describes transport shape only.
 * Individual domain commands will narrow these fields further
 * as transitions move out of the route.
 */
export type ChallengeMutationPayload = {
  action?: unknown;

  scheduledAt?: string;
  matchTime?: string;
  challengeNote?: string;

  wagerAmountWolo?:
    | string
    | number
    | null;

  guaranteeAmountWolo?:
    | string
    | number
    | null;

  fundingTxHash?: string;
  fundingWalletAddress?: string;

  linkedSessionKey?: string;
  linkedMapName?: string;
  linkedWinner?: string;
  linkedDurationSeconds?: number;

  desyncIncidentId?: number;
  idempotencyKey?: string;
  rematchAt?: string;
  note?: string;

  message?: string;
};

export type ChallengeActorRole =
  | "challenger"
  | "challenged"
  | "admin";
