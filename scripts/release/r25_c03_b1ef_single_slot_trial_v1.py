#!/usr/bin/env python3
"""Source-pinned one-use 3032 single-slot physical App trial AND rollback.

No production promotion. The new app is exercised transiently and MUST be
returned to its exact original restricted R25 process with Steam V17 rebound.
Never authorize funded betting, C03 completion or second Next runtime.
"""
from __future__ import annotations
import datetime,fcntl,hashlib,json,os,pathlib,re,stat,subprocess,sys,tarfile,time
import urllib.error,urllib.parse,urllib.request,zipfile

P=pathlib.Path
SOURCE='b1ef050b954be734c9f34147361e0d02d7c89b19'
CI_ZIP_SHA='e4bb88e2a842f0ee3547a537083d9b32549b9642ac66ec110bd59cae2b782446'
ROOT=P('/root/aoe2war-r25-b1ef-single-slot-trial-v1-20261109')
STAGE=P('/var/lib/aoe2war-web-prod-b1ef050b954b')
OLD_STAGE=P('/var/lib/aoe2war-web-prod-4ab96cc7c1c0')
ZIP=ROOT/('aoe2war-runtime-'+SOURCE+'.zip')
ARCHIVE=ROOT/('runtime-'+SOURCE+'.tar.gz')
ARTIFACT=ROOT/'artifact.json'
WEB=P('/etc/systemd/system/aoe2hdbets-web-prod.service')
OLD_UNIT_SHA='42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
STEAM_UNIT=P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
STEAM_V17_UNIT_SHA='94209b3179f264b25d646795042fe037192735b60bb7eee95eedf6b106aa17a4'
STEAM_SRC=P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v17.py')
STEAM_SRC_SHA='699b16630eb8314e7e8043a91978dec7e3178ccc99360cc9416ea7cdaa47caac'
DROP=P('/etc/systemd/system.control/aoe2hdbets-web-prod.service.d/50-MemoryMax.conf')
DROP_SHA='9590e15b4544680e0eec8a16cac43c272cd1e06267be46b0fa26c741d2e57438'
OLD_VERSION='20261108182649-ca81f00609'
WEB_SERVICE='aoe2hdbets-web-prod.service'
TIMER='aoe2war-steam-egress-refresh.timer'
STEAM_SERVICE='aoe2war-steam-egress-refresh.service'
LOCK=P('/run/lock/aoe2war-r25-b1ef-trial-v1.lock')
RECEIPT=ROOT/'physical-3032-single-slot-trial-recovery-v1.json'
STAGE_RECEIPT=ROOT/'exact-ci-runtime-staged-v1.json'

class Hold(RuntimeError):pass
def need(x,reason):
 if not x:raise Hold('HOLD_'+reason)
def digest(b):return hashlib.sha256(b).hexdigest()
def file_sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()
def pinned(p,mode,expected=None):
 st=p.lstat()
 need(stat.S_ISREG(st.st_mode) and st.st_uid==0 and st.st_nlink==1
      and stat.S_IMODE(st.st_mode)==mode,'ROOT_SOURCE_MODE_'+p.name)
 if expected:need(file_sha(p)==expected,'ROOT_SOURCE_SHA_'+p.name)
 return p
def shell(args,timeout=45):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 need(p.returncode==0,'COMMAND_'+P(args[0]).name)
 return p.stdout.strip()
def show(unit,field):return shell(['systemctl','show',unit,'-p',field,'--value'],10)
def old_unit():
 raw=pinned(WEB,0o644,OLD_UNIT_SHA).read_bytes()
 a=str(OLD_STAGE).encode();b=str(STAGE).encode()
 need(raw.count(a)==4 and b not in raw and b'--port 3032' in raw
      and b'--max-old-space-size=2048' in raw
      and b'User=aoe2war-web-prod\n' in raw
      and b'EnvironmentFile=/etc/aoe2war/web-prod-v1/runtime.env' in raw
      and b'ProtectHome=yes' in raw,'WEB_EXACT_SOURCE_BOUNDARY')
 return raw
def new_unit(old):
 a=str(OLD_STAGE).encode();b=str(STAGE).encode()
 raw=old.replace(a,b)
 need(raw.count(b)==4 and a not in raw,'CANDIDATE_FOUR_PATH_SCOPE')
 return raw
