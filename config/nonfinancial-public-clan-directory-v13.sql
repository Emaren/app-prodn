-- A06: exactly public, active clan directory; never exposes private chat,
-- membership identities, administrative roles, messages, or financial data.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '45s';

DO $preflight$
BEGIN
 IF current_user <> 'postgres'
 OR NOT EXISTS (
   SELECT 1 FROM pg_roles
   WHERE rolname='aoe2war_web_prod' AND rolcanlogin
   AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
 )
 OR to_regclass('public.clans') IS NULL
 OR to_regclass('public.clan_members') IS NULL
 OR has_table_privilege('aoe2war_web_prod','public.clans','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.clan_members','SELECT')
 THEN RAISE EXCEPTION 'PUBLIC_CLANS_V13_PREFLIGHT_HOLD'; END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v13 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v13 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v13 TO aoe2war_web_prod;

-- Active and public names only. No member UIDs, membership records,
-- roles, private hall posts, chat policy or internal administrative states.
CREATE OR REPLACE VIEW aoe2war_public_v13.active_clan_directory
WITH (security_barrier=true) AS
SELECT c.id, c.slug, c.name, c.tagline, c.description,
       c.crest_url AS "crestUrl",
       (SELECT count(*)::bigint
        FROM public.clan_members m
        WHERE m.clan_id=c.id AND m.status='active') AS "memberCount"
FROM public.clans c
WHERE c.status='active';
REVOKE ALL ON aoe2war_public_v13.active_clan_directory
 FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v13.active_clan_directory TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.clans','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.clan_members','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v13','CREATE')
 OR has_table_privilege('aoe2war_web_prod','aoe2war_public_v13.active_clan_directory','INSERT,UPDATE,DELETE')
 OR NOT has_table_privilege('aoe2war_web_prod','aoe2war_public_v13.active_clan_directory','SELECT')
 OR EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='aoe2war_public_v13' AND
   (c.relkind<>'v' OR c.reloptions<>ARRAY['security_barrier=true']
    OR pg_get_userbyid(c.relowner)<>'postgres')
 )
 THEN RAISE EXCEPTION 'PUBLIC_CLANS_V13_SCOPE_DRIFT'; END IF;
END $postflight$;
COMMIT;
