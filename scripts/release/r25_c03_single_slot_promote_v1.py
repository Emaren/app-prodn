#!/usr/bin/env python3
"""Exact one-runtime restricted 3032 promotion, Steam V15 enrollment, guarded recovery.

--inspect is read-only. --activate is one-shot. --restore returns to the old
restricted 3032 service using the independently reviewed C03 v2 rollback.
No third Next, Nginx edit, 3030 fallback, finance grant, custody or payout.
"""
from __future__ import annotations
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

P=pathlib.Path
ROOT=P('/root/aoe2war-session-b-r25-exact-promotion-v1-20261109')
COLD=P('/root/aoe2war-r25-c03-same-slot-cold-rollback-v1-20261109')
RELEASE=ROOT/'physical-promotion-result.json'
RECOVERY=ROOT/'physical-manual-recovery-result.json'
LOCK=P('/run/lock/aoe2war-session-b-r25-promote-v1.lock')
WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
STEAM=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
V14=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v14.py')
V15=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v15.py')
V15_STAGED=ROOT/'r25_steam_refresh_traffic_v15.py'
STEAM_V15_STAGED=ROOT/'r25_steam_refresh_traffic_v15.service'
V2=COLD/'r25_c03_same_slot_cold_rollback_v2.py'
ORIGINAL=COLD/'original-finance-restricted-3032-unit.service'
ENV=P('/etc/aoe2war/web-prod-v1/runtime.env')
STAGE=P('/var/lib/aoe2war-web-prod-dd00367a9d64')
OLD=P('/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
RECEIPT_STAGE=P('/root/aoe2war-r25-heap-dd00367a-ci-20261109/stage-verification-no-install.json')
RECEIPT_OVERLAY=P('/root/aoe2war-r25-heap-dd00367a-ci-20261109/root-owned-source-identity-overlay.json')
DROPIN=P('/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf')
ORIGINAL_WEB_SHA='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
NEW_WEB_SHA='41bc6fc3e62247394bd0531ac07428c83eed9dfa76578b76846cb1b48d2c640e'
V14_UNIT_SHA='17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4'
V15_UNIT_SHA='b209cd4adeeaf176720d417b197e9c53402f36771a3096d548e88b006294e051'
V14_SOURCE_SHA='65e6f5294b784473d7fd8889ddd2674650b6373d14e1b78ea9ae847ea2d8157a'
V15_SOURCE_SHA='2418468a2727e408781dbb3a951e08ca25eac4b16ebfb1b09202cbf09237d521'
V2_SOURCE_SHA='f5710ea341e65befced5962b31957bf4bd10d352fedb8f3be1df48c6b4cebc99'
DROPIN_SHA='9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438'
ENV_SHA='2b0c9123a0c01090846966b56bf68ae4d57dab8ec1310b900abc01c0e32de52c'
STAGE_SHA='fb8e1dbaf4a509496b403127e824eac4e233c868579a1d6e34d1e2159da23d44'
OVERLAY_SHA='3cdd41faaa371f6e500d802048a6c64d36b1e931bc7289b485f103e4fe93ec1f'
OLD_VERSION='20261108182649-ca81f00609'
NEW_VERSION='20261109145214-de9c4f1054'
BUILD_ID='MMjuPTuU3DGMrq-Phwo98'
SERVICE='aoe2hdbets-web-prod.service'
TIMER='aoe2war-steam-egress-refresh.timer'
STEAM_SERVICE='aoe2war-steam-egress-refresh.service'
FIN_PORTS=(8092,8093,8094,8095)
class Hold(RuntimeError): pass
def need(v,why):
 if not v:raise Hold('HOLD_'+why)
def sha(data):return hashlib.sha256(data).hexdigest()
def hash_file(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for chunk in iter(lambda:f.read(1<<20),b''):h.update(chunk)
 return h.hexdigest()
def command(args,timeout=35):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 need(p.returncode==0,'COMMAND_'+P(args[0]).name)
 return p.stdout.strip()
def prop(unit,name):return command(['systemctl','show',unit,'-p',name,'--value'],timeout=10)
def secure(path,mode):
 st=path.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and
      stat.S_IMODE(st.st_mode)==mode,'ROOT_PINNED_FILE_MODE_'+path.name)
def same_port_units():
 secure(ORIGINAL,0o600)
 old=ORIGINAL.read_bytes()
 need(sha(old)==ORIGINAL_WEB_SHA,'ORIGINAL_WEB_UNIT_SHA')
 a=str(OLD).encode();b=str(STAGE).encode()
 need(old.count(a)==4 and b not in old,'ORIGINAL_WEB_PATH_SCOPE')
 new=old.replace(a,b)
 need(new.count(b)==4 and a not in new and sha(new)==NEW_WEB_SHA,'NEW_WEB_UNIT_SHA')
 need(b'--port 3032' in old and b'--max-old-space-size=2048' in old and
      b'User=aoe2war-web-prod\n' in old and
      b'EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env' in old,
      'RESTRICTED_RUNTIME_IDENTITY')
 return old,new
def safe_write(path,data,mode):
 temp=path.with_name('.'+path.name+'.c03-exact-v1')
 need(not temp.exists() and not temp.is_symlink(),'PARTIAL_TEMP_ALREADY_PRESENT')
 fd=os.open(temp,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:
  os.fchmod(f.fileno(),mode);f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(temp,path)
def version():
 try:
  req=urllib.request.Request('http://127.0.0.1:3032/api/deployment-version',
      headers={'Host':'aoe2war.com','Cache-Control':'no-store'})
  with urllib.request.urlopen(req,timeout=5) as r:
   if r.status!=200:return None
   return json.loads(r.read(5000)).get('buildVersion')
 except Exception:return None
def request_status(route):
 try:
  req=urllib.request.Request('http://127.0.0.1:3032'+route,
                            headers={'Host':'aoe2war.com','Cache-Control':'no-store'})
  with urllib.request.urlopen(req,timeout=20) as r:
   r.read(1024);return r.status
 except urllib.error.HTTPError as e:return e.code
 except Exception:return None
def exact_finance_guard():
 text=command(['/usr/bin/ss','-H','-ltn'],timeout=8)
 for port in FIN_PORTS:
  need(not re.search(':'+str(port)+r'\s',text),'FINANCE_LISTENER_OPEN')
 for unit in ('wolochain-mainnet-settlement.service',
              'wolochain-founder-rewards-settlement.service'):
  # systemctl is-enabled returns status 1 for an intentionally masked unit.
  # Read the exact result and refuse every other state or unexpected error.
  r=subprocess.run(['systemctl','is-enabled',unit],capture_output=True,
                   text=True,timeout=8)
  need(r.stdout.strip()=='masked' and r.returncode in (0,1),
       'LEGACY_UNIT_UNMASKED')
 need(prop('wolochaind-mainnet.service','MainPID')=='1009','VALIDATOR_PID_DRIFT')
 need(prop('aoe2hdbets-web.service','MainPID')=='2625090','LEGACY_PID_DRIFT')
def preflight():
 need(os.geteuid()==0,'ROOT_REQUIRED')
 need(ROOT.is_dir() and not ROOT.is_symlink() and ROOT.stat().st_uid==0 and
      stat.S_IMODE(ROOT.stat().st_mode)==0o700,'ROOT_ONLY_PROMOTION_STAGE')
 for f,mode,expected in ((V15_STAGED,0o600,V15_SOURCE_SHA),
                         (STEAM_V15_STAGED,0o600,V15_UNIT_SHA),
                         (V2,0o600,V2_SOURCE_SHA),
                         (V14,0o644,V14_SOURCE_SHA),
                         (ENV,0o600,ENV_SHA),
                         (DROPIN,0o644,DROPIN_SHA),
                         (RECEIPT_STAGE,0o600,STAGE_SHA),
                         (RECEIPT_OVERLAY,0o600,OVERLAY_SHA)):
  secure(f,mode);need(hash_file(f)==expected,'EXACT_SOURCE_HASH_'+f.name)
 need(prop(SERVICE,'DropInPaths')==str(DROPIN) and
      prop(SERVICE,'MemoryMax')=='3355443200','WEB_MEMORY_DROPIN_DRIFT')
 old,new=same_port_units()
 need(WEB.read_bytes() in (old,new),'UNREVIEWED_WEB_UNIT')
 need(hash_file(STEAM) in (V14_UNIT_SHA,V15_UNIT_SHA),
      'UNREVIEWED_STEAM_UNIT')
 for stage,source,build,tag in ((OLD,'4ab96cc7c1c0ba43a0403795485d3f410a6ba07f',
                                'YF_YxSAxc0izAfRG0ARsc',OLD_VERSION),
                               (STAGE,'dd00367a9d648e66ebbe9f56e17f323efbdaca6f',
                                BUILD_ID,NEW_VERSION)):
  need(stage.is_dir() and not stage.is_symlink(),'STAGE_MISSING')
  need((stage/'.aoe2war-source-sha').read_text().strip()==source,'STAGE_SOURCE_DRIFT')
  need((stage/'.next/BUILD_ID').read_text().strip()==build,'STAGE_BUILD_DRIFT')
  need((stage/'.aoe2war-build-version').read_text().strip()==tag,'STAGE_VERSION_DRIFT')
 exact_finance_guard()
 need(prop(SERVICE,'User')=='aoe2war-web-prod','SERVICE_UID_DRIFT')
 need(prop(SERVICE,'ActiveState')=='active','WEB_DOWN')
 need(int(prop(SERVICE,'MainPID'))>1,'WEB_PID_MISSING')
 need(os.statvfs('/').f_bavail*os.statvfs('/').f_frsize>8*1024**3,'ROOT_DISK_RESERVE')
 return {'old_web_sha':ORIGINAL_WEB_SHA,'new_web_sha':NEW_WEB_SHA,
         'v14_steam_sha':V14_UNIT_SHA,'v15_steam_sha':V15_UNIT_SHA,
         'finance_ports_closed':True,'finance_permitted':False,
         'web_pid':prop(SERVICE,'MainPID'),'web_build':version()}
def seal(path,data):
 need(not path.exists() and not path.is_symlink(),'ONE_USE_RECEIPT_ALREADY_EXISTS')
 payload={'schema':'aoe2war.app.c03.restricted-r25-exact-promotion.v1',
          'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'finance_authorized':False,'C03_APP_HANDOFF':'HOLD',
          'authenticated_browser_acceptance':False,
          'funded_execution':False,**data}
 body=(json.dumps(payload,sort_keys=True,indent=2)+'\n').encode()
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(body);f.flush();os.fsync(f.fileno())
 print('RECEIPT_SHA256',sha(body),flush=True)
def wait_version(expected,seconds=105):
 deadline=time.monotonic()+seconds
 while time.monotonic()<deadline:
  if version()==expected:return True
  time.sleep(1.5)
 return False
def ensure_steam_inactive():
 command(['systemctl','stop',TIMER],timeout=25)
 deadline=time.monotonic()+50
 while time.monotonic()<deadline:
  state=prop(STEAM_SERVICE,'ActiveState')
  if state=='inactive':return
  if state=='failed':
   command(['systemctl','reset-failed',STEAM_SERVICE],timeout=15)
   continue
  time.sleep(1)
 raise Hold('HOLD_STEAM_ONESHOT_STILL_RUNNING')
def set_steam_v14():
 # Source-installed prior V14 service bytes are independently reconstructed
 # from the exact staged V15 unit: single reviewed script-path substitution.
 v15=STEAM_V15_STAGED.read_bytes()
 a=b'r25_steam_refresh_traffic_v15.py';b=b'r25_steam_refresh_traffic_v14.py'
 need(v15.count(a)==1 and b not in v15,'STEAM_SERVICE_EXACT_SCOPE')
 v14=v15.replace(a,b)
 need(sha(v14)==V14_UNIT_SHA,'STEAM_V14_UNIT_RECONSTRUCTION_DRIFT')
 safe_write(STEAM,v14,0o644)
 command(['systemctl','daemon-reload'],timeout=30)
def recover_to_original():
 notes=[]
 try:
  ensure_steam_inactive()
  if hash_file(STEAM)==V15_UNIT_SHA:set_steam_v14()
  need(hash_file(STEAM)==V14_UNIT_SHA,'V14_ROLLBACK_UNIT_MISSING')
  if hash_file(WEB)==NEW_WEB_SHA:
   # The unit file could have been replaced just before a failed daemon reload.
   # Reconcile systemd from the known exact candidate bytes before V2 restore.
   command(['systemctl','daemon-reload'],timeout=30)
   result=subprocess.run(['/usr/bin/python3',str(V2),'--restore'],
                         capture_output=True,text=True,timeout=165)
   notes.append('v2_rollback_exit_'+str(result.returncode))
   need(result.returncode==0,'EXACT_RESTRICTED_ROLLBACK_NOT_HEALTHY')
  if hash_file(WEB)==ORIGINAL_WEB_SHA and prop(SERVICE,'ActiveState')!='active':
   command(['systemctl','daemon-reload'],timeout=30)
   command(['systemctl','start',SERVICE],timeout=35)
  need(hash_file(WEB)==ORIGINAL_WEB_SHA and
       prop(SERVICE,'ActiveState')=='active' and
       wait_version(OLD_VERSION,35),'RESTRICTED_3032_NOT_RESTORED')
  x=subprocess.run(['/usr/bin/python3','-I','-B',str(V14),
                    '--phase','enroll','--profile','candidate'],
                    capture_output=True,text=True,timeout=120)
  notes.append('v14_original_steam_enroll_exit_'+str(x.returncode))
  need(x.returncode==0,'ORIGINAL_STEAM_NOT_REENROLLED')
  command(['systemctl','start',TIMER])
  exact_finance_guard()
  notes.append('PASS_RESTRICTED_ORIGINAL_3032_RESTORED_AND_STEAM_REBOUND')
 except Exception as e:
  notes.append('HOLD_RECOVERY_'+type(e).__name__+'_'+str(e)[:110])
  # Do not restart an unqualified V15 timer; restore scheduled V14 only when
  # the original exact source and old bound release receipt are still live.
  try:
   if (hash_file(WEB)==ORIGINAL_WEB_SHA and
       hash_file(STEAM)==V14_UNIT_SHA and version()==OLD_VERSION):
    command(['systemctl','start',TIMER],timeout=30)
    notes.append('RECOVERY_V14_TIMER_RESTARTED_ORIGINAL_SOURCE_ONLY')
  except Exception:
   notes.append('HOLD_TIMER_RECOVERY_REQUIRES_MANUAL_ACCEPTANCE')
 return notes
def activate():
 before=preflight()
 need(hash_file(WEB)==ORIGINAL_WEB_SHA and version()==OLD_VERSION,'OLD_WEB_NOT_LIVE')
 need(hash_file(STEAM)==V14_UNIT_SHA,'OLD_STEAM_NOT_LIVE')
 need(not RELEASE.exists() and not RECOVERY.exists(),'ONE_USE_PROMOTION_CONSUMED')
 status='HOLD_RESTRICTED_PROMOTION_FAILED'
 notes=[]; started=time.monotonic()
 try:
  ensure_steam_inactive()
  command(['systemctl','stop',SERVICE],timeout=35)
  safe_write(WEB,same_port_units()[1],0o644)
  command(['systemctl','daemon-reload'])
  command(['systemctl','start',SERVICE],timeout=35)
  need(wait_version(NEW_VERSION),'REPAIRED_WEB_NOT_STARTED')
  public={route:request_status(route) for route in ('/','/players','/api/bets')}
  need(public['/']==200 and public['/players']==200
       and public['/api/bets'] in (200,503),'REPAIRED_WEB_PUBLIC_ROUTES_FAILED')
  need(hash_file(STEAM)==V14_UNIT_SHA,'STEAM_SERVICE_CHANGED_MID_PROMOTION')
  v15=V15_STAGED.read_bytes()
  need(sha(v15)==V15_SOURCE_SHA,'STAGED_V15_SOURCE_CHANGED')
  secure(V15_STAGED,0o600)
  if V15.exists():
   need(hash_file(V15)==V15_SOURCE_SHA,'EXISTING_V15_SOURCE_DRIFT')
  else:
   fd=os.open(V15,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o644)
   with os.fdopen(fd,'wb') as f:f.write(v15);f.flush();os.fsync(f.fileno())
  safe_write(STEAM,STEAM_V15_STAGED.read_bytes(),0o644)
  command(['systemctl','daemon-reload'])
  root=P('/etc/aoe2war/web-prod-v15')
  if not root.exists():root.mkdir(mode=0o500)
  need(root.stat().st_uid==0 and stat.S_IMODE(root.stat().st_mode)==0o500,
       'STEAM_V15_ROOT_NOT_PRIVATE')
  command(['/usr/bin/python3','-I','-B',str(V15),'--phase','selftest'],timeout=100)
  command(['/usr/bin/python3','-I','-B',str(V15),'--phase','enroll',
           '--profile','candidate'],timeout=165)
  command(['systemctl','start',TIMER],timeout=30)
  command(['systemctl','start',STEAM_SERVICE],timeout=165)
  exact_finance_guard()
  need(hash_file(WEB)==NEW_WEB_SHA and hash_file(STEAM)==V15_UNIT_SHA
       and prop(SERVICE,'ActiveState')=='active'
       and version()==NEW_VERSION,'FINAL_PROCESS_IDENTITY_CHANGED')
  status='PASS_NEW_RESTRICTED_3032_EXACT_BUILD_STEAM_V15_ADMITTED_NOT_AUTH_CERTIFIED'
  notes.append('PASS_IMMEDIATE_STEAM_V15_REFRESH')
 except Exception as e:
  notes.append('HOLD_PROMOTION_'+type(e).__name__+'_'+str(e)[:110])
  notes.extend(recover_to_original())
 finally:
  seal(RELEASE,{'status':status,'elapsed_ms':int((time.monotonic()-started)*1000),
                'preflight':before,'observations':notes,
                'web_pid_after':prop(SERVICE,'MainPID'),
                'web_unit_sha_after':hash_file(WEB),
                'steam_unit_sha_after':hash_file(STEAM),
                'web_build_after':version()})
 need(status.startswith('PASS'),'PROMOTION_NOT_ACCEPTED')
 print(status,flush=True)
def restore():
 need(RELEASE.is_file() and not RECOVERY.exists(),'ONE_USE_RECOVERY_NOT_ADMITTED')
 admitted=json.loads(RELEASE.read_text())
 need(admitted['status'].startswith('PASS_'),'PROMOTION_NOT_QUALIFIED')
 need(hash_file(WEB)==NEW_WEB_SHA and hash_file(STEAM)==V15_UNIT_SHA
      and version()==NEW_VERSION,'CURRENT_CANDIDATE_NOT_EXACT')
 exact_finance_guard()
 steps=recover_to_original()
 good=bool(steps and steps[-1].startswith('PASS_'))
 seal(RECOVERY,{'status':'PASS_ORIGINAL_RESTRICTED_3032_RECOVERED' if good
                else 'HOLD_RECOVERY_NOT_ACCEPTED',
                'observations':steps,'web_pid_after':prop(SERVICE,'MainPID'),
                'web_unit_sha_after':hash_file(WEB),
                'steam_unit_sha_after':hash_file(STEAM)})
 need(good,'MANUAL_RECOVERY_FAILED')
 print('PASS_RESTRICTED_SAME_SLOT_RECOVERY',flush=True)
def inspect():
 d=preflight()
 print(json.dumps({'status':'PASS_INERT_SOURCE_PINNED_SINGLE_SLOT_PLAN',
   'no_service_mutation':True,'unit_sha_now':hash_file(WEB),
   'steam_sha_now':hash_file(STEAM),**d},sort_keys=True),flush=True)
if __name__=='__main__':
 try:
  need(len(sys.argv)==2 and sys.argv[1] in ('--inspect','--activate','--restore'),
       'EXPLICIT_PHASE_REQUIRED')
  fd=os.open(LOCK,os.O_CREAT|os.O_WRONLY,0o600)
  with os.fdopen(fd,'w') as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   if sys.argv[1]=='--inspect':inspect()
   elif sys.argv[1]=='--activate':activate()
   else:restore()
 except Exception as e:
  print(type(e).__name__,str(e)[:250],flush=True)
  sys.exit(3)
