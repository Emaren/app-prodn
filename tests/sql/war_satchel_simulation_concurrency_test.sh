#!/usr/bin/env bash
# Synthetic-only race test against an isolated PostgreSQL 16 CI service.
# Never run against a live AoE2WAR database.
set -euo pipefail
umask 077
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

run_racer() {
  local label="$1" uuid="$2" name="simulation:race-1"
  psql -X -q -v ON_ERROR_STOP=1 >"$scratch/$label.log" 2>&1 <<SQL
BEGIN ISOLATION LEVEL READ COMMITTED;
INSERT INTO war_satchel_ledger_journals(id, source_key)
  VALUES ('$uuid', '$name');
INSERT INTO war_satchel_ledger_postings(journal_id,account_id,delta_uwolo)
  VALUES ('$uuid', 2, 300), ('$uuid', 3, -300);
-- Both sessions must reach COMMIT with overlapping uncommitted postings.
SELECT pg_sleep(3);
COMMIT;
SQL
}

run_racer a "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" &
pid_a=$!
run_racer b "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" &
pid_b=$!
rc_a=0
rc_b=0
wait "$pid_a" || rc_a=$?
wait "$pid_b" || rc_b=$?
echo "Race result exit codes: first=$rc_a second=$rc_b"
if ! { [[ "$rc_a" == "0" && "$rc_b" != "0" ]] || [[ "$rc_b" == "0" && "$rc_a" != "0" ]]; }; then
  echo "BLOCKED: overlapping double reservations did not result in exactly one winning transaction"
  exit 1
fi

stats="$(psql -X -At -v ON_ERROR_STOP=1 -c \
  "SELECT (SELECT count(*) FROM war_satchel_ledger_journals
            WHERE source_key LIKE 'simulation:race-%')::text || ':' ||
          COALESCE((SELECT sum(delta_uwolo)::text FROM war_satchel_ledger_postings WHERE account_id=2),'missing') || ':' ||
          COALESCE((SELECT sum(delta_uwolo)::text FROM war_satchel_ledger_postings WHERE account_id=3),'missing')")"
if [[ "$stats" != "1:-100:-900" ]]; then
  echo "BLOCKED: raced reservations left invalid ledger totals: $stats"
  exit 1
fi

# Refuse other transaction isolation levels rather than permitting an old
# repeatable-read snapshot to hide newly committed reservations.
rc_iso=0
psql -X -q -v ON_ERROR_STOP=1 >"$scratch/isolation.log" 2>&1 <<'SQL' || rc_iso=$?
BEGIN ISOLATION LEVEL REPEATABLE READ;
INSERT INTO war_satchel_ledger_journals(id, source_key)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'simulation:forbidden-snapshot');
INSERT INTO war_satchel_ledger_postings(journal_id,account_id,delta_uwolo)
  VALUES
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, 1),
    ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, -1);
COMMIT;
SQL
if [[ "$rc_iso" == "0" ]]; then
  echo "BLOCKED: repeatable-read ledger mutation was accepted"
  exit 1
fi
residual="$(psql -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM war_satchel_ledger_journals WHERE source_key='simulation:forbidden-snapshot'")"
[[ "$residual" == "0" ]] || { echo "BLOCKED: rejected transaction partially persisted"; exit 1; }
echo "SATCHEL_RACE_PASS: exactly one concurrent reservation, no overdraft, snapshot isolation refused"
