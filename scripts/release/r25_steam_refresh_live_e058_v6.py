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
NEW_SELF=Path("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_live_e058_v6.py")
ORIG_POLICY=Path("/etc/aoe2war/web-prod-v1/approved-profile.json")
POLICY=Path("/etc/aoe2war/web-prod-v6/steam-refresh-policy.json")
WEB_UNIT=Path("/etc/systemd/system/aoe2hdbets-web-prod.service")
NGINX=Path("/etc/nginx/sites-available/aoe2war.com")
RECOVERY_MAP=Path("/etc/nginx/conf.d/aoe2war-managed-image-origin-20261107.conf")
RECOVERY_MAP_SHA="e6c598cb63bdfa6c5b84623494fe5d337cfea5ecd8abb574ee59071ba85af3ea"
ORIGINAL_NGINX_PREIMAGE=Path("/etc/aoe2war/web-prod-v5v/original-site.conf")
ORIGINAL_NGINX_PREIMAGE_SHA="35bbfcbe9e502bc59bc14e89014c0a20c01a272ff68743259e598dfbdec29c9f"
FIRST_RECOVERY_STAGE=Path("/etc/aoe2war/web-prod-v5v/stage1-site.conf")
FIRST_RECOVERY_SHA="9571d6eda0c7bc717dc4a37beb7e978569994195e9355bc056e0c69556d0184b"
SOURCE_STAGE=Path("/var/lib/aoe2war-web-prod-e0586a7b7c35")
RECEIPT=Path("/root/aoe2war-session-b-inplace-promotion-20261108/promotion-acceptance.json")
TIMER=Path("/etc/systemd/system/aoe2war-public-priority-relay.timer")
TIMER_SERVICE=Path("/etc/systemd/system/aoe2war-public-priority-relay.service")
RELEASE="20261108044653-2983e18532"
BUILD_ID="bUr1xs_EMHgXFD-U-sZ4Z"
GIT_SHA="e0586a7b7c355c3b29037d78c71fe26d528d2475"
PROD_PID="SOURCE_BOUND_RECEIPT_ONLY"
PRIOR_PID="2625090"
ORIG_SHA="9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707"
WEB_UNIT_SHA="13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5"
OLD_PUBLIC_RECEIPT=Path("/var/lib/aoe2war-app-production-f/central-r25-1c4ffe0ce31e-20261106-retry2/COMMIT.json")
OLD_PUBLIC_RECEIPT_SHA="6a20a634aff66d1f60dad3290a18dd237eb5017b8a6017f693da76a4510be4f2"
OLD_PUBLIC_SOURCE="1a380cdf76ff773aa1d094abd161523500b32b4a"
OLD_LIVE_PID=2854379
CI_ARTIFACT_SHA="32c641ca4808ead3402f07605a1b6aa3e0ba0cd95b5ef5b9488d8d41e902bbca"
CI_MANIFEST_SHA="d0f73b12628ad6b49ee804d7fec496e48e52f25215ba725cfcbe53b10e9d571b"
INERT_STAGING_RECEIPT_SHA="7b6b8ed79bfae63459ad922d390cf9a2fbaa954221c627dea9358c1a0ab14daf"
NGINX_SHA="811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f"
RECEIPT_SHA="47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0"
TIMER_SHA="6734953d8531686e83b87674a4f35206eb4186a404074825f3a0f4a920a00d0e"
TIMER_SERVICE_SHA="3b1ad80655bd4a54ac003d607abfbcc4f5be18705b5a6eaaf7e8e95753e8935a"
FINGERPRINT_TIMER="aoe2war-public-priority-relay.service"
FINGERPRINT_TRIGGER="aoe2war-public-priority-relay.timer"
# This observer is an exact hourly systemd timer-driven oneshot. v5r treated
# ExecMainStartTimestampMonotonic/ExecStart.start_time as immutable authority,
# so its legitimate 17:24 UTC run invalidated Steam's prior 16:32 snapshot.
# Apply original r25_c_start_root.unit_state strict *known oneshot* rule,
# not a blind snapshot re-seal or exclusion of C03 security state.
C03_FINGERPRINT_OBSERVER_SERVICE="wolo-c03-observer.service"
C03_FINGERPRINT_OBSERVER_TIMER="wolo-c03-observer.timer"
ADMISSION=Path("/etc/aoe2war/web-prod-v6/runtime-restart-admission.json")
OLD_ROLLBACK_STAGE=Path("/var/lib/aoe2war-web-prod-1a380cdf76ff")

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
 check(obj.MONITOR_ONESHOT_TIMERS.get(C03_FINGERPRINT_OBSERVER_SERVICE)
       in (None,C03_FINGERPRINT_OBSERVER_TIMER),
       "C03_OBSERVER_TIMER_BINDING_CONFLICT")
 obj.MONITOR_ONESHOT_TIMERS[FINGERPRINT_TIMER]=FINGERPRINT_TRIGGER
 obj.MONITOR_ONESHOT_TIMERS[C03_FINGERPRINT_OBSERVER_SERVICE]=C03_FINGERPRINT_OBSERVER_TIMER
 # m.unit_state still fingerprints the exact root-owned loaded unit, Result,
 # network-capable commands, timer identity and complete protected 57-unit
 # inventory. Only its last-run timestamp is normalized while safely inactive.
 return obj
