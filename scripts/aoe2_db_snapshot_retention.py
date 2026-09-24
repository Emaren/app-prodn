#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
RELEASE_RE = re.compile(r"^[0-9a-f]{40}$")
MIGRATION_DIR_RE = re.compile(
    r"^migration-(\d{8}T\d{6}Z)-([0-9a-f]{12})$"
)
FINANCIAL_TOKENS = {
    "bet",
    "bets",
    "challenge",
    "escrow",
    "financial",
    "oracle",
    "payout",
    "settlement",
    "staking",
    "treasury",
    "wolo",
}
RECOVERY_TOKENS = {
    "before",
    "incident",
    "recovery",
    "repair",
    "replay",
    "restore",
    "rollback",
}


class SnapshotRetentionError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_contract() -> dict[str, Any]:
    payload = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if payload.get("schema") != 1:
        raise SnapshotRetentionError("unsupported operations contract schema")
    return payload


def policy() -> dict[str, Any]:
    contract = load_contract()
    canonical = contract.get("canonical") or {}
    configured = contract.get("database_snapshot_retention") or {}
    expected_root = "/mnt/HC_Volume_105319120/aoe2war/deploy-receipts"
    expected_receipts = (
        "/mnt/HC_Volume_105319120/aoe2war/os-control/"
        "db-snapshot-retention-receipts"
    )
    if configured.get("snapshot_root") != expected_root:
        raise SnapshotRetentionError(
            "database_snapshot_retention.snapshot_root drifted"
        )
    if configured.get("retirement_receipt_root") != expected_receipts:
        raise SnapshotRetentionError(
            "database_snapshot_retention.retirement_receipt_root drifted"
        )
    if configured.get("delete_enabled") is not False:
        raise SnapshotRetentionError(
            "database snapshot deletion must remain disabled in V1"
        )
    if configured.get("wolo_mutation_allowed") is not False:
        raise SnapshotRetentionError(
            "database snapshot retention must remain Wolo-observe-only"
        )

    hot = configured.get("hot_count")
    weekly = configured.get("weekly_cold_weeks")
    monthly = configured.get("monthly_cold_months")
    max_meta = configured.get("max_metadata_file_bytes")
    if not isinstance(hot, int) or isinstance(hot, bool) or not 2 <= hot <= 12:
        raise SnapshotRetentionError("hot_count must be between 2 and 12")
    if (
        not isinstance(weekly, int)
        or isinstance(weekly, bool)
        or not 2 <= weekly <= 26
    ):
        raise SnapshotRetentionError(
            "weekly_cold_weeks must be between 2 and 26"
        )
    if (
        not isinstance(monthly, int)
        or isinstance(monthly, bool)
        or not 3 <= monthly <= 36
    ):
        raise SnapshotRetentionError(
            "monthly_cold_months must be between 3 and 36"
        )
    if (
        not isinstance(max_meta, int)
        or isinstance(max_meta, bool)
        or not 65536 <= max_meta <= 8 * 1024 * 1024
    ):
        raise SnapshotRetentionError(
            "max_metadata_file_bytes is outside safe bounds"
        )

    host = str(canonical.get("production_host") or "")
    if host != "hel1":
        raise SnapshotRetentionError("canonical production host drifted")
    root_maintenance_host = str(
        (contract.get("rollback_archive") or {}).get(
            "root_maintenance_host"
        )
        or ""
    )
    if root_maintenance_host != "root@hel1":
        raise SnapshotRetentionError(
            "database snapshot verification root maintenance authority drifted"
        )

    return {
        "production_host": host,
        "root_maintenance_host": root_maintenance_host,
        "snapshot_root": expected_root,
        "retirement_receipt_root": expected_receipts,
        "hot_count": hot,
        "weekly_cold_weeks": weekly,
        "monthly_cold_months": monthly,
        "max_metadata_file_bytes": max_meta,
        "delete_enabled": False,
        "wolo_mutation_allowed": False,
    }


