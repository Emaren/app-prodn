export const AI_CONCIERGE_UID =
  "aoe2hd_ai_concierge";
export const AI_GRIMER_UID =
  "aoe2hd_ai_grimer";
export const AI_GUY_UID =
  "aoe2hd_ai_guy";
export const AOE2WAR_HALL_SCRIBE_UID =
  "aoe2hd_ai_clan_aoe2war_hall_scribe";
export const BETTING_BOT_TONY_UID =
  "aoe2hd_betting_bot_tony";
export const BETTING_BOT_PAULIE_UID =
  "aoe2hd_betting_bot_paulie";
export const CHALLENGE_PROTOCOL_UID =
  "challenge-protocol";
export const CHALLENGE_PROTOCOL_NAME =
  "Challenge Protocol";

const LEADERBOARD_EXCLUDED_SYSTEM_UIDS =
  new Set<string>([
    AI_CONCIERGE_UID,
    AI_GRIMER_UID,
    AI_GUY_UID,
    AOE2WAR_HALL_SCRIBE_UID,
    BETTING_BOT_TONY_UID,
    BETTING_BOT_PAULIE_UID,
    CHALLENGE_PROTOCOL_UID,
  ]);

const INTERNAL_SYSTEM_UIDS = new Set(LEADERBOARD_EXCLUDED_SYSTEM_UIDS);

export function isInternalSystemUid(uid: string | null | undefined) {
  return Boolean(uid && INTERNAL_SYSTEM_UIDS.has(uid));
}

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
