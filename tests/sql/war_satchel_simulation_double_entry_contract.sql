-- Synthetic accounting rehearsal. No signer, vault key, on-chain funds or
-- production user deposits. Called after C1/C2 and C3a migration in CI.

CREATE FUNCTION expect_satchel_ledger_denial(statements TEXT[], label TEXT)
RETURNS VOID LANGUAGE plpgsql AS $expect_ledger$
DECLARE
  statement TEXT;
  failed BOOLEAN := FALSE;
BEGIN
  BEGIN
    FOREACH statement IN ARRAY statements LOOP
      EXECUTE statement;
    END LOOP;
    -- Deferred ledger invariants must also fail before this subtxn ends.
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN OTHERS THEN
    failed := TRUE;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  IF NOT failed THEN
    RAISE EXCEPTION 'Unsafe simulated ledger operation was accepted: %', label;
  END IF;
END;
$expect_ledger$;

INSERT INTO "users" ("id") VALUES (101), (102) ON CONFLICT DO NOTHING;

INSERT INTO war_satchel_ledger_accounts
  (id, account_key, owner_user_id, account_kind)
VALUES
  (1, 'simulation:vault-asset', NULL, 'vault_asset'),
  (2, 'simulation:player101:available', 101, 'user_available_liability'),
  (3, 'simulation:player101:reserved', 101, 'user_reserved_liability'),
  (4, 'simulation:player102:available', 102, 'user_available_liability');

INSERT INTO war_satchel_ledger_journals (id,source_key)
VALUES
  ('11111111-1111-4111-8111-111111111111','simulation:deposit-user101-1000');

INSERT INTO war_satchel_ledger_postings
  (journal_id,account_id,delta_uwolo)
VALUES
  ('11111111-1111-4111-8111-111111111111',1,1000),
  ('11111111-1111-4111-8111-111111111111',2,-1000);

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

INSERT INTO war_satchel_ledger_journals (id,source_key)
VALUES
  ('22222222-2222-4222-8222-222222222222','simulation:reserve-user101-600');

INSERT INTO war_satchel_ledger_postings
  (journal_id,account_id,delta_uwolo)
VALUES
  ('22222222-2222-4222-8222-222222222222',2,600),
  ('22222222-2222-4222-8222-222222222222',3,-600);

SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $verify$
DECLARE vault_balance NUMERIC; available NUMERIC; reserved NUMERIC;
BEGIN
 SELECT sum(delta_uwolo::NUMERIC) INTO vault_balance FROM war_satchel_ledger_postings WHERE account_id=1;
 SELECT sum(delta_uwolo::NUMERIC) INTO available FROM war_satchel_ledger_postings WHERE account_id=2;
 SELECT sum(delta_uwolo::NUMERIC) INTO reserved FROM war_satchel_ledger_postings WHERE account_id=3;
 IF vault_balance <> 1000 OR available <> -400 OR reserved <> -600 THEN
   RAISE EXCEPTION 'Unexpected synthetic vault or liability balances';
 END IF;
END;
$verify$;

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_journals (id,source_key)
     VALUES ('33333333-3333-4333-8333-333333333333','simulation:unbalanced')$q$,
  $q$INSERT INTO war_satchel_ledger_postings (journal_id,account_id,delta_uwolo)
     VALUES ('33333333-3333-4333-8333-333333333333',1,100),
            ('33333333-3333-4333-8333-333333333333',2,-99)$q$
], 'unbalanced journal must be rejected at deferred constraint');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_journals (id,source_key)
     VALUES ('33333333-3333-4333-8333-333333333333','simulation:one-sided')$q$
], 'journal with no postings must fail at COMMIT');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_journals (id,source_key)
     VALUES ('33333333-3333-4333-8333-333333333333','simulation:overspend')$q$,
  $q$INSERT INTO war_satchel_ledger_postings (journal_id,account_id,delta_uwolo)
     VALUES ('33333333-3333-4333-8333-333333333333',2,500),
            ('33333333-3333-4333-8333-333333333333',3,-500)$q$
], 'available liability cannot cross above zero');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_journals (id,source_key)
     VALUES ('33333333-3333-4333-8333-333333333333','simulation:overwithdraw')$q$,
  $q$INSERT INTO war_satchel_ledger_postings (journal_id,account_id,delta_uwolo)
     VALUES ('33333333-3333-4333-8333-333333333333',1,-1100),
            ('33333333-3333-4333-8333-333333333333',2,1100)$q$
], 'vault and player balance cannot be overdrawn');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_journals (id,source_kind,source_key)
     VALUES ('33333333-3333-4333-8333-333333333333','confirmed_deposit','simulation:illegal-live-credit')$q$
], 'cannot claim real chain credit with simulation schema');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_journals (id,source_key)
     VALUES ('33333333-3333-4333-8333-333333333333','simulation:deposit-user101-1000')$q$
], 'duplicate source identity cannot be accepted');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$UPDATE war_satchel_ledger_postings SET delta_uwolo=1 WHERE account_id=1$q$
], 'historical posting cannot be rewritten');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$DELETE FROM war_satchel_ledger_journals WHERE id='11111111-1111-4111-8111-111111111111'$q$
], 'historical journal cannot be deleted');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$UPDATE war_satchel_ledger_accounts SET owner_user_id=102 WHERE id=2$q$
], 'account cannot be re-owned by another player');

SELECT expect_satchel_ledger_denial(ARRAY[
  $q$INSERT INTO war_satchel_ledger_accounts (account_key,owner_user_id,account_kind)
     VALUES ('simulation:negative-owner',NULL,'user_available_liability')$q$
], 'user liability must have owner');

SELECT 'SATCHEL_LEDGER_SIMULATION_PASS: zero-sum at commit, no overdraft, immutable, no real credit' AS result;
