#!/usr/bin/env python3
"""A05 final source-pinned, one-use STOPPED 3032 admission.

Only the isolated nonfinancial service, its own Steam refresh timer and
exact source-bound controller may be changed. No public 3030/Nginx/WOLO
mutations, no financial authority, no replay of consumed journal.

The read-only AUDIT is available before new public database views are
installed. PLAN and EXECUTE require the native v1-v11 catalog to pass.
Execution requires the signed exact-plan, time-bounded authenticated owner
grant; an unapproved plan is not authority to restart anything.
"""
from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import socket
import stat
import sys
import types
import zipfile

HOST = "ubuntu-4gb-hel1-11"
SCOPE = "A05_FINAL_STOPPED_NONFINANCIAL_3032_ONLY"
SOURCE_PATH = "scripts/r25_a05_final_3032_recovery.py"
CONTROLLER_PATH = "scripts/r25_c_start_root.py"
OLD_SOURCE = "dfee677881a501665c2eade0724c3757d5e4e59e"
NEW_SOURCE = "5869b4ab08702be4b33860f7dda7d97b5de79424"
CI_RUN = 41874361015
ARTIFACT_ID = 13346996291
ARTIFACT_ZIP_SHA = "8b2297a46271f75e00a53da7b976ce2aeac7b8685a8c3488fec1e4e608c632e0"
BUILD_ID = "gNTYc83_9WWZDZURRW0QP"
BUILD_VERSION = "20261104171049-8504ea08e5"
STAGE = Path("/var/lib/aoe2war-web-prod-" + NEW_SOURCE[:12])
ARCHIVE_ROOT = Path("/var/lib/aoe2war-runtime-artifacts") / NEW_SOURCE
ARCHIVE = ARCHIVE_ROOT / "runtime.zip"
STAGE_RECEIPT = ARCHIVE_ROOT / "artifact-stage-receipt-5869.json"
STAGE_RECEIPT_SHA = "ce7436919837553c1064c83f7421bd26db0f2b0971b30186394fa07a791a43fc"
CRITICAL_SHA = "8a9eb2fcc3b11b8fa807afbe453bd5f28e38901474f0d769cb67efa6d203535a"
NEW_UNIT_SHA = "121f76699b1ceeda728b0e69fd1c2602a60ac1f4bb4f6fc979598d6bb74fa1bc"
PRODUCTION_SOURCE = ARCHIVE_ROOT / "source-qualified-extractor-5869.py"
PRODUCTION_SOURCE_SHA = "6085b303f4ae8b57414fc5741b6443ba268372becde59524211b91348c833988"
RELEASE_REFRESH_SOURCE = Path("/root/aoe2war-r25-refresh-a9eb.py")
RELEASE_REFRESH_SHA = "74f60f937d311a8296e5c58cf5f0e839d6998b12b7d6a9b694e15dd733f71d28"
ROOT_SOURCE = Path("/root/r25-a05-final-3032-recovery.py")
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
POLICY = Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
CONTROLLER = Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
GUARD = Path("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs")
OLD_UNIT_SHA = "6f809aa129f89ac1d38100081ef7b74105f4bb913eee5695e9b7d37c09c21670"
OLD_POLICY_SHA = "4b375bab4c1efd1498ef1b77e6fc2a69faa174574c6b728e69f34ef340f9127e"
OLD_CONTROLLER_SHA = "06180e39f7dca64aa4f4ce2de2a823d37a614077b9c5b17ed0f838d42277c724"
GUARD_SHA = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
OLD_JOURNAL = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades/contained-3032-2ed28b040d57cc1f2a3b2e769a52ccaf")
JOURNALS = OLD_JOURNAL.parent
PUBLIC_BUILD = "20261028134227-6c0f6d7531"
H40 = re.compile(r"[0-9a-f]{40}\Z")
H64 = re.compile(r"[0-9a-f]{64}\Z")
NONCE = re.compile(r"[0-9a-f]{32}\Z")


class Hold(RuntimeError):
    pass