def finance():
 for port in (8092,8093,8094,8095):
  need(not shell(['ss','-H','-ltn','sport = :'+str(port)],9),'FINANCE_PORT_OPEN')
 for name in ('wolochain-mainnet-settlement.service','wolochain-founder-rewards-settlement.service'):
  r=subprocess.run(['systemctl','is-enabled',name],capture_output=True,text=True,timeout=9)
  need(r.stdout.strip()=='masked' and r.returncode in (0,1),'LEGACY_SETTLEMENT_MASK_DRIFT')
 need(show('wolochaind-mainnet.service','MainPID')=='1009','VALIDATOR_PID_DRIFT')
 need(show('aoe2hdbets-web.service','MainPID')=='2625090','ROLLBACK_3030_PID_DRIFT')
def root_only():
 need(os.geteuid()==0 and ROOT.is_dir() and not ROOT.is_symlink() and
      ROOT.stat().st_uid==0 and stat.S_IMODE(ROOT.stat().st_mode)==0o700,'ROOT_STAGE_IDENTITY')
 need(pinned(STEAM_UNIT,0o644,STEAM_V17_UNIT_SHA).is_file(),'STEAM_V17_SERVICE_IDENTITY')
 need(pinned(STEAM_SRC,0o644,STEAM_SRC_SHA).is_file(),'STEAM_V17_SOURCE_IDENTITY')
 need(pinned(DROP,0o644,DROP_SHA).is_file() and
      show(WEB_SERVICE,'MemoryMax')=='3355443200','BOUND_3355443200_CHANGED')
 need(show(WEB_SERVICE,'User')=='aoe2war-web-prod','WEB_ROLE_DRIFT')
 need(show(WEB_SERVICE,'ActiveState')=='active','ORIGINAL_NOT_ACTIVE')
 need(show(WEB_SERVICE,'WorkingDirectory')==str(OLD_STAGE),'OLD_WORKDIR_DRIFT')
 need(show(WEB_SERVICE,'NRestarts')=='0','OLD_WEB_RESTART_COUNT_CHANGED')
 finance()
def ci_identity():
 need(pinned(ZIP,0o600,CI_ZIP_SHA).is_file(),'GITHUB_CI_ZIP_SHA')
 pinned(ARCHIVE,0o600)
 pinned(ARTIFACT,0o600)
 r=json.loads(ARTIFACT.read_bytes())
 need(r.get('schema') is None or r.get('schema')=='aoe2war.runtime-artifact.v1','RECEIPT_SCHEMA')
 need(r['source_sha']==SOURCE and r['archive']=='runtime.tar.gz' and
      r['format']=='tar.gz' and r['sha256']==file_sha(ARCHIVE) and
      int(r['bytes'])==ARCHIVE.stat().st_size and
      re.fullmatch('[A-Za-z0-9_-]{8,128}',r['build_id']) and
      re.fullmatch('[A-Za-z0-9_-]{8,128}',r['build_version']) and
      int(r['files'])>10000,'GITHUB_CI_RUNTIME_IDENTITY')
 with zipfile.ZipFile(ZIP) as z:
  need(sorted(z.namelist())==['artifact.json','runtime.tar.gz'] and
       z.read('artifact.json')==ARTIFACT.read_bytes(),'GITHUB_ZIP_RECEIPT_NOT_EXACT')
 return r
def stage_ready():
 r=ci_identity()
 need(STAGE.is_dir() and not STAGE.is_symlink() and STAGE.stat().st_uid==0
      and stat.S_IMODE(STAGE.stat().st_mode)==0o755,'STAGE_DIRECTORY_NOT_APPROVED')
 need((STAGE/'.aoe2war-source-sha').read_text().strip()==SOURCE,'STAGE_SOURCE_SHA')
 need((STAGE/'.next/BUILD_ID').read_text().strip()==r['build_id'],'STAGE_BUILD_ID')
 need((STAGE/'.aoe2war-build-version').read_text().strip()==r['build_version'],'STAGE_VERSION')
 need(file_sha(STAGE/'.aoe2war-runtime-manifest.json')==r['manifest_sha256'],'STAGE_RUNTIME_MANIFEST')
 sr=json.loads(pinned(STAGE_RECEIPT,0o600).read_text())
 need(sr.get('schema')=='aoe2war.app.c03.b1ef-single-slot-recovery.v1'
      and sr.get('status')=='PASS_VERIFIED_CI_RUNTIME_STAGED_NOT_STARTED'
      and sr.get('source_sha')==SOURCE
      and sr.get('archive_sha256')==r['sha256']
      and sr.get('build_id')==r['build_id']
      and sr.get('build_version')==r['build_version']
      and sr.get('runtime_files')==int(r['files'])+2
      and sr.get('no_runtime_started') is True
      and sr.get('finance_authorized') is False
      and sr.get('funding_authorized') is False,
      'STAGE_RECEIPT_UNVERIFIED')
 return r
