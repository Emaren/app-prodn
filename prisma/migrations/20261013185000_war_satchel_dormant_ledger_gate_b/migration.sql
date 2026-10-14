-- Gate B storage substrate ONLY. No API/wallet/worker is enabled by this
-- migration. Never credit a historic transfer without cross-rail audit.
CREATE TABLE "war_satchel_accounts" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "chain_id" VARCHAR(32) NOT NULL DEFAULT 'wolo-1',
    "vault_address" VARCHAR(100),
    "status" VARCHAR(24) NOT NULL DEFAULT 'inactive',
    "available_uwolo" BIGINT NOT NULL DEFAULT 0,
    "reserved_uwolo" BIGINT NOT NULL DEFAULT 0,
    "committed_uwolo" BIGINT NOT NULL DEFAULT 0,
    "withdrawal_held_uwolo" BIGINT NOT NULL DEFAULT 0,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "last_reconciled_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_war_satchel_accounts_user_id" UNIQUE ("user_id"),
    CONSTRAINT "ck_war_satchel_account_nonnegative" CHECK (
      "available_uwolo" >= 0 AND "reserved_uwolo" >= 0 AND
      "committed_uwolo" >= 0 AND "withdrawal_held_uwolo" >= 0 AND "revision" >= 0
    ),
    CONSTRAINT "ck_war_satchel_account_chain" CHECK ("chain_id" = 'wolo-1'),
    CONSTRAINT "ck_war_satchel_account_status" CHECK (
      "status" IN ('inactive','locked','ready','paused','disputed')
    )
);
CREATE INDEX "ix_war_satchel_accounts_status_updated" ON "war_satchel_accounts"("status","updated_at");
ALTER TABLE "war_satchel_accounts" ADD CONSTRAINT "war_satchel_accounts_user_id_fkey"
 FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE TABLE "war_satchel_deposit_intents" (
    "id" UUID NOT NULL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "chain_id" VARCHAR(32) NOT NULL DEFAULT 'wolo-1',
    "nonce" VARCHAR(64) NOT NULL,
    "sender_address" VARCHAR(100) NOT NULL,
    "vault_address" VARCHAR(100) NOT NULL,
    "amount_uwolo" BIGINT NOT NULL,
    "exact_memo" VARCHAR(240) NOT NULL,
    "signed_digest" VARCHAR(64),
    "status" VARCHAR(24) NOT NULL DEFAULT 'created',
    "expires_at" TIMESTAMP(6) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_war_satchel_deposit_intents_owner_nonce" UNIQUE ("user_id","nonce"),
    CONSTRAINT "uq_war_satchel_deposit_intents_memo" UNIQUE ("chain_id","exact_memo"),
    CONSTRAINT "ck_war_satchel_intent_amount" CHECK ("amount_uwolo" > 0),
    CONSTRAINT "ck_war_satchel_intent_chain" CHECK ("chain_id" = 'wolo-1'),
    CONSTRAINT "ck_war_satchel_intent_status" CHECK (
      "status" IN ('created','signed','observed','verified','credited','expired','disputed')
    )
);
CREATE INDEX "ix_war_satchel_deposit_intents_status_expiry" ON "war_satchel_deposit_intents"("status","expires_at");
ALTER TABLE "war_satchel_deposit_intents" ADD CONSTRAINT "war_satchel_deposit_intents_user_id_fkey"
 FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- This must become the global transfer-claim authority for ALL rails before
