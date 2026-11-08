#!/usr/bin/env python3
"""Exact two-profile Steam-only UID990 egress re-admission after R25 Traffic release.

No arbitrary destination, release, PID, finance capability, or dynamic scope.
Reuses byte-pinned v5z controller and original production guard for all actual
nft, DNS/TLS/SNI, UID990 DROP, protected snapshot and capability enforcement.
"""
from __future__ import annotations
import argparse, datetime, hashlib, importlib.util, json, os, pathlib, re, stat, subprocess, sys, time, urllib.parse, urllib.request, urllib.error

P = pathlib.Path
OLD = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5z.py')
OLD_SHA = '3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07'
V6 = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_inplace_r25_v6.py')
V6_SHA = '88343a6405e263e2227c94744e058b53fa4d067c4fd53070d99c15f43b5546ce'
SELF = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v7.py')
ROOT = P('/etc/aoe2war/web-prod-v7')
ACTIVE, RECEIPT, ADMISSION, POLICY = [ROOT / s for s in ('active-profile.json','accepted-runtime.json','runtime-restart-admission.json','steam-refresh-policy.json')]
OLD_WEB = P('/etc/aoe2war/web-prod-v6/original-web-unit.conf')
CURRENT_UNIT = P('/etc/systemd/system/aoe2hdbets-web-prod.service')
STEAM_UNIT = P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
NGINX = P('/etc/nginx/sites-available/aoe2war.com')
NGINX_SHA = '811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f'
FIN_SNAPSHOT = '6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb'
NFT_SHAPE = '985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af'
LEGACY_PID, VALIDATOR_PID, OLD_PUBLIC_PID = 2625090, 1009, 2856449
FIRST_UNIT_SHA = '13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5'
NEW_UNIT_SHA = 'be8165a050a3fa2c224d6a29c26dca2045a6599c7f18ab41e2e83bb85eacf6e6'
OLD_SOURCE_RECEIPT = P('/etc/aoe2war/web-prod-v6/accepted-public-release.json')
CANDIDATE_STAGE_RECEIPT = P('/root/aoe2war-session-b-r25-traffic-candidate-0a7450f9/physical-stage-acceptance.json')
PROFILES = {
 'rollback': {
  'source':'e0586a7b7c355c3b29037d78c71fe26d528d2475',
  'build':'bUr1xs_EMHgXFD-U-sZ4Z',
  'version':'20261108044653-2983e18532',
  'stage':P('/var/lib/aoe2war-web-prod-e0586a7b7c35'),
  'unit_sha':FIRST_UNIT_SHA,
  'origin_sha':'47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0',
  'origin':OLD_SOURCE_RECEIPT,
 },
 'candidate': {
  'source':'0a7450f9c8c1d12cdf63e33d57e665ad1e3f5cb1',
  'build':'AX78Oo6yfx4AmSCbDgemv',
  'version':'20261108140705-1d068e417c',
  'stage':P('/var/lib/aoe2war-web-prod-0a7450f9c8c1'),
  'unit_sha':NEW_UNIT_SHA,
  'origin_sha':'31d750fe72b6b6e1fdad492fec94d1a863fd5305360c400bc3b036167b6c9f27',
  'origin':CANDIDATE_STAGE_RECEIPT,
 },
}

def digest(b: bytes) -> str:
 return hashlib.sha256(b).hexdigest()

def verified(path: pathlib.Path, mode: int | None = None) -> bytes:
 st=path.lstat()
 if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)&0o022:
  raise RuntimeError('HOLD_SOURCE_ROOT_PERMISSIONS')
 if mode is not None and stat.S_IMODE(st.st_mode)!=mode:
  raise RuntimeError('HOLD_SOURCE_MODE')
 with path.open('rb') as f:return f.read()

def check(ok: bool, reason: str):
 if not ok:raise RuntimeError('HOLD:'+reason)

def exec_out(argv, timeout=8):
 p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
 check(p.returncode==0,'NATIVE_READONLY_COMMAND_FAILED')
 return p.stdout.strip()

