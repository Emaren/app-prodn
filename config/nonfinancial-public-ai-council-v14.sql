-- Restricted A05 published AI council directory. Root-reviewed additive DDL.
-- Five display fields only; no prompts, tools, model credentials or traces.
BEGIN;
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
   OR (SELECT COUNT(*) FROM pg_catalog.pg_roles WHERE rolname='aoe2war_web_prod') <> 1
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='aoe2war_web_prod'
      AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb OR rolreplication))
   OR pg_catalog.to_regclass('public.ai_agents') IS NULL
   OR pg_catalog.to_regclass('public.ai_request_traces') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_AI_COUNCIL_PREFLIGHT_HOLD';
 END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS aoe2war_public_v2 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v2 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v2 TO aoe2war_web_prod;
CREATE OR REPLACE VIEW aoe2war_public_v2.ai_published_council
WITH (security_barrier=true) AS
SELECT a.slug,a.name,a.role,a.description,a.specialty
FROM public.ai_agents AS a
WHERE a.enabled IS TRUE AND a.public IS TRUE;
REVOKE ALL ON aoe2war_public_v2.ai_published_council FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v2.ai_published_council TO aoe2war_web_prod;
DO $postflight$
BEGIN
 IF pg_catalog.has_table_privilege('aoe2war_web_prod','public.ai_agents','SELECT')
   OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.ai_request_traces','SELECT')
   OR pg_catalog.has_schema_privilege('aoe2war_web_prod','aoe2war_public_v2','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_AI_COUNCIL_PRIVATE_AUTHORITY_DRIFT';
 END IF;
END
$postflight$;
COMMIT;
