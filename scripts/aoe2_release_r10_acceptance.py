#!/usr/bin/env python3
"""R10 read-only HEL1 postflight: F's *actual* root journal + website receipt.

This checker does not stage, install, activate, roll back, sign, or approve.
A signature from an owner/producer is not synthesized here. Missing root-issued
certification/rollback-drill bindings produce HOLD, not a production PASS.
Run ONLY after owner's separate approved F activation, and only from independently
reviewed root-installed bytes. Unit-test fixtures NEVER imply a live acceptance.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import pathlib
import re
import socket
import stat
import subprocess
import sys
from datetime import datetime, timezone
from urllib.request import Request, build_opener, HTTPRedirectHandler

W1="b46a51f1592c9f296839924ae55e722618b10d35"
W1_PREVIOUS="33e0f42b3d34d324b6cbab6c0347d4f5aff6fb8a"
POST_W1="fa5c350b35cba7ace8d4515a7ad52ba4e1534295"
TRAIN={"W1":(W1,W1_PREVIOUS),"POST_W1":(POST_W1,W1)}
ROOT=pathlib.Path("/var/lib/aoe2war-solo-website-v1")
REPO=pathlib.Path("/var/www/AoE2HDBets/app-prodn")
SERVICE="aoe2hdbets-web.service"
RECEIPTS=pathlib.Path("/mnt/HC_Volume_105319120/aoe2war/deploy-receipts")
HEX64=re.compile(r"[a-f0-9]{64}\Z")
BUILD=re.compile(r"[a-zA-Z0-9_-]{8,128}\Z")

class Hold(Exception): pass

def require(flag,reason):
    if not flag: raise Hold(reason)

def sha(raw): return hashlib.sha256(raw).hexdigest()

def unique(pairs):
    result={}
    for k,v in pairs:
        require(k not in result,"DUPLICATE_EVIDENCE_KEY")
        result[k]=v
    return result

def canonical(obj):
    return json.dumps(obj,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")

def protected(path,maxsize=262144):
    """Root protected, no symlink at ANY ancestor, single-descriptor read."""
    p=pathlib.Path(path)
    require(p.is_absolute(),"RELATIVE_TRUST_PATH")
    for x in (p,*p.parents):
        st=x.lstat()
        require(not stat.S_ISLNK(st.st_mode) and st.st_uid==0 and
                (st.st_mode&0o022)==0,"UNTRUSTED_EVIDENCE_ANCESTOR")
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and 0<st.st_size<=maxsize,"BAD_EVIDENCE_FILE")
        data=os.read(fd,maxsize+1)
        require(len(data)==st.st_size,"EVIDENCE_MUTATION_DURING_READ")
        return data
    finally: os.close(fd)

def ordinary(path,maxsize=262144):
    """Untrusted original F deployment receipt, checked against root attestations."""
    p=pathlib.Path(path)
    require(p.is_absolute() and not p.is_symlink(),"UNSAFE_ORIGINAL_RECEIPT")
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        st=os.fstat(fd)
        require(stat.S_ISREG(st.st_mode) and 0<st.st_size<=maxsize,"BAD_ORIGINAL_RECEIPT")
        b=os.read(fd,maxsize+1)
        require(len(b)==st.st_size,"ORIGINAL_RECEIPT_CHANGED_DURING_READ")
        return b
    finally: os.close(fd)

def doc(raw):
    parsed=json.loads(raw,object_pairs_hook=unique)
    require(type(parsed) is dict,"INVALID_JSON_OBJECT")
    return parsed

def cmd(argv,timeout=12):
    res=subprocess.run(argv,stdin=subprocess.DEVNULL,capture_output=True,text=True,
                       timeout=timeout,check=False)
    require(res.returncode==0,"NATIVE_COMMAND_HOLD:"+pathlib.Path(argv[0]).name)
    return res.stdout.strip()

def cert(raw):
    out={}
    for line in raw.decode("utf8").splitlines():
        require("=" in line,"F_CERT_LINE_INVALID")
        key,value=line.split("=",1)
        require(key and key not in out and "\x00" not in value,"F_CERT_DUPLICATE_OR_INVALID")
        out[key]=value
    return out

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*_): raise Hold("HTTP_REDIRECT_FORBIDDEN")

def web_version(url):
    req=Request(url,headers={"Accept":"application/json","Cache-Control":"no-cache"})
    with build_opener(NoRedirect).open(req,timeout=10) as reply:
        require(reply.status==200,"VERSION_HTTP_NOT_200")
        require("no-store" in reply.headers.get("Cache-Control","").lower(),"VERSION_CACHEABLE")
        raw=reply.read(4097)
        require(len(raw)<=4096,"VERSION_OVERSIZE")
    val=doc(raw).get("buildVersion")
    require(type(val) is str and val and val!="unknown","VERSION_UNKNOWN")
    return val

def artifact_hash(target):
    """Exactly F activation_engine content_hash() minus .next/cache."""
    argv=["tar","--sort=name","--mtime=UTC 1970-01-01","--owner=0","--group=0",
          "--numeric-owner","--exclude=./cache","--exclude=./cache/*",
          "-C",str(target),"-cf","-","."]
    proc=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    h=hashlib.sha256()
    assert proc.stdout is not None
    for buf in iter(lambda:proc.stdout.read(1024*1024),b""): h.update(buf)
    if proc.stderr: err=proc.stderr.read(512)
    else: err=b""
    try: rc=proc.wait(timeout=45)
    except subprocess.TimeoutExpired:
        proc.kill();proc.wait();raise Hold("ACTIVE_ARTIFACT_TAR_TIMEOUT")
    require(rc==0,"ACTIVE_ARTIFACT_TAR_FAILED:"+err.decode(errors="replace")[:70])
    return h.hexdigest()

def root_journal(attempt):
    require(bool(HEX64.fullmatch(attempt)),"INVALID_F_ATTEMPT")
    def read(suffix):
        return doc(protected(ROOT/(attempt+"-"+suffix+".json")))
    return {
      "stage":read("PRE_STAGE-stage-receipt"),
      "before":read("PRE_ACTIVATE-native-before"),
      "pre":read("PRE_ACTIVATE-observation"),
      "after":read("POST_ACTIVATE-native-after"),
      "completed":read("PRE_ACTIVATE-completed"),
    }

def native_identity(journal,expected,attempt):
    """Import only EXACT F's approved independently installed native verifier."""
    from aoe2_solo_website_native_audit_adapter import owner_approved_installed_binary,verify_financial_identity
    from aoe2_solo_website_producer_receipts import verify_all
    owner_approved_installed_binary(expected)
    before,after=journal["before"],journal["after"]
    require(before.get("phase")=="PRE_ACTIVATE" and after.get("phase")=="POST_ACTIVATE" and
            before.get("attempt_id")==attempt and after.get("attempt_id")==attempt and
            before.get("candidate_sha")==expected and after.get("candidate_sha")==expected,
            "NATIVE_WRONG_PHASE_CANDIDATE_OR_ATTEMPT")
    require(before.get("observed_at")<after.get("observed_at"),"NATIVE_PHASE_TIME_REPLAY")
    # F's verifier uses short-lived signer TTL; stale evidence MUST HOLD, never extend TTL.
    for report in (before,after):
        require(report.get("status")=="INDEPENDENT_NATIVE_VERIFIED",
                "NATIVE_REPORT_UNVERIFIED")
        verify_all(report)
        verify_financial_identity(report["finance"])
    require(before["finance"]["protected"]==after["finance"]["protected"] and
            before["finance"]["exposure"]==after["finance"]["exposure"] and
            before["finance"].get("financial_movement_authorized") is False and
            after["finance"].get("financial_movement_authorized") is False,
            "NATIVE_PROTECTED_WRITERS_OR_EXPOSURE_CHANGED")
    require(before["receipt_provenance"]["signed_producers"]["finance"]["signature_base64"]!=
            after["receipt_provenance"]["signed_producers"]["finance"]["signature_base64"],
            "NATIVE_FINANCE_SIGNER_REPLAY")
    completed=journal["completed"]
    require(completed.get("status")=="ROOT_ACTIVATION_NATIVE_VERIFIED" and
            completed.get("attempt_id")==attempt and completed.get("candidate_sha")==expected and
            completed.get("post_activation_native_sha256")==sha(canonical(after)) and
            completed.get("finance_fingerprint_sha256")==
            journal["pre"]["observation"]["finance_fingerprint_sha256"],
            "ROOT_COMPLETION_NOT_BOUND_TO_SIGNED_AFTER")
    return {"before_sha256":sha(canonical(before)),
            "after_sha256":sha(canonical(after)),
            "root_completion_sha256":sha(canonical(completed))}

