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
    "20261017_012000_war_satchel_funded_ledger_foundation",
    "20261018_020000_war_satchel_physical_receipt_consumption",
    "20261018_040000_war_satchel_financial_authorizations",
    "20261018_041000_war_satchel_withdrawal_physical_consumption",
    "20261018_042000_war_satchel_auto_spend_mandate",
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
    if len(names) != 123 or len(set(names)) != 123:
        raise RehearsalStop("source migration inventory is not 123 unique files")
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
    nonce_pattern = re.compile(r"^(\\(?:un)?restrict) ([A-Za-z0-9]{24,160})(\r?\n?)$")
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


def describe_schema_delta(source: bytes, restored: bytes) -> str:
    """Bounded structural diff metadata, never raw production SQL or identifiers.

    This is diagnostic only: any difference remains a HARD STOP. pg_dump
    --schema-only can contain function constants and comments; neither raw
    bytes nor contextual snippets are printed or written to disk.
    """
    import difflib

    original = source.decode("utf-8", "strict").splitlines()
    shadow = restored.decode("utf-8", "strict").splitlines()
    # Caller invoked schema_fingerprint() for both dumps first, which has
    # already rejected missing, malformed or unpaired restriction tokens.
    # Ignore only those validated non-schema tokens in this diagnostic too.
    for lines in (original, shadow):
        for i, line in enumerate(lines):
            if line.startswith("\\restrict ") or line.startswith("\\unrestrict "):
                lines[i] = line.split(" ", 1)[0] + " VERIFIED_NONCE"
    if len(original) > 30_000 or len(shadow) > 30_000:
        return (
            f"schema line counts source={len(original)} shadow={len(shadow)}; "
            "too large for bounded delta; equality remains blocked"
        )

    def kind(line: str) -> str:
        if line.startswith("--"):
            return "comment"
        if line.startswith("\\"):
            return "psql-directive"
        token = re.match(r"\s*([A-Za-z_]+)", line)
        keyword = token.group(1).upper() if token else "BLANK_OR_PUNCT"
        # Whitelist SQL statement verbs; redact all other content as OTHER.
        return keyword if keyword in {
            "CREATE", "ALTER", "DROP", "COMMENT", "SELECT", "SET", "GRANT",
            "REVOKE", "COPY", "INSERT", "UPDATE", "DELETE", "BEGIN", "END",
        } else "OTHER"

    def section_type(lines: list[str], offset: int) -> str:
        """Only the pg_dump metadata TYPE; never print object name or SQL.

        A changed column/function body normally begins with whitespace and
        is otherwise labeled OTHER. Inspect the preceding pg_dump section
        descriptor, but strictly allowlist the returned TYPE token.
        """
        allowed = {
            "ACL", "AGGREGATE", "CAST", "COLLATION", "COMMENT",
            "CONSTRAINT", "DEFAULT", "DOMAIN", "EXTENSION", "FUNCTION",
            "INDEX", "MATERIALIZED VIEW", "POLICY", "PROCEDURE",
            "PUBLICATION", "RULE", "SCHEMA", "SEQUENCE", "TABLE",
            "TRIGGER", "TYPE", "VIEW",
        }
        # This is diagnostic metadata, not schema equivalence evidence.
        for prior in reversed(lines[max(0, offset - 1500):offset + 1]):
            if not prior.startswith("-- Name: "):
                continue
            match = re.search(r"; Type: ([A-Z ]+); Schema:", prior)
            if match:
                return match.group(1) if match.group(1) in allowed else "OTHER"
        return "UNKNOWN"

    def safe_clues(line: str) -> str:
        """Fixed labels only; literals, identifiers and paths are never emitted."""
        flags = [
            label for label, present in (
                ("LIVE_DATABASE_LITERAL", SOURCE_DATABASE in line),
                ("SHADOW_DATABASE_LITERAL", SHADOW_PREFIX in line),
                ("REGCLASS_CAST", "::regclass" in line.lower()),
                ("CAST_EXPRESSION", "::" in line),
                ("FUNCTION_SEARCH_PATH", "search_path" in line.lower()),
            )
            if present
        ]
        return ",".join(flags) if flags else "NONE"

    def line_id(line: str) -> str:
        return hashlib.sha256(line.encode("utf-8")).hexdigest()[:12]

    diffs = []
    matcher = difflib.SequenceMatcher(a=original, b=shadow, autojunk=True)
    for tag, a, b, c, d in matcher.get_opcodes():
        if tag == "equal":
            continue
        sample_a = original[a] if a < b else ""
        sample_b = shadow[c] if c < d else ""
        diffs.append(
            f"{tag}: source_lines={a + 1}-{b} "
            f"shadow_lines={c + 1}-{d} "
            f"source_kind={kind(sample_a)} shadow_kind={kind(sample_b)} "
            f"source_section={section_type(original, a)} "
            f"shadow_section={section_type(shadow, c)} "
            f"source_clues={safe_clues(sample_a)} "
            f"shadow_clues={safe_clues(sample_b)} "
            f"source_line_sha12={line_id(sample_a)} "
            f"shadow_line_sha12={line_id(sample_b)}"
        )
        if len(diffs) >= 6:
            break
    return (
        f"schema delta source_lines={len(original)} "
        f"shadow_lines={len(shadow)}; "
        + ("; ".join(diffs) if diffs else "difference not localized")
    )


