#!/usr/bin/env python3
"""Exact source-pinned, one-use 3032-only refresh. Never selects public Nginx.

Requires GitHub authenticated CI artifact already extracted by the reviewed
root-native content-hash extractor, the restricted R25 PostgreSQL views,
identical isolated nonfinancial process guard, protected 3030+WOLO evidence,
and automatic rollback if native startup or isolation admission fails.
Content failures hold public cutover while preserving the isolated candidate.
Neither this controller nor its rollback touches custody, settlement, Nginx,
public 3030 or legacy WOLO services.
"""
from __future__ import annotations

import argparse
import base64
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import sys
import types
import uuid

HOST = "ubuntu-4gb-hel1-11"
OLD = "175e896c59bf48eda44c15d664d940f5ac40b436"
NEW = "dfee677881a501665c2eade0724c3757d5e4e59e"
OLD_STAGE = "/var/lib/aoe2war-web-prod-" + OLD[:12]
NEW_STAGE = "/var/lib/aoe2war-web-prod-" + NEW[:12]
UNIT = Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
POLICY = Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
ARTIFACT_ROOT = Path("/var/lib/aoe2war-runtime-artifacts") / NEW
ARTIFACT_META = ARTIFACT_ROOT / "artifact.json"
STAGE_RECEIPT = ARTIFACT_ROOT / "artifact-stage-receipt.json"
STAGE_RECEIPT_SHA = "2ce709bd01d5fe56eefafd627f6f85483d30018e9c429621f859d2a311899caa"
UNIT_SHA = "8d5468da652f04de36408ea725b501d5cb7e80a21227eb3cecc96b254fa7b92e"
POLICY_SHA = "a84002e648bd5b62a35aee694582c1301f6e8528f7c7a13298437a88dcc2af9f"
ARTIFACT_SHA = "aa771b0b8269ab06eff08bbf705888bdb4daff7c6872f1adf32e2685ec747ece"
GUARD = Path("/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs")
GUARD_SHA = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
LIB = GUARD.parent
CONTROLLER = LIB / "r25_c_start_root.py"
CONTROLLER_SHA = "1a0d2a6bae2539bf72bad2d673e65d62a464c047cb41a55c3a9f0fee89d3f988"
NEW_CONTROLLER_SHA = "675350ea521db49a857fb6e2ce298930fc1898c361fa628f3c46ad5b99c38375"
NEW_CONTROLLER_SIZE = 117733
CONTROLLER_PATH = "scripts/r25_c_start_root.py"
SELF_PATH = "scripts/r25_c_contained_runtime_refresh.py"
VIEW_RECEIPT = Path("/var/lib/aoe2war-app-production-v1/tools/public-read-model-8e2abc0d-install.json")
VIEW_RECEIPT_SHA = "784beb7df7e4ecdd37a18b015b72ad1c32ac90095b124c6eccf49730b498b8fb"
ROLLBACK_RECEIPT = Path("/var/lib/aoe2war-app-production-f/cutover-3384a794d0bad23afcc162efc9659eb2/rollback.json")
ROLLBACK_RECEIPT_SHA = "cd4f809267219f6e0f52a2c751323848f2efaa845f1d701e5007aea348f90634"
PUBLIC_NGINX = Path("/etc/nginx/sites-available/aoe2war.com")
TIMER = "aoe2war-steam-egress-refresh.timer"
REFRESH = "aoe2war-steam-egress-refresh.service"
SCOPE = "REFRESH_EXISTING_NONFINANCIAL_3032_ONLY"
LOCK_ID = (2064, 6185747, 1000, 0o644)
LOCK = Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
JOURNALS = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades")
PUBLIC_VERSION = "20261028134227-6c0f6d7531"
BUILD_VERSION = "20261104042526-970fb81dff"
BUILD_ID = "G1873rHThV2CGXQrY6Kax"
ROUTES = ("/players", "/rivalries", "/war-chest", "/game-stats",
          "/battle-archive", "/bounties", "/champions", "/radio")
FLIGHT = re.compile(r'self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)')
RSC_ERROR = re.compile(r'[0-9a-f]+:E\{.*"digest"\s*:\s*"[^"]+"\}')

class Hold(RuntimeError):
    pass

def need(ok: bool, reason: str):
    if not ok:
        raise Hold(reason)

