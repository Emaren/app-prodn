-- Executed ONLY in disposable PostgreSQL CI, after C3a and concurrency tests.
-- Account 2 belongs to user 101; account 4 belongs to user 102.
-- A mixed-owner transfer could balance to zero and satisfy per-account
-- non-overdraft rules while reassigning a claim on funds between players.
DO $isolation$
DECLARE before_count INTEGER;
BEGIN
  SELECT count(*) INTO before_count FROM war_satchel_ledger_journals;
  BEGIN
    INSERT INTO war_satchel_ledger_journals (id,source_key)
    VALUES ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
            'simulation:forbidden-cross-owner-reallocation');
    INSERT INTO war_satchel_ledger_postings(journal_id,account_id,delta_uwolo)
    VALUES
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',2,100),
      ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',4,-100);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'BLOCKED: cross-user reallocation unexpectedly accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%references multiple or zero players%' THEN
      RAISE;
    END IF;
  END;
  IF (SELECT count(*) FROM war_satchel_ledger_journals) <> before_count THEN
    RAISE EXCEPTION 'Failed cross-owner journal left an incomplete header';
  END IF;
  IF EXISTS (
    SELECT 1 FROM war_satchel_ledger_postings
    WHERE journal_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ) THEN
    RAISE EXCEPTION 'Failed cross-owner journal left phantom postings';
  END IF;
END;
$isolation$;

-- The guard must preserve already-valid single-owner journals and remain
-- simulation-only; the earlier SQL and concurrency tests demonstrate those.
SELECT 'SATCHEL_SIMULATION_OWNER_ISOLATION_PASS' AS status;
