#!/usr/bin/env python3
"""One-use Steam V17 original 3032 enrollment; no web restart/Chain changes.

Strictly read-only --inspect; exact root-only --activate; fail-closed revert to
original V14 unit if V17 test/enroll/refresh fails. The old V14 may itself HOLD:
never mistake restoring a timer for a successful Steam admission.
"""
from __future__ import annotations
import datetime, hashlib, importlib.util, json, os, pathlib, re, stat, subprocess, sys, time
P=pathlib.Path
ROOT=P('/root/aoe2war-steam-c01-exact-guard-v17-20261109')
EVIDENCE=P('/etc/aoe2war/web-prod-v17')
SCRIPT_STAGED=ROOT/'r25_steam_refresh_traffic_v17.py'
UNIT_STAGED=ROOT/'r25_steam_refresh_traffic_v17.service'
HELPER_STAGED=ROOT/'r25_steam_c01_delta_guard_v1.py'
SCRIPT=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v17.py')
HELPER=P('/usr/local/lib/aoe2war-web-prod/r25_steam_c01_delta_guard_v1.py')
INSTALLED=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
MEMORY=P('/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf')
V14=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v14.py')
V14_SHA='65e6f5294b784473d7fd8889ddd2674650b6373d14e1b78ea9ae847ea2d8157a'
V14_UNIT_SHA='17d640fde690e4e780dfd7370bd9d99122ccde7d567c0a043c8060739e6181f4'
V17_SCRIPT_SHA='699b16630eb8314e7e8043a91978dec7e3178ccc99360cc9416ea7cdaa47caac'
V17_UNIT_SHA='94209b3179f264b25d646795042fe037192735b60bb7eee95eedf6b106aa17a4'
HELPER_SHA='2d5b17c74c6fb5d916e8b65ed61dd92cf1bd83c8bf9affad42872045fdce53ec'
WEB_SHA='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
MEMORY_SHA='9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438'
EXPECTED_VERSION='20261108182649-ca81f00609'
EVIDENCES={
 'original-finance-restricted-3032-unit.service':(
   P('/root/aoe2war-r25-c03-same-slot-cold-rollback-v1-20261109/original-finance-restricted-3032-unit.service'),WEB_SHA),
 'stage-verification-no-install.json':(
   P('/root/aoe2war-r25-heap-dd00367a-ci-20261109/stage-verification-no-install.json'),
   'fb8e1dbaf4a509496b403127e824eac4e233c868579a1d6e34d1e2159da23d44'),
 'root-owned-source-identity-overlay.json':(
   P('/root/aoe2war-r25-heap-dd00367a-ci-20261109/root-owned-source-identity-overlay.json'),
   '3cdd41faaa371f6e500d802048a6c64d36b1e931bc7289b485f103e4fe93ec1f'),
}
RECEIPT=ROOT/'physical-steam-v17-original-3032-result.json'
TIMER='aoe2war-steam-egress-refresh.timer'
SERVICE='aoe2war-steam-egress-refresh.service'
class Hold(RuntimeError):pass
def need(ok,name):
 if not ok:raise Hold('HOLD_'+name)
def digest(raw):return hashlib.sha256(raw).hexdigest()
def sha_file(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()
def pinned(path,mode,digest_expected):
 st=path.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and
      st.st_nlink==1 and stat.S_IMODE(st.st_mode)==mode,'ROOT_FILE_ACL_'+path.name)
 need(sha_file(path)==digest_expected,'ROOT_FILE_SHA_'+path.name)
 return path.read_bytes()
def run(args,timeout=30):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 need(p.returncode==0,'SUBPROCESS_'+P(args[0]).name)
 return p.stdout.strip()
def prop(unit,name):return run(['systemctl','show',unit,'-p',name,'--value'],timeout=9)
def version():
 import urllib.request
 with urllib.request.urlopen(urllib.request.Request(
  'http://127.0.0.1:3032/api/deployment-version',headers={'Host':'aoe2war.com'}),
  timeout=9) as x:return json.load(x)['buildVersion']
def original_unit_bytes():
 u=pinned(UNIT_STAGED,0o600,V17_UNIT_SHA)
 a=b'r25_steam_refresh_traffic_v17.py';b=b'r25_steam_refresh_traffic_v14.py'
 need(u.count(a)==1 and b not in u,'SCRIPT_PATH_SCOPE')
 old=u.replace(a,b)
 need(digest(old)==V14_UNIT_SHA,'ORIGINAL_V14_UNIT_PREIMAGE')
 return old
