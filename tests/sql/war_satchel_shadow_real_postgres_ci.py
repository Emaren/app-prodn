#!/usr/bin/env python3
"""Real PostgreSQL 16 E2E proof of the operator shadow-rehearsal implementation.

CI-only: invokes the unchanged operator module's *real* PostgreSQL subprocess
path with privilege escalation removed because the ephemeral CI DB owner is
already a disposable PostgreSQL superuser. No VPS, secrets, or production data.
"""
from __future__ import annotations

import importlib.util
import os
import pathlib
import subprocess
import sys
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts/aoe2_satchel_schema_shadow_rehearsal.py"
SPEC = importlib.util.spec_from_file_location("aoe2_shadow_operator_real_pg", MODULE_PATH)
assert SPEC and SPEC.loader
SHADOW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SHADOW)

DB = "satchel_shadow_ci"
EXPECTED_ENV = {
    "CI": "true",
    "GITHUB_ACTIONS": "true",
    "PGHOST": "127.0.0.1",
    "PGPORT": "5432",
    "PGUSER": "satchel_ci",
    "PGDATABASE": DB,
}

def refuse(message: str) -> None:
    raise SystemExit("STOP: " + message)

for key, value in EXPECTED_ENV.items():
    if os.environ.get(key) != value:
        refuse("wrong isolated GitHub Actions PostgreSQL environment")
if not os.environ.get("PGPASSWORD"):
    refuse("missing ephemeral CI database password")
if str(ROOT.resolve()) == "/var/www/AoE2HDBets/app-prodn":
    refuse("refusing to run in the production checkout")

def query(database: str, sql: str) -> str:
    if database not in (DB, "postgres") and not database.startswith(SHADOW.SHADOW_PREFIX):
        refuse("attempted SQL connection to unauthorized database")
    result = subprocess.run(
        ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
         "-d", database, "-c", sql],
        text=True, capture_output=True, check=False, timeout=25
    )
    if result.returncode != 0:
        refuse("ephemeral PostgreSQL SQL proof failed")
    return result.stdout.strip()

if query(DB, "SELECT current_database()") != DB:
    refuse("ephemeral database identity mismatch")
if not query(DB, "SHOW server_version_num").startswith("16"):
    refuse("ephemeral PostgreSQL server is not version 16")

# The table proves a database has actual data before the schema-only clone.
# No real user information is present; the sentinel row is synthetic.
query(DB, "CREATE TABLE users(id INTEGER PRIMARY KEY)")
query(DB, "CREATE TABLE bet_auto_presets(id INTEGER PRIMARY KEY)")
query(DB, "CREATE TABLE bet_auto_executions(id INTEGER PRIMARY KEY)")
query(DB, "CREATE TABLE pending_wolo_claims(id INTEGER PRIMARY KEY)")
query(DB, "INSERT INTO users(id) VALUES (7391)")
if query(DB, "SELECT count(*) FROM users") != "1":
    refuse("ephemeral source sentinel was not created")

def ci_postgres(*args: str, data: bytes | None = None, timeout: int = 90) -> bytes:
    # Bypass only the operator's sudo wrapper in this explicit CI-only context;
    # retain real psql and pg_dump subprocess execution, SQL, and error handling.
    return SHADOW.invoke(list(args), data=data, timeout=timeout)

def assert_no_shadow_databases() -> None:
    names = query(
        "postgres",
        "SELECT datname FROM pg_database "
        "WHERE datname LIKE 'aoe2war\\_satchel\\_shadow\\_%' ESCAPE '\\' "
        "ORDER BY datname",
    )
    if names:
        refuse("scratch PostgreSQL database left after rehearsal")

observed = []
original_apply = SHADOW.apply_to_shadow

def observed_apply(database: str, sql: bytes) -> None:
    original_apply(database, sql)
    observed.append("schema_restore" if len(observed) == 0 else "eight_file_rollback")
    if len(observed) == 1:
        # Inspect real restored shadow table before the Satchel SQL runs.
        # A schema-only export MUST NOT carry the synthetic source user row.
        if query(database, "SELECT count(*) FROM users") != "0":
            refuse("source data leaked into schema-only shadow database")

# Diagnostic diff is safe here: CI source contains only the literal synthetic
# users table and no real application data.
import difflib
original_schema_bytes = SHADOW.schema_bytes
captured_dumps = []
def record_schema_bytes(database: str) -> bytes:
    result = original_schema_bytes(database)
    captured_dumps.append(result)
    return result

with (
    mock.patch.object(SHADOW, "SOURCE_DATABASE", DB),
    mock.patch.object(SHADOW, "postgres", side_effect=ci_postgres),
    mock.patch.object(SHADOW, "apply_to_shadow", side_effect=observed_apply),
    mock.patch.object(SHADOW, "schema_bytes", side_effect=record_schema_bytes),
):
    try:
        result = SHADOW.rehearse()
    except SHADOW.RehearsalStop:
        if len(captured_dumps) >= 2:
            diff = difflib.unified_diff(
                captured_dumps[0].decode("utf-8").splitlines(),
                captured_dumps[1].decode("utf-8").splitlines(),
                fromfile="CI source-only dump", tofile="CI shadow-only dump",
                lineterm="",
            )
            for i, line in enumerate(diff):
                if i >= 100:
                    break
                print(line, flush=True)
        raise
    if result.get("status") != "PASS" or not result.get("disposable_database_removed"):
        refuse("rehearsal returned a non-certified result")
    if not result.get("pending_migrations_exercised"):
        refuse("eight migrations were not actually exercised")
    if result.get("pending_migration_count") != 8:
        refuse("incomplete pending funded migration cohort")
    if observed != ["schema_restore", "eight_file_rollback"]:
        refuse("real PostgreSQL work sequence was incomplete")
    assert_no_shadow_databases()

    # An actual SQL fault must still clean up the throwaway DB; no real
    # migration or rollback may run against the source database.
    with mock.patch.object(
        SHADOW, "cohort_sql", return_value=b"BEGIN;\nSELECT 1/0;\nROLLBACK;\n"
    ):
        try:
            SHADOW.rehearse()
        except SHADOW.RehearsalStop:
            pass
        else:
            refuse("injected SQL error unexpectedly passed")
    assert_no_shadow_databases()

if query(DB, "SELECT count(*) FROM users WHERE id = 7391") != "1":
    refuse("source database changed during shadow rehearsal")
if query(DB, "SELECT count(*) FROM pg_class WHERE relname LIKE 'war_satchel_%'") != "0":
    refuse("Satchel schema leaked into source synthetic database")

print("PASS: real PostgreSQL 16 schema-only shadow restore (zero copied rows)")
print("PASS: eight immutable migrations in rolled-back shadow transaction")
print("PASS: before/after schema SHA proof and disposable database cleanup")
print("PASS: forced SQL fault cleans up shadow and preserves source sentinel")
print("scope=CI_EPHEMERAL_ONLY production_mutated=0 custody_authorized=0")
