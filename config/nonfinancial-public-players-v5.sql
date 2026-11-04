-- R25 public player profiles and safe generation tokens. No raw user
-- credentials, contact, wallet or replay-adjudication source access.
BEGIN;
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
   OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
     AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
   OR to_regclass('public.users') IS NULL
   OR to_regclass('public.managed_media_assets') IS NULL
   OR to_regclass('public.replay_result_adjudications') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_PLAYER_READ_MODEL_PREFLIGHT_HOLD'; END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS aoe2war_public_v5 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v5 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v5 TO aoe2war_web_prod;

CREATE OR REPLACE VIEW aoe2war_public_v5.user_profiles
WITH (security_barrier=true) AS
SELECT id, uid, in_game_name, steam_persona_name, steam_id,
       represented_country, gender_division, verified, verification_level,
       verified_at, created_at
FROM public.users;
REVOKE ALL ON aoe2war_public_v5.user_profiles FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v5.user_profiles TO aoe2war_web_prod;

-- Only avatar delivery/refresh identity, not private media files or keys.
CREATE OR REPLACE VIEW aoe2war_public_v5.avatar_revisions
WITH (security_barrier=true) AS
SELECT id,kind,active,target,updated_at
FROM public.managed_media_assets
WHERE kind='avatar';
REVOKE ALL ON aoe2war_public_v5.avatar_revisions FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v5.avatar_revisions TO aoe2war_web_prod;

-- The fingerprint is derived from original user identity-generation fields
-- inside PostgreSQL; only an opaque digest is exposed to web consumers.
CREATE OR REPLACE VIEW aoe2war_public_v5.user_identity_fingerprint
WITH (security_barrier=true) AS
SELECT md5(
      COALESCE(
        jsonb_agg(
          jsonb_build_array(
            users.id,
            users.uid,
            users.in_game_name,
            users.steam_id,
            users.steam_persona_name,
            users.twitch_stream_url,
            users.verified,
            users.lock_name,
            users.verification_level,
            users.verification_method,
            users.verified_at,
            users.represented_country,
            users.represented_country_updated_at,
            users.gender_division,
            users.gender_division_updated_at
          ) ORDER BY users.id
        )::text,
        '[]'
      )
    ) AS fingerprint
    FROM public.users
;
REVOKE ALL ON aoe2war_public_v5.user_identity_fingerprint FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v5.user_identity_fingerprint TO aoe2war_web_prod;

CREATE OR REPLACE VIEW aoe2war_public_v5.replay_adjudication_watermark
WITH (security_barrier=true) AS
SELECT id,created_at FROM public.replay_result_adjudications;
REVOKE ALL ON aoe2war_public_v5.replay_adjudication_watermark FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v5.replay_adjudication_watermark TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.users','SELECT')
   OR has_table_privilege('aoe2war_web_prod','public.managed_media_assets','SELECT')
   OR has_table_privilege('aoe2war_web_prod','public.replay_result_adjudications','SELECT')
   OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v5','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_PLAYER_PRIVATE_SOURCE_AUTHORITY_DRIFT'; END IF;
END
$postflight$;
COMMIT;
