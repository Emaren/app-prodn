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

if __name__=='__main__':unittest.main()
