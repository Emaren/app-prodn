#!/usr/bin/env python3
"""V20 proof-qualified same 3032 slot rollback to original and return to b1ef.

Read-only --inspect. Explicit --physical is single-use, source-qualified and
never financial. The original reviewed V18 roundtrip state machine is reused
byte-for-byte, but V20's actual Steam source/nft/C01 fingerprint is proved on
each snapshot and V20 is re-enrolled against each newly started 3032 PID.

One-use failure always HOLD; recover exact b1ef if possible, else the intact
original restricted R25. Neither result certifies authenticated user roles.
"""
from __future__ import annotations
import datetime
import hashlib
import json
import os
from pathlib import Path
import stat
import sys

P=Path
ROOT=P("/root/aoe2war-r25-b1ef-v20-sandbox-ro-20261110")
CYCLE=ROOT/"r25_c03_v18_reversible_roundtrip_v1.py"
CYCLE_SHA="31d98b68da903922ccc49e75c595e58f0ebbfbc2b5338f4011c65b1deacf677d"
SOURCE=ROOT/"r25_c03_v20_reversible_physical_v1.py"

STEAM=P("/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py")
STEAM_SHA="7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c"
V20_UNIT_SHA="b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2"
V20_FIN_SHA="3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15"
NFT_SHA="985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af"
PREVIOUS_V18_UNIT="8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032"
PREVIOUS_V18_STEAM="42dbba88209ba703a5d8472e83c3865d890e5a9b7481587102b33deba5f51c4b"
PREVIOUS_V18_FIN="6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999"
RECEIPT=ROOT/"physical-v20-web-3032-one-use-roundtrip.json"

class Hold(RuntimeError): pass
def need(ok,label):
 if not ok:raise Hold("HOLD_"+label)
def sha(data):return hashlib.sha256(data).hexdigest()
def exact(path,digest,mode):
 st=path.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
      and stat.S_IMODE(st.st_mode)==mode
      and sha(path.read_bytes())==digest,"PINNED_SOURCE_"+path.name)
 return path.read_bytes()

def get_core():
 need(os.geteuid()==0,"ROOT_ONLY")
 need(ROOT.is_dir() and ROOT.stat().st_uid==0
      and not ROOT.is_symlink()
      and stat.S_IMODE(ROOT.stat().st_mode)==0o700,
      "SOURCE_ROOT_PRIVATE")
 # Source reviewed by exact SHA on the owner Mac before transfer; prohibit
 # running any root-local second copy not byte-identical to code authority.
 exact(CYCLE,CYCLE_SHA,0o600)
 # Self-binary is owner-root only. The install command must independently
 # match SHA256 to the reviewed Git commit before --physical.
 st=SOURCE.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
      and stat.S_IMODE(st.st_mode)==0o600,
      "PRIVATE_ROOT_ROUNDTRIP_SOURCE")
 import importlib.util
 spec=importlib.util.spec_from_file_location("reviewed_v18_roundtrip_core_v20",CYCLE)
 need(spec is not None and spec.loader is not None,"REVIEWED_CYCLE_IMPORT")
 m=importlib.util.module_from_spec(spec)
 sys.modules[spec.name]=m
 spec.loader.exec_module(m)
 need(m.V18_UNIT_SHA==PREVIOUS_V18_UNIT and m.V18_SOURCE_SHA==PREVIOUS_V18_STEAM
      and m.FIN_SNAPSHOT==PREVIOUS_V18_FIN
      and m.APP_SOURCE=="b1ef050b954be734c9f34147361e0d02d7c89b19"
      and m.CANDIDATE_UNIT_SHA=="f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a",
      "UNCHANGED_OLD_REVIEWED_CYCLE_CONTRACT")
 # Only these three expected values differ, and are independently verified
 # against byte-pinned installed V20 + active C01/C03/C04/nft source evidence.
 m.V18_UNIT_SHA=V20_UNIT_SHA
 m.V18_SOURCE_SHA=STEAM_SHA
 m.FIN_SNAPSHOT=V20_FIN_SHA
 m.STEAM_UNIT_SHA=V20_UNIT_SHA
 m.STEAM_SOURCE_SHA=STEAM_SHA
 return m

