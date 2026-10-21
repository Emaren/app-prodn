-- Safe additive idempotency key for future Watcher 1.6.6 telemetry.
-- Legacy rows (without IDs) remain unaffected; PostgreSQL permits many NULLs.
-- Release controller must verify migration before enabling new code.
ALTER TABLE "watcher_client_events"
  ADD COLUMN IF NOT EXISTS "telemetry_event_id" VARCHAR(64);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_watcher_client_events_telemetry_event_id"
  ON "watcher_client_events"("telemetry_event_id");
