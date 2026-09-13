import unittest
from unittest.mock import patch
import scripts.aoe2_council as council


class CouncilTests(unittest.TestCase):
    def test_collect_surfaces_doctor_release_snapshot(self):
        release_snapshot = {"production": {"source_sha": "a" * 40}}
        doctor = {
            "score": 100,
            "status": "HEALTHY",
            "info": {
                "estate": {"estate": "HEALTHY", "p0": 0, "p1": 0},
                "release": release_snapshot,
            },
        }
        responses = {
            "doctor": doctor,
            "storage": {"health": "HEALTHY"},
            "host": {},
            "recovery": {"status": "VERIFIED"},
            "workspace": {"cleanup_candidates": [], "stale_metadata": []},
        }
        def fake_command(*args, **kwargs):
            return responses[args[0]]
        with (
            patch.object(council, "command_json", side_effect=fake_command),
            patch.object(council, "latest_pulse", return_value={"status": "PASS"}),
            patch.object(council, "docs_due", return_value=0),
            patch.object(council, "ready_coverage", return_value={"ready_routes": 0, "baseline_routes": 0}),
            patch.object(council, "architecture_opportunities", return_value=[]),
        ):
            payload = council.collect()
        self.assertEqual(payload["release_snapshot"], release_snapshot)

    def test_recovery_gap_ranks_ahead_of_reboot(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 0,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": True,
                "updates": 58,
            },
            recovery={"status": "NOT_VERIFIED"},
            workspace={
                "cleanup_candidates": [],
                "orphans": [],
            },
            pulse={"status": "PASS"},
            due_docs=0,
            ready={
                "ready_routes": 66,
                "baseline_routes": 66,
            },
            architecture=[],
        )
        self.assertEqual(
            recs[0]["key"],
            "offsite-evidence",
        )
        reboot = next(
            item
            for item in recs
            if item["key"] == "reboot-required"
        )
        self.assertEqual(
            reboot["level"],
            "WAITING ON RECOVERY",
        )

    def test_dirty_or_unmerged_worktrees_are_never_silent(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 0,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": False,
                "updates": 0,
            },
            recovery={"status": "VERIFIED"},
            workspace={
                "cleanup_candidates": [],
                "dirty_count": 6,
                "unmerged_count": 7,
                "orphans": [],
            },
            pulse={"status": "PASS"},
            due_docs=0,
            ready={
                "ready_routes": 13,
                "baseline_routes": 77,
            },
            architecture=[],
        )
        preserved = next(
            item
            for item in recs
            if item["key"] == "workspace-preserved-code"
        )
        self.assertEqual(preserved["level"], "MUST REVIEW")
        self.assertIn("dirty=6 unmerged=7", preserved["reason"])

        readiness = next(
            item
            for item in recs
            if item["key"] == "ready-coverage"
        )
        self.assertIn("13/77", readiness["reason"])

    def test_registered_agent_wip_is_not_counted_as_dirty_review_debt(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 0,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": False,
                "updates": 0,
            },
            recovery={"status": "VERIFIED"},
            workspace={
                "worktrees": [
                    {
                        "classification": "AGENT_ACTIVE_DIRTY",
                        "agent_workspace": True,
                    }
                ],
                "dirty_agent_count": 1,
                "unmerged_count": 0,
                "cleanup_candidates": [],
                "stale_metadata": [],
            },
            pulse={"status": "PASS"},
            due_docs=0,
            ready={
                "ready_routes": 77,
                "baseline_routes": 77,
            },
            architecture=[],
        )

        self.assertFalse(
            any(
                item["key"] == "workspace-preserved-code"
                for item in recs
            )
        )

    def test_non_agent_dirty_worktree_remains_review_debt(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 0,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": False,
                "updates": 0,
            },
            recovery={"status": "VERIFIED"},
            workspace={
                "worktrees": [
                    {
                        "classification": "PRESERVE_DIRTY_REVIEW",
                        "agent_workspace": False,
                    }
                ],
                "dirty_agent_count": 0,
                "unmerged_count": 0,
                "cleanup_candidates": [],
                "stale_metadata": [],
            },
            pulse={"status": "PASS"},
            due_docs=0,
            ready={
                "ready_routes": 77,
                "baseline_routes": 77,
            },
            architecture=[],
        )

        preserved = next(
            item
            for item in recs
            if item["key"] == "workspace-preserved-code"
        )
        self.assertIn("dirty=1 unmerged=0", preserved["reason"])

    def test_failed_transients_surface_as_hygiene(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 2,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": False,
                "updates": 0,
            },
            recovery={"status": "VERIFIED"},
            workspace={
                "cleanup_candidates": [],
                "orphans": [],
            },
            pulse={"status": "PASS"},
            due_docs=0,
            ready={
                "ready_routes": 66,
                "baseline_routes": 66,
            },
            architecture=[],
        )
        self.assertTrue(
            any(
                item["key"] == "failed-transients"
                for item in recs
            )
        )


if __name__ == "__main__":
    unittest.main()
