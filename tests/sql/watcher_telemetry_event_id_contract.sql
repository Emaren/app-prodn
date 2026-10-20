-- Exact PostgreSQL uniqueness and legacy compatibility proof.
-- This is a fixture-only synthetic table, not real production migration.
SELECT CASE WHEN COUNT(*)=2 THEN 1 ELSE 1/0 END
FROM "watcher_client_events" WHERE "telemetry_event_id" IS NULL;

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

SELECT CASE WHEN COUNT(*)=1 THEN 1 ELSE 1/0 END
FROM "watcher_client_events"
WHERE "telemetry_event_id"='telemetry_0123456789abcdef0123456789abcdef';
