#!/usr/bin/env python3
"""R24 C reviewed website-only HEL1 cutover/rollback worker.

SOURCE-ONLY PROPOSAL: Not executable without separate root-owned F integration
approval carrying B/D/E policy and G verification identities. Runs in root
memory over authenticated owner root SSH, not from a tony-writable path.
Never changes original RSA trust, helper installation, SSH, Wolo or finance.
"""
import argparse
import hashlib
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
import fcntl

HOST="ubuntu-4gb-hel1-11"
CANDIDATE="0cee3c836c4b0760478280c145e02e81e470ce0e"
REPO=Path("/var/www/AoE2HDBets/app-prodn")
SERVICE="aoe2hdbets-web.service"
LOCK=Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
LOCK_ID=(2064,6185747,1000,0o644)
APPROVAL=Path("/etc/aoe2war/r24-web-only/approved.json")
RECEIPTS=Path("/var/lib/aoe2war-r24-web-only")
ROOT_SSH_USER="root"
HEX40=re.compile(r"^[0-9a-f]{40}$")
HEX64=re.compile(r"^[0-9a-f]{64}$")
UNIT=re.compile(r"^[a-zA-Z0-9@_.-]+\.(?:service|timer|socket)$")

class Hold(Exception): pass
def need(ok,msg):
    if not ok: raise Hold(msg)
def run(args,timeout=30,check=True):
    p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout)
    if check: need(p.returncode==0,"COMMAND_FAILED:"+str(args[0])+":"+str(p.returncode))
    return p.stdout.decode("utf-8","replace").strip()
def tonyrun(args,timeout=30):
    return run(["/usr/sbin/runuser","-u","tony","--",*map(str,args)],timeout=timeout)
