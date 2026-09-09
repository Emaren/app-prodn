CREATE TABLE "staking_unstake_intents" (
  "id" SERIAL NOT NULL,
  "public_id" VARCHAR(64) NOT NULL,
  "user_id" INTEGER NOT NULL,
  "client_request_id" VARCHAR(128) NOT NULL,
  "wallet_address" VARCHAR(100) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'prepared',
  "memo" VARCHAR(180) NOT NULL,
  "tx_hash" VARCHAR(128),
  "staking_event_id" INTEGER,
  "reserve_snapshot" JSONB,
  "error_detail" VARCHAR(500),
  "version" INTEGER NOT NULL DEFAULT 0,
  "execution_started_at" TIMESTAMP(6),
  "broadcast_submitted_at" TIMESTAMP(6),
  "confirmed_at" TIMESTAMP(6),
  "resolved_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "staking_unstake_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_staking_unstake_intents_amount"
    CHECK ("amount_wolo" > 0),
  CONSTRAINT "ck_staking_unstake_intents_status"
    CHECK (
      "status" IN (
        'prepared',
        'executing',
        'broadcast_submitted',
        'needs_reconciliation',
        'confirmed',
        'failed',
        'canceled'
      )
      AND "version" >= 0
      AND (
        "status" <> 'confirmed'
        OR (
          "tx_hash" IS NOT NULL
          AND "staking_event_id" IS NOT NULL
          AND "confirmed_at" IS NOT NULL
          AND "resolved_at" IS NOT NULL
        )
      )
      AND (
        "status" NOT IN ('failed', 'canceled')
        OR "resolved_at" IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX "uq_staking_unstake_intents_public_id"
  ON "staking_unstake_intents"("public_id");

CREATE UNIQUE INDEX "uq_staking_unstake_intents_user_request"
  ON "staking_unstake_intents"("user_id", "client_request_id");

CREATE UNIQUE INDEX "uq_staking_unstake_intents_tx_hash"
  ON "staking_unstake_intents"("tx_hash");

CREATE UNIQUE INDEX "uq_staking_unstake_intents_event_id"
  ON "staking_unstake_intents"("staking_event_id");

CREATE UNIQUE INDEX "uq_staking_unstake_intents_one_open_user"
  ON "staking_unstake_intents"("user_id")
  WHERE "status" IN (
    'prepared',
    'executing',
    'broadcast_submitted',
    'needs_reconciliation'
  );

-- V1 deliberately serializes the entire staking withdrawal rail. This is more
-- conservative than a per-user fence: two different users cannot consume the
-- same observed reserve snapshot concurrently, and one ambiguous broadcast
-- blocks all later withdrawals until chain reconciliation resolves it.
CREATE UNIQUE INDEX "uq_staking_unstake_intents_one_open_global"
  ON "staking_unstake_intents"((1))
  WHERE "status" IN (
    'prepared',
    'executing',
    'broadcast_submitted',
    'needs_reconciliation'
  );

CREATE INDEX "ix_staking_unstake_intents_user_status_updated"
  ON "staking_unstake_intents"("user_id", "status", "updated_at");

CREATE INDEX "ix_staking_unstake_intents_status_updated"
  ON "staking_unstake_intents"("status", "updated_at");

ALTER TABLE "staking_unstake_intents"
  ADD CONSTRAINT "staking_unstake_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "staking_unstake_intents"
  ADD CONSTRAINT "staking_unstake_intents_staking_event_id_fkey"
  FOREIGN KEY ("staking_event_id") REFERENCES "staking_events"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
