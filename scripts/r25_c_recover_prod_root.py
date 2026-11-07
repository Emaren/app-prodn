#!/usr/bin/env python3
"""One-use recovery of the exact prior A05 3032 HOLD. Never cut over public or finance."""
import datetime
import base64
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import stat
import subprocess
import sys

OLD="886dac221e73167621d6bbfa89cd30edf6b632a3"
OLD_NONCE="6dd6dc4c38ba4bfd51042fd1811da7ed"
LIB=Path("/usr/local/lib/aoe2war-web-prod")
AUDIT=Path("/var/lib/aoe2war-app-production-v1")
PRIOR=AUDIT/("prod-"+OLD_NONCE)
HEX=re.compile(r"[a-f0-9]{64}\Z")
CACHE={}
class Hold(RuntimeError):pass
def require(ok,reason):
    if not ok:raise Hold(reason)
def digest(value):return hashlib.sha256(value).hexdigest()
def canonical(value):return json.dumps(value,sort_keys=True,separators=(",",":")).encode()
def root_bytes(path):
    path=Path(path);info=path.lstat()
    require(path.is_file() and not path.is_symlink() and info.st_uid==0 and
            info.st_nlink==1 and info.st_mode&0o022==0,"ROOT_FILE_IDENTITY_CHANGED")
    return path.read_bytes()
def m():
    if not CACHE:
        require(sys.platform=="linux" and os.geteuid()==0,"HEL1_ROOT_REQUIRED")
        source=root_bytes(LIB/"r25_c_start_root.py")
        baseline=json.loads(root_bytes(PRIOR/"entered.json"))["plan"]
        require(baseline["source_sha"]==OLD and
                digest(source)==baseline["source_hashes"]["scripts/r25_c_start_root.py"],
                "INSTALLED_CONTROLLER_SHA_CHANGED")
        CACHE.update(runpy.run_path(str(LIB/"r25_c_start_root.py"),
                                    run_name="exact_prior_3032_recovery"))
    return CACHE
