-- Source-pinned FINANCE / Founder Bonus two-hash index comparison.
-- Read ONLY: 25 previously observed candidate pairs (not certified payouts).
-- All PII and raw tx hashes remain server-side; output boolean evidence only.
-- Critical performance: do NOT materialize GROUP BY upper(tx_hash) over the
-- entire wolo_indexed_transfers table. Parameterize each lookup against the
-- existing btree index on tx_hash. No seq scan of the entire transfer index.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH base AS MATERIALIZED (
 SELECT id, source_founder_bonus_id AS bonus_id,
        normalized_player_name AS player_key,
        claimed_by_user_id AS user_id,
        amount_wolo::numeric AS amount, payout_tx_hash AS tx_hash,
        created_at,
        CASE WHEN created_at < TIMESTAMP '2026-07-04' THEN 0 ELSE 1 END AS cohort
 FROM pending_wolo_claims
 WHERE source_founder_bonus_id IS NOT NULL
   AND claim_kind='founders_bonus'
   AND status='claimed'
   AND normalized_player_name IS NOT NULL
   AND normalized_player_name<>''
   AND created_at<TIMESTAMP '2026-07-05'
),
ranked AS (
 SELECT *, ROW_NUMBER() OVER (
    PARTITION BY bonus_id,player_key,amount,cohort
    ORDER BY created_at,id
 ) AS seq
 FROM base
),
matched AS MATERIALIZED (
 SELECT o.id AS original_claim,j.id AS july_claim,o.user_id,o.amount,
        o.tx_hash AS old_hash,j.tx_hash AS july_hash,
        j.created_at AS july_created
 FROM ranked o JOIN ranked j
   ON j.bonus_id=o.bonus_id AND j.player_key=o.player_key
  AND j.amount=o.amount AND j.seq=o.seq AND j.cohort=1
 WHERE o.cohort=0 AND o.tx_hash ~* '^[0-9a-f]{64}$'
   AND j.tx_hash ~* '^[0-9a-f]{64}$'
   AND upper(o.tx_hash)<>upper(j.tx_hash)
),
qualified AS (
 SELECT m.*,
   oi.event_count AS original_events,
   ji.event_count AS july_events,
   oi.amount_uwolo AS original_uwolo,
   ji.amount_uwolo AS july_uwolo,
   oi.recipient AS original_recipient,
   ji.recipient AS july_recipient,
   oi.sender AS original_sender,
   ji.sender AS july_sender,
   oi.height AS original_height,
   ji.height AS july_height,
   ji.event_time AS july_event_time,
   u.wallet_address AS current_wallet
 FROM matched m
 -- These two parameterized LATERAL probes use the existing tx_hash
 -- btree index; their arguments change with each pair.
 CROSS JOIN LATERAL (
   SELECT COUNT(*) AS event_count,
          SUM(w.amount_uwolo::numeric) AS amount_uwolo,
          MIN(lower(w.recipient_address)) AS recipient,
          MIN(lower(w.sender_address)) AS sender,
          MIN(w.timestamp) AS event_time,
          MIN(w.height) AS height
   FROM wolo_indexed_transfers w
   WHERE w.tx_hash = ANY(ARRAY[m.old_hash,lower(m.old_hash),upper(m.old_hash)])
     AND w.chain_id='wolo-1' AND w.denom='uwolo'
 ) oi
 CROSS JOIN LATERAL (
   SELECT COUNT(*) AS event_count,
          SUM(w.amount_uwolo::numeric) AS amount_uwolo,
          MIN(lower(w.recipient_address)) AS recipient,
          MIN(lower(w.sender_address)) AS sender,
          MIN(w.timestamp) AS event_time,
          MIN(w.height) AS height
   FROM wolo_indexed_transfers w
   WHERE w.tx_hash = ANY(ARRAY[m.july_hash,lower(m.july_hash),upper(m.july_hash)])
     AND w.chain_id='wolo-1' AND w.denom='uwolo'
 ) ji
 LEFT JOIN users u ON u.id=m.user_id
 WHERE oi.event_count=1 AND ji.event_count=1
   AND oi.amount_uwolo=m.amount*1000000
   AND ji.amount_uwolo=m.amount*1000000
)
SELECT original_claim,july_claim,amount AS claim_wolo,
       original_recipient=july_recipient AS same_recipient,
       original_sender=july_sender AS same_sender,
       COALESCE(original_recipient=lower(current_wallet),false)
         AS original_matches_current_wallet,
       COALESCE(july_recipient=lower(current_wallet),false)
         AS july_matches_current_wallet,
       july_event_time<july_created AS july_event_before_record,
       july_height>original_height AS july_height_later,
       july_height<original_height AS july_height_earlier
FROM qualified
ORDER BY (original_recipient=july_recipient) DESC,
         (july_height<original_height) DESC,
         amount DESC,original_claim;
ROLLBACK;
