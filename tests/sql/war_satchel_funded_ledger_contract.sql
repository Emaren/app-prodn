-- PostgreSQL 16 isolated synthetic-funded accounting contract. No live assets.
BEGIN;
INSERT INTO users(id) VALUES (71241), (71242) ON CONFLICT (id) DO NOTHING;
INSERT INTO bet_auto_executions(id) VALUES (81001) ON CONFLICT (id) DO NOTHING;
INSERT INTO war_satchel_funded_balances
(owner_user_id, available_uwolo, reserved_uwolo, committed_uwolo)
VALUES (71241, 500000000, 0, 0);

INSERT INTO war_satchel_deposit_intents
(id, user_id, chain_id, sender_address, vault_address, amount_uwolo, memo, nonce, expires_at)
VALUES
('d1171771-5fc6-4904-9042-988123891111',71241,'wolo-1','wolo1ssssssssssssssssssssssssssssssssssssss','wolo1vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',50000000,
 'aoe2war/satchel/v1/synthetic-test/1234567890ABCDEF','synthetic-unique-nonce-test-17',
 CURRENT_TIMESTAMP + interval '10 minutes');
INSERT INTO war_satchel_proof_candidates
(intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
VALUES
('d1171771-5fc6-4904-9042-988123891111',71241,'wolo-1',repeat('A',64),0,'wolo1ssssssssssssssssssssssssssssssssssssss',
 'wolo1vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',50000000,321,NOW());

INSERT INTO war_satchel_funded_receipts
(owner_user_id,proof_candidate_id,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height)
VALUES
(71241,(SELECT id FROM war_satchel_proof_candidates WHERE tx_hash=repeat('A',64)),
 'wolo-1',repeat('A',64),0,50000000,'wolo1vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',321);

INSERT INTO war_satchel_funded_journal
(owner_user_id, source_key, event_kind, amount_uwolo, delta_available_uwolo,
 delta_reserved_uwolo, delta_committed_uwolo, delta_withdrawal_pending_uwolo, receipt_id, execution_id)
VALUES
(71241,'test:credited', 'deposit_credit',50000000,50000000,0,0,0,
 (SELECT id FROM war_satchel_funded_receipts WHERE tx_hash=repeat('A',64)),NULL),
(71241,'test:reserved','wager_reserve',25000000,-25000000,25000000,0,0,NULL,81001);

DO $test$
DECLARE
 failed BOOLEAN;
BEGIN
  -- Unique source keys cannot replay a second credit.
  failed := FALSE;
  BEGIN
    INSERT INTO war_satchel_funded_journal
    (owner_user_id, source_key, event_kind, amount_uwolo, delta_available_uwolo,
     delta_reserved_uwolo, delta_committed_uwolo, delta_withdrawal_pending_uwolo)
    VALUES (71241,'test:credited','wager_refund',1,1,-1,0,0);
  EXCEPTION WHEN unique_violation THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'duplicate journal source accepted'; END IF;

  -- An attempted second on-chain receipt for the same original proof cannot land.
  failed := FALSE;
  BEGIN
    INSERT INTO war_satchel_funded_receipts
    (owner_user_id,proof_candidate_id,chain_id,tx_hash,transfer_index,amount_uwolo,vault_address,canonical_height)
    VALUES
    (71242,(SELECT id FROM war_satchel_proof_candidates WHERE tx_hash=repeat('A',64)),
     'wolo-1',repeat('B',64),0,50000000,'wolo1vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv',321);
  EXCEPTION WHEN unique_violation THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'cross-owner receipt replay accepted'; END IF;

  -- It is impossible to create a fee-taking 2% reservation/refund journal:
  -- the exact bucket deltas must equal the full stated amount.
  failed := FALSE;
  BEGIN
    INSERT INTO war_satchel_funded_journal
    (owner_user_id,source_key,event_kind,amount_uwolo,delta_available_uwolo,
     delta_reserved_uwolo,delta_committed_uwolo,delta_withdrawal_pending_uwolo,execution_id)
    VALUES(71241,'test:fee-taken','wager_refund',25000000,24500000,-25000000,0,0,81001);
  EXCEPTION WHEN check_violation THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION '2 percent unmatched refund fee was accepted'; END IF;

  -- No bucket can go negative even if an app writer forgets its WHERE guard.
  failed := FALSE;
  BEGIN
    UPDATE war_satchel_funded_balances SET available_uwolo=-1 WHERE owner_user_id=71241;
  EXCEPTION WHEN check_violation THEN failed := TRUE;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'negative available balance accepted'; END IF;

  -- Historical receipt/journal records must never be updated or removed.
  failed := FALSE;
  BEGIN
    UPDATE war_satchel_funded_receipts SET amount_uwolo=1 WHERE owner_user_id=71241;
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%immutable%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'funded receipt mutation accepted'; END IF;

  failed := FALSE;
  BEGIN
    DELETE FROM war_satchel_funded_journal WHERE source_key='test:credited';
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%immutable%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'funded journal deletion accepted'; END IF;

  INSERT INTO war_satchel_funded_reservations
  (id,owner_user_id,execution_id,amount_uwolo,ticket_request_id)
  VALUES('satchel:reserve:81001',71241,81001,25000000,'satchel:ticket:81001');

  failed := FALSE;
  BEGIN
    UPDATE war_satchel_funded_reservations
      SET status='committed' WHERE execution_id=81001;
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%illegal%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'reservation bypassed unknown-hold fence'; END IF;

  UPDATE war_satchel_funded_reservations SET status='unknown_hold' WHERE execution_id=81001;
  UPDATE war_satchel_funded_reservations SET status='committed',
    ticket_id=993,tx_hash=repeat('C',64) WHERE execution_id=81001;

  failed := FALSE;
  BEGIN
    UPDATE war_satchel_funded_reservations
      SET status='released' WHERE execution_id=81001;
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%illegal%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'committed payout was refunded'; END IF;

  failed := FALSE;
  BEGIN
    UPDATE war_satchel_funded_reservations SET owner_user_id=71242 WHERE execution_id=81001;
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM LIKE '%immutable%';
  END;
  IF NOT failed THEN RAISE EXCEPTION 'reservation owner reassigned'; END IF;
END;
$test$;
ROLLBACK;
SELECT 'PASS funded War Satchel receipt uniqueness, ledger constraints and immutable reservation lifecycle' AS result;
