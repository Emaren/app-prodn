"""R25 C independent read-only SHA manifest and build identity witness tests."""
import hashlib,importlib.util,json,os,pathlib,tempfile,unittest
from unittest import mock
VERIFY=pathlib.Path(__file__).resolve().parents[1]/"scripts/aoe2_r25_c_stage_verify.py"
def load():
    spec=importlib.util.spec_from_file_location("r25_c_stage_verify",VERIFY)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    return m
class IndependentStageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.v=load()
    def test_01_compiles(self):compile(VERIFY.read_bytes(),str(VERIFY),"exec")
    def test_02_exact_candidate_and_archive(self):
        self.assertEqual(self.v.TARGET,"0cee3c836c4b0760478280c145e02e81e470ce0e")
        self.assertEqual(self.v.ARCHIVE_HASH,"c906c75d18ca56871bfdb9fbcdb6173e2c7643ae8f58e5f44735103c530f0101")
    def fixture(self,root):
        p=pathlib.Path(root);(p/".next").mkdir();(p/"hello").write_bytes(b"hello")
        (p/".next"/"BUILD_ID").write_text("REAL_BUILD_12345")
        (p/".aoe2war-build-version").write_text("VERSION_12345")
        rows=[]
        for f in (p/"hello",p/".next"/"BUILD_ID",p/".aoe2war-build-version"):
            raw=f.read_bytes();rows.append({"path":f.relative_to(p).as_posix(),
              "type":"file","size":len(raw),"sha256":hashlib.sha256(raw).hexdigest()})
        return p,rows
    def verify_synthetic_as_root(self, stage, rows):
        # Fixture only: GitHub runner creates files under its normal UID.
        # Production verifier continues to require st_uid == 0 for ALL files.
        real_lstat=pathlib.Path.lstat
        def fake_root_lstat(path):
            values=list(real_lstat(path))
            values[4]=0
            return os.stat_result(values)
        with mock.patch.object(self.v,"STAGE",stage):
            with mock.patch.object(pathlib.Path,"lstat",new=fake_root_lstat):
                return self.v.verify_tree(rows)
    def test_03_manifest_real_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows=self.fixture(d)
            self.assertEqual(self.verify_synthetic_as_root(p,rows),3)
    def test_04_manifest_mutation_holds(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows=self.fixture(d)
            (p/"hello").write_bytes(b"HELLO")
            with self.assertRaisesRegex(self.v.Hold,"SHA_CHANGED"):
                self.verify_synthetic_as_root(p,rows)
    def test_05_unlisted_file_holds(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows=self.fixture(d);(p/"extra").write_bytes(b"BAD")
            with self.assertRaisesRegex(self.v.Hold,"UNLISTED"):
                self.verify_synthetic_as_root(p,rows)
    def test_06_traversal_manifest_holds(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows=self.fixture(d);rows.append({"path":"../escape","type":"file","size":0,"sha256":"0"*64})
            with self.assertRaisesRegex(self.v.Hold,"BAD_MANIFEST_PATH"):
                self.verify_synthetic_as_root(p,rows)
    def test_07_duplicate_holds(self):
        with tempfile.TemporaryDirectory() as d:
            p,rows=self.fixture(d);rows.append(rows[0])
            with self.assertRaisesRegex(self.v.Hold,"BAD_MANIFEST_PATH_OR_DUPLICATE"):
                self.verify_synthetic_as_root(p,rows)
    def test_08_build_receipt_fake_status_holds(self):
        source={"status":"SOURCE_STAGED","candidate_sha":self.v.TARGET,
                "git_archive_sha256":self.v.ARCHIVE_HASH}
        built={"status":"NOT_STAGED","candidate_sha":self.v.TARGET,
               "source_git_archive_sha256":self.v.ARCHIVE_HASH}
        with self.assertRaisesRegex(self.v.Hold,"BUILD_RECEIPT_NOT_EXACT"):
            self.v.check_manifest(source,built,{})
    def test_09_no_financial_service_action(self):
        source=VERIFY.read_text()
        self.assertNotIn('systemctl","restart"',source)
        self.assertNotIn('systemctl","stop"',source)
        self.assertNotIn('systemctl","start"',source)
        self.assertNotIn("git reset --hard",source)
        self.assertNotIn("git clean",source)
    def test_10_expected_root_audit_names(self):
        s=VERIFY.read_text()
        for name in ("SOURCE_STAGED.json","BUILD_STAGED.json","BUILD_FILES.json",
                     "SOURCE_FILES.json","get-tar-commit-id","PASS_R25_C_INDEPENDENT_BUILD_STAGED"):
            self.assertIn(name,s)
if __name__=="__main__":unittest.main()
