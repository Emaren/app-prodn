ALTER TABLE "marketplace_shops"
  ADD COLUMN "approved_at" TIMESTAMP(6),
  ADD COLUMN "approved_by_user_id" INTEGER,
  ADD COLUMN "approval_message_id" INTEGER;

CREATE UNIQUE INDEX "uq_marketplace_shops_approval_message_id"
  ON "marketplace_shops"("approval_message_id");

CREATE INDEX "ix_marketplace_shops_status_approved"
  ON "marketplace_shops"("status", "approved_at");

-- Jim's paid proposal was materialized early so the V1 storefront could be
-- visually tested. Restore the release lifecycle:
-- paid proposal -> Kingdom approval -> proprietor activates storefront.
UPDATE "marketplace_shops"
SET
  "status" = 'pending_approval',
  "display_enabled" = FALSE,
  "approved_at" = NULL,
  "approved_by_user_id" = NULL,
  "approval_message_id" = NULL
WHERE
  "kind" = 'player'
  AND "source_proposal_event_id" IS NOT NULL
  AND "approved_at" IS NULL;
