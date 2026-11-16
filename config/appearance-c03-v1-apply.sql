-- WE1/C03 Ember Appearance V1 — STAGE ONLY. NOT AN INSTALL PERMIT.
-- Production baseline: aoe2hd_db / aoe2war_web_prod, canonical main
-- d36e9f98e44b0a4de438c5cc623706873c333ca5.
-- Run only after independent C03 + B security review and an exact one-use
-- owner-signed permit. Requires local postgres superuser, fails on preimage drift.
-- Sidecar role is created NOLOGIN/PASSWORD NULL. A separate independent
-- activation must enable LOGIN and install its root-only SCRAM credential.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $admission$
DECLARE r text;
BEGIN
  IF current_database() <> 'aoe2hd_db' OR session_user <> 'postgres'
    OR NOT pg_catalog.pg_is_in_recovery() = false THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WRONG_DATABASE_OR_PRINCIPAL';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
             WHERE rolname = 'aoe2war_appearance_writer') THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WRITER_ALREADY_PRESENT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname = 'aoe2war_web_prod' AND rolcanlogin
      AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WEB_FENCE_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles p ON p.oid=m.member
    WHERE p.rolname='aoe2war_web_prod') THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WEB_ROLE_MEMBER';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%'
      AND n.nspname <> 'information_schema'
      AND c.relkind IN ('r','p','v','f')
      AND (pg_catalog.has_table_privilege(
             'aoe2war_web_prod', c.oid,
             'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
           OR pg_catalog.has_any_column_privilege(
             'aoe2war_web_prod', c.oid,
             'INSERT,UPDATE,REFERENCES'))) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WEB_DML_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='S'
      AND (pg_catalog.has_sequence_privilege('aoe2war_web_prod',c.oid,'USAGE')
        OR pg_catalog.has_sequence_privilege('aoe2war_web_prod',c.oid,'UPDATE'))) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WEB_SEQUENCE_DRIFT';
  END IF;
  FOREACH r IN ARRAY ARRAY[
    'site_theme_campaign','user_theme_campaign_overrides',
    'user_appearance_preferences','user_activity_events'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=r AND c.relkind='r'
        AND pg_catalog.pg_get_userbyid(c.relowner)='aoe2hd_user'
        AND NOT c.relrowsecurity
        AND NOT c.relforcerowsecurity
        AND NOT pg_catalog.has_any_column_privilege(
             'aoe2war_web_prod',c.oid,'SELECT')
        AND NOT pg_catalog.has_table_privilege(
             'aoe2war_web_prod',c.oid,'SELECT')) THEN
      RAISE EXCEPTION 'APPEARANCE_V1_TABLE_PREIMAGE_DRIFT: %',r;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_DEFAULT_ACL_DRIFT';
  END IF;
  IF pg_catalog.has_database_privilege(
       'aoe2war_web_prod',current_database(),'CREATE')
     OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
       WHERE n.nspname NOT LIKE 'pg_%'
         AND n.nspname <> 'information_schema'
         AND pg_catalog.has_schema_privilege(
           'aoe2war_web_prod',n.oid,'CREATE')) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_WEB_CREATE_DRIFT';
  END IF;
END $admission$;

-- Only a separate future owner-authenticated process may own this login.
-- NOLOGIN and PASSWORD NULL mean stage cannot open a writer connection.
CREATE ROLE aoe2war_appearance_writer
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS PASSWORD NULL;

-- Precisely reviewed presentation columns; no user, wallet, finance or
-- activity SELECT expansion to the website runtime.
GRANT SELECT (
  slot,campaign_key,label,enabled,theme_key,starts_at,ends_at,
  updated_by_user_id,created_at,updated_at
) ON TABLE public.site_theme_campaign TO aoe2war_web_prod;
GRANT SELECT (
  id,campaign_key,user_id,theme_key,created_at,updated_at
) ON TABLE public.user_theme_campaign_overrides TO aoe2war_web_prod;
GRANT SELECT (user_id,theme_key)
  ON TABLE public.user_appearance_preferences TO aoe2war_web_prod;

-- Dedicated NOLOGIN writer: no ownership, role membership, default grants,
-- finance tables, users_id_seq, full table UPDATE, or PUBLIC EXECUTE additions.
GRANT CONNECT ON DATABASE aoe2hd_db TO aoe2war_appearance_writer;
GRANT USAGE ON SCHEMA public TO aoe2war_appearance_writer;
GRANT SELECT (id,uid,is_admin)
  ON TABLE public.users TO aoe2war_appearance_writer;
GRANT SELECT (
  slot,campaign_key,label,enabled,theme_key,starts_at,ends_at,
  updated_by_user_id,created_at,updated_at
) ON TABLE public.site_theme_campaign TO aoe2war_appearance_writer;
GRANT UPDATE (
  campaign_key,label,enabled,theme_key,starts_at,ends_at,
  updated_by_user_id,updated_at
) ON TABLE public.site_theme_campaign TO aoe2war_appearance_writer;
GRANT SELECT (
  id,campaign_key,user_id,theme_key,created_at,updated_at
) ON TABLE public.user_theme_campaign_overrides TO aoe2war_appearance_writer;
GRANT INSERT (campaign_key,user_id,theme_key,created_at,updated_at)
  ON TABLE public.user_theme_campaign_overrides TO aoe2war_appearance_writer;
GRANT UPDATE (theme_key,updated_at)
  ON TABLE public.user_theme_campaign_overrides TO aoe2war_appearance_writer;
GRANT SELECT (id,user_id,type,path,label,created_at)
  ON TABLE public.user_activity_events TO aoe2war_appearance_writer;
GRANT INSERT (user_id,type,path,label,metadata,created_at)
  ON TABLE public.user_activity_events TO aoe2war_appearance_writer;
GRANT USAGE ON SEQUENCE public.user_theme_campaign_overrides_id_seq
  TO aoe2war_appearance_writer;
GRANT USAGE ON SEQUENCE public.user_activity_events_id_seq
  TO aoe2war_appearance_writer;

DO $postimage$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname='aoe2war_appearance_writer' AND NOT rolcanlogin
       AND NOT rolinherit AND NOT rolsuper AND NOT rolcreatedb
       AND NOT rolcreaterole AND NOT rolbypassrls)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
      JOIN pg_catalog.pg_roles r ON r.oid=m.member
      WHERE r.rolname IN ('aoe2war_web_prod','aoe2war_appearance_writer'))
    OR pg_catalog.has_any_column_privilege(
       'aoe2war_web_prod','public.site_theme_campaign','UPDATE,INSERT')
    OR pg_catalog.has_sequence_privilege(
       'aoe2war_web_prod','public.user_theme_campaign_overrides_id_seq','USAGE')
    OR pg_catalog.has_sequence_privilege(
       'aoe2war_web_prod','public.user_activity_events_id_seq','USAGE')
  THEN RAISE EXCEPTION 'APPEARANCE_V1_STAGE_POSTIMAGE_DRIFT'; END IF;
END $postimage$;
COMMIT;