def seal(path,obj):
 need(not path.exists() and not path.is_symlink(),'ONE_USE_RECEIPT_ALREADY_WRITTEN')
 payload={'schema':'aoe2war.app.c03.b1ef-single-slot-recovery.v1',
          'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
          'source_sha':SOURCE,'finance_authorized':False,'funding_authorized':False,
          'C03_APP_HANDOFF':'HOLD','C02_APP_TRANSPORT':'HOLD',**obj}
 body=(json.dumps(payload,sort_keys=True,indent=2)+'\n').encode()
 fd=os.open(path,os.O_CREAT|os.O_EXCL|os.O_WRONLY|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(body);f.flush();os.fsync(f.fileno())
 print('IMMUTABLE_RECEIPT_SHA256',digest(body),flush=True)
def stage():
 need(not STAGE.exists() and not STAGE.is_symlink(),'ONE_USE_STAGE_EXISTS')
 root_only()
 r=ci_identity()
 need(os.statvfs('/').f_bavail*os.statvfs('/').f_frsize>10*1024**3,'ROOT_DISK_HEADROOM')
 STAGE.mkdir(mode=0o755)
 count=0; total=0
 with tarfile.open(ARCHIVE,'r|gz') as tf:
  for member in tf:
   count+=1
   need(count<=100000,'UNBOUNDED_TAR_ENTRIES')
   rel=P(member.name)
   need(not rel.is_absolute() and '..' not in rel.parts and rel.parts and
        member.name not in ('.','') and
        not (member.mode & 0o6000),'TAR_PATH_OR_MODE')
   target=STAGE/rel
   need(target.resolve(strict=False).is_relative_to(STAGE),'TAR_ESCAPE')
   if member.isdir():
    target.mkdir(parents=True,exist_ok=True)
    os.chmod(target,0o755)
   elif member.isfile():
    need(0<=member.size<=2*1024**3,'TAR_FILE_SIZE')
    total+=member.size;need(total<=10*1024**3,'TAR_TOTAL_SIZE')
    target.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
    fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
    f=tf.extractfile(member);need(f is not None,'TAR_MISSING_STREAM')
    with os.fdopen(fd,'wb') as w:
     written=0
     while written<member.size:
      b=f.read(min(1<<20,member.size-written));need(b,'TAR_UNEXPECTED_EOF')
      written+=len(b);w.write(b)
     w.flush()
    os.chmod(target,0o755 if (member.mode&0o111) else 0o644)
   elif member.issym():
    need(not P(member.linkname).is_absolute(),'ABSOLUTE_TAR_SYMLINK')
    target.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
    resolved=(target.parent/member.linkname).resolve(strict=False)
    need(resolved.is_relative_to(STAGE),'TAR_SYMLINK_ESCAPE')
    target.symlink_to(member.linkname)
   else:need(False,'TAR_SPECIAL_ENTRY')
 need(count==int(r['files'])+2,'TAR_ENTRY_COUNT')
 need(STAGE.is_dir() and (STAGE/'.next/BUILD_ID').is_file(),'STAGE_INCOMPLETE')
 result={'status':'PASS_VERIFIED_CI_RUNTIME_STAGED_NOT_STARTED','runtime_files':count,
         'build_id':r['build_id'],'build_version':r['build_version'],
         'archive_sha256':r['sha256'],'expanded_bytes':total,'no_runtime_started':True}
 seal(STAGE_RECEIPT,result)
 print('PASS_VERIFIED_CI_RUNTIME_STAGED_NOT_STARTED',flush=True)

def safe_replace_unit(raw):
 temp=WEB.with_name('.aoe2hdbets-web-prod.c03-b1ef-one-use')
 need(not temp.exists() and not temp.is_symlink(),'SYSTEMD_UNIT_TEMP_EXISTS')
 fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o644)
 with os.fdopen(fd,'wb') as f:f.write(raw);f.flush();os.fsync(f.fileno())
 os.replace(temp,WEB)
 shell(['systemctl','daemon-reload'],30)

def api(path,timeout=16,method='GET'):
 req=urllib.request.Request('http://127.0.0.1:3032'+path,
                           headers={'Host':'aoe2war.com','Cache-Control':'no-store'},
                           method=method)
 try:r=urllib.request.urlopen(req,timeout=timeout)
 except urllib.error.HTTPError as e:r=e
 b=r.read(2_400_000)
 return r.status,b,r.headers

def wait_version(expected,seconds=90):
 deadline=time.monotonic()+seconds
 while time.monotonic()<deadline:
  try:
   status,body,_=api('/api/deployment-version',8)
   if status==200 and json.loads(body)['buildVersion']==expected:return True
  except Exception:pass
  time.sleep(2)
 return False

