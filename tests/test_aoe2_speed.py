import importlib.util
import pathlib
import sys
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]

SPEED = ROOT / "scripts" / "aoe2_speed.py"
SPEED_CAMPAIGN = ROOT / "scripts" / "aoe2_speed_campaign.py"
SPEED_INVENTORY = ROOT / "scripts" / "aoe2_speed_inventory.py"
GATE = ROOT / "scripts" / "aoe2_release_gate.py"

SPEED_SPEC = importlib.util.spec_from_file_location("aoe2_speed", SPEED)
SPEED_MODULE = importlib.util.module_from_spec(SPEED_SPEC)
assert SPEED_SPEC and SPEED_SPEC.loader
SPEED_SPEC.loader.exec_module(SPEED_MODULE)
sys.modules["aoe2_speed"] = SPEED_MODULE

INVENTORY_SPEC = importlib.util.spec_from_file_location(
    "aoe2_speed_inventory",
    SPEED_INVENTORY,
)
INVENTORY_MODULE = importlib.util.module_from_spec(INVENTORY_SPEC)
assert INVENTORY_SPEC and INVENTORY_SPEC.loader
INVENTORY_SPEC.loader.exec_module(INVENTORY_MODULE)
sys.modules["aoe2_speed_inventory"] = INVENTORY_MODULE

CAMPAIGN_SPEC = importlib.util.spec_from_file_location(
    "aoe2_speed_campaign",
    SPEED_CAMPAIGN,
)
CAMPAIGN_MODULE = importlib.util.module_from_spec(CAMPAIGN_SPEC)
assert CAMPAIGN_SPEC and CAMPAIGN_SPEC.loader
CAMPAIGN_SPEC.loader.exec_module(CAMPAIGN_MODULE)

GATE_SPEC = importlib.util.spec_from_file_location("aoe2_release_gate", GATE)
GATE_MODULE = importlib.util.module_from_spec(GATE_SPEC)
assert GATE_SPEC and GATE_SPEC.loader
GATE_SPEC.loader.exec_module(GATE_MODULE)


