"""Phase 12: fail-closed, never-mutating registered build review tests."""
import importlib.util
import os
import pathlib
import tempfile
import time
import types
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "aoe2_storage_phase12", ROOT / "scripts" / "aoe2_storage.py"
)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GeneratedWorktreeCensusTests(unittest.TestCase):
    def setup_project(self, home):
        project = pathlib.Path(home) / "projects" / "AoE2HDBets"
        for name in ("app-prodn", "api-prodn"):
            (project / name).mkdir(parents=True)
        return project

    def worktree_listing(self, project, chosen):
        def execute(args, **kwargs):
            repo = pathlib.Path(args[args.index("-C") + 1])
            entries = [repo]
            if repo.name == "app-prodn":
                entries.extend(chosen)
            return types.SimpleNamespace(
                returncode=0,
                stdout="".join(f"worktree {p}\nHEAD {'0'*40}\n\n" for p in entries),
                stderr="",
            )
        return execute

    def test_old_large_generation_alert_never_grants_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            project = self.setup_project(temp)
            wt = project / ".aoe2war-workspaces" / "app-prodn" / "historic-site"
            generated = wt / ".next"
            generated.mkdir(parents=True)
            old = time.time() - 12 * 86400
            os.utime(generated, (old, old))
            with mock.patch.object(
                MODULE.subprocess, "run",
                side_effect=self.worktree_listing(project, [wt]),
            ) as call, mock.patch.object(
                MODULE, "_bounded_allocated_bytes", return_value=(2 * 1024 ** 3, True)
            ):
                result = MODULE.local_generated_worktree_census(home=pathlib.Path(temp))
            rows = [x for x in result["rows"] if x["worktree"] == "historic-site"]
            self.assertEqual(result["status"], "PASS")
            self.assertEqual(len(rows), 1)
            self.assertTrue(rows[0]["retention_review_alert"])
            self.assertEqual(rows[0]["mutation_authority"], "NONE")
            self.assertFalse(result["mutation_allowed"])
            self.assertTrue(generated.is_dir())
            self.assertTrue(all("worktree" in x.args[0] for x in call.call_args_list))

    def test_financial_codex_build_always_protected_despite_age_and_size(self):
        with tempfile.TemporaryDirectory() as temp:
            project = self.setup_project(temp)
            wt = project / ".aoe2war-workspaces" / "app-prodn" / "codex-satchel-financial"
            generated = wt / ".next"
            generated.mkdir(parents=True)
            old = time.time() - 30 * 86400
            os.utime(generated, (old, old))
            with mock.patch.object(MODULE.subprocess, "run",
                    side_effect=self.worktree_listing(project, [wt])), mock.patch.object(
                    MODULE, "_bounded_allocated_bytes", return_value=(3 * 1024 ** 3, True)):
                result = MODULE.local_generated_worktree_census(home=pathlib.Path(temp))
            candidate = next(x for x in result["rows"] if x["worktree"] == wt.name)
            self.assertEqual(candidate["classification"], "HOLD_FINANCIAL_OR_CODEX")
            self.assertFalse(candidate["retention_review_alert"])
            self.assertEqual(candidate["mutation_authority"], "NONE")
            self.assertTrue(generated.exists())

    def test_symlink_build_not_followed_or_measured(self):
        with tempfile.TemporaryDirectory() as temp:
            project = self.setup_project(temp)
            wt = project / ".aoe2war-workspaces" / "app-prodn" / "historic"
            wt.mkdir(parents=True)
            protected = pathlib.Path(temp) / "financial-original"
            protected.mkdir()
            (wt / ".next").symlink_to(protected, target_is_directory=True)
            with mock.patch.object(MODULE.subprocess, "run",
                    side_effect=self.worktree_listing(project, [wt])), mock.patch.object(
                    MODULE, "_bounded_allocated_bytes"
            ) as du:
                result = MODULE.local_generated_worktree_census(home=pathlib.Path(temp))
            row = next(x for x in result["rows"] if x["worktree"] == "historic")
            self.assertEqual(row["classification"], "HOLD_GENERATED_NOT_REGULAR_DIRECTORY")
            self.assertFalse(row["probe_ok"])
            self.assertIsNone(row["allocated_bytes"])
            du.assert_not_called()
            self.assertTrue(protected.is_dir())

    def test_registry_limit_is_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            project = self.setup_project(temp)
            candidates = [
                project / ".aoe2war-workspaces" / "app-prodn" / ("candidate-" + str(i))
                for i in range(49)
            ]
            with mock.patch.object(
                MODULE.subprocess, "run",
                side_effect=self.worktree_listing(project, candidates),
            ):
                result = MODULE.local_generated_worktree_census(home=pathlib.Path(temp))
            self.assertEqual(result["status"], "HOLD_WORKTREE_COUNT_LIMIT")
            self.assertFalse(result["mutation_allowed"])
            self.assertEqual(result["rows"], [])


if __name__ == "__main__":
    unittest.main()
