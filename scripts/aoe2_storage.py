#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"
WORKER_PATH = ROOT / "scripts" / "aoe2_rollback_archive_one.sh"
LOCAL_RECEIPT_DIR = ROOT / ".aoe2war-release" / "storage-local-receipts"
LOCAL_REGENERABLE_PATHS = (
    ("yarn_cache", Path("Library/Caches/Yarn")),
    ("go_build_cache", Path("Library/Caches/go-build")),
    ("pnpm_cache", Path("Library/Caches/pnpm")),
    ("core_simulator_cache", Path("Library/Developer/CoreSimulator/Caches")),
)
# An explicitly opted-in extension of the EXISTING local-maintain authority.
# These are only package-manager content/download caches. No projects,
# worktrees, npm installations, Xcode builds, iOS backups, journals, or user data.
LOCAL_EXTENDED_REGENERABLE_PATHS = (
    ("npm_content_cache", Path(".npm/_cacache")),
    ("homebrew_download_cache", Path("Library/Caches/Homebrew")),
    ("pip_download_cache", Path("Library/Caches/pip")),
    ("pip_user_cache", Path(".cache/pip")),
)

# Separate, explicit opt-in for two downloaded Electron toolchain caches.
# This mode does not select the legacy or --extended cache roots, and never
# touches a project's node_modules, releases, CrossOver, Steam or recordings.
LOCAL_ELECTRON_REGENERABLE_PATHS = (
    ("electron_binary_download_cache", Path("Library/Caches/electron")),
    ("electron_builder_download_cache", Path("Library/Caches/electron-builder")),
)

LOCAL_PROTECTED_PATHS = (
    ("recovery_vault", Path("aoe2war-recovery")),
    ("codex_sessions", Path(".codex/sessions")),
    ("crossover", Path("Library/Application Support/CrossOver")),
    ("mobile_sync", Path("Library/Application Support/MobileSync")),
)

# Read-only census only. None of these paths are promoted to deletion authority.
# They are named explicitly so Storage OS can find the large development/runtime
# buckets without crawling or publishing arbitrary operator-home contents.
LOCAL_REVIEW_PATHS = (
    ("app_node_modules", Path("projects/AoE2HDBets/app-prodn/node_modules"), "ACTIVE_DEV_REBUILDABLE_REVIEW"),
    ("app_next", Path("projects/AoE2HDBets/app-prodn/.next"), "ACTIVE_DEV_REBUILDABLE_REVIEW"),
    ("app_direnv", Path("projects/AoE2HDBets/app-prodn/.direnv"), "ACTIVE_DEV_ENV_REVIEW"),
    ("api_direnv", Path("projects/AoE2HDBets/api-prodn/.direnv"), "ACTIVE_DEV_ENV_REVIEW"),
    ("watcher_node_modules", Path("projects/AoE2HDBets/aoe2-watcher/node_modules"), "ACTIVE_DEV_REBUILDABLE_REVIEW"),
    ("npm_cache", Path(".npm"), "REGENERABLE_REVIEW"),
    ("generic_cache", Path(".cache"), "REGENERABLE_REVIEW"),
    ("cargo_registry", Path(".cargo/registry"), "REGENERABLE_REVIEW"),
    ("rustup_toolchains", Path(".rustup"), "TOOLCHAIN_REVIEW"),
    ("pyenv", Path(".pyenv"), "TOOLCHAIN_REVIEW"),
    ("go_module_cache", Path("go/pkg/mod"), "REGENERABLE_REVIEW"),
    ("xcode_derived_data", Path("Library/Developer/Xcode/DerivedData"), "REGENERABLE_REVIEW"),
    ("xcode_archives", Path("Library/Developer/Xcode/Archives"), "DEVELOPER_ARTIFACT_REVIEW"),
    ("homebrew_cache", Path("Library/Caches/Homebrew"), "REGENERABLE_REVIEW"),
    ("pip_cache", Path("Library/Caches/pip"), "REGENERABLE_REVIEW"),
)

GENERATION_RE = re.compile(r"^activate-\d{8}T\d{6}Z-[0-9a-f]{12}$")
BUILD_RE = re.compile(r"^[A-Za-z0-9_-]{1,256}$")


class StorageError(RuntimeError):
    pass


def run(args: list[str], *, timeout: int = 60, check: bool = True) -> str:
    proc = subprocess.run(
        args,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if check and proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip()
        raise StorageError(f"{shlex.join(args)} failed ({proc.returncode}): {detail}")
    return proc.stdout.strip()


def load_contract() -> dict[str, Any]:
    payload = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))
    if payload.get("schema") != 1:
        raise StorageError("unsupported operations contract schema")
    return payload


def policy() -> dict[str, Any]:
    contract = load_contract()
    canonical = contract.get("canonical") or {}
    archive = contract.get("rollback_archive") or {}
    protected = contract.get("protected") or {}

    required = {
        "production_host": "hel1",
        "production_repo": "/var/www/AoE2HDBets/app-prodn",
        "volume_mount": "/mnt/HC_Volume_105319120",
        "service": "aoe2hdbets-web.service",
    }
    for key, value in required.items():
        if canonical.get(key) != value:
            raise StorageError(f"canonical.{key} must be {value!r}")

    expected_archive = {
        "rollback_root": "/mnt/HC_Volume_105319120/aoe2war/rollbacks",
        "archive_root": "/mnt/HC_Volume_105319120/aoe2war/rollback-archives",
        "receipt_root": "/mnt/HC_Volume_105319120/aoe2war/os-control/rollback-archive-receipts",
        "verify_root": "/mnt/HC_Volume_105319120/aoe2war/os-control/rollback-archive-verify",
        "lock_path": "/mnt/HC_Volume_105319120/aoe2war/os-control/locks/rollback-archive.lock",
        "maintenance_runner": "/usr/local/sbin/aoe2war-maintenance-run",
        "root_maintenance_host": "root@hel1",
    }
    for key, value in expected_archive.items():
        if archive.get(key) != value:
            raise StorageError(f"rollback_archive.{key} must be {value!r}")

    keep = archive.get("protect_newest_activation_generations")
    if not isinstance(keep, int) or isinstance(keep, bool) or not 2 <= keep <= 10:
        raise StorageError("rollback archive must protect 2 through 10 newest generations")

    target = archive.get("healthy_target_percent")
    due = archive.get("maintenance_due_percent")
    auto = archive.get("automatic_archive_threshold_percent")
    critical = archive.get("critical_percent")
    vals = [target, due, auto, critical]
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
        raise StorageError("rollback archive capacity thresholds must be integers")
    if not (60 <= target < due < auto < critical <= 98):
        raise StorageError("rollback archive capacity thresholds are unsafe")

    if archive.get("max_generations_per_transaction") != 1:
        raise StorageError("archive transaction size must remain exactly one generation")
    if archive.get("legacy_auto_action") != "never":
        raise StorageError("legacy rollback auto-action must remain 'never'")
    if archive.get("wolo_mutation_allowed") is not False:
        raise StorageError("rollback archival must remain Wolo-observe-only")
    if protected.get("wolo_listener_ports") != [8092, 8093]:
        raise StorageError("protected Wolo listener contract drifted")

    return {
        **expected_archive,
        "production_host": canonical["production_host"],
        "production_repo": canonical["production_repo"],
        "volume_mount": canonical["volume_mount"],
        "service": canonical["service"],
        "protected_newest": keep,
        "healthy_target": target,
        "maintenance_due": due,
        "automatic_threshold": auto,
        "critical": critical,
        "pilot_sha256": archive.get("proven_pilot_sha256"),
    }


