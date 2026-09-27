-- AOE2WAR-MIGRATION-MODE: PRODUCTION_PROVEN_CHECK_REPLACEMENT
-- AOE2WAR-PRODUCTION-CHECK: replay_roster_promotions ck_replay_roster_promotions_format before_sha256=e1a8a48953aae85038e714f79bd039c0dbdcf6e44ae558fde52d63a780f78bb8 after_sha256=c9043cbd4f568543c7238b0f3599f233c5715ef3f66cc4b170a219bcd7fb0360

/*
 * Replay Roster V3 allows exact asymmetric two-team topology while remaining
 * roster-only authority. Keep the database promotion ledger aligned with that
 * bounded application contract:
 *
 * - exactly two teams;
 * - each side has 1-4 players;
 * - total player count is 3-8;
 * - 1v1 remains outside roster-recovery promotion;
 * - no FFA/three-team/arbitrary formats;
 * - all existing no-result/no-bet/no-settlement constraints remain unchanged.
 */

BEGIN;

ALTER TABLE "replay_roster_promotions"
  DROP CONSTRAINT "ck_replay_roster_promotions_format";

ALTER TABLE "replay_roster_promotions"
  ADD CONSTRAINT "ck_replay_roster_promotions_format"
  CHECK (
    ("format", "player_count") IN (
      ('1v2', 3),
      ('1v3', 4),
      ('1v4', 5),
      ('2v1', 3),
      ('2v2', 4),
      ('2v3', 5),
      ('2v4', 6),
      ('3v1', 4),
      ('3v2', 5),
      ('3v3', 6),
      ('3v4', 7),
      ('4v1', 5),
      ('4v2', 6),
      ('4v3', 7),
      ('4v4', 8)
    )
  );

COMMIT;