def finances_closed():
 for port in (8092,8093,8094,8095):
  need(not run(['ss','-H','-ltn','sport = :'+str(port)]),'FINANCE_PORT_OPEN')
 for name in ('wolochain-mainnet-settlement.service','wolochain-founder-rewards-settlement.service'):
  p=subprocess.run(['systemctl','is-enabled',name],capture_output=True,text=True,timeout=9)
  need(p.stdout.strip()=='masked' and p.returncode in (0,1),'LEGACY_PAYOUT_MASK_CHANGED')
 need(prop('wolochaind-mainnet.service','MainPID')=='1009','VALIDATOR_PID_DRIFT')
 need(prop('aoe2hdbets-web.service','MainPID')=='2625090','LEGACY_WEB_PID_DRIFT')
def exact_c01_proof():
 # Original V14 loads unchanged V5z, C03 V1 and masked C04 guards.
 spec=importlib.util.spec_from_file_location('unchanged_v14_guard',str(V14))
 obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj)
 mod=obj.load_original().load_immutable_original()
 snapshot=mod.production_protected()
 spec=importlib.util.spec_from_file_location('reviewed_two_c01_unit_delta',str(HELPER_STAGED))
 helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
 return helper.reconstruct_pre_c01(mod,snapshot)
def inspect():
 need(os.geteuid()==0,'ROOT_REQUIRED')
 need(ROOT.is_dir() and not ROOT.is_symlink() and ROOT.stat().st_uid==0
      and stat.S_IMODE(ROOT.stat().st_mode)==0o700,'STAGE_ROOT_ACL')
 pinned(SCRIPT_STAGED,0o600,V17_SCRIPT_SHA)
 pinned(UNIT_STAGED,0o600,V17_UNIT_SHA)
 pinned(HELPER_STAGED,0o600,HELPER_SHA)
 pinned(V14,0o644,V14_SHA)
 pinned(WEB,0o644,WEB_SHA)
 pinned(MEMORY,0o644,MEMORY_SHA)
 need(prop('aoe2hdbets-web-prod.service','MemoryMax')=='3355443200',
      'MEMORY_BOUND')
 need(prop('aoe2hdbets-web-prod.service','User')=='aoe2war-web-prod',
      'WEB_UID_DRIFT')
 need(prop('aoe2hdbets-web-prod.service','ActiveState')=='active',
      'WEB_NOT_ACTIVE')
 need(prop('aoe2hdbets-web-prod.service','WorkingDirectory')==
      '/var/lib/aoe2war-web-prod-4ab96cc7c1c0','WEB_WORKDIR_DRIFT')
 need(version()==EXPECTED_VERSION,'CURRENT_WEB_NOT_ORIGINAL_RESTRICTED')
 original_unit_bytes()
 need(sha_file(INSTALLED)==V14_UNIT_SHA,'EXACT_PREVIOUS_V14_UNIT_MISSING')
 for name,(src,expected) in EVIDENCES.items():
  pinned(src,0o600,expected)
 need(not RECEIPT.exists() and not EVIDENCE.exists() and
      not EVIDENCE.is_symlink(),'ONE_USE_STEAM_ALREADY_PUBLISHED')
 need(not SCRIPT.exists() and not HELPER.exists(),'V17_BINARY_ALREADY_INSTALLED')
 finances_closed()
 proof=exact_c01_proof()
 need(proof['finance_authorized'] is False,'UNEXPECTED_FINANCIAL_AUTHORITY')
 return {'status':'PASS_INERT_EXACT_C01_FINGERPRINT_AND_ORIGINAL_3032',
   'web_pid':prop('aoe2hdbets-web-prod.service','MainPID'),
   'web_version':EXPECTED_VERSION,'pre_c01_sha256':proof['pre_c01_sha256'],
   'post_c01_sha256':proof['post_c01_sha256'],
   'finance_authorized':False}
def publish(path,body,mode):
 need(not path.exists() and not path.is_symlink(),'PARTIAL_SOURCE_ALREADY_PUBLISHED')
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:
  f.write(body);f.flush();os.fsync(f.fileno())
 os.chmod(path,mode)
def replace_unit(raw):
 temp=INSTALLED.parent/'.aoe2war-steam-v17-unit-pending'
 need(not temp.exists(),'UNIT_TEMP_EXISTS')
 publish(temp,raw,0o644)
 os.replace(temp,INSTALLED)
 run(['systemctl','daemon-reload'],timeout=30)
