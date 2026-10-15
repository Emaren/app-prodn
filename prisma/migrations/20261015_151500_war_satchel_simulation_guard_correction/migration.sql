-- Additive correction to the simulation-only C3a accounting guard.
-- Do not alter the historical 20261014 migration or authorize live funds.
-- Previous owner-isolation code overwrote the overdraft count with owner
-- count and then denied ALL otherwise valid single-owner journal postings.
-- This fixes the shadow-booking invariant without removing any safeguards.

CREATE OR REPLACE FUNCTION war_satchel_assert_balanced_sandbox_journal()
RETURNS TRIGGER LANGUAGE plpgsql AS $wolo_balance$
DECLARE
  source_id UUID;
  posting_count BIGINT;
  total NUMERIC;
  violating_accounts BIGINT;
  owner_count BIGINT;
BEGIN
  -- In READ COMMITTED, the statement after this lock takes a fresh snapshot.
  -- This prevents two concurrent reservations from EACH seeing the same
  -- available WOLO and both passing a pre-commit balance check.
  -- C3a remains simulation-only; a future funded ledger needs granular
  -- transactional account locks and independent real-vault reconciliation.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Simulation ledger postings require READ COMMITTED isolation for serialized balance checks';
  END IF;
  PERFORM pg_advisory_xact_lock(190201014);
  IF TG_TABLE_NAME = 'war_satchel_ledger_journals' THEN
    source_id := NEW."id";
  ELSE
    source_id := NEW."journal_id";
  END IF;

  SELECT count(*)::BIGINT, COALESCE(sum("delta_uwolo"::NUMERIC), 0)
  INTO posting_count, total
  FROM "war_satchel_ledger_postings"
  WHERE "journal_id" = source_id;

  IF posting_count < 2 OR total <> 0 THEN
    RAISE EXCEPTION 'War Satchel journal must have >= 2 postings and balance to zero';
  END IF;

  -- Any account exceeding its available credit breaks financial invariants.
  SELECT count(*) INTO violating_accounts FROM (
    SELECT a."id", a."account_kind",
           COALESCE(sum(p."delta_uwolo"::NUMERIC), 0) AS account_balance
    FROM "war_satchel_ledger_accounts" a
    JOIN "war_satchel_ledger_postings" p ON p."account_id" = a."id"
    GROUP BY a."id", a."account_kind"
  ) ledger
  WHERE (account_kind = 'vault_asset' AND account_balance < 0)
     OR (account_kind IN ('user_available_liability', 'user_reserved_liability')
         AND account_balance > 0);

  -- One journal may move value between a shared vault asset bucket and ONE
  -- player only, or between that same player's available/reserved buckets.
  -- Otherwise a syntactically balanced journal can silently shift a liability
  -- from one player's balance to another player's balance.
  IF violating_accounts > 0 THEN
    RAISE EXCEPTION 'War Satchel account overdraft / unfunded simulation movement';
  END IF;

  -- Keep liability owner count distinct from the overdraft count.
  -- The prior migration reused violating_accounts and therefore rejected
  -- every valid one-owner journal after setting the count to 1.
  SELECT count(DISTINCT a."owner_user_id") INTO owner_count
  FROM "war_satchel_ledger_postings" p
  JOIN "war_satchel_ledger_accounts" a ON a."id"=p."account_id"
  WHERE p."journal_id"=source_id AND a."owner_user_id" IS NOT NULL;
  IF owner_count <> 1 THEN
    RAISE EXCEPTION 'Satchel simulation journal references multiple or zero players';
  END IF;
  RETURN NULL;
END;
$wolo_balance$;

-- No new real-money source kinds or transfer paths are authorized by C3a.
