-- A05 Game Stats: source-owned public display-only final replay corpus.
-- Protect private user rows and adjudication evidence; never grant private
-- replays, credentials, claim, financial, or raw review tables to web role.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
    OR NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
        AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR to_regclass('public.game_stats') IS NULL
    OR to_regclass('public.replay_result_adjudications') IS NULL
    OR to_regclass('aoe2war_public_v5.user_profiles') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_PARSER_V7_PREFLIGHT_HOLD';
 END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v7 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v7 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v7 TO aoe2war_web_prod;

-- Public replay rows, plus profile labels and accepted adjudication fields
-- strictly needed to preserve the original winner/truth projection.
-- No reviewer evidence blob, raw parser snapshot, financial disposition,
-- actor user ID, market snapshot, wallet, payment, or contact fields.
CREATE OR REPLACE VIEW aoe2war_public_v7.parser_final_corpus
WITH (security_barrier=true) AS
SELECT
  g.id, g.is_final, g.user_uid AS "userUid", g.replay_file,
  g.original_filename, g.replay_hash AS "replayHash",
  g.game_type, g.game_version, g.map, g.winner, g.players,
  g.event_types, g.key_events, g.parse_source, g.parse_reason,
  g.disconnect_detected, g.played_on, g."timestamp",
  g.created_at AS "createdAt",
  CASE WHEN u.id IS NULL THEN NULL
    ELSE jsonb_build_object(
      'inGameName',u.in_game_name,
      'steamPersonaName',u.steam_persona_name)
  END AS "user",
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',a.id,
      'idempotencyKey',a.idempotency_key,
      'decisionStatus',a.decision_status,
      'affectsStats',a.affects_stats,
      'affectsBets',a.affects_bets,
      'actorDisplayNameSnapshot',a.actor_display_name_snapshot,
      'actorRole',a.actor_role,
      'teamAssignments',a.team_assignments,
      'winningTeamKey',a.winning_team_key,
      'winningPlayerKeys',a.winning_player_keys,
      'reason','Reviewed game result',
      'evidence',NULL,
      'sourceReplayHash',a.source_replay_hash,
      'sourceParseIteration',a.source_parse_iteration,
      'sourceRosterHash',a.source_roster_hash,
      'sourcePropositionHash',a.source_proposition_hash,
      'createdAt',a.created_at)
      ORDER BY a.created_at DESC,a.id DESC)
    FROM public.replay_result_adjudications a
    WHERE a.game_stats_id=g.id AND a.decision_status='accepted'
  ),'[]'::jsonb) AS "replayResultAdjudications"
FROM public.game_stats AS g
LEFT JOIN aoe2war_public_v5.user_profiles AS u ON u.uid=g.user_uid
WHERE g.is_final IS TRUE;

REVOKE ALL ON aoe2war_public_v7.parser_final_corpus
 FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v7.parser_final_corpus TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.users','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.replay_result_adjudications','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bet_wagers','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v7','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_PARSER_V7_RAW_AUTHORITY_DRIFT'; END IF;
END
$postflight$;
COMMIT;
