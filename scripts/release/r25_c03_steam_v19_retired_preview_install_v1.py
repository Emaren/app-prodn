#!/usr/bin/env python3
"""One-use, exact-source V19 Steam-only repair for a retired R24 preview.

There is no website cutover here. Website 3032, 3030, Nginx, validator and
financial services remain byte-identical. If new Steam admission fails,
restore exact old V18 unit, preserving its fail-closed HOLD instead of
forging a successful refresh.
"""
from __future__ import annotations
import datetime
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

P=Path
SRC_ROOT=P("/root/aoe2war-r25-b1ef-v19-preview-readonly-20261109")
ORIGIN=P("/etc/aoe2war/web-prod-v18")
TARGET=P("/etc/aoe2war/web-prod-v19")
CONTROLLER=SRC_ROOT/"r25_c03_steam_v19_retired_preview_install_v1.py"
STEAM_SRC=SRC_ROOT/"r25_steam_refresh_traffic_v19.py"
STEAM_UNIT=SRC_ROOT/"r25_steam_refresh_traffic_v19.service"
RETIRED_RECEIPT=SRC_ROOT/"retired-proof.json"
LIVE_SRC=P("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v19.py")
LIVE_UNIT=P("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
WEB_UNIT=P("/etc/systemd/system/aoe2hdbets-web-prod.service")
BEFORE=SRC_ROOT/"original-steam-v18-unit.service"
ONE_USE_RESULT=SRC_ROOT/"physical-v19-steam-retired-preview-install.json"
LOCK=P("/run/lock/aoe2war-v19-retired-preview-once.lock")

V19_SOURCE_SHA="76f48e21de2bc504af121f1c0ae91a8353b72b51bac360ddb7d3f7a24468ba1c"
V19_UNIT_SHA="99df0015a6eeb8ad218ab703fd2b1db5daba3ff4b9bbabb87211d3f042ae1892"
V18_UNIT_SHA="8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032"
WEB_SHA="f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a"
RETIRED_SHA="38cec1654b260a753b36fe185ff0bca2baf177dc2a3d25f86b423321b3aab3e3"
RETIRE_SNAPSHOT="3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15"
V18_PROFILE_META_SHA="bf73186875dc49a9611f12aed829db5cbabd6193fa164387a1c630cbc8c7ad34"
V18_ACCEPTED_SHA="857fcad907934f2b52c9568a581dd5e07e57d5d6e5eab0c5b18a8ba84494847a"
APP_SOURCE="b1ef050b954be734c9f34147361e0d02d7c89b19"
APP_BUILD="QVzgMJiQwhFvwrRbY9oZW"
APP_VERSION="20261109194837-9ac998896a"
RECEIPT_STAGE_SHA="c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7"
STAGE=P("/var/lib/aoe2war-web-prod-b1ef050b954b")
ORIGIN_PROOF={
 "original-finance-restricted-3032-unit.service":"42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621",
 "exact-ci-runtime-staged-v1.json":RECEIPT_STAGE_SHA,
 "artifact.json":"2c0bb606db2c21ca263efbcacb57c52e4cb493553737a5a919e21170baaf6a74",
}
class Hold(RuntimeError):pass
def need(ok,reason):
 if not ok:raise Hold("HOLD_"+reason)
def sha(b):return hashlib.sha256(b).hexdigest()
def pinned(p,expected,mode=None):
 st=p.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
      and (mode is None or stat.S_IMODE(st.st_mode)==mode)
      and sha(p.read_bytes())==expected,"PINNED_ROOT_SOURCE_"+p.name)
 return p.read_bytes()
def call(args,timeout=110):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 need(p.returncode==0,"COMMAND_"+P(args[0]).name)
 return p.stdout.strip()
def show(unit,key):return call(["systemctl","show",unit,"-p",key,"--value"],15)
def write(path,raw,mode):
 need(not path.exists() and not path.is_symlink(),"ONE_USE_FILE_EXISTS")
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,"wb") as f:
  f.write(raw);f.flush();os.fsync(f.fileno())
 os.chmod(path,mode)
def atomic_unit(data):
 temp=LIVE_UNIT.parent/(".aoe2war-steam-v19-source-pinned.tmp")
 write(temp,data,0o644)
 os.replace(temp,LIVE_UNIT)
 call(["systemctl","daemon-reload"],40)