def host_identity(expected,build,compiled):
    require(socket.gethostname()=="ubuntu-4gb-hel1-11" and sys.platform=="linux" and
            os.geteuid()==0,"ROOT_HEL1_ONLY")
    require(cmd(["git","-C",str(REPO),"rev-parse","HEAD"])==expected,
            "ACTIVE_SOURCE_SHA_MISMATCH")
    # Source dirty filter matches F's original source_status() rather than .next runtime.
    dirty=cmd(["git","-C",str(REPO),"status","--porcelain=v1",
               "--untracked-files=normal","--",".",
               ":(exclude).next",":(exclude).next/**",
               ":(exclude).next-release",":(exclude).next-release/**",
               ":(exclude).next-rollback*",":(exclude).next-rollback*/**",
               ":(exclude).node_modules-rollback*",":(exclude).node_modules-rollback*/**"])
    require(not dirty,"ACTIVE_SOURCE_DIRTY")
    require(not (REPO/".next").is_symlink() and
            not (REPO/".next/BUILD_ID").is_symlink() and
            (REPO/".next/BUILD_ID").read_text().strip()==build,
            "REAL_NEXT_BUILD_ID_MISMATCH")
    require(not (REPO/".aoe2war-build-version").is_symlink() and
            (REPO/".aoe2war-build-version").read_text().strip()==compiled,
            "COMPILED_BUILD_VERSION_MISMATCH")
    require(cmd(["systemctl","is-active",SERVICE])=="active","WEBSITE_SERVICE_INACTIVE")
    pid=cmd(["systemctl","show",SERVICE,"-p","MainPID","--value"])
    require(pid.isdecimal() and int(pid)>1 and pathlib.Path("/proc/"+pid+"/exe").exists(),
            "LIVE_SERVICE_MAINPID_INVALID")
    require(web_version("http://127.0.0.1:3030/api/deployment-version")==compiled,
            "INTERNAL_VERSION_MISMATCH")
    require(web_version("https://aoe2war.com/api/deployment-version")==compiled,
            "PUBLIC_VERSION_MISMATCH")
    return {"source_sha":expected,"next_build_id":build,"compiled_version":compiled,
            "mainpid":int(pid)}

