#!/usr/bin/env python3
"""Session D Phase14: fail-closed wrapper for the EXISTING four-path cache controller.

Default is read-only. --apply is an owner action and *only* calls the
source-owned "aoe2war storage local-maintain --apply --json" when every
allowlist, source identity, process and available-allocation gate passes.

This script NEVER selects .next, node_modules, Docker, recovery, video, finance,
signed Watcher artifacts, trash or arbitrary home/cache children for deletion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path.home() / "projects" / "AoE2HDBets" / "app-prodn"
DATA = Path("/System/Volumes/Data")
CONTROLLER = ROOT / "bin" / "aoe2war"
STORAGE_PY = ROOT / "scripts" / "aoe2_storage.py"
PINNED = {
    "bin/aoe2war": "35bc824386bf6a31b907d94f0a323e8bb2a0e339",
    "scripts/aoe2_storage.py": "3f2eea63fb291bc15de72820a4dc911e0fdf51df",
}
ALLOWLIST = {
    "yarn_cache": "Library/Caches/Yarn",
    "go_build_cache": "Library/Caches/go-build",
    "pnpm_cache": "Library/Caches/pnpm",
    "core_simulator_cache": "Library/Developer/CoreSimulator/Caches",
}
REVIEW_ONLY = {
    "generic_cache": ".cache",
    "npm_cache": ".npm",
    "homebrew_cache": "Library/Caches/Homebrew",
    "pip_cache": "Library/Caches/pip",
    "cargo_registry": ".cargo/registry",
    "go_module_cache": "go/pkg/mod",
    "xcode_derived_data": "Library/Developer/Xcode/DerivedData",
}
MIN_ALLOCATED_BYTES = 64 * 1024 * 1024
RECEIPT_DIR = ROOT / ".aoe2war-release" / "storage-local-receipts"


class Hold(Exception):
    pass


def call(args: list[str], *, timeout: int = 60) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            args, capture_output=True, text=True, check=False, timeout=timeout,
            cwd=ROOT, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1",
                           "GIT_OPTIONAL_LOCKS": "0"},
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise Hold("COMMAND_UNAVAILABLE_OR_TIMEOUT") from exc


def ordinary(path: Path) -> bool:
    try:
        return stat.S_ISREG(path.lstat().st_mode)
    except OSError:
        return False


def directory(path: Path) -> bool:
    try:
        return stat.S_ISDIR(path.lstat().st_mode)
    except OSError:
        return False


def assert_no_symlink_ancestors(path: Path, home: Path) -> None:
    if not path.is_relative_to(home) or path == home:
        raise Hold("PATH_OUTSIDE_HOME")
    check = path
    while check != home:
        try:
            info = check.lstat()
        except FileNotFoundError:
            check = check.parent
            continue
        except OSError as exc:
            raise Hold("PATH_LSTAT_FAILED") from exc
        if stat.S_ISLNK(info.st_mode):
            raise Hold("SYMLINKED_CACHE_OR_ANCESTOR")
        if check == path and not stat.S_ISDIR(info.st_mode):
            raise Hold("CACHE_NOT_DIRECTORY")
        check = check.parent


def validate_controller() -> str:
    if not directory(ROOT) or not ordinary(STORAGE_PY) or not ordinary(CONTROLLER):
        raise Hold("SOURCE_PATH_NOT_ORDINARY")
    for relative, expected in PINNED.items():
        command = call(["/usr/bin/git", "hash-object", str(ROOT / relative)], timeout=15)
        if command.returncode or command.stdout.strip() != expected:
            raise Hold("CONTROLLER_SOURCE_BLOB_MISMATCH_" + relative.replace("/", "_"))
    head = call(["/usr/bin/git", "-C", str(ROOT), "rev-parse", "HEAD"], timeout=15)
    if head.returncode or not re.fullmatch(r"[a-f0-9]{40}", head.stdout.strip()):
        raise Hold("SOURCE_HEAD_UNAVAILABLE")
    return head.stdout.strip()


def df_kib() -> dict:
    command = call(["/bin/df", "-k", str(DATA)], timeout=15)
    lines = command.stdout.strip().splitlines()
    if command.returncode or len(lines) < 2:
        raise Hold("DF_UNAVAILABLE")
    columns = lines[-1].split()
    if len(columns) < 6 or not columns[2].isdigit() or not columns[3].isdigit():
        raise Hold("DF_FORMAT")
    if columns[0] != "/dev/disk3s5":
        # Do not silently treat a different/migrated APFS system as the same.
        raise Hold("APFS_DATA_VOLUME_CHANGED")
    return {"device": columns[0], "used_kib": int(columns[2]),
            "available_kib": int(columns[3]), "percent": columns[4]}


def apfs_volume_usage() -> dict:
    command = call(["/usr/sbin/diskutil", "apfs", "list"], timeout=25)
    if command.returncode:
        return {"status": "HOLD_UNAVAILABLE"}
    fields: dict[str, int] = {}
    current = None
    container = False
    for line in command.stdout.splitlines():
        if "APFS Container Reference:" in line:
            container = "disk3" in line
        if not container:
            continue
        if "APFS Volume Disk (Role):" in line:
            current = ("VM" if "(VM)" in line else "Data"
                       if "(Data)" in line else None)
        if "Capacity Consumed:" in line and current:
            match = re.search(r"Capacity Consumed:\s*(\d+) B", line)
            if match:
                fields[current + "_allocated_bytes"] = int(match.group(1))
    return {"status": "PASS" if "Data_allocated_bytes" in fields else "HOLD_PARSE",
            **fields}


def lsof_has_consumers(paths: list[Path]) -> None:
    p = call(["/usr/sbin/lsof", "-nP", "-Fpn"], timeout=65)
    if p.returncode != 0 or p.stderr.strip():
        raise Hold("OPEN_HANDLE_SCAN_UNAVAILABLE")
    prefixes = [(str(x), str(x) + os.sep) for x in paths]
    for line in p.stdout.splitlines():
        if line.startswith("n"):
            location = line[1:]
            if any(location == item or location.startswith(prefix)
                   for item, prefix in prefixes):
                raise Hold("ACTIVE_PROCESS_USES_ALLOWLIST_CACHE")


def cache_identities(home: Path) -> dict:
    identities = {}
    for name, suffix in ALLOWLIST.items():
        path = home / suffix
        assert_no_symlink_ancestors(path, home)
        try:
            info = path.lstat()
        except FileNotFoundError:
            identities[name] = {"exists": False, "path": str(path)}
            continue
        except OSError as exc:
            raise Hold("CACHE_STAT_UNAVAILABLE") from exc
        if not stat.S_ISDIR(info.st_mode):
            raise Hold("CACHE_UNEXPECTED_TYPE")
        if os.path.ismount(path) or info.st_dev != home.stat().st_dev:
            raise Hold("CACHE_MOUNT_OR_OTHER_VOLUME")
        identities[name] = {
            "exists": True, "path": str(path),
            "device": info.st_dev, "inode": info.st_ino,
            "mtime_ns": info.st_mtime_ns,
        }
    return identities


def source_preview(home: Path) -> tuple[dict, dict]:
    p = call([str(CONTROLLER), "storage", "local-maintain", "--json"], timeout=100)
    if p.returncode:
        raise Hold("SOURCE_CONTROLLER_PREVIEW_FAILED")
    try:
        report = json.loads(p.stdout)
    except ValueError as exc:
        raise Hold("SOURCE_CONTROLLER_PREVIEW_BAD_JSON") from exc
    if report.get("status") != "PREVIEW" or report.get("apply") is not False:
        raise Hold("PREVIEW_NOT_READ_ONLY")
    base = report.get("before") or {}
    rows = base.get("regenerable")
    if not isinstance(rows, list) or len(rows) != 4:
        raise Hold("ALLOWLIST_PREVIEW_WRONG_COUNT")
    selected = {}
    for row in rows:
        name = row.get("name")
        if name not in ALLOWLIST or name in selected:
            raise Hold("ALLOWLIST_NAME_DRIFT")
        if row.get("path") != str(home / ALLOWLIST[name]):
            raise Hold("ALLOWLIST_PATH_DRIFT")
        if row.get("symlink") or not isinstance(row.get("allocated_bytes"), int):
            raise Hold("ALLOWLIST_UNMEASURED_OR_SYMLINK")
        selected[name] = row
    if set(selected) != set(ALLOWLIST):
        raise Hold("ALLOWLIST_NAMES_CHANGED")
    return report, selected


def review_cache_roots(home: Path) -> list[dict]:
    """Read-only size probes only; never promote root/child to delete authority."""
    rows = []
    for name, suffix in REVIEW_ONLY.items():
        path = home / suffix
        state = {"name": name, "classification": "REVIEW_ONLY", "allocated_kib": None}
        if not directory(path):
            state["probe"] = "MISSING_OR_SYMLINK_HOLD"
        else:
            p = call(["/usr/bin/du", "-skx", str(path)], timeout=45)
            words = p.stdout.split()
            if p.returncode == 0 and words and words[0].isdigit():
                state["allocated_kib"] = int(words[0])
                state["probe"] = "PASS"
            else:
                state["probe"] = "HOLD_DU"
        rows.append(state)
    return sorted(rows, key=lambda row: -(row["allocated_kib"] or 0))


def record_receipt(receipt: dict) -> tuple[Path, str]:
    if not directory(ROOT / ".aoe2war-release"):
        raise Hold("SOURCE_RECEIPT_ROOT_UNAVAILABLE")
    if RECEIPT_DIR.is_symlink():
        raise Hold("SYMLINK_RECEIPT_DIR")
    RECEIPT_DIR.mkdir(mode=0o700, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    target = RECEIPT_DIR / ("phase14-cache-controller-" + stamp + ".json")
    raw = (json.dumps(receipt, indent=2, sort_keys=True) + "\n").encode("utf-8")
    fd = os.open(str(target), os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o400)
    try:
        with os.fdopen(fd, "wb") as writer:
            writer.write(raw)
            writer.flush()
            os.fsync(writer.fileno())
        target.chmod(0o444)
    except BaseException:
        raise
    return target, hashlib.sha256(raw).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true",
                        help="owner-authorized exact four-cache source controller; guarded")
    args = parser.parse_args()
    home = Path.home()
    print("=== AOE2WAR PHASE14 GUARDED SOURCE CONTROLLER ===")
    print("ALLOWLIST:", ", ".join(ALLOWLIST))
    print("EXCLUDES: .next, worktrees, .codex, financial, media, recovery, MobileSync, Watcher")
    try:
        source_head = validate_controller()
        before_identity = cache_identities(home)
        preview, selected = source_preview(home)
        allocated = sum(row["allocated_bytes"] for row in selected.values())
        df_before = df_kib()
        print("SOURCE_SHA:", source_head)
        print("SOURCE_CONTROLLER_BLOB:", PINNED["scripts/aoe2_storage.py"])
        print("ALLOWLIST_ALLOCATED_KIB:", allocated // 1024)
        for name in ALLOWLIST:
            row = selected[name]
            print("CACHE:", name, "allocated_kib=",
                  row["allocated_bytes"] // 1024, "exists=", row["exists"])
        print("DF_BEFORE_AVAILABLE_KIB:", df_before["available_kib"])
        if not args.apply:
            print("PREVIEW_ONLY: run with --apply after reviewing four cache rows")
            return 0
        if allocated < MIN_ALLOCATED_BYTES:
            raise Hold("NO_SUBSTANTIAL_CURRENT_ALLOWLIST_ALLOCATION")
        lsof_has_consumers([home / path for path in ALLOWLIST.values()])
        if cache_identities(home) != before_identity:
            raise Hold("ALLOWLIST_STATE_CHANGED_DURING_PREFLIGHT")
        check, rows = source_preview(home)
        if any(rows[name]["allocated_bytes"] != selected[name]["allocated_bytes"]
               or rows[name]["exists"] != selected[name]["exists"]
               for name in ALLOWLIST):
            raise Hold("ALLOWLIST_ALLOCATION_CHANGED_DURING_PREFLIGHT")
        df_before = df_kib()
        apfs_before = apfs_volume_usage()
        performed = call([
            str(CONTROLLER), "storage", "local-maintain", "--apply", "--json",
        ], timeout=180)
        df_after = df_kib()
        apfs_after = apfs_volume_usage()
        try:
            native = json.loads(performed.stdout)
        except (ValueError, TypeError):
            native = None
        actions = []
        valid_actions = isinstance(native, dict) and isinstance(native.get("actions"), list)
        if valid_actions:
            for action in native["actions"]:
                actions.append({
                    "name": action.get("name"),
                    "existed": action.get("existed"),
                    "removed": action.get("removed"),
                    "allocated_bytes_before": action.get("allocated_bytes_before"),
                })
        status = "PASS" if (
            performed.returncode == 0 and valid_actions
            and native.get("status") == "PASS"
            and len(actions) == 4
            and {x.get("name") for x in actions} == set(ALLOWLIST)
            and all(not x["existed"] or x["removed"] for x in actions)
        ) else "HOLD_PARTIAL_OR_NATIVE_FAILURE"
        receipt = {
            "schema": 1,
            "kind": "aoe2war-phase14-actual-four-cache-maintenance",
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "controller_source_head": source_head,
            "source_controller_git_blob": PINNED["scripts/aoe2_storage.py"],
            "controller_bin_git_blob": PINNED["bin/aoe2war"],
            "allowlist_names": sorted(ALLOWLIST),
            "allocated_bytes_before": allocated,
            "actions": actions,
            "native_controller_receipt": native.get("receipt") if isinstance(native, dict) else None,
            "data_df_before": df_before,
            "data_df_after": df_after,
            "data_ordinary_free_net_delta_kib": (
                df_after["available_kib"] - df_before["available_kib"]),
            "apfs_before": apfs_before,
            "apfs_after": apfs_after,
            "environment_concurrent_changes_possible": True,
            "actual_deleted_paths": [str(home / ALLOWLIST[x["name"]])
                                     for x in actions if x["removed"]],
            "protected_paths_deleted": [],
        }
        path, digest = record_receipt(receipt)
        print("NATIVE_STATUS:", status)
        print("DF_AFTER_AVAILABLE_KIB:", df_after["available_kib"])
        print("OBSERVED_NET_DELTA_KIB:",
              df_after["available_kib"] - df_before["available_kib"])
        print("IMMUTABLE_RECEIPT:", path)
        print("RECEIPT_SHA256:", digest)
        return 0 if status == "PASS" else 2
    except Hold as exc:
        print("HOLD:", str(exc))
        try:
            print("TOP_MACHINE_REVIEW_ONLY:", json.dumps(
                review_cache_roots(home)[:7], sort_keys=True))
        except (Hold, OSError):
            print("HOLD_ADDITIONAL_REVIEW_UNAVAILABLE")
        print("DELETION_NOT_EXECUTED_OR_NOT_VERIFIABLE")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
