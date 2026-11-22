"""Deterministic Scan OS contract tests; no native scans or outside I/O."""
import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("scan_os", ROOT / "scripts/scan_os.py")
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class ScanOSTests(unittest.TestCase):
    def setUp(self):
        self.catalog = module.load_catalog()

    def test_catalog_schema_and_source_only(self):
        self.assertEqual(self.catalog["schema"], "aoe2war.scan-os.catalog.v1")
        self.assertEqual(self.catalog["authority"], "SOURCE_ONLY_READ_ONLY_NO_EXECUTION")

    def test_registry_groups_deduplicate_both_hel1_surfaces(self):
        plan = module.plan(self.catalog, goal="storage_hel1")
        self.assertEqual(plan["registered_scans"], 4)
        self.assertEqual(plan["deduplicated_producer_groups"], 2)
        self.assertEqual(plan["maximum_planned_seconds_sequential_if_ALL_executed"], 33)
        self.assertEqual(plan["status"], "PLAN_ONLY_NO_EXECUTION")
        self.assertEqual(plan["authorization"], "NONE_NO_HOST_COMMANDS_NO_TIMERS_NO_MUTATION")

    def test_root_only_matches_without_implicit_data_claim(self):
        plan = module.plan(self.catalog, goal="storage_hel1", scope="HEL1_ROOT")
        self.assertEqual({x for step in plan["steps"] for x in step["scopes"]}, {"HEL1_ROOT"})
        self.assertEqual(plan["registered_scans"], 2)

    def test_release_scan_is_source_only(self):
        plan = module.plan(self.catalog, goal="release")
        self.assertEqual(plan["registered_scans"], 2)
        self.assertTrue(all(s["decision"] == "PROPOSE_ONLY_NOT_EXECUTED" for s in plan["steps"]))

    def test_unknown_scope_refused(self):
        with self.assertRaises(module.CatalogError):
            module.plan(self.catalog, goal="storage_hel1", scope="FINANCIAL_PRIVATE")

    def test_duplicate_id_refused(self):
        c = copy.deepcopy(self.catalog)
        c["scans"].append(copy.deepcopy(c["scans"][0]))
        self._reject_catalog(c, "SCAN_DUPLICATE_OR_BAD_ID")

    def test_group_mismatch_refused(self):
        c = copy.deepcopy(self.catalog)
        c["scans"][1]["source_path"] = "scripts/another.py"
        self._reject_catalog(c, "SCAN_GROUP_NOT_SAME_PRODUCER")

    def test_source_path_escape_refused(self):
        c = copy.deepcopy(self.catalog)
        c["scans"][0]["source_path"] = "../../secret"
        self._reject_catalog(c, "SCAN_BAD_SOURCE")

    def test_missing_catalog_fails_closed(self):
        with self.assertRaisesRegex(module.CatalogError, "CATALOG_MISSING_OR_OVERSIZED"):
            module.load_catalog(ROOT / "missing-file.json")

    def test_bad_authority_refused(self):
        c = copy.deepcopy(self.catalog)
        c["authority"] = "CAN_EXECUTE"
        self._reject_catalog(c, "CATALOG_AUTHORITY")

    def test_negative_execution_or_timer_flag_absent(self):
        p = module.plan(self.catalog, goal="all")
        self.assertEqual(p["result_reuse"], "NOT_PROVEN_NO_SIGNED_RECEIPT_VERIFICATION")
        self.assertNotIn("command", json.dumps(p))
        self.assertNotIn("shell", json.dumps(p))

    def test_cli_plan_json(self):
        p = subprocess.run([sys.executable, str(ROOT / "scripts/scan_os.py"), "plan", "--goal", "storage_hel1"], capture_output=True, text=True, check=False)
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(json.loads(p.stdout)["deduplicated_producer_groups"], 2)

    def _reject_catalog(self, obj, code):
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "catalog.json"
            p.write_text(json.dumps(obj))
            with self.assertRaisesRegex(module.CatalogError, code):
                module.load_catalog(p)


if __name__ == "__main__":
    unittest.main()
