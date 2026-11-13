#!/usr/bin/python3
"""Product-only source-pinned R2 acceptance benchmark. Same existing 3032 service.

Requires the root-created exact release manifest and independently verified
runtime already staged by B. Records stage/activate/rollback/reactivate latency
and exact source, build, route marker, masks and Steam tests. No financial writes.
Not an arbitrary command runner; invokes ONLY the pinned product controller.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

CONTROLLER=Path("/root/aoe2war_product_release_controller_v3.py")
CONTROLLER_SHA="bf8289d8125631a88f1da63e19a693093055b4c50b3677d430744b0bef83373a"
MARKER=b'factory-20261113-loop-v2'
ORIGINAL_MARKER=b'factory-20261113-loop-v2'
MASKS=("aoe2hdbets-bet-stake-reconcile.service",
       "aoe2hdbets-bet-stake-reconcile.timer",
       "aoe2hdbets-staking-rewards.service",
       "aoe2hdbets-staking-rewards.timer",
       "wolochain-mainnet-settlement.service",
       "wolochain-founder-rewards-settlement.service")
def need(cond,why):
    if not cond:raise RuntimeError("HOLD_RELEASE_BENCHMARK_"+why)
def digest(p):
    h=hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda:f.read(4194304),b""):h.update(chunk)
    return h.hexdigest()
def clock():return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def run(*args,timeout=40):
    p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
    return p
def control(action,manifest,receipt):
    start=time.monotonic_ns();wall=clock()
    p=run("/usr/bin/python3","-I","-B",str(CONTROLLER),action,
          "--manifest",str(manifest),timeout=360)
    elapsed=round((time.monotonic_ns()-start)/1e9,3)
    receipt["phases"].append({"operation":action,"started_at":wall,
          "duration_seconds":elapsed,"exit_code":p.returncode})
    print("BENCHMARK_STEP",action,"elapsed_s",elapsed,"exit",p.returncode,flush=True)
    need(p.returncode==0,"CONTROLLER_"+action.upper()+"_"+str(p.returncode))
    return p.stdout
def probe(route,public=False):
    if public:
        url="https://aoe2war.com"+route
    else:
        url="http://127.0.0.1:3032"+route
    p=subprocess.run(["/usr/bin/curl","--fail","--silent","--show-error",
             "--location","--max-time","12",
             "--header","Cache-Control: no-cache",url],
             stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=16)
    need(p.returncode==0,"URL_PROBE_"+("PUBLIC" if public else "LOCAL"))
    return p.stdout
def verify_marker(expected):
    samples=[]
    for attempt in range(9):
        local=probe("/factory?release-loop-check=1")
        public=probe("/factory?release-loop-check=2",public=True)
        both=(MARKER in local,MARKER in public)
        samples.append(both)
        if both==(expected,expected):
            return {"local":both[0],"public_https":both[1],"samples":len(samples)}
        time.sleep(2)
    raise RuntimeError("HOLD_RELEASE_BENCHMARK_MARKER_NOT_MATCHED_"+str(samples[-1]))
def read_service():
    p=run("/usr/bin/systemctl","show","aoe2hdbets-web-prod.service",
          "-p","WorkingDirectory","-p","MainPID","-p","ActiveState",timeout=10)
    need(p.returncode==0,"WEB_UNIT_READ")
    return dict(line.split("=",1) for line in p.stdout.splitlines() if "=" in line)
def verify_build(source,build):
    status=read_service()
    need(status.get("ActiveState")=="active","SITE_INACTIVE")
    root=Path(status["WorkingDirectory"])
    need(root.is_dir() and root.stat().st_uid==0 and not root.is_symlink(),"ROOTED_RUNTIME")
    need((root/".aoe2war-source-sha").read_text().strip()==source,
         "SOURCE_SHA_MISMATCH")
    need((root/".next/BUILD_ID").read_text().strip()==build,
         "BUILD_ID_MISMATCH")
    return status
def verify_finance():
    for unit in MASKS:
        p=run("/usr/bin/systemctl","is-enabled",unit,timeout=9)
        need(p.stdout.strip()=="masked","MASK_CHANGED")
    p=run("/usr/bin/ss","-H","-ltn",timeout=9)
    need(p.returncode==0,"FIN_SOCKETS_READ")
    for ln in p.stdout.splitlines():
        f=ln.split()
        if len(f)>3:
            need(not re.search(r":(?:8092|8093|8094|8095)$",f[3]),
                 "FIN_LISTENER")
    p=run("/usr/bin/curl","-sS","--max-time","8","-o","/dev/null",
          "-w","%{http_code}","https://aoe2war.com/api/bets",timeout=11)
    need(p.returncode==0 and p.stdout.strip()=="503","FIN_PUBLIC_API_DENIAL")
    p=run("/usr/bin/curl","-sS","--max-time","8","-o","/dev/null",
          "-w","%{http_code}","http://127.0.0.1:3030/",timeout=11)
    need(p.returncode==0 and p.stdout.strip()=="200","ORIGINAL_3030_UNHEALTHY")
def save(receipt,path):
    need(not path.exists() and not path.is_symlink(),"RECEIPT_ALREADY_EXISTS")
    raw=(json.dumps(receipt,sort_keys=True,indent=2)+"\n").encode()
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    try:
        os.fchmod(fd,0o600)
        need(os.write(fd,raw)==len(raw),"RECEIPT_PARTIAL_WRITE")
        os.fsync(fd)
    finally:os.close(fd)
    df=os.open(path.parent,os.O_DIRECTORY|os.O_RDONLY|os.O_NOFOLLOW)
    try:os.fsync(df)
    finally:os.close(df)
    print("BENCHMARK_RECEIPT",str(path),"SHA256",hashlib.sha256(raw).hexdigest())
def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--manifest",required=True)
    ap.add_argument("--preflight-only",action="store_true")
    args=ap.parse_args()
    need(os.geteuid()==0,"ROOT_OWNER")
    cs=CONTROLLER.lstat()
    need(stat.S_ISREG(cs.st_mode) and cs.st_uid==0 and
         stat.S_IMODE(cs.st_mode)==0o600 and digest(CONTROLLER)==CONTROLLER_SHA,
         "CONTROLLER_SOURCE_DRIFT")
    manifest=Path(args.manifest)
    need(not manifest.is_symlink() and manifest.is_file() and manifest.stat().st_uid==0 and
         stat.S_IMODE(manifest.stat().st_mode)==0o600,
         "MANIFEST_AUTHORITY")
    m=json.loads(manifest.read_bytes())
    need(m.get("schema")=="aoe2war.product.web-release-manifest.v2" and
         m.get("financial_authorized") is False and
         m["source"]!=m["previous_source"],"MANIFEST_SOURCE")
    root=Path("/var/lib/aoe2war-product-release-v1")/m["source"][:12]
    need(not root.exists(),"EXISTING_CANDIDATE_JOURNAL")
    baseline=verify_build(m["previous_source"],m["previous_build"])
    old_marker=verify_marker(False)
    verify_finance()
    receipt={
        "schema":"aoe2war.product.physical-release-benchmark.v1",
        "started_at":clock(),"source":m["source"],"build":m["build"],
        "previous_source":m["previous_source"],"previous_build":m["previous_build"],
        "github_run_id":m["github_run_id"],
        "manifest_sha256":digest(manifest),
        "controller_sha256":CONTROLLER_SHA,
        "phase_source":"live_product_root",
        "preflight":{"original_web_pid":baseline["MainPID"],"old_marker":old_marker},
        "phases":[],
        "result":"HOLD",
        "finance_authorized":False,
        "fresh_steam_callback_authenticated":False,
    }
    print("BENCHMARK_PREFLIGHT_PASS",m["source"],m["github_run_id"],flush=True)
    if args.preflight_only:
        print("PREFLIGHT_ONLY_NO_SERVICE_CHANGES")
        return
    begin=time.monotonic_ns()
    try:
        control("stage",manifest,receipt)
        control("activate",manifest,receipt)
        receipt["activation_marker"]=verify_marker(True)
        receipt["new_web_identity"]=verify_build(m["source"],m["build"])
        verify_finance()
        control("rollback",manifest,receipt)
        receipt["rollback_marker"]=verify_marker(False)
        receipt["restored_web_identity"]=verify_build(m["previous_source"],m["previous_build"])
        verify_finance()
        control("reactivate",manifest,receipt)
        receipt["reactivation_marker"]=verify_marker(True)
        receipt["final_web_identity"]=verify_build(m["source"],m["build"])
        verify_finance()
        # Confirm live Steam transport renewal, without user credentials/callback.
        p=run("/usr/bin/systemctl","start","aoe2war-steam-egress-refresh.service",timeout=50)
        need(p.returncode==0,"STEAM_RENEWAL_DID_NOT_PASS")
        steam=run("/usr/bin/systemctl","show","aoe2war-steam-egress-refresh.service",
                  "-p","ExecMainStatus","--value",timeout=10)
        need(steam.returncode==0 and steam.stdout.strip()=="0","STEAM_NATIVE_EXIT_NONZERO")
        receipt["steam_egress_renewal"]="pass_exit0"
        receipt["result"]="PASS_PHYSICAL_FACTORY_R2_ROUNDTRIP"
    except Exception as exc:
        receipt["error_predicate"]=str(exc)[:128]
        # Any benchmark health failure while the candidate is live must
        # restore the previous source, but never replay an UNKNOWN operation.
        try:
            statefile=root/"state.json"
            if statefile.is_file() and json.loads(statefile.read_bytes()).get("phase")=="live":
                control("rollback",manifest,receipt)
                receipt["emergency_rollback"]="attempted"
        except Exception as recovery:
            receipt["emergency_rollback_error"]=type(recovery).__name__
        raise
    finally:
        receipt["completed_at"]=clock()
        receipt["total_elapsed_seconds"]=round((time.monotonic_ns()-begin)/1e9,3)
        if root.is_dir():
            save(receipt,root/"benchmark-v1.json")
    print("PASS_FACTORY_RELEASE_BENCHMARK",receipt["total_elapsed_seconds"],"SECONDS")

if __name__=="__main__":
    try:main()
    except Exception as e:
        print("HOLD_FACTORY_RELEASE_BENCHMARK",type(e).__name__,str(e)[:200],flush=True)
        sys.exit(3)
