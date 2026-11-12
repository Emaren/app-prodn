#!/usr/bin/env python3
"""V22 two exact website-build Steam compatibility; source-only until Central permits.

Derived from independently byte-verified deployed V20 SHA256
7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c.
Preserves original V5z/V14/V20 C03/C04/C01 finance+NFT+lease policy.
No wildcard active build admission, services or firewall changes without review.

All source-pinned old/new evidence is materialized by the exact root release
controller under private /etc/aoe2war/web-prod-v22 in mode 0400. The sandboxed
oneshot cannot access private home-directory artifacts or wallet paths.
Original V14 C03/C04 guard and finance boundaries remain.

No arbitrary destination, release, PID, finance capability, or dynamic scope.
Reuses byte-pinned v5z controller and original production guard for all actual
nft, DNS/TLS/SNI, UID990 DROP, protected snapshot and capability enforcement.
"""
from __future__ import annotations
import argparse, datetime, hashlib, importlib.util, json, os, pathlib, re, stat, subprocess, sys, time, urllib.parse, urllib.request, urllib.error, fcntl

P = pathlib.Path
OLD = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_public_recovery_v5z.py')
OLD_SHA = '3e54151c10ad39889a6341f000ae36dc1a89f9a3278608c918e707bd068fbb07'
V6 = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_inplace_r25_v6.py')
V6_SHA = '88343a6405e263e2227c94744e058b53fa4d067c4fd53070d99c15f43b5546ce'
V20_REFERENCE = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py')
V20_REFERENCE_SHA256 = '7d432066f370b9eeb7f931f2143a12f2695177e6c174775b4400617e00909c4c'
SELF = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py')
V20_ROOT = P('/etc/aoe2war/web-prod-v20')
ROOT = P('/etc/aoe2war/web-prod-v22')
ACTIVE, RECEIPT, ADMISSION, POLICY = [ROOT / s for s in ('active-profile.json','accepted-runtime.json','runtime-restart-admission.json','steam-refresh-policy.json')]
RETIRED_R24_RECEIPT = V20_ROOT / 'r24-preview-quiesce-verified.json'
RETIRED_R24_RECEIPT_SHA256 = '38cec1654b260a753b36fe185ff0bca2baf177dc2a3d25f86b423321b3aab3e3'
RETIRED_R24_CONFIG_SHA256 = 'a634e21312ba4b1226f81bcd26634b54eb00a715ace47069d5491f1b5291f79f'
RETIRED_R24_OLD_PID = 1483304
RETIRED_R24_UNIT = 'aoe2hdbets-web-r24.service'
OLD_C01_POST_SHA256 = '6bef38a7bbd89f4041e832eeebfa7c2213fa627633299b8d0ad45135b3018999'
OLD_C01_PRE_SHA256 = '064a16dde48c64a3001621902b4ae7a028ec4975183fd4c24b8a16338c1a226c'
OLD_WEB = P('/etc/aoe2war/web-prod-v6/original-web-unit.conf')
CURRENT_UNIT = P('/etc/systemd/system/aoe2hdbets-web-prod.service')
STEAM_UNIT = P('/etc/systemd/system/aoe2war-steam-egress-refresh.service')
STEAM_V20_UNIT_SHA256 = 'b976a10d5cc8b3c199974f1b85a912a67323e8b57b4f69325a1061428d20deb2'
STEAM_V22_UNIT_SHA256 = '44ad57ded3f26690eccf674297c4bc4aa00c0ae2ed563f631001ba6d2de1232a'
V14_SOURCE = P('/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v14.py')
V14_SHA256 = '65e6f5294b784473d7fd8889ddd2674650b6373d14e1b78ea9ae847ea2d8157a'
NGINX = P('/etc/nginx/sites-available/aoe2war.com')
NGINX_SHA = '811cb9f1d4152a8573bc83ba27002206dcd5db1b2272b796c2c6dd919436425f'
FIN_SNAPSHOT = '3a24b53d356d6ac406999fbabed66c5144d74e538503840d407feb4d5f365f15'
PRE_C01_FIN_SNAPSHOT = '2dec2527fad7a53730a998898e26bc94b6d2c8c930db80aa7de1b44578a20f42'
C01_DELTA_HELPER = P('/usr/local/lib/aoe2war-web-prod/r25_steam_c01_delta_guard_v1.py')
C01_DELTA_HELPER_SHA256 = '2d5b17c74c6fb5d916e8b65ed61dd92cf1bd83c8bf9affad42872045fdce53ec'
NFT_SHAPE = '985f32c16f3db3c843a196093977c2e2f61aeb11ce67d5cb1ebddaf66cd710af'
LEGACY_PID, VALIDATOR_PID, OLD_PUBLIC_PID = 2625090, 1009, 2856449
FIRST_UNIT_SHA = '42bcd2f3833b3e8db5dddaf3be8058f7b265de0fb388e3e9508149de59e72621'
NEW_UNIT_SHA = 'f3b30861df399f0debcf702ed9ac60b7a00415f77700b5784b2b4496b6b5d56a'
PUBLIC_PLAYER_UNIT_SHA = 'dd0ec1f4ef8aabf1fcf1bde59b9fa9802ce6aadab9f34dbe438621f04608b167'
ORIGINAL_UNIT_BACKUP = V20_ROOT/'original-finance-restricted-3032-unit.service'
CURRENT_R25_UNIT_BACKUP = ROOT/'original-current-restricted-3032-unit.service'
OLD_SOURCE_RECEIPT = P('/etc/aoe2war/web-prod-v8/candidate-stage-acceptance.json')
CANDIDATE_STAGE_RECEIPT = V20_ROOT/'exact-ci-runtime-staged-v1.json'
CANDIDATE_SOURCE_OVERLAY = V20_ROOT/'artifact.json'
CANDIDATE_SOURCE_OVERLAY_SHA = '2c0bb606db2c21ca263efbcacb57c52e4cb493553737a5a919e21170baaf6a74'
PLAYER_STAGE_JOURNAL = P('/var/lib/aoe2war-public-player-6662c33a-one-use-v1/events')
PLAYER_STAGE_PERMIT = ROOT/'approved-public-player-permit.json'
PLAYER_ACTIVATE_PERMIT = P('/root/aoe2war-public-player-6662c33a-activate-permit.json')
PLAYER_ACTIVATE_NONCE32 = re.compile(r'^[0-9a-f]{32}$')
PLAYER_ACTIVATE_SHA64 = re.compile(r'^[0-9a-f]{64}$')
PLAYER_CI_OVERLAY = ROOT/'public-player-artifact.json'
PLAYER_CI_OVERLAY_SHA = '1101e3ca5cc9c1ecefabadc848e5d7a20793d6d0d89031a13780558c33c91349'
PLAYER_CI_ARCHIVE_SHA = '37987d4e08682a86549e7cd89bb0792ef2e4b1652ff30c85abed964190b9b5a4'
PLAYER_CI_MANIFEST_SHA = 'e0502a16e0936689c39c0d6f1276913c9f19ab213a2477af4fba7ef05282e845'
PLAYER_CI_TREE_SHA = '5c06b08b549c17af0396f355d46897c1935463ce38b2aecf8ac2693f2f74f64f'
PLAYER_CONTROLLER_SHA = 'dbbaab81dc964352670b24b23eea482f1af52d319015969ebb2d48cd59d171b8'
# Historical STAGE_ONLY source stays pinned to the exact original staged controller.
# ACTIVATE_ONLY is an independently reviewed successor controller, never a stage rewrite.
PLAYER_ACTIVATE_CONTROLLER_SHA = '9e2262b0d1f1e428cdd18e2f1d7b1aab84247aadd01b88dbcfbc430aa3f85350'
LOCK = ROOT/'steam-refresh-v22.lock'
C03_HELPER = P('/usr/local/lib/aoe2war-web-prod/r25_c03_observer_oneshot_guard_v9.py')
C03_HELPER_SHA = '39a7929803d64d2998cd1fa8984096533377d08c7af28106a1ae4b8ecba778f2'
ORIGINAL_FIN_SNAPSHOT = '6296fcf49fbc1d33f507c6a8339f87513f933948c0d86a7aa373cebe46071cfb'
C04_HELPER = P('/usr/local/lib/aoe2war-web-prod/r25_c04_masked_listener_guard_v11.py')
C04_HELPER_SHA256 = '0b56dd8dbdd8ae3fea58019df7fa6e14250030cac6d664b542b081142701b340'

