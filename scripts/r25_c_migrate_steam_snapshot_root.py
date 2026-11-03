#!/usr/bin/env python3
"""One-use A05 Steam controller/profile repair. No app, Nginx, or finance writes."""
import argparse
import base64
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys

HOST = "ubuntu-4gb-hel1-11"
ROOT = Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
POLICY = Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
AUDIT = Path("/var/lib/aoe2war-app-production-v1")
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID = (2064, 6185747, 1000, 0o644)
OLD_CONTROLLER = "ceb265f1ea67b1d2dd70377e0398b5c289bd53e0cef2559bd0b85519a08169ad"
NEW_CONTROLLER = "97f00c41056c62553bf500c55faa5535c4c711a8d85fbc9abadb52dffa50f479"
OLD_POLICY = "487690c26c23e7266f69d0199cea795b7a0d6105f04f8cf2ee0b3dcf7306cf92"
OLD_PROTECTED = "c039ace8708eca3aed3cc4abeb32b7bfc9854eda992d483bdf6877021cf0eb08"
NEW_PROTECTED = "03adac7f55c4bf11f72ce1829cf2972a3ef260c8700907d34535deb909e8f2d1"
NEW_REF = "443c57775947244362ce283697f9793dc3b3a338"
NEW_CI = 41686682796
APP_SHA = "886dac221e73167621d6bbfa89cd30edf6b632a3"
ISSUE_URL = "https://api.github.com/repos/Emaren/app-prodn/issues/1108"

class Hold(RuntimeError):
    pass

def need(condition, reason):
    if not condition:
        raise Hold(reason)

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def canon(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def invoke(argv, *, timeout=25, input=None):
    p = subprocess.run(argv, input=input, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=timeout)
    need(p.returncode == 0 and len(p.stdout) <= 400000, "NATIVE_COMMAND_FAILED:" + Path(argv[0]).name)
    return p.stdout

def github(endpoint):
    return json.loads(invoke(["/usr/bin/gh", "api", "repos/Emaren/app-prodn/" + endpoint], timeout=30))

def root_bytes(path, expected=None, mode=None):
    path = Path(path)
    st = path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid == 0 and st.st_nlink == 1 and
         not st.st_mode & 0o022, "ROOT_FILE_UNTRUSTED")
    if mode is not None:
        need(stat.S_IMODE(st.st_mode) == mode, "ROOT_FILE_MODE")
    raw = path.read_bytes()
    need(0 < len(raw) <= 200000, "FILE_SIZE_BOUND")
    if expected is not None:
        need(sha(raw) == expected, "EXACT_OLD_FILE_HASH_REQUIRED")
    return raw

def qualified_candidate():
    resource = github("contents/scripts/r25_c_start_root.py?ref=" + NEW_REF)
    need(resource.get("type") == "file" and resource.get("encoding") == "base64", "COMMITTED_SOURCE_REQUIRED")
    source = base64.b64decode(resource["content"].replace("\n", ""), validate=True)
    need(sha(source) == NEW_CONTROLLER, "QUALIFIED_CONTROLLER_BYTES_CHANGED")
    run = github("actions/runs/" + str(NEW_CI))
    jobs = github("actions/runs/" + str(NEW_CI) + "/jobs?filter=latest&per_page=100")
    names = {"Release and documentation control plane", "Type, contract, and production build",
             "Isolated Steam-rating PostgreSQL chronology"}
    need(run.get("head_sha") == NEW_REF and run.get("name") == "AoE2WAR CI" and
         run.get("status") == "completed" and run.get("conclusion") == "success" and
         jobs.get("total_count") == 3 and {j.get("name") for j in jobs.get("jobs", [])} == names and
         all(j.get("status") == "completed" and j.get("conclusion") == "success" for j in jobs["jobs"]),
         "SOURCE_EXACT_CI_REQUIRED")
    checks = github("commits/" + NEW_REF + "/check-runs?filter=latest&per_page=100")
    security = [x for x in checks.get("check_runs", []) if x.get("name") == "GitGuardian Security Checks"
                and x.get("app", {}).get("slug") == "gitguardian"]
    need(len(security) == 1 and security[0].get("status") == "completed" and
         security[0].get("conclusion") == "success", "EXACT_GITGUARDIAN_REQUIRED")
    return source