def unit_pid(unit: str) -> int:
 return int(exec_out(['/usr/bin/systemctl','show',unit,'-p','MainPID','--value']))

def start_ticks(pid: int) -> int:
 return int(P(f'/proc/{pid}/stat').read_text().rsplit(') ',1)[1].split()[19])

def load_original():
 check(digest(verified(OLD))==OLD_SHA,'V5Z_SOURCE_DRIFT')
 check(digest(verified(V6))==V6_SHA,'ACCEPTED_V6_SOURCE_DRIFT')
 spec=importlib.util.spec_from_file_location('reviewed_immutable_v5z_steam',str(OLD))
 check(bool(spec and spec.loader),'V5Z_SOURCE_IMPORT')
 obj=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(obj)
 check(obj.ORIG_SHA=='9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707','ORIGINAL_GUARD_PIN_CHANGED')
 return obj

def static_check():
 check(SELF.name=='r25_steam_refresh_traffic_v7.py','V7_SOURCE_ID')
 check(PROFILES['candidate']['unit_sha']!=PROFILES['rollback']['unit_sha'],'DISTINCT_RELEASE')
 check(ROOT.name=='web-prod-v7' and ADMISSION.parent==ROOT and RECEIPT.parent==ROOT,'ROOT_POLICY_DIRECTORY')
 check(digest(verified(NGINX))==NGINX_SHA,'NGINX_SITE_DRIFT')
 check(digest(verified(OLD_WEB,0o600))=='1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3','ORIGINAL_SYSTEMD_UNIT_DRIFT')
 check(digest(verified(OLD_SOURCE_RECEIPT,0o600))==PROFILES['rollback']['origin_sha'],'ORIGINAL_PUBLIC_RECEIPT_DRIFT')
 raw=verified(CURRENT_UNIT)
 old=PROFILES['rollback']['stage'].as_posix().encode()
 new=PROFILES['candidate']['stage'].as_posix().encode()
 pre=verified(P('/etc/aoe2war/web-prod-v6/original-web-unit.conf'),0o600)
 check(pre.count(P('/var/lib/aoe2war-web-prod-1a380cdf76ff').as_posix().encode())==4,'ORIGINAL_UNIT_PATH_SCOPE')
 first=pre.replace(b'/var/lib/aoe2war-web-prod-1a380cdf76ff',old)
 check(digest(first)==FIRST_UNIT_SHA,'INITIAL_RELEASE_UNIT_REFERENCE_DRIFT')
 candidate=first.replace(old,new)
 check(first.count(old)==4 and digest(candidate)==NEW_UNIT_SHA,'CANDIDATE_UNIT_NOT_FOUR_EXACT_REPLACEMENTS')
 check(digest(raw) in (FIRST_UNIT_SHA,NEW_UNIT_SHA),'UNEXPECTED_INSTALLED_UNIT')
 return True

def active_profile():
 j=json.loads(verified(ACTIVE,0o400))
 check(set(j)=={'schema','profile','source_sha','stage_receipt_sha256','finance_authorized'},'UNEXPECTED_ACTIVE_FIELDS')
 check(j['schema']=='aoe2war.app.traffic-steam-v7.active.v1','ACTIVE_SCHEMA')
 check(j['finance_authorized'] is False,'ACTIVE_FINANCE_SCOPE')
 name=j['profile'];check(name in PROFILES,'UNREVIEWED_RELEASE_PROFILE')
 p=PROFILES[name]
 check(j['source_sha']==p['source'] and j['stage_receipt_sha256']==p['origin_sha'],'RELEASE_PROFILE_DRIFT')
 return name,p

