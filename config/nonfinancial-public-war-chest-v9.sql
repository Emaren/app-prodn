-- A05 War Chest: display-only provenance views. Wager funding proof is a
-- Boolean, never wallet, credential, transaction memo or signer authority.
-- Existing protected financial base tables remain deliberately SELECT denied.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='60s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres' OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR to_regclass('aoe2war_public_v5.user_profiles') IS NULL
    OR to_regclass('public.bet_markets') IS NULL
    OR to_regclass('public.bet_wagers') IS NULL
    OR to_regclass('public.bet_stake_intents') IS NULL
    OR to_regclass('public.bet_stake_legs') IS NULL
    OR to_regclass('public.bet_stake_tickets') IS NULL
    OR to_regclass('public.pending_wolo_claims') IS NULL
 THEN RAISE EXCEPTION 'WAR_CHEST_V9_PRECHECK_HOLD'; END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v9 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v9 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v9 TO aoe2war_web_prod;

-- Only public betting activity needed to reconstruct the original
-- War Chest matched exposure, take, weekly totals and latest slips.
-- Hashes, addresses, client identifiers, signing state and custody details
-- do NOT cross this boundary. The verified funding boolean is checked in
-- code with the real WOLO mainnet date/mode fence.
CREATE OR REPLACE VIEW aoe2war_public_v9.published_wagers
WITH (security_barrier=true) AS
SELECT w.id, w.market_id AS "marketId",w.user_id AS "userId",
       w.side,w.amount_wolo AS "amountWolo",
       w.payout_wolo AS "payoutWolo",w.status,
       w.execution_mode AS "executionMode",
       w.created_at AS "createdAt",w.settled_at AS "settledAt",
       w.stake_locked_at AS "stakeLockedAt",
       COALESCE((w.execution_mode='onchain_escrow'
         AND w.stake_locked_at IS NOT NULL
         AND ((NULLIF(BTRIM(w.stake_tx_hash),'') IS NOT NULL AND i.status='recorded')
             OR (t.status='recorded' AND NULLIF(BTRIM(t.stake_tx_hash),'') IS NOT NULL))
       ),FALSE) AS "recordedFunding"
FROM public.bet_wagers w
LEFT JOIN public.bet_stake_intents i ON i.id=w.stake_intent_id
LEFT JOIN public.bet_stake_legs l ON l.id=w.stake_leg_id
LEFT JOIN public.bet_stake_tickets t ON t.id=l.ticket_id;
REVOKE ALL ON aoe2war_public_v9.published_wagers FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v9.published_wagers TO aoe2war_web_prod;

-- Public-facing claim status and amount. Private note and error detail
-- are omitted; a tiny public status class is derived without raw content.
-- Payout transaction hashes identify public on-chain receipts, not keys.
CREATE OR REPLACE VIEW aoe2war_public_v9.published_claims
WITH (security_barrier=true) AS
SELECT c.id,c.claimed_by_user_id AS "claimedByUserId",
       c.normalized_player_name AS "normalizedPlayerName",
       c.display_player_name AS "displayPlayerName",
       c.amount_wolo AS "amountWolo",c.claim_kind AS "claimKind",
       c.status,c.created_at AS "createdAt",c.claimed_at AS "claimedAt",
       c.payout_attempted_at AS "payoutAttemptedAt",
       c.payout_tx_hash AS "payoutTxHash",
       CASE WHEN c.error_state ILIKE '%payout_reserve_floor_hit%'
                      OR c.error_state ILIKE '%reserve floor%'
           THEN 'payout_reserve_floor_hit'
            WHEN c.error_state ILIKE '%settlement_health%'
                      OR c.error_state ILIKE '%settlement service%'
           THEN 'settlement_health'
            WHEN c.error_state IS NOT NULL THEN 'operator_review'
            ELSE NULL END AS "errorState",
       NULL::text AS note
FROM public.pending_wolo_claims c
WHERE c.rescinded_at IS NULL;
REVOKE ALL ON aoe2war_public_v9.published_claims FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v9.published_claims TO aoe2war_web_prod;

-- Published market labels and public rails only. Market integrity evidence,
-- reviewer decisions, wallet addresses and source hash metadata stay private.
CREATE OR REPLACE VIEW aoe2war_public_v9.published_markets
WITH (security_barrier=true) AS
SELECT m.id,m.title,m.event_label AS "eventLabel",m.status,
       m.sort_order AS "sortOrder",m.featured,
       m.market_type AS "marketType",
       m.left_label AS "leftLabel",m.right_label AS "rightLabel",
       m.seed_left_wolo AS "seedLeftWolo",
       m.seed_right_wolo AS "seedRightWolo",
       m.close_at AS "closeAt",m.settled_at AS "settledAt",
       COALESCE((
         m.integrity_status='verified'
         AND NULLIF(BTRIM(m.proposition_hash),'') IS NOT NULL
         AND CASE WHEN m.market_type='desync' THEN
            parent.id IS NOT NULL AND parent.market_type='winner'
            AND (
              (m.status IN ('open','live') AND parent.status IN ('open','live'))
              OR (m.status='closing' AND (
                   parent.status IN ('open','closing','live')
                   OR (parent.status='settled'
                       AND parent.winner_side IN ('left','right')
                       AND parent.settled_at IS NOT NULL)))
              OR (m.status='awaiting_final_proof'
                  AND parent.status='awaiting_final_proof')
              OR (m.status='under_review' AND parent.status='under_review')
            )
           ELSE m.team_resolution_status='resolved'
                AND m.team_confidence='high'
         END
       ),FALSE) AS "publicIntegrityEligible"
FROM public.bet_markets m
LEFT JOIN public.bet_markets parent ON parent.id=m.parent_market_id;
REVOKE ALL ON aoe2war_public_v9.published_markets FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v9.published_markets TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.bet_wagers','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.pending_wolo_claims','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bet_markets','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bet_stake_intents','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bet_stake_tickets','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.users','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v9','CREATE')
 THEN RAISE EXCEPTION 'WAR_CHEST_V9_RAW_AUTHORITY_DRIFT'; END IF;
END $postflight$;
COMMIT;
