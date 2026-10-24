-- Private one-shot founder canonical proof input. Never post output or hashes.
-- Only five approved priority pairs (ten original + July records).
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH pairs(a_id,b_id,expected_amount) AS (
 VALUES (411,2712,1000),(417,2760,1000),(435,2939,1000),
        (423,2827,100),(430,2881,1)
), claims AS (
 SELECT p.a_id,p.b_id,p.expected_amount,'old'::text AS role,c.*
 FROM pairs p JOIN pending_wolo_claims c ON c.id=p.a_id
 UNION ALL
 SELECT p.a_id,p.b_id,p.expected_amount,'july'::text AS role,c.*
 FROM pairs p JOIN pending_wolo_claims c ON c.id=p.b_id
)
SELECT row_to_json(e)::text FROM (
 SELECT c.a_id,c.b_id,c.expected_amount,c.role,c.id AS claim_id,
    c.status,c.claim_kind,c.source_founder_bonus_id AS parent_id,
    c.normalized_player_name AS player_key,c.claimed_by_user_id AS user_id,
    c.amount_wolo,c.payout_tx_hash AS tx_hash,c.created_at,
    x.event_count,x.events
 FROM claims c
 CROSS JOIN LATERAL (
   SELECT COUNT(*) AS event_count,
     COALESCE(json_agg(json_build_object(
       'transferIndex',w.transfer_index,'height',w.height::text,
       'timestamp',w.timestamp,'sender',lower(w.sender_address),
       'recipient',lower(w.recipient_address),
       'amountUwolo',w.amount_uwolo::text
     ) ORDER BY w.transfer_index) FILTER (WHERE w.tx_hash IS NOT NULL),
       '[]'::json) AS events
   FROM wolo_indexed_transfers w
   WHERE w.tx_hash = ANY(ARRAY[c.payout_tx_hash,lower(c.payout_tx_hash),upper(c.payout_tx_hash)])
     AND w.chain_id='wolo-1' AND w.denom='uwolo'
 ) x
 ORDER BY c.a_id,c.role DESC
) e;
ROLLBACK;
