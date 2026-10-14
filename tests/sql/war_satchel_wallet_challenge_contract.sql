-- Executed against ephemeral PostgreSQL 16 after the C1 foundation tests.
CREATE FUNCTION expect_wallet_challenge_rejected(statement TEXT, reason TEXT)
RETURNS VOID LANGUAGE plpgsql AS $expect_wallet$
DECLARE failed BOOLEAN := false;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    failed := true;
  END;
  IF NOT failed THEN
    RAISE EXCEPTION 'Unsafe wallet challenge operation accepted: %', reason;
  END IF;
END;
$expect_wallet$;

INSERT INTO war_satchel_wallet_challenges
  (id,user_id,owner_uid,wallet_address,nonce,issued_at,expires_at)
VALUES (
  '44444444-4444-4444-8444-444444444444',101,'warrior101',
  'wolo1syntheticuser101','0123456789abcdef0123456789abcdef',
  now(),now()+interval '5 minutes'
);

SELECT expect_wallet_challenge_rejected(
  $q$INSERT INTO war_satchel_wallet_challenges
    (id,user_id,owner_uid,wallet_address,nonce,expires_at)
  VALUES ('55555555-5555-4555-8555-555555555555',102,'warrior102',
    'wolo1syntheticuser102','0123456789abcdef0123456789abcdef',now()+interval '5 minutes')$q$,
  'duplicate nonce'
);
SELECT expect_wallet_challenge_rejected(
  $q$INSERT INTO war_satchel_wallet_challenges
    (id,user_id,owner_uid,wallet_address,nonce,expires_at)
  VALUES ('55555555-5555-4555-8555-555555555555',102,'warrior102',
    'wolo1syntheticuser102','fedcba9876543210fedcba9876543210',now()+interval '11 minutes')$q$,
  'overlong challenge expiry'
);
SELECT expect_wallet_challenge_rejected(
  $q$UPDATE war_satchel_wallet_challenges SET wallet_address='wolo1redirected'
    WHERE user_id=101$q$,
  'retarget challenge wallet'
);
SELECT expect_wallet_challenge_rejected(
  $q$UPDATE war_satchel_wallet_challenges SET owner_uid='warrior102'
    WHERE user_id=101$q$,
  'retarget challenge owner'
);
SELECT expect_wallet_challenge_rejected(
  $q$UPDATE war_satchel_wallet_challenges SET nonce='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    WHERE user_id=101$q$,
  'retarget signed challenge nonce'
);
UPDATE war_satchel_wallet_challenges SET attempts=attempts+1 WHERE user_id=101;
UPDATE war_satchel_wallet_challenges SET consumed_at=now() WHERE user_id=101;
SELECT expect_wallet_challenge_rejected(
  $q$UPDATE war_satchel_wallet_challenges SET consumed_at=NULL WHERE user_id=101$q$,
  'replay already consumed challenge'
);
SELECT expect_wallet_challenge_rejected(
  $q$UPDATE war_satchel_wallet_challenges SET attempts=0 WHERE user_id=101$q$,
  'erase proof attempt count'
);
SELECT expect_wallet_challenge_rejected(
  $q$UPDATE war_satchel_wallet_challenges SET attempts=6 WHERE user_id=101$q$,
  'exceed proof verification retry cap'
);
DO $assert$
BEGIN
 IF (SELECT count(*) FROM war_satchel_wallet_challenges
       WHERE consumed_at IS NOT NULL AND attempts=1) <> 1 THEN
   RAISE EXCEPTION 'Challenge single-use and retries not preserved';
 END IF;
END;
$assert$;
SELECT 'SATCHEL_WALLET_CHALLENGE_SQL_PASS' AS status;
