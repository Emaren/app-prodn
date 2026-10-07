from __future__ import annotations

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/aoe2_native_control.py"


def load_module(name, script):
    spec = importlib.util.spec_from_file_location(name, script)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


MODULE = load_module("scripts.aoe2_native_control", SCRIPT)
TRUTH = load_module("aoe2_truth_native_control_test", ROOT / "scripts/aoe2_truth.py")


class NativeControlAdapterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.estate = Path(cls.temp.name).resolve()
        cls.app = cls.estate / "app-prodn"
        cls.api = cls.estate / "api-prodn"
        cls.foreign = cls.estate / "other-api"
        for repo in (cls.app, cls.api, cls.foreign):
            repo.mkdir()
            cls.git(repo, "init", "--quiet")
            cls.git(repo, "-c", "user.name=Contract Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "--allow-empty", "-m", "fixture")
        # This fixture emits JSON only; it never starts a native process.
        scripts = cls.api / "scripts"
        scripts.mkdir()
        (scripts / "replay_engine_native_control.py").write_text(
            "import json,sys\n"
            "print(json.dumps({'schema':'api-test-fixture/v1','status':'HOLD',"
            "'candidateOnly':True,'argv':sys.argv[1:]}))\n"
            "sys.exit(7 if 'fixture-reject' in sys.argv else 0)\n"
        )
        cls.git(cls.api, "add", "scripts/replay_engine_native_control.py")
        cls.git(cls.api, "-c", "user.name=Contract Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture adapter target")
        cls.api_worktree = cls.estate / "api-source"
        cls.git(cls.api, "worktree", "add", "--quiet", "--detach", str(cls.api_worktree))
        cls.app_worktree = cls.estate / "app-source"
        cls.git(cls.app, "worktree", "add", "--quiet", "--detach", str(cls.app_worktree))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @staticmethod
    def git(repository, *arguments):
        return subprocess.check_output(
            ["git", "-C", str(repository), *arguments], text=True,
            stderr=subprocess.PIPE, timeout=10,
        ).strip()

    def args(self, mode="prepare", *extra):
        return MODULE.parser().parse_args([mode, "--run-id", "control-32388-fixture", *extra])

    def git_only_runner(self, original):
        def run(command, *args, **kwargs):
            if command[0] != "git":
                self.fail("invalid source must reject before delegating to the API primitive")
            return original(command, *args, **kwargs)
        return run

    def test_import_needs_no_sibling_api_or_git(self):
        with patch.object(subprocess, "check_output", side_effect=AssertionError("import must not inspect runtime")):
            fresh = load_module("native_control_without_api", SCRIPT)
        self.assertEqual(fresh.API_SCRIPT, Path("scripts/replay_engine_native_control.py"))

    def test_default_api_comes_from_app_git_common_not_worktree_parent(self):
        with patch.object(MODULE, "ROOT", self.app_worktree):
            self.assertEqual(MODULE.resolve_api_source(), self.api)

    def test_same_repository_api_worktree_is_accepted(self):
        with patch.object(MODULE, "ROOT", self.app):
            self.assertEqual(MODULE.resolve_api_source(self.api_worktree), self.api_worktree)

    def test_foreign_api_repository_is_rejected_before_execution(self):
        original = subprocess.run
        with patch.object(MODULE, "ROOT", self.app), patch.object(subprocess, "run", side_effect=self.git_only_runner(original)):
            with self.assertRaisesRegex(MODULE.NativeControlAdapterError, "not a worktree of the canonical sibling"):
                MODULE.command_for_control(self.args("run", "--api-source", str(self.foreign)))

    def test_api_subdirectory_is_not_a_checkout_root(self):
        with patch.object(MODULE, "ROOT", self.app):
            with self.assertRaisesRegex(MODULE.NativeControlAdapterError, "exact Git checkout root"):
                MODULE.resolve_api_source(self.api / "scripts")

    def test_symlinked_source_is_rejected(self):
        link = self.estate / "api-link"
        link.symlink_to(self.api, target_is_directory=True)
        try:
            with patch.object(MODULE, "ROOT", self.app):
                with self.assertRaisesRegex(MODULE.NativeControlAdapterError, "Symlinked API"):
                    MODULE.resolve_api_source(link)
        finally:
            link.unlink()

    def test_missing_canonical_sibling_rejects_without_mkdir_or_launch(self):
        missing_app = self.estate / "missing-sibling/app-prodn"
        missing_app.mkdir(parents=True)
        self.git(missing_app, "init", "--quiet")
        original = subprocess.run
        with patch.object(MODULE, "ROOT", missing_app), patch.object(subprocess, "run", side_effect=self.git_only_runner(original)), patch.object(Path, "mkdir") as mkdir:
            with self.assertRaisesRegex(MODULE.NativeControlAdapterError, "Governed Git checkout unavailable"):
                MODULE.resolve_api_source(self.api_worktree)
        mkdir.assert_not_called()

    def test_missing_api_primitive_rejects(self):
        with patch.object(MODULE, "ROOT", self.app), patch.object(MODULE, "API_SCRIPT", Path("scripts/absent-control.py")):
            with self.assertRaisesRegex(MODULE.NativeControlAdapterError, "primitive is unavailable"):
                MODULE.resolve_api_source()

    def test_command_forwards_exact_internal_app_source_and_prepare_tools(self):
        with patch.object(MODULE, "ROOT", self.app_worktree):
            command, cwd = MODULE.command_for_control(self.args(
                "prepare", "--api-source", str(self.api_worktree),
                "--clang", "/tools/clang", "--lld-link", "/tools/lld-link",
            ))
        self.assertEqual(cwd, self.api_worktree)
        self.assertEqual(command, [
            sys.executable, str(self.api_worktree / MODULE.API_SCRIPT), "prepare",
            "--run-id", "control-32388-fixture", "--app-source", str(self.app_worktree),
            "--clang", "/tools/clang", "--lld-link", "/tools/lld-link",
        ])
        self.assertNotIn("--api-source", command)

    def test_calibrate_forwards_reviewed_tool_overrides(self):
        with patch.object(MODULE, "ROOT", self.app_worktree):
            command, cwd = MODULE.command_for_control(self.args(
                "calibrate", "--api-source", str(self.api_worktree),
                "--clang", "/tools/clang", "--lld-link", "/tools/lld-link",
            ))
        self.assertEqual(cwd, self.api_worktree)
        self.assertEqual(command, [
            sys.executable, str(self.api_worktree / MODULE.API_SCRIPT), "calibrate",
            "--run-id", "control-32388-fixture", "--app-source", str(self.app_worktree),
            "--clang", "/tools/clang", "--lld-link", "/tools/lld-link",
        ])

    def test_all_modes_preserve_api_json_and_exit_status_without_shell(self):
        for mode in ("prepare", "run", "verify", "calibrate"):
            with self.subTest(mode=mode), patch.object(MODULE, "ROOT", self.app):
                command, cwd = MODULE.command_for_control(self.args(mode))
                result = subprocess.run(command, cwd=cwd, capture_output=True, text=True, check=False)
                payload = json.loads(result.stdout)
                self.assertEqual(result.returncode, 0)
                self.assertEqual(payload["status"], "HOLD")
                self.assertTrue(payload["candidateOnly"])
                self.assertEqual(payload["argv"], command[2:])
        with patch.object(MODULE, "command_for_control", return_value=(command, self.api)), patch.object(subprocess, "run", return_value=subprocess.CompletedProcess([], 7)) as run:
            self.assertEqual(MODULE.invoke_control(self.args("verify")), 7)
        self.assertEqual(run.call_args.kwargs, {"cwd": self.api, "check": False})

    def test_invalid_run_id_rejects_before_git_or_execution(self):
        for run_id in ("../escape", "control;launch", "", "a" * 49, "control-ABC", "-control"):
            with self.subTest(run_id=run_id), patch.object(MODULE, "resolve_api_source") as source:
                args = self.args()
                args.run_id = run_id
                with self.assertRaisesRegex(MODULE.NativeControlAdapterError, "run-id must"):
                    MODULE.command_for_control(args)
                source.assert_not_called()

    def test_schema_rejects_missing_identity_and_arbitrary_native_inputs(self):
        for argv in (
            ["prepare"],
            ["apply", "--run-id", "fixture"],
            ["run", "--run-id", "fixture", "--clang", "/tool"],
            ["verify", "--run-id", "fixture", "--lld-link", "/tool"],
            ["run", "--run-id", "fixture", "--game-id", "25782"],
            ["calibrate", "--run-id", "fixture", "--game-id", "32388"],
            ["prepare", "--run-id", "fixture", "--app-source", str(self.foreign)],
            ["prepare", "--run-id", "fixture", "--output", "/override"],
        ):
            with self.subTest(argv=argv), contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaises(SystemExit) as rejected:
                    MODULE.parser().parse_args(argv)
                self.assertEqual(rejected.exception.code, 2)

    def test_adapter_runtime_rejection_is_json_and_has_no_authority(self):
        output = io.StringIO()
        with patch.object(MODULE, "ROOT", self.app), contextlib.redirect_stdout(output):
            code = MODULE.main(["run", "--run-id", "fixture", "--api-source", str(self.foreign)])
        payload = json.loads(output.getvalue())
        self.assertEqual(code, 2)
        self.assertEqual(payload["status"], "REJECT")
        self.assertTrue(payload["candidateOnly"])
        self.assertTrue(all(value is False for value in payload["authority"].values()))

    def test_truth_delegates_before_any_remote_read_or_legacy_receipt(self):
        with patch.object(MODULE, "main", return_value=3) as adapter, patch.object(TRUTH, "run_remote") as remote, patch.object(TRUTH, "write_receipt") as receipt:
            self.assertEqual(TRUTH.main(["native-control", "verify", "--run-id", "fixture"]), 3)
        adapter.assert_called_once_with(["verify", "--run-id", "fixture"])
        remote.assert_not_called()
        receipt.assert_not_called()

    def test_top_level_native_help_is_owned_by_adapter(self):
        with patch.object(MODULE, "main", return_value=0) as adapter:
            self.assertEqual(TRUTH.main(["native-control", "--help"]), 0)
        adapter.assert_called_once_with(["--help"])


if __name__ == "__main__":
    unittest.main()
