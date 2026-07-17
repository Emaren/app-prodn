BEGIN;

-- Row-level UPDATE/DELETE guards do not run for TRUNCATE. Keep the two
-- application-owned evidence ledgers append-only even when the table owner is
-- the runtime role.
DROP TRIGGER IF EXISTS "replay_result_adjudications_append_only_truncate"
  ON "replay_result_adjudications";
CREATE TRIGGER "replay_result_adjudications_append_only_truncate"
BEFORE TRUNCATE ON "replay_result_adjudications"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_replay_result_adjudication_mutation"();

DROP TRIGGER IF EXISTS "bounty_events_append_only_truncate"
  ON "bounty_events";
CREATE TRIGGER "bounty_events_append_only_truncate"
BEFORE TRUNCATE ON "bounty_events"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_bounty_event_mutation"();

COMMIT;
