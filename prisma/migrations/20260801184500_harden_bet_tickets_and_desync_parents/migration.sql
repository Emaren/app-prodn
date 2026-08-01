-- Add an explicit proposition-parent edge without coupling markets to the
-- forthcoming canonical Battle identity. Desync rows point to their winner
-- proposition; other proposition families may use the same nullable edge.
ALTER TABLE "bet_markets"
  ADD COLUMN "parent_market_id" INTEGER;

ALTER TABLE "bet_markets"
  ADD CONSTRAINT "bet_markets_parent_market_id_fkey"
  FOREIGN KEY ("parent_market_id") REFERENCES "bet_markets"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "bet_markets"
  ADD CONSTRAINT "ck_bet_markets_parent_not_self"
  CHECK ("parent_market_id" IS NULL OR "parent_market_id" <> "id");

CREATE INDEX "ix_bet_markets_parent_market_id"
  ON "bet_markets"("parent_market_id");

-- Exact derived-slug links are authoritative and safe to backfill.
UPDATE "bet_markets" AS child
SET "parent_market_id" = parent."id"
FROM "bet_markets" AS parent
WHERE child."market_type" = 'desync'
  AND child."parent_market_id" IS NULL
  AND parent."market_type" = 'winner'
  AND child."slug" = 'desync-' || parent."slug";

-- A single scheduled winner market is the canonical parent when a session has
-- both a scheduled book and a detached watcher shadow.
WITH scheduled_candidates AS (
  SELECT
    child."id" AS child_id,
    min(parent."id") AS parent_id,
    count(*) AS candidate_count
  FROM "bet_markets" AS child
  JOIN "bet_markets" AS parent
    ON parent."market_type" = 'winner'
   AND parent."linked_session_key" = child."linked_session_key"
   AND parent."scheduled_match_id" IS NOT NULL
  WHERE child."market_type" = 'desync'
    AND child."parent_market_id" IS NULL
    AND child."linked_session_key" IS NOT NULL
  GROUP BY child."id"
)
UPDATE "bet_markets" AS child
SET "parent_market_id" = candidate.parent_id
FROM scheduled_candidates AS candidate
WHERE child."id" = candidate.child_id
  AND candidate.candidate_count = 1;

-- For remaining rows, link only an unambiguous single winner proposition.
WITH unique_candidates AS (
  SELECT
    child."id" AS child_id,
    min(parent."id") AS parent_id,
    count(*) AS candidate_count
  FROM "bet_markets" AS child
  JOIN "bet_markets" AS parent
    ON parent."market_type" = 'winner'
   AND parent."linked_session_key" = child."linked_session_key"
  WHERE child."market_type" = 'desync'
    AND child."parent_market_id" IS NULL
    AND child."linked_session_key" IS NOT NULL
  GROUP BY child."id"
)
UPDATE "bet_markets" AS child
SET "parent_market_id" = candidate.parent_id
FROM unique_candidates AS candidate
WHERE child."id" = candidate.child_id
  AND candidate.candidate_count = 1;

-- Repair the legacy orphan lifecycle caused by a no-stake winner book being
-- terminalized as settled without a winner. A side proposition cannot remain
-- wagerable after its explicit parent is terminal and unresolvable.
UPDATE "bet_markets" AS child
SET
  "status" = 'voided',
  "featured" = false,
  "close_at" = NULL,
  "settled_at" = coalesce(child."settled_at", CURRENT_TIMESTAMP),
  "voided_at" = coalesce(child."voided_at", CURRENT_TIMESTAMP),
  "winner_side" = NULL,
  "refund_status" = coalesce(child."refund_status", 'queued'),
  "commissioner_review_state" = NULL,
  "resolution_reason" = CASE
    WHEN parent."status" = 'voided' THEN 'desync_truth_unprovable'
    ELSE 'desync_parent_terminal_unresolved'
  END
FROM "bet_markets" AS parent
WHERE child."parent_market_id" = parent."id"
  AND child."market_type" = 'desync'
  AND child."status" IN ('open', 'closing', 'live', 'awaiting_final_proof', 'under_review')
  AND (
    parent."status" = 'voided'
    OR (parent."status" = 'settled' AND parent."winner_side" IS NULL)
  );

