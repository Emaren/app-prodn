-- Public battle numbers are allocated once, by PostgreSQL, so concurrent
-- Watcher 1.5.7 sessions can never receive the same number. The production
-- archive contained 2,819 filed battles when this rail was introduced.
CREATE SEQUENCE "battle_public_number_seq"
  AS INTEGER
  START WITH 2820
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

CREATE TABLE "battle_identities" (
  "id" SERIAL NOT NULL,
  "identity_key" VARCHAR(255) NOT NULL,
  "public_number" INTEGER NOT NULL DEFAULT nextval('battle_public_number_seq'::regclass),
  "platform_match_id" VARCHAR(120),
  "state" VARCHAR(24) NOT NULL DEFAULT 'live',
  "started_at" TIMESTAMP(6),
  "completed_at" TIMESTAMP(6),
  "last_seen_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battle_identities_pkey" PRIMARY KEY ("id")
);

ALTER SEQUENCE "battle_public_number_seq"
  OWNED BY "battle_identities"."public_number";

CREATE UNIQUE INDEX "uq_battle_identities_identity_key"
  ON "battle_identities"("identity_key");

CREATE UNIQUE INDEX "uq_battle_identities_public_number"
  ON "battle_identities"("public_number");

CREATE UNIQUE INDEX "uq_battle_identities_platform_match_id"
  ON "battle_identities"("platform_match_id");

CREATE INDEX "ix_battle_identities_state_last_seen"
  ON "battle_identities"("state", "last_seen_at");

ALTER TABLE "bet_markets"
  ADD COLUMN "battle_id" INTEGER;

CREATE INDEX "ix_bet_markets_battle_id"
  ON "bet_markets"("battle_id");

ALTER TABLE "bet_markets"
  ADD CONSTRAINT "bet_markets_battle_id_fkey"
  FOREIGN KEY ("battle_id") REFERENCES "battle_identities"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