REMOTE_INVENTORY = r'''
from __future__ import annotations
import base64, hashlib, json, os, re, stat, sys
from datetime import datetime, timezone
from pathlib import Path

p = json.loads(base64.urlsafe_b64decode(sys.argv[1].encode("ascii")))
verify_hashes = sys.argv[2] == "1"
root = Path(p["snapshot_root"])
max_meta = int(p["max_metadata_file_bytes"])
if root.is_symlink() or not root.is_dir():
    raise SystemExit(
        "STOP: canonical deploy-receipt root is missing or not a direct directory"
    )
metadata_roots = [
    root,
    Path("/mnt/HC_Volume_105319120/aoe2war/os-control"),
]
allowed_suffixes = (".dump", ".backup", ".bak", ".sql.gz")
allowed_metadata_suffixes = {".json", ".txt", ".sha256", ".receipt", ".log"}
migration_dir_re = re.compile(r"^migration-(\d{8}T\d{6}Z)-([0-9a-f]{12})$")
sha_re = re.compile(r"^[0-9a-f]{64}$")
release_re = re.compile(r"^[0-9a-f]{40}$")

def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def parse_status(path):
    result = {}
    try:
        st = path.stat(follow_symlinks=False)
    except OSError:
        return result, False
    if (
        path.is_symlink()
        or not stat.S_ISREG(st.st_mode)
        or st.st_size <= 0
        or st.st_size > max_meta
    ):
        return result, False
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError):
        return result, False
    for raw in lines:
        if raw == "":
            continue
        if "=" not in raw:
            return result, False
        key, value = raw.split("=", 1)
        if not key:
            return result, False
        if key == "migration" and not value:
            return result, False
        result.setdefault(key, []).append(value)
    return result, True

def one(status, key):
    values = status.get(key) or []
    if len(values) != 1:
        return None
    value = values[0]
    return value if value else None

def status_receipt_valid(parent, status, status_syntax_valid):
    status_path = parent / "migration-status.txt"
    sidecar = parent / "migration-status.txt.sha256"
    if (
        status_path.is_symlink()
        or sidecar.is_symlink()
        or not status_path.is_file()
        or not sidecar.is_file()
    ):
        return False
    try:
        status_stat = status_path.stat(follow_symlinks=False)
        sidecar_stat = sidecar.stat(follow_symlinks=False)
    except OSError:
        return False
    if (
        not stat.S_ISREG(status_stat.st_mode)
        or not stat.S_ISREG(sidecar_stat.st_mode)
        or status_stat.st_size <= 0
        or status_stat.st_size > 256 * 1024
        or sidecar_stat.st_size <= 0
        or sidecar_stat.st_size > 4096
    ):
        return False
    try:
        lines = [
            line.strip()
            for line in sidecar.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    except (OSError, UnicodeDecodeError):
        return False
    if len(lines) != 1:
        return False
    parts = lines[0].split(None, 1)
    if (
        len(parts) != 2
        or not sha_re.fullmatch(parts[0])
        or parts[1].strip() != str(status_path)
    ):
        return False
    try:
        observed = hashlib.sha256(status_path.read_bytes()).hexdigest()
    except OSError:
        return False
    return bool(
        status_syntax_valid
        and observed == parts[0]
        and one(status, "status") == "APPLIED"
    )

# Match the release activation verifier's ambiguity boundary. It considers
# every direct top-level "migration-*-<release12>" entry before trusting any
# one receipt's contents, so a malformed sibling must protect the otherwise
# canonical dump rather than disappear from retention planning.
release_prefix_candidates = {}
for entry in root.iterdir():
    name = entry.name
    if not name.startswith("migration-") or "-" not in name:
        continue
    release_short = name.rsplit("-", 1)[-1]
    if not re.fullmatch(r"[0-9a-f]{12}", release_short):
        continue
    release_prefix_candidates.setdefault(release_short, []).append(name)
for release_short in release_prefix_candidates:
    release_prefix_candidates[release_short].sort()

metadata_documents = []
metadata_scan_blockers = []
metadata_scan_files = 0
metadata_scan_bytes = 0
max_metadata_documents = 25000
max_metadata_total_bytes = 256 * 1024 * 1024

for base in metadata_roots:
    try:
        base_stat = base.stat(follow_symlinks=False)
    except OSError as exc:
        metadata_scan_blockers.append(
            "metadata-root-unreadable:" + str(base) + ":" + type(exc).__name__
        )
        continue
    if base.is_symlink() or not stat.S_ISDIR(base_stat.st_mode):
        metadata_scan_blockers.append(
            "metadata-root-not-direct-directory:" + str(base)
        )
        continue

    for current, dirs, files in os.walk(base):
        current_path = Path(current)

        safe_dirs = []
        for name in dirs:
            child = current_path / name
            try:
                child_stat = child.stat(follow_symlinks=False)
            except OSError as exc:
                metadata_scan_blockers.append(
                    "metadata-directory-unreadable:"
                    + str(child)
                    + ":"
                    + type(exc).__name__
                )
                continue
            if child.is_symlink() or not stat.S_ISDIR(child_stat.st_mode):
                metadata_scan_blockers.append(
                    "metadata-directory-not-direct:" + str(child)
                )
                continue
            safe_dirs.append(name)
        dirs[:] = safe_dirs

        for name in files:
            if not any(
                name.endswith(suffix)
                for suffix in allowed_metadata_suffixes
            ):
                continue
            path = current_path / name
            try:
                st = path.stat(follow_symlinks=False)
            except OSError as exc:
                metadata_scan_blockers.append(
                    "metadata-file-unreadable:"
                    + str(path)
                    + ":"
                    + type(exc).__name__
                )
                continue
            if path.is_symlink() or not stat.S_ISREG(st.st_mode):
                metadata_scan_blockers.append(
                    "metadata-file-not-direct-regular:" + str(path)
                )
                continue
            if st.st_size > max_meta:
                metadata_scan_blockers.append(
                    "metadata-file-oversize:"
                    + str(path)
                    + ":"
                    + str(st.st_size)
                )
                continue
            if metadata_scan_files >= max_metadata_documents:
                metadata_scan_blockers.append(
                    "metadata-document-count-limit:"
                    + str(max_metadata_documents)
                )
                continue
            if metadata_scan_bytes + int(st.st_size) > max_metadata_total_bytes:
                metadata_scan_blockers.append(
                    "metadata-byte-limit:"
                    + str(max_metadata_total_bytes)
                )
                continue
            try:
                text = path.read_text(
                    encoding="utf-8", errors="strict"
                )
            except Exception as exc:
                metadata_scan_blockers.append(
                    "metadata-file-read-failed:"
                    + str(path)
                    + ":"
                    + type(exc).__name__
                )
                continue
            metadata_documents.append((path, text))
            metadata_scan_files += 1
            metadata_scan_bytes += int(st.st_size)

reference_scan_complete = not metadata_scan_blockers

snapshots = []
if root.is_dir():
    base_depth = len(root.parts)
    for current, dirs, files in os.walk(root):
        current_path = Path(current)
        depth = len(current_path.parts) - base_depth
        if depth >= 4:
            dirs[:] = []
        dirs[:] = [
            name for name in dirs
            if not (current_path / name).is_symlink()
        ]
        for name in files:
            if not name.lower().endswith(allowed_suffixes):
                continue
            path = current_path / name
            try:
                st = path.stat(follow_symlinks=False)
            except OSError:
                continue
            if not stat.S_ISREG(st.st_mode):
                continue

            parent = path.parent
            status, status_syntax_valid = parse_status(
                parent / "migration-status.txt"
            )
            status_ok = status_receipt_valid(
                parent,
                status,
                status_syntax_valid,
            )
            declared = one(status, "dump_sha256")
            release_sha = one(status, "release_sha")
            database = one(status, "database")
            declared_dump = one(status, "dump")
            migrations = [
                value
                for value in (status.get("migration") or [])
                if isinstance(value, str) and value
            ]
            migration_match = migration_dir_re.fullmatch(parent.name)
            receipt_timestamp = None
            if migration_match:
                candidate_timestamp = migration_match.group(1)
                try:
                    datetime.strptime(
                        candidate_timestamp, "%Y%m%dT%H%M%SZ"
                    )
                except ValueError:
                    pass
                else:
                    receipt_timestamp = candidate_timestamp
            release_short = (
                migration_match.group(2) if migration_match else None
            )
            release_candidates = (
                list(release_prefix_candidates.get(release_short, []))
                if release_short
                else []
            )
            release_receipt_count = len(release_candidates)
            receipt_ambiguity = (
                "multiple or malformed migration receipt entries share "
                "the release prefix"
                if release_short and release_receipt_count != 1
                else None
            )
            migration_shape = bool(
                name == "pre-migration.dump"
                and int(st.st_size) > 0
                and migration_match
                and receipt_timestamp is not None
                and status_ok
                and status_syntax_valid
                and receipt_ambiguity is None
                and declared_dump == name
                and isinstance(declared, str)
                and sha_re.fullmatch(declared)
                and isinstance(release_sha, str)
                and release_re.fullmatch(release_sha)
                and release_sha[:12] == release_short
                and isinstance(database, str)
                and database.strip()
                and migrations
                and len(migrations) == len(set(migrations))
            )

            actual_sha = sha256(path) if verify_hashes else None
            hash_matches = (
                actual_sha == declared
                if actual_sha is not None and declared is not None
                else None
            )

            abs_text = str(path)
            parent_text = str(parent)
            refs = []
            for meta, text in metadata_documents:
                if meta.parent == parent:
                    continue
                if (
                    abs_text in text
                    or parent_text in text
                    or parent.name in text
                ):
                    refs.append(str(meta))
                    if len(refs) >= 24:
                        break

            snapshots.append({
                "path": abs_text,
                "relative_path": str(path.relative_to(root)),
                "parent": parent_text,
                "parent_name": parent.name,
                "name": name,
                "size_bytes": int(st.st_size),
                "mtime": datetime.fromtimestamp(
                    st.st_mtime, timezone.utc
                ).isoformat(),
                "receipt_timestamp": receipt_timestamp,
                "status_receipt_valid": status_ok,
                "status_syntax_valid": status_syntax_valid,
                "migration_shape_exact": migration_shape,
                "release_receipt_count": release_receipt_count,
                "release_receipt_examples": release_candidates[:6],
                "receipt_ambiguity": receipt_ambiguity,
                "release_sha": release_sha,
                "database": database,
                "declared_sha256": declared,
                "actual_sha256": actual_sha,
                "hash_matches_declared": hash_matches,
                "migrations": migrations,
                "external_reference_count": len(refs),
                "external_reference_examples": refs[:6],
            })

payload = {
    "schema": 1,
    "kind": "aoe2war-db-snapshot-inventory",
    "generated_at": datetime.now(timezone.utc).isoformat(),
    "snapshot_root": str(root),
    "verify_hashes": verify_hashes,
    "reference_scan_complete": reference_scan_complete,
    "reference_scan_files": metadata_scan_files,
    "reference_scan_bytes": metadata_scan_bytes,
    "reference_scan_blockers": metadata_scan_blockers[:100],
    "reference_scan_blocker_count": len(metadata_scan_blockers),
    "snapshots": snapshots,
}
output_path = Path(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] else None
if output_path is None:
    print(json.dumps(payload, sort_keys=True))
else:
    if (
        output_path.parent != Path("/tmp")
        or not re.fullmatch(
            r"aoe2war-db-snapshot-verify-[0-9a-f]{16,64}\.json",
            output_path.name,
        )
        or output_path.exists()
        or output_path.is_symlink()
    ):
        raise SystemExit("STOP: unsafe verification output path")
    encoded_payload = json.dumps(payload, sort_keys=True) + "\n"
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    fd = os.open(output_path, flags, 0o400)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            fd = -1
            handle.write(encoded_payload)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if fd >= 0:
            os.close(fd)
'''