def native_snapshot():
 o=load_original()
 m=o.load_immutable_original()
 f=m.sha(m.canonical(m.production_protected()))
 check(f==FIN_SNAPSHOT,'PROTECTED_FINANCE_TOPOLOGY_DRIFT')
 check(m.production_nft_shape()==NFT_SHAPE,'STEAM_NFT_SHAPE_DRIFT')
 check(unit_pid('aoe2hdbets-web.service')==LEGACY_PID,'LEGACY_ROLLBACK_PID_CHANGED')
 check(unit_pid('wolochaind-mainnet.service')==VALIDATOR_PID,'WALLET_VALIDATOR_PID_CHANGED')
 for port in (8094,8095):
  text=exec_out(['/usr/bin/ss','-lnt',f'sport = :{port}'])
  check('LISTEN' not in text,'FUNDED_PORT_UNEXPECTEDLY_OPEN')
 return o,m,f

def verify_active_runtime(name,p):
 check(digest(verified(CURRENT_UNIT))==p['unit_sha'],'ACTIVE_RELEASE_UNIT_DRIFT')
 check(digest(verified(p['origin'],0o600))==p['origin_sha'],'ORIGIN_STAGE_PROOF_DRIFT')
 check((p['stage']/'.aoe2war-source-sha').read_text().strip()==p['source'],'STAGED_SOURCE_DRIFT')
 check((p['stage']/'.next/BUILD_ID').read_text().strip()==p['build'],'STAGED_BUILD_DRIFT')
 check((p['stage']/'.aoe2war-build-version').read_text().strip()==p['version'],'STAGED_VERSION_DRIFT')
 if name=='candidate':
  k=json.loads(verified(p['origin'],0o600))
  check(k.get('state')=='PASS_EXACT_RUNTIME_STAGED_NOT_STARTED' and k.get('source_sha')==p['source']
        and k.get('build_id')==p['build'] and k.get('finance_authorized') is False,'STAGING_RECEIPT_AUTHORITY_DRIFT')
 pid=unit_pid('aoe2hdbets-web-prod.service')
 check(pid>1 and pid!=LEGACY_PID and unit_pid('aoe2hdbets-web-prod.service')==pid,'LIVE_WEB_PROCESS_MISSING')
 check(exec_out(['/usr/bin/systemctl','show','aoe2hdbets-web-prod.service','-p','ActiveState','--value'])=='active','WEB_SERVICE_INACTIVE')
 check(exec_out(['/usr/bin/systemctl','show','aoe2hdbets-web-prod.service','-p','WorkingDirectory','--value'])==str(p['stage']),'LIVE_WORKDIR_CHANGED')
 check(P(f'/proc/{pid}').stat().st_uid==990,'LIVE_UID_CHANGED')
 check(b'next-server' in P(f'/proc/{pid}/cmdline').read_bytes(),'LIVE_BINARY_CHANGED')
 check('/system.slice/aoe2hdbets-web-prod.service' in P(f'/proc/{pid}/cgroup').read_text(),'LIVE_PROCESS_CGROUP_CHANGED')
 return pid,start_ticks(pid)

def health(name,p):
 host='http://127.0.0.1:3032'
 def open_once(route,timeout):
  req=urllib.request.Request(host+route,headers={'Host':'aoe2war.com','User-Agent':'AoE2WAR-SessionB-Exact-Release-Observer'})
  return urllib.request.urlopen(req,timeout=timeout)
 with open_once('/api/deployment-version',9) as resp:
  check(resp.status==200,'BUILD_VERSION_HTTP')
  j=json.loads(resp.read(16000))
  check(j.get('buildVersion')==p['version'],'BUILD_VERSION_MISMATCH')
 if name=='candidate':
  with open_once('/traffic',21) as resp:
   check(resp.status==200,'TRAFFIC_HTTP_NOT_200')
   text=resp.read(1_800_000).decode('utf8','ignore')
   check('Recent observations' in text and 'Certified Traffic history' in text,'TRAFFIC_NEW_SOURCE_NOT_RENDERED')
 class NoRedirect(urllib.request.HTTPRedirectHandler):
  def redirect_request(self,req,fp,code,msg,headers,url):return None
 op=urllib.request.build_opener(NoRedirect)
 req=urllib.request.Request(host+'/api/auth/steam?returnTo=%2Fplayers',headers={'Host':'aoe2war.com'})
 try: resp=op.open(req,timeout=9)
 except urllib.error.HTTPError as e:resp=e
 loc=urllib.parse.urlsplit(resp.headers.get('Location',''))
 check(resp.code in (302,303,307,308) and (loc.scheme,loc.netloc,loc.path)==
       ('https','steamcommunity.com','/openid/login'),'STEAM_INIT_PROVIDER_DRIFT')
 cookie=resp.headers.get_all('Set-Cookie') or []
 check(any(x.startswith('__Host-aoe2war_steam_state=') and 'httponly' in x.lower() and 'secure' in x.lower()
           for x in cookie),'STEAM_COOKIE_SCOPE_DRIFT')
 return True

