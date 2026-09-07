from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_brain.py"
SCRIPTS = SCRIPT.parent
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

SPEC = importlib.util.spec_from_file_location("aoe2_brain", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


def release(*, exact: bool = True) -> dict:
    local = "a" * 40
    github = local
    production = local if exact else "b" * 40
    certified = production
    return {
        "local": {
            "head": local,
            "branch": "main",
            "dirty_count": 0,
        },
        "github": {
            "main_sha": github,
        },
        "production": {
            "source_sha": production,
            "dirty_count": 0,
            "service": "active",
            "version_parity": True,
            "active_build_id": "build-1",
            "wolo_8092_count": 1,
            "wolo_8093_count": 1,
        },
        "certification": {
            "status": "CERTIFIED",
            "release_sha": certified,
            "active_build_id": "build-1",
            "artifact_sha256": "c" * 64,
        },
    }


def council(*, p1: int = 0) -> dict:
    return {
        "estate": "HEALTHY" if p1 == 0 else "ATTENTION",
        "p0": 0,
        "p1": p1,
        "doctor_score": 100 if p1 == 0 else 88,
        "doctor_status": "HEALTHY" if p1 == 0 else "ATTENTION",
        "recommendations": [],
        "best_next_action": None,
        "storage": {
            "health": "HEALTHY",
            "volume_used_percent": 70.0,
        },
        "host": {},
        "recovery": {
            "status": "VERIFIED",
        },
        "workspace": {
            "cleanup_candidates": 0,
            "dirty_count": 0,
            "unmerged_count": 0,
            "orphans": [],
        },
        "performance_pulse": None,
        "ready_coverage": {
            "ready_routes": 77,
            "baseline_routes": 77,
        },
        "docs_due_7d": 0,
        "architecture_opportunities": [],
    }


def truth() -> dict:
    return {
        "available": True,
        "complete": True,
        "accounted_percent": 100.0,
        "unclassified": 0,
        "final_games": 4438,
        "resolved": 3189,
        "unresolved": 1249,
        "parser_work_candidates": 1159,
        "production_source": "a" * 40,
        "freshness": {
            "generated_at": "2026-09-05T20:00:00Z",
            "age_seconds": 0,
            "stale": False,
        },
    }


def performance() -> dict:
    return {
        "available": True,
        "campaign_id": "baseline",
        "status": "analyzed",
        "route_count": 77,
        "release_sha": "a" * 40,
        "baseline": {
            "ttfb_p50_ms": 398.3,
            "total_p50_ms": 583.5,
        },
        "freshness": {
            "generated_at": "2026-09-05T20:00:00Z",
            "age_seconds": 0,
            "stale": False,
        },
    }


def finish(*, complete: bool = True) -> dict:
    return {
        "available": True,
        "status": "CERTIFIED" if complete else "FAILED",
        "release_outcome": "CERTIFIED" if complete else "CERTIFIED",
        "closure_complete": complete,
        "certified_runtime": True,
        "active_phase": None,
        "failed_phase": None if complete else "post_release_documentation",
        "error": None if complete else "control state blocked",
        "receipt": ".aoe2war-release/finish-receipts/test.json",
    }


def control(*, status: str = "current") -> dict:
    return {
        "status": status,
        "reason": (
            "generated control blocks already match certified source"
            if status == "current"
            else "generated control blocks lag exact certified production source"
        ),
        "intended_source_sha": "a" * 40,
        "current_source_sha": "a" * 40 if status == "current" else "b" * 40,
    }


class KingdomIntelligenceTests(unittest.TestCase):
    def test_war_date_is_deterministic_utc(self):
        value = datetime(2026, 9, 5, 21, 7, tzinfo=timezone.utc)
        self.assertEqual(MODULE.war_date(value), "2026.248.2107Z")

    def test_source_summary_requires_exact_four_plane_identity(self):
        exact = MODULE.source_summary(release(exact=True))
        self.assertTrue(exact["exact"])
        self.assertFalse(exact["production_behind_github"])

        behind = MODULE.source_summary(release(exact=False))
        self.assertFalse(behind["exact"])
        self.assertTrue(behind["production_behind_github"])

    def test_collect_returns_one_deterministic_operator_snapshot(self):
        now = datetime(2026, 9, 5, 21, 7, tzinfo=timezone.utc)
        with (
            patch.object(MODULE, "now_utc", return_value=now),
            patch.object(MODULE.aoe2_release, "collect", return_value=release()),
            patch.object(MODULE.aoe2_council, "collect", return_value=council()),
            patch.object(MODULE, "latest_truth", return_value=truth()),
            patch.object(MODULE, "latest_performance", return_value=performance()),
            patch.object(MODULE, "latest_finish", return_value=finish()),
            patch.object(MODULE, "control_summary", return_value=control()),
            patch.object(
                MODULE,
                "storage_campaign_summary",
                return_value={"status": "NONE"},
            ),
            patch.object(
                MODULE,
                "activity_24h",
                return_value={
                    "window_hours": 24,
                    "source_commits": 42,
                    "finish_runs": 3,
                    "certified_finishes": 2,
                },
            ),
            patch.object(
                MODULE,
                "recovery_campaign_summary",
                return_value={"status": "NONE"},
            ),
            patch.object(
                MODULE,
                "recent_source_activity",
                return_value=[
                    {
                        "sha": "d" * 40,
                        "created_at": "2026-09-05T20:30:00Z",
                        "title": "Seal Recovery OS proof",
                        "system": "Recovery OS",
                        "file_count": 2,
                        "status": "SUCCEEDED",
                    }
                ],
            ),
            patch.object(
                MODULE,
                "memory_seals",
                return_value=[
                    {
                        "sha": "e" * 40,
                        "created_at": "2026-09-05T20:35:00Z",
                        "title": "Record recovery invariant",
                        "status": "SEALED",
                    }
                ],
            ),
        ):
            payload = MODULE.collect()

        self.assertEqual(payload["kind"], "aoe2war-kingdom-intelligence")
        self.assertEqual(payload["war_date"], "2026.248.2107Z")
        self.assertEqual(payload["operating_state"], "READY")
        self.assertTrue(payload["source"]["exact"])
        self.assertEqual(payload["health"]["p0"], 0)
        self.assertEqual(payload["health"]["p1"], 0)
        self.assertEqual(payload["replay_truth"]["accounted_percent"], 100.0)
        self.assertEqual(payload["performance"]["route_count"], 77)
        self.assertEqual(payload["storage_campaign"]["status"], "NONE")
        self.assertEqual(payload["activity_24h"]["source_commits"], 42)
        self.assertEqual(payload["activity_24h"]["certified_finishes"], 2)
        self.assertEqual(len(payload["system_agents"]), 9)
        self.assertEqual(payload["system_agents"][0]["label"], "Release OS")
        self.assertEqual(payload["recent_source_activity"][0]["system"], "Recovery OS")
        self.assertEqual(payload["memory_seals"][0]["status"], "SEALED")
        self.assertTrue(
            all(row["status"] == "PASS" for row in payload["invariants"])
        )

    def test_agent_roster_is_eight_os_agents_plus_doctor(self):
        source = MODULE.source_summary(release())
        perf = performance()
        perf["matches_current_release"] = True
        current_truth = truth()
        current_truth["matches_current_release"] = True
        current_council = council()
        current_council["workspace"] = {
            "canonical_drift_count": 0,
            "active_agent_count": 1,
            "unmerged_count": 1,
            "agents": [
                {
                    "agent": "Codex",
                    "purpose": "Recovery backend",
                    "branch": "feature/recovery",
                    "classification": "AGENT_ACTIVE_UNMERGED",
                    "head": "f" * 40,
                }
            ],
        }
        agents = MODULE.system_agent_rows(
            source=source,
            council=current_council,
            truth=current_truth,
            performance=perf,
            control=control(),
            storage_campaign={"status": "NONE"},
            recovery_campaign={
                "status": "RUNNING_CAPTURE",
                "completed_classes": ["managed_user_media"],
                "ordinary_classes": [
                    "managed_user_media",
                    "legacy_direct_message_attachments",
                    "radio_wolo_private_media",
                    "parser_evidence_corpus",
                    "raw_replay_archive",
                ],
            },
        )
        self.assertEqual(len(agents), 9)
        self.assertEqual(
            [item["label"] for item in agents[:-1]],
            [
                "Release OS",
                "Documentation OS",
                "Storage OS",
                "Host OS",
                "Recovery OS",
                "Workspace OS",
                "Speed OS",
                "Replay Truth OS",
            ],
        )
        recovery_agent = next(item for item in agents if item["key"] == "recovery")
        self.assertEqual(recovery_agent["state"], "ACTIVE")
        self.assertEqual(recovery_agent["progress_percent"], 20.0)
        self.assertEqual(agents[-1]["label"], "System Doctor")

        live_agents = MODULE.system_agent_rows(
            source=source,
            council=current_council,
            truth=current_truth,
            performance=perf,
            control=control(),
            storage_campaign={"status": "NONE"},
            recovery_campaign={
                "status": "RUNNING_CAPTURE",
                "completed_classes": ["managed_user_media"],
                "ordinary_classes": list(MODULE.aoe2_recovery_campaign.ORDINARY_CLASSES),
                "current_class": "raw_replay_archive",
                "live_capture": {
                    "overall_percent": 37.4,
                    "sealed_chunks": 7,
                    "eta_seconds": 1234,
                    "elapsed_seconds": 456,
                    "observed_bytes": 700,
                    "expected_bytes": 1900,
                    "throughput_bytes_per_second": 12.5,
                    "progress_basis": "sealed + active encrypted chunk bytes",
                },
            },
        )
        live_recovery = next(
            item for item in live_agents if item["key"] == "recovery"
        )
        self.assertEqual(live_recovery["progress_percent"], 37.4)
        self.assertEqual(live_recovery["sealed_chunks"], 7)
        self.assertEqual(live_recovery["eta_seconds"], 1234)
        self.assertIn("7 chunks", live_recovery["progress_label"])

        external = MODULE.external_agent_rows(current_council)
        self.assertEqual(external[0]["name"], "Codex")
        self.assertEqual(external[0]["state"], "ACTIVE")

    def test_source_system_classification_is_deterministic(self):
        self.assertEqual(
            MODULE.classify_source_system(
                ["scripts/aoe2_recovery.py", "docs/EVIDENCE_VAULT.md"],
                "Harden recovery proof",
            ),
            "Recovery OS",
        )
        self.assertEqual(
            MODULE.classify_source_system(
                ["scripts/aoe2_recovery.py", "scripts/aoe2_storage.py"],
                "Cross-system contract",
            ),
            "Kingdom Intelligence",
        )

    def test_attention_invariant_prevents_false_ready(self):
        source = MODULE.source_summary(release())
        perf = performance()
        perf["matches_current_release"] = True
        rows = MODULE.invariant_rows(
            source=source,
            council=council(),
            truth=truth(),
            finish=finish(complete=False),
            control=control(),
            performance=perf,
        )
        self.assertEqual(
            MODULE.operating_state(
                source=source,
                council=council(),
                invariants=rows,
            ),
            "ATTENTION",
        )

    def test_storage_summary_uses_storage_available_bytes_and_release_root(self):
        source = MODULE.source_summary(release())
        source["production"]["root_free_kb"] = 7 * 1024 * 1024
        summary = MODULE.storage_summary(
            {
                "health": "ATTENTION",
                "used_percent": 90.44,
                "available_bytes": 28 * 1024 * 1024 * 1024,
            },
            source,
        )
        self.assertEqual(
            summary["volume_free_bytes"],
            28 * 1024 * 1024 * 1024,
        )
        self.assertEqual(
            summary["root_free_bytes"],
            7 * 1024 * 1024 * 1024,
        )

    def test_attention_when_production_is_behind_or_p1_exists(self):
        source = MODULE.source_summary(release(exact=False))
        perf = performance()
        perf["matches_current_release"] = True
        rows = MODULE.invariant_rows(
            source=source,
            council=council(p1=1),
            truth=truth(),
            finish=finish(),
            control=control(),
            performance=perf,
        )
        self.assertEqual(
            MODULE.operating_state(
                source=source,
                council=council(p1=1),
                invariants=rows,
            ),
            "ATTENTION",
        )

    def test_control_blocker_outranks_recovery_and_speed_work(self):
        perf = performance()
        perf["matches_current_release"] = False
        rows = MODULE.brain_recommendations(
            finish=finish(complete=False),
            control=control(status="blocked"),
            performance=perf,
            truth=truth(),
            council_recommendations=[
                {
                    "rank": 10,
                    "key": "offsite-evidence",
                    "level": "MUST FIX",
                    "title": "Complete off-host recovery proof",
                    "reason": "shared failure domain",
                    "action": "aoe2war recovery plan",
                }
            ],
        )
        self.assertEqual(rows[0]["key"], "control-state-blocked")
        self.assertEqual(rows[1]["key"], "speed-verify-open-campaign")

    def test_verified_campaign_uses_after_release_as_current_performance_truth(self):
        now = datetime(2026, 9, 7, 2, 10, tzinfo=timezone.utc)
        campaign = {
            "campaign_id": "before-after",
            "status": "verified",
            "started_at": "2026-09-05T22:44:24Z",
            "verified_at": "2026-09-07T02:10:00Z",
            "baseline": {
                "release_sha": "b" * 40,
                "build_id": "before-build",
                "route_count": 77,
                "cohort": {
                    "ttfb_p50_ms": 400.0,
                    "total_p50_ms": 587.2,
                },
            },
            "analysis": {"targets": []},
            "verification": {
                "status": "WARN",
                "release_sha": "a" * 40,
                "build_id": "after-build",
                "build_version": "after-version",
                "material_improvements": 7,
                "material_regressions": 3,
                "overall": {
                    "ttfb_p50_before_ms": 400.0,
                    "ttfb_p50_after_ms": 384.4,
                    "total_p50_before_ms": 587.2,
                    "total_p50_after_ms": 556.1,
                },
            },
        }
        with patch.object(
            MODULE.aoe2_speed_campaign,
            "latest_campaign",
            return_value=campaign,
        ):
            perf = MODULE.latest_performance(now)

        self.assertEqual(perf["release_sha"], "a" * 40)
        self.assertEqual(perf["baseline_release_sha"], "b" * 40)
        self.assertEqual(perf["verification_release_sha"], "a" * 40)
        self.assertEqual(perf["build_id"], "after-build")
        self.assertEqual(
            perf["verification"]["total_p50_after_ms"],
            556.1,
        )

    def test_certified_finish_demotes_storage_to_maintenance(self):
        perf = performance()
        perf["matches_current_release"] = True
        rows = MODULE.brain_recommendations(
            finish=finish(complete=True),
            control=control(status="current"),
            performance=perf,
            truth=truth(),
            council_recommendations=[],
            storage={
                "health": "MAINTENANCE_DUE",
                "used_percent": 84.5,
            },
        )
        storage_row = next(
            row
            for row in rows
            if row["key"] == "storage-headroom-maintenance"
        )
        self.assertEqual(storage_row["rank"], 9)
        self.assertEqual(storage_row["level"], "MAINTENANCE")
        self.assertNotIn("rerunning Finish", storage_row["title"])
        self.assertNotIn(
            "storage-blocks-finish",
            [row["key"] for row in rows],
        )

    def test_storage_pressure_outranks_finish_rerun(self):
        perf = performance()
        perf["matches_current_release"] = False
        rows = MODULE.brain_recommendations(
            finish=finish(complete=False),
            control=control(status="current"),
            performance=perf,
            truth=truth(),
            council_recommendations=[],
            storage={
                "health": "ATTENTION",
                "used_percent": 91.0,
            },
        )
        self.assertEqual(rows[0]["key"], "storage-blocks-finish")
        self.assertEqual(
            rows[0]["action"],
            "aoe2war storage plan --json",
        )
        self.assertEqual(rows[1]["key"], "finish-closure")
        self.assertEqual(rows[2]["key"], "speed-verify-open-campaign")

    def test_analyzed_before_campaign_recommends_verify_not_new_baseline(self):
        perf = performance()
        perf["matches_current_release"] = False
        rows = MODULE.brain_recommendations(
            finish=finish(),
            control=control(status="current"),
            performance=perf,
            truth=truth(),
            council_recommendations=[],
            storage={
                "health": "HEALTHY",
                "used_percent": 70.0,
            },
        )
        self.assertEqual(rows[0]["key"], "speed-verify-open-campaign")
        self.assertEqual(
            rows[0]["action"],
            "aoe2war speed campaign verify",
        )

    def test_current_control_allows_finish_closure_recommendation(self):
        perf = performance()
        perf["matches_current_release"] = True
        rows = MODULE.brain_recommendations(
            finish=finish(complete=False),
            control=control(status="current"),
            performance=perf,
            truth=truth(),
            council_recommendations=[],
        )
        self.assertEqual(rows[0]["key"], "finish-closure")
        self.assertEqual(
            rows[0]["action"],
            "aoe2war finish --preserve-context-history",
        )

    def test_old_replay_closure_is_not_current_truth(self):
        old_truth = truth()
        old_truth["production_source"] = "b" * 40
        old_truth["matches_current_release"] = False
        perf = performance()
        perf["matches_current_release"] = True
        rows = MODULE.invariant_rows(
            source=MODULE.source_summary(release()),
            council=council(),
            truth=old_truth,
            finish=finish(),
            control=control(),
            performance=perf,
        )
        replay = next(
            row for row in rows
            if row["key"] == "replay-certainty-accounted"
        )
        self.assertEqual(replay["status"], "ATTENTION")

        recs = MODULE.brain_recommendations(
            finish=finish(),
            control=control(),
            performance=perf,
            truth=old_truth,
            council_recommendations=[],
        )
        self.assertEqual(recs[0]["key"], "replay-certainty-current-release")

    def test_wolo_boundary_failure_blocks(self):
        broken_release = release()
        broken_release["production"]["wolo_8092_count"] = 0
        source = MODULE.source_summary(broken_release)
        perf = performance()
        perf["matches_current_release"] = True
        rows = MODULE.invariant_rows(
            source=source,
            council=council(),
            truth=truth(),
            finish=finish(),
            control=control(),
            performance=perf,
        )
        self.assertEqual(
            next(
                row["status"]
                for row in rows
                if row["key"] == "wolo-listener-boundary"
            ),
            "FAIL",
        )
        self.assertEqual(
            MODULE.operating_state(
                source=source,
                council=council(),
                invariants=rows,
            ),
            "BLOCKED",
        )


if __name__ == "__main__":
    unittest.main()
