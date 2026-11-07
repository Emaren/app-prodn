"""Nonfinancial Steam v5t expiry-boundary retry; fail closed, offline only."""
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"scripts/release/r25_steam_refresh_v5t.py"
V5S=ROOT/"scripts/release/r25_steam_refresh_v5s.py"
spec=importlib.util.spec_from_file_location("steam_v5t_guard",SOURCE)
s=importlib.util.module_from_spec(spec)
spec.loader.exec_module(s)

class Fake:
    Hold=ValueError
    def __init__(self,outcomes):
        self.outcomes=list(outcomes)
        self.calls=0
    def production_live_steam_entries(self):
        self.calls+=1
        x=self.outcomes.pop(0)
        if isinstance(x,Exception):raise x
        return x

OK={"steam4":{"23.12.156.233"},"steam6":set()}
class StrictRetry(unittest.TestCase):
    def test_normal_read_has_no_sleep(self):
        m=Fake([OK])
        with mock.patch.object(s.time,"sleep") as sleep:
            self.assertEqual(s.observe_strict_steam_set_with_bounded_retry(m),OK)
            sleep.assert_not_called()
        self.assertEqual(m.calls,1)
    def test_zero_expiry_transient_two_read_only_retries(self):
        m=Fake([ValueError("STEAM_SET_UNBOUNDED_OR_EXPIRED"),
                ValueError("STEAM_SET_UNBOUNDED_OR_EXPIRED"),OK])
        delays=[]
        self.assertEqual(s.observe_strict_steam_set_with_bounded_retry(m,delays.append),OK)
        self.assertEqual(m.calls,3)
        self.assertEqual(delays,[0.35,0.35])
    def test_persistent_expired_element_stays_hold(self):
        m=Fake([ValueError("STEAM_SET_UNBOUNDED_OR_EXPIRED") for _ in range(4)])
        delays=[]
        with self.assertRaisesRegex(ValueError,"^STEAM_SET_UNBOUNDED_OR_EXPIRED$"):
            s.observe_strict_steam_set_with_bounded_retry(m,delays.append)
        self.assertEqual(m.calls,4)
        self.assertEqual(delays,[0.35]*3)
    def test_unbounded_other_failure_no_retry(self):
        for reason in ("STEAM_SET_EXPIRY_UNOBSERVABLE",
                       "STEAM_SET_ADDRESS_SCOPE_CHANGED",
                       "STEAM_SET_SHAPE_OR_CAP_DRIFT",
                       "STEAM_SET_DUPLICATED",
                       "STEAM_SET_CAP_EXCEEDED_FAIL_CLOSED",
                       "STEAM_SET_UNBOUNDED_OR_EXPIRED_EXTRA"):
            m=Fake([ValueError(reason)])
            with self.subTest(reason=reason):
                with self.assertRaisesRegex(ValueError,"^"+reason+"$"):
                    s.observe_strict_steam_set_with_bounded_retry(m,lambda _:self.fail("slept"))
                self.assertEqual(m.calls,1)
    def test_original_validator_itself_never_rewritten(self):
        text=SOURCE.read_text()
        self.assertEqual(text.count("m.production_live_steam_entries()"),1)
        self.assertEqual(text.count("observe_strict_steam_set_with_bounded_retry(m)"),2)
        self.assertIn("m.production_steam_union_commands(validated,existing)",text)
        self.assertIn("PROTECTED_FINANCE_SNAPSHOT_CHANGED_BEFORE_NFT",text)
        self.assertIn("REFRESH_SYSTEMD_SECURITY_DRIFT",text)
        self.assertNotIn("flush set inet aoe2war_web_prod",text)
        self.assertIn("finance_authorized\":False",text)
    def test_new_policy_and_admission_are_distinct(self):
        self.assertIn("web-prod-v5t",str(s.POLICY))
        self.assertIn("web-prod-v5t",str(s.ADMISSION))
        self.assertIn("v5t.py",str(s.NEW_SELF))
        self.assertNotEqual(s.POLICY,ROOT/"scripts/release/r25_steam_refresh_v5s.py")
        self.assertTrue(V5S.exists())
        self.assertIn("v5s.py",V5S.read_text())
    def test_retry_only_catches_original_hold_type(self):
        m=Fake([RuntimeError("STEAM_SET_UNBOUNDED_OR_EXPIRED")])
        with self.assertRaises(RuntimeError):
            s.observe_strict_steam_set_with_bounded_retry(m,lambda _:self.fail("slept"))
        self.assertEqual(m.calls,1)
    def test_no_network_external_mutation_needed_for_tests(self):
        self.assertFalse(hasattr(s,"financial_permit"))
        self.assertEqual(s.PRIOR_PID,"2625090")
        self.assertEqual(s.RELEASE,"20261106065241-f085ab2094")
if __name__=="__main__":unittest.main()
