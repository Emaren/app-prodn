CREATE TABLE IF NOT EXISTS "scheduled_match_user_preferences" (
  "id" SERIAL PRIMARY KEY,
  "scheduled_match_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "favorite" BOOLEAN NOT NULL DEFAULT FALSE,
  "bookmarked" BOOLEAN NOT NULL DEFAULT FALSE,
  "color_tag" VARCHAR(16),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "scheduled_match_user_preferences_scheduled_match_id_fkey"
    FOREIGN KEY ("scheduled_match_id")
    REFERENCES "scheduled_matches"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "scheduled_match_user_preferences_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION,
  CONSTRAINT "uq_scheduled_match_user_preferences_match_user"
    UNIQUE ("scheduled_match_id", "user_id")
);

CREATE INDEX IF NOT EXISTS "ix_scheduled_match_user_preferences_user_updated_at"
  ON "scheduled_match_user_preferences"("user_id", "updated_at");

CREATE INDEX IF NOT EXISTS "ix_scheduled_match_user_preferences_favorite"
  ON "scheduled_match_user_preferences"("favorite");

CREATE INDEX IF NOT EXISTS "ix_scheduled_match_user_preferences_bookmarked"
  ON "scheduled_match_user_preferences"("bookmarked");

CREATE INDEX IF NOT EXISTS "ix_scheduled_match_user_preferences_color_tag"
  ON "scheduled_match_user_preferences"("color_tag");
