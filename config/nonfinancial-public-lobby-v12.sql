-- A05 v12: publish-only header and ticker snapshots for the isolated web.
-- NO raw public table SELECT, no private chat reaction identity, no finance.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';

DO $preflight$
BEGIN
  IF current_user <> 'postgres'
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
       AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
       AND NOT rolcreatedb AND NOT rolcreaterole
    )
    OR to_regclass('public.live_ticker_messages') IS NULL
    OR to_regclass('public.community_requests') IS NULL
    OR to_regclass('public.workshop_status') IS NULL
    OR to_regclass('public.workshop_streams') IS NULL
    OR has_table_privilege('aoe2war_web_prod','public.live_ticker_messages','SELECT')
    OR has_table_privilege('aoe2war_web_prod','public.community_requests','SELECT')
    OR has_table_privilege('aoe2war_web_prod','public.workshop_status','SELECT')
    OR has_table_privilege('aoe2war_web_prod','public.workshop_streams','SELECT')
  THEN RAISE EXCEPTION 'PUBLIC_LOBBY_V12_PREFLIGHT_HOLD'; END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v12 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v12 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v12 TO aoe2war_web_prod;

-- Only explicitly enabled and nonexpired admin-public announcements.
-- Never expose disabled messages or any creator/administrator identity.
CREATE OR REPLACE VIEW aoe2war_public_v12.published_ticker
WITH (security_barrier=true) AS
SELECT id, text, priority, expires_at AS "expiresAt",
       created_at AS "createdAt"
FROM public.live_ticker_messages
WHERE enabled IS TRUE AND (expires_at IS NULL OR expires_at > now());
REVOKE ALL ON aoe2war_public_v12.published_ticker
 FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v12.published_ticker TO aoe2war_web_prod;

-- Two summary values only: no request bodies, workshop private URLs,
-- stream authors, admin configuration, or private watch metadata.
CREATE OR REPLACE VIEW aoe2war_public_v12.header_counts
WITH (security_barrier=true) AS
SELECT
 (SELECT count(*)::bigint
  FROM public.community_requests WHERE status='open') AS "openRequestCount",
 (EXISTS (SELECT 1 FROM public.workshop_status
          WHERE id=1 AND is_live IS TRUE)
  OR EXISTS (SELECT 1 FROM public.workshop_streams
             WHERE status='live' AND is_public IS TRUE)) AS "workshopLive";
REVOKE ALL ON aoe2war_public_v12.header_counts
 FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v12.header_counts TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.live_ticker_messages','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.community_requests','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.workshop_status','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.workshop_streams','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v12','CREATE')
 OR has_table_privilege('aoe2war_web_prod','aoe2war_public_v12.published_ticker','INSERT,UPDATE,DELETE')
 OR has_table_privilege('aoe2war_web_prod','aoe2war_public_v12.header_counts','INSERT,UPDATE,DELETE')
 OR EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
    WHERE n.nspname='aoe2war_public_v12'
      AND (c.relkind<>'v' OR c.reloptions<>ARRAY['security_barrier=true']
           OR pg_get_userbyid(c.relowner)<>'postgres')
 )
 THEN RAISE EXCEPTION 'PUBLIC_LOBBY_V12_SCOPE_DRIFT'; END IF;
END $postflight$;
COMMIT;
