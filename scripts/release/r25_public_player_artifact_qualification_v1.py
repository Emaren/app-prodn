#!/usr/bin/env python3
"""Source-only, fail-closed inspection of the exact R25 public-player CI runtime.

NEVER deploys, extracts, changes services, connects to SQL, or touches credentials.
It is not a public release permit or a rollback controller.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile

SOURCE = "6662c33a0ecf25e5b4bd11283fe98a4842a69eb0"
CI_RUN = 42848226522
ARTIFACT_ID = 13780260542
ZIP_SHA256 = "f13b092b7e223c7346067ca023467d8649f526bb722b6c591e4092999f6bf076"
ARCHIVE_SHA256 = "37987d4e08682a86549e7cd89bb0792ef2e4b1652ff30c85abed964190b9b5a4"
MANIFEST_SHA256 = "e0502a16e0936689c39c0d6f1276913c9f19ab213a2477af4fba7ef05282e845"
TREE_SHA256 = "5c06b08b549c17af0396f355d46897c1935463ce38b2aecf8ac2693f2f74f64f"
BUILD_ID = "brqExtuPGWtj1iKPCdur-"
BUILD_VERSION = "20261110155135-a76e21b2b6"
FILE_COUNT = 45044
ARCHIVE_BYTES = 615988730
PIN = {
    "source_sha": SOURCE, "build_id": BUILD_ID, "build_version": BUILD_VERSION,
    "archive_sha256": ARCHIVE_SHA256, "manifest_sha256": MANIFEST_SHA256,
    "tree_sha256": TREE_SHA256, "files": FILE_COUNT, "archive_bytes": ARCHIVE_BYTES,
}

class Hold(ValueError):
    pass

def require(ok: bool, why: str) -> None:
    if not ok:
        raise Hold("HOLD:R25_PUBLIC_PLAYER_ARTIFACT_" + why)

def canonical(data: object) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()

def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def digest_file(p: Path) -> str:
    h = hashlib.sha256()
    # Avoid following last-component symlinks even when race is attempted.
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    with os.fdopen(fd, "rb") as f:
        for part in iter(lambda: f.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()

def secure_file(p: Path, size_limit: int | None = None) -> None:
    st = p.lstat()
    require(stat.S_ISREG(st.st_mode), "NOT_REGULAR_" + p.name)
    require(st.st_nlink == 1, "HARDLINK_" + p.name)
    require(st.st_mode & 0o022 == 0, "WRITABLE_BY_GROUP_OR_OTHER_" + p.name)
    if size_limit is not None:
        require(0 < st.st_size <= size_limit, "SIZE_" + p.name)

def normalized_archive_path(raw: str) -> str:
    require(type(raw) is str and raw and "\x00" not in raw, "UNSAFE_PATH")
    require("\\" not in raw and not raw.startswith("/"), "UNSAFE_PATH")
    parts = raw.split("/")
    require(all(part not in ("", ".", "..") for part in parts), "UNSAFE_PATH")
    require(len(raw) <= 2048 and len(parts) <= 96, "UNSAFE_PATH")
    return raw

def symlink_destination(path: str, target: str) -> str:
    require(type(target) is str and target and not target.startswith("/") and
            "\x00" not in target and "\\" not in target, "UNSAFE_SYMLINK")
    pieces = list(PurePosixPath(path).parts[:-1])
    for part in target.split("/"):
        if part in ("", "."): continue
        if part == "..":
            require(bool(pieces), "SYMLINK_ESCAPES_ARCHIVE")
            pieces.pop()
        else:
            pieces.append(part)
    return normalized_archive_path("/".join(pieces))

def verify_package(directory: Path, expected: dict = PIN) -> dict:
    root = directory.absolute()
    require(root.is_dir() and not root.is_symlink(), "INVALID_STAGE_DIRECTORY")
    # Explicit one-use artifact input: refuse undeclared sibling media.
    actual = {p.name for p in root.iterdir()}
    require(actual == {"runtime.tar.gz", "artifact.json"}, "STAGE_UNEXPECTED_FILES")
    archive = root / "runtime.tar.gz"
    receipt_path = root / "artifact.json"
    secure_file(archive)
    secure_file(receipt_path, 65536)
    require(archive.stat().st_size == expected["archive_bytes"], "ARCHIVE_SIZE")
    require(digest_file(archive) == expected["archive_sha256"], "ARCHIVE_SHA")
    receipt = json.loads(receipt_path.read_bytes())
    require(type(receipt) is dict and receipt.get("schema") == "aoe2war.runtime-artifact.v1",
            "RECEIPT_SCHEMA")
    for key in ("source_sha", "build_id", "build_version", "tree_sha256", "files"):
        require(receipt.get(key) == expected[key], "RECEIPT_" + key.upper())
    require(receipt.get("archive") == "runtime.tar.gz" and
            receipt.get("format") == "tar.gz" and
            receipt.get("bytes") == expected["archive_bytes"] and
            receipt.get("sha256") == expected["archive_sha256"] and
            receipt.get("manifest_sha256") == expected["manifest_sha256"],
            "RECEIPT_ARCHIVE_IDENTITY")
    require(receipt.get("machine") == "x86_64" and
            receipt.get("node_version") == "v22.22.0" and
            receipt.get("readonly_backend_upstream") == "http://127.0.0.1:3331",
            "CI_RUNTIME_ARCHITECTURE")

    observed = {}
    source_marker = None
    manifest_bytes = None
    with tarfile.open(archive, "r|gz") as tar:
        for member in tar:
            name = normalized_archive_path(member.name)
            require(name not in observed, "DUPLICATE_ENTRY")
            require(member.isfile() or member.issym(), "SPECIAL_OR_HARDLINK_ENTRY")
            require(member.uid == 0 and member.gid == 0, "ARCHIVE_UID_OR_GID")
            # POSIX symlinks conventionally report mode 0777, but symlink
            # mode bits do not grant write permission to their target. The
            # signed CI manifest still pins each link's exact mode/target,
            # its destination must stay inside this archive, and links may
            # never be an extracted parent. Regular files stay nonwritable.
            if member.isfile():
                require(member.mode & 0o022 == 0, "ARCHIVE_WRITABLE_BY_GROUP_OR_OTHER")
            row = {"path": name, "mode": member.mode}
            if member.isfile():
                require(member.size >= 0 and member.size <= (2**31), "ARCHIVE_ENTRY_SIZE")
                reader = tar.extractfile(member)
                require(reader is not None, "ARCHIVE_UNREADABLE_ENTRY")
                h = hashlib.sha256()
                payload = bytearray() if name in (".aoe2war-runtime-manifest.json", ".aoe2war-source-sha") else None
                size = 0
                while True:
                    block = reader.read(1024 * 1024)
                    if not block:break
                    size += len(block)
                    require(size <= member.size, "ARCHIVE_STREAM_SIZE")
                    h.update(block)
                    if payload is not None:
                        require(len(payload) + len(block) <= 15_000_000, "MANIFEST_SIZE_LIMIT")
                        payload.extend(block)
                require(size == member.size, "ARCHIVE_STREAM_SIZE")
                row.update(type="file", size=size, sha256=h.hexdigest())
                if name == ".aoe2war-runtime-manifest.json":
                    manifest_bytes = bytes(payload)
                if name == ".aoe2war-source-sha":
                    source_marker = bytes(payload)
            else:
                destination = symlink_destination(name, member.linkname)
                row.update(type="symlink", target=member.linkname, destination=destination)
            observed[name] = row
            require(len(observed) <= expected["files"] + 2, "ARCHIVE_FILE_COUNT_BOUND")
    require(manifest_bytes is not None and source_marker == (expected["source_sha"] + "\n").encode(),
            "MANIFEST_OR_SOURCE_MARKER")
    require(sha(manifest_bytes) == expected["manifest_sha256"], "MANIFEST_SHA")
    manifest = json.loads(manifest_bytes)
    require(type(manifest) is dict and manifest.get("schema") == "aoe2war.runtime-artifact.v1",
            "INNER_SCHEMA")
    for key in ("source_sha", "build_id", "build_version", "tree_sha256", "files"):
        require(manifest.get(key) == expected[key], "INNER_" + key.upper())
    rows = manifest.get("rows")
    require(type(rows) is list and len(rows) == expected["files"],
            "INNER_FILE_COUNT")
    require(sha(canonical(rows)) == expected["tree_sha256"], "TREE_SHA")
    in_manifest = {}
    for row in rows:
        require(type(row) is dict, "MANIFEST_ROW_TYPE")
        path = normalized_archive_path(row.get("path"))
        require(path not in in_manifest, "MANIFEST_DUPLICATE_PATH")
        in_manifest[path] = row
    require(len(in_manifest) == len(observed) - 2, "ARCHIVE_MANIFEST_CARDINALITY")
    symlinks = {p for p,r in observed.items() if r["type"] == "symlink"}
    for path, actual_row in observed.items():
        if path.startswith(".aoe2war-"):continue
        expected_row = in_manifest.get(path)
        require(expected_row is not None, "UNDECLARED_ARCHIVE_PATH")
        # Compare each individual file hash, byte size, mode, and symlink target.
        for key in ("path", "type", "mode", "sha256", "size", "target"):
            if key in actual_row or key in expected_row:
                require(actual_row.get(key) == expected_row.get(key),
                        "ARCHIVE_ROW_MISMATCH_" + key.upper())
        for prefix in ("/".join(path.split("/")[:n]) for n in range(1,len(path.split("/")))):
            require(prefix not in symlinks, "SYMLINK_PARENT_ESCAPE")
        if actual_row["type"] == "symlink":
            require(actual_row["destination"] in observed, "SYMLINK_TARGET_MISSING")
    for name in (".aoe2war-runtime-manifest.json", ".aoe2war-source-sha"):
        require(observed[name]["type"] == "file", "SPECIAL_MANIFEST_FILE")
    return {
        "status": "PASS_SOURCE_ONLY_ARTIFACT_BYTE_AND_ENTRY_ADMISSION",
        "source_sha": expected["source_sha"], "build_id": expected["build_id"],
        "build_version": expected["build_version"],
        "inner_archive_sha256": expected["archive_sha256"],
        "manifest_sha256": expected["manifest_sha256"],
        "file_count": expected["files"],
        "deployment_authorized": False,
        "financial_operations_authorized": False,
        "same_slot_rollback_qualified": False,
        "owner_central_physical_approval_still_required": True,
    }

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify-dir", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = verify_package(args.verify_dir)
    except (Hold, OSError, EOFError, json.JSONDecodeError, tarfile.TarError) as exc:
        print(json.dumps({"status": "HOLD_PUBLIC_PLAYER_ARTIFACT",
                          "reason": str(exc)[:280],
                          "deployment_authorized": False}, sort_keys=True))
        raise SystemExit(2)
    print(json.dumps(result, sort_keys=True))

if __name__ == "__main__":
    main()
