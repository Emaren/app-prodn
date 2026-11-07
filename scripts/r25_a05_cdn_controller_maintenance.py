#!/usr/bin/env python3
"""One-use A05 Steam-only controller+policy hotfix for already admitted 3032.

Preserves public 3030, isolated candidate PID, legacy 3031, WOLO/finance,
all socket filters and all systemd units. Only replaces C controller bytes
and its signed policy digest; the existing timer then updates Steam set
elements under the original UID990-only nftables rules. Never a cutover.
"""
from __future__ import annotations
import argparse
import base64
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

SOURCE_PATH = "scripts/r25_a05_cdn_controller_maintenance.py"
SCOPE = "HOTFIX_A05_STEAM_CDN_VERIFIED_IPS_3032_ONLY"
OLD_C_SHA = "6a1d4813cdae3a68e99a8043ae265420998616f081f628484156922c352a8f81"
NEW_C_SHA = "9d17d780bc08989a42ed850eea8db244871f2434c38954ee0477195a3c85488e"
OLD_POLICY_SHA = "20972d61dcb47cb4d7639d67442f90172e7bb4e2997bd85bf61c28e3d5b342c3"
UNIT_SHA = "c444d80d963cc11f1b6e7863839316bcb3098bc0b360e7868484bd7005ceeb67"
PUBLIC_NGINX_SHA = "d8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8"
PROTECTED_SHA = "bed88ab526fb57692d41121368aa7ffbb7c9daf7e67606b2863e8449712f26c6"
RUNTIME_SOURCE = "f50f814c065c329b6cb80f6aa45bb239b2528a0e"
RUNTIME_CI = 41955993026
PID = 3874672
BUILD_VERSION = "20261105023645-d1420ff473"
CONTROLLER = Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
NEW_SOURCE = Path("/root/a05-steam-cdn-reviewed-candidate.py")
POLICY = Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
PUBLIC_NGINX = Path("/etc/nginx/sites-available/aoe2war.com")
JOURNALS = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades")
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
TIMER = "aoe2war-steam-egress-refresh.timer"
SERVICE = "aoe2war-steam-egress-refresh.service"


class Hold(RuntimeError):
    pass


