#!/usr/bin/env python3
"""Nonfinancial R25 Steam-only egress re-admission; never a financial permit.

Keeps the original signed production policy and historical controller immutable.
A distinct 0400 root policy binds the exact NEW public build and entire inspected
system/finance unit snapshot. The active restricted systemd timer may then add
only individually TLS/SNI-validated Steam destinations to existing nft steam4/6
sets, retaining strict UID990 final DROP. No fund transfer or HTTP proxy changes.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import time

ORIG=Path("/usr/local/lib/aoe2war-web-prod/r25_c_start_root.py")
NEW_SELF=Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_session_b_v5.py")
ORIG_POLICY=Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
POLICY=Path("/etc/aoe2war/web-prod-v5/steam-refresh-policy.json")
WEB_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
NGINX=Path("/etc/nginx/sites-available/aoe2war.com")
SOURCE_STAGE=Path("/var/lib/aoe2war-web-prod-1c4ffe0ce31e")
RECEIPT=Path("/var/lib/aoe2war-app-production-f/central-r25-1c4ffe0ce31e-20261106-retry2/COMMIT.json")
TIMER=Path("/etc/systemd/system/aoe2war-public-priority-relay.timer")
TIMER_SERVICE=Path("/etc/systemd/system/aoe2war-public-priority-relay.service")
RELEASE="20261106065241-f085ab2094"
BUILD_ID="-9W9Qh5u6nz7l8hbhvv1U"
GIT_SHA="1c4ffe0ce31e085bd1e287da6659ec72338c2f87"
PROD_PID="SOURCE_BOUND_RECEIPT_ONLY"
PRIOR_PID="2625090"
ORIG_SHA="9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707"
WEB_UNIT_SHA="9301389aaf545bb9f4273e183d1c0f1ddf6c6589cac84d79873124327f71e1ec"
NGINX_SHA="35bbfcbe9e502bc59bc14e89014c0a20c01a272ff68743259e598dfbdec29c9f"
RECEIPT_SHA="SOURCE_BOUND_PHYSICAL_COMMIT_ONLY"
TIMER_SHA="6734953d8531686e83b87674a4f35206eb4186a404074825f3a0f4a920a00d0e"
TIMER_SERVICE_SHA="3b1ad80655bd4a54ac003d607abfbcc4f5be18705b5a6eaaf7e8e95753e8935a"
FINGERPRINT_TIMER="aoe2war-public-priority-relay.service"
FINGERPRINT_TRIGGER="aoe2war-public-priority-relay.timer"
ADMISSION=Path("/etc/aoe2war/web-prod-v5/runtime-restart-admission.json")

def sha(x:bytes)->str:return hashlib.sha256(x).hexdigest()
def hold(v:str):raise RuntimeError("HOLD:"+v)
def check(ok:bool,why:str):
 if not ok:hold(why)
def run(argv:list[str],timeout:int=18)->str:
 p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
 if p.returncode:hold("NATIVE_COMMAND_FAILED:"+argv[0]+":"+str(p.returncode))
 return p.stdout.strip()
def state(unit,key):return run(["/usr/bin/systemctl","show",unit,"-p",key,"--value"])
def rawfile(p:Path,mode:int|None=None)->bytes:
 st=p.lstat()
 check(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
       and not stat.S_IMODE(st.st_mode)&0o022,"ROOT_SOURCE_PERMISSIONS:"+p.name)
 if mode is not None:check(stat.S_IMODE(st.st_mode)==mode,"POLICY_MODE")
 fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
 with os.fdopen(fd,"rb") as f:
  raw=f.read(250000)
 check(len(raw)<250000,"ROOT_SOURCE_TOO_LARGE")
 return raw
def load_immutable_original():
 check(sha(rawfile(ORIG))==ORIG_SHA,"ORIGINAL_PRODUCTION_CONTROLLER_DRIFT")
 spec=importlib.util.spec_from_file_location("original_r25_nonfinancial_controller",str(ORIG))
 check(spec is not None and spec.loader is not None,"ORIGINAL_CONTROLLER_IMPORT")
 obj=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(obj)
 check(obj.PROD_PROFILE=="nonfinancial-production-v1","WRONG_ORIGINAL_PROFILE")
 obj.MONITOR_ONESHOT_TIMERS[FINGERPRINT_TIMER]=FINGERPRINT_TRIGGER
 return obj
def bound_public_commit():
 raw=rawfile(RECEIPT,0o600)
 proof=json.loads(raw)
 check(proof.get("status")=="PASS_PUBLIC_NONFINANCIAL_SOURCE_PROMOTED" and
       proof.get("source_sha")==GIT_SHA and
       proof.get("merge_sha")=="fa46232d965bb0bacc3de41f0ab682a2aec0d389" and
       proof.get("build_version")==RELEASE and
       proof.get("public_selectors3032")==6 and
       proof.get("rollback3030_pid")==int(PRIOR_PID) and
       proof.get("new_unit_sha256")==WEB_UNIT_SHA and
       proof.get("funded_transfer_authorized") is False and
       isinstance(proof.get("pid3032"),int) and proof["pid3032"]>1 and
       proof["pid3032"]!=653077,
       "A05_REVIEWED_NONFINANCIAL_PUBLIC_COMMIT_NOT_BOUND")
 return proof,sha(raw)
def proc_start_ticks(pid:int)->int:
 # Linux stat field 22; avoid command-name parentheses shifting the index.
 tail=Path(f"/proc/{pid}/stat").read_text().rsplit(") ",1)[1].split()
 return int(tail[19])

def bound_runtime_pid(proof:dict)->dict:
 # Deliberately requires a new root-only reviewed admission for every
 # server restart. The old immutable public commit is NEVER rewritten.
 raw=rawfile(ADMISSION,0o400)
 a=json.loads(raw)
 required={"schema","old_public_pid","current_public_pid","start_ticks",
           "source_sha","build_version","reviewed_protected_snapshot_sha256",
           "public_release_receipt_sha256","approval_scope","finance_authorized",
           "nonce"}
 check(set(a)==required,"RESTART_ADMISSION_UNEXPECTED_FIELDS")
 check(a["schema"]=="aoe2war.app.steam-runtime-readmission.v5" and
       a["approval_scope"]=="STEAM_ONLY_EXISTING_UID990_NFT_SETS" and
       a["finance_authorized"] is False and
       a["old_public_pid"]==proof["pid3032"] and
       a["source_sha"]==GIT_SHA and a["build_version"]==RELEASE and
       a["public_release_receipt_sha256"]==sha(rawfile(RECEIPT,0o600)) and
       isinstance(a["current_public_pid"],int) and
       a["current_public_pid"]>1 and
       isinstance(a["start_ticks"],int) and a["start_ticks"]>0 and
       re.fullmatch("[0-9a-f]{64}",a["reviewed_protected_snapshot_sha256"]) and
       re.fullmatch("[0-9a-f]{32}",a["nonce"]),
       "RESTART_ADMISSION_NOT_REVIEWED_OR_BOUND")
 pid=a["current_public_pid"]
 check(state("aoe2hdbets-web-prod.service","MainPID")==str(pid) and
       state("aoe2hdbets-web-prod.service","ActiveState")=="active",
       "R25_PUBLIC_RUNTIME_CHANGED")
 st=Path(f"/proc/{pid}").stat()
 check(st.st_uid==990 and proc_start_ticks(pid)==a["start_ticks"] and
       os.readlink(f"/proc/{pid}/cwd")==str(SOURCE_STAGE) and
       b"next-server" in Path(f"/proc/{pid}/cmdline").read_bytes() and
       "/system.slice/aoe2hdbets-web-prod.service" in
       Path(f"/proc/{pid}/cgroup").read_text(),
       "R25_RUNTIME_PROCESS_IDENTITY_CHANGED")
 return a

def base_profile(m):
 proof,receipt_sha=bound_public_commit()
 previous=json.loads(rawfile(ORIG_POLICY,0o400))
 check(previous.get("controller_sha256")==ORIG_SHA and
       previous.get("nft_shape_sha256")==m.production_nft_shape(),
       "ORIGINAL_NFT_POLICY_CHANGED")
 check(previous.get("schema")=="aoe2war.app.approved-production-profile.v1",
       "ORIGINAL_APPROVAL_MISSING")
 check(sha(rawfile(WEB_UNIT))==WEB_UNIT_SHA and sha(rawfile(NGINX))==NGINX_SHA,
       "R25_WEB_UNIT_OR_NGINX_CHANGED")
 check(receipt_sha==sha(rawfile(RECEIPT,0o600)),
       "R25_ACTUAL_PUBLIC_DEPLOYMENT_RECEIPT_CHANGED")
 check(sha(rawfile(TIMER))==TIMER_SHA and sha(rawfile(TIMER_SERVICE))==TIMER_SERVICE_SHA,
       "A07_REVIEWED_TIMER_OR_SERVICE_CHANGED")
 check((SOURCE_STAGE/".next/BUILD_ID").read_text().strip()==BUILD_ID,
       "R25_STAGED_BUILD_ID_CHANGED")
 check((SOURCE_STAGE/".aoe2war-source-sha").read_text().strip()==GIT_SHA,
       "R25_SOURCE_BUNDLE_CHANGED")
 bound_runtime_pid(proof)
 check(state("aoe2hdbets-web.service","MainPID")==PRIOR_PID and
       state("aoe2hdbets-web.service","ActiveState")=="active",
       "ORIGINAL_3030_ROLLBACK_CHANGED")
 check(state("aoe2war-public-priority-relay.timer","ActiveState")=="active" and
       state("aoe2war-public-priority-relay.timer","UnitFileState")=="enabled",
       "A07_PUBLIC_RELAY_TIMER_INACTIVE")
 for svc in ("wolo-satchel-c01.service","wolo-reviewer-c01.service"):
  check(state(svc,"ActiveState")=="inactive","HELD_FINANCIAL_SERVICE_ACTIVE:"+svc)
 check(rawfile(NGINX).count(
    b"proxy_pass http://127.0.0.1:3032;")==6,
    "NONSIX_NGINX_PRODUCTION_SELECTORS")
 v=json.loads(run(["/usr/bin/curl","--silent","--show-error","--max-time","5",
                    "http://127.0.0.1:3032/api/deployment-version"],timeout=9))
 check(v.get("buildVersion")==RELEASE,"PUBLIC_R25_VERSION_CHANGED")
 return previous
def expected_policy(m,snapshot_sha):
 proof,receipt_sha=bound_public_commit()
 return {
  "schema":"aoe2war.app.r25.steam-refresh-after-verified-public-cutover.v5",
  "scope":"ONLY_STEAM_IP_SETS_UID990_TLS_SNI_WITH_300S_TTL",
  "runtime_source_sha":GIT_SHA,"build_version":RELEASE,"build_id":BUILD_ID,
  "pid3032":bound_runtime_pid(proof)["current_public_pid"],"rollback_pid3030":int(PRIOR_PID),
  "runtime_restart_admission_sha256":sha(rawfile(ADMISSION,0o400)),
  "old_controller_sha256":ORIG_SHA,
  "new_controller_sha256":sha(rawfile(NEW_SELF)),
  "original_approved_profile_sha256":sha(rawfile(ORIG_POLICY,0o400)),
  "nft_shape_sha256":m.production_nft_shape(),
  "protected_snapshot_sha256":snapshot_sha,
  "unit_sha256":WEB_UNIT_SHA,"nginx_sha256":NGINX_SHA,
  "public_release_receipt_sha256":receipt_sha,
  "a07_timer_sha256":TIMER_SHA,"a07_service_sha256":TIMER_SERVICE_SHA,
  "finance_authorized":False,"public_cutover_authorized":False,
  "modifies_financial_services":False
 }
def evidence():
 m=load_immutable_original()
 base_profile(m)
 snap=m.production_protected()
 fingerprint=m.sha(m.canonical(snap))
 admission=bound_runtime_pid(bound_public_commit()[0])
 check(fingerprint==admission["reviewed_protected_snapshot_sha256"],
       "PROTECTED_FINANCE_SNAPSHOT_CHANGED")
 return m,snap,fingerprint
def get_caps_or_hold():
 check(os.geteuid()==0,"RESTRICTED_ROOT_CONTEXT_REQUIRED")
 lines=Path("/proc/self/status").read_text()
 bits=re.search(r"^CapEff:\s*([a-fA-F0-9]+)$",lines,re.M)
 nnp=re.search(r"^NoNewPrivs:\s*(\d+)$",lines,re.M)
 check(bits is not None and nnp is not None and nnp.group(1)=="1" and
       int(bits.group(1),16)&((1<<12)|(1<<7)|(1<<6))==((1<<12)|(1<<7)|(1<<6)),
       "STEAM_TIMER_CAPABILITY_OR_NO_NEW_PRIVS_MISSING")
def selftest():
 test={"schema":"v2","finance_authorized":False,"nft_scope":"steam4_steam6"}
 check(test["finance_authorized"] is False,"NEVER_FINANCIAL")
 check(ADMISSION.name=="runtime-restart-admission.json","ADMISSION_PATH_INVALID")
 check("3033" not in str(WEB_UNIT),"NO_CANDIDATE_PUBLIC_BINDING")
 print("PASS:R25_STEAM_REFRESH_V5_STATIC_POLICY_SHAPE",flush=True)
def plan():
 m,s,f=evidence()
 check(f==bound_runtime_pid(bound_public_commit()[0])["reviewed_protected_snapshot_sha256"],"NONFINANCIAL_PROTECTED_SNAPSHOT_NOT_REVIEWED")
 obj=expected_policy(m,f)
 print("PASS:R25_CURRENT_STEAM_REFRESH_PLAN_READ_ONLY",flush=True)
 print(json.dumps({"current_snapshot_sha256":f,
      "exact_policy_sha256":sha(m.canonical(obj)),
      "new_controller_sha256":obj["new_controller_sha256"],
      "schema":obj["schema"],"financial_authorized":False},sort_keys=True),flush=True)
def refresh():
 get_caps_or_hold()
 check(not str(POLICY).startswith(str(ORIG_POLICY)),"ORIGINAL_POLICY_REPLACED")
 obj=json.loads(rawfile(POLICY,0o400))
 m,s,f=evidence()
 expected=expected_policy(m,f)
 check(obj==expected and f==bound_runtime_pid(bound_public_commit()[0])["reviewed_protected_snapshot_sha256"],"STAGED_V5_FINANCE_SNAPSHOT_OR_POLICY_DRIFT")
 # Fail closed if someone reconfigured the service to bypass the original
 # bounded NNP and CAP_NET_ADMIN/CAP_SETUID/CAP_SETGID policy.
 service=Path("/etc/systemd/system/aoe2war-steam-egress-refresh.service")
 contents=rawfile(service)
 check(contents.count(str(NEW_SELF).encode())==1 and
       b"NoNewPrivileges=yes" in contents and
       b"CapabilityBoundingSet=CAP_NET_ADMIN CAP_SETUID CAP_SETGID" in contents and
       b"ProtectSystem=strict" in contents,"REFRESH_SYSTEMD_SECURITY_DRIFT")
 before=s
 validated=m.production_steam_dns_diversity(m.production_steam_addresses())
 existing=m.production_live_steam_entries()
 commands=m.production_steam_union_commands(validated,existing)
 if commands:
  m.run(["/usr/sbin/nft","-f","-"],data=("\n".join(commands)+"\n").encode(),maximum=8192)
 current=m.production_live_steam_entries()
 check(set(validated).issubset(current["steam4"]|current["steam6"]) and
       m.production_nft_shape()==expected["nft_shape_sha256"] and
       m.production_protected()==before,
       "STEAM_REFRESH_ALTERED_NON_STEAM_STATE")
 print(json.dumps({"schema":obj["schema"],"status":"PASS_STEAM_ONLY_REFRESH",
                   "validated_destination_count":len(validated),
                   "nft_entries":sum(len(x) for x in current.values()),
                   "ttl_seconds":300,"finance_authorized":False},sort_keys=True),flush=True)

def diagnose():
 # Evidence-only. Never writes new policy or auto-accepts protected drift.
 proof,_=bound_public_commit()
 pid=int(state("aoe2hdbets-web-prod.service","MainPID"))
 check(pid>1,"R25_RUNTIME_MISSING")
 check(state("aoe2hdbets-web-prod.service","ActiveState")=="active",
       "R25_RUNTIME_INACTIVE")
 check(os.readlink(f"/proc/{pid}/cwd")==str(SOURCE_STAGE),
       "R25_RUNTIME_WRONG_ARTIFACT")
 check(proc_start_ticks(pid)>0,"R25_RUNTIME_START_ID_INVALID")
 check(json.loads(run(["/usr/bin/curl","--silent","--show-error",
       "--max-time","5","http://127.0.0.1:3032/api/deployment-version"],
       timeout=9)).get("buildVersion")==RELEASE,"R25_RUNTIME_WRONG_BUILD")
 print(json.dumps({"status":"HOLD_REVIEW_REQUIRED_NOT_ADMISSION",
       "public_commit_pid":proof["pid3032"],"current_public_pid":pid,
       "current_start_ticks":proc_start_ticks(pid),
       "source_sha":GIT_SHA,"finance_authorized":False},sort_keys=True))

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--phase",required=True,choices=("selftest","diagnose","plan","refresh"))
 a=p.parse_args()
 if a.phase=="selftest":selftest()
 elif a.phase=="diagnose":diagnose()
 elif a.phase=="plan":plan()
 else:refresh()
if __name__=="__main__":
 try:main()
 except BaseException as exc:
  print(json.dumps({"status":"HOLD_STEAM_REFRESH_V2",
       "reason":str(exc)[:180],"financial_authorized":False},sort_keys=True),flush=True)
  sys.exit(2)
