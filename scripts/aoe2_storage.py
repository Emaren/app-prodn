#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import shlex
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "config" / "aoe2war-operations.json"
WORKER_PATH = ROOT / "scripts" / "aoe2_rollback_archive_one.sh"

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
    "archived_replaced_count": len(replaced),
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
        if not archive.is_file() or sha(archive) != payload["archive_sha256"]:
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
    print("Selection:       next generation outside newest-five hot window")
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
    if "State:          CERTIFIED" not in status:
        raise StorageError("AoE2WAR status is not CERTIFIED")
    for label in ("Mac HEAD:", "GitHub main:", "Prod source:"):
        if f"{label:<16}{head[:10]}" not in status:
            raise StorageError(f"AoE2WAR status does not bind current {label}")
    match = re.search(r"^Active build:\s+(\S+)\s*$", status, re.MULTILINE)
    if not match or not BUILD_RE.fullmatch(match.group(1)):
        raise StorageError("cannot resolve active certified BUILD_ID")
    return head, match.group(1)


def invoke_worker(release: str, build: str, generation: str) -> None:
    if not GENERATION_RE.fullmatch(generation):
        raise StorageError(f"unsafe generation: {generation!r}")
    p = policy()
    source = WORKER_PATH.read_text(encoding="utf-8")
    cmd = [
        "ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
        p["root_maintenance_host"],
        "bash", "-s", "--", release, build, generation,
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
    assert p["protected_newest"] == 5
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
    q = sub.add_parser("maintain")
    q.add_argument("--apply", action="store_true")
    q.add_argument("--until-target", action="store_true")
    q.add_argument("--max-generations", type=int, default=1)
    q.add_argument("--force", action="store_true")
    q = sub.add_parser("verify")
    q.add_argument("--json", action="store_true")
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
    if args.command == "maintain":
        return maintain(apply=args.apply, until_target=args.until_target, max_generations=args.max_generations, force=args.force)
    if args.command == "verify":
        return verify_archives(json_mode=args.json)
    raise StorageError(f"unknown command: {args.command}")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (StorageError, subprocess.TimeoutExpired) as exc:
        print(f"STOP: {exc}", file=sys.stderr)
        raise SystemExit(2)
