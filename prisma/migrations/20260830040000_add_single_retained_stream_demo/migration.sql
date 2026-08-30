CREATE TABLE "game_watch_retained_demo" (
  "slot" SMALLINT NOT NULL,
  "stream_id" INTEGER NOT NULL,
  "retained_by_user_id" INTEGER NOT NULL,
  "byte_count" BIGINT NOT NULL,
  "duration_seconds" INTEGER NOT NULL,
  "retained_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "game_watch_retained_demo_pkey" PRIMARY KEY ("slot"),
  CONSTRAINT "ck_game_watch_retained_demo_single_slot" CHECK ("slot" = 1),
  CONSTRAINT "ck_game_watch_retained_demo_nonnegative_bytes" CHECK ("byte_count" >= 0),
  CONSTRAINT "ck_game_watch_retained_demo_nonnegative_duration" CHECK ("duration_seconds" >= 0),
  CONSTRAINT "uq_game_watch_retained_demo_stream" UNIQUE ("stream_id"),
  CONSTRAINT "game_watch_retained_demo_stream_id_fkey"
    FOREIGN KEY ("stream_id") REFERENCES "game_watch_streams"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION,
  CONSTRAINT "game_watch_retained_demo_actor_fkey"
    FOREIGN KEY ("retained_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE NO ACTION
);

CREATE INDEX "ix_game_watch_retained_demo_expiry"
  ON "game_watch_retained_demo"("expires_at");
