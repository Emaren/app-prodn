ALTER TABLE "bet_stake_intents"
ADD COLUMN "proposition_hash" VARCHAR(64),
ADD COLUMN "broadcast_submitted_at" TIMESTAMP(6);

CREATE INDEX "ix_bet_stake_intents_market_proposition_status"
ON "bet_stake_intents"(
  "market_id",
  "proposition_hash",
  "status"
);

-- Existing accepted wagers may safely backfill the proposition
-- and broadcast time from their already-recorded market/slip.
UPDATE "bet_stake_intents" AS intent
SET
  "proposition_hash" = market."proposition_hash",
  "broadcast_submitted_at" = COALESCE(
    intent."broadcast_submitted_at",
    wager."stake_locked_at",
    intent."verified_at",
    intent."recorded_at"
  )
FROM "bet_markets" AS market
LEFT JOIN "bet_wagers" AS wager
  ON wager."stake_intent_id" = intent."id"
WHERE intent."market_id" = market."id"
  AND intent."status" = 'recorded';
