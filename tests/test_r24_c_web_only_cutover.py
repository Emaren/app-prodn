"""R24 C isolated website-only activation + owner Mac source-pin tests."""
import importlib.util
import json
from pathlib import Path
import tempfile
import types
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]/"scripts"
WORKER=ROOT/"aoe2_r24_c_web_only_cutover.py"
MAC=ROOT/"aoe2_r24_c_web_only_mac.py"

def load(p):
    spec=importlib.util.spec_from_file_location(p.stem,p)
    m=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m

class R24CWebsiteOnlyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.w=load(WORKER)
        cls.m=load(MAC)
    def approval(self):
        return {
            "schema":"aoe2war.r24.web-only.approved.v1",
            "candidate_sha":self.w.CANDIDATE,
            "previous_sha":"a2b941f154fdc31ec4d6c4ece6d0e49036c48abd",
            "candidate_build_id":"genuine-build-id-from-stage",
            "candidate_build_version":"r24-stage-certified",
            "stage_artifact_sha256":"a"*64,
            "stage_dependencies_sha256":"b"*64,
            "stage_receipt_sha256":"c"*64,
            "min_free_bytes":3*1024**3,
            "financial_units":["r24-finance-%02d.service"%n for n in range(25)],
            "financial_unit_records_sha256":"d"*64,
            "reviews":{"B":"b"*40,"F":"f"*40,
                       **self.w.REVIEWED_LANE_SOURCE},
            "policy_scope":"NONFINANCIAL_WEB_ONLY_NO_MIGRATIONS_NO_PRODUCERS",
            "rollback_verified":True,
        }
    def test_01_both_compile(self):
        for p in (WORKER,MAC):
            compile(p.read_bytes(),str(p),"exec")
    def test_02_exact_candidate(self):
        self.assertEqual(self.w.CANDIDATE,"0cee3c836c4b0760478280c145e02e81e470ce0e")
    def test_03_complete_f_review_accepted(self):
        # ONLY synthetic fixture for pure schema validation; production pins
        # remain empty until B proves a real read-only host and F approves it.
        with mock.patch.object(self.w,"B_RUNTIME_FINANCE_APPROVED_SHA","b"*40):
            with mock.patch.object(self.w,"F_INTEGRATION_APPROVED_SHA","f"*40):
                self.w.verify_review(self.approval())
    def test_04_missing_B_review_holds(self):
        a=self.approval();del a["reviews"]["B"]
        with self.assertRaisesRegex(self.w.Hold,"SIX_LANE_REVIEWS"):
            self.w.verify_review(a)
    def test_05_fake_unscoped_policy_holds(self):
        a=self.approval();a["policy_scope"]="DEPLOY_AND_SETTLE"
        with self.assertRaisesRegex(self.w.Hold,"WRONG_OR_UNAUTHORIZED_POLICY"):
            self.w.verify_review(a)
    def test_06_zero_free_floor_holds(self):
        a=self.approval();a["min_free_bytes"]=0
        with self.assertRaisesRegex(self.w.Hold,"E_MIN_FREE"):
            self.w.verify_review(a)
    def test_07_wrong_exact_release_holds(self):
        a=self.approval();a["candidate_sha"]="f"*40
        with self.assertRaisesRegex(self.w.Hold,"WRONG_OR_UNAUTHORIZED_POLICY"):
            self.w.verify_review(a)
    def test_08_too_few_protected_unit_identities_holds(self):
        a=self.approval();a["financial_units"]=["only.service"]
        with self.assertRaisesRegex(self.w.Hold,"B_FINANCIAL_UNIT"):
            self.w.verify_review(a)
    def test_09_duplicate_financial_unit_holds(self):
        a=self.approval();a["financial_units"]=["x.service"]*25
        with self.assertRaisesRegex(self.w.Hold,"B_FINANCIAL_UNIT"):
            self.w.verify_review(a)
    def test_10_unreviewed_stage_hash_holds(self):
        a=self.approval();a["stage_artifact_sha256"]="not-a-hash"
        with self.assertRaisesRegex(self.w.Hold,"EXACT_REVIEWED_HASH"):
            self.w.verify_review(a)
    def test_11_duplicate_approval_keys_holds(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"bad.json";p.write_text('{"scope":1,"scope":2}')
            with self.assertRaisesRegex(self.w.Hold,"DUPLICATE_APPROVAL_FIELD"):
                self.w.json_read(p)
    def test_12_release_uses_original_root_lock_and_no_hard_reset(self):
        src=WORKER.read_text()
        self.assertIn("fcntl.LOCK_EX|fcntl.LOCK_NB",src)
        self.assertIn('os.rename(oldnext,REPO/".next")',src)
        self.assertIn('run_as_tony_git("switch","--detach"',src)
        self.assertNotIn("reset --hard",src)
        self.assertNotIn("git clean",src)
        self.assertNotIn("ssh-keygen",src)
        self.assertNotIn("prisma migrate",src)
    def test_13_early_no_root_state_no_cutover(self):
        with mock.patch.object(self.w,"preflight",side_effect=self.w.Hold("PRECHECK")):
            with mock.patch.object(self.w,"run") as cmd:
                with self.assertRaisesRegex(self.w.Hold,"PRECHECK"):
                    self.w.cutover(self.approval())
                cmd.assert_not_called()
    def test_14_mac_refuses_non_mac_before_ssh(self):
        with mock.patch.object(self.m.sys,"platform","linux"):
            with mock.patch.object(self.m.subprocess,"run") as cmd:
                with self.assertRaisesRegex(self.m.Hold,"OWNER_MAC_NONROOT"):
                    self.m.launch("/nonexistent","a"*40,"b"*64,"build-1")
                cmd.assert_not_called()
    def test_15_finance_snapshot_identity_must_match(self):
        with self.assertRaisesRegex(self.w.Hold,"FINANCIAL_OR_WOLO"):
            self.w.compare_protected(({"a":1},{"8092":"old"}),({"a":2},{"8092":"new"}))
    def test_16_root_approval_dir_is_required_and_explicit(self):
        src=WORKER.read_text()
        self.assertIn("ROOT_PROTECTED_R24_RECEIPTS_DIR_NOT_PROVISIONED",src)
        self.assertIn("UNPROTECTED_REVIEW_APPROVAL",src)
        self.assertIn("OWNER_BUILD_ID_NOT_APPROVED",src)
    def test_17_manual_rollback_is_separately_scoped(self):
        src=WORKER.read_text()
        self.assertIn("def rollback_committed(",src)
        self.assertIn("ROLLBACK_ALREADY_ATTEMPTED",src)
        self.assertIn("PASS:R24_MANUAL_ROLLBACK_PREVIOUS_WEB_AND_FINANCE_VERIFIED",src)
        self.assertIn('ops.add_argument("--rollback"',src)
    def test_18_deterministic_archive_hash(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/"x").write_bytes(b"ONE")
            a=self.w.hash_tree(p)
            self.assertEqual(len(a),64)
            self.assertEqual(a,self.w.hash_tree(p))
            (p/"x").write_bytes(b"TWO")
            self.assertNotEqual(a,self.w.hash_tree(p))
    def test_19_stage_approval_requires_rollback_verification(self):
        a=self.approval();a["rollback_verified"]=False
        with self.assertRaisesRegex(self.w.Hold,"WRONG_OR_UNAUTHORIZED_POLICY"):
            self.w.verify_review(a)

if __name__=="__main__":
    unittest.main()
