ALTER TABLE "user_appearance_preferences"
ADD COLUMN IF NOT EXISTS "leaderboard_lane" VARCHAR(8) NOT NULL DEFAULT 'rm';