def protected_public_health(r):
 obs={}
 status,body,_=api('/api/bets/public-live',15)
 need(status==200,'PUBLIC_LIVE_NOT_HTTP200')
 live=json.loads(body)
 need(live.get('schema')=='aoe2war.app.bets-published-live-preview.v1'
      and live.get('status')=='PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD'
      and live.get('financialExecutionAuthorized') is False
      and live.get('acceptingWagers') is False
      and live.get('actualLiquidityProven') is False
      and live.get('onchainPaymentFinalityVerified') is False
      and isinstance(live.get('markets'),list)
      and len(live['markets'])<=48,'PUBLIC_LIVE_PAYLOAD_UNAUTHORIZED')
 if not live['markets']:
  need(live.get('emptyReason')=='NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS',
       'PUBLIC_LIVE_MISSING_EMPTY_REASON')
 obs['live_market_count']=len(live['markets'])
 status,body,_=api('/api/bets/public-history',15)
 hist=json.loads(body)
 need(status==200 and hist.get('status')=='PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD'
      and hist.get('financialExecutionAuthorized') is False and
      isinstance(hist.get('markets'),list),'PUBLIC_HISTORY_FAILED')
 obs['history_records']=len(hist['markets'])
 status,body,_=api('/api/bets',15)
 bet=json.loads(body)
 need(status==503 and bet.get('schema')=='aoe2war.app.bets-restricted-public-read-hold.v1'
      and bet.get('status')=='HOLD_RESTRICTED_PUBLIC_BOARD_READ'
      and bet.get('financialExecutionAuthorized') is False
      and bet.get('acceptingWagers') is False,'PRIVATE_FINANCIAL_BET_BOARD_NOT_FAIL_CLOSED_503')
 obs['private_bets_http']=503
 for view in ('/','/players','/bets','/traffic','/kingdom','/clans','/leaderboard'):
  code,raw,_=api(view,20)
  need(code==200 and len(raw)>200,'PROTECTED_VIEW_'+view.replace('/','_'))
  obs['view_'+(view or 'root')]=code
 code,body,_=api('/api/auth/session',9)
 need(code==401,'GUEST_SESSION_NOT_DENIED')
 obs['anonymous_session_http']=code
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,req,fp,code,msg,headers,url):return None
 op=urllib.request.build_opener(NoRedirect)
 req=urllib.request.Request('http://127.0.0.1:3032/api/auth/steam?returnTo=%2Fplayers',
                             headers={'Host':'aoe2war.com'})
 try:r=op.open(req,timeout=9)
 except urllib.error.HTTPError as e:r=e
 loc=urllib.parse.urlsplit(r.headers.get('Location',''))
 need(r.status in (302,303,307,308) and
      (loc.scheme,loc.netloc,loc.path)==('https','steamcommunity.com','/openid/login'),
      'STEAM_OPENID_PROVIDER_NOT_AUTHENTIC')
 cookies=r.headers.get_all('Set-Cookie') or []
 need(any(v.startswith('__Host-aoe2war_steam_state=')
          and 'secure' in v.lower() and 'httponly' in v.lower()
          for v in cookies),'STEAM_STATE_COOKIE_NOT_SCOPED')
 obs['steam_guest_openid_status']=r.status
 return obs

def wait_steam_inactive():
 shell(['systemctl','stop',TIMER],30)
 deadline=time.monotonic()+60
 while time.monotonic()<deadline:
  if show(STEAM_SERVICE,'ActiveState')=='inactive':return
  time.sleep(2)
 need(False,'STEAM_ONESHOT_NOT_QUIESCED')

def rollback():
 notes=[]
 # Never hide recovery failure behind a successful candidate test.
 try:
  try:wait_steam_inactive()
  except Exception as e:notes.append('HOLD_STEAM_STOP_'+type(e).__name__)
  old=pinned(ROOT/'original-unit.service',0o600,OLD_UNIT_SHA).read_bytes()
  if WEB.is_file() and WEB.read_bytes()!=old:
   shell(['systemctl','stop',WEB_SERVICE],40)
   safe_replace_unit(old)
  if show(WEB_SERVICE,'ActiveState')!='active':
   shell(['systemctl','start',WEB_SERVICE],40)
  need(wait_version(OLD_VERSION,95),'OLD_RESTRICTED_VERSION_NOT_RESTORED')
  need(file_sha(WEB)==OLD_UNIT_SHA,'ORIGINAL_UNIT_NOT_RESTORED')
  shell(['/usr/bin/python3','-I','-B',str(STEAM_SRC),
         '--phase','enroll','--profile','rollback'],160)
  shell(['systemctl','start',TIMER],25)
  shell(['systemctl','start',STEAM_SERVICE],160)
  need(show(STEAM_SERVICE,'Result')=='success','STEAM_V17_ROLLBACK_NOT_REFRESHED')
  finance()
  notes.append('PASS_EXACT_ORIGINAL_RESTRICTED_3032_AND_STEAM_V17_REBOUND')
 except Exception as e:notes.append('HOLD_RECOVERY_'+type(e).__name__+'_'+str(e)[:96])
 return notes

