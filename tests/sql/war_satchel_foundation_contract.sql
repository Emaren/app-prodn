-- This test only runs against an ephemeral GitHub Actions PostgreSQL container.
-- All identities below are synthetic. No WoloChain signer or token is involved.

CREATE FUNCTION expect_satchel_rejection(statement TEXT, reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $satchel_assert$
DECLARE
  rejected BOOLEAN := FALSE;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    rejected := TRUE;
  END;
  IF NOT rejected THEN
    RAISE EXCEPTION 'WRONG: unsafe Satchel operation accepted: %', reason;
  END IF;
END;
$satchel_assert$;

INSERT INTO users (id) VALUES (101), (102);

INSERT INTO war_satchel_deposit_intents
 (id, user_id, sender_address, vault_address, amount_uwolo, memo, nonce, expires_at)
VALUES
 ('11111111-1111-4111-8111-111111111111', 101, 'wolo1syntheticsender101', 'wolo1syntheticvault', 1000000, 'aoe2war/satchel/v1/owner101/nonce-one', 'nonce-one', now() + interval '20 minutes'),
 ('22222222-2222-4222-8222-222222222222', 102, 'wolo1syntheticsender102', 'wolo1syntheticvault', 2000000, 'aoe2war/satchel/v1/owner102/nonce-two', 'nonce-two', now() + interval '20 minutes');

DO $check$
BEGIN
  IF (SELECT count(*) FROM war_satchel_deposit_intents) <> 2 THEN
    RAISE EXCEPTION 'Expected two synthetic deposit intents';
  END IF;
  IF EXISTS (SELECT 1 FROM war_satchel_deposit_intents WHERE status <> 'prepared') THEN
    RAISE EXCEPTION 'Intent default status not prepared';
  END IF;
END;
$check$;

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_deposit_intents
    (id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,expires_at)
    VALUES ('33333333-3333-4333-8333-333333333333',101,'x','y',-1,'newmemo','noncenegative',now()+interval '10 minutes')$q$,
  'negative transfer intent'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_deposit_intents
    (id,user_id,chain_id,sender_address,vault_address,amount_uwolo,memo,nonce,expires_at)
    VALUES ('33333333-3333-4333-8333-333333333333',101,'cosmoshub-4','x','y',1,'newmemo','noncechain',now()+interval '10 minutes')$q$,
  'wrong chain'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_deposit_intents
    (id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,expires_at)
    VALUES ('33333333-3333-4333-8333-333333333333',101,'x','y',1,'newmemo','noncelate',now()+interval '40 minutes')$q$,
  'expiry beyond 30 minutes'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_deposit_intents
    (id,user_id,sender_address,vault_address,amount_uwolo,memo,nonce,expires_at)
    VALUES ('33333333-3333-4333-8333-333333333333',101,'x','y',1,'newmemo','nonce-one',now()+interval '10 minutes')$q$,
  'duplicate nonce'
);

SELECT expect_satchel_rejection(
  $q$UPDATE war_satchel_deposit_intents SET vault_address='wolo1redirected'
    WHERE id='11111111-1111-4111-8111-111111111111'$q$,
  'deposit redirected to another vault'
);

SELECT expect_satchel_rejection(
  $q$UPDATE war_satchel_deposit_intents SET amount_uwolo=2000000
    WHERE id='11111111-1111-4111-8111-111111111111'$q$,
  'amount changed after wallet intent'
);

SELECT expect_satchel_rejection(
  $q$UPDATE war_satchel_deposit_intents SET user_id=102
    WHERE id='11111111-1111-4111-8111-111111111111'$q$,
  'intent reassigned to another user'
);

-- Non-economic status transitions remain allowed for later reviewed flows.
UPDATE war_satchel_deposit_intents SET status='submitted'
WHERE id='11111111-1111-4111-8111-111111111111';

INSERT INTO war_satchel_proof_candidates
 (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
VALUES
 ('11111111-1111-4111-8111-111111111111',101,'wolo-1',repeat('A',64),0,'wolo1syntheticsender101','wolo1syntheticvault',1000000,12000,now());

DO $check$
BEGIN
  IF (SELECT count(*) FROM war_satchel_proof_candidates WHERE status='uncredited') <> 1 THEN
    RAISE EXCEPTION 'Proof must be uncredited';
  END IF;
END;
$check$;

SELECT expect_satchel_rejection(
  $q$UPDATE war_satchel_proof_candidates SET status='credited'$q$,
  'illegal proof credit'
);
SELECT expect_satchel_rejection(
  $q$DELETE FROM war_satchel_proof_candidates$q$,
  'proof deletion'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_proof_candidates
  (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
  VALUES ('22222222-2222-4222-8222-222222222222',102,'wolo-1',repeat('A',64),0,'wolo1syntheticsender102','wolo1syntheticvault',2000000,12000,now())$q$,
  'same on-chain tx transfer credited to two intents'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_proof_candidates
  (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
  VALUES ('22222222-2222-4222-8222-222222222222',101,'wolo-1',repeat('B',64),0,'wolo1syntheticsender102','wolo1syntheticvault',2000000,12000,now())$q$,
  'wrong user for proof intent'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_proof_candidates
  (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
  VALUES ('22222222-2222-4222-8222-222222222222',102,'wolo-1',repeat('B',64),0,'wolo1wrongwallet','wolo1syntheticvault',2000000,12000,now())$q$,
  'wrong sending wallet'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_proof_candidates
  (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
  VALUES ('22222222-2222-4222-8222-222222222222',102,'wolo-1',repeat('B',64),0,'wolo1syntheticsender102','wolo1wrongvault',2000000,12000,now())$q$,
  'wrong receiving vault'
);

SELECT expect_satchel_rejection(
  $q$INSERT INTO war_satchel_proof_candidates
  (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
  VALUES ('22222222-2222-4222-8222-222222222222',102,'wolo-1',repeat('B',64),0,'wolo1syntheticsender102','wolo1syntheticvault',1000000,12000,now())$q$,
  'wrong transferred amount'
);

INSERT INTO war_satchel_proof_candidates
 (intent_id,user_id,chain_id,tx_hash,transfer_index,sender_address,vault_address,amount_uwolo,tx_height,verified_at)
VALUES
 ('22222222-2222-4222-8222-222222222222',102,'wolo-1',repeat('B',64),0,'wolo1syntheticsender102','wolo1syntheticvault',2000000,12001,now());

DO $check$
BEGIN
  IF (SELECT count(*) FROM war_satchel_proof_candidates) <> 2 THEN
    RAISE EXCEPTION 'Proofs must be admitted for two valid owners only';
  END IF;
END;
$check$;

SELECT 'SATCHEL_SQL_CONTRACT_PASS: unique, immutable, owner-bound, never credited' AS status;