def need(ok, reason):
    if not ok:
        raise Hold(reason)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def sealed_bytes(path, mode=None):
    info = path.lstat()
    need(stat.S_ISREG(info.st_mode) and info.st_uid == 0 and info.st_nlink == 1
         and not path.is_symlink() and not info.st_mode & 0o022,
         "SOURCE_OR_RECEIPT_NOT_ROOT_SEALED")
    if mode is not None:
        need(stat.S_IMODE(info.st_mode) == mode, "ROOT_SEALED_FILE_MODE_CHANGED")
    return path.read_bytes()


def module(path, expected_sha, name):
    raw = sealed_bytes(path)
    need(sha(raw) == expected_sha, "EXACT_REVIEWED_CONTROLLER_SOURCE_CHANGED:" + name)
    instance = types.ModuleType(name)
    instance.__file__ = str(path)
    exec(compile(raw, str(path), "exec"), instance.__dict__)
    return instance


def sources():
    c = module(PRODUCTION_SOURCE, PRODUCTION_SOURCE_SHA, "r25_final_qualified_controller")
    r = module(RELEASE_REFRESH_SOURCE, RELEASE_REFRESH_SHA, "r25_final_qualified_refresh_helpers")
    return c, r


def history():
    entered = json.loads(sealed_bytes(OLD_JOURNAL / "entered.json", 0o600))
    held = json.loads(sealed_bytes(OLD_JOURNAL / "rollback_hold.json", 0o600))
    need(entered.get("status") == "CONSUMED_DO_NOT_REPLAY"
         and entered.get("financial_authorized") is False
         and entered.get("public_cutover_authorized") is False
         and held == {
           "financial_authorized": False,
           "isolated_stop_commands_passed": True,
           "public_cutover_authorized": False,
           "reason_type": "Hold",
           "status": "CRITICAL_ROLLBACK_INCOMPLETE",
         }
         and not (OLD_JOURNAL / "complete.json").exists()
         and not (OLD_JOURNAL / "rollback.json").exists(),
         "FAILED_PREVIOUS_NONCE_OR_ROLLBACK_JOURNAL_CHANGED")
    return entered, held


def archive(c):
    data = json.loads(sealed_bytes(STAGE_RECEIPT, 0o600))
    need(sha(sealed_bytes(STAGE_RECEIPT, 0o600)) == STAGE_RECEIPT_SHA
         and data.get("status") == "PASS_EXACT_CI_RUNTIME_EXTRACTED_NO_SERVICE_MUTATION"
         and data.get("source_sha") == NEW_SOURCE
         and data.get("stage") == str(STAGE)
         and data.get("github_ci_run") == CI_RUN
         and data.get("github_artifact_id") == ARTIFACT_ID
         and data.get("github_zip_sha256") == ARTIFACT_ZIP_SHA
         and data.get("critical_runtime_sha256") == CRITICAL_SHA
         and data.get("proposed_isolated_unit_sha256") == NEW_UNIT_SHA
         and data.get("financial_authorized") is False
         and data.get("public_cutover_authorized") is False
         and data.get("isolated_service_started") is False,
         "CI_STAGE_RECEIPT_NOT_EXACT")
    c.directory(STAGE)
    info = c.production_artifact_stat(ARCHIVE)
    need(info.st_size == 615515250, "CI_ZIP_SIZE_DRIFT")
    with zipfile.ZipFile(ARCHIVE) as z:
        need(set(z.namelist()) == {"artifact.json", "runtime.tar.gz"},
             "CI_ZIP_MEMBER_IDENTITY_CHANGED")
        artifact = json.loads(z.read("artifact.json"))
    need(artifact.get("source_sha") == NEW_SOURCE
         and artifact.get("build_id") == BUILD_ID
         and artifact.get("build_version") == BUILD_VERSION
         and artifact.get("tree_sha256") == "efd6a4d58471aca73d9bea84b2e7672b0c04f2734f040ba340af5fa6d48a9711"
         and artifact.get("files") == 44839,
         "STAGED_ARTIFACT_INTERNAL_IDENTITY_CHANGED")
    payload = {
        "source_sha": NEW_SOURCE,
        "artifact": artifact,
        "ci_artifact": {
            "id": ARTIFACT_ID,
            "run_id": CI_RUN,
            "archive_path": str(ARCHIVE),
        },
    }
    path, _, provenance = c.production_archive(payload)
    need(path == ARCHIVE and provenance.get("zip_sha256") == ARTIFACT_ZIP_SHA,
         "GITHUB_ARTIFACT_PROVENANCE_CHANGED")
    need(sha(c.canonical(c.production_critical_runtime(STAGE))) == CRITICAL_SHA,
         "CRITICAL_RUNTIME_CHANGED")
    return artifact, provenance


