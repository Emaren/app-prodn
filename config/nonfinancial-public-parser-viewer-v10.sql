-- A05 signed-in Game Stats Your Vault: public final replay memberships only.
-- Raw uploader UID, parse attempts, private file evidence, IP, detail and
-- credentials remain unavailable to aoe2war_web_prod.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR to_regclass('aoe2war_public_v7.parser_final_corpus') IS NULL
    OR to_regclass('public.replay_parse_attempts') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_VIEWER_V10_PREFLIGHT_HOLD'; END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v10 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v10 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v10 TO aoe2war_web_prod;

-- A user can appear as the canonical game_stats owner OR a linked
-- replay_parse_attempt uploader. Publish exactly the original OR linkage,
-- but hash the UID and require final public game rows. Never raw attempt IDs.
CREATE OR REPLACE VIEW aoe2war_public_v10.viewer_final_replay_memberships
WITH (security_barrier=true) AS
SELECT g.id AS "gameStatsId",
       encode(sha256(convert_to(g.user_uid,'UTF8')),'hex') AS "viewerUidSha256"
FROM public.game_stats g
WHERE g.is_final IS TRUE AND g.user_uid IS NOT NULL
UNION
SELECT g.id AS "gameStatsId",
       encode(sha256(convert_to(a.user_uid,'UTF8')),'hex') AS "viewerUidSha256"
FROM public.replay_parse_attempts a
JOIN public.game_stats g ON g.id=a.game_stats_id
WHERE g.is_final IS TRUE AND a.user_uid IS NOT NULL;

REVOKE ALL ON aoe2war_public_v10.viewer_final_replay_memberships
 FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v10.viewer_final_replay_memberships
 TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.replay_parse_attempts','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.users','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v10','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_VIEWER_V10_RAW_AUTHORITY_DRIFT'; END IF;
END $postflight$;
COMMIT;
