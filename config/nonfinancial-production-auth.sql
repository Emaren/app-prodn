-- Source-pinned production-auth admission, executed in the controller's one-use
-- PostgreSQL transaction. Roles must be newly created by that transaction.
-- This grants no runtime table writes, ownership, administrative flags or funds.
DO $admission$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aoe2war_auth_owner'
      AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'aoe2war_web_prod'
      AND rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole
      AND NOT rolinherit AND NOT rolreplication AND NOT rolbypassrls
  ) THEN
    RAISE EXCEPTION 'AUTH_ROLE_BOUNDARY_NOT_ADMITTED';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles r ON r.oid = m.member
    WHERE r.rolname IN ('aoe2war_auth_owner', 'aoe2war_web_prod')) THEN
    RAISE EXCEPTION 'AUTH_ROLE_MEMBERSHIP_NOT_EMPTY';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_attrdef d
    JOIN pg_catalog.pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = 'public.users'::pg_catalog.regclass AND a.attname = 'is_admin'
      AND pg_catalog.pg_get_expr(d.adbin, d.adrelid) = 'false') THEN
    RAISE EXCEPTION 'AUTH_ADMIN_DEFAULT_NOT_FALSE';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'aoe2war_auth_v1')
      AND pg_catalog.has_schema_privilege('aoe2war_web_prod', n.oid, 'USAGE')
      AND pg_catalog.has_function_privilege('aoe2war_web_prod', p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'AUTH_UNREVIEWED_DEFINER_AUTHORITY';
  END IF;
  IF pg_catalog.has_database_privilege('aoe2war_web_prod', pg_catalog.current_database(), 'CREATE')
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace n
      WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'
        AND pg_catalog.has_schema_privilege('aoe2war_web_prod', n.oid, 'CREATE')) THEN
    RAISE EXCEPTION 'AUTH_RUNTIME_SCHEMA_CREATE_AUTHORITY';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema' AND c.relkind IN ('r', 'p', 'v', 'f')
      AND (pg_catalog.has_table_privilege('aoe2war_web_prod', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES')
        OR pg_catalog.has_any_column_privilege('aoe2war_web_prod', c.oid, 'INSERT,UPDATE,REFERENCES'))) THEN
    RAISE EXCEPTION 'AUTH_RUNTIME_DIRECT_TABLE_WRITE_AUTHORITY';
  END IF;
END
$admission$;

CREATE SCHEMA aoe2war_auth_v1 AUTHORIZATION aoe2war_auth_owner;
REVOKE ALL ON SCHEMA aoe2war_auth_v1 FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO aoe2war_auth_owner;
GRANT USAGE ON SCHEMA aoe2war_auth_v1 TO aoe2war_web_prod;
-- Existing public game/player/tournament joins use this exact display-only
-- column set. No SELECT * or private email/token/wallet/administrator access.
GRANT USAGE ON SCHEMA public TO aoe2war_web_prod;
GRANT SELECT (id, uid, in_game_name, verified, lock_name, created_at, last_seen,
  steam_id, steam_persona_name, verification_level, verification_method, verified_at,
  preferred_language, twitch_stream_url, represented_country, represented_country_updated_at,
  gender_division, gender_division_updated_at) ON public.users TO aoe2war_web_prod;


GRANT SELECT (id, uid, email, steam_id, steam_persona_name, verification_level,
  verification_method, verified_at, in_game_name, last_seen, verified, lock_name,
  created_at, is_admin, can_review_own_replay_results, wallet_address,
  twitch_stream_url, represented_country, represented_country_updated_at,
  gender_division, gender_division_updated_at) ON public.users TO aoe2war_auth_owner;
GRANT INSERT (uid, steam_id, steam_persona_name, verification_level,
  verification_method, last_seen) ON public.users TO aoe2war_auth_owner;
GRANT UPDATE (email, steam_id, steam_persona_name, verification_level,
  verification_method, in_game_name, last_seen) ON public.users TO aoe2war_auth_owner;
GRANT USAGE ON SEQUENCE public.users_id_seq TO aoe2war_auth_owner;

CREATE TABLE aoe2war_auth_v1.steam_nonces (
  nonce_sha256 bytea PRIMARY KEY,
  accepted_at timestamp with time zone NOT NULL DEFAULT pg_catalog.clock_timestamp()
);
ALTER TABLE aoe2war_auth_v1.steam_nonces OWNER TO aoe2war_auth_owner;
REVOKE ALL ON aoe2war_auth_v1.steam_nonces FROM PUBLIC, aoe2war_web_prod;