-- live use: manual BetStakeTickets, legacy BetStakeIntents, refunds, staking
-- and Satchel. No existing historical rows are automatically backfilled here.
CREATE TABLE "wolo_transfer_claims" (
    "id" BIGSERIAL PRIMARY KEY,
    "chain_id" VARCHAR(32) NOT NULL,
    "tx_hash" VARCHAR(64) NOT NULL,
    "transfer_index" INTEGER NOT NULL,
    "rail" VARCHAR(32) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount_uwolo" BIGINT NOT NULL,
    "block_height" BIGINT NOT NULL,
    "source_evidence_sha256" VARCHAR(64) NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'observed',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_wolo_transfer_claims_chain_tx_event" UNIQUE ("chain_id","tx_hash","transfer_index"),
    CONSTRAINT "ck_wolo_transfer_claim_amount" CHECK ("amount_uwolo" > 0 AND "block_height" > 0 AND "transfer_index" >= 0),
    CONSTRAINT "ck_wolo_transfer_claim_chain" CHECK ("chain_id" = 'wolo-1'),
    CONSTRAINT "ck_wolo_transfer_claim_status" CHECK ("status" IN ('observed','verified','allocated','disputed')),
    CONSTRAINT "ck_wolo_transfer_claim_rail" CHECK ("rail" IN ('manual_bet','satchel','staking','refund','other')),
    CONSTRAINT "ck_wolo_transfer_claim_hash" CHECK (
      "tx_hash" ~ '^[0-9A-F]{64}$' AND "source_evidence_sha256" ~ '^[0-9a-f]{64}$'
    )
);
CREATE INDEX "ix_wolo_transfer_claims_user_status" ON "wolo_transfer_claims"("user_id","status");
ALTER TABLE "wolo_transfer_claims" ADD CONSTRAINT "wolo_transfer_claims_user_id_fkey"
 FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

CREATE TABLE "war_satchel_journal" (
    "id" BIGSERIAL PRIMARY KEY,
    "account_id" INTEGER NOT NULL,
    "event_key" VARCHAR(160) NOT NULL,
    "transfer_claim_id" BIGINT,
    "kind" VARCHAR(40) NOT NULL,
    "delta_available_uwolo" BIGINT NOT NULL DEFAULT 0,
    "delta_reserved_uwolo" BIGINT NOT NULL DEFAULT 0,
    "delta_committed_uwolo" BIGINT NOT NULL DEFAULT 0,
    "delta_withdrawal_uwolo" BIGINT NOT NULL DEFAULT 0,
    "after_available_uwolo" BIGINT NOT NULL,
    "after_reserved_uwolo" BIGINT NOT NULL,
    "after_committed_uwolo" BIGINT NOT NULL,
    "after_withdrawal_uwolo" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uq_war_satchel_journal_event_key" UNIQUE ("event_key"),
    CONSTRAINT "uq_war_satchel_journal_transfer_claim" UNIQUE ("transfer_claim_id"),
    CONSTRAINT "ck_war_satchel_journal_post_nonnegative" CHECK (
      "after_available_uwolo" >= 0 AND "after_reserved_uwolo" >= 0 AND
      "after_committed_uwolo" >= 0 AND "after_withdrawal_uwolo" >= 0
    ),
    CONSTRAINT "ck_war_satchel_journal_nonzero" CHECK (
      "delta_available_uwolo" <> 0 OR "delta_reserved_uwolo" <> 0 OR
      "delta_committed_uwolo" <> 0 OR "delta_withdrawal_uwolo" <> 0
    )
);
CREATE INDEX "ix_war_satchel_journal_account_created" ON "war_satchel_journal"("account_id","created_at","id");
ALTER TABLE "war_satchel_journal" ADD CONSTRAINT "war_satchel_journal_account_id_fkey"
 FOREIGN KEY ("account_id") REFERENCES "war_satchel_accounts"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "war_satchel_journal" ADD CONSTRAINT "war_satchel_journal_transfer_claim_id_fkey"
 FOREIGN KEY ("transfer_claim_id") REFERENCES "wolo_transfer_claims"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- An immutable journal must never be cosmetically rewritten to hide losses.
CREATE FUNCTION "reject_war_satchel_journal_mutation"() RETURNS TRIGGER
 LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'war_satchel_journal is append only'
    USING ERRCODE = 'integrity_constraint_violation';
END
$$;
CREATE TRIGGER "war_satchel_journal_immutable"
 BEFORE UPDATE OR DELETE ON "war_satchel_journal"
 FOR EACH ROW EXECUTE FUNCTION "reject_war_satchel_journal_mutation"();

