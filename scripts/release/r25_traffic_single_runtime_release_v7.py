#!/usr/bin/env python3
"""Guarded R25 single-process Traffic release, rollback old R25 with Steam re-admission.

Run ONLY via an independent, bounded, root-owned systemd oneshot on HEL1.
Never touches finance roles, grants, chain, funds, Nginx, or legacy 3030.
"""
from __future__ import annotations
import datetime, fcntl, hashlib, json, os, pathlib, re, stat, subprocess, sys, time, urllib.request
P=pathlib.Path
WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
STEAM=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
GUARD=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v7.py')
GUARD_SHA='aaf01a33def75ca840d04cf1ea1132110c197562b60cfee7625959ffab2a01cd'
ROOT=P('/root/aoe2war-session-b-r25-traffic-candidate-0a7450f9')
STAGE_RECEIPT=ROOT/'physical-stage-acceptance.json'
CURRENT_UNIT_SHA='13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5'
CANDIDATE_UNIT_SHA='be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6'
STAGE_RECEIPT_SHA='31d750fe72b6b6e1fdad492fec94d1a863fd5305360c400bc3b036167b6c9f27'
SOURCE='0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1'
OLD_VERSION='20261108044653-2983e18532'
NEW_VERSION='20261108140705-1d068e417c'
OLD_PID,LEGACY_PID,VALIDATOR_PID=2990256,2625090,1009
STEAM_EXEC='r25_steam_refresh_traffic_v7.py --phase refresh'
ROOT_RECEIPT=ROOT/'public-promotion-or-rollback-v7-attempt2.json'
LOCK=P('/run/lock/aoe2war-session-b-traffic-r25-v7.lock')
ORIGINAL_BACKUP=ROOT/'original-3032-unit-v7-before-switch-attempt2.service'

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
 obj={'schema':'aoe2war.session-b.traffic-r25-guarded-physical-v7',
      'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'candidate_source':SOURCE,'finance_authorized':False,
      'validator_pid_required':VALIDATOR_PID,'legacy_3030_pid_required':LEGACY_PID}
 obj.update(payload)
 persist(ROOT_RECEIPT,(json.dumps(obj,sort_keys=True,indent=2)+'\n').encode(),0o600)
 print('RELEASE_RECEIPT_SHA256',sha(ROOT_RECEIPT.read_bytes()),flush=True)
def preflight():
 check(os.geteuid()==0,'RELEASE_ROOT_REQUIRED')
 check(sha(GUARD.read_bytes())==GUARD_SHA,'EXACT_REVIEWED_STEAM_GUARD_NOT_INSTALLED')
 check(sha(STAGE_RECEIPT.read_bytes())==STAGE_RECEIPT_SHA,'NEW_CI_ARTIFACT_STAGE_DRIFT')
 check(sha(WEB.read_bytes())==CURRENT_UNIT_SHA,'PUBLIC_WEB_UNIT_CHANGED')
 check(sha(STEAM.read_bytes())!=CURRENT_UNIT_SHA,'BAD_STEAM_UNIT')
 check(STEAM_EXEC in STEAM.read_text(),'STEAM_V7_NOT_ACTIVE')
 check(pid('aoe2hdbets-web-prod.service')==OLD_PID,'PUBLIC_WEB_PROCESS_CHANGED')
 check(read_version()==OLD_VERSION,'OLD_PUBLIC_RELEASE_UNHEALTHY')
 check(execute(['systemctl','show','aoe2war-steam-egress-refresh.timer','-p','ActiveState','--value'],6).strip()=='active','STEAM_TIMER_DISABLED')
 check(ROOT_RECEIPT.exists() is False,'RELEASE_ALREADY_ATTEMPTED')
 check(ORIGINAL_BACKUP.exists() is False,'ROLLBACK_BACKUP_ALREADY_EXISTS')
 values=P('/proc/meminfo').read_text()
 avail=int(next(l.split()[1] for l in values.splitlines() if l.startswith('MemAvailable:')))*1024
 check(avail>=1_250_000_000,'WEB_RESTART_RAM_HEADROOM_LOW')
 import shutil
 check(shutil.disk_usage('/').free>=11_000_000_000,'ROOT_DISK_RESERVE_TOO_LOW')
 protected()
 raw=WEB.read_bytes()
 candidate=ROOT/'candidate-3032-unit-NOT-INSTALLED.service'
 check(sha(candidate.read_bytes())==CANDIDATE_UNIT_SHA,'APPROVED_CANDIDATE_UNIT_DRIFT')
 check(sha(raw)==CURRENT_UNIT_SHA,'WEB_UNIT_PREIMAGE_DRIFT')
 return raw,candidate.read_bytes()
