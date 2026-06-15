ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS represented_country VARCHAR(40),
  ADD COLUMN IF NOT EXISTS represented_country_updated_at TIMESTAMP(6),
  ADD COLUMN IF NOT EXISTS gender_division VARCHAR(16) NOT NULL DEFAULT 'Man',
  ADD COLUMN IF NOT EXISTS gender_division_updated_at TIMESTAMP(6);

UPDATE public.users
SET gender_division = 'Man'
WHERE gender_division IS NULL OR gender_division = '';

CREATE INDEX IF NOT EXISTS ix_users_represented_country
  ON public.users(represented_country);

CREATE INDEX IF NOT EXISTS ix_users_gender_division
  ON public.users(gender_division);
