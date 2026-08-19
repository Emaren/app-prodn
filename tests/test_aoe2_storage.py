import importlib.util
import inspect
import pathlib
import subprocess
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "aoe2_storage.py"
WORKER = ROOT / "scripts" / "aoe2_rollback_archive_one.sh"

SPEC = importlib.util.spec_from_file_location(
    "aoe2_storage",
    SCRIPT,
)

MODULE = importlib.util.module_from_spec(SPEC)

assert SPEC is not None
assert SPEC.loader is not None

SPEC.loader.exec_module(MODULE)


class StorageOSTests(unittest.TestCase):
    def test_policy_has_separate_read_and_mutation_authorities(self):
        policy = MODULE.policy()

        self.assertEqual(
            policy["production_host"],
            "hel1",
        )

        self.assertEqual(
            policy["root_maintenance_host"],
            "root@hel1",
        )

    def test_read_probe_uses_normal_operator_authority(self):
        source = inspect.getsource(MODULE.remote_json)

        self.assertIn(
            'p["production_host"]',
            source,
        )

        self.assertNotIn(
            'p["root_maintenance_host"]',
            source,
        )

    @mock.patch.object(MODULE, "policy")
    @mock.patch.object(MODULE.subprocess, "run")
    def test_mutating_worker_uses_root_authority(
        self,
        run_mock,
        policy_mock,
    ):
        policy_mock.return_value = {
            "root_maintenance_host": "root@hel1",
        }

        run_mock.return_value.returncode = 0

        MODULE.invoke_worker(
            "a" * 40,
            "certified-build",
            "activate-20260818T033429Z-78cced8dcfc6",
        )

        command = run_mock.call_args.args[0]

        self.assertIn(
            "root@hel1",
            command,
        )

        self.assertNotIn(
            "hel1",
            command,
        )

    def test_worker_shell_syntax(self):
        proc = subprocess.run(
            ["bash", "-n", str(WORKER)],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

        self.assertEqual(
            proc.returncode,
            0,
            proc.stderr,
        )

    def test_worker_lock_order(self):
        worker = WORKER.read_text(encoding="utf-8")

        release_lock = 'exec 8<>"$RELEASE_LOCK"'
        retention_lock = 'exec 7<>"$RETENTION_LOCK"'

        archive_candidates = [
            'exec 9>"$LOCK"',
            'exec 9<>"$LOCK"',
            'exec 9>>"$LOCK"',
        ]

        archive_lock = next(
            (
                candidate
                for candidate in archive_candidates
                if candidate in worker
            ),
            None,
        )

        self.assertIsNotNone(archive_lock)

        self.assertLess(
            worker.index(release_lock),
            worker.index(retention_lock),
        )

        self.assertLess(
            worker.index(retention_lock),
            worker.index(archive_lock),
        )

    def test_worker_uses_canonical_lock_paths(self):
        worker = WORKER.read_text(encoding="utf-8")

        self.assertIn(
            'RELEASE_LOCK="$CONTROL/locks/release.lock"',
            worker,
        )

        self.assertIn(
            'RETENTION_LOCK="$CONTROL/locks/storage-retention.lock"',
            worker,
        )

        self.assertIn(
            'LOCK="$CONTROL/locks/rollback-archive.lock"',
            worker,
        )


if __name__ == "__main__":
    unittest.main()
