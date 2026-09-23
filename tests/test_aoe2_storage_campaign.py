import os
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import scripts.aoe2_storage_campaign as campaign


class StorageCampaignTests(unittest.TestCase):
    def test_actionable_plan_continues_watch_after_progress(self):
        plan = {
            "status": "WATCH",
            "candidate": "activate-20260830T215319Z-612199b51641",
        }

        actionable, reason = campaign.actionable_plan(
            plan,
            completed=3,
            force=False,
        )

        self.assertTrue(actionable)
        self.assertEqual(reason, "WATCH_CONTINUATION")

    def test_actionable_plan_does_not_start_fresh_watch(self):
        plan = {
            "status": "WATCH",
            "candidate": "activate-20260830T215319Z-612199b51641",
        }

        actionable, reason = campaign.actionable_plan(
            plan,
            completed=0,
            force=False,
        )

        self.assertFalse(actionable)
        self.assertEqual(reason, "WATCH_NOT_DUE")

    def test_validate_bound_baseline_rejects_source_change(self):
        state = {
            "release_sha": "a" * 40,
            "build_id": "build-a",
        }

        with mock.patch.object(
            campaign,
            "current_baseline",
            return_value=("b" * 40, "build-b"),
        ):
            with self.assertRaises(campaign.CampaignError):
                campaign.validate_bound_baseline(state)

    def test_spawn_is_terminal_independent(self):
        source = Path(campaign.__file__).read_text(encoding="utf-8")

        self.assertIn("start_new_session=True", source)
        self.assertIn("stdin=subprocess.DEVNULL", source)
        self.assertIn("stdout=log", source)
        self.assertIn("stderr=subprocess.STDOUT", source)

    def test_refresh_operator_signals_preserves_persisted_pause(self):
        state = {
            "campaign_id": "test",
            "pause_requested": False,
            "pause_requested_at": None,
        }
        persisted = {
            "campaign_id": "test",
            "pause_requested": True,
            "pause_requested_at": "2026-09-19T15:00:00+00:00",
        }
        with mock.patch.object(campaign, "load_state", return_value=persisted):
            campaign.refresh_operator_signals(state)
        self.assertTrue(state["pause_requested"])
        self.assertEqual(
            state["pause_requested_at"],
            "2026-09-19T15:00:00+00:00",
        )

    def test_pause_signal_is_refreshed_after_worker_before_progress_save(self):
        source = Path(campaign.__file__).read_text(encoding="utf-8")
        invoke = source.index("storage.invoke_worker(")
        refresh = source.index("refresh_operator_signals(state)", invoke)
        save = source.index("save_state(state)", refresh)
        self.assertLess(invoke, refresh)
        self.assertLess(refresh, save)

    def test_pause_is_between_generations_not_signal_kill(self):
        source = Path(campaign.__file__).read_text(encoding="utf-8")

        self.assertIn('state.get("pause_requested")', source)
        self.assertNotIn("os.kill(", source.replace("os.kill(pid, 0)", ""))
        self.assertNotIn("SIGKILL", source)
        self.assertNotIn("SIGTERM", source)

    def test_runner_persists_completed_generation_before_next_plan(self):
        source = Path(campaign.__file__).read_text(encoding="utf-8")

        invoke = source.index("storage.invoke_worker(")
        increment = source.index('state["completed_generations"] = completed + 1')
        save = source.index("save_state(state)", increment)
        next_loop = source.index("while True:")

        self.assertLess(invoke, increment)
        self.assertLess(increment, save)
        self.assertLess(next_loop, invoke)

    def test_atomic_state_write_uses_replace(self):
        source = Path(campaign.__file__).read_text(encoding="utf-8")

        self.assertIn("os.replace(tmp, path)", source)

    def test_state_path_rejects_traversal(self):
        with self.assertRaises(campaign.CampaignError):
            campaign.state_path("../escape")

    def test_create_state_binds_release_build_and_target(self):
        plan = {
            "status": "READY",
            "candidate": "activate-20260830T215319Z-612199b51641",
        }

        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with (
                mock.patch.object(campaign, "CAMPAIGN_DIR", root),
                mock.patch.object(campaign, "current_baseline", return_value=("a" * 40, "build-a")),
                mock.patch.object(campaign.storage, "make_plan", return_value=plan),
                mock.patch.object(campaign.storage, "policy", return_value={"healthy_target": 78}),
            ):
                state = campaign.create_state(
                    max_generations=4,
                    force=False,
                )

        self.assertEqual(state["release_sha"], "a" * 40)
        self.assertEqual(state["build_id"], "build-a")
        self.assertEqual(state["target_percent"], 78)
        self.assertEqual(state["max_generations"], 4)
        self.assertEqual(state["completed_generations"], 0)

    def test_resume_blocks_ambiguous_inflight_transaction(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "FAILED",
            "pid": None,
            "release_sha": "a" * 40,
            "build_id": "build-a",
            "current_generation": "activate-20260923T000000Z-aaaaaaaaaaaa",
            "current_generation_started_at": "2026-09-23T19:00:00+00:00",
        }

        with (
            mock.patch.object(campaign, "load_state", return_value=state),
            mock.patch.object(campaign, "process_alive", return_value=False),
            mock.patch.object(campaign, "validate_bound_baseline") as baseline,
            mock.patch.object(campaign, "spawn") as spawn,
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "stopped inside a one-generation transaction",
            ):
                campaign.resume("test")

        baseline.assert_not_called()
        spawn.assert_not_called()

    def test_resume_allows_dead_controller_between_generations(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "RUNNING",
            "pid": 123,
            "release_sha": "a" * 40,
            "build_id": "build-a",
            "current_generation": None,
            "current_generation_started_at": None,
            "pause_requested": False,
        }
        persisted = dict(state)

        def save(updated):
            persisted.update(updated)

        with (
            mock.patch.object(campaign, "load_state", side_effect=lambda _id: dict(persisted)),
            mock.patch.object(campaign, "process_alive", return_value=False),
            mock.patch.object(campaign, "validate_bound_baseline") as baseline,
            mock.patch.object(campaign, "save_state", side_effect=save),
            mock.patch.object(campaign, "spawn", return_value=456) as spawn,
        ):
            result = campaign.resume("test")

        baseline.assert_called_once()
        spawn.assert_called_once_with("test")
        self.assertEqual(result["spawned_pid"], 456)

    def test_handoff_freeze_outranks_post_worker_target_completion(self):
        source = Path(campaign.__file__).read_text(encoding="utf-8")
        invoke = source.index("storage.invoke_worker(")
        refresh = source.index("refresh_operator_signals(state)", invoke)
        handoff_continue = source.index(
            'if state.get("handoff_freeze_requested"):\n                continue',
            refresh,
        )
        target_check = source.index(
            'if float(current["used_percent"]) < float(state["target_percent"]):',
            refresh,
        )

        self.assertLess(refresh, handoff_continue)
        self.assertLess(handoff_continue, target_check)

    def test_request_handoff_freeze_reserves_live_transaction(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "RUNNING_TRANSACTION",
            "pid": 123,
            "handoff_freeze_requested": False,
            "handoff_freeze_requested_at": None,
            "handoff_freeze_handoff_id": None,
        }
        persisted = {}

        with (
            mock.patch.object(campaign, "load_state", return_value=state),
            mock.patch.object(campaign, "process_alive", return_value=True),
            mock.patch.object(
                campaign,
                "save_state",
                side_effect=lambda payload: persisted.update(payload),
            ),
        ):
            result = campaign.request_handoff_freeze(
                "test",
                "handoff-1",
            )

        self.assertTrue(result["handoff_freeze_requested"])
        self.assertEqual(
            result["handoff_freeze_handoff_id"],
            "handoff-1",
        )
        self.assertTrue(persisted["handoff_freeze_requested"])

    def test_refresh_operator_signals_preserves_handoff_freeze_request(self):
        state = {
            "campaign_id": "test",
            "handoff_freeze_requested": False,
            "handoff_freeze_requested_at": None,
            "handoff_freeze_handoff_id": None,
        }
        persisted = {
            "campaign_id": "test",
            "handoff_freeze_requested": True,
            "handoff_freeze_requested_at": "2026-09-23T19:00:00+00:00",
            "handoff_freeze_handoff_id": "handoff-1",
        }

        with mock.patch.object(
            campaign,
            "load_state",
            return_value=persisted,
        ):
            campaign.refresh_operator_signals(state)

        self.assertTrue(state["handoff_freeze_requested"])
        self.assertEqual(
            state["handoff_freeze_handoff_id"],
            "handoff-1",
        )
        self.assertEqual(
            state["handoff_freeze_requested_at"],
            "2026-09-23T19:00:00+00:00",
        )

    def test_pause_and_handoff_controls_cannot_compete(self):
        handoff_state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "RUNNING",
            "pid": 123,
            "pause_requested": False,
            "handoff_freeze_requested": True,
            "handoff_freeze_handoff_id": "handoff-1",
        }
        with mock.patch.object(
            campaign,
            "load_state",
            return_value=handoff_state,
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "reserved for Storage OS handoff",
            ):
                campaign.request_pause("test")

        pause_state = {
            **handoff_state,
            "pause_requested": True,
            "handoff_freeze_requested": False,
            "handoff_freeze_handoff_id": None,
        }
        with (
            mock.patch.object(campaign, "load_state", return_value=pause_state),
            mock.patch.object(campaign, "process_alive", return_value=True),
        ):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "operator pause request",
            ):
                campaign.request_handoff_freeze("test", "handoff-1")

    def test_reserved_handoff_campaign_cannot_escape_through_resume(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "HANDOFF_FREEZE_READY",
            "pid": 123,
            "handoff_freeze_requested": True,
            "handoff_freeze_handoff_id": "handoff-1",
        }

        with mock.patch.object(campaign, "load_state", return_value=state):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "reserved handoff path",
            ):
                campaign.resume("test")

    def test_handoff_successor_continues_watch_using_inherited_progress(self):
        plan = {
            "status": "WATCH",
            "candidate": "activate-20260830T215319Z-612199b51641",
        }
        state = {
            "continuation_generations": 3,
            "completed_generations": 0,
            "force": False,
        }

        actionable, reason = campaign.actionable_plan(
            plan,
            completed=(
                int(state["completed_generations"])
                + int(state["continuation_generations"])
            ),
            force=bool(state["force"]),
        )

        self.assertTrue(actionable)
        self.assertEqual(reason, "WATCH_CONTINUATION")

    def test_retired_handoff_campaign_cannot_resume(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "RETIRED_HANDOFF",
            "pid": None,
        }

        with mock.patch.object(campaign, "load_state", return_value=state):
            with self.assertRaisesRegex(
                campaign.CampaignError,
                "retired_handoff campaign cannot be resumed",
            ):
                campaign.resume("test")

    def test_resume_refuses_live_pid(self):
        state = {
            "schema": 1,
            "kind": "aoe2war-storage-campaign",
            "campaign_id": "test",
            "status": "RUNNING",
            "pid": 123,
        }

        with (
            mock.patch.object(campaign, "load_state", return_value=state),
            mock.patch.object(campaign, "process_alive", return_value=True),
        ):
            with self.assertRaises(campaign.CampaignError):
                campaign.resume("test")


if __name__ == "__main__":
    unittest.main()
