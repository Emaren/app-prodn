#!/usr/bin/env python3
"""A05: one-use, source-bound recovery of *stopped* nonfinancial 3032.

Does not touch public Nginx, old 3030, preview 3031, financial grants, or Wolo.
Replaces only the candidate C controller, candidate systemd unit, and the
candidate profile, then independently *regenerates* full native C admission
for the new process identity. On failure restores all three preimages.
"""
from __future__ import annotations
import argparse
import base64
from datetime import datetime, timedelta, timezone
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
import urllib.error
import urllib.request

ROOT=Path("/var/lib/aoe2war-app-production-v1")
JOURNALS=ROOT/"heap-recoveries"
OLD_CONTROLLER=Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
DROPIN=Path("/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf")
DROPIN_SHA="110c654076671e47a89365efcc1764c837db81fcd136599f880c5ec0d3a031ea"
POLICY=Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
NGINX=Path("/etc/nginx/sites-available/aoe2war.com")
REVIEWED=Path("/root/a05-heap-reviewed-controller.py")
SOURCE_SHA="25927cc4f47f49b84e5ae84153a1a3044347a41188df5cebfef7a6dae6dc3ce6"
OLD_CONTROLLER_SHA="9dfa2e68999948c997238196d37737b93e7ca06eb3dbafd1ea29085cc73076f2"
OLD_UNIT_SHA="121f76699b1ceeda728b0e69fd1c2602a60ac1f4bb4f6fc979598d6bb74fa1bc"
OLD_POLICY_SHA="1542c563b77c657fbcdda6b6c5bb20d2049f44ce9555fe26a41e90f1bc3b962d"
PUBLIC_SHA="d8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8"
ARTIFACT="5869b4ab08702be4b33860f7dda7d97b5de79424"
VALID_SHA=re.compile(r"[0-9a-f]{64}\Z")
VALID_NONCE=re.compile(r"[0-9a-f]{32}\Z")

class Hold(RuntimeError):pass
def need(ok,msg):
    if not ok:raise Hold(msg)
def sha(raw):return hashlib.sha256(raw).hexdigest()
def canon(obj):return json.dumps(obj,sort_keys=True,separators=(",",":"),allow_nan=False).encode()
def read(path,mode=None):
    st=path.lstat()
    need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and not path.is_symlink()
         and not st.st_mode & 0o022,"ROOT_SEALED_SOURCE_REQUIRED:"+str(path))
    if mode is not None:need(stat.S_IMODE(st.st_mode)==mode,"EXPECTED_MODE:"+str(path))
    return path.read_bytes()
def native(command,timeout=80):
    p=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=timeout,check=False)
    need(p.returncode==0,"NATIVE_FAILED:"+command[0]+":"+p.stderr[-450:].decode(errors="replace"))
    return p.stdout
def module(source,name):
    result=type(sys)(name);result.__file__=name
    exec(compile(source,name,"exec"),result.__dict__)
    return result
def sealed(path,obj):
    raw=canon(obj)+b"\n"
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
    return sha(raw)
def atomic(path,raw,mode):
    temp=path.with_name(path.name+".heap-recovery-"+os.urandom(8).hex())
    fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    try:
        with os.fdopen(fd,"wb") as f:f.write(raw);f.flush();os.fsync(f.fileno())
        os.chmod(temp,mode)
        os.replace(temp,path)
        d=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
        try:os.fsync(d)
        finally:os.close(d)
    finally:
        if temp.exists():temp.unlink()
def exact_line(raw,old,new):
    need(raw.count(old)==1,"UNIT_PREIMAGE_NOT_UNIQUE:"+old.decode()[:45])
    return raw.replace(old,new,1)