def preflight(c, r):
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "EXACT_ROOT_HOST_REQUIRED")
    before = tuple(sealed_bytes(p, mode) for p, mode in (
        (UNIT, 0o644), (POLICY, 0o400), (CONTROLLER, 0o644), (GUARD, 0o644)))
    need(tuple(map(sha, before)) ==
         (OLD_UNIT_SHA, OLD_POLICY_SHA, OLD_CONTROLLER_SHA, GUARD_SHA),
         "STOPPED_ISOLATED_PREIMAGE_CHANGED")
    unit, policy_raw, controller, guard = before
    policy = json.loads(policy_raw)
    need(policy.get("source_sha") == OLD_SOURCE and
         policy.get("stage") == "/var/lib/aoe2war-web-prod-" + OLD_SOURCE[:12] and
         policy.get("controller_sha256") == OLD_CONTROLLER_SHA,
         "HELD_ORIGINAL_POLICY_NOT_MATCHED")
    entered, held = history()
    need(policy.get("native_plan_sha256") == entered.get("plan_sha256")
         and policy.get("journal_path") == str(OLD_JOURNAL / "rollback-requalification")
         and entered.get("plan", {}).get("old_pid") == 2777557
         and entered.get("plan", {}).get("old_ticks") == 161580431,
         "HELD_ISOLATED_POLICY_NOT_BOUND_TO_CONSUMED_JOURNAL")
    for name in (UNIT.name, r.TIMER, r.REFRESH):
        state = c.unit_state(name)["properties"]
        need(state.get("ActiveState") == "inactive"
             and state.get("MainPID") in ("0", None),
             "ISOLATED_SERVICE_OR_TIMER_NOT_STOPPED:" + name)
    need(c.unit_state("aoe2hdbets-web.service")["properties"].get("ActiveState") == "active",
         "OLD_PUBLIC_SERVICE_NOT_ACTIVE")
    protected = c.production_protected()
    protected_sha = sha(c.canonical(protected))
    r.assert_protected(c, protected_sha)
    need(json.loads(r.get(3030, "/api/deployment-version"))["buildVersion"] == PUBLIC_BUILD,
         "OLD_PUBLIC_3030_VERSION_CHANGED")
    candidate = c.production_unit_bytes(STAGE)
    need(sha(candidate) == NEW_UNIT_SHA
         and unit.count(str(policy["stage"]).encode()) == 4
         and unit.replace(str(policy["stage"]).encode(), str(STAGE).encode()) == candidate,
         "CANDIDATE_UNIT_NOT_SOURCE_EQUIVALENT")
    need((STAGE / "public/downloads").is_dir(), "CANDIDATE_PUBLIC_MEDIA_MOUNT_NOT_READY")
    artifact, provenance = archive(c)
    return {
      "unit": unit, "policy_raw": policy_raw, "controller": controller,
      "candidate_unit": candidate, "policy": policy,
      "entered": entered, "held": held,
      "protected_snapshot_sha256": protected_sha,
      "artifact": artifact, "provenance": provenance,
    }


