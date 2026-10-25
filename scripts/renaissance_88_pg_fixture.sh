#!/usr/bin/env bash
# CI-only ephemeral PG. No inherited administrator URL, no production credentials.
set -euo pipefail
action="${1:-}"
: "${RUNNER_TEMP:?}"
: "${REN88_PG_ROOT:?}"
[[ "${RENAISSANCE_88_FIXTURE_ALLOWED:-}" == 1 ]] || { echo "HOLD fixture opt-in absent"; exit 2; }
[[ "$REN88_PG_ROOT" == "$RUNNER_TEMP"/renaissance88-* && ! -L "$REN88_PG_ROOT" ]] ||
  { echo "HOLD unsafe scratch directory"; exit 2; }
readonly READER_URL="postgresql://renaissance_reader:local_fixture_only@127.0.0.1:55437/renaissance88"
readonly OWNER_URL="postgresql://renaissance_owner@127.0.0.1:55437/renaissance88"
readonly BIN="${AOE2WAR_TEST_PG_BIN:-/usr/lib/postgresql/16/bin}"
readonly DATA="$REN88_PG_ROOT/cluster"
export PGCONNECT_TIMEOUT=3 PGOPTIONS="-c statement_timeout=15000"
case "$action" in
 start)
   [[ "${DATABASE_URL:-}" == "$READER_URL" ]] || { echo "HOLD incorrect fixture DATABASE_URL"; exit 2; }
   [[ ! -e "$DATA" ]] || { echo "HOLD fixture already exists"; exit 2; }
   for tool in initdb pg_ctl pg_isready pg_dump; do test -x "$BIN/$tool" || exit 2; done
   command -v psql >/dev/null && command -v createdb >/dev/null || exit 2
   if "$BIN/pg_isready" -h 127.0.0.1 -p 55437 -q; then echo "HOLD port in use"; exit 2; fi
   mkdir -p "$REN88_PG_ROOT";chmod 700 "$REN88_PG_ROOT"
   "$BIN/initdb" -D "$DATA" -U renaissance_owner --auth-local=trust --auth-host=trust \
     --no-instructions > "$REN88_PG_ROOT/initdb.log"
   "$BIN/pg_ctl" -D "$DATA" -l "$REN88_PG_ROOT/postgres.log" \
     -o "-c listen_addresses=127.0.0.1 -c port=55437 -c unix_socket_directories=$REN88_PG_ROOT" \
     -w start >/dev/null
   createdb -h 127.0.0.1 -p 55437 -U renaissance_owner renaissance88
   # Prisma schema push is isolated to the newly created scratch database.
   DATABASE_URL="$OWNER_URL" timeout -k 10s 8m npx prisma db push --accept-data-loss \
     > "$REN88_PG_ROOT/schema-push.log" 2>&1 || {
       echo "HOLD isolated schema initialization failed" >&2
       tail -n 55 "$REN88_PG_ROOT/schema-push.log" >&2
       exit 2
     }
   psql "$OWNER_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
INSERT INTO users(uid,in_game_name,verified,is_admin,created_at) VALUES
 ('fixture-scout','Fixture Scout',false,false,'2026-10-01T00:00:00Z'),
 ('fixture-archivist','Fixture Archivist',false,false,'2026-10-02T00:00:00Z');
CREATE ROLE renaissance_reader LOGIN PASSWORD 'local_fixture_only';
GRANT CONNECT ON DATABASE renaissance88 TO renaissance_reader;
GRANT USAGE ON SCHEMA public TO renaissance_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO renaissance_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO renaissance_reader;
ALTER ROLE renaissance_reader IN DATABASE renaissance88 SET default_transaction_read_only=on;
SQL
   [[ "$(psql "$READER_URL" -Atqc 'select count(*) from users')" == 2 ]] ||
     { echo "HOLD synthetic fixture seed missing"; exit 2; }
   if psql "$READER_URL" -v ON_ERROR_STOP=1 \
      -c "INSERT INTO users(uid) VALUES('must_not_write')" > "$REN88_PG_ROOT/read-only-probe.log" 2>&1; then
     echo "HOLD application role allows writes";exit 2
   fi
   echo "FIXTURE_ISOLATED=true READ_ONLY_ROLE=true SYNTHETIC_USERS=2"
   ;;
 snapshot|verify)
   [[ -d "$DATA" ]] || { echo "HOLD fixture cluster missing";exit 2; }
   "$BIN/pg_dump" --dbname="$OWNER_URL" --data-only --no-owner --no-privileges \
     --schema=public --inserts --column-inserts > "$REN88_PG_ROOT/current.sql"
   hash="$(sha256sum "$REN88_PG_ROOT/current.sql" | awk '{print $1}')"
   if [[ "$action" == snapshot ]]; then
     [[ ! -f "$REN88_PG_ROOT/before.sha256" ]] || { echo "HOLD duplicate snapshot";exit 2; }
     printf '%s\n' "$hash" > "$REN88_PG_ROOT/before.sha256"
     echo "BEFORE_DATA_SHA256=$hash"
   else
     [[ -f "$REN88_PG_ROOT/before.sha256" ]] || { echo "HOLD no baseline";exit 2; }
     before="$(cat "$REN88_PG_ROOT/before.sha256")"
     [[ "$before" == "$hash" ]] || { echo "HOLD fixture data mutated before=$before after=$hash";exit 1; }
     echo "POST_BROWSER_DATA_UNCHANGED=true SHA256=$hash"
   fi
   ;;
 stop)
   if [[ -d "$DATA" ]]; then "$BIN/pg_ctl" -D "$DATA" -m immediate -w stop >/dev/null 2>&1 || true;fi
   ;;
 *) echo "Usage: script start|snapshot|verify|stop";exit 2;;
esac
