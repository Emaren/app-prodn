ALTER TABLE "game_watch_streams"
  ADD COLUMN IF NOT EXISTS "user_id" INTEGER,
  ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(32) NOT NULL DEFAULT 'external',
  ADD COLUMN IF NOT EXISTS "title" VARCHAR(140),
  ADD COLUMN IF NOT EXISTS "playback_url" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "thumbnail_url" TEXT,
  ADD COLUMN IF NOT EXISTS "media_mime_type" VARCHAR(120),
  ADD COLUMN IF NOT EXISTS "chunk_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "latest_chunk_seq" INTEGER NOT NULL DEFAULT -1,
  ADD COLUMN IF NOT EXISTS "last_heartbeat_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS "ended_at" TIMESTAMP(6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'game_watch_streams_user_id_fkey'
  ) THEN
    ALTER TABLE "game_watch_streams"
      ADD CONSTRAINT "game_watch_streams_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "ix_game_watch_streams_user_status"
  ON "game_watch_streams"("user_id", "status");

CREATE INDEX IF NOT EXISTS "ix_game_watch_streams_source_status"
  ON "game_watch_streams"("source_type", "status");