def verify(p):
    base={"nonce","recovery_source_sha","source_file_sha256",
          "prior_entered_sha256","prior_hold_sha256"}
    require(type(p)==dict and set(p) in (base,base|{"owner_comment_id"}),
            "RECOVERY_PACKET_FIELDS")
    if "owner_comment_id" in p:
        require(type(p["owner_comment_id"]) is int and p["owner_comment_id"]>0,
                "OWNER_RECOVERY_COMMENT_ID_INVALID")
    require(type(p["nonce"]) is str and re.fullmatch("[a-f0-9]{32}",p["nonce"]) and
            p["nonce"]!=OLD_NONCE and re.fullmatch("[a-f0-9]{40}",p["recovery_source_sha"]) and
            HEX.fullmatch(p["source_file_sha256"]) and HEX.fullmatch(p["prior_entered_sha256"]) and
            HEX.fullmatch(p["prior_hold_sha256"]),"RECOVERY_PACKET_IDENTITY")
    require(digest(root_bytes(__file__))==p["source_file_sha256"],"RECOVERY_SCRIPT_SOURCE_DRIFT")
    require(not (AUDIT/("recover-"+p["nonce"])).exists(),"RECOVERY_NONCE_CONSUMED")
    entered_raw=root_bytes(PRIOR/"entered.json");hold_raw=root_bytes(PRIOR/"hold.json")
    require(digest(entered_raw)==p["prior_entered_sha256"] and
            digest(hold_raw)==p["prior_hold_sha256"],"PREVIOUS_HOLD_BYTES_CHANGED")
    entered=json.loads(entered_raw);hold=json.loads(hold_raw)
    plan=entered["plan"]
    require(entered["status"]=="CONSUMED_NO_REPLAY" and entered["nonce"]==OLD_NONCE and
            hold["status"]=="HOLD_NO_REPLAY" and hold["new_service_stop_proven"] is True and
            hold["public_cutover_authorized"] is False and hold["financial_authorized"] is False and
            plan["source_sha"]==OLD and plan["port"]==3032 and plan["uid"]==990 and
            plan["public_cutover_authorized"] is False and plan["financial_authorized"] is False,
            "PRIOR_FAILED_ADMISSION_NOT_PRESERVED")
    root=m()
    require(not root["PROD_POLICY"].exists() and not (PRIOR/"complete.json").exists(),
            "3032_ALREADY_ADMITTED_OR_POLICY_PRESENT")
    require(root["unit_state"](root["PROD_UNIT"])["properties"]["ActiveState"]=="inactive" and
            root["unit_state"]("aoe2war-steam-egress-refresh.timer")["properties"]["ActiveState"]=="inactive",
            "FAILED_3032_NOT_QUIESCED")
    require(plan["stage"]=="/var/lib/aoe2war-web-prod-"+OLD[:12],
            "RECOVER_ONLY_EXACT_STAGED_CANDIDATE")
    # The original protected SHA remains immutable historical evidence.
    # Ordinary monitored units may legitimately change state across hours.
    # Every *new* admission binds a fresh protected snapshot instead.
    require(root["production_protected"](),"FRESH_PROTECTED_STATE_UNAVAILABLE")
    require(root["sha"](root["root_file"](Path("/etc/nginx/sites-available/aoe2war.com"),131072))==
            root["PROD_NGINX_PREIMAGE"],"PUBLIC_PROXY_CHANGED")
    require(root["production_nft_shape"](),"UID990_FIREWALL_BOUNDARY_MISSING")
    for name in root["PROD_SOURCE_FILES"]:
        mode=0o400 if name.endswith((".json",".sql")) else 0o644
        observed=root["root_file"](LIB/Path(name).name,196608,mode)
        require(digest(observed)==plan["source_hashes"][name],"INSTALLED_SOURCE_CHANGED")
    for filename,expected in (
       (Path("/etc/systemd/system")/root["PROD_UNIT"],plan["unit_sha256"]),
       (root["PROD_PROXY"],plan["private_proxy_sha256"])):
        require(digest(root["root_file"](filename,16384,0o644))==expected,
                "INSTALLED_UNIT_OR_PRIVATE_PROXY_CHANGED")
    require(root["production_refresh_unit_identity"](),"STEAM_REFRESH_UNIT_CHANGED")
    stage=Path(plan["stage"])
    require(root["sha"](root["root_file"](stage/".aoe2war-runtime-manifest.json",67108864))==
            plan["artifact"]["manifest_sha256"] and
            root["root_file"](stage/".aoe2war-source-sha",128).strip()==OLD.encode(),
            "EXACT_STAGED_ARTIFACT_CHANGED")
    require(root["production_critical_runtime"](stage),"STAGE_CRITICAL_BYTES_CHANGED")
    config=root["parse"](root["root_file"](LIB/"nonfinancial-production-watcher-assets.json",32768,0o400))
    require(root["production_published_assets"](config,plan["published_assets"]),
            "PUBLISHED_ASSET_INODES_OR_HASHES_CHANGED")
    env,dbname,password=root["production_runtime_environment"]()
    require(root["production_database_witness"](dbname,password),"AUTH_DB_ROLE_NOT_RESTRICTED")
    return plan,stage
def make_plan(p):
    old,stage=verify(p)
    root=m()
    qualification=qualified_source(p)
    current=root["sha"](root["canonical"](root["production_protected"]()))
    return {"schema":"aoe2war.app.failed-start-recovery-plan.v1",
            "nonce":p["nonce"],"recovery_source_sha":p["recovery_source_sha"],
            "source_file_sha256":p["source_file_sha256"],
            "prior_entered_sha256":p["prior_entered_sha256"],
            "prior_hold_sha256":p["prior_hold_sha256"],
            "source_qualification":qualification,
            "prior_source_sha":OLD,"stage":str(stage),
            "source_artifact_sha256":old["artifact"]["sha256"],
            "original_protected_sha256":old["protected_snapshot_sha256"],
            "current_protected_sha256":current,
            "previous_attempt_immutable":True,"public_cutover_authorized":False,
            "financial_authorized":False}
