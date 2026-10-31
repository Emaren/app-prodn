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
    @staticmethod
    def scoped_vhost():
        # Six actual Oct 28 target location classes, with two Wolo routes
        # and a distinct unchanged HTTP redirect server.
        return b"""
server {
 server_name aoe2war.com www.aoe2war.com;
 listen 443 ssl http2;
 location ^~ /players/by-name/ {
   if ($request_method !~ ^(GET|HEAD)$) { return 405; }
   proxy_pass http://127.0.0.1:3030;
 }
 location = /api/kingdom-presence/events {
   proxy_pass http://127.0.0.1:3030;
 }
 location ^~ /api/ {
   proxy_pass http://127.0.0.1:3030;
 }
 location = / {
   if ($request_method !~ ^(GET|HEAD)$) { return 405; }
   proxy_pass http://127.0.0.1:3030;
 }
 location ^~ /download/watcher/ {
   proxy_pass http://127.0.0.1:3030;
 }
 location / {
   if ($request_method !~ ^(GET|HEAD)$) { return 405; }
   proxy_pass http://127.0.0.1:3030;
 }
 location ^~ /rpc/ {
   if ($request_method = OPTIONS) {
     add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
     return 204;
   }
   proxy_pass http://127.0.0.1:27657/;
 }
 location ^~ /rest/ {
   proxy_pass http://127.0.0.1:1318/;
 }
 include /etc/letsencrypt/options-ssl-nginx.conf;
}
server {
 server_name aoe2war.com www.aoe2war.com;
 listen 80;
 location / { return 301 https://$host$request_uri; }
}
"""
    def test_switches_exact_six_website_locations_preserving_wolo_and_http(self):
        old=self.scoped_vhost()
        result=self.s.safe_replace_site(old,self.s.NEW_UPSTREAM)
        self.assertEqual(result.count(self.s.NEW_UPSTREAM),6)
        self.assertEqual(result.count(self.s.OLD_UPSTREAM),0)
        self.assertEqual(result.count(self.s.METHOD_CHECK),6)
        self.assertEqual(result.count(b"proxy_pass http://127.0.0.1:27657/;"),1)
        self.assertEqual(result.count(b"proxy_pass http://127.0.0.1:1318/;"),1)
        self.assertIn(b"GET, POST, OPTIONS",result)
        self.assertIn(b"listen 80;",result)
        self.assertIn(b"return 301 https://$host$request_uri;",result)
        self.assertIn(b"\n        if ($request_method !~ ^(GET|HEAD)$)",result)
    def test_missing_one_of_six_holds_before_any_nginx_write(self):
        bad=self.scoped_vhost().replace(
            b"location ^~ /download/watcher/ {\n   proxy_pass http://127.0.0.1:3030;",
            b"location ^~ /download/watcher/ {\n   return 404;")
        with self.assertRaisesRegex(self.s.Hold,
                                    "NGINX_EXACT_SIX_OLD_WEB_UPSTREAMS_REQUIRED"):
            self.s.safe_replace_site(bad,self.s.NEW_UPSTREAM)
    def test_unrelated_vhost_with_3030_in_same_file_holds(self):
        bad=self.scoped_vhost()+b"""
server { server_name unrelated.example; listen 443 ssl;
 location / { proxy_pass http://127.0.0.1:3030; } }
"""
        with self.assertRaisesRegex(self.s.Hold,
                                    "NGINX_EXACT_SIX_OLD_WEB_UPSTREAMS_REQUIRED|NGINX_UNRELATED_SERVER"):
            self.s.safe_replace_site(bad,self.s.NEW_UPSTREAM)
    def test_misnamed_web_proxy_location_holds(self):
        bad=self.scoped_vhost().replace(
            b"location ^~ /api/ {",b"location ^~ /unknown-payment-route/ {")
        with self.assertRaisesRegex(self.s.Hold,"NGINX_UNREVIEWED_WEB_PROXY_LOCATION"):
            self.s.safe_replace_site(bad,self.s.NEW_UPSTREAM)
    def test_extra_unreviewed_include_holds(self):
        bad=self.scoped_vhost().replace(
            b"include /etc/letsencrypt/options-ssl-nginx.conf;",
            b"include /etc/nginx/includes/shared-wargraph-routes.conf;")
        with self.assertRaisesRegex(self.s.Hold,"NGINX_UNREVIEWED_SHARED_INCLUDE"):
            self.s.safe_replace_site(bad,self.s.NEW_UPSTREAM)
    def test_unknown_two_servers_same_tls_name_holds(self):
        bad=self.scoped_vhost().replace(b"listen 80;",b"listen 443 ssl;")
        with self.assertRaisesRegex(self.s.Hold,
                                    "NGINX_EXPECTED_HTTPS_AND_HTTP_PAIR"):
            self.s.safe_replace_site(bad,self.s.NEW_UPSTREAM)
    def test_http_mutations_are_not_probed(self):
        src=SERVER.read_text()
        self.assertIn('method="GET"',src)
        self.assertNotIn('method="POST"',src)
    def test_candidate_archive_source_uses_c_root_protected_full_manifests(self):
        code=SERVER.read_text()
        for token in ("SOURCE_STAGED.json","SOURCE_FILES.json",
                      "BUILD_STAGED.json","BUILD_FILES.json",
                      "C_EMBEDDED_GIT_ARCHIVE_COMMIT_ID_NOT_PROVEN",
                      "C_BUILT_FILE_CONTENT_NO_LONGER_MATCHES_FULL_MANIFEST"):
            self.assertIn(token,code)
        self.assertNotIn('"-C",str(CANDIDATE_STAGE),"rev-parse","HEAD"',code)
    def test_original_checkout_sha_is_nonroot_read_only(self):
        self.assertIn('"/usr/sbin/runuser","-u","tony","--"',SERVER.read_text())
    def test_E_durable_rollback_receipt_is_required(self):
        text=SERVER.read_text()
        self.assertIn('"E_durable_receipt_path"',text)
        self.assertIn("verified_durable_e_rollback(j)",text)
        self.assertIn("E_R25_ROOT_RECEIPT_DIGEST_MISMATCH",text)
    def test_real_G_next_asset_binding(self):
        self.assertIn('"/_next/static/"+build_id+"/_buildManifest.js"',SERVER.read_text())
        self.assertIn('C_ACTUAL_NEXT_BUILD_ID_NOT_APPROVED',SERVER.read_text())
    def test_manual_rollback_retains_audit(self):
        src=SERVER.read_text()
        self.assertIn('def manual_rollback(nonce)',src)
        self.assertIn('ROLLBACK_ALREADY_ATTEMPTED',src)
        self.assertIn('before-nginx.conf',src)
        self.assertIn('original_web_restarted',src)
    def test_manual_rollback_does_not_require_failed_candidate_to_run(self):
        s=self.s
        old="Id=aoe2hdbets-web.service\nActiveState=active\nMainPID=2625090\n"
        a={
            "old_web_snapshot_sha256":s.sha(old.encode()),
            "finance_snapshot_sha256":s.sha(s.canonical({"protected": "running"})),
            "wolo_snapshot_sha256":s.sha(s.canonical({"8092":"SOCKET_A","8093":"SOCKET_B"}))
        }
        current={"original_web":old,"candidate_web":"ActiveState=failed",
                 "finance":{"protected":"running"},"wolo":"SOCKET_A"}
        with mock.patch.object(s,"listener_lines",return_value={"8092":"SOCKET_A","8093":"SOCKET_B"}):
            s.prove_rollback_preimage(a,current)
            old=s.protected_continuity(current)
            current["candidate_web"]="ActiveState=inactive"
            self.assertEqual(old,s.protected_continuity(current))
    def test_emergency_rollback_verified_old_web_unchanged(self):
        s=self.s
        status={"old_web_snapshot_sha256":s.sha(b"OLD_PID_GOOD"),
                "finance_snapshot_sha256":s.sha(s.canonical({"finance":"active"})),
                "wolo_snapshot_sha256":s.sha(s.canonical({"8092":"A","8093":"B"}))}
        current={"original_web":"NEW_PID_UNEXPECTED","candidate_web":"",
                 "finance":{"finance":"active"},"wolo":"unused"}
        with mock.patch.object(s,"listener_lines",return_value={"8092":"A","8093":"B"}):
            with self.assertRaisesRegex(s.Hold,"ROLLBACK_ORIGINAL_FINANCIAL_WEB_PID_DRIFT"):
                s.prove_rollback_preimage(status,current)
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
    def test_loaded_nginx_vhost_contract_required_for_actual_cutover(self):
        root=SERVER.read_text()
        self.assertIn("nginx_loaded_vhost(old,config)",root)
        self.assertIn("nginx_loaded_vhost(candidate,config,old_count=0)",root)
        self.assertIn("NGINX_LOADED_SCOPE_INCLUDES_OR_OTHER_SITE_3030_UNRESOLVED",root)
        self.assertIn("web_new_upstream_locations_after_switch",root)
    def test_approved_owner_build_and_nonce_are_root_readonly(self):
        root=SERVER.read_text();mac=MAC.read_text()
        self.assertIn("def approved_owner_intent(rollback=False):",root)
        self.assertIn("ROOT_APPROVAL",root)
        self.assertIn('--root-owner-intent',mac)
        self.assertIn('--root-rollback-intent',mac)
        self.assertNotIn('a.add_argument("--next-build-id"',mac)
        self.assertNotIn('a.add_argument("--nonce"',mac)
        self.assertIn('ROOT_APPROVED_BUILD_ID_OR_NONCE_MISSING',mac)
        self.assertIn('bid = approved.get("candidate_build_id")',mac)
        self.assertIn('nonce = approved.get("nonce")',mac)
    def test_owner_mac_separate_tty_read_write(self):
        mac=MAC.read_text()
        self.assertIn('with open("/dev/tty", "w")',mac)
        self.assertIn('with open("/dev/tty", "r")',mac)
        self.assertNotIn('open("/dev/tty","r+")',mac)
        self.assertIn('StrictHostKeyChecking=yes',mac)
    def test_E_physical_receipt_hash_must_match_owner_policy(self):
        j={"E_r25_recovery_sha256":"0"*64,
           "E_durable_rollback_sha256":"0"*64}
        with mock.patch.object(self.s,"root_file",return_value=b'{"status":"PASS"}'):
            with self.assertRaisesRegex(self.s.Hold,
                                        "E_R25_ROOT_RECEIPT_DIGEST_MISMATCH"):
                self.s.verified_durable_e_rollback(j)
    def test_E_physical_success_must_not_claim_rollback_exercise(self):
        s=self.s
        raw=b'{"schema":"aoe2war.e.r25.parallel-website-certificate.v1","phase":"BUILD_STAGED"}'
        j={"E_r25_recovery_sha256":s.sha(raw),
           "E_durable_rollback_sha256":s.sha(raw)}
        with mock.patch.object(s,"root_file",return_value=raw):
            with self.assertRaisesRegex(s.Hold,"E_R25_REAL_READONLY_RECOVERY_CERTIFICATE_MISSING"):
                s.verified_durable_e_rollback(j)
    def test_b_poststart_requires_physical_receipt_not_root_claim(self):
        j={"B_poststart_sha256":"1"*64}
        with mock.patch.object(self.s,"root_file",return_value=b'{}'):
            with self.assertRaisesRegex(self.s.Hold,
                                        "B_INDEPENDENT_ROOT_POSTSTART_DIGEST_MISMATCH"):
                self.s.verified_b_poststart(j,{"candidate_web":"MainPID=123"})
    def test_c_full_source_build_manifest_is_required_not_git_checkout(self):
        src=SERVER.read_text()
        self.assertNotIn('"-C",str(CANDIDATE_STAGE),"rev-parse","HEAD"',src)
        for token in ("SOURCE_STAGED.json","BUILD_STAGED.json","SOURCE_FILES.json",
                      "BUILD_FILES.json","C_EMBEDDED_GIT_ARCHIVE_COMMIT_ID_NOT_PROVEN",
                      "C_ACTUAL_NEXT_BUILD_ID_NOT_APPROVED"):
            self.assertIn(token,src)
    def test_no_approval_iff_unreviewed(self):
        j={"schema":self.s.SCHEMA,"nonce":"f"*32,"candidate_sha":self.s.TARGET,
         "previous_sha":"a"*40,"previous_build_id":"oldBuild123",
         "candidate_build_id":"newBuild123","candidate_build_version":"20261031123456-abc1234567",
         "nginx_config":"/etc/nginx/sites-available/aoe2war.com",
         "nginx_before_sha256":"a"*64,"finance_units":["protected%02d.service"%n for n in range(25)],
         "finance_snapshot_sha256":"b"*64,"wolo_snapshot_sha256":"c"*64,
         "old_web_snapshot_sha256":"d"*64,"candidate_web_snapshot_sha256":"e"*64,
         "C_stage_artifact_sha256":"f"*64,"E_durable_rollback_sha256":"1"*64,
         "E_durable_receipt_path":"/etc/aoe2war/r24-parallel-web/e-recovery-ready.json",
         "E_r25_recovery_sha256":"1"*64,
         "B_poststart_sha256":"2"*64,
         "C_source_staged_sha256":"3"*64,"C_build_staged_sha256":"4"*64,
         "C_source_files_sha256":"5"*64,"C_build_files_sha256":"6"*64,
         "lane_reviews":{lane:"2"*40 for lane in "BCDEFG"}}
        with self.assertRaisesRegex(self.s.Hold,"INDEPENDENT_B_REVIEW_NOT_APPROVED"):
            self.s.approval(self.s.canonical(j))
    def test_c_candidate_is_root_sealed_under_var_lib_not_live_web_parent(self):
        s=self.s
        self.assertEqual(s.CANDIDATE_STAGE,pathlib.Path("/var/lib/aoe2war-r25-web-0cee3c836c4b"))
        self.assertEqual(s.CANDIDATE_STAGE.parent,pathlib.Path("/var/lib"))
        self.assertNotEqual(s.CANDIDATE_STAGE.parent,s.OLD_APP.parent)
        text=SERVER.read_text()
        self.assertIn('CANDIDATE_STAGE.parent==pathlib.Path("/var/lib")',text)
        self.assertNotIn('CANDIDATE_STAGE.parent==OLD_APP.parent',text)
        self.assertNotIn('/var/www/AoE2HDBets/app-prodn-r24-w1safe-0cee3c836c4b',text)

if __name__=="__main__":unittest.main()
