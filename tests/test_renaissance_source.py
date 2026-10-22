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
    def test_candidate_source_census_has_132_original_and_12_instruments(self):
        doc,routes=MODULE.load()
        self.assertEqual(len(routes),132)
        self.assertEqual(len(doc["modules"]),12)
        self.assertEqual(len(set(routes)|{m["href"] for m in doc["modules"]}),144)
    def test_all_source_pages_accounted_for(self):
        doc,routes=MODULE.load()
        expected=set(routes)|{m["href"] for m in doc["modules"]}|{r["href"] for r in doc.get("extensions",[])}
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
