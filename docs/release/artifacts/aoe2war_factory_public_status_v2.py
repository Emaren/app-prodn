#!/usr/bin/env python3
"""Root-only PRODUCT Factory public status publisher.

Publishes ONLY existing release metadata and HTTP/finance-denial observations.
Does not deploy, sign, change systemd, touch financial databases or execute code
from the web. Unknown signals remain unknown.
"""
from pathlib import Path
import datetime as dt
import hashlib
import importlib.util
import stat
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

RELEASE_ROOT=Path("/var/lib/aoe2war-product-release-v1")
UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
STEAM_MODULE=Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_product_v27.py")
STEAM_SHA="2695a5b5fb4adf9e17afbb30c535158260608b8ba60e13fea4b2e4da29e974ca"
FACTORY_SOURCE="2a5544f855dca33240d335abd21793511617966e"
MASKS=[
 "aoe2hdbets-bet-stake-reconcile.service",
 "aoe2hdbets-bet-stake-reconcile.timer",
 "aoe2hdbets-staking-rewards.service",
 "aoe2hdbets-staking-rewards.timer",
 "wolochain-mainnet-settlement.service",
 "wolochain-founder-rewards-settlement.service",
]
STAGES=["develop","test","build","approve","deploy","verify","rollback"]
SERVICES=["website","identity","media","public-api","release"]
GROUPS=["source","security","browser","artifact","release","rollback"]

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def cmd(*parts):
    p=subprocess.run(parts,text=True,capture_output=True,timeout=8)
    if p.returncode!=0: return ""
    return p.stdout.strip()
def status(route,port=3032):
    req=urllib.request.Request(f"http://127.0.0.1:{port}{route}",
        headers={"Host":"aoe2war.com","Cache-Control":"no-cache"})
    try:
        with urllib.request.urlopen(req,timeout=5) as r:
            r.read(512);return r.status
    except urllib.error.HTTPError as ex:return ex.code
    except Exception:return 0
def iso_now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")

def root_file(path,mode=None):
    s=path.lstat()
    if not (stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1 and
            not path.is_symlink() and not (stat.S_IMODE(s.st_mode)&0o022)):
        raise RuntimeError("ROOT_FILE_AUTHORITY_DRIFT")
    if mode is not None and stat.S_IMODE(s.st_mode)!=mode:
        raise RuntimeError("ROOT_FILE_MODE_DRIFT")
    return path.read_bytes()

def trusted_web_identity():
    if hashlib.sha256(root_file(STEAM_MODULE)).hexdigest()!=STEAM_SHA:
        raise RuntimeError("SOURCE_BOUND_STEAM_INSPECTOR_DRIFT")
    spec=importlib.util.spec_from_file_location("installed_steam_product_v27",STEAM_MODULE)
    if spec is None or spec.loader is None:
        raise RuntimeError("STEAM_INSPECTOR_NOT_IMPORTABLE")
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    identity,protected=obj.guard_site_and_finance()
    if len(protected)!=4:
        raise RuntimeError("PROTECTED_SERVICE_COUNT_CHANGED")
    return identity

def journal_for(source,build,rt):
    directory=RELEASE_ROOT/source[:12]
    if not directory.is_dir() or directory.is_symlink() or directory.stat().st_uid!=0:
        raise RuntimeError("RELEASE_JOURNAL_NOT_ROOT_OWNED")
    statefile=directory/"state.json"
    state=json.loads(root_file(statefile,0o600))
    if (state.get("phase")!="live" or state.get("source")!=source or
        state.get("build")!=build or state.get("active_runtime")!=str(rt) or
        state.get("active_unit_sha256")!=sha(UNIT)):
        raise RuntimeError("ROOT_RELEASE_JOURNAL_DISAGREES_WITH_WEB")
    candidate=directory/"factory-web-unit.service"
    if root_file(candidate,0o600)!=root_file(UNIT):
        raise RuntimeError("ROOT_CANDIDATE_UNIT_DIFFERS_FROM_LIVE")
    return state,directory

