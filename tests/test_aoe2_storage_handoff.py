import tempfile
import unittest
from pathlib import Path
from unittest import mock

import scripts.aoe2_storage_handoff as handoff


class StorageHandoffTests(unittest.TestCase):
    def test_flow_is_exact_and_terminal(self):
        self.assertEqual(
            handoff.FLOW,
            [
                "V1_RUNNING",
                "V1_FROZEN",
                "TRANSACTION_SEAM_PROVEN",
                "SOURCE_READY",
                "RUNNER_RECONCILED",
                "V2_CERTIFIED",
                "V1_RETIRED",
                "V2_RESUMED",
            ],
        )

    def test_process_family_collects_descendants(self):
        rows = {
            10: {"pid": 10, "ppid": 1, "pgid": 10, "command": "python v1"},
            11: {"pid": 11, "ppid": 10, "pgid": 10, "command": "worker a"},
            12: {"pid": 12, "ppid": 11, "pgid": 10, "command": "worker b"},
            13: {"pid": 13, "ppid": 1, "pgid": 13, "command": "other"},
        }
        with mock.patch.object(handoff, "process_table", return_value=rows):
            family = handoff.process_family(10)
        self.assertEqual(family["pid"], 10)
        self.assertEqual(family["pgid"], 10)
        self.assertEqual(family["command"], "python v1")
        self.assertEqual(
            [row["pid"] for row in family["descendants"]],
            [11, 12],
        )

    def test_recorded_family_dead_rejects_same_identity_but_allows_pid_reuse(self):
        snapshot = {
            "pid": 10,
            "ppid": 1,
            "pgid": 10,
            "command": "python v1",
            "descendants": [
                {"pid": 11, "ppid": 10, "pgid": 10, "command": "worker a"},
            ],
        }
        same = {
            11: {"pid": 11, "ppid": 999, "pgid": 10, "command": "worker a"},
        }
        with mock.patch.object(handoff, "process_table", return_value=same):
            self.assertFalse(handoff.recorded_family_dead(snapshot))

        reused = {
            10: {"pid": 10, "ppid": 1, "pgid": 77, "command": "unrelated"},
            11: {"pid": 11, "ppid": 1, "pgid": 88, "command": "different"},
        }
        with mock.patch.object(handoff, "process_table", return_value=reused):
            self.assertTrue(handoff.recorded_family_dead(snapshot))

    def test_prove_frozen_requires_cooperative_transaction_seam(self):
        valid = {
            "status": "PAUSED",
            "completion_reason": "OPERATOR_PAUSE_BETWEEN_GENERATIONS",
            "current_generation": None,
            "current_generation_started_at": None,
            "pid": None,
        }
        with mock.patch.object(handoff, "process_alive", return_value=False):
            handoff.prove_frozen(valid)

        invalid = dict(valid)
        invalid["current_generation"] = "activate-20260923T000000Z-aaaaaaaaaaaa"
        with self.assertRaises(handoff.HandoffError):
            handoff.prove_frozen(invalid)

    def test_source_ready_requires_clean_exact_main_descendant(self):
        values = {
            ("branch", "--show-current"): "main",
            ("status", "--porcelain", "--untracked-files=all"): "",
            ("rev-parse", "HEAD"): "b" * 40,
            ("rev-parse", "origin/main"): "b" * 40,
        }

        def git_value(*args):
            return values[args]

        ancestry = mock.Mock(returncode=0)
        with (
            mock.patch.object(handoff, "git_output", side_effect=git_value),
            mock.patch.object(handoff.subprocess, "run", return_value=ancestry),
        ):
            self.assertEqual(
                handoff.source_ready("a" * 40, expected_target="b" * 40),
                "b" * 40,
            )

    def test_transition_is_strictly_sequential_and_durable(self):
        state = {
            "handoff_id": "test",
            "status": "V1_RUNNING",
            "history": [],
        }
        with mock.patch.object(handoff, "save_state") as save:
            handoff.transition(state, "V1_FROZEN", evidence={"ok": True})
        self.assertEqual(state["status"], "V1_FROZEN")
        self.assertEqual(state["history"][-1]["evidence"], {"ok": True})
        save.assert_called_once_with(state)

        with self.assertRaises(handoff.HandoffError):
            handoff.transition(state, "SOURCE_READY")

    def test_create_state_binds_v1_target_and_process_family(self):
        campaign_state = {
            "campaign_id": "campaign-a",
            "status": "RUNNING",
            "release_sha": "a" * 40,
            "build_id": "build-a",
            "pid": 123,
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(handoff, "HANDOFF_DIR", root),
                mock.patch.object(
                    handoff.campaign,
                    "load_state",
                    return_value=campaign_state,
                ),
                mock.patch.object(
                    handoff.storage,
                    "operator_baseline",
                    return_value=("a" * 40, "build-a"),
                ),
                mock.patch.object(
                    handoff,
                    "source_ready",
                    return_value="b" * 40,
                ),
                mock.patch.object(
                    handoff,
                    "process_family",
                    return_value={
                        "pid": 123,
                        "ppid": 1,
                        "pgid": 123,
                        "command": "python v1",
                        "descendants": [
                            {
                                "pid": 124,
                                "ppid": 123,
                                "pgid": 123,
                                "command": "worker",
                            }
                        ],
                    },
                ),
            ):
                state = handoff.create_state("campaign-a")

        self.assertEqual(state["status"], "V1_RUNNING")
        self.assertEqual(state["old_release_sha"], "a" * 40)
        self.assertEqual(state["old_build_id"], "build-a")
        self.assertEqual(state["target_source_sha"], "b" * 40)
        self.assertEqual(
            [row["pid"] for row in state["v1_process_family"]["descendants"]],
            [124],
        )

    def test_atomic_write_fsyncs_file_and_directory(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        self.assertIn("os.fsync(handle.fileno())", source)
        self.assertIn("os.fsync(directory_fd)", source)

    def test_spawn_runner_is_terminal_independent(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        self.assertIn("start_new_session=True", source)
        self.assertIn("stdin=subprocess.DEVNULL", source)
        self.assertIn("stdout=log", source)
        self.assertIn("stderr=subprocess.STDOUT", source)

    def test_finish_is_terminal_independent_and_uses_canonical_finish(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        self.assertIn('"finish"', source)
        self.assertIn("Storage OS handoff", source)
        self.assertGreaterEqual(source.count("start_new_session=True"), 2)

    def test_finish_receipt_requires_certified_target_and_runner_phase(self):
        payload = {
            "kind": "aoe2war-finish-result",
            "status": "CERTIFIED",
            "release_outcome": "CERTIFIED",
            "release_certified_at": "2026-09-23T19:00:00+00:00",
            "phases": {
                "maintenance_runner_reconciliation": {"status": "PASSED"},
            },
            "final_release": {
                "production": {"source_sha": "b" * 40},
                "certification": {
                    "status": "CERTIFIED",
                    "release_sha": "b" * 40,
                },
            },
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            path = root / "receipt.json"
            path.write_text(__import__("json").dumps(payload), encoding="utf-8")
            with mock.patch.object(handoff, "FINISH_RECEIPT_DIR", root):
                found = handoff.finish_receipt_for_target("b" * 40)
                self.assertIsNotNone(found)
                self.assertEqual(found[0], path)
                self.assertIsNone(
                    handoff.finish_receipt_for_target("c" * 40)
                )

    def test_incomplete_v1_terminal_state_fails_instead_of_waiting_forever(self):
        state = {
            "handoff_id": "handoff-a",
            "campaign_id": "campaign-a",
            "status": "V1_RUNNING",
        }
        terminal = {
            "status": "FAILED",
            "completion_reason": None,
            "last_error": "worker failed",
            "pid": None,
        }
        with (
            mock.patch.object(handoff, "HANDOFF_DIR", Path("/tmp")),
            mock.patch.object(handoff, "LOCK_PATH", Path("/tmp/aoe2war-handoff-test.lock")),
            mock.patch.object(handoff, "load_state", side_effect=[state, state, terminal]),
            mock.patch.object(handoff.campaign, "request_pause"),
            mock.patch.object(handoff.campaign, "load_state", return_value=terminal),
            mock.patch.object(handoff, "save_state"),
        ):
            self.assertEqual(handoff.drive("handoff-a"), 2)

    def test_resume_is_terminal_loss_safe_from_every_incomplete_state(self):
        for state_name in handoff.FLOW[:-1]:
            state = {
                "handoff_id": "handoff-a",
                "status": state_name,
                "runner_pid": 123,
                "last_error": "old",
            }
            with (
                self.subTest(state=state_name),
                mock.patch.object(handoff, "load_state", return_value=dict(state)),
                mock.patch.object(handoff, "process_alive", return_value=False),
                mock.patch.object(handoff, "save_state") as save,
                mock.patch.object(handoff, "spawn_runner", return_value=456) as spawn,
            ):
                result = handoff.resume("handoff-a")
                self.assertEqual(result["spawned_pid"], 456)
                spawn.assert_called_once_with("handoff-a")
                self.assertIsNone(save.call_args.args[0]["last_error"])

    def test_resume_does_not_restart_completed_handoff(self):
        state = {
            "handoff_id": "handoff-a",
            "status": "V2_RESUMED",
            "runner_pid": None,
        }
        with (
            mock.patch.object(handoff, "load_state", return_value=state),
            mock.patch.object(handoff, "spawn_runner") as spawn,
        ):
            self.assertEqual(handoff.resume("handoff-a"), state)
        spawn.assert_not_called()

    def test_v2_resume_rebinds_before_campaign_resume(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        rebind = source.index("campaign.rebind_after_handoff(")
        resume = source.index("campaign.resume(campaign_id)", rebind)
        self.assertLess(rebind, resume)


if __name__ == "__main__":
    unittest.main()
