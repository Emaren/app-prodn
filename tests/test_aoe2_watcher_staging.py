from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "aoe2_watcher_staging.py"
SPEC = importlib.util.spec_from_file_location(
    "aoe2_watcher_staging", SCRIPT
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(MODULE)


def runtime_fixture():
    return {
        "source_sha": "a" * 40,
        "source_dirty_count": 0,
        "active_build_id": "build-current",
        "service": "active",
        "wolo_listener_counts": {"8092": 1, "8093": 1},
    }


def policy_fixture(root: pathlib.Path):
    downloads = root / "downloads"
    stage_a = root / "watcher-release-staging"
    stage_b = root / "watcher-staging"
    receipts = root / "receipts"
    for path in (downloads, stage_a, stage_b):
        path.mkdir(parents=True)
    return {
        "production_host": "hel1",
        "production_repo": str(root / "app"),
        "service": "aoe2hdbets-web.service",
        "volume_mount": str(root),
        "download_root": str(downloads),
        "staging_roots": [str(stage_a), str(stage_b)],
        "receipt_root": str(receipts),
        "lock_path": str(root / "watcher.lock"),
        "wolo_ports": [8092, 8093],
    }


class WatcherStagingClassificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name).resolve()
        self.policy = policy_fixture(self.root)
        self.downloads = pathlib.Path(self.policy["download_root"])
        self.stage_a, self.stage_b = [
            pathlib.Path(value)
            for value in self.policy["staging_roots"]
        ]

    def test_exact_duplicate_is_candidate_and_unique_bytes_are_preserved(self):
        (self.downloads / "current.exe").write_bytes(b"current-binary")
        (self.downloads / "current.zip").write_bytes(b"current-zip")

        duplicate = self.stage_b / "1.5.12"
        duplicate.mkdir()
        (duplicate / "portable.exe").write_bytes(b"current-binary")
        (duplicate / "direct.zip").write_bytes(b"current-zip")

        historical = self.stage_a / "1.5.9"
        historical.mkdir()
        (historical / "historical.exe").write_bytes(
            b"unique-historical-binary"
        )

        plan = MODULE.build_plan(self.policy, runtime_fixture())
        rows = {row["name"]: row for row in plan["entries"]}

        self.assertEqual(
            rows["1.5.12"]["action"], "DELETE_EXACT_DUPLICATE"
        )
        self.assertEqual(
            rows["1.5.9"]["action"], "KEEP_UNIQUE_EVIDENCE"
        )
        self.assertEqual(plan["candidate_count"], 1)
        self.assertEqual(plan["preserved_count"], 1)
        self.assertGreater(plan["eligible_allocated_bytes"], 0)

    def test_one_unmatched_file_keeps_entire_subtree(self):
        (self.downloads / "same.bin").write_bytes(b"same")
        stage = self.stage_b / "mixed"
        stage.mkdir()
        (stage / "same.bin").write_bytes(b"same")
        (stage / "unique.bin").write_bytes(b"unique")

        plan = MODULE.build_plan(self.policy, runtime_fixture())
        row = plan["entries"][0]

        self.assertEqual(row["action"], "KEEP_UNIQUE_EVIDENCE")
        self.assertEqual(row["inventory"]["unmatched_count"], 1)
        self.assertEqual(plan["candidate_count"], 0)

    def test_symlink_inside_staging_fails_closed(self):
        outside = self.root / "outside"
        outside.write_bytes(b"must-survive")
        stage = self.stage_b / "unsafe"
        stage.mkdir()
        (stage / "link").symlink_to(outside)

        with self.assertRaisesRegex(
            MODULE.WatcherStagingError, "contains a symlink"
        ):
            MODULE.build_plan(self.policy, runtime_fixture())
        self.assertEqual(outside.read_bytes(), b"must-survive")

    def test_plan_digest_changes_when_staged_bytes_change(self):
        (self.downloads / "same.bin").write_bytes(b"same")
        stage = self.stage_b / "1.5.12"
        stage.mkdir()
        target = stage / "same.bin"
        target.write_bytes(b"same")
        first = MODULE.build_plan(self.policy, runtime_fixture())

        target.write_bytes(b"different")
        second = MODULE.build_plan(self.policy, runtime_fixture())

        self.assertNotEqual(
            first["plan_digest_sha256"],
            second["plan_digest_sha256"],
        )


