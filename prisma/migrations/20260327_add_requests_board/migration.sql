CREATE TABLE community_requests (
  id SERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP(6),
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_community_requests_status_created_at
  ON community_requests(status, created_at);

CREATE INDEX ix_community_requests_completed_at
  ON community_requests(completed_at);

CREATE INDEX ix_community_requests_created_by_user_id
  ON community_requests(created_by_user_id, created_at);

CREATE TABLE community_request_votes (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_community_request_votes_request_user
  ON community_request_votes(request_id, user_id);

CREATE INDEX ix_community_request_votes_request_id
  ON community_request_votes(request_id, updated_at);

CREATE INDEX ix_community_request_votes_user_id
  ON community_request_votes(user_id, updated_at);

CREATE TABLE community_request_comments (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  author_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id INTEGER REFERENCES community_request_comments(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_community_request_comments_request_parent_created_at
  ON community_request_comments(request_id, parent_id, created_at);

CREATE INDEX ix_community_request_comments_author_user_id
  ON community_request_comments(author_user_id, created_at);
