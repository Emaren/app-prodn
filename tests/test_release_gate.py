import importlib.util
import pathlib
import unittest

SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "scripts" / "aoe2_release_gate.py"
SPEC = importlib.util.spec_from_file_location("aoe2_release_gate", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


class ReleaseGateTests(unittest.TestCase):
    def test_documentation_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["docs/RELEASE_ENGINEERING.md"]),
            "DOCUMENTATION",
        )

    def test_database_risk_wins(self):
        self.assertEqual(
            MODULE.classify_risk(
                ["app/AppShell.tsx", "prisma/migrations/20260809_x/migration.sql"]
            ),
            "DATABASE",
        )

    def test_financial_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["lib/bets.ts"]),
            "FINANCIAL",
        )

    def test_replay_truth_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["lib/unresolvedWatcherResult.ts"]),
            "REPLAY_TRUTH",
        )

    def test_watcher_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["lib/watcherSession.ts"]),
            "WATCHER",
        )

    def test_infrastructure_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["scripts/aoe2_release_gate.py"]),
            "INFRASTRUCTURE",
        )

    def test_presentation_risk(self):
        self.assertEqual(
            MODULE.classify_risk(["app/AppShell.tsx"]),
            "PRESENTATION",
        )

    def test_application_default(self):
        self.assertEqual(
            MODULE.classify_risk(["app/api/forum/route.ts"]),
            "APPLICATION",
        )

    def test_no_change(self):
        self.assertEqual(MODULE.classify_risk([]), "NO_CHANGE")

    def test_focused_tests_are_deduplicated(self):
        scripts = MODULE.focused_npm_tests(
            ["lib/replay.ts", "tests/hd-replay-truth.test.mts"]
        )
        self.assertEqual(scripts.count("test:replay-truth"), 1)


if __name__ == "__main__":
    unittest.main()
