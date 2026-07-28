export const AI_CONCIERGE_UID =
  "aoe2hd_ai_concierge";
export const AI_GRIMER_UID =
  "aoe2hd_ai_grimer";
export const AI_GUY_UID =
  "aoe2hd_ai_guy";
export const CHALLENGE_PROTOCOL_UID =
  "challenge-protocol";
export const CHALLENGE_PROTOCOL_NAME =
  "Challenge Protocol";

const LEADERBOARD_EXCLUDED_SYSTEM_UIDS =
  new Set<string>([
    AI_CONCIERGE_UID,
    AI_GRIMER_UID,
    AI_GUY_UID,
    CHALLENGE_PROTOCOL_UID,
  ]);

/**
 * Competitive boards contain public human identities only.
 *
 * Match exact, reserved UIDs rather than display names: a real player is
 * allowed to use the same visible name as an internal system account.
 */
export function isLeaderboardExcludedSystemUid(
  uid: string | null | undefined,
) {
  return Boolean(
    uid &&
      LEADERBOARD_EXCLUDED_SYSTEM_UIDS.has(
        uid,
      ),
  );
}
