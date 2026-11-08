#!/usr/bin/env python3
"""Session B: exact-source 3032 R25 Steam-only web re-admission; never a financial permission.

Thin, source-SHA-pinned adapter around the previously audited v5z and immutable
production controller. Reuses all strict DNS TLS checks, 300s nft TTL, cap/NNP
requirements, protected services and exact seven-rule web egress shape.
"""
from __future__ import annotations
import hashlib,importlib.util,json,pathlib,re,sys,stat,os,argparse
OLD=pathlib.Path('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5z.py')
OLD_SHA='3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07'
SELF=pathlib.Path('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_inplace_r25_v6.py')
POLICY=pathlib.Path('/etc/aoe2war/web-prod-v6/steam-refresh-policy.json')
ADMISSION=pathlib.Path('/etc/aoe2war/web-prod-v6/runtime-restart-admission.json')
SOURCE='e0586a7b7c355c3b29037d78c71fe26d528d2475'
BUILD='bUr1xs_EMHgXFD-U-sZ4Z'
VERSION='20261108044653-2983e18532'
UNIT_SHA='13958b7f63ed1342368e8ae9f4c8594268ae7725ad6910c757dd3b9b24c923a5'
ORIGINAL_UNIT_SHA='1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3'
NGINX_SHA='811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f'
RELEASE_RECEIPT=pathlib.Path('/etc/aoe2war/web-prod-v6/accepted-public-release.json')
RELEASE_SHA='47a748c75444f561f476a261e534462cd9959a2706362e4380856ff93f503fe0'
OLD_3032_PID=2854379
NEW_3032_PID=2856449
OLD_R25=pathlib.Path('/var/lib/aoe2war-web-prod-1a380cdf76ff')
NEW_R25=pathlib.Path('/var/lib/aoe2war-web-prod-e0586a7b7c35')
ROOT_BACKUP=pathlib.Path('/etc/aoe2war/web-prod-v6/original-web-unit.conf')
CURRENT_UNIT=pathlib.Path('/etc/systemd/system/aoe2hdbets-web-prod.service')
SNAPSHOT='6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb'
def digest(data):return hashlib.sha256(data).hexdigest()
def regular(path,mode=None):
 st=path.lstat()
 if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)&0o022:
  raise RuntimeError('HOLD_SOURCE_FILE_PERMISSIONS')
 if mode is not None and stat.S_IMODE(st.st_mode)!=mode:
  raise RuntimeError('HOLD_SOURCE_MODE')
 with path.open('rb') as f: return f.read()
def check(condition,reason):
 if not condition:raise RuntimeError('HOLD:'+reason)
