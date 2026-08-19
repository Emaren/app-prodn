import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

SPEED = ROOT / "scripts" / "aoe2_speed.py"
GATE = ROOT / "scripts" / "aoe2_release_gate.py"

SPEED_SPEC = importlib.util.spec_from_file_location("aoe2_speed", SPEED)
SPEED_MODULE = importlib.util.module_from_spec(SPEED_SPEC)
assert SPEED_SPEC and SPEED_SPEC.loader
SPEED_SPEC.loader.exec_module(SPEED_MODULE)

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


if __name__ == "__main__":
    unittest.main()
