-- WE1/C03 Ember Appearance V1 — EXACT STAGED-ACL INVERSE (NO DATA DELETE).
-- Root owner only, independent one-use inverse permit required.
-- Aborts if role is LOGIN or connected: shut approved dedicated writer service
-- down FIRST; a live authentication path is never revoked blindly.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
DO $inverse_preimage$
DECLARE r text;
BEGIN
  IF current_database() <> 'aoe2hd_db' OR session_user <> 'postgres'
     OR pg_catalog.pg_is_in_recovery() THEN
    RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_WRONG_DATABASE_OR_ACTOR';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname='aoe2war_appearance_writer'
      AND NOT rolcanlogin AND NOT rolinherit
      AND NOT rolsuper AND NOT rolcreatedb
      AND NOT rolcreaterole AND NOT rolbypassrls) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_ROLE_NOT_STAGED_NOLOGIN';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_stat_activity
    WHERE usename='aoe2war_appearance_writer') THEN
    RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_LIVE_WRITER_CONNECTION';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid=m.member
    WHERE r.rolname IN ('aoe2war_web_prod','aoe2war_appearance_writer')
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid=m.roleid
    WHERE r.rolname='aoe2war_appearance_writer') THEN
    RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_ROLE_MEMBERSHIP_DRIFT';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'
      AND c.relkind IN ('r','p','v','f')
      AND (pg_catalog.has_table_privilege(
       'aoe2war_web_prod',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
       OR pg_catalog.has_any_column_privilege(
       'aoe2war_web_prod',c.oid,'INSERT,UPDATE,REFERENCES'))) THEN
    RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_WEB_WRITE_DRIFT';
  END IF;
  FOREACH r IN ARRAY ARRAY[
    'site_theme_campaign',
    'user_theme_campaign_overrides',
    'user_appearance_preferences'
  ] LOOP
    IF NOT pg_catalog.has_any_column_privilege(
      'aoe2war_web_prod',pg_catalog.to_regclass('public.'||r),'SELECT')
      OR pg_catalog.has_table_privilege(
      'aoe2war_web_prod',pg_catalog.to_regclass('public.'||r),'SELECT') THEN
      RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_READER_POSTIMAGE_DRIFT: %',r;
    END IF;
  END LOOP;
END $inverse_preimage$;

REVOKE SELECT (
  slot,campaign_key,label,enabled,theme_key,starts_at,ends_at,
  updated_by_user_id,created_at,updated_at
) ON TABLE public.site_theme_campaign FROM aoe2war_web_prod;
REVOKE SELECT (
  id,campaign_key,user_id,theme_key,created_at,updated_at
) ON TABLE public.user_theme_campaign_overrides FROM aoe2war_web_prod;
REVOKE SELECT (user_id,theme_key)
  ON TABLE public.user_appearance_preferences FROM aoe2war_web_prod;

REVOKE USAGE ON SEQUENCE public.user_activity_events_id_seq
  FROM aoe2war_appearance_writer;
REVOKE USAGE ON SEQUENCE public.user_theme_campaign_overrides_id_seq
  FROM aoe2war_appearance_writer;
REVOKE INSERT (user_id,type,path,label,metadata)
  ON TABLE public.user_activity_events FROM aoe2war_appearance_writer;
REVOKE SELECT (id,user_id,type,path,label,created_at)
  ON TABLE public.user_activity_events FROM aoe2war_appearance_writer;
REVOKE UPDATE (theme_key,updated_at)
  ON TABLE public.user_theme_campaign_overrides FROM aoe2war_appearance_writer;
REVOKE INSERT (campaign_key,user_id,theme_key)
  ON TABLE public.user_theme_campaign_overrides FROM aoe2war_appearance_writer;
REVOKE SELECT (
  id,campaign_key,user_id,theme_key,created_at,updated_at
) ON TABLE public.user_theme_campaign_overrides FROM aoe2war_appearance_writer;
REVOKE UPDATE (
  campaign_key,label,enabled,theme_key,starts_at,ends_at,
  updated_by_user_id,updated_at
) ON TABLE public.site_theme_campaign FROM aoe2war_appearance_writer;
REVOKE SELECT (
  slot,campaign_key,label,enabled,theme_key,starts_at,ends_at,
  updated_by_user_id,created_at,updated_at
) ON TABLE public.site_theme_campaign FROM aoe2war_appearance_writer;
REVOKE SELECT (id,uid,is_admin)
  ON TABLE public.users FROM aoe2war_appearance_writer;
REVOKE USAGE ON SCHEMA public FROM aoe2war_appearance_writer;
REVOKE CONNECT ON DATABASE aoe2hd_db FROM aoe2war_appearance_writer;

-- Any unexpected additional grant, membership, ownership, or session causes
-- DROP ROLE to fail and rolls this entire transaction back atomically.
DROP ROLE aoe2war_appearance_writer;

DO $inverse_postimage$
DECLARE r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles
     WHERE rolname='aoe2war_appearance_writer') THEN
    RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_WRITER_REMAINS';
  END IF;
  FOREACH r IN ARRAY ARRAY[
    'site_theme_campaign','user_theme_campaign_overrides',
    'user_appearance_preferences','user_activity_events'
  ] LOOP
    IF pg_catalog.has_any_column_privilege(
       'aoe2war_web_prod',pg_catalog.to_regclass('public.'||r),'SELECT')
      OR pg_catalog.has_table_privilege(
       'aoe2war_web_prod',pg_catalog.to_regclass('public.'||r),'SELECT')
    THEN
      RAISE EXCEPTION 'APPEARANCE_V1_INVERSE_READER_NOT_RESTORED: %',r;
    END IF;
  END LOOP;
END $inverse_postimage$;
COMMIT;
