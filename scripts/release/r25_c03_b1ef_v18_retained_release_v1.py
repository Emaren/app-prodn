#!/usr/bin/env python3
"""Source-pinned real same-slot b1ef R25 public-only release + Steam V18.

One-use activate; one-use owner rollback; ALWAYS restore exact original
restricted R25 and Steam V17 if activation fails. No third Next, no finance.
"""
from __future__ import annotations
import datetime,fcntl,hashlib,importlib.util,json,os,pathlib,re,stat,subprocess,sys,time
P=pathlib.Path
ROOT=P('/root/aoe2war-r25-b1ef-v18-retained-release-20261109')
TRIAL=P('/root/aoe2war-r25-b1ef-single-slot-trial-v1-20261109')
PUBLIC_ROOT=P('/etc/aoe2war/web-prod-v18')
TRIAL_SRC=TRIAL/'r25_c03_b1ef_single_slot_trial_v1.py'
TRIAL_SHA='af5fdcc3e6bbef0b6b56f9a80f6deb6df88d04e4f3e1febd506c2e421a9f4fea'
STEAM_SRC=ROOT/'r25_steam_refresh_traffic_v18.py'
STEAM_SOURCE_SHA='42dbba88209ba703a5d8472e83c3865d890e5a9b7481587102b33deba5f51c4b'
STEAM_UNIT_SRC=ROOT/'r25_steam_refresh_traffic_v18.service'
STEAM_UNIT_SHA='8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032'
V17_UNIT_SRC=ROOT/'r25_steam_refresh_traffic_v17.service'
V17_UNIT_SHA='94209b3179f264b25d646795042fe037192735b60bb7eee95eedf6b106aa17a4'
V17_SRC=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v17.py')
V17_SOURCE_SHA='699b16630eb8314e7e8043a91978dec7e3178ccc99360cc9416ea7cdaa47caac'
INSTALLED_STEAM=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
INSTALLED_V18=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v18.py')
INSTALLED_WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
WEB_SERVICE='aoe2hdbets-web-prod.service'
STEAM_SERVICE='aoe2war-steam-egress-refresh.service'
TIMER='aoe2war-steam-egress-refresh.timer'
ORIGINAL_SRC=TRIAL/'original-unit.service'
ORIGINAL_SHA='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
CANDIDATE_SHA='f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a'
CANDIDATE_RECEIPT=TRIAL/'exact-ci-runtime-staged-v1.json'
CANDIDATE_RECEIPT_SHA='c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7'
CI_ARTIFACT=TRIAL/'artifact.json'
CI_ARTIFACT_SHA='2c0bb606db2c21ca263efbcacb57c52e4cb493553737a5a919e21170baaf6a74'
OLD_PROFILE_ORIGIN=P('/etc/aoe2war/web-prod-v8/candidate-stage-acceptance.json')
OLD_PROFILE_ORIGIN_SHA='c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701'
LOCK=P('/run/lock/aoe2war-r25-b1ef-v18-retained-release.lock')
RESULT=ROOT/'physical-v18-retained-promotion-result.json'
RECOVERY=ROOT/'physical-v18-retained-rollback-result.json'
class Hold(RuntimeError):pass
def need(ok,name):
 if not ok:raise Hold('HOLD_'+name)
def sha(b):return hashlib.sha256(b).hexdigest()
def hashfile(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1<<20),b''):h.update(b)
 return h.hexdigest()
def own(path,mode,digest):
 st=path.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1 and
      stat.S_IMODE(st.st_mode)==mode,'EXACT_ROOT_OWNER_MODE_'+path.name)
 need(hashfile(path)==digest,'EXACT_ROOT_SHA_'+path.name)
 return path.read_bytes()
def shell(argv,timeout=40):
 p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
 need(p.returncode==0,'CHILD_'+P(argv[0]).name)
 return p.stdout.strip()
