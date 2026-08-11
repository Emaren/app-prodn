from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "run_test_contract.py"
SPEC = importlib.util.spec_from_file_location("run_test_contract", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class TestContractTests(unittest.TestCase):
    def test_every_node_test_is_active_or_explicitly_quarantined(self):
        plan = MODULE.resolve_plan(MODULE.load_contract())
        classified = set(plan["active"]) | {
            item["path"] for item in plan["quarantine"]
        }
        self.assertEqual(classified, set(plan["discovered"]))
        self.assertEqual(
            len(plan["active"]),
            len(plan["discovered"]) - len(plan["quarantine"]),
        )

    def test_quarantine_is_owned_reasoned_and_time_bounded(self):
        plan = MODULE.resolve_plan(MODULE.load_contract())
        for item in plan["quarantine"]:
            self.assertTrue(item["reason"])
            self.assertTrue(item["owner"])
            self.assertRegex(item["review_by"], r"^\d{4}-\d{2}-\d{2}$")


if __name__ == "__main__":
    unittest.main()