def receipt(status,obs):
 raw=(json.dumps({
  "schema":"aoe2war.app.steam-v19-retired-preview-steamonly.v1",
  "utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "status":status,"installed_app_source":APP_SOURCE,
  "steam_v19_source_sha":V19_SOURCE_SHA,
  "steam_v19_unit_sha":V19_UNIT_SHA,
  "recovered_retired_snapshot_sha":RETIRE_SNAPSHOT,
  "financial_authorized":False,"money_moved":False,
  "C03_APP_HANDOFF_ACCEPTED":False,"C02_APP_TRANSPORT":False,**obs
 },sort_keys=True,indent=2)+"\n").encode()
 write(ONE_USE_RESULT,raw,0o600)
 print("V19_PHYSICAL_RECEIPT_SHA256",sha(raw),flush=True)

def preflight():
 need(os.geteuid()==0,"ROOT")
 need(SRC_ROOT.is_dir() and not SRC_ROOT.is_symlink()
      and SRC_ROOT.stat().st_uid==0 and
      stat.S_IMODE(SRC_ROOT.stat().st_mode)==0o700,"SOURCE_DIR_SCOPE")
 pinned(STEAM_SRC,V19_SOURCE_SHA,0o600)
 pinned(STEAM_UNIT,V19_UNIT_SHA,0o600)
 pinned(RETIRED_RECEIPT,RETIRED_SHA,0o400)
 need(pinned(LIVE_UNIT,V18_UNIT_SHA,0o644) is not None,
      "EXACT_STEAM_V18_UNIT_REQUIRED")
 pinned(WEB_UNIT,WEB_SHA,0o644)
 need(show("aoe2hdbets-web-prod.service","MainPID")=="465815"
      and show("aoe2hdbets-web-prod.service","ActiveState")=="active"
      and show("aoe2hdbets-web-prod.service","NRestarts")=="0"
      and show("aoe2hdbets-web-prod.service","MemoryMax")=="3355443200",
      "EXACT_RETAINED_PUBLIC_R25_MISSING")
 need(show("aoe2hdbets-web.service","MainPID")=="2625090"
      and show("wolochaind-mainnet.service","MainPID")=="1009",
      "PROTECTED_ROLLBACK_OR_VALIDATOR_DRIFT")
 need(show("aoe2hdbets-web-r24.service","MainPID")=="0"
      and show("aoe2hdbets-web-r24.service","ActiveState")=="inactive",
      "R24_PREVIEW_NOT_RETIRED")
 need(STAGE.joinpath(".aoe2war-source-sha").read_text().strip()==APP_SOURCE
      and STAGE.joinpath(".next/BUILD_ID").read_text().strip()==APP_BUILD
      and STAGE.joinpath(".aoe2war-build-version").read_text().strip()==APP_VERSION,
      "CI_STAGE_NO_LONGER_EXACT")
 need(not any(":809"+str(i)+" " in call(["ss","-H","-ltn"],10)
              for i in (2,3,4,5)),"FINANCE_LISTENER_OPEN")
 for p,h in ORIGIN_PROOF.items():
  pinned(ORIGIN/p,h,0o400)
 pinned(ORIGIN/"active-profile.json",V18_PROFILE_META_SHA,0o400)
 pinned(ORIGIN/"accepted-runtime.json",V18_ACCEPTED_SHA,0o600)
 need(not ONE_USE_RESULT.exists() and not ONE_USE_RESULT.is_symlink()
      and not TARGET.exists() and not TARGET.is_symlink()
      and not LIVE_SRC.exists() and not LIVE_SRC.is_symlink()
      and not BEFORE.exists() and not BEFORE.is_symlink(),
      "ALREADY_PUBLISHED_OR_PREVIOUS_ACTION")
 return {
  "old_pid":show("aoe2hdbets-web-prod.service","MainPID"),
  "old_unit_sha":sha(WEB_UNIT.read_bytes()),
  "old_steam_sha":sha(LIVE_UNIT.read_bytes()),
  "old_steam_result":show("aoe2war-steam-egress-refresh.service","Result"),
  "finance_listener_ports_open":False,
 }

