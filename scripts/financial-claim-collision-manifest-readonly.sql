-- AOE2WAR FINANCE: CLAIM HASH COLLISION MANIFEST (NO AUTHORIZATION)
-- Pinned schema: app-prodn #838 1eeffc6b82e5d3b79b09fa493a19e74fe208acd5.
-- Execute ONLY with psql -X -A -F '|' -v ON_ERROR_STOP=1;
-- postgres PGOPTIONS default_transaction_read_only=on, statement_timeout=8000.
-- Print NO wallets, names, user IDs, full hashes, notes, or memo.
-- This statement DOES NOT prove a bank transfer or discharge any claim.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH claimed AS MATERIALIZED (
 SELECT id, UPPER(payout_tx_hash) AS h,
        amount_wolo::numeric AS amount,
        source_market_id, source_game_stats_id, claim_kind,
        claim_group_key, claimed_by_user_id, normalized_player_name,
        payout_attempted_at
 FROM pending_wolo_claims
 WHERE status='claimed' AND payout_tx_hash ~* '^[0-9a-f]{64}$'
),
collision AS (
 SELECT h, ARRAY_AGG(id ORDER BY id) AS ids,
        COUNT(*) AS claim_rows, SUM(amount) AS claimed_wolo,
        COUNT(DISTINCT source_market_id) AS market_count,
        COUNT(DISTINCT claim_kind) AS kind_count,
        COUNT(DISTINCT claim_group_key) AS group_key_count,
        COUNT(DISTINCT claimed_by_user_id) AS linked_user_count,
        COUNT(*) FILTER (WHERE claimed_by_user_id IS NULL) AS unlinked_rows,
        COUNT(DISTINCT normalized_player_name) AS player_key_count,
        COUNT(*) FILTER (WHERE source_game_stats_id IS NULL) AS missing_game_rows,
        COUNT(*) FILTER (WHERE payout_attempted_at IS NOT NULL) AS attempted_rows,
        COUNT(*) FILTER (WHERE claim_group_key = 'market') AS market_key_rows,
        COUNT(*) FILTER (WHERE claim_group_key LIKE 'founder:%') AS founder_key_rows,
        COUNT(*) FILTER (WHERE claim_group_key LIKE 'jims-rule:%') AS jims_rule_rows,
        COUNT(*) FILTER (WHERE claim_group_key LIKE 'integrity:%') AS integrity_rows
 FROM claimed GROUP BY h HAVING COUNT(*)>1
),
indexed AS (
 SELECT UPPER(tx_hash) AS h,
        COUNT(*) AS indexed_rows,
        COALESCE(SUM(amount_uwolo::numeric) FILTER (
          WHERE chain_id='wolo-1' AND denom='uwolo'),0) / 1000000
            AS indexed_mainnet_wolo,
        COUNT(*) FILTER (WHERE chain_id <> 'wolo-1' OR denom <> 'uwolo')
            AS foreign_or_other_denom_rows
 FROM wolo_indexed_transfers
 WHERE tx_hash ~* '^[0-9a-f]{64}$'
 GROUP BY UPPER(tx_hash)
),
joined AS (
 SELECT c.*, COALESCE(i.indexed_rows,0) AS indexed_rows,
        COALESCE(i.indexed_mainnet_wolo,0) AS indexed_mainnet_wolo,
        COALESCE(i.foreign_or_other_denom_rows,0) AS foreign_rows,
        CASE
         WHEN c.ids @> ARRAY[777,8082]::integer[] THEN '777/8082'
         WHEN c.ids @> ARRAY[782,8086]::integer[] THEN '782/8086'
         WHEN c.ids @> ARRAY[712,7001]::integer[] THEN '712/7001'
         WHEN c.ids @> ARRAY[2712,2760]::integer[] THEN '2712/2760'
         WHEN c.ids @> ARRAY[710,6866]::integer[] THEN '710/6866'
         ELSE '-' END AS priority_pair
 FROM collision c LEFT JOIN indexed i USING(h)
),
classified AS (
 SELECT j.*,
    CASE
      WHEN indexed_rows=0 THEN 'LOCAL_INDEX_MISSING'
      WHEN foreign_rows>0 THEN 'CHAIN_OR_DENOM_REVIEW'
      WHEN kind_count>1 THEN 'CROSS_KIND_REVIEW'
      WHEN market_count>1 THEN 'CROSS_MARKET_REVIEW'
      WHEN group_key_count>1 THEN 'CLAIM_GROUP_REVIEW'
      ELSE 'REUSED_HASH_REVIEW'
    END AS structural_class
 FROM joined j
)
SELECT ROW_NUMBER() OVER (
   ORDER BY CASE WHEN priority_pair <> '-' THEN 0
                 WHEN indexed_rows=0 THEN 1
                 ELSE 2 END,
            claimed_wolo-indexed_mainnet_wolo DESC, h
 ) AS row_no,
 priority_pair, structural_class,
 ARRAY_TO_STRING(ids,',') AS claim_ids,
 claim_rows, claimed_wolo, indexed_rows,
 indexed_mainnet_wolo,
 market_count, kind_count, group_key_count,
 linked_user_count, unlinked_rows, player_key_count,
 missing_game_rows, attempted_rows,
 market_key_rows, founder_key_rows, jims_rule_rows, integrity_rows,
 foreign_rows
FROM classified
ORDER BY row_no;
ROLLBACK;
