#!/usr/bin/python3
"""Requalify the current Factory R2 release controller with real rollback and reactivation.

This does NOT re-stage or deploy a third build. The original 3030 remains untouched.
"""
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
PIN="771ebd5bc1164f75f4466cdc0a05a608ffc25671fccb12e05ebf321c56e30452"
MANIFEST=Path("/root/aoe2war-product-release-manifests/b101efb38868-run-43488656565.json")
MANIFEST_SHA="099b9ee91cf96f6c9ce1937a54929e89cb50bd49cfa6a46aea4377620f4e6866"
ROOT=Path("/var/lib/aoe2war-product-release-v1/b101efb38868")
OUT=ROOT/"source-requalified-current-v3-20261113.json"
NEW="b101efb38868c00e3592a873491d8ce36ee43038"
OLD="2a5544f855dca33240d335abd21793511617966e"
NEW_BUILD="s09mYXhW7UPH9Ulh71g4z"
OLD_BUILD="nBTNCwShjF-q4D3N3Axme"
MARKER=b"factory-20261113-loop-v2"
MASKS=(
 "aoe2hdbets-bet-stake-reconcile.service",
 "aoe2hdbets-bet-stake-reconcile.timer",
 "aoe2hdbets-staking-rewards.service",
 "aoe2hdbets-staking-rewards.timer",
 "wolochain-mainnet-settlement.service",
 "wolochain-founder-rewards-settlement.service",
)
def need(ok,code):
 if not ok:raise RuntimeError("HOLD_V3_CURRENT_REQUALIFICATION_"+code)
def sha(path):
 return hashlib.sha256(path.read_bytes()).hexdigest()
def run(args,timeout=180):
 return subprocess.run(args,text=True,capture_output=True,timeout=timeout)
def utc():
 return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds").replace("+00:00","Z")
def show(field):
 p=run(["systemctl","show","aoe2hdbets-web-prod.service","-p",field,"--value"],timeout=10)
 need(p.returncode==0,"SHOW_"+field)
 return p.stdout.strip()
def route(path):
 p=run(["curl","--silent","--show-error","--max-time","10","-L",
  "https://aoe2war.com"+path],timeout=14)
 need(p.returncode==0,"PUBLIC_HTTPS_"+path.split("?")[0])
 return p.stdout.encode()
def finance():
 for unit in MASKS:
  p=run(["systemctl","is-enabled",unit],timeout=10)
  need(p.stdout.strip()=="masked","MASK_"+unit)
 q=run(["ss","-H","-ltn"],timeout=10)
 need(q.returncode==0,"SOCKET_CENSUS")
 for line in q.stdout.splitlines():
  f=line.split()
  if len(f)>3:
   need(not re.search(r":(?:8092|8093|8094|8095)$",f[3]),"FIN_LISTENER")
 for url,expect in [("https://aoe2war.com/api/bets","503"),("http://127.0.0.1:3030/","200")]:
  p=run(["curl","-sS","--max-time","9","-o","/dev/null","-w","%{http_code}",url],timeout=12)
  need(p.returncode==0 and p.stdout==expect,"DENIAL_3030")
def observe(expected_source,expected_build,marker):
 need(show("ActiveState")=="active" and show("User")=="aoe2war-web-prod","WEB_STATUS")
 directory=Path(show("WorkingDirectory"))
 need(directory.name=="aoe2war-web-prod-"+expected_source[:12],"WEB_DIRECTORY")
 need((directory/".aoe2war-source-sha").read_text().strip()==expected_source,"SOURCE")
 need((directory/".next/BUILD_ID").read_text().strip()==expected_build,"BUILD")
 page=route("/factory?factory-requalification=1")
 need((MARKER in page)==marker,"PUBLIC_MARKER")
 finance()
 return {"source":expected_source,"build":expected_build,"marker_public_https":marker,
         "pid":show("MainPID"),"at":utc()}
def call(action,events):
 start=time.monotonic_ns();started=utc()
 p=run(["/usr/bin/python3","-I","-B",str(CONTROLLER),action,
       "--manifest",str(MANIFEST)],timeout=200)
 elapsed=round((time.monotonic_ns()-start)/1e9,3)
 events.append({"operation":action,"started_at":started,"duration_seconds":elapsed,
                "exit_code":p.returncode})
 print("SOURCE_REQUALIFICATION",action,"exit",p.returncode,"elapsed",elapsed,flush=True)
 need(p.returncode==0,"COMMAND_"+action)
def main():
 need(os.geteuid()==0,"OWNER_ROOT")
 need(not OUT.exists() and not OUT.is_symlink(),"RECEIPT_EXISTS")
 for path,digest in ((CONTROLLER,PIN),(MANIFEST,MANIFEST_SHA)):
  s=path.lstat()
  need(stat.S_ISREG(s.st_mode) and s.st_uid==0 and s.st_nlink==1
       and stat.S_IMODE(s.st_mode)==0o600 and sha(path)==digest,
       "SOURCE_OR_MANIFEST_DRIFT")
 p=run(["python3","-I","-B",str(CONTROLLER),"status",
       "--manifest",str(MANIFEST)],timeout=20)
 need(p.returncode==0,"SOURCE_STATUS")
 before=observe(NEW,NEW_BUILD,True)
 events=[]
 call("rollback",events)
 restored=observe(OLD,OLD_BUILD,False)
 call("reactivate",events)
 after=observe(NEW,NEW_BUILD,True)
 steam=run(["systemctl","show","aoe2war-steam-egress-refresh.service",
            "-p","Result","-p","ExecMainStatus"],timeout=10)
 need(steam.returncode==0 and "Result=success" in steam.stdout and
      "ExecMainStatus=0" in steam.stdout,"STEAM_RENEWAL")
 obj={"schema":"aoe2war.product.current-controller-v3-requalification.v1",
      "status":"PASS_PHYSICAL_ROLLBACK_AND_REACTIVATE_CURRENT_V3",
      "source":NEW,"build":NEW_BUILD,"previous_source":OLD,
      "original_r2_benchmark_sha_still_historical":"bf8289d8125631a88f1da63e19a693093055b4c50b3677d430744b0bef83373a",
      "current_controller_sha256":PIN,
      "manifest_sha256":MANIFEST_SHA,"observed_before":before,
      "observed_rollback":restored,"observed_reactivated":after,
      "steps":events,"total_elapsed_seconds":round(sum(x["duration_seconds"] for x in events),3),
      "finance_authorized":False,"steam_renewal":"success_exit0",
      "new_funded_canary_authorized":False,
      "at":utc()}
 data=(json.dumps(obj,sort_keys=True,indent=2)+"\n").encode()
 fd=os.open(OUT,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 try:
  os.fchmod(fd,0o600)
  need(os.write(fd,data)==len(data),"RECEIPT_WRITE")
  os.fsync(fd)
 finally:os.close(fd)
 f=os.open(ROOT,os.O_DIRECTORY|os.O_RDONLY|os.O_NOFOLLOW)
 try:os.fsync(f)
 finally:os.close(f)
 print("PASS_CURRENT_V3_REQUALIFIED_RECEIPT_SHA256",hashlib.sha256(data).hexdigest(),
       "TOTAL_SECONDS",obj["total_elapsed_seconds"],flush=True)
if __name__=="__main__":
 try:main()
 except Exception as ex:
  print("HOLD_CURRENT_V3_REQUALIFICATION",type(ex).__name__,str(ex),flush=True)
  sys.exit(3)
