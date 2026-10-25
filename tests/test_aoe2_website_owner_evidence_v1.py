"""Offline evidence/reconciliation tests; disposable RSA and SQLite, no live authority."""
import base64
import copy
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from datetime import timedelta
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import aoe2_website_owner_evidence_v1 as E
import aoe2_website_owner_release_v3 as A
import aoe2_website_owner_observer_v3 as O
from test_aoe2_website_owner_observer_v3 import fixture, NOW


class OwnerEvidenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.keys = tempfile.TemporaryDirectory(prefix='website-reconciliation-keys-')
        cls.addClassCleanup(cls.keys.cleanup)
        cls.private, cls.public = (Path(cls.keys.name) / p for p in ('test.key', 'owner.pem'))
        subprocess.run(['openssl','genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048',
                        '-out',str(cls.private)], capture_output=True, check=True, timeout=20)
        subprocess.run(['openssl','pkey','-in',str(cls.private),'-pubout','-out',str(cls.public)],
                       capture_output=True, check=True, timeout=10)
        cls.public.chmod(0o600)

    def sign(self, payload):
        signed = subprocess.run(['openssl','dgst','-sha256','-sign',str(self.private)],
                                input=A.canonical(payload), capture_output=True, check=True, timeout=10)
        return {'schema':3, 'policy':A.POLICY_ID, 'payload':payload,
                'signature':base64.b64encode(signed.stdout).decode('ascii')}

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='website-reconciliation-state-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.state = self.root / 'state'; self.state.mkdir(mode=0o700)
        self.before = fixture()
        self.context = {'candidate_sha': A.MAIN_SOURCE_SHA, 'previous_production_sha': A.PRODUCTION_SHA,
                        'scope_sha256':'1'*64,'controller_commit_sha':'2'*40,'operator_inventory_sha256':'3'*64,
                        'policy_source_sha256':'4'*64,'manifest_sha256':A.MANIFEST_SHA256,'gate_sha256':'5'*64,
                        'runtime_observation':self.before,'rollback':{'source_sha':A.PRODUCTION_SHA,
                        'build_id':self.before['website']['build_id']},
                        'artifact_sha256':None,'stage_receipt_sha256':None,'build_id':None}
        stage = A.issue_request(copy.deepcopy(self.context),'PRE_STAGE',state_root=self.state,
                                public_key=self.public, now=NOW, allow_test_root=True)
        A.consume_request(self.sign(stage),state_root=self.state,public_key=self.public,now=NOW,allow_test_root=True)
        staged = {'status':'STAGED','artifact_sha256':'a'*64,'staged_build_id':'prospective_BUILD_123',
                  'local_receipt_sha256':'b'*64}
        A.finish_request(stage['attempt_id'],'PRE_STAGE',staged,state_root=self.state,allow_test_root=True)
        self.context.update(artifact_sha256=staged['artifact_sha256'],stage_receipt_sha256=staged['local_receipt_sha256'],
                            build_id=staged['staged_build_id'])
        activation = A.issue_request(self.context,'PRE_ACTIVATE',state_root=self.state,public_key=self.public,
                                     now=NOW,attempt_id=stage['attempt_id'],allow_test_root=True)
        self.packet = self.sign(activation)
        A.consume_request(self.packet,state_root=self.state,public_key=self.public,now=NOW,allow_test_root=True)
        self.receipt = {'kind':'aoe2war-activation-result','status':'CERTIFIED','release_sha':A.MAIN_SOURCE_SHA,
                        'wolo_mutated':False,'active_build_id':self.context['build_id'],
                        'artifact_sha256':self.context['artifact_sha256'],'manifest_sha256':A.MANIFEST_SHA256,
                        'gate_sha256':self.context['gate_sha256'],'stage_receipt_sha256':self.context['stage_receipt_sha256'],
                        'previous_production_sha':A.PRODUCTION_SHA,'previous_build_id':self.context['rollback']['build_id']}
        self.receipt_path = self.root / 'protected-receipt.json'
        self.save_receipt()
        self.current = copy.deepcopy(self.before)
        self.current['website'].update(source_sha=A.MAIN_SOURCE_SHA, build_id=self.context['build_id'])

    def save_receipt(self):
        self.receipt_path.write_bytes(A.canonical(self.receipt))
        self.receipt_sha = hashlib.sha256(self.receipt_path.read_bytes()).hexdigest()

    def reconcile(self, current=None, **kwargs):
        return E.reconcile(self.packet,self.receipt_path,self.receipt_sha,
                           self.current if current is None else current,state_root=self.state,
                           public_key=self.public,now=kwargs.pop('now',NOW),allow_test_root=True,**kwargs)

    def event(self, data=None):
        return E.append_event(self.state,self.packet['payload']['attempt_id'],'PRE_ACTIVATE','dispatch-returned',
                              {'protected_release_result':self.receipt} if data is None else data,source_sha='2'*40)

    def test_reconcile_is_deterministic_readonly_and_does_not_complete_or_redispatch(self):
        db=self.state/'owner-v3.sqlite3'; before=db.read_bytes(); files=sorted(self.state.iterdir())
        with patch.object(A,'_connection',side_effect=AssertionError('MUTATING ledger connection')), \
             patch.object(A,'protected_dispatch',side_effect=AssertionError('SECOND dispatch')), \
             patch.object(A,'finish_request',side_effect=AssertionError('FALSE COMPLETE')):
            result=self.reconcile()
            self.assertEqual(result,self.reconcile())
        self.assertEqual(before,db.read_bytes()); self.assertEqual(files,sorted(self.state.iterdir()))
        self.assertEqual('PASS',result['WEBSITE_PROTECTED_CERTIFIED'])
        self.assertEqual('HELD',result['OWNER_FINAL_VERIFICATION_HELD_HISTORICALLY'])
        self.assertEqual('PASS',result['CURRENT_SAME_OWNER_BOUNDARY_MATCH'])
        self.assertEqual('EXPECTED_PRODUCT_ACTIVE',result['current_website'])
        self.assertEqual('CONSUMED',result['original_nonce_state'])
        self.assertTrue(result['FINANCIAL_MAINNET_NOT_AUTHORIZED'])
        self.assertFalse(result['redispatch_permitted']); self.assertFalse(result['observation_independent'])

    def test_historical_expired_signature_never_becomes_a_current_permit(self):
        later=NOW+timedelta(days=1)
        current=copy.deepcopy(self.current)
        for key in ('observed_at','collection_finished_at'): current[key]=A.stamp(later)
        current['collection_started_at']=A.stamp(later-timedelta(seconds=4))
        self.assertEqual('PASS',self.reconcile(current,now=later)['CURRENT_SAME_OWNER_BOUNDARY_MATCH'])
        with self.assertRaisesRegex(A.Hold,'consumed'):
            A.consume_request(self.packet,state_root=self.state,public_key=self.public,now=later,allow_test_root=True)

    def test_missing_engine_receipt_is_uncertain_never_confirmed(self):
        value=E.reconcile(self.packet,None,None,self.current,state_root=self.state,
                          public_key=self.public,now=NOW,allow_test_root=True)
        self.assertEqual('UNKNOWN',value['WEBSITE_PROTECTED_CERTIFIED'])
        self.assertEqual('CONSUMED',value['original_nonce_state'])
        self.assertFalse(value['redispatch_permitted'])

    def test_rollback_and_unknown_build_are_distinct_from_expected_active(self):
        self.assertEqual('ROLLBACK_ACTIVE',self.reconcile(self.before)['current_website'])
        current=copy.deepcopy(self.current); current['website']['build_id']='different_BUILD_123'
        self.assertEqual('UNKNOWN',self.reconcile(current)['current_website'])

    def test_receipt_checksum_and_exact_owner_lineage_cannot_be_forged(self):
        for field in ('release_sha','active_build_id','artifact_sha256','manifest_sha256','stage_receipt_sha256',
                      'gate_sha256','previous_production_sha','previous_build_id','status','wolo_mutated'):
            with self.subTest(field=field):
                saved=copy.deepcopy(self.receipt); self.receipt[field]='forged'; self.save_receipt()
                with self.assertRaises(A.Hold): self.reconcile()
                self.receipt=saved; self.save_receipt()
        self.receipt_path.write_text('{}')
        with self.assertRaisesRegex(A.Hold,'checksum'): self.reconcile()

    def test_packet_identity_and_real_signature_are_required(self):
        original=self.packet['signature']; self.packet['signature']=base64.b64encode(b'x'*256).decode()
        with self.assertRaises(A.Hold): self.reconcile()
        self.packet['signature']=original
        self.packet['payload']['context']['build_id']='forged_BUILD_123'
        with self.assertRaises(A.Hold): self.reconcile()

    def test_stale_current_or_invalid_runtime_is_hold_even_after_certified_engine(self):
        result=self.reconcile(now=NOW+timedelta(seconds=91))
        self.assertEqual('UNKNOWN',result['CURRENT_SAME_OWNER_BOUNDARY_MATCH'])
        self.assertEqual('PASS',result['WEBSITE_PROTECTED_CERTIFIED'])
        self.assertIsNotNone(result['current_observation_error'])
        for mutation in ('pid','exe','source','timer','config'):
            current=copy.deepcopy(self.current); immutable=current['immutable']
            if mutation=='pid':
                immutable['wolo8092']['pid']+=10
                immutable['financial_units'][O.WOLO_SERVICES['wolo8092']]['MainPID']+=10
            elif mutation=='exe': immutable['consensus']['exe_sha256']='c'*64
            elif mutation=='source': immutable['wolo_source_sha']='c'*40
            elif mutation=='timer': immutable['financial_units'][O.TIMER_FAMILIES[0]+'.timer']['ActiveState']='inactive'
            else: immutable['unit_config_sha256'][O.UNITS[0]]='d'*64
            with self.subTest(mutation=mutation):
                result=self.reconcile(current)
                self.assertIn(result['CURRENT_SAME_OWNER_BOUNDARY_MATCH'],('FAIL','UNKNOWN'))
                self.assertFalse(result['redispatch_permitted'])

    def test_only_existing_timed_one_shot_transient_fields_are_ignored(self):
        current=copy.deepcopy(self.current)
        current['immutable']['financial_units'][O.TIMER_FAMILIES[0]+'.service'].update(
            ActiveState='active',SubState='running',MainPID=222)
        self.assertEqual('PASS',self.reconcile(current)['CURRENT_SAME_OWNER_BOUNDARY_MATCH'])
        current['immutable']['unit_config_sha256'][O.TIMER_FAMILIES[0]+'.service']='d'*64
        self.assertEqual('FAIL',self.reconcile(current)['CURRENT_SAME_OWNER_BOUNDARY_MATCH'])

    def test_append_events_are_private_immutable_idempotent_and_bounded(self):
        first=self.event(); paths=list(self.state.rglob('event-*.json'))
        self.assertEqual(1,len(paths)); raw=paths[0].read_bytes()
        self.assertEqual(first,self.event()); self.assertEqual(raw,paths[0].read_bytes())
        self.assertEqual(0o600,paths[0].stat().st_mode & 0o777)
        self.assertEqual(0o700,paths[0].parent.stat().st_mode & 0o777)
        self.assertFalse(list(self.state.rglob('.pending-*')))
        with self.assertRaises(A.Hold): self.event({'oversized':'x'*E.MAX_BYTES})
        paths[0].write_bytes(b'corrupt')
        with self.assertRaisesRegex(A.Hold,'immutable'): self.event()
        self.assertEqual(b'corrupt',paths[0].read_bytes())

    def test_linked_evidence_directories_and_event_files_fail_closed(self):
        outside=self.root/'outside'; outside.mkdir(mode=0o700)
        (self.state/'evidence-v1').symlink_to(outside,target_is_directory=True)
        with self.assertRaises(OSError): self.event()
        self.assertEqual([],list(outside.iterdir()))

    def test_complete_event_survives_abrupt_process_exit(self):
        script="""import os,sys,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from aoe2_website_owner_evidence_v1 import append_event
append_event(Path(sys.argv[2]),sys.argv[3],'PRE_ACTIVATE','dispatch-returned',{'status':'CERTIFIED'},source_sha='2'*40)
os._exit(23)
"""
        child=subprocess.run([sys.executable,'-c',script,str(Path(E.__file__).parent),str(self.state),
                              self.packet['payload']['attempt_id']],capture_output=True,timeout=10)
        self.assertEqual(23,child.returncode,child.stderr.decode())
        paths=list(self.state.rglob('event-*.json')); self.assertEqual(1,len(paths))
        self.assertEqual({'status':'CERTIFIED'},json.loads(paths[0].read_bytes())['data'])

    def test_evidence_code_and_tests_are_infrastructure(self):
        from aoe2_release_gate import path_risk
        for path in ('scripts/aoe2_website_owner_evidence_v1.py','tests/test_aoe2_website_owner_evidence_v1.py'):
            self.assertEqual('INFRASTRUCTURE',path_risk(path))


if __name__=='__main__': unittest.main()
