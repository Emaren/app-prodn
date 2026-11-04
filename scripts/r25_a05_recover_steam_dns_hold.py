#!/usr/bin/env python3
"""One-use source-bound recovery from exact failed isolated 3032 Steam DNS race.

Never touches public Nginx, public 3030, consensus or financial services.
Recovery of a stopped isolated profile is NOT a public release approval.
"""
from __future__ import annotations
import argparse, base64, fcntl, hashlib, json, os, re, socket, stat, subprocess, sys
from pathlib import Path
import importlib.util
import types
import datetime

SOURCE_PATH = "scripts/r25_a05_recover_steam_dns_hold.py"
CONTROLLER_PATH = "scripts/r25_c_start_root.py"
PRIOR_JOURNAL = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades/contained-3032-2ed28b040d57cc1f2a3b2e769a52ccaf")
OLD_UNIT_SHA = "6f809aa129f89ac1d38100081ef7b74105f4bb913eee5695e9b7d37c09c21670"
OLD_POLICY_SHA = "4b375bab4c1efd1498ef1b77e6fc2a69faa174574c6b728e69f34ef340f9127e"
OLD_CONTROLLER_SHA = "06180e39f7dca64aa4f4ce2de2a823d37a614077b9c5b17ed0f838d42277c724"
GUARD_SHA = "5edf4485be0884922935295600adf7c8b3c17fe697b962d31e7f17b09e8f3ec3"
NEW_CONTROLLER_SHA = "f0c9f7af5c213331eecf812aea15e1a925bc851cd548cda9ba3bfce95301d18e"
NEW_CONTROLLER_FILE = Path("/root/r25-c-steam-dns-source-v2.py")
ROOT_SOURCE_FILE = Path("/root/r25-a05-recover-steam-dns-hold.py")
REFRESH_SOURCE_FILE = Path("/root/aoe2war-r25-refresh-a9eb.py")
REFRESH_SOURCE_SHA = "74f60f937d311a8296e5c58cf5f0e839d6998b12b7d6a9b694e15dd733f71d28"
RECOVERY_SCOPE = "RECOVER_FAILED_NONFINANCIAL_3032_ONLY"
HOST = "ubuntu-4gb-hel1-11"
EXPECTED_OLD_SOURCE = "dfee677881a501665c2eade0724c3757d5e4e59e"
EXPECTED_NEW_SOURCE = "a9eb6d6e32df3471d88ebbe3007b8c621d5e82a8"
EXPECTED_OLD_PID = 2777557
EXPECTED_OLD_TICKS = 161580431
RELEASE_ROOT = Path("/var/lib/aoe2war-app-production-v1/profile-upgrades")
SOURCE_REF_PATTERN = re.compile(r"[0-9a-f]{40}\Z")
NONCE_PATTERN = re.compile(r"[0-9a-f]{32}\Z")
HASH_PATTERN = re.compile(r"[0-9a-f]{64}\Z")


class Hold(RuntimeError):
    pass


def need(condition, reason):
    if not condition:raise Hold(reason)


def sha(data: bytes):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(",",":"),allow_nan=False).encode()


def root_bytes(path: Path, mode=None):
    st=path.lstat()
    need(stat.S_ISREG(st.st_mode) and not path.is_symlink() and st.st_uid==0 and st.st_nlink==1
         and not st.st_mode & 0o022,"ROOT_SOURCE_FILE_IDENTITY_HOLD")
    if mode is not None:need(stat.S_IMODE(st.st_mode)==mode,"ROOT_SOURCE_MODE_HOLD")
    return path.read_bytes()


def load_module(path, expected_hash, name):
    raw=root_bytes(path)
    need(sha(raw)==expected_hash,"REVIEWED_SOURCE_CHANGED:"+name)
    mod=types.ModuleType(name)
    mod.__file__=str(path)
    exec(compile(raw,str(path),"exec"),mod.__dict__)
    return mod


def modules():
    r=load_module(REFRESH_SOURCE_FILE,REFRESH_SOURCE_SHA,"qualified_3032_refresh")
    c=load_module(NEW_CONTROLLER_FILE,NEW_CONTROLLER_SHA,"qualified_steam_dns_controller")
    return r,c


