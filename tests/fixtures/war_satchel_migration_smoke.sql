-- Execute only against a disposable PostgreSQL database after creating a
-- minimal users(id) test table and running the migration. Never production.
INSERT INTO users (id) VALUES (1), (2);

INSERT INTO war_satchel_accounts (user_id) VALUES (1);
DO $proof$
DECLARE a war_satchel_accounts%ROWTYPE;
BEGIN
 SELECT * INTO STRICT a FROM war_satchel_accounts WHERE user_id = 1;
 IF a.status <> 'inactive' OR a.available_uwolo <> 0 OR
    a.reserved_uwolo <> 0 OR a.committed_uwolo <> 0 OR
    a.withdrawal_held_uwolo <> 0 THEN
   RAISE EXCEPTION 'nonzero or noninactive new owner account';
 END IF;
END
$proof$;

INSERT INTO war_satchel_deposit_intents
 (id,user_id,nonce,sender_address,vault_address,amount_uwolo,exact_memo,expires_at)
 VALUES ('00000000-0000-4000-8000-000000000001',1,
 'unique_nonce_1234567890','wolo1sender','wolo1vault',700,
 'aoe2war/satchel/v1/u_test/unique_nonce_1234567890',
 CURRENT_TIMESTAMP + interval '20 minutes');

INSERT INTO wolo_transfer_claims
 (chain_id,tx_hash,transfer_index,rail,user_id,amount_uwolo,block_height,source_evidence_sha256)
 VALUES ('wolo-1',repeat('A',64),1,'satchel',1,700,123,repeat('a',64));

DO $proof$
DECLARE rejected BOOLEAN;
BEGIN
 rejected:=false;
 BEGIN
  INSERT INTO wolo_transfer_claims
  (chain_id,tx_hash,transfer_index,rail,user_id,amount_uwolo,block_height,source_evidence_sha256)
  VALUES ('wolo-1',repeat('A',64),1,'manual_bet',2,700,123,repeat('a',64));
 EXCEPTION WHEN unique_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'cross-rail duplicate receipt was allowed'; END IF;

 rejected:=false;
 BEGIN
  UPDATE wolo_transfer_claims SET user_id=2 WHERE tx_hash=repeat('A',64);
 EXCEPTION WHEN raise_exception THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'cross-owner receipt reassignment allowed'; END IF;

 rejected:=false;
 BEGIN
  DELETE FROM wolo_transfer_claims WHERE tx_hash=repeat('A',64);
 EXCEPTION WHEN raise_exception THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'claimed receipt deletion allowed'; END IF;
END
$proof$;

UPDATE wolo_transfer_claims SET status='verified' WHERE tx_hash=repeat('A',64);
UPDATE wolo_transfer_claims SET status='allocated' WHERE tx_hash=repeat('A',64);

DO $proof$
DECLARE rejected BOOLEAN;
BEGIN
 rejected:=false;
 BEGIN
  UPDATE wolo_transfer_claims SET status='observed' WHERE tx_hash=repeat('A',64);
 EXCEPTION WHEN raise_exception THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'consumed receipt status was regressed'; END IF;

 rejected:=false;
 BEGIN
  UPDATE war_satchel_accounts SET available_uwolo=-1 WHERE user_id=1;
 EXCEPTION WHEN check_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'negative user money allowed'; END IF;
END
$proof$;

-- Simulate one already independently verified atomic journal/balance pair.
-- The actual SERIALIZABLE application writer remains separately gated.
BEGIN;
UPDATE war_satchel_accounts SET available_uwolo=700,revision=1 WHERE user_id=1;
INSERT INTO war_satchel_journal
 (account_id,event_key,transfer_claim_id,kind,delta_available_uwolo,
  after_available_uwolo,after_reserved_uwolo,after_committed_uwolo,after_withdrawal_uwolo)
 VALUES (1,'fixture.deposit.1',1,'verified_deposit',700,700,0,0,0);
COMMIT;

DO $proof$
DECLARE rejected BOOLEAN;
BEGIN
 rejected:=false;
 BEGIN
  INSERT INTO war_satchel_journal
  (account_id,event_key,transfer_claim_id,kind,delta_available_uwolo,
   after_available_uwolo,after_reserved_uwolo,after_committed_uwolo,after_withdrawal_uwolo)
  VALUES (1,'fixture.deposit.2',1,'verified_deposit',700,1400,0,0,0);
 EXCEPTION WHEN unique_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'one chain transfer funded two journals'; END IF;

 rejected:=false;
 BEGIN
  INSERT INTO war_satchel_journal
  (account_id,event_key,kind,delta_available_uwolo,
   after_available_uwolo,after_reserved_uwolo,after_committed_uwolo,after_withdrawal_uwolo)
  VALUES (1,'fixture.deposit.1','reserve',-100,600,100,0,0);
 EXCEPTION WHEN unique_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'identical idempotency event was reused'; END IF;

 rejected:=false;
 BEGIN
  UPDATE war_satchel_journal SET after_available_uwolo=500 WHERE event_key='fixture.deposit.1';
 EXCEPTION WHEN SQLSTATE '23000' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'immutable journal update allowed'; END IF;

 rejected:=false;
 BEGIN
  DELETE FROM war_satchel_journal WHERE event_key='fixture.deposit.1';
 EXCEPTION WHEN SQLSTATE '23000' THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'immutable journal delete allowed'; END IF;
