from __future__ import annotations

import importlib.util
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "run_python_contract.py"
SPEC = importlib.util.spec_from_file_location("run_python_contract", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class PythonContractTests(unittest.TestCase):
    def test_inventory_matches_every_python_contract_file(self):
        expected = sorted(
            path.relative_to(ROOT).as_posix()
            for path in (ROOT / "tests").glob("test_*.py")
            if path.is_file()
        )
        self.assertEqual(MODULE.discover_tests(), expected)

    def test_inventory_includes_its_own_contract(self):
        self.assertIn("tests/test_python_contract.py", MODULE.discover_tests())


if __name__ == "__main__":
    unittest.main()
