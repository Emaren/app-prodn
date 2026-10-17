#!/usr/bin/env python3
"""Operator-controlled, schema-only HD War Satchel PostgreSQL rehearsal.

Default --check only READS production catalog and verifies tracked source.
Explicit --rehearse --authorize-shadow-database creates/drops ONE randomly
named disposable database on the same PostgreSQL cluster. It never changes
the production database and never transfers table rows or credentials.
"""
from __future__ import annotations

import argparse
import hashlib
import re
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DATABASE = "aoe2hd_db"
SOURCE_PORT = "5432"
SOURCE_DATA_DIR = "/var/lib/postgresql/16/main"
SHADOW_PREFIX = "aoe2war_satchel_shadow_"
EXPECTED_FINISHED = 112
EXPECTED_ROLLED_BACK = 2
SATCHEL = (
    "20261014_103500_war_satchel_noncrediting_foundation",
    "20261014_133000_war_satchel_wallet_owner_challenges",
    "20261014_150000_war_satchel_simulated_double_entry",
    "20261014_164500_war_satchel_simulation_concurrency_guard",
    "20261014_191500_war_satchel_simulation_single_owner",
    "20261015_151500_war_satchel_simulation_guard_correction",
)
SHA = re.compile(r"^[0-9a-f]{40}$")
HEX_SHA256 = re.compile(r"^[0-9a-f]{64}$")
SAFE_NAME = re.compile(r"^[a-z0-9_]{1,63}$")


class RehearsalStop(RuntimeError):
    pass


