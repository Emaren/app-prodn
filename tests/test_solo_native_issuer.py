"""Adversarial source-only contract tests. No live service / keys / finance."""
import importlib.util
import fcntl
import os
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).resolve().parents[1] / 'scripts/aoe2_solo_website_native_issuer.py'
spec = importlib.util.spec_from_file_location('issuer_review', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

CANDIDATE = 'b46a51f1592c9f296839924ae55e722618b10d35'
ATTEMPT = 'a' * 64
WHEN = '2026-10-30T23:34:00Z'

class NativeIssuerAdversarialTests(unittest.TestCase):
    def test_exact_abi_and_class_inventory(self):
        self.assertEqual(m.CLASSES, ('doctor','recovery','finance','host','source','stage'))
        self.assertEqual(m.PHASES, ('PRE_STAGE','PRE_ACTIVATE','POST_ACTIVATE','POST_ROLLBACK'))
        self.assertEqual(len(m.CLASSES_RECOVERY), 6)

    def test_owner_lease_requires_real_fd200(self):
        with mock.patch.object(m.os, 'fstat', side_effect=OSError('no lease')):
            with self.assertRaisesRegex(m.Hold, 'MISSING_ORIGINAL_FD200'):
                m.original_lease()

    def test_kernel_fd_lock_absent_rejected_even_with_same_inode(self):
        with tempfile.TemporaryDirectory() as td:
            lock = Path(td) / "release.lock"
            lock.write_bytes(b"lock")
            fd = os.open(lock, os.O_RDONLY)
            try:
                with self.assertRaisesRegex(m.Hold, "FD200_DOES_NOT_OWN_KERNEL_FLOCK"):
                    m.assert_fd_owns_exclusive_flock(fd, lock)
            finally:
                os.close(fd)

    def test_kernel_fd_lock_owned_and_other_ofd_contended(self):
        with tempfile.TemporaryDirectory() as td:
            lock = Path(td) / "release.lock"
            lock.write_bytes(b"lock")
            fd = os.open(lock, os.O_RDWR)
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertTrue(m.assert_fd_owns_exclusive_flock(fd, lock))
                fcntl.flock(fd, fcntl.LOCK_UN)
                with self.assertRaisesRegex(m.Hold, "FD200_DOES_NOT_OWN_KERNEL_FLOCK"):
                    m.assert_fd_owns_exclusive_flock(fd, lock)
            finally:
                os.close(fd)

    def test_other_process_or_fd_holds_lock_not_substitute_for_fd200(self):
        with tempfile.TemporaryDirectory() as td:
            lock = Path(td) / "release.lock"
            lock.write_bytes(b"lock")
            holder = os.open(lock, os.O_RDWR)
            impostor = os.open(lock, os.O_RDONLY)
            try:
                fcntl.flock(holder, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaisesRegex(m.Hold, "FD200_DOES_NOT_OWN_KERNEL_FLOCK"):
                    m.assert_fd_owns_exclusive_flock(impostor, lock)
            finally:
                os.close(impostor)
                os.close(holder)

    def test_source_timestamp_and_phase_replay(self):
        from datetime import datetime, timezone
        with tempfile.TemporaryDirectory() as td:
            base=Path(td)
            folder=base/ATTEMPT/'POST_ACTIVATE';folder.mkdir(parents=True)
            for role in m.CLASSES:
                payload={'candidate_sha':CANDIDATE,'phase':'POST_ACTIVATE','attempt_id':ATTEMPT,
                         'producer':role,'host':m.HOST,'observed_at':WHEN,
                         'content_sha256':m.sha(m.canonical({'x':1}))}
                (folder/(role+'.json')).write_text(json.dumps({'schema':'aoe2war.solo.native-issuer-input.v1',
                    'class':role,'section':{'x':1},'receipt':{'payload':payload,'signature_base64':'BOGUS'}}))
            now=datetime(2026,10,30,23,34,30,tzinfo=timezone.utc)
            with mock.patch.object(m, 'BASE', base), mock.patch.object(m, 'read_object', side_effect=lambda p,l:json.loads(p.read_text())):
                with self.assertRaisesRegex(m.Hold, 'PRODUCER_SECTION_NOT_BOUND'):
                    m.phase_evidence(CANDIDATE,'POST_ACTIVATE',ATTEMPT,now=now)

    def test_no_success_on_missing_producer(self):
        with tempfile.TemporaryDirectory() as td:
            with mock.patch.object(m,'BASE',Path(td)):
                with self.assertRaises(FileNotFoundError):
                    m.phase_evidence(CANDIDATE,'PRE_STAGE',ATTEMPT)

    def test_fail_closed_before_any_observation_without_original_lease(self):
        with mock.patch.object(m,'original_lease',side_effect=m.Hold('NO_FD200')), \
             mock.patch.object(m,'live_snapshot',side_effect=AssertionError('must not inspect')):
            with self.assertRaisesRegex(m.Hold,'NO_FD200'):
                m.assemble(CANDIDATE,'PRE_STAGE',ATTEMPT,'pre-phase')

    def test_duplicate_enrolled_producer_spki_rejected(self):
        key='1'*64
        trust={c:{'public_key_path':'/etc/aoe2war/'+c+'.pem',
                  'public_spki_sha256':key} for c in m.CLASSES}
        with mock.patch.object(m,'secure_bytes',return_value=b'fixture'):
            with self.assertRaisesRegex(m.Hold, 'PRODUCER_KEY_ROLE_REUSE'):
                m.distinct_signers(trust)

    def test_unenrolled_trust_and_outside_scope_rejected(self):
        with self.assertRaisesRegex(m.Hold,'SIX_ENROLLED_KEYS_REQUIRED'):
            m.distinct_signers({'doctor':{}})
        trust={c:{'public_key_path':'/tmp/'+c+'.pem','public_spki_sha256':format(i,'064x')}
               for i,c in enumerate(m.CLASSES,1)}
        with self.assertRaisesRegex(m.Hold,'PRODUCER_KEY_ROLE_REUSE_OR_SCOPE'):
            m.distinct_signers(trust)

    def test_recovery_requires_six_real_signed_chains(self):
        with self.assertRaisesRegex(m.Hold,'SIX_PHYSICAL_RESTORES_MISSING'):
            m.check_recovery({'status':'UNKNOWN'},None)
        rec={'status':'PHYSICALLY_ACCEPTED','isolated_restored_classes':sorted(m.CLASSES_RECOVERY),
             'different_physical_restore_host':True}
        with self.assertRaisesRegex(m.Hold,'SIX_INDEPENDENT_SIGNED_RESTORE_CHAINS_ABSENT'):
            m.check_recovery(rec,None)
        rec['signed_restore_chains']={k:[{}, {}, {}] for k in m.CLASSES_RECOVERY}
        with self.assertRaisesRegex(m.Hold,'C_RESTORE_RECEIPT_VERIFIER_NOT_INSTALLED'):
            m.check_recovery(rec,None)

    def test_recovery_rejects_receiver_source_digest_mismatch(self):
        label='APP_DB'
        chains={k:[{'payload':{'role':'source','protected_class':k,'campaign_id':'camp-1',
                 'cohort_id':'cohort-1','sequence':1,'ciphertext_sha256':'0'*64,
                 'source_sha256':'1'*64,'source_bytes':128,'ciphertext_bytes':256,
                 'source_failure_domain_id':'device-a'}},
                {'payload':{'role':'receiver','campaign_id':'camp-1','cohort_id':'cohort-1',
                 'sequence':1,'ciphertext_sha256':'0'*64,'readback_sha256':'2'*64,
                 'bytes_received':256,'source_receipt_sha256':'3'*64,
                 'receiver_failure_domain_id':'device-b'}},
                {'payload':{'role':'restore','campaign_id':'camp-1','cohort_id':'cohort-1',
                 'sequence':1,'receiver_receipt_sha256':'4'*64,'restored_bytes':128,
                 'restored_source_sha256':'1'*64,'restore_failure_domain_id':'device-c'}}]
                for k in m.CLASSES_RECOVERY}
        rec={'status':'PHYSICALLY_ACCEPTED','isolated_restored_classes':sorted(m.CLASSES_RECOVERY),
             'different_physical_restore_host':True,'signed_restore_chains':chains}
        class FakeVerifier:
            @staticmethod
            def load_trust():return {'root':'synthetic-test-only'}
            @staticmethod
            def validate_envelope(env,trust):return env['payload'],'4'*64
        with self.assertRaisesRegex(m.Hold,'RESTORE_WITNESS_LINK_OR_DOMAIN_CONFLICT'):
            m.check_recovery(rec, FakeVerifier)

    def test_w1_financial_read_wakeup_is_not_inert(self):
        fake=mock.Mock(REQUIRED_UNITS={str(i) for i in range(25)})
        fake.verify_writer_census.return_value={'units':{str(i):{} for i in range(25)},
             'discovery':{'coverage':'CLOSED_WORLD_VERIFIED',**{x:[] for x in
             ('unresolved_writers','unclassified_financial_jobs','unknown_http_effects',
              'unmapped_external_ingress','unaccounted_pids','incomplete_units')}}}
        fake.verify_closed_graph.return_value={'edges':[['GET','writer']]}
        with mock.patch.object(m,'verify_current_systemd',return_value=True):
            with self.assertRaisesRegex(m.Hold,'W1_PUBLIC_GET_PREWARM_FINANCIAL_WRITER_REACHABLE'):
                m.classify_financial({}, {'candidate_sha':CANDIDATE,
                   'read_side_effect_policy':{'GET':'FINANCIAL_WRITER_REACHABLE_NO_READ_ONLY_CLAIM'}},fake)

    def test_census_requires_25_systemd_and_non_systemd(self):
        fake=mock.Mock(REQUIRED_UNITS={str(i) for i in range(25)})
        fake.verify_writer_census.return_value={'units':{str(i):{} for i in range(25)},
          'discovery':{'coverage':'CLOSED_WORLD_VERIFIED',**{x:[] for x in
          ('unresolved_writers','unclassified_financial_jobs','unknown_http_effects',
           'unmapped_external_ingress','unaccounted_pids','incomplete_units')}}}
        fake.verify_writer_census.return_value['discovery']['unmapped_external_ingress']=['cron-malicious']
        with self.assertRaisesRegex(m.Hold,'UNACCOUNTED_FINANCIAL_INGRESS'):
            m.classify_financial({}, {'candidate_sha':'f'*40},fake)

    def test_idle_oneshot_signed_pid_zero_without_fake_process(self):
        names={'aoe2hdbets-staking-rewards.service'}
        census={'units':{name:{'state':'inactive','main_pid':0,
                  'start_time_ticks':0,'executable_sha256':None} for name in names}}
        output='Id=aoe2hdbets-staking-rewards.service\nActiveState=inactive\nMainPID=0\n'
        fake=mock.Mock(returncode=0,stdout=output)
        with mock.patch.object(m.subprocess,'run',return_value=fake):
            self.assertTrue(m.verify_current_systemd(census,None))
        census['units']['aoe2hdbets-staking-rewards.service']['executable_sha256']='0'*64
        with mock.patch.object(m.subprocess,'run',return_value=fake):
            with self.assertRaisesRegex(m.Hold,'IDLE_ONESHOT_FICTITIOUS_PROCESS'):
                m.verify_current_systemd(census,None)

    def test_systemd_live_snapshot_wrong_pid_or_missing_unit_holds(self):
        name='wolochain-settlement.service'
        census={'units':{name:{'state':'active','main_pid':10001}}}
        fake=mock.Mock(returncode=0,stdout=f'Id={name}\nActiveState=active\nMainPID=10002\n')
        with mock.patch.object(m.subprocess,'run',return_value=fake):
            with self.assertRaisesRegex(m.Hold,'SYSTEMD_PID_OR_STATE_DRIFT'):
                m.verify_current_systemd(census,None)
        fake.stdout='Id=unknown.service\nActiveState=active\nMainPID=10001\n'
        with mock.patch.object(m.subprocess,'run',return_value=fake):
            with self.assertRaisesRegex(m.Hold,'SYSTEMD_UNEXPECTED_OR_INCOMPLETE_UNIT'):
                m.verify_current_systemd(census,None)

    def test_no_fabricated_stage_and_root_sealed_stage_required(self):
        with self.assertRaisesRegex(m.Hold,'PRE_STAGE_INVENTED_ARTIFACT'):
            m.verify_durable_stage({'status':'STAGED','receipt':{}},'PRE_STAGE',ATTEMPT,CANDIDATE,'pre-phase')
        stage={'status':'STAGED','origin':'HEL1_DURABLE_PROTECTED_STORE',
               'receipt_sha256':'a'*64,'receipt':{'release_sha':CANDIDATE},'release_sha':CANDIDATE}
        with mock.patch.object(m,'read_object',side_effect=FileNotFoundError('no original')):
            with self.assertRaises(FileNotFoundError):
                m.verify_durable_stage(stage,'PRE_ACTIVATE',ATTEMPT,CANDIDATE,'pre-phase')

    def test_stage_or_rollback_native_drift(self):
        live={'host':m.HOST,'mount':str(m.VOLUME),'mounted':True,'mount_device':2064,
              'free_bytes':40*2**30,'effective_used_pct':80.0,'finish_used_pct':81.0,
              'source_sha':'a'*40,'active_build_id':'old'}
        report={'mount':{**live,'rollback_sha256':'0'*64},
                'rollback':{'previous_source_sha':'a'*40,'active_build_id':'old'}}
        with self.assertRaisesRegex(m.Hold,'ROLLBACK_SOURCE_BUILD_PROVENANCE_DRIFT'):
            m.reconcile_live(report,live)
        report['mount']['rollback_sha256']=m.sha(m.canonical(report['rollback']))
        m.reconcile_live(report,live)
        report['mount']['free_bytes']-=128*2**20
        with self.assertRaisesRegex(m.Hold,'SIGNED_CAPACITY_DRIFT'):
            m.reconcile_live(report,live)

    def test_no_green_from_status_observation(self):
        live={'mounted':True,'mount_device':2064,'free_bytes':123,
              'effective_used_pct':98,'finish_used_pct':99,
              'active_build_id':'abc','source_sha':'f'*40}
        with mock.patch.object(m,'live_snapshot',return_value=live):
            status=m.status()
        self.assertEqual(status['status'],'OBSERVATION_ONLY_NOT_ADMITTED')
        self.assertEqual(status['doctor'],'UNKNOWN')
        self.assertFalse(status['signed_producers'])
        self.assertFalse(status['financial_movement_authorized'])
        self.assertFalse(status['release_authorized'])

    def test_native_status_cannot_mix_release_phase(self):
        with mock.patch.object(m,'environment',return_value=None):
            self.assertEqual(m.main(['--read-only','--status-only','--candidate',CANDIDATE]),2)

if __name__=='__main__':
    unittest.main()