def bind_source():
 name,p=active_profile()
 raw=verified(RECEIPT,0o600)
 j=json.loads(raw)
 required={'schema','profile','current_public_pid','old_public_pid','start_ticks','source_sha','build_id',
           'build_version','unit_sha256','origin_receipt_sha256','fin_snapshot_sha256','nft_shape_sha256',
           'finance_authorized','canonical_traffic_certified','steam_owner_browser_verified'}
 check(set(j)==required,'RUNTIME_ACCEPTANCE_FIELD_SCOPE_CHANGED')
 check(j['schema']=='aoe2war.app.traffic-steam-v7.release.v1' and j['profile']==name
  and j['source_sha']==p['source'] and j['build_id']==p['build'] and j['build_version']==p['version']
  and j['unit_sha256']==p['unit_sha'] and j['origin_receipt_sha256']==p['origin_sha']
  and j['fin_snapshot_sha256']==FIN_SNAPSHOT and j['nft_shape_sha256']==NFT_SHAPE
  and j['old_public_pid']==OLD_PUBLIC_PID and j['finance_authorized'] is False
  and j['canonical_traffic_certified'] is False and j['steam_owner_browser_verified'] is False,
  'RELEASE_RECEIPT_UNREVIEWED_SCOPE')
 pid,ticks=verify_active_runtime(name,p)
 check(j['current_public_pid']==pid and j['start_ticks']==ticks,'RELEASE_RECEIPT_PROCESS_IDENTITY_CHANGED')
 return {'old_public_pid':OLD_PUBLIC_PID,'pid3032':pid},digest(raw)

def make_guard():
 static_check()
 name,p=active_profile()
 obj=load_original()
 old_expected=obj.expected_policy
 obj.NEW_SELF=SELF
 obj.POLICY=POLICY
 obj.ADMISSION=ADMISSION
 obj.SOURCE_STAGE=p['stage']
 obj.RECEIPT=RECEIPT
 obj.RELEASE=p['version']
 obj.BUILD_ID=p['build']
 obj.GIT_SHA=p['source']
 obj.WEB_UNIT_SHA=p['unit_sha']
 obj.NGINX_SHA=NGINX_SHA
 obj.OLD_LIVE_PID=OLD_PUBLIC_PID
 obj.bound_public_commit=bind_source
 def expected(m,snapshot_sha):
  j=old_expected(m,snapshot_sha)
  j.update({'schema':'aoe2war.app.r25.steam-traffic-v7-two-exact-releases',
            'base_v5z_source_sha256':OLD_SHA,
            'approved_v6_source_sha256':V6_SHA,
            'active_meta_sha256':digest(verified(ACTIVE,0o400)),
            'origin_stage_receipt_sha256':p['origin_sha'],
            'exact_source_profile':name})
  return j
 obj.expected_policy=expected
 return obj

def atomic_json(path,j,mode):
 raw=(json.dumps(j,sort_keys=True,separators=(',',':'))+'\n').encode()
 tmp=path.with_name('.'+path.name+'.new-'+str(os.getpid()))
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,mode)
 with os.fdopen(fd,'wb') as f:
  f.write(raw);f.flush();os.fsync(f.fileno())
 os.chmod(tmp,mode)
 os.replace(tmp,path)
 return digest(raw)