-- One verified transfer may fund multiple independently settled proposition
-- legs. The transaction hash intentionally belongs to the ticket, never to
-- each wager, preserving the legacy one-tx-per-wager uniqueness invariant.
CREATE TABLE "bet_stake_tickets" (
  "id" SERIAL NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "user_id" INTEGER NOT NULL,
  "client_request_id" VARCHAR(128) NOT NULL,
  "source" VARCHAR(24) NOT NULL DEFAULT 'manual',
  "total_amount_wolo" INTEGER NOT NULL,
  "proposition_set_hash" VARCHAR(64) NOT NULL,
  "wallet_address" VARCHAR(100) NOT NULL,
  "wallet_provider" VARCHAR(32),
  "wallet_type" VARCHAR(32),
  "browser_info" VARCHAR(255),
  "route_path" VARCHAR(160),
  "status" VARCHAR(32) NOT NULL DEFAULT 'awaiting_signature',
  "stake_tx_hash" VARCHAR(128),
  "broadcast_submitted_at" TIMESTAMP(6),
  "chain_timestamp" TIMESTAMP(6),
  "error_detail" VARCHAR(255),
  "verified_at" TIMESTAMP(6),
  "recorded_at" TIMESTAMP(6),
  "orphaned_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bet_stake_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bet_stake_tickets_version" CHECK ("version" = 1),
  CONSTRAINT "ck_bet_stake_tickets_total_positive" CHECK ("total_amount_wolo" > 0)
);

CREATE UNIQUE INDEX "uq_bet_stake_tickets_stake_tx_hash"
  ON "bet_stake_tickets"("stake_tx_hash");
CREATE UNIQUE INDEX "uq_bet_stake_tickets_user_request"
  ON "bet_stake_tickets"("user_id", "client_request_id");
CREATE INDEX "ix_bet_stake_tickets_user_status_updated_at"
  ON "bet_stake_tickets"("user_id", "status", "updated_at");
CREATE INDEX "ix_bet_stake_tickets_status_updated_at"
  ON "bet_stake_tickets"("status", "updated_at");

ALTER TABLE "bet_stake_tickets"
  ADD CONSTRAINT "bet_stake_tickets_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE TABLE "bet_stake_legs" (
  "id" SERIAL NOT NULL,
  "ticket_id" INTEGER NOT NULL,
  "market_id" INTEGER NOT NULL,
  "leg_role" VARCHAR(24) NOT NULL,
  "side" VARCHAR(20) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "proposition_hash" VARCHAR(64) NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "bet_stake_legs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_bet_stake_legs_side" CHECK ("side" IN ('left', 'right')),
  CONSTRAINT "ck_bet_stake_legs_role" CHECK ("leg_role" IN ('winner', 'desync')),
  CONSTRAINT "ck_bet_stake_legs_amount_positive" CHECK ("amount_wolo" > 0)
);

CREATE UNIQUE INDEX "uq_bet_stake_legs_ticket_market"
  ON "bet_stake_legs"("ticket_id", "market_id");
CREATE INDEX "ix_bet_stake_legs_market_created_at"
  ON "bet_stake_legs"("market_id", "created_at");

ALTER TABLE "bet_stake_legs"
  ADD CONSTRAINT "bet_stake_legs_ticket_id_fkey"
  FOREIGN KEY ("ticket_id") REFERENCES "bet_stake_tickets"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "bet_stake_legs"
  ADD CONSTRAINT "bet_stake_legs_market_id_fkey"
  FOREIGN KEY ("market_id") REFERENCES "bet_markets"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE "bet_wagers"
  ADD COLUMN "stake_leg_id" INTEGER;

CREATE UNIQUE INDEX "uq_bet_wagers_stake_leg_id"
  ON "bet_wagers"("stake_leg_id");

ALTER TABLE "bet_wagers"
  ADD CONSTRAINT "bet_wagers_stake_leg_id_fkey"
  FOREIGN KEY ("stake_leg_id") REFERENCES "bet_stake_legs"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

-- Retry safety for one-click admin funding. Different request ids intentionally
-- remain stackable on the same market and bonus type.
ALTER TABLE "bet_market_founder_bonuses"
  ADD COLUMN "request_id" VARCHAR(128);

CREATE UNIQUE INDEX "uq_bet_market_founder_bonuses_creator_request"
  ON "bet_market_founder_bonuses"("created_by_user_id", "request_id");
