-- Non-binding spectator popularity ballots. This migration does not touch
-- replay results, belt custody, WOLO wallets or bet settlement.
CREATE TABLE "television_chaos_ballots" (
  "id" SERIAL NOT NULL,
  "game_stats_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "nominee_key" VARCHAR(128) NOT NULL,
  "roster_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "television_chaos_ballots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_television_chaos_ballot_user"
  ON "television_chaos_ballots"("game_stats_id", "user_id");

CREATE INDEX "ix_television_chaos_ballot_game_roster"
  ON "television_chaos_ballots"("game_stats_id", "roster_hash");

ALTER TABLE "television_chaos_ballots"
  ADD CONSTRAINT "television_chaos_ballots_game_stats_id_fkey"
  FOREIGN KEY ("game_stats_id") REFERENCES "game_stats"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "television_chaos_ballots"
  ADD CONSTRAINT "television_chaos_ballots_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;
