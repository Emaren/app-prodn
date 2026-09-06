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