def host_class(m):
 class Host(m.SystemdHost):
  def __init__(self):
   need(os.geteuid()==0,"ROOT_ONLY")
   self.v18=m.load_reviewed(m.RELEASE_ROOT/"r25_c03_b1ef_v18_retained_release_v1.py",
                             m.V18_CONTROLLER_SHA,0o600)
   self.trial=m.load_reviewed(m.TRIAL_ROOT/"r25_c03_b1ef_single_slot_trial_v1.py",
                              m.TRIAL_SHA,0o600)
   self.v20=m.load_reviewed(STEAM,STEAM_SHA,0o644)
   need(m.file_sha(self.v18.INSTALLED_STEAM)==V20_UNIT_SHA,
        "REVIEWED_INSTALLED_V20_STEAM_UNIT")
   self.v20.static_check()
   report=json.loads(self.v20.verified(
       ROOT/"physical-v20-steam-retired-preview-install.json",0o600))
   need(report.get("status")==
        "PASS_V20_RETIRED_PREVIEW_PROTECTED_STEAM_RENEWAL"
        and report.get("final_steam_unit_sha")==V20_UNIT_SHA
        and report.get("final_web_pid")=="465815"
        and report.get("financial_authorized") is False
        and report.get("money_moved") is False,
        "V20_SOURCE_QUALIFIED_PHYSICAL_STEAM_INSTALL_RECEIPT")
   # Original old restricted 3032 unit retained in V18 exact source. V20
   # also sealed the same original in its new policy directory.
   old=self.v18.own(self.v18.ORIGINAL_SRC,0o600,m.ORIGINAL_UNIT_SHA)
   old_v20=self.v20.verified(
     self.v20.ORIGINAL_UNIT_BACKUP,0o400)
   need(old==old_v20,"PINNED_ORIGINAL_UNIT_DIFFERS_BETWEEN_V18_V20")
   candidate=self.trial.new_unit(old)
   need(m.sha(candidate)==m.CANDIDATE_UNIT_SHA,"RECONSTRUCTED_CANDIDATE_UNIT_CHANGED")
   self.original=old
   self.units={"candidate":candidate,"rollback":old}
   self.initial_3030=self._show("aoe2hdbets-web.service","MainPID")
   self.initial_validator=self._show("wolochaind-mainnet.service","MainPID")
   need(self.initial_3030=="2625090" and self.initial_validator=="1009",
        "PROTECTED_ORIGINAL_ROLLBACK_OR_VALIDATOR")
   receipt=self.v18.own(self.v18.RESULT,0o600,
                         "b9fe6dda2ba1a554b62186689c2323e1b3d4c2b591c06cdf2557575cc5f55b79")
   need(json.loads(receipt).get("status")==
        "PASS_RUNNING_B1EF_PUBLIC_ONLY_R25_STEAM_V18_NOT_AUTH_CERTIFIED",
        "RETAINED_B1EF_SOURCE_PROMOTION_RECEIPT")
   # Never invoke the V17 trial's obsolete finance() Steam unit assertion.
   # It requires an obsolete unit; verify authentic V20 guards instead.
   self._finance()

  def _finance(self):
   native,m2,fp=self.v20.native_snapshot()
   need(fp==V20_FIN_SHA and m2.production_nft_shape()==NFT_SHA,
        "PROTECTED_V20_POST_C01_C03_C04_NFT")
   need(self._show(self.v18.WEB_SERVICE,"User")=="aoe2war-web-prod",
        "RESTRICTED_SITE_UID")
   need(self._show(self.v18.WEB_SERVICE,"MemoryMax")=="3355443200",
        "PROTECTED_ORIGINAL_MEMORY_MAX")
   for port in (8092,8093,8094,8095):
    sockets=self.v18.shell(["ss","-H","-ltn",f"sport = :{port}"],12)
    need("LISTEN" not in sockets,"PROTECTED_FINANCIAL_LISTENER_"+str(port))
   return fp

  def snapshot(self):
   self._finance()
   actual=m.file_sha(self.v18.INSTALLED_WEB)
   need(actual in (m.ORIGINAL_UNIT_SHA,m.CANDIDATE_UNIT_SHA),"UNKNOWN_WEB_SOURCE")
   profile="candidate" if actual==m.CANDIDATE_UNIT_SHA else "rollback"
   v20_name,v20_profile=self.v20.active_profile()
   need(v20_name==profile,"STEAM_PROFILE_MISMATCH")
   pid,ticks=self.v20.verify_active_runtime(v20_name,v20_profile)
   stage=v20_profile["stage"]
   source=(stage/".aoe2war-source-sha").read_text().strip()
   bid=(stage/".next/BUILD_ID").read_text().strip()
   need(source==v20_profile["source"] and bid==v20_profile["build"],
        "SOURCE_STAGE_HASH_IDENTITY_DRIFT")
   if profile=="candidate":
    need(m.file_sha(stage/".aoe2war-runtime-manifest.json")==m.MANIFEST_SHA,
         "CANDIDATE_MANIFEST_CHANGED")
   version=(v20_profile["version"] if self.trial.wait_version(v20_profile["version"],10)
            else "UNKNOWN")
   receipt=json.loads(self.v20.verified(self.v20.RECEIPT,0o600))
   need(receipt.get("profile")==profile
        and receipt.get("current_public_pid")==pid
        and receipt.get("start_ticks")==ticks
        and receipt.get("source_sha")==source
        and receipt.get("build_id")==bid
        and receipt.get("build_version")==version
        and receipt.get("unit_sha256")==actual
        and receipt.get("fin_snapshot_sha256")==V20_FIN_SHA
        and receipt.get("nft_shape_sha256")==NFT_SHA
        and receipt.get("finance_authorized") is False,
        "V20_ACCEPTED_RUNTIME_NOT_BOUND_TO_LIVE_PID")
   need(self._show(self.v18.STEAM_SERVICE,"Result")=="success",
        "STEAM_REFRESH_NOT_ACCEPTED")
   sockets=self.v18.shell(["ss","-H","-ltnp"],15)
   lines=sockets.splitlines()
   for port in ("3030","3032"):
    need(any("127.0.0.1:"+port+" " in line and "next-server" in line
             for line in lines),"ALLOWED_NEXT_LISTENER_"+port)
   need(not any("127.0.0.1:3031 " in line for line in lines),
        "R24_RETIRED_PORT_REVIVED")
   need(not any("127.0.0.1:3033 " in line and "next-server" in line
                for line in lines),"THIRD_NEXT_ON_FAILCLOSED_3033")
   fin_closed=not any(":"+str(port)+" " in line
                      for line in lines for port in (8092,8093,8094,8095))
   need(fin_closed,"FINANCIAL_SERVICE_SOCKETS")
   return m.Snapshot(
      profile=profile,unit_sha=actual,pid=pid,build_version=version,
      build_id=bid,app_source=source,
      steam_unit_sha=m.file_sha(self.v18.INSTALLED_STEAM),
      steam_source_sha=m.file_sha(STEAM),fin_snapshot=V20_FIN_SHA,
      nft_shape=NFT_SHA,memory_max=int(self._show(self.v18.WEB_SERVICE,"MemoryMax")),
      memory_current=int(self._show(self.v18.WEB_SERVICE,"MemoryCurrent")),
      restarts=int(self._show(self.v18.WEB_SERVICE,"NRestarts")),
      web_active=self._show(self.v18.WEB_SERVICE,"ActiveState")=="active",
      steam_timer_active=self._show(self.v18.TIMER,"ActiveState")=="active",
      finance_ports_closed=fin_closed,legacy_masked=True,
      validator_pid=int(self._show("wolochaind-mainnet.service","MainPID")),
      rollback_3030_pid=int(self._show("aoe2hdbets-web.service","MainPID")),
      app_runtime_count=2)

  def wait_health(self,profile):
   need(profile in self.units,"WEB_HEALTH_PROFILE_NOT_APPROVED")
   expected=self.v20.PROFILES[profile]
   need(self.trial.wait_version(expected["version"],100),
        "REVIEWED_NEXT_VERSION_UNHEALTHY")
   self.v20.health(profile,expected)
   if profile=="candidate":
    artifact=json.loads(self.v18.own(self.v18.CI_ARTIFACT,0o600,
                                      self.v18.CI_ARTIFACT_SHA))
    self.trial.protected_public_health(artifact)
   self._finance()

  def enroll(self,profile):
   need(profile in self.units,"V20_NON_ALLOWLISTED_ENROLL")
   self.v18.shell(["/usr/bin/python3","-I","-B",str(STEAM),
                   "--phase","enroll","--profile",profile],260)

  def refresh_steam(self):
   self.v18.shell(["systemctl","start",self.v18.STEAM_SERVICE],220)
   need(self._show(self.v18.STEAM_SERVICE,"Result")=="success",
        "V20_AFTER_RESTART_STEAM_HOLD")
   self.v18.shell(["/usr/bin/python3","-I","-B",str(STEAM),
                   "--phase","inspect"],180)
 return Host

