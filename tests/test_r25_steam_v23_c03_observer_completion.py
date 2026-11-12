"""Offline adversarial regression for V23 / hourly read-only C03 observer collision."""
import importlib.util
from pathlib import Path
from unittest import TestCase, mock
import unittest

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "scripts/release/r25_steam_refresh_current_product_v23.py"
C03 = ROOT / "scripts/release/r25_c03_observer_oneshot_guard_v9.py"
spec = importlib.util.spec_from_file_location("v23_c03_observer_collision", SRC)
v23 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v23)


class C03ObserverHold(RuntimeError):
    pass


class C03ObserverBoundary(TestCase):
    def test_transient_actual_c03_identity_hold_then_original_snapshot_success(self):
        observed = []
        value = object()
        seq = iter((C03ObserverHold("C03_OBSERVER_TEMPORARILY_ACTIVE"), value))
        def guarded_original():
            item = next(seq)
            observed.append(item)
            if isinstance(item, Exception):
                raise item
            return item
        pauses = []
        self.assertIs(v23.read_protected_after_c03_observer_completion(
            guarded_original, pauses.append), value)
        self.assertEqual(pauses, [0.75])
        self.assertEqual(len(observed), 2)

    def test_multiple_staggered_observer_transitions_read_full_again(self):
        calls = []
        snapshot = {"protected_snapshot": "authentic"}
        def reader():
            calls.append(1)
            if len(calls) <= 4:
                raise C03ObserverHold("C03_OBSERVER_TEMPORARILY_ACTIVE")
            return snapshot
        delays = []
        self.assertIs(v23.read_protected_after_c03_observer_completion(
            reader, delays.append), snapshot)
        self.assertEqual(len(delays), 4)
        self.assertEqual(delays, [0.75] * 4)
        self.assertEqual(len(calls), 5)

    def test_persistent_active_c03_stays_fail_closed_after_bounded_attempts(self):
        calls = []
        def reader():
            calls.append(1)
            raise C03ObserverHold("C03_OBSERVER_TEMPORARILY_ACTIVE")
        delays = []
        with self.assertRaisesRegex(C03ObserverHold, "^C03_OBSERVER_TEMPORARILY_ACTIVE$"):
            v23.read_protected_after_c03_observer_completion(reader, delays.append)
        self.assertEqual(len(calls), 5)
        self.assertEqual(delays, [0.75] * 4)

    def test_inactive_completed_c03_needs_no_delay(self):
        expected = {"status": "authentic_C03_completed_hold_only"}
        delays = []
        self.assertIs(v23.read_protected_after_c03_observer_completion(
            lambda: expected, delays.append), expected)
        self.assertEqual(delays, [])

    def test_unrelated_protected_drift_never_retried_or_reclassified(self):
        for reason in (
            "C03_TIMER_IDENTITY_OR_ACTIVATION_DRIFT",
            "C03_COMPLETED_ONESHOT_RESULT_DRIFT",
            "C03_MONITOR_PAIR_ALREADY_ALTERED",
            "FINANCIAL_SETTLEMENT_UNMASKED",
            "PROTECTED_FINANCIAL_SNAPSHOT",
            "C03_OBSERVER_TEMPORARILY_ACTIVE_DIFFERENT",
        ):
            with self.subTest(reason=reason):
                calls = []
                def reader():
                    calls.append(1)
                    raise C03ObserverHold(reason)
                with self.assertRaises(C03ObserverHold):
                    v23.read_protected_after_c03_observer_completion(
                        reader, lambda _: self.fail("non-C03 transient slept"))
                self.assertEqual(len(calls), 1)

    def test_non_runtime_error_identically_worded_not_intercepted(self):
        calls = []
        def reader():
            calls.append(1)
            raise ValueError("C03_OBSERVER_TEMPORARILY_ACTIVE")
        with self.assertRaises(ValueError):
            v23.read_protected_after_c03_observer_completion(
                reader, lambda _: self.fail("wrong exception type slept"))
        self.assertEqual(len(calls), 1)

    def test_other_exception_class_never_suppressed(self):
        for err in (OSError("C03_OBSERVER_TEMPORARILY_ACTIVE"),
                    PermissionError("C03_OBSERVER_TEMPORARILY_ACTIVE")):
            with self.subTest(err=type(err).__name__):
                with self.assertRaises(type(err)):
                    v23.read_protected_after_c03_observer_completion(
                        lambda: (_ for _ in ()).throw(err),
                        lambda _: self.fail("wrong exception slept"))

    def test_unexpected_c03_result_after_one_retry_not_suppressed(self):
        calls = []
        def reader():
            calls.append(1)
            if len(calls) == 1:
                raise C03ObserverHold("C03_OBSERVER_TEMPORARILY_ACTIVE")
            raise RuntimeError("PROTECTED_FINANCIAL_SNAPSHOT_DRIFT")
        delays = []
        with self.assertRaisesRegex(RuntimeError, "PROTECTED_FINANCIAL_SNAPSHOT_DRIFT"):
            v23.read_protected_after_c03_observer_completion(reader, delays.append)
        self.assertEqual(delays, [0.75])
        self.assertEqual(len(calls), 2)

    def test_c03_exact_exception_is_root_original_guard_only(self):
        original = C03.read_text()
        self.assertIn("class C03IdentityHold(RuntimeError)", original)
        self.assertIn('raise C03IdentityHold("C03_OBSERVER_TEMPORARILY_ACTIVE")', original)
        self.assertIn('active in ("activating","deactivating","active")', original)
        self.assertIn('active == "inactive"', original)
        self.assertIn('"C03_COMPLETED_ONESHOT_RESULT_DRIFT"', original)

    def test_v23_wraps_all_existing_protected_reads_not_only_initial_one(self):
        text = SRC.read_text()
        self.assertIn("read_protected_after_c03_observer_completion(\n            v22.native_snapshot)",text)
        self.assertIn("read_protected_after_c03_observer_completion(m.production_protected)",text)
        self.assertIn("m.production_nft_shape() == v22.NFT_SHAPE",text)
        self.assertIn("v22.v22_timer_exclusive_lock(transaction)",text)
        self.assertIn("original.get_caps_or_hold()",text)
        self.assertNotIn("systemctl stop wolo-c03-observer",text)
        self.assertNotIn("flush set",text)
        self.assertNotIn("PROTECTED_SKIP",text)
        self.assertIn("recover_verified_lease_expiry_once(",text)

    def test_reader_never_calls_nft_or_financial_mutator(self):
        calls = []
        obj = {"original": "read_only"}
        self.assertIs(v23.read_protected_after_c03_observer_completion(
            lambda: calls.append("read") or obj,
            lambda _: calls.append("sleep")),obj)
        self.assertEqual(calls, ["read"])
        self.assertFalse(hasattr(v23,"financial_permit"))


if __name__ == "__main__":
    unittest.main()
