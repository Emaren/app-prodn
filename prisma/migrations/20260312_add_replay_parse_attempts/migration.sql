CREATE TABLE IF NOT EXISTS "replay_parse_attempts" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_uid" VARCHAR(100),
    "replay_hash" VARCHAR(64),
    "original_filename" VARCHAR(255),
    "parse_source" VARCHAR(20) NOT NULL DEFAULT 'file_upload',
    "status" VARCHAR(32) NOT NULL DEFAULT 'received',
    "detail" VARCHAR(255),
    "upload_mode" VARCHAR(20),
    "file_size_bytes" INTEGER,
    "game_stats_id" INTEGER,
    "played_on" TIMESTAMP(6),

    CONSTRAINT "replay_parse_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ix_replay_parse_attempts_created_at"
    ON "replay_parse_attempts"("created_at");

CREATE INDEX IF NOT EXISTS "ix_replay_parse_attempts_status_created_at"
    ON "replay_parse_attempts"("status", "created_at");

CREATE INDEX IF NOT EXISTS "ix_replay_parse_attempts_user_uid_created_at"
    ON "replay_parse_attempts"("user_uid", "created_at");

CREATE INDEX IF NOT EXISTS "ix_replay_parse_attempts_replay_hash"
    ON "replay_parse_attempts"("replay_hash");

CREATE INDEX IF NOT EXISTS "ix_replay_parse_attempts_game_stats_id"
    ON "replay_parse_attempts"("game_stats_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'replay_parse_attempts_game_stats_id_fkey'
    ) THEN
        ALTER TABLE "replay_parse_attempts"
        ADD CONSTRAINT "replay_parse_attempts_game_stats_id_fkey"
        FOREIGN KEY ("game_stats_id")
        REFERENCES "game_stats"("id")
        ON DELETE SET NULL
        ON UPDATE NO ACTION;
    END IF;
END $$;
