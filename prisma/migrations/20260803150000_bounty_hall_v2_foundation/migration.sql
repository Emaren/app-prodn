BEGIN;

ALTER TABLE "bounty_opportunities"
  ADD COLUMN "bounty_kind" VARCHAR(32) NOT NULL DEFAULT 'open_contract',
  ADD COLUMN "assigned_user_id" INTEGER,
  ADD COLUMN "is_next_for_warrior" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "published_at" TIMESTAMP(6),
  ADD COLUMN "expires_at" TIMESTAMP(6);

ALTER TABLE "bounty_opportunities"
  ADD CONSTRAINT "bounty_opportunities_assigned_user_id_fkey"
  FOREIGN KEY ("assigned_user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

ALTER TABLE "bounty_opportunities"
  ADD CONSTRAINT "ck_bounty_opportunities_kind"
  CHECK (
    "bounty_kind" IN (
      'open_contract',
      'personal',
      'kingdom_commission',
      'championship_feat',
      'legacy_winner'
    )
  );

ALTER TABLE "bounty_opportunities"
  ADD CONSTRAINT "ck_bounty_opportunities_next_requires_warrior"
  CHECK (
    "is_next_for_warrior" = FALSE
    OR "assigned_user_id" IS NOT NULL
  );

ALTER TABLE "bounty_opportunities"
  ADD CONSTRAINT "ck_bounty_opportunities_next_requires_personal_kind"
  CHECK (
    "is_next_for_warrior" = FALSE
    OR "bounty_kind" = 'personal'
  );

ALTER TABLE "bounty_opportunities"
  ADD CONSTRAINT "ck_bounty_opportunities_next_requires_active_status"
  CHECK (
    "is_next_for_warrior" = FALSE
    OR "status" IN ('available', 'in_progress')
  );

ALTER TABLE "bounty_opportunities"
  ADD CONSTRAINT "ck_bounty_opportunities_expiration_window"
  CHECK (
    "expires_at" IS NULL
    OR "published_at" IS NULL
    OR "expires_at" > "published_at"
  );

ALTER TABLE "bounty_payouts"
  ADD CONSTRAINT "ck_bounty_payouts_paid_requires_proof"
  CHECK (
    "status" <> 'paid'
    OR (
      "paid_at" IS NOT NULL
      AND "tx_hash" IS NOT NULL
      AND BTRIM("tx_hash") <> ''
    )
  );

CREATE UNIQUE INDEX "uq_bounty_opportunities_one_next_per_warrior"
  ON "bounty_opportunities"("assigned_user_id")
  WHERE
    "assigned_user_id" IS NOT NULL
    AND "is_next_for_warrior" = TRUE;

CREATE INDEX "ix_bounty_opportunities_assigned_user_status"
  ON "bounty_opportunities"("assigned_user_id", "status");

CREATE INDEX "ix_bounty_opportunities_kind_status_priority"
  ON "bounty_opportunities"("bounty_kind", "status", "priority");

COMMIT;
