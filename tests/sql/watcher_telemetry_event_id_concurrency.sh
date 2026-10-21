#!/usr/bin/env bash
set -euo pipefail
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
event_id="telemetry_fedcba9876543210fedcba9876543210"
sql="INSERT INTO watcher_client_events (event_type,telemetry_event_id) VALUES ('heartbeat','$event_id') ON CONFLICT (telemetry_event_id) DO NOTHING RETURNING id;"
psql -X -v ON_ERROR_STOP=1 -At -c "$sql" >"$tmp/first" &
first=$!
psql -X -v ON_ERROR_STOP=1 -At -c "$sql" >"$tmp/second" &
second=$!
wait "$first"
wait "$second"
rows="$(psql -X -v ON_ERROR_STOP=1 -At -c "SELECT COUNT(*) FROM watcher_client_events WHERE telemetry_event_id='$event_id'")"
echo "Watcher event-ID concurrent race: durable rows=$rows"
test "$rows" = "1"
# Across the two racing connections, exactly one insert acquired the ID.
# psql may print command tags (INSERT 0 N) as additional lines.
# Count only the numeric RETURNING id row from each connection.
returns="$(cat "$tmp/first" "$tmp/second" | awk '/^[0-9]+$/ {n++} END {print n+0}')"
echo "Watcher event-ID concurrent race: inserted returns=$returns"
test "$returns" -eq 1
