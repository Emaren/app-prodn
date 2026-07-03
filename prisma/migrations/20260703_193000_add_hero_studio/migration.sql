CREATE TABLE IF NOT EXISTS "hero_playlists" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR(100) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "autoplay" BOOLEAN NOT NULL DEFAULT TRUE,
  "default_duration_ms" INTEGER NOT NULL DEFAULT 9000,
  "transition_duration_ms" INTEGER NOT NULL DEFAULT 700,
  "transition_style" VARCHAR(40) NOT NULL DEFAULT 'crossfade',
  "pause_on_hover" BOOLEAN NOT NULL DEFAULT TRUE,
  "show_arrows" BOOLEAN NOT NULL DEFAULT TRUE,
  "show_dots" BOOLEAN NOT NULL DEFAULT TRUE,
  "show_progress" BOOLEAN NOT NULL DEFAULT TRUE,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "hero_screens" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR(120) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "type" VARCHAR(40) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'draft',
  "default_href" VARCHAR(500),
  "aria_label" VARCHAR(180),
  "event_tile_id" INTEGER,
  "forum_thread_id" INTEGER,
  "media_asset_id" INTEGER,
  "config" JSONB,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hero_screens_event_tile_id_fkey"
    FOREIGN KEY ("event_tile_id") REFERENCES "event_tiles"("id") ON DELETE SET NULL,
  CONSTRAINT "hero_screens_forum_thread_id_fkey"
    FOREIGN KEY ("forum_thread_id") REFERENCES "forum_threads"("id") ON DELETE SET NULL,
  CONSTRAINT "hero_screens_media_asset_id_fkey"
    FOREIGN KEY ("media_asset_id") REFERENCES "managed_media_assets"("id") ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS "hero_playlist_items" (
  "id" SERIAL PRIMARY KEY,
  "playlist_id" INTEGER NOT NULL,
  "screen_id" INTEGER NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "starts_at" TIMESTAMP(6),
  "ends_at" TIMESTAMP(6),
  "duration_ms" INTEGER,
  "href_override" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hero_playlist_items_playlist_id_fkey"
    FOREIGN KEY ("playlist_id") REFERENCES "hero_playlists"("id") ON DELETE CASCADE,
  CONSTRAINT "hero_playlist_items_screen_id_fkey"
    FOREIGN KEY ("screen_id") REFERENCES "hero_screens"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "hero_playlist_publications" (
  "id" SERIAL PRIMARY KEY,
  "playlist_id" INTEGER NOT NULL,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "published_by_uid" VARCHAR(100),
  "published_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hero_playlist_publications_playlist_id_fkey"
    FOREIGN KEY ("playlist_id") REFERENCES "hero_playlists"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_hero_playlists_key"
  ON "hero_playlists"("key");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hero_screens_key"
  ON "hero_screens"("key");
CREATE INDEX IF NOT EXISTS "ix_hero_screens_type_status_updated"
  ON "hero_screens"("type", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_hero_screens_event_tile"
  ON "hero_screens"("event_tile_id");
CREATE INDEX IF NOT EXISTS "ix_hero_screens_forum_thread"
  ON "hero_screens"("forum_thread_id");
CREATE INDEX IF NOT EXISTS "ix_hero_screens_media_asset"
  ON "hero_screens"("media_asset_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hero_playlist_items_playlist_screen"
  ON "hero_playlist_items"("playlist_id", "screen_id");
CREATE INDEX IF NOT EXISTS "ix_hero_playlist_items_playlist_enabled_position"
  ON "hero_playlist_items"("playlist_id", "enabled", "position");
CREATE INDEX IF NOT EXISTS "ix_hero_playlist_items_screen"
  ON "hero_playlist_items"("screen_id");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_hero_playlist_publications_playlist_version"
  ON "hero_playlist_publications"("playlist_id", "version");
CREATE INDEX IF NOT EXISTS "ix_hero_playlist_publications_playlist_published"
  ON "hero_playlist_publications"("playlist_id", "published_at");

INSERT INTO "hero_playlists" (
  "key",
  "name",
  "autoplay",
  "default_duration_ms",
  "transition_duration_ms",
  "transition_style",
  "pause_on_hover",
  "show_arrows",
  "show_dots",
  "show_progress"
)
VALUES (
  'home-lobby-main-stage',
  'Home + Lobby Main Stage',
  TRUE,
  9000,
  700,
  'crossfade',
  TRUE,
  TRUE,
  TRUE,
  TRUE
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "hero_screens" (
  "key",
  "name",
  "type",
  "status",
  "event_tile_id",
  "default_href",
  "aria_label",
  "config"
)
SELECT
  'featured-event-main-stage',
  'Featured Event',
  'featured_event',
  'published',
  "id",
  COALESCE("cta_url", '/lobby'),
  'Open the featured AoE2WAR event',
  '{}'::jsonb
FROM "event_tiles"
WHERE "is_published" = TRUE
  AND "is_active" = TRUE
  AND "status" <> 'archived'
ORDER BY "priority" DESC, "published_at" DESC NULLS LAST, "updated_at" DESC
LIMIT 1
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "hero_screens" (
  "key",
  "name",
  "type",
  "status",
  "forum_thread_id",
  "aria_label",
  "config"
)
SELECT
  'wolo-chronicle-front-page',
  'The Wolo Chronicle',
  'chronicle_cover',
  'published',
  "id",
  'Read today''s Wolo Chronicle',
  jsonb_build_object(
    'masthead', 'THE WOLO CHRONICLE',
    'editionLabel', 'OPEN EDITION · THE LONG WAR CONTINUES',
    'eyebrow', 'HOUSE DISPATCH'
  )
FROM "forum_threads"
WHERE "channel" = 'wolo-chronicles'
ORDER BY "created_at" DESC, "id" DESC
LIMIT 1
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "hero_screens" (
  "key",
  "name",
  "type",
  "status",
  "default_href",
  "aria_label",
  "config"
)
VALUES (
  'warrior-quote-house-maxim',
  'Warrior Quote of the Day',
  'warrior_quote',
  'published',
  '/forum',
  'Enter the AoE2WAR War Room',
  jsonb_build_object(
    'eyebrow', 'WARRIOR QUOTE OF THE DAY',
    'quote', 'The calmest warrior sees the whole field.',
    'attribution', 'AoE2WAR House Maxim',
    'subline', 'Hold the line. Read the map. Choose the moment.',
    'motionPreset', 'embers',
    'theme', 'stoic'
  )
)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "hero_playlist_items" (
  "playlist_id",
  "screen_id",
  "position",
  "enabled",
  "duration_ms"
)
SELECT
  playlist."id",
  screen."id",
  CASE screen."key"
    WHEN 'featured-event-main-stage' THEN 0
    WHEN 'wolo-chronicle-front-page' THEN 1
    ELSE 2
  END,
  TRUE,
  CASE screen."key"
    WHEN 'wolo-chronicle-front-page' THEN 11000
    ELSE NULL
  END
FROM "hero_playlists" playlist
JOIN "hero_screens" screen
  ON screen."key" IN (
    'featured-event-main-stage',
    'wolo-chronicle-front-page',
    'warrior-quote-house-maxim'
  )
WHERE playlist."key" = 'home-lobby-main-stage'
ON CONFLICT ("playlist_id", "screen_id") DO NOTHING;
