#!/usr/bin/env python3
"""Exact two-build restricted 3032 rollback/recovery drill.

Never touches 3030, Nginx, Chain, financial SQL, bank, wallet or custody.
The --phase plan is read-only. Execute is deliberately blocked while ANY
PostgreSQL pg_dump/pg_restore operates, preserving Session A's C06 work.
Every live transition requires original V9 source-bound Steam re-enrollment.
"""
from __future__ import annotations

import argparse
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.request

P = pathlib.Path
WEB = P("/etc/systemd/system/aoe2hdbets-web-prod.service")
STEAM = P("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
NGINX = P("/etc/nginx/sites-available/aoe2war.com")
GUARD = P("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v9.py")
ACTIVE = P("/etc/aoe2war/web-prod-v9/active-profile.json")
ROOT = P("/root/aoe2war-session-b-c03-rollback-drill-v1")
LOCK = P("/run/lock/aoe2war-r25-c03-restricted-rollback-drill-v1.lock")
LIVE_SCRIPT = P("/usr/local/lib/aoe2war-web-prod/r25_c03_restricted_rollback_drill_v1.py")
WEB_SERVICE = "aoe2hdbets-web-prod.service"
STEAM_SERVICE = "aoe2war-steam-egress-refresh.service"
STEAM_TIMER = "aoe2war-steam-egress-refresh.timer"
SOURCE = {
    "candidate": {
        "sha": "4ab96cc7c1c0ba43a0403795485d3f410a6ba07f",
        "stage": "/var/lib/aoe2war-web-prod-4ab96cc7c1c0",
        "version": "20261108182649-ca81f00609",
        "build": "YF_YxSAxc0izAfRG0ARsc",
        "unit_sha": "42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621",
        "receipt": "/etc/aoe2war/web-prod-v8/candidate-stage-acceptance.json",
        "receipt_sha": "c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701",
    },
    "rollback": {
        "sha": "0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1",
        "stage": "/var/lib/aoe2war-web-prod-0a7450f9c8c1",
        "version": "20261108140705-1d068e417c",
        "build": "AX78Oo6yfx4AmSCbDgemv",
        "unit_sha": "be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6",
        "receipt": "/etc/aoe2war/web-prod-v7/candidate-stage-acceptance.json",
        "receipt_sha": "31d750fe72b6b6e1fdad492fec94d1a863fd5305360c400bc3b036167b6c9f27",
    },
}
STEAM_UNIT_SHA = "0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557"
NGINX_SHA = "811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f"
GUARD_SHA = "cb275a8ae8bc62c373ffe73063e60ff8ca7bd93661b899d887432ad6095cb07a"
FIN_SHA = "6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb"
VALIDATOR_PID = 1009
LEGACY_PID = 2625090

class ReleaseHold(RuntimeError):
    pass

def require(ok: bool, reason: str):
    if not ok:
        raise ReleaseHold("HOLD:" + reason)

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def safe_regular(path: P, exact_mode: int | None = None) -> bytes:
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1,
            "RELEASE_SOURCE_FILE_IDENTITY")
    mode = stat.S_IMODE(st.st_mode)
    require(mode & 0o022 == 0, "RELEASE_SOURCE_FILE_WRITABLE")
    if exact_mode is not None:
        require(mode == exact_mode, "RELEASE_SOURCE_FILE_MODE")
    return path.read_bytes()

def derive_rollback_unit(candidate_unit: bytes) -> bytes:
    current = SOURCE["candidate"]["stage"].encode()
    previous = SOURCE["rollback"]["stage"].encode()
    require(sha(candidate_unit) == SOURCE["candidate"]["unit_sha"],
            "ACTIVE_CANDIDATE_UNIT_SHA_DRIFT")
    require(candidate_unit.count(current) == 4 and candidate_unit.count(previous) == 0,
            "CANDIDATE_NOT_FOUR_EXACT_PATH_BINDINGS")
    result = candidate_unit.replace(current, previous)
    require(sha(result) == SOURCE["rollback"]["unit_sha"] and result.count(previous) == 4,
            "ROLLBACK_UNIT_NOT_EXACT_SOURCE_BOUND")
    return result