REMOTE_PROBE = r'''
from __future__ import annotations
import base64, json, os, re, stat, subprocess, sys
from pathlib import Path

p = json.loads(base64.urlsafe_b64decode(sys.argv[1].encode("ascii")))
measure = sys.argv[2] == "1"
gen_re = re.compile(r"^activate-\d{8}T\d{6}Z-[0-9a-f]{12}$")
roll = Path(p["rollback_root"])
archives = Path(p["archive_root"])
receipts = Path(p["receipt_root"])
volume = Path(p["volume_mount"])
repo = Path(p["production_repo"])

def checked(args):
    proc = subprocess.run(args, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode != 0:
        raise SystemExit((proc.stderr or proc.stdout).strip())
    return proc.stdout.strip()

def listener_count(port):
    out = checked(["ss", "-ltnH", "sport", "=", f":{port}"])
    return sum(1 for line in out.splitlines() if line.strip())

v = os.statvfs(volume)
block = v.f_frsize or v.f_bsize
total = v.f_blocks * block
free = v.f_bfree * block
available = v.f_bavail * block
used = max(0, total - free)
den = used + available
used_percent = round(used * 100.0 / den, 2) if den else 100.0

canonical = []
legacy = []
for entry in sorted(os.scandir(roll), key=lambda e: e.name):
    try:
        st = entry.stat(follow_symlinks=False)
    except OSError:
        continue
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISDIR(st.st_mode):
        continue
    (canonical if gen_re.fullmatch(entry.name) else legacy).append(entry.name)

canonical_desc = sorted(canonical, reverse=True)
protected = canonical_desc[: int(p["protected_newest"])]
eligible = canonical_desc[int(p["protected_newest"]):]

replaced = set()
verified = set()
if receipts.is_dir():
    for path in receipts.glob("*.replaced.json"):
        replaced.add(path.name[:-len(".replaced.json")])
    for path in receipts.glob("*.verified.json"):
        verified.add(path.name[:-len(".verified.json")])

archive_names = set()
if archives.is_dir():
    for path in archives.glob("*.tar.zst"):
        archive_names.add(path.name[:-len(".tar.zst")])

inconsistent = sorted(name for name in canonical if name in replaced or name in archive_names)

# `eligible` preserves newest-to-oldest order after removing the protected
# hot window. Archive the generation that just fell out of that window first.
# This maximizes recovery value per maintenance transaction without requiring
# an expensive recursive size scan of the whole rollback estate.
candidate = None
for name in eligible:
    if name not in replaced and name not in archive_names and name not in verified:
        candidate = name
        break

candidate_kb = None
if measure and candidate:
    proc = subprocess.run(
        ["du", "-skx", str(roll / candidate)],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if proc.returncode == 0 and proc.stdout.strip():
        candidate_kb = int(proc.stdout.split()[0])

source_sha = checked(["git", "-C", str(repo), "rev-parse", "HEAD"])
dirty = checked([
    "git", "--no-optional-locks", "-C", str(repo), "status",
    "--porcelain", "--untracked-files=all",
])
build_id = (repo / ".next" / "BUILD_ID").read_text().strip()
service = checked(["systemctl", "is-active", p["service"]])
node = checked(["systemctl", "is-active", "wolochaind-mainnet.service"])
settlement = checked(["systemctl", "is-active", "wolochain-mainnet-settlement.service"])
founder = checked(["systemctl", "is-active", "wolochain-founder-rewards-settlement.service"])

health = (
    "CRITICAL" if used_percent >= p["critical"] else
    "ATTENTION" if used_percent >= p["automatic_threshold"] else
    "MAINTENANCE_DUE" if used_percent >= p["maintenance_due"] else
    "WATCH" if used_percent >= p["healthy_target"] else
    "HEALTHY"
)

db_snapshot_root = volume / "aoe2war" / "deploy-receipts"
db_snapshot_count = 0
db_snapshot_bytes = 0
if db_snapshot_root.is_dir():
    base_depth = len(db_snapshot_root.parts)
    for current, dirs, files in os.walk(db_snapshot_root):
        current_path = Path(current)
        depth = len(current_path.parts) - base_depth
        if depth >= 4:
            dirs[:] = []
        dirs[:] = [
            name for name in dirs
            if not (current_path / name).is_symlink()
        ]
        for name in files:
            if not name.lower().endswith((".dump", ".backup", ".bak", ".sql.gz")):
                continue
            path = current_path / name
            try:
                st = path.stat(follow_symlinks=False)
            except OSError:
                continue
            if not stat.S_ISREG(st.st_mode):
                continue
            db_snapshot_count += 1
            db_snapshot_bytes += int(st.st_size)

print(json.dumps({
    "schema": 1,
    "kind": "aoe2war-storage-os-status",
    "used_percent": used_percent,
    "total_bytes": total,
    "available_bytes": available,
    "health": health,
    "healthy_target_percent": p["healthy_target"],
    "maintenance_due_percent": p["maintenance_due"],
    "automatic_threshold_percent": p["automatic_threshold"],
    "critical_percent": p["critical"],
    "expanded_canonical_count": len(canonical),
    "legacy_directory_count": len(legacy),
    "protected_newest": protected,
    "eligible_expanded_count": len(eligible),
    "archived_replaced_count": len(archive_names),
    "expired_archive_count": len(list(receipts.glob("*.expired.json"))),
    "verified_receipt_count": len(verified),
    "archive_file_count": len(archive_names),
    "database_snapshots": {
        "count": db_snapshot_count,
        "bytes": db_snapshot_bytes,
        "retention_command": "aoe2war storage db-snapshots status",
    },
    "inconsistent_expanded_archived": inconsistent,
    "next_candidate": candidate,
    "candidate_policy": "rolling-hot-window",
    "next_candidate_allocated_kb": candidate_kb,
    "runtime": {
        "source_sha": source_sha,
        "dirty_count": len([x for x in dirty.splitlines() if x]),
        "build_id": build_id,
        "service": service,
        "wolo_node": node,
        "wolo_settlement": settlement,
        "wolo_founder_rewards": founder,
        "wolo_listener_counts": {"8092": listener_count(8092), "8093": listener_count(8093)},
    },
}, sort_keys=True))
'''


REMOTE_VERIFY = r'''
from __future__ import annotations
import hashlib, json
from pathlib import Path

root = Path("/mnt/HC_Volume_105319120/aoe2war")
receipts = root / "os-control" / "rollback-archive-receipts"
rollbacks = root / "rollbacks"

def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

rows = []
errors = []
for rp in sorted(receipts.glob("*.replaced.json")):
    try:
        payload = json.loads(rp.read_text())
        gen = payload["generation"]
        archive = Path(payload["archive_path"])
        manifest = Path(payload["tree_manifest_path"])
        ok = True
        detail = []
        if (rollbacks / gen).exists():
            ok = False
            detail.append("expanded generation still present")
        expired_path = receipts / (gen + ".expired.json")
        expired = False
        if expired_path.is_file():
            expiry = json.loads(expired_path.read_text())
            ledger_path = Path(expiry["ledger_path"])
            if (expiry.get("status") != "EXPIRED_SUPERSEDED_RUNTIME"
                    or expiry.get("generation") != gen
                    or expiry.get("path") != str(archive)
                    or expiry.get("wolo_mutated") is not False
                    or expiry["wolo_height_after"] <= expiry["wolo_height_before"]
                    or expiry["object"]["archive_sha256"] != payload["archive_sha256"]
                    or expiry["object"]["replaced_receipt_sha256"] != sha(rp)
                    or not ledger_path.is_file()
                    or sha(ledger_path) != expiry["ledger_sha256"]
                    or archive.exists()):
                raise ValueError("invalid archive expiry evidence")
            ledger = json.loads(ledger_path.read_text())
            if not any(row == expiry["object"] and row.get("action") == "EXPIRE" for row in ledger["rows"]):
                raise ValueError("expired object absent from exact authorized ledger")
            expired = True
            detail.append("superseded runtime expired under verified lean ledger")
        if not expired and (not archive.is_file() or sha(archive) != payload["archive_sha256"]):
            ok = False
            detail.append("archive hash mismatch")
        if not manifest.is_file() or sha(manifest) != payload["tree_manifest_sha256"]:
            ok = False
            detail.append("manifest hash mismatch")
        rows.append({"generation": gen, "ok": ok, "detail": detail})
        if not ok:
            errors.append(gen)
    except Exception as exc:
        errors.append(rp.name)
        rows.append({"generation": rp.name, "ok": False, "detail": [str(exc)]})
print(json.dumps({
    "schema": 1,
    "kind": "aoe2war-storage-os-verify",
    "checked": len(rows),
    "failed": len(errors),
    "status": "PASS" if not errors else "FAIL",
    "rows": rows,
}, sort_keys=True))
'''


