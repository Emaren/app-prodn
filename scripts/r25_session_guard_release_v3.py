#!/usr/bin/env python3
"""R25 candidate-only session guard deployment, one-use and independently auditable.

Never touches public Nginx, original 3030, source builds or WOLO custody.
The session key is an original symmetric signing capability, NOT read-only.
"""
import argparse
import base64
import datetime
import hashlib
import hmac
import importlib.util
import json
import os
import pathlib
import re
import socket
import stat
import subprocess
import sys
import time
import urllib.request
import urllib.error

HOST="ubuntu-4gb-hel1-11"
REPO="Emaren/app-prodn"
PR=1123
MASTER_ISSUE=1108
OLD_PID=2625090
OLD_TICKS=103836850
CANDIDATE_PID=1465429
CANDIDATE_TICKS=148192915
UID=993
OLD_GUARD=pathlib.Path("/usr/local/lib/aoe2war-r25/r25_b_guard.cjs")
OLD_GUARD_SHA="dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d"
GUARD=pathlib.Path("/usr/local/lib/aoe2war-r25/r25_b_guard_session_v2.cjs")
DROPIN=pathlib.Path("/etc/systemd/system/aoe2hdbets-web-r24.service.d/99-r25-session-guard.conf")
SESSION=pathlib.Path("/etc/aoe2war/r24-parallel-web/session-runtime.env")
B_WITNESS=pathlib.Path("/etc/aoe2war/r24-parallel-web/approved-runtime-session-v2.py")
B_SHA="5e44c1dc227cb3aec939934ff64aaf314b6d533fdeac6973fdcf7ea0451bd1ae"
UNIT="aoe2hdbets-web-r24.service"
OLD_UNIT="aoe2hdbets-web.service"
NGINX=pathlib.Path("/etc/nginx/sites-available/aoe2war.com")
NGINX_SHA="d8f55532ae9a1b8463ed6f0998f8a92343677e442218d1bdaef1b6e547478ad8"
AUDIT=pathlib.Path("/var/lib/aoe2war-r25-c-additive")
EXPECTED_VERSION="20261031171526-148d3df911"
EXPECTED_BUILD="-dJl5VyecHu5BKNvfErJe"
ROOT_SOURCE="scripts/r25_session_guard_release_v3.py"
GUARD_SOURCE="scripts/r25_b_guard_session_v2.cjs"
ORIGINAL_SESSION_ENV_REVIEWED=True
HEX64=re.compile(r"[a-f0-9]{64}\Z")
NONCE=re.compile(r"[a-f0-9]{32}\Z")
SAFE_TOKEN=re.compile(rb"[A-Za-z0-9_./+=:-]{32,4096}\Z")

class Hold(Exception): pass
def need(predicate,why):
    if not predicate:raise Hold(why)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def canonical(obj):return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode()
def call(args,timeout=20,maximum=262144,stdin=None):
    result=subprocess.run(args,input=stdin,capture_output=True,timeout=timeout,check=False)
    need(result.returncode==0 and len(result.stdout)<=maximum,"SYSTEM_COMMAND_REFUSED")
    return result.stdout
def jsonload(raw):
    def unique(pairs):
        out={}
        for k,v in pairs:
            need(k not in out,"DUPLICATE_JSON_FIELD")
            out[k]=v
        return out
    return json.loads(raw,object_pairs_hook=unique,parse_constant=lambda _:need(False,"NONFINITE_JSON"))
def root_file(path,limit=65536,mode=None):
    need(path.is_absolute(),"ROOT_ABSOLUTE_FILE_ONLY")
    s=path.lstat()
    need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1
         and (mode is None or stat.S_IMODE(s.st_mode)==mode)
         and 0<s.st_size<=limit,"ROOT_SEALED_FILE_MISSING_OR_DRIFT")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        opened=os.fstat(fd);content=os.read(fd,limit+1);after=os.fstat(fd)
        sig=lambda x:(x.st_dev,x.st_ino,x.st_size,x.st_mtime_ns,x.st_uid,x.st_mode,x.st_nlink)
        need(sig(s)==sig(opened)==sig(after) and len(content)==s.st_size,"ROOT_FILE_TOCTOU")
        return content
    finally:os.close(fd)
def seal(path,value,mode=0o600):
    raw=canonical(value)+b"\n" if isinstance(value,dict) else value
    fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
    try:os.write(fd,raw);os.fsync(fd)
    finally:os.close(fd)
    need(digest(root_file(path,max(len(raw),8192),mode))==digest(raw),"SEALED_RECEIPT_WRITE")