def cohort_sql() -> bytes:
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
  AND c.relkind IN ('r','p') AND c.relname IN (
    'war_satchel_deposit_intents',
    'war_satchel_proof_candidates',
    'war_satchel_wallet_challenges',
    'war_satchel_ledger_accounts',
    'war_satchel_ledger_journals',
    'war_satchel_ledger_postings'
  );
  IF n_tables <> 6 THEN RAISE EXCEPTION 'six original simulation tables missing'; END IF;
  SELECT count(*) INTO n_tables FROM pg_class c JOIN pg_namespace n
  ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relkind IN ('r','p') AND c.relname LIKE 'war_satchel_funded_%';
  IF n_tables <> 7 THEN
    RAISE EXCEPTION 'seven funded table identities missing';
  END IF;
  SELECT count(*) INTO n_tables FROM pg_class c JOIN pg_namespace n
  ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relkind IN ('r','p') AND c.relname='war_satchel_auto_spend_consents';
  IF n_tables <> 1 THEN
    RAISE EXCEPTION 'signed funded-spend-consent table missing';
  END IF;
  IF to_regclass('public.war_satchel_physical_receipt_consumptions') IS NULL THEN
    RAISE EXCEPTION 'global physical receipt consumption table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.war_satchel_physical_receipt_consumptions'::regclass
    AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (chain_id, tx_hash)') THEN
    RAISE EXCEPTION 'global physical receipt identity missing';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
    AND tgname IN ('satchel_deposit_physical_consumption',
                  'satchel_return_physical_consumption',
                  'satchel_physical_consumption_immutable',
                  'satchel_physical_consumption_no_truncate')) <> 4 THEN
    RAISE EXCEPTION 'global physical receipt triggers missing';
  END IF;
  SELECT count(*) INTO n_functions FROM pg_proc p JOIN pg_namespace n
  ON n.oid=p.pronamespace WHERE n.nspname='public'
  AND p.proname LIKE 'war_satchel_%';
  -- The recovered Codex finance patch adds immutable authorization,
  -- claim-return, withdrawal consumption and signed spending-mandate tables.
  -- Never accept the previous eight-file rehearsal as certification of these.
  SELECT count(*) INTO n_tables FROM pg_class c JOIN pg_namespace n
  ON n.oid=c.relnamespace WHERE n.nspname='public'
  AND c.relkind IN ('r','p') AND c.relname IN (
    'war_satchel_withdrawal_authorizations',
    'war_satchel_withdrawal_approvals',
    'war_satchel_withdrawal_revocations',
    'war_satchel_withdrawal_attempts',
    'war_satchel_withdrawal_observations',
    'war_satchel_claim_return_authorizations',
    'war_satchel_withdrawal_physical_consumptions',
    'war_satchel_auto_spend_mandates'
  );
  IF n_tables <> 8 THEN RAISE EXCEPTION 'eight recovered financial evidence tables missing'; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
    AND tgname IN (
      'satchel_withdrawal_physical_guard',
      'satchel_credit_global_physical_guard',
      'satchel_withdrawal_physical_immutable',
      'satchel_withdrawal_physical_no_truncate',
      'satchel_original_mandate_lock',
      'satchel_original_mandate_no_truncate'
    )) <> 6 THEN RAISE EXCEPTION 'recovered financial immutable/global guards missing'; END IF;
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


