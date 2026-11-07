"""One-use consumed-A05 recovery; source tests cannot authorize runtime changes."""
import importlib.util
import pathlib
import unittest
from types import SimpleNamespace
from unittest.mock import Mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
PATH=ROOT/"scripts/r25_a05_recover_464a.py"
SPEC=importlib.util.spec_from_file_location("a05_recovery",PATH)
r=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r)

class TestA05Recovery(unittest.TestCase):
    def test_exact_one_use_source_and_scope(self):
        self.assertEqual(len(r.NONCE),32)
        self.assertEqual(len(r.ENTERED_SHA),64)
        self.assertEqual(len(r.HOLD_SHA),64)
        self.assertEqual(len(r.PLAN_SHA),64)
        self.assertEqual(len(r.RELEASE_SHA),40)
        self.assertIn("not loaded",r.EXPECTED_REASON)
        self.assertNotIn("8092",PATH.read_text())
        self.assertNotIn("8093",PATH.read_text())
        self.assertNotIn("systemctl\",\"start",PATH.read_text())

    def run_recovery(self,state):
        calls=[]
        def invoke(*args,**kwargs):
            calls.append(args)
            return b""
        before=b"controller-original"
        catalogue={"read_acl_sha256":"original-acl","definer_identity_sha256":"original-definer"}
        m=SimpleNamespace(
            TIMER="steam.timer",REFRESH="steam.service",
            FILES={"controller":(pathlib.Path("/tmp/old-controller"),None,0o644)},
            unit_properties=lambda *a:{"ActiveState":state,"MainPID":"0"},
            invoke=invoke,stopped_candidate=Mock(),native_sql=Mock(),
            acl_delta=lambda _: "REVOKE",atomic=Mock(),
            steam_elements=lambda:[],safe_bytes=lambda _:before,
            assert_protected=Mock(),seal=Mock(),
            )
        old=SimpleNamespace(PROD_UNIT="candidate.service",
            production_nft_shape=lambda:"old-nft",
            production_runtime_environment=lambda:("env","database","password"),
            production_database_witness=lambda *_:catalogue)
        new=SimpleNamespace(PROD_UNIT="candidate.service")
        plan={"nft_shape_sha256":"old-nft",
            "before_read_acl_sha256":"original-acl",
            "before_definer_sha256":"original-definer",
            "before_policy_bytes":{"controller":r.sha(before)}}
        receipt=r.recover(m,plan,{"controller":before},old,new)
        self.assertEqual(receipt["status"],
             "PASS_EXACT_STOPPED_3032_PREIMAGE_RESTORED_AFTER_TLS_HOLD")
        self.assertFalse(receipt["financial_authorized"])
        self.assertFalse(receipt["public_cutover_authorized"])
        self.assertEqual(calls[0][:2],("/usr/bin/systemctl","stop"))
        self.assertFalse(any(x[:2]==("/usr/bin/systemctl","start") for x in calls))
        m.atomic.assert_called_once_with(pathlib.Path("/tmp/old-controller"),before,0o644)
        m.seal.assert_called_once()
        return calls

    def test_inactive_unit_does_not_reset_failed(self):
        commands=self.run_recovery("inactive")
        self.assertNotIn(("/usr/bin/systemctl","reset-failed","candidate.service"),commands)

    def test_failed_unit_only_uses_exact_reset(self):
        # In production the post-reset stopped state is rechecked and fails
        # closed if systemd has not returned to inactive/MainPID=0.
        # This fixture simulates success after the guarded reset.
        calls=self.run_recovery("failed")
        self.assertIn(("/usr/bin/systemctl","reset-failed","candidate.service"),calls)

if __name__=="__main__":
    unittest.main()
