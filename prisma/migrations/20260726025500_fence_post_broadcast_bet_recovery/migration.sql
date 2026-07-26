ALTER TABLE "bet_stake_intents"
ADD COLUMN "proposition_hash" VARCHAR(64),
ADD COLUMN "broadcast_submitted_at" TIMESTAMP(6);

CREATE INDEX "ix_bet_stake_intents_market_proposition_status"
ON "bet_stake_intents"(
  "market_id",
  "proposition_hash",
  "status"
);

-- Existing recorded intents may safely inherit the immutable
-- proposition from their already-recorded market.
UPDATE "bet_stake_intents" AS intent
SET
  "proposition_hash" =
    market."proposition_hash"
FROM "bet_markets" AS market
WHERE intent."market_id" = market."id"
  AND intent."status" = 'recorded';

-- Existing recorded intents with an attached wager may safely
-- inherit the already-recorded stake time. Intents without a
-- wager remain NULL and cannot enter automatic recovery.
UPDATE "bet_stake_intents" AS intent
SET
  "broadcast_submitted_at" = COALESCE(
    intent."broadcast_submitted_at",
    wager."stake_locked_at",
    intent."verified_at",
    intent."recorded_at"
  )
FROM "bet_wagers" AS wager
WHERE wager."stake_intent_id" = intent."id"
  AND intent."status" = 'recorded';
