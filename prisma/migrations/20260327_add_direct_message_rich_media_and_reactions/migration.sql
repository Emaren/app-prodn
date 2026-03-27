ALTER TABLE direct_conversation_participants
ADD COLUMN typing_updated_at TIMESTAMP(6);

ALTER TABLE direct_messages
ALTER COLUMN body DROP NOT NULL;

ALTER TABLE direct_messages
ALTER COLUMN body TYPE TEXT;

ALTER TABLE direct_messages
ADD COLUMN attachment_kind VARCHAR(20),
ADD COLUMN attachment_name VARCHAR(255),
ADD COLUMN attachment_mime_type VARCHAR(120),
ADD COLUMN attachment_data_url TEXT,
ADD COLUMN attachment_duration_seconds INTEGER;

CREATE TABLE direct_message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(24) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_direct_message_reactions_message_user_emoji
  ON direct_message_reactions(message_id, user_id, emoji);

CREATE INDEX ix_direct_message_reactions_message_id
  ON direct_message_reactions(message_id, created_at);

CREATE INDEX ix_direct_message_reactions_user_id
  ON direct_message_reactions(user_id, created_at);

