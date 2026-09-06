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
        self.assertTrue(
            all(row["status"] == "PASS" for row in payload["invariants"])
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