def candidate_module(source):
    obj = {"__name__": "a05_qualified_inspection", "__file__": "/verified/r25_c_start_root.py"}
    exec(compile(source, "qualified_controller.py", "exec"), obj)
    return obj

def snapshot(module):
    value = module["production_protected"]()
    return sha(canon(value)), value

def calculate_policy(policy, new_hash):
    need(policy.get("schema") == "aoe2war.app.approved-production-profile.v1" and
         policy.get("profile") == "nonfinancial-production-v1" and
         policy.get("source_sha") == APP_SHA and policy.get("port") == 3032 and
         policy.get("uid") == 990 and policy.get("unit") == "aoe2hdbets-web-prod.service" and
         policy.get("controller_sha256") == OLD_CONTROLLER and
         policy.get("protected_snapshot_sha256") == OLD_PROTECTED, "EXACT_NONFINANCIAL_POLICY_REQUIRED")
    updated = dict(policy)
    updated["controller_sha256"] = NEW_CONTROLLER
    updated["protected_snapshot_sha256"] = new_hash
    need(set(updated) == set(policy) and
         {k for k in updated if updated[k] != policy[k]} == {"controller_sha256", "protected_snapshot_sha256"},
         "UNEXPECTED_POLICY_CHANGE")
    return canon(updated) + b"\n"

def preflight():
    need(sys.platform == "linux" and os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "EXACT_HEL1_ROOT_REQUIRED")
    old_source = root_bytes(ROOT, OLD_CONTROLLER, 0o644)
    old_policy = root_bytes(POLICY, OLD_POLICY, 0o400)
    policy = json.loads(old_policy)
    original_module = candidate_module(old_source)
    original_hash, original = snapshot(original_module)
    need(original_hash == OLD_PROTECTED and
         original["preview"]["properties"]["MainPID"] == "1483304",
         "ORIGINAL_PROTECTED_PREIMAGE_CHANGED")
    new_source = qualified_candidate()
    new_module = candidate_module(new_source)
    updated_hash, updated = snapshot(new_module)
    need(updated_hash == NEW_PROTECTED and updated["unit_names"] == original["unit_names"] and
         updated["preview"] == original["preview"] and
         len(updated["protected_sockets"]) == len(original["protected_sockets"]),
         "NEW_CONTROLLER_PROTECTED_SCOPE_DRIFT")
    candidate_policy = calculate_policy(policy, updated_hash)
    need(new_module["production_nft_shape"]() == policy["nft_shape_sha256"] and
         new_module["production_refresh_unit_identity"]() == policy["refresh_units"],
         "FINANCIAL_FIREWALL_OR_REFRESH_UNIT_DRIFT")
    return old_source, old_policy, new_source, candidate_policy

def qualified_migrator(commit_sha, expected_sha):
    resource = github("contents/scripts/r25_c_migrate_steam_snapshot_root.py?ref=" + commit_sha)
    need(resource.get("type") == "file" and resource.get("encoding") == "base64",
         "COMMITTED_MIGRATOR_REQUIRED")
    code = base64.b64decode(resource["content"].replace("\n", ""), validate=True)
    need(sha(code) == expected_sha, "COMMITTED_MIGRATOR_BYTES_MISMATCH")
    runs = github("actions/workflows/ci.yml/runs?head_sha=" + commit_sha + "&per_page=15")
    matches = [x for x in runs.get("workflow_runs", []) if x.get("head_sha") == commit_sha and
               x.get("name") == "AoE2WAR CI" and x.get("status") == "completed" and
               x.get("conclusion") == "success"]
    need(bool(matches), "MIGRATOR_EXACT_HEAD_CI_REQUIRED")
    jobs = github("actions/runs/" + str(matches[0]["id"]) + "/jobs?filter=latest&per_page=100")
    names = {"Release and documentation control plane", "Type, contract, and production build",
             "Isolated Steam-rating PostgreSQL chronology"}
    need(jobs.get("total_count") == 3 and
         {j.get("name") for j in jobs.get("jobs", [])} == names and
         all(j.get("conclusion") == "success" and j.get("status") == "completed"
             for j in jobs["jobs"]), "MIGRATOR_ALL_THREE_JOBS_REQUIRED")
    checks = github("commits/" + commit_sha + "/check-runs?filter=latest&per_page=100")
    security = [x for x in checks.get("check_runs", []) if x.get("name") == "GitGuardian Security Checks"
                and x.get("app", {}).get("slug") == "gitguardian"]
    need(len(security) == 1 and security[0].get("conclusion") == "success" and
         security[0].get("status") == "completed", "MIGRATOR_EXACT_SECURITY_REQUIRED")


