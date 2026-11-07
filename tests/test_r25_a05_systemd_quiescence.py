"""Hermetic A05 systemd stop-timeout regression; zero host side effects."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "a05_quiescence", ROOT / "scripts/r25_a05_systemd_quiescence.py"
)
import sys
MODULE = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class FakeClock:
    def __init__(self):
        self.elapsed = 0.0
        self.requests = []

    def now(self):
        return self.elapsed

    def sleep(self, seconds):
        self.elapsed += seconds

    def stop(self, unit):
        self.requests.append(unit)


class StopWaitTests(unittest.TestCase):
    UNIT = "aoe2hdbets-web-prod.service"

    def execute(self, fake, observe, unit=UNIT, **options):
        return MODULE.await_systemd_stop(
            unit, stop_nonblocking=fake.stop, observe=observe,
            monotonic=fake.now, sleep=fake.sleep, **options,
        )

    def test_ninety_second_native_stop_succeeds_without_false_fifty_second_timeout(self):
        fake = FakeClock()

        def state(_):
            if not fake.requests:
                return {"ActiveState": "active", "MainPID": "898995"}
            if fake.elapsed < 95:
                return {"ActiveState": "deactivating", "MainPID": "898995"}
            return {"ActiveState": "inactive", "MainPID": "0"}

        result = self.execute(fake, state)
        self.assertEqual(result, MODULE.Observation("inactive", 0))
        self.assertGreaterEqual(fake.elapsed, 95)
        self.assertEqual(fake.requests, [self.UNIT])

    def test_candidate_quiesces_within_its_native_timeout(self):
        fake = FakeClock()
        unit = "aoe2war-r25-1c4ffe0-candidate-v2.service"

        def state(_):
            if not fake.requests:
                return {"ActiveState": "active", "MainPID": "898022"}
            if fake.elapsed < 82:
                return {"ActiveState": "deactivating", "MainPID": "898022"}
            return {"ActiveState": "inactive", "MainPID": "0"}

        result = self.execute(fake, state, unit=unit)
        self.assertEqual(result.main_pid, 0)
        self.assertEqual(fake.requests, [unit])

    def test_expiry_holds_without_force_killing_or_declaring_success(self):
        fake = FakeClock()

        def state(_):
            return {"ActiveState": "deactivating" if fake.requests else "active", "MainPID": "898995"}

        with self.assertRaisesRegex(MODULE.QuiescenceHold, "BOUNDED_STOP_EXPIRED"):
            self.execute(fake, state)
        self.assertEqual(fake.requests, [self.UNIT])
        self.assertEqual(fake.elapsed, 125.0)

    def test_failed_state_with_zero_pid_is_not_graceful_acceptance(self):
        fake = FakeClock()

        def state(_):
            if fake.requests:
                return {"ActiveState": "failed", "MainPID": "0"}
            return {"ActiveState": "active", "MainPID": "898995"}

        with self.assertRaisesRegex(MODULE.QuiescenceHold, "SYSTEMD_STOP_FAILED"):
            self.execute(fake, state)

    def test_restarted_process_is_not_the_original_stop(self):
        fake = FakeClock()

        def state(_):
            if fake.requests:
                return {"ActiveState": "active", "MainPID": "909999"}
            return {"ActiveState": "active", "MainPID": "898995"}

        with self.assertRaisesRegex(MODULE.QuiescenceHold, "SERVICE_REACTIVATED"):
            self.execute(fake, state)

    def test_unknown_or_sensitive_unit_cannot_be_requested(self):
        fake = FakeClock()
        with self.assertRaisesRegex(MODULE.QuiescenceHold, "UNIT_OUTSIDE_EXACT_A05_SCOPE"):
            self.execute(fake, lambda _: {"ActiveState": "active", "MainPID": "42"},
                         unit="wolochain-mainnet-settlement.service")
        self.assertEqual(fake.requests, [])

    def test_already_stopped_unit_returns_without_stop_side_effect(self):
        fake = FakeClock()
        outcome = self.execute(fake, lambda _: {"ActiveState": "inactive", "MainPID": "0"})
        self.assertEqual(outcome, MODULE.Observation("inactive", 0))
        self.assertEqual(fake.requests, [])

    def test_impossible_pid_and_weakened_deadline_fail_closed(self):
        fake = FakeClock()
        with self.assertRaisesRegex(MODULE.QuiescenceHold, "UNRECOGNIZED_SYSTEMD_PID"):
            self.execute(fake, lambda _: {"ActiveState": "active", "MainPID": "not-a-pid"})
        with self.assertRaisesRegex(MODULE.QuiescenceHold, "UNREVIEWED_STOP_DEADLINE"):
            self.execute(fake, lambda _: {"ActiveState": "active", "MainPID": "898995"},
                         grace_seconds=50)
        self.assertEqual(fake.requests, [])

    def test_inactive_unit_with_still_running_pid_is_held(self):
        fake = FakeClock()
        def state(_):
            return {"ActiveState": "inactive", "MainPID": "898995"} if fake.requests else {
                "ActiveState": "active", "MainPID": "898995"}
        with self.assertRaisesRegex(MODULE.QuiescenceHold, "INACTIVE_UNIT_RETAINS_PROCESS"):
            self.execute(fake, state)


if __name__ == "__main__":
    unittest.main()
