-- R25 nonfinancial public Radio projection; root-only exact-source DDL.
-- This is additive to the seven immutable aoe2war_public_v1 projections.
-- No raw Radio table SELECT, no arbitrary creator intake, no custody writes.
BEGIN;
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
   OR EXISTS (SELECT 1 FROM pg_catalog.pg_roles
       WHERE rolname='aoe2war_web_prod' AND
             (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
   OR (SELECT count(*) FROM pg_catalog.pg_roles WHERE rolname='aoe2war_web_prod') <> 1
   OR pg_catalog.to_regclass('public.radio_submissions') IS NULL
   OR pg_catalog.to_regclass('public.radio_station_state') IS NULL
   OR pg_catalog.to_regclass('public.radio_programs') IS NULL
   OR pg_catalog.to_regclass('public.radio_program_items') IS NULL
   OR pg_catalog.to_regclass('public.radio_assets') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_RADIO_PROJECTION_PREFLIGHT_HOLD';
 END IF;
END
$preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v2 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v2 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v2 TO aoe2war_web_prod;

CREATE OR REPLACE VIEW aoe2war_public_v2.radio_published_tracks
WITH (security_barrier=true) AS
SELECT public_id, artist_name, track_title, genre, featured, published_at,
       artwork_storage_key, artwork_media_type, audio_storage_key, audio_media_type
FROM public.radio_submissions
WHERE status='published' AND rights_accepted IS TRUE AND published_at IS NOT NULL;
REVOKE ALL ON aoe2war_public_v2.radio_published_tracks FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v2.radio_published_tracks TO aoe2war_web_prod;

-- Station playback uses one singleton. Unpublished/draft assets MUST NOT be
-- served under a live program. Explicit readiness flag lets app fail closed
-- rather than silently skipping a missing/unpublished program item.
CREATE OR REPLACE VIEW aoe2war_public_v2.radio_station_display
WITH (security_barrier=true) AS
SELECT s.state, s.started_at, s.stopped_at,
       p.id AS program_id, p.public_id AS program_public_id,
       p.name AS program_name, p.status AS program_status,
       i.id AS item_id, i.position AS item_position,
       i.transition AS item_transition, i.crossfade_ms AS item_crossfade_ms,
       a.public_id AS asset_public_id, a.title AS asset_title,
       a.credit AS asset_credit, a.kind AS asset_kind,
       a.duration_ms AS asset_duration_ms,
       (a.status='ready') AS asset_is_ready
FROM public.radio_station_state s
LEFT JOIN public.radio_programs p ON p.id=s.program_id
LEFT JOIN public.radio_program_items i ON i.program_id=p.id
LEFT JOIN public.radio_assets a ON a.id=i.asset_id
WHERE s.id=1;
REVOKE ALL ON aoe2war_public_v2.radio_station_display FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v2.radio_station_display TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF pg_catalog.has_table_privilege('aoe2war_web_prod','public.radio_submissions','SELECT')
   OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.radio_station_state','SELECT')
   OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.radio_programs','SELECT')
   OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.radio_program_items','SELECT')
   OR pg_catalog.has_table_privilege('aoe2war_web_prod','public.radio_assets','SELECT')
   OR pg_catalog.has_schema_privilege('aoe2war_web_prod','aoe2war_public_v2','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_RADIO_PRIVATE_AUTHORITY_DRIFT';
 END IF;
END
$postflight$;
COMMIT;
