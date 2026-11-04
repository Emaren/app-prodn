-- A05 public Game Stats observatory aggregate. Read-only, public display
-- metrics only. All raw parser, corpus, replay evidence, financial and
-- user-owned tables remain hidden behind this security-barrier view.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='75s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
       AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
    OR to_regclass('aoe2war_public_v7.parser_final_corpus') IS NULL
    OR to_regclass('public.replay_artifacts') IS NULL
    OR to_regclass('public.replay_parse_runs') IS NULL
    OR to_regclass('public.replay_observations') IS NULL
    OR to_regclass('public.replay_reprocess_jobs') IS NULL
    OR to_regclass('public.replay_reprocess_job_events') IS NULL
    OR to_regclass('public.replay_evidence_artifacts') IS NULL
    OR to_regclass('public.replay_player_snapshots') IS NULL
    OR to_regclass('public.replay_stat_projections') IS NULL
    OR to_regclass('public.identity_projection_publications') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_PARSER_V8_PREFLIGHT_HOLD'; END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v8 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v8 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v8 TO aoe2war_web_prod;

-- No SELECT of private parser raw metrics; only bounded classified scalar
-- fields are deliberately published. Details, worker identities, storage keys,
-- source corpus, user/wallet rows and mutable control decisions stay private.
CREATE OR REPLACE VIEW aoe2war_public_v8.parser_observatory_snapshot
WITH (security_barrier=true) AS
SELECT jsonb_build_object(
 'allGameRows',(SELECT count(*) FROM public.game_stats),
 'artifacts',jsonb_build_object(
    '_count',jsonb_build_object('_all',(SELECT count(*) FROM public.replay_artifacts)),
    '_sum',jsonb_build_object('byteSize',(SELECT COALESCE(sum(byte_size),0) FROM public.replay_artifacts))),
 'runStatus',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
        'status',status,'_count',jsonb_build_object('_all',n),
        '_sum',jsonb_build_object('actionCount',actions))
        ORDER BY status)
    FROM (SELECT status,count(*) AS n,COALESCE(sum(action_count),0) AS actions
          FROM public.replay_parse_runs GROUP BY status) r
 ),'[]'::jsonb),
 'parserVersions',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'parserName',parser_name,'parserVersion',parser_version,
      'passName',pass_name,'passVersion',pass_version,
      'schemaVersion',schema_version,'status',status,
      '_count',jsonb_build_object('_all',n),
      '_max',jsonb_build_object('completedAt',last_completed))
      ORDER BY last_completed DESC NULLS LAST)
    FROM (SELECT parser_name,parser_version,pass_name,pass_version,
       schema_version,status,count(*) AS n,max(completed_at) AS last_completed
       FROM public.replay_parse_runs
       GROUP BY parser_name,parser_version,pass_name,pass_version,schema_version,status
       ORDER BY max(completed_at) DESC NULLS LAST LIMIT 16) r
 ),'[]'::jsonb),
 'fieldCoverage',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'fieldPath',field_path,
      '_count',jsonb_build_object('_all',n,'confidenceBps',scored),
      '_min',jsonb_build_object('confidenceBps',low),
      '_max',jsonb_build_object('confidenceBps',high))
      ORDER BY n DESC)
    FROM (SELECT field_path,count(*) AS n,count(confidence_bps) AS scored,
      min(confidence_bps) AS low,max(confidence_bps) AS high
      FROM public.replay_observations GROUP BY field_path
      ORDER BY count(*) DESC LIMIT 80) r
 ),'[]'::jsonb),
 'observations',(SELECT count(*) FROM public.replay_observations),
 'jobs',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',j.id,'scopeKind',j.scope_kind,'maxArtifacts',j.max_artifacts,
      'parserName',j.parser_name,'parserVersion',j.parser_version,
      'passName',j.pass_name,'passVersion',j.pass_version,
      'candidateOnly',j.candidate_only,
      'affectsPublicAggregates',j.affects_public_aggregates,
      'createdAt',j.created_at,
      'events',CASE WHEN e.id IS NULL THEN '[]'::jsonb
         ELSE jsonb_build_array(jsonb_build_object(
           'eventType',e.event_type,'processedCount',e.processed_count,
           'succeededCount',e.succeeded_count,'failedCount',e.failed_count,
           'skippedCount',e.skipped_count,
           'detail',NULL,'createdAt',e.created_at)) END)
       ORDER BY j.created_at DESC,j.id DESC)
    FROM (SELECT * FROM public.replay_reprocess_jobs ORDER BY created_at DESC LIMIT 6) j
    LEFT JOIN LATERAL (SELECT id,event_type,processed_count,succeeded_count,
        failed_count,skipped_count,created_at
        FROM public.replay_reprocess_job_events
        WHERE job_id=j.id ORDER BY sequence DESC LIMIT 1) e ON TRUE
 ),'[]'::jsonb),
 'candidateFailures',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
       'failureSignature',failure_signature,
       '_count',jsonb_build_object('_all',n),
       '_max',jsonb_build_object('createdAt',last_created))
       ORDER BY n DESC)
    FROM (SELECT failure_signature,count(*) AS n,max(created_at) AS last_created
       FROM public.replay_parse_runs WHERE status='failed'
       GROUP BY failure_signature ORDER BY count(*) DESC LIMIT 16) r
 ),'[]'::jsonb),
 'latestArtifactRuns',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'artifactId',r.artifact_id,'status',r.status,
      'metrics',jsonb_build_object(
        'parse_mode',r.metrics->>'parse_mode',
        'artifact_disposition',r.metrics->>'artifact_disposition',
        'terminal_disposition',r.metrics->>'terminal_disposition',
        'operator_disposition',r.metrics->>'operator_disposition'),
      'failureSignature',r.failure_signature,
      'artifact',jsonb_build_object(
         'originalExtension',a.original_extension,'byteSize',a.byte_size))
       ORDER BY r.artifact_id)
    FROM (SELECT DISTINCT ON (artifact_id) artifact_id,status,metrics,failure_signature
         FROM public.replay_parse_runs
         ORDER BY artifact_id,created_at DESC,id DESC) r
    JOIN public.replay_artifacts a ON a.id=r.artifact_id
 ),'[]'::jsonb),
 'effectiveProjectionReceipts',(SELECT count(*) FROM public.replay_evidence_artifacts
     WHERE evidence_kind='effective_projection_receipt'),
 'acceptedIdentitySnapshots',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
         'displayName',s.display_name,'normalizedName',s.normalized_name,
         'steamId',s.steam_id) ORDER BY s.id)
    FROM public.replay_player_snapshots s
    JOIN public.replay_stat_projections p ON p.id=s.projection_id
    WHERE p.projection_status='accepted'
      AND p.affects_public_aggregates IS TRUE
      AND NOT EXISTS (SELECT 1 FROM public.replay_stat_projections successor
                       WHERE successor.supersedes_id=p.id)
 ),'[]'::jsonb),
 'identityFoundation',jsonb_build_object(
   'provisionalWarriors',(SELECT count(*) FROM public.warriors
      WHERE status='provisional' AND merged_into_warrior_id IS NULL),
   'replayBackedPlatformAccounts',(SELECT count(*) FROM public.platform_accounts
      WHERE created_from='replay_backfill_v2'),
   'profileOnlyPlatformAccounts',(SELECT count(*) FROM public.platform_accounts
      WHERE created_from='site_account_profile_v2'),
   'openProvisionalIdentities',(SELECT count(*) FROM public.provisional_identities WHERE status='open'),
   'proposedPlatformLinks',(SELECT count(*) FROM public.warrior_platform_links WHERE status='proposed'),
   'activePlatformLinks',(SELECT count(*) FROM public.warrior_platform_links WHERE status='active'),
   'proposedClaims',(SELECT count(*) FROM public.warrior_claims WHERE status='proposed'),
   'activeClaims',(SELECT count(*) FROM public.warrior_claims WHERE status='active'),
   'publications',(SELECT count(*) FROM public.identity_projection_publications))
) AS payload;

REVOKE ALL ON aoe2war_public_v8.parser_observatory_snapshot FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v8.parser_observatory_snapshot TO aoe2war_web_prod;
DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.replay_parse_runs','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.replay_artifacts','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.replay_observations','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.replay_reprocess_jobs','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.warrior_claims','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.replay_evidence_artifacts','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.bet_wagers','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v8','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_PARSER_V8_RAW_AUTHORITY_DRIFT'; END IF;
END $postflight$;
COMMIT;
