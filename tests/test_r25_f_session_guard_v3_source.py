"""F's v3 guard-source admission never treats root-local code as approval."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/aoe2_r24_f_parallel_nginx_cutover.py"
SPEC=importlib.util.spec_from_file_location("f_v3",PATH)
f=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(f)

class V3(unittest.TestCase):
    def test_exact_guard_and_reviewer_pins(self):
        self.assertEqual(f.C_SESSION_GUARD_V3_SOURCE_SHA,
                         "b8f690c637b0796249265e28e226f4442d1e6f9a")
        self.assertEqual(f.C_SESSION_GUARD_V3_GUARD_SHA,
                         "192d36d75aede69e85e1d7599d58daf13d9dc96bb2aa49a15d9bd9596b8daac5")
        text=PATH.read_text()
        self.assertIn('reread_c_session_guard_v3()',text)
        self.assertIn('observed==after',text)
        self.assertIn('reread_c_session_guard_v3()==RUNTIME_REQUALIFICATION["candidate_after"]',text)
        self.assertIn('owner.get("created_at")==owner.get("updated_at")',text)
    def test_untrusted_root_paths_never_skip_v3_proof(self):
        with self.assertRaisesRegex(f.Hold,"C_GUARD_V3_SEALED_ROOT_RECEIPT_PATH_REQUIRED"):
            f.qualified_runtime_v3({}, "/tmp/complete.json", "a"*64)
        with self.assertRaisesRegex(f.Hold,"C_GUARD_V3_SEALED_ROOT_RECEIPT_PATH_REQUIRED"):
            f.qualified_runtime_v3({}, "/var/lib/aoe2war-r25-c-additive/session-guard-v3-aaaa/complete.json","a"*64)
    def test_missing_root_receipt_cannot_claim_deployment(self):
        path="/var/lib/aoe2war-r25-c-additive/session-guard-v3-"+("a"*32)+"/complete.json"
        with mock.patch.object(f,"root_file",side_effect=f.Hold("ROOT_RECEIPT_UNAVAILABLE")):
            with self.assertRaisesRegex(f.Hold,"ROOT_RECEIPT_UNAVAILABLE"):
                f.qualified_runtime_v3({},path,"a"*64)

if __name__=="__main__": unittest.main()
