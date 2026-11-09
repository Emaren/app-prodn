#!/usr/bin/env python3
"""C03: tightly pinned, single-runtime fail-shut recovery on SAME restricted 3032.

--inspect never mutates. --restore is one-use and ONLY when NEW unit is live.
No 3030 finance-writable fallback, Nginx edit, direct SQL DML, or money movement.
Does not certify Steam authentication or C03 handoff; runtime still needs browser.
"""
from __future__ import annotations
import datetime
import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

P = pathlib.Path
OLD_RUNTIME=P('/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
NEW_RUNTIME=P('/var/lib/aoe2war-web-prod-dd00367a9d64')
UNIT=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
ENV=P('/etc/aoe2war/web-prod-v1/runtime.env')
STEAM=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
ROOT=P('/root/aoe2war-r25-c03-same-slot-cold-rollback-v1-20261109')
ARCHIVE=P('/root/aoe2war-r25-heap-dd00367a-ci-20261109')
RECEIPT=ROOT/'physical-recovery-result-v2.json'
ORIGINAL=ROOT/'original-finance-restricted-3032-unit.service'
LOCK=P('/run/lock/aoe2war-session-b-c03-cold-slot-v2.lock')
OLD_UNIT_SHA='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
NEW_UNIT_SHA='41bc6fc3e62247394bd0531ac07428c83eed9dfa76578b76846cb1b48d2c640e'
ENV_SHA='2b0c9123a0c01090846966b56bf68ae4d57dab8ec1310b900abc01c0e32de52c'
STEAM_SHA='17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4'
# Source-authorized unchanged systemd runtime memory ceiling. Do not remove it
# merely to make the controller succeed; accept ONLY these root-pinned bytes.
DROPIN=P('/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf')
DROPIN_SHA='9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438'
MEMORY_MAX='3355443200'

OLD_SOURCE='4ab96cc7c1c0ba43a0403795485d3f410a6ba07f'
NEW_SOURCE='dd00367a9d648e66ebbe9f56e17f323efbdaca6f'
OLD_VERSION='20261108182649-ca81f00609'
NEW_VERSION='20261109145214-de9c4f1054'
NEW_BUILD='MMjuPTuU3DGMrq-Phwo98'
STAGE_RECEIPT_SHA='fb8e1dbaf4a509496b403127e824eac4e233c868579a1d6e34d1e2159da23d44'
OVERLAY_SHA='3cdd41faaa371f6e500d802048a6c64d36b1e931bc7289b485f103e4fe93ec1f'
OLD_BYTES=str(OLD_RUNTIME).encode()
NEW_BYTES=str(NEW_RUNTIME).encode()

class Hold(RuntimeError):pass
def require(value,reason):
 if not value:raise Hold('HOLD_'+reason)
def sha(data):return hashlib.sha256(data).hexdigest()
def sha_file(file):
 h=hashlib.sha256()
 with file.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def source_unit(raw):
 require(sha(raw)==OLD_UNIT_SHA,'LEGACY_RESTRICTED_UNIT_SHA_CHANGED')
 require(raw.count(OLD_BYTES)==4 and NEW_BYTES not in raw,
         'RESTRICTED_UNIT_NOT_EXACT_4_PATHS')
 require(b'User=aoe2war-web-prod\n' in raw,'RESTRICTED_UNPRIVILEGED_OS_USER_CHANGED')
 require(b'EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env' in raw,
         'DB_AUTH_ENVFILE_CHANGED')
 require(b'--port 3032' in raw and b'--max-old-space-size=2048' in raw,
         'ORIGINAL_PORT_OR_MEMORY_BOUND_CHANGED')
 require(b'BindReadOnlyPaths=' in raw and b'ReadOnlyPaths=' in raw,
         'NONFINANCIAL_MEDIA_OR_RUNTIME_ISOLATION_REMOVED')
 require(b'ProtectHome=yes' in raw and b'NoNewPrivileges=yes' in raw,
         'SYSTEMD_SANDBOX_WEAKENED')
 return raw
def candidate_unit(original):
 old=source_unit(original)
 future=old.replace(OLD_BYTES,NEW_BYTES)
 require(sha(future)==NEW_UNIT_SHA,'CANDIDATE_UNIT_PREIMAGE_NOT_EXACT')
 require(future.count(NEW_BYTES)==4 and OLD_BYTES not in future,
         'CANDIDATE_BROKEN_PATH_BINDINGS')
 return future
def proc(unit,field,timeout=9):
 r=subprocess.run(['systemctl','show',unit,'-p',field,'--value'],capture_output=True,text=True,timeout=timeout)
 require(r.returncode==0,'SYSTEMCTL_SHOW_'+field)
 return r.stdout.strip()
def require_exact_existing_memory_dropin():
 actual=proc('aoe2hdbets-web-prod.service','DropInPaths')
 require(actual==str(DROPIN),'WEB_UNIT_DROPIN_SCOPE_CHANGED')
 require(DROPIN.is_file() and not DROPIN.is_symlink(),'WEB_MEMORY_DROPIN_NOT_REGULAR')
 metadata=DROPIN.lstat()
 require(metadata.st_uid==0 and metadata.st_nlink==1 and
         stat.S_IMODE(metadata.st_mode)==0o644,'WEB_MEMORY_DROPIN_ACL_CHANGED')
 require(sha_file(DROPIN)==DROPIN_SHA,'WEB_MEMORY_DROPIN_SHA_CHANGED')
 require(proc('aoe2hdbets-web-prod.service','MemoryMax')==MEMORY_MAX,
         'WEB_EFFECTIVE_MEMORY_LIMIT_CHANGED')
 return {'memory_limit_bytes':MEMORY_MAX,'dropin_sha256':DROPIN_SHA}

def exec_cmd(*cmd,timeout=30):
 r=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout)
 require(r.returncode==0,'COMMAND_'+pathlib.Path(cmd[0]).name)
 return r.stdout.strip()
