CREATE TABLE "feature_requests" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL,
  "requester_user_id" INTEGER NOT NULL,
  "requester_uid_snapshot" VARCHAR(100) NOT NULL,
  "requester_display_name_snapshot" VARCHAR(120),
  "requester_address" VARCHAR(100) NOT NULL,
  "request_text" TEXT,
  "sponsor_amount_wolo" INTEGER NOT NULL DEFAULT 100,
  "sponsor_amount_uwolo" BIGINT,
  "sponsor_recipient_address" VARCHAR(100) NOT NULL,
  "sponsor_memo" VARCHAR(255) NOT NULL,
  "sponsor_tx_hash" VARCHAR(128),
  "payment_status" VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  "status" VARCHAR(24) NOT NULL DEFAULT 'awaiting_payment',
  "accepted_by_uid" VARCHAR(100),
  "completed_by_uid" VARCHAR(100),
  "admin_note" TEXT,
  "refund_status" VARCHAR(24) NOT NULL DEFAULT 'not_required',
  "refund_amount_wolo" INTEGER,
  "refund_tx_hash" VARCHAR(128),
  "development_value_wolo" INTEGER,
  "workshop_entry_id" INTEGER,
  "sponsored_at" TIMESTAMP(6),
  "submitted_at" TIMESTAMP(6),
  "accepted_at" TIMESTAMP(6),
  "started_at" TIMESTAMP(6),
  "completed_at" TIMESTAMP(6),
  "declined_at" TIMESTAMP(6),
  "refunded_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_feature_requests_sponsor_positive"
    CHECK ("sponsor_amount_wolo" > 0),
  CONSTRAINT "ck_feature_requests_development_value_nonnegative"
    CHECK ("development_value_wolo" IS NULL OR "development_value_wolo" >= 0),
  CONSTRAINT "ck_feature_requests_refund_nonnegative"
    CHECK ("refund_amount_wolo" IS NULL OR "refund_amount_wolo" >= 0)
);

CREATE UNIQUE INDEX "uq_feature_requests_public_id"
  ON "feature_requests"("public_id");

CREATE UNIQUE INDEX "uq_feature_requests_sponsor_memo"
  ON "feature_requests"("sponsor_memo");

CREATE UNIQUE INDEX "uq_feature_requests_sponsor_tx_hash"
  ON "feature_requests"("sponsor_tx_hash");

CREATE UNIQUE INDEX "uq_feature_requests_workshop_entry_id"
  ON "feature_requests"("workshop_entry_id");

CREATE INDEX "ix_feature_requests_requester_created"
  ON "feature_requests"("requester_user_id", "created_at");

CREATE INDEX "ix_feature_requests_status_created"
  ON "feature_requests"("status", "created_at");

CREATE INDEX "ix_feature_requests_payment_created"
  ON "feature_requests"("payment_status", "created_at");

CREATE INDEX "ix_feature_requests_sponsor_tx"
  ON "feature_requests"("sponsor_tx_hash");

CREATE INDEX "ix_feature_requests_refund_status"
  ON "feature_requests"("refund_status", "created_at");