def ticks(pid):
    parts=(pathlib.Path("/proc")/str(pid)/"stat").read_text().split()
    return int(parts[21])
def status(unit):
    obj={}
    raw=call(["/usr/bin/systemctl","show",unit,"-p","MainPID","-p","ActiveState",
              "-p","User","-p","WorkingDirectory","-p","NeedDaemonReload"],maximum=8192)
    for line in raw.decode().splitlines():
        key,sep,val=line.partition("=")
        need(sep and key not in obj,"SYSTEMD_PROPERTY_INTEGRITY")
        obj[key]=val
    return obj
def health(port):
    req=urllib.request.Request("http://127.0.0.1:"+str(port)+"/api/deployment-version")
    with urllib.request.urlopen(req,timeout=4) as response:
        need(response.status==200,"VERSION_HTTP_BAD")
        return jsonload(response.read(8192))
def frozen_public():
    old=status(OLD_UNIT)
    need(old.get("MainPID")==str(OLD_PID) and old.get("ActiveState")=="active"
         and ticks(OLD_PID)==OLD_TICKS,"ORIGINAL_PUBLIC_PROCESS_DRIFT")
    config=root_file(NGINX,131072)
    need(digest(config)==NGINX_SHA and config.count(b"proxy_pass http://127.0.0.1:3030;")==6
         and config.count(b"proxy_pass http://127.0.0.1:3031;")==0,"PUBLIC_NGINX_DRIFT")
    need(health(3030).get("buildVersion")=="20261028134227-6c0f6d7531","PUBLIC_VERSION_DRIFT")
def session_identity():
    raw=root_file(SESSION,8192,0o600)
    need(raw.startswith(b"SESSION_SECRET=") and raw.endswith(b"\n") and SAFE_TOKEN.fullmatch(raw[15:-1]),
         "ONLY_PREVIOUSLY_SEALED_SIGNING_KEY_ALLOWED")
    rawproc=(pathlib.Path("/proc")/str(OLD_PID)/"environ").read_bytes()
    values={}
    for row in rawproc.rstrip(b"\0").split(b"\0"):
        name,sep,value=row.partition(b"=")
        need(sep and name not in values,"ORIGINAL_ENV_MALFORMED")
        values[name]=value
    old=values.get(b"SESSION_SECRET") or values.get(b"NEXTAUTH_SECRET")
    need(type(old)is bytes and SAFE_TOKEN.fullmatch(old) and
         hmac.compare_digest(old,raw[15:-1]),"ORIGINAL_SYMMETRIC_SESSION_IDENTITY_CHANGED")
    return old
def read_environment(pid):
    raw=(pathlib.Path("/proc")/str(pid)/"environ").read_bytes()
    need(0<len(raw)<=65536,"CANDIDATE_ENV_SIZE")
    env={}
    for row in raw.rstrip(b"\0").split(b"\0"):
        name,sep,value=row.partition(b"=")
        need(sep and name not in env,"CANDIDATE_ENV_MALFORMED")
        env[name.decode("ascii")]=value
    return env
def actual_guard_sha():
    return digest(root_file(OLD_GUARD,32768,0o644))
def b_base():
    need(digest(root_file(B_WITNESS,65536,0o644))==B_SHA,"IMMUTABLE_B_SESSION_V2_WITNESS_DRIFT")
    spec=importlib.util.spec_from_file_location("r25_b_session_v2_local",B_WITNESS)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.load_base()
def b_observe(guard_sha,session=False):
    b=b_base()
    if session:
        b.GUARD=GUARD
        b.EXPECTED=dict(b.EXPECTED,NODE_OPTIONS="--require="+str(GUARD))
        b.ENV_ALLOW=set(b.ENV_ALLOW)|{"SESSION_SECRET"}
    result=b.observe(guard_sha)
    need(result.get("status")=="POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY"
         and result.get("candidate_uid")==UID and result.get("build_id")==EXPECTED_BUILD
         and result.get("old_web_pid")==OLD_PID,"NATIVE_B_CONFINEMENT_NOT_PROVEN")
    return result
