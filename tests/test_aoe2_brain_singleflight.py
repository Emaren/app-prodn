from __future__ import annotations

import contextlib
import importlib.util
import io
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

BRAIN_PATH = SCRIPTS / "aoe2_brain.py"
BRAIN_SPEC = importlib.util.spec_from_file_location("aoe2_brain_singleflight_tests", BRAIN_PATH)
assert BRAIN_SPEC and BRAIN_SPEC.loader
brain = importlib.util.module_from_spec(BRAIN_SPEC)
sys.modules[BRAIN_SPEC.name] = brain
BRAIN_SPEC.loader.exec_module(brain)

import aoe2_council as council


class BrainSingleflightTests(unittest.TestCase):
    def test_second_collection_is_denied_until_owner_releases(self):
        with tempfile.TemporaryDirectory() as root:
            lock = pathlib.Path(root) / "brain.lock"
            with brain.brain_collection_lock(lock):
                with self.assertRaisesRegex(RuntimeError, "already running"):
                    with brain.brain_collection_lock(lock):
                        self.fail("second collector must not start")
            with brain.brain_collection_lock(lock):
                self.assertTrue(lock.is_file())

    def test_collection_lock_releases_on_collection_exception(self):
        with tempfile.TemporaryDirectory() as root:
            lock = pathlib.Path(root) / "brain.lock"
            with self.assertRaisesRegex(ValueError, "test failure"):
                with brain.brain_collection_lock(lock):
                    raise ValueError("test failure")
            with brain.brain_collection_lock(lock):
                pass

    def test_brain_command_refuses_duplicate_collection_without_calling_collect(self):
        with tempfile.TemporaryDirectory() as root:
            lock = pathlib.Path(root) / "brain.lock"
            with (
                patch.object(brain, "BRAIN_LOCK", lock),
                patch.object(brain, "collect") as collect,
                patch.object(sys, "argv", ["aoe2war brain", "--json"]),
            ):
                # Default argument is bound at definition time; explicitly
                # inject the temporary locked path via a deterministic wrapper.
                original_lock = brain.brain_collection_lock
                with original_lock(lock):
                    with (
                        patch.object(brain, "brain_collection_lock", lambda: original_lock(lock)),
                        contextlib.redirect_stdout(io.StringIO()) as output,
                    ):
                        rc = brain.main()
                self.assertEqual(rc, 2)
                collect.assert_not_called()
                self.assertIn("already running", output.getvalue())


class CouncilOwnedSubprocessTests(unittest.TestCase):
    def test_doctor_subprocess_is_started_in_its_own_session(self):
        with patch.object(council.subprocess, "Popen") as popen:
            child = popen.return_value
            child.communicate.return_value = ('{"status":"HEALTHY"}', None)
            child.returncode = 0
            value = council.command_json("doctor", "--json", timeout=9)
        self.assertEqual(value["status"], "HEALTHY")
        self.assertEqual(popen.call_args.kwargs["start_new_session"], True)
        self.assertEqual(popen.call_args.kwargs["stdout"], subprocess.PIPE)
        child.communicate.assert_called_once_with(timeout=9)

    def test_timeout_signals_only_owned_process_group_and_propagates(self):
        child_pid = 987654
        with (
            patch.object(council.subprocess, "Popen") as popen,
            patch.object(council.os, "killpg") as killpg,
        ):
            child = popen.return_value
            child.pid = child_pid
            child.communicate.side_effect = [
                subprocess.TimeoutExpired(["doctor"], 4),
                ("", None),
            ]
            with self.assertRaises(subprocess.TimeoutExpired):
                council.command_json("doctor", "--json", timeout=4)
        killpg.assert_called_once_with(child_pid, council.signal.SIGTERM)
        self.assertTrue(popen.call_args.kwargs["start_new_session"])

    def test_unresponsive_process_tree_is_forcibly_reaped(self):
        with (
            patch.object(council.subprocess, "Popen") as popen,
            patch.object(council.os, "killpg") as killpg,
        ):
            child = popen.return_value
            child.pid = 987653
            child.communicate.side_effect = [
                subprocess.TimeoutExpired(["doctor"], 7),
                subprocess.TimeoutExpired(["doctor"], 2),
                ("", None),
            ]
            with self.assertRaises(subprocess.TimeoutExpired):
                council.command_json("doctor", "--json", timeout=7)
        self.assertEqual(
            [args.args for args in killpg.call_args_list],
            [(987653, council.signal.SIGTERM), (987653, council.signal.SIGKILL)],
        )


if __name__ == "__main__":
    unittest.main()
