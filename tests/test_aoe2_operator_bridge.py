from __future__ import annotations

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

    def test_token_file(self):
        with tempfile.TemporaryDirectory() as temp:
            token_file = Path(temp) / "token"
            token_file.write_text("secret-token\n", encoding="utf-8")
            with patch.dict(os.environ, {"AOE2WAR_OS_BRIDGE_TOKEN": ""}):
                self.assertEqual(MODULE.load_token(token_file), "secret-token")

    def test_try_parse_json(self):
        self.assertEqual(MODULE.try_parse_json('{"p0":0}'), {"p0": 0})
        self.assertIsNone(MODULE.try_parse_json("not json"))


if __name__ == "__main__":
    unittest.main()
