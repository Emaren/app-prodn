"""R24 E website capacity/rollback negative and positive tests; no HEL1 mutation."""
import importlib.util
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC=importlib.util.spec_from_file_location(
    "e_r24",Path(__file__).resolve().parents[1]/"scripts"/"aoe2_r24_website_capacity.py")
m=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(m)

class R24WebsiteCapacity(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.web=self.root/"web";self.web.mkdir()
        self.vol=self.root/"volume";self.vol.mkdir()
        self.old=self.web/".next";self.old.mkdir()
        self.durable=self.vol/"aoe2war"/"rollbacks"
        self.durable.mkdir(parents=True)
        (self.old/"BUILD_ID").write_text("PREVIOUS_NEXT_BUILD_ID_20261031")
        (self.old/"trace.bin").write_bytes(b"A"*16384)
        self.dev=self.web.stat().st_dev
        self.patches=[patch.object(m,"WEB",self.web),
            patch.object(m,"VOLUME",self.vol),
            patch.object(m,"DURABLE",self.durable),
            patch.object(m,"check_host",return_value=(self.dev,self.dev))]
        for p in self.patches:p.start();self.addCleanup(p.stop)

    def test_capacity_two_filesystems_plus_reserves(self):
        a=SimpleNamespace(candidate_max_bytes=m.GIB,stage="plan")
        with patch.object(m,"free_bytes",side_effect=[8*m.GIB,8*m.GIB]):
            r=m.examine(a)
        self.assertEqual(r["storage_verdict"],
                         "PASS_STORAGE_FEASIBILITY_NOT_RELEASE_AUTHORIZATION")
        self.assertEqual(r["root_min_needed_bytes"],6*m.GIB)
        self.assertEqual(r["volume_min_needed_bytes"],
                         m.durable_copy_bytes(self.old)+4*m.GIB)
        self.assertFalse(r["rollback_content_verified"])
        self.assertFalse(r["release_authorized"])

    def test_root_or_volume_space_hold(self):
        a=SimpleNamespace(candidate_max_bytes=m.GIB,stage="plan")
        with patch.object(m,"free_bytes",side_effect=[8*m.GIB,3*m.GIB]):
            self.assertEqual(m.examine(a)["storage_verdict"],
                             "HOLD_STORAGE_FEASIBILITY")
        with patch.object(m,"free_bytes",side_effect=[5*m.GIB,8*m.GIB]):
            self.assertEqual(m.examine(a)["storage_verdict"],
                             "HOLD_STORAGE_FEASIBILITY")

    def test_post_stage_parallel_full_runtime_and_next_build_id(self):
        runtime=self.web.parent/"app-prodn-r24-w1safe-test"
        p=runtime/".next";p.mkdir(parents=True)
        (p/"BUILD_ID").write_text("CANDIDATE_BUILD_123456")
        (p/"chunk.js").write_bytes(b"abc")
        (runtime/"node_modules").mkdir()
        (runtime/"node_modules"/"runtime.js").write_bytes(b"dep")
        args=SimpleNamespace(candidate_max_bytes=m.GIB,stage="post-stage",
                             parallel_dir=str(runtime))
        with patch.object(m,"free_bytes",side_effect=[5*m.GIB,8*m.GIB]):
            r=m.examine(args)
        self.assertEqual(r["staged_candidate"]["next_build_id"],"CANDIDATE_BUILD_123456")
        self.assertTrue(r["staged_candidate"]["legacy_website_must_remain_running"])
        self.assertEqual(r["staged_candidate"]["allocated_bytes"],m.allocated_bytes(runtime))
        self.assertEqual(r["root_min_needed_bytes"],4*m.GIB)
        self.assertEqual(r["parallel_financial_worker_disabled"],
                         "NOT_VERIFIED_BY_STORAGE_TOOL")
        with patch.object(m,"free_bytes",side_effect=[5*m.GIB,8*m.GIB]):
            with self.assertRaises(m.Hold):
                m.examine(SimpleNamespace(candidate_max_bytes=1,stage="post-stage",
                                           parallel_dir=str(runtime)))

    def test_live_checkout_or_inplace_stage_cannot_count_as_parallel(self):
        stage=self.web/".next-release";stage.mkdir()
        (stage/"BUILD_ID").write_text("IMPROPER_INPLACE_1234")
        for wrong in (self.web,stage,self.root):
            with self.subTest(wrong=str(wrong)):
                args=SimpleNamespace(candidate_max_bytes=m.GIB,stage="post-stage",
                                     parallel_dir=str(wrong))
                with patch.object(m,"free_bytes",side_effect=[5*m.GIB,8*m.GIB]):
                    with self.assertRaises(m.Hold):m.examine(args)

    def test_full_durable_match_and_one_byte_tamper(self):
        dest=self.durable/"transaction"/"prior-next";dest.mkdir(parents=True)
        (dest/"BUILD_ID").write_bytes((self.old/"BUILD_ID").read_bytes())
        (dest/"trace.bin").write_bytes((self.old/"trace.bin").read_bytes())
        r=m.compare_rollback(str(dest))
        self.assertEqual(r["status"],
                         "PASS_DURABLE_COPY_CONTENT_MATCH_NOT_ROLLBACK_EXERCISE")
        self.assertEqual(r["old_content"],r["durable_content"])
        (dest/"trace.bin").write_bytes(b"tampered")
        with self.assertRaises(m.Hold):m.compare_rollback(str(dest))

    def test_wrong_build_and_outside_path_hold(self):
        dest=self.durable/"wrong";dest.mkdir()
        (dest/"BUILD_ID").write_text("SOME_OTHER_BUILD_ID")
        with self.assertRaises(m.Hold):m.compare_rollback(str(dest))
        with self.assertRaises(m.Hold):m.compare_rollback(str(self.web))

    def test_symlink_snapshot_cannot_be_independent_rollback(self):
        dest=self.durable/"symlinked";dest.mkdir()
        (dest/"BUILD_ID").write_bytes((self.old/"BUILD_ID").read_bytes())
        (dest/"trace.bin").symlink_to(self.old/"trace.bin")
        with self.assertRaises(m.Hold):m.compare_rollback(str(dest))

    def test_oversized_candidate_and_bad_ancestor_hold(self):
        with self.assertRaises(m.Hold):
            m.examine(SimpleNamespace(candidate_max_bytes=9*m.GIB,stage="plan"))
        with self.assertRaises(m.Hold):
            m.guard_directory(self.root,self.web,self.dev)

    def test_absolute_dotdot_escape_is_rejected_before_read(self):
        dangerous=self.durable/".."/".."/"traffic-db"
        with self.assertRaises(m.Hold):
            m.guard_directory(dangerous,self.vol,self.dev)
        with self.assertRaises(m.Hold):
            m.compare_rollback(str(dangerous))

    def test_sparse_source_requires_full_logical_copy_budget(self):
        sparse=self.old/"sparse.bin"
        with open(sparse,"wb") as out:
            out.truncate(32*1024**2)
        actual=m.allocated_bytes(self.old)
        budget=m.durable_copy_bytes(self.old)
        self.assertGreater(budget,actual+32*1024**2)
        self.assertGreater(budget,512*1024**2)

    def test_no_service_or_finance_mutation_ops(self):
        source=Path(m.__file__).read_text()
        for bad in ("resize2fs","sudo ","os.remove(","os.unlink(",
                    "shutil.rmtree(","git reset","git clean",
                    "systemctl restart","subprocess.Popen("):
            self.assertNotIn(bad,source)

if __name__=="__main__":unittest.main()