def run(argv: list[str], timeout: float = 15.0, accepted=(0,)) -> str:
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    require(p.returncode in accepted,
            "SUBCOMMAND_FAILED_" + P(argv[0]).name.upper().replace("-", "_"))
    return p.stdout.strip()

def unit_pid(name: str) -> int:
    return int(run(["/usr/bin/systemctl", "show", name, "-p", "MainPID", "--value"], 7))

def live_build() -> str | None:
    request = urllib.request.Request("http://127.0.0.1:3032/api/deployment-version",
                                     headers={"Host": "aoe2war.com", "Cache-Control": "no-store"})
    try:
        with urllib.request.urlopen(request, timeout=8) as r:
            d = json.loads(r.read(12000))
            return d.get("buildVersion") if r.status == 200 else None
    except Exception:
        return None

def wait_build(version: str, timeout: float = 36.0) -> int:
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        if live_build() == version:
            pid = unit_pid(WEB_SERVICE)
            if pid > 1:
                return pid
        time.sleep(0.65)
    raise ReleaseHold("HOLD:RESTRICTED_3032_BUILD_UNHEALTHY")

def observe_finance_unchanged():
    require(unit_pid("aoe2hdbets-web.service") == LEGACY_PID,
            "LEGACY_3030_PID_DRIFT")
    require(unit_pid("wolochaind-mainnet.service") == VALIDATOR_PID,
            "CHAIN_VALIDATOR_PID_DRIFT")
    for port in (8094, 8095):
        s = run(["/usr/bin/ss", "-lnt", f"sport = :{port}"], 8)
        require("LISTEN" not in s, "FUNDED_PORT_NOT_CLOSED")
    require(sha(safe_regular(NGINX)) == NGINX_SHA, "NGINX_SOURCE_DRIFT")
    require(sha(safe_regular(STEAM)) == STEAM_UNIT_SHA, "STEAM_SERVICE_UNIT_DRIFT")

def source_steam_inspect(pause=time.sleep):
    """Retry only a fully verified, temporarily executing C03 V1 observer.

    Never normalize or retry source, unit, command, timer or finance drift.
    Every retry invokes the entire original V9 read-only protected verifier.
    """
    for attempt in range(4):
        p = subprocess.run(["/usr/bin/python3", "-I", "-B", str(GUARD),
                            "--phase", "inspect"],
                           capture_output=True, text=True, timeout=50)
        try:
            v = json.loads(p.stdout)
        except (ValueError, TypeError):
            raise ReleaseHold("HOLD:STEAM_INSPECT_INVALID_RECEIPT")
        if p.returncode == 0:
            require(v.get("status") == "PASS_STEAM_V9_PROTECTED_READONLY"
                    and v.get("protected_snapshot_sha256") == FIN_SHA
                    and v.get("finance_authorized") is False,
                    "STEAM_SOURCE_BOUND_FINANCE_INSPECTION_HOLD")
            return
        if (p.returncode == 3
                and v.get("reason") == "C03_OBSERVER_TEMPORARILY_ACTIVE"
                and v.get("status") == "HOLD_STEAM_V9" and attempt < 3):
            pause(0.55)
            continue
        raise ReleaseHold("HOLD:STEAM_SOURCE_BOUND_FINANCE_INSPECTION_HOLD")
    raise ReleaseHold("HOLD:C03_OBSERVER_DID_NOT_SETTLE")

def wait_steam_inactive(timeout: float = 18.0):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        state = run(["/usr/bin/systemctl", "show", STEAM_SERVICE,
                     "-p", "ActiveState", "--value"], 7)
        if state == "inactive":
            return
        time.sleep(0.35)
    raise ReleaseHold("HOLD:STEAM_SERVICE_STILL_ACTIVE")

def root_private_lock(fd: int) -> bool:
    st = os.fstat(fd)
    return (stat.S_ISREG(st.st_mode) and st.st_uid == 0 and
            stat.S_IMODE(st.st_mode) == 0o600)