def sha(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()

def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()

def candidate_systemd(action, unit=None):
    need((action, unit) in {
        ("daemon-reload", None), ("stop", TIMER), ("stop", REFRESH), ("start", TIMER),
        ("stop", UNIT.name), ("start", UNIT.name),
    }, "SYSTEMD_ACTION_NOT_ADMITTED")
    argv = ["/usr/bin/systemctl", action]
    if unit:
        argv.append(unit)
    result = subprocess.run(argv, timeout=45, text=True, capture_output=True)
    need(result.returncode == 0, "CANDIDATE_SYSTEMD_FAILED:" + action)


def timer_active(c):
    state = c.unit_state(TIMER)["properties"]
    need(state.get("ActiveState") == "active" and state.get("NeedDaemonReload") == "no",
         "STEAM_REFRESH_TIMER_NOT_ACTIVE")


def read_safe(p: Path, mode=None) -> bytes:
    st = p.lstat()
    need(stat.S_ISREG(st.st_mode) and not p.is_symlink() and st.st_nlink == 1
         and st.st_uid == 0 and not st.st_mode & 0o022, "SOURCE_UNSEALED:"+p.name)
    if mode is not None:
        need(stat.S_IMODE(st.st_mode)==mode, "SOURCE_MODE_DRIFT:"+p.name)
    return p.read_bytes()

def render_unit(source: bytes) -> bytes:
    s=source.decode("utf8")
    need(s.count(OLD_STAGE)==4 and s.count(NEW_STAGE)==0, "UNIT_STAGE_IDENTITY_DRIFT")
    for invariant in ("User=aoe2war-web-prod", "Group=aoe2war-web-prod",
                      "Restart=no", "NoNewPrivileges=yes", "ProtectSystem=strict",
                      "CapabilityBoundingSet=", "ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032",
                      "WARGRAPH_RUNTIME_DISABLED=true", "AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1"):
        need(invariant in s,"UNIT_AUTHORITY_DRIFT")
    result=s.replace(OLD_STAGE, NEW_STAGE).encode("utf8")
    need(result.count(NEW_STAGE.encode())==4,"UNIT_PATCH_INCOMPLETE")
    return result

def rsc_error(data: str) -> bool:
    chunks = [json.loads(match.group(1)) for match in FLIGHT.finditer(data)]
    need(bool(chunks), "RSC_FLIGHT_ABSENT")
    return any(RSC_ERROR.fullmatch(row) for row in "".join(chunks).splitlines())


def get(port: int, route: str, limit=4*1024*1024) -> bytes:
    need(port in (3030,3032) and route in ("/api/deployment-version", *ROUTES),
         "ROUTE_NOT_ADMITTED")
    conn=http.client.HTTPConnection("127.0.0.1",port,timeout=16)
    try:
        conn.request("GET",route,headers={"Host":"aoe2war.com",
            "Accept":"application/json" if route.startswith("/api/") else "text/html",
            "User-Agent":"aoe2war-contained-source-upgrade/1"})
        res=conn.getresponse()
        need(res.status==200,"ROUTE_NOT_HTTP200:"+route)
        data=res.read(limit+1)
        need(0<len(data)<=limit,"ROUTE_RESPONSE_BOUNDS:"+route)
        return data
    finally: conn.close()

def load_controller(raw, name):
    module = types.ModuleType(name)
    module.__file__ = str(CONTROLLER)
    exec(compile(raw, str(CONTROLLER), "exec"), module.__dict__)
    return module


def assert_protected(c, expected):
    snapshot = c.production_protected()
    need(sha(c.canonical(snapshot)) == expected, "PROTECTED_SNAPSHOT_CHANGED")
    need(sha(read_safe(PUBLIC_NGINX)) == c.PROD_NGINX_PREIMAGE and
         json.loads(get(3030, "/api/deployment-version"))["buildVersion"] == PUBLIC_VERSION,
         "PUBLIC_NGINX_NOT_RECOVERED")
    return snapshot


def staged_artifact(c):
    stage = Path(NEW_STAGE)
    c.directory(stage)
    artifact = json.loads(read_safe(ARTIFACT_META, 0o400))
    receipt = read_safe(STAGE_RECEIPT, 0o600)
    need(sha(receipt) == STAGE_RECEIPT_SHA and
         sha(read_safe(VIEW_RECEIPT, 0o600)) == VIEW_RECEIPT_SHA and
         sha(read_safe(ROLLBACK_RECEIPT, 0o400)) == ROLLBACK_RECEIPT_SHA,
         "ROOT_PREREQUISITE_RECEIPT_CHANGED")
    evidence = json.loads(receipt)
    expected = {
        "status": "PASS_EXACT_CI_ARTIFACT_EXTRACTED_NO_SERVICE_MUTATION",
        "source_sha": NEW, "stage": NEW_STAGE, "build_id": BUILD_ID, "build_version": BUILD_VERSION,
        "github_artifact_id": 13296160830, "github_ci_run": 41772772932,
        "github_zip_sha256": ARTIFACT_SHA, "runtime_sha256": artifact["sha256"],
        "reviewed_extractor_sha256": CONTROLLER_SHA, "financial_authorized": False,
        "public_cutover_authorized": False,
    }
    need(all(evidence.get(k) == v for k, v in expected.items()), "NEW_STAGE_RECEIPT_DRIFT")
    need(artifact.get("source_sha")==NEW and artifact.get("build_id")==BUILD_ID and
         artifact.get("build_version")==BUILD_VERSION,"ARTIFACT_METADATA_DRIFT")
    archive = ARTIFACT_ROOT / "github-ci-artifact-13296160830.zip"
    archive_stat = c.production_artifact_stat(archive)
    actual = c.production_github("actions/artifacts/13296160830")
    run = c.production_github("actions/runs/41772772932")
    need(actual.get("id") == 13296160830 and actual.get("expired") is False and
         actual.get("digest") == "sha256:" + ARTIFACT_SHA and actual.get("size_in_bytes") == archive_stat.st_size and
         actual.get("workflow_run", {}).get("id") == 41772772932 and
         actual.get("workflow_run", {}).get("head_sha") == NEW and
         run.get("head_sha") == NEW and run.get("name") == "AoE2WAR CI" and
         run.get("conclusion") == "success", "GITHUB_STAGED_ARTIFACT_NOT_QUALIFIED")
    for path, value in ((".aoe2war-source-sha", NEW), (".next/BUILD_ID", BUILD_ID),
                        (".aoe2war-build-version", BUILD_VERSION)):
        need(read_safe(stage / path).decode().strip() == value, "NEW_STAGE_BUILD_IDENTITY_CHANGED")
    manifest = read_safe(stage / ".aoe2war-runtime-manifest.json")
    need(sha(manifest) == artifact["manifest_sha256"], "NEW_STAGE_MANIFEST_CHANGED")
    return artifact, {"archive_path": str(archive), "id": 13296160830, "run_id": 41772772932}


def prepare(args):
    need(os.geteuid() == 0 and socket.gethostname().split(".")[0] == HOST, "ROOT_EXACT_HOST_REQUIRED")
    unit, policy_raw, prior_controller = read_safe(UNIT, 0o644), read_safe(POLICY, 0o400), read_safe(CONTROLLER, 0o644)
    need((sha(unit), sha(policy_raw), sha(prior_controller), sha(read_safe(GUARD, 0o644))) ==
         (UNIT_SHA, POLICY_SHA, CONTROLLER_SHA, GUARD_SHA), "CURRENT_UNIT_POLICY_OR_GUARD_CHANGED")
    old = load_controller(prior_controller, "installed_controller")
    candidate_raw = old.production_source({"source_sha": args.release_ref,
        "source_sizes": {CONTROLLER_PATH: NEW_CONTROLLER_SIZE},
        "source_hashes": {CONTROLLER_PATH: NEW_CONTROLLER_SHA}}, CONTROLLER_PATH)
    c = load_controller(candidate_raw, "qualified_catalog_controller")
    policy = json.loads(policy_raw)
    need(policy["source_sha"] == OLD and policy["stage"] == OLD_STAGE, "ORIGINAL_ISOLATED_POLICY_DRIFT")
    snapshot = assert_protected(c, policy["protected_snapshot_sha256"])
    need(old.production_protected() == snapshot and c.production_nft_shape() == policy["nft_shape_sha256"] and
         c.production_refresh_unit_identity() == policy["refresh_units"], "PROTECTED_NFT_OR_REFRESH_DRIFT")
    timer_active(c)
    raw = read_safe(Path(policy["journal_path"]) / "runtime-admission.json", 0o600)
    historical = json.loads(raw)
    old_identity = c.production_wait(policy, seconds=15)
    need(sha(raw) == policy["admission_sha256"] and historical["status"] == "NATIVE_PRODUCTION_ADMISSION_PASS" and
         historical["source_sha"] == OLD and old_identity ==
         (historical["candidate_pid"], historical["candidate_start_ticks"]), "EXISTING_3032_PID_ADMISSION_CHANGED")
    artifact, provenance = staged_artifact(c)
    new_unit = render_unit(unit)
    need(new_unit == c.production_unit_bytes(Path(NEW_STAGE)), "CANONICAL_NEW_UNIT_DIFFERS")
    env, db, password = c.production_runtime_environment()
    pg = c.production_database_witness(db, password)
    need(pg.get("public_read_model") and pg["definer_identity_sha256"] ==
         historical["catalog"]["definer_identity_sha256"], "DATABASE_PUBLIC_VIEW_OR_PRIVATE_DENIAL_DRIFT")
    critical = c.production_critical_runtime(Path(NEW_STAGE))
    plan = {
        "schema": "aoe2war.r25.3032-contained-runtime-refresh-plan.v1", "scope": SCOPE,
        "nonce": args.nonce, "release_ref": args.release_ref, "controller_sha256": NEW_CONTROLLER_SHA,
        "refresh_source_sha256": sha(read_safe(Path(__file__))), "old_source": OLD, "new_source": NEW,
        "old_pid": old_identity[0], "old_ticks": old_identity[1], "protected_public_pid": c.OLD_PID,
        "protected_snapshot_sha256": policy["protected_snapshot_sha256"],
        "old_unit_sha256": sha(unit), "new_unit_sha256": sha(new_unit), "old_policy_sha256": sha(policy_raw),
        "old_controller_sha256": CONTROLLER_SHA, "ci_artifact": {"run_id": args.ci_run},
        "runtime_artifact": provenance, "ci_artifact_sha256": ARTIFACT_SHA,
        "stage_receipt_sha256": STAGE_RECEIPT_SHA, "view_receipt_sha256": VIEW_RECEIPT_SHA,
        "prior_public_rollback_sha256": ROLLBACK_RECEIPT_SHA,
        "new_critical_runtime_sha256": sha(c.canonical(critical)), "catalog": pg,
        "public_nginx_changes": False, "financial_authorized": False, "public_cutover_authorized": False,
    }
    return plan, c, unit, policy_raw, prior_controller, candidate_raw, new_unit, artifact, critical, env, db, password


def owner_grant(c, args, plan):
    source = c.production_github("contents/" + SELF_PATH + "?ref=" + args.release_ref)
    need(source.get("type") == "file" and source.get("encoding") == "base64" and
         sha(base64.b64decode(source["content"].replace("\n", ""), validate=True)) == plan["refresh_source_sha256"],
         "EXACT_REFRESH_SOURCE_REQUIRED")
    checks = c.production_github("commits/" + args.release_ref + "/check-runs?filter=latest&per_page=100")
    scanner = [check for check in checks["check_runs"] if check["name"] == "GitGuardian Security Checks"
               and check["app"]["slug"] == "gitguardian"]
    need(len(scanner) == 1 and scanner[0]["status"] == "completed" and
         scanner[0]["conclusion"] == "success", "EXACT_SOURCE_SECURITY_REQUIRED")
    c.PROD_SCOPE = SCOPE
    return c.production_grant({"source_sha": args.release_ref, "nonce": args.nonce,
        "owner_comment_id": args.comment_id, "owner_comment_sha256": args.comment_sha256}, plan)


def write_atomic(path: Path, contents: bytes, mode: int):
    temp=path.with_name(path.name+".r25-"+uuid.uuid4().hex)
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    with os.fdopen(fd,"wb") as f:
        f.write(contents);f.flush();os.fsync(f.fileno())
    os.chmod(temp,mode);os.replace(temp,path)
    dirfd=os.open(path.parent,os.O_RDONLY)
    try:os.fsync(dirfd)
    finally:os.close(dirfd)

def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def seal(journal, name, value):
    raw = value if isinstance(value, bytes) else canonical(value) + b"\n"
    fd = os.open(journal / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(raw)
        stream.flush()
        os.fsync(stream.fileno())
    fsync_dir(journal)
    return sha(raw)


def ready_profile(c, profile, journal, plan, env, db, password, *, expected_new=True):
    stage = Path(profile["stage"])
    pid, ticks = c.production_wait(profile, seconds=35)
    if expected_new:
        need(pid != plan["old_pid"], "PREVIOUS_PROCESS_STILL_RUNNING")
    catalog = c.production_database_witness(db, password)
    need(catalog == plan["catalog"], "APPROVED_CATALOG_CHANGED")
    admission = {
        "schema": "aoe2war.app.production-admission.v1", "status": "NATIVE_PRODUCTION_ADMISSION_PASS",
        "source_sha": profile["source_sha"], "candidate_pid": pid, "candidate_start_ticks": ticks,
        "catalog": catalog, "postgres": c.production_database_admission(db, password),
        "kernel": c.production_kernel_probe(profile["steam_addresses"]),
        "steam": c.production_steam_probe(env, stage),
        "financial_authorized": False, "public_cutover_authorized": False,
    }
    profile["journal_path"] = str(journal)
    profile["admission_sha256"] = seal(journal, "runtime-admission.json", admission)
    write_atomic(POLICY, canonical(profile) + b"\n", 0o400)
    candidate_systemd("start", TIMER)
    timer_active(c)
    witness = c.production_witness({"profile_path": str(POLICY)})
    assert_protected(c, plan["protected_snapshot_sha256"])
    return witness


def guest_probes():
    observations = {}
    for route in ROUTES:
        try:
            data = get(3032, route)
            status = "RSC_ERROR" if rsc_error(data.decode("utf-8", "strict")) else "NO_RSC_ERROR"
            observations[route] = {"status": status, "bytes": len(data)}
        except (Hold, OSError, ValueError, http.client.HTTPException) as exc:
            observations[route] = {"status": "HOLD", "reason_type": type(exc).__name__}
    return observations


def execute(args, prepared):
    plan, c, unit, policy_raw, old_controller, controller, new_unit, artifact, critical, env, db, password = prepared
    plan_hash = sha(c.canonical(plan))
    need(args.plan_sha256 == plan_hash, "EXACT_PLAN_HASH_REQUIRED")
    grant = owner_grant(c, args, plan)
    assert_protected(c, plan["protected_snapshot_sha256"])
    need((read_safe(UNIT), read_safe(POLICY), read_safe(CONTROLLER)) == (unit, policy_raw, old_controller),
         "PREEXECUTION_PROFILE_DRIFT")
    journal = JOURNALS / ("contained-3032-" + args.nonce)
    journal.mkdir(mode=0o700)
    fsync_dir(JOURNALS)
    seal(journal, "entered.json", {"status": "CONSUMED_DO_NOT_REPLAY", "plan": plan,
         "plan_sha256": plan_hash, "owner_grant": grant, "financial_authorized": False,
         "public_cutover_authorized": False})
    for name, raw in (("unit.before", unit), ("policy.before", policy_raw), ("controller.before", old_controller)):
        seal(journal, name, raw)
    before = json.loads(policy_raw)
    profile = {**before, "source_sha": NEW, "stage": NEW_STAGE, "build_id": BUILD_ID,
        "build_version": BUILD_VERSION, "artifact": artifact, "ci_artifact": plan["runtime_artifact"],
        "manifest_sha256": artifact["manifest_sha256"], "unit_sha256": sha(new_unit),
        "controller_sha256": NEW_CONTROLLER_SHA, "critical_runtime": critical, "native_plan_sha256": plan_hash}
    try:
        candidate_systemd("stop", TIMER)
        candidate_systemd("stop", REFRESH)
        candidate_systemd("stop", UNIT.name)
        write_atomic(CONTROLLER, controller, 0o644)
        write_atomic(UNIT, new_unit, 0o644)
        candidate_systemd("daemon-reload")
        assert_protected(c, plan["protected_snapshot_sha256"])
        profile["steam_addresses"] = c.production_admission_steam_refresh()
        candidate_systemd("start", UNIT.name)
        witness = ready_profile(c, profile, journal, plan, env, db, password)
        routes = guest_probes()
        need(c.production_wait(profile, seconds=5) ==
             (witness["candidate_pid"], witness["candidate_start_ticks"]), "CANDIDATE_CHANGED_DURING_CONTENT_PROBES")
        content_pass = all(row["status"] == "NO_RSC_ERROR" for row in routes.values())
        record = {"status": "PASS_NEW_3032_ADMITTED_NOT_PUBLIC", "source_sha": NEW,
            "build_version": BUILD_VERSION, "build_id": BUILD_ID, "pid": witness["candidate_pid"],
            "ticks": witness["candidate_start_ticks"], "profile_sha256": witness["profile_sha256"],
            "read_acl_sha256": witness["postgres"]["read_acl_sha256"],
            "content": {"candidate_build_version": BUILD_VERSION},
            "guest_routes": routes, "guest_content_gate": "PASS_NO_RSC_ERRORS" if content_pass else "HOLD_PUBLIC_CUTOVER",
            "browser_roles_verified": False, "financial_authorized": False, "public_cutover_authorized": False}
        seal(journal, "complete.json", record)
        print(json.dumps({**record, "journal": str(journal)}, sort_keys=True))
    except BaseException as failure:
        try:
            candidate_systemd("stop", TIMER)
            candidate_systemd("stop", REFRESH)
            candidate_systemd("stop", UNIT.name)
            # Reusing the pre-restart admission would bind the wrong PID.
            # Keep the qualified catalog observer for the already-installed views.
            write_atomic(CONTROLLER, controller, 0o644)
            write_atomic(UNIT, unit, 0o644)
            candidate_systemd("daemon-reload")
            assert_protected(c, plan["protected_snapshot_sha256"])
            rollback_dir = journal / "rollback-requalification"
            rollback_dir.mkdir(mode=0o700)
            fsync_dir(journal)
            before.update(controller_sha256=NEW_CONTROLLER_SHA, native_plan_sha256=plan_hash,
                          steam_addresses=c.production_admission_steam_refresh())
            candidate_systemd("start", UNIT.name)
            restored = ready_profile(c, before, rollback_dir, plan, env, db, password, expected_new=False)
            seal(journal, "rollback.json", {"status": "PASS_OLD_ISOLATED_3032_RESTORED_NOT_PUBLIC",
                "source_sha": OLD, "candidate_pid": restored["candidate_pid"],
                "profile_sha256": restored["profile_sha256"], "failure_type": type(failure).__name__,
                "financial_authorized": False, "public_cutover_authorized": False})
        except BaseException as rollback:
            # An unattested replacement must never be left running after a
            # failed restoration. Preserve public 3030 and all journals.
            stopped = True
            for unit_to_stop in (TIMER, REFRESH, UNIT.name):
                try:
                    candidate_systemd("stop", unit_to_stop)
                except BaseException:
                    stopped = False
            seal(journal, "rollback_hold.json", {"status": "CRITICAL_ROLLBACK_INCOMPLETE",
                "isolated_stop_commands_passed": stopped, "reason_type": type(rollback).__name__,
                "financial_authorized": False, "public_cutover_authorized": False})
        raise



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--phase", required=True, choices=("plan", "execute"))
    parser.add_argument("--nonce", required=True)
    parser.add_argument("--release-ref", required=True)
    parser.add_argument("--ci-run", type=int, required=True)
    parser.add_argument("--plan-sha256")
    parser.add_argument("--comment-id", type=int)
    parser.add_argument("--comment-sha256")
    args = parser.parse_args()
    need(re.fullmatch(r"[0-9a-f]{32}", args.nonce) and re.fullmatch(r"[0-9a-f]{40}", args.release_ref) and
         args.ci_run > 0, "EXACT_TRANSACTION_FIELDS_REQUIRED")
    st = LOCK.lstat()
    need(stat.S_ISREG(st.st_mode) and (st.st_dev, st.st_ino, st.st_uid, stat.S_IMODE(st.st_mode)) ==
         LOCK_ID, "ORIGINAL_RELEASE_LOCK_CHANGED")
    fd = os.open(LOCK, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try:
        opened = os.fstat(fd)
        need((opened.st_dev, opened.st_ino) == LOCK_ID[:2], "ORIGINAL_RELEASE_LOCK_OPEN_RACE")
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        need(not os.path.lexists(JOURNALS / ("contained-3032-" + args.nonce)), "NONCE_ALREADY_CONSUMED")
        prepared = prepare(args)
        plan, c = prepared[:2]
        if args.phase == "plan":
            need(args.plan_sha256 is None and args.comment_id is None and args.comment_sha256 is None,
                 "PLAN_MUST_NOT_AUTHORIZE_EXECUTION")
            print(json.dumps({"status": "PASS_READONLY_CONTAINED_REFRESH_PLAN_NOT_AUTHORITY",
                "plan": plan, "plan_sha256": sha(c.canonical(plan)), "public_cutover_authorized": False}, sort_keys=True))
        else:
            need(re.fullmatch(r"[0-9a-f]{64}", args.plan_sha256 or "") and
                 args.comment_id and args.comment_id > 0 and re.fullmatch(r"[0-9a-f]{64}", args.comment_sha256 or ""),
                 "EXACT_OWNER_GRANT_FIELDS_REQUIRED")
            execute(args, prepared)
    finally:
        os.close(fd)


if __name__ == "__main__":
    try:
        main()
    except (Hold, OSError, ValueError, KeyError, subprocess.SubprocessError, RuntimeError) as error:
        print("HOLD:" + str(error)[:200], file=sys.stderr)
        raise SystemExit(2)