def need(value, message):
    if not value:
        raise Hold(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def safe(path, mode=None):
    obj = path.lstat()
    need(stat.S_ISREG(obj.st_mode) and obj.st_uid == 0 and obj.st_nlink == 1 and
         not obj.st_mode & 0o022 and 0 < obj.st_size <= 256000,
         "ROOT_SOURCE_OR_TARGET_UNSEALED:" + path.name)
    if mode is not None:
        need(stat.S_IMODE(obj.st_mode) == mode, "ROOT_MODE_DRIFT:" + path.name)
    return path.read_bytes()


def module(path, alias):
    spec = importlib.util.spec_from_file_location(alias, str(path))
    c = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(c)
    return c


def atomic(path, raw, mode):
    need(path in (CONTROLLER, POLICY), "TARGET_NOT_IN_CONTROLLER_POLICY")
    tmpfd, tmp = tempfile.mkstemp(prefix=".a05-cdn-", dir=str(path.parent))
    try:
        with os.fdopen(tmpfd, "wb") as f:
            f.write(raw)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
        dirfd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(dirfd)
        finally:
            os.close(dirfd)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def seal(path, content):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(content)
        f.flush()
        os.fsync(f.fileno())


def systemd(action, service):
    need((action, service) in {
        ("stop", TIMER), ("stop", SERVICE), ("start", TIMER), ("start", SERVICE)
    }, "SYSTEMD_SCOPE_DENIED")
    out = subprocess.run(["/usr/bin/systemctl", action, service],
                         capture_output=True, timeout=130)
    need(out.returncode == 0, "SCOPED_STEAM_SYSTEMD_"+action+"_HOLD")


def source_qualification(c, ref, path):
    need(re.fullmatch(r"[0-9a-f]{40}", ref) is not None, "EXACT_REVIEWED_REF")
    item = c.production_github("contents/" + path + "?ref=" + ref)
    verified = base64.b64decode(item["content"].replace("\n", ""), validate=True)
    actual = Path(__file__).read_bytes() if path == SOURCE_PATH else safe(NEW_SOURCE, 0o600)
    need(item.get("type") == "file" and verified == actual,
         "EXACT_GITHUB_SOURCE_BYTES_REQUIRED:" + path)
    return sha(actual)


def ci_qualification(c, ref, run):
    actual = c.production_github("actions/runs/" + str(run))
    jobs = c.production_github("actions/runs/" + str(run) +
                               "/jobs?filter=latest&per_page=100")
    expected = {"Release and documentation control plane",
                "Type, contract, and production build",
                "Isolated Steam-rating PostgreSQL chronology"}
    need(actual.get("head_sha") == ref and actual.get("status") == "completed"
         and actual.get("conclusion") == "success" and
         len(jobs.get("jobs", [])) == 3 and
         {row.get("name") for row in jobs["jobs"]} == expected and
         all(row.get("conclusion") == "success" for row in jobs["jobs"]),
         "CURRENT_CONTROLLER_THREE_JOB_CI_REQUIRED")
    checks = c.production_github(
        "commits/" + ref + "/check-runs?filter=latest&per_page=100")
    need(len([x for x in checks.get("check_runs", [])
              if x.get("name") == "GitGuardian Security Checks" and
              x.get("conclusion") == "success"]) == 1,
         "CURRENT_CONTROLLER_GITGUARDIAN_NOT_GREEN")


def observe(args):
    need(os.geteuid() == 0 and os.uname().nodename.split(".")[0] ==
         "ubuntu-4gb-hel1-11", "EXACT_ROOT_HOST_REQUIRED")
    previous = safe(CONTROLLER, 0o644)
    new = safe(NEW_SOURCE, 0o600)
    old_policy = safe(POLICY, 0o400)
    need(sha(previous) == OLD_C_SHA and sha(new) == NEW_C_SHA and
         sha(old_policy) == OLD_POLICY_SHA, "EXACT_PREIMAGE_CHANGED")
    need(sha(safe(UNIT, 0o644)) == UNIT_SHA and
         sha(safe(PUBLIC_NGINX, 0o644)) == PUBLIC_NGINX_SHA,
         "PUBLIC_OR_ISOLATED_UNIT_CHANGED")
    c = module(NEW_SOURCE, "a05_requalified_c")
    old = module(CONTROLLER, "a05_prior_c")
    source_qualification(c, args.controller_ref, "scripts/r25_c_start_root.py")
    source_hash = source_qualification(c, args.script_ref, SOURCE_PATH)
    ci_qualification(c, args.script_ref, args.script_ci)
    policy = json.loads(old_policy)
    need(policy["source_sha"] == RUNTIME_SOURCE and
         policy["build_version"] == BUILD_VERSION and
         policy["controller_sha256"] == OLD_C_SHA and
         policy["admission_sha256"] ==
         "725cc7f854ea17bf5b700f6e191a333de9278c985f4f10b0855d7abfe6d6eccc",
         "F50_RUNTIME_ADMISSION_POLICY_CHANGED")
    need(c.production_protected() == old.production_protected() and
         sha(c.canonical(c.production_protected())) == PROTECTED_SHA,
         "ORIGINAL_PREVIEW_FINANCE_PROTECTED_DRIFT")
    before_pid, before_ticks = c.production_wait(policy, seconds=12)
    need(before_pid == PID, "ISOLATED_CANDIDATE_PID_CHANGED")
    receipt = Path(policy["journal_path"]) / "runtime-admission.json"
    data = safe(receipt, 0o600)
    admission = json.loads(data)
    need(sha(data) == policy["admission_sha256"] and
         admission.get("candidate_pid") == PID and
         admission.get("source_sha") == RUNTIME_SOURCE and
         admission.get("financial_authorized") is False and
         admission.get("public_cutover_authorized") is False,
         "SEALED_NATIVE_ADMISSION_NOT_INTACT")
    need(c.production_nft_shape() == policy["nft_shape_sha256"] and
         c.production_refresh_unit_identity() == policy["refresh_units"],
         "EXACT_FIREWALL_OR_REFRESH_UNITS_CHANGED")
    critical = c.production_critical_runtime(Path(policy["stage"]))
    need(critical == policy["critical_runtime"], "STAGED_RUNTIME_BYTES_CHANGED")
    need(c.production_current_steam_tls()["current_uid_tls_sni_verified"] is True,
         "NATIVE_CDN_TLS_MISSING")
    real = c.production_live_steam_entries()
    need(sum(map(len, real.values())) > 0, "STEAM_SET_ABSENT")
    updated = dict(policy)
    updated["controller_sha256"] = NEW_C_SHA
    new_raw = canonical(updated)
    plan = {
        "schema": "aoe2war.a05.steam-cdn-controller-maintenance.v1",
        "scope": SCOPE, "nonce": args.nonce,
        "controller_source_ref": args.controller_ref,
        "maintenance_source_ref": args.script_ref,
        "maintenance_ci": args.script_ci,
        "script_sha256": source_hash,
        "old_controller_sha256": OLD_C_SHA,
        "new_controller_sha256": NEW_C_SHA,
        "old_policy_sha256": OLD_POLICY_SHA,
        "new_policy_sha256": sha(new_raw),
        "unit_sha256": UNIT_SHA, "public_nginx_sha256": PUBLIC_NGINX_SHA,
        "protected_snapshot_sha256": PROTECTED_SHA,
        "old_pid": before_pid, "old_start_ticks": before_ticks,
        "source_sha": RUNTIME_SOURCE,
        "ci_artifact": {"run_id": RUNTIME_CI},
        "financial_authorized": False, "public_cutover_authorized": False,
        "rollback_authorized": True
    }
    return c, plan, previous, old_policy, new, new_raw


def execute(args, prepared):
    c, plan, previous, old_policy, new, new_policy = prepared
    digest = sha(canonical(plan))
    need(args.plan_sha256 == digest, "EXACT_PLAN_SHA_REQUIRED")
    c.PROD_SCOPE = SCOPE
    grant = c.production_grant({
        "source_sha": RUNTIME_SOURCE, "nonce": args.nonce,
        "owner_comment_id": args.comment_id,
        "owner_comment_sha256": args.comment_sha256
    }, plan)
    need(safe(CONTROLLER, 0o644) == previous and
         safe(POLICY, 0o400) == old_policy and
         sha(c.canonical(c.production_protected())) == PROTECTED_SHA,
         "PREEXECUTION_PROTECTED_STATE_CHANGED")
    journal = JOURNALS / ("steam-cdn-" + args.nonce)
    journal.mkdir(mode=0o700)
    seal(journal / "entered.json", canonical({
        "status": "CONSUMED_NO_REPLAY", "plan": plan, "grant": grant,
        "financial_authorized": False, "public_cutover_authorized": False}))
    seal(journal / "controller.before", previous)
    seal(journal / "policy.before", old_policy)
    stopped = False
    try:
        # Record attempted state before the first systemd mutation; a timeout
        # can still have stopped the timer. No orphaned stopped refresh timer.
        stopped = True
        systemd("stop", TIMER)
        systemd("stop", SERVICE)
        atomic(CONTROLLER, new, 0o644)
        atomic(POLICY, new_policy, 0o400)
        need(c.production_witness({"profile_path": str(POLICY)})
             ["candidate_pid"] == PID, "NEW_CONTROLLER_NATIVE_WITNESS_FAILED")
        systemd("start", TIMER)
        systemd("start", SERVICE)
        admission = c.production_witness({"profile_path": str(POLICY)})
        need(admission.get("candidate_pid") == PID and
             admission.get("financial_authorized") is False and
             sha(c.canonical(c.production_protected())) == PROTECTED_SHA,
             "POST_REFRESH_NATIVE_C_WITNESS_FAILED")
        all_addresses = c.production_live_steam_entries()
        need(sum(map(len, all_addresses.values())) >= 2,
             "STEAM_DNS_DIVERSITY_NOT_ACTUALLY_INSTALLED")
        need(safe(CONTROLLER, 0o644) == new and
             safe(POLICY, 0o400) == new_policy and
             sha(safe(PUBLIC_NGINX, 0o644)) == PUBLIC_NGINX_SHA,
             "POST_MAINTENANCE_SOURCE_DRIFT")
        seal(journal / "complete.json", canonical({
            "status": "PASS_STEAM_CDN_NATIVE_C_WITNESS_NEW_POLICY_NO_PUBLIC_CUTOVER",
            "candidate_pid": PID, "new_controller_sha256": NEW_C_SHA,
            "new_policy_sha256": sha(new_policy),
            "live_steam_address_count": sum(map(len, all_addresses.values())),
            "native_witness_sha256": sha(c.canonical(admission)),
            "financial_authorized": False,
            "public_cutover_authorized": False}))
        print(json.dumps({"status": "PASS_STEAM_CDN_NATIVE_C_WITNESS_NEW_POLICY_NO_PUBLIC_CUTOVER",
                          "journal": str(journal),
                          "steam_address_count": sum(map(len, all_addresses.values())),
                          "candidate_pid": PID}, sort_keys=True), flush=True)
    except BaseException as failed:
        if stopped:
            try:
                systemd("stop", TIMER)
                systemd("stop", SERVICE)
                atomic(CONTROLLER, previous, 0o644)
                atomic(POLICY, old_policy, 0o400)
                systemd("start", TIMER)
                seal(journal / "rollback.json", canonical({
                    "status": "PASS_EXACT_C_AND_POLICY_RESTORED",
                    "error_type": type(failed).__name__,
                    "web_service_not_restarted": True,
                    "public_cutover_authorized": False,
                    "financial_authorized": False}))
            except BaseException as rollback:
                seal(journal / "rollback_hold.json", canonical({
                    "status": "CRITICAL_CDN_MAINTENANCE_ROLLBACK_INCOMPLETE",
                    "type": type(rollback).__name__,
                    "financial_authorized": False,
                    "public_cutover_authorized": False}))
        raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("plan", "execute"), required=True)
    ap.add_argument("--nonce", required=True)
    ap.add_argument("--controller-ref", required=True)
    ap.add_argument("--script-ref", required=True)
    ap.add_argument("--script-ci", required=True, type=int)
    ap.add_argument("--plan-sha256")
    ap.add_argument("--comment-id", type=int)
    ap.add_argument("--comment-sha256")
    args = ap.parse_args()
    need(re.fullmatch(r"[0-9a-f]{32}", args.nonce) is not None,
         "ONE_USE_NONCE_SHAPE_REQUIRED")
    f = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        st = os.fstat(f)
        need((st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) ==
             (2064, 6185747, 1000, 0o644), "RELEASE_LOCK_IDENTITY_CHANGED")
        fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
        need(not (JOURNALS / ("steam-cdn-" + args.nonce)).exists(),
             "NONCE_ALREADY_CONSUMED")
        before = observe(args)
        digest = sha(canonical(before[1]))
        if args.phase == "plan":
            print(json.dumps({"status": "PASS_A05_CDN_CONTROLLER_PLAN_READ_ONLY",
                              "plan_sha256": digest,
                              "plan": before[1]}, sort_keys=True), flush=True)
        else:
            execute(args, before)
    finally:
        os.close(f)


if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, KeyError,
            subprocess.TimeoutExpired) as error:
        print("HOLD:A05_CDN_CONTROLLER:" + type(error).__name__ +
              ":" + str(error), file=sys.stderr, flush=True)
        sys.exit(2)
