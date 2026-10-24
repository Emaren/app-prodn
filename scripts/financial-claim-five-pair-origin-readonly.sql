-- Five-pair exact economic-origin fingerprint. Read-only. Pinned #838 schema.
-- Never prints names, wallets, user IDs, raw claim-group keys or transaction hashes.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH requested(a_id,b_id) AS (
 VALUES (777,8082),(782,8086),(712,7001),(2712,2760),(710,6866)
), pairs AS (
 SELECT p.a_id,p.b_id,a,b
 FROM requested p
 LEFT JOIN pending_wolo_claims a ON a.id=p.a_id
 LEFT JOIN pending_wolo_claims b ON b.id=p.b_id
), shaped AS (
 SELECT p.*,
   (p.a).claim_group_key AS key_a, (p.b).claim_group_key AS key_b,
   (p.a).source_market_id AS market_a, (p.b).source_market_id AS market_b,
   (p.a).claimed_by_user_id AS user_a, (p.b).claimed_by_user_id AS user_b
 FROM pairs p
)
SELECT q.a_id,q.b_id,
 (q.a).id IS NOT NULL AND (q.b).id IS NOT NULL AS both_present,
 (q.a).status AS status_a,(q.b).status AS status_b,
 (q.a).amount_wolo AS amount_a,(q.b).amount_wolo AS amount_b,
 (q.a).claim_kind AS kind_a,(q.b).claim_kind AS kind_b,
 (q.a).source_market_id AS market_a,(q.b).source_market_id AS market_b,
 (q.a).source_market_id IS NOT DISTINCT FROM (q.b).source_market_id AS same_market,
 (q.a).claimed_by_user_id IS NOT NULL AND (q.a).claimed_by_user_id=(q.b).claimed_by_user_id AS same_linked_user,
 (q.a).normalized_player_name=(q.b).normalized_player_name AS same_player_key,
 (q.a).claim_group_key=(q.b).claim_group_key AS same_group_key,
 (q.a).source_game_stats_id IS NOT DISTINCT FROM (q.b).source_game_stats_id AS same_game_source,
 (q.a).source_founder_bonus_id IS NOT DISTINCT FROM (q.b).source_founder_bonus_id AS same_founder_source,
 (q.a).target_scope IS NOT DISTINCT FROM (q.b).target_scope AS same_scope,
 CASE WHEN q.key_a='market' THEN 'market'
      WHEN q.key_a LIKE 'founder:%' THEN 'founder_family'
      WHEN q.key_a LIKE 'jims-rule:%' THEN 'jims_rule_family'
      WHEN q.key_a LIKE 'integrity:%' THEN 'integrity_family'
      WHEN q.key_a LIKE 'winner:%' THEN 'winner_family'
      ELSE 'other_family' END AS family_a,
 CASE WHEN q.key_b='market' THEN 'market'
      WHEN q.key_b LIKE 'founder:%' THEN 'founder_family'
      WHEN q.key_b LIKE 'jims-rule:%' THEN 'jims_rule_family'
      WHEN q.key_b LIKE 'integrity:%' THEN 'integrity_family'
      WHEN q.key_b LIKE 'winner:%' THEN 'winner_family'
      ELSE 'other_family' END AS family_b,
 (q.a).payout_attempted_at IS NOT NULL AS attempted_a,
 (q.b).payout_attempted_at IS NOT NULL AS attempted_b,
 (q.a).payout_tx_hash ~* '^[0-9a-f]{64}$' AND
   (q.b).payout_tx_hash ~* '^[0-9a-f]{64}$' AND
   upper((q.a).payout_tx_hash)=upper((q.b).payout_tx_hash) AS same_shaped_hash,
 wa.wager_rows AS market_a_user_wager_rows,
 wa.payout_sum AS market_a_wager_payout_wolo,
 wa.wager_hash_uses AS market_a_wager_hash_uses,
 wb.wager_rows AS market_b_user_wager_rows,
 wb.payout_sum AS market_b_wager_payout_wolo,
 wb.wager_hash_uses AS market_b_wager_hash_uses
FROM shaped q
CROSS JOIN LATERAL (
 SELECT COUNT(*) AS wager_rows,
        COALESCE(SUM(w.payout_wolo::numeric),0) AS payout_sum,
        COUNT(*) FILTER (WHERE (q.a).payout_tx_hash IS NOT NULL AND
           upper(w.payout_tx_hash)=upper((q.a).payout_tx_hash)) AS wager_hash_uses
 FROM bet_wagers w
 WHERE w.market_id=q.market_a AND w.user_id=q.user_a
) wa
CROSS JOIN LATERAL (
 SELECT COUNT(*) AS wager_rows,
        COALESCE(SUM(w.payout_wolo::numeric),0) AS payout_sum,
        COUNT(*) FILTER (WHERE (q.b).payout_tx_hash IS NOT NULL AND
           upper(w.payout_tx_hash)=upper((q.b).payout_tx_hash)) AS wager_hash_uses
 FROM bet_wagers w
 WHERE w.market_id=q.market_b AND w.user_id=q.user_b
) wb
ORDER BY q.a_id;
ROLLBACK;