def decode_governed_verify_output(output: str) -> dict[str, Any]:
    marker = "AOE2WAR_DB_SNAPSHOT_VERIFY_RESULT="
    matches = [
        line[len(marker):].strip()
        for line in output.splitlines()
        if line.startswith(marker)
    ]
    if len(matches) != 1:
        raise SnapshotRetentionError(
            "governed snapshot verification did not return one result marker"
        )
    try:
        raw = base64.urlsafe_b64decode(matches[0].encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise SnapshotRetentionError(
            "governed snapshot verification returned invalid result evidence"
        ) from exc
    if not isinstance(payload, dict):
        raise SnapshotRetentionError(
            "governed snapshot verification returned non-object evidence"
        )
    return payload


def governed_remote_inventory(p: dict[str, Any], encoded: str) -> dict[str, Any]:
    source_sha = hashlib.sha256(
        REMOTE_INVENTORY.encode("utf-8")
    ).hexdigest()
    remote = f"""
from pathlib import Path
import base64
import hashlib
import os
import subprocess
import sys

source = {REMOTE_INVENTORY!r}
expected = {source_sha!r}
observed = hashlib.sha256(source.encode("utf-8")).hexdigest()
if observed != expected:
    raise SystemExit("STOP: DB snapshot verification helper source drift")

helper_root = Path("/run/aoe2war-db-snapshot-verify")
helper_root.mkdir(mode=0o700, parents=False, exist_ok=True)
root_stat = helper_root.stat(follow_symlinks=False)
if (
    helper_root.is_symlink()
    or not helper_root.is_dir()
    or root_stat.st_uid != 0
):
    raise SystemExit("STOP: unsafe DB snapshot verification helper root")
if (root_stat.st_mode & 0o777) != 0o700:
    helper_root.chmod(0o700)

tool = helper_root / ("inventory-" + expected + ".py")
if tool.exists():
    tool_stat = tool.stat(follow_symlinks=False)
    if (
        tool.is_symlink()
        or not tool.is_file()
        or tool_stat.st_uid != 0
        or (tool_stat.st_mode & 0o777) != 0o400
    ):
        raise SystemExit("STOP: unsafe existing DB snapshot verification helper")
    if hashlib.sha256(tool.read_bytes()).hexdigest() != expected:
        raise SystemExit("STOP: existing DB snapshot verification helper drift")
else:
    flags = (
        os.O_WRONLY
        | os.O_CREAT
        | os.O_EXCL
        | getattr(os, "O_NOFOLLOW", 0)
    )
    fd = os.open(tool, flags, 0o400)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            fd = -1
            handle.write(source)
            handle.flush()
            os.fsync(handle.fileno())
    finally:
        if fd >= 0:
            os.close(fd)

output = Path("/tmp") / (
    "aoe2war-db-snapshot-verify-" + expected[:16] + f"{{os.getpid():x}}.json"
)
try:
    command = [
        "/usr/local/sbin/aoe2war-maintenance-run",
        "db-snapshot-verify",
        "--",
        "python3",
        str(tool),
        {encoded!r},
        "1",
        str(output),
    ]
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        raise SystemExit(completed.returncode)
    if output.is_symlink() or not output.is_file():
        raise SystemExit("STOP: governed DB snapshot verification output missing")
    raw = output.read_bytes()
    payload = __import__("json").loads(raw)
    if (
        not isinstance(payload, dict)
        or payload.get("kind") != "aoe2war-db-snapshot-inventory"
        or payload.get("verify_hashes") is not True
    ):
        raise SystemExit("STOP: governed DB snapshot verification output invalid")
    print(
        "AOE2WAR_DB_SNAPSHOT_VERIFY_RESULT="
        + base64.urlsafe_b64encode(raw).decode("ascii")
    )
finally:
    output.unlink(missing_ok=True)
"""
    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        str(p["root_maintenance_host"]),
        "python3",
        "-",
    ]
    proc = subprocess.run(
        cmd,
        input=remote,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=900,
        check=False,
    )
    if proc.returncode != 0:
        raise SnapshotRetentionError(
            (
                proc.stderr
                or proc.stdout
                or "governed remote inventory verification failed"
            ).strip()
        )
    return decode_governed_verify_output(proc.stdout)


