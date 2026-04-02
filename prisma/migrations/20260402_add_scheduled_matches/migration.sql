CREATE TABLE scheduled_matches (
  id SERIAL PRIMARY KEY,
  challenger_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenged_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  scheduled_at TIMESTAMP(6) NOT NULL,
  challenge_note VARCHAR(160),
  accepted_at TIMESTAMP(6),
  declined_at TIMESTAMP(6),
  cancelled_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_scheduled_matches_status_scheduled_at
  ON scheduled_matches(status, scheduled_at);

CREATE INDEX ix_scheduled_matches_challenger_scheduled_at
  ON scheduled_matches(challenger_user_id, scheduled_at);

CREATE INDEX ix_scheduled_matches_challenged_scheduled_at
  ON scheduled_matches(challenged_user_id, scheduled_at);
