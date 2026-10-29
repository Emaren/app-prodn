#!/usr/bin/env python3
"""One exact Mac project-path identity and capacity receipt; no storage scan.

Read-only facts: one `df -Pk` command, no-follow lstat on <=12 explicit
ancestors and one user-supplied target. Never glob, scandir, walk, du,
read project content, delete, reindex, or claim APFS unique recoverable bytes.

0 = bounded target metadata observed AND admission free floor passed (NOT L1 GO)
2 = malformed/unavailable source, unsafe alias/mount or non-native host
3 = BLOCKED_EXTERNAL_MAC_CAPACITY, regardless of other target observations
4 = requested target absent/unlocated, with free floor met
Receipt status has no unconditional PASS or 100%-coverage state.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys

SCHEMA = "aoe2war.mac-exact-source-identity.v1"
FLOOR_KIB = 25 * 1024 * 1024
DATA_MOUNT = "/System/Volumes/Data"
MAX_DEPTH = 12
DF_TIMEOUT_SECONDS = 8
EXIT_OBSERVED_NOT_L1 = 0
EXIT_FAILED_SOURCE = 2
EXIT_EXTERNAL_CAPACITY = 3
EXIT_TARGET_UNKNOWN = 4


def parse_df(stdout: str) -> dict | None:
    """Strict df -Pk APFS Data observation. No inferred physical file sizes."""
    lines = stdout.strip().splitlines()
    if len(lines) != 2 or "1024-blocks" not in lines[0]:
        return None
    fields = lines[1].split()
    if len(fields) != 6 or fields[5] != DATA_MOUNT:
        return None
    filesystem, total, used, available, capacity, mount = fields
    if not (filesystem.startswith("/dev/") and re.fullmatch(r"[0-9]+%", capacity)
            and all(re.fullmatch(r"[0-9]+", x) for x in (total, used, available))):
        return None
    total, used, available = int(total), int(used), int(available)
    if total <= 0 or used > total or available > total:
        return None
    return {"device": filesystem, "total_kib": total, "used_kib": used,
            "ordinary_available_kib": available, "capacity_display": capacity,
            "mount": mount, "accounting": "DF_KIB_GLOBAL_NOT_PROJECT_BYTES"}


def exact_path_identity(home: Path, target: Path) -> dict:
    """No-follow metadata of one explicit path and its bounded ancestors."""
    value = {"requested_path": str(target), "state": "UNKNOWN_TARGET_PATH",
             "checked_components": 0, "errno": None,
             "entry_type": None, "device": None, "inode": None,
             "allocated_bytes": None, "recursive_entries_count": None,
             "original_project_identity": "UNVERIFIED",
             "protect_as_possible_L5": True}
    if (not home.is_absolute() or not target.is_absolute()
            or ".." in home.parts or ".." in target.parts):
        value["state"] = "INVALID_ABSOLUTE_PATH"
        return value
    try:
        relative = target.relative_to(home)
    except ValueError:
        value["state"] = "TARGET_OUTSIDE_EXPLICIT_HOME_SCOPE"
        return value
    if not relative.parts or len(relative.parts) > MAX_DEPTH:
        value["state"] = "TARGET_DEPTH_OR_HOME_ROOT_HOLD"
        return value
    paths = [home] + [home.joinpath(*relative.parts[:i])
                      for i in range(1, len(relative.parts) + 1)]
    home_dev = None
    for path in paths:
        try:
            entry = os.lstat(path)
        except OSError as exc:
            value["errno"] = exc.errno
            value["state"] = (
                "EXACT_PATH_ABSENT_ENOENT" if exc.errno == errno.ENOENT
                else "EXACT_PATH_PERMISSION_HOLD" if exc.errno in
                (errno.EACCES, errno.EPERM) else "EXACT_PATH_STAT_UNKNOWN")
            return value
        value["checked_components"] += 1
        if stat.S_ISLNK(entry.st_mode):
            value["state"] = "SYMLINK_NO_FOLLOW_HOLD"
            return value
        if home_dev is None:
            home_dev = entry.st_dev
        if entry.st_dev != home_dev:
            value["state"] = "FOREIGN_MOUNT_HOLD"
            return value
        if path != target and not stat.S_ISDIR(entry.st_mode):
            value["state"] = "NON_DIRECTORY_ANCESTOR_HOLD"
            return value
    value["state"] = "EXACT_PATH_PRESENT_METADATA_ONLY"
    value["entry_type"] = ("DIRECTORY" if stat.S_ISDIR(entry.st_mode) else
                           "REGULAR" if stat.S_ISREG(entry.st_mode) else "OTHER_HOLD")
    value["device"], value["inode"] = entry.st_dev, entry.st_ino
    if value["entry_type"] == "OTHER_HOLD":
        value["state"] = "NONREGULAR_TARGET_HOLD"
    return value


def collect(target: Path, *, home: Path | None = None,
            platform: str | None = None, captured_at: str | None = None) -> tuple[dict, int]:
    """Produce an unsigned, local read-only receipt; never persist it."""
    home = home if home is not None else Path.home()
    captured_at = captured_at or datetime.now(timezone.utc).isoformat(timespec="seconds")
    receipt = {
        "schema_version": SCHEMA, "captured_at_utc": captured_at,
        "source_role": "OWNER_NATIVE_EXACT_PATH_METADATA_UNATTESTED",
        "source_commit_sha": None, "source_commit_verified": False,
        "host_plane": "mac-apfs",
        "requested_path": str(target),
        "command": ["df", "-Pk", DATA_MOUNT],
        "df_exit_code": None, "df_stdout": None,
        "df_stderr_excerpt": None, "df": None,
        "target": {"requested_path": str(target),
                   "state": "NOT_CHECKED_SOURCE_UNAVAILABLE",
                   "allocated_bytes": None},
        "coverage": "ONE_EXPLICIT_PATH_NO_DIRECTORY_ENUMERATION",
        "path_candidates_checked": 0, "directories_enumerated": 0,
        "project_size_bytes": None, "project_location_confirmed": False,
        "potential_L5": True, "owner_permission_for_mutation": False,
        "l1_accepted_gates": 2, "l1_total_gates": 8,
        "l1_gate_3_accepted": False, "unique_apfs_reclaimable_bytes": None,
        "physical_recovered_bytes_certified": 0,
        "scan_admission_floor_kib": FLOOR_KIB,
        "scan_admission_permitted": False,
        "historical_enoent_not_superseded": True,
        "persisted_signed_ledger": False, "signature": None,
        "status": "SOURCE_UNAVAILABLE", "mutation_authority": "NONE",
    }
    exit_code = EXIT_FAILED_SOURCE
    if (platform or sys.platform) != "darwin":
        receipt["status"] = "NON_NATIVE_MAC_NO_PROBE"
    else:
        try:
            proc = subprocess.run(receipt["command"], capture_output=True,
                                  text=True, timeout=DF_TIMEOUT_SECONDS, check=False)
            receipt["df_exit_code"] = proc.returncode
            receipt["df_stdout"] = proc.stdout[:1024]
            receipt["df_stderr_excerpt"] = proc.stderr[:256]
            if proc.returncode == 0:
                receipt["df"] = parse_df(proc.stdout)
        except subprocess.TimeoutExpired:
            receipt["status"] = "DF_TIMEOUT"
        except OSError as exc:
            receipt["status"] = "DF_UNAVAILABLE"
            receipt["df_os_errno"] = exc.errno
        if receipt["df"] is not None:
            # The source path is a single operator-named target. This lstat
            # chain is allowed below the scan floor; any enumeration is not.
            identity = exact_path_identity(home, target)
            receipt["target"] = identity
            receipt["path_candidates_checked"] = 1
            avail = receipt["df"]["ordinary_available_kib"]
            receipt["ordinary_free_floor_shortfall_kib"] = max(0, FLOOR_KIB - avail)
            if avail < FLOOR_KIB:
                receipt["status"] = "BLOCKED_EXTERNAL_MAC_CAPACITY"
                exit_code = EXIT_EXTERNAL_CAPACITY
            elif identity["state"] == "EXACT_PATH_PRESENT_METADATA_ONLY":
                receipt["status"] = "OBSERVED_EXACT_PATH_NOT_L1_CERTIFIED"
                # Not a scan/admission permit: explicit owner and source
                # attestation remain absent regardless of the free space.
                exit_code = EXIT_OBSERVED_NOT_L1
            elif identity["state"] == "EXACT_PATH_ABSENT_ENOENT":
                receipt["status"] = "TARGET_PATH_UNKNOWN_ENOENT"
                exit_code = EXIT_TARGET_UNKNOWN
            else:
                receipt["status"] = "PATH_IDENTITY_HOLD"
                exit_code = EXIT_FAILED_SOURCE
        elif receipt["status"] == "SOURCE_UNAVAILABLE":
            receipt["status"] = "DF_MALFORMED_OR_FAILED"
    receipt["exit_code"] = exit_code
    # Digest detects accidental corruption; it is NOT an HMAC/signature or
    # an already installed #991 history ledger.
    canonical = json.dumps(receipt, sort_keys=True, separators=(",", ":"))
    receipt["unsigned_receipt_sha256"] = hashlib.sha256(canonical.encode()).hexdigest()
    return receipt, exit_code


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="one exact absolute, owner-named path")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    home = Path.home()
    target = Path(args.target) if args.target else home / "Downloads" / "AoE2 HD"
    result, code = collect(target, home=home)
    if args.json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        print("Status:", result["status"])
        print("Exit code:", code, "Captured UTC:", result["captured_at_utc"])
        print("Exact path:", result["target"]["state"])
        print("Project allocation: UNKNOWN; APFS unique recovery: UNKNOWN")
        print("No scan, no deletion, no unconditional PASS")
    return code


if __name__ == "__main__":
    sys.exit(main())
