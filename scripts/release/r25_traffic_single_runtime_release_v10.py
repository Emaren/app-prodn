#!/usr/bin/env python3
"""Second-attempt R25 4ab96cc7 release from enrolled finance-safe Steam V9 rollback.

Run ONLY via an independent, bounded, root-owned systemd oneshot on HEL1.
Never touches finance roles, grants, chain, funds, Nginx, or legacy 3030.
"""
from __future__ import annotations
import datetime, fcntl, hashlib, json, os, pathlib, re, stat, subprocess, sys, time, urllib.request
P=pathlib.Path
WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
STEAM=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
GUARD=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v9.py')
V7_GUARD=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v7.py')
GUARD_SHA='cb275a8ae8bc62c373ffe73063e60ff8ca7bd93661b899d887432ad6095cb07a'
V7_GUARD_SHA='aaf01a33def75ca840d04cf1ea1132110c197562b60cfee7625959ffab2a01cd'
ROOT=P('/root/aoe2war-session-b-linux-candidate-4ab96cc7-20261108')
STAGE_RECEIPT=ROOT/'physical-stage-acceptance.json'
CURRENT_UNIT_SHA='be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6'
CANDIDATE_UNIT_SHA='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
CURRENT_STEAM_UNIT_SHA='0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557'
CANDIDATE_STEAM_UNIT_SHA='0fddaf791d3c147766c5df108b34c761da9a3d07759043348671fa222eda0557'
STAGE_RECEIPT_SHA='c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701'
SOURCE='4ab96cc7c1c0ba43a0403795485d3f410a6ba07f'
OLD_VERSION='20261108140705-1d068e417c'
NEW_VERSION='20261108182649-ca81f00609'
OLD_PID,LEGACY_PID,VALIDATOR_PID=3329075,2625090,1009
STEAM_EXEC='r25_steam_refresh_traffic_v9.py --phase refresh'
NEW_STEAM_EXEC='r25_steam_refresh_traffic_v9.py --phase refresh'
ROOT_RECEIPT=ROOT/'public-promotion-or-rollback-v10-attempt2.json'
LOCK=P('/run/lock/aoe2war-session-b-traffic-r25-v9.lock')
ORIGINAL_BACKUP=ROOT/'original-3032-unit-v10-before-switch-attempt2.service'
STEAM_BACKUP=ROOT/'original-steam-unit-v10-before-switch-attempt2.service'

def sha(b):return hashlib.sha256(b).hexdigest()
def check(ok,reason):
 if not ok:raise RuntimeError('HOLD:'+reason)
def execute(argv, timeout=20, accepted=(0,)):
 p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
 check(p.returncode in accepted,'COMMAND_FAILED_'+pathlib.Path(argv[0]).name.upper())
 return p.stdout
def pid(unit):
 return int(execute(['systemctl','show',unit,'-p','MainPID','--value'],7).strip())
def protected():
 check(pid('aoe2hdbets-web.service')==LEGACY_PID,'LEGACY_3030_PID_DRIFT')
 check(pid('wolochaind-mainnet.service')==VALIDATOR_PID,'WALLET_VALIDATOR_PID_DRIFT')
 for port in (8094,8095):
  check('LISTEN' not in execute(['ss','-lnt',f'sport = :{port}'],5),'FUNDED_PORT_OPEN')
def read_version():
 try:
  req=urllib.request.Request('http://127.0.0.1:3032/api/deployment-version',
                             headers={'Host':'aoe2war.com','Cache-Control':'no-store'})
  with urllib.request.urlopen(req,timeout=6) as r:
   return json.loads(r.read(10000)).get('buildVersion') if r.status==200 else None
 except Exception:
  return None
def await_version(version, seconds):
 end=time.monotonic()+seconds
 while time.monotonic()<end:
  if read_version()==version and pid('aoe2hdbets-web-prod.service')>1:return pid('aoe2hdbets-web-prod.service')
  time.sleep(0.7)
 raise RuntimeError('HOLD:R25_EXPECTED_VERSION_NOT_HEALTHY')
