"""R24 F isolated website activation review: no live host or financial mutation."""
import ast, importlib.util, pathlib, unittest
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=ROOT/"scripts/aoe2_r24_f_webonly_activate.py"
spec=importlib.util.spec_from_file_location("r24_f_webonly",SOURCE)
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)

class R24WebOnlyTests(unittest.TestCase):
    def policy(self):
        return {"schema":r.SCOPE_SCHEMA,"candidate_sha":r.CANDIDATE,"slot":str(r.SOURCE_DIR),
         "build_id":"TEST_Real_Build_123","build_version":"20261031123456-aabbccddee",
         "rollback_source_sha":"6be434c00469afa4acb0623715c3bcf724f927f4",
         "B_financial_noninterference":True,"C_reversible_stage":True,
         "D_webonly_policy":True,"E_capacity_and_rollback":True,
         "G_live_witness":True,
         "finance_units":["r24-synthetic-producer-%02d.service"%x for x in range(25)]}
    def test_compiles(self):
        ast.parse(SOURCE.read_text())
    def test_release_exact_source(self):
        self.assertEqual(r.CANDIDATE,"0cee3c836c4b0760478280c145e02e81e470ce0e")
    def test_original_release_lock_identity(self):
        self.assertEqual(r.LOCK_ID,(2064,6185747,1000,0o644))
    def test_scope_unsigned_missing_holds(self):
        with self.assertRaisesRegex(r.Hold,"INDEPENDENT_B_C_D_E_APPROVAL_ABSENT"):
            r.validated_policy(r.canonical(self.policy()))
    def test_scope_without_single_proof_holds_when_hash_matches(self):
        p=self.policy()
        p["B_financial_noninterference"]=False
        with mock.patch.object(r,"APPROVED_SCOPE_SHA256",r.sha(r.canonical(p))):
            with self.assertRaisesRegex(r.Hold,"POLICY_INCOMPLETE_INDEPENDENT_ADMISSION"):
                r.validated_policy(r.canonical(p))
    def test_scope_missing_finance_units_holds(self):
        p=self.policy();p["finance_units"]=[]
        with mock.patch.object(r,"APPROVED_SCOPE_SHA256",r.sha(r.canonical(p))):
            with self.assertRaisesRegex(r.Hold,"FINANCIAL_SERVICE_WATCH_INCOMPLETE"):
                r.validated_policy(r.canonical(p))
    def test_scope_positive_after_independent_seal(self):
        p=self.policy()
        with mock.patch.object(r,"APPROVED_SCOPE_SHA256",r.sha(r.canonical(p))):
            self.assertEqual(r.validated_policy(r.canonical(p))["candidate_sha"],r.CANDIDATE)
    def test_scope_duplicate_field_fail_closed(self):
        with self.assertRaises(r.Hold):
            r.load(b'{"k":0,"k":1}')
    def test_build_and_sha_not_in_deployment_version_api(self):
        text=SOURCE.read_text()
        self.assertIn('set(obj)=={"buildVersion"}',text)
        self.assertIn('"/_next/static/"+policy["build_id"]+"/_buildManifest.js"',text)
        self.assertIn('"rev-parse","HEAD"',text)
    def test_no_mutation_to_financial_systems(self):
        text=SOURCE.read_text()
        for forbidden in ("prisma migrate","db push","systemctl stop aoe2hdbets-api",
                          "git reset --hard\"","git clean\"","ssh-keygen","os.chown(LOCK"):
            self.assertNotIn(forbidden,text)
        self.assertIn("FINANCIAL_UNIT_CHANGED:",text)
        self.assertIn("WOLO_SOCKET_CHANGED",text)
    def test_root_host_guard_before_mutation(self):
        with mock.patch.object(r.socket,"gethostname",return_value="not-hel1"):
            with self.assertRaisesRegex(r.Hold,"ORIGINAL_HEL1_ROOT_REQUIRED"):
                r.activate()
    def test_real_source_artifact_required(self):
        self.assertIn("STAGED_GIT_IDENTITY",SOURCE.read_text())
        self.assertIn("STAGED_BUILD_VERSION_IDENTITY",SOURCE.read_text())
        self.assertIn("STAGED_BUILD_IDENTITY",SOURCE.read_text())
    def test_restores_original_unit_override_on_failure(self):
        text=SOURCE.read_text()
        self.assertIn("HOLD:R24_CUTOVER_FAILED_ROLLBACK_BEGIN",text)
        self.assertIn("restore(old_dropin,False)",text)
        self.assertIn("systemctl",text)
    def test_mutation_requires_nonempty_independent_scope_pin(self):
        self.assertEqual(r.APPROVED_SCOPE_SHA256,"")
if __name__=="__main__":unittest.main()