def install():
 before=preflight()
 observations={"before":before}
 status="HOLD_V19_INSTALL_NOT_ACCEPTED"
 changed=False
 try:
  call(["systemctl","stop","aoe2war-steam-egress-refresh.timer"],30)
  changed=True
  call(["systemctl","stop","aoe2war-steam-egress-refresh.service"],30)
  write(BEFORE,pinned(LIVE_UNIT,V18_UNIT_SHA,0o644),0o600)
  TARGET.mkdir(mode=0o500)
  os.chmod(TARGET,0o500)
  for name,hashval in ORIGIN_PROOF.items():
   write(TARGET/name,pinned(ORIGIN/name,hashval,0o400),0o400)
  write(TARGET/"r24-preview-quiesce-verified.json",
        pinned(RETIRED_RECEIPT,RETIRED_SHA,0o400),0o400)
  meta={"schema":"aoe2war.app.traffic-steam-v19.active.v1",
        "profile":"candidate","source_sha":APP_SOURCE,
        "stage_receipt_sha256":RECEIPT_STAGE_SHA,
        "finance_authorized":False}
  body=(json.dumps(meta,sort_keys=True,separators=(",",":"))+"\n").encode()
  write(TARGET/"active-profile.json",body,0o400)
  write(LIVE_SRC,pinned(STEAM_SRC,V19_SOURCE_SHA,0o600),0o644)
  atomic_unit(pinned(STEAM_UNIT,V19_UNIT_SHA,0o600))
  cmd=["/usr/bin/python3","-I","-B",str(LIVE_SRC)]
  observations["selftest"]=call(cmd+["--phase","selftest"],120)
  observations["inspect"]=call(cmd+["--phase","inspect"],150)
  observations["admission"]=call(cmd+["--phase","enroll","--profile","candidate"],250)
  call(["systemctl","reset-failed","aoe2war-steam-egress-refresh.service"],20)
  call(["systemctl","start","aoe2war-steam-egress-refresh.service"],220)
  need(show("aoe2war-steam-egress-refresh.service","Result")=="success",
       "V19_REFRESH_NOT_ACCEPTED")
  call(["systemctl","start","aoe2war-steam-egress-refresh.timer"],35)
  need(show("aoe2war-steam-egress-refresh.timer","ActiveState")=="active",
       "V19_TIMER_NOT_ACTIVE")
  need(show("aoe2hdbets-web-prod.service","MainPID")=="465815"
       and pinned(WEB_UNIT,WEB_SHA,0o644) is not None,
       "R25_PUBLIC_WEBSITE_MUTATED")
  for port in (8092,8093,8094,8095):
   need("LISTEN" not in call(["ss","-H","-ltn","sport = :"+str(port)],12),
        "FINANCE_PORT_"+str(port))
  status="PASS_V19_RETIRED_PREVIEW_PROTECTED_STEAM_RENEWAL"
 except Exception as e:
  observations["hold"]=type(e).__name__+":"+str(e)[:120]
  if changed:
   try:
    call(["systemctl","stop","aoe2war-steam-egress-refresh.timer"],30)
    call(["systemctl","stop","aoe2war-steam-egress-refresh.service"],30)
    current=sha(LIVE_UNIT.read_bytes())
    if current!=V18_UNIT_SHA:
     need(BEFORE.is_file(),"EXACT_V18_RECOVERY_PREIMAGE_ABSENT")
     old=pinned(BEFORE,V18_UNIT_SHA,0o600)
     atomic_unit(old)
    call(["systemctl","start","aoe2war-steam-egress-refresh.timer"],30)
    observations["recovered"]="PASS_EXACT_V18_FAIL_CLOSED_UNIT_RESTORED"
   except Exception as fail:
    observations["recovered"]="HOLD_V18_RESTORE_"+type(fail).__name__
 finally:
  try:observations["final_steam_unit_sha"]=sha(LIVE_UNIT.read_bytes())
  except Exception:observations["final_steam_unit_sha"]="UNOBSERVABLE"
  try:observations["final_web_pid"]=show("aoe2hdbets-web-prod.service","MainPID")
  except Exception:observations["final_web_pid"]="UNOBSERVABLE"
  receipt(status,observations)
 need(status.startswith("PASS_"),"V19_NOT_INSTALLED")
 print(status,flush=True)

def main():
 need(len(sys.argv)==2 and sys.argv[1] in ("--inspect","--activate"),
      "SOURCE_PINNED_PHASE")
 fd=os.open(LOCK,os.O_CREAT|os.O_WRONLY,0o600)
 with os.fdopen(fd,"w") as f:
  fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if sys.argv[1]=="--inspect":
   print(json.dumps({"status":"PASS_V19_INSTALL_READONLY_PRECHECK",
                     "no_mutation":True,"finance_authorized":False,
                     **preflight()},sort_keys=True))
  else:install()

if __name__=="__main__":
 try:main()
 except Exception as err:
  print("HOLD_V19_INSTALL",type(err).__name__,str(err)[:160],flush=True)
  sys.exit(3)
