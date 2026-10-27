#!/usr/bin/env python3
"""Session D Phase 10: APFS copy-on-write fixture ONLY.

All writes are confined to a private TemporaryDirectory in the system temp root.
The actual Watcher distribution is read ONLY to establish same-device/APFS
eligibility. No option to point this program at a production file or to apply.
"""
from __future__ import annotations

import ctypes
import hashlib
import json
import plistlib
import os
from pathlib import Path
import platform
import shutil
import stat
import subprocess
import sys
import tempfile

WATCHER_DIST = Path.home() / "projects/AoE2HDBets/aoe2-watcher/dist"
CHUNK_SIZE = 1024 * 1024
FIXTURE_SIZE = 4 * CHUNK_SIZE
XATTR_NAME = "com.aoe2war.phase10.fixture"


class Hold(Exception):
    pass


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(CHUNK_SIZE), b""):
            h.update(chunk)
    return h.hexdigest()


def xattr_cli(args: list[str]) -> bytes:
    """Use macOS's system xattr utility: Python os.*xattr is Linux-only."""
    p = subprocess.run(
        ["/usr/bin/xattr", *args],
        capture_output=True, timeout=15, check=False,
    )
    if p.returncode != 0:
        raise Hold("MACOS_XATTR_COMMAND_FAILED: fixture only")
    return p.stdout


def fixture_xattrs_sha256(path: Path) -> dict[str, str]:
    """All xattr names and exact bytes, not xattr -l's formatted text."""
    listed = xattr_cli([str(path)])
    names = listed.decode("utf-8", "surrogateescape").splitlines()
    if XATTR_NAME not in names or len(names) != len(set(names)):
        raise Hold("FIXTURE_XATTR_MARKER_MISSING_OR_DUPLICATE")
    result = {}
    for name in sorted(names):
        try:
            hexadecimal = xattr_cli(["-p", "-x", name, str(path)])
            value = bytes.fromhex(hexadecimal.decode("ascii"))
        except (ValueError, UnicodeError) as exc:
            raise Hold("FIXTURE_XATTR_HEX_DECODE_FAILED") from exc
        result[name] = hashlib.sha256(value).hexdigest()
    if result[XATTR_NAME] != hashlib.sha256(b"phase10-marker").hexdigest():
        raise Hold("FIXTURE_XATTR_MARKER_BYTES_MISMATCH")
    return result


def metadata(path: Path) -> dict:
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode):
        raise Hold("not a regular fixture file")
    return {
        "mode": stat.S_IMODE(s.st_mode), "uid": s.st_uid, "gid": s.st_gid,
        "flags": getattr(s, "st_flags", 0), "mtime_ns": s.st_mtime_ns,
        "xattrs_sha256": fixture_xattrs_sha256(path),
    }


def clonefile(src: Path, dst: Path) -> None:
    if dst.exists() or dst.is_symlink():
        raise Hold("clone destination already exists")
    lib = ctypes.CDLL("/usr/lib/libSystem.B.dylib", use_errno=True)
    fun = lib.clonefile
    fun.argtypes = (ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int)
    fun.restype = ctypes.c_int
    if fun(os.fsencode(src), os.fsencode(dst), 0) != 0:
        err = ctypes.get_errno()
        raise OSError(err, "Darwin clonefile(2) failed; NO COPY FALLBACK")


def free_bytes(path: Path) -> int:
    s = os.statvfs(path)
    return s.f_bavail * s.f_frsize


