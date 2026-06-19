CREATE TABLE IF NOT EXISTS "trophies" (
  "id" SERIAL PRIMARY KEY,
  "trophy_id" VARCHAR(100) NOT NULL,
  "display_name" VARCHAR(160) NOT NULL,
  "kind" VARCHAR(24) NOT NULL,
  "family" VARCHAR(32) NOT NULL,
  "tier" VARCHAR(40),
  "status" VARCHAR(32) NOT NULL DEFAULT 'vacant',
  "current_holder_user_id" INTEGER,
  "current_holder_display_name" VARCHAR(120),
  "current_holder_wolo_address" VARCHAR(100),
  "guardian_holder_user_id" INTEGER,
  "guardian_holder_display_name" VARCHAR(120),
  "guardian_holder_wolo_address" VARCHAR(100),
  "eligible_nationality" VARCHAR(40),
  "elo_band_min" INTEGER,
  "elo_band_max" INTEGER,
  "current_bounty_wolo" INTEGER NOT NULL DEFAULT 0,
  "tribute_amount_wolo" INTEGER NOT NULL DEFAULT 0,
  "bounty_growth_wolo" INTEGER NOT NULL DEFAULT 0,
  "payout_frequency" VARCHAR(24) NOT NULL DEFAULT 'daily',
  "bounty_accrual_frequency" VARCHAR(24) NOT NULL DEFAULT 'daily',
  "nft_class_id" VARCHAR(120),
  "nft_id" VARCHAR(160),
  "nft_metadata_uri" VARCHAR(500),
  "nft_image_uri" VARCHAR(500),
  "chain_status" VARCHAR(32) NOT NULL DEFAULT 'app_only',
  "chain_owner_address" VARCHAR(100),
  "last_chain_sync_at" TIMESTAMP(6),
  "forfeiture_needed" BOOLEAN NOT NULL DEFAULT FALSE,
  "eligibility_note" VARCHAR(255),
  "holder_since" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "trophies_current_holder_fkey" FOREIGN KEY ("current_holder_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "trophies_guardian_holder_fkey" FOREIGN KEY ("guardian_holder_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_trophies_trophy_id" ON "trophies"("trophy_id");
CREATE INDEX IF NOT EXISTS "ix_trophies_kind_status" ON "trophies"("kind", "status");
CREATE INDEX IF NOT EXISTS "ix_trophies_family_status" ON "trophies"("family", "status");
CREATE INDEX IF NOT EXISTS "ix_trophies_current_holder" ON "trophies"("current_holder_user_id");
CREATE INDEX IF NOT EXISTS "ix_trophies_guardian_holder" ON "trophies"("guardian_holder_user_id");
CREATE INDEX IF NOT EXISTS "ix_trophies_chain_status" ON "trophies"("chain_status");
CREATE INDEX IF NOT EXISTS "ix_trophies_forfeiture_needed" ON "trophies"("forfeiture_needed");

CREATE TABLE IF NOT EXISTS "trophy_economics_versions" (
  "id" SERIAL PRIMARY KEY,
  "trophy_id" INTEGER NOT NULL REFERENCES "trophies"("id") ON DELETE CASCADE,
  "tribute_amount_wolo" INTEGER NOT NULL,
  "bounty_growth_wolo" INTEGER NOT NULL,
  "payout_frequency" VARCHAR(24) NOT NULL,
  "bounty_accrual_frequency" VARCHAR(24) NOT NULL,
  "effective_from" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(6),
  "changed_by_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" VARCHAR(255),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ix_trophy_economics_trophy_effective" ON "trophy_economics_versions"("trophy_id", "effective_from");
CREATE INDEX IF NOT EXISTS "ix_trophy_economics_changed_by" ON "trophy_economics_versions"("changed_by_user_id");

CREATE TABLE IF NOT EXISTS "trophy_challenges" (
  "id" SERIAL PRIMARY KEY,
  "trophy_id" INTEGER NOT NULL REFERENCES "trophies"("id") ON DELETE CASCADE,
  "challenge_kind" VARCHAR(32) NOT NULL,
  "challenger_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "defender_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "guardian_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "challenger_wolo_address" VARCHAR(100),
  "defender_wolo_address" VARCHAR(100),
  "expected_player_names" JSONB,
  "required_nationality" VARCHAR(40),
  "required_elo_min" INTEGER,
  "required_elo_max" INTEGER,
  "eligibility_snapshot" JSONB,
  "eligibility_override" BOOLEAN NOT NULL DEFAULT FALSE,
  "status" VARCHAR(40) NOT NULL DEFAULT 'draft',
  "game_id" INTEGER,
  "replay_id" INTEGER REFERENCES "game_stats"("id") ON DELETE SET NULL,
  "scheduled_match_id" INTEGER REFERENCES "scheduled_matches"("id") ON DELETE SET NULL,
  "watcher_session_id" VARCHAR(255),
  "watcher_pairing_id" VARCHAR(255),
  "winner_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "verification_summary" TEXT,
  "settlement_status" VARCHAR(32) NOT NULL DEFAULT 'not_started',
  "chain_tx_hash" VARCHAR(128),
  "payout_tx_hash" VARCHAR(128),
  "error_state" VARCHAR(255),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ix_trophy_challenges_trophy_status_updated" ON "trophy_challenges"("trophy_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "ix_trophy_challenges_challenger_status" ON "trophy_challenges"("challenger_user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_trophy_challenges_defender_status" ON "trophy_challenges"("defender_user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_trophy_challenges_watcher_session" ON "trophy_challenges"("watcher_session_id");
CREATE INDEX IF NOT EXISTS "ix_trophy_challenges_replay" ON "trophy_challenges"("replay_id");

CREATE TABLE IF NOT EXISTS "trophy_events" (
  "id" SERIAL PRIMARY KEY,
  "trophy_id" INTEGER NOT NULL REFERENCES "trophies"("id") ON DELETE CASCADE,
  "event_type" VARCHAR(64) NOT NULL,
  "actor_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "actor_role" VARCHAR(24) NOT NULL DEFAULT 'system',
  "initiated_by" VARCHAR(24) NOT NULL DEFAULT 'system',
  "from_holder_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "to_holder_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "from_wolo_address" VARCHAR(100),
  "to_wolo_address" VARCHAR(100),
  "amount_wolo" INTEGER,
  "game_id" INTEGER,
  "replay_id" INTEGER REFERENCES "game_stats"("id") ON DELETE SET NULL,
  "challenge_id" INTEGER REFERENCES "trophy_challenges"("id") ON DELETE SET NULL,
  "chain_tx_hash" VARCHAR(128),
  "status" VARCHAR(32) NOT NULL DEFAULT 'recorded',
  "raw_request" JSONB,
  "raw_response" JSONB,
  "error_message" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ix_trophy_events_trophy_created" ON "trophy_events"("trophy_id", "created_at");
CREATE INDEX IF NOT EXISTS "ix_trophy_events_type_status_created" ON "trophy_events"("event_type", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_trophy_events_challenge" ON "trophy_events"("challenge_id");
CREATE INDEX IF NOT EXISTS "ix_trophy_events_chain_tx" ON "trophy_events"("chain_tx_hash");

CREATE TABLE IF NOT EXISTS "trophy_payouts" (
  "id" SERIAL PRIMARY KEY,
  "trophy_id" INTEGER NOT NULL REFERENCES "trophies"("id") ON DELETE CASCADE,
  "recipient_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "recipient_display_name" VARCHAR(120),
  "recipient_wolo_address" VARCHAR(100),
  "amount_wolo" INTEGER NOT NULL,
  "payout_kind" VARCHAR(32) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "scheduled_for" TIMESTAMP(6),
  "paid_at" TIMESTAMP(6),
  "tx_hash" VARCHAR(128),
  "error_state" VARCHAR(255),
  "raw_request" JSONB,
  "raw_response" JSONB,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ix_trophy_payouts_trophy_status_created" ON "trophy_payouts"("trophy_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ix_trophy_payouts_recipient_status" ON "trophy_payouts"("recipient_user_id", "status");
CREATE INDEX IF NOT EXISTS "ix_trophy_payouts_tx_hash" ON "trophy_payouts"("tx_hash");

CREATE TABLE IF NOT EXISTS "trophy_settings" (
  "id" SERIAL PRIMARY KEY,
  "key" VARCHAR(100) NOT NULL,
  "value" JSONB NOT NULL,
  "changed_by_user_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" VARCHAR(255),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "uq_trophy_settings_key" ON "trophy_settings"("key");
CREATE INDEX IF NOT EXISTS "ix_trophy_settings_changed_by" ON "trophy_settings"("changed_by_user_id");