def compute(args):
    need(os.geteuid()==0,"ROOT_REQUIRED")
    need(VALID_NONCE.fullmatch(args.nonce or ""),"NONCE_REQUIRED")
    need(re.fullmatch(r"[0-9a-f]{40}",args.source_head or ""),"IMMUTABLE_SOURCE_HEAD_REQUIRED")
    old_ctrl=read(OLD_CONTROLLER,0o644)
    old_unit=read(UNIT,0o644)
    old_policy=read(POLICY,0o400)
    old_dropin=read(DROPIN,0o644)
    need(sha(old_dropin)==DROPIN_SHA,"EXACT_EFFECTIVE_MEMORY_DROPIN_PREIMAGE")
    loaded=native(["/usr/bin/systemctl","show","aoe2hdbets-web-prod.service",
                   "-p","DropInPaths","-p","MemoryMax","-p","MemoryHigh"],timeout=15).decode()
    need("DropInPaths="+str(DROPIN)+"\n" in loaded and "MemoryMax=2516582400\n" in loaded
         and "MemoryHigh=infinity\n" in loaded,"EFFECTIVE_CGROUP_MEMORY_PREIMAGE_CHANGED")
    reviewed=read(REVIEWED,0o600)
    need(sha(old_ctrl)==OLD_CONTROLLER_SHA and sha(old_unit)==OLD_UNIT_SHA
         and sha(old_policy)==OLD_POLICY_SHA,"EXACT_FAILED_SOURCE_UNIT_POLICY_PREIMAGE")
    need(sha(reviewed)==SOURCE_SHA,"QUALIFIED_HEAP_CONTROLLER_MISMATCH")
    policy=json.loads(old_policy)
    need(policy["source_sha"]==ARTIFACT and policy["controller_sha256"]==OLD_CONTROLLER_SHA
         and policy["unit_sha256"]==OLD_UNIT_SHA and policy["unit"]=="aoe2hdbets-web-prod.service"
         and policy["port"]==3032 and policy["profile"]=="nonfinancial-production-v1"
         and policy["schema"]=="aoe2war.app.approved-production-profile.v1","SOURCE_BOUND_PROFILE_REQUIRED")
    need(sha(read(NGINX,0o644))==PUBLIC_SHA,"OLD_PUBLIC_NOT_RESTORED")
    state=native(["/usr/bin/systemctl","show",policy["unit"],"-p","ActiveState","-p","MainPID"],timeout=15).decode()
    need("MainPID=0\n" in state and ("ActiveState=failed\n" in state or "ActiveState=inactive\n" in state),
         "CANDIDATE_MUST_BE_STOPPED")
    old=module(old_ctrl,"old_c_heap")
    new=module(reviewed,"reviewed_c_heap")
    protected=old.production_protected()
    need(sha(canon(protected))==policy["protected_snapshot_sha256"],"PROTECTED_SERVICES_CHANGED")
    stage=Path(policy["stage"])
    need(stage==Path("/var/lib/aoe2war-web-prod-"+ARTIFACT[:12]),"STAGED_SOURCE_MISMATCH")
    unit=new.production_unit_bytes(stage)
    # A complete, reproducible unit rewrite. No unexpected permission/network
    # or environment change is allowed.
    expected=old_unit
    expected=exact_line(expected,b"After=network.target postgresql.service\n",
        b"After=network.target postgresql.service\nStartLimitIntervalSec=300\nStartLimitBurst=3\n")
    expected=exact_line(expected,
        b"ExecStart=/usr/bin/node ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n",
        b"ExecStart=/usr/bin/node --max-old-space-size=2048 ./node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3032\n")
    expected=exact_line(expected,b"Restart=no\n",b"Restart=on-failure\nRestartSec=8s\n")
    expected=exact_line(expected,b"MemoryMax=1500M\n",b"MemoryHigh=2700M\nMemoryMax=3200M\n")
    need(expected==unit,"CONTROLLER_UNIT_DIFF_EXCEEDS_HEAP_ONLY")
    altered=dict(policy,unit_sha256=sha(unit),controller_sha256=SOURCE_SHA)
    plan={"schema":"aoe2war.a05.heap-recovery-plan.v1","scope":"STOPPED_3032_ONLY",
          "nonce":args.nonce,"source_sha":args.source_head,"artifact_source_sha":ARTIFACT,
          "old_controller_sha256":OLD_CONTROLLER_SHA,"new_controller_sha256":SOURCE_SHA,
          "old_unit_sha256":OLD_UNIT_SHA,"new_unit_sha256":sha(unit),
          "old_memory_dropin_sha256":DROPIN_SHA,
          "old_memory_max_bytes":2516582400,"new_memory_max_bytes":3355443200,
          "old_profile_sha256":OLD_POLICY_SHA,
          "new_profile_pre_admission_sha256":sha(canon(altered)+b"\n"),
          "protected_snapshot_sha256":policy["protected_snapshot_sha256"],
          "public_nginx_sha256":PUBLIC_SHA,"original_pid":2625090,"preview_pid":1483304,
          "financial_authorized":False,"public_cutover_authorized":False}
    return plan,{"old_ctrl":old_ctrl,"old_unit":old_unit,"old_policy":old_policy,"old_dropin":old_dropin,"new_ctrl":reviewed,
                 "new_unit":unit,"new_policy":altered,"old":old,"new":new}
