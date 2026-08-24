-- Canonical representation of the three production-proven partial
-- GameStats identity/recency indexes originally installed during the
-- August 11 incident response.
--
-- Production already contains these exact indexes. IF NOT EXISTS makes this
-- migration non-destructive there while ensuring clean/future databases
-- receive the same performance contract.

CREATE INDEX IF NOT EXISTS ix_gs_final_original_filename_recency
ON game_stats (
  original_filename,
  "timestamp" DESC,
  created_at DESC,
  id DESC
)
WHERE is_final = true
  AND parse_reason <> 'watcher_final_unparsed';

CREATE INDEX IF NOT EXISTS ix_gs_final_replay_file_recency
ON game_stats (
  replay_file,
  "timestamp" DESC,
  created_at DESC,
  id DESC
)
WHERE is_final = true
  AND parse_reason <> 'watcher_final_unparsed';

CREATE INDEX IF NOT EXISTS ix_gs_final_platform_match_recency
ON game_stats (
  (key_events #> '{platform_match_id}'::text[]),
  "timestamp" DESC,
  created_at DESC,
  id DESC
)
WHERE is_final = true
  AND parse_reason <> 'watcher_final_unparsed';