def c_baseline(guard_sha=OLD_GUARD_SHA,session=False):
    frozen_public()
    need(actual_guard_sha()==OLD_GUARD_SHA,"ORIGINAL_NODE_GUARD_DRIFT")
    current=status(UNIT)
    need(current.get("ActiveState")=="active" and current.get("User")=="aoe2war-r24-web"
         and current.get("WorkingDirectory")=="/var/lib/aoe2war-r25-web-0cee3c836c4b"
         and current.get("NeedDaemonReload")=="no","CANDIDATE_SYSTEMD_IDENTITY_DRIFT")
    pid=int(current.get("MainPID","0"))
    need(pid>1 and ticks(pid)>0,"CANDIDATE_PROCESS_IDENTITY_MISSING")
    need(health(3031).get("buildVersion")==EXPECTED_VERSION,"CANDIDATE_BUILD_DRIFT")
    env=read_environment(pid)
    if session:
        need(env.get("NODE_OPTIONS")==("--require="+str(GUARD)).encode(),
             "CANDIDATE_VERSIONED_GUARD_NOT_PRELOADED")
        need(env.get("SESSION_SECRET")==session_identity() and "NEXTAUTH_SECRET" not in env,
             "CANDIDATE_SIGNING_IDENTITY_DRIFT")
    else:
        need(pid==CANDIDATE_PID and ticks(pid)==CANDIDATE_TICKS
             and env.get("NODE_OPTIONS")==("--require="+str(OLD_GUARD)).encode()
             and "SESSION_SECRET" not in env and "NEXTAUTH_SECRET" not in env,
             "PREVIOUS_CANDIDATE_BASELINE_CHANGED")
        session_identity()
    before=b_observe(guard_sha,session=session)
    need(before.get("candidate_pid")==pid,"INDEPENDENT_B_PROCESS_DRIFT")
    listeners=call(["/usr/bin/ss","-H","-lnt"],maximum=32768).decode().splitlines()
    def has(port):
        return any(re.search(r":"+str(port)+r"\s",line) for line in listeners)
    need(has(8092) and has(8093) and not has(8094) and not has(8095),
         "WOLO_CUSTODY_LISTENERS_CHANGED")
    return {"candidate_pid":pid,"candidate_start_ticks":ticks(pid),
            "native_b_report_sha256":before.get("report_sha256"),
            "guard_sha256":guard_sha,"build_version":EXPECTED_VERSION,
            "public_pid":OLD_PID,"wolo_legacy_untouched":True,
            "financial_authorized":False}
def new_dropin():
    # Additional drop-in; original B source, guard and historical receipts stay.
    return ("[Service]\nEnvironmentFile="+str(SESSION)+"\n"
            +"Environment=NODE_OPTIONS=--require="+str(GUARD)+"\n").encode()
def github(endpoint):
    return jsonload(call(["/usr/bin/gh","api","repos/"+REPO+"/"+endpoint],timeout=30,maximum=524288))
def source_bytes(payload,name):
    source=github("contents/"+name+"?ref="+payload["source_sha"])
    need(source.get("type")=="file" and source.get("encoding")=="base64","GITHUB_SOURCE_FILE_MISSING")
    raw=base64.b64decode(source.get("content","").replace("\n",""),validate=True)
    need(0<len(raw)<=131072 and digest(raw)==payload["hashes"][name],
         "REVIEWED_GITHUB_SOURCE_BYTES_CHANGED")
    return raw
def source_gate(payload):
    need(type(payload.get("source_sha"))is str and
         re.fullmatch(r"[a-f0-9]{40}",payload["source_sha"]),
         "REVIEWED_SOURCE_PIN_REQUIRED")
    hashes=payload.get("hashes")
    need(type(hashes)is dict and set(hashes)=={ROOT_SOURCE,GUARD_SOURCE}
         and all(type(x)is str and HEX64.fullmatch(x) for x in hashes.values()),
         "REVIEWED_SOURCE_HASHES_REQUIRED")
    for path in (ROOT_SOURCE,GUARD_SOURCE):source_bytes(payload,path)
    need(payload.get("scope")=="NONFINANCIAL_CANDIDATE_3031_ONLY"
         and payload.get("financial_authorized")is False
         and payload.get("public_cutover_authorized")is False,
         "FINANCIAL_OR_PUBLIC_AUTHORITY_UNAVAILABLE")
