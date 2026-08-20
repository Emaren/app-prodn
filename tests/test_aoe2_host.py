import unittest
from pathlib import Path

import scripts.aoe2_host as host


class HostTests(unittest.TestCase):
    def test_only_release_build_and_deps_instances_are_safe_transients(self):
        self.assertTrue(host.is_safe_transient_unit("aoe2war-build@abc.service"))
        self.assertTrue(host.is_safe_transient_unit("aoe2war-deps@abc.service"))
        self.assertFalse(host.is_safe_transient_unit("aoe2hdbets-web.service"))
        self.assertFalse(host.is_safe_transient_unit("wolochaind-mainnet.service"))

    def test_host_uses_explicit_root_maintenance_authority(self):
        self.assertEqual(host.host_name(), "root@hel1")

    def test_timer_rearm_source_accepts_triggered_running_service(self):
        text = Path("scripts/aoe2_host.py").read_text(encoding="utf-8")
        self.assertIn(
            'last_trigger="$(systemctl show {TRAFFIC_TIMER} -p LastTriggerUSec --value)"',
            text,
        )
        self.assertIn(
            'rollup_state="$(systemctl show traffic-project-daily-rollups-aoe2hdbets.service -p ActiveState --value)"',
            text,
        )
        self.assertIn(
            'if [ "$rollup_state" = "active" ] || [ "$rollup_state" = "activating" ]; then',
            text,
        )
        self.assertNotIn('test -n "$next"', text)


if __name__ == "__main__":
    unittest.main()
