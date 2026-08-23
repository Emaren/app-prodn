CREATE TABLE "scheduled_match_settlement_allocations" (
  "id" SERIAL NOT NULL,
  "scheduled_match_settlement_id" INTEGER NOT NULL,
  "source_side" VARCHAR(8) NOT NULL,
  "source_bucket" VARCHAR(16) NOT NULL,
  "amount_wolo" INTEGER NOT NULL,
  "allocation_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "scheduled_match_settlement_allocations_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "ck_sched_match_settlement_alloc_side"
    CHECK ("source_side" IN ('left', 'right')),

  CONSTRAINT "ck_sched_match_settlement_alloc_bucket"
    CHECK ("source_bucket" IN ('wager', 'guarantee')),

  CONSTRAINT "ck_sched_match_settlement_alloc_amount"
    CHECK ("amount_wolo" > 0),

  CONSTRAINT "ck_sched_match_settlement_alloc_version"
    CHECK ("allocation_version" > 0),

  CONSTRAINT "scheduled_match_settlement_allocations_settlement_fkey"
    FOREIGN KEY ("scheduled_match_settlement_id")
    REFERENCES "scheduled_match_settlements"("id")
    ON DELETE CASCADE
    ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX
  "uq_sched_match_settlement_alloc_source"
ON "scheduled_match_settlement_allocations"(
  "scheduled_match_settlement_id",
  "source_side",
  "source_bucket"
);

CREATE INDEX
  "ix_sched_match_settlement_alloc_source"
ON "scheduled_match_settlement_allocations"(
  "source_side",
  "source_bucket"
);


/*
 * Backfill the economic source identity of every historical
 * Challenge settlement.
 *
 * IMPORTANT:
 *
 * This migration does NOT repair or rewrite historical
 * financial events.
 *
 * Challenge #12 therefore receives allocations describing
 * every settlement row exactly as the application ledger
 * recorded it. V3 conservation will correctly retain that
 * history as an anomaly.
 *
 * Superseded rows are also allocated. Their status determines
 * whether they consume effective principal; their allocations
 * remain durable historical meaning.
 */
WITH settlement_terms AS (
  SELECT
    s."id" AS settlement_id,
    s."action",
    s."amount_wolo",

    m."wager_amount_wolo" AS wager_wolo,
    m."guarantee_amount_wolo" AS guarantee_wolo,

    EXISTS (
      SELECT 1
      FROM "scheduled_match_funding_proofs" p
      WHERE
        p."scheduled_match_id" = m."id"
        AND p."participant_side" = 'left'
    ) AS left_funded,

    EXISTS (
      SELECT 1
      FROM "scheduled_match_funding_proofs" p
      WHERE
        p."scheduled_match_id" = m."id"
        AND p."participant_side" = 'right'
    ) AS right_funded

  FROM "scheduled_match_settlements" s

  JOIN "scheduled_matches" m
    ON m."id" =
       s."scheduled_match_id"
),

allocations AS (
  /*
   * LEFT WAGER PRINCIPAL
   */
  SELECT
    settlement_id,
    'left'::VARCHAR(8) AS source_side,
    'wager'::VARCHAR(16) AS source_bucket,
    wager_wolo AS amount_wolo

  FROM settlement_terms

  WHERE
    left_funded
    AND wager_wolo > 0
    AND action IN (
      'creator_timeout_refund',
      'left_full_refund',
      'left_wager_guarantee_refund',
      'left_wager_refund',
      'left_winner_wager_award',
      'right_winner_wager_award'
    )

  UNION ALL

  /*
   * LEFT GUARANTEE PRINCIPAL
   */
  SELECT
    settlement_id,
    'left',
    'guarantee',
    guarantee_wolo

  FROM settlement_terms

  WHERE
    left_funded
    AND guarantee_wolo > 0
    AND action IN (
      'creator_timeout_refund',
      'left_full_refund',
      'left_wager_guarantee_refund',
      'left_guarantee_to_treasury',
      'left_guarantee_return',
      'left_own_guarantee_return',
      'left_guarantee_awarded_to_right',
      'guarantees_to_treasury'
    )

  UNION ALL

  /*
   * RIGHT WAGER PRINCIPAL
   */
  SELECT
    settlement_id,
    'right',
    'wager',
    wager_wolo

  FROM settlement_terms

  WHERE
    right_funded
    AND wager_wolo > 0
    AND action IN (
      'right_full_refund',
      'right_wager_guarantee_refund',
      'right_wager_refund',
      'left_winner_wager_award',
      'right_winner_wager_award'
    )

  UNION ALL

  /*
   * RIGHT GUARANTEE PRINCIPAL
   */
  SELECT
    settlement_id,
    'right',
    'guarantee',
    guarantee_wolo

  FROM settlement_terms

  WHERE
    right_funded
    AND guarantee_wolo > 0
    AND action IN (
      'right_full_refund',
      'right_wager_guarantee_refund',
      'right_guarantee_to_treasury',
      'right_guarantee_return',
      'right_own_guarantee_return',
      'right_guarantee_awarded_to_left',
      'guarantees_to_treasury'
    )
)

INSERT INTO "scheduled_match_settlement_allocations" (
  "scheduled_match_settlement_id",
  "source_side",
  "source_bucket",
  "amount_wolo",
  "allocation_version"
)

SELECT
  settlement_id,
  source_side,
  source_bucket,
  amount_wolo,
  1

FROM allocations;


/*
 * Every pre-existing settlement must have an exact persisted
 * source decomposition before this migration is allowed to
 * complete.
 *
 * Unknown settlement semantics therefore fail migration rather
 * than silently entering V3 without financial meaning.
 */
DO $$
DECLARE
  bad_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO bad_count

  FROM (
    SELECT
      s."id",
      s."amount_wolo",
      COALESCE(
        SUM(a."amount_wolo"),
        0
      ) AS allocated_wolo

    FROM "scheduled_match_settlements" s

    LEFT JOIN "scheduled_match_settlement_allocations" a
      ON a."scheduled_match_settlement_id" =
         s."id"

    GROUP BY
      s."id",
      s."amount_wolo"

    HAVING
      COALESCE(
        SUM(a."amount_wolo"),
        0
      ) <>
      s."amount_wolo"
  ) bad;

  IF bad_count > 0 THEN
    RAISE EXCEPTION
      'Challenge V3 allocation backfill failed: % settlement row(s) do not reconcile exactly',
      bad_count;
  END IF;
END
$$;


/*
 * Allocation meaning is append-only.
 *
 * We intentionally prohibit UPDATE.
 *
 * DELETE remains available only through the existing parent
 * lifecycle for now; broader financial-history retention is
 * handled separately when the Challenge domain persistence
 * constitution is upgraded.
 */
CREATE FUNCTION
  "aoe2war_reject_settlement_allocation_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION
    'scheduled_match_settlement_allocations are immutable';
END
$$;

CREATE TRIGGER
  "trg_sched_match_settlement_alloc_no_update"
BEFORE UPDATE
ON "scheduled_match_settlement_allocations"
FOR EACH ROW
EXECUTE FUNCTION
  "aoe2war_reject_settlement_allocation_update"();