def grant_gate(payload,plan):
    comment_id=payload.get("comment_id")
    grant_hash=payload.get("comment_sha256")
    need(type(comment_id)is int and comment_id>1
         and type(grant_hash)is str and HEX64.fullmatch(grant_hash),
         "ONE_USE_GITHUB_GRANT_REQUIRED")
    item=github("issues/comments/"+str(comment_id))
    body=item.get("body","")
    need(item.get("id")==comment_id and item.get("html_url")==
         "https://github.com/"+REPO+"/issues/"+str(MASTER_ISSUE)+"#issuecomment-"+str(comment_id)
         and item.get("user",{}).get("login")=="Emaren"
         and item.get("user",{}).get("id")==15059910
         and item.get("created_at")==item.get("updated_at")
         and digest(body.encode())==grant_hash,"AUTHENTIC_UNEDITED_OWNER_GRANT_REQUIRED")
    fence=chr(96)*3
    item_match=re.fullmatch("R25_NONFINANCIAL_SESSION_GUARD_V3\n"+fence+
                            r"json\n(.+)\n"+fence+r"\n?",body,re.S)
    need(item_match is not None,"OWNER_GRANT_DOCUMENT_FORMAT")
    grant=jsonload(item_match[1])
    need(grant.get("scope")==payload["scope"]
         and grant.get("schema")=="aoe2war.r25.owner-delegated-session-guard.v3"
         and grant.get("decision")=="AUTHORIZE"
         and grant.get("source_sha")==payload["source_sha"]
         and grant.get("nonce")==payload["nonce"]
         and grant.get("plan_sha256")==digest(canonical(plan))
         and grant.get("financial_authorized")is False
         and grant.get("public_cutover_authorized")is False
         and grant.get("one_use")is True
         and grant.get("delegated_ai_authorship_disclosed")is True,
         "OWNER_GRANT_SCOPE_OR_SOURCE_DRIFT")
    now=datetime.datetime.now(datetime.timezone.utc)
    def instant(x):return datetime.datetime.fromisoformat(x.replace("Z","+00:00"))
    issued=instant(grant["issued_at"]);expiry=instant(grant["expires_at"])
    created=instant(item["created_at"])
    need(0<(expiry-issued).total_seconds()<=600
         and issued<=created<=now<=expiry,"OWNER_DELEGATED_GRANT_EXPIRED")
    rid=grant.get("ci_run")
    need(type(rid)is int and rid>0,"GITHUB_EXACT_HEAD_CI_REQUIRED")
    run=github("actions/runs/"+str(rid))
    jobs=github("actions/runs/"+str(rid)+"/jobs?per_page=100")
    need(run.get("head_sha")==payload["source_sha"]
         and run.get("name")=="AoE2WAR CI"
         and run.get("status")=="completed" and run.get("conclusion")=="success"
         and jobs.get("total_count")==3 and len(jobs.get("jobs",[]))==3
         and all(j.get("status")=="completed" and j.get("conclusion")=="success"
                 for j in jobs["jobs"]),"EXACT_HEAD_FULL_CI_THREE_JOB_PASS_REQUIRED")
    return {"comment_id":comment_id,"body_sha256":grant_hash,"ci_run":rid}
def root_plan(payload):
    need(os.geteuid()==0 and socket.gethostname().split(".")[0]==HOST
         and sys.platform=="linux","EXACT_HEL1_ROOT_REQUIRED")
    nonce=payload.get("nonce")
    need(type(nonce)is str and NONCE.fullmatch(nonce),"FRESH_NONCE_REQUIRED")
    journal=AUDIT/("session-guard-v3-"+nonce)
    need(not journal.exists() and not journal.is_symlink(),"NONCE_ALREADY_CONSUMED")
    need(not GUARD.exists() and not GUARD.is_symlink()
         and not DROPIN.exists() and not DROPIN.is_symlink(),
         "CANDIDATE_GUARD_ALREADY_INSTALLED")
    need(digest(root_file(B_WITNESS,65536,0o644))==B_SHA,"B_WITNESS_SOURCE_DRIFT")
    source_gate(payload)
    pre=c_baseline()
    need(digest(new_dropin())==payload.get("dropin_sha256"),"EXPECTED_DROPIN_BYTES_DRIFT")
    return {"schema":"aoe2war.r25.session-guard-physical-plan.v3",
            "source_sha":payload["source_sha"],"scope":payload["scope"],
            "nonce":nonce,"expected_before":pre,
            "new_guard_sha256":payload["hashes"][GUARD_SOURCE],
            "new_guard_path":str(GUARD),"dropin_sha256":payload["dropin_sha256"],
            "previous_failure_nonces":["e0c3ab9b595e5e3d2d539d0f3668240d",
                                       "f92051a18b477d428daa815b5607f553"],
            "legacy_finance_unchanged":True,"financial_authorized":False,
            "public_cutover_authorized":False}
