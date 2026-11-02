"""Session repair is distinct from consumed START and cannot broaden finance."""
import base64,importlib.util,json,pathlib,tempfile,unittest
from datetime import datetime,timezone
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('session_c',ROOT/'scripts/r25_c_start_recovery_v8_root.py')
s=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(s)

class SecretIdentity(unittest.TestCase):
    def read(self,raw):
        with mock.patch.object(s,'ticks',return_value=s.OLD_TICKS),mock.patch.object(s.Path,'read_bytes',return_value=raw):
            return s.session_original_secret()
    def test_exact_effective_original_session_precedence_and_fallback(self):
        key=b'A'*48;fallback=b'B'*48
        self.assertEqual(self.read(b'SESSION_SECRET='+key+b'\0NEXTAUTH_SECRET='+fallback+b'\0'),key)
        self.assertEqual(self.read(b'SESSION_SECRET=\0NEXTAUTH_SECRET='+fallback+b'\0'),fallback)
    def test_whitespace_is_rejected_never_trimmed_into_a_different_key(self):
        for key in (b' '+b'A'*48,b'A'*48+b'\n',b'A'*31,b'A'*4097):
            with self.subTest(length=len(key)),self.assertRaises(s.Hold):self.read(b'SESSION_SECRET='+key+b'\0')
    def test_duplicate_or_missing_secret_fails_closed(self):
        for raw in (b'HOME=/root\0',b'SESSION_SECRET='+b'A'*48+b'\0SESSION_SECRET='+b'B'*48+b'\0'):
            with self.assertRaises(s.Hold):self.read(raw)
    def test_original_pid_reuse_prevents_key_transfer(self):
        with mock.patch.object(s,'ticks',return_value=s.OLD_TICKS+1),mock.patch.object(s.Path,'read_bytes') as read:
            with self.assertRaisesRegex(s.Hold,'PROCESS_IDENTITY_CHANGED'):s.session_original_secret()
        read.assert_not_called()
    def test_dropin_preserves_database_file_and_changes_only_candidate_auth(self):
        raw=s.session_dropin(s.C_AUDIT/('session-repair-'+'a'*32))
        self.assertEqual(raw.count(b'EnvironmentFile='),1)
        self.assertIn(str(s.SESSION_ENV).encode(),raw)
        self.assertNotIn(b'DATABASE_URL=',raw)
        self.assertIn(b'ExecStartPre=+/usr/bin/nsenter --target 1 --mount --',raw)
        self.assertNotIn(s.OLD_UNIT.encode(),raw)
    def test_actual_hel1_duplicate_environmentfiles_only(self):
        # This is the authentic 2026-11-02 systemctl --value format.
        good=str(s.SESSION_DB_ENV)+' (ignore_errors=no)'
        self.assertTrue(s.session_exact_database_envfiles(chr(10).join([good,good])+chr(10)))
        for rows in ([good], [good,good,good],
                     [good,'/etc/aoe2hdbets/aoe2hdbets-web.env (ignore_errors=yes)'],
                     [good,good.replace('ignore_errors=no','ignore_errors=yes')]):
            with self.subTest(rows=rows),self.assertRaisesRegex(s.Hold,'ORIGINAL_EXACT_DUPLICATED_DATABASE_ENVFILES_REQUIRED'):
                s.session_exact_database_envfiles(chr(10).join(rows)+chr(10))
    def test_consumed_staging_is_never_accepted_without_exact_sealed_receipts(self):
        # A partial prior attempt is not permission to reuse its key file.
        with mock.patch.object(s,'directory'), mock.patch.object(s,'root_file',return_value=b'forged'):
            with self.assertRaisesRegex(s.Hold,'SESSION_PREVIOUS_CONSUMED_RECEIPT_DRIFT'):
                s.session_original_held_staging()
    def test_recovery_uses_new_witness_and_preserves_prior_root_artifacts(self):
        self.assertNotEqual(s.SESSION_WITNESS,s.SESSION_PRIOR_WITNESS)
        self.assertTrue(s.SESSION_WITNESS.name.endswith('-v2.py'))
        self.assertEqual(s.SESSION_PRIOR_NONCE,'e0c3ab9b595e5e3d2d539d0f3668240d')
        dropin=s.session_dropin(s.C_AUDIT/('session-repair-'+'f'*32))
        self.assertIn(str(s.SESSION_WITNESS).encode(),dropin)
        self.assertNotIn(str(s.SESSION_PRIOR_WITNESS).encode(),dropin)
    def test_write_once_preserves_existing_secret_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path=pathlib.Path(directory)/'session.env';path.write_bytes(b'original')
            with mock.patch.object(s,'directory'),self.assertRaises(FileExistsError):s.session_create(path,b'replacement',0o600)
            self.assertEqual(path.read_bytes(),b'original')

