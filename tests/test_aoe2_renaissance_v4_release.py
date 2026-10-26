"""Offline TEST authority/host only: never real owner, SSH, key or deployment."""
import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import aoe2_renaissance_v4_release as release

class V4ReleaseContract(unittest.TestCase):
 def test_review_authority_is_a_different_domain(self):
  import aoe2_renaissance_owner_authority_v4 as review
  self.assertNotEqual(review.POLICY,release.POLICY)
  with self.assertRaises(release.Hold):
   release.check_release_payload({'kind':review.POLICY,'source_scope_review_only':True,'dispatch_enabled':False})

if __name__=='__main__':unittest.main()

import base64,copy,hashlib,json,os,sqlite3,subprocess,tempfile,threading,types
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager,closing
from datetime import datetime,timedelta,timezone
from unittest.mock import patch
import aoe2_renaissance_owner_authority_v4 as review
from test_aoe2_website_owner_observer_v3 import fixture

class ReleaseAuthority(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.keys=tempfile.TemporaryDirectory(prefix='v4-release-TEST-');cls.addClassCleanup(cls.keys.cleanup)
  cls.private=Path(cls.keys.name)/'test.key';cls.public=Path(cls.keys.name)/'test.pem'
  for args in [ ['genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(cls.private)],
   ['pkey','-in',str(cls.private),'-pubout','-out',str(cls.public)]]:
   subprocess.run(['openssl',*args],capture_output=True,check=True,timeout=20)
  cls.public.chmod(0o600)
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='v4-release-state-TEST-');self.addCleanup(self.temp.cleanup)
  self.root=Path(self.temp.name);self.state=self.root/'state';self.state.mkdir(mode=0o700)
  self.now=datetime(2026,10,26,2,0,tzinfo=timezone.utc)
  self.before=fixture()
  for k in ('observed_at','collection_finished_at'):self.before[k]=review.timestamp(self.now)
  self.before['collection_started_at']=review.timestamp(self.now-timedelta(seconds=4))
  self.before['website'].update(source_sha=release.FROZEN_BASE,build_id=release.ROLLBACK_BUILD)
  self.before['v4_runtime']={'listeners':{p:{'port':int(p),'pid':pid,'loopback':True}for p,pid in
   [('8092',self.before['immutable']['wolo8092']['pid']),('8093',self.before['immutable']['wolo8093']['pid']),('3030',self.before['website']['pid'])]},
   'web_process':{'pid':self.before['website']['pid'],'cwd':'/var/www/AoE2HDBets/app-prodn','start_ticks':10,
    'start_epoch_ns':20,'build_id':release.ROLLBACK_BUILD,'build_id_inode':1,'build_id_mtime_ns':10,
    'compiled_version':'TEST_'+release.FROZEN_BASE[:7],'wargraph_runtime_disabled':True,'restart_runtime_disabled':True}}
  self.ctx={k:'1'*64 for k in release.CONTEXT_KEYS}
  self.ctx.update(candidate_sha=release.FROZEN_TARGET,previous_production_sha=release.FROZEN_BASE,
   rollback_source_sha=release.FROZEN_BASE,rollback_build_id=release.ROLLBACK_BUILD,
   controller_commit_sha='2'*40,documentation_baseline='3'*40,runtime_observation=self.before,
   observed_financial_runtime_sha256=release.digest(self.before['immutable']),
   artifact_sha256=None,stage_receipt_sha256=None,staged_next_build_id=None)
  self.stage={'status':'STAGED','release_sha':release.FROZEN_TARGET,'previous_production_sha':release.FROZEN_BASE,
   'active_build_id':release.ROLLBACK_BUILD,'artifact_sha256':'a'*64,'local_receipt_sha256':'b'*64,
   'staged_build_id':'TEST_actual_build','manifest_sha256':self.ctx['manifest_sha256'],
   'gate_sha256':self.ctx['gate_sha256'],'live_runtime_mutated':False,'wolo_mutated':False,
   'local_receipt_path':str(self.root/'actual-stage.json')}
 def issue(self,phase='PRE_STAGE',ctx=None,attempt=None):
  return release.issue(copy.deepcopy(ctx or self.ctx),phase,state_root=self.state,public_key=self.public,
   now=self.now,attempt_id=attempt,allow_test=True)
 def packet(self,request):
  p=request['payload']
  s=subprocess.run(['openssl','dgst','-sha256','-sign',str(self.private)],input=release.canonical(p),capture_output=True,check=True,timeout=10)
  return {**request,'signature':base64.b64encode(s.stdout).decode()}
 def consume(self,packet,now=None):return release.consume(packet,state_root=self.state,public_key=self.public,now=now or self.now,allow_test=True)
 def row(self,p):
  with closing(sqlite3.connect(self.state/'owner-v4.sqlite3'))as c:return c.execute('SELECT state,result FROM release_requests_v1 WHERE attempt_id=?AND phase=?',(p['attempt_id'],p['phase'])).fetchone()
 def run_operation(self,packet,*,result=None,after=None,error=None,mode='stage',ctx=None,event_effect=None):
  ctx=copy.deepcopy(ctx or self.ctx);calls=[];locked=[False]
  @contextmanager
  def lock(**kwargs):
   self.assertEqual({'command_channel':True},kwargs);self.assertFalse(locked[0]);locked[0]=True
   try:yield types.SimpleNamespace(assert_alive=lambda:None)
   finally:locked[0]=False
  engine=types.SimpleNamespace(deployment_lock=lock,collect=lambda:{'test':'host'})
  snapshots=iter([self.before,self.before,after or self.before])
  def dispatch(*_a,**_kw):
   self.assertTrue(locked[0]);self.assertEqual('CONSUMED',self.row(packet['payload'])[0]);calls.append(mode)
   if error:raise error
   return copy.deepcopy(result or self.stage)
  import aoe2_renaissance_v4_observer as sensor
  real_validate=sensor.validate_observation
  real_consume=release.consume;real_finish=release.finish
  fp=review.public_fingerprint(self.public,allow_test=True)
  with patch.dict(os.environ),patch.object(release,'STATE_ROOT',self.state),patch.object(release,'TRUST_PUBLIC',self.public), \
   patch.object(release,'engines',return_value=(engine,None,None,None)),patch.object(release,'public_parity',return_value=fp), \
   patch.object(sensor,'validate_observation',side_effect=lambda value,**kw:real_validate(value,now=self.now,**kw)), \
   patch.object(release,'context',return_value=ctx),patch.object(release,'observe_runtime',side_effect=lambda:copy.deepcopy(next(snapshots))), \
   patch.object(release,'moment',side_effect=lambda now=None:self.now if now is None else now),patch.object(release,'protected_dispatch',side_effect=dispatch), \
   patch.object(release,'consume',side_effect=lambda p,**kw:real_consume(p,now=self.now,allow_test=True,**kw)), \
   patch.object(release,'finish',side_effect=lambda p,r,**kw:real_finish(p,r,allow_test=True,**kw)), \
   patch.object(release,'stage_facts',return_value=(self.root/'actual-stage.json',self.stage,self.stage['local_receipt_sha256'])):
   if event_effect:
    with patch.object(release,'event',side_effect=event_effect):answer=release.operation(mode,self.root,packet=packet,stage_receipt=self.root/'actual-stage.json'if mode=='activate'else None)
   else:answer=release.operation(mode,self.root,packet=packet,stage_receipt=self.root/'actual-stage.json'if mode=='activate'else None)
  return answer,calls
 def test_real_signature_concurrent_consumption_exactly_once(self):
  packet=self.packet(self.issue())
  def attempt(_):
   try:return self.consume(packet)
   except(release.Hold,sqlite3.Error):return None
  with ThreadPoolExecutor(2)as pool:results=list(pool.map(attempt,range(2)))
  self.assertEqual(1,sum(v is not None for v in results));self.assertEqual(('CONSUMED',None),self.row(packet['payload']))
 def test_review_domain_cannot_be_laundered_even_with_a_valid_owner_signature(self):
  request=self.issue();request['policy']=review.POLICY;request['payload']['kind']=review.POLICY
  packet=self.packet(request)
  with self.assertRaises(release.Hold):self.consume(packet)
  self.assertEqual('ISSUED',self.row(packet['payload'])[0])
 def test_expired_future_changed_signature_or_context_refuses_without_consumption(self):
  packet=self.packet(self.issue())
  for now in(self.now-timedelta(seconds=1),self.now+timedelta(minutes=20)):
   with self.assertRaises(release.Hold):self.consume(packet,now)
  for key in('policy','schema','signature'):
   altered=copy.deepcopy(packet);altered[key]='forged'
   with self.assertRaises(release.Hold):self.consume(altered)
  altered=copy.deepcopy(packet);altered['payload']['context']['controller_commit_sha']='f'*40
  with self.assertRaises(release.Hold):self.consume(altered)
  self.assertEqual('ISSUED',self.row(packet['payload'])[0])
 def test_permissions_and_symlinks_refuse(self):
  packet=self.packet(self.issue());db=self.state/'owner-v4.sqlite3';db.chmod(0o644)
  with self.assertRaises(release.Hold):self.consume(packet)
  db.chmod(0o600);linked=self.root/'linked';linked.symlink_to(self.state,target_is_directory=True)
  with self.assertRaises(release.Hold):release.issue(self.ctx,'PRE_STAGE',state_root=linked,public_key=self.public,allow_test=True)
 def test_no_activation_request_from_review_or_uncompleted_stage(self):
  first=self.issue();ctx=dict(self.ctx,artifact_sha256='a'*64,stage_receipt_sha256='b'*64,staged_next_build_id='actual_build')
  with self.assertRaises(release.Hold):self.issue('PRE_ACTIVATE',ctx,first['payload']['attempt_id'])
  self.consume(self.packet(first))
  with self.assertRaises(release.Hold):self.issue('PRE_ACTIVATE',ctx,first['payload']['attempt_id'])
 def test_one_protected_stage_finishes_only_after_both_observations(self):
  p=self.packet(self.issue());out,calls=self.run_operation(p)
  self.assertEqual(['stage'],calls);self.assertEqual('OWNER_V4_STAGE_VERIFIED',out['status']);self.assertEqual('COMPLETE',self.row(p['payload'])[0])
  with self.assertRaises(release.Hold):self.run_operation(p)
 def test_stage_then_artifact_bound_fresh_activation_signature(self):
  first=self.packet(self.issue());self.run_operation(first)
  ctx=dict(copy.deepcopy(self.ctx),artifact_sha256='a'*64,stage_receipt_sha256='b'*64,staged_next_build_id='TEST_actual_build')
  request=self.issue('PRE_ACTIVATE',ctx,first['payload']['attempt_id']);self.assertNotEqual(first['payload']['nonce'],request['payload']['nonce'])
  packet=self.packet(request);after=copy.deepcopy(self.before);after['website'].update(source_sha=release.FROZEN_TARGET,build_id='TEST_actual_build',pid=77,inode=88)
  after['v4_runtime']['listeners']['3030']['pid']=77
  after['v4_runtime']['web_process'].update(pid=77,build_id='TEST_actual_build',compiled_version='TEST_'+release.FROZEN_TARGET[:7])
  result={'status':'CERTIFIED','release_sha':release.FROZEN_TARGET,'previous_production_sha':release.FROZEN_BASE,
   'active_build_id':'TEST_actual_build','candidate_build_version':'TEST_'+release.FROZEN_TARGET[:7],'artifact_sha256':'a'*64,'stage_receipt_sha256':'b'*64,
   'manifest_sha256':ctx['manifest_sha256'],'gate_sha256':ctx['gate_sha256'],'wolo_mutated':False}
  out,calls=self.run_operation(packet,result=result,after=after,mode='activate',ctx=ctx)
  self.assertEqual(['activate'],calls);self.assertEqual('OWNER_V4_ACTIVATION_VERIFIED',out['status'])
  with self.assertRaises(release.Hold):self.run_operation(packet,result=result,after=after,mode='activate',ctx=ctx)
 def test_transport_loss_retains_consumed_and_never_redispatches(self):
  p=self.packet(self.issue())
  with self.assertRaises(TimeoutError):self.run_operation(p,error=TimeoutError('lost reply'))
  self.assertEqual(('CONSUMED',None),self.row(p['payload']))
  with self.assertRaises(release.Hold):self.run_operation(p)
 def test_bad_stage_result_and_live_side_effect_never_complete(self):
  for change in({'artifact_sha256':'bad'},{'live_runtime_mutated':True},{'wolo_mutated':True},{'status':'CERTIFIED'}):
   p=self.packet(self.issue());result={**self.stage,**change}
   with self.assertRaises(release.Hold):self.run_operation(p,result=result)
   self.assertEqual(('CONSUMED',None),self.row(p['payload']))
 def test_pid_config_source_timer_and_executable_drift_hold_after_result_is_preserved(self):
  for kind in('pid','config','source','timer','exe'):
   p=self.packet(self.issue());after=copy.deepcopy(self.before);i=after['immutable']
   if kind=='pid':i['wolo8092']['pid']+=1;i['financial_units']['wolochain-mainnet-settlement.service']['MainPID']+=1
   elif kind=='config':i['unit_config_sha256']['wolochain-mainnet-settlement.service']='b'*64
   elif kind=='source':i['wolo_source_sha']='f'*40
   elif kind=='timer':i['financial_units']['aoe2hdbets-challenge-reconcile.timer']['UnitFileState']='disabled'
   else:i['consensus']['exe_sha256']='f'*64
   with self.subTest(kind=kind),self.assertRaises(ValueError):self.run_operation(p,after=after)
   self.assertEqual(('CONSUMED',None),self.row(p['payload']))
   events=[json.loads(x.read_bytes())for x in(self.state/'release-evidence-v1'/p['payload']['attempt_id']).rglob('*.json')]
   self.assertIn('dispatch-returned',{e['event']for e in events});self.assertIn('boundary-differences',{e['event']for e in events})
 def test_expected_timer_oneshot_transient_is_allowed_but_not_configuration_drift(self):
  p=self.packet(self.issue());after=copy.deepcopy(self.before)
  after['immutable']['financial_units']['aoe2hdbets-challenge-reconcile.service'].update(ActiveState='active',SubState='running',MainPID=99)
  out,_=self.run_operation(p,after=after);self.assertEqual('OWNER_V4_STAGE_VERIFIED',out['status'])
 def test_context_drift_refuses_before_consumption(self):
  for key in('controller_commit_sha','manifest_sha256','gate_sha256','inventory_sha256','documentation_baseline'):
   p=self.packet(self.issue());ctx=copy.deepcopy(self.ctx);ctx[key]='f'*(40 if key in('controller_commit_sha','documentation_baseline')else 64)
   with self.subTest(key=key),self.assertRaises(release.Hold):self.run_operation(p,ctx=ctx)
   self.assertEqual('ISSUED',self.row(p['payload'])[0])
 def test_evidence_failure_before_dispatch_never_returns_authority_to_issued(self):
  p=self.packet(self.issue())
  def full_disk(*_a,**_k):raise OSError('synthetic disk full')
  with self.assertRaises(OSError):self.run_operation(p,event_effect=full_disk)
  self.assertEqual(('CONSUMED',None),self.row(p['payload']))
 def test_inherited_lease_or_transport_environment_cannot_bypass_the_original_lock(self):
  for key in('AOE2WAR_GLOBAL_LEASE_HELD','AOE2WAR_GLOBAL_LEASE_OWNER_PID','AOE2_RELEASE_HOST','AOE2_RELEASE_GLOBAL_LOCK','AOE2_RELEASE_STATE_ROOT','AOE2_RELEASE_SOAK_SECONDS','AOE2_RELEASE_SOAK_INTERVAL_SECONDS','AOE2_RELEASE_FAST_ROLLBACK_KEEP'):
   with self.subTest(key=key),patch.dict(os.environ,{key:'forged'}),self.assertRaises(release.Hold):release.assert_environment()
 def test_immutable_evidence_refuses_overwrite_and_symlink(self):
  p=self.root/'evidence.json';release.write_immutable(p,{'a':1});self.assertEqual(release.digest({'a':1}),release.write_immutable(p,{'a':1}))
  with self.assertRaises(release.Hold):release.write_immutable(p,{'a':2})
  link=self.root/'link';link.symlink_to(p)
  with self.assertRaises(release.Hold):release.write_immutable(link,{'a':1})

class ReleaseTransport(unittest.TestCase):
 def start(self,root):
  from aoe2_renaissance_v4_transport import REMOTE,LeaseRunner
  p=subprocess.Popen([sys.executable,'-u','-c',REMOTE,str(root/'release.lock'),'TEST-HOLDER'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
  self.addCleanup(self.stop,p)
  return p,LeaseRunner(p)
 def stop(self,p):
  if p.poll()is None:
   try:p.stdin.write(b'release\n');p.stdin.flush();p.wait(timeout=3)
   except(OSError,subprocess.TimeoutExpired):p.kill();p.wait(timeout=3)
  for f in(p.stdin,p.stdout,p.stderr):
   if not f.closed:f.close()
 def test_same_physical_lock_channel_runs_a_phase_and_refuses_competing_lease(self):
  with tempfile.TemporaryDirectory()as d:
   root=Path(d);p,r=self.start(root);self.assertEqual({'kind':'acquired'},r.frame(3))
   q,s=self.start(root);self.assertEqual('held',s.frame(3)['kind']);q.wait(timeout=3)
   value=r.run("printf 'isolated-stage-result'",timeout=3)
   self.assertEqual(0,value.returncode);self.assertEqual('isolated-stage-result',value.stdout)
   r.assert_alive()
 def test_phase_inherits_flock_when_ssh_parent_dies_no_expired_lease_takeover(self):
  import fcntl,time
  with tempfile.TemporaryDirectory()as d:
   root=Path(d);p,r=self.start(root);r.frame(3)
   ready=root/'child-ready';errors=[]
   def phase():
    try:r.run("printf 'started' > "+str(ready)+"; sleep 2",timeout=4)
    except(Exception)as e:errors.append(e)
   t=threading.Thread(target=phase);t.start()
   deadline=time.monotonic()+3
   while not ready.exists()and time.monotonic()<deadline:time.sleep(.01)
   self.assertTrue(ready.exists());p.kill();p.wait(timeout=3)
   fd=os.open(root/'release.lock',os.O_RDWR)
   try:
    with self.assertRaises(BlockingIOError):fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   finally:os.close(fd)
   t.join(timeout=6);self.assertFalse(t.is_alive());self.assertTrue(errors)
   time.sleep(2.1)
   fd=os.open(root/'release.lock',os.O_RDWR)
   try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
   finally:os.close(fd)
 def test_timeout_is_uncertain_and_does_not_report_success(self):
  with tempfile.TemporaryDirectory()as d:
   p,r=self.start(Path(d));r.frame(3)
   with self.assertRaises(release.Hold):r.run('sleep 2',timeout=1)
 def test_runner_rejects_reentrant_calls_and_oversized_scripts(self):
  from aoe2_renaissance_v4_transport import MAX_SCRIPT
  with tempfile.TemporaryDirectory()as d:
   p,r=self.start(Path(d));r.frame(3)
   with self.assertRaises(release.Hold):r.run('x'*(MAX_SCRIPT+1),timeout=1)
   r.lock.acquire()
   try:
    with self.assertRaises(release.Hold):r.run('true',timeout=1)
   finally:r.lock.release()

class V4SignerAndPublication(unittest.TestCase):
 def test_new_release_signing_requires_explicit_phase_nonce_and_release_acceptance(self):
  import aoe2_renaissance_v4_owner_sign as signer
  case=ReleaseAuthority();case.setUp();self.addCleanup(case.doCleanups)
  case.private=case.root/'signer-test.key';case.public=case.root/'signer-test.pem'
  subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',str(case.private)],capture_output=True,check=True,timeout=20)
  subprocess.run(['openssl','pkey','-in',str(case.private),'-pubout','-out',str(case.public)],capture_output=True,check=True,timeout=10)
  case.public.chmod(0o600)
  request=case.issue();p=request['payload'];p['owner_pubkey_der_sha256']=release.OWNER_FP
  fields={'phase':'PRE_STAGE','candidate':release.FROZEN_TARGET,'controller':p['context']['controller_commit_sha'],
   'manifest':p['context']['manifest_sha256'],'nonce':p['nonce'],'now':case.now}
  with self.assertRaises(release.Hold):signer.validate_challenge(request,**fields)
  with self.assertRaises(release.Hold):signer.validate_challenge(request,accept_review_only=True,**fields)
  self.assertEqual(p,signer.validate_challenge(request,accept_release=True,**fields))
  for key in('phase','candidate','controller','manifest','nonce'):
   bad=dict(fields);bad[key]='different'
   with self.subTest(key=key),self.assertRaises(release.Hold):signer.validate_challenge(request,accept_release=True,**bad)
 def test_publication_requires_normal_fast_forward_and_rejects_actual_branch_rules(self):
  values={'rev-parse':release.FROZEN_TARGET,'merge-base':release.FROZEN_BASE}
  from aoe2_renaissance_v4_scope import text_git
  with patch('aoe2_renaissance_v4_scope.text_git',side_effect=lambda _r,*a:values[a[0]]):
   for main,protected,rules in [(release.FROZEN_BASE,False,[]),(release.FROZEN_TARGET,False,[])]:
    with patch.object(release,'gh_json',side_effect=[{'commit':{'sha':main},'protected':protected},rules]):
     p=release.publication_plan(Path('/candidate'));self.assertEqual('NORMAL_NONFORCE_FAST_FORWARD',p['mode'])
   for main,protected,rules in [('f'*40,False,[]),(release.FROZEN_BASE,True,[]),(release.FROZEN_BASE,False,[{'type':'pull_request'}])]:
    with patch.object(release,'gh_json',side_effect=[{'commit':{'sha':main},'protected':protected},rules]),self.assertRaises(release.Hold):release.publication_plan(Path('/candidate'))
 def test_passive_policy_cannot_be_retargeted(self):
  import aoe2_release_ship as ship
  for policy,sha in [('forged',release.FROZEN_TARGET),(release.POLICY,'f'*40)]:
   with self.assertRaises(ship.ShipError):ship.remote_activation_script({'release_sha':sha,'previous_production_sha':release.FROZEN_BASE},stage_receipt_sha='a'*64,stage_receipt_text='{}',dry_run=False,receipt_dir='/tmp/test',rollback_dir='/tmp/rollback',website_policy=policy)

class V4AdditionalNegatives(unittest.TestCase):
 setUpClass=classmethod(ReleaseAuthority.setUpClass.__func__)
 setUp=ReleaseAuthority.setUp
 issue=ReleaseAuthority.issue
 packet=ReleaseAuthority.packet
 consume=ReleaseAuthority.consume
 row=ReleaseAuthority.row
 run_operation=ReleaseAuthority.run_operation
 def test_certified_engine_followed_by_outer_hold_preserves_result_and_consumption(self):
  first=self.packet(self.issue());self.run_operation(first)
  ctx=dict(copy.deepcopy(self.ctx),artifact_sha256='a'*64,stage_receipt_sha256='b'*64,staged_next_build_id='TEST_actual_build')
  p=self.packet(self.issue('PRE_ACTIVATE',ctx,first['payload']['attempt_id']))
  result={'status':'CERTIFIED','release_sha':release.FROZEN_TARGET,'previous_production_sha':release.FROZEN_BASE,
   'active_build_id':'WRONG_BUILD','artifact_sha256':'a'*64,'stage_receipt_sha256':'b'*64,
   'manifest_sha256':ctx['manifest_sha256'],'gate_sha256':ctx['gate_sha256'],'wolo_mutated':False}
  with self.assertRaises(release.Hold):self.run_operation(p,result=result,mode='activate',ctx=ctx)
  self.assertEqual(('CONSUMED',None),self.row(p['payload']))
  events=[json.loads(x.read_bytes())for x in(self.state/'release-evidence-v1'/p['payload']['attempt_id']/'PRE_ACTIVATE').glob('*.json')]
  self.assertTrue(any(x['event']=='dispatch-returned'and x['data']['protected_release_result']['status']=='CERTIFIED'for x in events))
  self.assertTrue(any(x['event']=='verification-held'for x in events))
 def test_expiry_during_durable_evidence_io_holds_before_execution(self):
  p=self.packet(self.issue());real_event=release.event
  def delayed(*a,**kw):
   answer=real_event(*a,**kw);self.now+=timedelta(minutes=21);return answer
  with self.assertRaises(ValueError):self.run_operation(p,event_effect=delayed)
  self.assertEqual(('CONSUMED',None),self.row(p['payload']))
 def test_missing_or_wrong_listener_and_active_startup_writer_hold(self):
  from aoe2_renaissance_v4_observer import validate_observation
  for mutate in (lambda x:x.pop('v4_runtime'),
   lambda x:x['v4_runtime']['listeners'].pop('8093'),
   lambda x:x['v4_runtime']['listeners']['8092'].update(pid=999),
   lambda x:x['v4_runtime']['web_process'].update(wargraph_runtime_disabled=False),
   lambda x:x['v4_runtime']['web_process'].update(restart_runtime_disabled=False),
   lambda x:x['v4_runtime']['web_process'].update(build_id_mtime_ns=999),
   lambda x:x['v4_runtime']['web_process'].update(compiled_version='invalid version with spaces')):
   bad=copy.deepcopy(self.before);mutate(bad)
   with self.assertRaises(ValueError):validate_observation(bad,now=self.now)
 def test_stage_symlink_cannot_be_admitted_relative_to_another_cwd(self):
  path=self.root/'.aoe2war-release/stage-receipts';path.mkdir(parents=True)
  (path/'real.json').write_text('{}');(path/'linked.json').symlink_to(path/'real.json')
  ship=types.SimpleNamespace(load_stage_receipt=lambda _:self.fail('must reject before engine load'))
  with self.assertRaises(release.Hold):release.stage_facts(self.root,Path('.aoe2war-release/stage-receipts/linked.json'),ship)
  linked=self.root/'foreign';linked.symlink_to(path,target_is_directory=True)
  with self.assertRaises(release.Hold):release.stage_facts(self.root,linked/'real.json',ship)
 def test_read_only_journal_inspection_and_abort_do_not_reopen_consumed(self):
  p=self.packet(self.issue());identity=p['payload']['attempt_id']
  row=release.read_request(self.state,identity,'PRE_STAGE');self.assertEqual('ISSUED',row['state'])
  with patch.object(release,'STATE_ROOT',self.state),patch.object(release,'ledger',side_effect=lambda root:review_test_ledger(root)):
   self.assertEqual('ISSUED_AUTHORITY_ABORTED_NO_DISPATCH',release.abort(identity,'PRE_STAGE')['status'])
  self.assertEqual('ABORTED',release.read_request(self.state,identity,'PRE_STAGE')['state'])
  with self.assertRaises(release.Hold):self.consume(p)
  p=self.packet(self.issue());self.consume(p)
  with patch.object(release,'STATE_ROOT',self.state),patch.object(release,'ledger',side_effect=lambda root:review_test_ledger(root)):
   with self.assertRaises(release.Hold):release.abort(p['payload']['attempt_id'],'PRE_STAGE')

def review_test_ledger(root):
 cx=review.open_ledger(root,allow_test=True)
 return cx

class ArtifactAdmission(unittest.TestCase):
 def test_authenticated_archive_digest_and_raw_receipt_are_both_mandatory(self):
  import io,zipfile,hashlib
  # Invalid bytes cannot become evidence because authenticated metadata saysPASS.
  ident=12615696420;run,sha,_=release.ARTIFACTS[ident]
  meta={'id':ident,'expired':False,'workflow_run':{'id':run,'head_sha':release.FROZEN_TARGET},'digest':'sha256:'+sha,'size_in_bytes':100}
  with patch.object(release,'gh_json',return_value=meta),patch.object(release,'github_bytes',return_value=b'forged'):
   with self.assertRaisesRegex(release.Hold,'ZIP digest'):release.artifact_evidence(ident)
  body=b'{"source_sha":"forged"}';buff=io.BytesIO()
  with zipfile.ZipFile(buff,'w')as z:z.writestr('digest.json',body)
  raw=buff.getvalue();sha=hashlib.sha256(raw).hexdigest();meta['digest']='sha256:'+sha
  with patch.dict(release.ARTIFACTS,{ident:(run,sha,{'digest.json':'f'*64})}),patch.object(release,'gh_json',return_value=meta),patch.object(release,'github_bytes',return_value=raw):
   with self.assertRaisesRegex(release.Hold,'raw receipt'):release.artifact_evidence(ident)
 def test_later_candidate_rerun_cannot_replace_the_reviewed_checkout_attempt(self):
  called=[]
  def github(route):
   called.append(route)
   return {'run_attempt':2,'head_sha':release.FROZEN_TARGET,'workflow_id':331565018,
    'status':'completed','conclusion':'success','repository':{'full_name':'Emaren/app-prodn'}}
  with patch.object(release,'gh_json',side_effect=github),self.assertRaises(release.Hold):release.ci_evidence(Path('/not-used'))
  self.assertEqual(['repos/Emaren/app-prodn/actions/runs/40236315430/attempts/1'],called)
 def test_expired_wrong_source_run_or_digest_metadata_cannot_be_admitted(self):
  ident=12615696420;run,sha,_=release.ARTIFACTS[ident]
  base={'id':ident,'expired':False,'workflow_run':{'id':run,'head_sha':release.FROZEN_TARGET},'digest':'sha256:'+sha,'size_in_bytes':100}
  for bad in ({**base,'expired':True},{**base,'workflow_run':{'id':1,'head_sha':release.FROZEN_TARGET}},
   {**base,'workflow_run':{'id':run,'head_sha':'f'*40}},{**base,'digest':'sha256:'+'f'*64}):
   with patch.object(release,'gh_json',return_value=bad),patch.object(release,'github_bytes')as download,self.assertRaises(release.Hold):release.artifact_evidence(ident)
   download.assert_not_called()

class SystemdLeaseSurvival(unittest.TestCase):
 start=ReleaseTransport.start
 stop=ReleaseTransport.stop
 def test_separate_session_without_fd_cannot_outlive_the_guarded_lease(self):
  import fcntl,time,shlex
  from aoe2_renaissance_v4_transport import STAGE_GUARD
  with tempfile.TemporaryDirectory()as d:
   root=Path(d);active=root/'active';active.write_text('yes')
   fake=root/'systemctl';fake.write_text('#!'+sys.executable+'\nfrom pathlib import Path\na=Path('+repr(str(active))+').exists()\nprint("ActiveState="+("active"if a else"inactive"));print("MainPID="+("123"if a else"0"));print("ControlPID=0")\n');fake.chmod(0o700)
   # This simulates a service-manager child: detached, closes inherited fd200.
   detached="import time;from pathlib import Path;time.sleep(3);Path("+repr(str(active))+").unlink()"
   launch="import subprocess,sys;subprocess.Popen([sys.executable,'-c',"+repr(detached)+"],stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,start_new_session=True,close_fds=True)"
   p,r=self.start(root);r.frame(3)
   script='export PATH='+shlex.quote(str(root))+':"$PATH"\n'+shlex.quote(sys.executable)+' -c '+shlex.quote(launch)+'\n'+shlex.quote(sys.executable)+' -c '+shlex.quote(STAGE_GUARD)+' "$$" ABCDE12345\nsleep 5'
   with self.assertRaises(release.Hold):r.run(script,timeout=1)
   self.stop(p)
   fd=os.open(root/'release.lock',os.O_RDWR)
   try:
    with self.assertRaises(BlockingIOError):fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
    deadline=time.monotonic()+6
    while time.monotonic()<deadline:
     try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);break
     except BlockingIOError:time.sleep(.05)
    else:self.fail('guardian did not release after exact units were quiescent')
   finally:os.close(fd)


class GenericEngineExclusion(unittest.TestCase):
 def test_generic_stage_cannot_use_the_v4_manifest_without_signed_dispatch(self):
  import aoe2_release_stage as stage
  import io
  from contextlib import redirect_stdout
  with patch.object(stage,'load_manifest',return_value=(Path('/TEST'),{'owner_v4':{'policy':release.POLICY}},'a'*64)), \
   patch.object(stage,'gate_integrity')as gate,patch.object(stage,'production_transport')as transport,redirect_stdout(io.StringIO())as out:
   self.assertEqual(2,stage.stage_release({'local':{'head':release.FROZEN_TARGET}},json_output=True))
  self.assertIn('one-use signed dispatcher',out.getvalue());gate.assert_not_called();transport.assert_not_called()
 def test_generic_activation_and_foreign_policy_cannot_use_a_v4_manifest(self):
  import aoe2_release_ship as ship
  import io
  from contextlib import redirect_stdout
  loaded=(Path('/TEST/receipt'),{},'a'*64,Path('/TEST/manifest'),{'owner_v4':{'policy':release.POLICY}},'b'*64,Path('/TEST/gate'),'c'*64)
  for runner,policy in((None,None),(None,release.POLICY),(lambda *_a,**_kw:None,'foreign')):
   with patch.object(ship,'load_stage_receipt',return_value=loaded),patch.object(ship,'verify_production_migration_receipt')as verify, \
    patch.object(ship,'production_transport')as transport,redirect_stdout(io.StringIO())as out:
    self.assertEqual(2,ship.activate_release({},stage_receipt='/TEST',dry_run=False,json_output=True,remote_runner=runner,website_policy=policy))
   self.assertIn('one-use signed dispatcher',out.getvalue());verify.assert_not_called();transport.assert_not_called()
