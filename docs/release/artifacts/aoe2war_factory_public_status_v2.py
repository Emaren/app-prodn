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
MANIFEST_ROOT=Path("/root/aoe2war-product-release-manifests")
DATA_VOLUME=Path("/mnt/HC_Volume_105319120")
DATA_STAGE_BASE=DATA_VOLUME/"aoe2war/we2-factory-artifact-stage-v1"
DATA_STAGE_DEV=2064
DATA_STAGE_OWNER_UID=0
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

def accepted_root_seal(directory, source, build, previous_source, previous_build, summary_raw):
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
        # The rollback witness T8 belongs to the previous runtime. It MUST
        # never be checked against the candidate SHA or accepted on filename
        # alone. Other public witnesses belong to the candidate.
        expected={
            "public-evidence-T7-v1.json":(source,build),
            "public-evidence-T8-v1.json":(previous_source,previous_build),
            "public-evidence-T9-v1.json":(source,build),
            "source-qualification-v1.json":(source,None),
            "pr-provenance-v1.json":(source,None),
        }
        for name, (expected_source,expected_build) in expected.items():
            proof=directory/name
            if (not isinstance(expected_source,str) or
                not proof.exists() or proof.lstat().st_size>20000):
                return False
            payload=json.loads(root_file(proof,0o600))
            if (not isinstance(payload,dict) or
                payload.get("sourceSha")!=expected_source):
                return False
            if expected_build is not None and (
                payload.get("buildId")!=expected_build or
                payload.get("financialHttpStatus")!=503 or
                payload.get("financialAuthorized") is not False
            ):
                return False
        return True
    except (OSError,RuntimeError,ValueError,TypeError,IndexError,KeyError):
        return False

def public_release_summary(directory,source,build,now,previous_source=None,previous_build=None):
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
            directory,source,build,previous_source,previous_build,summary_raw)
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


def public_volume(path):
    try:
        value=os.statvfs(path)
        unit=value.f_frsize
        total=value.f_blocks*unit
        free=value.f_bfree*unit
        available=value.f_bavail*unit
        if not (unit>0 and 0<=available<=free<=total and total>0):
            return None
        used=total-free
        denominator=used+available
        if denominator<=0:return None
        return {"totalBytes":total,"usedBytes":used,"availableBytes":available,
                "reservedBytes":free-available,
                "usedPercent":(used*100+denominator-1)//denominator}
    except OSError:
        return None

def public_storage(now):
    data=None
    try:
        # A missing mount must never be reported as data-volume capacity.
        if (not DATA_VOLUME.is_symlink() and os.path.ismount(DATA_VOLUME) and
            os.stat(DATA_VOLUME).st_dev!=os.stat("/").st_dev):
            data=public_volume(DATA_VOLUME)
    except OSError:
        pass
    return {"schema":"aoe2war.factory.storage.v1","observedAt":now,
            "source":"host-statvfs","root":public_volume("/"),"data":data}

def invocation_stamp(value):
    if not isinstance(value,str) or len(value)>40:return None
    try:
        parsed=dt.datetime.fromisoformat(value.replace("Z","+00:00"))
        return parsed.astimezone(dt.timezone.utc) if parsed.tzinfo is not None else None
    except ValueError:
        return None

def invocation_number(value):
    return type(value) in (int,float) and 0<=value<=10**15

def verified_data_v3_archive(manifest,source,run):
    """Recheck the exact frozen DATA archive without trusting caller paths.

    Source/run/device/inode, owner/mode, length and content SHA are all
    required. This is read-only; a failed or raced inspection is UNKNOWN.
    """
    if (manifest.get("transport_mode")!="data-archive-v1" or
        type(manifest.get("archive_dev")) is not int or
        manifest["archive_dev"]!=DATA_STAGE_DEV or
        type(manifest.get("archive_inode")) is not int or
        manifest["archive_inode"]<=0):
        return False
    stage=DATA_STAGE_BASE/(".aoe2war-b-os-"+source[:12]+"-run-"+str(run))
    archive=stage/"runtime.tar.gz"
    if manifest.get("archive_path")!=str(archive):
        return False
    sd=stage.lstat()
    if (stage.is_symlink() or not stat.S_ISDIR(sd.st_mode) or
        sd.st_uid!=DATA_STAGE_OWNER_UID or sd.st_dev!=DATA_STAGE_DEV or
        stat.S_IMODE(sd.st_mode)!=0o700):
        return False
    fd=os.open(archive,os.O_RDONLY|os.O_NOFOLLOW)
    try:
        before=os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or
            before.st_uid!=DATA_STAGE_OWNER_UID or before.st_nlink!=1 or
            stat.S_IMODE(before.st_mode)!=0o400 or
            before.st_dev!=DATA_STAGE_DEV or
            before.st_ino!=manifest["archive_inode"] or
            before.st_size!=manifest["archive_bytes"]):
            return False
        digest=hashlib.sha256()
        while True:
            data=os.read(fd,1024*1024)
            if not data:break
            digest.update(data)
        after=os.fstat(fd)
        return (
            (before.st_dev,before.st_ino,before.st_size,
             before.st_mtime_ns,before.st_ctime_ns)==
            (after.st_dev,after.st_ino,after.st_size,
             after.st_mtime_ns,after.st_ctime_ns) and
            digest.hexdigest()==manifest["archive_sha256"])
    finally:
        os.close(fd)