def inspect():
 root_only()
 ci=stage_ready()
 need(file_sha(WEB)==OLD_UNIT_SHA,'OLD_WEB_UNIT_NOT_INSTALLED')
 need(wait_version(OLD_VERSION,8),'OLD_WEB_BUILD_NOT_LIVE')
 need(not RECEIPT.exists() and not RECEIPT.is_symlink(),'ONE_USE_RECEIPT_ALREADY_EXISTS')
 need(not (ROOT/'original-unit.service').exists(),'OLD_UNIT_SNAPSHOT_EXISTS')
 shell(['/usr/bin/python3','-I','-B',str(STEAM_SRC),'--phase','inspect'],80)
 return {'status':'PASS_EXACT_SOURCE_PINNED_SINGLE_SLOT_READY_NO_MUTATION',
         'source':SOURCE,'build_id':ci['build_id'],
         'build_version':ci['build_version'],
         'old_web_pid':show(WEB_SERVICE,'MainPID'),'memory_max_bytes':3355443200}

def exercise():
 before=inspect()
 old=old_unit()
 approved=stage_ready()
 root_note=ROOT/'original-unit.service'
 fd=os.open(root_note,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 with os.fdopen(fd,'wb') as f:f.write(old);f.flush();os.fsync(f.fileno())
 observations={};condition='HOLD_CANDIDATE_UNPROVED'
 started=time.monotonic()
 try:
  wait_steam_inactive()
  shell(['systemctl','stop',WEB_SERVICE],40)
  safe_replace_unit(new_unit(old))
  shell(['systemctl','start',WEB_SERVICE],45)
  need(wait_version(approved['build_version'],105),'NEW_CI_BUILD_NOT_RUNNING')
  observations['candidate_pid']=show(WEB_SERVICE,'MainPID')
  observations['candidate_web_unit_sha256']=file_sha(WEB)
  observations['functional']=protected_public_health(approved)
  for i in range(8):
   value=int(show(WEB_SERVICE,'MemoryCurrent'))
   need(0<value<3355443200,'BOUNDED_MEMORY_BREACHED')
   observations.setdefault('memory_current_bytes',[]).append(value)
   finance()
   time.sleep(3)
  condition='PASS_REAL_CI_SOURCE_PUBLIC_ONLY_ROUTES_AND_PRIVATE_503_IN_TRIAL'
 except Exception as e:
  observations['failure']=str(e)[:128]
 finally:
  steps=rollback()
  observations['recovery_steps']=steps
  restored=bool(steps and steps[-1].startswith('PASS_'))
  status=('PASS_3032_CI_RUNTIME_EXERCISED_AND_ORIGINAL_STEAM_V17_RESTORED'
          if condition.startswith('PASS_') and restored else
          'HOLD_3032_CANDIDATE_OR_RESTORE_NOT_ACCEPTED')
  seal(RECEIPT,{'status':status,'candidate_result':condition,
                'before':before,'elapsed_ms':int((time.monotonic()-started)*1000),
                'observations':observations,
                'final_web_pid':show(WEB_SERVICE,'MainPID'),
                'final_unit_sha256':file_sha(WEB),
                'authenticated_owner_roles_verified':False,
                'production_promotion_authorized':False})
  need(restored,'PROTECTED_ORIGINAL_RESTORE_FAILED')
  need(status.startswith('PASS_'),'CANDIDATE_FUNCTIONAL_CHECK_FAILED')
  print(status,flush=True)

def main():
 need(len(sys.argv)==2 and sys.argv[1] in ('--stage','--inspect','--exercise'),
      'PHASE_REQUIRED')
 fd=os.open(LOCK,os.O_CREAT|os.O_WRONLY,0o600)
 with os.fdopen(fd,'w') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  if sys.argv[1]=='--stage':stage()
  elif sys.argv[1]=='--inspect':print(json.dumps(inspect(),sort_keys=True),flush=True)
  else:exercise()

if __name__=='__main__':
 try:main()
 except Exception as e:
  print('TRIAL_HOLD',type(e).__name__,str(e)[:150],flush=True)
  sys.exit(3)