def plan(args, c, r, ready):
    need(NONCE.fullmatch(args.nonce) and
         H40.fullmatch(args.release_ref) and args.ci_run > 0,
         "EXACT_SOURCE_NONCE_AND_HEAD_REQUIRED")
    dest = JOURNALS / ("final-3032-" + args.nonce)
    need(not dest.exists() and not dest.is_symlink(), "ONE_USE_NONCE_ALREADY_CONSUMED")
    env, db, password = c.production_runtime_environment()
    catalog = c.production_database_witness(db, password)
    need(catalog.get("public_read_model") is not None
         and H64.fullmatch(catalog.get("additional_read_model_sha256", "")),
         "V1_TO_V11_NATIVE_CATALOG_NOT_ADMITTED")
    need(catalog.get("definer_identity_sha256") ==
         ready["entered"]["plan"]["catalog"]["definer_identity_sha256"],
         "PROTECTED_AUTH_FUNCTION_IDENTITY_CHANGED")
    result = {
      "schema": "aoe2war.a05.final-stopped-3032-recovery-plan.v1",
      "scope": SCOPE, "nonce": args.nonce, "release_ref": args.release_ref,
      "artifact_source_sha": NEW_SOURCE, "artifact_ci_run": CI_RUN,
      "ci_artifact": {"run_id": args.ci_run},
      "root_release_controller_sha256": PRODUCTION_SOURCE_SHA,
      "staged_artifact_receipt_sha256": STAGE_RECEIPT_SHA,
      "artifact_zip_sha256": ARTIFACT_ZIP_SHA,
      "artifact_provenance": ready["provenance"],
      "critical_runtime_sha256": CRITICAL_SHA,
      "old_unit_sha256": OLD_UNIT_SHA, "new_unit_sha256": NEW_UNIT_SHA,
      "old_policy_sha256": OLD_POLICY_SHA,
      "old_controller_sha256": OLD_CONTROLLER_SHA,
      "old_pid": ready["entered"]["plan"]["old_pid"],
      "old_ticks": ready["entered"]["plan"]["old_ticks"],
      "prior_failed_entered_sha256": sha(sealed_bytes(OLD_JOURNAL / "entered.json", 0o600)),
      "prior_failed_hold_sha256": sha(sealed_bytes(OLD_JOURNAL / "rollback_hold.json", 0o600)),
      "protected_snapshot_sha256": ready["protected_snapshot_sha256"],
      "catalog": catalog, "public_nginx_mutations": False,
      "financial_authorized": False, "public_cutover_authorized": False,
      "candidate_service": UNIT.name, "public_version": PUBLIC_BUILD,
    }
    return result, (env, db, password)


def owner_grant(args, c, plan_data, source_hash):
    item = c.production_github("contents/" + SOURCE_PATH + "?ref=" + args.release_ref)
    need(item.get("type") == "file" and item.get("encoding") == "base64"
         and sha(base64.b64decode(item["content"].replace("\n", ""), validate=True)) == source_hash,
         "RECOVERY_SOURCE_NOT_IN_EXACT_GITHUB_HEAD")
    item = c.production_github("contents/" + CONTROLLER_PATH + "?ref=" + args.release_ref)
    need(item.get("type") == "file" and item.get("encoding") == "base64"
         and sha(base64.b64decode(item["content"].replace("\n", ""), validate=True)) == PRODUCTION_SOURCE_SHA,
         "GITHUB_REVIEWED_NATIVE_CONTROLLER_CHANGED")
    checks = c.production_github("commits/" + args.release_ref + "/check-runs?filter=latest&per_page=100")
    scan = [x for x in checks.get("check_runs", [])
            if x.get("name") == "GitGuardian Security Checks"
            and x.get("app", {}).get("slug") == "gitguardian"]
    need(len(scan) == 1 and scan[0].get("conclusion") == "success",
         "EXACT_SOURCE_SECURITY_SCAN_NOT_PASS")
    c.PROD_SCOPE = SCOPE
    grant = c.production_grant({
        "source_sha": args.release_ref, "nonce": args.nonce,
        "owner_comment_id": args.comment_id,
        "owner_comment_sha256": args.comment_sha256,
    }, plan_data)
    return grant


