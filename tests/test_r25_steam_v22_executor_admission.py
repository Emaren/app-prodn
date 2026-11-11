"""Exact Session B V22 review-only executor fail-before-mutation contract tests.
Synthetic approval fixtures are never production authority.
"""
import copy
import datetime as dt
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EXECUTOR=ROOT/"scripts/release/owner-review/aoe2war_b_v22_single_lock_install_once_EXACT_REVIEW_ONLY.py"
NOW=dt.datetime(2026,11,11,8,0,tzinfo=dt.timezone.utc)

def load():
    spec=importlib.util.spec_from_file_location("aoe2war_v22_review_inert",EXECUTOR)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def approved_fixture(module):
    req={"nonce":"1"*40,"expires_utc":(NOW+dt.timedelta(minutes=20)).isoformat(),
         "boot_id":"6fdc01cb-8eb6-448d-9a5a-b62b66e0fe34"}
    reqsha="a"*64
    exesha="b"*64
    approval=module.approval_fields(req,reqsha,exesha)
    approval["expires_utc"]=(NOW+dt.timedelta(minutes=10)).isoformat()
    ts=(NOW-dt.timedelta(seconds=30)).isoformat()
    ticks=chr(96)*3
    comment={"id":6789999999,"user":{"login":"Emaren"},
       "html_url":"https://github.com/Emaren/app-prodn/pull/1316#issuecomment-6789999999",
       "created_at":ts,"updated_at":ts,
       "body":"Central independent approval\n"+ticks+"json\n"+json.dumps(approval,sort_keys=True)+"\n"+ticks}
    return req,reqsha,exesha,comment

