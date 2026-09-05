from __future__ import annotations

import fcntl
import importlib.util
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_operator_bridge.py"
SPEC = importlib.util.spec_from_file_location("aoe2_operator_bridge", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class OperatorBridgeTests(unittest.TestCase):
    def test_command_map_read_actions(self):
        self.assertEqual(
            MODULE.command_for_run({"action": "audit"}),
            [str(MODULE.CLI), "audit", "--json"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "doctor"}),
            [str(MODULE.CLI), "doctor"],
        )
        self.assertEqual(
            MODULE.command_for_run({"action": "update_plan"}),
            [str(MODULE.CLI), "update", "--json"],
        )

    def test_deploy_requires_exact_local_head(self):
        with patch.object(MODULE, "local_head", return_value="a" * 40):
            with self.assertRaises(MODULE.BridgeError):
                MODULE.command_for_run(
                    {"action": "deploy", "expectedSourceSha": "b" * 40}
                )
            self.assertEqual(
                MODULE.command_for_run(
                    {"action": "deploy", "expectedSourceSha": "a" * 40}
                ),
                [str(MODULE.CLI), "deploy"],
            )

    def test_finish_is_fixed_command_with_bounded_parameters(self):
        self.assertEqual(
            MODULE.command_for_run(
                {
                    "action": "finish",
                    "parameters": {"message": "Ship the war room", "dryRun": True},
                }
            ),
            [
                str(MODULE.CLI),
                "finish",
                "--json",
                "--message",
                "Ship the war room",
                "--dry-run",
            ],
        )

    def test_finish_can_preserve_context_history(self):
        self.assertEqual(
            MODULE.command_for_run(
                {
                    "action": "finish",
                    "parameters": {
                        "message": "Seal evidence",
                        "preserveContextHistory": True,
                    },
                }
            ),
            [
                str(MODULE.CLI),
                "finish",
                "--json",
                "--message",
                "Seal evidence",
                "--preserve-context-history",
            ],
        )

    def test_token_file(self):
        with tempfile.TemporaryDirectory() as temp:
            token_file = Path(temp) / "token"
            token_file.write_text("secret-token\n", encoding="utf-8")
            with patch.dict(os.environ, {"AOE2WAR_OS_BRIDGE_TOKEN": ""}):
                self.assertEqual(MODULE.load_token(token_file), "secret-token")

    def test_try_parse_json(self):
        self.assertEqual(MODULE.try_parse_json('{"p0":0}'), {"p0": 0})
        self.assertIsNone(MODULE.try_parse_json("not json"))

    def test_finish_lock_pauses_claims(self):
        with tempfile.TemporaryDirectory() as temp:
            lock = Path(temp) / "finish.lock"
            lock.touch()
            with lock.open("a+", encoding="utf-8") as handle:
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                with patch.object(MODULE, "FINISH_LOCK", lock):
                    self.assertTrue(MODULE.finish_in_progress())
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
            with patch.object(MODULE, "FINISH_LOCK", lock):
                self.assertFalse(MODULE.finish_in_progress())


if __name__ == "__main__":
    unittest.main()
