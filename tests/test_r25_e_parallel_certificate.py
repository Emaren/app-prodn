"""R25 E source/BUILD/RECOVERY state machine and fail-closed negative cases."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1]/'scripts/aoe2_r25_e_parallel_certificate.py'
spec = importlib.util.spec_from_file_location('r25_e', SCRIPT)
e = importlib.util.module_from_spec(spec)
spec.loader.exec_module(e)
REAL_ARCHIVE_IDENTITY=e.archive_identity
REAL_ROOT_SEALED=e.root_sealed

class R25EParallelCertificate(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.web = self.home/'web'
        self.web.mkdir()
        self.old = self.web/'.next'
        self.old.mkdir()
        (self.old/'BUILD_ID').write_text('OLD_BUILD_ABC123')
        (self.old/'important.bin').write_bytes(b'real old next content')
        self.vol = self.home/'mnt-volume'
        self.vol.mkdir()
        self.durable = self.vol/'aoe2war/rollbacks'
        self.durable.mkdir(parents=True)
        self.stagebase = self.home/'staging'
        self.stagebase.mkdir()
        self.stage = self.stagebase/'app-prodn-r24-w1safe-0cee3c836c4b'
        self.audit = self.home/'aoe2war-r25-c-additive'
        self.audit.mkdir()
        self.archivebase = self.home/'source-bundles'
        self.archivebase.mkdir()
        self.archive = self.archivebase/(e.SOURCE+'.tar')
        self.dev = self.web.stat().st_dev
        self.args = SimpleNamespace(candidate_max_bytes=8*e.GIB,
                                    expected_old_pid=2625090,
                                    durable_next=None,
                                    require_phase='RECOVERY_READY')
        self.patches = [patch.object(e, 'OLD_WEB', self.web),
                        patch.object(e, 'VOLUME', self.vol),
                        patch.object(e, 'DURABLE', self.durable),
                        patch.object(e, 'STAGED', self.stage),
                        patch.object(e, 'C_AUDIT', self.audit),
                        patch.object(e, 'read_root_receipt', side_effect=self.read_fixture_receipt),
                        patch.object(e, 'ARCHIVE', self.archive),
                        patch.object(e, 'host_devices',return_value=(self.dev,self.dev)),
                        patch.object(e,'old_process',return_value={
                            'mainpid':2625090,'active':True,'proc_start_ticks':12345}),
                        patch.object(e,'archive_identity',return_value={
                            'sha256':e.ARCHIVE_SHA256,'embedded_git_commit':e.SOURCE}),
                        patch.object(e, 'disk_free',side_effect=lambda p: 61*e.GIB),
                        patch.object(e, 'root_sealed',return_value=True)]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)

    def read_fixture_receipt(self, path, dev, limit=65536):
        raw=path.read_bytes()
        return json.loads(raw),e.hashlib.sha256(raw).hexdigest()

    def built_stage(self):
        p = self.stage/'.next/server'
        p.mkdir(parents=True)
        (self.stage/'.next/BUILD_ID').write_text('NEW_BUILD_DEF456')
        (self.stage/'node_modules/next').mkdir(parents=True)
        (self.stage/'node_modules/next/package.json').write_text('{"name":"next"}')
        (self.stage/'package.json').write_text('{"name":"aoe2war"}')
        (self.stage/'r24-source-sha').write_text(e.SOURCE+'\n')
        (self.stage/'.aoe2war-build-version').write_text('NEW_VERSION_DEF456')
        source={'status':'SOURCE_STAGED','candidate_sha':e.SOURCE,
                'git_archive_sha256':e.ARCHIVE_SHA256,'old_web_mainpid':2625090,
                'old_web_untouched':True,'new_candidate_started':False}
        build={'schema':'aoe2war.r25.c.full-built-artifact.v1',
               'status':'BUILD_STAGED','candidate_sha':e.SOURCE,
               'source_git_archive_sha256':e.ARCHIVE_SHA256,
               'build_id':'NEW_BUILD_DEF456','build_version':'NEW_VERSION_DEF456',
               'tree_sha256':'a'*64,'root_sealed':True,'old_web_pid_untouched':2625090,
               'new_service_started':False,'financial_writes_authorized':False}
        (self.audit/'SOURCE_STAGED.json').write_text(json.dumps(source))
        (self.audit/'BUILD_STAGED.json').write_text(json.dumps(build))

    def copied_old(self):
        dest = self.durable/'R25-campaign/prior-next'
        dest.mkdir(parents=True)
        for f in self.old.iterdir():
            shutil.copy2(f,dest/f.name)
        self.args.durable_next=str(dest)
        return dest

    def test_c_compile_stage_contract_is_var_www_sibling(self):
        self.assertEqual(str(e.STAGED), str(self.stage))
        # Runtime site path explicitly differs from old .next, preventing in-place swaps.
        self.assertNotEqual(self.stage, self.web)
        self.assertNotEqual(self.stage, self.old)

    def test_real_source_bundle_only_is_source_staged(self):
        r=e.certify(self.args)
        self.assertEqual(r['phase'], 'SOURCE_STAGED')
        self.assertIsNone(r['candidate'])
        self.assertEqual(r['root']['required_free_bytes'],20*e.GIB)
        self.assertEqual(r['storage_admission'],'PASS_E_READONLY_CAPACITY')
        self.assertFalse(r['release_authorized'])
        self.assertEqual(len(r['certificate_sha256']),64)
        self.assertGreater(r['volume']['old_next_copy_budget_bytes'],512*1024**2)

    def test_partial_c_stage_cannot_claim_build(self):
        self.stage.mkdir(parents=True)
        (self.stage/'package.json').write_text('{}')
        r=e.certify(self.args)
        self.assertEqual(r['phase'], 'SOURCE_STAGED')
        self.assertFalse(r['candidate']['build_complete'])

    def test_built_stage_has_distinct_identity_but_not_recovery(self):
        self.built_stage()
        r=e.certify(self.args)
        self.assertEqual(r['phase'],'BUILD_STAGED')
        self.assertEqual(r['candidate']['candidate_next_build_id'],'NEW_BUILD_DEF456')
        self.assertEqual(r['root']['required_free_bytes'],4*e.GIB)
        self.assertFalse(r['source_to_build_binding_proved'])
        self.assertTrue(r['c_receipt_source_to_build_binding_checked'])
        self.assertFalse(r['candidate_financial_isolation_proved'])

    def test_verified_external_byte_copy_gives_recovery_ready(self):
        self.built_stage()
        dest=self.copied_old()
        r=e.certify(self.args)
        self.assertEqual(r['phase'],'RECOVERY_READY')
        self.assertTrue(r['durable_rollback']['content_matched'])
        self.assertEqual(r['volume']['required_free_bytes'],4*e.GIB)
        self.assertFalse(r['durable_rollback']['rollback_exercised'])
        self.assertEqual(r['old_web']['process_pre_and_post']['mainpid'],2625090)

    def test_durable_content_one_byte_tamper_holds(self):
        self.built_stage()
        dest=self.copied_old()
        (dest/'important.bin').write_bytes(b'real old next contenT')
        with self.assertRaisesRegex(e.Hold,'DURABLE_BYTES_OR_PATH_MISMATCH'):
            e.certify(self.args)

    def test_durable_matching_build_id_not_enough(self):
        self.built_stage()
        dest=self.copied_old()
        (dest/'important.bin').unlink()
        with self.assertRaisesRegex(e.Hold,'DURABLE_BYTES_OR_PATH_MISMATCH'):
            e.certify(self.args)

    def test_symlinked_rollback_is_not_durable(self):
        self.built_stage()
        dest=self.copied_old()
        (dest/'important.bin').unlink()
        (dest/'important.bin').symlink_to(self.old/'important.bin')
        with self.assertRaisesRegex(e.Hold,'TREE_SYMLINK_OR_SPECIAL_FILE'):
            e.certify(self.args)

    def test_rollback_outside_approved_volume_rejected(self):
        self.built_stage()
        self.args.durable_next=str(self.web/'.next')
        with self.assertRaisesRegex(e.Hold,'UNAPPROVED_PATH'):
            e.certify(self.args)

    def test_symlinked_runtime_modules_denied(self):
        self.built_stage()
        (self.stage/'node_modules/next/package.json').unlink()
        (self.stage/'node_modules/next/package.json').symlink_to(self.old/'BUILD_ID')
        with self.assertRaisesRegex(e.Hold,'DEPENDENCY_SYMLINK_ESCAPES_STAGE'):
            e.certify(self.args)

    def test_pnpm_internal_dependency_link_is_accepted(self):
        self.built_stage()
        deps=self.stage/'node_modules'
        real_next=deps/'.pnpm/next-package/node_modules/next'
        real_next.mkdir(parents=True)
        (real_next/'package.json').write_text('{"name":"next"}')
        shutil.rmtree(deps/'next')
        (deps/'next').symlink_to(real_next.relative_to(deps).as_posix())
        r=e.certify(self.args)
        self.assertEqual(r['phase'],'BUILD_STAGED')

    def test_full_build_without_c_receipt_is_not_admitted(self):
        self.built_stage()
        (self.audit/'BUILD_STAGED.json').unlink()
        with self.assertRaises(FileNotFoundError):
            e.certify(self.args)

    def test_forged_c_build_receipt_build_id_holds(self):
        self.built_stage()
        file=self.audit/'BUILD_STAGED.json'
        value=json.loads(file.read_text());value['build_id']='WRONG_BUILD_XYZ999'
        file.write_text(json.dumps(value))
        with self.assertRaisesRegex(e.Hold,'C_BUILD_RECEIPT_WRONG'):
            e.certify(self.args)

    def test_forged_c_build_receipt_source_holds(self):
        self.built_stage()
        file=self.audit/'SOURCE_STAGED.json'
        value=json.loads(file.read_text());value['git_archive_sha256']='0'*64
        file.write_text(json.dumps(value))
        with self.assertRaisesRegex(e.Hold,'C_SOURCE_RECEIPT_WRONG'):
            e.certify(self.args)

    def test_full_build_without_c_sidecar_is_not_admitted(self):
        self.built_stage()
        (self.stage/'r24-source-sha').unlink()
        with self.assertRaises(FileNotFoundError):
            e.certify(self.args)

    def test_root_volume_headroom_both_independent(self):
        with patch.object(e,'disk_free',side_effect=[21*e.GIB,3*e.GIB]):
            r=e.certify(self.args)
        self.assertEqual(r['storage_admission'],'HOLD_E_CAPACITY')
        with patch.object(e,'disk_free',side_effect=[19*e.GIB,21*e.GIB]):
            r=e.certify(self.args)
        self.assertEqual(r['storage_admission'],'HOLD_E_CAPACITY')

    def test_old_mainpid_change_during_witness_fails(self):
        with patch.object(e,'old_process',side_effect=[
            {'mainpid':2625090,'active':True,'proc_start_ticks':12345},
            {'mainpid':2625090,'active':True,'proc_start_ticks':12346}]):
            with self.assertRaisesRegex(e.Hold,'OLD_PROCESS_RESTARTED_DURING_WITNESS'):
                e.certify(self.args)

    def test_excess_budget_and_oversize_stage_fail(self):
        self.args.candidate_max_bytes=9*e.GIB
        with self.assertRaisesRegex(e.Hold,'BUDGET_OUTSIDE_8G_MAX'):
            e.certify(self.args)
        self.args.candidate_max_bytes=1
        self.built_stage()
        with self.assertRaisesRegex(e.Hold,'STAGE_EXCEEDS_APPROVED_PEAK_BUDGET'):
            e.certify(self.args)

    def test_file_digest_and_tamper(self):
        data=self.home/'bytes.bin'
        data.write_bytes(b'abc')
        self.assertEqual(e.hash_file(data,1024),
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
        data.write_bytes(b'abd')
        self.assertNotEqual(e.hash_file(data,1024),
          'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')

    def test_unmodified_git_archive_commit_binding(self):
        repo=self.home/'source'
        repo.mkdir()
        def git(*args):
            return subprocess.check_output(['git','-C',str(repo),*args],stderr=subprocess.DEVNULL).decode().strip()
        git('init')
        git('config','user.name','E Tests')
        git('config','user.email','e@example.invalid')
        (repo/'README').write_text('test source artifact')
        git('add','README')
        git('commit','-m','artifact witness')
        commit=git('rev-parse','HEAD')
        with open(self.archive,'wb') as f:
            subprocess.run(['git','-C',str(repo),'archive','--format=tar',commit],stdout=f,check=True)
        digest=e.hash_file(self.archive,20*1024**2)
        with patch.object(e,'SOURCE',commit),patch.object(e,'ARCHIVE_SHA256',digest),\
             patch.object(e,'ARCHIVE_BYTES',self.archive.stat().st_size),\
             patch.object(e,'archive_identity',REAL_ARCHIVE_IDENTITY),\
             patch.object(e,'secure_path',return_value=True):
            evidence=e.archive_identity()
            self.assertEqual(evidence['embedded_git_commit'],commit)
            with patch.object(e,'ARCHIVE_SHA256','0'*64):
                with self.assertRaisesRegex(e.Hold,'ARCHIVE_SHA256_MISMATCH'):
                    e.archive_identity()

    def test_real_root_seal_rejects_nonroot_and_group_writable(self):
        real=REAL_ROOT_SEALED
        with patch.object(e,'root_sealed',real):
            with patch.object(e.os,'lstat',return_value=SimpleNamespace(st_uid=1000,st_mode=0o644)):
                self.assertFalse(real(self.stage))
            with patch.object(e.os,'lstat',return_value=SimpleNamespace(st_uid=0,st_mode=0o664)):
                self.assertFalse(real(self.stage))
            with patch.object(e.os,'lstat',return_value=SimpleNamespace(st_uid=0,st_mode=0o644)):
                self.assertTrue(real(self.stage))

    def test_no_side_effect_code_paths(self):
        s=SCRIPT.read_text()
        for forbidden in ('git reset','git clean','os.remove(', 'os.unlink(',
                          'shutil.rmtree(', 'systemctl restart','systemctl stop',
                          'pg_dump','psql','sudo ', 'open(ARCHIVE, \'wb\''):
            self.assertNotIn(forbidden,s)

if __name__ == '__main__':
    unittest.main()