class ExecutorNegativeAdmission(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m=load()

    def test_import_is_inert_and_sets_no_authority(self):
        self.assertIsNone(self.m.AUTHORIZATION_CTX)
        self.assertIsNone(self.m.REQ)
        self.assertIsNone(self.m.INTENT)

    def test_no_args_refuses_without_mutation(self):
        result=subprocess.run([sys.executable,"-B",str(EXECUTOR)],
             text=True,capture_output=True,timeout=12)
        self.assertEqual(result.returncode,3)
        self.assertIn("HOLD:REVIEW_ONLY_NO_EXPLICIT_EXECUTION",result.stdout)
        self.assertNotIn("ONE_USE_INSTALL_CONSUMED",result.stdout)

    def test_review_import_never_calls_install(self):
        command=("import importlib.util; p="+repr(str(EXECUTOR))+
            "; s=importlib.util.spec_from_file_location('safe_review',p);"
            "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
            "assert m.AUTHORIZATION_CTX is None;print('PASS_IMPORT_INERT')")
        result=subprocess.run([sys.executable,"-B","-c",command],
                text=True,capture_output=True,timeout=12)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn("PASS_IMPORT_INERT",result.stdout)

    def test_no_execute_flag_refuses_before_network(self):
        r=subprocess.run([sys.executable,"-B",str(EXECUTOR),
          "--request","/tmp/not-a-real-packet","--request-sha","a"*64,
          "--central-approval-comment-id","6789345841"],
          text=True,capture_output=True,timeout=12)
        self.assertEqual(r.returncode,3)
        self.assertIn("EXECUTE_FLAG_ABSENT",r.stdout)

    def test_missing_approval_flag_refuses(self):
        r=subprocess.run([sys.executable,"-B",str(EXECUTOR),"--execute",
          "--request","/tmp/forbidden","--request-sha","a"*64],
          text=True,capture_output=True,timeout=12)
        self.assertNotEqual(r.returncode,0)
        self.assertNotIn("ONE_USE_INSTALL_CONSUMED",r.stdout)

    def test_valid_synthetic_pure_fixture_only(self):
        req,sha,exe,comment=approved_fixture(self.m)
        self.assertEqual(self.m.validate_central_approval(req,sha,exe,comment,now=NOW)
                        ["decision"],"CENTRAL_INSTALL_ONLY_APPROVED")

    def test_wrong_packet_sha_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        with self.assertRaisesRegex(RuntimeError,"SCOPE_HASH"):
            self.m.validate_central_approval(req,"c"*64,exe,comment,now=NOW)

    def test_wrong_executor_sha_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        with self.assertRaisesRegex(RuntimeError,"SCOPE_HASH"):
            self.m.validate_central_approval(req,sha,"d"*64,comment,now=NOW)

    def test_wrong_nonce_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        req["nonce"]="2"*40
        with self.assertRaisesRegex(RuntimeError,"SCOPE_HASH"):
            self.m.validate_central_approval(req,sha,exe,comment,now=NOW)

    def test_missing_approval_fails(self):
        req,sha,exe,_=approved_fixture(self.m)
        with self.assertRaisesRegex(RuntimeError,"COMMENT_IDENTITY"):
            self.m.validate_central_approval(req,sha,exe,{},now=NOW)

    def test_expired_central_approval_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        with self.assertRaisesRegex(RuntimeError,"EXPIRY|NOT_FRESH"):
            self.m.validate_central_approval(req,sha,exe,comment,now=NOW+dt.timedelta(minutes=11))

    def test_wrong_operation_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        original=json.loads(comment["body"].split(chr(96)*3)[1][4:])
        original["operation"]="ACTIVATE_3032"
        comment["body"]=chr(96)*3+"json\n"+json.dumps(original)+"\n"+chr(96)*3
        with self.assertRaisesRegex(RuntimeError,"SCOPE_HASH"):
            self.m.validate_central_approval(req,sha,exe,comment,now=NOW)

    def test_financial_authorization_change_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        original=json.loads(comment["body"].split(chr(96)*3)[1][4:])
        original["financial_authorized"]=True
        comment["body"]=chr(96)*3+"json\n"+json.dumps(original)+"\n"+chr(96)*3
        with self.assertRaisesRegex(RuntimeError,"SCOPE_HASH"):
            self.m.validate_central_approval(req,sha,exe,comment,now=NOW)

    def test_wrong_or_edited_github_identity_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        x=copy.deepcopy(comment); x["user"]["login"]="not-the-owner"
        with self.assertRaisesRegex(RuntimeError,"COMMENT_IDENTITY"):
            self.m.validate_central_approval(req,sha,exe,x,now=NOW)
        y=copy.deepcopy(comment); y["updated_at"]=(NOW-dt.timedelta(seconds=5)).isoformat()
        with self.assertRaisesRegex(RuntimeError,"COMMENT_EDITED"):
            self.m.validate_central_approval(req,sha,exe,y,now=NOW)

    def test_extra_approval_field_fails(self):
        req,sha,exe,comment=approved_fixture(self.m)
        original=json.loads(comment["body"].split(chr(96)*3)[1][4:])
        original["allow_web_restart"]=True
        comment["body"]=chr(96)*3+"json\n"+json.dumps(original)+"\n"+chr(96)*3
        with self.assertRaisesRegex(RuntimeError,"APPROVAL_FIELDS"):
            self.m.validate_central_approval(req,sha,exe,comment,now=NOW)

    def test_one_use_consumption_inverse(self):
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"one-use-marker.json"
            self.m.require_unconsumed(path)
            path.write_text('{"already":"spent"}')
            with self.assertRaisesRegex(RuntimeError,"PREVIOUSLY_CONSUMED"):
                self.m.require_unconsumed(path)

    def test_concurrent_native_timer_rejected(self):
        for state in (
            {"ActiveState":"activating","MainPID":"921"},
            {"ActiveState":"active","MainPID":"221"},
            {"ActiveState":"inactive","MainPID":"99"},
        ):
            with self.subTest(state=state):
                with self.assertRaisesRegex(RuntimeError,"V20_ONESHOT_RUNNING"):
                    self.m.require_native_steam_quiescent(state)
        self.m.require_native_steam_quiescent({"ActiveState":"inactive","MainPID":"0"})

    def test_real_lease_floor_is_never_lowered(self):
        self.m.require_real_lease_headroom({"steam4":{"2.23.88.217":180},"steam6":{}})
        for leases in (
            {"steam4":{"2.23.88.217":179},"steam6":{}},
            {"steam4":{},"steam6":{}},
            {"steam4":{"2.23.88.217":301},"steam6":{}},
            {"steam4":{"2.23.88.217":180},"steam6":{"::1":0}},
        ):
            with self.subTest(leases=leases):
                with self.assertRaisesRegex(RuntimeError,"STEAM_GENUINE_TTL_UNDER_180"):
                    self.m.require_real_lease_headroom(leases)

if __name__=="__main__":
    unittest.main()
