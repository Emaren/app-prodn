-- Regression: final additive owner guard MUST admit a valid one-owner
-- zero-sum release while refusing all unfunded/mixed-owner sources.
-- Prior concurrency rehearsal also committed one +300/-300 reserve: starting
-- balances are vault=1000, available=-100, reserved=-900.\n-- Synthetic only. No real chain funds, balance API or signer.
BEGIN;
INSERT INTO war_satchel_ledger_journals (id,source_key)
VALUES ('44444444-4444-4444-8444-444444444444',
        'simulation:release-user101-100-after-owner-guard');
INSERT INTO war_satchel_ledger_postings (journal_id,account_id,delta_uwolo)
VALUES ('44444444-4444-4444-8444-444444444444',2,-100),
       ('44444444-4444-4444-8444-444444444444',3,100);
SET CONSTRAINTS ALL IMMEDIATE;
COMMIT;

DO $check$
DECLARE available NUMERIC; reserved NUMERIC; vault NUMERIC;
BEGIN
  SELECT sum(delta_uwolo::numeric) INTO available FROM war_satchel_ledger_postings WHERE account_id=2;
  SELECT sum(delta_uwolo::numeric) INTO reserved FROM war_satchel_ledger_postings WHERE account_id=3;
  SELECT sum(delta_uwolo::numeric) INTO vault FROM war_satchel_ledger_postings WHERE account_id=1;
  IF available <> -200 OR reserved <> -800 OR vault <> 1000 THEN
    RAISE EXCEPTION 'Safe release did not preserve owner liabilities and assets';
  END IF;
  IF (SELECT count(*) FROM war_satchel_ledger_journals
      WHERE source_key='simulation:release-user101-100-after-owner-guard') <> 1 THEN
    RAISE EXCEPTION 'Valid simulated journal missing after commit';
  END IF;
END;
$check$;

DO $negative$
DECLARE observed text;
BEGIN
  BEGIN
    INSERT INTO war_satchel_ledger_journals(id,source_key)
    VALUES ('55555555-5555-4555-8555-555555555555','simulation:cross-owner-still-denied');
    INSERT INTO war_satchel_ledger_postings(journal_id,account_id,delta_uwolo)
    VALUES ('55555555-5555-4555-8555-555555555555',2,100),
           ('55555555-5555-4555-8555-555555555555',4,-100);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Cross owner incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed = MESSAGE_TEXT;
    IF observed NOT LIKE '%references multiple or zero players%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO war_satchel_ledger_journals(id,source_key)
    VALUES ('66666666-6666-4666-8666-666666666666','simulation:overdraft-still-denied');
    INSERT INTO war_satchel_ledger_postings(journal_id,account_id,delta_uwolo)
    VALUES ('66666666-6666-4666-8666-666666666666',2,501),
           ('66666666-6666-4666-8666-666666666666',3,-501);
    SET CONSTRAINTS ALL IMMEDIATE;
    RAISE EXCEPTION 'Overdraft incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed = MESSAGE_TEXT;
    IF observed NOT LIKE '%account overdraft%' THEN RAISE; END IF;
  END;

  BEGIN
    INSERT INTO war_satchel_ledger_journals(id,source_kind,source_key)
    VALUES ('77777777-7777-4777-8777-777777777777','confirmed_deposit','simulation:fake-chain-credit');
    RAISE EXCEPTION 'Real credit incorrectly accepted';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed = MESSAGE_TEXT;
    IF observed NOT LIKE '%war_satchel_ledger_simulation_only%' THEN RAISE; END IF;
  END;

  IF EXISTS (SELECT 1 FROM war_satchel_ledger_journals
             WHERE id IN ('55555555-5555-4555-8555-555555555555',
                          '66666666-6666-4666-8666-666666666666',
                          '77777777-7777-4777-8777-777777777777')) THEN
    RAISE EXCEPTION 'A rejected source committed a phantom journal';
  END IF;
END;
$negative$;

SELECT 'SATCHEL_SIMULATION_GUARD_CORRECTION_PASS' AS result;
