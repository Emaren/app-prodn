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
    def test_actual_candidate_git_sha_is_read_as_non_root_service_uid(self):
        text=SERVER.read_text()
        self.assertIn('"C_ACTUAL_CHECKOUT_SOURCE_SHA_NOT_VERIFIED"',text)
        self.assertIn('"/usr/sbin/runuser","-u",NEW_USER,"--"',text)
        self.assertIn('"/usr/sbin/runuser","-u","tony","--"',text)
    def test_E_durable_rollback_receipt_is_required(self):
        text=SERVER.read_text()
        self.assertIn('"E_durable_receipt_path"',text)
        self.assertIn("verified_durable_e_rollback(j)",text)
        self.assertIn("E_PHYSICAL_CONTENT_RECEIPT_DIGEST_MISMATCH",text)
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
    def test_real_candidate_pid_uid_and_safe_environment(self):
        state="Id=aoe2hdbets-web-r24.service\nActiveState=active\nMainPID=14231\nUser=aoe2war-r24-web\n"
        good=(b"NODE_ENV=production\x00WARGRAPH_RUNTIME_DISABLED=true\x00"
              b"AOE2WAR_PROD_DB_PREVIEW=true\x00DATABASE_URL=postgres://reader@localhost/app\x00")
        with mock.patch.object(self.s.os,"open",return_value=123):
            with mock.patch.object(self.s.os,"read",return_value=good):
                with mock.patch.object(self.s.os,"close"):
                    self.assertTrue(self.s.enforce_candidate_runtime(state))
    def test_financial_secret_environment_causes_hold(self):
        state="ActiveState=active\nMainPID=14231\nUser=aoe2war-r24-web\n"
        bad=(b"NODE_ENV=production\x00WARGRAPH_RUNTIME_DISABLED=true\x00"
             b"AOE2WAR_PROD_DB_PREVIEW=true\x00SETTLEMENT_KEY=TOP_SECRET\x00")
        with mock.patch.object(self.s.os,"open",return_value=123):
            with mock.patch.object(self.s.os,"read",return_value=bad):
                with mock.patch.object(self.s.os,"close"):
                    with self.assertRaisesRegex(self.s.Hold,
                                               "CANDIDATE_PROCESS_INHERITED_FINANCIAL_SECRET_ENV"):
                        self.s.enforce_candidate_runtime(state)
    def test_candidate_without_disabled_wargraph_holds(self):
        state="ActiveState=active\nMainPID=14231\nUser=aoe2war-r24-web\n"
        bad=b"NODE_ENV=production\x00WARGRAPH_RUNTIME_DISABLED=false\x00"
        with mock.patch.object(self.s.os,"open",return_value=123):
            with mock.patch.object(self.s.os,"read",return_value=bad):
                with mock.patch.object(self.s.os,"close"):
                    with self.assertRaisesRegex(self.s.Hold,
                                               "WARGRAPH_SETTLEMENT_RUNTIME_NOT_DISABLED"):
                        self.s.enforce_candidate_runtime(state)
    def test_candidate_unprivileged_user_required(self):
        with self.assertRaisesRegex(self.s.Hold,
                                     "CANDIDATE_MUST_USE_DISTINCT_UNPRIVILEGED_UID"):
            self.s.enforce_candidate_runtime("ActiveState=active\nMainPID=1\nUser=root\n")
    def test_owner_mac_separate_tty_read_write(self):
        mac=MAC.read_text()
        self.assertIn('with open("/dev/tty","w")',mac)
        self.assertIn('with open("/dev/tty","r")',mac)
        self.assertNotIn('open("/dev/tty","r+")',mac)
        self.assertIn('StrictHostKeyChecking=yes',mac)
    def test_E_physical_receipt_hash_must_match_owner_policy(self):
        j={"E_durable_receipt_path":"/etc/aoe2war/r24-parallel-web/e-durable-rollback.json",
           "E_durable_rollback_sha256":"0"*64}
        with mock.patch.object(self.s,"root_file",return_value=b'{"status":"PASS"}'):
            with self.assertRaisesRegex(self.s.Hold,
                                        "E_PHYSICAL_CONTENT_RECEIPT_DIGEST_MISMATCH"):
                self.s.verified_durable_e_rollback(j)
    def test_E_physical_success_must_not_claim_rollback_exercise(self):
        j={"E_durable_receipt_path":"/etc/aoe2war/r24-parallel-web/e-durable-rollback.json"}
        raw=b'{"schema":"aoe2war.e.r24.website.rollback-content.v1","status":"IMAGINARY_SUCCESS"}'
        j["E_durable_rollback_sha256"]=self.s.sha(raw)
        with mock.patch.object(self.s,"root_file",return_value=raw):
            with self.assertRaisesRegex(self.s.Hold,
                                        "E_CONTENT_VERIFICATION_NOT_GENUINE_OR_SCOPE_DRIFT"):
                self.s.verified_durable_e_rollback(j)
    def test_no_approval_iff_unreviewed(self):
        j={"schema":self.s.SCHEMA,"nonce":"f"*32,"candidate_sha":self.s.TARGET,
         "previous_sha":"a"*40,"previous_build_id":"oldBuild123",
         "candidate_build_id":"newBuild123","candidate_build_version":"20261031123456-abc1234567",
         "nginx_config":"/etc/nginx/sites-available/aoe2war.com",
         "nginx_before_sha256":"a"*64,"finance_units":["protected%02d.service"%n for n in range(25)],
         "finance_snapshot_sha256":"b"*64,"wolo_snapshot_sha256":"c"*64,
         "old_web_snapshot_sha256":"d"*64,"candidate_web_snapshot_sha256":"e"*64,
         "C_stage_artifact_sha256":"f"*64,"E_durable_rollback_sha256":"1"*64,
         "E_durable_receipt_path":"/etc/aoe2war/r24-parallel-web/e-durable-rollback.json",
         "lane_reviews":{lane:"2"*40 for lane in "BCDEFG"}}
        with self.assertRaisesRegex(self.s.Hold,"INDEPENDENT_B_REVIEW_NOT_APPROVED"):
            self.s.approval(self.s.canonical(j))
if __name__=="__main__":unittest.main()