def bound_public_commit():
 raw=rawfile(RECEIPT,0o600)
 proof=json.loads(raw)
 check(sha(raw)==RECEIPT_SHA and
       proof.get("schema")=="aoe2war.session-b.inplace-r25.v1" and
       proof.get("status")=="PASS_NEW_R25_INPLACE_PUBLIC_NONFINANCIAL" and
       proof.get("source_sha")==GIT_SHA and
       proof.get("build_version")==RELEASE and
       proof.get("build_id")==BUILD_ID and
       proof.get("old_3032_pid")==OLD_LIVE_PID and
       proof.get("new_pid")!=OLD_LIVE_PID and
       isinstance(proof.get("new_pid"),int) and proof["new_pid"]>1 and
       proof.get("protected_pids")=={"aoe2hdbets-web.service":int(PRIOR_PID),
                                     "wolochaind-mainnet.service":1009} and
       proof.get("safe_web_rollback_saved")==str(OLD_ROLLBACK_STAGE) and
       proof.get("avatar_parity")=="PASS_THREE_MANAGED_PORTRAITS" and
       proof.get("guest_admin_guard")=="PASS" and
       proof.get("fallback_cache")=="PASS_BOUNDED" and
       proof.get("nginx_modified") is False and
       proof.get("financial_gates_closed") is False and
       proof.get("steam_signedin_browser_verified") is False and
       proof.get("c03_legacy_finance_writers_unchanged") is True,
       "REVIEWED_NONFINANCIAL_PUBLIC_PROMOTION_NOT_BOUND")
 check(rawfile(OLD_ROLLBACK_STAGE/".aoe2war-source-sha").decode().strip()==OLD_PUBLIC_SOURCE,
       "OLD_R25_ROLLBACK_SOURCE_CHANGED")
 return proof,sha(raw)
def proc_start_ticks(pid:int)->int:
 # Linux stat field 22; avoid command-name parentheses shifting the index.
 # Under root NNP + CAP_NET_ADMIN/CAP_SETUID/CAP_SETGID the kernel denies
 # readlink(/proc/other-uid/cwd), even though stat/cmdline/cgroup are readable.
 # Bind the reviewed systemd WorkingDirectory + immutable unit SHA instead,
 # while retaining kernel UID, PID start_ticks, cmdline and cgroup binding.
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
 check(a["schema"]=="aoe2war.app.steam-runtime-readmission.v6" and
       a["approval_scope"]=="STEAM_ONLY_EXISTING_UID990_NFT_SETS" and
       a["finance_authorized"] is False and
       a["old_public_pid"]==proof["old_3032_pid"]==OLD_LIVE_PID and
       a["current_public_pid"]==proof["new_pid"] and
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
       state("aoe2hdbets-web-prod.service","WorkingDirectory")==str(SOURCE_STAGE) and
       b"next-server" in Path(f"/proc/{pid}/cmdline").read_bytes() and
       "/system.slice/aoe2hdbets-web-prod.service" in
       Path(f"/proc/{pid}/cgroup").read_text(),
       "R25_RUNTIME_PROCESS_IDENTITY_CHANGED")
 return a

