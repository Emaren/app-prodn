from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "aoe2_node_runtime.py"
SPEC = importlib.util.spec_from_file_location("aoe2_node_runtime", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class BuildNodeRuntimeTests(unittest.TestCase):
    def test_parse_node_version(self):
        self.assertEqual(MODULE.parse_node_version("v22.22.0"), (22, 22, 0))
        self.assertEqual(MODULE.parse_node_version("22.12.1"), (22, 12, 1))
        self.assertIsNone(MODULE.parse_node_version("Node 22"))

    def test_contract_pins_node_22_minimum(self):
        major, minimum = MODULE.build_node_contract()
        self.assertEqual(major, 22)
        self.assertGreaterEqual(minimum, (22, 12, 0))

    def test_selector_rejects_stale_22_11_and_prefers_newest_compliant_22(self):
        stale = MODULE.NodeRuntime(Path("/tmp/node-22.11"), (22, 11, 0))
        good = MODULE.NodeRuntime(Path("/tmp/node-22.22"), (22, 22, 0))
        node24 = MODULE.NodeRuntime(Path("/tmp/node-24"), (24, 4, 1))
        rows = {
            Path("/tmp/node-22.11"): stale,
            Path("/tmp/node-22.22"): good,
            Path("/tmp/node-24"): node24,
        }
        with (
            patch.dict(os.environ, {MODULE.BUILD_NODE_ENV: ""}, clear=False),
            patch.object(
                MODULE,
                "_candidate_paths",
                return_value=list(rows),
            ),
            patch.object(
                MODULE,
                "_complete_runtime",
                side_effect=lambda path: rows.get(path),
            ),
        ):
            selected = MODULE.select_build_node_runtime()
        self.assertEqual(selected, good)

    def test_explicit_incompatible_runtime_fails_closed(self):
        explicit = Path("/tmp/node-22.11")
        stale = MODULE.NodeRuntime(explicit, (22, 11, 0))
        with (
            patch.dict(
                os.environ,
                {MODULE.BUILD_NODE_ENV: str(explicit)},
                clear=False,
            ),
            patch.object(MODULE, "_candidate_paths", return_value=[explicit]),
            patch.object(MODULE, "_complete_runtime", return_value=stale),
        ):
            with self.assertRaisesRegex(MODULE.BuildNodeError, "requires Node 22"):
                MODULE.select_build_node_runtime()

    def test_ensure_prepends_selected_bin_and_records_version(self):
        runtime = MODULE.NodeRuntime(
            Path("/tmp/node22/bin/node"),
            (22, 22, 0),
        )
        with (
            patch.object(
                MODULE,
                "select_build_node_runtime",
                return_value=runtime,
            ),
            patch.dict(os.environ, {"PATH": "/usr/local/bin:/usr/bin"}, clear=False),
        ):
            selected = MODULE.ensure_build_node_runtime()
            self.assertEqual(selected, runtime)
            self.assertEqual(
                os.environ["PATH"].split(os.pathsep)[0],
                "/tmp/node22/bin",
            )
            self.assertEqual(
                os.environ["AOE2WAR_BUILD_NODE_VERSION"],
                "22.22.0",
            )


if __name__ == "__main__":
    unittest.main()
