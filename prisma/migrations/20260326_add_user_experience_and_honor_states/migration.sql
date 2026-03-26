ALTER TABLE public.user_badges
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN display_on_profile BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN accepted_at TIMESTAMP(6);

CREATE INDEX ix_user_badges_user_status_created_at
  ON public.user_badges (user_id, status, created_at);

ALTER TABLE public.user_gifts
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN display_on_profile BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN accepted_at TIMESTAMP(6);

CREATE INDEX ix_user_gifts_user_status_created_at
  ON public.user_gifts (user_id, status, created_at);

CREATE TABLE public.user_appearance_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  theme_key VARCHAR(20) NOT NULL DEFAULT 'midnight',
  view_mode VARCHAR(20) NOT NULL DEFAULT 'steel',
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_appearance_preferences_user_id UNIQUE (user_id),
  CONSTRAINT fk_user_appearance_preferences_user_id
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE CASCADE
);

CREATE TABLE public.user_activity_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type VARCHAR(40) NOT NULL,
  path VARCHAR(160),
  label VARCHAR(80),
  metadata JSONB,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_activity_events_user_id
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE CASCADE
);

CREATE INDEX ix_user_activity_events_user_created_at
  ON public.user_activity_events (user_id, created_at DESC);

CREATE INDEX ix_user_activity_events_type_created_at
  ON public.user_activity_events (type, created_at DESC);