def enroll(name):
 check(os.geteuid()==0,'ROOT_REQUIRED')
 check(name in PROFILES,'UNKNOWN_ENROLLMENT_PROFILE')
 static_check()
 p=PROFILES[name]
 check(digest(verified(CURRENT_UNIT))==p['unit_sha'],'UNIT_NOT_INSTALLED')
 check(digest(verified(p['origin'],0o600))==p['origin_sha'],'ORIGIN_NOT_QUALIFIED')
 o,m,f=native_snapshot()
 pid,ticks=verify_active_runtime(name,p)
 health(name,p)
 meta={'schema':'aoe2war.app.traffic-steam-v7.active.v1','profile':name,
       'source_sha':p['source'],'stage_receipt_sha256':p['origin_sha'],'finance_authorized':False}
 receipt={'schema':'aoe2war.app.traffic-steam-v7.release.v1','profile':name,
   'current_public_pid':pid,'old_public_pid':OLD_PUBLIC_PID,'start_ticks':ticks,
   'source_sha':p['source'],'build_id':p['build'],'build_version':p['version'],
   'unit_sha256':p['unit_sha'],'origin_receipt_sha256':p['origin_sha'],
   'fin_snapshot_sha256':f,'nft_shape_sha256':NFT_SHAPE,'finance_authorized':False,
   'canonical_traffic_certified':False,'steam_owner_browser_verified':False}
 check(ROOT.is_dir() and not ROOT.is_symlink() and ROOT.stat().st_uid==0
       and stat.S_IMODE(ROOT.stat().st_mode)==0o500,'RELEASE_ROOT_MODE_DRIFT')
 atomic_json(ACTIVE,meta,0o400)
 rh=atomic_json(RECEIPT,receipt,0o600)
 admission={'schema':'aoe2war.app.steam-runtime-readmission.v5z',
  'old_public_pid':OLD_PUBLIC_PID,'current_public_pid':pid,'start_ticks':ticks,
  'source_sha':p['source'],'build_version':p['version'],
  'reviewed_protected_snapshot_sha256':f,'public_release_receipt_sha256':rh,
  'approval_scope':'STEAM_ONLY_EXISTING_UID990_NFT_SETS','finance_authorized':False,
  'nonce':os.urandom(16).hex()}
 atomic_json(ADMISSION,admission,0o400)
 obj=make_guard()
 # Physical snapshot must remain identical after all readiness requests.
 m2,s2,f2=obj.evidence()
 check(f2==f and m2.production_nft_shape()==NFT_SHAPE,'CROSS_BOUNDARY_PROOF_CHANGED')
 ph=atomic_json(POLICY,obj.expected_policy(m2,f2),0o400)
 check(verify_active_runtime(name,p)==(pid,ticks),'LAST_SECOND_RUNTIME_DRIFT')
 print(json.dumps({'status':'PASS_EXACT_STEAM_V7_ADMISSION','profile':name,
    'source_sha':p['source'],'pid':pid,'policy_sha256':ph,'release_receipt_sha256':rh,
    'finance_authorized':False},sort_keys=True),flush=True)

def main():
 ar=argparse.ArgumentParser()
 ar.add_argument('--phase',required=True,choices=['selftest','plan','enroll','refresh'])
 ar.add_argument('--profile',choices=['candidate','rollback'])
 args=ar.parse_args()
 if args.phase=='selftest':
  static_check()
  load_original()
  print('PASS_STEAM_V7_IMMUTABLE_SOURCE_AND_TWO_EXACT_PROFILES',flush=True)
 elif args.phase=='enroll':
  check(args.profile is not None,'PROFILE_REQUIRED')
  enroll(args.profile)
 elif args.phase=='plan':
  obj=make_guard()
  obj.plan()
 else:
  obj=make_guard()
  obj.refresh()

if __name__=='__main__':
 try:main()
 except Exception as e:
  reason=str(e)
  if not re.fullmatch(r'(?:HOLD:)?[A-Z0-9_]{3,100}',reason):
   reason='HOLD:NONIDENTIFYING_'+type(e).__name__.upper()
  print(json.dumps({'status':'HOLD_STEAM_V7','reason':reason,'finance_authorized':False},sort_keys=True),flush=True)
  sys.exit(3)
