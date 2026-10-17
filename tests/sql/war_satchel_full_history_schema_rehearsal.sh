#!/usr/bin/env bash
# Replay all 112 historically applied HD migrations, then the six Satchel
# migrations in an atomic transaction on a disposable CI-only PostgreSQL 16.
# Never runs against production, copies production data, or enables custody.
set -Eeuo pipefail

if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ||
      "${PGHOST:-}" != "127.0.0.1" || "${PGPORT:-}" != "5432" ||
      "${PGUSER:-}" != "satchel_ci" ||
      "${PGDATABASE:-}" != "satchel_history_ci" ]]; then
  echo "STOP: exact disposable GitHub CI database identity required" >&2
  exit 70
fi
cd "$(dirname "$0")/../.."
PSQL=(psql -X -q -A -t -v ON_ERROR_STOP=1)
PG_DUMP=(pg_dump --schema-only --no-owner --no-acl)
db="$("${PSQL[@]}" -c "SELECT current_database()")"
ver="$("${PSQL[@]}" -c "SHOW server_version_num")"
if [[ "$db" != "satchel_history_ci" || ! "$ver" =~ ^16[0-9]{4}$ ]]; then
  echo "STOP: unexpected database/server identity" >&2
  exit 71
fi
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

python3 - "$scratch/history.list" "$scratch/cohort.list" <<'PY'
import hashlib
import pathlib
import re
import sys

root = pathlib.Path("prisma/migrations")
all_files = sorted(root.glob("*/migration.sql"), key=lambda p: p.parent.name)
six = (
    "20261014_103500_war_satchel_noncrediting_foundation",
    "20261014_133000_war_satchel_wallet_owner_challenges",
    "20261014_150000_war_satchel_simulated_double_entry",
    "20261014_164500_war_satchel_simulation_concurrency_guard",
    "20261014_191500_war_satchel_simulation_single_owner",
    "20261015_151500_war_satchel_simulation_guard_correction",
)
names = [p.parent.name for p in all_files]
if len(names) != 118 or len(set(names)) != 118:
    raise SystemExit("STOP: unexpected migration inventory; expected 118")
if [n for n in names if n in six] != list(six):
    raise SystemExit("STOP: exact Satchel cohort identity/order changed")
for p in all_files:
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", p.parent.name):
        raise SystemExit("STOP: unsafe migration name")
    if not p.is_file() or p.is_symlink() or p.parent.is_symlink():
        raise SystemExit("STOP: migration file missing or symlinked")
history = [p for p in all_files if p.parent.name not in six]
cohort = [p for p in all_files if p.parent.name in six]
if len(history) != 112 or len(cohort) != 6:
    raise SystemExit("STOP: not exactly 112 historical + 6 Satchel")
for path, files in ((sys.argv[1], history), (sys.argv[2], cohort)):
    pathlib.Path(path).write_text(
        "".join(p.as_posix() + "\n" for p in files), encoding="utf-8"
    )
digest = hashlib.sha256()
for p in all_files:
    digest.update(p.parent.name.encode() + b"\0")
    digest.update(hashlib.sha256(p.read_bytes()).digest())
print("SOURCE INVENTORY: 112 historical + 6 Satchel; SHA256 " + digest.hexdigest())
PY

# Reproduce independent historical DDL operations on disposable SQL state.
# No Prisma migration receipts are forged or production databases contacted.
count=0
while IFS= read -r file; do
  [[ "$file" == prisma/migrations/*/migration.sql ]] || exit 72
  if ! "${PSQL[@]}" -f "$file" > "$scratch/history.out" 2> "$scratch/history.err"; then
    echo "BLOCKED historical schema replay at entry $((count + 1)): $file" >&2
    # Do not print SQL stderr, which may reveal data literals.
    exit 73
  fi
  count=$((count + 1))
done < "$scratch/history.list"
[[ "$count" == "112" ]] || exit 74

"${PG_DUMP[@]}" -f "$scratch/before.sql"
before="$(sha256sum "$scratch/before.sql" | cut -d' ' -f1)"

# All six immutable migrations must work against replayed historical schema.
# Successful test still ROLLBACKs all six, guaranteeing no Satchel tables.
{
  printf "BEGIN;\nSET LOCAL statement_timeout = '30s';\nSET LOCAL lock_timeout = '5s';\n"
  while IFS= read -r file; do printf '\\i %s\n' "$file"; done < "$scratch/cohort.list"
  cat <<'SQL'
DO $verify$
DECLARE tables_found INT; functions_found INT; guard_text TEXT;
BEGIN
  SELECT count(*) INTO tables_found FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname LIKE 'war_satchel_%';
  IF tables_found <> 6 THEN
    RAISE EXCEPTION 'expected six Satchel tables';
  END IF;
  SELECT count(*) INTO functions_found FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'war_satchel_%';
  IF functions_found < 6 THEN
    RAISE EXCEPTION 'expected Satchel functions';
  END IF;
  SELECT pg_get_functiondef(oid) INTO guard_text FROM pg_proc
    WHERE proname='war_satchel_assert_balanced_sandbox_journal';
  IF guard_text IS NULL OR position('owner_count' IN guard_text)=0 THEN
    RAISE EXCEPTION 'final owner-count correction missing';
  END IF;
END;
$verify$;
ROLLBACK;
SQL
} | "${PSQL[@]}" > "$scratch/cohort.out" 2> "$scratch/cohort.err" || {
  echo "STOP: six-migration cohort incompatible with historical schema" >&2
  exit 75
}

"${PG_DUMP[@]}" -f "$scratch/after.sql"
after="$(sha256sum "$scratch/after.sql" | cut -d' ' -f1)"
if [[ "$before" != "$after" ]]; then
  echo "STOP: schema digest changed after migration rollback" >&2
  exit 76
fi
residue="$("${PSQL[@]}" -c "
  SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname LIKE 'war_satchel_%') +
    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname LIKE 'war_satchel_%');
")"
[[ "$residue" == "0" ]] || { echo "STOP: Satchel residue" >&2; exit 77; }
echo "PASS: all 112 historical migrations replayed, 6 Satchel migrations rehearsed"
echo "PASS: schema SHA256 unchanged after atomic rollback: $before"
echo "scope=isolated_synthetic_postgresql16 production_mutated=0 custody_authorized=0"
