-- A05 public page heroes: publish only explicitly active, public hero
-- media and bounded front-end playlist display configuration.
-- Private media uploads, unpublished drafts, owners, URLs outside of active
-- hero kind, and mutation authority are never published to web role.
BEGIN;
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='45s';
DO $preflight$
BEGIN
 IF current_user <> 'postgres'
 OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='aoe2war_web_prod'
      AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 OR to_regclass('public.hero_playlists') IS NULL
 OR to_regclass('public.hero_playlist_items') IS NULL
 OR to_regclass('public.hero_screens') IS NULL
 OR to_regclass('public.managed_media_assets') IS NULL
 THEN RAISE EXCEPTION 'PUBLIC_HERO_V11_PREFLIGHT_HOLD'; END IF;
END $preflight$;

CREATE SCHEMA IF NOT EXISTS aoe2war_public_v11 AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA aoe2war_public_v11 FROM PUBLIC;
GRANT USAGE ON SCHEMA aoe2war_public_v11 TO aoe2war_web_prod;

CREATE OR REPLACE VIEW aoe2war_public_v11.published_hero_playlists
WITH (security_barrier=true) AS
SELECT p.key,p.id,p.autoplay,
       p.default_duration_ms AS "defaultDurationMs",
       p.transition_duration_ms AS "transitionDurationMs",
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
            'id',i.id,
            'position',i.position,
            'enabled',true,
            'durationMs',i.duration_ms,
            'views',s.config->'views',
            'focalX',s.config->'focalX',
            'focalY',s.config->'focalY',
            'overlayOpacity',s.config->'overlayOpacity',
            'asset',jsonb_build_object(
               'id',a.id,'label',a.label,'url',a.url,
               'alt',COALESCE(a.alt,a.label),
               'active',true,
               'sizeBytes',a.size_bytes,
               'updatedAt',a.updated_at
            ))
            ORDER BY i.position,i.id)
         FROM public.hero_playlist_items i
         JOIN public.hero_screens s ON s.id=i.screen_id
         JOIN public.managed_media_assets a ON a.id=s.media_asset_id
         WHERE i.playlist_id=p.id
           AND i.enabled IS TRUE
           AND (i.starts_at IS NULL OR i.starts_at<=now())
           AND (i.ends_at IS NULL OR i.ends_at>now())
           AND s.status<>'archived'
           AND a.active IS TRUE AND a.kind='hero' AND a.target IS NULL
       ),'[]'::jsonb) AS items
FROM public.hero_playlists p
WHERE p.key LIKE 'page-hero-%';
REVOKE ALL ON aoe2war_public_v11.published_hero_playlists
 FROM PUBLIC,aoe2war_web_prod;
GRANT SELECT ON aoe2war_public_v11.published_hero_playlists TO aoe2war_web_prod;

DO $postflight$
BEGIN
 IF has_table_privilege('aoe2war_web_prod','public.hero_playlists','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.hero_playlist_items','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.hero_screens','SELECT')
 OR has_table_privilege('aoe2war_web_prod','public.managed_media_assets','SELECT')
 OR has_schema_privilege('aoe2war_web_prod','aoe2war_public_v11','CREATE')
 THEN RAISE EXCEPTION 'PUBLIC_HERO_V11_RAW_AUTHORITY_DRIFT'; END IF;
END $postflight$;
COMMIT;
