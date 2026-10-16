#!/usr/bin/env python3
"""Read-only, fail-closed verification of an operator's encrypted DB checkpoint.

This verifies actual local ciphertext bytes and the accompanying SHA-256
manifests. The human checkpoint records a completed CMS decrypt/pg_restore
decode, but it does NOT prove an isolated database restore, full recovery
freshness, or any on-host OS patch. No private keys are ever opened.
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
import re
import stat
from typing import Any

DIGEST = re.compile(r"^[0-9a-f]{64}$")
SOURCE_SHA = re.compile(r"^[0-9a-f]{40}$")
HEADER = "AOE2WAR HOST MAINTENANCE DATABASE CHECKPOINT"
MAX_METADATA = 16 * 1024


class CheckpointError(ValueError):
    """Missing, changed, stale, or untrusted checkpoint evidence."""


def _open_regular(path: Path, *, max_bytes: int | None = None):
    """Pin a descriptor, reject symlinks and non-regular files before reading."""
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    if not hasattr(os, "O_NOFOLLOW"):
        raise CheckpointError("no symlink-safe open available")
    flags |= os.O_NOFOLLOW
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise CheckpointError(f"checkpoint file cannot be opened: {path.name}") from exc
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size <= 0:
            raise CheckpointError(f"not a nonempty regular file: {path.name}")
        if max_bytes is not None and info.st_size > max_bytes:
            raise CheckpointError(f"checkpoint metadata exceeds limit: {path.name}")
        return os.fdopen(fd, "rb")
    except BaseException:
        os.close(fd)
        raise


def _metadata(path: Path) -> str:
    with _open_regular(path, max_bytes=MAX_METADATA) as stream:
        try:
            return stream.read(MAX_METADATA + 1).decode("utf-8")
        except UnicodeDecodeError as exc:
            raise CheckpointError(f"invalid UTF-8 checkpoint metadata: {path.name}") from exc


def _manifest_digest(directory: Path, filename: str) -> str:
    manifest = _metadata(directory / (filename + ".sha256"))
    lines = manifest.splitlines()
    if len(lines) != 1:
        raise CheckpointError(f"invalid SHA-256 manifest: {filename}")
    match = re.fullmatch(r"([0-9a-f]{64})  " + re.escape(filename), lines[0])
    if not match:
        raise CheckpointError(f"SHA-256 manifest names unexpected file: {filename}")
    return match.group(1)


def _sha256_file(path: Path) -> str:
    checksum = hashlib.sha256()
    with _open_regular(path) as stream:
        while chunk := stream.read(1024 * 1024):
            checksum.update(chunk)
    return checksum.hexdigest()


def _time(value: str, field: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CheckpointError(f"invalid {field}") from exc
    if parsed.tzinfo is None:
        raise CheckpointError(f"{field} has no timezone")
    return parsed.astimezone(timezone.utc)


def inspect_checkpoint(
    directory: Path,
    *,
    now: datetime | None = None,
    max_age_hours: float = 24.0,
) -> dict[str, Any]:
    """Return a bounded report; a PASS means a hash-bound DB checkpoint only."""
    if not 0 < max_age_hours <= 720:
        raise CheckpointError("max_age_hours must be between 0 and 720")
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        raise CheckpointError("now must have a timezone")
    current = current.astimezone(timezone.utc)
    if directory.is_symlink() or not directory.is_dir():
        raise CheckpointError("checkpoint directory is missing or symlinked")

    for name in ("database.cms", "checkpoint.txt"):
        expected = _manifest_digest(directory, name)
        actual = _sha256_file(directory / name)
        if actual != expected:
            raise CheckpointError(f"SHA-256 mismatch: {name}")

    text = _metadata(directory / "checkpoint.txt")
    lines = text.splitlines()
    if not lines or lines[0] != HEADER:
        raise CheckpointError("checkpoint header is not recognized")
    fields: dict[str, str] = {}
    for line in lines[1:]:
        if ": " not in line:
            raise CheckpointError("malformed checkpoint metadata line")
        key, value = line.split(": ", 1)
        if not key or key in fields or not value:
            raise CheckpointError("duplicate or missing checkpoint metadata field")
        fields[key] = value

    if fields.get("Source") != "hel1 / aoe2hd_db":
        raise CheckpointError("checkpoint source is not the approved production database")
    if fields.get("Format") != "PostgreSQL custom archive / CMS AES-256":
        raise CheckpointError("checkpoint encryption format does not match this contract")
    if not SOURCE_SHA.fullmatch(fields.get("Operator Git HEAD", "")):
        raise CheckpointError("checkpoint has no exact operator source identity")
    for key in ("Capture", "Encryption", "Decryption", "Full archive decode"):
        if fields.get(key) != "PASS":
            raise CheckpointError(f"checkpoint missing recorded success: {key}")
    if fields.get("Production database mutated") != "NO":
        raise CheckpointError("checkpoint is not read-only for the production database")
    if fields.get("WoloChain mutated") != "NO":
        raise CheckpointError("checkpoint is not read-only for WoloChain")
    if fields.get("Isolated database restoration") != "NOT PERFORMED":
        raise CheckpointError("unsupported independent restoration claim")
    declared = fields.get("Ciphertext SHA-256", "")
    if not DIGEST.fullmatch(declared) or declared != _manifest_digest(directory, "database.cms"):
        raise CheckpointError("ciphertext digest conflicts with the checkpoint metadata")

    started = _time(fields.get("Capture started UTC", ""), "capture start")
    finished = _time(fields.get("Verification finished UTC", ""), "capture verification")
    if finished < started:
        raise CheckpointError("verification predates capture")
    if finished > current:
        raise CheckpointError("checkpoint verification is in the future")
    age_hours = (current - finished).total_seconds() / 3600
    return {
        "schema": 1,
        "kind": "aoe2war-host-database-checkpoint-evidence",
        "status": "FRESH" if age_hours <= max_age_hours else "STALE",
        "ciphertext_integrity": "SHA256_VERIFIED",
        "recorded_capture_and_decode": "PASS_SELF_REPORTED",
        "isolated_database_restore": "NOT_PERFORMED",
        "wolo_consensus_snapshot": "NOT_VERIFIED_BY_THIS_COMMAND",
        "source": "hel1 / aoe2hd_db",
        "operator_source_sha": fields["Operator Git HEAD"],
        "ciphertext_sha256": declared,
        "started_at": started.isoformat().replace("+00:00", "Z"),
        "finished_at": finished.isoformat().replace("+00:00", "Z"),
        "age_hours": round(age_hours, 3),
        "freshness_limit_hours": max_age_hours,
        "mutates_production": False,
        "reads_private_keys": False,
    }
