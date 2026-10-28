#!/usr/bin/env python3
"""Bounded reversible review of older AoE2WAR handoff scripts in Mac Downloads.

Never touches chat archives, directories or non-script files. Exact owner-approved
batches are moved to Trash; they are NOT purged or counted as reclaimed bytes.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import time

NAME = re.compile(
    r"^(?:AOE2WAR|AoE2WAR|aoe2war|AOE2|aoe2|session|test_session)[-_][A-Za-z0-9._-]+\.(?:py|sh)$"
)
# Names are HINTS, never proof of provenance. High-authority scripts stay held.
PROTECTED = (
    "owner", "enroll", "sign", "key", "secret", "custody", "escrow",
    "settle", "bank", "payment", "wallet", "financial", "restore",
    "recovery", "backup", "receipt", "evidence", "nonce", "deploy",
    "migrat", "release", "stage", "rollback", "permit", "transfer",
    "chat", "conversation", "export", "archive", "history", "model",
)
MAX_FILES = 500
MAX_BYTES = 2 * 1024 * 1024


class Hold(RuntimeError):
    pass


def safe_directory(path: Path) -> None:
    try:
        mode = path.lstat().st_mode
    except OSError as exc:
        raise Hold(f"directory unavailable: {path}") from exc
    if not stat.S_ISDIR(mode) or stat.S_ISLNK(mode):
        raise Hold(f"not a real directory: {path}")


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size > MAX_BYTES:
            raise Hold(f"unsafe script metadata: {path.name}")
        with os.fdopen(fd, "rb", closefd=False) as stream:
            for chunk in iter(lambda: stream.read(65536), b""):
                h.update(chunk)
    finally:
        os.close(fd)
    return h.hexdigest()


def eligible(name: str) -> bool:
    stem = name.rsplit(".", 1)[0].lower()
    return bool(NAME.fullmatch(name)) and not any(term in stem for term in PROTECTED)


def inventory(home: Path, *, min_age_days: int = 7, now: float | None = None) -> dict:
    if not 1 <= min_age_days <= 3650:
        raise Hold("min_age_days must be 1..3650")
    safe_directory(home)
    downloads = home / "Downloads"
    safe_directory(downloads)
    cutoff = (time.time() if now is None else now) - min_age_days * 86400
    candidates = []
    held = {"protected_or_unrecognized": 0, "recent": 0, "unsafe_type": 0}
    for file in sorted(downloads.iterdir(), key=lambda x: x.name):
        if file.suffix.lower() not in {".py", ".sh"}:
            continue
        if not eligible(file.name):
            held["protected_or_unrecognized"] += 1
            continue
        st = file.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or st.st_size > MAX_BYTES:
            held["unsafe_type"] += 1
            continue
        if st.st_mtime > cutoff:
            held["recent"] += 1
            continue
        candidates.append({
            "name": file.name, "bytes": st.st_size, "mtime_ns": st.st_mtime_ns,
            "dev": st.st_dev, "ino": st.st_ino, "sha256": file_hash(file),
        })
        if len(candidates) > MAX_FILES:
            raise Hold("more than 500 candidates; refuse unbounded batch")
    serial = json.dumps({"age": min_age_days, "files": candidates},
                        sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema": 1, "kind": "aoe2war-download-script-review", "status": "PREVIEW",
        "source": str(downloads), "min_age_days": min_age_days,
        "candidate_bytes": sum(x["bytes"] for x in candidates),
        "candidates": candidates, "held": held,
        "plan_sha256": hashlib.sha256(serial).hexdigest(),
        "reclaimed_bytes": 0,
        "policy": "top-level regular old named scripts only; no recursion; no automatic purge",
    }


def move_to_trash(home: Path, *, confirm: str, min_age_days: int = 7,
                  now: float | None = None) -> dict:
    if not re.fullmatch(r"[a-f0-9]{64}", confirm):
        raise Hold("64-character preview plan_sha256 required")
    plan = inventory(home, min_age_days=min_age_days, now=now)
    if confirm != plan["plan_sha256"]:
        raise Hold("preview digest is stale; nothing moved")
    if not plan["candidates"]:
        raise Hold("no eligible scripts; nothing moved")
    trash = home / ".Trash"
    safe_directory(trash)
    downloads = home / "Downloads"
    if trash.stat().st_dev != downloads.stat().st_dev:
        raise Hold("Trash must be on same filesystem")
    dest = trash / ("AoE2WAR-handoff-review-" + confirm[:16])
    if dest.exists() or dest.is_symlink():
        raise Hold("batch already exists; refuse overwrite")
    # Preflight complete set before any move: filenames, bytes, links and hash.
    for row in plan["candidates"]:
        path = downloads / row["name"]
        st = path.lstat()
        if not eligible(path.name) or not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise Hold("candidate type changed; nothing moved")
        if (st.st_dev, st.st_ino, st.st_mtime_ns, st.st_size) != (
            row["dev"], row["ino"], row["mtime_ns"], row["bytes"]
        ) or file_hash(path) != row["sha256"]:
            raise Hold("candidate changed; nothing moved")
    dest.mkdir(mode=0o700)
    moved = []
    try:
        for row in plan["candidates"]:
            os.rename(downloads / row["name"], dest / row["name"])
            moved.append(row["name"])
    except OSError as exc:
        raise Hold(f"PARTIAL_MOVE: {len(moved)} in {dest}; review before retry") from exc
    result = {
        **plan, "status": "TRASHED_NOT_PURGED", "moved": moved,
        "trash_directory": str(dest), "reclaimed_bytes": 0,
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "note": "These bytes remain allocated until the specific Trash batch is separately emptied.",
    }
    receipt = dest / "aoe2war-review-receipt.json"
    receipt.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    receipt.chmod(0o600)
    return result



def purge_reviewed_batch(home: Path, *, confirm: str) -> dict:
    """Irreversibly purge only a previously hash-reviewed, isolated Trash batch."""
    if not re.fullmatch(r"[0-9a-f]{64}", confirm):
        raise Hold("exact 64-character review digest required")
    safe_directory(home)
    trash = home / ".Trash"
    safe_directory(trash)
    dest = trash / ("AoE2WAR-handoff-review-" + confirm[:16])
    safe_directory(dest)
    receipt = dest / "aoe2war-review-receipt.json"
    st_receipt = receipt.lstat()
    if not stat.S_ISREG(st_receipt.st_mode) or st_receipt.st_nlink != 1:
        raise Hold("untrusted batch receipt")
    plan = json.loads(receipt.read_text(encoding="utf-8"))
    if plan.get("plan_sha256") != confirm or plan.get("status") != "TRASHED_NOT_PURGED":
        raise Hold("receipt not exact or already purged")
    rows = plan.get("candidates")
    if not isinstance(rows, list) or not rows or len(rows) > MAX_FILES:
        raise Hold("invalid receipt candidate list")
    names = [row.get("name") for row in rows if isinstance(row, dict)]
    if len(names) != len(rows) or len(set(names)) != len(names) or \
       {x.name for x in dest.iterdir()} != set(names) | {receipt.name}:
        raise Hold("unexpected batch files; no purge")
    for row in rows:
        name = row["name"]
        if not isinstance(name, str) or not eligible(name):
            raise Hold("unexpected protected filename; no purge")
        file = dest / name
        st = file.lstat()
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1 or \
           st.st_dev != row["dev"] or st.st_ino != row["ino"] or \
           st.st_size != row["bytes"] or file_hash(file) != row["sha256"]:
            raise Hold("batch byte/identity drift; no purge")
    before = os.statvfs(home)
    before_free = before.f_bavail * before.f_frsize
    removed = []
    try:
        for row in rows:
            (dest / row["name"]).unlink()
            removed.append(row["name"])
    except OSError as exc:
        raise Hold(
            f"PARTIAL_PURGE: removed {len(removed)} files from {dest}; manual review required"
        ) from exc
    after = os.statvfs(home)
    actual = max(0, after.f_bavail * after.f_frsize - before_free)
    result = {
        **plan, "status": "PURGED_EXACT_REVIEWED_BATCH",
        "purged": removed, "reclaimed_bytes": actual,
        "free_bytes_before": before_free,
        "free_bytes_after": after.f_bavail * after.f_frsize,
        "purged_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    receipt.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
    receipt.chmod(0o600)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--min-age-days", type=int, default=7)
    actions = parser.add_mutually_exclusive_group()
    actions.add_argument("--trash", action="store_true")
    actions.add_argument("--purge", action="store_true")
    parser.add_argument("--ack-irrevocable", action="store_true")
    parser.add_argument("--confirm", help="exact preview or prior Trash batch plan_sha256")
    args = parser.parse_args()
    try:
        if args.purge:
            if not args.ack_irrevocable or not args.confirm:
                raise Hold("--purge requires --ack-irrevocable and --confirm PLAN_SHA256")
            result = purge_reviewed_batch(Path.home(), confirm=args.confirm)
        elif args.trash:
            if args.ack_irrevocable:
                raise Hold("--ack-irrevocable only applies to --purge")
            if not args.confirm:
                raise Hold("--trash requires --confirm PLAN_SHA256")
            result = move_to_trash(Path.home(), confirm=args.confirm,
                                   min_age_days=args.min_age_days)
        else:
            if args.confirm or args.ack_irrevocable:
                raise Hold("confirmation is only valid with --trash or --purge")
            result = inventory(Path.home(), min_age_days=args.min_age_days)
    except (Hold, OSError) as exc:
        print(json.dumps({"status": "HOLD", "error": str(exc)}))
        return 2
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("AOE2WAR DOWNLOAD HANDOFF SCRIPT REVIEW")
        print("Status:", result["status"])
        for row in result["candidates"]:
            print(f"  {row['bytes']:>9} bytes  {row['name']}")
        print("Candidate bytes:", result["candidate_bytes"])
        print("Plan SHA256:", result["plan_sha256"])
        if args.trash:
            print("Moved to:", result["trash_directory"])
            print("NO DISK SPACE RECLAIMED: Trash has not been emptied.")
        elif args.purge:
            print("PURGED exact reviewed batch. Measured reclaimed bytes:", result["reclaimed_bytes"])
        else:
            print("READ ONLY. Opt in with --trash --confirm PLAN_SHA256.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