def canonical(o): return json.dumps(o,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def json_read(p):
    return json.loads(p.read_bytes())
def protected_file(p):
    need(p.is_absolute(),"APPROVAL_PATH_NOT_ABSOLUTE")
    for v in (p,*p.parents):
        s=v.lstat()
        need(s.st_uid==0 and not stat.S_ISLNK(s.st_mode) and not s.st_mode&0o022,"UNPROTECTED_REVIEW_APPROVAL")
    need(stat.S_ISREG(p.lstat().st_mode) and p.stat().st_size<=65536,"APPROVAL_NOT_REGULAR")
    need(stat.S_IMODE(p.parent.stat().st_mode)==0o700,"APPROVAL_PARENT_NOT_PRIVATE")
    return json_read(p)
def original_lock():
    s=LOCK.lstat()
    need(stat.S_ISREG(s.st_mode) and
         (s.st_dev,s.st_ino,s.st_uid,stat.S_IMODE(s.st_mode))==LOCK_ID,
         "ORIGINAL_RELEASE_LOCK_DRIFT")
    return s
def verify_review(approval):
    need(type(approval)==dict and set(approval)=={
       "schema","candidate_sha","previous_sha","candidate_build_id","candidate_build_version",
       "stage_artifact_sha256","stage_dependencies_sha256",
       "min_free_bytes","financial_units","financial_unit_records_sha256",
       "reviews","policy_scope","rollback_verified","stage_receipt_sha256"
    },"EXACT_F_APPROVAL_SCHEMA_REQUIRED")
    need(approval["schema"]=="aoe2war.r24.web-only.approved.v1"
         and approval["candidate_sha"]==CANDIDATE
         and approval["policy_scope"]=="NONFINANCIAL_WEB_ONLY_NO_MIGRATIONS_NO_PRODUCERS"
         and approval["rollback_verified"] is True,"WRONG_OR_UNAUTHORIZED_POLICY")
    need(isinstance(approval["previous_sha"],str) and
         HEX40.fullmatch(approval["previous_sha"]) and
         approval["previous_sha"]!=CANDIDATE,"PREVIOUS_SOURCE_REQUIRED")
    for key in ("stage_artifact_sha256","stage_dependencies_sha256",
                "financial_unit_records_sha256","stage_receipt_sha256"):
        need(isinstance(approval[key],str) and HEX64.fullmatch(approval[key]),
             "EXACT_REVIEWED_HASH_MISSING:"+key)
    need(type(approval["candidate_build_id"])==str and 5<=len(approval["candidate_build_id"])<=128
         and re.fullmatch(r"[A-Za-z0-9_-]+",approval["candidate_build_id"]),
         "BUILD_ID_NOT_PINNED")
    need(type(approval["candidate_build_version"])==str and
         3<=len(approval["candidate_build_version"])<=256,
         "BUILD_VERSION_NOT_PINNED")
    need(type(approval["min_free_bytes"])==int and approval["min_free_bytes"]>=0,
         "E_MIN_FREE_NOT_APPROVED")
    need(type(approval["reviews"])==dict and set(approval["reviews"])==set("BCDEFG"),
         "SIX_LANE_REVIEWS_NOT_SUPPLIED")
    for lane,sha in approval["reviews"].items():
        need(type(sha)==str and HEX40.fullmatch(sha),
             "REVIEW_COMMIT_SHA_INVALID:"+lane)
    units=approval["financial_units"]
    need(type(units)==list and len(units)>=25 and len(units)==len(set(units))
         and all(type(x)==str and UNIT.fullmatch(x) for x in units),
         "B_FINANCIAL_UNIT_BOUNDARY_INCOMPLETE")
def capture_units(units):
    properties=["Id","ActiveState","SubState","MainPID","ExecMainStartTimestampMonotonic",
                "User","FragmentPath","DropInPaths","ExecStart"]
    state={}
    for unit in units:
        r=run(["/usr/bin/systemctl","show",unit,*["-p"+x for x in properties]])
        vals={}
        for line in r.splitlines():
            if "=" in line:
                key,value=line.split("=",1);vals[key]=value
        need(vals.get("Id")==unit and vals.get("ActiveState") not in (None,"not-found"),
             "FINANCIAL_UNIT_MISSING:"+unit)
        state[unit]=vals
    return state
def socket_state():
    # Preserve exact observed socket rows incl PID/program/inode hints.
    # G/B must independently bind process identity, not just port counts.
    text=run(["/usr/bin/ss","-H","-ltnpe"],timeout=15)
    for port in ("8092","8093"):
        rows=[line for line in text.splitlines() if re.search(r":"+port+r"\s",line)]
        need(len(rows)==1,"PROTECTED_WOLO_LISTENER_NOT_UNIQUE:"+port)
        yield port,rows[0]
def hash_tree(directory):
    # Matches canonical stage.py deterministic GNU-tar identity over directory bytes.
    tar=subprocess.Popen(["/usr/bin/tar","--sort=name","--mtime=UTC 1970-01-01",
                          "--owner=0","--group=0","--numeric-owner","-C",str(directory),
                          "-cf","-","."],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    h=hashlib.sha256()
    while True:
        b=tar.stdout.read(1024*1024)
        if not b: break
        h.update(b)
    tail=tar.stderr.read()
    need(tar.wait(timeout=180)==0,"STAGE_HASH_FAILED:"+tail.decode(errors="replace")[-120:])
    return h.hexdigest()
def check_dir(p):
    s=p.lstat()
    need(stat.S_ISDIR(s.st_mode) and not stat.S_ISLNK(s.st_mode) and s.st_uid==1000,
         "STAGED_ARTIFACT_NOT_TONY_DIR:"+p.name)
def check_stage(a):
    check_dir(REPO/".next-release")
    check_dir(REPO/".node_modules-release")
    need(not (REPO/".next-release/cache").exists(),"STAGED_ARTIFACT_HAS_CACHE")
    need((REPO/".next-release/BUILD_ID").read_text().strip()==a["candidate_build_id"],
         "STAGED_BUILD_ID_CHANGED")
    stage_version=REPO/".aoe2war-build-version-release"
    need(stage_version.is_file() and not stage_version.is_symlink()
         and stage_version.read_text().strip()==a["candidate_build_version"],
         "CANDIDATE_VERSION_NOT_PINNED")
    need(hash_tree(REPO/".next-release")==a["stage_artifact_sha256"],
         "STAGED_ARTIFACT_DIGEST_MISMATCH")
    need(hash_tree(REPO/".node_modules-release")==a["stage_dependencies_sha256"],
         "STAGED_DEPENDENCIES_DIGEST_MISMATCH")
def live_response():
    req=urllib.request.Request("http://127.0.0.1:3030/api/deployment-version",
                               headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=6) as response:
        need(response.status==200,"INTERNAL_HTTP_NOT_200")
        obj=json.loads(response.read(8192))
    need(type(obj)==dict and type(obj.get("buildVersion"))==str,"INTERNAL_VERSION_INVALID")
    return obj["buildVersion"]
def public_response():
    req=urllib.request.Request("https://aoe2war.com/api/deployment-version",
                               headers={"Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=9) as response:
        need(response.status==200,"PUBLIC_HTTP_NOT_200")
        obj=json.loads(response.read(8192))
    need(type(obj)==dict and type(obj.get("buildVersion"))==str,"PUBLIC_VERSION_INVALID")
    return obj["buildVersion"]
def service_state():
    return (run(["/usr/bin/systemctl","is-active",SERVICE]),
            run(["/usr/bin/systemctl","show",SERVICE,"--property=MainPID"]).partition("=")[2])
def run_as_tony_git(*args):
    return tonyrun(["/usr/bin/git","-C",str(REPO),*args],timeout=120)
def git_state(previous):
    need(run_as_tony_git("rev-parse","HEAD")==previous,"LIVE_SOURCE_DRIFT")
    need(not run_as_tony_git("status","--porcelain","--untracked-files=no"),
         "TRACKED_PRODUCTION_SOURCE_DIRTY")
    need(run_as_tony_git("cat-file","-t",CANDIDATE)=="commit",
         "EXACT_CANDIDATE_COMMIT_NOT_PRESENT")
def free_space(min_bytes):
    need(os.statvfs(REPO).f_bavail*os.statvfs(REPO).f_frsize>=min_bytes,
         "E_ROOT_HEADROOM_INSUFFICIENT")
    need(os.statvfs(RECEIPTS).f_bavail*os.statvfs(RECEIPTS).f_frsize>=min_bytes,
         "E_RECEIPTS_HEADROOM_INSUFFICIENT")
def preflight(a):
    need(sys.platform=="linux" and socket.gethostname()==HOST and os.geteuid()==0,
         "EXACT_HEL1_ROOT_REQUIRED")
    original_lock()
    need(REPO.is_dir() and RECEIPTS.is_dir() and not RECEIPTS.is_symlink()
         and RECEIPTS.stat().st_uid==0
         and stat.S_IMODE(RECEIPTS.stat().st_mode)==0o700,
         "ROOT_PROTECTED_R24_RECEIPTS_DIR_NOT_PROVISIONED")
    git_state(a["previous_sha"])
    need(service_state()[0]=="active","LIVE_WEB_NOT_ACTIVE")
    need((REPO/".next/BUILD_ID").is_file() and (REPO/"node_modules").is_dir(),
         "EXISTING_ROLLBACK_RUNTIME_MISSING")
    need((REPO/".aoe2war-build-version").is_file(),"OLD_VERSION_SIDECAR_MISSING")
    need(live_response()==(REPO/".aoe2war-build-version").read_text().strip(),
         "OLD_INTERNAL_VERSION_MISMATCH")
    free_space(a["min_free_bytes"])
    stage_receipt=REPO/".aoe2war-release"/"stage-receipts"/"r24-web-only-stage.json"
    need(stage_receipt.is_file() and not stage_receipt.is_symlink() and
         hashlib.sha256(stage_receipt.read_bytes()).hexdigest()==a["stage_receipt_sha256"],
         "F_STAGE_RECEIPT_MISSING_OR_UNPINNED")
    check_stage(a)
    return capture_units(a["financial_units"]),dict(socket_state())
def write_receipt(path,obj):
    raw=canonical(obj)+b"\n"
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:
        f.write(raw);f.flush();os.fsync(f.fileno())
def compare_protected(pre,post):
    need(pre==post,"FINANCIAL_OR_WOLO_PROCESS_IDENTITY_CHANGED")
def confirm_web_version(target):
    for _ in range(12):
        try:
            if service_state()[0]=="active" and live_response()==target and public_response()==target:
                return
        except Exception:
            pass
        time.sleep(5)
    raise Hold("NEW_WEB_INTERNAL_OR_PUBLIC_BUILD_VERSION_UNVERIFIED")
def move(a,b):
    need(not b.exists() and not b.is_symlink(),"ROLLBACK_DESTINATION_ALREADY_EXISTS")
    os.rename(a,b)
def cutover(a):
    pre_units,pre_socket=preflight(a)
    need(hashlib.sha256(canonical(pre_units)).hexdigest()==a["financial_unit_records_sha256"],
         "B_FINANCIAL_UNIT_PREIMAGE_NOT_APPROVED")
    nonce=hashlib.sha256((CANDIDATE+a["previous_sha"]+a["candidate_build_id"]).encode()).hexdigest()[:20]
    folder=RECEIPTS/("r24-web-"+nonce)
    need(not folder.exists() and not folder.is_symlink(),"EARLIER_OR_PARTIAL_TRANSACTION_HOLD")
    old_build=(REPO/".next/BUILD_ID").read_text().strip()
    old_version=(REPO/".aoe2war-build-version").read_bytes()
    backup_next=REPO/(".next-r24-before-"+nonce)
    backup_modules=REPO/(".node_modules-r24-before-"+nonce)
    backup_version=REPO/(".buildversion-r24-before-"+nonce)
    for p in (backup_next,backup_modules,backup_version): need(not p.exists(),"ROLLBACK_SLOT_CONFLICT")
    os.mkdir(folder,0o700)
    write_receipt(folder/"before.json",{"candidate":CANDIDATE,
        "previous":a["previous_sha"],"previous_build_id":old_build,
        "previous_build_version":old_version.decode(errors="replace").strip(),
        "financial_sha256":hashlib.sha256(canonical(pre_units)).hexdigest(),
        "wolo_listeners":pre_socket,"scope":"WEB_ONLY","status":"PREPARED"})
    # Old service remains running until ALL guards and durable before-receipt pass.
    original_lock()
    fd=os.open(LOCK,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    changes=[]
    try:
        s=os.fstat(fd)
        need((s.st_dev,s.st_ino,s.st_uid,stat.S_IMODE(s.st_mode))==LOCK_ID,
             "LOCK_FD_CHANGED")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        need(capture_units(a["financial_units"])==pre_units and dict(socket_state())==pre_socket,
             "PROTECTED_BOUNDARY_CHANGED_BEFORE_CUTOVER")
        # Wolo and all finance producers remain outside this transaction.
        run(["/usr/bin/systemctl","stop",SERVICE],timeout=35);changes.append("stopped")
        move(REPO/".next",backup_next);changes.append("old_next")
        move(REPO/"node_modules",backup_modules);changes.append("old_modules")
        move(REPO/".aoe2war-build-version",backup_version);changes.append("old_version")
        move(REPO/".next-release",REPO/".next");changes.append("new_next")
        move(REPO/".node_modules-release",REPO/"node_modules");changes.append("new_modules")
        move(REPO/".aoe2war-build-version-release",REPO/".aoe2war-build-version");changes.append("new_version")
        run_as_tony_git("switch","--detach",CANDIDATE);changes.append("source")
        need(run_as_tony_git("rev-parse","HEAD")==CANDIDATE,"CANDIDATE_GIT_SWITCH_FAILED")
        run(["/usr/bin/systemctl","start",SERVICE],timeout=45)
        confirm_web_version(a["candidate_build_version"])
        compare_protected((pre_units,pre_socket),
                          (capture_units(a["financial_units"]),dict(socket_state())))
        need((REPO/".next/BUILD_ID").read_text().strip()==a["candidate_build_id"],
             "LIVE_NEXT_BUILD_ID_DRIFT")
        write_receipt(folder/"commit.json",{"status":"LIVE_WEB_ONLY","candidate":CANDIDATE,
            "build_id":a["candidate_build_id"],"previous":a["previous_sha"],
            "rollback_next":str(backup_next),"rollback_modules":str(backup_modules),
            "rollback_version":str(backup_version),"financial_unchanged":True})
        print("PASS:R24_WEB_ONLY_LIVE_EXACT_SOURCE_AND_BUILD_ID; ROLLBACK_RETAINED",flush=True)
    except BaseException as original_error:
        if changes:
            print("HOLD:R24_CUTOVER_FAILED_ROLLBACK_BEGIN:"+type(original_error).__name__,file=sys.stderr)
            try:
                run(["/usr/bin/systemctl","stop",SERVICE],timeout=35,check=False)
                # Preserve failed new runtime under unique, non-clobbering forensic paths.
                for live,old in [(REPO/".next",backup_next),
                                 (REPO/"node_modules",backup_modules),
                                 (REPO/".aoe2war-build-version",backup_version)]:
                    if old.exists():
                        failed=live.with_name(live.name+"-r24-failed-"+nonce)
                        if live.exists():move(live,failed)
                        os.rename(old,live)
                if run_as_tony_git("rev-parse","HEAD")!=a["previous_sha"]:
                    run_as_tony_git("switch","--detach",a["previous_sha"])
                run(["/usr/bin/systemctl","start",SERVICE],timeout=45)
                confirm_web_version(old_version.decode().strip())
                compare_protected((pre_units,pre_socket),
                                  (capture_units(a["financial_units"]),dict(socket_state())))
                write_receipt(folder/"rollback.json",{"status":"RESTORED_PREVIOUS_WEB",
                    "source":a["previous_sha"],"build_id":old_build,"financial_unchanged":True})
                print("PASS:R24_AUTOMATIC_ROLLBACK_VERIFIED",flush=True)
            except BaseException as rollback_error:
                print("CRITICAL:R24_ROLLBACK_UNCERTAIN_MANUAL_RECOVERY_REQUIRED:"
                      +type(rollback_error).__name__,file=sys.stderr)
        raise
    finally:
        os.close(fd)
def main():
    p=argparse.ArgumentParser()
    p.add_argument("--apply",action="store_true")
    p.add_argument("--owner-build-id",default="")
    args=p.parse_args()
    need(args.apply,"MUTATION_REQUIRES_EXPLICIT_APPLY")
    a=protected_file(APPROVAL)
    verify_review(a)
    need(args.owner_build_id==a["candidate_build_id"],"OWNER_BUILD_ID_NOT_APPROVED")
    cutover(a)
if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("HOLD:R24_WEB_ONLY:"+type(exc).__name__+":"+str(exc)[:240],file=sys.stderr)
        sys.exit(2)
