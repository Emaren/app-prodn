"""R25 E P0 append-only old Next copy: executable adversarial fixture tests."""
import importlib.util
import json
import os
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace
import tempfile
import unittest

SOURCE=Path(__file__).resolve().parents[1]/'scripts/aoe2_r25_e_durable_old_next_copy.py'
spec=importlib.util.spec_from_file_location('r25_e_copy',SOURCE)
e=importlib.util.module_from_spec(spec);spec.loader.exec_module(e)
REAL_GUARD=e.guarded_directory
CAMPAIGN='r25-e-20261031T120001Z-0123456789abcdefabcd'

class CopyContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.old=self.root/'original/.next'; self.old.mkdir(parents=True)
        (self.old/'BUILD_ID').write_text(e.OLD_BUILD_ID+'\n')
        (self.old/'server').mkdir(); (self.old/'server/index.js').write_bytes(b'old-live-server-v1')
        (self.old/'cache').mkdir(); (self.old/'cache/data.bin').write_bytes(b'old-cache')
        self.volume=self.root/'volume';self.rollbacks=self.volume/'aoe2war/rollbacks'
        self.rollbacks.mkdir(parents=True)
        self.dev=self.root.stat().st_dev
        self.original=e.old_identity
        self.process={'pid':e.OLD_PID,'start_ticks':1234,'3030':True,'wolo_8092_8093':True}
        self.patches=[patch.object(e,'OLD_NEXT',self.old),patch.object(e,'VOLUME',self.volume),
            patch.object(e,'ROLLBACKS',self.rollbacks),
            patch.object(e,'prerequisites',return_value=(self.dev,self.dev)),
            patch.object(e,'EXPECTED_DEST_UID',os.geteuid()),
            patch.object(e,'old_identity',return_value=self.process),
            patch.object(e,'capacity',return_value={
                'old_next_allocated_bytes':32768,'old_next_apparent_bytes':512,
                'copy_budget_bytes':536870912,'attached_free_before_bytes':21*e.GIB,
                'root_free_before_bytes':59*e.GIB,'reserve_bytes':e.RESERVE}),
            patch.object(e,'guarded_directory',side_effect=self.guard_fixture)]
        for p in self.patches:p.start();self.addCleanup(p.stop)
    def guard_fixture(self,path,device,owner=None):
        return REAL_GUARD(path,device,owner=None)
    def plan(self):return e.create_plan()
    def run_copy(self):return e.perform_copy(CAMPAIGN,e.plan_authorization_sha(self.plan()))
    def dir(self):return self.rollbacks/CAMPAIGN
    def test_01_plan_non_mutating(self):
        p=self.plan()
        self.assertEqual(p['old_build_id'],e.OLD_BUILD_ID)
        self.assertEqual(p['original_pid_start_ticks'],1234)
        self.assertFalse(p['mutations_authorized'])
        self.assertEqual(list(self.rollbacks.iterdir()),[])
    def test_02_complete_copy_and_readback(self):
        r=self.run_copy()
        self.assertEqual(r['status'],'COPY_VERIFIED_NOT_RECOVERY_READY')
        self.assertTrue((self.dir()/'prior-next/server/index.js').exists())
        self.assertEqual((self.dir()/'prior-next/cache/data.bin').read_bytes(),b'old-cache')
        self.assertEqual(r['source_content_sha256'],r['readback_content_sha256'])
        self.assertEqual(r['old_build_id'],e.OLD_BUILD_ID)
        self.assertEqual(r['source_entries'],5)
        self.assertFalse(r['release_authorized'])
    def test_03_one_use_never_reuses_campaign(self):
        self.run_copy()
        with self.assertRaises(FileExistsError):self.run_copy()
        self.assertTrue((self.dir()/'COPY_VERIFIED.json').exists())
    def test_04_newly_named_campaign_only(self):
        with self.assertRaisesRegex(e.Hold,'NEW_CAMPAIGN_NAME_INVALID'):
            e.perform_copy('../escape',e.digest(self.plan()))
    def test_05_wrong_plan_sha_does_not_create(self):
        with self.assertRaisesRegex(e.Hold,'OWNER_APPROVED_PLAN_DRIFT'):
            e.perform_copy(CAMPAIGN,'0'*64)
        self.assertFalse(self.dir().exists())
    def test_06_bad_plan_sha_format(self):
        with self.assertRaisesRegex(e.Hold,'EXACT_PLAN_SHA256_REQUIRED'):
            e.perform_copy(CAMPAIGN,'junk')
    def test_07_old_build_changed_holds_plan(self):
        (self.old/'BUILD_ID').write_text('wrong\n')
        with self.assertRaisesRegex(e.Hold,'OLD_NEXT_BUILD_ID_DRIFT'):self.plan()
    def test_08_original_pid_missing_holds(self):
        with patch.object(e,'old_identity',side_effect=e.Hold('PID_DRIFT')):
            with self.assertRaisesRegex(e.Hold,'PID_DRIFT'):self.plan()
    def test_09_symlink_source_denied(self):
        (self.old/'server/link').symlink_to('/etc/passwd')
        with self.assertRaisesRegex(e.Hold,'TREE_SYMLINK'):self.plan()
    def test_10_hardlink_source_denied(self):
        os.link(self.old/'server/index.js',self.old/'server/second.js')
        with self.assertRaisesRegex(e.Hold,'TREE_SYMLINK_HARDLINK'):self.plan()
    def test_11_fifo_source_denied(self):
        os.mkfifo(self.old/'server/pipe')
        with self.assertRaisesRegex(e.Hold,'TREE_SYMLINK'):self.plan()
    def test_12_source_file_budget(self):
        with patch.object(e,'MAX_TREE_BYTES',4):
            with self.assertRaisesRegex(e.Hold,'TREE_LOGICAL_BYTES_LIMIT'):self.plan()
    def test_13_source_entry_budget(self):
        with patch.object(e,'MAX_TREE_ENTRIES',1):
            with self.assertRaisesRegex(e.Hold,'TREE_ENTRY_LIMIT'):self.plan()
    def test_14_source_depth_budget(self):
        with patch.object(e,'MAX_DEPTH',0):
            with self.assertRaisesRegex(e.Hold,'TREE_DEPTH_LIMIT'):self.plan()
    def test_15_partial_copy_retained_if_source_changes(self):
        old=e.copy_tree
        def changing(*args):
            r=old(*args)
            (self.old/'cache/data.bin').write_bytes(b'cache-mutated-mid-copy')
            return r
        with patch.object(e,'copy_tree',side_effect=changing):
            with self.assertRaisesRegex(e.Hold,'OLD_NEXT_CHANGED_DURING_COPY'):self.run_copy()
        self.assertTrue((self.dir()/'COPY_ENTERED.json').exists())
        self.assertTrue((self.dir()/'COPY_HOLD.json').exists())
        self.assertFalse((self.dir()/'COPY_VERIFIED.json').exists())
    def test_16_failed_destination_readback_retains_partial(self):
        original=e.tree_scan
        def tamper(root,device,meta):
            if root==self.dir()/'prior-next':
                (root/'cache/data.bin').write_bytes(b'tamper')
            return original(root,device,meta)
        with patch.object(e,'tree_scan',side_effect=tamper):
            with self.assertRaisesRegex(e.Hold,'FULL_DESTINATION_READBACK_MISMATCH'):
                self.run_copy()
        self.assertTrue((self.dir()/'COPY_HOLD.json').exists())
        self.assertFalse((self.dir()/'COPY_VERIFIED.json').exists())
    def test_17_pid_changes_after_copy_holds(self):
        old=e.old_identity
        count=[0]
        def change():
            count[0]+=1
            if count[0]>5:return dict(self.process,start_ticks=999)
            return dict(self.process)
        with patch.object(e,'old_identity',side_effect=change):
            with self.assertRaisesRegex(e.Hold,'ORIGINAL_WEB_DRIFT_DURING_COPY'):
                self.run_copy()
        self.assertTrue((self.dir()/'COPY_HOLD.json').exists())
    def test_18_hardlink_destination_refused_if_introduced(self):
        old=e.copy_tree
        def malicious(*args):
            r=old(*args)
            path=self.dir()/'prior-next/cache/data.bin'
            os.link(path,self.dir()/'prior-next/cache/other-link')
            return r
        with patch.object(e,'copy_tree',side_effect=malicious):
            with self.assertRaisesRegex(e.Hold,'TREE_SYMLINK_HARDLINK'):
                self.run_copy()
        self.assertFalse((self.dir()/'COPY_VERIFIED.json').exists())
    def test_19_relative_path_content_hash_sensitive(self):
        a=self.plan()['source_content_sha256']
        (self.old/'server/index.js').rename(self.old/'server/renamed.js')
        self.assertNotEqual(self.plan()['source_content_sha256'],a)
    def test_20_metadata_hash_catches_mode_changes(self):
        a=self.plan();p=self.old/'server/index.js'
        p.chmod(0o700)
        b=self.plan()
        self.assertEqual(a['source_content_sha256'],b['source_content_sha256'])
        self.assertNotEqual(a['source_metadata_sha256'],b['source_metadata_sha256'])
    def test_21_durable_dirs_and_files_root_private_modes(self):
        self.run_copy()
        self.assertEqual(self.dir().stat().st_mode&0o777,0o700)
        self.assertEqual((self.dir()/'prior-next').stat().st_mode&0o777,0o700)
        self.assertEqual((self.dir()/'prior-next/BUILD_ID').stat().st_mode&0o777,0o600)
        self.assertEqual((self.dir()/'COPY_VERIFIED.json').stat().st_mode&0o777,0o600)
    def test_22_complete_file_and_dir_sync(self):
        with patch.object(e.os,'fsync',wraps=os.fsync) as sync:
            self.run_copy()
            self.assertGreater(sync.call_count,5)
    def test_23_no_automatic_delete_or_service_mutation(self):
        source=SOURCE.read_text()
        for banned in ('shutil.rmtree','systemctl stop','systemctl restart','systemctl start',
                       'os.unlink(', 'os.remove(', 'os.rmdir(', 'rsync --delete', 'subprocess.Popen'):
            self.assertNotIn(banned,source)
    def test_24_separate_device_mandatory(self):
        with patch.object(e,'prerequisites',side_effect=e.Hold('DIFFERENT_ATTACHED_DEVICE_REQUIRED')):
            with self.assertRaisesRegex(e.Hold,'DIFFERENT_ATTACHED_DEVICE_REQUIRED'):self.plan()
    def test_25_root_plan_do_not_accept_copy_args(self):
        with patch.object(e,'create_plan'):
            self.assertEqual(e.main(['--phase','plan','--campaign',CAMPAIGN]),2)
    def test_26_source_snapshot_metadata_is_write_sensitive(self):
        p=self.plan()
        (self.old/'cache/data.bin').write_bytes(b'changed')
        with self.assertRaisesRegex(e.Hold,'OWNER_APPROVED_PLAN_DRIFT_BEFORE_WRITE'):
            e.perform_copy(CAMPAIGN,e.plan_authorization_sha(p))
        self.assertFalse(self.dir().exists())
    def test_27_preexisting_campaign_symlink_wont_follow(self):
        self.dir().symlink_to(self.root, target_is_directory=True)
        with self.assertRaises(FileExistsError):self.run_copy()
    def test_28_ensure_receipt_no_release_grant(self):
        r=self.run_copy()
        self.assertTrue(r['independent_E_readonly_witness_required'])
        self.assertFalse(r['rollback_exercised'])
        self.assertEqual(json.loads((self.dir()/'COPY_VERIFIED.json').read_text())['receipt_sha256'],r['receipt_sha256'])
    def test_29_ensure_source_and_destination_bytes_immutable(self):
        old=(self.old/'server/index.js').read_bytes()
        self.run_copy()
        self.assertEqual((self.old/'server/index.js').read_bytes(),old)
        self.assertEqual((self.dir()/'prior-next/server/index.js').read_bytes(),old)

    def test_30_full_source_restore_metadata_receipt(self):
        r=self.run_copy()
        info=json.loads((self.dir()/'COPY_SOURCE_METADATA.json').read_text())
        self.assertEqual(info['source_content_sha256'],r['source_content_sha256'])
        self.assertEqual(info['source_metadata_sha256'],r['source_metadata_sha256'])
        self.assertEqual(e.digest(info),r['source_restore_metadata_receipt_sha256'])
        self.assertTrue(any(x['path']=='server/index.js' and x['metadata']['uid']==os.geteuid()
                            for x in info['entries']))
    def test_31_post_copy_reserve_failure_keeps_partial(self):
        real=e.os.statvfs
        def low(path):
            if path==self.volume:return SimpleNamespace(f_bavail=0,f_frsize=4096)
            return real(path)
        with patch.object(e.os,'statvfs',side_effect=low):
            with self.assertRaisesRegex(e.Hold,'AFTER_COPY_4G_RESERVE_VIOLATED'):
                self.run_copy()
        self.assertTrue((self.dir()/'COPY_HOLD.json').exists())
        self.assertFalse((self.dir()/'COPY_VERIFIED.json').exists())
    def test_32_free_space_drift_not_source_identity_drift(self):
        plan=self.plan(); changed=json.loads(json.dumps(plan))
        changed['capacity']['attached_free_before_bytes']-=4096
        changed['capacity']['root_free_before_bytes']-=8192
        self.assertEqual(e.plan_authorization_sha(plan),e.plan_authorization_sha(changed))
    def test_33_internal_directory_symlink_denied(self):
        (self.old/'cache').rename(self.old/'cache-real')
        (self.old/'cache').symlink_to(self.old/'cache-real',target_is_directory=True)
        with self.assertRaisesRegex(e.Hold,'TREE_SYMLINK'):self.plan()
    def test_34_metadata_source_mutated_after_plan_before_first_write(self):
        plan=self.plan()
        (self.old/'server/index.js').chmod(0o700)
        with self.assertRaisesRegex(e.Hold,'OWNER_APPROVED_PLAN_DRIFT_BEFORE_WRITE'):
            e.perform_copy(CAMPAIGN,e.plan_authorization_sha(plan))
        self.assertFalse(self.dir().exists())

if __name__=='__main__':unittest.main()