def manual_steam_refresh():
 execute(['systemctl','start','aoe2war-steam-egress-refresh.service'],28)
 check(execute(['systemctl','show','aoe2war-steam-egress-refresh.service','-p','Result','--value'],6).strip()=='success','STEAM_V7_REFRESH_FAILED')
def transition(raw):
 if sha(raw) not in (CURRENT_UNIT_SHA,CANDIDATE_UNIT_SHA):raise RuntimeError('HOLD:NON_WHITELISTED_WEB_UNIT')
 persist(WEB,raw,0o644)
 execute(['systemctl','daemon-reload'],12)
 execute(['systemctl','restart','aoe2hdbets-web-prod.service'],34)
def enrollment(profile):
 output=execute(['/usr/bin/python3','-I','-B',str(GUARD),'--phase','enroll','--profile',profile],50)
 check('PASS_EXACT_STEAM_V7_ADMISSION' in output,'STEAM_V7_ADMISSION_NOT_PASS')
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
 execute(['/usr/bin/python3','-I','-B',str(GUARD),'--phase','plan'],35)
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
  original,new=preflight()
  print('PASS_BOUNDED_RELEASE_PREFLIGHT',{'old_pid':OLD_PID,'candidate_source':SOURCE,'unit_sha':CANDIDATE_UNIT_SHA},flush=True)
  # A failed old-site Steam refresh must never restart an otherwise healthy
  # already accepted production website.
  manual_steam_refresh()
  persist(ORIGINAL_BACKUP,original,0o600)
  try:
   transition(new)
   newpid=await_version(NEW_VERSION,25)
   print('NEW_WEB_PROCESS_RUNNING',newpid,flush=True)
   enrollment('candidate')
   audit_new()
   receipt({'status':'PASS_PUBLIC_R25_TRAFFIC_WEBSITE_AND_STEAM_V7',
    'new_pid':newpid,'public_build_version':NEW_VERSION,'candidate_unit_sha256':CANDIDATE_UNIT_SHA,
    'steam_only_refresh_accepted':True,'canonical_traffic_certification_authorized':False})
   print('PASS_TRAFFIC_R25_PRODUCTION_CUTOVER',newpid,flush=True)
  except BaseException as error:
   print('HOLD_CANDIDATE_INITIATING_AUTOMATIC_STEAM_SAFE_ROLLBACK',
         nonidentifying_failure(error),flush=True)
   try:
    transition(original)
    rbpid=await_version(OLD_VERSION,28)
    enrollment('rollback')
    protected()
    public_exact_version(OLD_VERSION,24)
    receipt({'status':'PASS_AUTOMATIC_STEAM_SAFE_ROLLBACK_CANDIDATE_HELD',
      'rollback_pid':rbpid,'restored_build_version':OLD_VERSION,
      'rollback_unit_sha256':CURRENT_UNIT_SHA,'steam_only_refresh_accepted':True,
      'canonical_traffic_certification_authorized':False})
    print('PASS_ROLLBACK_PUBLIC_WEBSITE_STEAM_AND_FINANCIAL_FENCE',rbpid,flush=True)
   except BaseException as rollback_error:
    print('EMERGENCY_HOLD_ROLLBACK_NOT_VERIFIED',nonidentifying_failure(rollback_error),flush=True)
    try:receipt({'status':'HOLD_AUTOMATIC_ROLLBACK_UNVERIFIED','failure_class':type(rollback_error).__name__})
    except BaseException:pass
   raise SystemExit(3)
if __name__=='__main__':
 try:main()
 except Exception as e:
  print('RELEASE_HOLD',nonidentifying_failure(e),flush=True)
  sys.exit(3)
