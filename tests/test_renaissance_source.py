"""Renaissance source inventory must fail closed when templates appear outside its registers."""
import importlib.util
import json
import pathlib
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
FILE=ROOT/"scripts"/"renaissance.py"
SPEC=importlib.util.spec_from_file_location("renaissance",FILE)
assert SPEC and SPEC.loader
MODULE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
class RenaissanceSourceTests(unittest.TestCase):
    def test_candidate_source_census_has_166_phase_assignments_with_12_instruments(self):
        doc,routes=MODULE.load()
        self.assertEqual(len(routes),166)
        self.assertEqual(len(doc["modules"]),12)
        self.assertEqual(len(set(routes)),166)
        self.assertTrue({m["href"] for m in doc["modules"]}.issubset(set(routes)))
        atlas={"/admin/storage-os/atlas","/admin/storage-os/atlas/hel1-root",
               "/admin/storage-os/atlas/hel1-data","/admin/storage-os/atlas/m1",
               "/admin/storage-os/atlas/intel"}
        self.assertTrue(atlas.issubset(set(routes)))
        phase=next(p for p in doc["phases"] if p["id"]=="I")
        self.assertTrue(atlas.issubset(set(phase["routes"])))
    def test_all_source_pages_accounted_for(self):
        doc,routes=MODULE.load()
        expected=set(routes)|{m["href"] for m in doc["modules"]}
        discovered={("/"+p.relative_to(ROOT/"app").parent.as_posix()).replace("/.","/") for p in (ROOT/"app").rglob("page.tsx")}
        self.assertEqual(discovered,expected)
    def test_operator_cli_exposes_renaissance_read_only_commands(self):
        cli=(ROOT/"bin"/"aoe2war").read_text(encoding="utf-8")
        self.assertIn('renaissance)\n    shift\n    exec "$AOE2WAR_PYTHON" "$RENAISSANCE_OS" "$@"',cli)
        self.assertIn("aoe2war renaissance verify",cli)
    def test_all_instrument_pages_dedicated_and_present(self):
        doc,routes=MODULE.load()
        for module in doc["modules"]:
            href=module["href"]
            self.assertTrue((ROOT/"app"/href.strip("/")/"page.tsx").is_file(),href)

if __name__=="__main__":unittest.main()
