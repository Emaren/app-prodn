CREATE TABLE bet_markets (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(120) NOT NULL,
  title VARCHAR(160) NOT NULL,
  event_label VARCHAR(120) NOT NULL,
  market_type VARCHAR(32) NOT NULL DEFAULT 'winner',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  left_label VARCHAR(80) NOT NULL,
  right_label VARCHAR(80) NOT NULL,
  left_href VARCHAR(160),
  right_href VARCHAR(160),
  seed_left_wolo INTEGER NOT NULL DEFAULT 0,
  seed_right_wolo INTEGER NOT NULL DEFAULT 0,
  close_at TIMESTAMP(6),
  settled_at TIMESTAMP(6),
  winner_side VARCHAR(20),
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX bet_markets_slug_key
  ON bet_markets(slug);

CREATE INDEX ix_bet_markets_status_featured_sort_order
  ON bet_markets(status, featured, sort_order);

CREATE INDEX ix_bet_markets_close_at
  ON bet_markets(close_at);

CREATE TABLE bet_wagers (
  id SERIAL PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES bet_markets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side VARCHAR(20) NOT NULL,
  amount_wolo INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TIMESTAMP(6)
);

CREATE UNIQUE INDEX uq_bet_wagers_market_user
  ON bet_wagers(market_id, user_id);

CREATE INDEX ix_bet_wagers_user_status_updated_at
  ON bet_wagers(user_id, status, updated_at);

CREATE INDEX ix_bet_wagers_market_status_updated_at
  ON bet_wagers(market_id, status, updated_at);