def remote_inventory(*, verify_hashes: bool = False) -> dict[str, Any]:
    p = policy()
    encoded = base64.urlsafe_b64encode(
        json.dumps(p, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")

    if verify_hashes:
        return governed_remote_inventory(p, encoded)

    cmd = [
        "ssh",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        p["production_host"],
        "python3",
        "-",
        encoded,
        "0",
    ]
    proc = subprocess.run(
        cmd,
        input=REMOTE_INVENTORY,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=90,
        check=False,
    )
    if proc.returncode != 0:
        raise SnapshotRetentionError(
            (proc.stderr or proc.stdout or "remote inventory failed").strip()
        )
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise SnapshotRetentionError(
            f"remote inventory returned invalid JSON: {proc.stdout[-4000:]}"
        ) from exc
    if not isinstance(payload, dict):
        raise SnapshotRetentionError("remote inventory returned non-object")
    return payload


def token_set(row: dict[str, Any]) -> set[str]:
    text = " ".join(
        str(row.get(key) or "")
        for key in ("relative_path", "parent_name", "name")
    ).lower()
    return {
        token
        for token in re.split(r"[^a-z0-9]+", text)
        if token
    }


def classify_snapshot(row: dict[str, Any]) -> tuple[str, str]:
    if row.get("receipt_ambiguity"):
        return (
            "legacy-ambiguous",
            str(row["receipt_ambiguity"]),
        )
    if row.get("migration_shape_exact") is True:
        if row.get("hash_matches_declared") is False:
            return (
                "legacy-ambiguous",
                "declared migration backup hash does not match current bytes",
            )
        return (
            "migration-boundary",
            "canonical pre-migration receipt with exact release/hash provenance",
        )

    tokens = token_set(row)
    if tokens & FINANCIAL_TOKENS:
        return (
            "financial",
            "path/name indicates financial or settlement recovery evidence",
        )
    if tokens & RECOVERY_TOKENS:
        return (
            "incident/recovery",
            "path/name indicates incident, repair, restore, or rollback evidence",
        )
    return (
        "legacy-ambiguous",
        "legacy snapshot lacks the canonical migration provenance contract",
    )


def parse_mtime(row: dict[str, Any]) -> datetime:
    raw = str(row.get("mtime") or "")
    value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    return value.astimezone(timezone.utc)


def retention_time(row: dict[str, Any]) -> datetime:
    stamp = str(row.get("receipt_timestamp") or "")
    if row.get("migration_shape_exact") is True and stamp:
        try:
            return datetime.strptime(
                stamp, "%Y%m%dT%H%M%SZ"
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return parse_mtime(row)


def select_retention(
    rows: list[dict[str, Any]],
    *,
    reference_scan_complete: bool = True,
) -> list[dict[str, Any]]:
    p = policy()
    now = datetime.now(timezone.utc)

    enriched: list[dict[str, Any]] = []
    for raw in rows:
        row = dict(raw)
        classification, reason = classify_snapshot(row)
        row["classification"] = classification
        row["classification_reason"] = reason
        mtime = retention_time(row)
        row["age_days"] = round(
            max(0.0, (now - mtime).total_seconds() / 86400.0), 2
        )
        row["retention_class"] = None
        row["retention_reason"] = None
        row["retire_candidate"] = False
        enriched.append(row)

    modern = sorted(
        [
            row for row in enriched
            if row["classification"] == "migration-boundary"
        ],
        key=retention_time,
        reverse=True,
    )

    protected_ids: set[str] = set()
    for row in enriched:
        if int(row.get("external_reference_count") or 0) > 0:
            row["retention_class"] = "PROTECTED_REFERENCE"
            row["retention_reason"] = (
                "snapshot/receipt path is referenced by external durable metadata"
            )
            protected_ids.add(str(row["path"]))
        elif row["classification"] != "migration-boundary":
            row["retention_class"] = "PROTECTED_EVIDENCE"
            row["retention_reason"] = (
                "non-canonical or special-purpose database evidence is never "
                "retired by the generic migration-boundary policy"
            )
            protected_ids.add(str(row["path"]))

    available = [
        row for row in modern
        if str(row["path"]) not in protected_ids
    ]

    for row in available[: int(p["hot_count"])]:
        row["retention_class"] = "HOT"
        row["retention_reason"] = (
            f"newest {p['hot_count']} exact migration restore points"
        )
        protected_ids.add(str(row["path"]))

    weekly_seen: set[tuple[int, int]] = set()
    for row in modern:
        if row.get("retention_class") not in {
            "PROTECTED_REFERENCE",
            "HOT",
        }:
            continue
        dt = retention_time(row)
        iso = dt.isocalendar()
        weekly_seen.add((iso.year, iso.week))
    weekly_limit = int(p["weekly_cold_weeks"])
    weekly_added = 0
    for row in available:
        if str(row["path"]) in protected_ids:
            continue
        dt = retention_time(row)
        iso = dt.isocalendar()
        key = (iso.year, iso.week)
        if key in weekly_seen or weekly_added >= weekly_limit:
            continue
        weekly_seen.add(key)
        weekly_added += 1
        row["retention_class"] = "COLD_WEEKLY"
        row["retention_reason"] = (
            "newest exact migration restore point for retained ISO week"
        )
        protected_ids.add(str(row["path"]))

    monthly_seen: set[tuple[int, int]] = set()
    for row in modern:
        if row.get("retention_class") not in {
            "PROTECTED_REFERENCE",
            "HOT",
            "COLD_WEEKLY",
        }:
            continue
        dt = retention_time(row)
        monthly_seen.add((dt.year, dt.month))
    monthly_limit = int(p["monthly_cold_months"])
    monthly_added = 0
    for row in available:
        if str(row["path"]) in protected_ids:
            continue
        dt = retention_time(row)
        key = (dt.year, dt.month)
        if key in monthly_seen or monthly_added >= monthly_limit:
            continue
        monthly_seen.add(key)
        monthly_added += 1
        row["retention_class"] = "COLD_MONTHLY"
        row["retention_reason"] = (
            "newest exact migration restore point for retained calendar month"
        )
        protected_ids.add(str(row["path"]))

    for row in modern:
        if row["retention_class"] is not None:
            continue
        if not SHA256_RE.fullmatch(str(row.get("declared_sha256") or "")):
            row["retention_class"] = "PROTECTED_EVIDENCE"
            row["retention_reason"] = "exact SHA-256 provenance is unavailable"
            continue
        if not reference_scan_complete:
            row["retention_class"] = "PROTECTED_REFERENCE_CENSUS"
            row["retention_reason"] = (
                "external durable-reference census is incomplete; "
                "retirement candidacy is fail-closed"
            )
            continue
        row["retention_class"] = "RETIRE_CANDIDATE"
        row["retention_reason"] = (
            "exact migration-boundary snapshot is outside hot/weekly/monthly "
            "retention and has no external metadata reference"
        )
        row["retire_candidate"] = True

    return sorted(enriched, key=retention_time, reverse=True)


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_bytes = sum(int(row.get("size_bytes") or 0) for row in rows)
    candidates = [row for row in rows if row.get("retire_candidate")]
    by_class: dict[str, int] = {}
    by_retention: dict[str, int] = {}
    for row in rows:
        classification = str(row.get("classification") or "unknown")
        retention = str(row.get("retention_class") or "unknown")
        by_class[classification] = by_class.get(classification, 0) + 1
        by_retention[retention] = by_retention.get(retention, 0) + 1
    return {
        "snapshot_count": len(rows),
        "snapshot_bytes": total_bytes,
        "candidate_count": len(candidates),
        "candidate_bytes": sum(
            int(row.get("size_bytes") or 0) for row in candidates
        ),
        "classification_counts": dict(sorted(by_class.items())),
        "retention_counts": dict(sorted(by_retention.items())),
        "ambiguous_count": by_class.get("legacy-ambiguous", 0),
        "externally_referenced_count": sum(
            1
            for row in rows
            if int(row.get("external_reference_count") or 0) > 0
        ),
        "hash_verified_count": sum(
            1 for row in rows if row.get("hash_matches_declared") is True
        ),
    }


def collect(*, verify_hashes: bool = False) -> dict[str, Any]:
    inventory = remote_inventory(verify_hashes=verify_hashes)
    raw = inventory.get("snapshots") or []
    if not isinstance(raw, list):
        raise SnapshotRetentionError("inventory snapshots is not a list")
    reference_scan_complete = inventory.get("reference_scan_complete")
    if not isinstance(reference_scan_complete, bool):
        reference_scan_complete = False
    blockers = inventory.get("reference_scan_blockers") or []
    if not isinstance(blockers, list):
        blockers = ["reference-scan-blocker-shape-invalid"]
        reference_scan_complete = False
    blocker_count = inventory.get("reference_scan_blocker_count")
    if not isinstance(blocker_count, int) or isinstance(blocker_count, bool):
        blocker_count = len(blockers)
        reference_scan_complete = False
    rows = select_retention(
        [row for row in raw if isinstance(row, dict)],
        reference_scan_complete=reference_scan_complete,
    )
    return {
        "schema": 1,
        "kind": "aoe2war-db-snapshot-retention",
        "generated_at": utc_now(),
        "mode": "READ_ONLY",
        "delete_enabled": False,
        "verify_hashes": verify_hashes,
        "reference_census": {
            "complete": reference_scan_complete,
            "files_scanned": int(inventory.get("reference_scan_files") or 0),
            "bytes_scanned": int(inventory.get("reference_scan_bytes") or 0),
            "blocker_count": blocker_count,
            "blockers": [str(item) for item in blockers[:100]],
        },
        "policy": {
            key: value
            for key, value in policy().items()
            if key not in {"production_host"}
        },
        "summary": summarize(rows),
        "rows": rows,
        "apply": {
            "available": False,
            "reason": (
                "V1 is inventory/plan only. Retirement requires a separately "
                "reviewed sealed-ledger/apply lane with release-lock and exact "
                "pre-unlink identity reproof."
            ),
        },
    }


def gib(value: object) -> str:
    return f"{int(value or 0) / (1024 ** 3):.3f} GiB"


def print_status(payload: dict[str, Any], *, include_rows: bool) -> None:
    summary = payload["summary"]
    print("⚔️  AOE2WAR DATABASE SNAPSHOT RETENTION")
    print()
    print("Mode:        READ ONLY")
    print(
        f"Snapshots:   {summary['snapshot_count']} · "
        f"{gib(summary['snapshot_bytes'])}"
    )
    print(
        f"Candidates:  {summary['candidate_count']} · "
        f"{gib(summary['candidate_bytes'])}"
    )
    print(f"Ambiguous:   {summary['ambiguous_count']}")
    print(
        "Referenced:  "
        f"{summary['externally_referenced_count']}"
    )
    print(
        "Hash verified:"
        f" {summary['hash_verified_count']}"
        + (" (full-body verification requested)" if payload["verify_hashes"] else "")
    )
    reference_census = payload.get("reference_census") or {}
    print(
        "References:  "
        + ("COMPLETE" if reference_census.get("complete") else "INCOMPLETE")
        + f" · blockers={reference_census.get('blocker_count', '—')}"
    )
    print("Delete:      DISABLED")
    print()
    print("Retention:")
    for key, count in summary["retention_counts"].items():
        print(f"  {key:<20} {count}")
    if include_rows:
        print()
        print("Plan:")
        for row in payload["rows"]:
            print(
                f"  {row['retention_class']:<20} "
                f"{row['size_bytes'] / (1024 ** 2):8.1f} MiB  "
                f"{row['relative_path']}"
            )
            print(
                f"    {row['classification']} · "
                f"{row['retention_reason']}"
            )
    print()
    print("No snapshots were changed.")


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description=(
            "AoE2WAR read-only deploy database snapshot inventory and "
            "tiered-retention planner"
        )
    )
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("status", "plan"):
        q = sub.add_parser(name)
        q.add_argument("--json", action="store_true")
        q.add_argument(
            "--verify-hashes",
            action="store_true",
            help=(
                "read and SHA-256 hash snapshot bodies; default uses sealed "
                "migration receipt hashes and metadata only"
            ),
        )
    return p


def main() -> int:
    args = parser().parse_args()
    payload = collect(verify_hashes=bool(args.verify_hashes))
    if args.json:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print_status(payload, include_rows=args.command == "plan")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (SnapshotRetentionError, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
