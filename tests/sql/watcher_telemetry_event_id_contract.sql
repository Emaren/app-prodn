-- Exact PostgreSQL uniqueness and legacy compatibility proof.
-- This is a fixture-only synthetic table, not real production migration.
DO $
BEGIN
  IF (SELECT COUNT(*) FROM "watcher_client_events" WHERE "telemetry_event_id" IS NULL) <> 2 THEN
    RAISE EXCEPTION 'Legacy NULL telemetry IDs were rejected';
  END IF;
END $;

INSERT INTO "watcher_client_events" ("event_type","telemetry_event_id")
VALUES ('heartbeat','telemetry_0123456789abcdef0123456789abcdef');

DO $$
BEGIN
  BEGIN
    INSERT INTO "watcher_client_events" ("event_type","telemetry_event_id")
    VALUES ('heartbeat','telemetry_0123456789abcdef0123456789abcdef');
    RAISE EXCEPTION 'Failed: duplicate telemetry event ID was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
END $$;

DO $
BEGIN
  IF (SELECT COUNT(*) FROM "watcher_client_events"
      WHERE "telemetry_event_id"='telemetry_0123456789abcdef0123456789abcdef') <> 1 THEN
    RAISE EXCEPTION 'Duplicate telemetry IDs reached durable table';
  END IF;
END $;
