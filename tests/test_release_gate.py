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


    def test_operator_cli_is_infrastructure_risk(self):
        self.assertEqual(MODULE.path_risk("bin/aoe2war"), "INFRASTRUCTURE")

    def test_operator_cli_triggers_full_release_suite(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["bin/aoe2war"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        release_tests = [args for label, args, _timeout in plan if label == "release-engineering-tests"]
        self.assertEqual(len(release_tests), 1)
        self.assertIn("tests/test_aoe2_cli.py", release_tests[0])

    def test_rollback_tooling_is_infrastructure_and_compiled(self):
        self.assertEqual(
            MODULE.path_risk("scripts/aoe2_release_rollback.py"),
            "INFRASTRUCTURE",
        )
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_release_rollback.py"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        compile_commands = [
            args for label, args, _timeout in plan
            if label == "release-python-compile"
        ]
        self.assertEqual(len(compile_commands), 1)
        self.assertIn("scripts/aoe2_release_rollback.py", compile_commands[0])


    def test_rollback_tooling_triggers_full_release_suite(self):
        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": ["scripts/aoe2_release_rollback.py"],
        }
        plan = MODULE.command_plan(scope, "INFRASTRUCTURE")
        release_tests = [
            args for label, args, _timeout in plan
            if label == "release-engineering-tests"
        ]
        self.assertEqual(len(release_tests), 1)
        self.assertIn("tests/test_release_rollback.py", release_tests[0])

if __name__ == "__main__":
    unittest.main()
