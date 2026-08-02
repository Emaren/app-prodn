-- The legacy trigger attached the default Emaren Twitch stream after every
-- game_stats UPDATE. Structural replay projection changes only parsed truth;
-- it must never manufacture a new live stream. Preserve attachment on row
-- creation and on an actual replay-session identity change only.
DROP TRIGGER IF EXISTS trg_attach_default_watch_stream ON game_stats;
DROP TRIGGER IF EXISTS trg_attach_default_watch_stream_identity_update ON game_stats;

CREATE TRIGGER trg_attach_default_watch_stream
AFTER INSERT ON game_stats
FOR EACH ROW
EXECUTE FUNCTION aoe2hdbets_attach_default_watch_stream();

CREATE TRIGGER trg_attach_default_watch_stream_identity_update
AFTER UPDATE OF original_filename, replay_file ON game_stats
FOR EACH ROW
WHEN (
  OLD.original_filename IS DISTINCT FROM NEW.original_filename
  OR OLD.replay_file IS DISTINCT FROM NEW.replay_file
)
EXECUTE FUNCTION aoe2hdbets_attach_default_watch_stream();