def pg_capture_active() -> bool:
    # The process *comm* field only. No environment, user command line,
    # DB URL, plaintext or backup output is inspected.
    raw = run(["/usr/bin/ps", "-eo", "comm="], 9)
    return any(P(line).name in {"pg_dump", "pg_restore", "pg_basebackup"}
               for line in raw.splitlines())

def free_resources():
    mem = P("/proc/meminfo").read_text()
    available = int(next(x.split()[1] for x in mem.splitlines()
                         if x.startswith("MemAvailable:"))) * 1024
    require(available >= 1_250_000_000, "RAM_HEADROOM_INSUFFICIENT")
    require(shutil.disk_usage("/").free >= 7_000_000_000, "DISK_RESERVE_INSUFFICIENT")

def preflight():
    require(os.geteuid() == 0, "ROOT_REQUIRED")
    require(sha(safe_regular(GUARD, 0o644)) == GUARD_SHA, "V9_EXACT_SOURCE_DRIFT")
    for name, info in SOURCE.items():
        stage = P(info["stage"])
        st = stage.lstat()
        require(stat.S_ISDIR(st.st_mode) and st.st_uid == 0 and
                stat.S_IMODE(st.st_mode) == 0o755, "STAGE_MODE_OR_OWNER_DRIFT")
        require((stage / ".aoe2war-source-sha").read_text().strip() == info["sha"]
                and (stage / ".next/BUILD_ID").read_text().strip() == info["build"]
                and (stage / ".aoe2war-build-version").read_text().strip() == info["version"],
                "STAGE_EXACT_SOURCE_OR_BUILD_DRIFT")
        require(sha(safe_regular(P(info["receipt"]), 0o600)) == info["receipt_sha"],
                "REVIEWED_STAGE_RECEIPT_DRIFT")
    raw = safe_regular(WEB, 0o644)
    previous = derive_rollback_unit(raw)
    active = json.loads(safe_regular(ACTIVE, 0o400))
    require(active.get("profile") == "candidate"
            and active.get("source_sha") == SOURCE["candidate"]["sha"]
            and active.get("finance_authorized") is False, "ACTIVE_PROFILE_NOT_CANDIDATE")
    require(run(["/usr/bin/systemctl", "show", WEB_SERVICE, "-p", "User", "--value"]) ==
            "aoe2war-web-prod", "WEB_SERVICE_NOT_RESTRICTED_USER")
    require(run(["/usr/bin/systemctl", "show", WEB_SERVICE,
                 "-p", "ActiveState", "--value"]) == "active", "WEB_SERVICE_NOT_ACTIVE")
    require(unit_pid(WEB_SERVICE) > 1 and
            live_build() == SOURCE["candidate"]["version"],
            "CANDIDATE_NOT_LIVE_ON_3032")
    require(run(["/usr/bin/systemctl", "is-active", STEAM_TIMER]) == "active",
            "STEAM_TIMER_NOT_ACTIVE")
    require(sha(safe_regular(NGINX)) == NGINX_SHA, "NGINX_SOURCE_DRIFT")
    require(subprocess.run(["/usr/sbin/nginx", "-t"],
                           capture_output=True, timeout=8).returncode == 0,
            "NGINX_CONFIG_NOT_VALID")
    observe_finance_unchanged()
    # A transient active C03 observer may cause a bounded HOLD; no financial
    # source hash, permission or expected fingerprint is modified to recover.
    source_steam_inspect()
    free_resources()
    return raw, previous

def atomic_root_file(path: P, content: bytes, mode: int):
    temp = path.with_name("." + path.name + ".new-" + str(os.getpid()))
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(temp, mode)
    os.replace(temp, path)