def persist(path,data,mode):
 tmp=path.with_name('.'+path.name+'.new-'+str(os.getpid()))
 with os.fdopen(os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode),'wb') as f:
  f.write(data);f.flush();os.fsync(f.fileno())
 os.chmod(tmp,mode)
 os.replace(tmp,path)
def receipt(payload):
 obj={'schema':'aoe2war.session-b.traffic-r25-guarded-physical-v10',
      'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'candidate_source':SOURCE,'finance_authorized':False,
      'validator_pid_required':VALIDATOR_PID,'legacy_3030_pid_required':LEGACY_PID}
 obj.update(payload)
 persist(ROOT_RECEIPT,(json.dumps(obj,sort_keys=True,indent=2)+'\n').encode(),0o600)
 print('RELEASE_RECEIPT_SHA256',sha(ROOT_RECEIPT.read_bytes()),flush=True)
def candidate_source_seal():
 # Production's independent executable bootstrap checks this sealed file
 # BEFORE accepting a new Next.js process. The base 44,954-file archive
 # acceptance alone does not prove its presence; the first physical attempt
 # demonstrated that the omission causes a fatal startup failure.
 stage=P('/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
 marker=stage/'.aoe2war-source-sha'
 try:
  item=marker.lstat()
 except FileNotFoundError:
  raise RuntimeError('HOLD:CANDIDATE_ROOT_SOURCE_IDENTITY_MISSING')
 check(stat.S_ISREG(item.st_mode) and item.st_uid==0 and item.st_nlink==1 and
       not item.st_mode&0o022 and item.st_size==41 and not marker.is_symlink(),
       'CANDIDATE_ROOT_SOURCE_IDENTITY_UNSAFE')
 check(marker.read_bytes()==(SOURCE+'\n').encode(),
       'CANDIDATE_ROOT_SOURCE_IDENTITY_DRIFT')
 check((stage/'.next/BUILD_ID').read_text().strip()=='YF_YxSAxc0izAfRG0ARsc',
       'CANDIDATE_ROOT_BUILD_IDENTITY_DRIFT')

def preflight():
 check(os.geteuid()==0,'RELEASE_ROOT_REQUIRED')
 check(sha(GUARD.read_bytes())==GUARD_SHA,'EXACT_REVIEWED_STEAM_V9_GUARD_NOT_INSTALLED')
 check(sha(V7_GUARD.read_bytes())==V7_GUARD_SHA,'STEAM_V7_SOURCE_DRIFT')
 check(sha(STAGE_RECEIPT.read_bytes())==STAGE_RECEIPT_SHA,'NEW_CI_ARTIFACT_STAGE_DRIFT')
 check(sha((ROOT/'staged-source-identity-overlay-v9.json').read_bytes())==
       '3ec11c04117036e787735a1c128411ef3db10f085cd8e319f98d14a2e5e6078c',
       'ROOT_SOURCE_IDENTITY_OVERLAY_RECEIPT_DRIFT')
 candidate_source_seal()
 check(sha(WEB.read_bytes())==CURRENT_UNIT_SHA,'PUBLIC_WEB_UNIT_CHANGED')
 check(sha(STEAM.read_bytes())==CURRENT_STEAM_UNIT_SHA,'PUBLIC_STEAM_UNIT_DRIFT')
 check(STEAM_EXEC in STEAM.read_text(),'STEAM_V9_NOT_ACTIVE')
 # One-shot result history is not an authorization. Native V9 scoped
 # admission and exact current source are required before a restart.
 # Bound the natural minute timer/oneshot overlap. Never stop or override
 # the actual service, and never accept a changed unit/source.
 deadline=time.monotonic()+18
 while execute(['systemctl','show','aoe2war-steam-egress-refresh.service',
                '-p','ActiveState','--value'],7).strip()!='inactive':
  check(time.monotonic()<deadline,'PREVIOUS_STEAM_REFRESH_STILL_ACTIVE')
  time.sleep(0.35)
 # Require the physically admitted V9 rollback profile and original
 # finance snapshot, not a new pin or an old failed V7 refresh.
 prior=execute(['/usr/bin/python3','-I','-B',str(GUARD),'--phase','plan'],55)
 check('PASS' in prior and 'HOLD' not in prior,
       'V9_ENROLLED_RESTRICTED_STEAM_ROLLBACK_NOT_PROVEN')
 check(pid('aoe2hdbets-web-prod.service')==OLD_PID,'PUBLIC_WEB_PROCESS_CHANGED')
 check(read_version()==OLD_VERSION,'OLD_PUBLIC_RELEASE_UNHEALTHY')
 check(execute(['systemctl','show','aoe2war-steam-egress-refresh.timer','-p','ActiveState','--value'],6).strip()=='active','STEAM_TIMER_DISABLED')
 for p in (ROOT_RECEIPT,ORIGINAL_BACKUP,STEAM_BACKUP):
  check(not p.exists() and not p.is_symlink(),'RELEASE_ALREADY_ATTEMPTED')
 values=P('/proc/meminfo').read_text()
 avail=int(next(l.split()[1] for l in values.splitlines() if l.startswith('MemAvailable:')))*1024
 check(avail>=1_250_000_000,'WEB_RESTART_RAM_HEADROOM_LOW')
 import shutil
 check(shutil.disk_usage('/').free>=7_000_000_000,'ROOT_DISK_RESERVE_TOO_LOW')
 protected()
 before=WEB.read_bytes()
 candidate=ROOT/'candidate-3032-unit-NOT-INSTALLED.service'
 new=before.replace(b'/var/lib/aoe2war-web-prod-0a7450f9c8c1',
                    b'/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
 check(before.count(b'/var/lib/aoe2war-web-prod-0a7450f9c8c1')==4,'WEB_4_PATH_BINDING_NOT_EXACT')
 check(new==candidate.read_bytes() and sha(new)==CANDIDATE_UNIT_SHA,'APPROVED_CANDIDATE_UNIT_DRIFT')
 before_steam=STEAM.read_bytes()
 # Steam V9 is already enrolled and running for restricted old 3032;
 # switching app code cannot silently rewrite its immutable service unit.
 new_steam=before_steam
 check(before_steam.count(b'r25_steam_refresh_traffic_v9.py')==1,
       'STEAM_V9_PATH_BINDING_NOT_EXACT')
 check(sha(new_steam)==CURRENT_STEAM_UNIT_SHA,'ENROLLED_V9_STEAM_UNIT_NOT_REVIEWED')
 check(sha(before)==CURRENT_UNIT_SHA,'WEB_UNIT_PREIMAGE_DRIFT')
 candidate_source_seal()
 return before,new,before_steam,new_steam

def manual_steam_refresh():
 execute(['systemctl','start','aoe2war-steam-egress-refresh.service'],35)
 check(execute(['systemctl','show','aoe2war-steam-egress-refresh.service','-p','Result','--value'],7).strip()=='success','STEAM_REFRESH_FAILED')

def transition(web_bytes,steam_bytes):
 check(sha(web_bytes) in (CURRENT_UNIT_SHA,CANDIDATE_UNIT_SHA),'NON_WHITELISTED_WEB_UNIT')
 check(sha(steam_bytes) in (CURRENT_STEAM_UNIT_SHA,CANDIDATE_STEAM_UNIT_SHA),'NON_WHITELISTED_STEAM_UNIT')
 # Two and only two permitted pairs; V9 Steam unit is never rewritten.
 # The 3030 finance-writable legacy service cannot be a rollback target.
 allowed={(CURRENT_UNIT_SHA,CURRENT_STEAM_UNIT_SHA),
          (CANDIDATE_UNIT_SHA,CURRENT_STEAM_UNIT_SHA)}
 check((sha(web_bytes),sha(steam_bytes)) in allowed,
       'MIXED_RELEASE_UNSAFE')
 check(sha(STEAM.read_bytes())==CURRENT_STEAM_UNIT_SHA and
       STEAM.read_bytes()==steam_bytes,'ENROLLED_STEAM_UNIT_MUTATED_DURING_RELEASE')
 persist(WEB,web_bytes,0o644)
 check(sha(STEAM.read_bytes())==CURRENT_STEAM_UNIT_SHA and
       STEAM.read_bytes()==steam_bytes,'ENROLLED_STEAM_UNIT_MUTATED_DURING_RELEASE')
 execute(['systemctl','daemon-reload'],14)
 if sha(web_bytes)==CURRENT_UNIT_SHA and sha(steam_bytes)==CURRENT_STEAM_UNIT_SHA:
  # The attempted candidate may have exhausted systemd StartLimitBurst.
  # Clear ONLY this exact website unit counter before restoring its known
  # finance-restricted old-version, then fail closed on any restart error.
  execute(['systemctl','reset-failed','aoe2hdbets-web-prod.service'],9)
 execute(['systemctl','restart','aoe2hdbets-web-prod.service'],40)

def enrollment(new_release):
 guard=GUARD
 profile='candidate' if new_release else 'rollback'
 expected='PASS_EXACT_STEAM_V9_ADMISSION'
 output=execute(['/usr/bin/python3','-I','-B',str(guard),'--phase','enroll','--profile',profile],55)
 check(expected in output,'STEAM_SCOPED_ADMISSION_NOT_PASS')
 manual_steam_refresh()
def public_exact_version(version, maximum_seconds=24):
 # This read-only HTTPS edge check can never mutate an auth session or balance.
 until=time.monotonic()+maximum_seconds
 while time.monotonic()<until:
  try:
   r=urllib.request.Request('https://aoe2war.com/api/deployment-version',
      headers={'Cache-Control':'no-store','User-Agent':'AoE2WAR-Release-Exact-Build-Observer'})
   with urllib.request.urlopen(r,timeout=7) as ans:
    if ans.status==200 and json.loads(ans.read(16000)).get('buildVersion')==version:return True
  except (Exception,):
   pass
  time.sleep(1)
 raise RuntimeError('HOLD:PUBLIC_HTTPS_BUILD_PARITY_UNPROVEN')

def audit_new():
 check(read_version()==NEW_VERSION,'NEW_R25_BUILD_VERSION_MISMATCH')
 protected()
 execute(['/usr/bin/python3','-I','-B',str(GUARD),'--phase','plan'],55)
 public_exact_version(NEW_VERSION,24)
 check(sha(WEB.read_bytes())==CANDIDATE_UNIT_SHA,'UNIT_REPLACED_DURING_AUDIT')
 time.sleep(5)
 check(read_version()==NEW_VERSION,'RUNTIME_RESTART_AFTER_PROMOTION')
def nonidentifying_failure(error):
 text=str(error)
 m=re.fullmatch(r'HOLD:([A-Z0-9_]{3,110})',text)
 return m.group(1) if m else type(error).__name__.upper()

def main():
 check(os.geteuid()==0,'ROOT_REQUIRED')
 with LOCK.open('w') as file:
  try:fcntl.flock(file,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:raise RuntimeError('HOLD:OTHER_RELEASE_RUNNING')
  old_web,new_web,old_steam,new_steam=preflight()
  print('PASS_BOUNDED_V10_RELEASE_PREFLIGHT',{'old_pid':OLD_PID,'source':SOURCE,
           'web_unit':CANDIDATE_UNIT_SHA,'steam_unit':CANDIDATE_STEAM_UNIT_SHA},flush=True)
  # Existing enrolled V9 Steam egress must PASS before any production change.
  manual_steam_refresh()
  candidate_source_seal()
  timer_paused=False
  attempted=False
  try:
   execute(['systemctl','stop','aoe2war-steam-egress-refresh.timer'],12)
   timer_paused=True
   persist(ORIGINAL_BACKUP,old_web,0o600)
   persist(STEAM_BACKUP,old_steam,0o600)
   attempted=True
   transition(new_web,new_steam)
   newpid=await_version(NEW_VERSION,30)
   enrollment(True)
   audit_new()
   receipt({'status':'PASS_PUBLIC_R25_4AB96_STEAM_V9',
    'new_pid':newpid,'public_build_version':NEW_VERSION,
    'candidate_unit_sha256':CANDIDATE_UNIT_SHA,'steam_unit_sha256':CANDIDATE_STEAM_UNIT_SHA,
    'steam_only_refresh_accepted':True,'canonical_traffic_certification_authorized':False})
   print('PASS_V10_PUBLIC_WEBSITE_STEAM_FINANCE_FENCED',newpid,flush=True)
  except BaseException as error:
   print('HOLD_V10_CANDIDATE_BEGIN_ROLLBACK',nonidentifying_failure(error),flush=True)
   if attempted:
    try:
     # Safe rollback is 3032 restricted old-version with V9 egress,
     # not the finance-writable 3030 service or stale V7 fingerprint.
     transition(old_web,new_steam)
     rbpid=await_version(OLD_VERSION,35)
     enrollment(False)
     protected()
     public_exact_version(OLD_VERSION,32)
     receipt({'status':'PASS_AUTOMATIC_3032_FINANCE_RESTRICTED_V9_SAFE_ROLLBACK',
       'rollback_pid':rbpid,'restored_build_version':OLD_VERSION,
       'rollback_unit_sha256':CURRENT_UNIT_SHA,'steam_unit_sha256':CANDIDATE_STEAM_UNIT_SHA,
       'steam_only_refresh_accepted':True,'canonical_traffic_certification_authorized':False})
     print('PASS_RESTRICTED_3032_STEAM_V9_ROLLBACK',rbpid,flush=True)
    except BaseException as rollback_error:
     print('EMERGENCY_HOLD_V10_ROLLBACK_NOT_VERIFIED',nonidentifying_failure(rollback_error),flush=True)
     try:receipt({'status':'HOLD_V10_AUTOMATIC_ROLLBACK_UNVERIFIED',
                  'failure_class':type(rollback_error).__name__})
     except BaseException:pass
   raise SystemExit(3)
  finally:
   if timer_paused:
    # Service-only timer restored even after checked rollback; never leave
    # the outbound Steam permit without its bounded renewable heartbeat.
    p=subprocess.run(['systemctl','start','aoe2war-steam-egress-refresh.timer'],
                     capture_output=True,text=True,timeout=15)
    print('STEAM_TIMER_RESUME', 'PASS' if p.returncode==0 else 'HOLD',flush=True)
if __name__=='__main__':
 try:
  import argparse
  cli=argparse.ArgumentParser(description='Exact-source website-only V10 attempt2 controller')
  cli.add_argument('--phase',choices=['plan','execute'],required=True)
  args=cli.parse_args()
  if args.phase=='plan':
   old_web,new_web,old_steam,new_steam=preflight()
   print(json.dumps({'status':'PASS_V10_READ_ONLY_EXACT_RELEASE_PREFLIGHT',
     'source':SOURCE,'previous_public_pid':OLD_PID,'old_web_sha256':sha(old_web),
     'new_web_sha256':sha(new_web),'old_steam_sha256':sha(old_steam),
     'new_steam_sha256':sha(new_steam),'financial_authorized':False,
     'public_deployed':False},sort_keys=True),flush=True)
  elif args.phase=='execute':
   main()
 except Exception as e:
  print('RELEASE_HOLD',nonidentifying_failure(e),flush=True)
  sys.exit(3)