-- A once-claimed on-chain transfer is never transferable to another owner,
-- amount, rail or source, and must never be deleted for reuse.
CREATE FUNCTION "protect_wolo_transfer_claim_identity"() RETURNS TRIGGER
 LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a transfer claim cannot be deleted';
  END IF;
  IF (NEW."chain_id", NEW."tx_hash", NEW."transfer_index",
      NEW."user_id", NEW."rail", NEW."amount_uwolo",
      NEW."block_height", NEW."source_evidence_sha256") IS DISTINCT FROM
     (OLD."chain_id", OLD."tx_hash", OLD."transfer_index",
      OLD."user_id", OLD."rail", OLD."amount_uwolo",
      OLD."block_height", OLD."source_evidence_sha256") THEN
    RAISE EXCEPTION 'transfer claim identity and evidence are immutable';
  END IF;
  IF NEW."status" <> OLD."status" AND NOT (
    (OLD."status" = 'observed' AND NEW."status" IN ('verified','disputed')) OR
    (OLD."status" = 'verified' AND NEW."status" IN ('allocated','disputed')) OR
    (OLD."status" = 'allocated' AND NEW."status" = 'disputed')
  ) THEN
    RAISE EXCEPTION 'transfer claim status cannot regress';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "wolo_transfer_claim_identity_guard"
 BEFORE UPDATE OR DELETE ON "wolo_transfer_claims"
 FOR EACH ROW EXECUTE FUNCTION "protect_wolo_transfer_claim_identity"();


-- An immutable journal alone is insufficient. Lock the exact global transfer
-- claim long enough to prove that money in this row belongs to this owner,
-- carries an already allocated receipt, and agrees on integer uwolo amount.
-- Independent chain proof and bank/aggregate-liability parity are still
-- REQUIRED before any application writer can be enabled.
CREATE FUNCTION "guard_war_satchel_journal_claim"() RETURNS TRIGGER
 LANGUAGE plpgsql AS $$
DECLARE
  owner_id INTEGER;
  claim_owner INTEGER;
  claim_amount BIGINT;
  claim_rail VARCHAR(32);
  claim_state VARCHAR(24);
  expected_amount BIGINT;
BEGIN
  IF NEW."kind" IN (
    'verified_deposit','verified_payout','verified_refund','withdraw_confirmed'
  ) THEN
    IF NEW."transfer_claim_id" IS NULL THEN
      RAISE EXCEPTION 'external money movement missing transfer claim'
        USING ERRCODE = '23514';
    END IF;
    SELECT "user_id" INTO owner_id FROM "war_satchel_accounts"
      WHERE "id" = NEW."account_id" FOR SHARE;
    SELECT "user_id","amount_uwolo","rail","status"
      INTO claim_owner,claim_amount,claim_rail,claim_state
      FROM "wolo_transfer_claims"
      WHERE "id" = NEW."transfer_claim_id" FOR SHARE;
    expected_amount := CASE WHEN NEW."kind" = 'withdraw_confirmed'
      THEN -NEW."delta_withdrawal_uwolo"
      ELSE NEW."delta_available_uwolo" END;
    IF owner_id IS NULL OR claim_owner IS NULL OR claim_owner <> owner_id THEN
      RAISE EXCEPTION 'external transfer claim belongs to another owner'
        USING ERRCODE = '23514';
    END IF;
    IF claim_state <> 'allocated' OR claim_amount <> expected_amount
       OR expected_amount <= 0 THEN
      RAISE EXCEPTION 'external transfer claim not allocated for exact amount'
        USING ERRCODE = '23514';
    END IF;
    IF NEW."kind" = 'verified_deposit' AND claim_rail <> 'satchel' THEN
      RAISE EXCEPTION 'satchel deposit requires satchel transfer claim'
        USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."transfer_claim_id" IS NOT NULL THEN
    RAISE EXCEPTION 'internal movement cannot consume external transfer claim'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "war_satchel_journal_claim_guard"
 BEFORE INSERT ON "war_satchel_journal"
 FOR EACH ROW EXECUTE FUNCTION "guard_war_satchel_journal_claim"();