def invoke(args: list[str], *, data: bytes | None = None, timeout: int = 90) -> bytes:
    """Never expose command stderr: SQL DDL and local auth are private."""
    try:
        response = subprocess.run(
            args, input=data, capture_output=True, timeout=timeout, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RehearsalStop("controlled PostgreSQL command was unavailable") from exc
    if response.returncode != 0:
        raise RehearsalStop("controlled PostgreSQL command failed (details withheld)")
    return response.stdout


def postgres(*args: str, data: bytes | None = None, timeout: int = 90) -> bytes:
    return invoke(
        ["sudo", "-n", "-u", "postgres", *args], data=data, timeout=timeout
    )


def psql(database: str, sql: str) -> str:
    if not SAFE_NAME.fullmatch(database):
        raise RehearsalStop("unsafe PostgreSQL database name")
    raw = postgres(
        "psql", "-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1",
        "-d", database, "-c", sql, timeout=30,
    )
    return raw.decode("utf-8", "strict").strip()


def source_evidence(expected_sha: str) -> dict[str, str]:
    if not SHA.fullmatch(expected_sha):
        raise RehearsalStop("expected source SHA must be exactly 40 lowercase hex")
    head = invoke(["git", "-C", str(ROOT), "rev-parse", "HEAD"]).decode().strip()
    if head != expected_sha:
        raise RehearsalStop("source HEAD does not match expected release SHA")
    if invoke(["git", "-C", str(ROOT), "status", "--porcelain"]).strip():
        raise RehearsalStop("candidate source worktree is not clean")
    folder = ROOT / "prisma" / "migrations"
    sql_files = sorted(folder.glob("*/migration.sql"))
    names = [p.parent.name for p in sql_files]
    if len(names) != 118 or len(set(names)) != 118:
        raise RehearsalStop("source migration inventory is not 118 unique files")
    if [name for name in names if name in SATCHEL] != list(SATCHEL):
        raise RehearsalStop("exact Satchel migration identity/order changed")
    if any(
        not re.fullmatch(r"[a-zA-Z0-9_.-]+", p.parent.name)
        or p.is_symlink()
        or p.parent.is_symlink()
        or not p.is_file()
        for p in sql_files
    ):
        raise RehearsalStop("unsafe or unavailable migration SQL file")
    return {p.parent.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sql_files}


def production_frontier(sources: dict[str, str]) -> dict:
    identity = psql(
        SOURCE_DATABASE,
        "BEGIN READ ONLY; SET LOCAL statement_timeout='8s'; "
        "SELECT current_database(),current_setting('port'),"
        "current_setting('data_directory'),current_setting('server_version_num'); "
        "COMMIT;",
    ).splitlines()
    if len(identity) != 1:
        raise RehearsalStop("production PostgreSQL identity not unique")
    values = identity[0].split("|")
    if (
        len(values) != 4
        or values[0] != SOURCE_DATABASE
        or values[1] != SOURCE_PORT
        or values[2] != SOURCE_DATA_DIR
        or not re.fullmatch(r"16[0-9]{4}", values[3])
    ):
        raise RehearsalStop("unexpected production PostgreSQL cluster identity")

    raw = psql(
        SOURCE_DATABASE,
        "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; "
        "SET LOCAL statement_timeout='8s'; "
        "SELECT migration_name,checksum,"
        "CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'A' "
        "WHEN rolled_back_at IS NOT NULL THEN 'R' ELSE 'U' END "
        'FROM "_prisma_migrations" ORDER BY migration_name,started_at; '
        "COMMIT;",
    )
    completed: dict[str, str] = {}
    rolled_back = 0
    for row in raw.splitlines():
        cells = row.split("|")
        if len(cells) != 3:
            raise RehearsalStop("unexpected Prisma migration record")
        name, checksum, state = cells
        if not HEX_SHA256.fullmatch(checksum):
            raise RehearsalStop("invalid Prisma migration checksum")
        if state == "R":
            rolled_back += 1
        elif state == "A":
            if name in completed:
                raise RehearsalStop("duplicate successful migration")
            completed[name] = checksum
        else:
            raise RehearsalStop("unfinished or unknown Prisma migration state")
    pending = set(sources) - set(completed)
    if (
        len(completed) != EXPECTED_FINISHED
        or rolled_back != EXPECTED_ROLLED_BACK
        or set(completed) - set(sources)
        or any(sources[name] != checksum for name, checksum in completed.items())
        or pending != set(SATCHEL)
    ):
        raise RehearsalStop("production Prisma history or checksum frontier drift")

    satchel_objects = psql(
        SOURCE_DATABASE,
        "BEGIN READ ONLY; "
        "SELECT (SELECT count(*) FROM pg_class c JOIN pg_namespace n "
        "ON n.oid=c.relnamespace WHERE n.nspname='public' "
        "AND (c.relname LIKE 'war_satchel_%' OR c.relname LIKE 'satchel_%')) + "
        "(SELECT count(*) FROM pg_proc p JOIN pg_namespace n "
        "ON n.oid=p.pronamespace WHERE n.nspname='public' "
        "AND p.proname LIKE 'war_satchel_%'); COMMIT;",
    )
    if satchel_objects != "0":
        raise RehearsalStop("Satchel objects already exist in production")
    return {"completed": len(completed), "rolled_back": rolled_back, "pending": list(SATCHEL)}


def schema_bytes(database: str) -> bytes:
    if not SAFE_NAME.fullmatch(database):
        raise RehearsalStop("unsafe schema snapshot database identity")
    result = postgres(
        "pg_dump", "--schema-only", "--no-owner", "--no-acl",
        "--lock-wait-timeout=5s", "--dbname", database, timeout=90,
    )
    if len(result) > 32_000_000 or len(result) < 1000:
        raise RehearsalStop("schema-only export size outside audited bounds")
    return result


def schema_fingerprint(data: bytes) -> str:
    """SHA-256 of exact pg_dump DDL, except its validated random safety token.

    PostgreSQL 16.15+ generates a fresh paired \\restrict / \\unrestrict nonce
    on every dump. That nonce is a psql safety delimiter, not schema. The
    original dump is NEVER edited before restore; only its comparison copy
    has this one strictly paired, anchored token normalized.
    """
    try:
        lines = data.decode("utf-8", "strict").splitlines(keepends=True)
    except UnicodeError as exc:
        raise RehearsalStop("invalid UTF-8 in schema-only dump") from exc
    nonce_pattern = re.compile(r"^(\\\\(?:un)?restrict) ([A-Za-z0-9]{24,160})(\\r?\\n?)$")
    matches: list[tuple[int, str, str, str]] = []
    for index, line in enumerate(lines):
        if line.startswith("\\restrict ") or line.startswith("\\unrestrict "):
            match = nonce_pattern.fullmatch(line)
            if not match:
                raise RehearsalStop("malformed pg_dump restriction directive")
            matches.append((index, match.group(1), match.group(2), match.group(3)))
    if matches:
        if (
            len(matches) != 2
            or matches[0][1] != "\\restrict"
            or matches[1][1] != "\\unrestrict"
            or matches[0][2] != matches[1][2]
            or matches[0][0] > 12
            or matches[1][0] < len(lines) - 12
        ):
            raise RehearsalStop("unpaired or misplaced pg_dump restriction nonce")
        for index, directive, _nonce, linebreak in matches:
            lines[index] = f"{directive} VERIFIED_NONCE{linebreak}"
    return hashlib.sha256("".join(lines).encode("utf-8")).hexdigest()


def six_sql() -> bytes:
    body = bytearray(b"BEGIN;\nSET LOCAL statement_timeout='30s';\n")
    body.extend(b"SET LOCAL lock_timeout='5s';\n")
    for name in SATCHEL:
        body.extend((ROOT / "prisma/migrations" / name / "migration.sql").read_bytes())
        body.extend(b"\n")
    body.extend(b"""
DO $proof$
DECLARE n_tables INTEGER; n_functions INTEGER; body TEXT;
BEGIN
  SELECT count(*) INTO n_tables FROM pg_class c JOIN pg_namespace n
  ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relkind IN ('r','p') AND c.relname LIKE 'war_satchel_%';
  IF n_tables <> 6 THEN RAISE EXCEPTION 'six table identities missing'; END IF;
  SELECT count(*) INTO n_functions FROM pg_proc p JOIN pg_namespace n
  ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname LIKE 'war_satchel_%';
  IF n_functions < 6 THEN RAISE EXCEPTION 'Satchel functions missing'; END IF;
  SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
  WHERE proname='war_satchel_assert_balanced_sandbox_journal';
  IF body IS NULL OR position('owner_count' IN body)=0 THEN
    RAISE EXCEPTION 'corrected owner count missing';
  END IF;
END;
$proof$;
ROLLBACK;
""")
    return bytes(body)


def apply_to_shadow(database: str, sql: bytes) -> None:
    if not database.startswith(SHADOW_PREFIX) or not SAFE_NAME.fullmatch(database):
        raise RehearsalStop("refusing non-shadow SQL execution")
    postgres(
        "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1",
        "-d", database, data=sql, timeout=120,
    )


def rehearse() -> dict:
    name = SHADOW_PREFIX + secrets.token_hex(7)
    if not SAFE_NAME.fullmatch(name):
        raise RehearsalStop("unsafe random scratch database name")
    created = False
    failure: Exception | None = None
    result: dict = {}
    try:
        postgres(
            "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres",
            "-c", f'CREATE DATABASE "{name}" TEMPLATE template0;',
        )
        created = True
        source_dump = schema_bytes(SOURCE_DATABASE)
        apply_to_shadow(name, source_dump)
        baseline = schema_bytes(name)
        source_digest = schema_fingerprint(source_dump)
        baseline_digest = schema_fingerprint(baseline)
        if source_digest != baseline_digest:
            raise RehearsalStop("shadow schema not equal to production schema-only export")
        apply_to_shadow(name, six_sql())
        after_digest = schema_fingerprint(schema_bytes(name))
        if baseline_digest != after_digest:
            raise RehearsalStop("schema changed after six-migration ROLLBACK")
        result = {
            "status": "PASS", "database": SOURCE_DATABASE,
            "schema_sha256": source_digest, "shadow_schema_sha256": baseline_digest,
            "post_rollback_sha256": after_digest,
            "six_migrations_exercised": True,
            "comparison": "all schema bytes except validated paired pg_dump restriction nonce",
            "production_mutated": False, "production_data_copied": False,
            "custody_authorized": False,
        }
    except Exception as exc:
        failure = exc
    finally:
        if created:
            try:
                postgres(
                    "psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "postgres",
                    "-c", f'DROP DATABASE "{name}";',
                )
            except Exception as exc:
                raise RehearsalStop(
                    f"shadow cleanup failed; operator must inspect scratch DB {name}"
                ) from exc
    if failure:
        raise failure
    result["disposable_database_removed"] = True
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--source-sha", required=True)
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="read-only (default)")
    mode.add_argument("--rehearse", action="store_true", help="use a disposable DB")
    ap.add_argument("--authorize-shadow-database", action="store_true")
    args = ap.parse_args()
    if args.rehearse != args.authorize_shadow_database:
        ap.error("--rehearse requires --authorize-shadow-database and vice versa")
    try:
        invoke(["sudo", "-n", "-u", "postgres", "true"])
        sources = source_evidence(args.source_sha)
        frontier = production_frontier(sources)
        print(
            f"EXACT SOURCE/DB FRONTIER: {len(sources)} files, "
            f"{frontier['completed']} completed, {len(frontier['pending'])} pending, "
            f"{frontier['rolled_back']} historical rollbacks"
        )
        if not args.rehearse:
            print("PASS: READ-ONLY FRONTIER; no schema export or database creation")
            return 0
        receipt = rehearse()
        for key, value in receipt.items():
            print(f"{key}: {value}")
        return 0
    except RehearsalStop as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