def switch_and_accept(profile: str, unit: bytes):
    require(profile in SOURCE, "UNKNOWN_FINANCE_SAFE_PROFILE")
    require(sha(unit) == SOURCE[profile]["unit_sha"], "NON_REVIEWED_WEB_UNIT")
    require(sha(safe_regular(WEB)) in {
        SOURCE["candidate"]["unit_sha"], SOURCE["rollback"]["unit_sha"]},
        "WEB_UNIT_CHANGED_BEFORE_SWITCH")
    require(sha(safe_regular(STEAM)) == STEAM_UNIT_SHA, "STEAM_SERVICE_SOURCE_DRIFT")
    require(sha(safe_regular(NGINX)) == NGINX_SHA, "NGINX_SOURCE_DRIFT")
    atomic_root_file(WEB, unit, 0o644)
    run(["/usr/bin/systemctl", "daemon-reload"], 14)
    run(["/usr/bin/systemctl", "restart", WEB_SERVICE], 45)
    pid = wait_build(SOURCE[profile]["version"], 35)
    require(run(["/usr/bin/systemctl", "show", WEB_SERVICE,
                 "-p", "User", "--value"]) == "aoe2war-web-prod",
            "ROLLED_WEB_NOT_RESTRICTED")
    observe_finance_unchanged()
    source_steam_inspect()
    result = run(["/usr/bin/python3", "-I", "-B", str(GUARD),
                  "--phase", "enroll", "--profile", profile], 60)
    require("PASS_EXACT_STEAM_V9_ADMISSION" in result, "STEAM_REENROLL_HOLD")
    run(["/usr/bin/systemctl", "reset-failed", STEAM_SERVICE], 8)
    run(["/usr/bin/systemctl", "start", STEAM_SERVICE], 45)
    require(run(["/usr/bin/systemctl", "show", STEAM_SERVICE,
                 "-p", "Result", "--value"]) == "success", "STEAM_REFRESH_HOLD")
    source_steam_inspect()
    require(live_build() == SOURCE[profile]["version"], "POST_STEAM_BUILD_DRIFT")
    return pid

def root_private_receipt_dir(path: P) -> bool:
    if not path.is_dir() or path.is_symlink():
        return False
    st = path.stat()
    return st.st_uid == 0 and stat.S_IMODE(st.st_mode) == 0o700

