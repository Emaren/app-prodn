"""Successor production contracts. Fixtures provide no host authorization."""
import base64
from datetime import datetime, timezone
import importlib.util
import json
import pathlib
import tempfile
import types
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/file)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
f=load('production_f','aoe2_r24_f_parallel_nginx_cutover.py')
g=load('production_g','aoe2_r25_f_g_parallel_observer.py')
m=load('production_mac','aoe2_r24_f_parallel_nginx_mac.py')
spec=importlib.util.spec_from_file_location('old_fixture',ROOT/'tests/test_r24_f_parallel_nginx.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)

class Selectors(unittest.TestCase):
    def test_six_selectors_and_only_exact_auth_writes_preserve_wolo_http(self):
        old=fixture.ParallelR24.scoped_vhost();new=f.production_replace_site(old)
        self.assertEqual(g.production_selectors(old),3030);self.assertEqual(g.production_selectors(new),3032)
        self.assertEqual(new.count(f.PRODUCTION_UPSTREAM),6);self.assertNotIn(f.OLD_UPSTREAM,new)
        self.assertEqual(new.count(f.METHOD_CHECK),5);self.assertEqual(new.count(f.PRODUCTION_METHOD_CHECK),1)
        self.assertEqual(new.count(f.PRODUCTION_FINANCIAL_GET_HOLD),1)
        self.assertIn(b'proxy_pass http://127.0.0.1:27657/;',new);self.assertIn(b'proxy_pass http://127.0.0.1:1318/;',new)
        self.assertIn(b'GET, POST, OPTIONS',new);self.assertEqual(old[old.index(b'listen 80;'):],new[new.index(b'listen 80;'):])
        self.assertNotIn(b'/api/challenges',new)
    def test_mixed_selectors_cannot_be_planned_or_witnessed(self):
        original=fixture.ParallelR24.scoped_vhost()
        for alternate in (f.NEW_UPSTREAM,f.PRODUCTION_UPSTREAM):
            mixed=original.replace(f.OLD_UPSTREAM,alternate,1)
            with self.assertRaises(f.Hold):f.production_replace_site(mixed)
            with self.assertRaises(g.Hold):g.production_selectors(mixed)
    def test_unknown_existing_if_or_duplicate_guard_fails_closed(self):
        original=fixture.ParallelR24.scoped_vhost()
        for extra in (b'if ($uri = /x) { return 200; }',f.METHOD_CHECK):
            raw=original.replace(b'location = / {',b'location = / {\n '+extra,1)
            with self.assertRaises(f.Hold):f.production_replace_site(raw)
    def test_unrecognized_route_or_seventh_selector_is_rejected(self):
        old=fixture.ParallelR24.scoped_vhost()
        for raw in (old.replace(b'^~ /players/by-name/',b'^~ /unreviewed/'),old.replace(b'location ^~ /rpc/',b'location /seventh/ { '+f.OLD_UPSTREAM+b' }\n location ^~ /rpc/')):
            with self.assertRaises(f.Hold):f.production_replace_site(raw)
    def test_legacy_source_identity_and_preview_contract_stay_frozen(self):
        self.assertEqual(f.NEW_PORT,3031);self.assertEqual(g.NEW_PORT,3031)
        self.assertEqual(f.TARGET,g.TARGET);self.assertEqual(f.PRESERVED_BEFORE_SHA,g.A04_BEFORE_SHA256)
        self.assertNotEqual(f.PRODUCTION_AUDIT,f.AUDIT_BASE)

class BeforeAndContinuity(unittest.TestCase):
    def test_controller_only_descendant_can_govern_unchanged_installed_application(self):
        candidate,controller='a'*40,'b'*40
        tree_ids={candidate:'c'*40,controller:'d'*40}
        trees={sha:[{'path':'app','mode':'040000','type':'tree','sha':'e'*40},
                    {'path':'scripts','mode':'040000','type':'tree','sha':sha}] for sha in tree_ids.values()}
        def github(endpoint):
            kind,sha=endpoint.rsplit('/',1)
            if kind=='git/commits':return {'sha':sha,'tree':{'sha':tree_ids[sha]}}
            if kind=='git/trees':return {'sha':sha,'truncated':False,'tree':trees[sha]}
            self.fail('Unexpected Git source endpoint')
        with mock.patch.object(f,'github_read',side_effect=github):
            self.assertRegex(f.production_application_tree(candidate,controller),r'^[a-f0-9]{64}$')
            trees[tree_ids[controller]][0]['sha']='f'*40
            with self.assertRaisesRegex(f.Hold,'INSTALLED_APPLICATION_DIFFERS'):
                f.production_application_tree(candidate,controller)
    def test_g_bytes_come_from_exact_controller_commit_without_editing_staged_artifact(self):
        raw=b'def production_native_snapshot(*args): return {}\n'
        reply={'type':'file','encoding':'base64','content':base64.b64encode(raw).decode()}
        with mock.patch.object(f,'github_read',return_value=reply) as github:
            loaded,module=f.production_qualified_g('b'*40,f.sha(raw))
            self.assertEqual(loaded,raw)
            self.assertEqual(module.production_native_snapshot('before','nonce','source'),{})
            self.assertIn('?ref='+'b'*40,github.call_args.args[0])
            with self.assertRaisesRegex(f.Hold,'SOURCE_PIN'):f.production_qualified_g('b'*40,'0'*64)
    def before(self):
        return {'schema':'aoe2war.g.app-production.v1','phase':'before','nonce':'b'*32,'status':'PRODUCTION_G_BEFORE_PASS_PENDING_REAL_AUTHENTICATED_BROWSER',
          'source_sha':'a'*40,'controller_source_sha':'9'*40,'build_id':'build12345','build_version':'version1','profile_sha256':'c'*64,'manifest_sha256':'d'*64,
          'native_admission_sha256':'e'*64,'candidate_pid':234,'candidate_start_ticks':89,'protected_units_sha256':'f'*64,
          'ports':{'3030':{'pid':2625090},'3031':{'pid':1483304},'3032':{'pid':234},'8092':{'pid':1012},'8093':{'pid':1010}},
          'release_lock':{'inode':6185747},'nginx':{'upstream_port':3030,'selectors':6,'sha256':'1'*64},
          'old_http':{'build_version':'old'},'candidate_http':{'build_version':'new'},'mac_public':{'build_version':'old'},'financial_authorized':False}
    def test_real_before_bytes_nonce_phase_and_mac_public_required(self):
        before=self.before();raw=f.canonical(before)+b'\n'
        self.assertEqual(f.production_before(raw,f.sha(raw),'b'*32),before)
        for key,value in (('phase','after'),('nonce','c'*32),('mac_public',{'build_version':'fake'}),('status','SYNTHETIC'),('financial_authorized',True)):
            changed=dict(before);changed[key]=value;raw=f.canonical(changed)
            with self.assertRaises(f.Hold):f.production_before(raw,f.sha(raw),'b'*32)
        with self.assertRaises(f.Hold):f.production_before(raw,'0'*64,'b'*32)
    def test_after_requires_every_process_and_artifact_identity_unchanged(self):
        before=self.before();after=dict(before,phase='after',nginx={'upstream_port':3032})
        g.production_compare(before,after)
        for key in ('nonce','source_sha','controller_source_sha','build_id','build_version','profile_sha256','manifest_sha256','native_admission_sha256',
                    'candidate_pid','candidate_start_ticks','protected_units_sha256','ports','release_lock','old_http','candidate_http'):
            changed=dict(after);changed[key]='changed'
            with self.assertRaisesRegex(g.Hold,'CONTINUITY_DRIFT'):g.production_compare(before,changed)
    def test_original_preview_and_financial_ports_are_all_compared(self):
        before=self.before()
        native={'protected_units_sha256':before['protected_units_sha256'],'release_lock':before['release_lock'],
                'ports':{key:value for key,value in before['ports'].items() if key!='3032'}}
        with mock.patch.object(f,'production_protected',return_value=native):f.production_require_protected(g,before)
        for port in ('3030','3031','8092','8093'):
            changed={**native,'ports':{**native['ports'],port:{'pid':999}}}
            with mock.patch.object(f,'production_protected',return_value=changed):
                with self.assertRaises(f.Hold):f.production_require_protected(g,before)
    def test_consumed_historical_journal_never_reused_across_profile_namespaces(self):
        with tempfile.TemporaryDirectory() as directory,mock.patch.object(f,'AUDIT_BASE',pathlib.Path(directory)):
            with self.assertRaisesRegex(f.Hold,'HISTORIC_CONSUMED'):f.production_record(f.CONSUMED_NONCE)
            nonce='b'*32;(pathlib.Path(directory)/('r24-'+nonce)).mkdir()
            with self.assertRaisesRegex(f.Hold,'HISTORIC_CONSUMED'):f.production_record(nonce)
            self.assertTrue((pathlib.Path(directory)/('r24-'+nonce)).exists())
    def test_g_source_is_loaded_only_at_exact_content_hash(self):
        raw=(ROOT/'scripts/aoe2_r25_f_g_parallel_observer.py').read_bytes()
        module=f.production_load_g(raw,f.sha(raw));self.assertTrue(callable(module.production_native_snapshot))
        with self.assertRaisesRegex(f.Hold,'SOURCE_PIN'):f.production_load_g(raw,'0'*64)

class OwnerGrant(unittest.TestCase):
    def setup_grant(self):
        self.now=datetime(2026,11,3,10,0,tzinfo=timezone.utc)
        self.plan={'schema':'aoe2war.app.production-cutover-plan.v1','source_sha':'a'*40,'nonce':'b'*32,'financial_authorized':False,
           'public_cutover_authorized':False,'profile_sha256':'e'*64,'before_witness_sha256':'f'*64}
        self.sources={name:b'reviewed '+name.encode() for name in ('engine','owner','g')}
        for name,raw in self.sources.items():self.plan[name+'_source_sha256']=f.sha(raw)
        self.envelope={'plan':self.plan,'plan_sha256':f.sha(f.canonical(self.plan))}
        self.grant={**self.plan,'schema':'aoe2war.app.production-cutover-grant.v1','scope':'A05_NGINX_ONLY_PRODUCTION_3032','decision':'AUTHORIZE',
            'owner_login':'Emaren','release_authority':'OWNER_ONLY_NONFINANCIAL','owner_delegated_decisions':True,'delegated_ai_authorship_disclosed':True,
            'independent_review':False,'financial_authorized':False,'public_cutover_authorized':True,'rollback_authorized':True,'max_uses':1,
            'issued_at':'2026-11-03T09:59:00Z','expires_at':'2026-11-03T10:09:00Z','plan_sha256':self.envelope['plan_sha256'],
            'exact_head_ci':{'run_id':321,'head_sha':'a'*40,'conclusion':'success','all_three_jobs_success':True}}
        self.comment={'id':123,'user':{'login':'Emaren','id':15059910},'created_at':'2026-11-03T09:59:02Z','updated_at':'2026-11-03T09:59:02Z',
          'html_url':'https://github.com/Emaren/app-prodn/issues/1108#issuecomment-123','issue_url':'https://api.github.com/repos/Emaren/app-prodn/issues/1108'}
    def body(self):
        return 'APP_PRODUCTION_CUTOVER_GRANT\n```json\n'+json.dumps(self.grant)+'\n```\n'
    def api(self,path):
        if path.startswith('commits/'):
            return {'check_runs':[{'name':'GitGuardian Security Checks','app':{'slug':'gitguardian'},'status':'completed','conclusion':'success'}]}
        if path=='issues/comments/123':return dict(self.comment,body=self.body())
        if path=='actions/runs/321':return {'head_sha':'a'*40,'name':'AoE2WAR CI','status':'completed','conclusion':'success'}
        if path.startswith('actions/runs/321/jobs'):return {'total_count':3,'jobs':[{'name':name,'status':'completed','conclusion':'success'} for name in
          ('Release and documentation control plane','Type, contract, and production build','Isolated Steam-rating PostgreSQL chronology')]}
        for name,file in m.SOURCE_PATHS.items():
            if path=='contents/'+file+'?ref='+'a'*40:return {'type':'file','encoding':'base64','content':base64.b64encode(self.sources[name]).decode()}
        raise AssertionError(path)
    def test_authentic_bound_grant_passes_and_fake_human_claim_fails(self):
        self.setup_grant()
        with mock.patch.object(f,'github_read',side_effect=self.api):
            actual=f.production_grant('123',f.sha(self.body().encode()),self.envelope,now=self.now)
            self.assertEqual(actual['manifest'],self.grant)
            self.grant['independent_review']=True
            with self.assertRaisesRegex(f.Hold,'DELEGATED_AUTHORITY'):f.production_grant('123',f.sha(self.body().encode()),self.envelope,now=self.now)
    def test_source_nonce_plan_expiry_replay_and_finance_are_not_approval_constants(self):
        for key,value in (('nonce','c'*32),('profile_sha256','0'*64),('before_witness_sha256','0'*64),('plan_sha256','0'*64),
                          ('source_sha','d'*40),('financial_authorized',True),('max_uses',2),('expires_at','2026-11-03T09:59:03Z')):
            self.setup_grant();self.grant[key]=value
            with mock.patch.object(f,'github_read',side_effect=self.api):
                with self.assertRaises(f.Hold):f.production_grant('123',f.sha(self.body().encode()),self.envelope,now=self.now)
    def test_changed_author_edited_comment_and_failed_actual_ci_are_denied(self):
        for change in ('author','edited','ci','security'):
            self.setup_grant()
            if change=='author':self.comment['user']={'login':'Other','id':123}
            if change=='edited':self.comment['updated_at']='2026-11-03T09:59:03Z'
            def api(path):
                answer=self.api(path)
                if change=='ci' and path=='actions/runs/321':answer={**answer,'conclusion':'failure'}
                if change=='security' and path.startswith('commits/'):
                    answer={'check_runs':[{**answer['check_runs'][0],'conclusion':'failure'}]}
                return answer
            with mock.patch.object(f,'github_read',side_effect=api):
                with self.assertRaises(f.Hold):f.production_grant('123',f.sha(self.body().encode()),self.envelope,now=self.now)
    def test_mac_expiry_uses_actual_utc_datetime(self):
        self.setup_grant()
        class Clock(datetime):
            @classmethod
            def now(cls,zone):return self.now
        with mock.patch.object(m,'datetime',Clock),mock.patch.object(m,'github_read',side_effect=self.api):
            self.assertEqual(m.production_comment('123',f.sha(self.body().encode()),self.envelope)[1],self.grant)

class ProtectiveRollback(unittest.TestCase):
    def test_unknown_nginx_never_overwritten_and_expiry_not_needed_for_restore(self):
        context={'candidate':b'candidate','old':b'original','policy':{'build_version':'new'},'before':{'old_http':{'build_version':'old','asset':{}}}}
        with mock.patch.object(f,'root_file',return_value=b'unknown'),mock.patch.object(f,'replace_existing') as replace:
            with self.assertRaisesRegex(f.Hold,'UNKNOWN_NGINX'):f.production_restore(context)
            replace.assert_not_called()
        with mock.patch.object(f,'root_file',return_value=b'candidate'),mock.patch.object(f,'replace_existing') as replace,\
             mock.patch.object(f,'nginx_reload') as reload,mock.patch.object(f,'wait_runtime',return_value={'passed':True}) as wait:
            self.assertEqual(f.production_restore(context),{'passed':True});replace.assert_called_once_with(f.VHOST,b'original');reload.assert_called_once()
            self.assertEqual(wait.call_args.args[:2],('old','new'))
    def test_failure_receipt_storage_never_prevents_rollback_and_no_false_live(self):
        restore=mock.Mock(return_value={'native':'old restored'})
        with mock.patch.object(f,'durable_write',side_effect=OSError),mock.patch.object(f,'fsyncdir'):
            result=f.record_failed_cutover(pathlib.Path('/not-a-real-journal'),f.Hold('STALE_CDN'),restore,production=True)
        restore.assert_called_once();self.assertEqual(result['status'],'ORIGINAL_PROXY_RUNTIME_RESTORED')
        self.assertEqual(result['schema'],'aoe2war.app.production-automatic-rollback.v1')
    def test_forward_success_is_explicitly_pending_real_auth_browser(self):
        source=(ROOT/'scripts/aoe2_r24_f_parallel_nginx_cutover.py').read_text()
        block=source[source.index('def production_apply('):source.index('def production_rollback(')]
        self.assertIn('PUBLIC_PENDING_REAL_STEAM_AND_BROWSER_ACCEPTANCE',block)
        self.assertIn('authenticated_browser_roles_verified\':False',block)
        self.assertNotIn('LIVE_VERIFIED',block)
        self.assertIn('os.mkdir(context[\'record\'],0o700)',block)
        self.assertNotIn('unlink',block);self.assertNotIn('rmtree',block)

class MacTransportRollback(unittest.TestCase):
    def exercise(self,timeout=False,disk_full=False,rollback_failure=False):
        nonce='b'*32;source='a'*40;plan={'source_sha':source,'nonce':nonce}
        envelope={'schema':'aoe2war.app.production-cutover-plan-envelope.v1','status':'PASS_READ_ONLY_PRODUCTION_CUTOVER_PLAN_NOT_AUTHORITY',
                  'plan':plan,'plan_sha256':f.sha(m.canonical(plan))}
        before={'schema':'aoe2war.g.app-production.v1','phase':'before','nonce':nonce,'source_sha':'c'*40,'controller_source_sha':source,'status':'PRODUCTION_G_BEFORE_PASS_PENDING_REAL_AUTHENTICATED_BROWSER'}
        before_raw=m.canonical(before)+b'\n';plan_raw=m.canonical(envelope)+b'\n'
        root=b'def production_apply( def production_rollback(';graw=b'g';owner=b'owner'
        def pinned(path,sha,maximum=65536):
            if str(path)=='root.py':return pathlib.Path(path),root
            if str(path)=='g.py':return pathlib.Path(path),graw
            return pathlib.Path(path),owner
        def private(path,maximum=65536):return pathlib.Path(path),before_raw if str(path)=='before.json' else plan_raw
        plan_result=types.SimpleNamespace(returncode=0,stdout=plan_raw,stderr=b'')
        forward=types.SimpleNamespace(returncode=0,stdout=m.canonical({'status':'PRODUCTION_PUBLIC_CUTOVER_PENDING_G_AFTER_AND_REAL_AUTHENTICATED_BROWSER'}),stderr=b'')
        rollback=types.SimpleNamespace(returncode=2 if rollback_failure else 0,
            stdout=b'' if rollback_failure else b'PASS:APP_PRODUCTION_ORIGINAL_3030_PROXY_RESTORED_NO_SERVICE_RESTART',stderr=b'')
        responses=[plan_result,m.subprocess.TimeoutExpired('ssh',600) if timeout else forward,rollback]
        def record(path,obj):
            if disk_full and ('root-result' in path.name or 'rollback-result' in path.name):raise OSError('fixture disk full')
        with tempfile.TemporaryDirectory() as directory,mock.patch.object(m.sys,'platform','darwin'),mock.patch.object(m.os,'geteuid',return_value=1000),\
             mock.patch.object(m.pathlib.Path,'home',return_value=pathlib.Path(directory)),mock.patch.object(m,'pinned_file',side_effect=pinned),\
             mock.patch.object(m,'private_bytes',side_effect=private),mock.patch.object(m,'production_comment',return_value=({},{})),\
             mock.patch.object(m,'qualified_ci'),mock.patch.object(m,'qualified_sources'),mock.patch.object(m,'owner_receipt',side_effect=record),\
             mock.patch.object(m,'ssh_source',side_effect=responses) as ssh,mock.patch.object(m,'production_g_witness') as after:
            args=['--production-mode','apply','--nonce',nonce,'--source-sha',source,'--candidate-source-sha','c'*40,'--reviewed-root-file','root.py','--root-source-sha256','1'*64,
                  '--reviewed-g-file','g.py','--g-source-sha256','2'*64,'--owner-source-sha256','3'*64,'--existing-before','before.json',
                  '--existing-before-sha256',f.sha(before_raw),'--production-plan','plan.json','--owner-grant-comment','123','--owner-grant-sha256','4'*64]
            expected=m.Hold if rollback_failure else (m.subprocess.TimeoutExpired if timeout else OSError)
            with self.assertRaises(expected):m.production_owner_main(args)
            self.assertEqual(ssh.call_count,3);after.assert_not_called()
            self.assertEqual(ssh.call_args_list[-1].args[1],'--root-production-rollback --nonce '+nonce)
            self.assertEqual(sum('--root-production-apply' in call.args[1] for call in ssh.call_args_list),1)
    def test_ssh_timeout_after_possible_public_commit_attempts_one_authorized_rollback(self):self.exercise(timeout=True)
    def test_disk_full_after_native_public_commit_cannot_prevent_rollback(self):self.exercise(disk_full=True)
    def test_disk_full_cannot_hide_failed_native_rollback(self):self.exercise(disk_full=True,rollback_failure=True)

class SixPhysicalSelectors(unittest.TestCase):
    identity={'source_sha':'a'*40,'controller_source_sha':'9'*40,'build_id':'qualifiedBuild','candidate_pid':2345}
    def connection(self,headers=None,status=200,public=False):
        conn=mock.Mock();conn.sock.getpeername.return_value=('104.21.1.2' if public else '127.0.0.1',443)
        reply=conn.getresponse.return_value;reply.status=status
        values={'x-aoe2war-source':self.identity['source_sha'],'x-aoe2war-build-id':self.identity['build_id'],
                'x-aoe2war-process':str(self.identity['candidate_pid']),'content-length':'123456','content-type':'application/octet-stream',
                'server':'cloudflare','cf-ray':'abc-HEL'}
        if headers:values.update(headers)
        reply.getheader.side_effect=lambda key:values.get(key)
        reply.read.side_effect=AssertionError('HEAD probe must not consume a binary or presence stream')
        return conn
    def test_all_six_loopback_routes_require_exact_process_build_and_head_only(self):
        conn=self.connection()
        with mock.patch.object(g.production_http_client,'HTTPConnection',return_value=conn):rows=g.production_route_heads('candidate-loopback',self.identity)
        self.assertEqual(len(rows),6);self.assertEqual({row['selector'] for row in rows},{row[0] for row in g.PRODUCTION_ROUTE_PROBES})
        self.assertTrue(all(row['candidate_identity_proven'] for row in rows))
        self.assertEqual({call.args[0] for call in conn.request.call_args_list},{'HEAD'})
        self.assertEqual([call.args[1] for call in conn.request.call_args_list],[row[1] for row in g.PRODUCTION_ROUTE_PROBES])
        conn.getresponse.return_value.read.assert_not_called()
    def test_unknown_process_source_or_missing_asset_is_not_accepted_as_routing(self):
        for headers,status in (({'x-aoe2war-source':None},200),({'x-aoe2war-process':'1'},200),({'content-length':None},200),({},404)):
            conn=self.connection(headers,status)
            with mock.patch.object(g.production_http_client,'HTTPConnection',return_value=conn):
                with self.assertRaises(g.Hold):g.production_route_heads('candidate-loopback',self.identity)
    def test_public_selector_probes_require_real_cloudflare_and_fresh_verified_connections(self):
        conn=self.connection(public=True)
        with mock.patch.object(g.production_http_client,'HTTPSConnection',return_value=conn) as connect:
            rows=g.production_route_heads('public',self.identity)
        self.assertEqual(connect.call_count,6);self.assertTrue(all(row['fresh_connection'] for row in rows))
        conn=self.connection({'server':'nginx'},public=True)
        with mock.patch.object(g.production_http_client,'HTTPSConnection',return_value=conn):
            with self.assertRaisesRegex(g.Hold,'CLOUDFLARE_PROVENANCE'):g.production_route_heads('public',self.identity)
    def test_before_reports_old_headers_honestly_without_claiming_candidate_identity(self):
        conn=self.connection({'x-aoe2war-source':None,'x-aoe2war-build-id':None,'x-aoe2war-process':None})
        with mock.patch.object(g.production_http_client,'HTTPConnection',return_value=conn):rows=g.production_route_heads('old-loopback')
        self.assertTrue(all(not row['candidate_identity_proven'] for row in rows))
        self.assertTrue(all(row['source_sha'] is None for row in rows))

if __name__=='__main__':unittest.main()
