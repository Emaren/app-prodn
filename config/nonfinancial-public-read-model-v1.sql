-- AoE2WAR restricted web public read model v1.
-- Apply only as separately qualified DDL before promoting a build that uses
-- aoe2war_public_v1. Nothing here grants direct finance-table SELECT to the
-- public web role; it has no INSERT, UPDATE, DELETE or signer authority.
BEGIN;
DO $preflight$
BEGIN
  IF current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='aoe2war_web_prod' AND rolcanlogin
         AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
         AND NOT rolreplication AND NOT rolbypassrls)
    OR pg_catalog.to_regclass('public.user_badges') IS NULL
    OR pg_catalog.to_regclass('public.user_gifts') IS NULL
    OR pg_catalog.to_regclass('public.pending_wolo_claims') IS NULL
    OR pg_catalog.to_regclass('public.replay_stat_projections') IS NULL
  THEN
    RAISE EXCEPTION 'PUBLIC_READ_MODEL_PRODUCTION_PREREQUISITES_HOLD';
  END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v1 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v1 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v1 TO aoe2war_web_prod;

-- Only accepted, display-consented honors; raw notes and creator identity
-- remain private even if a hostile SQL client queries this view directly.
CREATE OR REPLACE VIEW aoe2war_public_v1.player_badges
WITH (security_barrier=true) AS
SELECT b.id,b.user_id,b.label,b.created_at,b.accepted_at,
       'accepted'::text AS status,true AS display_on_profile,
       NULL::text AS note
FROM public.user_badges AS b
WHERE b.status='accepted' AND b.display_on_profile IS TRUE;
REVOKE ALL ON aoe2war_public_v1.player_badges FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.player_badges TO aoe2war_web_prod;

CREATE OR REPLACE VIEW aoe2war_public_v1.player_gifts
WITH (security_barrier=true) AS
SELECT g.id,g.user_id,g.kind,g.amount,g.created_at,g.accepted_at,
       'accepted'::text AS status,true AS display_on_profile,
       NULL::text AS note
FROM public.user_gifts AS g
WHERE g.status='accepted' AND g.display_on_profile IS TRUE;
REVOKE ALL ON aoe2war_public_v1.player_gifts FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.player_gifts TO aoe2war_web_prod;

-- Pending WOLO gift presentation is opt-in only: private pending honors
-- must never leak even as anonymous-looking sums on a public player card.
-- This still projects only aggregate counts and amounts; no note, creator,
-- timestamps, wallet, payout identity or movement authority.
CREATE OR REPLACE VIEW aoe2war_public_v1.pending_player_gift_totals
WITH (security_barrier=true) AS
SELECT user_id,COUNT(*)::integer AS pending_count,
       COALESCE(SUM(amount),0)::bigint AS pending_amount
FROM public.user_gifts
WHERE kind='WOLO' AND status='pending' AND amount>0
  AND display_on_profile IS TRUE
GROUP BY user_id;
REVOKE ALL ON aoe2war_public_v1.pending_player_gift_totals FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.pending_player_gift_totals TO aoe2war_web_prod;

-- Public pending WOLO claims use name-based matching already visible in
-- directory/matchup pages. Only those six display-safe values are projected;
-- claimed wallet addresses, payout hashes, error state, private notes and
-- operational financial state are never accessible through this view.
CREATE OR REPLACE VIEW aoe2war_public_v1.pending_claim_names
WITH (security_barrier=true) AS
SELECT id,claimed_by_user_id,normalized_player_name,display_player_name,
       amount_wolo,created_at,updated_at
FROM public.pending_wolo_claims
WHERE status='pending' AND amount_wolo>0;
REVOKE ALL ON aoe2war_public_v1.pending_claim_names FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.pending_claim_names TO aoe2war_web_prod;

-- Generation tokens and accepted public player snapshots need projection
-- metadata, not replay uploads, source hashes, UID snapshots, or betting flags.
CREATE OR REPLACE VIEW aoe2war_public_v1.replay_projection_watermarks
WITH (security_barrier=true) AS
SELECT id,created_at FROM public.replay_stat_projections;
REVOKE ALL ON aoe2war_public_v1.replay_projection_watermarks FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.replay_projection_watermarks TO aoe2war_web_prod;

CREATE OR REPLACE VIEW aoe2war_public_v1.accepted_replay_projections
WITH (security_barrier=true) AS
SELECT p.id FROM public.replay_stat_projections AS p
WHERE p.projection_status='accepted' AND p.affects_public_aggregates IS TRUE
  AND NOT EXISTS (
    SELECT 1 FROM public.replay_stat_projections AS newer
    WHERE newer.supersedes_id=p.id
  );
REVOKE ALL ON aoe2war_public_v1.accepted_replay_projections FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.accepted_replay_projections TO aoe2war_web_prod;

-- Generation metadata: changes to accepted/pending visible community records
-- update player directory caches without exposing underlying private rows.
CREATE OR REPLACE VIEW aoe2war_public_v1.pending_claim_watermark
WITH (security_barrier=true) AS
SELECT COUNT(*)::bigint AS item_count,
       MAX(id) AS latest_id,MAX(created_at) AS latest_created_at
FROM aoe2war_public_v1.pending_claim_names;
REVOKE ALL ON aoe2war_public_v1.pending_claim_watermark FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v1.pending_claim_watermark TO aoe2war_web_prod;

-- Preserve original direct-table financial isolation.
DO $postflight$
BEGIN
 IF pg_catalog.has_table_privilege('aoe2war_web_prod','public.pending_wolo_claims','SELECT')
  OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.user_gifts','SELECT')
  OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.user_badges','SELECT')
  OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.replay_stat_projections','SELECT')
  OR pg_catalog.has_schema_privilege('aoe2war_web_prod','aoe2war_public_v1','CREATE')
 THEN
   RAISE EXCEPTION 'PUBLIC_READ_MODEL_PRIVATE_DIRECT_AUTHORITY_DRIFT';
 END IF;
END
$postflight$;
COMMIT;
