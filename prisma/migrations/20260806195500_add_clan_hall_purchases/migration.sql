CREATE TABLE "clan_hall_purchases" (
  "id" SERIAL NOT NULL,
  "public_id" UUID NOT NULL,
  "requester_user_id" INTEGER NOT NULL,
  "requester_uid_snapshot" VARCHAR(100) NOT NULL,
  "requester_display_name_snapshot" VARCHAR(160) NOT NULL,
  "clan_name" VARCHAR(120) NOT NULL,
  "desired_slug" VARCHAR(80) NOT NULL,
  "founding_message" TEXT NOT NULL,
  "requester_address" VARCHAR(120) NOT NULL,
  "amount_wolo" INTEGER NOT NULL DEFAULT 100,
  "amount_uwolo" NUMERIC(78,0) NOT NULL,
  "recipient_address" VARCHAR(120) NOT NULL,
  "memo" VARCHAR(240) NOT NULL,
  "tx_hash" VARCHAR(128),
  "payment_status" VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
  "status" VARCHAR(32) NOT NULL DEFAULT 'awaiting_payment',
  "sponsored_at" TIMESTAMP(6),
  "submitted_at" TIMESTAMP(6),
  "accepted_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "clan_hall_purchases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "clan_hall_purchases_public_id_key" UNIQUE ("public_id"),
  CONSTRAINT "clan_hall_purchases_tx_hash_key" UNIQUE ("tx_hash"),
  CONSTRAINT "clan_hall_purchases_requester_user_id_fkey"
    FOREIGN KEY ("requester_user_id") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX "ix_clan_hall_purchases_requester_status"
  ON "clan_hall_purchases"("requester_user_id", "status", "created_at" DESC);

CREATE INDEX "ix_clan_hall_purchases_payment_status"
  ON "clan_hall_purchases"("payment_status", "status", "created_at" DESC);

CREATE INDEX "ix_clan_hall_purchases_desired_slug"
  ON "clan_hall_purchases"("desired_slug");
