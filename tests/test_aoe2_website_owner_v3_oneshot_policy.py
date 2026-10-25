"""Website-only v3: preserve actual live Wolo identity while accepting timer-fired services.

No real SSH, keys, chain state, services, or owner release nonce.
"""
from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import aoe2_website_owner_release_v3 as RELEASE
import aoe2_website_owner_observer_v3 as OBS


def immutable_fixture() -> dict:
    unit_rows = {}
    for name in OBS.UNITS:
        is_timer = name.endswith(".timer")
        is_permanent = name in OBS.WOLO_SERVICES.values() or name == OBS.WEB_UNIT
        row = {
            "LoadState": "loaded",
            "ActiveState": "active" if is_timer or is_permanent else "inactive",
            "SubState": "waiting" if is_timer else ("running" if is_permanent else "dead"),
            "UnitFileState": "enabled" if is_timer else "static",
            "MainPID": 0,
        }
        if name == OBS.WEB_UNIT:
            row.pop("MainPID")
        if name in OBS.WOLO_SERVICES.values():
            row["MainPID"] = 123
        unit_rows[name] = row
    return {
        **{role: {"pid": 123, "inode": 234, "device": 345, "exe_sha256": "b"*64}
           for role in OBS.WOLO_SERVICES},
        "financial_units": unit_rows,
        "unit_config_sha256": {name: "a"*64 for name in OBS.UNITS},
        "wolo_source_sha": OBS.WOLO_SOURCE,
        "source_p1_original": {
            "key": "vps-source-drift", "status": "BLOCKED",
            "observed_source": OBS.WOLO_SOURCE,
            "reviewed_source": OBS.REVIEWED_WOLO_SOURCE,
            "detail": "VPS="+OBS.WOLO_SOURCE+
                      " implementation_baseline="+OBS.REVIEWED_WOLO_SOURCE,
        },
    }


class SoloOwnerTimedServiceIdentityTests(unittest.TestCase):
    def setUp(self):
        self.original = immutable_fixture()
        self.after = copy.deepcopy(self.original)

    def same(self):
        return (RELEASE.stable_financial_runtime_identity(self.original) ==
                RELEASE.stable_financial_runtime_identity(self.after))

    def test_normal_timer_fired_one_shot_start_and_exit_do_not_consume_valid_release(self):
        for base in OBS.TIMER_FAMILIES:
            service = base + ".service"
            self.after["financial_units"][service].update({
                "ActiveState": "active", "SubState": "running", "MainPID": 9876,
            })
        # A stage can require many minutes, during which all previously
        # enabled reconciliation timers may run their already-known one-shots.
        self.assertTrue(self.same())
        for base in OBS.TIMER_FAMILIES:
            service = base + ".service"
            self.assertEqual("active", self.after["financial_units"][service]["ActiveState"])
            self.assertEqual(9876, self.after["financial_units"][service]["MainPID"])
        # Raw observations remain unchanged, never silently hidden or rewritten.
        self.assertEqual("inactive", self.original["financial_units"]
                         [OBS.TIMER_FAMILIES[0]+".service"]["ActiveState"])

    def test_known_timer_and_config_policy_must_remain_identical(self):
        base = OBS.TIMER_FAMILIES[0]
        name = base + ".service"
        timer = base + ".timer"
        cases = [
            ("timer_disabled", lambda: self.after["financial_units"][timer].update(
                {"UnitFileState": "disabled", "ActiveState": "inactive"})),
            ("service_disabled", lambda: self.after["financial_units"][name].update(
                {"UnitFileState": "disabled"})),
            ("service_removed", lambda: self.after["financial_units"].pop(name)),
            ("timer_removed", lambda: self.after["financial_units"].pop(timer)),
            ("unit_hash_changed", lambda: self.after["unit_config_sha256"].__setitem__(name,"c"*64)),
            ("finance_config_added", lambda: self.after["unit_config_sha256"].__setitem__("new-unit","c"*64)),
            ("active_api_restart", lambda: self.after["financial_units"]["aoe2hdbets-api.service"].update(
                {"ActiveState": "active", "SubState": "running", "MainPID": 1111})),
            ("wolo_mainnet_process_identity_changed", lambda: self.after["wolo8092"].update(
                {"pid": 555})),
            ("wolo_consensus_executable_changed", lambda: self.after["consensus"].update(
                {"exe_sha256": "d"*64})),
            ("original_source_p1_changed", lambda: self.after["source_p1_original"].update(
                {"status": "RESOLVED"})),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                self.after = copy.deepcopy(self.original)
                mutate()
                self.assertFalse(self.same(), label)

    def test_unreviewable_oneshot_shape_or_missing_service_fails_closed(self):
        service = OBS.TIMER_FAMILIES[0] + ".service"
        self.after["financial_units"][service]["MainPID"] = None
        with self.assertRaises(RELEASE.Hold):
            RELEASE.stable_financial_runtime_identity(self.after)
        self.after = copy.deepcopy(self.original)
        del self.after["financial_units"][service]
        with self.assertRaises(RELEASE.Hold):
            RELEASE.stable_financial_runtime_identity(self.after)

    def test_operator_code_checks_stable_identity_at_all_three_release_boundaries(self):
        src = Path(RELEASE.__file__).read_text(encoding="utf-8")
        self.assertIn('stable_financial_runtime_identity(reference["immutable"])',src)
        self.assertIn('stable_financial_runtime_identity(latest["immutable"])',src)
        self.assertIn('stable_financial_runtime_identity(after["immutable"])',src)
        self.assertNotIn('before["immutable"] == after["immutable"]',src)


if __name__ == "__main__":
    unittest.main()
