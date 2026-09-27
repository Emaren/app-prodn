CREATE TABLE "leagues" (
  "id" SERIAL NOT NULL,
  "public_id" VARCHAR(80) NOT NULL,
  "slug" VARCHAR(160) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "mode" VARCHAR(8) NOT NULL,
  "team_size" INTEGER NOT NULL,
  "status" VARCHAR(24) NOT NULL DEFAULT 'active',
  "created_by_user_id" INTEGER NOT NULL,
  "creator_display_name_snapshot" VARCHAR(120) NOT NULL,
  "sender_address_snapshot" VARCHAR(100) NOT NULL,
  "recipient_address_snapshot" VARCHAR(100) NOT NULL,
  "creation_price_wolo" INTEGER NOT NULL DEFAULT 100,
  "creation_memo" VARCHAR(255) NOT NULL,
  "creation_tx_hash" VARCHAR(128) NOT NULL,
  "creation_proof_url" VARCHAR(500),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "leagues_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_leagues_mode" CHECK ("mode" IN ('rm', 'dm')),
  CONSTRAINT "ck_leagues_team_size" CHECK ("team_size" BETWEEN 1 AND 4),
  CONSTRAINT "ck_leagues_creation_price" CHECK ("creation_price_wolo" = 100)
);

CREATE UNIQUE INDEX "uq_leagues_public_id" ON "leagues"("public_id");
CREATE UNIQUE INDEX "uq_leagues_slug" ON "leagues"("slug");
CREATE UNIQUE INDEX "uq_leagues_creation_memo" ON "leagues"("creation_memo");
CREATE UNIQUE INDEX "uq_leagues_creation_tx_hash" ON "leagues"("creation_tx_hash");
CREATE INDEX "ix_leagues_public_lane" ON "leagues"("status", "mode", "team_size", "created_at");
CREATE INDEX "ix_leagues_creator_created" ON "leagues"("created_by_user_id", "created_at");

ALTER TABLE "leagues"
  ADD CONSTRAINT "leagues_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
