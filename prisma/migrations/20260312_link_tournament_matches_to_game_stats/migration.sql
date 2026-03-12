ALTER TABLE "tournament_matches"
    ADD COLUMN IF NOT EXISTS "source_game_stats_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_tournament_matches_source_game_stats_id"
    ON "tournament_matches"("source_game_stats_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tournament_matches_source_game_stats_id_fkey'
    ) THEN
        ALTER TABLE "tournament_matches"
            ADD CONSTRAINT "tournament_matches_source_game_stats_id_fkey"
            FOREIGN KEY ("source_game_stats_id") REFERENCES "game_stats"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