CREATE FUNCTION aoe2war_auth_v1.complete_steam_login(
  p_steam_id text, p_session_uid text, p_new_uid text,
  p_persona_name text, p_response_nonce text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_uid text;
  v_linked_steam text;
  v_persona text;
  v_name text;
  v_nonce_at timestamp with time zone;
BEGIN
  IF session_user <> 'aoe2war_web_prod' THEN
    RAISE EXCEPTION 'AUTH_RUNTIME_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_steam_id IS NULL OR p_steam_id !~ '^[0-9]{17}$'
    OR p_new_uid IS NULL OR p_new_uid !~ '^u_[0-9a-f]{32}$'
    OR (p_session_uid IS NOT NULL AND (length(p_session_uid) < 1 OR length(p_session_uid) > 100))
    OR (p_persona_name IS NOT NULL AND length(p_persona_name) > 255)
    OR p_response_nonce IS NULL OR length(p_response_nonce) > 255
    OR p_response_nonce !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z[!-~]+$'
  THEN
    RAISE EXCEPTION 'AUTH_INPUT_NOT_ADMITTED' USING ERRCODE = '22023';
  END IF;
  v_nonce_at := substring(p_response_nonce FROM 1 FOR 20)::timestamp with time zone;
  IF v_nonce_at < clock_timestamp() - interval '5 minutes'
    OR v_nonce_at > clock_timestamp() + interval '30 seconds' THEN
    RAISE EXCEPTION 'AUTH_NONCE_EXPIRED_OR_FUTURE' USING ERRCODE = '22023';
  END IF;
  DELETE FROM aoe2war_auth_v1.steam_nonces
    WHERE accepted_at < clock_timestamp() - interval '10 minutes';
  INSERT INTO aoe2war_auth_v1.steam_nonces(nonce_sha256)
    VALUES (pg_catalog.sha256(pg_catalog.convert_to(p_response_nonce, 'UTF8')));

  -- Serialize the same proved Steam identity; a retry cannot create two users.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('aoe2war-auth:' || p_steam_id, 0));
  SELECT u.uid INTO v_uid FROM public.users u WHERE u.steam_id = p_steam_id FOR UPDATE;
  IF NOT FOUND AND p_session_uid IS NOT NULL THEN
    SELECT u.uid, u.steam_id INTO v_uid, v_linked_steam
      FROM public.users u WHERE u.uid = p_session_uid FOR UPDATE;
    IF NOT FOUND OR v_linked_steam IS NOT NULL THEN v_uid := NULL; END IF;
  END IF;
  v_persona := NULLIF(p_persona_name, '');
  IF v_uid IS NULL THEN
    v_uid := p_new_uid;
    -- is_admin, wallet, verified, review authority and all financial state
    -- use existing DB defaults; this owner has no permission to write them.
    INSERT INTO public.users(uid, steam_id, steam_persona_name,
      verification_level, verification_method, last_seen)
      VALUES (v_uid, p_steam_id, v_persona, 1, 'steam', clock_timestamp());
  ELSE
    UPDATE public.users SET steam_id = p_steam_id,
      steam_persona_name = COALESCE(v_persona, steam_persona_name),
      verification_level = GREATEST(COALESCE(verification_level, 0), 1),
      verification_method = CASE WHEN verification_method = 'watcher' THEN verification_method ELSE 'steam' END,
      last_seen = clock_timestamp() WHERE uid = v_uid;
  END IF;
  v_name := left(regexp_replace(trim(COALESCE(v_persona, '')), '\s+', ' ', 'g'), 64);
  IF length(v_name) >= 2 THEN
    BEGIN
      UPDATE public.users u SET in_game_name = v_name
        WHERE u.uid = v_uid AND u.in_game_name IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.users x WHERE x.in_game_name = v_name);
    EXCEPTION WHEN unique_violation THEN
      -- A concurrent public name claim must not invalidate Steam authentication.
      NULL;
    END;
  END IF;
  RETURN v_uid;
