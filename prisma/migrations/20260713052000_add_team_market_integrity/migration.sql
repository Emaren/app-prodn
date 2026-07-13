ALTER TABLE "bet_markets"
  ADD COLUMN "team_format" VARCHAR(16),
  ADD COLUMN "team_resolution_status" VARCHAR(24),
  ADD COLUMN "team_resolution_provenance" VARCHAR(48),
  ADD COLUMN "team_confidence" VARCHAR(16),
  ADD COLUMN "left_roster_snapshot" JSONB,
  ADD COLUMN "right_roster_snapshot" JSONB,
  ADD COLUMN "source_parse_iteration" INTEGER,
  ADD COLUMN "source_roster_hash" VARCHAR(64),
  ADD COLUMN "proposition_hash" VARCHAR(64),
  ADD COLUMN "integrity_status" VARCHAR(32) NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN "integrity_reason" VARCHAR(120),
  ADD COLUMN "roster_locked_at" TIMESTAMP(6),
  ADD COLUMN "betting_locked_at" TIMESTAMP(6),
  ADD COLUMN "first_stake_accepted_at" TIMESTAMP(6),
  ADD COLUMN "under_review_at" TIMESTAMP(6);

CREATE TABLE "bet_market_integrity_incidents" (
  "id" SERIAL PRIMARY KEY,
  "market_id" INTEGER NOT NULL,
  "incident_key" VARCHAR(96) NOT NULL,
  "incident_type" VARCHAR(48) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'open',
  "public_summary" VARCHAR(180) NOT NULL,
  "evidence" JSONB NOT NULL,
  "original_left_label" VARCHAR(255) NOT NULL,
  "original_right_label" VARCHAR(255) NOT NULL,
  "verified_left_roster" JSONB,
  "verified_right_roster" JSONB,
  "original_payout_wolo" INTEGER NOT NULL DEFAULT 0,
  "void_entitlement_wolo" INTEGER NOT NULL DEFAULT 0,
  "underpayment_wolo" INTEGER NOT NULL DEFAULT 0,
  "overpayment_wolo" INTEGER NOT NULL DEFAULT 0,
  "betting_fee_reversed_wolo" INTEGER NOT NULL DEFAULT 0,
  "operator_return_status" VARCHAR(32),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  "resolved_at" TIMESTAMP(6),
  CONSTRAINT "fk_bet_market_integrity_incidents_market"
    FOREIGN KEY ("market_id") REFERENCES "bet_markets"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "bet_market_financial_adjustments" (
  "id" SERIAL PRIMARY KEY,
  "incident_id" INTEGER NOT NULL,
  "wager_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "original_stake_wolo" INTEGER NOT NULL,
  "amount_already_paid_wolo" INTEGER NOT NULL DEFAULT 0,
  "void_entitlement_wolo" INTEGER NOT NULL,
  "amount_still_owed_wolo" INTEGER NOT NULL DEFAULT 0,
  "overpayment_wolo" INTEGER NOT NULL DEFAULT 0,
  "adjustment_status" VARCHAR(32) NOT NULL DEFAULT 'recorded',
  "corrective_claim_id" INTEGER,
  "corrective_tx_hash" VARCHAR(128),
  "voluntary_return_status" VARCHAR(32),
  "voluntary_return_tx_hash" VARCHAR(128),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "fk_bet_market_financial_adjustments_incident"
    FOREIGN KEY ("incident_id") REFERENCES "bet_market_integrity_incidents"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE TABLE "player_identity_aliases" (
  "id" SERIAL PRIMARY KEY,
  "observed_name" VARCHAR(100) NOT NULL,
  "observed_normalized_name" VARCHAR(100) NOT NULL,
  "canonical_stable_player_key" VARCHAR(128) NOT NULL,
  "canonical_display_name" VARCHAR(100) NOT NULL,
  "steam_id" VARCHAR(32),
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "evidence" JSONB,
  "reviewed_by_user_id" INTEGER,
  "reviewed_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL
);

CREATE INDEX "ix_bet_markets_integrity_status" ON "bet_markets"("integrity_status", "status");
CREATE INDEX "ix_bet_markets_proposition_hash" ON "bet_markets"("proposition_hash");
CREATE UNIQUE INDEX "uq_bet_market_integrity_incidents_key" ON "bet_market_integrity_incidents"("incident_key");
CREATE INDEX "ix_bet_market_integrity_incidents_market" ON "bet_market_integrity_incidents"("market_id", "status");
CREATE INDEX "ix_bet_market_integrity_incidents_status" ON "bet_market_integrity_incidents"("status", "created_at");
CREATE UNIQUE INDEX "uq_bet_market_financial_adjustments_incident_wager" ON "bet_market_financial_adjustments"("incident_id", "wager_id");
CREATE INDEX "ix_bet_market_financial_adjustments_user" ON "bet_market_financial_adjustments"("user_id", "adjustment_status");
CREATE INDEX "ix_bet_market_financial_adjustments_corrective_tx" ON "bet_market_financial_adjustments"("corrective_tx_hash");
CREATE UNIQUE INDEX "uq_player_identity_alias_observed_canonical" ON "player_identity_aliases"("observed_normalized_name", "canonical_stable_player_key");
CREATE INDEX "ix_player_identity_alias_status" ON "player_identity_aliases"("status", "created_at");
CREATE INDEX "ix_player_identity_alias_steam_id" ON "player_identity_aliases"("steam_id");

ALTER TABLE "bet_market_financial_adjustments"
  ADD CONSTRAINT "fk_bet_market_financial_adjustments_wager"
    FOREIGN KEY ("wager_id") REFERENCES "bet_wagers"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_bet_market_financial_adjustments_user"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
  ADD CONSTRAINT "fk_bet_market_financial_adjustments_claim"
    FOREIGN KEY ("corrective_claim_id") REFERENCES "pending_wolo_claims"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "player_identity_aliases"
  ADD CONSTRAINT "fk_player_identity_aliases_reviewer"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

UPDATE "bet_markets" AS market
SET "first_stake_accepted_at" = wager.first_stake_at,
    "betting_locked_at" = wager.first_stake_at,
    "roster_locked_at" = wager.first_stake_at
FROM (
  SELECT "market_id", MIN("created_at") AS first_stake_at
  FROM "bet_wagers"
  GROUP BY "market_id"
) AS wager
WHERE market."id" = wager."market_id";