END
$proof$;


-- Gate B owner/custody negative controls: distinct receipts must not be
-- allowed to credit an unrelated owner, pre-allocation, or wrong denomination.
INSERT INTO war_satchel_accounts (user_id) VALUES (2);
INSERT INTO wolo_transfer_claims
 (chain_id,tx_hash,transfer_index,rail,user_id,amount_uwolo,block_height,source_evidence_sha256)
 VALUES
 ('wolo-1',repeat('B',64),0,'satchel',2,700,124,repeat('b',64)),
 ('wolo-1',repeat('C',64),0,'satchel',1,700,125,repeat('c',64)),
 ('wolo-1',repeat('D',64),0,'satchel',1,699,126,repeat('d',64)),
 ('wolo-1',repeat('E',64),0,'manual_bet',1,700,127,repeat('e',64));
UPDATE wolo_transfer_claims SET status='verified'
 WHERE tx_hash IN (repeat('B',64),repeat('D',64),repeat('E',64));
UPDATE wolo_transfer_claims SET status='allocated'
 WHERE tx_hash IN (repeat('B',64),repeat('D',64),repeat('E',64));

DO $proof$
DECLARE
  rejected BOOLEAN;
  case_name TEXT;
  claim_hash TEXT;
BEGIN
  FOR case_name, claim_hash IN
    SELECT * FROM (VALUES
      ('cross-owner',repeat('B',64)),
      ('not-allocated',repeat('C',64)),
      ('amount-mismatch',repeat('D',64)),
      ('wrong-rail',repeat('E',64))
    ) AS cases(name,tx)
  LOOP
    rejected:=false;
    BEGIN
      INSERT INTO war_satchel_journal
       (account_id,event_key,transfer_claim_id,kind,delta_available_uwolo,
        after_available_uwolo,after_reserved_uwolo,after_committed_uwolo,
        after_withdrawal_uwolo)
      VALUES (1,'fixture.refused.' || case_name,
        (SELECT id FROM wolo_transfer_claims WHERE tx_hash=claim_hash),
        'verified_deposit',700,1400,0,0,0);
    EXCEPTION WHEN check_violation THEN rejected:=true;
    END;
    IF NOT rejected THEN
      RAISE EXCEPTION 'claim boundary accepted invalid % transfer',case_name;
    END IF;
  END LOOP;

  rejected:=false;
  BEGIN
    INSERT INTO war_satchel_journal
     (account_id,event_key,kind,delta_available_uwolo,
      after_available_uwolo,after_reserved_uwolo,after_committed_uwolo,
      after_withdrawal_uwolo)
    VALUES (1,'fixture.refused.no-claim','verified_deposit',700,1400,0,0,0);
  EXCEPTION WHEN check_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'external credit without transfer claim was accepted';
  END IF;

  rejected:=false;
  BEGIN
    INSERT INTO war_satchel_journal
     (account_id,event_key,transfer_claim_id,kind,delta_available_uwolo,
      delta_reserved_uwolo,after_available_uwolo,after_reserved_uwolo,
      after_committed_uwolo,after_withdrawal_uwolo)
    VALUES (1,'fixture.refused.internal-claim',
      (SELECT id FROM wolo_transfer_claims WHERE tx_hash=repeat('C',64)),
      'reserve',-10,10,690,10,0,0);
  EXCEPTION WHEN check_violation THEN rejected:=true;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'internal reserve consumed external claim';
  END IF;
END
$proof$;

DO $proof$
DECLARE n BIGINT;
BEGIN
  SELECT count(*) INTO n FROM war_satchel_journal;
  IF n <> 1 THEN RAISE EXCEPTION 'negative controls modified journal'; END IF;
  SELECT revision INTO n FROM war_satchel_accounts WHERE user_id=1;
  IF n <> 1 THEN RAISE EXCEPTION 'negative controls modified account'; END IF;
END
$proof$;

SELECT 'PASS: unique global receipt, owner lock, zero-default account, nonnegative balances and immutable journal' AS satchel_ephemeral_db_proof;
