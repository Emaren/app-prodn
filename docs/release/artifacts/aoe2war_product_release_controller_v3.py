#!/usr/bin/env python3
"""AoE2WAR PRODUCT-only source-pinned one-slot deployment with exact rollback.

Authoritative control is the owner's existing root SSH + verified Linux artifact.
This code does not touch 3030, financial services, PG, nft, keys or Steam.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

APP_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
SERVICE="aoe2hdbets-web-prod.service"
STATE_ROOT=Path("/var/lib/aoe2war-product-release-v1")
LOCK=Path("/run/lock/aoe2war-product-release-v1.lock")
def load_exact_root_manifest():
    parser=argparse.ArgumentParser(add_help=False)
    parser.add_argument("--manifest",required=True)
    args,_=parser.parse_known_args()
    path=Path(args.manifest)
    if (not str(path).startswith("/root/aoe2war-product-release-manifests/")
        or path.is_symlink() or path.parent.is_symlink()):
        raise RuntimeError("HOLD_MANIFEST_PATH_SCOPE")
    ps=path.parent.lstat()
    st=path.lstat()
    if not (stat.S_ISDIR(ps.st_mode) and ps.st_uid==0 and
            stat.S_IMODE(ps.st_mode)==0o700 and
            stat.S_ISREG(st.st_mode) and st.st_uid==0 and
            st.st_nlink==1 and stat.S_IMODE(st.st_mode)==0o600 and
            100<st.st_size<8192):
        raise RuntimeError("HOLD_MANIFEST_ROOT_SOURCE")
    x=json.loads(path.read_bytes())
    required={"schema","source","build","version","archive_path",
       "archive_sha256","archive_bytes","runtime_member_count",
       "previous_source","previous_build","previous_root",
       "previous_unit_sha256","independent_proof_sha256",
       "github_run_id","financial_authorized"}
    if not(type(x) is dict and set(x)==required and
           x["schema"]=="aoe2war.product.web-release-manifest.v2" and
           x["financial_authorized"] is False):
        raise RuntimeError("HOLD_MANIFEST_FIELDS")
    match=lambda pat,v: type(v) is str and re.fullmatch(pat,v) is not None
    if not (match("[0-9a-f]{40}",x["source"]) and
            match("[0-9a-f]{40}",x["previous_source"]) and
            x["source"][:12]!=x["previous_source"][:12] and
            match("[A-Za-z0-9_-]{8,64}",x["build"]) and
            match("[A-Za-z0-9_-]{8,64}",x["previous_build"]) and
            match("[A-Za-z0-9_.-]{12,80}",x["version"]) and
            all(match("[0-9a-f]{64}",x[k]) and x[k]!="0"*64 for k in
              ("archive_sha256","previous_unit_sha256","independent_proof_sha256")) and
            x["source"]!="0"*40 and x["previous_source"]!="0"*40 and
            type(x["archive_bytes"]) is int and 1000000<x["archive_bytes"]<1000000000 and
            type(x["runtime_member_count"]) is int and
            1000<x["runtime_member_count"]<200000 and
            type(x["github_run_id"]) is int and x["github_run_id"]>0):
        raise RuntimeError("HOLD_MANIFEST_BOUNDS")
    if x["previous_root"]!="/var/lib/aoe2war-web-prod-"+x["previous_source"][:12]:
        raise RuntimeError("HOLD_PREVIOUS_SOURCE_DIRECTORY")
    a=Path(x["archive_path"])
    if (str(a).count("/")!=4 or not str(a).startswith("/home/tony/.aoe2war-b-")
        or a.name!="runtime.tar.gz" or a.is_symlink()
        or not a.parent.name.startswith(".aoe2war-b-")
        or not re.fullmatch(r"[A-Za-z0-9._-]+",a.parent.name)):
        raise RuntimeError("HOLD_ARCHIVE_PATH_SCOPE")
    dirstat=a.parent.lstat()
    if not (stat.S_ISDIR(dirstat.st_mode) and dirstat.st_uid==1000 and
            stat.S_IMODE(dirstat.st_mode)==0o700 and not a.parent.is_symlink()):
        raise RuntimeError("HOLD_STAGE_OWNER_DIRECTORY")
    proof=a.parent/"b-linux-independent-review-v2.json"
    if proof.exists():
        st=proof.lstat()
        if not (stat.S_ISREG(st.st_mode) and st.st_uid==1000 and
                st.st_nlink==1 and not proof.is_symlink() and
                not(stat.S_IMODE(st.st_mode)&0o022)):
            raise RuntimeError("HOLD_PROOF_OWNER")
        raw=proof.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=x["independent_proof_sha256"]:
            raise RuntimeError("HOLD_PROOF_SHA")
        r=json.loads(raw)
        if not (r.get("status")=="PASS_INDEPENDENT_LINUX_RUNTIME_BYTES_AND_EACH_TAR_MEMBER"
            and r.get("source_commit")==x["source"] and
            r.get("build_id")==x["build"] and
            r.get("runtime_archive_sha256")==x["archive_sha256"] and
            r.get("runtime_archive_bytes")==x["archive_bytes"] and
            r.get("run_id")==x["github_run_id"] and
            type(r.get("runtime_entries_verified")) is int and
            r["runtime_entries_verified"]+2==x["runtime_member_count"] and
            r.get("financial_authorized") is False):
            raise RuntimeError("HOLD_PROOF_SOURCE_IDENTITY")
    elif not (Path("/var/lib/aoe2war-product-release-v1")/x["source"][:12]/"state.json").is_file():
        raise RuntimeError("HOLD_INDEPENDENT_PROOF_REQUIRED")
    return x

CONFIG=load_exact_root_manifest()
PREVIOUS_ROOT=CONFIG["previous_root"]
PREVIOUS_SOURCE=CONFIG["previous_source"]
PREVIOUS_BUILD=CONFIG["previous_build"]
SOURCE=CONFIG["source"]
BUILD=CONFIG["build"]
VERSION=CONFIG["version"]
ARCHIVE=Path(CONFIG["archive_path"])
ARCHIVE_SHA=CONFIG["archive_sha256"]
ARCHIVE_BYTES=CONFIG["archive_bytes"]
EXPECTED_RUNTIME_MEMBERS=CONFIG["runtime_member_count"]
UNIT_ORIGINAL_SHA=CONFIG["previous_unit_sha256"]
TARGET=Path("/var/lib/aoe2war-web-prod-"+SOURCE[:12])
TEMP=Path(str(TARGET)+".preparing-product-v1")
JOURNAL=STATE_ROOT/SOURCE[:12]
ORIGINAL=JOURNAL/"original-web-unit.service"
CANDIDATE=JOURNAL/"factory-web-unit.service"
STATE=JOURNAL/"state.json"
PRECHECK=JOURNAL/"preflight.json"

FIN_MASKS=(
 "aoe2hdbets-bet-stake-reconcile.service",
 "aoe2hdbets-bet-stake-reconcile.timer",
 "aoe2hdbets-staking-rewards.service",
 "aoe2hdbets-staking-rewards.timer",
 "wolochain-mainnet-settlement.service",
 "wolochain-founder-rewards-settlement.service",
)

def hold(condition,reason):
    if not condition:raise RuntimeError("HOLD_PRODUCT_"+reason)

def sha_bytes(data):return hashlib.sha256(data).hexdigest()
def sha_file(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for part in iter(lambda:f.read(4*1024*1024),b""):h.update(part)
    return h.hexdigest()

def run(*args,timeout=40):
    p=subprocess.run(args,text=True,capture_output=True,timeout=timeout)
    hold(p.returncode==0,"COMMAND_"+Path(args[0]).name+"_"+str(p.returncode))
    return p.stdout.strip()
def property(unit,field):
    return run("systemctl","show",unit,"-p",field,"--value",timeout=10)
def url_status(port,route,timeout=5):
    req=urllib.request.Request("http://127.0.0.1:%d%s"%(port,route),
             headers={"Host":"aoe2war.com","Cache-Control":"no-cache"})
    try:
        with urllib.request.urlopen(req,timeout=timeout) as r:
            r.read(1024)
            return r.status
    except urllib.error.HTTPError as exc:
        return exc.code
    except Exception:
        return 0

def fsync_dir(path):
    fd=os.open(path,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:os.fsync(fd)
    finally:os.close(fd)

def atomic(path,data,mode=0o600):
    temp=path.with_name("."+path.name+".factory-v1.tmp")
    hold(not temp.exists() and not temp.is_symlink(),"TEMP_COLLISION")
    fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
    try:
        os.fchmod(fd,mode)
        with os.fdopen(fd,"wb",closefd=False) as f:
            f.write(data);f.flush()
        os.fsync(fd)
    finally:os.close(fd)
    os.replace(temp,path)
    fsync_dir(path.parent)

def json_save(path,obj):
    atomic(path,(json.dumps(obj,sort_keys=True,indent=2)+"\n").encode())
def json_get(path):
    hold(path.is_file() and not path.is_symlink(),"STATE_MISSING")
    return json.loads(path.read_bytes())

def guard_finance():
    p=subprocess.run(["ss","-H","-ltn"],capture_output=True,text=True,timeout=10)
    hold(p.returncode==0,"FINANCE_SOCKET_CENSUS")
    for line in p.stdout.splitlines():
        fields=line.split()
        if len(fields)>3:
            for port in (8092,8093,8094,8095):
                hold(not fields[3].endswith(":"+str(port)),"FINANCIAL_PORT_OPEN")
    for unit in FIN_MASKS:
        p=subprocess.run(["systemctl","is-enabled",unit],
          capture_output=True,text=True,timeout=10)
        hold(p.stdout.strip()=="masked","FINANCIAL_MASK_MISSING_"+unit)
    hold(url_status(3030,"/")==200,"ORIGINAL_3030_UNHEALTHY")

def protected():
    return {name:property(name,"MainPID") for name in (
       "aoe2hdbets-web.service","r25-c03-emergency-3033.service",
       "kingdom-traders-paper.service","wolochaind-mainnet.service")}
def hold_protected(before):
    hold(before==protected(),"PROTECTED_SERVICE_PID_CHANGED")
def guard_web():
    hold(property(SERVICE,"User")=="aoe2war-web-prod","WEB_UID")
    hold(property(SERVICE,"EnvironmentFiles").startswith("/etc/aoe2war/web-prod-v1/runtime.env"),
       "WEB_ENVIRONMENT")
    hold(property(SERVICE,"MemoryMax")=="3355443200","WEB_MEMORY_LIMIT")
    hold(property(SERVICE,"ActiveState")=="active","WEB_INACTIVE")
    hold(url_status(3032,"/")==200,"WEB_HTTP")
    hold(url_status(3032,"/api/bets")==503,"FINANCIAL_API_DENIAL")
    hold(url_status(3032,"/api/auth/session") in (401,403),"GUEST_SESSION_DENIAL")

def unit_guard(raw,root):
    text=raw.decode()
    for item in ("User=aoe2war-web-prod","Group=aoe2war-web-prod",
      "EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env",
      "ProtectSystem=strict","NoNewPrivileges=yes",
      "WARGRAPH_RUNTIME_DISABLED=true",
      "AOE2WAR_RUNTIME_PROFILE=nonfinancial-production-v1",
      "AOE2_BACKEND_UPSTREAM=http://127.0.0.1:3331",
      "NODE_OPTIONS=--require=/usr/local/lib/aoe2war-web-prod/r25_b_guard_production_v1.cjs",
      "PORT=3032","--port 3032",str(root)):
        hold(item in text,"UNIT_FENCE_MISSING_"+item[:16])
    hold(text.count(str(root))==4,"UNIT_PATH_BINDING_COUNT")
    for bad in ("ExecStartPre=/bin/bash","User=root","AmbientCapabilities="):
        hold(bad not in text,"UNIT_PRIVILEGE_EXPANSION")
    return text

def inspect_archive():
    st=ARCHIVE.lstat()
    hold(stat.S_ISREG(st.st_mode) and st.st_nlink==1 and st.st_uid==1000,
         "UNTRUSTED_ARTIFACT_OWNER")
    hold(st.st_size==ARCHIVE_BYTES and sha_file(ARCHIVE)==ARCHIVE_SHA,
         "ARCHIVE_SHA_OR_SIZE")
    with tarfile.open(ARCHIVE,"r:gz") as t:
        seen=set()
        for m in t:
            name=m.name
            pp=PurePosixPath(name)
            hold(name not in seen and not pp.is_absolute() and ".." not in pp.parts
                 and name not in ("",".","/"),"ARCHIVE_PATH")
            seen.add(name)
            hold(m.isfile() or m.issym(),"ARCHIVE_SPECIAL_MEMBER")
            if m.issym():
                link=m.linkname
                hold(not link.startswith("/") and not re.search(r"^[a-z]+:",link),
                     "ARCHIVE_ABSOLUTE_SYMLINK")
                dest=os.path.normpath(os.path.join("/",os.path.dirname(name),link))
                hold(dest.startswith("/") and not dest.startswith("/../"),"ARCHIVE_SYMLINK_ESCAPE")
        hold(len(seen)==EXPECTED_RUNTIME_MEMBERS,"ARCHIVE_MEMBER_COUNT")
        for marker,value in (
            (".aoe2war-source-sha",SOURCE),
            (".next/BUILD_ID",BUILD),
            (".aoe2war-build-version",VERSION)):
            f=t.extractfile(marker)
            hold(f is not None and f.read(256).decode().strip()==value,
                 "ARCHIVE_BUILD_MARKER_"+marker)
    return st.st_size

def create_journal():
    if not STATE_ROOT.exists():
        STATE_ROOT.mkdir(mode=0o700)
        fsync_dir(STATE_ROOT.parent)
    hold(STATE_ROOT.is_dir() and STATE_ROOT.stat().st_uid==0,
         "JOURNAL_OWNER")
    hold(not JOURNAL.exists() and not JOURNAL.is_symlink(),"RELEASE_JOURNAL_ALREADY_EXISTS")
    JOURNAL.mkdir(mode=0o700)
    fsync_dir(STATE_ROOT)

def stage():
    guard_finance()
    guard_web()
    hold(property(SERVICE,"WorkingDirectory")==PREVIOUS_ROOT,
         "EXPECTED_PREVIOUS_WEB_RUNTIME")
    hold(not TARGET.exists() and not TARGET.is_symlink(),"TARGET_EXISTS")
    hold(not TEMP.exists() and not TEMP.is_symlink(),"PARTIAL_EXTRACT_EXISTS")
    old=APP_UNIT.read_bytes()
    unit_guard(old,PREVIOUS_ROOT)
    prev=Path(PREVIOUS_ROOT)
    hold(prev.is_dir() and not prev.is_symlink() and
         (prev/".aoe2war-source-sha").read_text().strip()==PREVIOUS_SOURCE and
         (prev/".next/BUILD_ID").read_text().strip()==PREVIOUS_BUILD,
         "PREVIOUS_RUNTIME_SOURCE_DRIFT")
    proof=ARCHIVE.parent/"b-linux-independent-review-v2.json"
    hold(proof.is_file() and sha_file(proof)==CONFIG["independent_proof_sha256"],
         "STAGE_NEEDS_EXACT_INDEPENDENT_PROOF")
    checked=subprocess.run(["/usr/bin/python3","-I","-B",
        "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py",
        "--phase","inspect"],capture_output=True,text=True,timeout=20)
    hold(checked.returncode==0,"STEAM_SOURCE_COMPATIBILITY_PRE_STAGE")
    hold(sha_bytes(old)==UNIT_ORIGINAL_SHA,
         "ORIGINAL_UNIT_DRIFT")
    artifact_size=inspect_archive()
    du=shutil.disk_usage("/var/lib")
    hold(du.free>=6*1024**3,"DISK_HEADROOM")
    old_factory_http=url_status(3032,"/factory")
    hold(type(old_factory_http) is int and old_factory_http in (200,404),
         "OLD_FACTORY_HTTP_UNEXPECTED")
    before={"protected_pids":protected(),"old_web_pid":property(SERVICE,"MainPID"),
      "old_factory_http":old_factory_http,
      "old_unit_sha256":sha_bytes(old),
      "old_source":PREVIOUS_SOURCE,"old_build":PREVIOUS_BUILD,
      "artifact_sha256":ARCHIVE_SHA,"artifact_size":artifact_size,
      "timestamp":dt.datetime.now(dt.timezone.utc).isoformat()}
    new_unit=old.replace(str(PREVIOUS_ROOT).encode(),str(TARGET).encode())
    unit_guard(new_unit,TARGET)
    hold(new_unit.replace(str(TARGET).encode(),str(PREVIOUS_ROOT).encode())==old,
         "UNIT_DIFF_NOT_EXACTLY_RUNTIME")
    create_journal()
    atomic(ORIGINAL,old)
    atomic(CANDIDATE,new_unit)
    json_save(PRECHECK,before)
    json_save(STATE,{"phase":"extracting","source":SOURCE,"build":BUILD})
    TEMP.mkdir(mode=0o755)
    with tarfile.open(ARCHIVE,"r:gz") as t:
        t.extractall(TEMP,filter="data")
    for marker,value in (
       (".aoe2war-source-sha",SOURCE),
       (".next/BUILD_ID",BUILD),
       (".aoe2war-build-version",VERSION)):
        p=TEMP/marker
        hold(p.is_file() and not p.is_symlink() and p.read_text().strip()==value,
             "EXTRACTED_MARKER_"+marker)
    hold((TEMP/"node_modules/next/dist/bin/next").is_file(),"NEXT_RUNTIME_MISSING")
    # The GitHub runtime archive omits the ephemeral Next cache mountpoint.
    # Create only this empty runtime mountpoint before sealing the candidate.
    (TEMP/".next/cache").mkdir(mode=0o755,exist_ok=True)
    hold((TEMP/".next/cache").is_dir(),"NEXT_CACHE_MOUNTPOINT_MISSING")
    os.rename(TEMP,TARGET)
    fsync_dir(TARGET.parent)
    json_save(STATE,{"phase":"prepared","source":SOURCE,"build":BUILD,
      "candidate_unit_sha256":sha_bytes(new_unit),
      "archive_sha256":ARCHIVE_SHA})
    print("PASS_PRODUCT_SOURCE_STAGED",str(TARGET),flush=True)

def state_need(allowed):
    obj=json_get(STATE)
    hold(obj["source"]==SOURCE and obj["build"]==BUILD,"JOURNAL_IDENTITY")
    hold(obj["phase"] in allowed,"JOURNAL_PHASE_"+obj["phase"])
    hold(TARGET.is_dir() and not TARGET.is_symlink(),"EXTRACTED_TARGET_MISSING")
    hold((TARGET/".next/BUILD_ID").read_text().strip()==BUILD,
        "TARGET_BUILD_DRIFT")
    return obj

def expected_old_factory_http(precheck):
    value=precheck.get("old_factory_http")
    hold(type(value) is int and value in (200,404),
         "OLD_FACTORY_HTTP_RECEIPT_INVALID")
    return value

def target_health(target,precheck):
    runtime=PREVIOUS_ROOT if target=="old" else str(TARGET)
    source=PREVIOUS_SOURCE if target=="old" else SOURCE
    build=PREVIOUS_BUILD if target=="old" else BUILD
    expected_http=expected_old_factory_http(precheck) if target=="old" else 200
    root=Path(runtime)
    if not (property(SERVICE,"ActiveState")=="active" and
            property(SERVICE,"WorkingDirectory")==runtime and
            APP_UNIT.read_bytes()==(ORIGINAL if target=="old" else CANDIDATE).read_bytes()):
        return False
    if not (root.is_dir() and not root.is_symlink() and
            (root/".aoe2war-source-sha").is_file() and
            (root/".next/BUILD_ID").is_file()):
        return False
    if ((root/".aoe2war-source-sha").read_text().strip()!=source or
            (root/".next/BUILD_ID").read_text().strip()!=build):
        return False
    return (url_status(3032,"/")==200 and
            url_status(3032,"/factory")==expected_http and
            url_status(3032,"/api/bets")==503 and
            url_status(3032,"/api/auth/session") in (401,403))

def switch(target,phase,desired):
    guard_finance()
    oldunit=ORIGINAL.read_bytes()
    newunit=CANDIDATE.read_bytes()
    current=APP_UNIT.read_bytes()
    want=oldunit if target=="old" else newunit
    previous=newunit if target=="old" else oldunit
    hold(current==previous,"ACTIVE_UNIT_NOT_EXPECTED")
    base=json_get(PRECHECK)
    hold_protected(base["protected_pids"])
    json_save(STATE,{"phase":"switching_"+phase,"source":SOURCE,"build":BUILD,
       "old_unit_sha256":sha_bytes(oldunit),"new_unit_sha256":sha_bytes(newunit)})
    try:
        # Only the existing restricted 3032 web service changes.
        run("systemctl","stop",SERVICE,timeout=50)
        atomic(APP_UNIT,want,0o644)
        run("systemctl","daemon-reload",timeout=30)
        run("systemctl","start",SERVICE,timeout=70)
        healthy=False
        for i in range(35):
            if target_health(target,base):
                healthy=True;break
            time.sleep(1)
        hold(healthy,"TARGET_HEALTH_NOT_READY")
        guard_finance()
        hold_protected(base["protected_pids"])
        checked=subprocess.run(["/usr/bin/python3","-I","-B",
          "/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py",
          "--phase","inspect"],capture_output=True,text=True,timeout=20)
        hold(checked.returncode==0,"STEAM_PRODUCT_COMPATIBILITY")
        json_save(STATE,{"phase":phase,"source":SOURCE,"build":BUILD,
          "active_runtime":str(TARGET) if target=="new" else PREVIOUS_ROOT,
          "active_unit_sha256":sha_bytes(want),
          "web_pid":property(SERVICE,"MainPID"),
          "factory_http":expected_old_factory_http(base) if target=="old" else desired,
          "timestamp":dt.datetime.now(dt.timezone.utc).isoformat()})
        if target=="new":
            published=subprocess.run(["/usr/bin/python3","-I","-B",
              "/usr/local/sbin/aoe2war_factory_public_status_v2.py"],
              capture_output=True,text=True,timeout=30)
            hold(published.returncode==0,"DYNAMIC_PUBLIC_STATUS_NOT_READY")
        print("PASS_PRODUCT_"+phase.upper(),
              "FACTORY_HTTP",expected_old_factory_http(base) if target=="old" else desired,
              "PID",property(SERVICE,"MainPID"),flush=True)
    except Exception as ex:
        print("PRODUCT_SWITCH_FAILED",type(ex).__name__,str(ex),flush=True)
        if target=="new":
            # Automatic exact original 3032 unit restoration, never touch 3030.
            try:
                run("systemctl","stop",SERVICE,timeout=50)
                atomic(APP_UNIT,oldunit,0o644)
                run("systemctl","daemon-reload",timeout=30)
                run("systemctl","start",SERVICE,timeout=70)
                restored=False
                for i in range(35):
                    if target_health("old",base):
                        restored=True;break
                    time.sleep(1)
                guard_finance()
                hold(restored,"AUTOROLLBACK_HEALTH")
                json_save(STATE,{"phase":"auto_rolled_back","source":SOURCE,
                    "build":BUILD,"reason":str(ex)})
                print("PASS_EXACT_AUTOROLLBACK_ORIGINAL_3032",flush=True)
            except Exception as err:
                print("HOLD_UNKNOWN_RECOVERY_NEEDED",type(err).__name__,str(err),
                      flush=True)
                raise
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("phase",choices=("stage","activate","rollback","reactivate","release","status"))
    ap.add_argument("--manifest",required=True)
    args=ap.parse_args()
    hold(os.geteuid()==0,"ROOT_OS_OWNER_REQUIRED")
    fd=os.open(LOCK,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.phase=="stage":stage()
        elif args.phase=="release":
            stage()
            state_need(("prepared",))
            switch("new","live",200)
        elif args.phase=="activate":
            state_need(("prepared","auto_rolled_back"))
            switch("new","live",200)
        elif args.phase=="rollback":
            state_need(("live",))
            switch("old","rolled_back",expected_old_factory_http(json_get(PRECHECK)))
        elif args.phase=="reactivate":
            state_need(("rolled_back",))
            switch("new","live",200)
        else:
            print(json.dumps({"source":SOURCE,"factory_http":url_status(3032,"/factory"),
             "web_active":property(SERVICE,"ActiveState"),
             "web_runtime":property(SERVICE,"WorkingDirectory"),
             "journal":json_get(STATE) if STATE.exists() else None},indent=2))
    finally:
        os.close(fd)
if __name__=="__main__":
    try:main()
    except Exception as e:
        print("HOLD_PRODUCT_DEPLOY",type(e).__name__,str(e),flush=True)
        sys.exit(3)
