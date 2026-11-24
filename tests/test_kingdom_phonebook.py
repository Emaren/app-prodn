import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("kingdom_phonebook", ROOT / "scripts/kingdom_phonebook.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class KingdomPhonebookTests(unittest.TestCase):
    def setUp(self):
        self.rows = mod.load_catalog()
    def test_exact_count_and_name_alias(self):
        self.assertEqual(len(self.rows), 100)
        self.assertEqual(mod.lookup(self.rows, "Phonebook OS")[0]["slot"], 36)
        self.assertEqual(mod.lookup(self.rows, "Performance OS")[0]["slot"], 7)
        self.assertEqual(mod.lookup(self.rows, "Priority OS")[0]["slot"], 22)
        self.assertEqual(mod.lookup(self.rows, "Kingdom Brain")[0]["slot"], 78)
        self.assertEqual(mod.lookup(self.rows, "Kingdom Intelligence")[0]["slot"], 31)
    def test_no_authority(self):
        for row in self.rows:
            self.assertFalse(mod.packet(self.rows, row)["execution_authorized"])
            self.assertEqual(row["live_proof"], "UNVERIFIED")
        self.assertEqual(mod.lookup(self.rows, "not-a-real-module"), [])
        with self.assertRaises(ValueError):
            mod.lookup(self.rows, "")
    def test_reject_cycle_duplicate_and_fake_live_count(self):
        for edit in ("cycle", "duplicate", "live"):
            d = json.loads(mod.REGISTRY.read_text())
            c = d["kingdom_100"]
            if edit == "cycle": c["slots"][0]["parent_slot"] = 1
            elif edit == "duplicate": c["slots"][1]["aliases"].append(c["slots"][0]["name"])
            else: c["verified_live_workers"] = 100
            with tempfile.TemporaryDirectory() as p:
                path = Path(p) / "registry.json"
                path.write_text(json.dumps(d))
                with self.assertRaises(ValueError):
                    mod.load_catalog(path)