class OwnerSessionGrant(unittest.TestCase):
    def fixture(self):
        files={name:name.encode() for name in ('operator','mac','witness','g')}
        plan={'source_sha':'a'*40,**{name+'_sha256':s.sha(raw) for name,raw in files.items()}}
        envelope={'plan':plan,'plan_sha256':s.sha(s.canonical(plan))}
        manifest={'schema':'aoe2war.r25.c.session-continuity-grant.v1','scope':s.SESSION_SCOPE,'decision':'AUTHORIZE',
            'owner_login':'Emaren','release_authority':'OWNER_ONLY_NONFINANCIAL','owner_delegated_decisions':True,
            'delegated_ai_authorship_disclosed':True,'independent_review':False,'financial_authorized':False,
            'public_cutover_authorized':False,'rollback_authorized':True,'max_uses':1,
            'issued_at':'2026-11-02T15:00:00Z','expires_at':'2026-11-02T15:10:00Z',
            'plan':plan,'plan_sha256':envelope['plan_sha256'],'exact_head_ci':{'run_id':100,'head_sha':plan['source_sha'],'all_three_jobs_success':True}}
        owner={'id':123,'html_url':'https://github.com/Emaren/app-prodn/issues/1108#issuecomment-123',
            'issue_url':'https://api.github.com/repos/Emaren/app-prodn/issues/1108','user':{'login':'Emaren','id':15059910},
            'created_at':'2026-11-02T15:00:01Z','updated_at':'2026-11-02T15:00:01Z'}
        def rebuild():
            owner['body']='R25_C_SESSION_CONTINUITY_GRANT\n```json\n'+json.dumps(manifest)+'\n```'
            return {'grant_comment':'123','grant_sha256':s.sha(owner['body'].encode())}
        payload=rebuild()
        def api(endpoint):
            if endpoint=='issues/comments/123':return owner
            if endpoint=='actions/runs/100':return {'head_sha':plan['source_sha'],'name':'AoE2WAR CI','status':'completed','conclusion':'success'}
            if endpoint.startswith('actions/runs/100/jobs'):
                return {'total_count':3,'jobs':[{'name':name,'status':'completed','conclusion':'success'} for name in
                    ('Release and documentation control plane','Type, contract, and production build','Isolated Steam-rating PostgreSQL chronology')]}
            for name,path in (('operator','r25_c_start_recovery_v8_root.py'),('mac','r25_c_start_recovery_v8_mac.py'),
                              ('witness','r25_b_session_continuity_witness_v1.py'),('g','aoe2_r25_f_g_parallel_observer.py')):
                if endpoint.startswith('contents/scripts/'+path+'?'):
                    return {'type':'file','encoding':'base64','content':base64.b64encode(files[name]).decode()}
            raise AssertionError(endpoint)
        return owner,manifest,envelope,payload,rebuild,api
    def validate(self,envelope,payload,api):
        class Clock(datetime):
            @classmethod
            def now(cls,tz=None):return cls(2026,11,2,15,1,tzinfo=timezone.utc)
        with mock.patch.object(s,'session_github',side_effect=api),mock.patch.object(s,'datetime',Clock):
            return s.session_owner_grant(payload,envelope)
    def test_real_owner_four_sources_and_three_jobs_are_required(self):
        owner,manifest,envelope,payload,rebuild,api=self.fixture()
        result=self.validate(envelope,payload,api)
        self.assertEqual(result['manifest'],manifest);self.assertEqual(result['comment_id'],123)
    def test_rejects_edited_wrong_author_expired_broad_or_changed_plan(self):
        for defect in ('edited','owner','expiry','financial','public','plan','ttl'):
            with self.subTest(defect=defect):
                owner,manifest,envelope,payload,rebuild,api=self.fixture()
                if defect=='edited':owner['updated_at']='2026-11-02T15:00:02Z'
                elif defect=='owner':owner['user']['id']=2
                elif defect=='expiry':manifest['expires_at']='2026-11-02T15:00:30Z'
                elif defect=='financial':manifest['financial_authorized']=True
                elif defect=='public':manifest['public_cutover_authorized']=True
                elif defect=='plan':manifest['plan']={**envelope['plan'],'operator_sha256':'0'*64}
                elif defect=='ttl':manifest['expires_at']='2026-11-02T15:11:00Z'
                payload=rebuild()
                with self.assertRaises(s.Hold):self.validate(envelope,payload,api)
    def test_wrong_ci_or_source_bytes_cannot_authorize(self):
        for defect in ('ci','source'):
            with self.subTest(defect=defect):
                owner,manifest,envelope,payload,rebuild,api=self.fixture()
                def wrong(endpoint):
                    result=api(endpoint)
                    if defect=='ci' and endpoint=='actions/runs/100':result['conclusion']='failure'
                    if defect=='source' and endpoint.startswith('contents/'):result['content']=base64.b64encode(b'wrong').decode()
                    return result
                with self.assertRaises(s.Hold):self.validate(envelope,payload,wrong)
    def test_existing_consumed_auth_journal_fails_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            audit=pathlib.Path(directory);nonce='1'*32;(audit/('session-repair-'+nonce)).mkdir()
            with mock.patch.object(s,'C_AUDIT',audit),mock.patch.object(s,'directory'),mock.patch.object(s.sys,'platform','linux'),\
                 mock.patch.object(s.socket,'gethostname',return_value=s.HOST),mock.patch.object(s.os,'geteuid',return_value=0),\
                 mock.patch.object(s,'session_create') as write:
                with self.assertRaisesRegex(s.Hold,'SESSION_NONCE_CONSUMED_NO_REPLAY'):s.session_plan({'nonce':nonce})
            write.assert_not_called()

if __name__=='__main__':unittest.main()
