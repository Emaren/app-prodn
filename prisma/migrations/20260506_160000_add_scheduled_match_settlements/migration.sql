CREATE TABLE "scheduled_match_settlements" (
  "id" SERIAL NOT NULL,
  "scheduled_match_id" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'planned',
  "action" VARCHAR(48) NOT NULL,
  "recipient_address" VARCHAR(100) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "request_id" VARCHAR(128) NOT NULL,
  "source_wallet_address" VARCHAR(100),
  "tx_hash" VARCHAR(128),
  "error_detail" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executed_at" TIMESTAMP(6),

  CONSTRAINT "scheduled_match_settlements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "scheduled_match_settlements"
  ADD CONSTRAINT "scheduled_match_settlements_scheduled_match_id_fkey"
  FOREIGN KEY ("scheduled_match_id") REFERENCES "scheduled_matches"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "uq_sched_match_settlement_action_recipient_amount"
  ON "scheduled_match_settlements"("scheduled_match_id", "action", "recipient_address", "amount_wolo");

CREATE UNIQUE INDEX "uq_scheduled_match_settlements_request_id"
  ON "scheduled_match_settlements"("request_id");

CREATE INDEX "ix_scheduled_match_settlements_match_status"
  ON "scheduled_match_settlements"("scheduled_match_id", "status");

CREATE INDEX "ix_scheduled_match_settlements_status_updated_at"
  ON "scheduled_match_settlements"("status", "updated_at");

CREATE INDEX "ix_scheduled_match_settlements_tx_hash"
  ON "scheduled_match_settlements"("tx_hash");