def remote_json(script: str, p: dict[str, Any], *args: str, timeout: int = 90) -> dict[str, Any]:
    encoded = base64.urlsafe_b64encode(
        json.dumps(p, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    cmd = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        p["production_host"], "python3", "-", encoded, *args,
    ]
    proc = subprocess.run(
        cmd, input=script, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        timeout=timeout, check=False,
    )
    if proc.returncode != 0:
        raise StorageError((proc.stderr or proc.stdout or "remote probe failed").strip())
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise StorageError(f"remote probe returned invalid JSON: {proc.stdout[-4000:]}") from exc
    if not isinstance(payload, dict):
        raise StorageError("remote probe returned a non-object")
    return payload


def remote_root_json(
    script: str,
    p: dict[str, Any],
    *args: str,
    timeout: int = 90,
) -> dict[str, Any]:
    """Run an explicitly read-only storage census under root maintenance authority."""
    encoded = base64.urlsafe_b64encode(
        json.dumps(p, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    cmd = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        p["root_maintenance_host"], "python3", "-", encoded, *args,
    ]
    proc = subprocess.run(
        cmd,
        input=script,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if proc.returncode != 0:
        raise StorageError(
            (proc.stderr or proc.stdout or "privileged read-only probe failed").strip()
        )
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise StorageError(
            f"privileged read-only probe returned invalid JSON: {proc.stdout[-4000:]}"
        ) from exc
    if not isinstance(payload, dict):
        raise StorageError("privileged read-only probe returned a non-object")
    return payload


def snapshot(*, measure: bool = False) -> dict[str, Any]:
    p = policy()
    payload = remote_json(REMOTE_PROBE, p, "1" if measure else "0")
    runtime = payload.get("runtime") or {}
    if runtime.get("dirty_count") != 0:
        raise StorageError("production worktree is dirty")
    for key in ("service", "wolo_node", "wolo_settlement", "wolo_founder_rewards"):
        if runtime.get(key) != "active":
            raise StorageError(f"{key} is not active")
    counts = runtime.get("wolo_listener_counts") or {}
    if counts.get("8092") != 1 or counts.get("8093") != 1:
        raise StorageError(f"protected Wolo listener counts are invalid: {counts}")
    if payload.get("inconsistent_expanded_archived"):
        raise StorageError(
            "expanded generations overlap final archive evidence: "
            + ", ".join(payload["inconsistent_expanded_archived"])
        )
    return payload


def gib(value: int | float | None) -> str:
    return "—" if value is None else f"{float(value) / (1024 ** 3):.2f} GiB"


def _allocated_bytes(path: Path) -> int:
    if not path.exists() or path.is_symlink():
        return 0
    out = run(["du", "-skx", str(path)], timeout=180, check=False)
    try:
        return int(out.split()[0]) * 1024
    except (IndexError, ValueError):
        return 0


def _bounded_allocated_bytes(path: Path, *, timeout: int = 45) -> tuple[int, bool]:
    """Measure one named local bucket without letting it abort the whole census."""
    if not path.exists() or path.is_symlink():
        return 0, True
    try:
        proc = subprocess.run(
            ["du", "-skx", str(path)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return 0, False
    if proc.returncode != 0:
        return 0, False
    try:
        return int(proc.stdout.split()[0]) * 1024, True
    except (IndexError, ValueError):
        return 0, False


def _filesystem_usage(path: Path) -> dict[str, Any]:
    usage = shutil.disk_usage(path)
    used_percent = round(usage.used * 100.0 / usage.total, 2) if usage.total else 100.0
    return {
        "total_bytes": usage.total,
        "used_bytes": usage.used,
        "free_bytes": usage.free,
        "used_percent": used_percent,
    }


def _context_retention_snapshot(home: Path) -> dict[str, Any]:
    root = home / "projects" / "VPSSentry" / "context"
    formats: dict[str, Any] = {}
    total_debt = 0
    for suffix in ("tgz", "zip", "md"):
        directory = root / suffix
        series: dict[str, int] = {}
        if directory.is_dir():
            for path in directory.glob(f"*-context-*.{suffix}"):
                key = path.name.split("-context-", 1)[0]
                series[key] = series.get(key, 0) + 1
        debt = sum(max(0, count - 1) for count in series.values())
        total_debt += debt
        formats[suffix] = {
            "archive_count": sum(series.values()),
            "series_count": len(series),
            "retention_debt": debt,
            "over_retained_series": {
                name: count for name, count in sorted(series.items()) if count > 1
            },
        }
    return {
        "root": str(root),
        "retention_debt": total_debt,
        "formats": formats,
    }


def local_storage_snapshot(*, measure: bool = False, home: Path | None = None) -> dict[str, Any]:
    operator_home = (home or Path.home()).resolve()
    regenerable = []
    for name, relative in LOCAL_REGENERABLE_PATHS:
        path = operator_home / relative
        row = {
            "name": name,
            "path": str(path),
            "exists": path.exists(),
            "symlink": path.is_symlink(),
        }
        if measure:
            row["allocated_bytes"] = _allocated_bytes(path)
        regenerable.append(row)

    protected = []
    for name, relative in LOCAL_PROTECTED_PATHS:
        path = operator_home / relative
        row = {
            "name": name,
            "path": str(path),
            "exists": path.exists(),
            "symlink": path.is_symlink(),
        }
        if measure:
            row["allocated_bytes"] = _allocated_bytes(path)
        protected.append(row)

    return {
        "kind": "aoe2war-local-storage-status",
        "home": str(operator_home),
        "filesystem": _filesystem_usage(operator_home),
        "regenerable": regenerable,
        "protected": protected,
        "context_retention": _context_retention_snapshot(operator_home),
        "reclaimable_bytes": (
            sum(int(row.get("allocated_bytes") or 0) for row in regenerable)
            if measure else None
        ),
    }


REMOTE_ROOT_PROBE = r'''from __future__ import annotations
import base64, json, os, sys
from pathlib import Path
p = json.loads(base64.urlsafe_b64decode(sys.argv[1].encode("ascii")))
repo = Path(p["production_repo"])
v = os.statvfs("/")
block = v.f_frsize or v.f_bsize
total = v.f_blocks * block
available = v.f_bavail * block
used = max(0, total - (v.f_bfree * block))
den = used + available
fast = set()
for pattern in (".next-rollback-activate-*", ".node_modules-rollback-activate-*"):
    for path in repo.glob(pattern):
        name = path.name.split("rollback-", 1)[-1]
        fast.add(name)
print(json.dumps({
    "kind": "aoe2war-root-storage-status",
    "total_bytes": total,
    "available_bytes": available,
    "used_percent": round(used * 100.0 / den, 2) if den else 100.0,
    "fast_rollback_generations": sorted(fast, reverse=True),
    "fast_rollback_count": len(fast),
}, sort_keys=True))
'''


def root_storage_snapshot() -> dict[str, Any]:
    return remote_json(REMOTE_ROOT_PROBE, policy(), timeout=45)


REMOTE_ROOT_DEEP_CENSUS = r'''from __future__ import annotations
import json, os, re, subprocess, sys
from pathlib import Path

p = json.loads(__import__("base64").urlsafe_b64decode(sys.argv[1].encode("ascii")))
repo = Path(p["production_repo"])

def allocated(path):
    path = Path(path)
    row = {
        "path": str(path),
        "exists": path.exists(),
        "symlink": path.is_symlink(),
        "allocated_bytes": 0,
        "probe_ok": True,
    }
    if not row["exists"] or row["symlink"]:
        return row
    try:
        proc = subprocess.run(
            ["du", "-skx", str(path)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            timeout=20,
        )
    except (OSError, subprocess.TimeoutExpired):
        row["probe_ok"] = False
        return row
    row["probe_ok"] = proc.returncode == 0
    if proc.returncode == 0:
        try:
            row["allocated_bytes"] = int(proc.stdout.split()[0]) * 1024
        except (IndexError, ValueError):
            row["probe_ok"] = False
    return row

rows = []
def add(name, path, classification):
    row = allocated(path)
    row.update(
        name=name,
        classification=classification,
        mutation_authority="NONE",
    )
    rows.append(row)

add("active_next", repo / ".next", "PROTECTED_ACTIVE_RUNTIME")
add("active_node_modules", repo / "node_modules", "PROTECTED_ACTIVE_RUNTIME")
add("staged_next", repo / ".next-release", "RECEIPT_GATED_STAGED_REVIEW")
add("staged_node_modules", repo / ".node_modules-release", "RECEIPT_GATED_STAGED_REVIEW")

fast_bytes = 0
fast_paths = []
fast_probe_ok = True
for pattern in (".next-rollback-activate-*", ".node_modules-rollback-activate-*"):
    for path in sorted(repo.glob(pattern)):
        row = allocated(path)
        fast_bytes += int(row["allocated_bytes"])
        fast_paths.append(row["path"])
        fast_probe_ok = fast_probe_ok and bool(row["probe_ok"])
rows.append({
    "name": "fast_rollback_pairs",
    "path": str(repo),
    "exists": bool(fast_paths),
    "symlink": False,
    "allocated_bytes": fast_bytes,
    "probe_ok": fast_probe_ok,
    "paths": fast_paths,
    "classification": "DURABLE_PROOF_GATED_FAST_ROLLBACK",
    "mutation_authority": "NONE",
})

for name, path, classification in (
    ("apt_archives", "/var/cache/apt/archives", "BOUNDED_RECOVERY_EXISTING"),
    ("systemd_journal", "/var/log/journal", "BOUNDED_RECOVERY_EXISTING"),
    ("nginx_logs", "/var/log/nginx", "LIVE_LOGS_REVIEW"),
    ("snap_store", "/var/lib/snapd/snaps", "MIXED_SNAP_STORE"),
    ("snap_download_cache", "/var/lib/snapd/cache", "UNPROVEN_RECLAIM"),
    ("docker_store", "/var/lib/docker", "UNPROVEN_RECLAIM"),
    ("root_cache", "/root/.cache", "REVIEW_ONLY"),
    ("operator_cache", "/home/tony/.cache", "REVIEW_ONLY"),
    ("tmp", "/tmp", "REVIEW_ONLY"),
    ("var_tmp", "/var/tmp", "REVIEW_ONLY"),
):
    add(name, path, classification)

disabled = []
snap = None
try:
    snap = subprocess.run(
        ["snap", "list", "--all"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
        timeout=30,
    )
except (OSError, subprocess.TimeoutExpired):
    snap = None

if snap is not None and snap.returncode == 0:
    for line in snap.stdout.splitlines()[1:]:
        parts = line.split()
        if len(parts) < 3 or "disabled" not in parts[3:]:
            continue
        name, rev = parts[0], parts[2]
        if not re.fullmatch(r"[A-Za-z0-9.+_-]+", name):
            continue
        if not re.fullmatch(r"[0-9]+", rev):
            continue
        path = Path("/var/lib/snapd/snaps") / f"{name}_{rev}.snap"
        try:
            st = path.stat()
        except OSError:
            continue
        disabled.append({
            "name": name,
            "revision": rev,
            "path": str(path),
            "allocated_bytes": st.st_blocks * 512,
        })

v = os.statvfs("/")
block = v.f_frsize or v.f_bsize
total = v.f_blocks * block
available = v.f_bavail * block
used = max(0, total - (v.f_bfree * block))
den = used + available

print(json.dumps({
    "schema": 1,
    "kind": "aoe2war-root-deep-storage-census",
    "filesystem": {
        "total_bytes": total,
        "available_bytes": available,
        "used_percent": round(used * 100.0 / den, 2) if den else 100.0,
    },
    "rows": sorted(rows, key=lambda row: int(row["allocated_bytes"]), reverse=True),
    "disabled_snaps": disabled,
    "disabled_snap_bytes": sum(int(row["allocated_bytes"]) for row in disabled),
    "snap_probe_ok": snap is not None and snap.returncode == 0,
    "mutation_allowed": False,
}, sort_keys=True))
'''


def root_deep_storage_census() -> dict[str, Any]:
    return remote_root_json(REMOTE_ROOT_DEEP_CENSUS, policy(), timeout=300)


def local_deep_storage_census(*, home: Path | None = None) -> dict[str, Any]:
    operator_home = (home or Path.home()).resolve()
    rows = []
    allowlisted = {str(relative) for _, relative in LOCAL_REGENERABLE_PATHS}
    for name, relative, classification in LOCAL_REVIEW_PATHS:
        path = operator_home / relative
        allocated_bytes, probe_ok = _bounded_allocated_bytes(path)
        rows.append(
            {
                "name": name,
                "path": str(path),
                "exists": path.exists(),
                "symlink": path.is_symlink(),
                "allocated_bytes": allocated_bytes,
                "probe_ok": probe_ok,
                "classification": classification,
                "mutation_authority": "NONE",
                "already_allowlisted": str(relative) in allowlisted,
            }
        )

    # Include the existing strict allowlist and protected buckets using the same
    # bounded probe so one slow local tree cannot abort the whole census.
    for name, relative in LOCAL_REGENERABLE_PATHS:
        path = operator_home / relative
        allocated_bytes, probe_ok = _bounded_allocated_bytes(path)
        rows.append(
            {
                "name": name,
                "path": str(path),
                "exists": path.exists(),
                "symlink": path.is_symlink(),
                "allocated_bytes": allocated_bytes,
                "probe_ok": probe_ok,
                "classification": "PROVEN_REGENERABLE_ALLOWLIST",
                "mutation_authority": "LOCAL_MAINTAIN_ONLY",
                "already_allowlisted": True,
            }
        )
    for name, relative in LOCAL_PROTECTED_PATHS:
        path = operator_home / relative
        allocated_bytes, probe_ok = _bounded_allocated_bytes(path)
        rows.append(
            {
                "name": name,
                "path": str(path),
                "exists": path.exists(),
                "symlink": path.is_symlink(),
                "allocated_bytes": allocated_bytes,
                "probe_ok": probe_ok,
                "classification": "PROTECTED",
                "mutation_authority": "NONE",
                "already_allowlisted": False,
            }
        )

    return {
        "schema": 1,
        "kind": "aoe2war-local-deep-storage-census",
        "filesystem": _filesystem_usage(operator_home),
        "rows": sorted(
            rows,
            key=lambda row: int(row["allocated_bytes"]),
            reverse=True,
        ),
        "mutation_allowed": False,
    }


def deep_storage_census(*, home: Path | None = None) -> dict[str, Any]:
    return {
        "schema": 1,
        "kind": "aoe2war-three-plane-deep-storage-census",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "local": local_deep_storage_census(home=home),
        "root": root_deep_storage_census(),
        "volume": snapshot(measure=True),
        "mutation_allowed": False,
    }


def print_deep_storage_census(payload: dict[str, Any]) -> None:
    local = payload["local"]
    root = payload["root"]
    volume = payload["volume"]
    print("⚔️  AOE2WAR DEEP STORAGE CENSUS")
    print()
    print(
        f"Mac:        {local['filesystem']['used_percent']:.2f}% used · "
        f"{gib(local['filesystem']['free_bytes'])} free"
    )
    for row in local["rows"]:
        if not row.get("probe_ok", True):
            print(
                f"  {'PROBE?':>10}  "
                f"{row['name']:<24} {row['classification']}"
            )
            continue
        if int(row["allocated_bytes"]) <= 0:
            continue
        print(
            f"  {gib(row['allocated_bytes']):>10}  "
            f"{row['name']:<24} {row['classification']}"
        )
    print()
    print(
        f"VPS root:   {root['filesystem']['used_percent']:.2f}% used · "
        f"{gib(root['filesystem']['available_bytes'])} available"
    )
    for row in root["rows"]:
        if not row.get("probe_ok", True):
            print(
                f"  {'PROBE?':>10}  "
                f"{row['name']:<24} {row['classification']}"
            )
            continue
        if int(row["allocated_bytes"]) <= 0:
            continue
        print(
            f"  {gib(row['allocated_bytes']):>10}  "
            f"{row['name']:<24} {row['classification']}"
        )
    print(
        f"  {gib(root['disabled_snap_bytes']):>10}  "
        "disabled_snaps           PROVEN_RECOVERY_CLASS"
    )
    print()
    print(
        f"VPS volume: {volume['used_percent']:.2f}% used · "
        f"{gib(volume['available_bytes'])} available"
    )
    print("Mutation:   NONE — census only; classifications do not grant deletion authority.")



def _triage_buckets(rows: list[dict[str, Any]], *, limit: int = 5) -> list[dict[str, Any]]:
    """Rank measured review buckets; a ranking never conveys delete authority."""
    result = []
    for row in rows:
        if row.get("probe_ok") is not True:
            continue
        allocated = row.get("allocated_bytes")
        if not isinstance(allocated, int) or isinstance(allocated, bool) or allocated <= 0:
            continue
        classification = str(row.get("classification") or "UNKNOWN")
        if classification.startswith("PROTECTED"):
            continue
        result.append({
            "name": row.get("name"),
            "allocated_bytes": allocated,
            "classification": classification,
            "mutation_authority": "NONE",
        })
    return sorted(result, key=lambda row: row["allocated_bytes"], reverse=True)[:limit]


def build_storage_triage(
    census: dict[str, Any],
    *,
    expiry_inventory: dict[str, Any] | None = None,
    root_preferred_gib: int = 6,
) -> dict[str, Any]:
    """Explain three independent capacity planes without authorizing reclamation."""
    if census.get("kind") != "aoe2war-three-plane-deep-storage-census":
        raise StorageError("triage requires an exact three-plane deep storage census")
    local = census["local"]
    root = census["root"]
    volume = census["volume"]
    mac_disk = local["filesystem"]
    root_disk = root["filesystem"]
    mac_free = int(mac_disk["free_bytes"])
    mac_pct = float(mac_disk["used_percent"])
    root_free = int(root_disk["available_bytes"])
    root_pct = float(root_disk["used_percent"])
    volume_pct = float(volume["used_percent"])
    volume_free = int(volume["available_bytes"])
    eligible = int(volume.get("eligible_expanded_count") or 0)
    mac_probe_failure = any(row.get("probe_ok") is not True for row in local["rows"])
    root_probe_failure = any(row.get("probe_ok") is not True for row in root["rows"])
    preferred_bytes = root_preferred_gib * 1024 ** 3
    expiry_summary = {
        "status": "NOT_SUPPLIED",
        "expire_count": None,
        "keep_count": None,
        "note": "A structural debt count is not a sealed deletion ledger.",
    }
    if expiry_inventory is not None:
        if expiry_inventory.get("kind") != "aoe2war-lean-retention-inventory":
            raise StorageError("supplied expiry inventory has the wrong kind")
        rows = expiry_inventory.get("rows")
        if not isinstance(rows, list):
            raise StorageError("supplied expiry inventory has no rows")
        # This is a preview count, not a verified content-hashed deletion budget.
        expire = sum(row.get("action") == "EXPIRE" for row in rows)
        keep = sum(row.get("action") == "KEEP" for row in rows)
        if expire + keep != len(rows):
            raise StorageError("expiry inventory contains unclassified actions")
        expiry_summary = {
            "status": "PREVIEW_ONLY",
            "expire_count": expire,
            "keep_count": keep,
            "note": "Expiry actions require fresh sealed ledger, exact hashes and recovery proof.",
        }
    root_state = "UNKNOWN" if root_probe_failure else (
        "ATTENTION" if root_free < preferred_bytes else "OBSERVE"
    )
    mac_state = "UNKNOWN" if mac_probe_failure else (
        "WATCH" if mac_pct >= 90 else "OBSERVE"
    )
    volume_state = (
        "ATTENTION" if volume_pct >= 82 else
        "WATCH" if volume_pct >= 78 or eligible > 0 else "OBSERVE"
    )
    actions = [
        {
            "id": "vps-root",
            "state": root_state,
            "used_percent": root_pct,
            "free_bytes": root_free,
            "preferred_free_bytes": preferred_bytes,
            "measured_review_buckets": _triage_buckets(root["rows"]),
            "next_step": "Review root buckets, then only use separately governed housekeeping; never treat mounted-volume reclamation as root reclamation.",
            "mutation_allowed": False,
        },
        {
            "id": "mac",
            "state": mac_state,
            "used_percent": mac_pct,
            "free_bytes": mac_free,
            "measured_review_buckets": _triage_buckets(local["rows"]),
            "next_step": "Run aoe2war storage local-maintain for its strict cache preview; larger review buckets require separate proof and authorization.",
            "mutation_allowed": False,
        },
        {
            "id": "vps-volume",
            "state": volume_state,
            "used_percent": volume_pct,
            "free_bytes": volume_free,
            "expanded_archive_eligible_count": eligible,
            "expiry": expiry_summary,
            "next_step": "Use aoe2war storage expiry inventory for structural debt, then a separately sealed expiry ledger; do not automatically archive merely because WATCH.",
            "mutation_allowed": False,
        },
    ]
    priority = {"ATTENTION": 0, "UNKNOWN": 1, "WATCH": 2, "OBSERVE": 3}
    actions.sort(key=lambda row: priority[row["state"]])
    return {
        "schema": 1,
        "kind": "aoe2war-storage-triage",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "status": min((row["state"] for row in actions), key=lambda state: priority[state]),
        "planes": actions,
        "probe_complete": not mac_probe_failure and not root_probe_failure,
        "mutation_allowed": False,
        "cross_filesystem_reclaim_is_not_transferable": True,
        "protected": "active runtime, rollback checkpoints, recovery evidence, replay and financial data remain outside generic cleanup",
    }


def storage_triage(*, expiry_inventory_path: Path | None = None) -> dict[str, Any]:
    expiry = None
    if expiry_inventory_path is not None:
        # The intake is a local immutable operator-supplied JSON preview. Do not
        # invoke the expiry tool here: its Mac bootstrap stages code remotely.
        if expiry_inventory_path.is_symlink() or not expiry_inventory_path.is_file():
            raise StorageError("expiry inventory must be an existing plain local file")
        if expiry_inventory_path.stat().st_size > 16 * 1024 * 1024:
            raise StorageError("expiry inventory is too large")
        try:
            expiry = json.loads(expiry_inventory_path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise StorageError("expiry inventory JSON cannot be read") from exc
    capacity = load_contract().get("capacity") or {}
    preferred = capacity.get("root_free_preferred_gib")
    if not isinstance(preferred, int) or isinstance(preferred, bool) or not 3 <= preferred <= 30:
        raise StorageError("invalid root preferred-free contract")
    return build_storage_triage(
        deep_storage_census(),
        expiry_inventory=expiry,
        root_preferred_gib=preferred,
    )


def print_storage_triage(payload: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR STORAGE TRIAGE — READ ONLY")
    print()
    print(f"Estate:       {payload['status']}")
    for plane in payload["planes"]:
        print(
            f"{plane['id']}: {plane['state']} · {plane['used_percent']:.2f}% used · "
            f"{gib(plane['free_bytes'])} free"
        )
        for row in plane.get("measured_review_buckets") or []:
            print(
                f"  REVIEW {gib(row['allocated_bytes']):>10} "
                f"{row['name']} ({row['classification']})"
            )
        if plane["id"] == "vps-volume":
            print(f"  Expanded archival debt: {plane['expanded_archive_eligible_count']}")
            expiry = plane["expiry"]
            print(
                "  Expiry candidates: "
                + (str(expiry['expire_count']) if expiry['expire_count'] is not None else "NOT MEASURED")
                + " · preliminary classification only"
            )
        print("  NEXT: " + plane["next_step"])
    print()
    if not payload["probe_complete"]:
        print("STOP: One or more named capacity probes did not complete; no healthy claim.")
    print("No files modified. No class shown here is deletion authorization.")


def estate_snapshot(*, measure: bool = False) -> dict[str, Any]:
    volume = snapshot(measure=measure)
    local = local_storage_snapshot(measure=measure)
    root = root_storage_snapshot()
    return {
        "schema": 1,
        "kind": "aoe2war-storage-estate-status",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "local": local,
        "root": root,
        "volume": volume,
        "summary": {
            "local_reclaimable_bytes": local["reclaimable_bytes"],
            "context_archive_retention_debt": local["context_retention"]["retention_debt"],
            "root_used_percent": root["used_percent"],
            "volume_used_percent": volume["used_percent"],
            "expanded_retention_debt": volume["eligible_expanded_count"],
            "cold_archive_count": volume["archive_file_count"],
            "database_snapshot_count": (
                (volume.get("database_snapshots") or {}).get("count")
            ),
            "database_snapshot_bytes": (
                (volume.get("database_snapshots") or {}).get("bytes")
            ),
        },
    }


def print_status(s: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR STORAGE OS")
    print()
    print(f"Health:          {s['health']}")
    print(f"Volume:          {s['used_percent']:.2f}% used · {gib(s['available_bytes'])} available")
    print(f"Healthy target:  < {s['healthy_target_percent']}%")
    print(f"Expanded modern: {s['expanded_canonical_count']}")
    print(f"Protected hot:   {len(s['protected_newest'])}")
    print(f"Cold eligible:   {s['eligible_expanded_count']}")
    print(f"Archived:        {s['archived_replaced_count']}")
    db = s.get("database_snapshots") or {}
    print(
        "DB snapshots:    "
        f"{db.get('count', '—')} · {gib(db.get('bytes'))} · "
        "tiered plan available"
    )
    print(f"Legacy dirs:     {s['legacy_directory_count']} · auto-action NEVER")
    print(f"Next candidate:  {s['next_candidate'] or '—'}")
    rt = s["runtime"]
    print(f"Production:      {rt['source_sha'][:12]} · {rt['build_id']} · {rt['service']}")
    print("Wolo:            node/settlement/founder active · 8092=1 · 8093=1")


def print_estate(payload: dict[str, Any]) -> None:
    local = payload["local"]
    root = payload["root"]
    volume = payload["volume"]
    print("⚔️  AOE2WAR STORAGE ESTATE")
    print()
    print(
        f"Mac:             {local['filesystem']['used_percent']:.2f}% used · "
        f"{gib(local['filesystem']['free_bytes'])} free"
    )
    if local["reclaimable_bytes"] is None:
        print("Mac reclaimable: NOT MEASURED · use storage estate --measure")
    else:
        print(f"Mac reclaimable: {gib(local['reclaimable_bytes'])} · strict cache allowlist")
    print(
        f"Context debt:    {local['context_retention']['retention_debt']} extra archive(s)"
    )
    print(
        f"VPS root:        {root['used_percent']:.2f}% used · "
        f"{gib(root['available_bytes'])} available"
    )
    print(f"Fast rollback:   {root['fast_rollback_count']} generation(s)")
    print(
        f"VPS volume:      {volume['used_percent']:.2f}% used · "
        f"{gib(volume['available_bytes'])} available · {volume['health']}"
    )
    print(f"Expanded debt:   {volume['eligible_expanded_count']} generation(s)")
    print(f"Cold archives:   {volume['archive_file_count']}")
    db = volume.get("database_snapshots") or {}
    print(
        "DB snapshots:    "
        f"{db.get('count', '—')} · {gib(db.get('bytes'))}"
    )


def _assert_local_reclaim_path(home: Path, path: Path) -> None:
    if path.is_symlink():
        raise StorageError(f"refusing symlinked local cache path: {path}")
    # A symlink at Library/Caches is as dangerous as a symlink at the leaf:
    # resolving inside $HOME alone does not prove we remain in the cache lane.
    for ancestor in path.parents:
        if ancestor == home:
            break
        if ancestor.is_symlink():
            raise StorageError(f"refusing symlinked local cache ancestor: {ancestor}")
    resolved_home = home.resolve()
    resolved = path.resolve()
    if resolved == resolved_home or resolved_home not in resolved.parents:
        raise StorageError(f"local cache path escapes operator home: {path}")



def _verify_electron_cache_inactive(paths: list[Path]) -> None:
    """Fail-closed on packaging processes or open cache descriptors on owner Mac.

    This is a second in-OS guard, not just advice in an LLM-generated shell
    script. A process/start race is still possible; do not auto-schedule apply.
    """
    if sys.platform != "darwin" or os.geteuid() != os.getuid():
        raise StorageError("Electron cache mutation requires owner macOS session")
    for argv, timeout in ((["ps", "-axo", "comm="], 15), (["lsof", "-nP", "-F", "n"], 60)):
        try:
            result = subprocess.run(argv, capture_output=True, text=True,
                                    check=False, timeout=timeout)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise StorageError("Electron consumer census unavailable") from exc
        if result.returncode != 0 or len(result.stdout) > 4_000_000:
            raise StorageError("Electron consumer census incomplete")
        if argv[0] == "ps":
            active = ("electron-builder", "electron-packager", "electron-forge",
                      "electron-rebuild")
            if any(any(line.strip().lower().split("/")[-1] == executable for executable in active)
                   for line in result.stdout.splitlines()):
                raise StorageError("active Electron packaging process")
        else:
            targets = [str(path) for path in paths]
            for line in result.stdout.splitlines():
                if line.startswith("n") and any(
                    line[1:] == target or line[1:].startswith(target + os.sep)
                    for target in targets
                ):
                    raise StorageError("open Electron cache descriptor")


def local_maintain(*, apply: bool, json_mode: bool, extended: bool = False,
                   electron_only: bool = False, home: Path | None = None) -> int:
    if extended and electron_only:
        raise StorageError("--electron-only cannot be combined with --extended")
    operator_home = (home or Path.home()).resolve()
    before = local_storage_snapshot(measure=True, home=operator_home)
    extra_candidates = []
    for name, relative in LOCAL_EXTENDED_REGENERABLE_PATHS:
        path = operator_home / relative
        # A newly introduced cache must not block the legacy four-cache lane.
        # Extended apply, however, fails closed on any untrusted path before
        # deleting the first cache.
        blocked_reason = None
        try:
            _assert_local_reclaim_path(operator_home, path)
            if path.exists() and not path.is_dir():
                raise StorageError(f"extended cache target must be a plain directory: {path}")
        except StorageError as exc:
            blocked_reason = str(exc)
            if extended:
                raise
        extra_candidates.append({
            "name": name, "path": str(path), "exists": path.exists(),
            "allocated_bytes": _allocated_bytes(path) if path.exists() and not blocked_reason else 0,
            "blocked_reason": blocked_reason,
        })
    # Electron is a distinct cache lane. Fail closed on BOTH targets before
    # deleting either; never expand the legacy/default or extended allowlists.
    electron_candidates: list[dict[str, Any]] = []
    if electron_only:
        for name, relative in LOCAL_ELECTRON_REGENERABLE_PATHS:
            path = operator_home / relative
            _assert_local_reclaim_path(operator_home, path)
            if path.exists() and not path.is_dir():
                raise StorageError(f"Electron cache target must be a directory: {path}")
            electron_candidates.append({
                "name": name, "path": str(path), "exists": path.exists(),
                "allocated_bytes": _allocated_bytes(path) if path.exists() else 0,
            })
    selected = (
        LOCAL_ELECTRON_REGENERABLE_PATHS if electron_only else
        LOCAL_REGENERABLE_PATHS + (LOCAL_EXTENDED_REGENERABLE_PATHS if extended else ())
    )
    payload: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-local-storage-maintenance",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "apply": apply,
        "extended": extended,
        "electron_only": electron_only,
        "electron_candidates": electron_candidates,
        "electron_reclaimable_bytes": sum(int(row["allocated_bytes"]) for row in electron_candidates),
        "extra_candidates": extra_candidates,
        "extra_reclaimable_bytes": sum(int(row["allocated_bytes"]) for row in extra_candidates),
        "before": before,
        "actions": [],
        "status": "PREVIEW",
    }
    if apply:
        if electron_only:
            _verify_electron_cache_inactive(
                [operator_home / relative for _, relative in LOCAL_ELECTRON_REGENERABLE_PATHS]
            )
        for name, relative in selected:
            path = operator_home / relative
            _assert_local_reclaim_path(operator_home, path)
            existed = path.exists()
            allocated = _allocated_bytes(path) if existed else 0
            if existed:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            payload["actions"].append(
                {
                    "name": name,
                    "path": str(path),
                    "existed": existed,
                    "allocated_bytes_before": allocated,
                    "removed": existed and not path.exists(),
                }
            )
        after = local_storage_snapshot(measure=True, home=operator_home)
        payload["after"] = after
        payload["reclaimed_bytes"] = max(
            0,
            int(after["filesystem"]["free_bytes"]) - int(before["filesystem"]["free_bytes"]),
        )
        payload["status"] = "PASS"
        LOCAL_RECEIPT_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        receipt = LOCAL_RECEIPT_DIR / f"{stamp}-local-maintenance.json"
        receipt.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        receipt.chmod(0o444)
        payload["receipt"] = str(receipt)

    if json_mode:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print("⚔️  AOE2WAR LOCAL STORAGE")
        print()
        print(f"Status:          {payload['status']}")
        print(f"Four-cache plan: {gib(before['reclaimable_bytes'])}")
        print(f"Extra opt-in:    {gib(payload['extra_reclaimable_bytes'])} across four package caches")
        print(f"Extended apply:  {'YES' if extended else 'NO'}")
        print(f"Electron only:   {'YES' if electron_only else 'NO'}")
        if electron_only:
            print(f"Electron plan:   {gib(payload['electron_reclaimable_bytes'])} · two download caches")
        print(f"Free before:     {gib(before['filesystem']['free_bytes'])}")
        if apply:
            print(f"Free after:      {gib(payload['after']['filesystem']['free_bytes'])}")
            print(f"Measured gain:   {gib(payload['reclaimed_bytes'])}")
            print(f"Receipt:         {payload['receipt']}")
        else:
            if electron_only:
                print("READ ONLY: --apply --electron-only removes ONLY the two named Electron download caches.")
            else:
                print("READ ONLY: --apply removes only four original caches; --apply --extended")
                print("adds npm content, Homebrew downloads, and two pip download cache roots.")
    return 0


def make_plan() -> dict[str, Any]:
    s = snapshot(measure=True)
    p = policy()
    used = float(s["used_percent"])
    candidate = s.get("next_candidate")
    candidate_kb = s.get("next_candidate_allocated_kb")
    if used < p["healthy_target"]:
        status = "NOOP_HEALTHY"
    elif used < p["maintenance_due"]:
        status = "WATCH"
    elif not candidate:
        status = "BLOCKED_NO_ELIGIBLE_GENERATION"
    else:
        status = "READY"
    conservative_reclaim_kb = int(candidate_kb * 0.70) if isinstance(candidate_kb, int) else None
    return {
        "schema": 1,
        "kind": "aoe2war-storage-os-plan",
        "status": status,
        "health": s["health"],
        "used_percent": used,
        "healthy_target_percent": p["healthy_target"],
        "maintenance_due_percent": p["maintenance_due"],
        "protected_newest": s["protected_newest"],
        "candidate": candidate,
        "candidate_policy": "rolling-hot-window",
        "candidate_allocated_kb": candidate_kb,
        "conservative_reclaim_estimate_kb": conservative_reclaim_kb,
        "transaction_limit": 1,
        "legacy_auto_action": "NEVER",
        "wolo_mutation_allowed": False,
    }


def print_plan(plan: dict[str, Any]) -> None:
    print("⚔️  AOE2WAR STORAGE PLAN")
    print()
    print(f"Status:          {plan['status']}")
    print(f"Volume:          {plan['used_percent']:.2f}% used")
    print(f"Healthy target:  < {plan['healthy_target_percent']}%")
    print(f"Maintenance due: ≥ {plan['maintenance_due_percent']}%")
    print(f"Candidate:       {plan['candidate'] or '—'}")
    print("Selection:       next generation outside configured hot window")
    if plan.get("candidate_allocated_kb"):
        print(f"Candidate size:  {plan['candidate_allocated_kb'] / 1048576:.2f} GiB")
    if plan.get("conservative_reclaim_estimate_kb"):
        print(f"Conservative reclaim estimate: {plan['conservative_reclaim_estimate_kb'] / 1048576:.2f} GiB")
    print("Transaction:     exactly one generation")
    print("Legacy:          NEVER automatic")
    print("Wolo mutation:   forbidden")


def operator_baseline() -> tuple[str, str]:
    branch = run(["git", "-C", str(ROOT), "branch", "--show-current"])
    if branch != "main":
        raise StorageError(f"operator repository must be on main, got {branch!r}")
    dirty = run(["git", "--no-optional-locks", "-C", str(ROOT), "status", "--porcelain", "--untracked-files=all"])
    if dirty:
        raise StorageError("operator repository must be clean before archival apply")
    run(["git", "-C", str(ROOT), "fetch", "origin", "main"], timeout=60)
    head = run(["git", "-C", str(ROOT), "rev-parse", "HEAD"])
    remote = run(["git", "-C", str(ROOT), "rev-parse", "origin/main"])
    if head != remote:
        raise StorageError(f"local HEAD {head} != origin/main {remote}")

    status = run([str(ROOT / "bin" / "aoe2war"), "status"], timeout=60)
    state = re.search(r"^State:\s+(\S+)\s*$", status, re.MULTILINE)
    if not state or state.group(1) not in {"CERTIFIED", "PUBLISHED"}:
        raise StorageError("AoE2WAR status must have a certified active runtime")
    if not re.search(r"^Provenance:\s+CERTIFIED\b", status, re.MULTILINE):
        raise StorageError("active production provenance is not CERTIFIED")

    live = snapshot(measure=False)
    runtime = live["runtime"]
    release = str(runtime["source_sha"])
    build = str(runtime["build_id"])
    if not re.fullmatch(r"[0-9a-f]{40}", release):
        raise StorageError("cannot resolve active certified production source")
    if not BUILD_RE.fullmatch(build):
        raise StorageError("cannot resolve active certified BUILD_ID")
    proc = subprocess.run(
        ["git", "-C", str(ROOT), "merge-base", "--is-ancestor", release, remote],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if proc.returncode != 0:
        raise StorageError(
            f"certified production {release} is not an ancestor of origin/main {remote}"
        )

    expected = {
        "Mac HEAD:": head[:10],
        "GitHub main:": remote[:10],
        "Prod source:": release[:10],
        "Active build:": build,
    }
    for label, value in expected.items():
        if not re.search(
            rf"^{re.escape(label)}\s+{re.escape(value)}(?:\s|$)",
            status,
            re.MULTILINE,
        ):
            raise StorageError(f"AoE2WAR status does not bind current {label}")
    return release, build


def invoke_worker(release: str, build: str, generation: str) -> None:
    if not GENERATION_RE.fullmatch(generation):
        raise StorageError(f"unsafe generation: {generation!r}")
    p = policy()
    source = WORKER_PATH.read_text(encoding="utf-8")
    cmd = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        p["root_maintenance_host"],
        "bash", "-s", "--", release, build, generation, str(p["protected_newest"]),
    ]
    proc = subprocess.run(cmd, input=source, text=True, check=False)
    if proc.returncode != 0:
        raise StorageError(f"archive worker failed for {generation} with {proc.returncode}")


def maintain(*, apply: bool, until_target: bool, max_generations: int, force: bool) -> int:
    if not apply:
        print_plan(make_plan())
        print()
        print("READ ONLY: pass --apply to archive exactly one proven-safe generation.")
        return 0
    if max_generations < 1 or max_generations > 25:
        raise StorageError("--max-generations must be between 1 and 25")
    if not until_target and max_generations != 1:
        raise StorageError("--max-generations > 1 requires --until-target")

    release, build = operator_baseline()
    archived = 0
    while True:
        plan = make_plan()
        if plan["status"] == "NOOP_HEALTHY":
            print("PASS: storage is already below the healthy target")
            break
        watch_continuation = False
        if plan["status"] == "WATCH" and not force:
            if until_target:
                if not plan.get("candidate"):
                    raise StorageError(
                        "healthy target not reached but no eligible "
                        "generation remains"
                    )
                watch_continuation = True
            else:
                print("PASS: storage is in WATCH range; no archival is due")
                break

        if (
            plan["status"] != "READY"
            and not watch_continuation
            and not (force and plan.get("candidate"))
        ):
            raise StorageError(
                f"storage plan is not actionable: {plan['status']}"
            )

        generation = str(plan["candidate"])
        print()
        print("============================================================")
        print(f"ARCHIVE TRANSACTION {archived + 1}: {generation}")
        print("============================================================")
        invoke_worker(release, build, generation)
        archived += 1

        current = snapshot(measure=False)
        print()
        print_status(current)
        if float(current["used_percent"]) < policy()["healthy_target"]:
            print("PASS: healthy capacity target reached")
            break
        if not until_target or archived >= max_generations:
            break
    return 0


def verify_archives(*, json_mode: bool) -> int:
    payload = remote_json(REMOTE_VERIFY, policy(), timeout=1800)
    if json_mode:
        print(json.dumps(payload, indent=2, sort_keys=True))
    else:
        print("⚔️  AOE2WAR STORAGE ARCHIVE VERIFY")
        print()
        print(f"Status:  {payload['status']}")
        print(f"Checked: {payload['checked']}")
        print(f"Failed:  {payload['failed']}")
        for row in payload["rows"]:
            marker = "✓" if row["ok"] else "✗"
            detail = "; ".join(row["detail"])
            print(f"{marker} {row['generation']}" + (f" — {detail}" if detail else ""))
    return 0 if payload.get("status") == "PASS" else 2


def self_test() -> int:
    p = policy()
    assert (p["healthy_target"], p["maintenance_due"], p["automatic_threshold"], p["critical"]) == (78, 82, 85, 92)
    assert p["protected_newest"] == 2
    assert p["root_maintenance_host"] == "root@hel1"
    assert {name for name, _ in LOCAL_EXTENDED_REGENERABLE_PATHS} == {
        "npm_content_cache", "homebrew_download_cache", "pip_download_cache", "pip_user_cache",
    }
    assert not ({str(path) for _, path in LOCAL_REGENERABLE_PATHS} &
                {str(path) for _, path in LOCAL_EXTENDED_REGENERABLE_PATHS})
    assert GENERATION_RE.fullmatch("activate-20260818T195631Z-005546f4068d")
    assert not GENERATION_RE.fullmatch("../activate-20260818T195631Z-005546f4068d")
    expected = "aae6f7f3c367a8a6f59c918b37ba2cafc6897cf25d18e6cc212373ca925420ae"
    if p.get("pilot_sha256") != expected:
        raise StorageError("proven pilot provenance hash drifted")
    if "for name in sorted(eligible):" in REMOTE_PROBE:
        raise StorageError("candidate ordering regressed to oldest-first")
    if "for name in eligible:" not in REMOTE_PROBE:
        raise StorageError("rolling hot-window candidate selector is missing")
    if not WORKER_PATH.is_file():
        raise StorageError("archive worker missing")
    digest = hashlib.sha256(WORKER_PATH.read_bytes()).hexdigest()
    if len(digest) != 64:
        raise StorageError("worker digest invalid")
    print("PASS: Storage OS policy and worker invariants")
    return 0


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AoE2WAR Storage OS")
    sub = p.add_subparsers(dest="command", required=True)
    for name in ("status", "plan"):
        q = sub.add_parser(name)
        q.add_argument("--json", action="store_true")
    q = sub.add_parser("estate")
    q.add_argument("--json", action="store_true")
    q.add_argument("--measure", action="store_true")
    q = sub.add_parser("local-maintain")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--extended", action="store_true", help="explicitly include four additional package download/content caches")
    q.add_argument("--electron-only", action="store_true", help="opt-in two standalone Electron toolchain download caches, no other cache roots")
    q.add_argument("--json", action="store_true")
    q = sub.add_parser("local-pressure")
    q.add_argument("--json", action="store_true")
    q.add_argument("--limit", type=int, default=30)
    q.add_argument("--focus", choices=("generic_cache",), help="bounded read-only cache child drilldown")
    q = sub.add_parser("local-plan")
    q.add_argument("--json", action="store_true")
    q.add_argument("--l1-campaign", action="store_true",
                   help="one read-only native Mac L1 capacity and policy review, never apply")
    q = sub.add_parser("local-reclaim-three-next")
    q.add_argument("--apply", action="store_true")
    q = sub.add_parser("deep-census")
    q.add_argument("--json", action="store_true")
    q = sub.add_parser("triage")
    q.add_argument("--json", action="store_true")
    q.add_argument("--expiry-inventory", type=Path)
    q = sub.add_parser("maintain")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--until-target", action="store_true")
    q.add_argument("--max-generations", type=int, default=1)
    q.add_argument("--force", action="store_true")
    q = sub.add_parser("verify")
    q.add_argument("--json", action="store_true")
    q = sub.add_parser("expiry")
    q.add_argument("expiry_args", nargs=argparse.REMAINDER)
    q = sub.add_parser("campaign")
    q.add_argument("campaign_args", nargs=argparse.REMAINDER)
    q = sub.add_parser("handoff")
    q.add_argument("handoff_args", nargs=argparse.REMAINDER)
    q = sub.add_parser("db-snapshots")
    q.add_argument("db_snapshot_args", nargs=argparse.REMAINDER)
    q = sub.add_parser("atlas-snapshot")
    q.add_argument("--inputs", type=Path, required=True)
    q.add_argument("--previous", type=Path)
    q.add_argument("--public", action="store_true")
    q = sub.add_parser("artifacts")
    q.add_argument("--inventory", type=Path, required=True)
    q.add_argument("--apply", action="store_true")
    q = sub.add_parser("atlas-probe")
    q.add_argument("--plane", required=True, choices=("mac", "hel1-root", "hel1-volume-105319120"))
    return p


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--self-test":
        return self_test()
    args = parser().parse_args()
    if args.command == "status":
        payload = snapshot(measure=False)
        print(json.dumps(payload, indent=2, sort_keys=True) if args.json else "", end="")
        if not args.json:
            print_status(payload)
        return 0
    if args.command == "plan":
        payload = make_plan()
        print(json.dumps(payload, indent=2, sort_keys=True) if args.json else "", end="")
        if not args.json:
            print_plan(payload)
        return 0
    if args.command == "estate":
        payload = estate_snapshot(measure=args.measure)
        print(json.dumps(payload, indent=2, sort_keys=True) if args.json else "", end="")
        if not args.json:
            print_estate(payload)
        return 0
    if args.command == "local-maintain":
        return local_maintain(apply=args.apply, json_mode=args.json, extended=args.extended,
                              electron_only=args.electron_only)
    if args.command == "local-pressure":
        cmd = [sys.executable, str(ROOT / "scripts" / "aoe2_storage_mac_pressure.py"),
               "--limit", str(args.limit)]
        if args.focus:
            cmd.extend(["--focus", args.focus])
        if args.json:
            cmd.append("--json")
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "local-plan":
        cmd = [sys.executable, str(ROOT / "scripts" / "aoe2_storage_local_plan.py")]
        if args.json:
            cmd.append("--json")
        if args.l1_campaign:
            cmd.append("--l1-campaign")
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "local-reclaim-three-next":
        cmd = [sys.executable, str(ROOT / "scripts" / "aoe2_storage_reclaim_three_next.py")]
        if args.apply:
            cmd.append("--apply")
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "triage":
        payload = storage_triage(expiry_inventory_path=args.expiry_inventory)
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_storage_triage(payload)
        return 0
    if args.command == "deep-census":
        payload = deep_storage_census()
        if args.json:
            print(json.dumps(payload, indent=2, sort_keys=True))
        else:
            print_deep_storage_census(payload)
        return 0
    if args.command == "maintain":
        return maintain(apply=args.apply, until_target=args.until_target, max_generations=args.max_generations, force=args.force)
    if args.command == "verify":
        return verify_archives(json_mode=args.json)
    if args.command == "expiry":
        return subprocess.run([sys.executable, str(ROOT / "scripts" / "aoe2_storage_expire.py"), *args.expiry_args], cwd=ROOT, check=False).returncode
    if args.command == "campaign":
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "aoe2_storage_campaign.py"),
            *args.campaign_args,
        ]
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "handoff":
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "aoe2_storage_handoff.py"),
            *args.handoff_args,
        ]
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "db-snapshots":
        cmd = [
            sys.executable,
            str(ROOT / "scripts" / "aoe2_db_snapshot_retention.py"),
            *args.db_snapshot_args,
        ]
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "atlas-snapshot":
        cmd = [sys.executable, str(ROOT / "scripts" / "aoe2_storage_atlas.py"), "--inputs", str(args.inputs)]
        if args.previous is not None:
            cmd.extend(["--previous", str(args.previous)])
        if args.public:
            cmd.append("--public")
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "artifacts":
        cmd = [sys.executable, str(ROOT / "scripts" / "aoe2_storage_artifacts.py"), "--inventory", str(args.inventory)]
        if args.apply:
            cmd.append("--apply")
        return subprocess.run(cmd, cwd=ROOT, check=False).returncode
    if args.command == "atlas-probe":
        return subprocess.run([sys.executable, str(ROOT / "scripts" / "aoe2_storage_probe.py"), "--plane", args.plane], cwd=ROOT, check=False).returncode
    raise StorageError(f"unknown command: {args.command}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (StorageError, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
