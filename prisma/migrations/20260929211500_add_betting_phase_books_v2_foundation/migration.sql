-- Betting Phase Books V2 foundation.
--
-- This migration is intentionally dormant:
-- - every existing market remains book_phase='legacy' through the column default
-- - no wager admission or settlement path reads the new fields yet
-- - all columns added to the pre-existing table remain physically nullable so the
--   protected automatic migration lane can prove this release is additive
-- - the Prisma application contract still treats book_phase as required/defaulted
-- - future activated phase books receive their own immutable identity/window

ALTER TABLE "bet_markets"
  ADD COLUMN "book_phase" VARCHAR(24) DEFAULT 'legacy',
  ADD COLUMN "phase_book_key" VARCHAR(255),
  ADD COLUMN "phase_opens_at" TIMESTAMP(6),
  ADD COLUMN "phase_closes_at" TIMESTAMP(6);

CREATE UNIQUE INDEX "uq_bet_markets_phase_book_key"
  ON "bet_markets"("phase_book_key");

CREATE INDEX "ix_bet_markets_phase_status"
  ON "bet_markets"("book_phase", "status");

CREATE INDEX "ix_bet_markets_phase_window"
  ON "bet_markets"("phase_opens_at", "phase_closes_at");
