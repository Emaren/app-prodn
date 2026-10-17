#!/usr/bin/env bash
# Six immutable War Satchel migration files, one synthetic PG16 transaction.
# Never run against the VPS, a real wallet/user database, or as a release tool.
set -Eeuo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" ]] ||
   [[ "${CI:-}" != "true" ]] ||
   [[ "${PGHOST:-}" != "127.0.0.1" ]] ||
   [[ "${PGPORT:-}" != "5432" ]] ||
   [[ "${PGDATABASE:-}" != "satchel_atomic_ci" ]] ||
   [[ "${PGUSER:-}" != "satchel_ci" ]]; then
  echo "STOP: synthetic CI-only database identity not proven" >&2
  exit 79
fi

cd "$(dirname "$0")/../.."
psql=(psql -X -q -v ON_ERROR_STOP=1)

version="$("${psql[@]}" -Atqc "SHOW server_version_num")"
if [[ ! "$version" =~ ^16[0-9]{4}$ ]]; then
  echo "STOP: this rehearsal requires isolated PostgreSQL 16" >&2
  exit 80
fi

migration_files=(
  prisma/migrations/20261014_103500_war_satchel_noncrediting_foundation/migration.sql
  prisma/migrations/20261014_133000_war_satchel_wallet_owner_challenges/migration.sql
  prisma/migrations/20261014_150000_war_satchel_simulated_double_entry/migration.sql
  prisma/migrations/20261014_164500_war_satchel_simulation_concurrency_guard/migration.sql
  prisma/migrations/20261014_191500_war_satchel_simulation_single_owner/migration.sql
  prisma/migrations/20261015_151500_war_satchel_simulation_guard_correction/migration.sql
)
for file in "${migration_files[@]}"; do
  [[ -f "$file" && ! -L "$file" ]] || {
    echo "STOP: missing or symlinked migration file" >&2
    exit 81
  }
done

# Synthetic compatibility dependency only, never copied from production.
"${psql[@]}" -c 'CREATE TABLE users (id INTEGER PRIMARY KEY);'

# A successful six-migration transaction must expose all six tables and the
# final corrected function before rollback, then leave ZERO Satchel objects.
{
  printf 'BEGIN;\n'
  printf 'SET LOCAL lock_timeout = '\''5s'\'';\n'
  printf 'SET LOCAL statement_timeout = '\''30s'\'';\n'
  for file in "${migration_files[@]}"; do
    printf '\\i %s\n' "$file"
  done
  cat <<'SQL'
DO $verify$
DECLARE
  tables_found INTEGER;
  functions_found INTEGER;
  triggers_found INTEGER;
  body TEXT;
BEGIN
  SELECT count(*) INTO tables_found
    FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind IN ('r','p')
     AND c.relname IN (
       'war_satchel_deposit_intents',
       'war_satchel_proof_candidates',
       'war_satchel_wallet_challenges',
       'war_satchel_ledger_accounts',
       'war_satchel_ledger_journals',
       'war_satchel_ledger_postings'
     );
  IF tables_found <> 6 THEN
    RAISE EXCEPTION 'six migration tables not present within atomic rehearsal';
  END IF;

  SELECT count(*) INTO functions_found
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname LIKE 'war_satchel_%';
  IF functions_found < 6 THEN
    RAISE EXCEPTION 'expected Satchel functions absent within rehearsal';
  END IF;

  SELECT count(*) INTO triggers_found
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
   WHERE c.relname LIKE 'war_satchel_%' AND NOT t.tgisinternal;
  IF triggers_found < 6 THEN
    RAISE EXCEPTION 'expected Satchel triggers absent within rehearsal';
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO body
    FROM pg_proc p
   WHERE p.proname='war_satchel_assert_balanced_sandbox_journal';
  IF body IS NULL OR position('owner_count' IN body)=0
                  OR position('violating_accounts' IN body)=0 THEN
    RAISE EXCEPTION 'final simulation guard correction not installed';
  END IF;
END;
$verify$;
ROLLBACK;
SQL
} | "${psql[@]}"

# Zero objects means no partially installed synthetic Satchel schema.
assert_no_satchel_objects() {
  local found
  found="$("${psql[@]}" -Atqc "
    SELECT
      (SELECT count(*) FROM pg_class c
         JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname LIKE 'war\\_satchel\\_%' ESCAPE '\\') +
      (SELECT count(*) FROM pg_proc p
         JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname LIKE 'war\\_satchel\\_%' ESCAPE '\\') +
      (SELECT count(*) FROM pg_trigger
        WHERE tgname LIKE 'war\\_satchel\\_%' ESCAPE '\\');
  ")"
  [[ "$found" == "0" ]] || {
    echo "STOP: atomic rollback left $found Satchel objects" >&2
    exit 82
  }
}
assert_no_satchel_objects

# Prove an abrupt SQL failure halfway through the cohort also unwinds the
# PostgreSQL transaction, instead of leaving two applied migrations.
set +e
{
  printf 'BEGIN;\n'
  printf '\\i %s\n' "${migration_files[0]}"
  printf '\\i %s\n' "${migration_files[1]}"
  printf 'SELECT 1/0;\n'
} | "${psql[@]}" >/dev/null 2>&1
abort_status=$?
set -e
if [[ $abort_status -eq 0 ]]; then
  echo "STOP: forced mid-cohort SQL failure did not fail" >&2
  exit 83
fi
assert_no_satchel_objects

users_found="$("${psql[@]}" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users'")"
[[ "$users_found" == "1" ]] || {
  echo "STOP: synthetic baseline was not preserved" >&2
  exit 84
}
printf 'PASS: SIX SATCHEL MIGRATIONS ATOMIC + ROLLBACK + FORCED FAILURE\n'
printf 'scope=CI_SYNTHETIC_ONLY production_mutated=0 custody_authorized=0\n'