def seal(result):
 need(not RECEIPT.exists(),'ONE_USE_RECEIPT_ALREADY_SEALED')
 payload={'schema':'aoe2war.app.session-b.steam-v17-original-3032.v1',
          'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'finance_authorized':False,'C03_APP_HANDOFF':'HOLD',
          'C02_APP_TRANSPORT':'HOLD','funding_authorized':False,**result}
 body=(json.dumps(payload,sort_keys=True,indent=2)+'\n').encode()
 publish(RECEIPT,body,0o600)
 print('IMMUTABLE_STEAM_V17_RECEIPT_SHA256',digest(body),flush=True)
def activate():
 before=inspect()
 status='HOLD_STEAM_V17_ORIGINAL_NOT_ADMITTED'
 notes=[]
 try:
  run(['systemctl','stop',TIMER],timeout=20)
  for path,src,mode in ((SCRIPT,SCRIPT_STAGED,0o644),(HELPER,HELPER_STAGED,0o644)):
   publish(path,src.read_bytes(),mode)
  EVIDENCE.mkdir(mode=0o500)
  need(EVIDENCE.stat().st_uid==0 and stat.S_IMODE(EVIDENCE.stat().st_mode)==0o500,
      'EVIDENCE_ROOT_CHANGED')
  for name,(src,expected) in EVIDENCES.items():
   need(sha_file(src)==expected,'SOURCE_EVIDENCE_CHANGED')
   publish(EVIDENCE/name,src.read_bytes(),0o400)
  replace_unit(UNIT_STAGED.read_bytes())
  run(['/usr/bin/python3','-I','-B',str(SCRIPT),'--phase','selftest'],timeout=65)
  run(['/usr/bin/python3','-I','-B',str(SCRIPT),'--phase','inspect'],timeout=95)
  run(['/usr/bin/python3','-I','-B',str(SCRIPT),'--phase','enroll','--profile','rollback'],timeout=145)
  run(['systemctl','start',SERVICE],timeout=155)
  need(prop(SERVICE,'Result')=='success','V17_ONE_SHOT_NOT_PASSED')
  run(['systemctl','start',TIMER],timeout=35)
  need(sha_file(INSTALLED)==V17_UNIT_SHA,'POST_INSTALL_STEAM_UNIT_CHANGED')
  need(prop('aoe2hdbets-web-prod.service','MainPID')==before['web_pid'],
       'WEB_PID_CHANGED')
  finances_closed()
  status='PASS_STEAM_V17_ORIGINAL_3032_C01_DELTA_ADMITTED_FIRST_REFRESH_ONLY'
  notes.append('PASS_ONE_PHYSICAL_STEAM_REFRESH_FURTHER_TTL_ACCEPTANCE_REQUIRED')
 except Exception as e:
  notes.append('HOLD_STEAM_V17_'+type(e).__name__+'_'+str(e)[:90])
  try:
   run(['systemctl','stop',TIMER],timeout=25)
   if sha_file(INSTALLED)==V17_UNIT_SHA:
    replace_unit(original_unit_bytes())
   need(sha_file(INSTALLED)==V14_UNIT_SHA,'ORIGINAL_V14_UNIT_NOT_RESTORED')
   run(['systemctl','start',TIMER],timeout=25)
   notes.append('PASS_EXACT_V14_UNIT_RESTORED_BUT_ITS_C01_DRIFT_HOLD_REMAINS')
  except Exception as exc:
   notes.append('HOLD_STEAM_UNIT_RECOVERY_'+type(exc).__name__)
 finally:
  seal({'status':status,'preflight':before,'notes':notes,
        'web_pid_after':prop('aoe2hdbets-web-prod.service','MainPID'),
        'steam_unit_sha_after':sha_file(INSTALLED)})
 need(status.startswith('PASS'),'STAGED_V17_NOT_ACCEPTED')
 print(status,flush=True)
if __name__=='__main__':
 try:
  need(len(sys.argv)==2 and sys.argv[1] in ('--inspect','--activate'),'PHASE_REQUIRED')
  if sys.argv[1]=='--inspect':print(json.dumps(inspect(),sort_keys=True),flush=True)
  else:activate()
 except Exception as e:
  print(type(e).__name__,str(e)[:145],flush=True);sys.exit(3)
