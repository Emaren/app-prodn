-- Public Champions ELO holders and Chaos activity from protected sources.
-- Authenticated website role gets projected read-only data, never raw tables,
-- API keys, private Watcher events, trophy wallets or payout authority.
BEGIN;
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
   OR NOT EXISTS (SELECT 1 FROM pg_roles
       WHERE rolname = 'aoe2war_web_prod'
         AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
   OR to_regclass('public.trophies') IS NULL
   OR to_regclass('public.users') IS NULL
   OR to_regclass('public.watcher_client_events') IS NULL
   OR to_regclass('public.api_keys') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_CHAMPIONS_READ_MODEL_PREFLIGHT_HOLD'; END IF;
END
$preflight$;
CREATE SCHEMA IF NOT EXISTS aoe2war_public_v6 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v6 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v6 TO aoe2war_web_prod;

-- Only public contender activity aggregates. Never publish Watcher event
-- payloads, key identifiers, key hashes or user contact fields.
CREATE OR REPLACE VIEW aoe2war_public_v6.champions_chaos_activity
WITH (security_barrier = true) AS
WITH watcher_activity AS (
 SELECT COALESCE(w.user_uid,u.uid) AS user_uid,
        COUNT(*)::bigint AS event_count,
        COUNT(DISTINCT COALESCE(NULLIF(w.replay_hash,''),NULLIF(w.replay_file,'')))::bigint AS streamed_games,
        MAX(w.created_at) AS last_watcher_at
 FROM public.watcher_client_events w
 LEFT JOIN public.users u ON u.id=w.user_id
 WHERE COALESCE(w.user_uid,u.uid) IS NOT NULL
 GROUP BY COALESCE(w.user_uid,u.uid)
), watcher_keys AS (
 SELECT u.uid AS user_uid, TRUE AS has_watcher_key
 FROM public.api_keys k JOIN public.users u ON u.id=k.user_id
 WHERE k.kind='watcher' AND k.revoked_at IS NULL
 GROUP BY u.uid
)
SELECT u.uid AS "userUid",
       COALESCE(a.event_count,0)::bigint AS "eventCount",
       COALESCE(a.streamed_games,0)::bigint AS "streamedGames",
       a.last_watcher_at AS "lastWatcherAt",
       COALESCE(k.has_watcher_key,FALSE) AS "hasWatcherKey"
FROM public.users u
LEFT JOIN watcher_activity a ON a.user_uid=u.uid
LEFT JOIN watcher_keys k ON k.user_uid=u.uid;
REVOKE ALL ON aoe2war_public_v6.champions_chaos_activity FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v6.champions_chaos_activity TO aoe2war_web_prod;

-- Current public ELO holder identity; neither wallet linkage nor private
-- championship configuration/evidence is exposed to the web role.
CREATE OR REPLACE VIEW aoe2war_public_v6.champions_elo_custody
WITH (security_barrier = true) AS
SELECT t.id,t.trophy_id AS "trophyId",t.display_name AS "displayName",
       t.tier,t.elo_band_min AS "eloBandMin",
       t.elo_band_max AS "eloBandMax",t.status,
       t.current_holder_display_name AS "currentHolderDisplayName",
       t.guardian_holder_display_name AS "guardianHolderDisplayName",
       t.updated_at AS "updatedAt",
       current_user_row.uid AS "currentUid",
       current_user_row.in_game_name AS "currentInGameName",
       current_user_row.steam_persona_name AS "currentSteamPersonaName",
       guardian_user_row.uid AS "guardianUid",
       guardian_user_row.in_game_name AS "guardianInGameName",
       guardian_user_row.steam_persona_name AS "guardianSteamPersonaName"
FROM public.trophies t
LEFT JOIN public.users current_user_row ON current_user_row.id=t.current_holder_user_id
LEFT JOIN public.users guardian_user_row ON guardian_user_row.id=t.guardian_holder_user_id
WHERE t.family='elo' AND t.status IN ('held','active','guardian_held');
REVOKE ALL ON aoe2war_public_v6.champions_elo_custody FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v6.champions_elo_custody TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.trophies','SELECT')
   OR has_table_privilege('aoe2war_web_prod','public.api_keys','SELECT')
   OR has_table_privilege('aoe2war_web_prod','public.watcher_client_events','SELECT')
   OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v6','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_CHAMPIONS_RAW_AUTHORITY_DRIFT'; END IF;
END
$postflight$;
COMMIT;