END
$function$;
ALTER FUNCTION aoe2war_auth_v1.complete_steam_login(text, text, text, text, text) OWNER TO aoe2war_auth_owner;
REVOKE ALL ON FUNCTION aoe2war_auth_v1.complete_steam_login(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aoe2war_auth_v1.complete_steam_login(text, text, text, text, text) TO aoe2war_web_prod;

CREATE FUNCTION aoe2war_auth_v1.touch_session(p_uid text, p_email text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE v_count integer;
BEGIN
  IF session_user <> 'aoe2war_web_prod' THEN
    RAISE EXCEPTION 'AUTH_RUNTIME_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_uid IS NULL OR length(p_uid) < 1 OR length(p_uid) > 100
    OR (p_email IS NOT NULL AND (length(p_email) < 1 OR length(p_email) > 100)) THEN
    RAISE EXCEPTION 'AUTH_INPUT_NOT_ADMITTED' USING ERRCODE = '22023';
  END IF;
  UPDATE public.users SET last_seen = clock_timestamp(), email = COALESCE(p_email, email)
    WHERE uid = p_uid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count = 1;
END
$function$;
ALTER FUNCTION aoe2war_auth_v1.touch_session(text, text) OWNER TO aoe2war_auth_owner;
REVOKE ALL ON FUNCTION aoe2war_auth_v1.touch_session(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aoe2war_auth_v1.touch_session(text, text) TO aoe2war_web_prod;

-- The web role cannot SELECT users (including token) directly. This projection
-- reads one signed-session UID supplied by the app, never a directory or a
-- financial ledger. A compromised runtime can invoke it for another known UID;
-- it still cannot extract tokens, balances, claims or change authorization.
CREATE FUNCTION aoe2war_auth_v1.read_user(p_uid text)
RETURNS TABLE (
  id integer, uid text, email text, "inGameName" text, verified boolean,
  "walletAddress" text, "twitchStreamUrl" text, "representedCountry" text,
  "representedCountryUpdatedAt" timestamp, "genderDivision" text,
  "genderDivisionUpdatedAt" timestamp, "lockName" boolean, "createdAt" timestamp,
  "lastSeen" timestamp, "isAdmin" boolean, "canReviewOwnReplayResults" boolean,
  "steamId" text, "steamPersonaName" text, "verificationLevel" integer,
  "verificationMethod" text, "verifiedAt" timestamp
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  IF session_user <> 'aoe2war_web_prod' THEN
    RAISE EXCEPTION 'AUTH_RUNTIME_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_uid IS NULL OR length(p_uid) < 1 OR length(p_uid) > 100 THEN
    RAISE EXCEPTION 'AUTH_INPUT_NOT_ADMITTED' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT u.id, u.uid::text, u.email::text, u.in_game_name::text,
    u.verified, u.wallet_address::text, u.twitch_stream_url::text,
    u.represented_country::text, u.represented_country_updated_at,
    u.gender_division::text, u.gender_division_updated_at, u.lock_name,
    u.created_at, u.last_seen, u.is_admin, u.can_review_own_replay_results,
    u.steam_id::text, u.steam_persona_name::text, u.verification_level,
    u.verification_method::text, u.verified_at
    FROM public.users u WHERE u.uid = p_uid LIMIT 1;
END
$function$;
ALTER FUNCTION aoe2war_auth_v1.read_user(text) OWNER TO aoe2war_auth_owner;
REVOKE ALL ON FUNCTION aoe2war_auth_v1.read_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION aoe2war_auth_v1.read_user(text) TO aoe2war_web_prod;

-- Public game, replay, tournament and community presentation only. Optional
-- historical tables are not created here. No default privileges or wildcard
-- grants: later tables require another source-reviewed admission.
DO $public_reads$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'game_stats', 'replay_result_adjudications', 'replay_player_snapshots',
    'replay_player_metrics', 'replay_game_metrics', 'replay_player_metric_aggregates',
    'replay_player_identity_projections', 'player_identity_aliases', 'warriors',
    'platform_accounts', 'platform_name_observations', 'warrior_platform_links',
    'tournaments', 'tournament_entries', 'tournament_matches',
    'chat_messages', 'chat_message_reactions', 'game_watch_streams',
    'game_watch_retained_demo', 'page_change_revisions', 'workshop_status',
    'workshop_entries', 'workshop_artifacts', 'workshop_streams'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table AND c.relkind IN ('r', 'p')) THEN
      EXECUTE pg_catalog.format('GRANT SELECT ON TABLE public.%I TO aoe2war_web_prod', v_table);
    END IF;
  END LOOP;
END
$public_reads$;