def owner_grant(args,plan):
    need(args.grant_id and args.grant_sha and VALID_SHA.fullmatch(args.grant_sha),"OWNER_GRANT_REQUIRED")
    new=module(read(REVIEWED,0o600),"a05_new_grant")
    obj=new.production_github("issues/comments/"+str(int(args.grant_id)))
    need(obj.get("id")==int(args.grant_id) and obj.get("user",{}).get("login")=="Emaren"
         and obj.get("user",{}).get("id")==15059910
         and obj.get("issue_url")=="https://api.github.com/repos/Emaren/app-prodn/issues/1108"
         and obj.get("created_at")==obj.get("updated_at"),"GRANT_OWNER_OR_MUTATION_MISMATCH")
    body=obj.get("body","")
    need(sha(body.encode())==args.grant_sha and body.startswith("APP_A05_HEAP_RECOVERY_GRANT\n"),"GRANT_BODY_SHA")
    wrapper=re.fullmatch(r"APP_A05_HEAP_RECOVERY_GRANT\n```json\n(.+)\n```\n?",body,re.S)
    need(wrapper is not None,"GRANT_WRAPPER")
    grant=json.loads(wrapper[1])
    need(grant.get("schema")=="aoe2war.a05.heap-owner-grant.v1" and grant.get("scope")==plan["scope"]
         and grant.get("nonce")==args.nonce and grant.get("plan_sha256")==sha(canon(plan))
         and grant.get("source_sha")==args.source_head and grant.get("controller_sha256")==SOURCE_SHA
         and grant.get("helper_sha256")==sha(read(Path(__file__),0o600))
         and grant.get("owner_login")=="Emaren" and grant.get("owner_delegated_decisions") is True
         and grant.get("independent_review") is False and grant.get("financial_authorized") is False
         and grant.get("public_cutover_authorized") is False and grant.get("decision")=="AUTHORIZE"
         and grant.get("max_uses")==1,"GRANT_SCOPE_CHANGED")
    def timestamp(value):return datetime.fromisoformat(value.replace("Z","+00:00"))
    now=datetime.now(timezone.utc)
    issued,expires,created=map(timestamp,(grant["issued_at"],grant["expires_at"],obj["created_at"]))
    need(issued<=created<=now<=expires and (expires-issued).total_seconds()<=600,
         "AUTHORITY_EXPIRED")
    run=new.production_github("actions/runs/"+str(grant["ci_run_id"]))
    need(run.get("status")=="completed" and run.get("conclusion")=="success"
         and run.get("head_sha")==args.source_head,"EXACT_HEAD_CI_REQUIRED")
    jobs=new.production_github("actions/runs/"+str(grant["ci_run_id"])+"/jobs?filter=latest&per_page=100")
    required={"Release and documentation control plane","Type, contract, and production build","Isolated Steam-rating PostgreSQL chronology"}
    need(len(jobs.get("jobs",[]))==3 and {job.get("name") for job in jobs["jobs"]}==required
         and all(j.get("conclusion")=="success" for j in jobs["jobs"]),
         "THREE_GREEN_JOBS_REQUIRED")
    for name,raw in (("r25_c_start_root.py",read(REVIEWED,0o600)),
                     ("r25_a05_heap_recovery.py",read(Path(__file__),0o600))):
        remote=new.production_github("contents/scripts/"+name+"?ref="+args.source_head)
        need(remote.get("type")=="file" and remote.get("encoding")=="base64"
             and base64.b64decode(remote["content"].replace("\n",""),validate=True)==raw,
             "CI_SOURCE_FILE_NOT_IDENTICAL:"+name)
    checks=new.production_github("commits/"+args.source_head+"/check-runs?filter=latest&per_page=100")
    security=[x for x in checks.get("check_runs",[]) if x.get("name")=="GitGuardian Security Checks"
              and x.get("app",{}).get("slug")=="gitguardian"]
    need(len(security)==1 and security[0].get("conclusion")=="success","GITGUARDIAN_REQUIRED")
    return grant
