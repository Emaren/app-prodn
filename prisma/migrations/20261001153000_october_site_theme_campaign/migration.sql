CREATE TABLE "site_theme_campaign" (
  "slot" SMALLINT NOT NULL DEFAULT 1,
  "campaign_key" VARCHAR(64) NOT NULL,
  "label" VARCHAR(120) NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "theme_key" VARCHAR(20) NOT NULL DEFAULT 'black',
  "starts_at" TIMESTAMP(6) NOT NULL,
  "ends_at" TIMESTAMP(6) NOT NULL,
  "updated_by_user_id" INTEGER,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_theme_campaign_pkey" PRIMARY KEY ("slot"),
  CONSTRAINT "site_theme_campaign_singleton_check" CHECK ("slot" = 1),
  CONSTRAINT "site_theme_campaign_window_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "site_theme_campaign_theme_check" CHECK (
    "theme_key" IN ('black','grey','white','sepia','walnut','crimson','midnight')
  ),
  CONSTRAINT "site_theme_campaign_updated_by_user_id_fkey"
    FOREIGN KEY ("updated_by_user_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_site_theme_campaign_key"
  ON "site_theme_campaign"("campaign_key");

CREATE INDEX "ix_site_theme_campaign_active_window"
  ON "site_theme_campaign"("enabled", "starts_at", "ends_at");

CREATE TABLE "user_theme_campaign_overrides" (
  "id" SERIAL NOT NULL,
  "campaign_key" VARCHAR(64) NOT NULL,
  "user_id" INTEGER NOT NULL,
  "theme_key" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_theme_campaign_overrides_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_theme_campaign_overrides_theme_check" CHECK (
    "theme_key" IN ('black','grey','white','sepia','walnut','crimson','midnight')
  ),
  CONSTRAINT "user_theme_campaign_overrides_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "uq_user_theme_campaign_override"
  ON "user_theme_campaign_overrides"("campaign_key", "user_id");

CREATE INDEX "ix_user_theme_campaign_override_theme"
  ON "user_theme_campaign_overrides"("campaign_key", "theme_key");

CREATE INDEX "ix_user_theme_campaign_override_user_updated"
  ON "user_theme_campaign_overrides"("user_id", "updated_at");

INSERT INTO "site_theme_campaign" (
  "slot",
  "campaign_key",
  "label",
  "enabled",
  "theme_key",
  "starts_at",
  "ends_at"
)
VALUES (
  1,
  'october-black-2026',
  'October Blackout 2026',
  true,
  'black',
  TIMESTAMP '2026-10-01 06:00:00',
  TIMESTAMP '2026-11-01 06:00:00'
);
