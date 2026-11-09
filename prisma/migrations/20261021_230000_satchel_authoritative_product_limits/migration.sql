-- Owner-mandated product ceilings: 10,000 WOLO per bet, 50,000 daily Auto Bet.
-- Forward schema preparation only: no balances, journals, signed mandates or
-- historical migration bytes change. Existing smaller signed limits remain
-- immutable. This ALTER-CHECK migration needs separate protected review and
-- must not be mistaken for the CREATE-TABLE-only automatic migration lane.
BEGIN;
ALTER TABLE bet_auto_presets
 DROP CONSTRAINT ck_bet_auto_presets_game_plan,
 ADD CONSTRAINT ck_bet_auto_presets_game_plan CHECK (
  (until_out=true AND games_remaining IS NULL) OR
  (until_out=false AND games_remaining BETWEEN 1 AND 10000 AND
   (winner_stake_wolo::bigint+desync_stake_wolo::bigint)*games_remaining<=50000)
 );
ALTER TABLE war_satchel_auto_spend_consents
 DROP CONSTRAINT ck_satchel_consent_positive_limits,
 ADD CONSTRAINT ck_satchel_consent_positive_limits CHECK (
  preset_version>0 AND winner_stake_wolo BETWEEN 1 AND 10000
  AND desync_side IN ('none','no','yes') AND desync_stake_wolo BETWEEN 0 AND 10000
  AND ((desync_side='none' AND desync_stake_wolo=0) OR
       (desync_side<>'none' AND desync_stake_wolo>0))
  AND winner_stake_wolo::bigint+desync_stake_wolo::bigint<=10000
  AND per_game_cap_wolo BETWEEN 1 AND 10000
  AND per_game_cap_wolo>=winner_stake_wolo::bigint+desync_stake_wolo::bigint
  AND daily_cap_wolo>=per_game_cap_wolo AND daily_cap_wolo<=50000
 );
ALTER TABLE war_satchel_claim_return_authorizations
 -- PostgreSQL shortened the original automatically generated name to 63 bytes.
 DROP CONSTRAINT war_satchel_claim_return_authorizatio_funded_amount_uwolo_check,
 ADD CONSTRAINT ck_satchel_return_funding_product_cap
 CHECK(funded_amount_uwolo>0 AND funded_amount_uwolo<=10000000000);
-- The daily reserve query uses UTC. Preserve existing history, but ensure new
-- timestamp-without-zone journal rows cannot inherit a session's local day.
ALTER TABLE war_satchel_funded_journal
 ALTER COLUMN created_at SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC');
COMMIT;