def apply(args,plan,data):
    owner_grant(args,plan)
    JOURNALS.mkdir(mode=0o700,exist_ok=True)
    journal=JOURNALS/args.nonce
    journal.mkdir(mode=0o700)
    sealed(journal/"entered.json",{"status":"CONSUMED_NO_REPLAY","plan":plan,"grant_id":int(args.grant_id)})
    for name,item in (("controller",data["old_ctrl"]),("unit",data["old_unit"]),("policy",data["old_policy"]),("memory-dropin",data["old_dropin"])):
        fd=os.open(journal/("before-"+name),os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as f:f.write(item);f.flush();os.fsync(f.fileno())
    touched=False
    try:
        touched=True
        atomic(OLD_CONTROLLER,data["new_ctrl"],0o644)
        atomic(UNIT,data["new_unit"],0o644)
        native(["/usr/bin/systemctl","daemon-reload"],timeout=45)
        native(["/usr/bin/systemctl","set-property","aoe2hdbets-web-prod.service","MemoryMax=3200M"],timeout=35)
        loaded=native(["/usr/bin/systemctl","show","aoe2hdbets-web-prod.service",
                       "-p","MemoryMax","-p","MemoryHigh","-p","Restart"],timeout=15).decode()
        need("MemoryMax=3355443200\n" in loaded and "MemoryHigh=2831155200\n" in loaded
             and "Restart=on-failure\n" in loaded,"EFFECTIVE_NODE_HEAP_CGROUP_RESTART_NOT_APPLIED")
        native(["/usr/bin/systemctl","reset-failed","aoe2hdbets-web-prod.service"],timeout=25)
        native(["/usr/bin/systemctl","start","aoe2hdbets-web-prod.service"],timeout=95)
        new=data["new"]
        policy=data["new_policy"]
        pid,ticks=new.production_wait(policy,seconds=50)
        env,database,password=new.production_runtime_environment()
        refreshed=new.production_admission_steam_refresh()
        admission={"schema":"aoe2war.app.production-admission.v1",
                   "status":"NATIVE_PRODUCTION_ADMISSION_PASS","source_sha":ARTIFACT,
                   "candidate_pid":pid,"candidate_start_ticks":ticks,
                   "postgres":new.production_database_admission(database,password),
                   "users_identity_sequence_may_advance":True,
                   "catalog":new.production_database_witness(database,password),
                   "kernel":new.production_kernel_probe(refreshed),
                   "steam":new.production_steam_probe(env,Path(policy["stage"])),
                   "financial_authorized":False,"public_cutover_authorized":False}
        request=urllib.request.Request("http://127.0.0.1:3331/api/health",method="POST",data=b"")
        try:
            urllib.request.urlopen(request,timeout=3)
            raise Hold("PRIVATE_PROXY_MUTATION_ACCEPTED")
        except urllib.error.HTTPError as response:need(response.code==405,"PRIVATE_PROXY_POST_NOT_DENIED")
        admission["private_proxy_post_denied"]=True
        admission_sha=sealed(journal/"runtime-admission.json",admission)
        policy.update(steam_addresses=refreshed,journal_path=str(journal),admission_sha256=admission_sha)
        atomic(POLICY,canon(policy)+b"\n",0o400)
        witness=new.production_witness({"profile_path":str(POLICY)})
        need(witness["candidate_pid"]==pid and witness["status"]=="NATIVE_PRODUCTION_PROFILE_PASS"
             and witness["financial_authorized"] is False
             and sha(read(NGINX,0o644))==PUBLIC_SHA
             and sha(canon(new.production_protected()))==plan["protected_snapshot_sha256"],
             "AFTER_NATIVE_PROFILE_OR_PUBLIC_DRIFT")
        sealed(journal/"complete.json",{"status":"PASS_ISOLATED_3032_RECOVERED_NOT_PUBLIC",
            "candidate_pid":pid,"candidate_start_ticks":ticks,"admission_sha256":admission_sha,
            "profile_sha256":sha(read(POLICY,0o400)),"native_witness":witness,
            "financial_authorized":False,"public_cutover_authorized":False})
        print("PASS_ISOLATED_3032_RECOVERED_NOT_PUBLIC PID="+str(pid),flush=True)
    except BaseException as error:
        try:
            native(["/usr/bin/systemctl","stop","aoe2hdbets-web-prod.service"],timeout=60)
            atomic(OLD_CONTROLLER,data["old_ctrl"],0o644)
            atomic(UNIT,data["old_unit"],0o644)
            atomic(POLICY,data["old_policy"],0o400)
            native(["/usr/bin/systemctl","daemon-reload"],timeout=45)
            native(["/usr/bin/systemctl","set-property","aoe2hdbets-web-prod.service","MemoryMax=2400M"],timeout=35)
            need(sha(read(DROPIN,0o644))==DROPIN_SHA,"ORIGINAL_EFFECTIVE_MEMORY_DROPIN_NOT_RESTORED")
            need(sha(read(NGINX,0o644))==PUBLIC_SHA,"PUBLIC_CHANGED_DURING_ROLLBACK")
            sealed(journal/"rollback.json",{"status":"CANDIDATE_ORIGINAL_FILES_RESTORED_NO_PUBLIC_CHANGE",
              "reason_type":type(error).__name__,"financial_authorized":False,"public_cutover_authorized":False})
        except BaseException as recovery_error:
            sealed(journal/"rollback_hold.json",{"status":"HOLD_RECOVERY_UNCERTAIN",
              "reason_type":type(error).__name__,"recovery_reason_type":type(recovery_error).__name__})
        raise
def main():
    a=argparse.ArgumentParser()
    a.add_argument("--phase",choices=["plan","apply"],required=True)
    a.add_argument("--nonce",required=True)
    a.add_argument("--source-head",required=True)
    a.add_argument("--grant-id")
    a.add_argument("--grant-sha")
    args=a.parse_args()
    if args.phase=="plan":
        plan,_=compute(args)
        # Genuine read-only PLAN; no lockfile, journal, service or database write.
        print(canon({"schema":"aoe2war.a05.heap-plan-envelope.v1","status":"PASS_STOPPED_MEMORY_PLAN_READ_ONLY",
          "plan":plan,"plan_sha256":sha(canon(plan))}).decode())
    else:
        lock=ROOT/"heap-recovery.lock"
        fd=os.open(lock,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        plan,data=compute(args)
        apply(args,plan,data)
if __name__=="__main__":
    try:main()
    except (Hold,OSError,KeyError,ValueError,subprocess.TimeoutExpired) as e:
        print("HOLD:A05_HEAP_RECOVERY:"+str(e)[:500],file=sys.stderr,flush=True)
        sys.exit(2)
