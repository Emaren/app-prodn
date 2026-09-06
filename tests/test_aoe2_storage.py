import importlib.util
import inspect
import pathlib
import subprocess
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "aoe2_storage.py"
WORKER = ROOT / "scripts" / "aoe2_rollback_archive_one.sh"
RUNNER = ROOT / "scripts" / "aoe2_maintenance_run.sh"

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

    def test_adaptive_runner_preserves_hard_wolo_guards(self):
        runner = RUNNER.read_text(encoding="utf-8")

        self.assertIn('profile="BURST"', runner)
        self.assertIn('profile="BALANCED"', runner)
        self.assertIn('profile="CONSERVATIVE"', runner)
        self.assertIn('SOFT_BLOCK_AGE_SECONDS=13', runner)
        self.assertIn('MAX_BLOCK_AGE_SECONDS=20', runner)
        self.assertIn('SOFT_NO_PROGRESS_SECONDS=9', runner)
        self.assertIn('MAX_NO_PROGRESS_SECONDS=15', runner)
        self.assertIn('EMERGENCY_AVAILABLE_KB=$((1 * 1024 * 1024))', runner)
        self.assertIn('demote_to_conservative', runner)
        self.assertIn('OOMScoreAdjust=800', runner)

    def test_adaptive_runner_shell_syntax(self):
        proc = subprocess.run(
            ["bash", "-n", str(RUNNER)],
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

    def test_archive_worker_uses_parallel_zstd_under_cgroup_governor(self):
        worker = WORKER.read_text(encoding="utf-8")

        self.assertIn("zstd -q -T0 -3 -c", worker)
        self.assertIn("zstd -q -T0 -t", worker)
        self.assertNotIn("zstd -q -T1 -3 -c", worker)
        self.assertIn('"transaction_duration_seconds"', worker)
        self.assertIn("Transaction time:", worker)

    def test_until_target_continues_through_watch_after_ready_start(self):
        plans = [
            {
                "status": "READY",
                "candidate": "activate-20260816T004958Z-3bf702d45948",
            },
            {
                "status": "WATCH",
                "candidate": "activate-20260815T233717Z-e20f5689ea3b",
            },
        ]

        snapshots = [
            {"used_percent": 81.40},
            {"used_percent": 77.90},
        ]

        with (
            mock.patch.object(
                MODULE,
                "operator_baseline",
                return_value=("a" * 40, "certified-build"),
            ),
            mock.patch.object(
                MODULE,
                "make_plan",
                side_effect=plans,
            ),
            mock.patch.object(
                MODULE,
                "invoke_worker",
            ) as worker,
            mock.patch.object(
                MODULE,
                "snapshot",
                side_effect=snapshots,
            ),
            mock.patch.object(
                MODULE,
                "print_status",
            ),
            mock.patch.object(
                MODULE,
                "policy",
                return_value={"healthy_target": 78},
            ),
        ):
            rc = MODULE.maintain(
                apply=True,
                until_target=True,
                max_generations=5,
                force=False,
            )

        self.assertEqual(rc, 0)
        self.assertEqual(worker.call_count, 2)

    def test_until_target_does_not_start_while_already_in_watch(self):
        plan = {
            "status": "WATCH",
            "candidate": "activate-20260815T233717Z-e20f5689ea3b",
        }

        with (
            mock.patch.object(
                MODULE,
                "operator_baseline",
                return_value=("a" * 40, "certified-build"),
            ),
            mock.patch.object(
                MODULE,
                "make_plan",
                return_value=plan,
            ),
            mock.patch.object(
                MODULE,
                "invoke_worker",
            ) as worker,
        ):
            rc = MODULE.maintain(
                apply=True,
                until_target=True,
                max_generations=5,
                force=False,
            )

        self.assertEqual(rc, 0)
        worker.assert_not_called()


if __name__ == "__main__":
    unittest.main()
