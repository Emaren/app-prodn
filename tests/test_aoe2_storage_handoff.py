import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import scripts.aoe2_storage_handoff as handoff


class StorageHandoffTests(unittest.TestCase):
    def base_state(self, status="V1_RUNNING"):
        return {
            "schema": 1,
            "kind": "aoe2war-storage-handoff",
            "handoff_id": "handoff-test",
            "campaign_id": "campaign-test",
            "status": status,
            "created_at": "2026-09-23T19:00:00+00:00",
            "updated_at": "2026-09-23T19:00:00+00:00",
            "controller_pid": None,
            "controller_pgid": None,
            "v1_release_sha": "a" * 40,
            "v1_build_id": "build-v1",
            "v1_completed_generations": 2,
            "v1_max_generations": 6,
            "v1_force": False,
            "v1_process_at_request": {
                "pid": 123,
                "pgid": 123,
                "stat": "S",
                "stopped": False,
                "descendants": [],
            },
            "v1_process": {
                "pid": 123,
                "pgid": 123,
                "stat": "T",
                "stopped": True,
                "descendants": [],
            },
            "history": [],
            "finish_result": None,
            "retirement_intent": None,
            "successor_intent": None,
            "successor_spawn": None,
            "successor": None,
            "last_error": None,
            "log_path": "handoff.log",
        }

    def persist_state_at(self, handoff_id, target):
        state = self.base_state(status="V1_RUNNING")
        state["handoff_id"] = handoff_id
        handoff.save_state(state)
        target_index = handoff.STATE_ORDER.index(target)
        for next_state in handoff.STATE_ORDER[1 : target_index + 1]:
            state = handoff.seal_transition(
                state,
                next_state,
                {"fixture": next_state},
            )
        return state

    def test_load_state_rejects_history_status_mismatch(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                state = self.base_state(status="V1_FROZEN")
                # V1_FROZEN requires exactly one V1_RUNNING -> V1_FROZEN receipt row.
                state["history"] = []
                path = handoff.state_path("handoff-test")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(
                    __import__("json").dumps(state),
                    encoding="utf-8",
                )

                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "state/history mismatch",
                ):
                    handoff.load_state("handoff-test")

    def test_load_state_refuses_missing_transition_receipt(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                state = self.persist_state_at(
                    "handoff-test",
                    "V1_FROZEN",
                )
                receipt = Path(state["history"][0]["receipt"])
                receipt.unlink()

                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "receipt is missing or misplaced",
                ):
                    handoff.load_state("handoff-test")

    def test_latest_status_prefers_incomplete_handoff(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                self.persist_state_at("complete", "V2_RESUMED")
                self.persist_state_at("incomplete", "SOURCE_READY")

                self.assertEqual(
                    handoff.latest_handoff_id(),
                    "incomplete",
                )
                self.assertEqual(
                    handoff.status_payload(None)["handoff_id"],
                    "incomplete",
                )

    def test_new_handoff_refuses_to_hide_existing_incomplete_handoff(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                self.persist_state_at("existing", "SOURCE_READY")

                with self.assertRaisesRegex(
                    handoff.HandoffError,
                    "resume it first: existing",
                ):
                    handoff.create_state("campaign-test")

    def test_created_state_waits_for_cooperative_campaign_freeze(self):
        state = self.base_state(status="V1_RUNNING")
        state["v1_process"] = None
        state["freeze_requested_at"] = "2026-09-23T19:00:00+00:00"
        frozen = {
            "pid": 123,
            "pgid": 123,
            "stat": "T",
            "stopped": True,
            "descendants": [],
        }
        campaign_state = {
            "status": "HANDOFF_FREEZE_READY",
            "pid": 123,
            "handoff_freeze_handoff_id": "handoff-test",
            "handoff_freeze_ready_at": "2026-09-23T19:01:00+00:00",
            "current_generation": None,
            "current_generation_started_at": None,
        }
        with (
            mock.patch.object(
                handoff.campaign,
                "load_state",
                return_value=campaign_state,
            ),
            mock.patch.object(handoff.campaign, "process_alive", return_value=True),
            mock.patch.object(handoff, "process_snapshot", return_value=frozen),
            mock.patch.object(handoff, "save_state"),
            mock.patch.object(
                handoff,
                "seal_transition",
                return_value={**state, "status": "V1_FROZEN", "v1_process": frozen},
            ) as seal,
            mock.patch.object(handoff.os, "killpg") as killpg,
        ):
            result = handoff.transition_created(state)

        killpg.assert_not_called()
        self.assertEqual(result["status"], "V1_FROZEN")
        self.assertEqual(state["v1_process"], frozen)
        self.assertEqual(
            seal.call_args.args[2]["freeze_mode"],
            "cooperative_between_generation_self_stop",
        )

    def test_created_state_recovers_missing_campaign_reservation(self):
        state = self.base_state(status="V1_RUNNING")
        state["v1_process"] = None
        state["freeze_requested_at"] = None
        frozen = {
            "pid": 123,
            "pgid": 123,
            "stat": "T",
            "stopped": True,
            "descendants": [],
        }
        unreserved = {
            "status": "RUNNING",
            "pid": 123,
            "handoff_freeze_handoff_id": None,
            "current_generation": None,
            "current_generation_started_at": None,
        }
        reserved = {
            **unreserved,
            "status": "HANDOFF_FREEZE_READY",
            "handoff_freeze_handoff_id": "handoff-test",
            "handoff_freeze_requested_at": "2026-09-23T19:00:00+00:00",
            "handoff_freeze_ready_at": "2026-09-23T19:01:00+00:00",
        }

        with (
            mock.patch.object(
                handoff.campaign,
                "load_state",
                return_value=unreserved,
            ),
            mock.patch.object(
                handoff.campaign,
                "request_handoff_freeze",
                return_value=reserved,
            ) as reserve,
            mock.patch.object(handoff.campaign, "process_alive", return_value=True),
            mock.patch.object(handoff, "process_snapshot", return_value=frozen),
            mock.patch.object(handoff, "save_state"),
            mock.patch.object(
                handoff,
                "seal_transition",
                return_value={**state, "status": "V1_FROZEN", "v1_process": frozen},
            ),
        ):
            result = handoff.transition_created(state)

        reserve.assert_called_once_with("campaign-test", "handoff-test")
        self.assertEqual(result["status"], "V1_FROZEN")
        self.assertEqual(
            state["freeze_requested_at"],
            "2026-09-23T19:00:00+00:00",
        )

    def test_every_handoff_state_survives_controller_restart(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                state = self.base_state(status="V1_RUNNING")
                handoff.save_state(state)

                routes = [
                    ("V1_RUNNING", "V1_FROZEN", "transition_created"),
                    ("V1_FROZEN", "TRANSACTION_SEAM_PROVEN", "transition_v1_frozen"),
                    ("TRANSACTION_SEAM_PROVEN", "SOURCE_READY", "transition_seam_proven"),
                    ("SOURCE_READY", "RUNNER_RECONCILED", "transition_source_ready"),
                    ("RUNNER_RECONCILED", "V2_CERTIFIED", "transition_runner_reconciled"),
                    ("V2_CERTIFIED", "V1_RETIRED", "transition_v2_certified"),
                    ("V1_RETIRED", "V2_RESUMED", "transition_v1_retired"),
                ]

                for current, target, function_name in routes:
                    # Simulate a new controller process loading only durable state.
                    reloaded = handoff.load_state("handoff-test")
                    self.assertEqual(reloaded["status"], current)

                    def transition(payload, target=target):
                        return handoff.seal_transition(
                            payload,
                            target,
                            {"restart_harness": target},
                        )

                    with mock.patch.object(
                        handoff,
                        function_name,
                        side_effect=transition,
                    ):
                        handoff.advance_once(reloaded)

                final = handoff.load_state("handoff-test")
                self.assertEqual(final["status"], "V2_RESUMED")
                self.assertEqual(len(final["history"]), 7)
                for item in final["history"]:
                    self.assertTrue(Path(item["receipt"]).is_file())

    def test_fresh_process_identifies_every_durable_handoff_state(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                state = self.base_state(status="V1_RUNNING")
                handoff.save_state(state)

                states = list(handoff.STATE_ORDER)
                for index, expected in enumerate(states):
                    if index:
                        state = handoff.seal_transition(
                            state,
                            expected,
                            {"terminal_restart_harness": expected},
                        )

                    code = (
                        "import json,sys;"
                        "from pathlib import Path;"
                        "import scripts.aoe2_storage_handoff as h;"
                        "h.HANDOFF_ROOT=Path(sys.argv[1]);"
                        "print(json.dumps(h.status_payload(sys.argv[2])))"
                    )
                    proc = subprocess.run(
                        [
                            sys.executable,
                            "-c",
                            code,
                            str(root),
                            "handoff-test",
                        ],
                        cwd=handoff.ROOT,
                        text=True,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        timeout=30,
                        check=False,
                    )
                    self.assertEqual(proc.returncode, 0, proc.stderr)
                    observed = json.loads(proc.stdout)
                    self.assertEqual(observed["status"], expected)

    def test_transition_is_sequential_and_receipted_read_only(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                state = self.base_state()
                handoff.save_state(state)
                result = handoff.seal_transition(
                    state,
                    "V1_FROZEN",
                    {"pid": 123, "pgid": 123},
                )

                self.assertEqual(result["status"], "V1_FROZEN")
                self.assertEqual(len(result["history"]), 1)
                receipt = Path(result["last_transition_receipt"])
                self.assertTrue(receipt.is_file())
                self.assertEqual(receipt.stat().st_mode & 0o777, 0o444)

                with self.assertRaises(handoff.HandoffError):
                    handoff.seal_transition(
                        result,
                        "SOURCE_READY",
                        {},
                    )

    def test_existing_transition_receipt_is_adopted_after_state_write_loss(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with mock.patch.object(handoff, "HANDOFF_ROOT", root):
                state = self.base_state()
                handoff.save_state(state)
                first = handoff.seal_transition(
                    state,
                    "V1_FROZEN",
                    {"pid": 123, "pgid": 123},
                )
                receipt = Path(first["last_transition_receipt"])

                # Simulate a crash after the immutable receipt sealed but before
                # the mutable state file advanced.
                handoff.save_state(self.base_state())
                recovered = handoff.seal_transition(
                    handoff.load_state("handoff-test"),
                    "V1_FROZEN",
                    {"pid": 123, "pgid": 123},
                )

                self.assertEqual(recovered["status"], "V1_FROZEN")
                self.assertEqual(recovered["last_transition_receipt"], str(receipt))
                self.assertEqual(len(recovered["history"]), 1)

    def test_spawn_is_terminal_independent(self):
        state = self.base_state()
        fake_proc = mock.Mock(pid=456)
        fake_log = mock.mock_open()
        with (
            mock.patch.object(handoff, "load_state", return_value=state),
            mock.patch.object(Path, "mkdir"),
            mock.patch.object(Path, "open", fake_log),
            mock.patch.object(handoff.subprocess, "Popen", return_value=fake_proc) as popen,
        ):
            pid = handoff.spawn("handoff-test")

        self.assertEqual(pid, 456)
        kwargs = popen.call_args.kwargs
        self.assertTrue(kwargs["start_new_session"])
        self.assertEqual(kwargs["stdin"], handoff.subprocess.DEVNULL)
        self.assertEqual(kwargs["stderr"], handoff.subprocess.STDOUT)

    def test_resume_rejects_live_handoff_controller(self):
        state = self.base_state(status="SOURCE_READY")
        state["controller_pid"] = 456
        with (
            mock.patch.object(handoff, "load_state", return_value=state),
            mock.patch.object(handoff, "process_alive", return_value=True),
        ):
            with self.assertRaisesRegex(
                handoff.HandoffError,
                "still active",
            ):
                handoff.resume("handoff-test")

    def test_runner_evidence_requires_wolo_progress(self):
        finish = {
            "phases": {
                "maintenance_runner_reconciliation": {
                    "status": "PASSED",
                },
            },
            "maintenance_runner_reconciliation": {
                "status": "UPDATED",
                "installed_sha256": "b" * 64,
                "receipt_path": "/mnt/receipt.json",
                "wolo_pid": "1234",
                "wolo_restart_counter": "2",
                "wolo_height_before": "100",
                "wolo_height_after": "101",
            },
        }
        evidence = handoff.maintenance_runner_evidence(finish)
        self.assertEqual(evidence["wolo_pid"], 1234)
        self.assertEqual(evidence["wolo_height_after"], 101)

        finish["maintenance_runner_reconciliation"]["wolo_height_after"] = "100"
        with self.assertRaises(handoff.HandoffError):
            handoff.maintenance_runner_evidence(finish)

    def test_certified_finish_requires_exact_wolo_boundary(self):
        source = "c" * 40
        finish = {
            "status": "CERTIFIED",
            "release_outcome": "CERTIFIED",
            "wolo_mutated_by_finish": False,
            "phases": {
                "release_certification": {"status": "PASSED"},
                "final_certification": {"status": "PASSED"},
            },
            "final_release": {
                "local": {"head": source},
                "production": {
                    "active_build_id": "build-v2",
                    "wolo_8092_count": 1,
                    "wolo_8093_count": 1,
                },
                "certification": {
                    "status": "CERTIFIED",
                    "release_sha": source,
                    "receipt_path": "/mnt/cert.json",
                },
            },
        }
        evidence = handoff.certified_finish_evidence(finish)
        self.assertEqual(evidence["source_sha"], source)
        self.assertFalse(evidence["wolo_mutated"])

        finish["final_release"]["production"]["wolo_8093_count"] = 0
        with self.assertRaises(handoff.HandoffError):
            handoff.certified_finish_evidence(finish)

    def test_source_ready_reuses_persisted_finish_result(self):
        state = self.base_state(status="SOURCE_READY")
        state["finish_result"] = {
            "phases": {
                "maintenance_runner_reconciliation": {"status": "PASSED"},
            },
            "maintenance_runner_reconciliation": {
                "status": "NOOP",
                "wolo_pid": "1",
                "wolo_restart_counter": "0",
                "wolo_height_before": "10",
                "wolo_height_after": "11",
            },
            "receipt_path": "/tmp/finish.json",
        }
        with (
            mock.patch.object(handoff, "assert_frozen_identity"),
            mock.patch.object(
                handoff.campaign,
                "load_state",
                return_value={
                    "status": "HANDOFF_FREEZE_READY",
                    "handoff_freeze_handoff_id": "handoff-test",
                    "current_generation": None,
                    "current_generation_started_at": None,
                },
            ),
            mock.patch.object(handoff, "run_finish_json") as finish_run,
            mock.patch.object(
                handoff,
                "seal_transition",
                return_value={**state, "status": "RUNNER_RECONCILED"},
            ),
        ):
            result = handoff.transition_source_ready(state)

        finish_run.assert_not_called()
        self.assertEqual(result["status"], "RUNNER_RECONCILED")

    def test_retirement_recovers_after_intent_and_process_loss(self):
        state = self.base_state(status="V2_CERTIFIED")
        state["target_source_sha"] = "d" * 40
        state["last_transition_receipt"] = "/tmp/v2-certified.json"
        old = {
            "status": "RUNNING",
            "pid": 123,
            "current_generation": None,
            "current_generation_started_at": None,
        }
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(handoff, "HANDOFF_ROOT", root),
                mock.patch.object(handoff, "save_state"),
            ):
                handoff.ensure_retirement_intent(state)

            captured = {}
            with (
                mock.patch.object(handoff, "HANDOFF_ROOT", root),
                mock.patch.object(handoff, "process_alive", return_value=False),
                mock.patch.object(handoff.campaign, "load_state", return_value=old),
                mock.patch.object(
                    handoff.campaign,
                    "save_state",
                    side_effect=lambda payload: captured.update(payload),
                ),
            ):
                result = handoff.retire_v1(state)

        self.assertEqual(result["campaign_status"], "RETIRED_HANDOFF")
        self.assertEqual(captured["status"], "RETIRED_HANDOFF")
        self.assertIsNone(captured["pid"])

    def test_advance_once_routes_each_proven_state_only_forward(self):
        routes = [
            ("V1_RUNNING", "transition_created"),
            ("V1_FROZEN", "transition_v1_frozen"),
            ("TRANSACTION_SEAM_PROVEN", "transition_seam_proven"),
            ("SOURCE_READY", "transition_source_ready"),
            ("RUNNER_RECONCILED", "transition_runner_reconciled"),
            ("V2_CERTIFIED", "transition_v2_certified"),
            ("V1_RETIRED", "transition_v1_retired"),
        ]
        for index, (status, function_name) in enumerate(routes):
            state = self.base_state(status=status)
            target = handoff.STATE_ORDER[index + 1]
            with mock.patch.object(
                handoff,
                function_name,
                return_value={**state, "status": target},
            ) as transition:
                result = handoff.advance_once(state)
            transition.assert_called_once_with(state)
            self.assertEqual(result["status"], target)

    def test_successor_preserves_continuation_progress(self):
        state = self.base_state(status="V1_RETIRED")
        old = {
            "campaign_id": "campaign-test",
            "completed_generations": 2,
            "max_generations": 6,
            "force": False,
        }
        plan = {
            "status": "WATCH",
            "candidate": "activate-20260920T000000Z-aaaaaaaaaaaa",
        }
        saved = {}

        def capture_save(payload):
            saved.update(payload)

        with (
            mock.patch.object(handoff.campaign, "load_state", return_value=old),
            mock.patch.object(
                handoff.campaign,
                "current_baseline",
                return_value=("d" * 40, "build-v2"),
            ),
            mock.patch.object(handoff.storage, "make_plan", return_value=plan),
            mock.patch.object(
                handoff.campaign,
                "actionable_plan",
                return_value=(True, "WATCH_CONTINUATION"),
            ) as actionable,
            mock.patch.object(
                handoff.storage,
                "policy",
                return_value={"healthy_target": 78},
            ),
            mock.patch.object(handoff, "save_state"),
            mock.patch.object(
                handoff.campaign,
                "state_path",
                return_value=Path("/tmp/does-not-exist-successor-state.json"),
            ),
            mock.patch.object(handoff.campaign, "save_state", side_effect=capture_save),
            mock.patch.object(handoff.campaign, "spawn", return_value=789),
            mock.patch.object(handoff.campaign, "process_alive", return_value=False),
        ):
            result = handoff.create_successor_campaign(state)

        actionable.assert_called_once_with(
            plan,
            completed=2,
            force=False,
        )
        self.assertEqual(result["status"], "STARTED")
        self.assertEqual(result["remaining_generations"], 4)
        self.assertEqual(saved["continuation_generations"], 2)
        self.assertEqual(saved["max_generations"], 4)
        self.assertEqual(saved["handoff_parent"]["campaign_id"], "campaign-test")

    def test_v1_retirement_is_only_routed_after_v2_certified(self):
        for status in (
            "V1_RUNNING",
            "V1_FROZEN",
            "TRANSACTION_SEAM_PROVEN",
            "SOURCE_READY",
            "RUNNER_RECONCILED",
        ):
            state = self.base_state(status=status)
            with mock.patch.object(
                handoff,
                "retire_v1",
                side_effect=AssertionError("must not retire before V2_CERTIFIED"),
            ):
                # Every pre-certification state has a different transition path.
                with mock.patch.object(
                    handoff,
                    {
                        "V1_RUNNING": "transition_created",
                        "V1_FROZEN": "transition_v1_frozen",
                        "TRANSACTION_SEAM_PROVEN": "transition_seam_proven",
                        "SOURCE_READY": "transition_source_ready",
                        "RUNNER_RECONCILED": "transition_runner_reconciled",
                    }[status],
                    return_value=state,
                ):
                    handoff.advance_once(state)

        state = self.base_state(status="V2_CERTIFIED")
        with mock.patch.object(
            handoff,
            "retire_v1",
            return_value={"signal": "SIGKILL"},
        ) as retire, mock.patch.object(
            handoff,
            "seal_transition",
            return_value={**state, "status": "V1_RETIRED"},
        ):
            handoff.transition_v2_certified(state)
        retire.assert_called_once_with(state)


if __name__ == "__main__":
    unittest.main()
