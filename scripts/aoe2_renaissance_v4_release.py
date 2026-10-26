#!/usr/bin/env python3
"""Exact-source owner-v4 RELEASE policy. Review packets remain permanently inert.

No finance, migrations, custody or Wolo authority. Never replay a consumed
operation. Real phases run through the original release lease and engine.
"""
from __future__ import annotations
import argparse
import base64
from contextlib import redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import selectors
import time
import zipfile
import sqlite3
import subprocess
import tempfile

import aoe2_renaissance_owner_authority_v4 as review
from aoe2_renaissance_v4_scope import FROZEN_BASE,FROZEN_TARGET,Hold,require,no_duplicates

ROOT=Path(__file__).resolve().parents[1]
POLICY='aoe2war.renaissance.website.v4.release.v1'
OWNER_FP='3ac8653650acd9c545f4ffa5d007db981bd634ab2f94fa08e687fed92948f1fd'
TRUST_PUBLIC=review.TRUST_PUBLIC
STATE_ROOT=review.STATE_ROOT
ROLLBACK_BUILD='xqX6Oi-zV5gSKH1kIC4zC'
CONTEXT_KEYS=review.CONTEXT_KEYS|{'controller_inventory_sha256','runtime_observation','documentation_baseline','source_content_sha256'}
ARTIFACT_KEYS={'artifact_sha256','stage_receipt_sha256','staged_next_build_id'}
CI_RUNS={40236315430:331565018,40236315470:394298375,40236315501:396111965}
STARTUP_PATHS=('package.json','server.js','next.config.js','instrumentation.ts','instrumentation.node.ts',
 'lib/wargraph/runtime.ts','lib/wargraph/prismaSettlementWorker.ts','lib/betMarketEnsureQueue.ts',
 'lib/lobbySnapshot.ts','lib/bets.ts','scripts/prepare-runtime-cache.mjs','app/api/deployment-version/route.ts',
 'lib/runtimeCrashDiagnostics.ts','lib/prisma.ts','lib/wargraph/prismaCorrelationWorker.ts',
 'lib/wargraph/prismaDeadlineWorker.ts','lib/wargraph/settlement.ts','lib/wargraph/settlementWorker.ts','lib/watcherRelease.ts',
 'app/layout.tsx','app/AppShell.tsx','middleware.ts','lib/session.ts','lib/adminSession.ts')

def canonical(x):return review.canonical(x)
def digest(x):return review.digest(x)
def moment(now=None):return review.moment(now)
def load_json(path:Path,max_bytes=256*1024):
 require(path.is_absolute()and path.is_file()and not path.is_symlink()and path.stat().st_size<=max_bytes,'bounded unlinked JSON required')
 with path.open()as f:return json.load(f,object_pairs_hook=no_duplicates)

def write_immutable(path:Path,value):
 require(path.is_absolute()and not path.is_symlink()and not path.parent.is_symlink(),'linked evidence path')
 raw=canonical(value);require(len(raw)<=1024*1024,'evidence exceeds bound')
 tmp=path.with_name('.'+path.name+'.'+secrets.token_hex(16))
 fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
 try:
  with os.fdopen(fd,'wb')as f:
   f.write(raw);f.flush();os.fsync(f.fileno())
   if os.sys.platform=='darwin':
    import fcntl
    fcntl.fcntl(f.fileno(),51)
  try:os.link(tmp,path,follow_symlinks=False)
  except FileExistsError:require(path.read_bytes()==raw,'immutable evidence differs; never overwrite')
  directory=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
  try:os.fsync(directory)
  finally:os.close(directory)
 finally:tmp.unlink(missing_ok=True)
 return hashlib.sha256(raw).hexdigest()

def event(root,attempt,phase,name,value):
 require(review.NONCE.fullmatch(attempt)is not None and phase in('PRE_STAGE','PRE_ACTIVATE'),'invalid evidence identity')
 folder=root/'release-evidence-v1'/attempt/phase
 folder.mkdir(parents=True,mode=0o700,exist_ok=True)
 for entry in(folder,folder.parent,folder.parent.parent):
  require(not entry.is_symlink()and entry.stat().st_uid==os.geteuid(),'unsafe evidence directory')
  entry.chmod(0o700)
 payload={'schema':1,'policy':POLICY,'attempt_id':attempt,'phase':phase,'event':name,'data':value,
  'financial_release_authorized':False}
 return write_immutable(folder/(name+'-'+digest(payload)+'.json'),payload)

def ledger(root,allow_test=False):
 cx=review.open_ledger(root,allow_test=allow_test)
 cx.execute('''CREATE TABLE IF NOT EXISTS release_requests_v1(
 attempt_id TEXT NOT NULL,phase TEXT NOT NULL,nonce TEXT UNIQUE NOT NULL,
 payload TEXT NOT NULL,state TEXT NOT NULL,packet_sha TEXT,result TEXT,
 PRIMARY KEY(attempt_id,phase))''')
 return cx

def check_context(ctx,phase):
 require(type(ctx)is dict and set(ctx)==CONTEXT_KEYS,'release context incomplete/unknown')
 review.check_context({k:ctx[k]for k in review.CONTEXT_KEYS},phase)
 require(review.HEX40.fullmatch(str(ctx['documentation_baseline']))is not None,'invalid candidate DocsV2 baseline')
 for key in('controller_inventory_sha256','source_content_sha256'):
  require(review.HEX64.fullmatch(str(ctx[key]))is not None and ctx[key]!='0'*64,'invalid source binding')
 require(type(ctx['runtime_observation'])is dict,'signed runtime reference missing')
 require(ctx['rollback_build_id']==ROLLBACK_BUILD,'unreviewed rollback build')

def check_release_payload(p):
 require(type(p)is dict and set(p)=={'kind','phase','attempt_id','nonce','issued_at','expires_at',
  'owner_pubkey_der_sha256','context','source_scope_review_only','dispatch_enabled','website_release_authorized',
  'financial_release_authorized','custody_authorized','wolo_source_p1_open'},'release payload shape')
 require(p['kind']==POLICY and p['source_scope_review_only']is False and p['dispatch_enabled']is True and
  p['website_release_authorized']is True and p['financial_release_authorized']is False and
  p['custody_authorized']is False and p['wolo_source_p1_open']is True,'review-only/foreign/escalated authority')
 require(type(p['attempt_id'])is str and review.NONCE.fullmatch(p['attempt_id'])is not None and
  type(p['nonce'])is str and review.NONCE.fullmatch(p['nonce'])is not None,'bad one-use identity')
 check_context(p['context'],p['phase'])