def show(unit,name):return shell(['systemctl','show',unit,'-p',name,'--value'],timeout=10)
def seal(path,status,extra):
 need(not path.exists() and not path.is_symlink(),'RECEIPT_ALREADY_EXISTS')
 payload={'schema':'aoe2war.app.b1ef-steam-v18-retained-public-only.v1',
          'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'status':status,'app_source_sha':'b1ef050b954be734c9f34147361e0d02d7c89b19',
          'steam_v18_source_sha':STEAM_SOURCE_SHA,'steam_v18_unit_sha':STEAM_UNIT_SHA,
          'finance_authorized':False,'funding_authorized':False,
          'C03_APP_HANDOFF':'HOLD','C02_APP_TRANSPORT':'HOLD',
          'signed_in_roles_verified':False,**extra}
 raw=(json.dumps(payload,sort_keys=True,indent=2)+'\n').encode()
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 print('IMMUTABLE_RELEASE_RECEIPT_SHA',sha(raw),flush=True)
def publish(path,data,mode):
 need(not path.exists() and not path.is_symlink(),'EXACT_ONE_USE_PUBLICATION')
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 os.chmod(path,mode)
def replace_unit(path,data):
 temp=path.parent/('.'+path.name+'.v18-pending')
 need(not temp.exists() and not temp.is_symlink(),'UNIT_TEMP_ALREADY_PRESENT')
 publish(temp,data,0o644)
 os.replace(temp,path)
 shell(['systemctl','daemon-reload'],30)
def read_trial():
 need(own(TRIAL_SRC,0o600,TRIAL_SHA),'TRIAL_SOURCE_NOT_PINNED')
 spec=importlib.util.spec_from_file_location('reviewed_trial_exact_b1ef',str(TRIAL_SRC))
 need(bool(spec and spec.loader),'TRIAL_SOURCE_IMPORT')
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 need(m.SOURCE=='b1ef050b954be734c9f34147361e0d02d7c89b19'
      and m.CI_ZIP_SHA=='e4bb88e2a842f0ee3547a537083d9b32549b9642ac66ec110bd59cae2b782446',
      'TRIAL_SOURCE_PINS_CHANGED')
 return m
def baseline(after_promotion=False):
 need(os.geteuid()==0,'ROOT_ONLY')
 need(ROOT.is_dir() and not ROOT.is_symlink() and ROOT.stat().st_uid==0
      and stat.S_IMODE(ROOT.stat().st_mode)==0o700,'ROOT_RELEASE_DIRECTORY')
 own(STEAM_SRC,0o600,STEAM_SOURCE_SHA)
 own(STEAM_UNIT_SRC,0o600,STEAM_UNIT_SHA)
 own(V17_UNIT_SRC,0o600,V17_UNIT_SHA)
 own(V17_SRC,0o644,V17_SOURCE_SHA)
 own(ORIGINAL_SRC,0o600,ORIGINAL_SHA)
 own(CANDIDATE_RECEIPT,0o600,CANDIDATE_RECEIPT_SHA)
 own(CI_ARTIFACT,0o600,CI_ARTIFACT_SHA)
 own(OLD_PROFILE_ORIGIN,0o600,OLD_PROFILE_ORIGIN_SHA)
 trial=read_trial()
 if not after_promotion:trial.root_only()
 else:
  need(hashfile(INSTALLED_STEAM)==STEAM_UNIT_SHA
       and hashfile(INSTALLED_V18)==STEAM_SOURCE_SHA
       and show(WEB_SERVICE,'ActiveState')=='active',
       'PROMOTED_WEB_STEAM_V18_NOT_ACTIVE')
 trial.stage_ready()
 need(show(WEB_SERVICE,'MemoryMax')=='3355443200'
      and show(WEB_SERVICE,'User')=='aoe2war-web-prod','APP_OS_MEMORY_IDENTITY')
 trial.finance()
 return trial
def exact():
 trial=baseline()
 need(hashfile(INSTALLED_WEB)==ORIGINAL_SHA
      and hashfile(INSTALLED_STEAM)==V17_UNIT_SHA
      and not RESULT.exists() and not RESULT.is_symlink()
      and not RECOVERY.exists() and not RECOVERY.is_symlink()
      and not PUBLIC_ROOT.exists() and not PUBLIC_ROOT.is_symlink()
      and not INSTALLED_V18.exists() and not INSTALLED_V18.is_symlink(),
      'ONE_USE_OLD_SOURCE_OR_PUBLICATION_UNAVAILABLE')
 need(trial.wait_version(trial.OLD_VERSION,8),'ORIGINAL_NOT_LIVE')
 return trial
def v18_command(*args,timeout=155):
 return shell(['/usr/bin/python3','-I','-B',str(INSTALLED_V18),*args],timeout)
def v17_command(*args,timeout=155):
 return shell(['/usr/bin/python3','-I','-B',str(V17_SRC),*args],timeout)
