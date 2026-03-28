ALTER TABLE user_appearance_preferences
  ADD COLUMN IF NOT EXISTS tile_theme_key VARCHAR(20) NOT NULL DEFAULT 'midnight';