# Exactly TWO active website identities. Historical 4ab96c rollback evidence
# remains separately checked below; it is not a third V22 active profile.
PROFILES = {
 'rollback': {
  'source':'b1ef050b954be734c9f34147361e0d02d7c89b19',
  'build':'QVzgMJiQwhFvwrRbY9oZW',
  'version':'20261109194837-9ac998896a',
  'stage':P('/var/lib/aoe2war-web-prod-b1ef050b954b'),
  'unit_sha':NEW_UNIT_SHA,
  'origin_sha':'c7a3788a22cbaaa49356330f305c40c90d90232809bb0037236137ad819f64e7',
  'origin':CANDIDATE_STAGE_RECEIPT,
  'origin_mode':0o400,
 },
 'candidate': {
  'source':'6662c33a0ecf25e5b4bd11283fe98a4842a69eb0',
  'build':'brqExtuPGWtj1iKPCdur-',
  'version':'20261110155135-a76e21b2b6',
  'stage':P('/var/lib/aoe2war-web-prod-6662c33a0ecf25e5'),
  'unit_sha':PUBLIC_PLAYER_UNIT_SHA,
  'origin':PLAYER_STAGE_JOURNAL/'0003.json',
  'origin_mode':0o600,
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

def player_stage_proof(read=verified, list_entries=None):
 """Genuine offline PR1309 event #3, root-owned permit and byte-pinned CI.

 Until Central actually stages the existing 45,044-entry source and creates
 the durable journal, this MUST HOLD. Never invent a stage receipt in tests.
 """
 overlay_raw=read(PLAYER_CI_OVERLAY,0o400)
 check(digest(overlay_raw)==PLAYER_CI_OVERLAY_SHA,'PLAYER_CI_OVERLAY_BYTES')
 overlay=json.loads(overlay_raw)
 check(set(overlay)=={'schema','archive','format','sha256','bytes',
       'source_sha','build_id','build_version','files','manifest_sha256',
       'tree_sha256','machine','node_version','readonly_backend_upstream'},
       'PLAYER_CI_OVERLAY_SCHEMA_DRIFT')
 check(overlay['schema']=='aoe2war.runtime-artifact.v1'
       and overlay['archive']=='runtime.tar.gz' and overlay['format']=='tar.gz'
       and overlay['sha256']==PLAYER_CI_ARCHIVE_SHA and overlay['bytes']==615988730
       and overlay['manifest_sha256']==PLAYER_CI_MANIFEST_SHA
       and overlay['tree_sha256']==PLAYER_CI_TREE_SHA
       and overlay['files']==45044 and overlay['machine']=='x86_64'
       and overlay['node_version']=='v22.22.0'
       and overlay['readonly_backend_upstream']=='http://127.0.0.1:3331'
       and overlay['source_sha']==PROFILES['candidate']['source']
       and overlay['build_id']==PROFILES['candidate']['build']
       and overlay['build_version']==PROFILES['candidate']['version'],
       'PLAYER_CI_OVERLAY_IDENTITY_DRIFT')
 if list_entries is None:
  names=sorted(p.name for p in PLAYER_STAGE_JOURNAL.iterdir())
 else:
  names=sorted(list_entries())
 check(3<=len(names)<=32 and names==
       [f'{i:04d}.json' for i in range(1,len(names)+1)],
       'PLAYER_STAGE_JOURNAL_UNRECOGNIZED_EXTRA_OR_MISSING_EVENT')
 allowed_after={'STOP_INTENT','WEB_STOPPED','UNIT_SWAP_INTENT','UNIT_SWAPPED',
                'START_INTENT','CANDIDATE_STARTED','STEAM_CANDIDATE_ENROLLED',
                'PUBLIC_VERIFIED',
                'COMPLETED','RECOVERY_INTENT','ROLLED_BACK','ABORTED',
                'FAIL_SHUT_HOLD'}
 previous='0'*64
 events=[]
 for i,name in enumerate(names,1):
  raw=read(PLAYER_STAGE_JOURNAL/name,0o600)
  expected=('PREPARED','EXTRACTING','STAGED')[i-1] if i<=3 else None
  obj=json.loads(raw)
  check(set(obj)=={'schema','number','state','prev_sha256','utc','source_sha',
                   'build_id','data'} and
        obj['schema']=='r25.one-use.journal.event.v1'
        and obj['number']==i and
        (obj['state']==expected if expected else obj['state'] in allowed_after)
        and obj['prev_sha256']==previous
        and obj['source_sha']==PROFILES['candidate']['source']
        and obj['build_id']==PROFILES['candidate']['build'],
        'PLAYER_STAGE_JOURNAL_CHAIN_DRIFT')
  previous=digest(raw)
  events.append(obj)
 check(events[2]['data']=={
       'files_and_links':45046,
       'source':PROFILES['candidate']['source'],
       'build':PROFILES['candidate']['build'],
       'created_empty_bind_targets':['.next/cache','public/downloads']},
       'PLAYER_STAGE_EXACT_EXTRACTED_SET_CHANGED')
 permit_raw=read(PLAYER_STAGE_PERMIT,0o400)
 check(digest(permit_raw)==events[0]['data'].get('permit_sha256'),
       'PLAYER_STAGE_PERMIT_NOT_BOUND_TO_JOURNAL')
 permit=json.loads(permit_raw)
 check(permit.get('schema')=='aoe2war.r25.public-player.central-permit.v1'
       and permit.get('central_scope')=='PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET'
       and permit.get('approved_source_sha')==PROFILES['candidate']['source']
       and permit.get('approved_build_id')==PROFILES['candidate']['build']
       and permit.get('approved_candidate_unit_sha256')==PUBLIC_PLAYER_UNIT_SHA
       and permit.get('controller_sha256')==PLAYER_CONTROLLER_SHA
       and permit.get('ci_archive_sha256')==PLAYER_CI_ARCHIVE_SHA
       and permit.get('allowed_operation')=='ONE_USE_RESTRICTED_3032_ONLY'
       and permit.get('approved_phase')=='STAGE_ONLY'
       and type(permit.get('approval_nonce')) is str
       and bool(re.fullmatch(r'[0-9a-f]{32}',permit['approval_nonce']))
       and events[0]['data'].get('permit_phase')=='STAGE_ONLY'
       and events[0]['data'].get('stage_nonce')==permit['approval_nonce']
       and 'stage_permit_sha256' not in permit
       and 'staged_event_sha256' not in permit
       and permit.get('codex_financial_capture_active') is False
       and permit.get('financial_writers_authorized') is False
       and permit.get('web_financial_mutations_authorized') is False
       and type(permit.get('managed_avatar_handles')) is list
       and len(permit['managed_avatar_handles'])==3
       and any(x=='user-u-1301e0492fdf4a229d941940413497e1-featured'
               for x in permit['managed_avatar_handles'])
       and type(permit.get('central_comment_url')) is str
       and re.fullmatch(r'https://github.com/Emaren/app-prodn/'
            r'(?:issues/1280|pull/1300|pull/1307)#issuecomment-[0-9]{9,}',
            permit['central_comment_url']),
       'PLAYER_STAGE_PERMIT_NOT_SOURCE_AUTHORIZED')
 stage_raw=read(PLAYER_STAGE_JOURNAL/'0003.json',0o600)
 return {'origin_sha':digest(stage_raw),'overlay_sha':digest(overlay_raw),
         'central_permit_sha':digest(permit_raw),
         'stage_nonce':permit['approval_nonce'],'source':overlay['source_sha'],
         'build':overlay['build_id'],'version':overlay['build_version'],
         'last_state':events[-1]['state'],
         'terminal':events[-1]['state'] in {'ROLLED_BACK','ABORTED','FAIL_SHUT_HOLD'}}

def origin_sha_for(name,read=verified):
 check(name in PROFILES,'PROFILE_OUTSIDE_EXACT_PAIR')
 if name=='rollback':return PROFILES[name]['origin_sha']
 return player_stage_proof(read)['origin_sha']

def exec_out(argv, timeout=8):
 p=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
 check(p.returncode==0,'NATIVE_READONLY_COMMAND_FAILED')
 return p.stdout.strip()

def unit_pid(unit: str) -> int:
 return int(exec_out(['/usr/bin/systemctl','show',unit,'-p','MainPID','--value']))

def start_ticks(pid: int) -> int:
 return int(P(f'/proc/{pid}/stat').read_text().rsplit(') ',1)[1].split()[19])

NGINX_CONFIG_ROOT = P('/etc/nginx')

def nginx_config_has_no_retired_3031():
 # nginx -T attempts O_WRONLY /run/nginx.pid even when asked to print config.
 # Under the actual ProtectSystem=strict / CAP_NET_ADMIN-only oneshot this
 # correctly FAILS; never add a write exception to make it pass.
 # Instead, read bounded config source files, plus the independently pinned
 # active v18/V19 reviewed NGINX site hash. No Nginx binary or pid write.
 site=verified(NGINX)
 check(digest(site)==NGINX_SHA and b':3031' not in site,
       'R24_CANONICAL_NGINX_SOURCE_DRIFT_OR_SELECTOR')
 check(NGINX_CONFIG_ROOT.is_dir() and not NGINX_CONFIG_ROOT.is_symlink(),
       'NGINX_CONFIG_ROOT_NOT_DIRECTORY')
 total=0; files=0; main=False; canonical=False
 for path in sorted(NGINX_CONFIG_ROOT.rglob('*')):
  if not path.is_file():
   continue
  if not (path.suffix=='.conf' or path.name=='nginx.conf' or
          path.parent.name in ('sites-available','sites-enabled')):
   continue
  statrow=path.stat()
  check(stat.S_ISREG(statrow.st_mode) and statrow.st_size<=1048576,
        'NGINX_CONFIG_FILE_TYPE_OR_SIZE')
  raw=path.read_bytes()
  total+=len(raw)
  files+=1
  check(total<=1048576 and files<=250,'NGINX_CONFIG_UNBOUNDED')
  check(b':3031' not in raw,'R24_NGINX_SELECTOR_PRESENT')
  main=main or (path.name=='nginx.conf' and
                path.parent==NGINX_CONFIG_ROOT)
  canonical=canonical or (path.resolve()==NGINX.resolve())
 check(main and canonical and 80<=files<=250 and 100000<=total<=1048576,
       'NGINX_CONFIG_CENSUS_MISSING')
 return files


def verify_exact_retired_preview(m):
 # Admission is real inactive/disabled R24 state, not an invented old PID.
 # Only the historical original guard's one obsolete equality is superseded.
 evidence=json.loads(verified(RETIRED_R24_RECEIPT,0o400))
 check(evidence.get('schema')=='aoe2war.app.c03.legacy-r24-unrouted-quiesce.v1'
       and evidence.get('status')=='PASS_UNROUTED_3031_R24_QUIESCED_3030_3032_UNCHANGED'
       and evidence.get('financial_permissions_modified') is False
       and evidence.get('money_moved') is False
       and evidence.get('C03_APP_HANDOFF_ACCEPTED') is False
       and evidence.get('nginx_3031_selectors_before')==0
       and evidence.get('active_3031_connections_before')==0
       and evidence.get('r24_after_active')=='inactive'
       and evidence.get('service_enabled')=='disabled'
       and evidence.get('before',{}).get('r24_pid')==str(RETIRED_R24_OLD_PID)
       and evidence.get('before',{}).get('prod_pid')=='465815'
       and evidence.get('before',{}).get('old_pid')==str(LEGACY_PID)
       and evidence.get('before',{}).get('steam_sha')=='8dae3ac8f4f9ac0d01fed6ddde4a82bb0e6de28ced2553eba9c24349533c3032'
       and evidence.get('before',{}).get('web_sha')==NEW_UNIT_SHA,
       'RETIRED_PREVIEW_HISTORICAL_QUARANTINE_PROOF')
 enabled=subprocess.run(['systemctl','is-enabled',RETIRED_R24_UNIT],
                        capture_output=True,text=True,timeout=9)
 check(enabled.returncode in (0,1) and enabled.stdout.strip()=='disabled',
       'R24_RETIRED_UNIT_ENABLED')
 check(exec_out(['systemctl','show',RETIRED_R24_UNIT,'-p','MainPID','--value'])=='0',
       'R24_RETIRED_PID_REVIVED')
 check(exec_out(['systemctl','show',RETIRED_R24_UNIT,'-p','ActiveState','--value'])=='inactive',
       'R24_RETIRED_ACTIVITY')
 check(exec_out(['systemctl','list-dependencies','--reverse','--plain',RETIRED_R24_UNIT,'--no-pager']).strip()==RETIRED_R24_UNIT,
       'R24_NEW_DEPENDENCY')
 nginx_config_has_no_retired_3031()
 sockets=exec_out(['/usr/bin/ss','-H','-ltnp'])
 check(not any(':3031 ' in row for row in sockets.splitlines()),
       'R24_LISTENER_REVIVED')
 preview=m.unit_state(RETIRED_R24_UNIT)
 props=preview.get('properties',{})
 check(props.get('Id')==RETIRED_R24_UNIT and props.get('Type')=='simple'
       and props.get('MainPID')=='0' and props.get('ActiveState')=='inactive'
       and props.get('NeedDaemonReload')=='no'
       and preview.get('start_ticks') is None
       and preview.get('unit_config_sha256')==RETIRED_R24_CONFIG_SHA256,
       'R24_RETIRED_EFFECTIVE_SOURCE_OR_STATE_DRIFT')
 return preview


def load_original():
 check(digest(verified(OLD))==OLD_SHA,'V5Z_SOURCE_DRIFT')
 check(digest(verified(V6))==V6_SHA,'ACCEPTED_V6_SOURCE_DRIFT')
 spec=importlib.util.spec_from_file_location('reviewed_immutable_v5z_steam',str(OLD))
 check(bool(spec and spec.loader),'V5Z_SOURCE_IMPORT')
 obj=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(obj)
 check(obj.ORIG_SHA=='9799d8c9042dbd1875a2096ee1df6b8751347206cf8761d695aecf1e61894707','ORIGINAL_GUARD_PIN_CHANGED')
 # Preserve the original root guard binary/source hash. Only extend its
 # in-memory exact completed-oneshot normalization after checking the
 # restored V1 C03 source, timer, config, command, result and permissions.
 helper = load_c03_helper()
 original_loader = obj.load_immutable_original
 def pinned_loader():
  module = original_loader()
  # Retire exactly one immutable V1 equality with authentic inactive proof.
  original_need = module.need
  def retirement_bounded_need(ok,reason):
   if reason=='PRESERVED_PREVIEW_PID_DRIFT' and not ok:
    verify_exact_retired_preview(module)
    return
   return original_need(ok,reason)
  module.need=retirement_bounded_need
  original_snapshot = module.production_protected
  module.production_protected = lambda: helper.guarded_snapshot(module, original_snapshot)
  # The C04 guard also validates the original untouched V1/C03 source, before
  # admitting only the separately authorized masked-and-closed 8092/8093 state.
  c04 = load_c04_helper()
  c03_snapshot = module.production_protected
  module.production_protected = lambda: c04.guarded_snapshot(module, c03_snapshot)
  return module
 obj.load_immutable_original = pinned_loader
 return obj

def load_c03_helper():
 check(digest(verified(C03_HELPER,0o644))==C03_HELPER_SHA,'EXACT_C03_V1_ONESHOT_HELPER_DRIFT')
 spec=importlib.util.spec_from_file_location('reviewed_c03_v1_oneshot_guard',str(C03_HELPER))
 check(bool(spec and spec.loader),'C03_REVIEWED_HELPER_NOT_LOADABLE')
 helper=importlib.util.module_from_spec(spec);spec.loader.exec_module(helper)
 check(helper.ORIGINAL_UNIT_SHA256=='e3f0effe2d7781b98f0584f3458c2fe269d4c17c94f9400587c9dc90bc2b3849'
   and helper.ORIGINAL_SOURCE_SHA256=='f2df45b3efe7868c130d864e348a3c50da8fcf21d06d67dd478f88994398b707'
   and helper.LOADED_EXEC_COMMAND_SHA256=='15b8b9d7c9a1a6d04ae420750b6f74339149ca9b5025090a26b06b87438c90ed',
   'C03_ORIGINAL_V1_REVIEW_PINS_CHANGED')
 return helper

def c04_socket_backlog_identity_rows(snapshot):
  """Suppress ONLY volatile listening Recv-Q; preserve exact listener identities.

  C03 V1's production_socket_identity discards the first three ss fields;
  C04 V11 compared the entire row. A normal PostgreSQL accept-queue
  0->5->0 race must not invalidate its still-identical inode/addr/sk/cgroup.
  Every address, peer, Send-Q, inode, socket id, user and cgroup byte stays.
  A changed, missing, duplicate, or invalid listener remains fail-closed.
  """
  check(type(snapshot) is dict and set(snapshot)=={3030,3032,5432,8092,8093,8094,8095},
        'C04_SOCKET_SCOPE_UNRECOGNIZED')
  normalized={}
  for port,rows in snapshot.items():
    check(type(port) is int and type(rows) is list,
          'C04_SOCKET_ROW_SHAPE')
    normalized_rows=[]
    for row in rows:
      check(type(row) is str and row.count('LISTEN')==1
            and len(row)<2048,'C04_SOCKET_ROW_UNRECOGNIZED')
      fields=row.split(None,3)
      check(len(fields)==4 and fields[0]=='LISTEN'
            and fields[1].isdecimal() and fields[2].isdecimal(),
            'C04_SOCKET_QUEUE_SHAPE')
      backlog=int(fields[1]);ceiling=int(fields[2])
      # This is a bounded live-queue observation, not a security identity.
      # A full/invalid backlog is a genuine resource HOLD, never hidden.
      check(0<=backlog<=ceiling+1 and ceiling>0 and ceiling<=4096,
            'C04_BACKLOG_OVER_CAPACITY')
      check('ino:' in fields[3] and 'sk:' in fields[3]
            and 'cgroup:' in fields[3],
            'C04_SOCKET_IDENTITY_MISSING')
      normalized_rows.append('LISTEN 0 '+fields[2]+' '+fields[3])
    normalized[port]=normalized_rows
  return normalized


def load_c04_helper():
 check(digest(verified(C04_HELPER,0o644))==C04_HELPER_SHA256,'C04_EXACT_MASK_HELPER_SOURCE_DRIFT')
 spec=importlib.util.spec_from_file_location('exact_c04_masked_listener_guard',str(C04_HELPER))
 check(bool(spec and spec.loader),'C04_REVIEWED_MASK_HELPER_NOT_LOADABLE')
 module=importlib.util.module_from_spec(spec)
 spec.loader.exec_module(module)
 check(module.MASKED_POLICY_ID=='C04_PR227_b250461c45b3d74d5202e14d74df8a345e484add'
       and module.APPROVED_MASKS=={
         'wolochain-mainnet-settlement.service':'571812b3a13a2e887e434f1e97251a0b87f229859cd245c6ce032db1f317d85b',
         'wolochain-founder-rewards-settlement.service':'ad5020bb527ae09e389fd2f185779b50146e6ed1085809a2a87eaeb0f29b3392'
       },'C04_MASK_POLICY_IDENTITY_DRIFT')
 # The original source file, digest, policy and full attest() stay immutable.
 # Its in-memory *read* callback makes C04 compare exactly the same stable
 # fields C03 V1 fingerprints, while separately validating live backlog.
 native_listeners = module.listeners
 def c04_backlog_normalized_listeners():
  return c04_socket_backlog_identity_rows(native_listeners())
 module.listeners=c04_backlog_normalized_listeners
 return module


def static_check():
 check(SELF.name=='r25_steam_refresh_two_web_builds_v22.py','V22_SOURCE_ID')
 check(digest(verified(V20_REFERENCE,0o644))==V20_REFERENCE_SHA256,
       'ORIGINAL_V20_SOURCE_CHANGED')
 check(set(PROFILES)=={'rollback','candidate'} and
       PROFILES['rollback']['unit_sha']==NEW_UNIT_SHA and
       PROFILES['candidate']['unit_sha']==PUBLIC_PLAYER_UNIT_SHA and
       PROFILES['rollback']['source']=='b1ef050b954be734c9f34147361e0d02d7c89b19'
       and PROFILES['candidate']['source']=='6662c33a0ecf25e5b4bd11283fe98a4842a69eb0'
       and PROFILES['candidate']['unit_sha']!=PROFILES['rollback']['unit_sha'],
       'V22_EXACT_TWO_RELEASES_ONLY')
 check(ROOT.name=='web-prod-v22' and ADMISSION.parent==ROOT
       and RECEIPT.parent==ROOT and POLICY.parent==ROOT,
       'V22_OWNER_POLICY_ROOT')
 check(ROOT.is_dir() and not ROOT.is_symlink() and ROOT.stat().st_uid==0
       and stat.S_IMODE(ROOT.stat().st_mode)==0o500,'V22_POLICY_DIRECTORY_ACL')
 check(digest(verified(RETIRED_R24_RECEIPT,0o400))==RETIRED_R24_RECEIPT_SHA256,
       'R24_QUIESCENCE_RECEIPT_ROOT_SHA_DRIFT')
 check(digest(verified(V14_SOURCE,0o644))==V14_SHA256,'PROTECTED_V14_BINARY_DRIFT')
 check(digest(verified(NGINX))==NGINX_SHA,'NGINX_SITE_DRIFT')
 v20_timer=verified(ROOT/'original-steam-v20.service',0o400)
 new_timer=verified(STEAM_UNIT,0o644)
 old=b'/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_traffic_v20.py'
 new=b'/usr/local/lib/aoe2war-web-prod/r25_steam_refresh_two_web_builds_v22.py'
 check(digest(v20_timer)==STEAM_V20_UNIT_SHA256 and v20_timer.count(old)==1
       and v20_timer.count(new)==0 and
       v20_timer.replace(old,new)==new_timer and
       digest(new_timer)==STEAM_V22_UNIT_SHA256,
       'STEAM_V22_UNIT_ONLY_ONE_SOURCE_PATH_CHANGED')
 check(digest(verified(OLD_WEB,0o600))=='1f2970c685e53d0f426b86baeb1910c4f73f346a6e18baf97b064ef1fae7bbe3',
       'ORIGINAL_SYSTEMD_UNIT_DRIFT')
 check(digest(verified(OLD_SOURCE_RECEIPT,0o600))==
       'c41c7e2bffd7287e8637a620e84e12cc38e05bce4bc86081115cebf4621ba701',
       'HISTORICAL_ROLLBACK_ORIGIN_RECEIPT_DRIFT')
 check(digest(verified(CANDIDATE_STAGE_RECEIPT,0o400))==
       PROFILES['rollback']['origin_sha'],'EXACT_R25_STAGE_RECEIPT_DRIFT')
 check(digest(verified(CANDIDATE_SOURCE_OVERLAY,0o400))==
       CANDIDATE_SOURCE_OVERLAY_SHA,'EXACT_R25_OVERLAY_DRIFT')
 old=verified(ORIGINAL_UNIT_BACKUP,0o400)
 historic=b'/var/lib/aoe2war-web-prod-4ab96cc7c1c0'
 existing=PROFILES['rollback']['stage'].as_posix().encode()
 candidate=PROFILES['candidate']['stage'].as_posix().encode()
 check(old.count(historic)==4 and existing not in old
       and digest(old)==FIRST_UNIT_SHA and
       digest(old.replace(historic,existing))==NEW_UNIT_SHA,
       'ORIGINAL_V20_TWO_UNIT_PREIMAGE_NOT_VERIFIED')
 current_r25=verified(CURRENT_R25_UNIT_BACKUP,0o400)
 check(current_r25==old.replace(historic,existing)
       and digest(current_r25)==NEW_UNIT_SHA
       and current_r25.count(existing)==4 and candidate not in current_r25,
       'NEW_V22_BASELINE_NOT_V20_SOURCE')
 new_unit=current_r25.replace(existing,candidate)
 check(new_unit.count(candidate)==4 and existing not in new_unit
       and digest(new_unit)==PUBLIC_PLAYER_UNIT_SHA,
       'PLAYER_UNIT_NOT_EXACT_FOUR_PATH_REPLACEMENTS')
 installed=verified(CURRENT_UNIT)
 check(installed in (current_r25,new_unit) and
       digest(installed) in (NEW_UNIT_SHA,PUBLIC_PLAYER_UNIT_SHA),
       'UNEXPECTED_PUBLIC_3032_UNIT')
 check(LOCK.parent==ROOT and stat.S_IMODE(LOCK.stat().st_mode)==0o600
       and LOCK.stat().st_uid==0 and not LOCK.is_symlink()
       and LOCK.stat().st_nlink==1,'V22_EXCLUSIVE_TIMER_LOCK_DRIFT')
 # THIS REQUIRES A GENUINE PR1309 STAGED JOURNAL AFTER CENTRAL PERMIT.
 # Offline static source tests stub it; live V22 will HOLD before stage.
 player_stage_proof()
 return True


def active_profile():
 j=json.loads(verified(ACTIVE,0o400))
 check(set(j)=={'schema','profile','source_sha','stage_receipt_sha256',
                'finance_authorized'},'ACTIVE_SCHEMA_FIELDS')
 check(j['schema']=='aoe2war.app.traffic-steam-v22.active.v1'
       and j['finance_authorized'] is False,'ACTIVE_V22_SCHEMA_OR_FINANCE_SCOPE')
 name=j['profile'];check(name in PROFILES,'UNREVIEWED_ACTIVE_WEB_BUILD')
 p=PROFILES[name]
 check(j['source_sha']==p['source']
       and j['stage_receipt_sha256']==origin_sha_for(name),
       'ACTIVE_STAGE_OR_SOURCE_CHANGED')
 return name,p


def load_c01_exact_delta_helper():
  check(digest(verified(C01_DELTA_HELPER,0o644))==C01_DELTA_HELPER_SHA256,
        'C01_EXACT_DELTA_HELPER_SOURCE_DRIFT')
  spec=importlib.util.spec_from_file_location('reviewed_c01_inert_two_unit_delta_guard',str(C01_DELTA_HELPER))
  check(bool(spec and spec.loader),'C01_DELTA_HELPER_IMPORT')
  obj=importlib.util.module_from_spec(spec);spec.loader.exec_module(obj)
  check(obj.PRE_C01_SHA==OLD_C01_PRE_SHA256
        and obj.POST_C01_SHA==OLD_C01_POST_SHA256
        and set(obj.SERVICE_PROFILES)=={
          'wolo-satchel-c01.service','wolo-reviewer-c01.service'},
        'C01_DELTA_HELPER_SCOPE_CHANGED')
  return obj

def native_snapshot():
 o=load_original()
 m=o.load_immutable_original()
 # Preserve the authentic original C03/C04 fail-closed chain and its entire
 # production_protected snapshot. Exactly two source-proven inactive C01
 # effective unit deltas are allowed *after* all underlying guards pass.
 snapshot=m.production_protected()
 delta=load_c01_exact_delta_helper()
 # Old C01 identity is independently pinned; only the retired-preview
 # post/pre canonical snapshot digests are updated in memory after proof.
 check(delta.POST_C01_SHA==OLD_C01_POST_SHA256 and
       delta.PRE_C01_SHA==OLD_C01_PRE_SHA256,
       'C01_ORIGINAL_PREVIEW_FINGERPRINTS_CHANGED')
 delta.POST_C01_SHA=FIN_SNAPSHOT
 delta.PRE_C01_SHA=PRE_C01_FIN_SNAPSHOT
 proof=delta.reconstruct_pre_c01(m,snapshot)
 check(proof['status']=='PASS_EXACT_TWO_C01_INERT_UNIT_DELTAS_ONLY'
       and proof['finance_authorized'] is False,
       'EXACT_C01_UNIT_PREIMAGE_NOT_VERIFIED')
 f=m.sha(m.canonical(snapshot))
 check(f==FIN_SNAPSHOT,'PROTECTED_FINANCE_TOPOLOGY_DRIFT')
 check(m.production_nft_shape()==NFT_SHAPE,'STEAM_NFT_SHAPE_DRIFT')
 check(unit_pid('aoe2hdbets-web.service')==LEGACY_PID,'LEGACY_ROLLBACK_PID_CHANGED')
 check(unit_pid('wolochaind-mainnet.service')==VALIDATOR_PID,'WALLET_VALIDATOR_PID_CHANGED')
 for port in (8094,8095):
  text=exec_out(['/usr/bin/ss','-lnt',f'sport = :{port}'])
  check('LISTEN' not in text,'FUNDED_PORT_UNEXPECTEDLY_OPEN')
 return o,m,f

def verify_active_runtime(name,p):
 check(name in PROFILES,'RUNTIME_PROFILE_OUTSIDE_EXACT_PAIR')
 check(digest(verified(CURRENT_UNIT))==p['unit_sha'],'ACTIVE_RELEASE_UNIT_DRIFT')
 origin=origin_sha_for(name)
 check(digest(verified(p['origin'],p['origin_mode']))==origin,
       'ORIGIN_STAGE_PROOF_DRIFT')
 stage=p['stage']
 check(stage.is_dir() and not stage.is_symlink() and
       stage.stat().st_uid==0,'RESTRICTED_STAGED_SOURCE_OWNER_DRIFT')
 check((stage/'.aoe2war-source-sha').read_text().strip()==p['source'],
       'STAGED_SOURCE_DRIFT')
 check((stage/'.next/BUILD_ID').read_text().strip()==p['build'],
       'STAGED_BUILD_DRIFT')
 check((stage/'.aoe2war-build-version').read_text().strip()==p['version'],
       'STAGED_VERSION_DRIFT')
 if name=='rollback':
  k=json.loads(verified(p['origin'],0o400))
  overlay=json.loads(verified(CANDIDATE_SOURCE_OVERLAY,0o400))
  check(k.get('schema')=='aoe2war.app.c03.b1ef-single-slot-recovery.v1'
        and k.get('status')=='PASS_VERIFIED_CI_RUNTIME_STAGED_NOT_STARTED'
        and k.get('source_sha')==p['source']
        and k.get('build_id')==p['build'] and k.get('build_version')==p['version']
        and k.get('runtime_files')==45045
        and k.get('archive_sha256')=='0d897c82d935c73369b6499e23b2d9efefec20fe969f8e4760340e462468eccc'
        and k.get('finance_authorized') is False
        and k.get('funding_authorized') is False
        and k.get('no_runtime_started') is True
        and overlay.get('source_sha')==p['source']
        and overlay.get('build_id')==p['build']
        and overlay.get('build_version')==p['version']
        and overlay.get('sha256')==k.get('archive_sha256')
        and overlay.get('files')==45043
        and overlay.get('manifest_sha256')=='a306aebc8643feb3ae0ae75249f3bf8b4c19b11a7f4957a8e882d0b845a1a58d',
        'ORIGINAL_R25_GENUINE_CI_STAGE_PROOF')
 else:
  stage_proof=player_stage_proof()
  check(stage_proof['source']==p['source']
        and stage_proof['build']==p['build']
        and stage_proof['version']==p['version']
        and stage_proof['origin_sha']==origin
        and stage_proof['terminal'] is False,
        'PUBLIC_PLAYER_GENUINE_STAGE_PROOF_DRIFT')
 pid=unit_pid('aoe2hdbets-web-prod.service')
 check(pid>1 and pid!=LEGACY_PID
       and unit_pid('aoe2hdbets-web-prod.service')==pid,
       'LIVE_WEB_PROCESS_MISSING')
 check(exec_out(['/usr/bin/systemctl','show',
                'aoe2hdbets-web-prod.service','-p','ActiveState','--value'])=='active',
       'WEB_SERVICE_INACTIVE')
 check(exec_out(['/usr/bin/systemctl','show',
                'aoe2hdbets-web-prod.service','-p','WorkingDirectory','--value'])==str(stage),
       'LIVE_WORKDIR_CHANGED')
 check(P(f'/proc/{pid}').stat().st_uid==990,'LIVE_UID_CHANGED')
 check(b'next-server' in P(f'/proc/{pid}/cmdline').read_bytes(),'LIVE_BINARY_CHANGED')
 check('/system.slice/aoe2hdbets-web-prod.service' in
       P(f'/proc/{pid}/cgroup').read_text(),'LIVE_PROCESS_CGROUP_CHANGED')
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
 if name in ('rollback','candidate'):
  with open_once('/traffic',21) as resp:
   check(resp.status==200,'TRAFFIC_HTTP_NOT_200')
   data=resp.read(1_800_001)
   check(300<len(data)<=1_800_000,'TRAFFIC_COMPLETE_BODY_REQUIRED')
   text=data.decode('utf8','ignore')
   check('This is the original Total Traffic, Potential Humans and Confirmed Humans graph.' in text
         and 'Recent observations' not in text
         and 'LAST PUBLISHED UTC DAY:' in text,
         'OWNER_SINGLE_CANONICAL_TRAFFIC_CHART_NOT_RENDERED')
 if name in ('rollback','candidate'):
  with open_once('/players',21) as resp:
   check(resp.status==200,'PLAYERS_HTTP_NOT_200')
   body=resp.read(2_400_001)
   check(300<len(body)<=2_400_000 and b'Player' in body,
         'PLAYERS_COMPLETE_BODY_REQUIRED')
 if name in ('rollback','candidate'):
  with open_once('/api/bets/public-live',21) as published:
   check(published.status==200,'PUBLIC_LIVE_NOT_FUNCTIONAL_HTTP200')
   preview=json.loads(published.read(600000))
   check(preview.get('schema')=='aoe2war.app.bets-published-live-preview.v1'
     and preview.get('status')=='PUBLIC_MARKET_PREVIEW_FINANCIAL_HOLD'
     and preview.get('source')=='aoe2war_public_v9.published_markets'
     and preview.get('financialExecutionAuthorized') is False
     and preview.get('acceptingWagers') is False
     and preview.get('actualLiquidityProven') is False
     and isinstance(preview.get('markets'),list)
     and len(preview['markets'])<=48,'PUBLIC_LIVE_FINANCE_SCOPE')
   if not preview['markets']:
    check(preview.get('emptyReason')=='NO_ELIGIBLE_PUBLISHED_ACTIVE_MARKETS',
          'PUBLIC_LIVE_EMPTY_REASON_DRIFT')
  with open_once('/api/bets/public-history',21) as published:
   check(published.status==200,'PUBLIC_HISTORY_NOT_FUNCTIONAL_HTTP200')
   history=json.loads(published.read(2_000_000))
   check(history.get('status')=='PUBLIC_HISTORY_READ_ONLY_FINANCIAL_HOLD'
     and history.get('financialExecutionAuthorized') is False
     and isinstance(history.get('markets'),list),'PUBLIC_HISTORY_FINANCE_SCOPE')
  # Private financial API must refuse protected access. 503 means the public
  # projection is functional, NOT that funded bet placement is ready.
  try:
   with open_once('/api/bets',21) as bets:
    check(False,'PRIVATE_BETS_UNEXPECTED_HTTP200')
  except urllib.error.HTTPError as denied:
   check(denied.code==503,'PRIVATE_BETS_WRONG_HTTP_STATUS')
   held=json.loads(denied.read(16000))
   check(held.get('schema')=='aoe2war.app.bets-restricted-public-read-hold.v1'
     and held.get('status')=='HOLD_RESTRICTED_PUBLIC_BOARD_READ'
     and held.get('financialExecutionAuthorized') is False
     and held.get('acceptingWagers') is False
     and held.get('approvingPayouts') is False
     and held.get('personalWagersIncluded') is False,
     'PRIVATE_BETS_NOT_EXACT_FINANCIAL_HOLD')
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
 if name=='candidate':
  with open_once('/players/u_1301e0492fdf4a229d941940413497e1',21) as player:
   check(player.status==200,'PUBLIC_PLAYER_SNIPER_HTTP_NOT_200')
   html=player.read(2_400_001)
   check(300<len(html)<=2_400_000
         and b'Exact replay statistics are temporarily unavailable' in html
         and b'936992806' not in html and b'NEXT_SERVER_ERROR' not in html,
         'PUBLIC_PLAYER_SNIPER_UNAVAILABLE_OR_NEXT_ERROR')
 return True

def bind_source():
 name,p=active_profile()
 raw=verified(RECEIPT,0o600)
 j=json.loads(raw)
 required={'schema','profile','current_public_pid','old_public_pid','start_ticks','source_sha','build_id',
           'build_version','unit_sha256','origin_receipt_sha256','fin_snapshot_sha256','nft_shape_sha256',
           'finance_authorized','canonical_traffic_certified','steam_owner_browser_verified'}
 check(set(j)==required,'RUNTIME_ACCEPTANCE_FIELD_SCOPE_CHANGED')
 check(j['schema']=='aoe2war.app.traffic-steam-v22.release.v1' and j['profile']==name
  and j['source_sha']==p['source'] and j['build_id']==p['build'] and j['build_version']==p['version']
  and j['unit_sha256']==p['unit_sha'] and j['origin_receipt_sha256']==origin_sha_for(name)
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
  j.update({'schema':'aoe2war.app.r25.steam-traffic-v22-c04-masked-two-source-pinned-builds',
            'base_v5z_source_sha256':OLD_SHA,
            'approved_v6_source_sha256':V6_SHA,
            'active_meta_sha256':digest(verified(ACTIVE,0o400)),
            'origin_stage_receipt_sha256':origin_sha_for(name),
            'exact_source_profile':name})
  return j
 obj.expected_policy=expected
 return obj

def v22_timer_exclusive_lock(fn, inherited_fd=None):
 """Lock timer refresh and owner candidate enrollment over same file inode.

 The root-only one-use controller may inherit its already-held open file
 description into --phase enroll. This is NOT a bypass: verify original inode,
 owner and mode, and assert exclusive lock acquisition. Never unlock or close
 the parent's borrowed FD. Timer refresh always opens/locks independently.
 """
 raw=verified(LOCK,0o600)
 check(len(raw)<=4096,'V22_REFRESH_LOCK_CONTENT_NOT_EMPTY')
 if inherited_fd is not None:
  check(type(inherited_fd) is int and 3<=inherited_fd<=1024,
        'V22_INHERITED_LOCK_FD_SCOPE')
  a=os.fstat(inherited_fd)
  b=os.stat(LOCK,follow_symlinks=False)
  check(stat.S_ISREG(a.st_mode) and a.st_ino==b.st_ino and
        a.st_dev==b.st_dev and a.st_uid==b.st_uid==0 and
        stat.S_IMODE(a.st_mode)==0o600,
        'V22_INHERITED_LOCK_WRONG_FILE')
  try:
   fcntl.flock(inherited_fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  except BlockingIOError:
   raise RuntimeError('HOLD:V22_INHERITED_LOCK_NOT_EXCLUSIVE')
  return fn()
 fd=os.open(LOCK,os.O_RDWR|os.O_CLOEXEC|os.O_NOFOLLOW)
 try:
  fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
  return fn()
 except BlockingIOError:
  raise RuntimeError('HOLD:V22_STEAM_TIMER_ENROLL_RACE')
 finally:
  try:fcntl.flock(fd,fcntl.LOCK_UN)
  finally:os.close(fd)

def candidate_activation_permit_digest(expected_sha,reader=verified):
 """No candidate enroll from just a STAGE_ONLY permit or unbound CLI hash."""
 check(type(expected_sha) is str and bool(PLAYER_ACTIVATE_SHA64.fullmatch(expected_sha)),
       'V22_ACTIVATE_PERMIT_SHA_SCOPE')
 raw=reader(PLAYER_ACTIVATE_PERMIT,0o600)
 check(digest(raw)==expected_sha,'V22_ACTIVATE_PERMIT_NOT_OWNER_PINNED')
 p=json.loads(raw)
 check(p.get('schema')=='aoe2war.r25.public-player.central-permit.v1'
       and p.get('approved_phase')=='ACTIVATE_ONLY'
       and p.get('central_scope')=='PUBLIC_PLAYER_ONLY_NO_DOCUMENT_GET'
       and p.get('approved_source_sha')==PROFILES['candidate']['source']
       and p.get('approved_build_id')==PROFILES['candidate']['build']
       and p.get('approved_candidate_unit_sha256')==PUBLIC_PLAYER_UNIT_SHA
       and p.get('controller_sha256')==PLAYER_ACTIVATE_CONTROLLER_SHA
       and p.get('ci_archive_sha256')==PLAYER_CI_ARCHIVE_SHA
       and p.get('approved_steam_v22_unit_sha256')==STEAM_V22_UNIT_SHA256
       and p.get('approved_steam_v22_source_sha256')==
           digest(verified(SELF,0o644))
       and p.get('allowed_operation')=='ONE_USE_RESTRICTED_3032_ONLY'
       and p.get('financial_writers_authorized') is False
       and p.get('web_financial_mutations_authorized') is False
       and p.get('codex_financial_capture_active') is False
       and bool(PLAYER_ACTIVATE_NONCE32.fullmatch(str(p.get('approval_nonce',''))))
       and bool(PLAYER_ACTIVATE_NONCE32.fullmatch(str(p.get('stage_nonce',''))))
       and p['approval_nonce']!=p['stage_nonce']
       and bool(PLAYER_ACTIVATE_SHA64.fullmatch(str(p.get('stage_permit_sha256',''))))
       and bool(PLAYER_ACTIVATE_SHA64.fullmatch(str(p.get('staged_event_sha256','')))),
       'V22_CANDIDATE_ENROLL_WRONG_PHASE_OR_NONCE')
 stage=player_stage_proof()
 check(not stage['terminal']
       and p['stage_permit_sha256']==stage['central_permit_sha']
       and p['stage_nonce']==stage['stage_nonce']
       and p['staged_event_sha256']==stage['origin_sha'],
       'V22_CANDIDATE_ENROLL_STAGE_RECEIPT_DRIFT')
 return {'phase':'ACTIVATE_ONLY','source':PROFILES['candidate']['source'],
         'permit_sha256':expected_sha,'stage_receipt_sha256':stage['origin_sha']}

def lease_transfer_headroom(read=None):
 """Strict pre-switch read-only TTL floor; if near expiry HOLD, never flush."""
 leases=(read or read_live_steam_lease_seconds)()
 check(type(leases) is list and 0<len(leases)<=16
       and all(type(x) is int and 110<=x<=300 for x in leases),
       'V22_TWO_BUILD_TRANSFER_LEASE_TOO_CLOSE_TO_EXPIRY')
 return min(leases)

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
 check(digest(verified(p['origin'],p['origin_mode']))==origin_sha_for(name),'ORIGIN_NOT_QUALIFIED')
 o,m,f=native_snapshot()
 pid,ticks=verify_active_runtime(name,p)
 health(name,p)
 meta={'schema':'aoe2war.app.traffic-steam-v22.active.v1','profile':name,
       'source_sha':p['source'],'stage_receipt_sha256':origin_sha_for(name),'finance_authorized':False}
 receipt={'schema':'aoe2war.app.traffic-steam-v22.release.v1','profile':name,
   'current_public_pid':pid,'old_public_pid':OLD_PUBLIC_PID,'start_ticks':ticks,
   'source_sha':p['source'],'build_id':p['build'],'build_version':p['version'],
   'unit_sha256':p['unit_sha'],'origin_receipt_sha256':origin_sha_for(name),
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
 print(json.dumps({'status':'PASS_EXACT_STEAM_V22_DUAL_BUILD_ADMISSION','profile':name,
    'source_sha':p['source'],'pid':pid,'policy_sha256':ph,'release_receipt_sha256':rh,
    'finance_authorized':False},sort_keys=True),flush=True)


def read_live_steam_lease_seconds():
  """Read-only, strict examination of the two pre-existing Steam nft sets."""
  raw=exec_out(['/usr/sbin/nft','-j','list','table','inet','aoe2war_web_prod'])
  data=json.loads(raw)
  observed={}
  for item in data.get('nftables',[]):
    s=item.get('set',{})
    name=s.get('name')
    if name not in ('steam4','steam6'):
      continue
    check(name not in observed,'LEASE_DUPLICATE_SET')
    check(s.get('family')=='inet' and s.get('table')=='aoe2war_web_prod'
          and 'timeout' in s.get('flags',[]),'LEASE_SET_FLAGS')
    values=[]
    for element in s.get('elem') or []:
      check(type(element) is dict and type(element.get('elem')) is dict,
            'LEASE_ENTRY_SHAPE')
      value=element['elem']
      expires=value.get('expires')
      # A zero second lease is never usable. Near kernel GC it may still
      # appear in nft JSON for one read; the caller retries READ ONLY.
      if type(expires) is int and expires==0:
        check(False,'LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY')
      # Preserve strict HEL1 nft 1.0.9 -j seconds semantics.
      check(type(expires) is int and 0<expires<=300,
            'LEASE_EXPIRY_UNOBSERVABLE_OR_DIFFERENT_UNITS')
      check(type(value.get('val')) is str and len(value['val'])<64,
            'LEASE_ADDRESS_UNOBSERVABLE')
      values.append(expires)
    observed[name]=values
  check(set(observed)=={'steam4','steam6'}
        and sum(len(v) for v in observed.values())<=16,
        'LEASE_SET_SCOPE_CHANGED')
  return [v for group in observed.values() for v in group]


def strict_lease_seconds_with_gc_retry(read=read_live_steam_lease_seconds,pause=time.sleep):
  """Four bounded reads of an expired zero-second element, NEVER an acceptance.

  Mirrors the original preserved v5z post-refresh treatment of kernel nft
  garbage collection. Nonzero out-of-bounds, missing fields, wrong units,
  invalid addresses, missing sets and changed firewall scopes fail immediately.
  A persistent zero fails closed; there are no nft writes in this helper.
  """
  for attempt in range(4):
    try:
      return read()
    except RuntimeError as err:
      if str(err)!='HOLD:LEASE_EXPIRY_ZERO_AT_GC_BOUNDARY' or attempt==3:
        raise
      pause(0.35)
  raise AssertionError('unreachable')


def lease_expiry_readonly_wait(pause=time.sleep):
  """Bounded read-only expiry rechecks, including staggered DNS IP leases.

  Wait for EACH nearly expired group rather than demanding every existing IP
  expire in one lockstep window. Preserve original signed-TLS, post-nft shape
  and V1/C03/C04 protected snapshot guard unchanged.
  """
  _,m,before=native_snapshot()
  check(before==FIN_SNAPSHOT and m.production_nft_shape()==NFT_SHAPE,
        'LEASE_PROTECTED_BASELINE_DRIFT')
  total_wait=0
  wait_count=0
  # Repeated near-expiring leases can have different validated DNS arrival
  # times; a fresh item can legitimately coexist with an old expiring one.
  # Never extend any lease, flush any set or relax membership checks.
  for attempt in range(5):
    leases=strict_lease_seconds_with_gc_retry(pause=pause)
    if not leases or min(leases)>40:
      if wait_count:
        print('PASS_V14_BOUNDED_STAGGERED_STEAM_LEASE_PREWAIT',flush=True)
      return
    wait_seconds=min(leases)+2
    check(2<wait_seconds<=42,'LEASE_WAIT_TOO_LONG')
    check(total_wait+wait_seconds<=96 and attempt<4,
          'LEASE_STAGGERED_WAIT_BUDGET_EXCEEDED')
    pause(wait_seconds)
    total_wait+=wait_seconds
    wait_count+=1
    _,m2,after=native_snapshot()
    check(before==after==FIN_SNAPSHOT and m2.production_nft_shape()==NFT_SHAPE,
          'LEASE_PROTECTED_CHANGED_DURING_WAIT')
  check(False,'LEASE_STAGGERED_RECHECK_EXHAUSTED')


def v22_pre_cutover_ready():
 """Read-only qualification before touching 3032; old R25 must stay active."""
 static_check()
 name,p=active_profile()
 check(name=='rollback','DUAL_PROFILE_PRE_CUTOVER_NOT_ORIGINAL')
 current_pid,ticks=verify_active_runtime(name,p)
 _,m,protected=native_snapshot()
 check(protected==FIN_SNAPSHOT and m.production_nft_shape()==NFT_SHAPE,
       'DUAL_PROFILE_PROTECTED_SNAPSHOT_DRIFT')
 check(exec_out(['/usr/bin/systemctl','show',
                 'aoe2war-steam-egress-refresh.timer','-p','ActiveState','--value'])=='active',
       'V22_STEAM_TIMER_NOT_ACTIVE')
 minimum=lease_transfer_headroom()
 return {'status':'PASS_STEAM_V22_TWO_WEB_BUILDS_SOURCE_BOUND_READONLY',
         'active_profile':'rollback','source_sha':p['source'],
         'candidate_source_sha':PROFILES['candidate']['source'],
         'current_public_pid':current_pid,'start_ticks':ticks,
         'steam_lease_min_seconds':minimum,
         'protected_financial_snapshot_sha256':protected,
         'finance_authorized':False,'web_activation_authorized':False,
         'new_native_service_authorized':False}

def main():
 ar=argparse.ArgumentParser()
 ar.add_argument('--phase',required=True,
     choices=['selftest','inspect','pre-cutover','plan','enroll','refresh'])
 ar.add_argument('--profile',choices=['candidate','rollback'])
 ar.add_argument('--inherited-controller-lock-fd',type=int)
 ar.add_argument('--activation-permit-sha256',default='')
 args=ar.parse_args()
 check(not (args.inherited_controller_lock_fd is not None or
            args.activation_permit_sha256) or args.phase=='enroll',
       'V22_INHERITED_LOCK_ENROLL_ONLY')
 if args.phase=='selftest':
  static_check()
  load_original()
  print('PASS_STEAM_V22_IMMUTABLE_V20_AND_TWO_EXACT_PROFILE_PROOFS',flush=True)
 elif args.phase=='inspect':
  static_check()
  name,p=active_profile()
  _,m,f=native_snapshot()
  check(f==FIN_SNAPSHOT and m.production_nft_shape()==NFT_SHAPE,
        'EXACT_V14_C04_MASKED_PROTECTED_PREFLIGHT_CHANGED')
  pid,ticks=verify_active_runtime(name,p)
  print(json.dumps({'status':'PASS_STEAM_V22_PROTECTED_READONLY',
    'active_profile':name,'source_sha':p['source'],'build_id':p['build'],
    'web_pid':pid,'web_start_ticks':ticks,
    'c03_original_v1_exact_source_guard':True,
    'c04_exact_masked_legacy_listener_guard':True,
    'protected_snapshot_sha256':f,'finance_authorized':False},
    sort_keys=True),flush=True)
 elif args.phase=='pre-cutover':
  print(json.dumps(v22_timer_exclusive_lock(v22_pre_cutover_ready),
                   sort_keys=True),flush=True)
 elif args.phase=='enroll':
  check(args.profile is not None,'PROFILE_REQUIRED')
  if args.profile=='candidate':
   check(args.inherited_controller_lock_fd is not None,
         'V22_CANDIDATE_REQUIRES_SERIALIZED_CONTROLLER_LOCK')
   candidate_activation_permit_digest(args.activation_permit_sha256)
  elif args.activation_permit_sha256:
   # Rollback recovery may bind the same exact activation permit, but
   # cannot promote a different source while calling it 'rollback'.
   candidate_activation_permit_digest(args.activation_permit_sha256)
  v22_timer_exclusive_lock(lambda: enroll(args.profile),
                           inherited_fd=args.inherited_controller_lock_fd)
 elif args.phase=='plan':
  obj=make_guard()
  obj.plan()
 else:
  def refresh_once():
   obj=make_guard()
   # Preserve the exact original V20 expiry/GC-boundary behavior.
   lease_expiry_readonly_wait()
   obj.refresh()
  v22_timer_exclusive_lock(refresh_once)

if __name__=='__main__':
 try:main()
 except Exception as e:
  reason=str(e)
  if not re.fullmatch(r'(?:HOLD:)?[A-Z0-9_]{3,100}',reason):
   reason='HOLD:NONIDENTIFYING_'+type(e).__name__.upper()
  print(json.dumps({'status':'HOLD_STEAM_V22','reason':reason,
     'finance_authorized':False,'web_activation_authorized':False},
     sort_keys=True),flush=True)
  sys.exit(3)
