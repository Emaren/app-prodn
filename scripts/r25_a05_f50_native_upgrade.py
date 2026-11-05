#!/usr/bin/env python3
"""A05 F50 candidate-only, one-use replacement. Never edits public Nginx or WOLO.

The CI artifact must have been installed by the existing digest-checking
extractor. This operator binds a fresh PID, catalog and native C witness.
On failure it restores original service files and leaves isolated 3032 stopped;
old public 3030 remains untouched. No finance grant or credential logging.
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
import time

OLD = "5869b4ab08702be4b33860f7dda7d97b5de79424"
NEW = "f50f814c065c329b6cb80f6aa45bb239b2528a0e"
BUILD = "20261105023645-d1420ff473"
BUILD_ID = "25F3pFaPgN36RIJ8wRtX4"
ARTIFACT_ID = 13383851635
CI_RUN = 41955993026
ZIP_SHA = "9953844ff2bb82c71100ad3a0e03db722c99eaf3b9d169c4eb89c3bd83dc3c48"
NEW_CONTROLLER_SHA = "6a1d4813cdae3a68e99a8043ae265420998616f081f628484156922c352a8f81"
OLD_CONTROLLER_SHA = "25927cc4f47f49b84e5ae84153a1a3044347a41188df5cebfef7a6dae6dc3ce6"
OLD_UNIT_SHA = "2deec75820dbebe26f0d8f4f3211ef7b112020508bd4828a59580587245496e1"
OLD_POLICY_SHA = "243066c34ad6588c3a0cceadf22079b021b5423bf8158e4e3cfb7329b1a452c6"
PUBLIC_NGINX_SHA = "d8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8"
PROTECTED_SHA = "bed88ab526fb57692d41121368aa7ffbb7c9daf7e67606b2863e8449712f26c6"
GUARD_SHA = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
SQL_SHA = "e348d688f2307d596a3e41057e95e14957b770962760339b5a145e20e57dc011"
SCOPE = "UPGRADE_LIVE_ISOLATED_3032_F50_NONFINANCIAL_ONLY"
SOURCE_PATH = "scripts/r25_a05_f50_native_upgrade.py"
OLD_STAGE = Path("/var/lib/aoe2war-web-prod-" + OLD[:12])
NEW_STAGE = Path("/var/lib/aoe2war-web-prod-" + NEW[:12])
ARCHIVE = Path("/var/lib/aoe2war-runtime-artifacts") / NEW / "runtime.zip"
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
POLICY = Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
CONTROLLER = Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
NEW_CONTROLLER = Path("/root/a05-f50-reviewed-controller.py")
PUBLIC = Path("/etc/nginx/sites-available/aoe2war.com")
GUARD = Path("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs")
AUTHSQL = Path("/usr/local/lib/aoe2war-web-prod/nonfinancial-production-auth.sql")
JOURNALS = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades")
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
SERVICE = "aoe2hdbets-web-prod.service"


class Hold(RuntimeError):
    pass


def need(ok, message):
    if not ok:
        raise Hold(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(row):
    return json.dumps(row, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def safe_file(path, mode=None, max_size=200000):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and
         info.st_nlink == 1 and not info.st_mode & 0o022 and
         info.st_size <= max_size, "SEALED_FILE_CHANGED:" + path.name)
    if mode is not None:
        need(stat.S_IMODE(info.st_mode) == mode, "FILE_MODE_DRIFT:" + path.name)
    return path.read_bytes()


def module(path):
    spec = importlib.util.spec_from_file_location("f50_r25_c_native", str(path))
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


def call_systemd(action):
    need(action in {"stop", "start", "daemon-reload"}, "SYSTEMD_ACTION_DENIED")
    args = ["/usr/bin/systemctl", action]
    if action != "daemon-reload":
        args.append(SERVICE)
    done = subprocess.run(args, capture_output=True, timeout=90, check=False)
    need(done.returncode == 0, "CANDIDATE_SYSTEMD_" + action.upper() + "_HOLD")


def atomic(path, data, mode):
    need(path in {UNIT, POLICY, CONTROLLER}, "UNREVIEWED_TARGET")
    fd, tmp = tempfile.mkstemp(prefix=".a05-f50-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
            out.flush()
            os.fsync(out.fileno())
        os.chmod(tmp, mode)
        os.replace(tmp, path)
        d = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(d)
        finally:
            os.close(d)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def sealed_write(path, data, mode):
    need(not path.exists() and not path.is_symlink(), "ONE_USE_PATH_ALREADY_EXISTS")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, mode)
    with os.fdopen(fd, "wb") as out:
        out.write(data)
        out.flush()
        os.fsync(out.fileno())


def new_unit(old_bytes):
    # Only replace the four existing sandbox paths; never relax other units.
    old = str(OLD_STAGE).encode()
    need(old_bytes.count(old) == 4 and str(NEW_STAGE).encode() not in old_bytes,
         "UNIT_STAGE_BIND_COUNT_DRIFT")
    for item in (b"Restart=on-failure", b"MemoryMax=3200M",
                 b"--max-old-space-size=2048", b"NoNewPrivileges=yes",
                 b"ProtectSystem=strict", b"TemporaryFileSystem=/run:ro",
                 b"AOE2WAR_PROD_DB_PREVIEW=false", b"WARGRAPH_RUNTIME_DISABLED=true"):
        need(item in old_bytes, "UNIT_SAFETY_CHANGED")
    updated = old_bytes.replace(old, str(NEW_STAGE).encode())
    need(updated.count(str(NEW_STAGE).encode()) == 4,
         "UNIT_NEW_STAGE_BIND_COUNT_DRIFT")
    return updated


def verify_source(c, ref):
    raw = Path(__file__).read_bytes()
    need(re.fullmatch(r"[0-9a-f]{40}", ref) is not None,
         "REVIEWED_CONTROLLER_COMMIT_REQUIRED")
    item = c.production_github("contents/" + SOURCE_PATH + "?ref=" + ref)
    expected = base64.b64decode(item["content"].replace("\n", ""), validate=True)
    need(item.get("type") == "file" and raw == expected,
         "CONTROLLER_GITHUB_SOURCE_MISMATCH")
    checks = c.production_github("commits/" + ref + "/check-runs?filter=latest&per_page=100")
    security = [x for x in checks.get("check_runs", [])
                if x.get("name") == "GitGuardian Security Checks"
                and x.get("conclusion") == "success"]
    need(len(security) == 1, "CONTROLLER_GITGUARDIAN_NOT_GREEN")
    return sha(raw)


def observe(args):
    need(os.geteuid() == 0, "ROOT_ONLY")
    need(os.uname().nodename.split(".")[0] == "ubuntu-4gb-hel1-11", "WRONG_HOST")
    old_unit = safe_file(UNIT, 0o644)
    old_policy = safe_file(POLICY, 0o400)
    old_controller = safe_file(CONTROLLER, 0o644)
    need(sha(old_unit) == OLD_UNIT_SHA and sha(old_policy) == OLD_POLICY_SHA and
         sha(old_controller) == OLD_CONTROLLER_SHA, "CURRENT_3032_PREIMAGE_CHANGED")
    need(sha(safe_file(PUBLIC, 0o644)) == PUBLIC_NGINX_SHA,
         "PUBLIC_NGINX_CHANGED")
    need(sha(safe_file(GUARD, 0o644)) == GUARD_SHA and
         sha(safe_file(AUTHSQL, 0o400)) == SQL_SHA,
         "CURRENT_SECURITY_BOUNDARY_CHANGED")
    need(sha(safe_file(NEW_CONTROLLER, 0o600)) == NEW_CONTROLLER_SHA,
         "F50_CONTROLLER_BYTES_CHANGED")
    c = module(NEW_CONTROLLER)
    policy = json.loads(old_policy)
    need(policy["source_sha"] == OLD and
         policy["stage"] == str(OLD_STAGE) and
         policy["build_version"] == "20261104171049-8504ea08e5",
         "OLD_PROFILE_SOURCE_DRIFT")
    before = c.production_protected()
    need(sha(canonical(before)) == PROTECTED_SHA ==
         policy["protected_snapshot_sha256"],
         "PROTECTED_FINANCIAL_OR_ORIGINAL_DRIFT")
    pid, ticks = c.production_wait(policy, seconds=10)
    need(pid == 3513691, "CANDIDATE_PID_NOT_PREAPPROVED")
    build = json.loads(__import__("zipfile").ZipFile(ARCHIVE).read("artifact.json"))
    need(build["source_sha"] == NEW and build["build_version"] == BUILD and
         build["build_id"] == BUILD_ID and build["files"] == 44852,
         "F50_IMMUTABLE_ARTIFACT_DRIFT")
    proof = c.production_ci_zip({"source_sha": NEW, "artifact": build,
          "ci_artifact": {"id": ARTIFACT_ID, "run_id": CI_RUN,
                          "archive_path": str(ARCHIVE)}}, ARCHIVE)
    need(proof["zip_sha256"] == ZIP_SHA, "GITHUB_CI_ARTIFACT_DIGEST_CHANGED")
    critical = c.production_critical_runtime(NEW_STAGE)
    need(len(critical) == 17 and
         (NEW_STAGE / ".next/BUILD_ID").read_text().strip() == BUILD_ID and
         (NEW_STAGE / ".aoe2war-build-version").read_text().strip() == BUILD and
         (NEW_STAGE / "public/downloads").is_dir(), "STAGE_NOT_READY")
    env, database, password = c.production_runtime_environment()
    pg = c.production_database_witness(database, password)
    need(pg["no_direct_table_mutation"] and
         pg["no_unreviewed_table_select"] and
         pg["no_users_secret_select"] and
         pg["public_read_model"]["exact_view_count"] == 7, "NATIVE_PG_READ_SCOPE_HOLD")
    new_bytes = new_unit(old_unit)
    controller_hash = verify_source(c, args.controller_ref)
    plan = {"schema": "aoe2war.a05.f50.isolated-upgrade-plan.v1",
            "nonce": args.nonce, "scope": SCOPE,
            "controller_source_ref": args.controller_ref,
            "controller_sha256": controller_hash,
            "source_sha": NEW, "old_source_sha": OLD,
            "old_pid": pid, "old_start_ticks": ticks,
            "old_policy_sha256": sha(old_policy), "old_unit_sha256": sha(old_unit),
            "old_controller_sha256": sha(old_controller),
            "new_controller_sha256": NEW_CONTROLLER_SHA,
            "new_unit_sha256": sha(new_bytes),
            "stage": str(NEW_STAGE), "build_version": BUILD, "build_id": BUILD_ID,
            "manifest_sha256": build["manifest_sha256"],
            "runtime_artifact": {"id": ARTIFACT_ID, "sha256": ZIP_SHA},
            "ci_artifact": {"run_id": CI_RUN},
            "protected_snapshot_sha256": PROTECTED_SHA,
            "original_public_nginx_sha256": PUBLIC_NGINX_SHA,
            "read_acl_sha256": pg["read_acl_sha256"],
            "read_definer_sha256": pg["definer_identity_sha256"],
            "financial_authorized": False, "public_cutover_authorized": False,
            "rollback_authorized": True}
    return c, plan, policy, old_unit, old_policy, old_controller, new_bytes, build, proof, critical, env, database, password


def execute(args, state):
    (c, plan, policy, old_unit, old_policy, old_controller, updated_unit,
     build, ci_proof, critical, env, database, password) = state
    plan_sha = sha(canonical(plan))
    need(args.plan_sha256 == plan_sha, "APPROVED_PLAN_HASH_CHANGED")
    # Reuse reviewed GitHub owner identity, signed one-use + limited 10-minute scope.
    c.PROD_SCOPE = SCOPE
    grant = c.production_grant({
        "source_sha": NEW, "nonce": args.nonce,
        "owner_comment_id": args.comment_id,
        "owner_comment_sha256": args.comment_sha256}, plan)
    need(sha(canonical(c.production_protected())) == PROTECTED_SHA,
         "PROTECTED_SNAPSHOT_CHANGED_BEFORE_APPLY")
    need(sha(safe_file(UNIT, 0o644)) == OLD_UNIT_SHA and
         sha(safe_file(POLICY, 0o400)) == OLD_POLICY_SHA,
         "TARGET_PREIMAGE_CHANGED_BEFORE_APPLY")
    journal = JOURNALS / ("upgrade-f50-" + args.nonce)
    journal.mkdir(mode=0o700)
    sealed_write(journal / "entered.json",
         canonical({"status": "CONSUMED_NO_REPLAY", "plan": plan,
                    "grant": grant, "financial_authorized": False,
                    "public_cutover_authorized": False}), 0o600)
    for name, raw in (("unit.before", old_unit), ("policy.before", old_policy),
                      ("controller.before", old_controller)):
        sealed_write(journal / name, raw, 0o600)
    changed = False
    try:
        call_systemd("stop")
        changed = True
        atomic(CONTROLLER, safe_file(NEW_CONTROLLER, 0o600), 0o644)
        atomic(UNIT, updated_unit, 0o644)
        call_systemd("daemon-reload")
        need(sha(canonical(c.production_protected())) == PROTECTED_SHA,
             "FINANCIAL_OR_ORIGINAL_SNAPSHOT_CHANGED")
        call_systemd("start")
        new_policy = dict(policy)
        new_policy.update(source_sha=NEW, stage=str(NEW_STAGE),
            build_version=BUILD, build_id=BUILD_ID,
            artifact=build, ci_artifact=ci_proof,
            unit_sha256=sha(updated_unit), controller_sha256=NEW_CONTROLLER_SHA,
            manifest_sha256=build["manifest_sha256"], critical_runtime=critical,
            native_plan_sha256=plan_sha, journal_path=str(journal))
        pid, ticks = c.production_wait(new_policy, seconds=45)
        need(pid != plan["old_pid"], "STALE_OLD_PID_REUSED")
        actual_pg = c.production_database_witness(database, password)
        need(actual_pg["read_acl_sha256"] == plan["read_acl_sha256"] and
             actual_pg["definer_identity_sha256"] == plan["read_definer_sha256"],
             "F50_CATALOG_CHANGED_DURING_TRANSACTION")
        admission = {"status": "NATIVE_PRODUCTION_ADMISSION_PASS",
            "source_sha": NEW, "candidate_pid": pid,
            "candidate_start_ticks": ticks,
            "catalog": actual_pg,
            "postgres": c.production_database_admission(database, password),
            "kernel": c.production_kernel_probe(new_policy["steam_addresses"]),
            "steam": c.production_steam_probe(env, NEW_STAGE),
            "financial_authorized": False,
            "public_cutover_authorized": False}
        receipt = canonical(admission)
        sealed_write(journal / "runtime-admission.json", receipt, 0o600)
        new_policy["admission_sha256"] = sha(receipt)
        atomic(POLICY, canonical(new_policy), 0o400)
        witness = c.production_witness({"profile_path": str(POLICY)})
        need(witness["candidate_pid"] == pid and
             witness["source_sha"] == NEW and
             witness["financial_authorized"] is False,
             "NEW_PID_C_WITNESS_FAILED")
        sealed_write(journal / "complete.json", canonical({
            "status": "PASS_F50_ISOLATED_NEW_PID_ADMITTED_NOT_PUBLIC",
            "source_sha": NEW, "build_version": BUILD, "pid": pid,
            "admission_sha256": sha(receipt),
            "production_witness_sha256": sha(canonical(witness)),
            "financial_authorized": False,
            "public_cutover_authorized": False}), 0o600)
        print("PASS_F50_ISOLATED_NEW_PID_ADMITTED_NOT_PUBLIC PID=" + str(pid),
              flush=True)
    except BaseException as failure:
        if changed:
            try:
                call_systemd("stop")
                atomic(UNIT, old_unit, 0o644)
                atomic(CONTROLLER, old_controller, 0o644)
                atomic(POLICY, old_policy, 0o400)
                call_systemd("daemon-reload")
                # Old receipt was for the old PID: intentionally leave 3032
                # stopped rather than silently represent a new PID as admitted.
                sealed_write(journal / "rollback.json", canonical({
                    "status": "PASS_OLD_PROFILE_BYTES_RESTORED_3032_STOPPED",
                    "old_public_3030_unchanged": True,
                    "failed_exception_type": type(failure).__name__,
                    "financial_authorized": False,
                    "public_cutover_authorized": False}), 0o600)
            except BaseException as rollback:
                sealed_write(journal / "rollback_hold.json", canonical({
                    "status": "CRITICAL_ISOLATED_ROLLBACK_INCOMPLETE",
                    "error_type": type(rollback).__name__,
                    "financial_authorized": False,
                    "public_cutover_authorized": False}), 0o600)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", choices=("plan", "execute"), required=True)
    parser.add_argument("--nonce", required=True)
    parser.add_argument("--controller-ref", required=True)
    parser.add_argument("--plan-sha256")
    parser.add_argument("--comment-id", type=int)
    parser.add_argument("--comment-sha256")
    args = parser.parse_args()
    need(re.fullmatch(r"[a-f0-9]{32}", args.nonce) is not None,
         "BAD_ONE_USE_NONCE")
    lockfd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        info = os.fstat(lockfd)
        need((info.st_dev, info.st_ino, info.st_uid,
              stat.S_IMODE(info.st_mode)) == (2064, 6185747, 1000, 0o644),
             "ORIGINAL_RELEASE_LOCK_CHANGED")
        fcntl.flock(lockfd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        need(not (JOURNALS / ("upgrade-f50-" + args.nonce)).exists(),
             "NONCE_REPLAY_DENIED")
        state = observe(args)
        digest = sha(canonical(state[1]))
        if args.phase == "plan":
            print(json.dumps({"status": "PASS_F50_ISOLATED_PLAN_READ_ONLY",
                              "plan_sha256": digest, "plan": state[1]},
                             sort_keys=True), flush=True)
        else:
            execute(args, state)
    finally:
        os.close(lockfd)


if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as exc:
        print("HOLD:A05_F50_NATIVE:" + type(exc).__name__ + ":" + str(exc),
              file=sys.stderr, flush=True)
        sys.exit(2)
