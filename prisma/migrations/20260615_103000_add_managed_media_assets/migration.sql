CREATE TABLE IF NOT EXISTS "managed_media_assets" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR(160) NOT NULL,
  "kind" VARCHAR(32) NOT NULL,
  "target" VARCHAR(160),
  "label" VARCHAR(160) NOT NULL,
  "url" VARCHAR(500) NOT NULL,
  "alt" VARCHAR(180),
  "mime_type" VARCHAR(100),
  "original_name" VARCHAR(255),
  "size_bytes" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "uploaded_by_uid" VARCHAR(100),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "managed_media_assets_key_key"
  ON "managed_media_assets"("key");

CREATE INDEX IF NOT EXISTS "ix_managed_media_assets_kind_target_active"
  ON "managed_media_assets"("kind", "target", "active");

CREATE INDEX IF NOT EXISTS "ix_managed_media_assets_created_at"
  ON "managed_media_assets"("created_at");
