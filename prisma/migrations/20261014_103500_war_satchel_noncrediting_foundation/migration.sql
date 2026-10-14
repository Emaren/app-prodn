-- WAR SATCHEL GATE C1 — NON-CREDITING FINANCIAL EVIDENCE STORAGE ONLY.
-- No accounts, spendable balances, betting, transfers, crediting, payout
-- executor, or automatic migration/deploy are introduced by this file.
-- Apply only through protected migration/release policy, never ad hoc on VPS.

CREATE TABLE "war_satchel_deposit_intents" (
  "id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "chain_id" VARCHAR(32) NOT NULL DEFAULT 'wolo-1',
  "sender_address" VARCHAR(100) NOT NULL,
  "vault_address" VARCHAR(100) NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "memo" VARCHAR(240) NOT NULL,
  "nonce" VARCHAR(64) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'prepared',
  "expires_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_satchel_deposit_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "war_satchel_intents_positive_amount" CHECK ("amount_uwolo" > 0),
  CONSTRAINT "war_satchel_intents_canonical_chain" CHECK ("chain_id" = 'wolo-1'),
  CONSTRAINT "war_satchel_intents_status_control" CHECK ("status" IN ('prepared', 'submitted', 'expired', 'cancelled', 'proof_observed')),
  CONSTRAINT "war_satchel_intents_time_window" CHECK (
    "expires_at" > "created_at"
    AND "expires_at" <= "created_at" + INTERVAL '30 minutes'
  )
);
CREATE UNIQUE INDEX "uq_war_satchel_intents_id_owner" ON "war_satchel_deposit_intents" ("id", "user_id");
CREATE UNIQUE INDEX "uq_war_satchel_intents_memo" ON "war_satchel_deposit_intents" ("memo");
CREATE UNIQUE INDEX "uq_war_satchel_intents_nonce" ON "war_satchel_deposit_intents" ("nonce");
CREATE INDEX "ix_war_satchel_intents_owner_created" ON "war_satchel_deposit_intents" ("user_id", "created_at");
CREATE INDEX "ix_war_satchel_intents_status_expiry" ON "war_satchel_deposit_intents" ("status", "expires_at");
ALTER TABLE "war_satchel_deposit_intents"
  ADD CONSTRAINT "war_satchel_deposit_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Economic deposit intent identity is immutable, while its status may later
-- advance through explicitly reviewed non-money stages. Do not permit a DB
-- operator or future app route to retarget sender/vault/amount/memo/owner
-- after a user was shown an exact Keplr transaction.
CREATE OR REPLACE FUNCTION war_satchel_intents_economic_identity_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $
BEGIN
  IF (
    NEW."id", NEW."user_id", NEW."chain_id", NEW."sender_address",
    NEW."vault_address", NEW."amount_uwolo", NEW."memo", NEW."nonce",
    NEW."expires_at", NEW."created_at"
  ) IS DISTINCT FROM (
    OLD."id", OLD."user_id", OLD."chain_id", OLD."sender_address",
    OLD."vault_address", OLD."amount_uwolo", OLD."memo", OLD."nonce",
    OLD."expires_at", OLD."created_at"
  ) THEN
    RAISE EXCEPTION 'War Satchel economic intent identity is immutable';
  END IF;
  RETURN NEW;
END;
$;
CREATE TRIGGER war_satchel_intents_economic_lock
BEFORE UPDATE ON "war_satchel_deposit_intents"
FOR EACH ROW EXECUTE FUNCTION war_satchel_intents_economic_identity_lock();

CREATE TABLE "war_satchel_proof_candidates" (
  "id" BIGSERIAL NOT NULL,
  "intent_id" UUID NOT NULL,
  "user_id" INTEGER NOT NULL,
  "chain_id" VARCHAR(32) NOT NULL,
  "tx_hash" VARCHAR(64) NOT NULL,
  "transfer_index" INTEGER NOT NULL,
  "sender_address" VARCHAR(100) NOT NULL,
  "vault_address" VARCHAR(100) NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "tx_height" BIGINT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'uncredited',
  "verified_at" TIMESTAMP(6) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "war_satchel_proof_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "war_satchel_proofs_canonical_chain" CHECK ("chain_id" = 'wolo-1'),
  CONSTRAINT "war_satchel_proofs_positive_amount" CHECK ("amount_uwolo" > 0),
  CONSTRAINT "war_satchel_proofs_positive_height" CHECK ("tx_height" > 0),
  CONSTRAINT "war_satchel_proofs_valid_ordinal" CHECK ("transfer_index" >= 0),
  CONSTRAINT "war_satchel_proofs_uncreditable" CHECK ("status" = 'uncredited'),
  CONSTRAINT "war_satchel_proofs_tx_hash_format" CHECK ("tx_hash" ~ '^[A-F0-9]{64}$')
);
CREATE UNIQUE INDEX "uq_war_satchel_proofs_intent" ON "war_satchel_proof_candidates" ("intent_id");
CREATE UNIQUE INDEX "uq_war_satchel_proofs_chain_tx_ordinal" ON "war_satchel_proof_candidates" ("chain_id", "tx_hash", "transfer_index");
CREATE INDEX "ix_war_satchel_proofs_owner_created" ON "war_satchel_proof_candidates" ("user_id", "created_at");
ALTER TABLE "war_satchel_proof_candidates"
  ADD CONSTRAINT "war_satchel_proof_candidates_intent_id_fkey"
  FOREIGN KEY ("intent_id", "user_id") REFERENCES "war_satchel_deposit_intents" ("id", "user_id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "war_satchel_proof_candidates"
  ADD CONSTRAINT "war_satchel_proof_candidates_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- Additional server-side economic identity check at the SQL boundary.
-- A proof candidate for another wallet, vault, denom, or deposit amount can
-- never be attached to an intent, even if an application validation regresses.
CREATE OR REPLACE FUNCTION war_satchel_proof_candidates_identity_check()
RETURNS TRIGGER LANGUAGE plpgsql AS $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "war_satchel_deposit_intents" i
    WHERE i."id" = NEW."intent_id"
      AND i."user_id" = NEW."user_id"
      AND i."chain_id" = NEW."chain_id"
      AND i."sender_address" = NEW."sender_address"
      AND i."vault_address" = NEW."vault_address"
      AND i."amount_uwolo" = NEW."amount_uwolo"
  ) THEN
    RAISE EXCEPTION 'War Satchel receipt does not match immutable owner and amount intent';
  END IF;
  RETURN NEW;
END;
$;
CREATE TRIGGER war_satchel_proofs_exact_intent
BEFORE INSERT ON "war_satchel_proof_candidates"
FOR EACH ROW EXECUTE FUNCTION war_satchel_proof_candidates_identity_check();

-- Database-level append-only requirement for receipt proofs.
-- Prevents retroactive reassignment of consumed transaction identity or
-- forging a future spendable status through an ordinary app UPDATE/DELETE.
CREATE OR REPLACE FUNCTION war_satchel_proof_candidates_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'War Satchel proof candidates are immutable evidence, never funds';
END;
$$;
CREATE TRIGGER war_satchel_proofs_immutable
BEFORE UPDATE OR DELETE ON "war_satchel_proof_candidates"
FOR EACH ROW EXECUTE FUNCTION war_satchel_proof_candidates_immutable();