def reviewed_nonfinancial_bridge():
 # This is an exact known public recovery, NOT broad re-admission.
 # A changed Nginx site, static/asset origin map, or reviewed preimage
 # must fail before any Steam nft write. Never normalize new money routes.
 site=rawfile(NGINX)
 mapping=rawfile(RECOVERY_MAP)
 prior=rawfile(ORIGINAL_NGINX_PREIMAGE,0o600)
 stage1=rawfile(FIRST_RECOVERY_STAGE,0o600)
 check(sha(site)==NGINX_SHA and
       sha(mapping)==RECOVERY_MAP_SHA and
       sha(prior)==ORIGINAL_NGINX_PREIMAGE_SHA and
       sha(stage1)==FIRST_RECOVERY_SHA,
       "R25_NONFINANCIAL_PUBLIC_BRIDGE_CHANGED")
 check(site.count(b"proxy_pass http://127.0.0.1:3032;")==6,
       "REVIEWED_PUBLIC_SELECTORS_CHANGED")
 for scope in (b"location = /api/user/appearance",
               b"location = /api/kingdom-presence/state",
               b"location ^~ /clans/",
               b"location ^~ /uploads/",
               b"location = /_next/image",
               b"location ^~ /api/ {"):
  check(scope in site,"PUBLIC_RECOVERY_SOURCE_SCOPE_MISSING")
 check(b"~^(POST|PUT|DELETE):https://(www\\.)?aoe2war\\.com$ 1;" in mapping,
       "PUBLIC_NONFINANCIAL_ORIGIN_FENCE_CHANGED")
 return True

def base_profile(m):
 proof,receipt_sha=bound_public_commit()
 previous=json.loads(rawfile(ORIG_POLICY,0o400))
 check(previous.get("controller_sha256")==ORIG_SHA and
       previous.get("nft_shape_sha256")==m.production_nft_shape(),
       "ORIGINAL_NFT_POLICY_CHANGED")
 check(previous.get("schema")=="aoe2war.app.approved-production-profile.v1",
       "ORIGINAL_APPROVAL_MISSING")
 check(sha(rawfile(WEB_UNIT))==WEB_UNIT_SHA,"R25_WEB_UNIT_CHANGED")
 reviewed_nonfinancial_bridge()

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
 # The reviewed event-SSE selector moves to 3030 while one static-first
 # selector moves to 3032: six exact 3032 proxy_pass lines remain in all.
 # SHA pins cover the entire site; this is not a general count-only approval.
 check(rawfile(NGINX).count(
    b"proxy_pass http://127.0.0.1:3032;")==6,
    "REVIEWED_PUBLIC_SELECTORS_CHANGED")
 v=json.loads(run(["/usr/bin/curl","--silent","--show-error","--max-time","5",
                    "http://127.0.0.1:3032/api/deployment-version"],timeout=9))
 check(v.get("buildVersion")==RELEASE,"PUBLIC_R25_VERSION_CHANGED")
 return previous