def historical_hold(r):
    entered=json.loads(root_bytes(PRIOR_JOURNAL/"entered.json",0o600))
    held=json.loads(root_bytes(PRIOR_JOURNAL/"rollback_hold.json",0o600))
    need(entered.get("status")=="CONSUMED_DO_NOT_REPLAY" and
         entered.get("financial_authorized") is False and
         entered.get("public_cutover_authorized") is False and
         held == {"financial_authorized":False,"isolated_stop_commands_passed":True,
                  "public_cutover_authorized":False,"reason_type":"Hold",
                  "status":"CRITICAL_ROLLBACK_INCOMPLETE"} and
         not (PRIOR_JOURNAL/"complete.json").exists() and
         not (PRIOR_JOURNAL/"rollback.json").exists(),
         "PRIOR_HELD_ROLLBACK_JOURNAL_CHANGED")
    old_plan=entered.get("plan",{})
    need(old_plan.get("old_source")==EXPECTED_OLD_SOURCE and
         old_plan.get("new_source")==EXPECTED_NEW_SOURCE and
         old_plan.get("old_pid")==EXPECTED_OLD_PID and
         old_plan.get("old_ticks")==EXPECTED_OLD_TICKS and
         old_plan.get("protected_snapshot_sha256") and
         old_plan.get("stage_receipt_sha256")==r.STAGE_RECEIPT_SHA and
         old_plan.get("new_unit_sha256"),"PRIOR_HELD_PLAN_CHANGED")
    return entered,held


def prepare(args,r,c):
    need(os.geteuid()==0 and socket.gethostname().split(".")[0]==HOST,"EXACT_ROOT_HOST_REQUIRED")
    need(sha(root_bytes(ROOT_SOURCE_FILE,0o600))==args.source_hash,
         "ROOT_RECOVERY_SOURCE_HASH_CHANGED")
    unit=root_bytes(r.UNIT,0o644)
    policy_raw=root_bytes(r.POLICY,0o400)
    installed_controller=root_bytes(r.CONTROLLER,0o644)
    guard=root_bytes(r.GUARD,0o644)
    need((sha(unit),sha(policy_raw),sha(installed_controller),sha(guard))==
         (OLD_UNIT_SHA,OLD_POLICY_SHA,OLD_CONTROLLER_SHA,GUARD_SHA),
         "STOPPED_PROFILE_PREIMAGE_CHANGED")
    before=json.loads(policy_raw)
    need(before.get("source_sha")==EXPECTED_OLD_SOURCE and before.get("stage")==r.OLD_STAGE
         and before.get("controller_sha256")==OLD_CONTROLLER_SHA,
         "STOPPED_ISOLATED_POLICY_IDENTITY_CHANGED")
    entered,held=historical_hold(r)
    prior=entered["plan"]
    need(before.get("native_plan_sha256")==entered.get("plan_sha256") and
         before.get("journal_path")==str(PRIOR_JOURNAL/"rollback-requalification"),
         "STOPPED_ROLLBACK_POLICY_DOES_NOT_MATCH_HOLD")
    need(r.UNIT.name=="aoe2hdbets-web-prod.service" and
         c.unit_state(r.UNIT.name)["properties"].get("ActiveState")=="inactive" and
         c.unit_state(r.TIMER)["properties"].get("ActiveState")=="inactive" and
         c.unit_state(r.REFRESH)["properties"].get("ActiveState")=="inactive",
         "ISOLATED_CANDIDATE_NOT_QUIESCENT")
    r.assert_protected(c,prior["protected_snapshot_sha256"])
    artifact,provenance=r.staged_artifact(c)
    need(artifact["source_sha"]==EXPECTED_NEW_SOURCE,"NEW_CANDIDATE_ARTIFACT_CHANGED")
    new_unit=r.render_unit(unit)
    need(new_unit==c.production_unit_bytes(Path(r.NEW_STAGE)) and
         sha(new_unit)==prior["new_unit_sha256"],"SOURCE_BOUND_UNIT_DIFFERS")
    env,db,pw=c.production_runtime_environment()
    catalog=c.production_database_witness(db,pw)
    need(catalog["definer_identity_sha256"]==prior["catalog"]["definer_identity_sha256"]
         and catalog["additional_read_model_sha256"]==
             "688fef44e7d1346199385049d9e2ea0ab1f293466c0bb2e85cf548d7fa438580",
         "V1_TO_V6_NATIVE_CATALOG_CHANGED")
    critical=c.production_critical_runtime(Path(r.NEW_STAGE))
    need(sha(c.canonical(critical))==prior["new_critical_runtime_sha256"],
         "SOURCE_BOUND_CRITICAL_ARTIFACT_CHANGED")
    plan={"schema":"aoe2war.a05.isolated-steam-dns-hold-recovery-plan.v1",
          "scope":RECOVERY_SCOPE,"nonce":args.nonce,
           "source_ref":args.release_ref,"source_hash":args.source_hash,
          "old_source":EXPECTED_OLD_SOURCE,"new_source":EXPECTED_NEW_SOURCE,
          "old_pid":EXPECTED_OLD_PID,"old_ticks":EXPECTED_OLD_TICKS,
          "old_unit_sha256":sha(unit),"new_unit_sha256":sha(new_unit),
          "old_policy_sha256":sha(policy_raw),
          "old_controller_sha256":sha(installed_controller),
          "new_controller_sha256":NEW_CONTROLLER_SHA,
          "prior_entered_sha256":sha(root_bytes(PRIOR_JOURNAL/"entered.json",0o600)),
          "prior_rollback_hold_sha256":sha(root_bytes(PRIOR_JOURNAL/"rollback_hold.json",0o600)),
          "stage_receipt_sha256":r.STAGE_RECEIPT_SHA,
          "runtime_artifact":provenance,"ci_artifact":{"run_id":args.ci_run},
          "catalog":catalog,"protected_snapshot_sha256":prior["protected_snapshot_sha256"],
          "financial_authorized":False,"public_cutover_authorized":False,
          "old_public_service_mutations":False}
    return plan,(unit,policy_raw,installed_controller,new_unit,artifact,critical,env,db,pw,before)