def issue(ctx,phase,*,state_root=STATE_ROOT,public_key=TRUST_PUBLIC,now=None,attempt_id=None,allow_test=False):
 check_context(ctx,phase);current=moment(now)
 fp=review.public_fingerprint(public_key,allow_test=allow_test)
 require(allow_test or fp==OWNER_FP,'untrusted enrolled owner identity')
 identity=attempt_id or secrets.token_urlsafe(32)
 require(review.NONCE.fullmatch(identity)is not None and(phase!='PRE_STAGE'or attempt_id is None),'wrong attempt lineage')
 p={'kind':POLICY,'phase':phase,'attempt_id':identity,'nonce':secrets.token_urlsafe(32),
  'issued_at':review.timestamp(current),'expires_at':review.timestamp(current+review.timedelta(minutes=20)),
  'owner_pubkey_der_sha256':fp,'context':ctx,'source_scope_review_only':False,'dispatch_enabled':True,
  'website_release_authorized':True,'financial_release_authorized':False,'custody_authorized':False,'wolo_source_p1_open':True}
 check_release_payload(p)
 cx=ledger(state_root,allow_test)
 try:
  cx.execute('BEGIN IMMEDIATE')
  if phase=='PRE_ACTIVATE':
   row=cx.execute("SELECT state,result,payload FROM release_requests_v1 WHERE attempt_id=?AND phase='PRE_STAGE'",(identity,)).fetchone()
   require(row is not None and row[0]=='COMPLETE'and row[1],'no completed protected stage')
   result=json.loads(row[1]);prior=json.loads(row[2])['context']
   require(result['status']=='STAGED'and result['artifact_sha256']==ctx['artifact_sha256']and
    result['local_receipt_sha256']==ctx['stage_receipt_sha256']and result['staged_build_id']==ctx['staged_next_build_id'],'foreign stage artifact/receipt/build')
   stable=CONTEXT_KEYS-ARTIFACT_KEYS-{'runtime_observation','observed_financial_runtime_sha256'}
   require(all(ctx[k]==prior[k]for k in stable),'source/rollback/controller changed since protected stage')
   require(same_boundary(ctx['runtime_observation'],prior['runtime_observation']),'financial boundary changed after stage')
  cx.execute("INSERT INTO release_requests_v1(attempt_id,phase,nonce,payload,state)VALUES(?,?,?,?,'ISSUED')",
   (identity,phase,p['nonce'],canonical(p).decode()))
  cx.commit()
 except BaseException:cx.rollback();raise
 finally:cx.close()
 return {'schema':4,'policy':POLICY,'payload':p}

def verify_packet(packet,original,*,public_key=TRUST_PUBLIC,now=None,allow_test=False):
 require(type(packet)is dict and set(packet)=={'schema','policy','payload','signature'}and
  type(packet['schema'])is int and packet['schema']==4 and packet['policy']==POLICY and
  packet['payload']==original,'old review/v3/foreign release signature')
 check_release_payload(original);p=original;check_time(p,now)
 fp=review.public_fingerprint(public_key,allow_test=allow_test)
 require(fp==p['owner_pubkey_der_sha256']and(allow_test or fp==OWNER_FP),'wrong release owner key')
 try:sig=base64.b64decode(packet['signature'],validate=True)
 except(ValueError,TypeError)as exc:raise Hold('invalid release signature encoding')from exc
 require(32<=len(sig)<=8192,'invalid signature size')
 with tempfile.TemporaryDirectory(prefix='v4-release-verify-')as t:
  raw,signature=Path(t)/'payload',Path(t)/'signature';raw.write_bytes(canonical(p));signature.write_bytes(sig)
  r=subprocess.run(['openssl','dgst','-sha256','-verify',str(public_key),'-signature',str(signature),str(raw)],capture_output=True,timeout=10,check=False)
 require(r.returncode==0,'owner release signature invalid');check_time(p,now)
 return p

def check_time(p,now=None):
 current=moment(now);start,end=review.read_moment(p['issued_at']),review.read_moment(p['expires_at'])
 require(start<=current<end and review.timedelta(0)<end-start<=review.timedelta(minutes=20),'expired/future release owner packet')

def consume(packet,*,state_root=STATE_ROOT,public_key=TRUST_PUBLIC,now=None,allow_test=False):
 p=packet.get('payload')if type(packet)is dict else None;check_release_payload(p)
 cx=ledger(state_root,allow_test)
 try:
  cx.execute('BEGIN IMMEDIATE')
  row=cx.execute('SELECT state,payload FROM release_requests_v1 WHERE attempt_id=?AND phase=?',(p['attempt_id'],p['phase'])).fetchone()
  require(row is not None and row[0]=='ISSUED','consumed/unknown release nonce: inspect original receipts, never redispatch')
  verify_packet(packet,json.loads(row[1]),public_key=public_key,now=now,allow_test=allow_test)
  sha=digest(packet)
  require(cx.execute("UPDATE release_requests_v1 SET state='CONSUMED',packet_sha=?WHERE attempt_id=?AND phase=?AND state='ISSUED'",(sha,p['attempt_id'],p['phase'])).rowcount==1,'nonce race')
  cx.commit();return sha
 except BaseException:cx.rollback();raise
 finally:cx.close()

def finish(p,result,*,state_root=STATE_ROOT,allow_test=False):
 cx=ledger(state_root,allow_test)
 try:
  cx.execute('BEGIN IMMEDIATE')
  require(cx.execute("UPDATE release_requests_v1 SET state='COMPLETE',result=?WHERE attempt_id=?AND phase=?AND state='CONSUMED'",(canonical(result).decode(),p['attempt_id'],p['phase'])).rowcount==1,'only actual uniquely consumed phase may finish')
  cx.commit()
 except BaseException:cx.rollback();raise
 finally:cx.close()

def same_boundary(a,b):
 from aoe2_website_owner_release_v3 import stable_financial_runtime_identity
 return(stable_financial_runtime_identity(a['immutable'])==stable_financial_runtime_identity(b['immutable'])and
  all(a['v4_runtime']['listeners'][p]==b['v4_runtime']['listeners'][p]for p in('8092','8093'))and
  a['v4_runtime']['web_process']['wargraph_runtime_disabled']is b['v4_runtime']['web_process']['wargraph_runtime_disabled']is True)

def engines(candidate):
 require(candidate.is_absolute()and not candidate.is_symlink(),'unsafe candidate checkout')
 os.environ['AOE2WAR_WEBSITE_CANDIDATE_ROOT']=str(candidate.resolve(strict=True))
 import aoe2_release as release
 import aoe2_release_gate as gate
 import aoe2_release_stage as stage
 import aoe2_release_ship as ship
 for module in(release,gate,stage,ship):require(module.ROOT.resolve()==candidate.resolve(),'engine imported with wrong candidate root; use fresh CLI process')
 return release,gate,stage,ship