def qualified_source(p):
    """Authenticate reviewed bytes and actual CI, independently of owner text."""
    github=m()["production_github"]
    source=github("contents/scripts/r25_c_recover_prod_root.py?ref="+p["recovery_source_sha"])
    require(source.get("type")=="file" and source.get("encoding")=="base64",
            "RECOVERY_COMMITTED_SOURCE_REQUIRED")
    raw=base64.b64decode(source.get("content","").replace("\n",""),validate=True)
    require(0<len(raw)<=196608 and digest(raw)==p["source_file_sha256"],
            "RECOVERY_AUTHENTICATED_SOURCE_MISMATCH")
    runs=github("actions/workflows/ci.yml/runs?head_sha="+p["recovery_source_sha"]+"&per_page=20")
    matches=[v for v in runs.get("workflow_runs",[]) if v.get("head_sha")==p["recovery_source_sha"]
             and v.get("name")=="AoE2WAR CI" and v.get("status")=="completed" and v.get("conclusion")=="success"]
    require(bool(matches),"RECOVERY_EXACT_HEAD_CI_NOT_PASS")
    run_id=matches[0].get("id")
    require(type(run_id) is int and run_id>0,"RECOVERY_CI_RUN_ID_REQUIRED")
    jobs=github("actions/runs/"+str(run_id)+"/jobs?filter=latest&per_page=100")
    names={"Release and documentation control plane","Type, contract, and production build",
           "Isolated Steam-rating PostgreSQL chronology"}
    require(jobs.get("total_count")==3 and len(jobs.get("jobs",[]))==3 and
            {j.get("name") for j in jobs["jobs"]}==names and
            all(j.get("status")=="completed" and j.get("conclusion")=="success" for j in jobs["jobs"]),
            "RECOVERY_COMPLETE_THREE_JOB_CI_REQUIRED")
    checks=github("commits/"+p["recovery_source_sha"]+"/check-runs?filter=latest&per_page=100")
    security=[v for v in checks.get("check_runs",[]) if v.get("name")=="GitGuardian Security Checks"
              and v.get("app",{}).get("slug")=="gitguardian"]
    require(len(security)==1 and security[0].get("status")=="completed" and
            security[0].get("conclusion")=="success","RECOVERY_ACTUAL_SECURITY_CHECK_NOT_PASS")
    return {"source_sha":p["recovery_source_sha"],"file_sha256":p["source_file_sha256"],
            "ci_run_id":run_id,"security_check_run_id":security[0]["id"]}

@contextlib.contextmanager
def release_lock():
    """Serialize the entire plan/admission/failure path with existing releases."""
    root=m();path=root["LOCK"];before=path.lstat()
    require(stat.S_ISREG(before.st_mode) and
            (before.st_dev,before.st_ino,before.st_uid,stat.S_IMODE(before.st_mode))==root["LOCK_ID"],
            "RECOVERY_ORIGINAL_RELEASE_LOCK_CHANGED")
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        opened=os.fstat(fd)
        require((opened.st_dev,opened.st_ino)==(before.st_dev,before.st_ino),"RECOVERY_RELEASE_LOCK_OPEN_RACE")
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        yield
    finally:os.close(fd)
def grant(p,planned):
    comment=p.get("owner_comment_id")
    require(type(comment) is int and comment>0,"OWNER_RECOVERY_CONSENT_MISSING")
    r=subprocess.run(["/usr/bin/gh","api",
       "repos/Emaren/app-prodn/issues/comments/"+str(comment)],
       capture_output=True,text=True,timeout=25)
    require(r.returncode==0,"AUTHENTICATED_OWNER_GRANT_UNAVAILABLE")
    item=json.loads(r.stdout)
    require(item["user"]["login"]=="Emaren" and item["user"]["id"]==15059910 and
            item["created_at"]==item["updated_at"] and item.get("id")==comment and
            item.get("issue_url")=="https://api.github.com/repos/Emaren/app-prodn/issues/1108" and
            item.get("html_url")=="https://github.com/Emaren/app-prodn/issues/1108#issuecomment-"+str(comment),
            "OWNER_RECOVERY_IDENTITY_UNTRUSTED")
    text=item["body"];prefix="APP_PRODUCTION_3032_RECOVERY_GRANT\n"
    require(text.startswith(prefix),"OWNER_RECOVERY_FORMAT")
    approved=json.loads(text[len(prefix):])
    require(set(approved)=={"scope","nonce","prior_source_sha","recovery_source_sha",
            "source_file_sha256","plan_sha256","max_uses",
            "public_cutover_authorized","financial_authorized","expires_at","issued_at",
            "delegated_ai_authorship_disclosed"} and
            approved["scope"]=="RECOVER_EXISTING_NONFINANCIAL_3032_ONLY" and
            approved["nonce"]==p["nonce"] and approved["prior_source_sha"]==OLD and
            approved["recovery_source_sha"]==p["recovery_source_sha"] and
            approved["source_file_sha256"]==p["source_file_sha256"] and
            approved["plan_sha256"]==digest(canonical(planned)) and
            approved["max_uses"]==1 and approved["public_cutover_authorized"] is False and
            approved["financial_authorized"] is False and
            approved["delegated_ai_authorship_disclosed"] is True,"OWNER_RECOVERY_SCOPE_DRIFT")
    issued=datetime.datetime.fromisoformat(approved["issued_at"].replace("Z","+00:00"))
    until=datetime.datetime.fromisoformat(approved["expires_at"].replace("Z","+00:00"))
    now=datetime.datetime.now(datetime.timezone.utc)
    require(issued<=now<until and 0<(until-issued).total_seconds()<=900,
            "OWNER_RECOVERY_GRANT_EXPIRED")
    return {"comment_id":comment,"comment_sha256":digest(text.encode())}
