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

    def test_documentation_summary_is_sanitized_and_counted(self):
        audit = {
            "areas": {"Documentation": "WARN"},
            "info": {
                "central_quality_gates": {
                    "docs-check": {"rc": 0, "summary": "/private/operator/path"},
                    "strict-build": {"rc": 0},
                    "audit-taxonomy": {"rc": 2},
                },
                "source_documentation_checkers": {
                    "app-prodn": {"rc": 0, "summary": "PASS"},
                    "aoe2-watcher": {
                        "rc": 0,
                        "summary": "WATCHER_RELEASE_DOCS_CURRENT version=1.5.12",
                    },
                    "api-prodn": {"rc": 2, "summary": "WARN"},
                },
                "taxonomy": {
                    "corpus_total": 195,
                    "semantic_index_total": 191,
                    "intentionally_unindexed_count": 4,
                },
                "estate_maps": {
                    "SYSTEM_MAP": {"current_source_sha": "a" * 40, "path": "/secret/system"},
                    "SERVER_STORAGE_MAP": {"current_source_sha": "b" * 40, "path": "/secret/storage"},
                },
                "central_repository": {
                    "head": "c" * 40,
                    "remote": "c" * 40,
                    "dirty_count": 0,
                    "path": "/secret/docs",
                },
                "source_repositories": {
                    "app-prodn": {
                        "head": "d" * 40,
                        "remote": "d" * 40,
                        "dirty_count": 0,
                        "path": "/secret/app",
                    },
                    "api-prodn": {
                        "head": "e" * 40,
                        "remote": "f" * 40,
                        "dirty_count": 0,
                        "path": "/secret/api",
                    },
                },
            },
        }
        summary = council.documentation_summary(
            audit,
            captured_at="2026-09-19T03:00:00Z",
        )
        self.assertEqual(summary["estate_gate"], "WARN")
        self.assertTrue(summary["docs_control_pass"])
        self.assertTrue(summary["strict_build_pass"])
        self.assertFalse(summary["taxonomy_audit_pass"])
        self.assertEqual(summary["source_checkers_passed"], 2)
        self.assertEqual(summary["source_checkers_total"], 3)
        self.assertEqual(summary["taxonomy"]["indexed_total"], 191)
        self.assertEqual(summary["source_repositories_synced"], 1)
        self.assertEqual(summary["source_repositories_total"], 2)
        self.assertEqual(summary["watcher_version"], "1.5.12")
        self.assertNotIn("/secret", repr(summary))
        self.assertNotIn("/private", repr(summary))

    def test_collect_counts_preserved_dirty_non_agent_worktrees(self):
        release_snapshot = {"production": {"source_sha": "a" * 40}}
        doctor = {
            "score": 94,
            "status": "ATTENTION",
            "generated_at": "2026-09-19T03:00:00Z",
            "info": {
                "estate": {
                    "estate": "ATTENTION_REQUIRED",
                    "p0": 0,
                    "p1": 1,
                    "areas": {"Documentation": "WARN"},
                    "info": {},
                },
                "release": release_snapshot,
            },
        }
        responses = {
            "doctor": doctor,
            "storage": {"health": "WATCH"},
            "host": {},
            "recovery": {"status": "VERIFIED"},
            "workspace": {
                "cleanup_candidates": [],
                "stale_metadata": [],
                "worktrees": [
                    {
                        "classification": "PRESERVE_DIRTY_REVIEW",
                        "agent_workspace": False,
                        "dirty": True,
                        "merged_into_canonical": False,
                    },
                    {
                        "classification": "AGENT_ACTIVE_DIRTY",
                        "agent_workspace": True,
                        "dirty": True,
                        "merged_into_canonical": False,
                    },
                ],
                "dirty_agent_count": 1,
                "unmerged_count": 1,
            },
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

        self.assertEqual(payload["workspace"]["preserved_dirty_count"], 1)
        self.assertEqual(payload["workspace"]["preserved_unmerged_count"], 1)
        self.assertEqual(payload["workspace"]["dirty_agent_count"], 1)

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

    def test_host_update_counts_preserve_old_receipt_fallback(self):
        counts = council.host_update_counts({"updates": 4})
        self.assertEqual(counts["total"], 4)
        self.assertEqual(counts["actionable"], 4)
        self.assertEqual(counts["phased_deferred"], 0)
        self.assertTrue(counts["probe_ok"])

    def test_phased_only_update_creates_no_host_maintenance_recommendation(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 0,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": False,
                "updates": 1,
                "updates_total": 1,
                "updates_actionable": 0,
                "updates_phased_deferred": 1,
                "updates_other_deferred": 0,
                "updates_probe_ok": True,
            },
            recovery={"status": "VERIFIED"},
            workspace={"cleanup_candidates": [], "orphans": []},
            pulse={"status": "PASS"},
            due_docs=0,
            ready={"ready_routes": 78, "baseline_routes": 78},
            architecture=[],
        )
        self.assertFalse(
            any(item["key"] in {"host-updates", "reboot-required"} for item in recs)
        )

    def test_actionable_update_without_reboot_is_recommended(self):
        recs = council.build_recommendations(
            audit={"p0": 0, "p1": 0},
            doctor={},
            storage={"health": "HEALTHY"},
            host={
                "failed_transient": 0,
                "traffic_timer_enabled": "enabled",
                "traffic_timer_active": "active",
                "reboot_required": False,
                "updates": 2,
                "updates_total": 2,
                "updates_actionable": 2,
                "updates_phased_deferred": 0,
                "updates_other_deferred": 0,
                "updates_probe_ok": True,
            },
            recovery={"status": "VERIFIED"},
            workspace={"cleanup_candidates": [], "orphans": []},
            pulse={"status": "PASS"},
            due_docs=0,
            ready={"ready_routes": 78, "baseline_routes": 78},
            architecture=[],
        )
        recommendation = next(item for item in recs if item["key"] == "host-updates")
        self.assertEqual(recommendation["level"], "DO NOW")
        self.assertIn("2 actionable", recommendation["reason"])


if __name__ == "__main__":
    unittest.main()
