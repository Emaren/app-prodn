-- War Satchel FUNDED accounting foundation. Uninstalled by default.
-- Separate from C3a simulated accounts: never mix simulation with customer assets.
-- These tables alone DO NOT authorize a wallet deposit, payout or wager.
-- App-side writers must serialize under the vault-wide transaction advisory lock,
-- re-read independent canonical chain bank solvency, and use idempotent source keys.
CREATE TABLE "war_satchel_funded_balances" (
  "owner_user_id" INTEGER NOT NULL PRIMARY KEY,
  "available_uwolo" BIGINT NOT NULL DEFAULT 0,
  "reserved_uwolo" BIGINT NOT NULL DEFAULT 0,
  "committed_uwolo" BIGINT NOT NULL DEFAULT 0,
  "withdrawal_pending_uwolo" BIGINT NOT NULL DEFAULT 0,
  "version" BIGINT NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_satchel_funded_balance_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "ck_satchel_funded_balance_nonnegative"
    CHECK ("available_uwolo" >= 0 AND "reserved_uwolo" >= 0
      AND "committed_uwolo" >= 0 AND "withdrawal_pending_uwolo" >= 0
      AND "version" >= 0)
);

-- A unique accepted external chain receipt may create at most ONE owner credit.
-- Receipt IDs reference the existing C3d NON-CREDITING attestation record;
-- the funded journal remains a different authority, never simulation journals.
CREATE TABLE "war_satchel_funded_receipts" (
  "id" BIGSERIAL PRIMARY KEY,
  "owner_user_id" INTEGER NOT NULL,
  "proof_candidate_id" BIGINT NOT NULL,
  "chain_id" VARCHAR(32) NOT NULL DEFAULT 'wolo-1',
  "tx_hash" VARCHAR(64) NOT NULL,
  "transfer_index" INTEGER NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "vault_address" VARCHAR(100) NOT NULL,
  "canonical_height" BIGINT NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_satchel_funded_receipt_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_satchel_funded_receipt_proof"
    FOREIGN KEY ("proof_candidate_id") REFERENCES "war_satchel_proof_candidates"("id") ON DELETE RESTRICT,
  CONSTRAINT "uq_satchel_funded_proof" UNIQUE ("proof_candidate_id"),
  CONSTRAINT "uq_satchel_funded_chain_transfer" UNIQUE ("chain_id", "tx_hash", "transfer_index"),
  CONSTRAINT "ck_satchel_funded_receipt_canonical"
    CHECK ("chain_id"='wolo-1' AND "transfer_index"=0
      AND "amount_uwolo">0 AND "canonical_height">0)
);
CREATE INDEX "ix_satchel_funded_receipts_owner" ON "war_satchel_funded_receipts" ("owner_user_id", "created_at");

