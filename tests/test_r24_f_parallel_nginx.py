"""R24 F parallel original web preserving nginx-only switch: tests only."""
import ast,importlib.util,pathlib,unittest
from unittest import mock
ROOT=pathlib.Path(__file__).resolve().parents[1]
SERVER=ROOT/"scripts/aoe2_r24_f_parallel_nginx_cutover.py"
MAC=ROOT/"scripts/aoe2_r24_f_parallel_nginx_mac.py"
def load(p):
    spec=importlib.util.spec_from_file_location(p.stem,p)
    m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
class ParallelR24(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.s=load(SERVER)
    def test_compiles(self):
        ast.parse(SERVER.read_text());ast.parse(MAC.read_text())
    def test_old_new_servicedistinct(self):
        s=self.s
        self.assertEqual(s.OLD_UNIT,"aoe2hdbets-web.service")
        self.assertNotEqual(s.OLD_UNIT,s.NEW_UNIT)
        self.assertEqual((s.OLD_PORT,s.NEW_PORT),(3030,3031))
    def test_old_original_service_never_stopped(self):
        src=SERVER.read_text()
        for name in ("systemctl stop","systemctl restart","git switch","git reset","git clean",
                     "prisma migrate","ssh-keygen"):
            self.assertNotIn(name,src)
        self.assertIn("OLD_FINANCIAL_WEB_PID_DRIFT",src)
        self.assertIn("FINANCE_OR_OLD_WEB_DRIFT_AT_SEAM",src)
    def test_negative_B_F_and_new_C_pins(self):
        s=self.s
        self.assertEqual(s.B_INDEPENDENT_POSITIVE_RUNTIME_SHA,"")
        self.assertEqual(s.F_APPROVED_CANDIDATE_STAGE_AND_POLICY_SHA,"")
        self.assertEqual(s.C_REVIEWED_PARALLEL_SHA,"")
    def test_proxy_replace_is_narrow_and_denies_writes(self):
        old=b"server {\n location / {\n  proxy_pass http://127.0.0.1:3030;\n }\n}"
        result=self.s.safe_replace_site(old,self.s.NEW_UPSTREAM)
        self.assertIn(b"limit_except GET HEAD { deny all; }",result)
        self.assertIn(bytes([10])+b"        limit_except GET HEAD",result)
        self.assertNotIn(bytes([92,110])+b"        limit_except GET HEAD",result)
        self.assertIn(b"proxy_pass http://127.0.0.1:3031;",result)
        self.assertNotIn(self.s.OLD_UPSTREAM,result)
    def test_multiple_default_location_fails(self):
        x=b"location / { proxy_pass http://127.0.0.1:3030; }\n"*2
        with self.assertRaisesRegex(self.s.Hold,"UNKNOWN_NGINX_LOCATION_SHAPE"):
            self.s.safe_replace_site(x,self.s.NEW_UPSTREAM)
    def test_missing_known_old_proxy_fails(self):
        with self.assertRaisesRegex(self.s.Hold,"UNREVIEWED_OLD_PROXY_UPSTREAM"):
            self.s.safe_replace_site(b"location / { proxy_pass http://localhost:3030; }",
                                     self.s.NEW_UPSTREAM)
    def test_http_mutations_are_not_probed(self):
        src=SERVER.read_text()
        self.assertIn('method="GET"',src)
        self.assertNotIn('method="POST"',src)
    def test_real_G_next_asset_binding(self):
        self.assertIn('"/_next/static/"+build_id+"/_buildManifest.js"',SERVER.read_text())
        self.assertIn('C_STAGE_NEXT_BUILD_ID_MISMATCH',SERVER.read_text())
    def test_manual_rollback_retains_audit(self):
        src=SERVER.read_text()
        self.assertIn('def manual_rollback(nonce)',src)
        self.assertIn('ROLLBACK_ALREADY_ATTEMPTED',src)
        self.assertIn('before-nginx.conf',src)
        self.assertIn('original_web_restarted',src)
    def test_exact_original_shared_release_lock(self):
        self.assertEqual(self.s.LOCK_ID,(2064,6185747,1000,0o644))
        self.assertIn("fcntl.LOCK_EX|fcntl.LOCK_NB",SERVER.read_text())
    def test_root_wrong_host_before_mutation(self):
        with mock.patch.object(self.s.socket,"gethostname",return_value="not-hel1"):
            with self.assertRaisesRegex(self.s.Hold,"EXACT_HEL1_ROOT_REQUIRED"):
                self.s.apply()
    def test_owner_mac_separate_tty_read_write(self):
        mac=MAC.read_text()
        self.assertIn('with open("/dev/tty","w")',mac)
        self.assertIn('with open("/dev/tty","r")',mac)
        self.assertNotIn('open("/dev/tty","r+")',mac)
        self.assertIn('StrictHostKeyChecking=yes',mac)
    def test_no_approval_iff_unreviewed(self):
        j={"schema":self.s.SCHEMA,"nonce":"f"*32,"candidate_sha":self.s.TARGET,
         "previous_sha":"a"*40,"previous_build_id":"oldBuild123",
         "candidate_build_id":"newBuild123","candidate_build_version":"20261031123456-abc1234567",
         "nginx_config":"/etc/nginx/sites-available/aoe2war.com",
         "nginx_before_sha256":"a"*64,"finance_units":["protected%02d.service"%n for n in range(25)],
         "finance_snapshot_sha256":"b"*64,"wolo_snapshot_sha256":"c"*64,
         "old_web_snapshot_sha256":"d"*64,"candidate_web_snapshot_sha256":"e"*64,
         "C_stage_artifact_sha256":"f"*64,"E_durable_rollback_sha256":"1"*64,
         "lane_reviews":{lane:"2"*40 for lane in "BCDEFG"}}
        with self.assertRaisesRegex(self.s.Hold,"INDEPENDENT_B_REVIEW_NOT_APPROVED"):
            self.s.approval(self.s.canonical(j))
if __name__=="__main__":unittest.main()
