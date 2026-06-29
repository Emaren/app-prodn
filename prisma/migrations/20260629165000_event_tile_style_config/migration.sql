ALTER TABLE "event_tiles"
  ADD COLUMN IF NOT EXISTS "style_config" JSONB;