class PerformanceOSTests(unittest.TestCase):
    def test_percentile_contract(self):
        self.assertEqual(
            SPEED_MODULE.percentile([1.0, 2.0, 3.0], 0.5),
            2.0,
        )

    def test_cohort_summary_uses_route_medians(self):
        rows = [
            {
                "path": "/a",
                "median_ttfb_ms": 100.0,
                "median_total_ms": 200.0,
            },
            {
                "path": "/b",
                "median_ttfb_ms": 300.0,
                "median_total_ms": 400.0,
            },
            {
                "path": "/c",
                "median_ttfb_ms": 900.0,
                "median_total_ms": 1000.0,
            },
        ]

        summary = SPEED_MODULE.summarize_route_cohort(rows)

        self.assertEqual(summary["ttfb_p50_ms"], 300.0)
        self.assertEqual(summary["total_p50_ms"], 400.0)

    def test_cohort_identity_requires_same_mode_and_routes(self):
        full_a = {
            "mode": "full",
            "routes": [{"path": "/"}, {"path": "/bets"}],
        }
        full_b = {
            "mode": "full",
            "routes": [{"path": "/"}, {"path": "/bets"}],
        }
        quick = {
            "mode": "quick",
            "routes": [{"path": "/"}, {"path": "/bets"}],
        }
        different = {
            "mode": "full",
            "routes": [{"path": "/"}, {"path": "/players"}],
        }

        self.assertEqual(
            SPEED_MODULE.cohort_identity(full_a),
            SPEED_MODULE.cohort_identity(full_b),
        )
        self.assertNotEqual(
            SPEED_MODULE.cohort_identity(full_a),
            SPEED_MODULE.cohort_identity(quick),
        )
        self.assertNotEqual(
            SPEED_MODULE.cohort_identity(full_a),
            SPEED_MODULE.cohort_identity(different),
        )


    def test_quick_cohort_is_unique_and_critical(self):
        routes = SPEED_MODULE.QUICK_ROUTES
        self.assertEqual(len(routes), len(set(routes)))
        self.assertIn("/", routes)
        self.assertIn("/bets", routes)
        self.assertIn("/live-games", routes)
        self.assertIn("/players", routes)

    def test_speed_tooling_is_infrastructure_risk(self):
        self.assertEqual(
            GATE_MODULE.path_risk("scripts/aoe2_speed.py"),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            GATE_MODULE.path_risk("tests/test_aoe2_speed.py"),
            "INFRASTRUCTURE",
        )

    def test_speed_change_triggers_its_release_contract(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_speed.py"],
        }
        plan = GATE_MODULE.command_plan(scope, "INFRASTRUCTURE")
        tests = [
            args
            for label, args, _timeout in plan
            if label == "release-engineering-tests"
        ]
        self.assertEqual(len(tests), 1)
        self.assertIn("tests/test_aoe2_speed.py", tests[0])

        compiles = [
            args
            for label, args, _timeout in plan
            if label == "release-python-compile"
        ]
        self.assertEqual(len(compiles), 1)
        self.assertIn("scripts/aoe2_speed.py", compiles[0])

    def test_stage_source_emits_subphase_timing_evidence(self):
        source = (
            ROOT / "scripts" / "aoe2_release_stage.py"
        ).read_text(encoding="utf-8")
        self.assertIn('TIMING_FILE="$RECEIPT/stage-timings.tsv"', source)
        self.assertIn("timing_record dependency_fetch", source)
        self.assertIn("timing_record offline_build", source)
        self.assertIn("timing_record artifact_relocation", source)
        self.assertIn("timing_record artifact_hash", source)
        self.assertIn("timing_record dependency_hash", source)
        self.assertIn("timing_record stage_total", source)
        self.assertIn('"timings_ms": timings_ms', source)
        self.assertIn('"duration_seconds": stage_duration_seconds', source)

    def test_stage_wall_timer_is_scoped_to_stage_release(self):
        source = (
            ROOT / "scripts" / "aoe2_release_stage.py"
        ).read_text(encoding="utf-8")

        persist = source.split(
            "def persist_durable_stage_receipt",
            1,
        )[1].split(
            "\ndef stage_release(",
            1,
        )[0]

        stage = source.split(
            "\ndef stage_release(",
            1,
        )[1]

        self.assertNotIn(
            "stage_started_monotonic = time.monotonic()",
            persist,
        )
        self.assertIn(
            "stage_started_monotonic = time.monotonic()",
            stage,
        )
        self.assertLess(
            stage.index(
                "stage_started_monotonic = time.monotonic()"
            ),
            stage.index("p = run("),
        )
        self.assertIn(
            "time.monotonic() - stage_started_monotonic",
            stage,
        )

    def test_remote_stage_timing_is_observational(self):
        source = (
            ROOT / "scripts" / "aoe2_release_stage.py"
        ).read_text(encoding="utf-8")

        self.assertIn(
            "date +%s%N 2>/dev/null || true",
            source,
        )
        self.assertIn(
            '>> "$TIMING_FILE" 2>/dev/null || true',
            source,
        )


    def test_fast_retention_proof_lookup_is_bounded_and_timed(self):
        source = (
            ROOT / "scripts" / "aoe2_release_ship.py"
        ).read_text(encoding="utf-8")

        region = source.split(
            "# VERIFIED FAST-ROLLBACK RETENTION",
            1,
        )[1].split(
            "\ndef validate_activation_result",
            1,
        )[0]

        self.assertIn("find_durable_build_proof()", region)
        self.assertIn("/aoe2war/rollbacks/*/next/BUILD_ID", region)
        self.assertIn("find_rescue_build_proof()", region)
        self.assertIn(
            "/aoe2war/deploy-receipts/*/current-next/BUILD_ID",
            region,
        )
        self.assertNotIn(
            "find /mnt/HC_Volume_105319120/aoe2war/rollbacks",
            region,
        )
        self.assertNotIn(
            "find /mnt/HC_Volume_105319120/aoe2war/deploy-receipts",
            region,
        )
        self.assertIn("proof_lookup_ms=$RETENTION_PROOF_MS", region)
        self.assertIn("size_probe_ms=$RETENTION_SIZE_MS", region)
        self.assertIn("delete_ms=$RETENTION_DELETE_MS", region)
        self.assertIn("total_ms=$RETENTION_TOTAL_MS", region)


    def test_activation_receipt_records_wall_duration(self):
        source = (
            ROOT / "scripts" / "aoe2_release_ship.py"
        ).read_text(encoding="utf-8")
        self.assertIn(
            "activation_started_monotonic = time.monotonic()",
            source,
        )
        self.assertIn(
            '"duration_seconds": activation_duration_seconds',
            source,
        )

    def test_cli_exposes_speed_family(self):
        source = (ROOT / "bin" / "aoe2war").read_text(encoding="utf-8")
        self.assertIn('SPEED="$BIN_DIR/../scripts/aoe2_speed.py"', source)
        self.assertIn("  speed)", source)


    def test_speed_campaign_material_delta_policy(self):
        self.assertEqual(
            CAMPAIGN_MODULE.material_delta(
                400.0,
                520.0,
                floor_ms=100.0,
            ),
            "regression",
        )
        self.assertEqual(
            CAMPAIGN_MODULE.material_delta(
                500.0,
                380.0,
                floor_ms=100.0,
            ),
            "improvement",
        )
        self.assertIsNone(
            CAMPAIGN_MODULE.material_delta(
                400.0,
                450.0,
                floor_ms=100.0,
            )
        )

    def test_old_release_campaign_does_not_block_new_release_baseline(self):
        existing = {
            "campaign_id": "old",
            "status": "analyzed",
            "baseline": {"release_sha": "a" * 40},
        }
        baseline = {
            "mode": "full",
            "release_sha": "b" * 40,
            "build_id": "build",
            "build_version": "version",
            "rounds": 3,
            "route_count": 1,
            "cohort": {
                "ttfb_p50_ms": 100.0,
                "total_p50_ms": 200.0,
            },
            "routes": [
                {
                    "path": "/",
                    "median_ttfb_ms": 100.0,
                    "median_total_ms": 200.0,
                }
            ],
            "_path": ROOT / ".aoe2war-release" / "performance" / "new.json",
        }
        with (
            patch.object(
                CAMPAIGN_MODULE,
                "latest_campaign",
                return_value=existing,
            ),
            patch.object(
                SPEED_MODULE,
                "collect_release_identity",
                return_value={"release_sha": "b" * 40},
            ),
            patch.object(
                CAMPAIGN_MODULE,
                "campaign_source_inventory",
                return_value={},
            ),
            patch.object(
                SPEED_MODULE,
                "benchmark",
                return_value=baseline,
            ),
            patch.object(
                CAMPAIGN_MODULE,
                "analyze_baseline",
                return_value={},
            ),
            patch.object(
                CAMPAIGN_MODULE,
                "write_campaign",
            ),
            patch.object(
                CAMPAIGN_MODULE,
                "git_head",
                return_value="b" * 40,
            ),
        ):
            campaign = CAMPAIGN_MODULE.start_campaign(
                full=True,
                rounds=3,
                force_new=False,
            )

        self.assertEqual(
            campaign["baseline"]["release_sha"],
            "b" * 40,
        )

    def test_same_release_open_campaign_still_requires_explicit_override(self):
        existing = {
            "campaign_id": "same",
            "status": "analyzed",
            "baseline": {"release_sha": "b" * 40},
        }
        with (
            patch.object(
                CAMPAIGN_MODULE,
                "latest_campaign",
                return_value=existing,
            ),
            patch.object(
                SPEED_MODULE,
                "collect_release_identity",
                return_value={"release_sha": "b" * 40},
            ),
        ):
            with self.assertRaises(CAMPAIGN_MODULE.CampaignError):
                CAMPAIGN_MODULE.start_campaign(
                    full=True,
                    rounds=3,
                    force_new=False,
                )

    def test_speed_campaign_verifies_every_route_and_flags_regression(self):
        before = {
            "mode": "quick",
            "routes": [
                {
                    "path": "/",
                    "median_ttfb_ms": 300.0,
                    "median_total_ms": 500.0,
                },
                {
                    "path": "/bets",
                    "median_ttfb_ms": 400.0,
                    "median_total_ms": 600.0,
                },
            ],
            "cohort": {
                "ttfb_p50_ms": 350.0,
                "total_p50_ms": 550.0,
            },
        }
        after = {
            "mode": "quick",
            "routes": [
                {
                    "path": "/",
                    "median_ttfb_ms": 300.0,
                    "median_total_ms": 500.0,
                },
                {
                    "path": "/bets",
                    "median_ttfb_ms": 550.0,
                    "median_total_ms": 800.0,
                },
            ],
            "cohort": {
                "ttfb_p50_ms": 425.0,
                "total_p50_ms": 650.0,
            },
        }

        result = CAMPAIGN_MODULE.verify_routes(before, after)

        self.assertEqual(result["status"], "WARN")
        self.assertEqual(result["material_regressions"], 1)
        self.assertEqual(
            next(
                row
                for row in result["routes"]
                if row["path"] == "/bets"
            )["verdict"],
            "regression",
        )

        bets = next(
            row
            for row in result["routes"]
            if row["path"] == "/bets"
        )
        self.assertLess(bets["total_faster_percent"], 0)
        self.assertLess(bets["total_saved_ms"], 0)
        self.assertIn(
            "slower",
            CAMPAIGN_MODULE.operator_change(
                bets["before_total_ms"],
                bets["after_total_ms"],
            ),
        )

    def test_speed_operator_change_uses_positive_faster_language(self):
        self.assertEqual(
            CAMPAIGN_MODULE.operator_change(500.0, 300.0),
            "40.0% faster · 200.0 ms saved",
        )
        self.assertEqual(
            CAMPAIGN_MODULE.operator_change(300.0, 450.0),
            "50.0% slower · 150.0 ms added",
        )

    def test_speed_campaign_source_is_before_analyze_after_and_non_mutating(self):
        source = SPEED_CAMPAIGN.read_text(encoding="utf-8")
        self.assertIn('sub.add_parser("start")', source)
        self.assertIn('sub.add_parser("analyze")', source)
        self.assertIn('sub.add_parser("verify")', source)
        self.assertIn("speed.benchmark", source)
        self.assertIn("prior_campaign_learning", source)
        self.assertIn("historical regression", source)
        self.assertNotIn("aoe2war finish", source)
        self.assertNotIn("release_ship", source)

    def test_cli_exposes_speed_campaign_family(self):
        source = (ROOT / "bin" / "aoe2war").read_text(encoding="utf-8")
        self.assertIn(
            'SPEED_CAMPAIGN="$BIN_DIR/../scripts/aoe2_speed_campaign.py"',
            source,
        )
        self.assertIn('[ "${1:-}" = "campaign" ]', source)


    def test_speed_incident_advice_surfaces_archive_and_telemetry_failures(self):
        baseline = {
            "performance_incidents": {
                "available": True,
                "window_minutes": 60,
                "counts": {
                    "physical_archive_scan_timeout": 2,
                    "speed_telemetry_timeout": 1,
                    "upstream_timeout": 3,
                    "database_error": 0,
                    "memory_pressure": 0,
                },
            },
        }

        advice = CAMPAIGN_MODULE.incident_advice(baseline)

        self.assertEqual(advice["available"], True)
        self.assertEqual(len(advice["findings"]), 2)
        self.assertTrue(
            any("precomputed snapshot" in action for action in advice["actions"])
        )
        self.assertTrue(
            any("Traffic performance-ingest" in action for action in advice["actions"])
        )

    def test_speed_benchmark_records_recent_incident_counts(self):
        source = SPEED.read_text(encoding="utf-8")
        self.assertIn("def production_performance_incidents", source)
        self.assertIn("journalctl -u aoe2hdbets-web.service", source)
        self.assertIn("physical archive scan exceeded", source)
        self.assertIn("Speed telemetry relay failed", source)
        self.assertIn('"performance_incidents": incidents', source)


    def test_speed_capacity_advice_prioritizes_delivery_and_rejects_gpu(self):
        baseline = {
            "origin_seam": {
                "ratio": 5.0,
                "public_median_ttfb_ms": 500.0,
                "origin_median_ttfb_ms": 50.0,
            },
            "cohort": {
                "ttfb_p75_ms": 420.0,
            },
            "production_capacity": {
                "available": True,
                "cpu_count": 4,
                "load1": 1.2,
                "mem_total_kb": 8 * 1024 * 1024,
                "mem_available_kb": 3 * 1024 * 1024,
                "swap_total_kb": 6 * 1024 * 1024,
                "swap_free_kb": 5 * 1024 * 1024,
                "root_total_kb": 40 * 1024 * 1024,
                "root_free_kb": 8 * 1024 * 1024,
                "volume_total_kb": 300 * 1024 * 1024,
                "volume_free_kb": 30 * 1024 * 1024,
            },
        }

        advice = CAMPAIGN_MODULE.capacity_advice(baseline)

        self.assertEqual(advice["hardware"]["delivery"]["action"], "priority")
        self.assertEqual(advice["hardware"]["cpu"]["action"], "hold")
        self.assertEqual(advice["hardware"]["memory"]["action"], "hold")
        self.assertEqual(
            advice["hardware"]["storage"]["action"],
            "expand_for_headroom",
        )
        self.assertEqual(advice["hardware"]["gpu"]["action"], "do_not_buy")

    def test_speed_benchmark_records_read_only_capacity_evidence(self):
        source = SPEED.read_text(encoding="utf-8")
        self.assertIn("def production_capacity_snapshot", source)
        self.assertIn('"production_capacity": capacity', source)
        self.assertIn("systemctl show aoe2hdbets-web.service", source)
        self.assertIn("df -Pk", source)
        self.assertNotIn("systemctl restart", source)
        self.assertNotIn("apt install", source)


    def test_full_speed_cohort_v2_covers_current_world_surfaces(self):
        routes = SPEED_MODULE.route_list(True)
        self.assertEqual(len(routes), 77)
        self.assertEqual(len(routes), len(set(routes)))
        for route in (
            "/wargraph",
            "/national-champions",
            "/kingdom-forge",
            "/round-chamber",
            "/oracle",
            "/speed",
            "/market/kingdom/chat-effects",
            "/market/shops/chat-effects",
            "/about",
            "/belts",
            "/nations",
            "/pending-bets",
            "/realm",
            "/roadmap",
            "/users",
            "/wolo-1",
        ):
            self.assertIn(route, routes)

    def test_campaign_inventory_delta_tracks_asset_and_page_changes(self):
        before = {
            "source_page_count": 2,
            "pages": [{"template": "/"}, {"template": "/bets"}],
            "assets": {
                "total_files": 10,
                "total_bytes": 1_000,
                "duplicate_avoidable_bytes": 200,
            },
        }
        after = {
            "source_page_count": 2,
            "pages": [{"template": "/"}, {"template": "/bets"}],
            "assets": {
                "total_files": 8,
                "total_bytes": 700,
                "duplicate_avoidable_bytes": 50,
            },
        }

        delta = CAMPAIGN_MODULE.inventory_delta(before, after)

        self.assertEqual(delta["added_page_templates"], [])
        self.assertEqual(delta["removed_page_templates"], [])
        self.assertEqual(delta["public_asset_bytes_delta"], -300)
        self.assertEqual(delta["duplicate_avoidable_bytes_delta"], -150)

    def test_campaign_source_inventory_is_archived_in_baseline(self):
        source = SPEED_CAMPAIGN.read_text(encoding="utf-8")

        self.assertIn("source_inventory = campaign_source_inventory()", source)
        self.assertIn('"source_inventory": source_inventory', source)
        self.assertIn('verification["source_inventory"]', source)


    def test_speed_receipts_bind_to_production_source_not_operator_head(self):
        source = SPEED.read_text(encoding="utf-8")
        identity_block = source[
            source.index("def collect_release_identity"):
            source.index("def route_list")
        ]
        self.assertIn(
            '"release_sha": data.get("production", {}).get("source_sha")',
            identity_block,
        )
        self.assertIn(
            '"operator_source_sha": data.get("local", {}).get("head")',
            identity_block,
        )
        self.assertNotIn(
            '"release_sha": data.get("local", {}).get("head")',
            identity_block,
        )


if __name__ == "__main__":
    unittest.main()