def refresh(root):
    shape=root["production_nft_shape"]()
    previous=root["sha"](root["canonical"](root["production_protected"]()))
    addresses=root["production_steam_addresses"]()
    commands=["flush set inet aoe2war_web_prod steam4",
              "flush set inet aoe2war_web_prod steam6"]
    for version in (4,6):
        members=[i for i in addresses if root["ipaddress"].ip_address(i).version==version]
        if members:
            commands.append("add element inet aoe2war_web_prod steam%d { %s }" %
                            (version,", ".join(i+" timeout 300s" for i in members)))
    root["run"](["/usr/sbin/nft","-f","-"],
                data=("\n".join(commands)+"\n").encode(),maximum=8192)
    require(root["production_nft_shape"]()==shape and
            root["sha"](root["canonical"](root["production_protected"]()))==previous,
            "RECOVERY_STEAM_CHANGED_NONSTEAM_RULES")
    return addresses
def steam(root,environment,stage):
    probe=("fetch('https://steamcommunity.com/openid/login',{method:'POST',"
           "headers:{'content-type':'application/x-www-form-urlencoded'},"
           "body:'openid.mode=check_authentication',redirect:'error',"
           "signal:AbortSignal.timeout(10000)}).then(async r=>{const s=await r.text();"
           "if(r.status!==200||!/^is_valid:false$/m.test(s))process.exit(2);"
           "console.log(JSON.stringify({ok:true,authenticated:false}));"
           "}).catch(()=>process.exit(3));")
    env={"PATH":"/usr/bin:/bin","HOME":"/nonexistent","LANG":"C.UTF-8",
         "USER":root["PROD_USER"],"LOGNAME":root["PROD_USER"],"NODE_ENV":"production",
         "WARGRAPH_RUNTIME_DISABLED":"true","AOE2WAR_RUNTIME_PROFILE":root["PROD_PROFILE"],
         "AOE2WAR_R25_ISOLATED_WEB":"true","AOE2WAR_PROD_DB_PREVIEW":"false",
         "AOE2_BACKEND_UPSTREAM":"http://127.0.0.1:3331","HOSTNAME":"127.0.0.1",
         "PORT":"3032","NODE_OPTIONS":"--require="+str(root["PROD_GUARD"]),**environment}
    result=subprocess.run(["/usr/sbin/runuser","-u",root["PROD_USER"],"--",
                           "/usr/bin/node","-e",probe],
                           cwd=str(stage),env=env,capture_output=True,timeout=15)
    require(result.returncode==0 and json.loads(result.stdout)=={"ok":True,"authenticated":False},
            "RECOVERY_REAL_STEAM_TLS_POST_FAILED")
    return {"steam_tls_verified":True,"real_login_not_performed":True}
