ALTER TABLE "scheduled_matches"
  ADD COLUMN IF NOT EXISTS "schedule_mode" VARCHAR(16) NOT NULL DEFAULT 'exact',
  ADD COLUMN IF NOT EXISTS "acceptance_expires_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "funding_expires_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "play_expires_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "funding_expired_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "play_expired_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "proposed_match_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "proposed_match_by_user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "time_proposed_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "time_confirmed_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "creation_request_id" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "lifecycle_version" INTEGER NOT NULL DEFAULT 0;

-- Every pre-v2 Challenge was created with a required exact start. Preserve that
-- meaning and do not invent a historical invitation deadline.
UPDATE "scheduled_matches"
SET "schedule_mode" = 'exact'
WHERE "schedule_mode" IS NULL OR "schedule_mode" NOT IN ('open', 'exact');

ALTER TABLE "scheduled_matches"
  ALTER COLUMN "scheduled_at" DROP NOT NULL,
  ALTER COLUMN "schedule_mode" SET DEFAULT 'open';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_scheduled_matches_schedule_mode'
  ) THEN
    ALTER TABLE "scheduled_matches"
      ADD CONSTRAINT "ck_scheduled_matches_schedule_mode"
      CHECK ("schedule_mode" IN ('open', 'exact'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_matches_creation_request_id"
  ON "scheduled_matches"("creation_request_id")
  WHERE "creation_request_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "ix_scheduled_matches_status_acceptance_expires"
  ON "scheduled_matches"("status", "acceptance_expires_at");
CREATE INDEX IF NOT EXISTS "ix_scheduled_matches_status_funding_expires"
  ON "scheduled_matches"("status", "funding_expires_at");
CREATE INDEX IF NOT EXISTS "ix_scheduled_matches_status_play_expires"
  ON "scheduled_matches"("status", "play_expires_at");

-- A replay/session is durable proof for exactly one Challenge. PostgreSQL
-- permits multiple NULL values, so legacy rows without proof remain valid.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "scheduled_matches"
    WHERE NULLIF(BTRIM("linked_session_key"), '') IS NOT NULL
    GROUP BY BTRIM("linked_session_key")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate normalized scheduled-match session claims require operator review';
  END IF;
END $$;

UPDATE "scheduled_matches"
SET "linked_session_key" = NULLIF(BTRIM("linked_session_key"), '')
WHERE "linked_session_key" IS DISTINCT FROM NULLIF(BTRIM("linked_session_key"), '');

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_matches_linked_session_key"
  ON "scheduled_matches"("linked_session_key");

-- One unresolved Challenge per unordered player pair removes replay ambiguity
-- and makes the Challenge room the canonical thread for that matchup.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "scheduled_matches"
    WHERE "status" IN (
      'pending', 'accepted', 'proposed', 'terms_accepted',
      'creator_funded', 'opponent_funded', 'funded',
      'left_checked_in', 'right_checked_in', 'ready',
      'live_confirmed', 'live', 'result_pending'
    )
    GROUP BY
      LEAST("challenger_user_id", "challenged_user_id"),
      GREATEST("challenger_user_id", "challenged_user_id")
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active scheduled-match player pairs require operator review';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_matches_active_player_pair"
  ON "scheduled_matches"(
    LEAST("challenger_user_id", "challenged_user_id"),
    GREATEST("challenger_user_id", "challenged_user_id")
  )
  WHERE "status" IN (
    'pending',
    'accepted',
    'proposed',
    'terms_accepted',
    'creator_funded',
    'opponent_funded',
    'funded',
    'left_checked_in',
    'right_checked_in',
    'ready',
    'live_confirmed',
    'live',
    'result_pending'
  );

ALTER TABLE "scheduled_match_activities"
  ADD COLUMN IF NOT EXISTS "event_key" VARCHAR(128);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_scheduled_match_activities_match_event_key"
  ON "scheduled_match_activities"("scheduled_match_id", "event_key")
  WHERE "event_key" IS NOT NULL;
