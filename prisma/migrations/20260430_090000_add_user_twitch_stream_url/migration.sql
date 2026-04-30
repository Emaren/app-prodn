ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS twitch_stream_url VARCHAR(500);
