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
import shutil
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
    old_build=root_file(old/".next/BUILD_ID").decode("utf-8").strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{1,80}",old_build) is None:
        raise RuntimeError("ROLLOUT_PREVIOUS_BUILD_INVALID")
    return old_source,old_build

def accepted_root_seal(directory, source, build, summary_raw):
    """The final green beacon needs an actual complete root-side seal.

    Source and BUILD_ID headers alone prove the active website, not completion
    of all private root receipts. Missing/mismatched seal never promotes T10.
    """
    try:
        seal_path=directory/"release-seal-v1.json"
        events_path=directory/"release-events-v1.jsonl"
        if (not seal_path.exists() or not events_path.exists() or
            seal_path.lstat().st_size>20000 or
            events_path.lstat().st_size>8*1024*1024):
            return False
        seal=json.loads(root_file(seal_path,0o600))
        events_raw=root_file(events_path,0o600)
        if not events_raw.endswith(b"\n"):
            return False
        last=json.loads(events_raw.splitlines()[-1])
        if (seal.get("schema")!="aoe2war.product.release-seal.v1" or
            seal.get("sourceSha")!=source or seal.get("buildId")!=build or
            seal.get("financialAuthorized") is not False or
            seal.get("ledgerSha256")!=hashlib.sha256(events_raw).hexdigest() or
            seal.get("summarySha256")!=hashlib.sha256(summary_raw).hexdigest() or
            last.get("event")!="T10" or last.get("state")!="pass" or
            last.get("sourceSha")!=source or
            last.get("eventHash")!=seal.get("lastEventHash")):
            return False
        # Final receipt publication follows T10 and must include distinct
        # exact-source public witnesses and PR/CI provenance, not a filename
        # invented by the just-refreshed status publisher.
        for name in (
            "public-evidence-T7-v1.json", "public-evidence-T8-v1.json",
            "public-evidence-T9-v1.json", "source-qualification-v1.json",
            "pr-provenance-v1.json",
        ):
            proof=directory/name
            if not proof.exists() or proof.lstat().st_size>20000:
                return False
            payload=json.loads(root_file(proof,0o600))
            if (not isinstance(payload,dict) or
                payload.get("sourceSha")!=source):
                return False
        return True
    except (OSError,RuntimeError,ValueError,TypeError,IndexError,KeyError):
        return False