def grant(comment_id, nonce, script_sha, migration_ref):
    doc = github("issues/comments/" + str(comment_id))
    need(doc.get("id") == comment_id and doc.get("issue_url") == ISSUE_URL and
         doc.get("user", {}).get("login") == "Emaren" and doc.get("user", {}).get("id") == 15059910,
         "AUTHENTICATED_OWNER_GRANT_REQUIRED")
    body = doc.get("body", "")
    need(body.startswith("AOE2WAR_A05_STEAM_SNAPSHOT_MIGRATION\n"), "GRANT_PREFIX")
    packet = json.loads(body.split("\n", 1)[1])
    expected = {"schema": "aoe2war.app.steam-profile-migration-grant.v1",
                "nonce": nonce, "scope": "STEAM_PROFILE_CONTROLLER_ONLY",
                "script_sha256": script_sha, "old_policy_sha256": OLD_POLICY,
                "old_controller_sha256": OLD_CONTROLLER, "new_controller_sha256": NEW_CONTROLLER,
                "source_ref": NEW_REF, "migration_ref": migration_ref,
                "financial_authorized": False,
                "public_cutover_authorized": False, "delegated_ai_authorship_disclosed": True,
                "max_uses": 1}
    for k, v in expected.items():
        need(packet.get(k) == v, "GRANT_FIELD_DRIFT:" + k)
    issued = datetime.datetime.fromisoformat(packet["issued_at"].replace("Z", "+00:00"))
    expires = datetime.datetime.fromisoformat(packet["expires_at"].replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    need(issued <= now <= expires and (expires - issued).total_seconds() <= 1200,
         "EXPIRED_OR_UNBOUNDED_GRANT")
    return packet

def fsync_dir(directory):
    fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try: os.fsync(fd)
    finally: os.close(fd)

def write_exact(path, raw, mode):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(path, mode)
    fsync_dir(path.parent)

def swapped(destination, raw, mode, nonce):
    temporary = destination.with_name("." + destination.name + ".a05-" + nonce)
    write_exact(temporary, raw, mode)
    os.replace(temporary, destination)
    fsync_dir(destination.parent)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", choices=("plan", "execute"), required=True)
    ap.add_argument("--nonce", default="")
    ap.add_argument("--comment-id", type=int)
    ap.add_argument("--script-sha256")
    ap.add_argument("--migration-ref")
    args = ap.parse_args()
    need(args.phase == "plan" or
         (re.fullmatch("[0-9a-f]{32}", args.nonce or "") and
          args.comment_id and re.fullmatch("[0-9a-f]{64}", args.script_sha256 or "") and
          re.fullmatch("[0-9a-f]{40}", args.migration_ref or "")),
         "ONE_USE_AUTHORIZATION_ARGUMENTS_REQUIRED")
    if args.phase == "execute":
        need(Path(__file__) == AUDIT / "a05-steam-migration-controller.py" and
             sha(root_bytes(__file__, mode=0o644)) == args.script_sha256,
             "EXACT_ROOT_OWNED_COMMITTED_MIGRATOR_REQUIRED")
    lock_stat = LOCK.lstat()
    need(stat.S_ISREG(lock_stat.st_mode) and
         (lock_stat.st_dev, lock_stat.st_ino, lock_stat.st_uid, stat.S_IMODE(lock_stat.st_mode)) == LOCK_ID,
         "EXACT_SHARED_RELEASE_LOCK_REQUIRED")
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        old_source, old_policy, new_source, new_policy = preflight()
        result = {"status": "PLAN_PASS_NOT_AUTHORITY", "old_controller_sha256": sha(old_source),
                  "new_controller_sha256": sha(new_source), "old_policy_sha256": sha(old_policy),
                  "new_policy_sha256": sha(new_policy), "protected_new_sha256": NEW_PROTECTED,
                  "public_cutover_authorized": False, "financial_authorized": False}
        if args.phase == "plan":
            print(json.dumps(result, sort_keys=True))
            return
        qualified_migrator(args.migration_ref, args.script_sha256)
        grant(args.comment_id, args.nonce, args.script_sha256, args.migration_ref)
        directory = AUDIT / ("a05-steam-" + args.nonce)
        need(not directory.exists() and not directory.is_symlink(), "NONCE_ALREADY_CONSUMED")
        directory.mkdir(mode=0o700)
        fsync_dir(AUDIT)
        write_exact(directory / "old-controller.bin", old_source, 0o400)
        write_exact(directory / "old-policy.bin", old_policy, 0o400)
        write_exact(directory / "entered.json", canon({"nonce": args.nonce, "comment_id": args.comment_id,
                   "status": "CONSUMED_NO_REPLAY", "old_policy": sha(old_policy),
                   "new_policy": sha(new_policy)}) + b"\n", 0o400)
        try:
            swapped(ROOT, new_source, 0o644, args.nonce)
            swapped(POLICY, new_policy, 0o400, args.nonce)
            need(sha(root_bytes(ROOT, mode=0o644)) == NEW_CONTROLLER and
                 sha(root_bytes(POLICY, mode=0o400)) == sha(new_policy), "NEW_INSTALL_READBACK")
            answer = json.loads(invoke(["/usr/bin/python3", "-I", "-B", str(ROOT),
                                       "--phase", "production-refresh-steam"], timeout=35))
            need(answer.get("status") == "VALIDATED_STEAM_IP_SETS_REFRESHED" and
                 answer.get("financial_authorized") is False and answer.get("addresses", 0) > 0,
                 "NEW_REFRESH_NOT_PASS")
            # Prove the actual CAP_NET_ADMIN-only service, not merely full-root execution.
            invoke(["/usr/bin/systemctl", "start", "aoe2war-steam-egress-refresh.service"], timeout=40)
            properties = invoke(["/usr/bin/systemctl", "show", "aoe2war-steam-egress-refresh.service",
                                  "--property=Result,ExecMainStatus,ActiveState"], timeout=10).decode()
            need("Result=success" in properties and "ExecMainStatus=0" in properties,
                 "SANDBOXED_TIMER_SERVICE_NOT_PASS")
            witness = json.loads(invoke(["/usr/bin/python3", "-I", "-B", str(ROOT),
                                        "--phase", "production-witness"],
                                        timeout=50, input=canon({"profile_path": str(POLICY)})))
            need(witness.get("status") == "NATIVE_PRODUCTION_PROFILE_PASS" and
                 witness.get("financial_authorized") is False and
                 witness.get("public_cutover_authorized") is False and
                 witness.get("original_pid") == 2625090 and witness.get("candidate_pid") == 2177155 and
                 witness.get("protected_snapshot_sha256") == NEW_PROTECTED,
                 "NEW_NATIVE_WITNESS_FAILED")
            receipt = {**result, "status": "A05_STEAM_PROFILE_MIGRATED_NATIVE_PASS_NOT_PUBLIC",
                       "nonce": args.nonce, "comment_id": args.comment_id,
                       "refresh_service": "PASS", "production_witness": "PASS",
                       "original_pid": 2625090, "candidate_pid": 2177155}
            write_exact(directory / "complete.json", canon(receipt) + b"\n", 0o400)
            print(json.dumps(receipt, sort_keys=True))
        except BaseException as exc:
            # Roll back only the two migrated files. Never stop/start app or financial units.
            recovery = []
            for destination, raw, mode in ((ROOT, old_source, 0o644), (POLICY, old_policy, 0o400)):
                try:
                    swapped(destination, raw, mode, args.nonce + "-undo")
                    recovery.append(sha(root_bytes(destination)) == sha(raw))
                except BaseException:
                    recovery.append(False)
            write_exact(directory / "hold.json", canon({"status": "HOLD_CONSUMED_NO_REPLAY",
                        "reason_type": type(exc).__name__, "reason": str(exc)[:120],
                        "restored_two_exact_files": recovery}) + b"\n", 0o400)
            raise
    finally:
        os.close(fd)

if __name__ == "__main__":
    try: main()
    except (Hold, ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as exc:
        print(json.dumps({"status": "HOLD", "reason": str(exc)[:160],
                          "no_blind_retry": True, "financial_authorized": False,
                          "public_cutover_authorized": False}, sort_keys=True))
        sys.exit(2)
