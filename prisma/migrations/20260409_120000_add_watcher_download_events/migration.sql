CREATE TABLE "watcher_download_events" (
  "id" SERIAL NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "user_id" INTEGER,
  "platform" VARCHAR(24) NOT NULL,
  "artifact" VARCHAR(40) NOT NULL,
  "version" VARCHAR(32) NOT NULL,
  "filename" VARCHAR(180) NOT NULL,
  "ip_address" VARCHAR(80),
  "user_agent" VARCHAR(512),
  "referer" VARCHAR(255),
  CONSTRAINT "watcher_download_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "watcher_download_events"
  ADD CONSTRAINT "watcher_download_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

CREATE INDEX "ix_watcher_download_events_created_at"
  ON "watcher_download_events"("created_at");

CREATE INDEX "ix_watcher_download_events_platform_artifact_created_at"
  ON "watcher_download_events"("platform", "artifact", "created_at");

CREATE INDEX "ix_watcher_download_events_user_id_created_at"
  ON "watcher_download_events"("user_id", "created_at");
