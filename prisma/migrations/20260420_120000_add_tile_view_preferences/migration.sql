ALTER TABLE "user_appearance_preferences"
ADD COLUMN IF NOT EXISTS "tile_view_preferences" JSONB;