-- Every transition is a separately idempotent financial source operation.
-- Entries are audit evidence; only the explicitly reviewed DB transaction
-- adapter may change balances. Live debit transitions must balance to zero.
CREATE TABLE "war_satchel_funded_journal" (
  "id" BIGSERIAL PRIMARY KEY,
  "owner_user_id" INTEGER NOT NULL,
  "source_key" VARCHAR(180) NOT NULL,
  "event_kind" VARCHAR(28) NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "delta_available_uwolo" BIGINT NOT NULL,
  "delta_reserved_uwolo" BIGINT NOT NULL,
  "delta_committed_uwolo" BIGINT NOT NULL,
  "delta_withdrawal_pending_uwolo" BIGINT NOT NULL,
  "receipt_id" BIGINT,
  "execution_id" INTEGER,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_satchel_funded_journal_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_satchel_funded_journal_receipt"
    FOREIGN KEY ("receipt_id") REFERENCES "war_satchel_funded_receipts"("id") ON DELETE RESTRICT,
  CONSTRAINT "uq_satchel_funded_journal_source" UNIQUE ("source_key"),
  CONSTRAINT "ck_satchel_funded_journal_positive" CHECK ("amount_uwolo" > 0),
  CONSTRAINT "ck_satchel_funded_journal_kind" CHECK ("event_kind" IN
    ('deposit_credit', 'wager_reserve', 'wager_commit', 'wager_refund',
     'withdraw_reserve', 'withdraw_cancel', 'withdraw_sent')),
  CONSTRAINT "ck_satchel_funded_journal_conservation" CHECK (
    CASE "event_kind"
      WHEN 'deposit_credit' THEN
        "receipt_id" IS NOT NULL
        AND "delta_available_uwolo" = "amount_uwolo"
        AND "delta_reserved_uwolo" = 0
        AND "delta_committed_uwolo" = 0
        AND "delta_withdrawal_pending_uwolo" = 0
      WHEN 'wager_reserve' THEN
        "execution_id" IS NOT NULL
        AND "delta_available_uwolo" = -"amount_uwolo"
        AND "delta_reserved_uwolo" = "amount_uwolo"
        AND "delta_committed_uwolo" = 0
        AND "delta_withdrawal_pending_uwolo" = 0
      WHEN 'wager_commit' THEN
        "execution_id" IS NOT NULL
        AND "delta_available_uwolo" = 0
        AND "delta_reserved_uwolo" = -"amount_uwolo"
        AND "delta_committed_uwolo" = "amount_uwolo"
        AND "delta_withdrawal_pending_uwolo" = 0
      WHEN 'wager_refund' THEN
        "execution_id" IS NOT NULL
        AND "delta_available_uwolo" = "amount_uwolo"
        AND "delta_reserved_uwolo" = -"amount_uwolo"
        AND "delta_committed_uwolo" = 0
        AND "delta_withdrawal_pending_uwolo" = 0
      WHEN 'withdraw_reserve' THEN
        "delta_available_uwolo" = -"amount_uwolo"
        AND "delta_reserved_uwolo" = 0
        AND "delta_committed_uwolo" = 0
        AND "delta_withdrawal_pending_uwolo" = "amount_uwolo"
      WHEN 'withdraw_cancel' THEN
        "delta_available_uwolo" = "amount_uwolo"
        AND "delta_reserved_uwolo" = 0
        AND "delta_committed_uwolo" = 0
        AND "delta_withdrawal_pending_uwolo" = -"amount_uwolo"
      WHEN 'withdraw_sent' THEN
        "delta_available_uwolo" = 0
        AND "delta_reserved_uwolo" = 0
        AND "delta_committed_uwolo" = 0
        AND "delta_withdrawal_pending_uwolo" = -"amount_uwolo"
      ELSE FALSE
    END
  )
);
CREATE INDEX "ix_satchel_funded_journal_owner" ON "war_satchel_funded_journal" ("owner_user_id", "id");

-- Exactly one immutable per-game reservation identity; the existing
-- BetAutoExecution unique preset+game key provides the upstream dedupe.
CREATE TABLE "war_satchel_funded_reservations" (
  "id" VARCHAR(128) NOT NULL PRIMARY KEY,
  "owner_user_id" INTEGER NOT NULL,
  "execution_id" INTEGER NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'reserved',
  "ticket_request_id" VARCHAR(128) NOT NULL,
  "ticket_id" INTEGER,
  "tx_hash" VARCHAR(64),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_satchel_funded_reservation_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_satchel_funded_reservation_execution"
    FOREIGN KEY ("execution_id") REFERENCES "bet_auto_executions"("id") ON DELETE RESTRICT,
  CONSTRAINT "uq_satchel_funded_reservation_execution" UNIQUE ("execution_id"),
  CONSTRAINT "uq_satchel_funded_reservation_ticket_request" UNIQUE ("ticket_request_id"),
  CONSTRAINT "uq_satchel_funded_reservation_ticket" UNIQUE ("ticket_id"),
  CONSTRAINT "ck_satchel_funded_reservation_amount" CHECK ("amount_uwolo" > 0),
  CONSTRAINT "ck_satchel_funded_reservation_status"
    CHECK ("status" IN ('reserved', 'unknown_hold', 'committed', 'released'))
);
CREATE INDEX "ix_satchel_funded_reservation_owner" ON "war_satchel_funded_reservations" ("owner_user_id", "status", "created_at");