def load():
 check(digest(regular(OLD))==OLD_SHA,'V5Z_ORIGINAL_CONTROLLER_DRIFT')
 spec=importlib.util.spec_from_file_location('reviewed_v5z_steam_control',str(OLD))
 check(spec and spec.loader,'V5Z_IMPORT_MISSING')
 o=importlib.util.module_from_spec(spec);spec.loader.exec_module(o)
 o.NEW_SELF=SELF
 o.POLICY=POLICY
 o.ADMISSION=ADMISSION
 o.SOURCE_STAGE=NEW_R25
 o.RECEIPT=RELEASE_RECEIPT
 o.RELEASE=VERSION
 o.BUILD_ID=BUILD
 o.GIT_SHA=SOURCE
 o.WEB_UNIT_SHA=UNIT_SHA
 o.NGINX_SHA=NGINX_SHA
 o.OLD_LIVE_PID=OLD_3032_PID
 old_expected=o.expected_policy
 def normalized_proof():
  raw=regular(RELEASE_RECEIPT,0o600)
  check(digest(raw)==RELEASE_SHA,'PHYSICAL_ACCEPTANCE_RECEIPT_DRIFT')
  j=json.loads(raw)
  check(j.get('schema')=='aoe2war.session-b.inplace-r25.v1'
   and j.get('status')=='PASS_NEW_R25_INPLACE_PUBLIC_NONFINANCIAL'
   and j.get('source_sha')==SOURCE and j.get('build_id')==BUILD
   and j.get('build_version')==VERSION
   and j.get('new_pid')==NEW_3032_PID
   and j.get('old_3032_pid')==OLD_3032_PID
   and j.get('safe_web_rollback_saved')==str(OLD_R25)
   and j.get('financial_gates_closed') is False
   and j.get('c03_legacy_finance_writers_unchanged') is True
   and j.get('steam_signedin_browser_verified') is False
   and j.get('nginx_modified') is False,'PHYSICAL_WEBSITE_ACCEPTANCE_SCOPE_CHANGED')
  a=regular(ROOT_BACKUP,0o600)
  b=regular(CURRENT_UNIT)
  check(digest(a)==ORIGINAL_UNIT_SHA and digest(b)==UNIT_SHA,'EXACT_SYSTEMD_UNIT_DRIFT')
  old_path=str(OLD_R25).encode();new_path=str(NEW_R25).encode()
  check(a.count(old_path)==4 and a.replace(old_path,new_path)==b,'UNREVIEWED_SYSTEMD_CHANGE')
  check((NEW_R25/'.aoe2war-source-sha').read_text().strip()==SOURCE
     and (NEW_R25/'.next/BUILD_ID').read_text().strip()==BUILD,'R25_ARTIFACT_IDENTITY_DRIFT')
  return {'old_public_pid':OLD_3032_PID,'pid3032':NEW_3032_PID},digest(raw)
 def expected(m,snapshot_sha):
  j=old_expected(m,snapshot_sha)
  j['schema']='aoe2war.app.r25.steam-refresh-after-inplace-public-cutover.v6'
  j['acceptance_receipt_sha256']=RELEASE_SHA
  j['base_steam_guard_sha256']=OLD_SHA
  j['physical_unit_diff_paths']=4
  return j
 o.bound_public_commit=normalized_proof
 o.expected_policy=expected
 return o
def static_check():
 check(digest(regular(SELF))==digest(SELF.read_bytes()),'SELF_NOFOLLOW')
 check(SELF!=OLD and POLICY!=pathlib.Path('/etc/aoe2war/web-prod-v5z/steam-refresh-policy.json'),'OLD_SOURCE_OR_POLICY_PROTECTED')
 check(SOURCE!='1a380cdf76ff773aa1d094abd161523500b32b4a','DISTINCT_RELEASE_REQUIRED')
 check(NEW_R25.is_dir() and not NEW_R25.is_symlink(),'NEW_RUNTIME_MISSING')
 check(POLICY.parent.name=='web-prod-v6' and ADMISSION.parent==POLICY.parent,'POLICY_ISOLATION_REQUIRED')
 check(RELEASE_RECEIPT!=ROOT_BACKUP,'RECEIPT_IDENTITY_ERROR')
def main():
 parser=argparse.ArgumentParser()
 parser.add_argument('--phase',required=True,choices=('selftest','plan','refresh'))
 args=parser.parse_args()
 static_check()
 o=load()
 if args.phase=='selftest':
  o.selftest=lambda:None
  o.base_profile(o.load_immutable_original()) # Check current reviewed exact source/NGINX and prior constraints.
  print('PASS:R25_STEAM_V6_EXACT_SOURCE_AND_FINANCIAL_HOLD',flush=True)
 elif args.phase=='plan':
  o.plan()
 elif args.phase=='refresh':
  o.refresh()
if __name__=='__main__':
 try:main()
 except Exception as e:
  reason=str(e)
  if re.fullmatch(r'(?:HOLD:)?[A-Z0-9_]{3,95}',reason):
   classification=reason if reason.startswith('HOLD:') else 'HOLD:'+reason
  else:
   classification='HOLD:NON_IDENTIFYING_'+type(e).__name__.upper()
  print(json.dumps({'status':'HOLD_STEAM_V6','reason':classification,'financial_authorized':False},sort_keys=True),flush=True)
  sys.exit(2)