def read_markers():
 for d,src,build in ((OLD_RUNTIME,OLD_SOURCE,'YF_YxSAxc0izAfRG0ARsc'),
                     (NEW_RUNTIME,NEW_SOURCE,NEW_BUILD)):
  require(d.is_dir() and not d.is_symlink(),'RESTRICTED_RUNTIME_MISSING')
  require((d/'.aoe2war-source-sha').read_text().strip()==src,'SOURCE_MARKER_CHANGED')
  require((d/'.next/BUILD_ID').read_text().strip()==build,'BUILD_ID_MISMATCH')
 require((OLD_RUNTIME/'.aoe2war-build-version').read_text().strip()==OLD_VERSION,
         'ORIGINAL_ROLLBACK_VERSION_DRIFT')
 require((NEW_RUNTIME/'.aoe2war-build-version').read_text().strip()==NEW_VERSION,
         'NEW_CANDIDATE_VERSION_DRIFT')
def static_evidence():
 require(os.geteuid()==0,'ROOT_REQUIRED')
 require(ROOT.is_dir() and ROOT.stat().st_uid==0
   and stat.S_IMODE(ROOT.stat().st_mode)==0o700,'ROOT_ONLY_CONTROLLER_STAGE')
 require(sha_file(ARCHIVE/'stage-verification-no-install.json')==STAGE_RECEIPT_SHA,
         'EXACT_CI_BUILD_STAGE_RECEIPT_DRIFT')
 require(sha_file(ARCHIVE/'root-owned-source-identity-overlay.json')==OVERLAY_SHA,
         'EXACT_CI_SOURCE_MARKER_RECEIPT_DRIFT')
 require(sha_file(ENV)==ENV_SHA,'RESTRICTED_DB_SECRETS_OR_ROLE_CHANGED')
 require(sha_file(STEAM)==STEAM_SHA,'STEAM_V14_PROTECTED_UNIT_CHANGED')
 dropin_evidence=require_exact_existing_memory_dropin()
 read_markers()
 require(proc('wolochaind-mainnet.service','MainPID')=='1009',
         'NATIVE_VALIDATOR_PROCESS_CHANGED')
 require(proc('aoe2hdbets-web.service','MainPID')=='2625090',
         'ORIGINAL_LEGACY_3030_DRIFT')
 for old in ('wolochain-mainnet-settlement.service','wolochain-founder-rewards-settlement.service'):
  require(subprocess.run(['systemctl','is-enabled',old],capture_output=True,
          text=True,timeout=8).stdout.strip()=='masked','C04_MASK_REMOVED')
 ss=exec_cmd('/usr/bin/ss','-ltn',timeout=8)
 for port in (8092,8093,8094,8095):
  require(not re.search(':'+str(port)+r'\s',ss),'FUNDED_OR_LEGACY_PORT_OPEN')
 require(shutil.disk_usage('/').free>8*1024**3,'ROOT_STORAGE_RESERVE_LT_8G')
 return {'validator_pid':'1009','legacy_3030_pid':'2625090',
         'financial_ports_closed':True,'legacy_masks_persistent':True,
         'restricted_env_sha':ENV_SHA,'original_unit_sha':OLD_UNIT_SHA,
         'candidate_unit_sha':NEW_UNIT_SHA,'steam_v14_unit_sha':STEAM_SHA,
         **dropin_evidence}