def wait_candidate(expected_new_guard,timeout=45):
    until=time.monotonic()+timeout
    last=None
    while time.monotonic()<until:
        try:
            state=status(UNIT)
            pid=int(state.get("MainPID") or 0)
            if pid<=1 or state.get("ActiveState")!="active":
                time.sleep(.2);continue
            # Check the same process twice after execution, not a Type=simple
            # intermediate process that has yet to exec Node.
            pid_ticks=ticks(pid)
            exe=os.readlink("/proc/"+str(pid)+"/exe")
            if exe!="/usr/bin/node":
                time.sleep(.2);continue
            env=read_environment(pid)
            expected=GUARD if expected_new_guard else OLD_GUARD
            if env.get("NODE_OPTIONS")!=("--require="+str(expected)).encode():
                time.sleep(.2);continue
            if expected_new_guard and env.get("SESSION_SECRET")!=session_identity():
                raise Hold("NEW_PROCESS_SESSION_SECRET_NOT_MATCHING_ORIGINAL")
            if not expected_new_guard and "SESSION_SECRET" in env:
                raise Hold("ROLLBACK_SESSION_KEY_STILL_PRESENT")
            if health(3031).get("buildVersion")!=EXPECTED_VERSION:
                raise Hold("NEW_PROCESS_BUILD_MISMATCH")
            need(ticks(pid)==pid_ticks and status(UNIT).get("MainPID")==str(pid),
                 "NEW_NODE_PID_CHANGED_DURING_NATIVE_PROBE")
            return pid,pid_ticks
        except (FileNotFoundError,ConnectionError,urllib.error.URLError,
                urllib.error.HTTPError,OSError,ValueError):
            time.sleep(.2)
        last=pid if "pid" in locals() else last
    raise Hold("NEW_NODE_EXEC_OR_RUNTIME_READINESS_NOT_PROVEN")
