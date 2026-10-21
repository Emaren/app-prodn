-- Disposable PostgreSQL 16 only. No users, replay tables or finance tables.
CREATE TABLE watcher_client_events (
 id BIGSERIAL PRIMARY KEY,
 created_at TIMESTAMP(6) NOT NULL DEFAULT NOW(),
 telemetry_event_id VARCHAR(64),
 user_id INTEGER,
 user_uid VARCHAR(100),
 event_type VARCHAR(40) NOT NULL,
 app_version VARCHAR(32),
 platform VARCHAR(24),
 artifact VARCHAR(40),
 watcher_id VARCHAR(80),
 session_id VARCHAR(80),
 replay_hash VARCHAR(64),
 replay_file VARCHAR(255),
 parse_source VARCHAR(40),
 parse_reason VARCHAR(80),
 ip_address VARCHAR(80),
 user_agent VARCHAR(512),
 metadata JSONB
);
CREATE UNIQUE INDEX uq_watcher_client_events_telemetry_event_id
 ON watcher_client_events (telemetry_event_id);
CREATE FUNCTION watcher_ci_delayed_failure() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.telemetry_event_id = 'telemetry_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee' THEN
  PERFORM pg_sleep(2.0);
  RAISE EXCEPTION 'WATCHER_CI_INJECTED_STORAGE_FAILURE';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER watcher_ci_delayed_failure
 BEFORE INSERT ON watcher_client_events
 FOR EACH ROW EXECUTE FUNCTION watcher_ci_delayed_failure();
