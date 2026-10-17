#!/usr/bin/env python3
"""Read-only Prisma migration frontier evidence for the HD ship planner.

No migrations, locks, backups or SQL writes are performed. This module must
never be used as execution authority; the separate protected migration contract
and operator approvals remain mandatory.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import subprocess
from pathlib import Path

NAME_RE = re.compile(r"^[A-Za-z0-9_.-]{1,180}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
SQL_PATH_RE = re.compile(r"^prisma/migrations/([A-Za-z0-9_.-]+)/migration\.sql$")

# Self-contained: production's old source need not contain the new inspector.
# Read-only SQL is enforced by both the session and its explicit transaction.
# Error text, URL, username, and authentication material are never forwarded.
REMOTE_READ_ONLY_PROBE = r"""
import json, os, subprocess, sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

repo = Path.cwd()
url = ""
for name in (".env", ".env.production", ".env.local"):
    path = repo / name
    if not path.is_file():
        continue
    try:
        for raw in path.read_text().splitlines():
            line = raw.strip()
            if line.startswith("DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
                if len(url) > 1 and url[0] == url[-1] and url[0] in ("'", '"'):
                    url = url[1:-1]
                break
    except OSError:
        sys.exit(31)
    if url:
        break

if not url:
    sys.exit(32)
try:
    parsed = urlsplit(url.replace("postgresql+asyncpg://", "postgresql://", 1))
    if parsed.scheme not in ("postgres", "postgresql"):
        sys.exit(33)
    if not parsed.hostname or not parsed.username or not parsed.path.lstrip("/"):
        sys.exit(34)
    env = dict(os.environ)
    env.update({
        "PGHOST": parsed.hostname,
        "PGPORT": str(parsed.port or 5432),
        "PGUSER": unquote(parsed.username),
        "PGPASSWORD": unquote(parsed.password or ""),
        "PGDATABASE": unquote(parsed.path.lstrip("/")),
        "PGCONNECT_TIMEOUT": "5",
        "PGOPTIONS": "-c default_transaction_read_only=on -c statement_timeout=10000",
    })
    sql = (
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; "
        "SELECT migration_name,checksum,CASE "
        "WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN 'A' "
        "WHEN rolled_back_at IS NOT NULL THEN 'R' ELSE 'U' END "
        'FROM "_prisma_migrations" ORDER BY migration_name,started_at; '
        "COMMIT;"
    )
    p = subprocess.run(
        ["psql", "-X", "-q", "-A", "-t", "-F", "|", "-v", "ON_ERROR_STOP=1",
         "-c", sql],
        cwd=repo, env=env, capture_output=True, text=True, timeout=25,
        check=False,
    )
    if p.returncode:
        sys.exit(35)
    rows = []
    for line in p.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) != 3:
            sys.exit(36)
        rows.append(parts)
        if len(rows) > 10000:
            sys.exit(37)
    print(json.dumps({"schema": 1, "kind": "prisma-read-only-frontier",
                      "records": rows}, separators=(",", ":")))
except (OSError, ValueError, subprocess.TimeoutExpired):
    sys.exit(38)