def original_and_cert(j,attempt,expected,previous,build,compiled,activation_dir):
    base=pathlib.Path(activation_dir)
    require(base.is_absolute() and base.parent==RECEIPTS and
            not base.is_symlink(),"UNREVIEWED_F_ACTIVATION_DIR")
    stage_raw=ordinary(base/"stage-receipt.json")
    c_raw=ordinary(base/"certification.txt",65536)
    s=doc(stage_raw);c=cert(c_raw);sealed=j["stage"];finished=j["completed"]
    require(sealed.get("stage_receipt_sha256")==sha(stage_raw) and
            sealed.get("receipt")==s and
            s.get("release_sha")==expected and
            s.get("previous_production_sha")==previous and
            s.get("staged_build_id")==build,
            "ROOT_STAGE_ORIGINAL_BYTES_MISMATCH")
    require(c.get("status")=="CERTIFIED" and
            c.get("source_sha")==expected and c.get("release_sha")==expected and
            c.get("previous_production_sha")==previous and
            c.get("old_build_id")==j["pre"]["observation"]["build_id"] and
            c.get("active_build_id")==build and
            c.get("candidate_build_version")==compiled and
            c.get("stage_receipt_sha256")==sha(stage_raw) and
            c.get("artifact_sha256")==s.get("artifact_sha256") and
            c.get("wolo8092")=="1" and c.get("wolo8093")=="1" and
            finished.get("stage_receipt_sha256")==sha(stage_raw) and
            finished.get("build_id")==build,
            "F_CERT_SOURCE_BUILD_ROLLBACK_IDENTITY_MISMATCH")
    require(c.get("content_sha256")==artifact_hash(REPO/".next"),
            "F_ACTIVE_NEXT_CONTENT_SHA_MISMATCH")
    for key in ("fast_rollback","fast_rollback_modules","durable_rollback"):
        raw=c.get(key)
        require(type(raw) is str and raw and not pathlib.Path(raw).is_symlink(),
                "F_ROLLBACK_PATH_INVALID:"+key)
        p=pathlib.Path(raw)
        if not p.is_absolute():p=REPO/p
        require(p.is_dir(),"F_ROLLBACK_BYTES_UNAVAILABLE:"+key)
    durable=pathlib.Path(c["durable_rollback"])
    require((durable/"next/BUILD_ID").read_text().strip()==c["old_build_id"] and
            (durable/"source-sha").read_text().strip()==previous and
            (durable/"build-version").read_text().strip()==c["live_build_version"],
            "DURABLE_ROLLBACK_ORIGINAL_IDENTITY_MISMATCH")
    # F's completed root journal currently DOES NOT bind the final .txt certificate
    # or attest a successful separately executed durable rollback drill.
    # A tony-owned copy of certification.txt is never independent authority.
    root_cert=ROOT/(attempt+"-PRE_ACTIVATE-certification-seal.json")
    require(root_cert.exists(),"F_ROOT_SEALED_FINAL_CERTIFICATE_MISSING")
    seal=doc(protected(root_cert))
    require(seal.get("certification_sha256")==sha(c_raw) and
            seal.get("attempt_id")==attempt and
            seal.get("candidate_sha")==expected and
            seal.get("build_id")==build,"F_ROOT_CERTIFICATE_SEAL_MISMATCH")
    drill=ROOT/(attempt+"-DURABLE_ROLLBACK-verified.json")
    require(drill.exists(),"DURABLE_ROLLBACK_DRILL_NOT_PROVEN")
    proof=doc(protected(drill))
    require(proof.get("status")=="REAL_NATIVE_ROLLBACK_TESTED" and
            proof.get("attempt_id")==attempt and
            proof.get("old_source_sha")==previous and
            proof.get("old_build_id")==c.get("old_build_id"),
            "ROOT_DURABLE_DRILL_NOT_APPROVED")
    # A root-only JSON flag is NOT enough: this external root drill format also
    # needs independent B/C/E signatures; reject until F adds native verifier.
    raise Hold("F_NATIVE_SIGNED_DURABLE_ROLLBACK_DRILL_VERIFIER_REQUIRED")