def recover(p):
    planned=make_plan(p)
    approved=grant(p,planned)
    root=m();old,stage=verify(p)
    require(root["sha"](root["canonical"](root["production_protected"]()))==
            planned["current_protected_sha256"],"FRESH_PROTECTED_PRESTART_CHANGED")
    journal=AUDIT/("recover-"+p["nonce"])
    journal.mkdir(mode=0o700)
    root["fsync_directory"](AUDIT)
    root["seal"](journal/"entered.json",{"schema":"aoe2war.app.recovery-entered.v1",
       "status":"CONSUMED_NO_REPLAY","plan":planned,"grant":approved,
       "public_cutover_authorized":False,"financial_authorized":False})
    started=False;timer=False
    try:
        addresses=refresh(root)
        ready={"source_sha":OLD,"build_id":old["artifact"]["build_id"],
               "build_version":old["artifact"]["build_version"]}
        started=True
        root["run"](["/usr/bin/systemctl","start",root["PROD_UNIT"]],timeout=90)
        pid,ticks=root["production_wait"](ready)
        environment,dbname,password=root["production_runtime_environment"]()
        admission={"schema":"aoe2war.app.production-admission.v1",
            "status":"NATIVE_PRODUCTION_ADMISSION_PASS",
            "source_sha":OLD,"candidate_pid":pid,"candidate_start_ticks":ticks,
            "postgres":root["production_database_admission"](dbname,password),
            "catalog":root["production_database_witness"](dbname,password),
            "kernel":root["production_kernel_probe"](addresses),
            "steam":steam(root,environment,stage),
            "financial_authorized":False,"public_cutover_authorized":False}
        root["seal"](journal/"runtime-admission.json",admission)
        profile={
          "schema":"aoe2war.app.approved-production-profile.v1",
          "profile":root["PROD_PROFILE"],"source_sha":OLD,
          "build_id":old["artifact"]["build_id"],"build_version":old["artifact"]["build_version"],
          "stage":str(stage),"uid":root["PROD_UID"],"gid":root["PROD_GID"],
          "unit":root["PROD_UNIT"],"port":root["PROD_PORT"],
          "artifact":old["artifact"],"ci_artifact":old["ci_artifact"],
          "manifest_sha256":old["artifact"]["manifest_sha256"],
          "guard_sha256":old["source_hashes"]["scripts/r25_b_guard_production_v1.cjs"],
          "unit_sha256":old["unit_sha256"],
          "nft_shape_sha256":root["production_nft_shape"](),
          "private_proxy_sha256":old["private_proxy_sha256"],
          "sql_sha256":old["source_hashes"]["config/nonfinancial-production-auth.sql"],
          "protected_snapshot_sha256":planned["current_protected_sha256"],
          "native_plan_sha256":digest(root["canonical"](old)),
          "journal_path":str(journal),
          "controller_sha256":old["source_hashes"]["scripts/r25_c_start_root.py"],
          "steam_addresses":addresses,
          "refresh_units":root["production_refresh_unit_identity"](),
          "critical_runtime":root["production_critical_runtime"](stage),
          "published_assets":old["published_assets"],
          "assets_source_sha256":old["source_hashes"]["config/nonfinancial-production-watcher-assets.json"],
          "admission_sha256":digest(root_bytes(journal/"runtime-admission.json"))}
        root["production_write"](root["PROD_POLICY"],root["canonical"](profile)+b"\n",0o400)
        witness=root["production_witness"]({"profile_path":str(root["PROD_POLICY"])})
        timer=True
        root["run"](["/usr/bin/systemctl","start",
                     "aoe2war-steam-egress-refresh.timer"],timeout=30)
        require(root["sha"](root["canonical"](root["production_protected"]()))==
                planned["current_protected_sha256"],"ORIGINAL_SERVICES_CHANGED")
        result={"schema":"aoe2war.app.production-recovery-complete.v1",
           "status":"PRODUCTION_3032_ADMITTED_NOT_PUBLIC",
           "source_sha":OLD,"recovery_source_sha":p["recovery_source_sha"],
           "nonce":p["nonce"],"candidate_pid":pid,
           "candidate_start_ticks":ticks,"witness":witness,
           "original_failed_nonce_remains_consumed":True,
           "completed_user_steam_login":False,"public_cutover_authorized":False,
           "persistent_start_authorized":False,
           "financial_authorized":False}
        root["seal"](journal/"complete.json",result)
        return result
    except BaseException as exc:
        if timer:
            try:root["run"](["/usr/bin/systemctl","stop",
                            "aoe2war-steam-egress-refresh.timer"],timeout=30)
            except BaseException:pass
        stopped=False
        if started:
            try:
                root["run"](["/usr/bin/systemctl","stop",root["PROD_UNIT"]],timeout=45)
                stopped=root["unit_state"](root["PROD_UNIT"])["properties"]["ActiveState"]=="inactive"
            except BaseException:pass
        root["seal"](journal/"hold.json",{"status":"HOLD_NO_REPLAY",
            "failure_class":type(exc).__name__,
            "new_service_stop_attempted":started,"new_service_stop_proven":stopped,
            "financial_authorized":False,"public_cutover_authorized":False})
        raise
def main():
    require(len(sys.argv)==2 and sys.argv[1] in ("--plan","--recover"),"EXPLICIT_PHASE")
    payload=json.loads(sys.stdin.buffer.read(16385))
    with release_lock():
        if sys.argv[1]=="--plan":
            p=make_plan(payload)
            result={"status":"PASS_READONLY_RECOVERY_PLAN_NOT_START_AUTHORITY",
                    "plan":p,"plan_sha256":digest(canonical(p))}
        else:result=recover(payload)
    print(json.dumps(result,sort_keys=True))
if __name__=="__main__":
    try:main()
    except (Hold,KeyError,ValueError,OSError,subprocess.TimeoutExpired) as exc:
        print(json.dumps({"status":"HOLD_NO_REPLAY",
                          "reason":str(exc) if type(exc) is Hold else type(exc).__name__}))
        raise SystemExit(2)
