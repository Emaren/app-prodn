ALTER TABLE "user_appearance_preferences"
ADD COLUMN IF NOT EXISTS "hero_language_visibility" JSONB;