def expected_policy(m,snapshot_sha):
 proof,receipt_sha=bound_public_commit()
 return {
  "schema":"aoe2war.app.r25.steam-refresh-after-verified-public-cutover.v6",
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
  "approved_recovery_map_sha256":RECOVERY_MAP_SHA,
  "approved_original_nginx_sha256":ORIGINAL_NGINX_PREIMAGE_SHA,
  "public_recovery_is_nonfinancial_only":True,
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
 check(OLD_PUBLIC_SOURCE!=GIT_SHA and OLD_LIVE_PID>1 and RECEIPT_SHA!="SOURCE_BOUND_PHYSICAL_COMMIT_ONLY","V6_RELEASE_NOT_DISTINCT")
 check(RECEIPT!=OLD_PUBLIC_RECEIPT and SOURCE_STAGE.name=="aoe2war-web-prod-e0586a7b7c35",
       "V6_PUBLIC_SOURCE_SCOPE_INVALID")
 check(C03_FINGERPRINT_OBSERVER_SERVICE=="wolo-c03-observer.service"
       and C03_FINGERPRINT_OBSERVER_TIMER=="wolo-c03-observer.timer",
       "C03_OBSERVER_SCOPE_WIDENED")
 check("3033" not in str(WEB_UNIT),"NO_CANDIDATE_PUBLIC_BINDING")
 print("PASS:R25_STEAM_REFRESH_V6_STATIC_POLICY_SHAPE",flush=True)
def plan():
 m,s,f=evidence()
 check(f==bound_runtime_pid(bound_public_commit()[0])["reviewed_protected_snapshot_sha256"],"NONFINANCIAL_PROTECTED_SNAPSHOT_NOT_REVIEWED")
 obj=expected_policy(m,f)
 print("PASS:R25_CURRENT_STEAM_REFRESH_PLAN_READ_ONLY",flush=True)
 print(json.dumps({"current_snapshot_sha256":f,
      "exact_policy_sha256":sha(m.canonical(obj)),
      "new_controller_sha256":obj["new_controller_sha256"],
      "schema":obj["schema"],"financial_authorized":False},sort_keys=True),flush=True)
def observe_strict_steam_set_with_bounded_retry(m, pause=time.sleep):
 # Retain immutable validator for element shape, cap and TTL. At 300s
 # expiry an nft element may briefly appear with expires=0 before GC.
 # Never accept that entry: at most four read-only rechecks; zero and
 # all other anomalies that persist still block any firewall write.
 for attempt in range(4):
  try:
   return m.production_live_steam_entries()
  except m.Hold as exc:
   if str(exc)!="STEAM_SET_UNBOUNDED_OR_EXPIRED" or attempt==3:
    raise
   pause(0.35)
 raise AssertionError("unreachable")

def refresh():
 get_caps_or_hold()
 check(not str(POLICY).startswith(str(ORIG_POLICY)),"ORIGINAL_POLICY_REPLACED")
 obj=json.loads(rawfile(POLICY,0o400))
 m,s,f=evidence()
 expected=expected_policy(m,f)
 check(obj==expected and f==bound_runtime_pid(bound_public_commit()[0])["reviewed_protected_snapshot_sha256"],"STAGED_V6_FINANCE_SNAPSHOT_OR_POLICY_DRIFT")
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
 existing=observe_strict_steam_set_with_bounded_retry(m)
 commands=m.production_steam_union_commands(validated,existing)
 # DNS inspection may take seconds. Rebind runtime and snapshot before nft.
 bound_runtime_pid(bound_public_commit()[0])
 check(m.production_protected()==before,"PROTECTED_FINANCE_SNAPSHOT_CHANGED_BEFORE_NFT")
 if commands:
  m.run(["/usr/sbin/nft","-f","-"],data=("\n".join(commands)+"\n").encode(),maximum=8192)
 current=observe_strict_steam_set_with_bounded_retry(m)
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
 check(state("aoe2hdbets-web-prod.service","WorkingDirectory")==str(SOURCE_STAGE),
       "R25_RUNTIME_WRONG_ARTIFACT")
 check(proc_start_ticks(pid)>0,"R25_RUNTIME_START_ID_INVALID")
 check(json.loads(run(["/usr/bin/curl","--silent","--show-error",
       "--max-time","5","http://127.0.0.1:3032/api/deployment-version"],
       timeout=9)).get("buildVersion")==RELEASE,"R25_RUNTIME_WRONG_BUILD")
 print(json.dumps({"status":"HOLD_REVIEW_REQUIRED_NOT_ADMISSION",
       "public_commit_pid":proof["new_pid"],"current_public_pid":pid,
       "current_start_ticks":proc_start_ticks(pid),
       "source_sha":GIT_SHA,"finance_authorized":False},sort_keys=True))

def main():
 p=argparse.ArgumentParser()
 p.add_argument("--phase",required=True,choices=("selftest","diagnose","plan","refresh"))
 a=p.parse_args()
 if a.phase=="selftest":selftest()
 elif a.phase=="diagnose":diagnose();sys.exit(3)
 elif a.phase=="plan":plan()
 else:refresh()
if __name__=="__main__":
 try:main()
 except Exception as exc:
  print(json.dumps({"status":"HOLD_STEAM_REFRESH_V2",
       "reason":str(exc)[:180],"financial_authorized":False},sort_keys=True),flush=True)
  sys.exit(2)