def install_v18_source():
 need(not PUBLIC_ROOT.exists() and not PUBLIC_ROOT.is_symlink(),'V18_POLICY_ALREADY_EXISTS')
 PUBLIC_ROOT.mkdir(mode=0o500)
 need(PUBLIC_ROOT.stat().st_uid==0 and stat.S_IMODE(PUBLIC_ROOT.stat().st_mode)==0o500,
      'V18_POLICY_DIRECTORY_ACL')
 for name,source,digest in (
  ('original-finance-restricted-3032-unit.service',ORIGINAL_SRC,ORIGINAL_SHA),
  ('exact-ci-runtime-staged-v1.json',CANDIDATE_RECEIPT,CANDIDATE_RECEIPT_SHA),
  ('artifact.json',CI_ARTIFACT,CI_ARTIFACT_SHA)):
  need(hashfile(source)==digest,'STAGED_SOURCE_EVIDENCE_DRIFT')
  publish(PUBLIC_ROOT/name,source.read_bytes(),0o400)
 publish(INSTALLED_V18,STEAM_SRC.read_bytes(),0o644)
 replace_unit(INSTALLED_STEAM,STEAM_UNIT_SRC.read_bytes())
 need(hashfile(INSTALLED_STEAM)==STEAM_UNIT_SHA,'V18_UNIT_POSTINSTALL_MISMATCH')
 v18_command('--phase','selftest',timeout=90)
 v18_command('--phase','inspect',timeout=95)
def stop_timer():
 shell(['systemctl','stop',TIMER],30)
 deadline=time.monotonic()+55
 while time.monotonic()<deadline:
  if show(STEAM_SERVICE,'ActiveState')=='inactive':return
  time.sleep(1)
 need(False,'STEAM_ONESHOT_NOT_INACTIVE')
def recover(trial):
 evidence=[]
 try:
  try:stop_timer()
  except Exception as e:evidence.append('HOLD_TIMER_STOP_'+type(e).__name__)
  if hashfile(INSTALLED_WEB)!=ORIGINAL_SHA:
   shell(['systemctl','stop',WEB_SERVICE],45)
   replace_unit(INSTALLED_WEB,ORIGINAL_SRC.read_bytes())
  elif show(WEB_SERVICE,'ActiveState')!='active':
   shell(['systemctl','daemon-reload'],35)
  if show(WEB_SERVICE,'ActiveState')!='active':
   shell(['systemctl','start',WEB_SERVICE],45)
  need(trial.wait_version(trial.OLD_VERSION,105),'ORIGINAL_RUNTIME_NOT_RESTORED')
  need(hashfile(INSTALLED_WEB)==ORIGINAL_SHA,'ORIGINAL_UNIT_SHA_NOT_RESTORED')
  recovered_v18=False
  if hashfile(INSTALLED_STEAM)==STEAM_UNIT_SHA and INSTALLED_V18.is_file():
   try:
    v18_command('--phase','enroll','--profile','rollback',timeout=150)
    recovered_v18=True
   except Exception as e:
    evidence.append('HOLD_V18_ROLLBACK_PROFILE_'+type(e).__name__)
  if not recovered_v18:
   if hashfile(INSTALLED_STEAM)!=V17_UNIT_SHA:
    replace_unit(INSTALLED_STEAM,own(V17_UNIT_SRC,0o600,V17_UNIT_SHA))
   v17_command('--phase','enroll','--profile','rollback',timeout=150)
   evidence.append('PASS_FALLBACK_TO_EXACT_V17_ROLLBACK_PROFILE')
  shell(['systemctl','start',TIMER],30)
  shell(['systemctl','start',STEAM_SERVICE],155)
  need(show(STEAM_SERVICE,'Result')=='success','RESTORED_STEAM_REFRESH_HOLD')
  trial.finance()
  evidence.append('PASS_ORIGINAL_RESTRICTED_3032_STEAM_REENROLLED')
 except Exception as e:
  evidence.append('HOLD_ROLLBACK_'+type(e).__name__+'_'+str(e)[:100])
 return evidence