def fsync_file(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def assert_identity(a: Path, b: Path) -> None:
    if sha256(a) != sha256(b) or metadata(a) != metadata(b):
        raise Hold("fixture byte hash or required metadata changed")


def run() -> dict:
    if sys.platform != "darwin" or platform.system() != "Darwin":
        raise Hold("NOT_DARWIN: APFS proof must execute on the operator Mac")

    if not WATCHER_DIST.is_dir() or WATCHER_DIST.is_symlink():
        raise Hold("WATCHER_DIST_NOT_A_REAL_DIRECTORY: no fixture attempted")

    # Darwin stat -f %T is the FILE TYPE, not the filesystem type.
    # Identify the known Data mount through diskutil's structured volume report
    # and require the Watcher directory to reside on that exact device.
    data_mount = Path("/System/Volumes/Data")
    if not data_mount.is_dir() or data_mount.is_symlink():
        raise Hold("DATA_MOUNT_UNAVAILABLE: no fixture attempted")
    target_dev = WATCHER_DIST.stat().st_dev
    if data_mount.stat().st_dev != target_dev:
        raise Hold("WATCHER_NOT_ON_APFS_DATA_VOLUME: no fixture attempted")
    filesystem = subprocess.run(
        ["/usr/sbin/diskutil", "info", "-plist", str(data_mount)],
        capture_output=True, check=False, timeout=15,
    )
    if filesystem.returncode != 0:
        raise Hold("DISKUTIL_DATA_VOLUME_QUERY_FAILED: no fixture attempted")
    try:
        info = plistlib.loads(filesystem.stdout)
    except (ValueError, TypeError, plistlib.InvalidFileException) as exc:
        raise Hold("DISKUTIL_INVALID_VOLUME_PLIST: no fixture attempted") from exc
    if not isinstance(info, dict) or str(info.get("FilesystemType", "")).lower() != "apfs":
        raise Hold("DATA_VOLUME_NOT_CONFIRMED_APFS: no fixture attempted")

    temp_base = Path(tempfile.gettempdir())
    if temp_base.stat().st_dev != target_dev:
        raise Hold("TMPDIR_NOT_SAME_DEVICE: no fixture attempted")

    with tempfile.TemporaryDirectory(prefix="aoe2war-phase10-fixture-", dir=temp_base) as td:
        root = Path(td)
        dist = root / "dist"
        site = root / "site" / "public"
        dist.mkdir(mode=0o700)
        site.mkdir(parents=True)
        link = site / "downloads"
        link.symlink_to(dist, target_is_directory=True)
        if not link.samefile(dist):
            raise Hold("FIXTURE_DOWNLOAD_SYMLINK_IDENTITY_FAIL")

        src = dist / "canonical.AppImage"
        alias = dist / "legacy-alias.AppImage"
        payload = os.urandom(FIXTURE_SIZE)
        # Independently write the two files: no clone is used to make inputs.
        for target in (src, alias):
            with target.open("xb") as out:
                out.write(payload)
                out.flush()
                os.fsync(out.fileno())
            os.chmod(target, 0o600)
            os.utime(target, ns=(1700000000000000000, 1700000000000000000))
            xattr_cli(["-w", XATTR_NAME, "phase10-marker", str(target)])

        if src.stat().st_ino == alias.stat().st_ino:
            raise Hold("FIXTURE_FILES_ARE_HARDLINKS")
        assert_identity(src, alias)
        initial_inode = alias.stat().st_ino
        initial_hash = sha256(src)
        before_free = free_bytes(root)
        clone_candidate = dist / ".clone-stage"
        private_backup_dir = root / "private-backup"
        private_backup_dir.mkdir(mode=0o700)
        original_backup = private_backup_dir / "alias-original"
        cow_probe = dist / ".cow-probe"

        clonefile(src, cow_probe)
        if cow_probe.stat().st_ino == src.stat().st_ino:
            raise Hold("CLONE_IS_HARDLINK")
        assert_identity(src, cow_probe)
        with cow_probe.open("r+b") as fd:
            fd.seek(111)
            fd.write(b"\x00" if payload[111] != 0 else b"\x01")
            fd.flush()
            os.fsync(fd.fileno())
        if sha256(src) != initial_hash or sha256(cow_probe) == initial_hash:
            raise Hold("COPY_ON_WRITE_ISOLATION_FAILED")
        cow_probe.unlink()

        clonefile(src, clone_candidate)
        assert_identity(alias, clone_candidate)
        fsync_file(clone_candidate)
        os.link(alias, original_backup)
        if original_backup.stat().st_ino != initial_inode:
            raise Hold("ROLLBACK_LINK_NOT_ORIGINAL")
        replaced = False
        try:
            os.replace(clone_candidate, alias)
            replaced = True
            assert_identity(src, alias)
            if not link.samefile(dist) or sha256(link / alias.name) != initial_hash:
                raise Hold("WEBSITE_ALIAS_CONTINUITY_FAILED")
            if alias.stat().st_ino == initial_inode:
                raise Hold("REPLACEMENT_DID_NOT_CHANGE_INODE")
        finally:
            # Demonstrate pre-commit rollback to EXACT original inode on fixture.
            if replaced and original_backup.exists():
                os.replace(original_backup, alias)

        if alias.stat().st_ino != initial_inode:
            raise Hold("ROLLBACK_INODE_RESTORE_FAILED")
        assert_identity(src, alias)
        if not link.samefile(dist) or sha256(link / alias.name) != initial_hash:
            raise Hold("ROLLBACK_DOWNLOAD_ALIAS_FAIL")
        if original_backup.exists() or clone_candidate.exists():
            raise Hold("FIXTURE_STAGING_LEFTOVERS")

        after_free = free_bytes(root)
        return {
            "status": "PASS_APFS_FIXTURE_ONLY",
            "clonefile_syscall": "SUCCESS_NO_FALLBACK",
            "copy_on_write_write_isolation": "PASS",
            "metadata_mode_owner_flags_mtime_xattr": "PASS",
            "regular_file_and_separate_inode": "PASS",
            "download_symlink_continuity_before_after": "PASS",
            "temporary_original_hardlink_rollback": "PASS_ORIGINAL_INODE",
            "fixture_size_bytes_each": FIXTURE_SIZE,
            "free_bytes_before_test": before_free,
            "free_bytes_after_test_before_temp_cleanup": after_free,
            "free_delta_bytes_not_reclaim_evidence": after_free - before_free,
            "actual_watcher_files_touched": 0,
            "actual_watcher_reclaimed_bytes": 0,
            "fixture_cleaned_on_normal_exit": True,
            "warning": "Does not test real release metadata/ACL/URLs/active readers, and does not authorize a real-file swap",
        }


def main() -> int:
    try:
        result = run()
    except (Hold, OSError, subprocess.SubprocessError) as error:
        result = {
            "status": "HOLD_APFS_FIXTURE_NOT_VERIFIED",
            "reason": str(error), "actual_watcher_files_touched": 0,
            "actual_watcher_reclaimed_bytes": 0,
        }
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["status"] == "PASS_APFS_FIXTURE_ONLY" else 2


if __name__ == "__main__":
    raise SystemExit(main())
