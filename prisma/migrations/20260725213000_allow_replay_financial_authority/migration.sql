-- Manual replay verdicts remain statistics-only by default.
-- A separate admin workflow may append a superseding accepted row that carries
-- explicit betting authority after replay, roster, proposition, wager, and
-- desync checks pass against an operator-confirmed plan fingerprint.
BEGIN;

ALTER TABLE "replay_result_adjudications"
  DROP CONSTRAINT "ck_replay_result_adjudications_bets_immutable";

ALTER TABLE "replay_result_adjudications"
  ADD CONSTRAINT "ck_replay_result_adjudications_bets_authority"
  CHECK (
    "affects_bets" = FALSE OR
    (
      "affects_bets" = TRUE AND
      "decision_status" = 'accepted' AND
      "actor_role" = 'site_admin' AND
      "supersedes_id" IS NOT NULL AND
      "has_linked_market" = TRUE AND
      "financial_disposition" = 'operator_review_required' AND
      "idempotency_key" LIKE 'financial-authority:%'
    )
  );

COMMENT ON COLUMN "replay_result_adjudications"."affects_bets" IS
  'False for ordinary verdicts. True only on an append-only, site-admin financial-authority row that supersedes a reviewed verdict and is bound to a confirmed dry-run fingerprint.';

COMMIT;
