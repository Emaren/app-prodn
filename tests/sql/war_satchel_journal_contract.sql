-- Runs only in GitHub Actions ephemeral PostgreSQL 16.
-- C1 synthetic proof rows & users 101/102 already created by the prior contract.
-- No live WOLO, no site wallet, and no real financial account involved.

CREATE FUNCTION expect_wolo_ledger_rejection(stmt TEXT, reason TEXT, check_balance BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql AS $reject_ledger$
DECLARE rejected BOOLEAN := false;
BEGIN
  BEGIN
    EXECUTE stmt;
    IF check_balance THEN
      SET CONSTRAINTS war_satchel_ledger_balanced_on_commit IMMEDIATE;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    rejected := true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'Unsafe Wolo ledger operation accepted: %',reason;
  END IF;
END;
$reject_ledger$;

INSERT INTO war_satchel_ledger_accounts ("user_id","bucket") VALUES
  (NULL,'vault_asset'), (101,'available'), (101,'reserved'), (101,'committed'),
  (101,'withdrawing'), (102,'available');

SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_accounts ("user_id","bucket") VALUES (NULL,'vault_asset')$q$,
 'second global vault asset'
);
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_accounts ("user_id","bucket") VALUES (102,'reserved_no_such_bucket')$q$,
 'unknown financial bucket'
);
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_accounts ("user_id","bucket") VALUES (NULL,'available')$q$,
 'ownerless spendable liability'
);

BEGIN;
INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind","proof_candidate_id")
VALUES (
 '33333333-3333-4333-8333-333333333333',101,'deposit:synthetic:receipt101',
 'deposit',(SELECT id FROM war_satchel_proof_candidates WHERE user_id=101)
);
INSERT INTO war_satchel_ledger_postings ("journal_id","user_id","account_id","delta_uwolo")
SELECT '33333333-3333-4333-8333-333333333333',101,id,1000000 FROM war_satchel_ledger_accounts WHERE bucket='vault_asset';
INSERT INTO war_satchel_ledger_postings ("journal_id","user_id","account_id","delta_uwolo")
SELECT '33333333-3333-4333-8333-333333333333',101,id,-1000000 FROM war_satchel_ledger_accounts WHERE user_id=101 AND bucket='available';
COMMIT;

BEGIN;
INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind")
VALUES ('44444444-4444-4444-8444-444444444444',101,'reserve:synthetic:game101','reserve');
INSERT INTO war_satchel_ledger_postings ("journal_id","user_id","account_id","delta_uwolo")
SELECT '44444444-4444-4444-8444-444444444444',101,id,500000
FROM war_satchel_ledger_accounts WHERE user_id=101 AND bucket='available';
INSERT INTO war_satchel_ledger_postings ("journal_id","user_id","account_id","delta_uwolo")
SELECT '44444444-4444-4444-8444-444444444444',101,id,-500000
FROM war_satchel_ledger_accounts WHERE user_id=101 AND bucket='reserved';
COMMIT;

DO $assert$
DECLARE total BIGINT;
BEGIN
 SELECT COALESCE(sum(delta_uwolo),0) INTO total FROM war_satchel_ledger_postings;
 IF total<>0 OR (SELECT count(*) FROM war_satchel_ledger_journals)<>2 THEN
  RAISE EXCEPTION 'Valid two-journal deposit/reserve not conserved';
 END IF;
END;
$assert$;

SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind","proof_candidate_id")
 VALUES ('55555555-5555-4555-8555-555555555555',102,
 'deposit:wrong-owner','deposit',
 (SELECT id FROM war_satchel_proof_candidates WHERE user_id=101))$q$,
 'cross-user deposit proof'
);
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind")
 VALUES ('55555555-5555-4555-8555-555555555555',101,
 'deposit:without-proof','deposit')$q$,
 'deposit without proved receipt'
);
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind","proof_candidate_id")
 VALUES ('55555555-5555-4555-8555-555555555555',101,
 'deposit:duplicate-receipt','deposit',
 (SELECT id FROM war_satchel_proof_candidates WHERE user_id=101))$q$,
 'duplicate use of a chain deposit receipt'
);
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind")
 VALUES ('55555555-5555-4555-8555-555555555555',101,
 'deposit:synthetic:receipt101','reserve')$q$,
 'duplicate journal source'
);
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_postings
 ("journal_id","user_id","account_id","delta_uwolo")
 SELECT '33333333-3333-4333-8333-333333333333',101,id,1
 FROM war_satchel_ledger_accounts WHERE user_id=101 AND bucket='reserved'$q$,
 'append postings to a past committed journal'
);
SELECT expect_wolo_ledger_rejection(
 $q$UPDATE war_satchel_ledger_postings SET delta_uwolo=0$q$,
 'rewrite posted asset or liability'
);
SELECT expect_wolo_ledger_rejection(
 $q$DELETE FROM war_satchel_ledger_journals$q$,
 'delete immutable financial history'
);
SELECT expect_wolo_ledger_rejection(
 $q$UPDATE war_satchel_ledger_accounts SET user_id=102
 WHERE user_id=101 AND bucket='available'$q$,
 'reassign liability account to another user'
);

-- DEFERRABLE commit check must reject zero-line and unbalanced headers.
SELECT expect_wolo_ledger_rejection(
 $q$INSERT INTO war_satchel_ledger_journals
 ("id","user_id","source_key","event_kind")
 VALUES ('66666666-6666-4666-8666-666666666666',101,
 'unbalanced:zero-lines','reserve')$q$,
 'zero-line journal at commit',true
);


-- A header with two NON-balancing lines must also fail at commit,
-- not just an empty header. All tentative rows roll back together.
CREATE FUNCTION insert_unbalanced_synthetic_journal()
RETURNS VOID LANGUAGE plpgsql AS $unbalanced$
BEGIN
  INSERT INTO war_satchel_ledger_journals
    ("id","user_id","source_key","event_kind")
  VALUES ('77777777-7777-4777-8777-777777777777',101,'unbalanced:two-lines','reserve');
  INSERT INTO war_satchel_ledger_postings
    ("journal_id","user_id","account_id","delta_uwolo")
  SELECT '77777777-7777-4777-8777-777777777777',101,id,100
  FROM war_satchel_ledger_accounts WHERE user_id=101 AND bucket='available';
  INSERT INTO war_satchel_ledger_postings
    ("journal_id","user_id","account_id","delta_uwolo")
  SELECT '77777777-7777-4777-8777-777777777777',101,id,-50
  FROM war_satchel_ledger_accounts WHERE user_id=101 AND bucket='reserved';
END;
$unbalanced$;
SELECT expect_wolo_ledger_rejection(
 $q$SELECT insert_unbalanced_synthetic_journal()$q$,
 'two-line zero-sum invariant at commit',true
);

CREATE FUNCTION insert_cross_owner_synthetic_journal()
RETURNS VOID LANGUAGE plpgsql AS $wrong_owner$
BEGIN
  INSERT INTO war_satchel_ledger_journals
    ("id","user_id","source_key","event_kind")
  VALUES ('88888888-8888-4888-8888-888888888888',101,'cross-owner:bad-posting','reserve');
  INSERT INTO war_satchel_ledger_postings
    ("journal_id","user_id","account_id","delta_uwolo")
  SELECT '88888888-8888-4888-8888-888888888888',101,id,100
  FROM war_satchel_ledger_accounts WHERE user_id=102 AND bucket='available';
END;
$wrong_owner$;
SELECT expect_wolo_ledger_rejection(
 $q$SELECT insert_cross_owner_synthetic_journal()$q$,
 'cross-user liability posting'
);

DO $assert$
DECLARE total BIGINT;
BEGIN
 SELECT COALESCE(sum(delta_uwolo),0) INTO total FROM war_satchel_ledger_postings;
 IF total<>0 OR (SELECT count(*) FROM war_satchel_ledger_journals)<>2 THEN
  RAISE EXCEPTION 'Failed journal left dirty persistent financial state';
 END IF;
END;
$assert$;
SELECT 'SATCHEL_APPEND_ONLY_JOURNAL_SQL_PASS' AS status;
