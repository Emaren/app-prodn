"""G AFTER verifies 3031 while preserving all private C identity/custody checks."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("g_after_native",ROOT/"scripts/aoe2_r25_f_g_parallel_observer.py")
g=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(g)
class CHold(Exception):pass

class AfterPhase(unittest.TestCase):
    def setUp(self):
        self.secret=b"native-reconciled-session-test-not-a-real-secret-111111111"
        self.nginx=(b"proxy_pass http://127.0.0.1:3031;\n"*6)
        self.ctx={
            "Hold":CHold,
            "actual_guard_sha":lambda:"original-guard",
            "OLD_GUARD_SHA":"original-guard",
            "status":lambda _:{"ActiveState":"active","User":"aoe2war-r24-web",
             "WorkingDirectory":str(g.STAGE),"NeedDaemonReload":"no","MainPID":"1483304"},
            "UNIT":"aoe2hdbets-web-r24.service",
            "ticks":lambda _:148446193,
            "health":lambda _:{"buildVersion":g.C_PHYSICAL_APP_VERSION},
            "read_environment":lambda _:{"NODE_OPTIONS":b"--require=/usr/local/lib/guard",
                                      "SESSION_SECRET":self.secret},
            "session_identity":lambda:self.secret,
            "GUARD":pathlib.Path("/usr/local/lib/guard"),
            "b_observe":lambda *_args,**_kwargs:{
              "status":"POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY",
              "candidate_uid":993,"build_id":g.C_PHYSICAL_BUILD_ID,
              "old_web_pid":g.EXPECTED_OLD_PID,"candidate_pid":1483304},
            "call":lambda *_args,**_kwargs:b"LISTEN 0 10 127.0.0.1:8092 0.0.0.0:*\nLISTEN 0 10 127.0.0.1:8093 0.0.0.0:*\n"
        }
    def qualify(self):
        with mock.patch.object(g,"root_file",return_value=self.nginx):
            return g.c_after_native_requalification(
                self.ctx,g.C_SESSION_GUARD_V3_GUARD_SHA,g.digest(self.nginx),
                "/etc/nginx/sites-available/aoe2war.com")
    def test_real_post_switch_c_private_identity_qualifies_and_never_calls_pre_switch_baseline(self):
        self.ctx["c_baseline"]=mock.Mock(side_effect=AssertionError("must never call stale frozen_public"))
        observed=self.qualify()
        self.assertEqual(observed,{"candidate_pid":1483304,"candidate_start_ticks":148446193,
          "native_b_status":"POSITIVE_ISOLATED_3031_NOT_PUBLIC_DEPLOYMENT_AUTHORITY",
          "native_b_physical_checks_performed":True,"guard_sha256":g.C_SESSION_GUARD_V3_GUARD_SHA,
          "build_version":g.C_PHYSICAL_APP_VERSION,"public_pid":g.EXPECTED_OLD_PID,
          "wolo_legacy_untouched":True,"financial_authorized":False})
        self.ctx["c_baseline"].assert_not_called()
    def test_public_must_be_exact_six_3031_no_3030_before_any_secret_read(self):
        self.nginx=(b"proxy_pass http://127.0.0.1:3030;\n"*6)
        self.ctx["session_identity"]=mock.Mock(side_effect=AssertionError("secret must stay unread"))
        with self.assertRaisesRegex(g.Hold,"G_AFTER_PUBLIC_3031_EXACT_NGINX_REQUIRED"):
            self.qualify()
        self.ctx["session_identity"].assert_not_called()
    def test_original_session_key_must_match_constant_time(self):
        self.ctx["session_identity"]=lambda:self.secret+b"x"
        with self.assertRaisesRegex(g.Hold,"G_AFTER_C_SESSION_SIGNING_IDENTITY_DRIFT"):
            self.qualify()
    def test_immutable_candidate_pid_or_start_ticks_are_required(self):
        self.ctx["ticks"]=lambda _:148446194
        with self.assertRaisesRegex(g.Hold,"G_AFTER_C_CANDIDATE_PROCESS_DRIFT"):
            self.qualify()
    def test_financial_8094_must_remain_off(self):
        self.ctx["call"]=lambda *_args,**_kwargs:b":8092 \n:8093 \n:8094 \n"
        with self.assertRaisesRegex(g.Hold,"G_AFTER_C_CUSTODY_PORT_FENCE_DRIFT"):
            self.qualify()
    def test_pinned_c_native_holds_do_not_leak_exception_bodies(self):
        self.ctx["b_observe"]=lambda *_args,**_kwargs:(_ for _ in ()).throw(
            CHold("NATIVE_SOURCE_DRIFT"))
        with self.assertRaisesRegex(g.Hold,"G_AFTER_C_NATIVE_HOLD:NATIVE_SOURCE_DRIFT"):
            self.qualify()
    def test_wrong_after_sha_rejected_before_sensitive_checks(self):
        self.ctx["session_identity"]=mock.Mock(side_effect=AssertionError("secret must stay unread"))
        with mock.patch.object(g,"root_file",return_value=self.nginx):
            with self.assertRaisesRegex(g.Hold,"G_AFTER_PUBLIC_3031_EXACT_NGINX_REQUIRED"):
                g.c_after_native_requalification(self.ctx,g.C_SESSION_GUARD_V3_GUARD_SHA,
                                                "a"*64,"/etc/nginx/sites-available/aoe2war.com")
        self.ctx["session_identity"].assert_not_called()
if __name__=="__main__":unittest.main()