def owner_grant(args,r,c,plan):
    item=c.production_github("contents/"+SOURCE_PATH+"?ref="+args.release_ref)
    need(item.get("type")=="file" and item.get("encoding")=="base64" and
         sha(base64.b64decode(item["content"].replace("\n",""),validate=True))==args.source_hash,
         "GITHUB_RECOVERY_SOURCE_NOT_PINNED")
    candidate=c.production_github("contents/"+CONTROLLER_PATH+"?ref="+args.release_ref)
    need(candidate.get("type")=="file" and candidate.get("encoding")=="base64" and
         sha(base64.b64decode(candidate["content"].replace("\n",""),validate=True))==NEW_CONTROLLER_SHA,
         "GITHUB_DNS_CONTROLLER_SOURCE_NOT_PINNED")
    checks=c.production_github("commits/"+args.release_ref+"/check-runs?filter=latest&per_page=100")
    scan=[v for v in checks["check_runs"]
          if v.get("name")=="GitGuardian Security Checks" and v.get("app",{}).get("slug")=="gitguardian"]
    need(len(scan)==1 and scan[0].get("conclusion")=="success",
         "RECOVERY_SOURCE_SECURITY_NOT_PASS")
    c.PROD_SCOPE=RECOVERY_SCOPE
    payload={"nonce":args.nonce,"source_sha":args.release_ref,
             "owner_comment_id":args.comment_id,"owner_comment_sha256":args.comment_sha256}
    # Bound exact registered CI and one-use owner authorization.
    # CI layout is native source CI, not a new app/WOLO runtime identity.
    return c.production_grant(payload,plan)


