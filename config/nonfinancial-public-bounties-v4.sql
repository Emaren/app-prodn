-- R25 public Bounty Board presentation. Bounty sources stay private:
-- only visible public contracts, on-chain numbered bounty evidence, and
-- aggregate payout verification flags are accessible from the isolated web.
BEGIN;
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
                  AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR to_regclass('public.bounty_opportunities') IS NULL
    OR to_regclass('public.bounty_claims') IS NULL
    OR to_regclass('public.bounty_payouts') IS NULL
    OR to_regclass('public.wolo_indexed_transfers') IS NULL
 THEN RAISE EXCEPTION 'BOUNTY_PUBLIC_READ_MODEL_PREFLIGHT_HOLD'; END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS aoe2war_public_v4 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v4 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v4 TO aoe2war_web_prod;

-- Existing seed open contracts are public even before published_at is set.
-- Personal offers must carry an explicit publication timestamp.
CREATE OR REPLACE VIEW aoe2war_public_v4.bounty_display_opportunities
WITH (security_barrier=true) AS
SELECT o.id,o.slug,o.title,o.category,
 o.bounty_kind AS "bountyKind",o.assigned_user_id AS "assignedUserId",
 o.is_next_for_warrior AS "isNextForWarrior",
 o.description,o.eligibility,o.verification,
 o.action_label AS "actionLabel",o.action_href AS "actionHref",
 o.reward_wolo AS "rewardWolo",o.status,o.featured,o.priority,
 o.published_at AS "publishedAt",o.expires_at AS "expiresAt",
 o.created_at AS "createdAt",o.updated_at AS "updatedAt",
 CASE WHEN u.id IS NOT NULL THEN jsonb_build_object(
   'id',u.id,'uid',u.uid,'inGameName',u.in_game_name)
 ELSE NULL END AS "assignedUser"
FROM public.bounty_opportunities o
LEFT JOIN public.users u ON u.id=o.assigned_user_id
WHERE o.bounty_kind<>'personal' OR o.published_at IS NOT NULL;
REVOKE ALL ON aoe2war_public_v4.bounty_display_opportunities FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v4.bounty_display_opportunities TO aoe2war_web_prod;

-- Aggregate-only claim publication: never return individual claimant,
-- wallet, private payout keys, proof errors, status or raw evidence.
CREATE OR REPLACE VIEW aoe2war_public_v4.bounty_locked_claim_summary
WITH (security_barrier=true) AS
SELECT COUNT(*) FILTER (WHERE
 p.status IS DISTINCT FROM 'paid'
 OR NULLIF(BTRIM(p.tx_hash),'') IS NULL
)::bigint AS "lockedCount"
FROM public.bounty_claims c
LEFT JOIN public.bounty_payouts p ON p.claim_id=c.id
WHERE c.cancelled_at IS NULL;
REVOKE ALL ON aoe2war_public_v4.bounty_locked_claim_summary FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v4.bounty_locked_claim_summary TO aoe2war_web_prod;

-- Numbered memo transfers are public chain evidence, bounded to the frozen
-- two official issuer addresses. No general bank or wallet transaction scan.
CREATE OR REPLACE VIEW aoe2war_public_v4.bounty_numbered_transfers
WITH (security_barrier=true) AS
SELECT id,tx_hash AS "txHash",transfer_index AS "transferIndex",
       timestamp,sender_address AS "senderAddress",
       recipient_address AS "recipientAddress",
       amount_wolo_display AS "amountWoloDisplay",memo
FROM public.wolo_indexed_transfers
WHERE sender_address IN (
 'wolo1dmj5dnm7g9hmj005yzy5e5xcygudyt7wxzpxjq',
 'wolo1r8kvt7me33rsv9ldaczj03xjrld4yumx0c0jkg')
 AND memo ILIKE '%bounty%';
REVOKE ALL ON aoe2war_public_v4.bounty_numbered_transfers FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v4.bounty_numbered_transfers TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.bounty_claims','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bounty_payouts','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bounty_opportunities','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.wolo_indexed_transfers','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v4','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_BOUNTY_RAW_FINANCIAL_AUTHORITY_DRIFT'; END IF;
END
$postflight$;
COMMIT;
