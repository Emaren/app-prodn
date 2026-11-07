"""Protect the historical G BEFORE while accepting only native session guard v3."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("g_guard",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(g)

class V3G(unittest.TestCase):
    def test_separate_c_source_and_guard_exact_bytes(self):
        self.assertEqual(g.C_SESSION_GUARD_V3_SOURCE_SHA,"b8f690c637b0796249265e28e226f4442d1e6f9a")
        self.assertEqual(g.C_SESSION_GUARD_V3_GUARD_SHA,"192d36d75aede69e85e1d7599d58daf13d9dc96bb2aa49a15d9bd9596b8daac5")
        self.assertEqual(g.F_CANDIDATE_SESSION_V3_UNIT_SHA,"06238a9425a3ea3c47f55ec0f645f10d3a6da047c361265c80e44470df7ab437")
        self.assertNotEqual(g.C_SESSION_GUARD_V3_SOURCE_SHA,g.C_SESSION_REPAIR_SOURCE_SHA)
    def test_reject_wrong_v3_path_without_touching_files(self):
        with self.assertRaisesRegex(g.Hold,"G_C_GUARD_V3_EXACT_ROOT_PATH_REQUIRED"):
            g.runtime_lineage_v3({}, "/tmp/complete.json", "a"*64)
        with self.assertRaisesRegex(g.Hold,"G_C_GUARD_V3_EXACT_ROOT_PATH_REQUIRED"):
            g.runtime_lineage_v3({}, "/var/lib/aoe2war-r25-c-additive/session-guard-v3-short/complete.json","a"*64)
    def test_wrong_digest_fails_before_financial_or_process_witness(self):
        path="/var/lib/aoe2war-r25-c-additive/session-guard-v3-"+("a"*32)+"/complete.json"
        with mock.patch.object(g,"root_file",return_value=b'{"status":"forged"}'):
            with self.assertRaisesRegex(g.Hold,"G_C_GUARD_V3_RECEIPT_HASH_DRIFT"):
                g.runtime_lineage_v3({},path,"a"*64)
    def test_v3_receipt_never_becomes_financial_or_browser_authority(self):
        code=(ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py").read_text()
        self.assertIn('physical=namespace["c_baseline"](C_SESSION_GUARD_V3_GUARD_SHA,session=True)',code)
        self.assertIn('and rec.get("financial_authorized")is False',code)
        self.assertIn('and rec.get("public_cutover_authorized")is False',code)
        self.assertIn('GUARD_V3_MODIFIED_OLD_WEB_OR_FINANCE',code)
        self.assertIn('GUARD_V3_ORIGINAL_VS_NEW_PROCESS_LINEAGE_NOT_PROVEN',code)

if __name__=="__main__":unittest.main()