def run(a):
    result={"schema":"aoe2war.g.r10.host-postflight.v1","scope":"HEL1_READ_ONLY",
      "expected":{"train":a.train,"source_sha":TRAIN[a.train][0],
                  "previous_sha":TRAIN[a.train][1],
                  "build_id":a.build_id,"compiled_version":a.compiled_version},
      "status":"HOLD","checks":{},"production_certified":False,
      "observed_at":datetime.now(timezone.utc).isoformat()}
    def gate(name,fun):
        try:
            v=fun();result["checks"][name]={"verdict":"PASS"};return v
        except Exception as exc:
            result["checks"][name]={"verdict":"HOLD","diagnostic":
                                    (type(exc).__name__+":"+str(exc))[:200]};return None
    require(bool(HEX64.fullmatch(a.attempt)) and bool(BUILD.fullmatch(a.build_id)),
            "OWNER_ACTIVATION_IDENTITY_REQUIRED")
    expected,previous=TRAIN[a.train]
    h=gate("live_source_build_compiled_service_and_public_identity",
           lambda:host_identity(expected,a.build_id,a.compiled_version))
    j=gate("original_F_root_phase_journal",
           lambda:root_journal(a.attempt))
    n=gate("B_C_E_D_signed_native_25_writers_and_8092_8093",
           lambda:native_identity(j,expected,a.attempt) if j else
           (_ for _ in ()).throw(Hold("MISSING_ROOT_JOURNAL")))
    r=gate("stage_certification_artifact_and_durable_rollback",
           lambda:original_and_cert(j,a.attempt,expected,previous,a.build_id,
                                     a.compiled_version,a.activation_dir) if j and n and h else
           (_ for _ in ()).throw(Hold("PREREQUISITE_NATIVE_GATES_NOT_PASSED")))
    # Hard requirement for separate original native rollback/finance continuity proof
    # on a *real* exercise, not merely durable paths present.
    result["status"]="PASS" if all(v["verdict"]=="PASS" for v in result["checks"].values()) else "HOLD"
    output=pathlib.Path(a.out)
    require(output.is_absolute() and not output.is_symlink(),"OUTPUT_NOT_ABSOLUTE_OR_LINKED")
    fd=os.open(output,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,"w") as stream:json.dump(result,stream,sort_keys=True,indent=2);stream.write("\n")
    print(json.dumps({"status":result["status"],"expected":result["expected"],
                      "checks":result["checks"],"report_path":str(output)}))
    return 0 if result["status"]=="PASS" else 2

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--train",required=True,choices=tuple(TRAIN))
    p.add_argument("--attempt",required=True)
    p.add_argument("--build-id",required=True)
    p.add_argument("--compiled-version",required=True)
    p.add_argument("--activation-dir",required=True)
    p.add_argument("--out",required=True)
    try:return run(p.parse_args(argv))
    except Exception as exc:
        print("R10_POSTFLIGHT_HOLD:"+type(exc).__name__+":"+str(exc),file=sys.stderr)
        return 2
if __name__=="__main__":sys.exit(main())