def execute(args,r,c,plan,parts):
    need(args.plan_sha256==sha(c.canonical(plan)),"EXACT_PLAN_HASH_REQUIRED")
    grant=owner_grant(args,r,c,plan)
    old_unit,old_policy,old_controller,new_unit,artifact,critical,env,db,pw,before=parts
    r.assert_protected(c,plan["protected_snapshot_sha256"])
    need((root_bytes(r.UNIT),root_bytes(r.POLICY),root_bytes(r.CONTROLLER))==
         (old_unit,old_policy,old_controller),"PREEXECUTION_PROFILE_CHANGED")
    new_raw=root_bytes(NEW_CONTROLLER_FILE,0o600)
    need(sha(new_raw)==NEW_CONTROLLER_SHA,"NEW_CONTROLLER_BYTES_DRIFT")
    journal=RELEASE_ROOT/("steam-dns-recover-3032-"+args.nonce)
    journal.mkdir(mode=0o700)
    r.fsync_dir(RELEASE_ROOT)
    r.seal(journal,"entered.json",{"schema":"aoe2war.a05.recovery-entered.v1",
         "status":"CONSUMED_DO_NOT_REPLAY","plan":plan,
         "plan_sha256":args.plan_sha256,"owner_grant":grant,
         "financial_authorized":False,"public_cutover_authorized":False})
    for name,contents in (("unit.before",old_unit),("policy.before",old_policy),
                          ("controller.before",old_controller)):
        r.seal(journal,name,contents)
    new_profile={**before,"source_sha":EXPECTED_NEW_SOURCE,"stage":r.NEW_STAGE,
       "build_id":r.BUILD_ID,"build_version":r.BUILD_VERSION,
       "artifact":artifact,"ci_artifact":plan["runtime_artifact"],
       "manifest_sha256":artifact["manifest_sha256"],
       "unit_sha256":sha(new_unit),"controller_sha256":NEW_CONTROLLER_SHA,
       "critical_runtime":critical,"native_plan_sha256":args.plan_sha256}
    try:
        r.candidate_systemd("stop",r.TIMER)
        r.candidate_systemd("stop",r.REFRESH)
        r.candidate_systemd("stop",r.UNIT.name)
        r.write_atomic(r.CONTROLLER,new_raw,0o644)
        r.write_atomic(r.UNIT,new_unit,0o644)
        r.candidate_systemd("daemon-reload")
        r.assert_protected(c,plan["protected_snapshot_sha256"])
        new_profile["steam_addresses"]=c.production_admission_steam_refresh()
        r.candidate_systemd("start",r.UNIT.name)
        # Creates a new authentic PID-bound admission; the dead rollback PID
        # is never accepted as the new process, even with an old PASS receipt.
        proof=r.ready_profile(c,new_profile,journal,plan,env,db,pw)
        routes=r.guest_probes()
        r.need(c.production_wait(new_profile,seconds=5)==
               (proof["candidate_pid"],proof["candidate_start_ticks"]),
               "FINAL_CANDIDATE_PROCESS_CHANGED")
        passed=all(v["status"]=="NO_RSC_ERROR" for v in routes.values())
        complete={"schema":"aoe2war.a05.recover-3032-result.v1",
          "status":"PASS_NEW_3032_ADMITTED_NOT_PUBLIC",
          "source_sha":EXPECTED_NEW_SOURCE,"build_version":r.BUILD_VERSION,
          "candidate_pid":proof["candidate_pid"],
          "candidate_start_ticks":proof["candidate_start_ticks"],
          "guest_routes":routes,
          "guest_content_gate":"PASS_NO_RSC_ERRORS" if passed else "HOLD_PUBLIC_CUTOVER",
          "financial_authorized":False,"public_cutover_authorized":False}
        r.seal(journal,"complete.json",complete)
        print(json.dumps({**complete,"journal":str(journal)},sort_keys=True))
    except BaseException as failure:
        stopped=True
        for action,unit in (("stop",r.TIMER),("stop",r.REFRESH),("stop",r.UNIT.name)):
            try:r.candidate_systemd(action,unit)
            except BaseException:stopped=False
        # Do not restart a previously failed rollback identity. Public 3030
        # continues to serve; the isolated candidate remains off on failure.
        try:
            r.write_atomic(r.CONTROLLER,old_controller,0o644)
            r.write_atomic(r.UNIT,old_unit,0o644)
            r.write_atomic(r.POLICY,old_policy,0o400)
            r.candidate_systemd("daemon-reload")
            r.assert_protected(c,plan["protected_snapshot_sha256"])
        except BaseException:stopped=False
        r.seal(journal,"hold.json",{"status":"STOPPED_NO_PUBLIC_CUTOVER",
           "failure_type":type(failure).__name__,"reason":str(failure)[:150],
           "isolated_stop_commands_passed":stopped,
           "financial_authorized":False,"public_cutover_authorized":False})
        raise


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--phase",required=True,choices=("plan","execute"))
    ap.add_argument("--nonce",required=True)
    ap.add_argument("--release-ref",required=True)
    ap.add_argument("--ci-run",type=int,required=True)
    ap.add_argument("--source-hash",required=True)
    ap.add_argument("--plan-sha256")
    ap.add_argument("--comment-id",type=int)
    ap.add_argument("--comment-sha256")
    args=ap.parse_args()
    need(NONCE_PATTERN.fullmatch(args.nonce) and SOURCE_REF_PATTERN.fullmatch(args.release_ref)
         and HASH_PATTERN.fullmatch(args.source_hash) and args.ci_run>0,"INVALID_TRANSACTION_INPUT")
    r,c=modules()
    lock=r.LOCK.lstat()
    need(stat.S_ISREG(lock.st_mode) and (lock.st_dev,lock.st_ino,lock.st_uid,stat.S_IMODE(lock.st_mode))==r.LOCK_ID,
         "RELEASE_LOCK_IDENTITY_CHANGED")
    fd=os.open(r.LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        need(not (RELEASE_ROOT/("steam-dns-recover-3032-"+args.nonce)).exists(),"RECOVERY_NONCE_ALREADY_USED")
        plan,parts=prepare(args,r,c)
        if args.phase=="plan":
            need(not args.plan_sha256 and not args.comment_id and not args.comment_sha256,
                 "READONLY_PLAN_HAS_AUTH_FIELDS")
            print(json.dumps({"status":"PASS_READONLY_RECOVERY_PLAN_NOT_AUTHORITY",
                 "plan_sha256":sha(c.canonical(plan)),"plan":plan},sort_keys=True))
        else:
            need(HASH_PATTERN.fullmatch(args.plan_sha256 or "") and
                 args.comment_id and HASH_PATTERN.fullmatch(args.comment_sha256 or ""),
                 "RECOVERY_OWNER_GRANT_REQUIRED")
            execute(args,r,c,plan,parts)
    finally:os.close(fd)


if __name__=="__main__":
    try:main()
    except (Hold,OSError,ValueError,KeyError,subprocess.SubprocessError,RuntimeError) as e:
        print("HOLD:"+str(e)[:200],file=sys.stderr)
        raise SystemExit(2)