def github_bytes(route,limit=4*1024*1024,timeout=45):
 require(route.startswith('repos/Emaren/app-prodn/'),'foreign GitHub evidence route')
 p=subprocess.Popen(['gh','api',route],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 buffers={p.stdout:bytearray(),p.stderr:bytearray()};deadline=time.monotonic()+timeout
 try:
  with selectors.DefaultSelector()as selector:
   for pipe in buffers:os.set_blocking(pipe.fileno(),False);selector.register(pipe,selectors.EVENT_READ)
   while selector.get_map():
    left=deadline-time.monotonic();require(left>0,'GitHub evidence timed out')
    for key,_ in selector.select(min(left,.25)):
     raw=os.read(key.fileobj.fileno(),65536)
     if not raw:selector.unregister(key.fileobj);continue
     dest=buffers[key.fileobj];require(len(dest)+len(raw)<=(limit if key.fileobj is p.stdout else 16384),'GitHub evidence exceeds resource bound')
     dest.extend(raw)
  require(p.wait(timeout=max(.01,deadline-time.monotonic()))==0,'authenticated GitHub evidence unavailable')
  return bytes(buffers[p.stdout])
 finally:
  if p.poll()is None:p.kill()
  p.wait(timeout=3)
  for pipe in buffers:pipe.close()

def gh_json(route):
 return json.loads(github_bytes(route),object_pairs_hook=no_duplicates)

ARTIFACTS={
 12615696420:(40236315501,'e6399e70d4b2c72fba5f16b9c69140aa7c72811b7d2153222d42457d08e149ec',{
  'digest.json':'2106817f58ef16890ea79a0e297bc19f451252885cf18cd55879ecd9b20f12a0',
  'coverage.json':'792796e91d26f206f82a5c008d996a43267a83dcc2b9abed0033b65d7360bdda'}),
 12614967768:(40236315470,'db81a33016d99c72ad906f1fc2b29608bc787d18acae980312d2578278cbe1bc',{
  'diagnostic-summary.json':'0bc1f22758140eb4fa48a78a16a808fd3bb10f81903f08e203ab49fc81cbc17f',
  'kingdom-intelligence-next-receipt.json':'40f152f7dbd422e57917fd0217e8aed553d9e07103c5e9cf4d823144dad3dacb'})}

def artifact_evidence(artifact_id):
 run,expected,files=ARTIFACTS[artifact_id]
 metadata=gh_json(f'repos/Emaren/app-prodn/actions/artifacts/{artifact_id}')
 require(metadata['id']==artifact_id and metadata['expired']is False and metadata['workflow_run']['id']==run and
  metadata['workflow_run']['head_sha']==FROZEN_TARGET and metadata['digest']=='sha256:'+expected and
  type(metadata['size_in_bytes'])is int and 0<metadata['size_in_bytes']<=16*1024*1024,'candidate artifact identity/retention mismatch')
 raw=github_bytes(f'repos/Emaren/app-prodn/actions/artifacts/{artifact_id}/zip',16*1024*1024,60)
 require(hashlib.sha256(raw).hexdigest()==expected,'authenticated artifact ZIP digest mismatch')
 parsed={}
 with zipfile.ZipFile(io.BytesIO(raw))as archive:
  names=archive.namelist();require(len(names)<=2048 and len(set(names))==len(names),'ambiguous artifact ZIP')
  for name,sha in files.items():
   matches=[x for x in archive.infolist()if x.filename.split('/')[-1]==name]
   require(len(matches)==1 and 0<matches[0].file_size<=1024*1024 and not matches[0].flag_bits&1,'missing/oversized/ambiguous artifact receipt')
   with archive.open(matches[0])as stream:body=stream.read(1024*1024+1)
   require(len(body)<=1024*1024 and hashlib.sha256(body).hexdigest()==sha,'candidate raw receipt mismatch')
   parsed[name]=json.loads(body,object_pairs_hook=no_duplicates)
 for value in parsed.values():require(value['source_sha']==FROZEN_TARGET,'artifact source mismatch')
 if artifact_id==12615696420:
  d,c=parsed['digest.json'],parsed['coverage.json']
  require(d['count']==d['expected_count']==88 and d['route_status_counts']=={'PASS':88,'FAIL':0,'UNKNOWN':0}and
   c['routes_required']==c['routes_observed']==len(c['routes'])==88 and
   all(x['status']=='PASS'and x['browser_samples']>=2 for x in c['routes']) and
   c['statuses']=={'PASS':88,'FAIL':0,'UNKNOWN':0,'UNMEASURED':0}and c['source_clean']is True and d['build_id']==c['build_id'],'Chrome route coverage mismatch')
 else:
  d,c=parsed['diagnostic-summary.json'],parsed['kingdom-intelligence-next-receipt.json']
  require(d['accepted_candidate_test']is True and d['passed_assertions']==d['total_assertions']==246 and
   d['failed_evidence']==[]and c['status']=='PASS'and d['build_id']==c['build_id']and
   all(x['production_attested']is False and x['certified']is False for x in(d,c)),'Intelligence candidate evidence mismatch')
 return {'artifact_id':artifact_id,'run_id':run,'archive_sha256':expected,'raw_receipt_sha256':files,
  'build_id':d['build_id'],'candidate_only':True,'production_attested':False}

def ci_evidence(candidate):
 from aoe2_renaissance_v4_scope import text_git,FROZEN_TARGET_TREE
 rows=[]
 for run_id,workflow in CI_RUNS.items():
  run=gh_json(f'repos/Emaren/app-prodn/actions/runs/{run_id}/attempts/1')
  require(run['run_attempt']==1 and run['head_sha']==FROZEN_TARGET and run['workflow_id']==workflow and run['status']=='completed'and
   run['conclusion']=='success'and run['repository']['full_name']=='Emaren/app-prodn','candidate CI identity/outcome mismatch')
  jobs=gh_json(f'repos/Emaren/app-prodn/actions/runs/{run_id}/attempts/1/jobs?per_page=100')
  require(jobs['total_count']==len(jobs['jobs'])and len(jobs['jobs'])==(2 if run_id==40236315501 else 3)and
   all(j['status']=='completed'and j['conclusion']=='success'for j in jobs['jobs']),'missing/failed candidate CI jobs')
  rows.append({'run_id':run_id,'workflow_id':workflow,'head_sha':run['head_sha'],'attempt':run['run_attempt'],
   'jobs':[{'id':j['id'],'name':j['name'],'conclusion':j['conclusion']}for j in jobs['jobs']]})
 # The full CI checkout was an explicitly recorded synthetic merge, not HEAD.
 merge='494e7a405532261b079134e5ccb6717045d99068'
 data=gh_json('repos/Emaren/app-prodn/git/commits/'+merge)
 require(data['tree']['sha']==FROZEN_TARGET_TREE==text_git(candidate,'rev-parse','HEAD^{tree}'),'full-CI execution tree differs from candidate')
 return {'runs':rows,'artifacts':[artifact_evidence(k)for k in ARTIFACTS],'full_ci_execution_commit':merge,'full_ci_execution_tree':data['tree']['sha'],
  'source_only':True,'financial_release_authorized':False}

def source_facts(candidate):
 from aoe2_renaissance_v4_scope import read_inventory,INVENTORY,text_git
 from aoe2_renaissance_v4_release_manifest import generate
 inventory=read_inventory(INVENTORY);source=generate(candidate,inventory)
 for name in STARTUP_PATHS:
  require(text_git(candidate,'rev-parse',FROZEN_BASE+':'+name)==text_git(candidate,'rev-parse',FROZEN_TARGET+':'+name),'startup/distribution/financial import boundary changed: '+name)
 r=subprocess.run(['python3',str(candidate/'scripts/docs_v2_check.py')],cwd=candidate,capture_output=True,timeout=90,check=False)
 require(r.returncode==0,'candidate strict DocsV2 failed')
 docs=load_json(candidate/'docs/document-registry.json',4*1024*1024)
 return source,docs['implementation_baseline']['commit']

def controller_ci(operator):
 runs=gh_json('repos/Emaren/app-prodn/actions/runs?head_sha='+operator['commit_sha']+'&per_page=100')
 matches=[x for x in runs['workflow_runs']if x['head_sha']==operator['commit_sha']and
  x['workflow_id']==331565018 and x['event']=='pull_request']
 require(bool(matches),'exact controller full CI unavailable')
 run=max(matches,key=lambda x:x['id'])
 require(run['status']=='completed'and run['conclusion']=='success','exact controller full CI not successful')
 jobs=gh_json(f"repos/Emaren/app-prodn/actions/runs/{run['id']}/jobs?per_page=100")
 require(jobs['total_count']==len(jobs['jobs'])==3 and all(j['head_sha']==operator['commit_sha']and
  j['status']=='completed'and j['conclusion']=='success'for j in jobs['jobs']),'exact controller CI job evidence missing/failed')
 return {'source_sha':operator['commit_sha'],'run_id':run['id'],'attempt':run['run_attempt'],
  'jobs':[{'id':j['id'],'name':j['name'],'conclusion':j['conclusion']}for j in jobs['jobs']]}

def semantic_boundary(source):
 # Exact frozen tree/128 content blobs were separately reviewed. These are
 # limited source properties, not a claim of global DB/chain nonmutation.
 return {'candidate_sha':FROZEN_TARGET,'content_sha256':source['source_content_aggregate_sha256'],
  'scope':'deployment-induced and newly introduced financial writes only',
  'changed_admin_reads':'authenticated read-only queries and pure projections',
  'changed_public_reads':'bounded telemetry file reads and in-memory projections',
  'startup_imports':'unchanged; effective WARGRAPH_RUNTIME_DISABLED=true mandatory',
  'activation_probes':'passive deployment-version only; original rollback and soak retained',
  'global_financial_nonmutation_proven':False,'financial_source_risk':'FINANCIAL',
  'source_p1_resolved':False,'financial_authorization':False}

def prepare(candidate):
 release,gate,_stage,ship=engines(candidate)
 source,baseline=source_facts(candidate)
 from aoe2_website_protected_release_v2 import operator_source_provenance
 operator=operator_source_provenance(root=ROOT)
 data=release.collect();require(data['production']['source_sha']==FROZEN_BASE,'rollback source changed')
 require(data['production']['active_build_id']==ROLLBACK_BUILD,'rollback BUILD_ID changed')
 scope=gate.release_scope(data)
 require(scope['mode']=='committed'and scope['base_sha']==FROZEN_BASE and scope['target_sha']==FROZEN_TARGET and
  scope['changed_files']==[f['path']for f in source['files']]and gate.classify_risk(scope['changed_files'])=='FINANCIAL','unreviewed source/risk scope')
 ci=ci_evidence(candidate)
 payload={'schema':2,'kind':'gate-receipt','status':'PASS','mode':'committed','base_sha':FROZEN_BASE,
  'target_sha':FROZEN_TARGET,'scope_sha256':gate.scope_digest(scope),'risk_class':'FINANCIAL',
  'changed_files':scope['changed_files'],'validation_mode':'AUTHENTICATED_EXACT_CI_AND_SOURCE_TREE_V4',
  'candidate_ci':ci,'owner_v4':{'policy':POLICY,'controller_commit_sha':operator['commit_sha'],
   'controller_inventory_sha256':operator['inventory_sha256'],'source_content_sha256':source['source_content_aggregate_sha256'],
   'documentation_baseline':baseline,'zero_migrations':True,'financial_release_authorized':False,
   'semantic_boundary':semantic_boundary(source),'controller_ci':controller_ci(operator)}}
 gate.GATE_DIR.mkdir(parents=True,exist_ok=True)
 gate_path=gate.GATE_DIR/('owner-v4-'+FROZEN_TARGET+'.json');gate_sha=write_immutable(gate_path,payload)
 manifest={'schema':1,'kind':'aoe2war-release-manifest','release_sha':FROZEN_TARGET,
  'implementation_sha':baseline,'documentation_baseline':baseline,'previous_production_sha':FROZEN_BASE,
  'scope_sha256':payload['scope_sha256'],'risk_class':'FINANCIAL','changed_files':scope['changed_files'],
  'migration_paths':[],'gate':{'status':'PASS','receipt_path':str(gate_path.relative_to(candidate)),'receipt_sha256':gate_sha},
  'policy':{'exact_sealed_commit':True,'build_beside_live':True,'preserve_rollback':True,
   'prove_internal_and_public':True,'wolo_mutation_allowed':False},'owner_v4':payload['owner_v4']}
 gate.MANIFEST_DIR.mkdir(parents=True,exist_ok=True);path=gate.MANIFEST_DIR/(FROZEN_TARGET+'.json')
 manifest_sha=write_immutable(path,manifest)
 sidecar=path.with_suffix('.json.sha256')
 require(not sidecar.is_symlink(),'linked manifest checksum')
 if sidecar.exists():require(sidecar.read_text().strip()==manifest_sha,'immutable manifest checksum differs')
 else:
  fd=os.open(sidecar,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
  with os.fdopen(fd,'w')as f:f.write(manifest_sha+'\n');f.flush();os.fsync(f.fileno())
 return {'status':'SOURCE_MANIFEST_SEALED_NOT_AUTHORIZED','source_sha':FROZEN_TARGET,
  'manifest_sha256':manifest_sha,'gate_sha256':gate_sha,'manifest_path':str(path),'publication_required':data['github']['main_sha']!=FROZEN_TARGET,
  'financial_release_authorized':False}

def assert_environment():
 for key in('AOE2WAR_GLOBAL_LEASE_HELD','AOE2WAR_GLOBAL_LEASE_OWNER_PID','AOE2_RELEASE_GLOBAL_LOCK',
  'AOE2_RELEASE_HOST','AOE2_RELEASE_PROD_REPO','AOE2_RELEASE_SERVICE','AOE2_RELEASE_PUBLIC_BASE'):
  require(not os.environ.get(key),'v4 refuses inherited authority or transport override: '+key)

def public_parity(public_key=TRUST_PUBLIC):
 fp=review.public_fingerprint(public_key)
 require(fp==OWNER_FP,'Mac v4 root public identity differs from enrolled owner')
 # PUBLIC material only; fixed path and strict authenticated host. Never keys.
 program="""import hashlib,json,os,pathlib,stat,subprocess
p=pathlib.Path('/etc/aoe2war/website-owner-v4/owner.pem')
for x in(p.parent,p):
 s=x.lstat()
 if x.is_symlink() or s.st_uid!=0 or s.st_mode&0o022:raise SystemExit(2)
if not p.is_file() or not 0<p.stat().st_size<=8192:raise SystemExit(2)
r=subprocess.run(['openssl','pkey','-pubin','-in',str(p),'-pubout','-outform','DER'],capture_output=True,timeout=8,check=True)
print(json.dumps({'owner_der_sha256':hashlib.sha256(r.stdout).hexdigest()}))
"""
 from aoe2_website_owner_observer_v3 import _bounded_ssh,_strict_packet
 raw=_bounded_ssh(['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
  '-o','ConnectTimeout=8','root@hel1','python3','-'],program.encode())
 require(_strict_packet(raw)=={'owner_der_sha256':fp},'Mac/HEL1 v4 public trust parity unavailable')
 return fp

def stage_facts(candidate,path,ship):
 admitted=path if path.is_absolute()else candidate/path
 require(admitted.is_absolute()and '..'not in admitted.parts,'unsafe stage receipt path')
 for part in (admitted,*admitted.parents):
  require(not part.is_symlink(),'foreign/linked stage receipt')
 require(admitted.is_file()and admitted.parent==candidate/'.aoe2war-release/stage-receipts','foreign stage receipt directory')
 loaded=ship.load_stage_receipt(str(admitted));p,receipt,sha,_mp,manifest,msha,_gp,gsha=loaded
 require(p==admitted,'stage receipt canonical path differs')
 require(receipt['release_sha']==FROZEN_TARGET and receipt['previous_production_sha']==FROZEN_BASE and
  receipt['active_build_id']==ROLLBACK_BUILD and receipt['manifest_sha256']==msha and receipt['gate_sha256']==gsha,
  'stage lineage/rollback mismatch')
 return p,receipt,sha

def context(candidate,data,before,gate,ship,stage_receipt=None):
 from aoe2_website_protected_release_v2 import operator_source_provenance
 source,baseline=source_facts(candidate);operator=operator_source_provenance(root=ROOT)
 _path,manifest,msha=ship.load_manifest(FROZEN_TARGET);_gp,gsha=ship.gate_integrity(manifest)
 require(manifest.get('risk_class')=='FINANCIAL'and manifest.get('migration_paths')==[]and
  manifest.get('previous_production_sha')==FROZEN_BASE and manifest.get('changed_files')==[f['path']for f in source['files']]and
  manifest.get('documentation_baseline')==baseline,'v4 manifest/risk/DocsV2 drift')
 expected={'policy':POLICY,'controller_commit_sha':operator['commit_sha'],
  'controller_inventory_sha256':operator['inventory_sha256'],'source_content_sha256':source['source_content_aggregate_sha256'],
  'documentation_baseline':baseline,'zero_migrations':True,'financial_release_authorized':False,
   'semantic_boundary':semantic_boundary(source),'controller_ci':controller_ci(operator)}
 require(manifest.get('owner_v4')==expected,'sealed manifest belongs to a different controller/source')
 receipt_gate=load_json(_gp,4*1024*1024)
 require(receipt_gate.get('owner_v4')==expected and receipt_gate.get('candidate_ci')==ci_evidence(candidate),'candidate CI/source gate differs')
 require(data['local']['head']==FROZEN_TARGET and data['local']['dirty_count']==0 and
  data['github']['main_sha']==FROZEN_TARGET,'exact source is not published at GitHub main')
 transport,error=ship.production_transport();require(not error,'canonical production Git transport unavailable')
 require(transport.get('remote_main')==FROZEN_TARGET,'production origin main has not published exact target')
 require(before['website']['source_sha']==FROZEN_BASE and before['website']['build_id']==ROLLBACK_BUILD,'original rollback runtime changed')
 require(data['production']['active_build_id']==ROLLBACK_BUILD,'collected rollback build differs')
 if stage_receipt is None:
  errors=ship.validation_errors(data,manifest,transport)
  require(not errors,'original protected stage preflight: '+ '; '.join(errors))
  fact=None
 else:
  _p,fact,_sha=stage_facts(candidate,stage_receipt,ship)
  errors=ship.activation_validation_errors(data,fact,transport)
  require(not errors,'original protected activation preflight: '+ '; '.join(errors))
 require(gate.scope_digest(gate.release_scope(data))==manifest['scope_sha256'],'original release scope digest changed')
 return {'candidate_sha':FROZEN_TARGET,'previous_production_sha':FROZEN_BASE,
  'inventory_sha256':source['source_inventory_sha256'],'source_content_sha256':source['source_content_aggregate_sha256'],
  'controller_commit_sha':operator['commit_sha'],'controller_inventory_sha256':operator['inventory_sha256'],
  'controller_code_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
  'gate_sha256':gsha,'manifest_sha256':msha,'documentation_baseline':baseline,
  'observed_financial_runtime_sha256':digest(before['immutable']),'runtime_observation':before,
  'rollback_source_sha':FROZEN_BASE,'rollback_build_id':ROLLBACK_BUILD,
  'artifact_sha256':fact['artifact_sha256']if fact else None,
  'stage_receipt_sha256':_sha if fact else None,'staged_next_build_id':fact['staged_build_id']if fact else None}

def assert_result(result,phase,ctx):
 require(type(result)is dict and result.get('status')==('STAGED'if phase=='PRE_STAGE'else'CERTIFIED')and
  result.get('release_sha')==FROZEN_TARGET and result.get('previous_production_sha')==FROZEN_BASE and
  result.get('manifest_sha256')==ctx['manifest_sha256']and result.get('gate_sha256')==ctx['gate_sha256']and
  result.get('wolo_mutated')is False,'protected engine result is not the exact authorized phase')
 if phase=='PRE_STAGE':
  require(result.get('live_runtime_mutated')is False and result.get('active_build_id')==ctx['rollback_build_id']and
   review.HEX64.fullmatch(str(result.get('artifact_sha256')))is not None and
   review.HEX64.fullmatch(str(result.get('local_receipt_sha256')))is not None and
   bool(result.get('staged_build_id')),'isolated stage evidence incomplete')
 else:
  require(result.get('artifact_sha256')==ctx['artifact_sha256']and
   result.get('stage_receipt_sha256')==ctx['stage_receipt_sha256']and
   result.get('active_build_id')==ctx['staged_next_build_id'],'activation artifact/build/receipt differs')

def protected_dispatch(data,candidate,mode,runner,stage_receipt=None):
 release,gate,stage,ship=engines(candidate)
 output=io.StringIO()
 with redirect_stdout(output):
  if mode=='stage':rc=stage.stage_release(data,json_output=True,remote_runner=runner.run)
  else:
   require(stage_receipt is not None,'actual stage receipt required')
   rc=ship.activate_release(data,stage_receipt=str(stage_receipt),dry_run=False,json_output=True,
    remote_runner=runner.run,website_policy=POLICY)
 require(rc==0,'protected engine did not certify; preserve CONSUMED and reconcile/abort, never redispatch')
 result=json.loads(output.getvalue(),object_pairs_hook=no_duplicates)
 return result

def operation(mode,candidate,*,packet=None,stage_receipt=None,attempt_id=None):
 assert_environment();release,gate,_stage,ship=engines(candidate);public_parity()
 from aoe2_renaissance_v4_observer import validate_observation
 # Same nonreentrant local+global lease. A phase inherits its physical global
 # flock via the command channel, rather than borrowing an environment marker.
 with release.deployment_lock(command_channel=True)as runner:
  runner.assert_alive();data=release.collect();before=observe_runtime();validate_observation(before)
  ctx=context(candidate,data,before,gate,ship,stage_receipt)
  phase='PRE_ACTIVATE'if mode in('issue-activation','activate')else'PRE_STAGE'
  if mode in('issue-stage','issue-activation'):
   return issue(ctx,phase,attempt_id=attempt_id)
  require(mode in('stage','activate')and packet is not None,'signed release packet required')
  p=packet.get('payload')if type(packet)is dict else None;check_release_payload(p)
  require(p['phase']==phase,'wrong owner-signed phase')
  reference=p['context']['runtime_observation'];validate_observation(reference,max_age_seconds=1200)
  require(same_boundary(reference,before)and reference['website']==before['website']and reference['v4_runtime']==before['v4_runtime'],'runtime diverged since owner signature')
  comparable=dict(ctx);comparable['runtime_observation']=reference
  comparable['observed_financial_runtime_sha256']=digest(reference['immutable'])
  require(comparable==p['context'],'source/controller/manifest/artifact changed since owner approval')
  latest=observe_runtime();validate_observation(latest)
  require(same_boundary(before,latest)and before['website']==latest['website']and before['v4_runtime']==latest['v4_runtime'],'runtime changed during authorization I/O')
  sha=consume(packet,state_root=STATE_ROOT,public_key=TRUST_PUBLIC);runner.assert_alive()
  event(STATE_ROOT,p['attempt_id'],phase,'before-dispatch',{'reference':reference,'before':before,'latest':latest,'owner_packet_sha256':sha})
  validate_observation(latest);check_time(p);runner.assert_alive()
  event(STATE_ROOT,p['attempt_id'],phase,'dispatch-starting',{'mode':mode})
  validate_observation(latest);check_time(p);runner.assert_alive()
  try:result=protected_dispatch(data,candidate,mode,runner,stage_receipt)
  except BaseException as exc:
   event(STATE_ROOT,p['attempt_id'],phase,'dispatch-uncertain',{'error_type':type(exc).__name__,'redispatch_permitted':False});raise
  event(STATE_ROOT,p['attempt_id'],phase,'dispatch-returned',{'protected_release_result':result})
  after=None
  try:
   assert_result(result,phase,p['context']);runner.assert_alive()
   after=observe_runtime();event(STATE_ROOT,p['attempt_id'],phase,'after-dispatch',{'observation':after})
   # Record exact raw differences before validation can reject changed bytes.
   differences=structured_difference(before['immutable'],after.get('immutable'))
   event(STATE_ROOT,p['attempt_id'],phase,'boundary-differences',{'raw_differences':differences})
   validate_observation(after);require(same_boundary(before,after),'financial/Wolo PID/executable/config/timer boundary drift')
   if mode=='stage':
    require(before['website']==after['website']and before['v4_runtime']==after['v4_runtime'],'isolated stage mutated live website')
    path=Path(result['local_receipt_path']);_p,actual,actual_sha=stage_facts(candidate,path,ship)
    require(actual_sha==result['local_receipt_sha256'],'protected stage receipt checksum differs')
    for key in('artifact_sha256','staged_build_id','active_build_id','manifest_sha256','gate_sha256'):
     require(actual.get(key)==result.get(key),'stage output/file differs: '+key)
    event(STATE_ROOT,p['attempt_id'],phase,'actual-stage-receipt',{'receipt':actual,'sha256':actual_sha})
   else:
    require(after['website']['source_sha']==FROZEN_TARGET and after['website']['build_id']==ctx['staged_next_build_id']and
     after['v4_runtime']['web_process']['compiled_version']==result['candidate_build_version'],'post-activation source/BUILD_ID/compiled version differs')
   runner.assert_alive()
  except BaseException as exc:
   event(STATE_ROOT,p['attempt_id'],phase,'verification-held',{'reason':str(exc),'redispatch_permitted':False,
    'protected_status':result.get('status')});raise
  finish(p,result,state_root=STATE_ROOT)
  return {'status':'OWNER_V4_STAGE_VERIFIED'if mode=='stage'else'OWNER_V4_ACTIVATION_VERIFIED',
   'policy':POLICY,'attempt_id':p['attempt_id'],'owner_packet_sha256':sha,'protected_release_result':result,
   'same_owner_observation_not_independent':True,'financial_release_authorized':False,'wolo_source_p1_open':True}

def structured_difference(a,b,path=''):
 if type(a)is dict and type(b)is dict:
  rows=[]
  for k in sorted(set(a)|set(b)):
   pointer=path+'/'+k.replace('~','~0').replace('/','~1')
   if k not in a or k not in b:rows.append({'path':pointer,'before':a.get(k),'after':b.get(k)})
   else:rows.extend(structured_difference(a[k],b[k],pointer))
  return rows
 return []if type(a)is type(b)and a==b else[{'path':path,'before':a,'after':b}]

def publication_plan(candidate):
 from aoe2_renaissance_v4_scope import text_git
 require(text_git(candidate,'rev-parse','HEAD')==FROZEN_TARGET and
  text_git(candidate,'merge-base',FROZEN_BASE,FROZEN_TARGET)==FROZEN_BASE,'publication is not exact frozen fast-forward')
 branch=gh_json('repos/Emaren/app-prodn/branches/main')
 rules=gh_json('repos/Emaren/app-prodn/rules/branches/main')
 require(branch['commit']['sha']in(FROZEN_BASE,FROZEN_TARGET),'main drift; requalification required')
 # No bypass, admin override, merge commit, rebase or force option is provided.
 require(not branch.get('protected')and rules==[],'branch-protected publication requires normal PR workflow/new-SHA requalification; no bypass')
 return {'schema':1,'kind':'owner-v4-exact-source-publication-plan','candidate_sha':FROZEN_TARGET,
  'expected_main_sha':FROZEN_BASE,'mode':'NORMAL_NONFORCE_FAST_FORWARD','branch_protection_observed':branch.get('protected'),
  'rules':rules,'approval_required':True,'no_production_deployment':True,'new_sha_requires_requalification':True,
  'financial_release_authorized':False}

def publish_source(candidate,accepted_plan_sha,accepted_controller):
 # Owner-executed only AFTER source/controller review. This is not called by
 # prepare/issue/stage/activate; source publication is a separate accepted step.
 from aoe2_website_protected_release_v2 import operator_source_provenance
 from aoe2_renaissance_v4_scope import text_git
 plan=publication_plan(candidate);operator=operator_source_provenance(root=ROOT)
 require(accepted_plan_sha==digest(plan)and accepted_controller==operator['commit_sha'],'owner accepted a different publication plan/controller')
 require(text_git(candidate,'remote','get-url','origin')in('git@github.com:Emaren/app-prodn.git','https://github.com/Emaren/app-prodn.git'),'noncanonical publication origin')
 require(text_git(candidate,'status','--porcelain','--untracked-files=all')=='','dirty publication checkout')
 if gh_json('repos/Emaren/app-prodn/branches/main')['commit']['sha']==FROZEN_TARGET:return {'status':'EXACT_SOURCE_ALREADY_PUBLISHED','sha':FROZEN_TARGET}
 with tempfile.TemporaryDirectory(prefix='v4-owner-publish-hooks-')as temp:
  hook=Path(temp)/'pre-push'
  hook.write_text('#!/usr/bin/env python3\nimport sys\nrows=sys.stdin.read().splitlines()\nexpected='+repr(FROZEN_BASE)+'\ntarget='+repr(FROZEN_TARGET)+'''\nif len(rows)!=1:sys.exit(2)
x=rows[0].split()
sys.exit(0 if len(x)==4 and x[1]==target and x[2]=='refs/heads/main' and x[3]==expected else 2)
''');hook.chmod(0o700)
  p=subprocess.run(['git','-C',str(candidate),'-c','core.hooksPath='+temp,'push','origin',FROZEN_TARGET+':refs/heads/main'],capture_output=True,timeout=120,check=False)
 require(p.returncode==0,'normal GitHub publication refused; no bypass or force retry')
 require(gh_json('repos/Emaren/app-prodn/branches/main')['commit']['sha']==FROZEN_TARGET,'publication result differs; stop and requalify')
 return {'status':'EXACT_SOURCE_PUBLISHED_NOT_DEPLOYED','sha':FROZEN_TARGET,'plan_sha256':accepted_plan_sha}

def observe_runtime():
 # Preserve a syntactically valid raw after-packet BEFORE semantic validation
 # rejects genuine PID/source/config drift. Same fixed bounded read-only sensor.
 import aoe2_renaissance_v4_observer as sensor
 import aoe2_website_owner_observer_v3 as transport
 raw=transport._bounded_ssh(['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes',
  '-o','ConnectTimeout=10','-o','ConnectionAttempts=1','root@hel1','python3','-'],sensor.REMOTE_PROGRAM.encode())
 return transport._strict_packet(raw)

def read_request(state_root,attempt_id,phase):
 require(type(attempt_id)is str and review.NONCE.fullmatch(attempt_id)is not None and
  phase in('PRE_STAGE','PRE_ACTIVATE'),'invalid journal identity')
 path=state_root/'owner-v4.sqlite3'
 require(path.is_file()and not path.is_symlink()and path.stat().st_uid==os.geteuid()and
  path.stat().st_mode&0o777==0o600,'private release journal unavailable')
 cx=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=5)
 try:
  cx.execute('PRAGMA query_only=ON')
  row=cx.execute('SELECT payload,state,packet_sha,result FROM release_requests_v1 WHERE attempt_id=?AND phase=?',(attempt_id,phase)).fetchone()
 finally:cx.close()
 require(row is not None,'release request not found')
 return {'payload':json.loads(row[0]),'state':row[1],'packet_sha256':row[2],'result':json.loads(row[3])if row[3]else None}

def reconcile(packet,receipt_path,receipt_sha,candidate):
 p=packet.get('payload')if type(packet)is dict else None;check_release_payload(p)
 row=read_request(STATE_ROOT,p['attempt_id'],p['phase'])
 require(row['state']in('CONSUMED','COMPLETE')and row['packet_sha256']==digest(packet),'foreign or unconsumed reconciliation')
 verify_packet(packet,row['payload'],now=review.read_moment(p['issued_at'])) # archival signature, NO renewed authority
 receipt=load_json(receipt_path)
 require(hashlib.sha256(receipt_path.read_bytes()).hexdigest()==receipt_sha,'original protected receipt bytes differ')
 # STAGED output has additional path/hash wrapper fields; the original
 # on-disk stage receipt does not hash itself. The signed journal stage
 # result supplies that digest, never manufacture a replacement receipt.
 if p['phase']=='PRE_STAGE':
  ctx=dict(p['context']);wrapped=dict(receipt,local_receipt_sha256=receipt_sha)
  assert_result(wrapped,p['phase'],ctx)
 else:assert_result(receipt,p['phase'],p['context'])
 raw=observe_runtime();comparison='UNKNOWN';reason=None;site='UNKNOWN'
 try:
  from aoe2_renaissance_v4_observer import validate_observation
  validate_observation(raw)
  comparison='MATCH'if same_boundary(p['context']['runtime_observation'],raw)else'DRIFT'
  if raw['website']['source_sha']==FROZEN_TARGET and raw['website']['build_id']==p['context']['staged_next_build_id']:site='EXPECTED_PRODUCT_ACTIVE'
  elif raw['website']['source_sha']==FROZEN_BASE and raw['website']['build_id']==ROLLBACK_BUILD:site='ROLLBACK_ACTIVE'
 except(Hold,ValueError,KeyError)as exc:reason=str(exc)
 return {'schema':1,'policy':POLICY,'status':'READ_ONLY_RECONCILIATION_NOT_AUTHORIZATION',
  'attempt_id':p['attempt_id'],'original_nonce_state':row['state'],'protected_status':receipt['status'],
  'protected_receipt_sha256':receipt_sha,'receipt_matches_completed_journal':bool(row['result']and
    (row['result'].get('local_receipt_sha256')==receipt_sha)),
  'receipt_authority':'ADVISORY_MATCHING_LINEAGE_ONLY_UNLESS_COMPLETED_JOURNAL_MATCH','current_same_owner_boundary':comparison,'current_website':site,
  'observation_error':reason,'observed_at':raw.get('observed_at'),'current_observation_sha256':digest(raw),
  'redispatch_permitted':False,'journal_updated':False,'financial_release_authorized':False}

def abort(attempt_id,phase):
 cx=ledger(STATE_ROOT)
 try:
  cx.execute('BEGIN IMMEDIATE')
  require(cx.execute("UPDATE release_requests_v1 SET state='ABORTED'WHERE attempt_id=?AND phase=?AND state='ISSUED'",(attempt_id,phase)).rowcount==1,
   'only unconsumed issued authority can abort; consumed work requires reconciliation')
  cx.commit()
 except BaseException:cx.rollback();raise
 finally:cx.close()
 return {'status':'ISSUED_AUTHORITY_ABORTED_NO_DISPATCH','attempt_id':attempt_id,'phase':phase,'financial_release_authorized':False}

def inspect(candidate):
 assert_environment();release,_gate,_stage,ship=engines(candidate)
 data=release.collect();source,baseline=source_facts(candidate)
 transport,error=ship.production_transport()
 enrollment={'mac_public_present':TRUST_PUBLIC.is_file(),'mac_state_present':STATE_ROOT.is_dir(),
  'expected_owner_der_sha256':OWNER_FP,'private_key_read':False}
 if enrollment['mac_public_present']:
  try:enrollment['parity']=public_parity()
  except(Hold,OSError,ValueError)as exc:enrollment['hold']=str(exc)
 holds=[];runtime_sha=None;runtime_flags=None
 if not enrollment['mac_public_present']or not enrollment['mac_state_present']:holds.append('Mac root public enrollment/private journal provisioning incomplete')
 if enrollment.get('hold'):holds.append(enrollment['hold'])
 if data['github']['main_sha']!=FROZEN_TARGET or transport.get('remote_main')!=FROZEN_TARGET:holds.append('exact source publication requires accepted plan and controller')
 if error:holds.append('original production Git transport: '+error)
 try:
  from aoe2_renaissance_v4_observer import validate_observation
  raw=observe_runtime();runtime_sha=digest(raw)
  runtime_flags={k:raw['v4_runtime']['web_process'][k]for k in('wargraph_runtime_disabled','restart_runtime_disabled')}
  validate_observation(raw)
 except(ValueError,OSError,subprocess.SubprocessError)as exc:holds.append(str(exc))
 return {'status':'WEB_RELEASE_HOLD'if holds else'PREFLIGHT_VERIFIED_OWNER_SIGNATURES_REQUIRED','policy':POLICY,'candidate_sha':FROZEN_TARGET,
  'holds':holds,'runtime_observation_sha256':runtime_sha,'startup_worker_flags':runtime_flags,
  'source_paths':source['count'],'risk_class':'FINANCIAL','zero_migrations':True,'documentation_baseline':baseline,
  'github_main':data['github']['main_sha'],'production_origin_main':transport.get('remote_main'),
  'production_source':data['production']['source_sha'],'active_build_id':data['production']['active_build_id'],
  'transport_error':error,'enrollment':enrollment,'publication_required':data['github']['main_sha']!=FROZEN_TARGET,
  'website_release_authorized':False,'financial_release_authorized':False}

def main():
 ap=argparse.ArgumentParser(description=__doc__)
 ap.add_argument('mode',choices=('inspect','prepare','publication-plan','publish-source','issue-stage','stage','issue-activation','activate','inspect-attempt','reconcile','abort'))
 ap.add_argument('--candidate-repo',type=Path,default=Path.home()/'.codex/worktrees/renaissance-v4-exact-candidate/app-prodn')
 ap.add_argument('--packet',type=Path);ap.add_argument('--stage-receipt',type=Path);ap.add_argument('--attempt-id')
 ap.add_argument('--phase',choices=('PRE_STAGE','PRE_ACTIVATE'));ap.add_argument('--protected-receipt',type=Path);ap.add_argument('--receipt-sha256')
 ap.add_argument('--accept-publication-plan');ap.add_argument('--accept-controller')
 args=ap.parse_args()
 try:
  if args.mode=='inspect':out=inspect(args.candidate_repo)
  elif args.mode=='prepare':assert_environment();out=prepare(args.candidate_repo)
  elif args.mode=='publication-plan':
   out=publication_plan(args.candidate_repo);out={**out,'plan_sha256':digest(out)}
  elif args.mode=='publish-source':assert_environment();out=publish_source(args.candidate_repo,args.accept_publication_plan,args.accept_controller)
  elif args.mode=='inspect-attempt':out=read_request(STATE_ROOT,args.attempt_id,args.phase)
  elif args.mode=='abort':out=abort(args.attempt_id,args.phase)
  elif args.mode=='reconcile':
   require(args.packet is not None and args.protected_receipt is not None and args.receipt_sha256 is not None,'original packet/receipt/checksum required')
   out=reconcile(load_json(args.packet),args.protected_receipt,args.receipt_sha256,args.candidate_repo)
  else:
   out=operation(args.mode,args.candidate_repo,packet=load_json(args.packet)if args.packet else None,
    stage_receipt=args.stage_receipt,attempt_id=args.attempt_id)
 except(Hold,review.Hold,OSError,ValueError,KeyError,TypeError,sqlite3.Error,subprocess.SubprocessError,RuntimeError)as exc:
  print(json.dumps({'status':'WEB_RELEASE_HOLD','reason':str(exc),'policy':POLICY,
   'financial_release_authorized':False,'wolo_source_p1_open':True,'redispatch_permitted':False}));return 2
 print(json.dumps(out,sort_keys=True,indent=2));return 0

if __name__=='__main__':raise SystemExit(main())