def activate():
 trial=exact()
 before={'old_pid':show(WEB_SERVICE,'MainPID'),'old_unit_sha':hashfile(INSTALLED_WEB),
         'old_steam_unit_sha':hashfile(INSTALLED_STEAM)}
 status='HOLD_SOURCE_BOUND_RETAINED_PROMOTION_FAILED'
 obs={'before':before}
 try:
  stop_timer()
  install_v18_source()
  v18_command('--phase','enroll','--profile','rollback')
  shell(['systemctl','start',STEAM_SERVICE],155)
  need(show(STEAM_SERVICE,'Result')=='success','V18_ROLLBACK_PROFILE_REFRESH_NOT_ACCEPTED')
  shell(['systemctl','stop',WEB_SERVICE],45)
  old=own(ORIGINAL_SRC,0o600,ORIGINAL_SHA)
  replace_unit(INSTALLED_WEB,trial.new_unit(old))
  shell(['systemctl','start',WEB_SERVICE],45)
  art=json.loads(own(CI_ARTIFACT,0o600,CI_ARTIFACT_SHA))
  need(trial.wait_version(art['build_version'],100),'B1EF_CI_BUILD_NOT_ACTIVATED')
  obs['candidate_pid']=show(WEB_SERVICE,'MainPID')
  obs['candidate_sha']=hashfile(INSTALLED_WEB)
  obs['public_functional']=trial.protected_public_health(art)
  v18_command('--phase','enroll','--profile','candidate',timeout=175)
  shell(['systemctl','start',STEAM_SERVICE],155)
  need(show(STEAM_SERVICE,'Result')=='success','CANDIDATE_V18_REFRESH_FAILED')
  shell(['systemctl','start',TIMER],25)
  for _ in range(8):
   cur=int(show(WEB_SERVICE,'MemoryCurrent'))
   need(0<cur<3355443200,'LIVE_MEMORY_BOUND_EXCEEDED')
   obs.setdefault('memory_bytes',[]).append(cur)
   trial.finance()
   time.sleep(3)
  need(hashfile(INSTALLED_WEB)==CANDIDATE_SHA and
       hashfile(INSTALLED_STEAM)==STEAM_UNIT_SHA and
       show(WEB_SERVICE,'MainPID')==obs['candidate_pid'] and
       show(WEB_SERVICE,'NRestarts')=='0',
       'FINAL_RUNTIME_UNIT_OR_PID_CHANGED')
  v18_command('--phase','inspect',timeout=100)
  status='PASS_RUNNING_B1EF_PUBLIC_ONLY_R25_STEAM_V18_NOT_AUTH_CERTIFIED'
 except Exception as e:
  obs['failure']=type(e).__name__+'_'+str(e)[:120]
  obs['rollback_steps']=recover(trial)
 finally:
  obs['final_pid']=show(WEB_SERVICE,'MainPID')
  obs['final_web_unit_sha']=hashfile(INSTALLED_WEB)
  obs['final_steam_unit_sha']=hashfile(INSTALLED_STEAM)
  seal(RESULT,status,obs)
 need(status.startswith('PASS_'),'RETAINED_R25_RELEASE_FAILED')
 print(status,flush=True)

def rollback():
 trial=baseline(after_promotion=True)
 need(RESULT.is_file() and not RECOVERY.exists() and
      json.loads(RESULT.read_bytes())['status']=='PASS_RUNNING_B1EF_PUBLIC_ONLY_R25_STEAM_V18_NOT_AUTH_CERTIFIED'
      and hashfile(INSTALLED_WEB)==CANDIDATE_SHA,'CURRENT_B1EF_NOT_ADMITTED')
 steps=recover(trial)
 good=bool(steps and steps[-1].startswith('PASS_'))
 seal(RECOVERY,'PASS_ORIGINAL_RESTRICTED_R25_V18_RECOVERED' if good else
      'HOLD_ORIGINAL_RESTORE_FAILED',
      {'steps':steps,'web_pid':show(WEB_SERVICE,'MainPID'),
       'web_unit_sha':hashfile(INSTALLED_WEB)})
 need(good,'ROLLBACK_NOT_ACCEPTED')
 print('PASS_ORIGINAL_RESTRICTED_R25_STEAM_V18_RESTORED',flush=True)

if __name__=='__main__':
 try:
  need(len(sys.argv)==2 and sys.argv[1] in ('--inspect','--activate','--rollback'),
       'PHASE_REQUIRED')
  fd=os.open(LOCK,os.O_WRONLY|os.O_CREAT,0o600)
  with os.fdopen(fd,'w') as f:
   fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)
   if sys.argv[1]=='--inspect':
    trial=exact()
    print(json.dumps({'status':'PASS_V18_EXACT_TWO_SOURCE_PROFILES_PRODUCTION_PREFLIGHT',
                      'no_mutation':True,'old_pid':show(WEB_SERVICE,'MainPID'),
                      'steam_v18_sha':STEAM_SOURCE_SHA,'finance_authorized':False},sort_keys=True))
   elif sys.argv[1]=='--activate':activate()
   else:rollback()
 except Exception as e:
  print('HOLD_V18',type(e).__name__,str(e)[:155],flush=True)
  sys.exit(3)