ALTER TABLE "feature_requests"
  ADD CONSTRAINT "feature_requests_requester_user_id_fkey"
  FOREIGN KEY ("requester_user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

ALTER TABLE "feature_requests"
  ADD CONSTRAINT "feature_requests_workshop_entry_id_fkey"
  FOREIGN KEY ("workshop_entry_id")
  REFERENCES "workshop_entries"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;


CREATE TABLE "bounty_valuations" (
  "id" SERIAL NOT NULL,
  "opportunity_id" INTEGER NOT NULL,
  "reward_wolo" INTEGER NOT NULL,
  "effective_from" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_to" TIMESTAMP(6),
  "changed_by_user_id" INTEGER,
  "reason" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bounty_valuations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bounty_valuations_reward_nonnegative"
    CHECK ("reward_wolo" >= 0),
  CONSTRAINT "ck_bounty_valuations_effective_window"
    CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE UNIQUE INDEX "uq_bounty_valuations_one_current"
  ON "bounty_valuations"("opportunity_id")
  WHERE "effective_to" IS NULL;

CREATE INDEX "ix_bounty_valuations_opportunity_effective"
  ON "bounty_valuations"("opportunity_id", "effective_from");

CREATE INDEX "ix_bounty_valuations_changed_by"
  ON "bounty_valuations"("changed_by_user_id", "created_at");

ALTER TABLE "bounty_valuations"
  ADD CONSTRAINT "bounty_valuations_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id")
  REFERENCES "bounty_opportunities"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

ALTER TABLE "bounty_valuations"
  ADD CONSTRAINT "bounty_valuations_changed_by_user_id_fkey"
  FOREIGN KEY ("changed_by_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;


CREATE TABLE "bounty_claims" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "opportunity_id" INTEGER NOT NULL,
  "valuation_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "player_display_name_snapshot" VARCHAR(120) NOT NULL,
  "recipient_address_snapshot" VARCHAR(100),
  "reward_snapshot_wolo" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'qualified',
  "evidence" JSONB,
  "eligibility_locked_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(6),
  "completed_at" TIMESTAMP(6),
  "cancelled_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bounty_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bounty_claims_reward_nonnegative"
    CHECK ("reward_snapshot_wolo" >= 0)
);

CREATE UNIQUE INDEX "uq_bounty_claims_public_id"
  ON "bounty_claims"("public_id");

CREATE UNIQUE INDEX "uq_bounty_claims_idempotency"
  ON "bounty_claims"("idempotency_key");

CREATE INDEX "ix_bounty_claims_opportunity_status"
  ON "bounty_claims"("opportunity_id", "status", "created_at");

CREATE INDEX "ix_bounty_claims_user_created"
  ON "bounty_claims"("user_id", "created_at");

CREATE INDEX "ix_bounty_claims_valuation"
  ON "bounty_claims"("valuation_id");

ALTER TABLE "bounty_claims"
  ADD CONSTRAINT "bounty_claims_opportunity_id_fkey"
  FOREIGN KEY ("opportunity_id")
  REFERENCES "bounty_opportunities"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

ALTER TABLE "bounty_claims"
  ADD CONSTRAINT "bounty_claims_valuation_id_fkey"
  FOREIGN KEY ("valuation_id")
  REFERENCES "bounty_valuations"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;

ALTER TABLE "bounty_claims"
  ADD CONSTRAINT "bounty_claims_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;


CREATE TABLE "bounty_payouts" (
  "id" SERIAL NOT NULL,
  "claim_id" INTEGER NOT NULL,
  "request_id" VARCHAR(160) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "recipient_address" VARCHAR(100) NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'pending',
  "tx_hash" VARCHAR(128),
  "error_detail" VARCHAR(500),
  "paid_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bounty_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bounty_payouts_amount_positive"
    CHECK ("amount_wolo" > 0)
);

CREATE UNIQUE INDEX "uq_bounty_payouts_claim_id"
  ON "bounty_payouts"("claim_id");

CREATE UNIQUE INDEX "uq_bounty_payouts_request_id"
  ON "bounty_payouts"("request_id");

CREATE INDEX "ix_bounty_payouts_status_created"
  ON "bounty_payouts"("status", "created_at");

CREATE INDEX "ix_bounty_payouts_tx_hash"
  ON "bounty_payouts"("tx_hash");

ALTER TABLE "bounty_payouts"
  ADD CONSTRAINT "bounty_payouts_claim_id_fkey"
  FOREIGN KEY ("claim_id")
  REFERENCES "bounty_claims"("id")
  ON DELETE RESTRICT
  ON UPDATE NO ACTION;


-- A valuation is historical economic truth. It may be closed exactly once by
-- setting effective_to, but its reward, opportunity, origin, and audit fields
-- can never be rewritten or deleted.
CREATE OR REPLACE FUNCTION protect_bounty_valuation_history()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bounty valuations are historical records and cannot be deleted';
  END IF;

  IF
       OLD."opportunity_id" IS DISTINCT FROM NEW."opportunity_id"
    OR OLD."reward_wolo" IS DISTINCT FROM NEW."reward_wolo"
    OR OLD."effective_from" IS DISTINCT FROM NEW."effective_from"
    OR OLD."changed_by_user_id" IS DISTINCT FROM NEW."changed_by_user_id"
    OR OLD."reason" IS DISTINCT FROM NEW."reason"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  THEN
    RAISE EXCEPTION 'bounty valuation history is immutable';
  END IF;

  -- Once a valuation has been closed, its closing timestamp is immutable.
  IF OLD."effective_to" IS NOT NULL THEN
    IF OLD."effective_to" IS DISTINCT FROM NEW."effective_to" THEN
      RAISE EXCEPTION 'closed bounty valuation windows are immutable';
    END IF;

    RETURN NEW;
  END IF;

  -- An open valuation may remain open.
  IF NEW."effective_to" IS NULL THEN
    RETURN NEW;
  END IF;

  -- Or it may be closed exactly once at a valid later timestamp.
  IF NEW."effective_to" <= OLD."effective_from" THEN
    RAISE EXCEPTION 'bounty valuation effective_to must follow effective_from';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_bounty_valuation_history_immutable"
BEFORE UPDATE OR DELETE ON "bounty_valuations"
FOR EACH ROW
EXECUTE FUNCTION protect_bounty_valuation_history();


-- Freeze the economic identity and reward snapshot once a bounty claim exists.
-- Lifecycle fields such as status/approved/completed may advance, but the
-- promised reward and the identity of the claim never change.
CREATE OR REPLACE FUNCTION protect_bounty_claim_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bounty claims are historical records and cannot be deleted';
  END IF;

  IF
       OLD."public_id" IS DISTINCT FROM NEW."public_id"
    OR OLD."opportunity_id" IS DISTINCT FROM NEW."opportunity_id"
    OR OLD."valuation_id" IS DISTINCT FROM NEW."valuation_id"
    OR OLD."user_id" IS DISTINCT FROM NEW."user_id"
    OR OLD."player_display_name_snapshot" IS DISTINCT FROM NEW."player_display_name_snapshot"
    OR OLD."recipient_address_snapshot" IS DISTINCT FROM NEW."recipient_address_snapshot"
    OR OLD."reward_snapshot_wolo" IS DISTINCT FROM NEW."reward_snapshot_wolo"
    OR OLD."eligibility_locked_at" IS DISTINCT FROM NEW."eligibility_locked_at"
    OR OLD."idempotency_key" IS DISTINCT FROM NEW."idempotency_key"
    OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
  THEN
    RAISE EXCEPTION 'bounty claim economic snapshot is immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_bounty_claim_snapshot_immutable"
BEFORE UPDATE OR DELETE ON "bounty_claims"
FOR EACH ROW
EXECUTE FUNCTION protect_bounty_claim_snapshot();


-- A bounty payout must pay exactly the amount frozen into its claim.
-- The payout identity cannot later be rewritten, while operational fields
-- such as status, tx_hash, error_detail, and paid_at may advance.
CREATE OR REPLACE FUNCTION protect_bounty_payout_truth()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_reward INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'bounty payout records cannot be deleted';
  END IF;

  SELECT "reward_snapshot_wolo"
    INTO expected_reward
  FROM "bounty_claims"
  WHERE "id" = NEW."claim_id";

  IF expected_reward IS NULL THEN
    RAISE EXCEPTION 'bounty payout claim does not exist';
  END IF;

  IF NEW."amount_wolo" IS DISTINCT FROM expected_reward THEN
    RAISE EXCEPTION
      'bounty payout amount % does not match frozen claim reward %',
      NEW."amount_wolo",
      expected_reward;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF
         OLD."claim_id" IS DISTINCT FROM NEW."claim_id"
      OR OLD."request_id" IS DISTINCT FROM NEW."request_id"
      OR OLD."amount_wolo" IS DISTINCT FROM NEW."amount_wolo"
      OR OLD."recipient_address" IS DISTINCT FROM NEW."recipient_address"
      OR OLD."created_at" IS DISTINCT FROM NEW."created_at"
    THEN
      RAISE EXCEPTION 'bounty payout economic identity is immutable';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_bounty_payout_truth"
BEFORE INSERT OR UPDATE OR DELETE ON "bounty_payouts"
FOR EACH ROW
EXECUTE FUNCTION protect_bounty_payout_truth();


-- Seed one baseline valuation from each existing opportunity's current value.
-- The legacy reward_wolo column remains as the current-value compatibility cache.
INSERT INTO "bounty_valuations" (
  "opportunity_id",
  "reward_wolo",
  "effective_from",
  "reason",
  "created_at"
)
SELECT
  "id",
  "reward_wolo",
  "created_at",
  'Campaign IV baseline valuation imported from legacy current reward',
  CURRENT_TIMESTAMP
FROM "bounty_opportunities"
WHERE "reward_wolo" IS NOT NULL;
