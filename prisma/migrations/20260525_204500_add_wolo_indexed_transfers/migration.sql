CREATE TABLE "wolo_indexed_transfers" (
    "id" SERIAL NOT NULL,
    "chain_id" VARCHAR(32) NOT NULL,
    "tx_hash" VARCHAR(128) NOT NULL,
    "height" BIGINT NOT NULL,
    "timestamp" TIMESTAMP(6) NOT NULL,
    "sender_address" VARCHAR(100) NOT NULL,
    "recipient_address" VARCHAR(100) NOT NULL,
    "amount_uwolo" BIGINT NOT NULL,
    "amount_wolo_display" DECIMAL(20,6) NOT NULL,
    "denom" VARCHAR(32) NOT NULL,
    "memo" TEXT,
    "raw_type" VARCHAR(100),
    "event_type" VARCHAR(80),
    "source" VARCHAR(80) NOT NULL DEFAULT 'wolo-mainnet-bank-send',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wolo_indexed_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_wolo_indexed_transfers_tx_hash" ON "wolo_indexed_transfers"("tx_hash");
CREATE INDEX "ix_wolo_indexed_transfers_chain_height" ON "wolo_indexed_transfers"("chain_id", "height");
CREATE INDEX "ix_wolo_indexed_transfers_sender" ON "wolo_indexed_transfers"("sender_address");
CREATE INDEX "ix_wolo_indexed_transfers_recipient" ON "wolo_indexed_transfers"("recipient_address");
CREATE INDEX "ix_wolo_indexed_transfers_timestamp" ON "wolo_indexed_transfers"("timestamp");
