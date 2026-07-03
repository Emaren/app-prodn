INSERT INTO "hero_playlist_publications" (
  "playlist_id",
  "version",
  "snapshot",
  "published_by_uid",
  "published_at"
)
SELECT
  playlist."id",
  1,
  jsonb_build_object(
    'playlist',
    jsonb_build_object(
      'id', playlist."id",
      'key', playlist."key",
      'name', playlist."name",
      'autoplay', playlist."autoplay",
      'defaultDurationMs', playlist."default_duration_ms",
      'transitionDurationMs', playlist."transition_duration_ms",
      'transitionStyle', playlist."transition_style",
      'pauseOnHover', playlist."pause_on_hover",
      'showArrows', playlist."show_arrows",
      'showDots', playlist."show_dots",
      'showProgress', playlist."show_progress"
    ),
    'items',
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', item."id",
          'position', item."position",
          'enabled', item."enabled",
          'startsAt', item."starts_at",
          'endsAt', item."ends_at",
          'durationMs', item."duration_ms",
          'hrefOverride', COALESCE(item."href_override", ''),
          'screen',
          jsonb_build_object(
            'id', screen."id",
            'key', screen."key",
            'name', screen."name",
            'type', screen."type",
            'status', screen."status",
            'defaultHref', COALESCE(screen."default_href", ''),
            'ariaLabel', COALESCE(screen."aria_label", ''),
            'eventTileId', screen."event_tile_id",
            'forumThreadId', screen."forum_thread_id",
            'mediaAssetId', screen."media_asset_id",
            'config', COALESCE(screen."config", '{}'::jsonb),
            'createdAt', screen."created_at",
            'updatedAt', screen."updated_at"
          )
        )
        ORDER BY item."position", item."id"
      ) FILTER (WHERE item."id" IS NOT NULL),
      '[]'::jsonb
    )
  ),
  'system:bootstrap',
  CURRENT_TIMESTAMP
FROM "hero_playlists" playlist
LEFT JOIN "hero_playlist_items" item
  ON item."playlist_id" = playlist."id"
LEFT JOIN "hero_screens" screen
  ON screen."id" = item."screen_id"
WHERE playlist."key" = 'home-lobby-main-stage'
  AND NOT EXISTS (
    SELECT 1
    FROM "hero_playlist_publications" publication
    WHERE publication."playlist_id" = playlist."id"
  )
GROUP BY playlist."id";