def public_release_summary(directory,source,build,now):
    """Project optional root-owned evidence; absent evidence stays UNKNOWN."""
    base={
        "schema":"aoe2war.product.release-summary.v1","sourceSha":source,
        "buildId":build,"generatedAt":now,"startKind":"unknown",
        "firstVerifiedProductionMs":None,"finalAcceptedMs":None,
        "clocksUncertaintyMs":None,"provenanceUrl":None,"stages":[],
        "disk":{"rootFreeBytes":shutil.disk_usage("/").free,
                "requiredBytes":6*1024**3,"observedAt":now},
    }
    path=directory/"release-summary-v1.json"
    if not path.exists():return base
    try:
        if path.lstat().st_size>20000:return base
        summary_raw=root_file(path,0o600)
        obj=json.loads(summary_raw)
        if (obj.get("schema")!=base["schema"] or obj.get("sourceSha")!=source or
            obj.get("buildId")!=build):return base
        has_t10=any(isinstance(row,dict) and row.get("event")=="T10"
                    and row.get("state")=="pass" for row in obj.get("stages",[]))
        root_seal_pass=not has_t10 or accepted_root_seal(
            directory,source,build,summary_raw)
        def timestamp(value):
            if not isinstance(value,str) or len(value)>40:return None
            parsed=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
            if parsed.tzinfo is None:return None
            return parsed.astimezone(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
        def number(value):
            return value if type(value) in (int,float) and 0<=value<=10**15 else None
        generated=timestamp(obj.get("generatedAt"))
        if not generated:return base
        rows=obj.get("stages")
        if not isinstance(rows,list) or len(rows)>24:return base
        result=[];seen=set()
        for row in rows:
            if not isinstance(row,dict):return base
            event=row.get("event");state=row.get("state")
            if (not isinstance(event,str) or
                re.fullmatch(r"[A-Za-z0-9_.-]{1,48}",event) is None or event in seen or
                state not in ("pending","running","pass","hold","fail","unknown","stale")):return base
            seen.add(event)
            at=timestamp(row.get("at")) if row.get("at") is not None else None
            proof=row.get("proofSha256")
            if proof is not None and (not isinstance(proof,str) or
                re.fullmatch(r"[a-f0-9]{64}",proof) is None):return base
            if state=="pass" and (not at or not proof):state="unknown"
            if event=="T10" and state=="pass" and not root_seal_pass:
                state="unknown"
            result.append({"event":event,"label":event,"state":state,"at":at,
                "durationMs":number(row.get("durationMs")),"proofSha256":proof})
        url=obj.get("provenanceUrl")
        if (not isinstance(url,str) or re.fullmatch(
            r"https://github\.com/Emaren/app-prodn/(?:pull/[0-9]+|issues/[0-9]+|actions/runs/[0-9]+)(?:#[A-Za-z0-9_-]+)?",url) is None):url=None
        start=obj.get("startKind")
        if start not in ("observed-engineering","declared-request","unknown"):start="unknown"
        base.update({"generatedAt":generated,"startKind":start,
            "firstVerifiedProductionMs":number(obj.get("firstVerifiedProductionMs")),
            "finalAcceptedMs":number(obj.get("finalAcceptedMs")) if root_seal_pass else None,
            "clocksUncertaintyMs":number(obj.get("clocksUncertaintyMs")),
            "stages":result,"provenanceUrl":url})
        transfer=obj.get("transfer")
        if isinstance(transfer,dict) and transfer.get("state") in (
            "pending","running","pass","hold","fail","unknown","stale"):
            values={key:number(transfer.get(key)) for key in (
                "bytes","totalBytes","throughputBps","elapsedMs","retryCount","resumedBytes")}
            total=values["totalBytes"];received=values["bytes"]
            if (received is not None and values["retryCount"] is not None and
                values["resumedBytes"] is not None and
                (total is None or (total>0 and received<=total))):
                expected=transfer.get("expectedSha256")
                if not isinstance(expected,str) or re.fullmatch(r"[a-f0-9]{64}",expected) is None:expected=None
                verification=transfer.get("verification")
                if verification not in ("pass","fail"):verification="unknown"
                base["transfer"]={**values,"state":transfer["state"],
                    "expectedSha256":expected,"verification":verification}
        return base
    except (OSError,ValueError,TypeError,RuntimeError):
        return base

def make():
    now=iso_now()
    pid,source,build,directory=trusted_web_identity()
    rt=Path(directory)
    state,root_journal=journal_for(source,build,rt)
    prev,previous_build=previous_from_journal(root_journal)
    web=status("/")==200 and status("/factory")==200
    guest=status("/api/auth/session") in (401,403)
    money_api=status("/api/bets")==503
    backup=status("/",3030)==200
    if not all((web,guest,money_api,backup)):
        raise RuntimeError("PRODUCTION_HTTP_DENIAL_OR_ROLLBACK_UNHEALTHY")
    # Current host checks are separate from source/CI/artifact/rollback proof.
    stage_map={name:"unknown" for name in STAGES}
    groups=[{"id":name,"state":"unknown","passed":None,"total":None}
            for name in GROUPS]
    groups[GROUPS.index("release")]={"id":"release","state":"pass","passed":5,"total":5}
    stamp=state.get("timestamp")
    activity=[]
    if isinstance(stamp,str):
        try:
            parsed=dt.datetime.fromisoformat(stamp.replace("Z","+00:00"))
            if parsed.tzinfo is not None:
                normalized=parsed.astimezone(dt.timezone.utc).isoformat(
                    timespec="milliseconds").replace("+00:00","Z")
                age=(dt.datetime.fromisoformat(now.replace("Z","+00:00"))-
                     parsed.astimezone(dt.timezone.utc)).total_seconds()
                if -60<=age<=72*3600:
                    activity=[{"id":"web-release-"+source[:12],
                        "label":"Current website source and host checks observed",
                        "state":"pass","at":normalized}]
        except ValueError:
            pass
    summary=public_release_summary(root_journal,source,build,now)
    by_event={row["event"]:row for row in summary["stages"]}
    now_dt=dt.datetime.fromisoformat(now.replace("Z","+00:00"))
    summary_age=(now_dt-dt.datetime.fromisoformat(
        summary["generatedAt"].replace("Z","+00:00"))).total_seconds()
    def evidence(event):
        row=by_event.get(event)
        if not row:return "unknown"
        state=row["state"];stamp=row["at"]
        if state=="pass" and (not stamp or not row["proofSha256"]):return "unknown"
        if stamp:
            age=(now_dt-dt.datetime.fromisoformat(stamp.replace("Z","+00:00"))).total_seconds()
            if age < -60:return "unknown"
            if age>86400 or (state=="running" and age>600):return "stale"
        if summary_age < -60:return "unknown"
        if summary_age>86400:return "stale"
        return state
    required={"develop":["T2"],"test":["T3"],"build":["T4"],"approve":["T4"],
              "deploy":["T6"],"verify":["T7"],"rollback":["T8","T9","T10"]}
    for stage,events in required.items():
        values=[evidence(event) for event in events]
        if all(value=="pass" for value in values):stage_map[stage]="pass"
        else:
            stage_map[stage]=next((value for value in (
                "fail","hold","stale","running","pending","unknown") if value in values),"unknown")
    return {
       "schema":"aoe2war.factory.public.v1","generatedAt":now,
       "liveRelease":{"id":source,"buildId":build,"status":"pass","verifiedAt":now},
       "candidateRelease":{"id":None,"status":"unknown","verifiedAt":None},
       "previousRelease":{"id":prev,"buildId":previous_build,"status":"pass","verifiedAt":now},
       "pipelineStage":{"active":next((name for name in STAGES if stage_map[name]=="running"),None),
                        "stages":stage_map},
       "serviceHealth":[{"id":"website","state":"pass"},
          {"id":"identity","state":"unknown"},{"id":"media","state":"unknown"},
          {"id":"public-api","state":"pass" if money_api and status("/players")==200 else "hold"},
          {"id":"release","state":"pass"}],
       "testGroups":groups,"recentActivity":activity,"releaseOs":summary,
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