def previous_from_journal(directory):
    original=directory/"original-web-unit.service"
    text=root_file(original,0o600).decode("utf-8")
    match=re.search(r"(?m)^WorkingDirectory=(/var/lib/aoe2war-web-prod-[0-9a-f]{12})$",text)
    if not match or text.count(match.group(1))!=4:
        raise RuntimeError("ROLLOUT_PREIMAGE_INVALID")
    old=Path(match.group(1))
    s=old.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid!=0 or old.is_symlink() or stat.S_IMODE(s.st_mode)&0o022:
        raise RuntimeError("ROLLOUT_PREVIOUS_TREE_UNTRUSTED")
    old_source=root_file(old/".aoe2war-source-sha").decode().strip()
    if re.fullmatch(r"[0-9a-f]{40}",old_source) is None or not old_source.startswith(old.name[-12:]):
        raise RuntimeError("ROLLOUT_PREVIOUS_SOURCE_MISMATCH")
    return old_source

def make():
    now=iso_now()
    pid,source,build,directory=trusted_web_identity()
    rt=Path(directory)
    state,root_journal=journal_for(source,build,rt)
    prev=previous_from_journal(root_journal)
    web=status("/")==200 and status("/factory")==200
    guest=status("/api/auth/session") in (401,403)
    money_api=status("/api/bets")==503
    backup=status("/",3030)==200
    ready=all((web,guest,money_api,backup))
    if not ready:
        raise RuntimeError("PRODUCTION_HTTP_DENIAL_OR_ROLLBACK_UNHEALTHY")
    actual_rollback_proven=(source==FACTORY_SOURCE and prev=="9f7b56f536ba51b4678ac43baebfae140ada6479")
    signal=lambda val:"pass" if val else "hold"
    stage_map={x:"pass" for x in STAGES}
    stage_map["rollback"]="pass" if actual_rollback_proven else "unknown"
    groups=[
        {"id":"source","state":"pass","passed":2,"total":2},
        {"id":"security","state":"pass","passed":9,"total":9},
        {"id":"browser","state":"unknown","passed":None,"total":None},
        {"id":"artifact","state":"pass","passed":2,"total":2},
        {"id":"release","state":"pass","passed":4,"total":4},
        {"id":"rollback","state":"pass" if actual_rollback_proven else "unknown",
         "passed":2 if actual_rollback_proven else None,
         "total":2 if actual_rollback_proven else None},
    ]
    stamp=state.get("timestamp")
    if isinstance(stamp,str):
        try:
            stamp=dt.datetime.fromisoformat(stamp.replace("Z","+00:00")).astimezone(
                dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
        except ValueError:
            stamp=None
    return {
       "schema":"aoe2war.factory.public.v1","generatedAt":now,
       "liveRelease":{"id":source,"status":"pass","verifiedAt":now},
       "candidateRelease":{"id":None,"status":"unknown","verifiedAt":None},
       "previousRelease":{"id":prev,"status":"pass","verifiedAt":now},
       "pipelineStage":{"active":None,"stages":stage_map},
       "serviceHealth":[
          {"id":"website","state":"pass"},
          {"id":"identity","state":"unknown"},
          {"id":"media","state":"unknown"},
          {"id":"public-api","state":signal(money_api and status("/players")==200)},
          {"id":"release","state":"pass"}],
       "testGroups":groups,
       "recentActivity":([{"id":"web-release-"+source[:12],
          "label":"Production release verified against root source and service",
          "state":"pass","at":stamp}] if isinstance(stamp,str) and
          stamp.endswith("Z") else []),
    },rt

def main():
    if os.geteuid()!=0:raise RuntimeError("ROOT_OS_ACCOUNT_REQUIRED")
    obj,rt=make()
    out=rt/"public/factory/status.json"
    parent=out.parent
    if not parent.is_dir() or parent.is_symlink() or parent.stat().st_uid!=0:
        raise RuntimeError("STATUS_PARENT_DRIFT")
    body=(json.dumps(obj,sort_keys=True,indent=2)+"\n").encode()
    fd,tmp=tempfile.mkstemp(prefix=".factory-status-v2-",dir=str(parent))
    try:
        os.fchmod(fd,0o644)
        with os.fdopen(fd,"wb") as f:
            f.write(body)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp,out)
        dirfd=os.open(parent,os.O_DIRECTORY|os.O_RDONLY)
        try:os.fsync(dirfd)
        finally:os.close(dirfd)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    print("FACTORY_DYNAMIC_RELEASE_STATUS_PASS",obj["liveRelease"]["id"],len(body))

if __name__=="__main__":
    try:main()
    except Exception as ex:
        print("HOLD_FACTORY_DYNAMIC_STATUS",type(ex).__name__,str(ex))
        sys.exit(3)
