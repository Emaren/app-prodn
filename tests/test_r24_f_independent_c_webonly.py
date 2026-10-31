"""Independent F gate for C's R24 cutover: no syntax-only fake approvals."""
import ast,importlib.util,pathlib,unittest
from unittest import mock
R=pathlib.Path(__file__).resolve().parents[1]
C=R/"scripts/aoe2_r24_c_web_only_cutover.py"
M=R/"scripts/aoe2_r24_c_web_only_mac.py"
def load(p):
    x=importlib.util.spec_from_file_location(p.stem,p)
    m=importlib.util.module_from_spec(x);x.loader.exec_module(m)
    return m
class FIndependentR24(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.c=load(C)
    def payload(self):
        c=self.c
        return dict(schema="aoe2war.r24.web-only.approved.v1",
            candidate_sha=c.CANDIDATE, previous_sha="a2b941f154fdc31ec4d6c4ece6d0e49036c48abd",
            candidate_build_id="genuine-synthetic-build-id",
            candidate_build_version="genuine-synthetic-app-version",
            stage_artifact_sha256="a"*64,stage_dependencies_sha256="b"*64,
            stage_receipt_sha256="c"*64,min_free_bytes=4*1024**3,
            financial_units=["r24-test-finance-%02d.service"%i for i in range(25)],
            financial_unit_records_sha256="d"*64,
            reviews={"B":"b"*40,"F":"f"*40,**c.REVIEWED_LANE_SOURCE},
            policy_scope="NONFINANCIAL_WEB_ONLY_NO_MIGRATIONS_NO_PRODUCERS",
            rollback_verified=True)
    def test_compile(self):
        ast.parse(C.read_text());ast.parse(M.read_text())
    def test_website_source_exact(self):
        self.assertEqual(self.c.CANDIDATE,"0cee3c836c4b0760478280c145e02e81e470ce0e")
    def test_no_fake_B_approval(self):
        self.assertEqual(self.c.B_RUNTIME_FINANCE_APPROVED_SHA,"")
        with self.assertRaisesRegex(self.c.Hold,"B_RUNTIME_FINANCIAL_ISOLATION_NOT_APPROVED"):
            self.c.verify_review(self.payload())
    def test_no_fake_F_approval(self):
        with mock.patch.object(self.c,"B_RUNTIME_FINANCE_APPROVED_SHA","b"*40):
            with self.assertRaisesRegex(self.c.Hold,"F_SOURCE_AND_STAGE_RELEASE_POLICY_NOT_APPROVED"):
                self.c.verify_review(self.payload())
    def test_wrong_D_source_not_accepted(self):
        with mock.patch.object(self.c,"B_RUNTIME_FINANCE_APPROVED_SHA","b"*40):
            with mock.patch.object(self.c,"F_INTEGRATION_APPROVED_SHA","f"*40):
                a=self.payload();a["reviews"]["D"]="e"*40
                with self.assertRaisesRegex(self.c.Hold,"REVIEWED_SOURCE_DRIFT:D"):
                    self.c.verify_review(a)
    def test_synthetic_approved_pure_shape(self):
        with mock.patch.object(self.c,"B_RUNTIME_FINANCE_APPROVED_SHA","b"*40):
            with mock.patch.object(self.c,"F_INTEGRATION_APPROVED_SHA","f"*40):
                self.c.verify_review(self.payload())
    def test_old_rsa_and_global_fd200_unchanged(self):
        self.assertEqual(self.c.LOCK_ID,(2064,6185747,1000,0o644))
        self.assertIn("ORIGINAL_RELEASE_LOCK_DRIFT",C.read_text())
        self.assertNotIn("ssh-keygen",C.read_text())
        self.assertNotIn("reset --hard",C.read_text())
    def test_staging_must_exist_and_be_hashed(self):
        source=C.read_text()
        for token in ("F_STAGE_RECEIPT_MISSING_OR_UNPINNED",
            "STAGED_ARTIFACT_DIGEST_MISMATCH","STAGED_DEPENDENCIES_DIGEST_MISMATCH",
            "NEW_WEB_INTERNAL_OR_PUBLIC_BUILD_VERSION_UNVERIFIED"):
            self.assertIn(token,source)
    def test_financial_service_and_wolo_integrity(self):
        s=C.read_text()
        self.assertIn("FINANCIAL_OR_WOLO_PROCESS_IDENTITY_CHANGED",s)
        self.assertIn("PROTECTED_BOUNDARY_CHANGED_BEFORE_CUTOVER",s)
    def test_owner_mac_consent_has_independent_signing_domain(self):
        s=M.read_text()
        self.assertIn('with open("/dev/tty","w")',s)
        self.assertIn('with open("/dev/tty","r")',s)
        self.assertIn("StrictHostKeyChecking=yes",s)
        self.assertIn("F_APPROVED_EXACT_SOURCE_SHA256_MISMATCH",s)
if __name__=="__main__":unittest.main()
