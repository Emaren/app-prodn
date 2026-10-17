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

-- Receipt + audit journals are write-once, not correction-in-place.
-- A wrong entry requires a new separately reviewed compensating source key.
CREATE FUNCTION war_satchel_funded_audit_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $satchel_immutable$
BEGIN
  RAISE EXCEPTION 'funded War Satchel financial receipts and journals are immutable';
END;
$satchel_immutable$;
CREATE TRIGGER satchel_funded_receipt_immutable
  BEFORE UPDATE OR DELETE ON "war_satchel_funded_receipts"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_audit_immutable();
CREATE TRIGGER satchel_funded_journal_immutable
  BEFORE UPDATE OR DELETE ON "war_satchel_funded_journal"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_audit_immutable();

-- Prevent retroactive reassignment of a reserved wager to another owner,
-- game, amount or ticket identity, including across worker restarts.
CREATE FUNCTION war_satchel_funded_reservation_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $satchel_reservation$
BEGIN
  IF (NEW.id, NEW.owner_user_id, NEW.execution_id, NEW.amount_uwolo,
      NEW.ticket_request_id, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.owner_user_id, OLD.execution_id, OLD.amount_uwolo,
      OLD.ticket_request_id, OLD.created_at) THEN
    RAISE EXCEPTION 'funded War Satchel reservation economic identity immutable';
  END IF;
  IF (OLD.status='reserved' AND NEW.status NOT IN ('reserved','unknown_hold','released'))
     OR (OLD.status='unknown_hold' AND NEW.status NOT IN ('unknown_hold','committed'))
     OR (OLD.status IN ('committed','released') AND NEW.status <> OLD.status) THEN
    RAISE EXCEPTION 'illegal funded War Satchel reservation state transition';
  END IF;
  IF NEW.status <> 'committed' AND (NEW.ticket_id IS NOT NULL OR NEW.tx_hash IS NOT NULL) THEN
    RAISE EXCEPTION 'uncommitted funded reservation cannot claim a settled ticket';
  END IF;
  IF OLD.status='committed' AND
     (NEW.ticket_id, NEW.tx_hash) IS DISTINCT FROM (OLD.ticket_id, OLD.tx_hash) THEN
    RAISE EXCEPTION 'settled funded ticket identity immutable';
  END IF;
  RETURN NEW;
END;
$satchel_reservation$;
CREATE TRIGGER satchel_funded_reservation_guard
  BEFORE UPDATE ON "war_satchel_funded_reservations"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_reservation_transition();

-- Explicit wallet-signed owner/preset-version spending mandate. A saved UI
-- toggle is not permission to debit user WOLO. This is NOT a withdrawal
-- mandate and never grants access to the player's Keplr private key.
CREATE TABLE "war_satchel_auto_spend_consents" (
  "id" UUID NOT NULL PRIMARY KEY,
  "owner_user_id" INTEGER NOT NULL,
  "preset_id" INTEGER NOT NULL,
  "preset_version" INTEGER NOT NULL,
  "owner_uid" VARCHAR(100) NOT NULL,
  "wallet_address" VARCHAR(100) NOT NULL,
  "nonce" VARCHAR(64) NOT NULL,
  "winner_stake_wolo" INTEGER NOT NULL,
  "desync_side" VARCHAR(8) NOT NULL,
  "desync_stake_wolo" INTEGER NOT NULL,
  "per_game_cap_wolo" INTEGER NOT NULL,
  "daily_cap_wolo" INTEGER NOT NULL,
  "issued_at" TIMESTAMP(6) NOT NULL,
  "challenge_expires_at" TIMESTAMP(6) NOT NULL,
  "spend_expires_at" TIMESTAMP(6) NOT NULL,
  "signed_at" TIMESTAMP(6),
  "revoked_at" TIMESTAMP(6),
  CONSTRAINT "fk_satchel_consent_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "fk_satchel_consent_preset"
    FOREIGN KEY ("preset_id") REFERENCES "bet_auto_presets"("id") ON DELETE RESTRICT,
  CONSTRAINT "uq_satchel_consent_nonce" UNIQUE ("nonce"),
  CONSTRAINT "ck_satchel_consent_positive_limits" CHECK (
    "preset_version" > 0 AND "winner_stake_wolo" > 0
    AND "winner_stake_wolo" <= 1000
    AND "desync_side" IN ('none','no','yes')
    AND "desync_stake_wolo" >= 0 AND "desync_stake_wolo" <= 1000
    AND (("desync_side"='none' AND "desync_stake_wolo"=0)
      OR ("desync_side"<>'none' AND "desync_stake_wolo">0))
    AND "winner_stake_wolo"+"desync_stake_wolo" <= 1000
    AND "per_game_cap_wolo" > 0 AND "per_game_cap_wolo" <= 1000
    AND "per_game_cap_wolo" >= "winner_stake_wolo"+"desync_stake_wolo"
    AND "daily_cap_wolo">= "per_game_cap_wolo"
    AND "daily_cap_wolo" <= 10000
  ),
  CONSTRAINT "ck_satchel_consent_time_windows" CHECK (
    "issued_at" < "challenge_expires_at"
    AND "challenge_expires_at" <= "issued_at" + INTERVAL '5 minutes'
    AND "spend_expires_at" > "challenge_expires_at"
    AND "spend_expires_at" <= "issued_at" + INTERVAL '24 hours'
    AND ("signed_at" IS NULL OR ("signed_at" >= "issued_at" AND "signed_at" < "challenge_expires_at"))
    AND ("revoked_at" IS NULL OR ("signed_at" IS NOT NULL AND "revoked_at" >= "signed_at"))
  )
);
CREATE INDEX "ix_satchel_auto_consent_owner_plan"
  ON "war_satchel_auto_spend_consents" ("owner_user_id","preset_id","preset_version","signed_at");

