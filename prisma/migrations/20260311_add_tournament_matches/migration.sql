CREATE TABLE "tournament_matches" (
    "id" SERIAL NOT NULL,
    "tournament_id" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "player_one_entry_id" INTEGER,
    "player_two_entry_id" INTEGER,
    "winner_entry_id" INTEGER,
    "scheduled_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_tournament_matches_round_position"
    ON "tournament_matches"("tournament_id", "round", "position");

CREATE INDEX "ix_tournament_matches_tournament_status"
    ON "tournament_matches"("tournament_id", "status");

CREATE INDEX "ix_tournament_matches_scheduled_at"
    ON "tournament_matches"("scheduled_at");

ALTER TABLE "tournament_matches"
    ADD CONSTRAINT "tournament_matches_tournament_id_fkey"
    FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tournament_matches"
    ADD CONSTRAINT "tournament_matches_player_one_entry_id_fkey"
    FOREIGN KEY ("player_one_entry_id") REFERENCES "tournament_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tournament_matches"
    ADD CONSTRAINT "tournament_matches_player_two_entry_id_fkey"
    FOREIGN KEY ("player_two_entry_id") REFERENCES "tournament_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tournament_matches"
    ADD CONSTRAINT "tournament_matches_winner_entry_id_fkey"
    FOREIGN KEY ("winner_entry_id") REFERENCES "tournament_entries"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