def execute(args, c, r, ready, plan_data, dbparts, source_hash):
    need(H64.fullmatch(args.plan_sha256 or "")
         and args.plan_sha256 == sha(c.canonical(plan_data)),
         "OWNER_BOUND_EXACT_PLAN_SHA_REQUIRED")
    grant = owner_grant(args, c, plan_data, source_hash)
    need(canonical(c.production_database_witness(dbparts[1], dbparts[2])) ==
         canonical(plan_data["catalog"]), "DATABASE_CATALOG_CHANGED_SINCE_GRANT")
    r.assert_protected(c, plan_data["protected_snapshot_sha256"])
    need((sealed_bytes(UNIT, 0o644), sealed_bytes(POLICY, 0o400),
          sealed_bytes(CONTROLLER, 0o644)) ==
         (ready["unit"], ready["policy_raw"], ready["controller"]),
         "EXACT_SERVICE_POLICY_CHANGED_AFTER_PLAN")
    journal = JOURNALS / ("final-3032-" + args.nonce)
    journal.mkdir(mode=0o700)
    r.fsync_dir(JOURNALS)
    r.seal(journal, "entered.json", {
       "schema": "aoe2war.a05.final-stopped-entered.v1",
       "status": "CONSUMED_DO_NOT_REPLAY", "plan": plan_data,
       "plan_sha256": args.plan_sha256, "owner_grant": grant,
       "financial_authorized": False, "public_cutover_authorized": False,
    })
    for name, raw in (("unit.before", ready["unit"]),
                      ("policy.before", ready["policy_raw"]),
                      ("controller.before", ready["controller"])):
        r.seal(journal, name, raw)
    profile = {
       **ready["policy"], "source_sha": NEW_SOURCE, "stage": str(STAGE),
       "build_id": BUILD_ID, "build_version": BUILD_VERSION,
       "artifact": ready["artifact"],
       "ci_artifact": ready["provenance"],
       "manifest_sha256": ready["artifact"]["manifest_sha256"],
       "unit_sha256": NEW_UNIT_SHA,
       "controller_sha256": PRODUCTION_SOURCE_SHA,
       "critical_runtime": c.production_critical_runtime(STAGE),
       "native_plan_sha256": args.plan_sha256,
       "protected_snapshot_sha256": plan_data["protected_snapshot_sha256"],
    }
    try:
        r.candidate_systemd("stop", r.TIMER)
        r.candidate_systemd("stop", r.REFRESH)
        r.candidate_systemd("stop", UNIT.name)
        r.write_atomic(CONTROLLER, sealed_bytes(PRODUCTION_SOURCE, 0o600), 0o644)
        r.write_atomic(UNIT, ready["candidate_unit"], 0o644)
        r.candidate_systemd("daemon-reload")
        r.assert_protected(c, plan_data["protected_snapshot_sha256"])
        profile["steam_addresses"] = c.production_admission_steam_refresh()
        r.candidate_systemd("start", UNIT.name)
        proof = r.ready_profile(c, profile, journal, plan_data, *dbparts)
        routes = r.guest_probes()
        need(c.production_wait(profile, seconds=5) ==
             (proof["candidate_pid"], proof["candidate_start_ticks"]),
             "CANDIDATE_PID_CHANGED_DURING_CONTENT_PROBES")
        good = all(x.get("status") == "NO_RSC_ERROR" for x in routes.values())
        result = {
          "schema": "aoe2war.a05.final-3032-isolated-acceptance.v1",
          "status": "PASS_NEW_3032_ADMITTED_NOT_PUBLIC" if good
                    else "HOLD_ISOLATED_CONTENT_NOT_PUBLIC",
          "candidate_pid": proof["candidate_pid"],
          "candidate_start_ticks": proof["candidate_start_ticks"],
          "source_sha": NEW_SOURCE, "build_id": BUILD_ID,
          "guest_routes": routes,
          "financial_authorized": False, "public_cutover_authorized": False,
        }
        r.seal(journal, "complete.json", result)
        print(json.dumps({**result, "journal": str(journal)}, sort_keys=True))
    except BaseException as failure:
        stopped = True
        for action, unit in (("stop", r.TIMER), ("stop", r.REFRESH),
                             ("stop", UNIT.name)):
            try:
                r.candidate_systemd(action, unit)
            except BaseException:
                stopped = False
        try:
            r.write_atomic(CONTROLLER, ready["controller"], 0o644)
            r.write_atomic(UNIT, ready["unit"], 0o644)
            r.write_atomic(POLICY, ready["policy_raw"], 0o400)
            r.candidate_systemd("daemon-reload")
            r.assert_protected(c, plan_data["protected_snapshot_sha256"])
        except BaseException:
            stopped = False
        r.seal(journal, "hold.json", {
           "schema": "aoe2war.a05.final-3032-hold.v1",
           "status": "STOPPED_NO_PUBLIC_CUTOVER" if stopped
                     else "CRITICAL_ISOLATED_STOP_INCOMPLETE",
           "failure_type": type(failure).__name__,
           "reason": str(failure)[:150],
           "isolated_stop_commands_passed": stopped,
           "financial_authorized": False, "public_cutover_authorized": False,
        })
        raise


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--phase", required=True, choices=("audit", "plan", "execute"))
    ap.add_argument("--nonce")
    ap.add_argument("--release-ref")
    ap.add_argument("--ci-run", type=int)
    ap.add_argument("--source-hash")
    ap.add_argument("--plan-sha256")
    ap.add_argument("--comment-id", type=int)
    ap.add_argument("--comment-sha256")
    args = ap.parse_args()
    c, r = sources()
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST,
         "EXACT_ROOT_HOST_REQUIRED")
    ready = preflight(c, r)
    if args.phase == "audit":
        need(all(x is None for x in (args.nonce, args.release_ref, args.ci_run,
                                     args.source_hash, args.plan_sha256,
                                     args.comment_id, args.comment_sha256)),
             "READONLY_AUDIT_CANNOT_TAKE_AUTHORIZATION")
        state = {"status": "PASS_READONLY_A05_STAGED_PREIMAGE_NO_SERVICE_AUTHORITY",
          "source_sha": NEW_SOURCE,
          "stage": str(STAGE),
          "critical_runtime_sha256": CRITICAL_SHA,
          "protected_snapshot_sha256": ready["protected_snapshot_sha256"],
          "old_service_stopped": True,
          "public_nginx_mutations": False,
          "financial_authorized": False,
          "public_cutover_authorized": False}
        env, db, pw = c.production_runtime_environment()
        try:
            witness = c.production_database_witness(db, pw)
            state["database"] = {"status": "PASS",
              "additional_read_model_sha256": witness["additional_read_model_sha256"]}
        except c.Hold as err:
            state["database"] = {"status": "HOLD", "reason": str(err)[:140]}
        print(json.dumps(state, sort_keys=True))
        return
    need(NONCE.fullmatch(args.nonce or "") and H40.fullmatch(args.release_ref or "")
         and H64.fullmatch(args.source_hash or "")
         and type(args.ci_run) is int and args.ci_run > 0,
         "INVALID_SOURCE_HEAD_NONCE_OR_HASH")
    need(sha(sealed_bytes(ROOT_SOURCE, 0o600)) == args.source_hash,
         "GITHUB_PINNED_ROOT_RECOVERY_FILE_CHANGED")
    lock = r.LOCK.lstat()
    need(stat.S_ISREG(lock.st_mode) and
         (lock.st_dev, lock.st_ino, lock.st_uid, stat.S_IMODE(lock.st_mode)) == r.LOCK_ID,
         "SHARED_RELEASE_LOCK_IDENTITY_CHANGED")
    fd = os.open(r.LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        plan_data, dbparts = plan(args, c, r, ready)
        if args.phase == "plan":
            need(args.plan_sha256 is None and args.comment_id is None
                 and args.comment_sha256 is None,
                 "PLAN_MUST_NOT_TAKE_OWNER_AUTH_FIELDS")
            print(json.dumps({"status": "PASS_READONLY_EXACT_PLAN_NOT_DEPLOYMENT_AUTHORITY",
                              "plan_sha256": sha(c.canonical(plan_data)),
                              "plan": plan_data}, sort_keys=True))
        else:
            need(type(args.comment_id) is int and args.comment_id > 0
                 and H64.fullmatch(args.comment_sha256 or ""),
                 "EXACT_ONE_USE_AUTHENTIC_OWNER_GRANT_REQUIRED")
            execute(args, c, r, ready, plan_data, dbparts, args.source_hash)
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, KeyError, TimeoutError) as exc:
        print("HOLD:" + str(exc)[:200], file=sys.stderr)
        raise SystemExit(2)
