ALTER TABLE "wolo_indexed_transfers"
  ADD COLUMN "transfer_index" INTEGER NOT NULL DEFAULT 0;

DROP INDEX IF EXISTS "uq_wolo_indexed_transfers_tx_hash";

CREATE UNIQUE INDEX "uq_wolo_indexed_transfers_tx_hash_transfer_index"
  ON "wolo_indexed_transfers"("tx_hash", "transfer_index");

CREATE INDEX "ix_wolo_indexed_transfers_tx_hash"
  ON "wolo_indexed_transfers"("tx_hash");
