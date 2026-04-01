CREATE TABLE chat_message_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(24) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_chat_message_reactions_message_user_emoji
  ON chat_message_reactions(message_id, user_id, emoji);

CREATE INDEX ix_chat_message_reactions_message_id
  ON chat_message_reactions(message_id, created_at);

CREATE INDEX ix_chat_message_reactions_user_id
  ON chat_message_reactions(user_id, created_at);

CREATE TABLE chat_message_guest_reactions (
  id SERIAL PRIMARY KEY,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  guest_session_id VARCHAR(64) NOT NULL,
  emoji VARCHAR(24) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_chat_message_guest_reactions_message_session_emoji
  ON chat_message_guest_reactions(message_id, guest_session_id, emoji);

CREATE INDEX ix_chat_message_guest_reactions_message_id
  ON chat_message_guest_reactions(message_id, created_at);

CREATE INDEX ix_chat_message_guest_reactions_guest_session_id
  ON chat_message_guest_reactions(guest_session_id, created_at);
