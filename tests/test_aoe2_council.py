import unittest
import scripts.aoe2_council as council


class CouncilTests(unittest.TestCase):
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