"""


class MigrationFrontierError(RuntimeError):
    """A migration preflight cannot establish a safe, exact frontier."""


def migration_sources(root: Path) -> dict[str, str]:
    directory = root / "prisma" / "migrations"
    if not directory.is_dir() or directory.is_symlink():
        raise MigrationFrontierError("migration source directory missing or symlinked")
    source: dict[str, str] = {}
    for path in directory.glob("*/migration.sql"):
        name = path.parent.name
        if not NAME_RE.fullmatch(name) or path.is_symlink() or path.parent.is_symlink():
            raise MigrationFrontierError("unsafe migration source file or directory")
        if not path.is_file():
            raise MigrationFrontierError("migration source file unavailable")
        source[name] = hashlib.sha256(path.read_bytes()).hexdigest()
    if not source:
        raise MigrationFrontierError("source has zero Prisma migrations")
    return source


def compare_frontier(
    sources: dict[str, str],
    records: list[list[str]],
    manifest_paths: list[str],
) -> dict:
    """Return evidence and errors, never authorization to perform migrations."""
    errors: list[str] = []
    expected_manifest: set[str] = set()
    for path in manifest_paths:
        match = SQL_PATH_RE.fullmatch(path) if isinstance(path, str) else None
        if not match:
            errors.append("manifest has an invalid migration path")
            continue
        name = match.group(1)
        if name in expected_manifest:
            errors.append("manifest contains duplicate migration paths")
        expected_manifest.add(name)

    successful: dict[str, str] = {}
    rolled_back = 0
    unfinished: list[str] = []
    if not isinstance(records, list) or len(records) > 10000:
        raise MigrationFrontierError("invalid or unbounded database frontier")
    for record in records:
        if (
            not isinstance(record, list)
            or len(record) != 3
            or not all(isinstance(item, str) for item in record)
        ):
            raise MigrationFrontierError("malformed database migration record")
        name, checksum, status = record
        if not NAME_RE.fullmatch(name) or not SHA_RE.fullmatch(checksum):
            raise MigrationFrontierError("invalid migration identity or checksum")
        if status == "R":
            rolled_back += 1
            continue
        if status == "U":
            unfinished.append(name)
            continue
        if status != "A":
            raise MigrationFrontierError("invalid migration status")
        if name in successful:
            errors.append("duplicate successful migration: " + name)
        successful[name] = checksum

    unexpected = sorted(set(successful) - set(sources))
    checksum_drift = sorted(
        name for name in set(successful) & set(sources)
        if sources[name] != successful[name]
    )
    pending = sorted(set(sources) - set(successful))
    outside_manifest = sorted(set(pending) - expected_manifest)
    unknown_manifest = sorted(expected_manifest - set(sources))
    if unexpected:
        errors.append("database has migrations absent from release source: " + ", ".join(unexpected))
    if checksum_drift:
        errors.append("database migration checksum mismatch: " + ", ".join(checksum_drift))
    if unfinished:
        errors.append("database has unfinished migrations: " + ", ".join(sorted(unfinished)))
    if outside_manifest:
        errors.append("pending migrations outside sealed manifest: " + ", ".join(outside_manifest))
    if unknown_manifest:
        errors.append("manifest migrations absent from source: " + ", ".join(unknown_manifest))

    return {
        "status": "PASS" if not errors else "BLOCKED",
        "source_count": len(sources),
        "completed_count": len(successful),
        "rolled_back_count": rolled_back,
        "pending": pending,
        "pending_outside_manifest": outside_manifest,
        "errors": errors,
        "read_only": True,
        "execution_authorized": False,
    }


def production_records(host: str, repo: str) -> list[list[str]]:
    remote = f"cd {shlex.quote(repo)} && python3 -c {shlex.quote(REMOTE_READ_ONLY_PROBE)}"
    try:
        result = subprocess.run(
            ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
             host, remote],
            capture_output=True, text=True, check=False, timeout=40,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise MigrationFrontierError("read-only migration probe unavailable") from exc
    if result.returncode != 0:
        raise MigrationFrontierError(
            "read-only migration probe failed; no database changes attempted"
        )
    try:
        payload = json.loads(result.stdout)
    except (json.JSONDecodeError, TypeError) as exc:
        raise MigrationFrontierError("read-only migration proof is not valid JSON") from exc
    if (
        not isinstance(payload, dict)
        or payload.get("schema") != 1
        or payload.get("kind") != "prisma-read-only-frontier"
    ):
        raise MigrationFrontierError("read-only migration proof identity mismatch")
    return payload.get("records")


def inspect_release_frontier(root: Path, manifest: dict, host: str, repo: str) -> dict:
    source = migration_sources(root)
    records = production_records(host, repo)
    return compare_frontier(source, records, manifest.get("migration_paths") or [])
