#!/usr/bin/env python3
"""One-use root-reviewed R25 Bet history web + Steam release; funded paths always HOLD.

A real CI archive has ALREADY been verified and safely extracted into STAGE.
Never changes Nginx, 3030, PostgreSQL ACL, C03 or WOLO custody services.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import time
import urllib.request

class Hold(RuntimeError):
    pass

ROOT = Path("/root/aoe2war-r25-bets-history-v5z-r3-20261107")
STAGE = Path("/var/lib/aoe2war-web-prod-1a380cdf76ff")
SOURCE = "1a380cdf76ff773aa1d094abd161523500b32b4a"
BUILD_ID = "XeiQIhm7XxQCOqcohCm_8"
RELEASE = "20261107204406-df999912fb"
MERGE = "cd042c413af61f5b029f59bd6c8c351e7a4aa5af"
ARTIFACT_ZIP_SHA = "32c641ca4808ead3402f07605a1b6aa3e0ba0cd95b5ef5b9488d8d41e902bbca"
MANIFEST_SHA = "d0f73b12628ad6b49ee804d7fec496e48e52f25215ba725cfcbe53b10e9d571b"
STAGE_RECEIPT = Path("/root/aoe2war-r25-bets-history-inert-artifact-20261107/inert-stage-accepted.json")
STAGE_RECEIPT_SHA = "7b6b8ed79bfae63459ad922d390cf9a2fbaa954221c627dea9358c1a0ab14daf"

OLD_STAGE = b"/var/lib/aoe2war-web-prod-1c4ffe0ce31e"
OLD_SOURCE = "1c4ffe0ce31e085bd1e287da6659ec72338c2f87"
OLD_WEB_PID = 2188495
OLD_WEB_UNIT_SHA = "9301389aaf545bb9f4273e183d1c0f1ddf6c6589cac84d79873124327f71e1ec"
NEW_WEB_UNIT_SHA = "1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3"

OLD_STEAM_UNIT_SHA = "6cda0dd112fe6a0d47594220969ff1f806bfadacad7eb4d0150f33c4e7b1529f"
OLD_STEAM_SOURCE = b"/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5w.py"
NEW_STEAM_SOURCE = b"/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5z.py"
NEW_V5X_SOURCE_SHA = "3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07"
OLD_STEAM_ACCEPT = Path("/root/aoe2war-r25-v5w-steam-stage-20261107/v5w-physical-accepted.json")
OLD_STEAM_ACCEPT_SHA = "c975c5d442386f3e0b8693d6abe2e8d321c682567dd06e158efa77b98f8ab25a"

OLD_SIGNED_RELEASE = Path("/var/lib/aoe2war-app-production-f/central-r25-1c4ffe0ce31e-20261106-retry2/COMMIT.json")
OLD_SIGNED_RELEASE_SHA = "6a20a634aff66d1f60dad3290a18dd237eb5017b8a6017f693da76a4510be4f2"
NEW_SIGNED_DIR = Path("/var/lib/aoe2war-app-production-f/r25-bets-history-v5z-r3-20261107")
NEW_SIGNED_RELEASE = NEW_SIGNED_DIR / "COMMIT.json"
WEB_UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
STEAM_UNIT = Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
V5X = Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5z.py")
V5X_DIR = Path("/etc/aoe2war/web-prod-v5z")
STEAM_ADMISSION = V5X_DIR / "runtime-restart-admission.json"
STEAM_POLICY = V5X_DIR / "steam-refresh-policy.json"
WEB = "aoe2hdbets-web-prod.service"
STEAM = "aoe2war-steam-egress-refresh.service"
STEAM_TIMER = "aoe2war-steam-egress-refresh.timer"
NGINX = Path("/etc/nginx/sites-available/aoe2war.com")
NGINX_SHA = "9192a8e775b4e94e59701ba0f7ad6e5373a88aa97f5a7c0f3f633b4ea3bfabc7"
C03_NFT = "aoe2war_c03_legacy_finance_deny"
FINANCE_UNITS = ("wolo-satchel-c01.service", "wolo-reviewer-c01.service")
PREIMAGE_WEB = ROOT / "original-web.service"
PREIMAGE_STEAM = ROOT / "original-steam.service"
CANDIDATE_WEB = ROOT / "candidate-web.service"
CANDIDATE_STEAM = ROOT / "candidate-steam.service"
RECEIPT = ROOT / "physical-accepted.json"
ROLLBACK = ROOT / "rollback-witness.json"
WATCHDOG_PID = ROOT / "watchdog.pid"
SNAPSHOT_SHA = "6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb"

def need(ok: bool, reason: str) -> None:
    if not ok:
        raise Hold(reason)

def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def file_sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def canonical(value) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def immutable(path: Path, expected_sha: str | None = None, mode: int | None = None) -> bytes:
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and not path.is_symlink() and st.st_uid == 0
         and st.st_nlink == 1 and not st.st_mode & 0o022,
         "ROOT_SEALED_FILE_INVALID:" + path.name)
    if mode is not None:
        need(stat.S_IMODE(st.st_mode) == mode, "ROOT_SEALED_MODE_INVALID:" + path.name)
    b = path.read_bytes()
    if expected_sha:
        need(sha(b) == expected_sha, "ROOT_SEALED_SHA_MISMATCH:" + path.name)
    return b

def exec_ok(argv: list[str], timeout: int = 40) -> str:
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    need(p.returncode == 0, "NATIVE_COMMAND_HOLD:" + argv[0] + ":" + str(p.returncode))
    return p.stdout.strip()

def state(unit: str, key: str) -> str:
    return exec_ok(["/usr/bin/systemctl", "show", unit,
                    "-p", key, "--value", "--no-pager"], timeout=8)

def atomic(path: Path, data: bytes, mode: int) -> None:
    tmp = path.with_name("." + path.name + ".v5x-atomic")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
        dirfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dirfd)
        finally:
            os.close(dirfd)
    finally:
        if tmp.exists():
            tmp.unlink()

def sealed_create(path: Path, data: bytes, mode: int) -> str:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())
    os.chmod(path, mode)
    return sha(data)

def original_model():
    spec = importlib.util.spec_from_file_location("aoe2war_v5x_exact_steam", V5X)
    need(spec is not None and spec.loader is not None, "V5X_SOURCE_IMPORT")
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result, result.load_immutable_original()

def protected(v5x=None, base=None):
    if v5x is None or base is None:
        v5x, base = original_model()
    # A verified timer-driven protected oneshot can temporarily be active.
    # Never normalize actual protected state: wait a bounded 12 seconds for
    # the *same strict inventory* to return an auditable frozen snapshot.
    for attempt in range(7):
        try:
            snap = base.production_protected()
        except BaseException as exc:
            need("MONITOR_ONESHOT_TEMPORARILY_ACTIVE" in str(exc)
                 and attempt < 6, "PROTECTED_FINANCIAL_UNIT_UNREVIEWED_OR_UNSTABLE")
            time.sleep(2)
            continue
        need(base.sha(base.canonical(snap)) == SNAPSHOT_SHA,
             "PROTECTED_FINANCIAL_OR_SYSTEMD_SNAPSHOT_CHANGED")
        return snap
    raise Hold("PROTECTED_SNAPSHOT_WAIT_EXHAUSTED")

def inactive_finance():
    for svc in FINANCE_UNITS:
        need(state(svc, "ActiveState") == "inactive", "FUNDED_SERVICE_ACTIVE:" + svc)
    lines = exec_ok(["/usr/bin/ss", "-ltnH"], timeout=8)
    for port in (8094, 8095):
        need(not re.search(rf":{port}\s", lines),
             "FUNDED_FINANCE_PORT_OPEN:" + str(port))

def verify_c03():
    raw = exec_ok(["/usr/sbin/nft", "-a", "list", "table", "inet", C03_NFT], timeout=12)
    for part in ("meta skuid 1000", "ip daddr 127.0.0.1",
                 "tcp dport { 8092, 8093 }", "reject with tcp reset"):
        need(part in raw, "EXISTING_C03_LEGACY_DENY_CHANGED")
    need(raw.count("reject with tcp reset") == 1 and
         raw.count("meta skuid 1000") == 1,
         "UNEXPECTED_SECOND_C03_FINANCE_RULE")
    # Firewall packet/byte counters legitimately advance under rejected
    # legacy traffic, without changing the enforcement or rule identity.
    normalized = re.sub(r"counter packets [0-9]+ bytes [0-9]+",
                        "counter packets DYNAMIC bytes DYNAMIC", raw)
    need(normalized != raw, "C03_FIREWALL_COUNTER_SHAPE_CHANGED")
    return sha(normalized.encode())

def public_http(path: str, *, expected: int = 200) -> bytes:
    need(path in ("/", "/clans/aoe2war", "/bets", "/api/deployment-version",
                  "/api/bets/public-history", "/api/wolo/osmosis-pulse"),
         "PUBLIC_CHECK_ROUTE_NOT_REVIEWED")
    req = urllib.request.Request("http://127.0.0.1:3032" + path,
                                 headers={"Host": "aoe2war.com", "User-Agent": "R25-v5x-same-node-release/1"})
    with urllib.request.urlopen(req, timeout=12) as resp:
        need(resp.status == expected, "NEW_WEB_ROUTE_NOT_OK:" + path)
        b = resp.read(3_000_001)
        need(0 < len(b) <= 3_000_000, "NEW_WEB_RESPONSE_BOUNDS:" + path)
        return b

def nginx_http_ok(path: str):
    need(path in ("/clans/aoe2war", "/api/wolo/osmosis-pulse"),
         "NGINX_BRIDGE_CHECK_NOT_REVIEWED")
    code = exec_ok(["/usr/bin/curl", "--silent", "--show-error",
                    "--max-time", "7", "--resolve", "aoe2war.com:443:127.0.0.1",
                    "-o", "/dev/null", "-w", "%{http_code}",
                    "https://aoe2war.com" + path], timeout=12)
    need(code == "200", "PUBLIC_NGINX_HEALTH_CHECK_FAILED:" + path)


def verified_stage() -> dict:
    stage_evidence = json.loads(immutable(STAGE_RECEIPT, STAGE_RECEIPT_SHA, 0o600))
    need(stage_evidence.get("source_sha") == SOURCE and
         stage_evidence.get("build_id") == BUILD_ID and
         stage_evidence.get("build_version") == RELEASE and
         stage_evidence.get("zip_sha256") == ARTIFACT_ZIP_SHA and
         stage_evidence.get("manifest_sha256") == MANIFEST_SHA and
         stage_evidence.get("all_files_sha256_verified") is True,
         "EXACT_CI_ARTIFACT_STAGE_NOT_ATTESTED")
    need((STAGE / ".aoe2war-source-sha").read_text().strip() == SOURCE and
         (STAGE / ".aoe2war-build-version").read_text().strip() == RELEASE and
         (STAGE / ".next/BUILD_ID").read_text().strip() == BUILD_ID,
         "R25_STAGE_RUNTIME_ID_DRIFT")
    need(file_sha(STAGE / ".aoe2war-runtime-manifest.json") == MANIFEST_SHA,
         "R25_EXTRACTED_FILE_INVENTORY_DRIFT")
    for path in (".next/server/app/api/bets/public-history/route.js",
                 ".next/server/app/bets/page.js", "node_modules/next/dist/bin/next"):
        need((STAGE / path).is_file(), "R25_PUBLIC_HISTORY_BUILD_FILE_MISSING:" + path)
    return stage_evidence

def known_failed_closed_old_steam_pid() -> bool:
    # The previous v5w Steam admission binds PID2120006. R2's failed native
    # stop has now restarted that SAME frozen old R25 build as PID2188495.
    # Exactly this reason can be accepted as proof of NO Steam nft write,
    # never as a successful Steam refresh or authorization to move funds.
    # The new v5z admission will independently bind the NEXT new web PID.
    need(state(WEB, "MainPID") == str(OLD_WEB_PID),
         "CURRENT_WEB_PID_OUTSIDE_R3_PIN")
    need(state(STEAM, "ActiveState") == "failed" and
         state(STEAM, "Result") == "exit-code" and
         state(STEAM, "ExecMainStatus") == "2" and
         state(STEAM, "MainPID") == "0",
         "OLD_STEAM_NOT_EXACT_PID_FAIL_CLOSED")
    need(file_sha(STEAM_UNIT) == OLD_STEAM_UNIT_SHA,
         "OLD_STEAM_UNIT_BYTES_CHANGED")
    old_code = Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5w.py")
    need(file_sha(old_code) == "0713acb23ab1a03b2944f23b64b396b8732f8196bf7b1e3ff55725b2ab00447f",
         "OLD_STEAM_CONTROLLER_CODE_CHANGED")
    old_admission = Path("/etc/aoe2war/web-prod-v5w/runtime-restart-admission.json")
    admitted = json.loads(immutable(old_admission,mode=0o400))
    need(admitted.get("schema") == "aoe2war.app.steam-runtime-readmission.v5w"
         and admitted.get("current_public_pid") == 2120006
         and admitted.get("finance_authorized") is False
         and admitted.get("approval_scope") == "STEAM_ONLY_EXISTING_UID990_NFT_SETS",
         "OLD_STEAM_ADMISSION_NOT_EXACT_OR_FINANCIAL")
    lines = exec_ok(["/usr/bin/journalctl", "-u", STEAM, "--since",
                     "-10 minutes", "-o", "cat", "--no-pager"], timeout=15)
    payloads=[]
    for line in lines.splitlines():
        try:obj=json.loads(line)
        except ValueError:continue
        if obj.get("status") in ("PASS_STEAM_ONLY_REFRESH","HOLD_STEAM_REFRESH_V2"):
            payloads.append(obj)
    need(bool(payloads) and payloads[-1].get("status") == "HOLD_STEAM_REFRESH_V2"
         and payloads[-1].get("reason") == "HOLD:R25_PUBLIC_RUNTIME_CHANGED"
         and payloads[-1].get("financial_authorized") is False,
         "OLD_STEAM_LATEST_ACTUAL_HOLD_NOT_PID_MISMATCH")
    return True


def valid_old_steam_precondition() -> bool:
    if (state(STEAM,"ActiveState")=="inactive" and
        state(STEAM,"Result")=="success"):
        return True
    return known_failed_closed_old_steam_pid()


def preflight():
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == "ubuntu-4gb-hel1-11",
         "WRONG_OPERATOR_MACHINE")
    need(ROOT.is_dir() and ROOT.stat().st_uid == 0 and
         stat.S_IMODE(ROOT.stat().st_mode) == 0o700,
         "ROOT_PRIVATE_STAGE_NOT_READY")
    need(not RECEIPT.exists() and not NEW_SIGNED_RELEASE.exists()
         and not STEAM_ADMISSION.exists() and not STEAM_POLICY.exists(),
         "RELEASE_ALREADY_CONSUMED_OR_PARTIAL")
    need(immutable(WEB_UNIT, OLD_WEB_UNIT_SHA, 0o644)
         == immutable(PREIMAGE_WEB, OLD_WEB_UNIT_SHA, 0o400),
         "OLD_WEB_UNIT_NOT_EXACT")
    current = immutable(WEB_UNIT, OLD_WEB_UNIT_SHA, 0o644)
    need(current.count(OLD_STAGE) == 4 and
         sha(current.replace(OLD_STAGE, str(STAGE).encode())) == NEW_WEB_UNIT_SHA and
         immutable(CANDIDATE_WEB, NEW_WEB_UNIT_SHA, 0o400)
         == current.replace(OLD_STAGE, str(STAGE).encode()),
         "WEB_UNIT_ONLY_FOUR_PATHS_CAN_CHANGE")
    steam = immutable(STEAM_UNIT, OLD_STEAM_UNIT_SHA, 0o644)
    need(steam == immutable(PREIMAGE_STEAM, OLD_STEAM_UNIT_SHA, 0o400)
         and steam.count(OLD_STEAM_SOURCE) == 1
         and immutable(CANDIDATE_STEAM, sha(steam.replace(OLD_STEAM_SOURCE, NEW_STEAM_SOURCE)), 0o400)
         == steam.replace(OLD_STEAM_SOURCE, NEW_STEAM_SOURCE),
         "STEAM_UNIT_ONLY_SOURCE_PATH_CAN_CHANGE")
    need(immutable(V5X, NEW_V5X_SOURCE_SHA, 0o644) != b"", "V5X_MERGED_CONTROLLER_MISSING")
    need(immutable(OLD_SIGNED_RELEASE, OLD_SIGNED_RELEASE_SHA, 0o600) != b"",
         "ORIGINAL_SIGNED_RELEASE_CHANGED")
    need(immutable(OLD_STEAM_ACCEPT, OLD_STEAM_ACCEPT_SHA, 0o600) != b"",
         "ORIGINAL_STEAM_ACCEPTANCE_CHANGED")
    need(file_sha(NGINX) == NGINX_SHA, "PRODUCTION_PUBLIC_NGINX_CHANGED")
    need(state(WEB, "ActiveState") == "active" and state(WEB, "MainPID") == str(OLD_WEB_PID),
         "PREVIOUS_R25_RUNTIME_PID_CHANGED")
    need(state("aoe2hdbets-web.service", "MainPID") == "2625090" and
         state("aoe2hdbets-web.service", "ActiveState") == "active",
         "ORIGINAL_PUBLIC_3030_ROLLBACK_CHANGED")
    need(state(STEAM_TIMER, "ActiveState") == "active" and
         state(STEAM_TIMER, "UnitFileState") == "enabled",
         "RESTRICTED_STEAM_TIMER_INACTIVE")
    need(valid_old_steam_precondition(),
         "EXISTING_STEAM_REFRESH_NOT_EXACTLY_SOURCE_REVIEWED")
    inactive_finance()
    old_c03 = verify_c03()
    verified_stage()
    v, base = original_model()
    protected(v, base)
    return v, base, old_c03

def quiesce_steam_after_timer_stop() -> None:
    # A timer may have started the restricted oneshot milliseconds before
    # stopping future triggers. Never SIGTERM it: systemd can record Result=signal
    # and reject all following Steam refreshes even though its security policy
    # was intact. Let the existing audited oneshot finish, bounded and with no
    # acceptance of an unknown/failed service state.
    for attempt in range(36):
        active = state(STEAM, "ActiveState")
        result = state(STEAM, "Result")
        if active == "inactive" and result == "success":
            return
        if active == "failed" and result == "exit-code":
            need(known_failed_closed_old_steam_pid(),
                 "STEAM_LAST_PID_HOLD_NOT_VERIFIED")
            return
        need(active in ("activating", "active", "deactivating")
             and result == "success" and attempt < 35,
             "STEAM_RESTRICTED_ONESHOT_FAILED_OR_OUTSIDE_WAIT_WINDOW")
        time.sleep(1)
    raise Hold("STEAM_RESTRICTED_ONESHOT_WAIT_EXHAUSTED")


def release_commit(pid: int, old_c03: str) -> dict:
    return {
        "status": "PASS_PUBLIC_NONFINANCIAL_SOURCE_PROMOTED",
        "source_sha": SOURCE, "merge_sha": MERGE, "build_version": RELEASE,
        "build_id": BUILD_ID,
        "public_selectors3032": 6, "rollback3030_pid": 2625090,
        "new_unit_sha256": NEW_WEB_UNIT_SHA,
        "funded_transfer_authorized": False,
        "pid3032": pid,
        "old_public_pid": OLD_WEB_PID,
        "old_public_release_sha256": OLD_SIGNED_RELEASE_SHA,
        "ci_artifact_sha256": ARTIFACT_ZIP_SHA,
        "ci_manifest_sha256": MANIFEST_SHA,
        "inert_stage_receipt_sha256": STAGE_RECEIPT_SHA,
        "old_c03_nft_readonly_sha256": old_c03,
    }

def receipt_payload(pid: int, start_ticks: int, accepted_steam: dict) -> dict:
    return {
        "schema": "aoe2war.app.r25-bets-history-v5z-r3-public-nonfinancial-acceptance.v1",
        "status": "PASS_R25_BETS_HISTORY_V5Z_PUBLIC_NONFINANCIAL_ACCEPTED",
        "utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "source_sha": SOURCE, "build_id": BUILD_ID, "build_version": RELEASE,
        "new_r25_process_pid": pid, "start_ticks": start_ticks,
        "old_r25_process_pid": OLD_WEB_PID, "rollback3030_pid": 2625090,
        "web_unit_sha256": NEW_WEB_UNIT_SHA,
        "steam_controller_sha256": NEW_V5X_SOURCE_SHA,
        "steam_onseshot_status": "PASS_STEAM_ONLY_REFRESH",
        "validated_steam_tls_destinations": accepted_steam.get("validated_destination_count"),
        "steam_tls_lease_seconds": 300,
        "protected_snapshot_sha256": SNAPSHOT_SHA,
        "ci_artifact_sha256": ARTIFACT_ZIP_SHA,
        "ci_manifest_sha256": MANIFEST_SHA,
        "new_published_history_get_ok": True,
        "financial_c01_c09_accepted": False,
        "custody_or_wager_or_payouts_authorized": False,
        "nginx_changed": False, "rollback3030_changed": False,
    }

def current_pid_ready(v):
    for _ in range(72):
        pid = int(state(WEB, "MainPID") or "0")
        if pid > 1 and pid != OLD_WEB_PID and state(WEB, "ActiveState") == "active":
            try:
                version = json.loads(public_http("/api/deployment-version"))
                if version.get("buildVersion") == RELEASE:
                    return pid, v.proc_start_ticks(pid)
            except (OSError, RuntimeError, ValueError, urllib.error.URLError):
                pass
        time.sleep(0.65)
    raise Hold("NEW_R25_RUNTIME_EXACT_BUILD_NOT_READY")

def select_steam_policy(v, base, newpid, ticks):
    commit = release_commit(newpid, verify_c03())
    need(not NEW_SIGNED_DIR.exists(), "NEW_SIGNED_RELEASE_ALREADY_ISSUED")
    NEW_SIGNED_DIR.mkdir(mode=0o700)
    signed = sealed_create(NEW_SIGNED_RELEASE, canonical(commit) + b"\n", 0o600)
    need(v.bound_public_commit()[1] == signed, "NEW_LIVE_RELEASE_COMMIT_INVALID")
    admission = {
        "schema": "aoe2war.app.steam-runtime-readmission.v5z",
        "old_public_pid": OLD_WEB_PID, "current_public_pid": newpid,
        "start_ticks": ticks, "source_sha": SOURCE, "build_version": RELEASE,
        "reviewed_protected_snapshot_sha256": SNAPSHOT_SHA,
        "public_release_receipt_sha256": signed,
        "approval_scope": "STEAM_ONLY_EXISTING_UID990_NFT_SETS",
        "finance_authorized": False, "nonce": os.urandom(16).hex(),
    }
    need(not V5X_DIR.exists(), "NEW_STEAM_POLICY_DIR_ALREADY_EXISTS")
    V5X_DIR.mkdir(mode=0o700)
    sealed_create(STEAM_ADMISSION, base.canonical(admission) + b"\n", 0o400)
    need(v.bound_runtime_pid(commit)["current_public_pid"] == newpid,
         "NEW_STEAM_PID_ADMISSION_REJECTED")
    exact_policy = v.expected_policy(base, SNAPSHOT_SHA)
    need(exact_policy["finance_authorized"] is False and
         exact_policy["public_cutover_authorized"] is False,
         "INADVERTENT_STEAM_POLICY_AUTHORIZATION")
    sealed_create(STEAM_POLICY, base.canonical(exact_policy) + b"\n", 0o400)
    return signed

def new_history_must_be_genuine():
    raw = public_http("/api/bets/public-history")
    o = json.loads(raw)
    need(o.get("schema") == "aoe2war.app.bets-published-history.v1" and
         o.get("status") == "PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD" and
         all(o.get(k) is False for k in ("financialExecutionAuthorized", "acceptingWagers",
             "approvingPayouts", "onchainPaymentFinalityVerified", "personalWagersIncluded")) and
         isinstance(o.get("markets"), list) and 0 < len(o["markets"]) <= 48,
         "NEW_HISTORY_VIEW_NOT_GENUINELY_AVAILABLE")
    need(all(e.get("recordedStatus") in ("settled", "voided", "under_review")
             for e in o["markets"]), "NEW_HISTORY_STATUS_OUTSIDE_PUBLISHED_ONLY")
    return len(o["markets"])

def get_native_steam_v5x():
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    exec_ok(["/usr/bin/systemctl", "start", STEAM], timeout=90)
    need(state(STEAM, "ActiveState") == "inactive" and state(STEAM, "Result") == "success" and
         state(STEAM, "ExecMainStatus") == "0", "NEW_RESTRICTED_STEAM_NATIVE_FAILED")
    lines = exec_ok(["/usr/bin/journalctl", "-u", STEAM, "--since", now,
                     "-o", "cat", "--no-pager"], timeout=15)
    results = []
    for line in lines.splitlines():
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if obj.get("schema") == "aoe2war.app.r25.steam-refresh-after-verified-public-cutover.v5z":
            results.append(obj)
    need(len(results) == 1 and results[0].get("status") == "PASS_STEAM_ONLY_REFRESH"
         and results[0].get("finance_authorized") is False
         and results[0].get("ttl_seconds") == 300
         and results[0].get("validated_destination_count") == 3,
         "NEW_STEAM_NATIVE_V5X_PROOF_MISSING")
    return results[0]

def restore_units(why: str) -> None:
    # Never overwrite a file that was independently modified by somebody else.
    old_web = immutable(PREIMAGE_WEB, OLD_WEB_UNIT_SHA, 0o400)
    old_steam = immutable(PREIMAGE_STEAM, OLD_STEAM_UNIT_SHA, 0o400)
    new_steam_sha = sha(immutable(CANDIDATE_STEAM, mode=0o400))
    current_steam = file_sha(STEAM_UNIT)
    current_web = file_sha(WEB_UNIT)
    need(current_web in (OLD_WEB_UNIT_SHA, NEW_WEB_UNIT_SHA)
         and current_steam in (OLD_STEAM_UNIT_SHA, new_steam_sha),
         "UNREVIEWED_UNIT_DRIFT_REFUSE_AUTO_RESTORE")
    exec_ok(["/usr/bin/systemctl", "stop", STEAM_TIMER], timeout=20)
    web_was_switched = current_web == NEW_WEB_UNIT_SHA
    if web_was_switched:
        exec_ok(["/usr/bin/systemctl", "stop", WEB], timeout=115)
        atomic(WEB_UNIT, old_web, 0o644)
    if current_steam == new_steam_sha:
        atomic(STEAM_UNIT, old_steam, 0o644)
    exec_ok(["/usr/bin/systemctl", "daemon-reload"], timeout=30)
    if web_was_switched or state(WEB, "ActiveState") != "active":
        exec_ok(["/usr/bin/systemctl", "start", WEB], timeout=42)
    exec_ok(["/usr/bin/systemctl", "start", STEAM_TIMER], timeout=28)
    need(file_sha(WEB_UNIT) == OLD_WEB_UNIT_SHA
         and file_sha(STEAM_UNIT) == OLD_STEAM_UNIT_SHA,
         "RESTORE_EXACT_PREIMAGES_MISMATCH")
    data = {"schema": "aoe2war.app.r25-v5x-guarded-rollback.v1",
            "status": "HOLD_WEB_V5X_REVERTED_TO_PREVIOUS_SOURCE_UNIT",
            "utc": dt.datetime.now(dt.timezone.utc).isoformat(),
            "reason": why[:200],
            "old_3032_web_restored": True,
            "old_steam_controller_unit_restored": True,
            "fresh_pid_steam_admission_required": True,
            "financial_authorized": False}
    if not ROLLBACK.exists():
        sealed_create(ROLLBACK, canonical(data) + b"\n", 0o600)

def commit():
    v, base, c03 = preflight()
    need(not WATCHDOG_PID.exists(), "WATCHDOG_ALREADY_STARTED")
    # Launch a short-lived independent root watchdog; on loss of this shell
    # it restores both original service units and website automatically.
    # Popen's start_new_session already performs setsid(2). Calling the
    # external setsid binary AGAIN may fork and make Popen.poll() incorrectly
    # report that the independent watchdog has exited.
    p = subprocess.Popen(["/usr/bin/python3", "-I", "-B",
                           str(Path(__file__).resolve()), "--phase", "watchdog"],
                         stdin=subprocess.DEVNULL,
                         stdout=(ROOT / "watchdog.log").open("xb"),
                         stderr=subprocess.STDOUT, start_new_session=True)
    sealed_create(WATCHDOG_PID, str(p.pid).encode() + b"\n", 0o600)
    need(p.poll() is None, "ROLLBACK_WATCHDOG_NOT_RUNNING")
    print("PASS_V5X_INDEPENDENT_WEB_AND_STEAM_ROLLBACK_ARMED", flush=True)
    try:
        exec_ok(["/usr/bin/systemctl", "stop", STEAM_TIMER], timeout=25)
        # An already running job must finish normally, without a SIGTERM.
        # The timer is stopped first, so no new native Steam refresh can start.
        quiesce_steam_after_timer_stop()
        exec_ok(["/usr/bin/systemctl", "stop", WEB], timeout=115)
        atomic(WEB_UNIT, immutable(CANDIDATE_WEB, NEW_WEB_UNIT_SHA, 0o400), 0o644)
        atomic(STEAM_UNIT, immutable(CANDIDATE_STEAM, mode=0o400), 0o644)
        exec_ok(["/usr/bin/systemctl", "daemon-reload"], timeout=30)
        need(file_sha(WEB_UNIT) == NEW_WEB_UNIT_SHA, "NEW_WEB_UNIT_NOT_LOADED")
        exec_ok(["/usr/bin/systemctl", "start", WEB], timeout=65)
        pid,ticks = current_pid_ready(v)
        protected(v, base)
        inactive_finance()
        need(file_sha(NGINX) == NGINX_SHA and verify_c03() == c03,
             "PUBLIC_NGINX_OR_C03_NET_DENIAL_CHANGED")
        public_http("/")
        nginx_http_ok("/clans/aoe2war")
        public_http("/bets")
        nginx_http_ok("/api/wolo/osmosis-pulse")
        count = new_history_must_be_genuine()
        print("PASS_ACTUAL_R25_PUBLISHED_HISTORY_GET_AND_NONFINANCIAL_ROUTES", count, flush=True)
        select_steam_policy(v, base, pid, ticks)
        exec_ok(["/usr/bin/python3","-I","-B",str(V5X),"--phase","plan"], timeout=60)
        result = get_native_steam_v5x()
        exec_ok(["/usr/bin/systemctl", "start", STEAM_TIMER], timeout=25)
        need(state(STEAM_TIMER, "ActiveState") == "active"
             and state(STEAM_TIMER, "UnitFileState") == "enabled",
             "NEW_TIMER_NOT_ACTIVE")
        protected(v,base)
        inactive_finance()
        need(verify_c03() == c03 and file_sha(NGINX) == NGINX_SHA,
             "POST_ACCEPT_PUBLIC_OR_C03_CHANGE")
        need(state(WEB,"MainPID")==str(pid)
             and state(WEB,"ActiveState")=="active"
             and file_sha(WEB_UNIT)==NEW_WEB_UNIT_SHA
             and state("aoe2hdbets-web.service","MainPID")=="2625090",
             "POST_ACCEPT_WEB_OR_ROLLBACK_CHANGED")
        data=receipt_payload(pid,ticks,result)
        raw=canonical(data)+b"\n"
        sealed_create(RECEIPT,raw,0o600)
        print("PASS_R25_BETS_HISTORY_V5Z_PUBLIC_NONFINANCIAL_ACCEPTED",flush=True)
        print("ACCEPTANCE_RECEIPT_SHA256",sha(raw),flush=True)
        print("SOURCE",SOURCE,"WEB_PID",pid,"HISTORY_COUNT",count,flush=True)
        print("FINANCIAL_C01_C09_ACCEPTED",False,flush=True)
    except BaseException as exc:
        print("HOLD_V5X_RELEASE_REASON",type(exc).__name__,str(exc)[:180],flush=True)
        try:
            restore_units(type(exc).__name__+":"+str(exc))
            print("PASS_WEB_AND_STEAM_UNITS_RESTORED_FAIL_CLOSED",flush=True)
        except BaseException as rollback:
            print("CRITICAL_AUTO_ROLLBACK_IN_PROGRESS",type(rollback).__name__,str(rollback)[:180],flush=True)
        raise SystemExit(3)

def watchdog():
    time.sleep(420)
    if RECEIPT.is_file():
        try:
            obj=json.loads(immutable(RECEIPT,mode=0o600))
            need(obj["status"]=="PASS_R25_BETS_HISTORY_V5Z_PUBLIC_NONFINANCIAL_ACCEPTED"
                 and obj["source_sha"]==SOURCE
                 and obj["steam_controller_sha256"]==NEW_V5X_SOURCE_SHA
                 and obj["financial_c01_c09_accepted"] is False,
                 "EXACT_ACCEPTANCE_INVALID")
            need(file_sha(WEB_UNIT)==NEW_WEB_UNIT_SHA,
                 "PHYSICALLY_ACCEPTED_UNIT_MOVED")
            print("PASS_EXACT_ROOT_ACCEPTANCE_WATCHDOG_STANDDOWN",flush=True)
            return
        except BaseException:
            print("HOLD_ROOT_ACCEPTANCE_INVALID_MANUAL_REVIEW",flush=True)
            return
    try:
        restore_units("WATCHDOG_TIMED_OUT_WITHOUT_ROOT_RELEASE_ACCEPTANCE")
        print("PASS_AUTOMATIC_WEB_AND_STEAM_ROLLBACK",flush=True)
    except BaseException as exc:
        print("CRITICAL_WATCHDOG_RESTORE_HOLD",type(exc).__name__,str(exc)[:180],flush=True)

def selftest():
    need(OLD_STAGE.decode()!=str(STAGE) and
         OLD_WEB_PID>1 and
         OLD_WEB_UNIT_SHA!=NEW_WEB_UNIT_SHA and
         len(MANIFEST_SHA)==64 and len(ARTIFACT_ZIP_SHA)==64,
         "STATIC_CUTOVER_IDENTITY_INVALID")
    need(NEW_V5X_SOURCE_SHA!="V5X_SOURCE_SHA_TO_BE_PINNED" and
         re.fullmatch("[0-9a-f]{64}",NEW_V5X_SOURCE_SHA) is not None,
         "V5X_MERGED_SOURCE_HASH_NOT_PINNED")
    fake=b"x"+OLD_STAGE+b"y"+OLD_STAGE+b"z"+OLD_STAGE+b"t"+OLD_STAGE+b"q"
    need(fake.count(OLD_STAGE)==4, "CANONICAL_UNIT_REPLACE_WRONG")
    need(sha(fake.replace(OLD_STAGE,str(STAGE).encode())) != sha(fake),
         "NEW_STAGE_NOT_DIFFERENT")
    print("PASS:R25_BETS_V5Z_R3_STRICT_NONFINANCIAL_CUTOVER_STATIC_SELFTEST")

def main():
    arg=argparse.ArgumentParser()
    arg.add_argument("--phase",choices=("selftest","preflight","commit","watchdog"),required=True)
    args=arg.parse_args()
    if args.phase=="selftest":selftest()
    elif args.phase=="preflight":
        preflight()
        print("PASS_EXACT_CI_STAGE_OLD_WEB_STEAM_FINANCE_C03_PINS_NO_MUTATION")
    elif args.phase=="commit":commit()
    else:watchdog()

if __name__=="__main__":
    try:
        main()
    except BaseException as exc:
        print("HOLD_R25_V5X:",type(exc).__name__,str(exc)[:180],flush=True)
        sys.exit(3)
