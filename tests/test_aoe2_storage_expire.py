import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

SPEC=importlib.util.spec_from_file_location('expiry',Path(__file__).resolve().parents[1]/'scripts/aoe2_storage_expire.py')
M=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(M)

class ExpiryTest(unittest.TestCase):
    def test_archive_with_unique_database_evidence_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'manifest'
            rows=[{'path':name,'type':'file'} for name in ['source-sha','build-version','next/BUILD_ID','database.dump']]
            p.write_text('\n'.join(json.dumps(r) for r in rows))
            with self.assertRaises(RuntimeError):M.archive_namespace(p)

    def test_archive_runtime_namespace_is_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'manifest'
            rows=[{'path':name,'type':'file'} for name in ['source-sha','build-version','next/BUILD_ID','node_modules/next/index.js']]
            p.write_text('\n'.join(json.dumps(r) for r in rows))
            self.assertEqual(M.archive_namespace(p),4)

    def test_minimum_checkpoints_are_distinct_and_milestone_is_retained(self):
        hot,cold=M.select_checkpoints(['activate-20260912T063110Z-aaaaaaaaaaaa','activate-20260912T025417Z-bbbbbbbbbbbb'],
          ['activate-20260908T223055Z-cccccccccccc','activate-20260908T204051Z-dddddddddddd',
           'activate-20260905T021820Z-eeeeeeeeeeee',M.MILESTONE])
        self.assertEqual(len(hot),2);self.assertEqual(len(cold),3)
        self.assertIn(M.MILESTONE,cold)
        self.assertNotIn('activate-20260908T204051Z-dddddddddddd',cold)

    def test_missing_milestone_blocks_plan(self):
        with self.assertRaises(RuntimeError):
            M.select_checkpoints(['a','b'],['activate-20260908T223055Z-cccccccccccc'])

    def test_tree_tracks_same_size_content_change(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'file').write_bytes(b'abc');one=M.tree(p)
            (p/'file').write_bytes(b'xyz')
            self.assertNotEqual(one['identity_sha256'],M.tree(p)['identity_sha256'])

    def test_symlink_tree_is_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'real').mkdir();(p/'link').symlink_to(p/'real')
            with self.assertRaises(RuntimeError):M.tree(p/'link')

    def test_sealed_evidence_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'r.json';M.seal(p,{'original':True})
            with self.assertRaises(FileExistsError):M.seal(p,{'original':False})
            self.assertEqual(json.loads(p.read_text()),{'original':True})

    def exercise(self,change=None):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);roll=base/'rollbacks';arc=base/'archives';exp=base/'expiry'
            roll.mkdir();arc.mkdir();exp.mkdir()
            names=['activate-20260912T063110Z-aaaaaaaaaaaa','activate-20260912T025417Z-bbbbbbbbbbbb',
                   'activate-20260911T225734Z-cccccccccccc']
            for n in names:
                p=roll/n;p.mkdir();(p/'next').mkdir();(p/'next/BUILD_ID').write_text(n)
                (p/'source-sha').write_text('a'*40)
            cold=['cold1','cold2','cold3']
            for n in cold:(arc/(n+'.tar.zst')).write_bytes(b'retained')
            campaign=exp/'campaign';campaign.mkdir()
            manifest=campaign/'manifest.gz'
            obj={'generation':names[2],'path':str(roll/names[2]),'kind':'expanded','action':'EXPIRE',
                 **M.tree(roll/names[2],manifest,True),'manifest':str(manifest),'manifest_sha256':M.digest(manifest)}
            state={'runtime':{'build':'current'},'rows':[obj],'protected_hot':names[:2],'protected_cold':cold}
            lp=campaign/'ledger.json';M.seal(lp,state)
            if change=='drift':(roll/names[2]/'source-sha').write_text('b'*40)
            if change=='unknown':(roll/names[2]/'database.dump').write_text('irreplaceable')
            if change=='lost_checkpoint':(arc/'cold1.tar.zst').unlink()
            with mock.patch.multiple(M,ROLL=roll,ARCH=arc,EXPIRY=exp),mock.patch.object(M,'runtime',return_value=state['runtime']),mock.patch.object(M,'locks',return_value=[]),mock.patch.object(M,'height',side_effect=range(100,200)):
                if change:
                    with self.assertRaises(RuntimeError):M.apply_one(lp,M.digest(lp),names[2])
                    self.assertTrue((roll/names[2]).is_dir())
                    self.assertFalse((campaign/(names[2]+'.intent.json')).exists())
                else:
                    M.apply_one(lp,M.digest(lp),names[2])
                    self.assertFalse((roll/names[2]).exists())
                    self.assertTrue(all((roll/n).exists() for n in names[:2]))
                    self.assertTrue((campaign/(names[2]+'.expired.json')).is_file())

    def test_one_exact_generation_expires_and_checkpoints_survive(self):self.exercise()
    def test_content_drift_prevents_deletion(self):self.exercise('drift')
    def test_unique_data_added_to_generation_prevents_deletion(self):self.exercise('unknown')
    def test_missing_retained_checkpoint_prevents_deletion(self):self.exercise('lost_checkpoint')


    def _reuse_fixture(self,base):
        expiry=base/'expiry';expiry.mkdir()
        runtime=base/'runtime';runtime.mkdir()
        (runtime/'next').mkdir()
        (runtime/'next/BUILD_ID').write_text('build-one')
        (runtime/'source-sha').write_text('a'*40)
        (runtime/'next/app.js').write_bytes(b'content-proof')
        row={'generation':'activate-20260918T000000Z-aaaaaaaaaaaa',
             'path':str(runtime),'kind':'expanded','action':'EXPIRE',
             'source_sha':'a'*40,'build_id':'build-one'}
        inv={'schema':1,'kind':'aoe2war-lean-retention-inventory',
             'tool_sha256':'f'*64,'runtime':{'build':'current'},
             'protected_hot':[],'protected_cold':[],'rows':[row],
             'wolo_mutated':False}
        return expiry,runtime,inv

    def test_second_campaign_reuses_exact_sealed_content_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);expiry,runtime,inv=self._reuse_fixture(base)
            with mock.patch.multiple(M,EXPIRY=expiry), \
                 mock.patch.object(M,'inspect_inventory',side_effect=lambda:json.loads(json.dumps(inv))), \
                 mock.patch.object(M,'locks',return_value=[]), \
                 mock.patch.object(M,'runtime',return_value=inv['runtime']), \
                 mock.patch.object(M,'height',return_value=123):
                first=expiry/'campaign-20260919T000000Z'
                M.prepare(first)
                first_ledger=json.loads((first/'ledger.json').read_text())
                self.assertEqual(first_ledger['rows'][0]['content_proof']['mode'],'fresh_hash')
                self.assertEqual(first_ledger['content_proof_summary'],
                                 {'fresh_hash':1,'reused_sealed_manifest':0})

                second=expiry/'campaign-20260919T010000Z'
                M.prepare(second)
                second_ledger=json.loads((second/'ledger.json').read_text())
                proof=second_ledger['rows'][0]['content_proof']
                self.assertEqual(proof['mode'],'reused_sealed_manifest')
                self.assertEqual(second_ledger['content_proof_summary'],
                                 {'fresh_hash':0,'reused_sealed_manifest':1})
                self.assertEqual(proof['source_ledger'],str(first/'ledger.json'))
                self.assertEqual(
                    M.digest(second/(inv['rows'][0]['generation']+'.tree.jsonl.gz')),
                    M.digest(first/(inv['rows'][0]['generation']+'.tree.jsonl.gz')))
                self.assertFalse((second/(inv['rows'][0]['generation']+'.tree.jsonl.gz')).stat().st_mode & 0o222)

    def test_same_size_content_drift_forces_fresh_hash(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);expiry,runtime,inv=self._reuse_fixture(base)
            with mock.patch.multiple(M,EXPIRY=expiry), \
                 mock.patch.object(M,'inspect_inventory',side_effect=lambda:json.loads(json.dumps(inv))), \
                 mock.patch.object(M,'locks',return_value=[]), \
                 mock.patch.object(M,'runtime',return_value=inv['runtime']), \
                 mock.patch.object(M,'height',return_value=123):
                first=expiry/'campaign-20260919T000000Z';M.prepare(first)
                target=runtime/'next/app.js'
                before=target.read_bytes()
                target.write_bytes(b'changed-proof')
                self.assertEqual(len(before),len(target.read_bytes()))
                second=expiry/'campaign-20260919T010000Z';M.prepare(second)
                ledger=json.loads((second/'ledger.json').read_text())
                self.assertEqual(ledger['rows'][0]['content_proof']['mode'],'fresh_hash')

    def test_writable_prior_manifest_is_not_reused(self):
        with tempfile.TemporaryDirectory() as d:
            base=Path(d);expiry,runtime,inv=self._reuse_fixture(base)
            with mock.patch.multiple(M,EXPIRY=expiry), \
                 mock.patch.object(M,'inspect_inventory',side_effect=lambda:json.loads(json.dumps(inv))), \
                 mock.patch.object(M,'locks',return_value=[]), \
                 mock.patch.object(M,'runtime',return_value=inv['runtime']), \
                 mock.patch.object(M,'height',return_value=123):
                first=expiry/'campaign-20260919T000000Z';M.prepare(first)
                manifest=first/(inv['rows'][0]['generation']+'.tree.jsonl.gz')
                manifest.chmod(0o644)
                second=expiry/'campaign-20260919T010000Z';M.prepare(second)
                ledger=json.loads((second/'ledger.json').read_text())
                self.assertEqual(ledger['rows'][0]['content_proof']['mode'],'fresh_hash')


    def test_release_gate_admits_storage_expiry_as_infrastructure(self):
        gate_spec=importlib.util.spec_from_file_location(
            'release_gate',Path(__file__).resolve().parents[1]/'scripts/aoe2_release_gate.py')
        gate=importlib.util.module_from_spec(gate_spec);gate_spec.loader.exec_module(gate)
        self.assertEqual(gate.path_risk('scripts/aoe2_storage_expire.py'),'INFRASTRUCTURE')
        scope={'mode':'worktree','base_sha':'a','target_sha':'WORKTREE',
               'changed_files':['scripts/aoe2_storage_expire.py']}
        commands=gate.command_plan(scope,'INFRASTRUCTURE')
        release_tests=next(args for label,args,_ in commands if label=='active-python-test-contract')
        compile_args=next(args for label,args,_ in commands if label=='release-python-compile')
        self.assertEqual(release_tests,['python3','scripts/run_python_contract.py'])
        self.assertIn('scripts/aoe2_storage_expire.py',compile_args)

if __name__=='__main__':unittest.main()
