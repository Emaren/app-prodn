CREATE TABLE IF NOT EXISTS "watcher_client_events" (
  "id" BIGSERIAL NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER,
  "user_uid" VARCHAR(100),
  "event_type" VARCHAR(40) NOT NULL,
  "app_version" VARCHAR(32),
  "platform" VARCHAR(24),
  "artifact" VARCHAR(40),
  "watcher_id" VARCHAR(80),
  "session_id" VARCHAR(80),
  "replay_hash" VARCHAR(64),
  "replay_file" VARCHAR(255),
  "parse_source" VARCHAR(40),
  "parse_reason" VARCHAR(80),
  "ip_address" VARCHAR(80),
  "user_agent" VARCHAR(512),
  "metadata" JSONB,

  CONSTRAINT "watcher_client_events_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'watcher_client_events_user_id_fkey'
  ) THEN
    ALTER TABLE "watcher_client_events"
      ADD CONSTRAINT "watcher_client_events_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ix_watcher_client_events_created_at"
  ON "watcher_client_events"("created_at");

CREATE INDEX IF NOT EXISTS "ix_watcher_client_events_user_id"
  ON "watcher_client_events"("user_id");

CREATE INDEX IF NOT EXISTS "ix_watcher_client_events_user_uid"
  ON "watcher_client_events"("user_uid");

CREATE INDEX IF NOT EXISTS "ix_watcher_client_events_event_type"
  ON "watcher_client_events"("event_type");

CREATE INDEX IF NOT EXISTS "ix_watcher_client_events_watcher_id"
  ON "watcher_client_events"("watcher_id");

CREATE INDEX IF NOT EXISTS "ix_watcher_download_events_created_at"
  ON "watcher_download_events"("created_at");

CREATE INDEX IF NOT EXISTS "ix_watcher_download_events_user_id"
  ON "watcher_download_events"("user_id");

CREATE INDEX IF NOT EXISTS "ix_watcher_download_events_user_id_created_at"
  ON "watcher_download_events"("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "ix_game_stats_created_at"
  ON "game_stats"("created_at");

CREATE INDEX IF NOT EXISTS "ix_game_stats_user_uid"
  ON "game_stats"("user_uid");

CREATE INDEX IF NOT EXISTS "ix_game_stats_parse_source"
  ON "game_stats"("parse_source");
