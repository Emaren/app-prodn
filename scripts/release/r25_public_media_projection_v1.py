#!/usr/bin/env python3
"""Source-only, hash-pinned reconciliation for a missing R25 managed portrait.

The live R25 bind is <media_root>/avatar -> /run/aoe2war-public-media/avatar.
An old deployed asset may instead exist at <media_root>/uploads/managed-assets/avatar.
This module NEVER changes systemd, Nginx, SQL, sessions, finance, or wallets.
The CLI has INSPECT ONLY. The atomic writer is callable by a separately
approved nonfinancial release program, never by an unattended CLI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat

CANONICAL_ROOT = Path("/mnt/HC_Volume_105319120/aoe2-managed-assets")
FILE_STEM = "sniper-1781562832558-257d25a4"
ALLOWED_FILES = {
    FILE_STEM + ".png": ("dcb7e42340df8f817d3c14f3e28b4bd30c9109e98bb4decd5b59c52af33b5530", 1911925),
    FILE_STEM + ".webp": ("c153e4bcd4c83dc4c058969eed45dcea4a8ddf9d179df635a4e6dbb3bf19f135", 338284),
    FILE_STEM + ".card.webp": ("87cd2af1c80e7df61056bbee1ac7efc99618f8f5cab6e1e9ec7dee86c3ed1f45", 83646),
    FILE_STEM + ".thumb.webp": ("ada9a6b655adc88ed98efeec8cf6d4300cc79783e70bcc233740328da74b310c", 17866),
}
SHA256 = re.compile(r"^[0-9a-f]{64}$")
OLD_PREFIX = ("uploads", "managed-assets", "avatar")
NEW_PREFIX = ("avatar",)


class MediaHold(ValueError):
    pass


def hold(reason: str) -> None:
    raise MediaHold("HOLD_R25_MEDIA_" + reason)


def regular_file_no_links(p: Path, max_bytes: int = 2_500_000) -> bytes:
    try:
        flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(p, flags)
        with os.fdopen(fd, "rb") as f:
            s = os.fstat(f.fileno())
            if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1 or s.st_size <= 0 or s.st_size > max_bytes:
                hold("FILE_TYPE_SIZE_OR_LINK")
            if stat.S_IMODE(s.st_mode) & 0o002:
                hold("WORLD_WRITABLE_SOURCE")
            body = f.read(max_bytes + 1)
            if len(body) != s.st_size:
                hold("SOURCE_CHANGED_DURING_READ")
            return body
    except OSError:
        hold("SOURCE_OR_TARGET_UNREADABLE")


def checked_directory(root: Path, prefix: tuple[str, ...]) -> Path:
    # Explicitly prohibit symbolic links anywhere inside the media root.
    cur = root
    try:
        initial = cur.lstat()
    except OSError:
        hold("ROOT_MISSING")
    if not stat.S_ISDIR(initial.st_mode) or stat.S_ISLNK(initial.st_mode):
        hold("ROOT_SYMLINK_OR_NOT_DIR")
    for component in prefix:
        if not component or "/" in component or component in (".", ".."):
            hold("UNSAFE_DIRECTORY_COMPONENT")
        cur = cur / component
        try:
            s = cur.lstat()
        except OSError:
            hold("PROJECTION_DIRECTORY_MISSING")
        if not stat.S_ISDIR(s.st_mode) or stat.S_ISLNK(s.st_mode):
            hold("PROJECTION_SYMLINK_OR_NOT_DIR")
    return cur


def inspect(root: Path = CANONICAL_ROOT, expected: dict = ALLOWED_FILES) -> dict:
    source = checked_directory(root, OLD_PREFIX)
    projection = checked_directory(root, NEW_PREFIX)
    if source.samefile(projection):
        hold("SOURCE_IS_PROJECTION")
    if set(expected) != set(ALLOWED_FILES) or any(not SHA256.fullmatch(sha) or size <= 0
                           for sha, size in expected.values()):
        hold("UNPINNED_MANIFEST")
    missing = []
    already_present = []
    for name, (sha256, size) in sorted(expected.items()):
        if not re.fullmatch(r"sniper-1781562832558-257d25a4(?:\.card|\.thumb)?\.(?:png|webp)", name):
            hold("UNAPPROVED_ASSET_NAME")
        source_body = regular_file_no_links(source / name)
        if len(source_body) != size or hashlib.sha256(source_body).hexdigest() != sha256:
            hold("SOURCE_HASH_OR_SIZE_MISMATCH")
        dst = projection / name
        if dst.is_symlink():
            hold("DESTINATION_SYMLINK")
        try:
            body = regular_file_no_links(dst)
        except MediaHold as e:
            if str(e) != "HOLD_R25_MEDIA_SOURCE_OR_TARGET_UNREADABLE":
                raise
            try:
                dst.lstat()
            except FileNotFoundError:
                pass
            except OSError:
                hold("DESTINATION_STAT_FAILED")
            else:
                hold("DESTINATION_UNREADABLE")
            missing.append(name)
            continue
        if hashlib.sha256(body).hexdigest() != sha256 or len(body) != size:
            hold("CONFLICTING_DESTINATION")
        already_present.append(name)
    entries = [{"filename": name, "sha256": sha, "size": size}
               for name, (sha, size) in sorted(expected.items())]
    manifest_digest = hashlib.sha256(json.dumps(
        entries, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return {"schema": "aoe2war.r25.nonfinancial-managed-media-projection.v1",
            "status": "PASS_SOURCE_HASHES_PROJECTION_HELD_FOR_CENTRAL",
            "source_root": str(source), "projection_root": str(projection),
            "assets": entries, "import_needed": missing,
            "already_present": already_present,
            "manifest_sha256": manifest_digest,
            "read_only": True, "release_authorized": False,
            "production_mutation": False, "finance_authorized": False}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inspect", action="store_true", required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(inspect(), sort_keys=True))
        return 0
    except MediaHold as exc:
        print(json.dumps({"status": str(exc), "read_only": True,
                          "production_mutation": False,
                          "finance_authorized": False}, sort_keys=True))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