def rehearse(*, explain_schema_mismatch: bool = False,
            diagnostic_only_on_schema_mismatch: bool = False) -> dict:
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
        schema_mismatch = source_digest != baseline_digest
        diagnostics = (
            describe_schema_delta(source_dump, baseline)
            if schema_mismatch and explain_schema_mismatch else ""
        )
        if schema_mismatch and not diagnostic_only_on_schema_mismatch:
            raise RehearsalStop(
                "shadow schema not equal to production schema-only export"
                + (": " + diagnostics if diagnostics else "")
            )
        # Diagnostic ONLY: run the full eleven-file SQL cohort in the disposable
        # restored shadow. Passing here never proves source schema equivalence,
        # nor permits applying any migration to the production database.
        apply_to_shadow(name, cohort_sql())
        after_digest = schema_fingerprint(schema_bytes(name))
        if baseline_digest != after_digest:
            raise RehearsalStop("schema changed after eleven-migration ROLLBACK")
        result = {
            "status": ("DIAGNOSTIC_ONLY_SCHEMA_MISMATCH" if schema_mismatch else "PASS"),
            "database": SOURCE_DATABASE,
            "schema_sha256": source_digest, "shadow_schema_sha256": baseline_digest,
            "schema_equivalent": not schema_mismatch,
            "schema_delta": diagnostics or ("DIFFERENT" if schema_mismatch else "NONE"),
            "post_rollback_sha256": after_digest,
            "pending_migrations_exercised": True,
            "pending_migration_count": len(SATCHEL),
            "comparison": ("MISMATCH: no production installation authority" if schema_mismatch
                           else "all schema bytes except validated paired pg_dump restriction nonce"),
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
    ap.add_argument("--explain-schema-mismatch", action="store_true",
                    help="print only bounded hashed diff metadata on a failed shadow comparison")
    ap.add_argument("--diagnose-migrations-on-mismatch", action="store_true",
                    help="shadow-only SQL diagnosis on mismatch, never a green release gate")
    args = ap.parse_args()
    if args.rehearse != args.authorize_shadow_database:
        ap.error("--rehearse requires --authorize-shadow-database and vice versa")
    if args.explain_schema_mismatch and not args.rehearse:
        ap.error("--explain-schema-mismatch requires --rehearse with explicit authorization")
    if args.diagnose_migrations_on_mismatch and not args.rehearse:
        ap.error("--diagnose-migrations-on-mismatch requires --rehearse with explicit authorization")
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
        receipt = rehearse(
            explain_schema_mismatch=args.explain_schema_mismatch,
            diagnostic_only_on_schema_mismatch=args.diagnose_migrations_on_mismatch,
        )
        for key, value in receipt.items():
            print(f"{key}: {value}")
        # Schema mismatch cannot be classified as a passed release gate,
        # even if the detached eleven-file SQL cohort rolls back cleanly.
        return 0 if receipt["status"] == "PASS" else 2
    except RehearsalStop as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