def release_guard(payload):
    import fcntl
    lockpath=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/os-control/locks/release.lock")
    lock=os.open(lockpath,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        plan=root_plan(payload)
        need(payload.get("plan_sha256")==digest(canonical(plan)),
             "APPROVED_EXACT_NATIVE_PLAN_CHANGED")
        grant=grant_gate(payload,plan)
        guard=source_bytes(payload,GUARD_SOURCE)
        nonce=payload["nonce"]
        audit=AUDIT/("session-guard-v3-"+nonce)
        before=plan["expected_before"]
        os.mkdir(audit,0o700)
        seal(audit/"owner-grant.json",{"scope":payload["scope"],"source_sha":payload["source_sha"],
              "nonce":nonce,"approved_plan_sha256":payload["plan_sha256"],
              "authenticated_github":grant,"financial_authorized":False})
        seal(audit/"started.json",{"status":"CONSUMED_NO_REPLAY","nonce":nonce,
              "candidate_before":before,"source_sha":payload["source_sha"],
              "planned_guard_sha256":digest(guard),"financial_authorized":False})
        installed=False;dropin=False;restarted=False
        try:
            seal(GUARD,guard,0o644);installed=True
            seal(DROPIN,new_dropin(),0o644);dropin=True
            need(digest(root_file(GUARD,32768,0o644))==plan["new_guard_sha256"]
                 and digest(root_file(DROPIN,8192,0o644))==plan["dropin_sha256"],
                 "SEALED_GUARD_OR_DROPIN_DRIFT")
            call(["/usr/bin/systemctl","daemon-reload"],timeout=45)
            # Original V4 witness remains source immutable. Candidate-only
            # environment extension is isolated here, not applied to 3030.
            fresh=b_base()
            fresh.GUARD=GUARD
            fresh.EXPECTED=dict(fresh.EXPECTED,NODE_OPTIONS="--require="+str(GUARD))
            fresh.ENV_ALLOW=set(fresh.ENV_ALLOW)|{"SESSION_SECRET"}
            pre=fresh.prestart(plan["new_guard_sha256"])
            need(pre.get("status")=="PASS_B_PRESTART_FINANCIAL_CONTROLS_NOT_LIVE_NOT_RELEASE_AUTHORITY",
                 "NATIVE_B_PRESTART_SESSION_GUARD_HOLD")
            seal(audit/"b-prestart.json",pre)
            frozen_public()
            need(session_identity() and c_baseline(OLD_GUARD_SHA)==before,
                 "NATIVE_PRE_RESTART_ORIGINAL_BASELINE_CHANGED")
            # One deliberate restart of *3031 only*. An unexpected original
            # B node exit must never be masked by an unrelated restarted PID.
            restarted=True
            call(["/usr/bin/systemctl","restart",UNIT],timeout=95)
            newpid,newticks=wait_candidate(True)
            native=c_baseline(plan["new_guard_sha256"],session=True)
            need(native["candidate_pid"]==newpid and native["candidate_start_ticks"]==newticks,
                 "NATIVE_B_AND_C_CANDIDATE_LINEAGE_MISMATCH")
            # Independent request-method fence: actual Node guard must deny
            # mutating HTTP before Next.js route/action handling.
            request=urllib.request.Request(
                "http://127.0.0.1:3031/__aoe2war_r25_b_isolation",
                data=b"",method="POST")
            try:
                urllib.request.urlopen(request,timeout=5)
                raise Hold("POST_MUTATION_UNEXPECTEDLY_PERMITTED")
            except urllib.error.HTTPError as response:
                need(response.code==405,"POST_MUTATION_HTTP_FENCE_CHANGED")
            # Recheck protected original source, root receipts and legacy
            # finance listeners after the real process has started.
            frozen_public()
            need(session_identity() and ticks(newpid)==newticks,
                 "SESSION_ORIGINAL_KEY_OR_PID_CHANGED_AFTER_ACCEPTANCE")
            report={"schema":"aoe2war.r25.session-guard-release.v3",
                    "status":"ISOLATED_3031_SESSION_GUARD_NATIVE_ACCEPT",
                    "nonce":nonce,"source_sha":payload["source_sha"],
                    "candidate_before":before,"candidate_after":native,
                    "candidate_guard_sha256":plan["new_guard_sha256"],
                    "session_key_equal_original":True,"only_symmetric_signing_key":True,
                    "authenticated_browser_roles_verified":False,
                    "public_cutover_authorized":False,"financial_authorized":False,
                    "owner_grant":grant,"sealed_plan_sha256":payload["plan_sha256"],
                    "replayed_previous_nonces":False}
            seal(audit/"complete.json",report)
            return report
        except BaseException as error:
            reason=str(error)[:128] if type(error)is Hold else type(error).__name__
            rollback={"status":"ROLLBACK_NOT_PROVEN","reason_type":type(error).__name__}
            try:
                if dropin:
                    need(root_file(DROPIN,8192,0o644)==new_dropin(),
                         "UNKNOWN_DROPIN_REQUIRES_HUMAN_REVIEW")
                    os.rename(DROPIN,audit/"rolled-back-dropin.conf")
                    call(["/usr/bin/systemctl","daemon-reload"],timeout=45)
                if restarted:
                    call(["/usr/bin/systemctl","restart",UNIT],timeout=95)
                pid,tick=wait_candidate(False)
                original=b_observe(OLD_GUARD_SHA,False)
                need(original.get("candidate_pid")==pid and
                     original.get("candidate_start_ticks")==tick,
                     "ROLLBACK_B_NATIVE_IDENTITY_NOT_PROVEN")
                frozen_public()
                rollback={"status":"ORIGINAL_CANDIDATE_CONFIG_RESTORED",
                          "candidate_pid":pid,"candidate_start_ticks":tick,
                          "original_public_pid":OLD_PID}
            except BaseException as failure:
                rollback["reason_type"]=type(failure).__name__
            try:seal(audit/"hold.json",{"schema":"aoe2war.r25.session-guard-hold.v3",
                     "status":"HOLD_NONCE_CONSUMED","reason":reason,
                     "rollback":rollback,"financial_authorized":False})
            except Exception:pass
            raise Hold("TRANSACTION_CONSUMED:"+reason+":"+rollback["status"])
    finally:os.close(lock)
def root_main(phase,payload):
    try:
        plan=root_plan(payload)
        if phase=="plan":
            reply={"status":"READ_ONLY_PASS_NO_AUTHORITY","plan":plan,
                   "plan_sha256":digest(canonical(plan))}
        else:
            reply=release_guard(payload)
        print(json.dumps(reply,sort_keys=True,default=str))
        return 0
    except (Hold,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as error:
        print(json.dumps({"status":"HOLD","reason":str(error)[:240],
              "public_cutover_authorized":False,"financial_authorized":False}))
        return 2
def ssh_run(phase,payload):
    import shlex
    # The SHA-bound code is transported to the existing authorized root SSH
    # identity in memory, not written into a persistent privileged script.
    raw=pathlib.Path(__file__).read_bytes()
    loader=("import base64;exec(compile(base64.b64decode("
            +repr(base64.b64encode(raw).decode())
            +"),'r25-session-guard-v3-source','exec'))")
    remote=" ".join(shlex.quote(x) for x in
                    ["/usr/bin/python3","-I","-B","-c",loader,"--root",phase])
    result=subprocess.run(["/usr/bin/ssh","-T","-o","BatchMode=yes",
                           "-o","StrictHostKeyChecking=yes","-o","ConnectTimeout=10",
                           "root@hel1",remote],input=canonical(payload),
                           capture_output=True,timeout=240,check=False)
    need(len(result.stdout)<131072,"UNBOUNDED_ROOT_REPLY")
    answer=jsonload(result.stdout)
    need(result.returncode==0 and answer.get("status")!="HOLD",
         "ROOT_HOLD:"+str(answer.get("reason","MISSING_NATIVE_RESULT")))
    return answer
def mac_main():
    import secrets
    parser=argparse.ArgumentParser()
    parser.add_argument("phase",choices=("plan","execute"))
    parser.add_argument("--plan-file")
    parser.add_argument("--comment-id",type=int)
    parser.add_argument("--comment-sha256")
    opts=parser.parse_args()
    root=pathlib.Path(__file__).resolve().parents[1]
    source=call(["git","rev-parse","HEAD"],maximum=256).decode().strip()
    need(re.fullmatch("[a-f0-9]{40}",source),"COMMITTED_SOURCE_REQUIRED")
    hashes={name:digest((root/name).read_bytes()) for name in (ROOT_SOURCE,GUARD_SOURCE)}
    payload={"source_sha":source,"hashes":hashes,
             "scope":"NONFINANCIAL_CANDIDATE_3031_ONLY",
             "financial_authorized":False,"public_cutover_authorized":False,
             "dropin_sha256":digest(new_dropin())}
    if opts.phase=="plan":
        nonce=secrets.token_hex(16);payload["nonce"]=nonce
        reply=ssh_run("plan",payload)
        path=pathlib.Path(opts.plan_file or
              str(pathlib.Path.home()/".config/aoe2war/r25-session-owner-receipts"/
                   ("session-guard-plan-"+nonce+".json")))
        need(path.parent.is_dir() and not path.exists(),"PRIVATE_PLAN_DESTINATION_REQUIRED")
        seal_local={"payload":payload,"plan":reply["plan"],
                    "plan_sha256":reply["plan_sha256"],"status":reply["status"]}
        fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,"wb") as out:
            out.write(canonical(seal_local)+b"\n");out.flush();os.fsync(out.fileno())
        print(json.dumps({"status":reply["status"],"plan_file":str(path),
                          "plan_sha256":reply["plan_sha256"],"nonce":nonce,"source_sha":source}))
        return 0
    need(opts.plan_file and opts.comment_id and opts.comment_sha256,"EXACT_OWNER_GRANT_REQUIRED")
    record=jsonload(pathlib.Path(opts.plan_file).read_bytes())
    need(record.get("status")=="READ_ONLY_PASS_NO_AUTHORITY"
         and record["payload"]["source_sha"]==source
         and record["payload"]["hashes"]==hashes,"PLAN_SOURCE_DRIFT")
    payload=record["payload"]
    payload.update(plan_sha256=record["plan_sha256"],comment_id=opts.comment_id,
                   comment_sha256=opts.comment_sha256)
    print(json.dumps(ssh_run("execute",payload),sort_keys=True))
    return 0
if __name__=="__main__":
    if "--root" in sys.argv:
        i=sys.argv.index("--root")
        result=root_main(sys.argv[i+1],jsonload(sys.stdin.buffer.read(131073)))
        sys.exit(result)
    try:sys.exit(mac_main())
    except (Hold,OSError,ValueError,KeyError,subprocess.TimeoutExpired) as error:
        print(json.dumps({"status":"HOLD","reason":str(error)[:240],
                          "financial_authorized":False,"public_cutover_authorized":False}))
        sys.exit(2)