-- A signed mandate must never be repointed to a larger budget or someone
-- else's Steam identity; only a first signature and later revocation mutate.
CREATE FUNCTION war_satchel_signed_consent_economic_lock()
RETURNS TRIGGER LANGUAGE plpgsql AS $satchel_consent_lock$
BEGIN
  IF (NEW.id, NEW.owner_user_id, NEW.preset_id, NEW.preset_version,
      NEW.owner_uid, NEW.wallet_address, NEW.nonce, NEW.winner_stake_wolo,
      NEW.desync_side, NEW.desync_stake_wolo, NEW.per_game_cap_wolo,
      NEW.daily_cap_wolo, NEW.issued_at, NEW.challenge_expires_at,
      NEW.spend_expires_at)
     IS DISTINCT FROM
     (OLD.id, OLD.owner_user_id, OLD.preset_id, OLD.preset_version,
      OLD.owner_uid, OLD.wallet_address, OLD.nonce, OLD.winner_stake_wolo,
      OLD.desync_side, OLD.desync_stake_wolo, OLD.per_game_cap_wolo,
      OLD.daily_cap_wolo, OLD.issued_at, OLD.challenge_expires_at,
      OLD.spend_expires_at) THEN
    RAISE EXCEPTION 'signed Satchel spending mandate economic identity immutable';
  END IF;
  IF (OLD.signed_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
     OR (OLD.revoked_at IS NOT NULL AND NEW.signed_at IS DISTINCT FROM OLD.signed_at) THEN
    RAISE EXCEPTION 'signed Satchel mandate cannot be unsent or reactivated';
  END IF;
  RETURN NEW;
END;
$satchel_consent_lock$;
CREATE TRIGGER satchel_signed_consent_economic_lock
  BEFORE UPDATE ON "war_satchel_auto_spend_consents"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_signed_consent_economic_lock();

-- Owner-directed, independently verified withdrawal liability state.
-- The vault key is NOT stored here; a separately attested signer is required.
CREATE TABLE "war_satchel_funded_withdrawals" (
  "id" UUID NOT NULL PRIMARY KEY,
  "owner_user_id" INTEGER NOT NULL,
  "owner_wallet_address" VARCHAR(100) NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'reserved',
  "tx_hash" VARCHAR(64),
  "confirmed_height" BIGINT,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fk_satchel_withdrawal_owner" FOREIGN KEY ("owner_user_id")
    REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "uq_satchel_withdrawal_hash" UNIQUE ("tx_hash"),
  CONSTRAINT "ck_satchel_withdrawal_amount_positive" CHECK ("amount_uwolo" > 0),
  CONSTRAINT "ck_satchel_withdrawal_status" CHECK
    ("status" IN ('reserved','unknown_hold','sent','cancelled')),
  CONSTRAINT "ck_satchel_withdrawal_canonical_finality" CHECK (
    ("status"='sent' AND "tx_hash" ~ '^[0-9A-F]{64}$'
      AND "confirmed_height" > 0)
    OR ("status"<>'sent' AND "tx_hash" IS NULL AND "confirmed_height" IS NULL)
  )
);
CREATE INDEX "ix_satchel_withdrawal_owner_status"
  ON "war_satchel_funded_withdrawals" ("owner_user_id","status","created_at");

-- Neither administrators nor job retries can change the payee or amount
-- after reservation. In particular, broadcast uncertainty blocks cancellation.
CREATE FUNCTION war_satchel_funded_withdrawal_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $satchel_withdrawal$
BEGIN
  IF (NEW.id, NEW.owner_user_id, NEW.owner_wallet_address,
      NEW.amount_uwolo, NEW.created_at, NEW.authorizing_challenge_id)
     IS DISTINCT FROM
     (OLD.id, OLD.owner_user_id, OLD.owner_wallet_address,
      OLD.amount_uwolo, OLD.created_at, OLD.authorizing_challenge_id) THEN
    RAISE EXCEPTION 'funded Satchel withdrawal economic identity immutable';
  END IF;
  IF (OLD.status='reserved' AND NEW.status NOT IN ('reserved','unknown_hold','cancelled'))
     OR (OLD.status='unknown_hold' AND NEW.status NOT IN ('unknown_hold','sent'))
     OR (OLD.status IN ('sent','cancelled') AND NEW.status<>OLD.status) THEN
    RAISE EXCEPTION 'illegal funded Satchel withdrawal transition';
  END IF;
  IF OLD.status='sent' AND (NEW.tx_hash,NEW.confirmed_height) IS DISTINCT
     FROM (OLD.tx_hash,OLD.confirmed_height) THEN
    RAISE EXCEPTION 'finalized Satchel withdrawal proof immutable';
  END IF;
  RETURN NEW;
END;
$satchel_withdrawal$;
CREATE TRIGGER satchel_funded_withdrawal_guard
  BEFORE UPDATE ON "war_satchel_funded_withdrawals"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_withdrawal_transition();

-- A one-use server-stored ADR-36 Keplr withdrawal intent must authorize each
-- distinct physical bank-send. No prepared/consumed signature is transferable
-- to a different Steam owner, wallet, amount, or recipient.
CREATE TABLE "war_satchel_funded_withdrawal_challenges" (
  "id" UUID NOT NULL PRIMARY KEY,
  "owner_user_id" INTEGER NOT NULL,
  "owner_uid" VARCHAR(100) NOT NULL,
  "wallet_address" VARCHAR(100) NOT NULL,
  "amount_uwolo" BIGINT NOT NULL,
  "issued_at" TIMESTAMP(6) NOT NULL,
  "expires_at" TIMESTAMP(6) NOT NULL,
  "consumed_at" TIMESTAMP(6),
  CONSTRAINT "fk_satchel_withdraw_challenge_owner"
    FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "ck_satchel_withdraw_challenge_valid"
    CHECK ("amount_uwolo">0 AND "expires_at">"issued_at"
      AND "expires_at"<="issued_at"+INTERVAL '5 minutes'
      AND ("consumed_at" IS NULL OR
        ("consumed_at">="issued_at" AND "consumed_at"<"expires_at")))
);
CREATE INDEX "ix_satchel_withdraw_challenge_owner"
  ON "war_satchel_funded_withdrawal_challenges" ("owner_user_id","issued_at");
ALTER TABLE "war_satchel_funded_withdrawals"
  ADD COLUMN "authorizing_challenge_id" UUID NOT NULL,
  ADD CONSTRAINT "uq_satchel_withdrawal_challenge" UNIQUE ("authorizing_challenge_id"),
  ADD CONSTRAINT "fk_satchel_withdrawal_challenge"
    FOREIGN KEY ("authorizing_challenge_id")
    REFERENCES "war_satchel_funded_withdrawal_challenges"("id") ON DELETE RESTRICT;

CREATE FUNCTION war_satchel_funded_withdraw_challenge_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $satchel_wcha$
BEGIN
  IF (NEW.id,NEW.owner_user_id,NEW.owner_uid,NEW.wallet_address,
      NEW.amount_uwolo,NEW.issued_at,NEW.expires_at) IS DISTINCT FROM
     (OLD.id,OLD.owner_user_id,OLD.owner_uid,OLD.wallet_address,
      OLD.amount_uwolo,OLD.issued_at,OLD.expires_at) THEN
    RAISE EXCEPTION 'Satchel withdrawal Keplr challenge identity immutable';
  END IF;
  IF OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at THEN
    RAISE EXCEPTION 'Satchel withdrawal challenge is one-use';
  END IF;
  RETURN NEW;
END;
$satchel_wcha$;
CREATE TRIGGER satchel_funded_withdraw_challenge_guard
  BEFORE UPDATE ON "war_satchel_funded_withdrawal_challenges"
  FOR EACH ROW EXECUTE FUNCTION war_satchel_funded_withdraw_challenge_immutable();