def current_unit_state():
 raw=UNIT.read_bytes()
 h=sha(raw)
 require(h in (OLD_UNIT_SHA,NEW_UNIT_SHA),'UNKNOWN_WEB_UNIT_PREIMAGE')
 expected=candidate_unit(source_unit(ORIGINAL.read_bytes())) if ORIGINAL.exists() else None
 if h==NEW_UNIT_SHA and expected is not None:
  require(raw==expected,'CANDIDATE_UNIT_BYTES_CHANGED')
 return h
def get_version():
 req=urllib.request.Request('http://127.0.0.1:3032/api/deployment-version',
                            headers={'Host':'aoe2war.com','Cache-Control':'no-store'})
 try:
  with urllib.request.urlopen(req,timeout=4) as res:
   if res.status!=200:return None
   return json.loads(res.read(8192)).get('buildVersion')
 except Exception:return None
def seal(payload):
 require(not RECEIPT.exists() and not RECEIPT.is_symlink(),'ONE_USE_RECEIPT_ALREADY_EXISTS')
 doc={'schema':'aoe2war.app.C03.same-port-finance-restricted-cold-rollback.v2',
      'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
      'source_rollback':OLD_SOURCE,'target_source':NEW_SOURCE,
      'funding_authorized':False,'financial_db_permissions_changed':False,
      'authenticated_rollback_certified':False,'C03_APP_HANDOFF':'HOLD'}
 doc.update(payload)
 body=(json.dumps(doc,indent=2,sort_keys=True)+'\n').encode()
 fd=os.open(RECEIPT,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:
  os.fchmod(f.fileno(),0o600);f.write(body);f.flush();os.fsync(f.fileno())
 print('RECEIPT_SHA256',sha(body),flush=True)
def atomic_replace(data):
 temporary=UNIT.with_name('.'+UNIT.name+'.c03-cold-recovery-v2')
 require(not temporary.exists() and not temporary.is_symlink(),'TEMP_SERVICE_UNIT_EXISTS')
 fd=os.open(temporary,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o644)
 with os.fdopen(fd,'wb') as f:
  os.fchmod(f.fileno(),0o644);f.write(data);f.flush();os.fsync(f.fileno())
 os.replace(temporary,UNIT)
def restore():
 evidence=static_evidence()
 require(ORIGINAL.is_file() and ORIGINAL.stat().st_uid==0
         and stat.S_IMODE(ORIGINAL.stat().st_mode)==0o600,
         'PRIVATE_ORIGINAL_UNIT_BACKUP_NOT_PRESENT')
 old=source_unit(ORIGINAL.read_bytes())
 new=candidate_unit(old)
 require(sha(UNIT.read_bytes())==NEW_UNIT_SHA and UNIT.read_bytes()==new,
         'EXACT_CANDIDATE_NOT_LIVE')
 require(not RECEIPT.exists(),'RESTORE_RECEIPT_ALREADY_CONSUMED')
 require_exact_existing_memory_dropin()
 require(proc('aoe2hdbets-web-prod.service','WorkingDirectory')==str(NEW_RUNTIME),
         'CANDIDATE_WORKDIR_NOT_ACTIVE')
 require(proc('aoe2hdbets-web-prod.service','User')=='aoe2war-web-prod',
         'RESTRICTED_OS_IDENTITY_CHANGED')
 started=time.monotonic(); status='HOLD_RESTORE_NOT_HEALTHY'
 try:
  exec_cmd('systemctl','stop','aoe2hdbets-web-prod.service',timeout=35)
  atomic_replace(old)
  exec_cmd('systemctl','daemon-reload',timeout=35)
  require(sha_file(UNIT)==OLD_UNIT_SHA,'ORIGINAL_UNIT_RESTORE_FAILED')
  exec_cmd('systemctl','start','aoe2hdbets-web-prod.service',timeout=35)
  deadline=time.monotonic()+100
  while time.monotonic()<deadline:
   if get_version()==OLD_VERSION:
    status='PASS_RESTORED_RESTRICTED_ORIGINAL_3032_NOT_AUTH_CERTIFIED'
    break
   time.sleep(1.5)
 except Exception as e:
  print('HOLD_ORIGINAL_ROLLBACK_TRANSITION',type(e).__name__,str(e)[:160],flush=True)
  # Recovery itself can fail (daemon reload, source launch, health timeout).
  # First restore the exact original unit if the candidate is still pinned,
  # then attempt ONE bounded old-source start. NEVER start legacy 3030.
  # A second recovery attempt is evidence, never a synthetic PASS.
  try:
   current=sha_file(UNIT)
   require(current in (NEW_UNIT_SHA, OLD_UNIT_SHA),
           'UNRECOGNIZED_PARTIAL_RECOVERY_UNIT')
   if current==NEW_UNIT_SHA:
    exec_cmd('systemctl','stop','aoe2hdbets-web-prod.service',timeout=35)
    atomic_replace(old)
   require(sha_file(UNIT)==OLD_UNIT_SHA,'SECONDARY_ORIGINAL_UNIT_HASH_DRIFT')
   exec_cmd('systemctl','daemon-reload',timeout=35)
   exec_cmd('systemctl','start','aoe2hdbets-web-prod.service',timeout=35)
   short_deadline=time.monotonic()+35
   while time.monotonic()<short_deadline:
    if get_version()==OLD_VERSION:
     status='PASS_SECONDARY_RESTORED_RESTRICTED_ORIGINAL_3032_NOT_AUTH_CERTIFIED'
     print('PASS_SECONDARY_RESTRICTED_3032_RECOVERY',flush=True)
     break
    time.sleep(1.5)
  except Exception as second:
   print('HOLD_SECONDARY_RESTRICTED_3032_RECOVERY',type(second).__name__,
         str(second)[:160],flush=True)
 finally:
  elapsed=int(1000*(time.monotonic()-started))
  seal({**evidence,'status':status,'rollback_ms':elapsed,
        'old_web_unit_sha_after':sha_file(UNIT),
        'main_pid_after':proc('aoe2hdbets-web-prod.service','MainPID'),
        'active_state_after':proc('aoe2hdbets-web-prod.service','ActiveState'),
        'public_reverted_to_original_3032':status.startswith('PASS'),
        'steam_reenrollment_required':True})
 require(status.startswith('PASS'),'ROLLBACK_NOT_PHYSICALLY_QUALIFIED')
 print('PASS_RESTRICTED_3032_COLD_RECOVERY',flush=True)
def inspect():
 evidence=static_evidence()
 state=current_unit_state()
 print(json.dumps({'status':'PASS_COLD_SLOT_INERT_PRESENCE_AND_PROTECTION_NOT_AUTHENTICATED_ROLLBACK',
   **evidence,'unit_sha256':state,'actual_web_pid':proc('aoe2hdbets-web-prod.service','MainPID'),
   'running_version':get_version(),'no_service_mutation':True},sort_keys=True),flush=True)

if __name__=='__main__':
 try:
  require(len(sys.argv)==2 and sys.argv[1] in ('--inspect','--restore'),
          'EXACT_PHASE_REQUIRED')
  lockfd=os.open(LOCK,os.O_WRONLY|os.O_CREAT,0o600)
  with os.fdopen(lockfd,'w') as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   if sys.argv[1]=='--inspect':inspect()
   else:restore()
 except Exception as e:
  print(type(e).__name__,str(e)[:250],flush=True)
  sys.exit(3)