class WatcherStagingIntegrationTests(unittest.TestCase):
    def test_checked_in_policy_is_exact_and_fail_closed(self):
        policy = MODULE.policy_from_contract(MODULE.load_contract())
        self.assertEqual(
            policy["download_root"], MODULE.CANONICAL_DOWNLOAD_ROOT
        )
        self.assertEqual(
            policy["staging_roots"],
            list(MODULE.CANONICAL_STAGING_ROOTS),
        )
        self.assertEqual(policy["wolo_ports"], [8092, 8093])

        altered = dict(policy)
        altered["download_root"] = "/tmp/not-canonical"
        encoded = MODULE.encode_policy(policy)
        self.assertEqual(MODULE.decode_policy(encoded), policy)
        with self.assertRaisesRegex(
            MODULE.WatcherStagingError, "must be exactly"
        ):
            MODULE.validate_policy(altered)

    def test_operator_cli_routes_watcher_staging(self):
        with tempfile.TemporaryDirectory() as temp:
            fake_root = pathlib.Path(temp)
            bin_dir = fake_root / "bin"
            scripts_dir = fake_root / "scripts"
            bin_dir.mkdir()
            scripts_dir.mkdir()
            cli = bin_dir / "aoe2war"
            shutil.copy2(ROOT / "bin" / "aoe2war", cli)
            release = bin_dir / "aoe2war-release"
            release.write_text(
                "#!/usr/bin/env bash\nexit 99\n",
                encoding="utf-8",
            )
            release.chmod(0o755)
            worker = scripts_dir / "aoe2_watcher_staging.py"
            worker.write_text(
                "import json,sys\n"
                "print(json.dumps(sys.argv[1:]))\n",
                encoding="utf-8",
            )

            routed = subprocess.run(
                [str(cli), "watcher-staging", "--json"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )
            help_result = subprocess.run(
                [str(cli), "--help"],
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(routed.returncode, 0, routed.stderr)
        self.assertEqual(json.loads(routed.stdout), ["--json"])
        self.assertIn(
            "watcher-staging [--apply] [--json]",
            help_result.stdout,
        )

    def test_release_gate_compiles_and_tests_watcher_staging_lane(self):
        gate_script = ROOT / "scripts" / "aoe2_release_gate.py"
        spec = importlib.util.spec_from_file_location(
            "aoe2_release_gate_watcher_staging", gate_script
        )
        gate = importlib.util.module_from_spec(spec)
        assert spec and spec.loader
        spec.loader.exec_module(gate)

        self.assertEqual(
            gate.path_risk("scripts/aoe2_watcher_staging.py"),
            "INFRASTRUCTURE",
        )
        self.assertEqual(
            gate.path_risk("tests/test_aoe2_watcher_staging.py"),
            "INFRASTRUCTURE",
        )

        scope = {
            "mode": "worktree",
            "base_sha": "a",
            "target_sha": "WORKTREE",
            "changed_files": [
                "config/aoe2war-operations.json",
                "scripts/aoe2_watcher_staging.py",
            ],
        }
        commands = gate.command_plan(scope, "INFRASTRUCTURE")
        release_tests = next(
            args
            for label, args, _timeout in commands
            if label == "release-engineering-tests"
        )
        compile_args = next(
            args
            for label, args, _timeout in commands
            if label == "release-python-compile"
        )
        self.assertIn(
            "tests/test_aoe2_watcher_staging.py", release_tests
        )
        self.assertIn(
            "scripts/aoe2_watcher_staging.py", compile_args
        )


if __name__ == "__main__":
    unittest.main()
