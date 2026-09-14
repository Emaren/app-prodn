import unittest
from unittest.mock import patch
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

    def test_host_maintenance_requires_verified_recovery_os(self):
        snap = {
            "host": "root@hel1",
            "kernel": "test",
            "node": "v22",
            "reboot_required": True,
            "updates": 1,
            "failed_all": 0,
            "failed_transient": 0,
            "traffic_timer_enabled": "enabled",
            "traffic_timer_active": "active",
            "traffic_timer_next": "soon",
            "web": "active",
            "api": "active",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        }
        with patch.object(host, "snapshot", return_value=snap), patch.object(
            host.aoe2_recovery,
            "evaluate",
            return_value={
                "status": "NOT_VERIFIED",
                "blockers": ["proof gap"],
            },
        ):
            blocked = host.maintenance_plan()
        self.assertEqual(blocked["status"], "BLOCKED")
        self.assertFalse(blocked["recovery_ready"])

        with patch.object(host, "snapshot", return_value=snap), patch.object(
            host.aoe2_recovery,
            "evaluate",
            return_value={"status": "VERIFIED", "blockers": []},
        ):
            ready = host.maintenance_plan()
        self.assertEqual(ready["status"], "READY")
        self.assertTrue(ready["recovery_ready"])

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

    def test_phasing_probe_avoids_pipefail_grep_short_circuit(self):
        host_source = Path("scripts/aoe2_host.py").read_text(encoding="utf-8")
        doctor_source = Path("scripts/aoe2_doctor.py").read_text(encoding="utf-8")
        unsafe = 'apt-cache policy "$package" 2>/dev/null | grep -Eq'
        for source in (host_source, doctor_source):
            self.assertNotIn(unsafe, source)
            self.assertIn('package_policy="$(apt-cache policy "$package" 2>/dev/null || true)"', source)
            self.assertIn('<<< "$package_policy"', source)

    def test_snapshot_distinguishes_actionable_and_phased_updates(self):
        output = "\n".join(
            [
                "reboot_required\t1",
                "updates\t8",
                "updates_total\t8",
                "updates_actionable\t7",
                "updates_phased_deferred\t1",
                "updates_other_deferred\t0",
                "updates_probe_ok\t1",
                "updates_phased_names\tdnsmasq-base",
                "updates_other_deferred_names\t",
                "failed_all\t0",
                "failed_transient\t0",
                "timer_enabled\tenabled",
                "timer_active\tactive",
                "timer_next\tsoon",
                "web\tactive",
                "api\tactive",
                "wolo8092\t1",
                "wolo8093\t1",
                "node\tv22.23.2",
                "kernel\t6.8.0-138-generic",
            ]
        )
        with patch.object(host, "ssh_script", return_value=(0, output)), patch.object(
            host, "host_name", return_value="root@hel1"
        ):
            payload = host.snapshot()

        self.assertEqual(payload["updates"], 8)
        self.assertEqual(payload["updates_total"], 8)
        self.assertEqual(payload["updates_actionable"], 7)
        self.assertEqual(payload["updates_phased_deferred"], 1)
        self.assertEqual(payload["updates_other_deferred"], 0)
        self.assertTrue(payload["updates_probe_ok"])
        self.assertEqual(payload["updates_phased_names"], ["dnsmasq-base"])


if __name__ == "__main__":
    unittest.main()