def result(path,report):
 need(not path.exists() and not path.is_symlink(),"ONE_USE_RESULT_EXISTS")
 need(path.parent.is_dir() and path.parent.stat().st_uid==0
      and stat.S_IMODE(path.parent.stat().st_mode)==0o700,
      "PRIVATE_RESULT_DIRECTORY")
 data=(json.dumps(report,sort_keys=True,indent=2)+"\n").encode()
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,"wb") as f:
  f.write(data);f.flush();os.fsync(f.fileno())
 return sha(data)

def main(argv):
 need(argv in (["--inspect"],["--physical"]),"NO_IMPLICIT_PRODUCTION_SWITCH")
 need(not RECEIPT.exists() and not RECEIPT.is_symlink(),
      "ONE_USE_ROUNDTRIP_ALREADY_RUN")
 m=get_core()
 Host=host_class(m)
 host=Host()
 if argv==["--inspect"]:
  before=host.snapshot()
  m.check(before,"candidate")
  need(before.pid==465815,"RETAINED_PRE_ROUNDTRIP_PID_DRIFT")
  print(json.dumps({"status":"PASS_V20_PINNED_ROUNDTRIP_READONLY_ADMISSION",
    "pid":before.pid,"build":before.build_version,"steam_source_sha":STEAM_SHA,
    "finance_authorized":False,"authenticated_roles_verified":False,
    "no_mutation":True},sort_keys=True))
  return 0
 before=host.snapshot()
 m.check(before,"candidate")
 need(before.pid==465815,"RETAINED_PRE_ROUNDTRIP_PID_DRIFT")
 report=m.reversible_cycle(host)
 underlying=report["status"]
 report.update({
  "schema":"aoe2war.app.c03-v20-source-qualified-web-roundtrip.v1",
  "underlying_state_machine_status":underlying,
  "status":("PASS_REAL_V20_WEB3032_RETURN_TO_B1EF_UNAUTHENTICATED"
            if underlying=="PASS_V18_ROLLBACK_AND_RETURN_TO_EXACT_B1EF_NO_FINANCE"
            else "HOLD_V20_WEB3032_ROUNDTRIP"),
  "utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
  "v20_steam_source_sha":STEAM_SHA,"v20_steam_unit_sha":V20_UNIT_SHA,
  "v20_finance_snapshot_sha":V20_FIN_SHA,
  "C03_APP_HANDOFF_ACCEPTED":False,
  "authenticated_roles_verified":False,
  "financial_authorized":False,
  "money_moved":False})
 print("V20_ROUNDTRIP_RECEIPT_SHA256",result(RECEIPT,report))
 print(report["status"])
 return 0 if report["status"].startswith("PASS_") else 3

if __name__=="__main__":
 try:sys.exit(main(sys.argv[1:]))
 except Exception as e:
  print("HOLD_V20_ROUNDTRIP",type(e).__name__,str(e)[:150])
  sys.exit(3)
