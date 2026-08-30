BEGIN;

CREATE TABLE "radio_assets" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source_submission_id" INTEGER,
  "title" VARCHAR(200) NOT NULL,
  "credit" VARCHAR(200),
  "kind" VARCHAR(64) NOT NULL DEFAULT 'uncategorized',
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "notes" TEXT,
  "audio_original_filename" VARCHAR(255) NOT NULL,
  "audio_storage_key" VARCHAR(1000) NOT NULL,
  "audio_media_type" VARCHAR(100) NOT NULL,
  "audio_byte_size" BIGINT NOT NULL,
  "audio_sha256" VARCHAR(64) NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "artwork_storage_key" VARCHAR(1000),
  "artwork_media_type" VARCHAR(100),
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "created_by_uid" VARCHAR(100),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_radio_assets_audio_size"
    CHECK ("audio_byte_size" > 0),

  CONSTRAINT "ck_radio_assets_duration"
    CHECK ("duration_ms" > 0),

  CONSTRAINT "ck_radio_assets_status"
    CHECK ("status" IN ('draft', 'ready', 'archived')),

  CONSTRAINT "fk_radio_assets_submission"
    FOREIGN KEY ("source_submission_id")
    REFERENCES "radio_submissions"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX
  "radio_assets_public_id_key"
  ON "radio_assets"("public_id");

CREATE UNIQUE INDEX
  "radio_assets_source_submission_id_key"
  ON "radio_assets"("source_submission_id");

CREATE UNIQUE INDEX
  "radio_assets_audio_storage_key_key"
  ON "radio_assets"("audio_storage_key");

CREATE UNIQUE INDEX
  "radio_assets_artwork_storage_key_key"
  ON "radio_assets"("artwork_storage_key");

CREATE INDEX
  "ix_radio_assets_status_created"
  ON "radio_assets"("status", "created_at");

CREATE INDEX
  "ix_radio_assets_kind_status"
  ON "radio_assets"("kind", "status");

CREATE INDEX
  "ix_radio_assets_audio_sha256"
  ON "radio_assets"("audio_sha256");


CREATE TABLE "radio_programs" (
  "id" SERIAL PRIMARY KEY,
  "public_id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(200) NOT NULL,
  "target_duration_ms" INTEGER NOT NULL DEFAULT 3600000,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "created_by_uid" VARCHAR(100),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_radio_programs_target_duration"
    CHECK ("target_duration_ms" > 0),

  CONSTRAINT "ck_radio_programs_status"
    CHECK ("status" IN ('draft', 'ready', 'archived'))
);

CREATE UNIQUE INDEX
  "radio_programs_public_id_key"
  ON "radio_programs"("public_id");

CREATE INDEX
  "ix_radio_programs_status_updated"
  ON "radio_programs"("status", "updated_at");


CREATE TABLE "radio_program_items" (
  "id" SERIAL PRIMARY KEY,
  "program_id" INTEGER NOT NULL,
  "asset_id" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "transition" VARCHAR(32) NOT NULL DEFAULT 'cut',
  "crossfade_ms" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_radio_program_items_position"
    CHECK ("position" >= 0),

  CONSTRAINT "ck_radio_program_items_crossfade"
    CHECK ("crossfade_ms" >= 0 AND "crossfade_ms" <= 30000),

  CONSTRAINT "fk_radio_program_items_program"
    FOREIGN KEY ("program_id")
    REFERENCES "radio_programs"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,

  CONSTRAINT "fk_radio_program_items_asset"
    FOREIGN KEY ("asset_id")
    REFERENCES "radio_assets"("id")
    ON DELETE RESTRICT
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX
  "uq_radio_program_items_program_position"
  ON "radio_program_items"("program_id", "position");

CREATE INDEX
  "ix_radio_program_items_asset"
  ON "radio_program_items"("asset_id");


CREATE TABLE "radio_station_state" (
  "id" INTEGER PRIMARY KEY DEFAULT 1,
  "program_id" INTEGER,
  "state" VARCHAR(24) NOT NULL DEFAULT 'off_air',
  "started_at" TIMESTAMP(6),
  "stopped_at" TIMESTAMP(6),
  "launched_by_uid" VARCHAR(100),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_radio_station_state_singleton"
    CHECK ("id" = 1),

  CONSTRAINT "ck_radio_station_state_state"
    CHECK ("state" IN ('off_air', 'on_air')),

  CONSTRAINT "fk_radio_station_state_program"
    FOREIGN KEY ("program_id")
    REFERENCES "radio_programs"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

INSERT INTO "radio_station_state" (
  "id",
  "state"
)
VALUES (
  1,
  'off_air'
);

COMMIT;