def write_receipt(status: str, details: dict):
    require(root_private_receipt_dir(ROOT), "RECEIPT_DIR_NOT_ROOT_PRIVATE")
    document = {
        "schema": "aoe2war.session-b.c03.reversible-r25-rollback-drill.v1",
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "status": status, "financial_release_authorized": False,
        "candidate_source": SOURCE["candidate"]["sha"],
        "restricted_rollback_source": SOURCE["rollback"]["sha"],
        "legacy_3030_used_as_fallback": False, "financial_sql_writes": 0,
        "custody_mutations": 0, "Nginx_unchanged_sha256": NGINX_SHA,
        "steam_original_finance_sha256": FIN_SHA,
        **details,
    }
    payload = (json.dumps(document, sort_keys=True, indent=2) + "\n").encode()
    name = "rollback-drill-" + str(int(time.time())) + "-" + str(os.getpid()) + ".json"
    dest = ROOT / name
    fd = os.open(dest, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(payload)
        f.flush()
        os.fsync(f.fileno())
    print(json.dumps({"status": status, "receipt_sha256": sha(payload),
                      "path": str(dest)}, sort_keys=True), flush=True)

def drill(*, execute: bool):
    candidate, rollback = preflight()
    if not execute:
        print(json.dumps({
            "status": "PASS_R25_RESTRICTED_ROLLBACK_PREFLIGHT_NO_MUTATION",
            "candidate_unit_sha": sha(candidate),
            "rollback_unit_sha": sha(rollback),
            "C03_observer_snapshot": FIN_SHA,
            "Steam_V9_source": GUARD_SHA,
            "finance_authorized": False,
            "would_change_production": False,
        }, sort_keys=True), flush=True)
        return

    # No drills while A's HD/DE backup or restore is running. Recheck
    # inside the exclusive lock before any service state is modified.
    require(not pg_capture_active(), "C06_C07_POSTGRES_CAPTURE_IN_PROGRESS")
    free_resources()
    fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+") as lock:
        require(root_private_lock(lock.fileno()),
                "RELEASE_LOCK_SOURCE_MODE_DRIFT")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise ReleaseHold("HOLD:ANOTHER_WEB_RELEASE_IN_PROGRESS")
        require(not ROOT.exists() and not ROOT.is_symlink(),
                "ROLLBACK_DRILL_ALREADY_ATTEMPTED")
        require(not pg_capture_active(), "C06_C07_CAPTURE_STARTED_DURING_PREFLIGHT")
        ROOT.mkdir(mode=0o700)
        timer_paused = False
        swapped = False
        rollback_pid = None
        candidate_pid = None
        success = False
        restart_timer_ok = True
        try:
            wait_steam_inactive()
            run(["/usr/bin/systemctl", "stop", STEAM_TIMER], 12)
            timer_paused = True
            # A capture can start after the initial read. A brand-new
            # started capture MUST block the very first web restart.
            require(not pg_capture_active(), "C06_C07_CAPTURE_STARTED_DURING_TIMER_PAUSE")
            swapped = True
            rollback_pid = switch_and_accept("rollback", rollback)
            time.sleep(3)
            source_steam_inspect()
            candidate_pid = switch_and_accept("candidate", candidate)
            time.sleep(3)
            source_steam_inspect()
            success = True
        except BaseException as exc:
            if swapped:
                try:
                    candidate_pid = switch_and_accept("candidate", candidate)
                    write_receipt("HOLD_DRILL_BUT_RESTRICTED_CANDIDATE_RESTORED",
                                  {"restore_pid": candidate_pid,
                                   "failure_class": type(exc).__name__})
                except BaseException as recovery:
                    write_receipt("HOLD_CRITICAL_RESTRICTED_RESTORATION_UNVERIFIED",
                                  {"failure_class": type(exc).__name__,
                                   "recovery_class": type(recovery).__name__})
            raise
        finally:
            if timer_paused:
                try:
                    p = subprocess.run(["/usr/bin/systemctl", "start", STEAM_TIMER],
                                       capture_output=True, text=True, timeout=15)
                    restart_timer_ok = p.returncode == 0 and run(
                        ["/usr/bin/systemctl", "is-active", STEAM_TIMER], 7) == "active"
                except BaseException:
                    restart_timer_ok = False
                if not restart_timer_ok:
                    write_receipt("HOLD_CRITICAL_STEAM_TIMER_RESTART_UNVERIFIED",
                                  {"candidate_pid": candidate_pid,
                                   "rollback_pid": rollback_pid})
                    raise ReleaseHold("HOLD:STEAM_TIMER_RESTART_UNVERIFIED")
        require(success and restart_timer_ok,
                "RESTRICTED_ROLLBACK_NOT_FULLY_ACCEPTED")
        # Receipt is written only AFTER the timer was restarted and verified.
        write_receipt("PASS_RESTRICTED_3032_ROLLBACK_AND_RESTORATION",
                      {"rollback_pid": rollback_pid, "restored_pid": candidate_pid,
                       "exact_web_unit_sha": sha(candidate),
                       "steam_timer_restarted_and_active": True})

def main():
    cli = argparse.ArgumentParser()
    cli.add_argument("--phase", choices=["plan", "execute"], required=True)
    cli.add_argument("--admit-brief-public-restart", action="store_true")
    args = cli.parse_args()
    require(args.phase != "execute" or args.admit_brief_public_restart,
            "BRIEF_PUBLIC_RESTART_NOT_EXPLICIT")
    if args.phase == "execute":
        # The ephemeral SSH-stdin read-only plan is not an execution medium.
        # A root-owned 0644 reviewed script must be installed at one exact
        # location before ANY service restart becomes possible.
        require(P(__file__).resolve() == LIVE_SCRIPT,
                "REVIEWED_ROOT_CONTROLLER_NOT_INSTALLED")
        safe_regular(LIVE_SCRIPT, 0o644)
    drill(execute=args.phase == "execute")

if __name__ == "__main__":
    try:
        main()
    except BaseException as exc:
        msg = str(exc)
        reason = msg if re.fullmatch(r"HOLD:[A-Z0-9_]{3,130}", msg) else "HOLD:NONIDENTIFYING_" + type(exc).__name__.upper()
        print(json.dumps({"status": "HOLD_R25_RESTRICTED_ROLLBACK_DRILL",
                          "reason": reason, "finance_authorized": False}, sort_keys=True),
              flush=True)
        sys.exit(3)
