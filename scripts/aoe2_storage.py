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
LOCAL_PROTECTED_PATHS = (
    ("recovery_vault", Path("aoe2war-recovery")),
    ("codex_sessions", Path(".codex/sessions")),
    ("crossover", Path("Library/Application Support/CrossOver")),
    ("mobile_sync", Path("Library/Application Support/MobileSync")),
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
        "reclaimable_bytes": sum(int(row.get("allocated_bytes") or 0) for row in regenerable),
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


def _assert_local_reclaim_path(home: Path, path: Path) -> None:
    if path.is_symlink():
        raise StorageError(f"refusing symlinked local cache path: {path}")
    resolved_home = home.resolve()
    resolved = path.resolve()
    if resolved == resolved_home or resolved_home not in resolved.parents:
        raise StorageError(f"local cache path escapes operator home: {path}")


def local_maintain(*, apply: bool, json_mode: bool, home: Path | None = None) -> int:
    operator_home = (home or Path.home()).resolve()
    before = local_storage_snapshot(measure=True, home=operator_home)
    payload: dict[str, Any] = {
        "schema": 1,
        "kind": "aoe2war-local-storage-maintenance",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "apply": apply,
        "before": before,
        "actions": [],
        "status": "PREVIEW",
    }
    if apply:
        for name, relative in LOCAL_REGENERABLE_PATHS:
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
        print(f"Reclaimable:     {gib(before['reclaimable_bytes'])}")
        print(f"Free before:     {gib(before['filesystem']['free_bytes'])}")
        if apply:
            print(f"Free after:      {gib(payload['after']['filesystem']['free_bytes'])}")
            print(f"Measured gain:   {gib(payload['reclaimed_bytes'])}")
            print(f"Receipt:         {payload['receipt']}")
        else:
            print("READ ONLY: pass --apply to remove only the four allowlisted regenerable caches.")
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
            if until_target and archived > 0:
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
    q.add_argument("--json", action="store_true")
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
        return local_maintain(apply=args.apply, json_mode=args.json)
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
    raise StorageError(f"unknown command: {args.command}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (StorageError, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
