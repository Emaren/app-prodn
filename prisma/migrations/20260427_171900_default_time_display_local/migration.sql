UPDATE "user_appearance_preferences"
SET "time_display_mode" = 'local'
WHERE "time_display_mode" = 'utc';

ALTER TABLE "user_appearance_preferences"
ALTER COLUMN "time_display_mode" SET DEFAULT 'local';