def public_deployment_invocation(directory,source,build,previous_source,previous_build,now):
    """Read the ninth receipt; never derive a deployment clock from T0.

    Raw monotonic samples are validated privately and deliberately excluded
    from public JSON. The timing receipt's publication is outside its clocks.
    """
    path=directory/"deployment-invocation-v1.json"
    try:
        if not path.exists() or path.lstat().st_size>32768:return None
        raw=root_file(path,0o600)
        obj=json.loads(raw)
        if not isinstance(obj,dict):return None
        if (obj.get("schema")!="aoe2war.product.deployment-invocation.v1" or
            obj.get("sourceSha")!=source or obj.get("buildId")!=build or
            obj.get("previousSourceSha")!=previous_source or
            obj.get("previousBuildId")!=previous_build or
            obj.get("financialAuthorized") is not False or
            obj.get("metricPublicationIncluded") is not False or
            obj.get("acceptanceBoundary")!="eight-root-T10-final-readbacks" or
            obj.get("clockSource")!="python.time.monotonic_ns" or
            obj.get("utcClockSource")!="python.datetime.now(UTC)" or
            obj.get("clockPrecisionMs")!=1 or obj.get("uncertaintyMs") is not None):
            return None
        identifier=obj.get("invocationId")
        if (not isinstance(identifier,str) or re.fullmatch(
            r"(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})",
            identifier) is None):return None
        kind=obj.get("kind");coverage=obj.get("coverage")
        if kind not in ("cold","warm","resume","no-op","unknown") or coverage not in ("full","partial","none"):
            return None
        started=invocation_stamp(obj.get("startedAt"))
        completed=invocation_stamp(obj.get("completedAt"))
        observed=invocation_stamp(now)
        if not started or not completed or not observed or completed<started:return None
        age=(observed-completed).total_seconds()
        if age < -60 or age>86400:return None

        origin=obj.get("monotonicOriginNs")
        accepted=obj.get("acceptedMonotonicNs")
        resolution=obj.get("monotonicResolutionNs")
        first=obj.get("firstLiveMonotonicNs")
        if not (type(origin) is int and type(accepted) is int and
                0<=origin<accepted and type(resolution) is int and
                0<resolution<=1_000_000):
            return None
        elapsed=(accepted-origin)/1_000_000
        if not invocation_number(obj.get("observedInvocationMs")) or abs(obj["observedInvocationMs"]-elapsed)>1:
            return None
        full=coverage=="full" and kind in ("cold","warm")
        if full:
            if not (type(first) is int and origin<first<=accepted and
                    invocation_number(obj.get("firstVerifiedLiveMs")) and
                    invocation_number(obj.get("durableAcceptanceMs")) and
                    obj["firstVerifiedLiveMs"]>0 and
                    obj["durableAcceptanceMs"]>=obj["firstVerifiedLiveMs"] and
                    abs(obj["firstVerifiedLiveMs"]-(first-origin)/1_000_000)<=1 and
                    abs(obj["durableAcceptanceMs"]-elapsed)<=1):
                return None
        elif obj.get("firstVerifiedLiveMs") is not None or obj.get("durableAcceptanceMs") is not None:
            return None

        seal_raw=root_file(directory/"release-seal-v1.json",0o600)
        seal_sha=hashlib.sha256(seal_raw).hexdigest()
        if obj.get("rootSealSha256")!=seal_sha:return None
        summary_raw=root_file(directory/"release-summary-v1.json",0o600)
        if not accepted_root_seal(directory,source,build,previous_source,previous_build,summary_raw):
            return None
        run=obj.get("githubRunId")
        if type(run) is not int or run<=0:return None
        manifest_path=MANIFEST_ROOT/(source[:12]+"-run-"+str(run)+".json")
        if manifest_path.lstat().st_size>20000:return None
        manifest=json.loads(root_file(manifest_path,0o600))
        if (manifest.get("schema") not in ("aoe2war.product.web-release-manifest.v2", "aoe2war.product.web-release-manifest.v3") or
            manifest.get("financial_authorized") is not False or
            manifest.get("archive_bytes")!=obj.get("runtimeArchiveBytes") or
            manifest.get("source")!=source or manifest.get("build")!=build or
            manifest.get("github_run_id")!=run or
            manifest.get("previous_source")!=previous_source or
            manifest.get("previous_build")!=previous_build or
            manifest.get("archive_sha256")!=obj.get("artifactSha256")):
            return None
        schema=manifest.get("schema")
        if schema=="aoe2war.product.web-release-manifest.v3":
            if not verified_data_v3_archive(manifest,source,run):
                return None
        elif any(name in manifest for name in (
            "transport_mode","archive_dev","archive_inode","archive_path")):
            # Never relabel a DATA release as historical ROOT V2.
            return None
        artifact=obj.get("artifactSha256")
        if not isinstance(artifact,str) or re.fullmatch(r"[a-f0-9]{64}",artifact) is None:return None
        for field in ("runtimeArchiveBytes","extractedBytes"):
            if obj.get(field) is not None and not invocation_number(obj[field]):return None

        allowed={
            "START","DEPLOYMENT STARTED","READ-ONLY PLAN","TRANSPORT","NO-OP","RECOVERY",
            "SOURCE VERIFIED","CI ACCEPTED","ARTIFACT VERIFIED","TRANSPORT COMPLETE",
            "STAGED","LIVE HTTPS VERIFIED","ROLLBACK VERIFIED","ROLLBACK PRIOR EVIDENCE",
            "REACTIVATED","T10 DURABLY SEALED",
        }
        rows=obj.get("timeline")
        if not isinstance(rows,list) or not 2<=len(rows)<=32:return None
        timeline=[];last_elapsed=-1
        for row in rows:
            if not isinstance(row,dict) or row.get("phase") not in allowed:return None
            state=row.get("state")
            if state not in ("pending","running","pass","hold","fail","unknown","stale"):return None
            at=invocation_stamp(row.get("at"));duration=row.get("elapsedMs")
            proof=row.get("proofSha256")
            if not at or not invocation_number(duration) or duration<last_elapsed:return None
            if duration>elapsed+1:return None
            if proof is not None and (not isinstance(proof,str) or re.fullmatch(r"[a-f0-9]{64}",proof) is None):
                return None
            last_elapsed=duration
            timeline.append({"phase":row["phase"],"state":state,"at":row["at"],
                             "elapsedMs":duration,"proofSha256":proof})
        if (timeline[0]["phase"]!="START" or timeline[0]["elapsedMs"]!=0 or
            invocation_stamp(timeline[0]["at"])!=started or
            timeline[-1]["phase"]!="T10 DURABLY SEALED" or
            timeline[-1]["state"]!="pass" or
            invocation_stamp(timeline[-1]["at"])!=completed or
            abs(timeline[-1]["elapsedMs"]-elapsed)>1 or
            timeline[-1]["proofSha256"]!=seal_sha):
            return None
        bindings={
            "LIVE HTTPS VERIFIED":("public-evidence-T7-v1.json",source,build),
            "ROLLBACK VERIFIED":("public-evidence-T8-v1.json",previous_source,previous_build),
            "ROLLBACK PRIOR EVIDENCE":("public-evidence-T8-v1.json",previous_source,previous_build),
            "REACTIVATED":("public-evidence-T9-v1.json",source,build),
        }
        for phase,(filename,expected_source,expected_build) in bindings.items():
            matches=[row for row in timeline if row["phase"]==phase]
            if full and phase!="ROLLBACK PRIOR EVIDENCE" and len(matches)!=1:return None
            if len(matches)>1:return None
            if matches:
                proof_raw=root_file(directory/filename,0o600)
                body=json.loads(proof_raw)
                proof_sha=hashlib.sha256(proof_raw).hexdigest()
                # The first HTTPS stop precedes witness-file serialization.
                # Enrich only its public projection from the already T10-bound T7 file.
                supplied=matches[0]["proofSha256"]
                if (matches[0]["state"]!="pass" or
                    (supplied!=proof_sha and not (phase=="LIVE HTTPS VERIFIED" and supplied is None)) or
                    body.get("sourceSha")!=expected_source or body.get("buildId")!=expected_build):
                    return None
                if phase=="LIVE HTTPS VERIFIED":matches[0]["proofSha256"]=proof_sha
        if full:
            live=next(row for row in timeline if row["phase"]=="LIVE HTTPS VERIFIED")
            if abs(live["elapsedMs"]-obj["firstVerifiedLiveMs"])>1:return None

        url=obj.get("provenanceUrl")
        if (not isinstance(url,str) or re.fullmatch(
            r"https://github\.com/Emaren/app-prodn/(?:pull/[0-9]+|issues/[0-9]+|actions/runs/[0-9]+)(?:#[A-Za-z0-9_-]+)?",
            url) is None):url=None
        # Explicit allowlist: no boot-relative raw monotonic samples or paths.
        fields=(
            "schema","invocationId","sourceSha","buildId","githubRunId","kind","coverage",
            "startedAt","completedAt","clockSource","utcClockSource","clockPrecisionMs",
            "uncertaintyMs","firstVerifiedLiveMs","durableAcceptanceMs","observedInvocationMs",
            "previousSourceSha","previousBuildId","artifactSha256","runtimeArchiveBytes",
            "extractedBytes","rootSealSha256","acceptanceBoundary","metricPublicationIncluded",
            "financialAuthorized",
        )
        out={field:obj.get(field) for field in fields}
        out.update({"receiptSha256":hashlib.sha256(raw).hexdigest(),
                    "provenanceUrl":url,"timeline":timeline})
        return out
    except (OSError,RuntimeError,ValueError,TypeError,KeyError,StopIteration):
        return None


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
    summary=public_release_summary(root_journal,source,build,now,prev,previous_build)
    invocation=public_deployment_invocation(root_journal,source,build,prev,previous_build,now)
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
       "storage":public_storage(now),
       **({"deploymentInvocation":invocation} if invocation is not None else {}),
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
