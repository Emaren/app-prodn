"""Tightly bounded nonfinancial R25 root-controller regressions."""
import importlib.util
import pathlib
import unittest
from unittest import mock

ROOT=pathlib.Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("guardtransaction",ROOT/"scripts/r25_session_guard_release_v3.py")
v=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(v)

class Contract(unittest.TestCase):
    def test_proc_comm_with_spaces_and_nested_parentheses(self):
        line="2625090 (next-server (v1) S "+" ".join(["0"]*19+["103836850"]+["0"]*30)
        # The status/state belongs after ')' and the start-ticks field is
        # index 19 among the remaining fields (state is index 0).
        fixed="2625090 (next-server (v1)) S "+" ".join(["0"]*18+["103836850"]+["0"]*30)
        self.assertEqual(v.parse_start_ticks(fixed),103836850)
        with self.assertRaisesRegex(v.Hold,"PROC_START_TICKS_MISSING"):
            v.parse_start_ticks("123 (node) S 0")
    def test_dropin_is_candidate_only_and_has_no_financial_or_public_path(self):
        b=v.new_dropin()
        self.assertIn(b"EnvironmentFile=/etc/aoe2war/r24-parallel-web/session-runtime.env",b)
        self.assertIn(b"NODE_OPTIONS=--require=/usr/local/lib/aoe2war-r25/r25_b_guard_session_v2.cjs",b)
        for text in (b"3030",b"8092",b"8093",b"8094",b"8095",b"NEXTAUTH_SECRET",b"DATABASE_URL"):
            self.assertNotIn(text,b)
    def test_nonce_and_source_binding_cannot_predeclare_authority(self):
        with mock.patch.object(v,"source_gate"),mock.patch.object(v,"c_baseline"):
            with self.assertRaisesRegex(v.Hold,"EXACT_HEL1_ROOT_REQUIRED"):
                with mock.patch.object(v.os,"geteuid",return_value=1000):
                    v.root_plan({"nonce":"a"*32})
    def test_guards_and_historical_receipts_have_distinct_paths(self):
        self.assertNotEqual(v.GUARD,v.OLD_GUARD)
        self.assertEqual(v.OLD_GUARD_SHA,
                         "dead2815b3f20b311ede29dfd99086cbb81dfd6a73f1a71f2b7b57ccd74e809d")
        self.assertTrue(v.DROPIN.name.startswith("99-"))

if __name__=="__main__":unittest.main()
