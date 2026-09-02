BEGIN;

CREATE TABLE "radio_listener_states" (
  "id" SERIAL PRIMARY KEY,
  "listener_id" UUID NOT NULL,
  "user_id" INTEGER,
  "listening" BOOLEAN NOT NULL DEFAULT FALSE,
  "current_asset_id" INTEGER,
  "last_event" VARCHAR(24) NOT NULL DEFAULT 'off',
  "started_listening_at" TIMESTAMP(6),
  "stopped_listening_at" TIMESTAMP(6),
  "last_seen_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_radio_listener_states_event"
    CHECK (
      "last_event" IN (
        'on',
        'off',
        'heartbeat',
        'rate'
      )
    ),

  CONSTRAINT "radio_listener_states_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION,

  CONSTRAINT "radio_listener_states_current_asset_id_fkey"
    FOREIGN KEY ("current_asset_id")
    REFERENCES "radio_assets"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX
  "radio_listener_states_listener_id_key"
  ON "radio_listener_states"("listener_id");

CREATE INDEX
  "ix_radio_listener_states_user_seen"
  ON "radio_listener_states"("user_id", "last_seen_at");

CREATE INDEX
  "ix_radio_listener_states_listening_seen"
  ON "radio_listener_states"("listening", "last_seen_at");

CREATE INDEX
  "ix_radio_listener_states_asset_seen"
  ON "radio_listener_states"("current_asset_id", "last_seen_at");


CREATE TABLE "radio_track_ratings" (
  "id" SERIAL PRIMARY KEY,
  "asset_id" INTEGER NOT NULL,
  "rater_key" VARCHAR(140) NOT NULL,
  "user_id" INTEGER,
  "listener_id" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ck_radio_track_ratings_rating"
    CHECK (
      "rating" >= 1
      AND "rating" <= 10
    ),

  CONSTRAINT "radio_track_ratings_asset_id_fkey"
    FOREIGN KEY ("asset_id")
    REFERENCES "radio_assets"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,

  CONSTRAINT "radio_track_ratings_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX
  "uq_radio_track_ratings_asset_rater"
  ON "radio_track_ratings"("asset_id", "rater_key");

CREATE INDEX
  "ix_radio_track_ratings_user_updated"
  ON "radio_track_ratings"("user_id", "updated_at");

CREATE INDEX
  "ix_radio_track_ratings_asset_updated"
  ON "radio_track_ratings"("asset_id", "updated_at");

CREATE INDEX
  "ix_radio_track_ratings_listener_updated"
  ON "radio_track_ratings"("listener_id", "updated_at");

COMMIT;
