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

    def test_recorded_process_identity_rejects_pid_reuse(self):
        recorded = {
            "pid": 20,
            "ppid": 1,
            "pgid": 20,
            "command": "python scripts/aoe2_finish.py -m handoff-a",
        }
        with mock.patch.object(
            handoff,
            "process_table",
            return_value={
                20: {
                    "pid": 20,
                    "ppid": 1,
                    "pgid": 99,
                    "command": "unrelated process",
                }
            },
        ):
            self.assertFalse(handoff.recorded_process_alive(recorded))

        with mock.patch.object(
            handoff,
            "process_table",
            return_value={20: dict(recorded)},
        ):
            self.assertTrue(handoff.recorded_process_alive(recorded))

    def test_capture_process_identity_waits_for_expected_exec(self):
        pid = 30
        transitional = {
            pid: {
                "pid": pid,
                "ppid": 1,
                "pgid": pid,
                "command": "/bin/bash bin/aoe2war finish",
            }
        }
        final = {
            pid: {
                "pid": pid,
                "ppid": 1,
                "pgid": pid,
                "command": (
                    "python scripts/aoe2_finish.py -m "
                    "Storage OS handoff handoff-a"
                ),
            }
        }
        with (
            mock.patch.object(
                handoff,
                "process_table",
                side_effect=[transitional, final],
            ),
            mock.patch.object(handoff.time, "sleep"),
        ):
            identity = handoff.capture_process_identity(
                pid,
                required_tokens=("aoe2_finish.py", "handoff-a"),
                attempts=2,
            )
        self.assertEqual(identity["pid"], pid)
        self.assertIn("aoe2_finish.py", identity["command"])

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

    def test_live_campaign_controller_is_exact_and_unique(self):
        rows = {
            100: {
                "pid": 100,
                "ppid": 1,
                "pgid": 100,
                "command": "python scripts/aoe2_storage_campaign.py _run campaign-a",
            },
            101: {
                "pid": 101,
                "ppid": 1,
                "pgid": 101,
                "command": "python unrelated.py campaign-a",
            },
        }
        with mock.patch.object(handoff, "process_table", return_value=rows):
            self.assertEqual(
                handoff.live_campaign_controller("campaign-a")["pid"],
                100,
            )

        rows[102] = {
            "pid": 102,
            "ppid": 1,
            "pgid": 102,
            "command": "python scripts/aoe2_storage_campaign.py _run campaign-a",
        }
        with mock.patch.object(handoff, "process_table", return_value=rows):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "multiple live Storage campaign controllers",
            ):
                handoff.live_campaign_controller("campaign-a")

    def test_source_ready_for_finish_allows_docs_only_descendant(self):
        values = {
            ("branch", "--show-current"): "main",
            ("status", "--porcelain", "--untracked-files=all"): "",
            ("rev-parse", "HEAD"): "c" * 40,
            ("rev-parse", "origin/main"): "c" * 40,
            ("ls-remote", "origin", "refs/heads/main"): (
                ("c" * 40) + "\trefs/heads/main"
            ),
        }
        with (
            mock.patch.object(
                handoff,
                "git_output",
                side_effect=lambda *args: values[args],
            ),
            mock.patch.object(
                handoff,
                "implementation_equivalent_release",
                return_value=True,
            ) as equivalent,
        ):
            self.assertEqual(
                handoff.source_ready_for_finish("b" * 40),
                "c" * 40,
            )
        equivalent.assert_called_once_with("b" * 40, "c" * 40)

    def test_source_ready_for_finish_blocks_non_docs_source_drift(self):
        values = {
            ("branch", "--show-current"): "main",
            ("status", "--porcelain", "--untracked-files=all"): "",
            ("rev-parse", "HEAD"): "c" * 40,
            ("rev-parse", "origin/main"): "c" * 40,
            ("ls-remote", "origin", "refs/heads/main"): (
                ("c" * 40) + "\trefs/heads/main"
            ),
        }
        with (
            mock.patch.object(
                handoff,
                "git_output",
                side_effect=lambda *args: values[args],
            ),
            mock.patch.object(
                handoff,
                "implementation_equivalent_release",
                return_value=False,
            ),
        ):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "implementation changes",
            ):
                handoff.source_ready_for_finish("b" * 40)

    def test_source_ready_requires_clean_exact_main_descendant(self):
        values = {
            ("branch", "--show-current"): "main",
            ("status", "--porcelain", "--untracked-files=all"): "",
            ("rev-parse", "HEAD"): "b" * 40,
            ("rev-parse", "origin/main"): "b" * 40,
            ("ls-remote", "origin", "refs/heads/main"): (
                ("b" * 40) + "\trefs/heads/main"
            ),
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

    def test_source_ready_rejects_stale_tracking_ref(self):
        values = {
            ("branch", "--show-current"): "main",
            ("status", "--porcelain", "--untracked-files=all"): "",
            ("rev-parse", "HEAD"): "b" * 40,
            ("rev-parse", "origin/main"): "b" * 40,
            ("ls-remote", "origin", "refs/heads/main"): (
                ("c" * 40) + "\trefs/heads/main"
            ),
        }
        with mock.patch.object(
            handoff,
            "git_output",
            side_effect=lambda *args: values[args],
        ):
            with self.assertRaisesRegex(handoff.HandoffError, "tracking=.*live"):
                handoff.source_ready("a" * 40)

    def test_transition_is_strictly_sequential_and_durable(self):
        state = {
            "handoff_id": "test",
            "status": "V1_RUNNING",
            "history": [],
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(handoff, "HANDOFF_DIR", root),
                mock.patch.object(handoff, "save_state") as save,
            ):
                handoff.transition(state, "V1_FROZEN", evidence={"ok": True})
                receipt = Path(state["last_transition_receipt"])
                self.assertTrue(receipt.is_file())
                self.assertEqual(receipt.stat().st_mode & 0o777, 0o444)
                sealed = __import__("json").loads(receipt.read_text(encoding="utf-8"))

        self.assertEqual(state["status"], "V1_FROZEN")
        self.assertEqual(state["history"][-1]["evidence"], {"ok": True})
        self.assertEqual(sealed["from"], "V1_RUNNING")
        self.assertEqual(sealed["to"], "V1_FROZEN")
        self.assertEqual(sealed["evidence"], {"ok": True})
        self.assertEqual(
            state["history"][-1]["receipt_sha256"],
            state["last_transition_receipt_sha256"],
        )
        save.assert_called_once_with(state)

        with self.assertRaises(handoff.HandoffError):
            handoff.transition(state, "SOURCE_READY")

    def test_transition_chain_verifies_every_durable_receipt(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_DIR", root):
                first_path, first_digest, first = handoff.write_transition_receipt(
                    handoff_id="handoff-a",
                    source=None,
                    target="V1_RUNNING",
                    evidence={"one": 1},
                )
                second_path, second_digest, second = handoff.write_transition_receipt(
                    handoff_id="handoff-a",
                    source="V1_RUNNING",
                    target="V1_FROZEN",
                    evidence={"two": 2},
                )
                state = {
                    "schema": 1,
                    "kind": "aoe2war-storage-handoff",
                    "handoff_id": "handoff-a",
                    "status": "V1_FROZEN",
                    "history": [
                        {
                            "from": None,
                            "to": "V1_RUNNING",
                            "at": first["created_at"],
                            "evidence": first["evidence"],
                            "receipt_path": str(first_path),
                            "receipt_sha256": first_digest,
                        },
                        {
                            "from": "V1_RUNNING",
                            "to": "V1_FROZEN",
                            "at": second["created_at"],
                            "evidence": second["evidence"],
                            "receipt_path": str(second_path),
                            "receipt_sha256": second_digest,
                        },
                    ],
                    "last_transition_receipt": str(second_path),
                    "last_transition_receipt_sha256": second_digest,
                }
                handoff.verify_transition_chain(state)

                drifted = {
                    **state,
                    "history": [dict(row) for row in state["history"]],
                }
                drifted["history"][0]["receipt_sha256"] = "0" * 64
                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "digest mismatch",
                ):
                    handoff.verify_transition_chain(drifted)

    def test_transition_chain_rejects_missing_state_receipt(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-handoff",
            "handoff_id": "handoff-a",
            "status": "V1_RUNNING",
            "history": [],
            "last_transition_receipt": None,
            "last_transition_receipt_sha256": None,
        }
        with self.assertRaisesRegex(
            handoff.HandoffError,
            "history does not match",
        ):
            handoff.verify_transition_chain(state)

    def test_transition_receipt_is_create_once_and_reusable_after_crash(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_DIR", root):
                first = handoff.write_transition_receipt(
                    handoff_id="handoff-a",
                    source="V1_RUNNING",
                    target="V1_FROZEN",
                    evidence={"seam": "proven"},
                )
                second = handoff.write_transition_receipt(
                    handoff_id="handoff-a",
                    source="V1_RUNNING",
                    target="V1_FROZEN",
                    evidence={"seam": "reobserved-but-not-authority"},
                )

        self.assertEqual(first[0], second[0])
        self.assertEqual(first[1], second[1])
        self.assertEqual(second[2]["evidence"], {"seam": "proven"})

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
                    "wolo_snapshot",
                    return_value={
                        "service": "active",
                        "pid": 77,
                        "restart_counter": 0,
                        "active_enter_monotonic": 123456,
                        "listener_8092_count": 1,
                        "listener_8093_count": 1,
                        "height_before": 100,
                        "height_after": 101,
                        "block_age_seconds": 2,
                    },
                ),
                mock.patch.object(handoff, "process_alive", return_value=True),
                mock.patch.object(
                    handoff,
                    "process_family",
                    return_value={
                        "pid": 123,
                        "ppid": 1,
                        "pgid": 123,
                        "command": "python scripts/aoe2_storage_campaign.py _run campaign-a",
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

    def test_create_state_refuses_nonlive_or_wrong_v1_controller(self):
        paused = {
            "campaign_id": "campaign-a",
            "status": "PAUSED",
            "release_sha": "a" * 40,
            "build_id": "build-a",
            "pid": None,
        }
        with mock.patch.object(handoff.campaign, "load_state", return_value=paused):
            with self.assertRaisesRegex(handoff.HandoffError, "not a live V1 controller"):
                handoff.create_state("campaign-a")

        running = {
            **paused,
            "status": "RUNNING",
            "pid": 123,
        }
        with (
            mock.patch.object(handoff.campaign, "load_state", return_value=running),
            mock.patch.object(handoff, "process_alive", return_value=True),
            mock.patch.object(
                handoff.storage,
                "operator_baseline",
                return_value=("a" * 40, "build-a"),
            ),
            mock.patch.object(handoff, "source_ready", return_value="b" * 40),
            mock.patch.object(
                handoff,
                "process_family",
                return_value={
                    "pid": 123,
                    "ppid": 1,
                    "pgid": 123,
                    "command": "unrelated process",
                    "descendants": [],
                },
            ),
        ):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "process identity does not match",
            ):
                handoff.create_state("campaign-a")

    def test_spawn_runner_is_terminal_independent(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        self.assertIn("start_new_session=True", source)
        self.assertIn("stdin=subprocess.DEVNULL", source)
        self.assertIn("stdout=log", source)
        self.assertIn("stderr=subprocess.STDOUT", source)

    def test_spawn_runner_persists_pid_before_identity_failure(self):
        state = {
            "handoff_id": "handoff-a",
            "runner_pid": None,
        }
        proc = mock.Mock()
        proc.pid = 321
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(handoff, "HANDOFF_DIR", root),
                mock.patch.object(handoff, "load_state", return_value=state),
                mock.patch.object(handoff, "process_alive", return_value=False),
                mock.patch.object(handoff.subprocess, "Popen", return_value=proc),
                mock.patch.object(
                    handoff,
                    "capture_process_identity",
                    side_effect=handoff.HandoffError("identity unavailable"),
                ),
                mock.patch.object(handoff, "save_state") as save,
            ):
                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "identity unavailable",
                ):
                    handoff.spawn_runner("handoff-a")

        self.assertEqual(state["runner_pid"], 321)
        self.assertIsNone(state["runner_process_identity"])
        self.assertEqual(state["runner_identity_error"], "identity unavailable")
        self.assertGreaterEqual(save.call_count, 2)
        first = save.call_args_list[0].args[0]
        self.assertEqual(first["runner_pid"], 321)

    def test_launch_finish_persists_pid_before_identity_failure(self):
        state = {
            "handoff_id": "handoff-a",
        }
        proc = mock.Mock()
        proc.pid = 654
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(handoff, "HANDOFF_DIR", root),
                mock.patch.object(handoff, "capture_process_identity",
                    side_effect=handoff.HandoffError("finish identity unavailable")),
                mock.patch.object(handoff.subprocess, "Popen", return_value=proc),
                mock.patch.object(handoff, "save_state") as save,
            ):
                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "finish identity unavailable",
                ):
                    handoff.launch_finish(state)

        self.assertEqual(state["finish_pid"], 654)
        self.assertIsNone(state["finish_process_identity"])
        self.assertEqual(
            state["finish_identity_error"],
            "finish identity unavailable",
        )
        self.assertGreaterEqual(save.call_count, 2)
        first = save.call_args_list[0].args[0]
        self.assertEqual(first["finish_pid"], 654)

    def test_wait_for_finish_refuses_duplicate_when_live_pid_identity_is_unknown(self):
        state = {
            "handoff_id": "handoff-a",
            "target_source_sha": "b" * 40,
            "finish_pid": 777,
            "finish_process_identity": None,
            "finish_log_path": "/tmp/handoff-a.finish.log",
        }
        with (
            mock.patch.object(
                handoff.storage,
                "operator_baseline",
                return_value=("a" * 40, "build-a"),
            ),
            mock.patch.object(handoff, "process_alive", return_value=True),
            mock.patch.object(handoff, "recorded_process_alive", return_value=False),
            mock.patch.object(handoff, "launch_finish") as launch,
        ):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "refusing to launch a duplicate Finish",
            ):
                handoff.wait_for_finish_or_recover(state)
        launch.assert_not_called()

    def test_wait_for_finish_reproves_source_before_new_finish(self):
        state = {
            "handoff_id": "handoff-a",
            "target_source_sha": "b" * 40,
            "created_at": "2026-09-23T19:00:00+00:00",
            "finish_pid": None,
            "finish_process_identity": None,
            "finish_log_path": "/tmp/handoff.finish.log",
        }
        with (
            mock.patch.object(
                handoff.storage,
                "operator_baseline",
                return_value=("a" * 40, "build-a"),
            ),
            mock.patch.object(
                handoff,
                "source_ready_for_finish",
                side_effect=handoff.HandoffError("implementation changes"),
            ) as ready,
            mock.patch.object(handoff, "launch_finish") as launch,
        ):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "implementation changes",
            ):
                handoff.wait_for_finish_or_recover(dict(state))
        ready.assert_called_once_with("b" * 40)
        launch.assert_not_called()

    def test_finish_is_terminal_independent_and_uses_canonical_finish(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        self.assertIn('"finish"', source)
        self.assertIn("Storage OS handoff", source)
        self.assertGreaterEqual(source.count("start_new_session=True"), 2)

    def test_implementation_equivalent_release_allows_only_docs_descendant(self):
        with mock.patch.object(
            handoff.aoe2_release,
            "documentation_only_descendant",
            return_value=True,
        ) as docs_only:
            self.assertTrue(
                handoff.implementation_equivalent_release(
                    "b" * 40,
                    "c" * 40,
                )
            )
        docs_only.assert_called_once_with("b" * 40, "c" * 40)

        with mock.patch.object(
            handoff.aoe2_release,
            "documentation_only_descendant",
            return_value=False,
        ):
            self.assertFalse(
                handoff.implementation_equivalent_release(
                    "b" * 40,
                    "c" * 40,
                )
            )

        self.assertTrue(
            handoff.implementation_equivalent_release(
                "b" * 40,
                "b" * 40,
            )
        )

    def test_prove_target_certified_accepts_docs_only_finish_descendant(self):
        state = {"target_source_sha": "b" * 40}
        with (
            mock.patch.object(
                handoff.storage,
                "operator_baseline",
                return_value=("c" * 40, "build-c"),
            ),
            mock.patch.object(
                handoff,
                "implementation_equivalent_release",
                return_value=True,
            ) as equivalent,
        ):
            self.assertEqual(
                handoff.prove_target_certified(state),
                ("c" * 40, "build-c"),
            )
        equivalent.assert_called_once_with("b" * 40, "c" * 40)

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
                found = handoff.finish_receipt_for_target("b" * 40, "b" * 40)
                self.assertIsNotNone(found)
                self.assertEqual(found[0], path)
                self.assertIsNone(
                    handoff.finish_receipt_for_target("c" * 40, "c" * 40)
                )

    def test_bind_finish_receipt_requires_and_records_wolo_continuity(self):
        payload = {
            "kind": "aoe2war-finish-result",
            "status": "CERTIFIED",
            "release_outcome": "CERTIFIED",
            "release_certified_at": "2026-09-23T20:00:00+00:00",
            "phases": {
                "maintenance_runner_reconciliation": {"status": "PASSED"},
            },
            "maintenance_runner_reconciliation": {
                "wolo_pid": "4321",
                "wolo_restart_counter": "7",
                "wolo_height_before": "100",
                "wolo_height_after": "103",
            },
            "final_release": {
                "production": {
                    "source_sha": "b" * 40,
                    "wolo_8092_count": 1,
                    "wolo_8093_count": 1,
                },
                "certification": {
                    "status": "CERTIFIED",
                    "release_sha": "b" * 40,
                },
            },
        }
        state = {
            "handoff_id": "handoff-a",
            "target_source_sha": "b" * 40,
            "created_at": "2026-09-23T19:00:00+00:00",
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            receipt = root / "receipt.json"
            receipt.write_text(__import__("json").dumps(payload), encoding="utf-8")
            with (
                mock.patch.object(handoff, "FINISH_RECEIPT_DIR", root),
                mock.patch.object(handoff, "save_state") as save,
            ):
                handoff.bind_finish_receipt(state, "b" * 40)

        self.assertEqual(state["wolo_continuity"]["pid"], 4321)
        self.assertEqual(state["wolo_continuity"]["restart_counter"], 7)
        self.assertEqual(state["wolo_continuity"]["height_before"], 100)
        self.assertEqual(state["wolo_continuity"]["height_after"], 103)
        self.assertEqual(state["wolo_continuity"]["listener_8092_count"], 1)
        self.assertEqual(state["wolo_continuity"]["listener_8093_count"], 1)
        self.assertFalse(state["wolo_continuity"]["wolo_mutated_by_handoff"])
        save.assert_called_once_with(state)

        payload["maintenance_runner_reconciliation"]["wolo_height_after"] = "100"
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "receipt.json").write_text(
                __import__("json").dumps(payload),
                encoding="utf-8",
            )
            with (
                mock.patch.object(handoff, "FINISH_RECEIPT_DIR", root),
                mock.patch.object(handoff, "save_state"),
            ):
                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "does not prove protected Wolo continuity",
                ):
                    handoff.bind_finish_receipt(
                        {
                            "handoff_id": "handoff-b",
                            "target_source_sha": "b" * 40,
                            "created_at": "2026-09-23T19:00:00+00:00",
                        },
                        "b" * 40,
                    )

    def test_target_live_without_full_finish_receipt_reruns_canonical_finish(self):
        state = {
            "handoff_id": "handoff-a",
            "target_source_sha": "b" * 40,
            "created_at": "2026-09-23T19:00:00+00:00",
            "finish_pid": None,
            "finish_log_path": "/tmp/handoff.finish.log",
        }
        proc = mock.Mock()
        proc.wait.return_value = 0

        with (
            mock.patch.object(
                handoff.storage,
                "operator_baseline",
                return_value=("b" * 40, "build-b"),
            ),
            mock.patch.object(
                handoff,
                "bind_finish_receipt",
                side_effect=[handoff.HandoffError("closure incomplete"), None],
            ) as bind,
            mock.patch.object(handoff, "seal_finish_log"),
            mock.patch.object(handoff, "save_state"),
            mock.patch.object(handoff, "load_state", return_value=dict(state)),
            mock.patch.object(
                handoff,
                "source_ready_for_finish",
                return_value="b" * 40,
            ),
            mock.patch.object(handoff, "launch_finish", return_value=proc) as launch,
        ):
            release, build = handoff.wait_for_finish_or_recover(dict(state))

        self.assertEqual((release, build), ("b" * 40, "build-b"))
        launch.assert_called_once()
        self.assertEqual(bind.call_count, 2)

    def test_finish_receipt_rejects_pre_handoff_certification(self):
        payload = {
            "kind": "aoe2war-finish-result",
            "status": "CERTIFIED",
            "release_outcome": "CERTIFIED",
            "release_certified_at": "2026-09-23T18:00:00+00:00",
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
            (root / "receipt.json").write_text(
                __import__("json").dumps(payload),
                encoding="utf-8",
            )
            with mock.patch.object(handoff, "FINISH_RECEIPT_DIR", root):
                self.assertIsNone(
                    handoff.finish_receipt_for_target(
                        "b" * 40,
                        "b" * 40,
                        not_before="2026-09-23T19:00:00+00:00",
                    )
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
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(handoff, "HANDOFF_DIR", root),
                mock.patch.object(handoff, "LOCK_PATH", root / "handoff.lock"),
                mock.patch.object(handoff, "load_state", side_effect=[state, state]),
                mock.patch.object(handoff.campaign, "request_pause"),
                mock.patch.object(handoff.campaign, "load_state", return_value=terminal),
                mock.patch.object(handoff, "save_state"),
            ):
                self.assertEqual(handoff.drive("handoff-a"), 2)

    def test_v1_family_must_be_dead_before_transaction_seam(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            state = {
                "handoff_id": "handoff-a",
                "campaign_id": "campaign-a",
                "status": "V1_FROZEN",
                "v1_process_family": {
                    "pid": 10,
                    "ppid": 1,
                    "pgid": 10,
                    "command": "python old-controller",
                    "descendants": [],
                },
            }
            paused = {
                "status": "PAUSED",
                "completion_reason": "OPERATOR_PAUSE_BETWEEN_GENERATIONS",
                "current_generation": None,
                "current_generation_started_at": None,
                "pid": None,
            }
            with (
                mock.patch.object(handoff, "HANDOFF_DIR", root),
                mock.patch.object(handoff, "LOCK_PATH", root / "handoff.lock"),
                mock.patch.object(handoff, "load_state", side_effect=lambda _id: state),
                mock.patch.object(handoff, "save_state"),
                mock.patch.object(handoff.campaign, "load_state", return_value=paused),
                mock.patch.object(handoff, "prove_frozen"),
                mock.patch.object(handoff, "recorded_family_dead", return_value=False),
                mock.patch.object(handoff, "source_ready") as source_ready,
            ):
                self.assertEqual(handoff.drive("handoff-a"), 2)
            source_ready.assert_not_called()
            self.assertIn("still alive at the transaction seam", state["last_error"])

    def test_terminal_loss_harness_reaches_v2_resumed_from_every_state(self):
        target = "b" * 40
        old = "a" * 40
        wolo_before = {
            "pid": 77,
            "restart_counter": 0,
            "active_enter_monotonic": 123456,
            "height_after": 100,
        }
        wolo_after = {
            **wolo_before,
            "service": "active",
            "listener_8092_count": 1,
            "listener_8093_count": 1,
            "height_before": 109,
            "height_after": 110,
            "block_age_seconds": 2,
        }

        for start_state in handoff.FLOW[:-1]:
            with self.subTest(state=start_state), tempfile.TemporaryDirectory() as td:
                root = Path(td)
                state = {
                    "handoff_id": f"handoff-{start_state.lower()}",
                    "campaign_id": "campaign-a",
                    "status": start_state,
                    "old_release_sha": old,
                    "old_build_id": "build-a",
                    "target_source_sha": target,
                    "new_release_sha": target,
                    "new_build_id": "build-b",
                    "v1_process_family": {
                        "pid": 10,
                        "ppid": 1,
                        "pgid": 10,
                        "command": "python old-controller",
                        "descendants": [],
                    },
                    "wolo_before": dict(wolo_before),
                    "wolo_mutated": False,
                    "history": [],
                    "runner_pid": None,
                    "finish_pid": None,
                    "finish_log_path": str(root / "finish.log"),
                    "finish_log_sha256": "f" * 64,
                    "finish_receipt_path": str(root / "finish.json"),
                    "finish_receipt_sha256": "e" * 64,
                }

                paused = {
                    "status": "PAUSED",
                    "completion_reason": "OPERATOR_PAUSE_BETWEEN_GENERATIONS",
                    "current_generation": None,
                    "current_generation_started_at": None,
                    "pid": None,
                }

                def campaign_state(_campaign_id):
                    if state["status"] in {"V1_RUNNING", "V1_FROZEN"}:
                        return dict(paused)
                    return {
                        "status": "PAUSED",
                        "release_sha": target,
                        "build_id": "build-b",
                        "resumed_at": None,
                        "pid": None,
                    }

                with (
                    mock.patch.object(handoff, "HANDOFF_DIR", root),
                    mock.patch.object(handoff, "LOCK_PATH", root / "handoff.lock"),
                    mock.patch.object(handoff, "load_state", side_effect=lambda _id: state),
                    mock.patch.object(handoff, "save_state"),
                    mock.patch.object(handoff.campaign, "request_pause"),
                    mock.patch.object(handoff.campaign, "load_state", side_effect=campaign_state),
                    mock.patch.object(handoff, "prove_frozen"),
                    mock.patch.object(handoff, "source_ready", return_value=target),
                    mock.patch.object(
                        handoff,
                        "wait_for_finish_or_recover",
                        return_value=(target, "build-b"),
                    ),
                    mock.patch.object(
                        handoff,
                        "prove_target_certified",
                        return_value=(target, "build-b"),
                    ),
                    mock.patch.object(
                        handoff,
                        "wolo_snapshot",
                        return_value=dict(wolo_after),
                    ),
                    mock.patch.object(handoff, "recorded_family_dead", return_value=True),
                    mock.patch.object(handoff.campaign, "rebind_after_handoff"),
                    mock.patch.object(handoff, "live_campaign_controller", return_value=None),
                    mock.patch.object(
                        handoff,
                        "prove_v2_campaign_adoption",
                        return_value={
                            "mode": "LIVE_V2_CONTROLLER",
                            "pid": 999,
                            "status": "RUNNING",
                            "resumed_at": "2026-09-23T20:00:00+00:00",
                        },
                    ),
                    mock.patch.object(
                        handoff.campaign,
                        "resume",
                        return_value={"spawned_pid": 999},
                    ),
                ):
                    self.assertEqual(handoff.drive(state["handoff_id"]), 0)

                self.assertEqual(state["status"], "V2_RESUMED")
                self.assertFalse(state["wolo_mutated"])

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

    def test_resume_rejects_reused_runner_pid(self):
        state = {
            "handoff_id": "handoff-a",
            "status": "SOURCE_READY",
            "runner_pid": 123,
            "runner_process_identity": {
                "pid": 123,
                "ppid": 1,
                "pgid": 123,
                "command": "python scripts/aoe2_storage_handoff.py _run handoff-a",
            },
        }
        with (
            mock.patch.object(handoff, "load_state", return_value=state),
            mock.patch.object(handoff, "recorded_process_alive", return_value=False),
            mock.patch.object(handoff, "process_alive", return_value=True),
            mock.patch.object(handoff, "spawn_runner") as spawn,
        ):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "recorded process identity",
            ):
                handoff.resume("handoff-a")
        spawn.assert_not_called()

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

    def test_v2_campaign_adoption_requires_exact_authority_and_controller(self):
        state = {
            "release_sha": "b" * 40,
            "build_id": "build-b",
            "status": "RUNNING",
            "resumed_at": "2026-09-23T20:00:00+00:00",
            "pid": 999,
        }
        live = {
            "pid": 999,
            "ppid": 1,
            "pgid": 999,
            "command": "python scripts/aoe2_storage_campaign.py _run campaign-a",
        }
        with (
            mock.patch.object(handoff.campaign, "load_state", return_value=state),
            mock.patch.object(handoff, "live_campaign_controller", return_value=live),
        ):
            proof = handoff.prove_v2_campaign_adoption(
                "campaign-a",
                release_sha="b" * 40,
                build_id="build-b",
                expected_pid=999,
                attempts=1,
            )
        self.assertEqual(proof["mode"], "LIVE_V2_CONTROLLER")
        self.assertEqual(proof["pid"], 999)

        drifted = dict(state)
        drifted["build_id"] = "wrong"
        with mock.patch.object(handoff.campaign, "load_state", return_value=drifted):
            with self.assertRaisesRegex(handoff.HandoffError, "authority drifted"):
                handoff.prove_v2_campaign_adoption(
                    "campaign-a",
                    release_sha="b" * 40,
                    build_id="build-b",
                    attempts=1,
                )

    def test_v2_campaign_adoption_accepts_proven_terminal_resumed_run(self):
        terminal = {
            "release_sha": "b" * 40,
            "build_id": "build-b",
            "status": "COMPLETE",
            "resumed_at": "2026-09-23T20:00:00+00:00",
            "pid": None,
            "completion_reason": "HEALTHY_TARGET_REACHED",
            "last_error": None,
        }
        with (
            mock.patch.object(handoff.campaign, "load_state", return_value=terminal),
            mock.patch.object(handoff, "live_campaign_controller", return_value=None),
        ):
            proof = handoff.prove_v2_campaign_adoption(
                "campaign-a",
                release_sha="b" * 40,
                build_id="build-b",
                attempts=1,
            )
        self.assertEqual(proof["mode"], "TERMINAL_V2_RUN")
        self.assertEqual(proof["status"], "COMPLETE")

    def test_v2_campaign_adoption_fails_when_spawn_never_establishes_run(self):
        pending = {
            "release_sha": "b" * 40,
            "build_id": "build-b",
            "status": "RESUME_REQUESTED",
            "resumed_at": None,
            "pid": None,
        }
        with (
            mock.patch.object(handoff.campaign, "load_state", return_value=pending),
            mock.patch.object(handoff, "live_campaign_controller", return_value=None),
            mock.patch.object(handoff.time, "sleep"),
        ):
            with self.assertRaisesRegex(handoff.HandoffError, "was not proven"):
                handoff.prove_v2_campaign_adoption(
                    "campaign-a",
                    release_sha="b" * 40,
                    build_id="build-b",
                    attempts=2,
                )

    def test_wolo_remote_script_is_syntax_valid(self):
        proc = __import__("subprocess").run(
            ["bash", "-n"],
            input=handoff.WOLO_REMOTE_SCRIPT,
            text=True,
            stdout=__import__("subprocess").PIPE,
            stderr=__import__("subprocess").PIPE,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, proc.stderr)

    def test_wolo_snapshot_requires_live_advancing_exact_listeners(self):
        good = {
            "service": "active",
            "pid": 77,
            "restart_counter": 0,
            "active_enter_monotonic": 123456,
            "listener_8092_count": 1,
            "listener_8093_count": 1,
            "height_before": 100,
            "height_after": 101,
            "block_age_seconds": 2,
        }
        completed = __import__("subprocess").CompletedProcess(
            args=[],
            returncode=0,
            stdout=__import__("json").dumps(good),
            stderr="",
        )
        with (
            mock.patch.object(handoff.storage, "policy", return_value={"root_maintenance_host": "root@hel1"}),
            mock.patch.object(handoff.subprocess, "run", return_value=completed) as run,
        ):
            self.assertEqual(handoff.wolo_snapshot(), good)
        self.assertEqual(run.call_args.kwargs["input"], handoff.WOLO_REMOTE_SCRIPT)

        bad = dict(good)
        bad["listener_8093_count"] = 0
        failed = __import__("subprocess").CompletedProcess(
            args=[],
            returncode=0,
            stdout=__import__("json").dumps(bad),
            stderr="",
        )
        with (
            mock.patch.object(handoff.storage, "policy", return_value={"root_maintenance_host": "root@hel1"}),
            mock.patch.object(handoff.subprocess, "run", return_value=failed),
        ):
            with self.assertRaises(handoff.HandoffError):
                handoff.wolo_snapshot()

    def test_wolo_continuity_rejects_restart_and_height_regression(self):
        before = {
            "pid": 77,
            "restart_counter": 0,
            "active_enter_monotonic": 123456,
            "height_after": 100,
        }
        after = dict(before)
        after["height_after"] = 110
        handoff.verify_wolo_continuity(before, after)

        restarted = dict(after)
        restarted["restart_counter"] = 1
        with self.assertRaises(handoff.HandoffError):
            handoff.verify_wolo_continuity(before, restarted)

        regressed = dict(after)
        regressed["height_after"] = 99
        with self.assertRaises(handoff.HandoffError):
            handoff.verify_wolo_continuity(before, regressed)

    def test_v2_resume_rebinds_before_campaign_resume(self):
        source = Path(handoff.__file__).read_text(encoding="utf-8")
        rebind = source.index("campaign.rebind_after_handoff(")
        resume = source.index("campaign.resume(campaign_id)", rebind)
        self.assertLess(rebind, resume)


if __name__ == "__main__":
    unittest.main()
